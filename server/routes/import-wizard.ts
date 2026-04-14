/**
 * Import Wizard — Excel upload + column mapping + document classification/extraction
 */
import type { Express } from "express";
import multer from "multer";
import XLSX from "xlsx";
import { randomUUID } from "crypto";
import fs from "fs";
import { db } from "../db";
import {
  scis, actifs, lots, bauxGL, emprunts, locatairesGL, associes, travaux,
} from "@shared/schema";
import { amSchemas } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../lib/rate-limit";
import { logger } from "../lib/logger";
import { eq, isNull } from "drizzle-orm";

// ─── In-memory store for uploaded workbooks ──────────────────────
interface StoredWorkbook {
  sheets: Array<{
    name: string;
    headers: string[];
    rows: Record<string, any>[];
    rowCount: number;
    sampleRows: any[][];
  }>;
  expiresAt: number;
}

const workbookStore = new Map<string, StoredWorkbook>();

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of workbookStore) {
    if (v.expiresAt < now) workbookStore.delete(k);
  }
}, 5 * 60 * 1000);

// ─── In-memory store for uploaded documents ──────────────────────
interface StoredDocument {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  classification?: { type: string; entity: string | null; confidence: number };
  expiresAt: number;
}

const documentStore = new Map<string, StoredDocument>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of documentStore) {
    if (v.expiresAt < now) {
      try { fs.unlinkSync(v.filePath); } catch {}
      documentStore.delete(k);
    }
  }
}, 5 * 60 * 1000);

// ─── Multer configs ──────────────────────────────────────────────
const uploadDir = "/tmp/canaillou-uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const excelUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers Excel (.xlsx, .xls) et CSV sont acceptés"));
    }
  },
});

const docUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/") ||
      file.mimetype.includes("spreadsheet") ||
      file.mimetype.includes("excel") ||
      file.originalname.match(/\.(pdf|png|jpg|jpeg|xlsx|xls|eml|msg)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Type de fichier non supporté"));
    }
  },
});

// ─── Table map for insertion ─────────────────────────────────────
// Note: baux and locataires now point to the unified tables (post-unification).
// `baux` inserts force scope='am' since the wizard is an AM-side feature.
const tableMap: Record<string, any> = {
  scis, actifs, lots, baux: bauxGL, emprunts, locataires: locatairesGL, associes, travaux,
};

// ─── Entity field lists (for mapping UI) ─────────────────────────
const entityFields: Record<string, string[]> = {
  scis: ["nom", "formeJuridique", "capital", "regimeFiscal", "siret", "adresse", "ville", "codePostal", "dateCreation", "gerant", "expertComptable", "banque", "iban", "notes"],
  actifs: ["nom", "sciNom", "adresse", "ville", "codePostal", "type", "surface", "surfaceCarrez", "anneeConstruction", "dpe", "prixAcquisition", "fraisNotaire", "fraisAgence", "montantTravaux", "dateAcquisition", "chargesAnnuelles", "taxeFonciere", "assurancePno", "chargesCopropriete", "tauxCapitalisation", "notes"],
  lots: ["designation", "actifNom", "sciNom", "type", "etage", "surface", "surfaceCarrez", "loyerMensuel", "loyerAnnuel", "chargesLot", "statut", "notes"],
  baux: ["typeBail", "actifNom", "sciNom", "locataireNom", "dateDebut", "dateFin", "dateSignature", "loyerMensuel", "loyerAnnuel", "charges", "depotGarantie", "indiceReference", "trimestreRef", "valeurIndiceBase", "statut", "notes"],
  emprunts: ["sciNom", "actifNom", "banque", "montantEmprunte", "capitalRestantDu", "tauxAnnuel", "taeg", "dureeAns", "dureeMois", "dateDebut", "dateFin", "typeAmortissement", "mensualite", "assuranceMensuelle", "tauxAssurance", "typeGarantie", "ira", "notes"],
  locataires: ["nom", "prenom", "email", "telephone", "adresse", "siret", "notes"],
  associes: ["nom", "prenom", "email", "telephone", "adresse", "siret", "notes"],
  travaux: ["actifNom", "sciNom", "titre", "description", "budget", "montantReel", "dateDebut", "dateFin", "statut", "prestataire", "notes"],
};

const importLimiter = rateLimit(20, 60 * 1000);
const docLimiter = rateLimit(10, 10 * 60 * 1000, "import-docs");

// ─── Helper: resolve name references to UUIDs ───────────────────
async function resolveRefs(
  rows: Record<string, any>[],
  entity: string,
  ownerId: string,
): Promise<Record<string, any>[]> {
  const allScis = await db.select().from(scis).where(isNull(scis.deletedAt));
  const allActifs = await db.select().from(actifs).where(isNull(actifs.deletedAt));
  const allLocataires = await db.select().from(locatairesGL);

  const sciByName = new Map(allScis.map((s: any) => [s.nom?.toLowerCase(), s.id]));
  const actifByName = new Map(allActifs.map((a: any) => [a.nom?.toLowerCase(), a.id]));
  const locByName = new Map(allLocataires.map((l: any) => [`${l.nom} ${l.prenom || ""}`.trim().toLowerCase(), l.id]));

  return rows.map((row) => {
    const r: any = { ...row, ownerId };

    // Resolve sciNom → sciId
    if (r.sciNom && !r.sciId) {
      const id = sciByName.get(r.sciNom.toLowerCase());
      if (id) r.sciId = id;
      delete r.sciNom;
    }

    // Resolve actifNom → actifId
    if (r.actifNom && !r.actifId) {
      const id = actifByName.get(r.actifNom.toLowerCase());
      if (id) r.actifId = id;
      delete r.actifNom;
    }

    // Resolve locataireNom → locataireId
    if (r.locataireNom && !r.locataireId) {
      const id = locByName.get(r.locataireNom.toLowerCase());
      if (id) r.locataireId = id;
      delete r.locataireNom;
    }

    return r;
  });
}

// ─── Helper: convert Excel date serial to YYYY-MM-DD ─────────────
function excelDateToString(val: any): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string") {
    // Already a date string
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
      const [d, m, y] = val.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return val;
  }
  if (typeof val === "number" && val > 30000 && val < 60000) {
    // Excel date serial
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  return String(val);
}

// ─── Routes ──────────────────────────────────────────────────────
export function registerImportWizardRoutes(app: Express) {

  // GET entity fields for mapping UI
  app.get("/api/import-wizard/entity-fields", requireAuth, (_req: any, res: any) => {
    res.json(entityFields);
  });

  // POST upload Excel — parse sheets and return structure
  app.post("/api/import-wizard/upload-excel", requireAuth, importLimiter, (req: any, res: any, next: any) => {
    excelUpload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Fichier trop volumineux (max 50 Mo)" });
        return res.status(400).json({ error: err.message || "Erreur upload" });
      }
      next();
    });
  }, async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni" });

    const filePath = req.file.path;
    try {
      const workbook = XLSX.readFile(filePath, { cellDates: true, cellNF: true });
      const fileId = randomUUID();

      const sheets = workbook.SheetNames.map((name) => {
        const ws = workbook.Sheets[name];
        const jsonRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null });
        const headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
        const sampleRows = jsonRows.slice(0, 5).map((row) => headers.map((h) => row[h]));

        return { name, headers, rows: jsonRows, rowCount: jsonRows.length, sampleRows };
      });

      workbookStore.set(fileId, { sheets, expiresAt: Date.now() + 30 * 60 * 1000 });

      res.json({
        fileId,
        sheets: sheets.map(({ name, headers, rowCount, sampleRows }) => ({
          name, headers, rowCount, sampleRows,
        })),
      });
    } catch (error: any) {
      logger.error("import-wizard upload error", { error: error.message });
      res.status(500).json({ error: `Erreur de lecture du fichier: ${error.message}` });
    } finally {
      try { fs.unlinkSync(filePath); } catch {}
    }
  });

  // POST preview — apply mapping and validate
  app.post("/api/import-wizard/preview", requireAuth, async (req: any, res: any) => {
    try {
      const { fileId, sheetName, mapping, targetEntity } = req.body;

      const wb = workbookStore.get(fileId);
      if (!wb) return res.status(404).json({ error: "Fichier expiré ou introuvable. Veuillez re-uploader." });

      const sheet = wb.sheets.find((s) => s.name === sheetName);
      if (!sheet) return res.status(404).json({ error: `Feuille "${sheetName}" introuvable` });

      const schema = amSchemas[targetEntity];
      const dateFields = new Set(["dateCreation", "dateAcquisition", "dateDebut", "dateFin", "dateSignature", "dateEstimation"]);

      const mappedRows: any[] = [];
      const errors: Array<{ row: number; issues: string[] }> = [];

      for (let i = 0; i < sheet.rows.length; i++) {
        const srcRow = sheet.rows[i];
        const mapped: Record<string, any> = {};

        for (const [excelCol, dbField] of Object.entries(mapping as Record<string, string>)) {
          if (!dbField || dbField === "—") continue;
          let val = srcRow[excelCol];
          // Convert Excel dates
          if (dateFields.has(dbField)) val = excelDateToString(val);
          mapped[dbField] = val;
        }

        // Validate if schema available
        if (schema) {
          const result = schema.safeParse(mapped);
          if (!result.success) {
            const issues = result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`);
            mappedRows.push({ ...mapped, _valid: false, _errors: issues, _row: i + 1 });
            errors.push({ row: i + 1, issues });
          } else {
            mappedRows.push({ ...result.data, _valid: true, _row: i + 1 });
          }
        } else {
          mappedRows.push({ ...mapped, _valid: true, _row: i + 1 });
        }
      }

      res.json({
        rows: mappedRows,
        validCount: mappedRows.filter((r) => r._valid).length,
        errorCount: errors.length,
        errors: errors.slice(0, 30),
      });
    } catch (error: any) {
      logger.error("import-wizard preview error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST execute — insert valid rows
  app.post("/api/import-wizard/execute", requireAuth, importLimiter, async (req: any, res: any) => {
    try {
      const { fileId, sheetName, mapping, targetEntity, resolveRefsFlag } = req.body;

      const wb = workbookStore.get(fileId);
      if (!wb) return res.status(404).json({ error: "Fichier expiré. Veuillez re-uploader." });

      const sheet = wb.sheets.find((s) => s.name === sheetName);
      if (!sheet) return res.status(404).json({ error: `Feuille "${sheetName}" introuvable` });

      const table = tableMap[targetEntity];
      if (!table) return res.status(400).json({ error: `Entité inconnue: ${targetEntity}` });

      const schema = amSchemas[targetEntity];
      const dateFields = new Set(["dateCreation", "dateAcquisition", "dateDebut", "dateFin", "dateSignature", "dateEstimation"]);

      // Map rows
      let mappedRows: Record<string, any>[] = [];
      const skipErrors: Array<{ row: number; issues: string[] }> = [];

      for (let i = 0; i < sheet.rows.length; i++) {
        const srcRow = sheet.rows[i];
        const mapped: Record<string, any> = {};

        for (const [excelCol, dbField] of Object.entries(mapping as Record<string, string>)) {
          if (!dbField || dbField === "—") continue;
          let val = srcRow[excelCol];
          if (dateFields.has(dbField as string)) val = excelDateToString(val);
          mapped[dbField] = val;
        }

        if (schema) {
          const result = schema.safeParse(mapped);
          if (!result.success) {
            skipErrors.push({ row: i + 1, issues: result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`) });
            continue;
          }
          mappedRows.push(result.data);
        } else {
          mappedRows.push(mapped);
        }
      }

      // Resolve name references
      if (resolveRefsFlag && mappedRows.length > 0) {
        mappedRows = await resolveRefs(mappedRows, targetEntity, req.user?.id);
      } else {
        mappedRows = mappedRows.map((r) => {
          // Remove virtual ref fields
          const { sciNom, actifNom, locataireNom, ...rest } = r;
          return { ...rest, ownerId: req.user?.id };
        });
      }

      // Wizard is an AM-side feature, so baux imports here belong to scope='am'.
      const forceScope = targetEntity === "baux" ? "am" : undefined;

      // Batch insert
      const BATCH = 100;
      let inserted = 0;
      for (let i = 0; i < mappedRows.length; i += BATCH) {
        const batch = mappedRows.slice(i, i + BATCH);
        const batchWithScope = forceScope
          ? batch.map((row) => ({ ...row, scope: forceScope }))
          : batch;
        try {
          const rows = await db.insert(table).values(batchWithScope).returning() as any[];
          inserted += rows.length;
        } catch (err: any) {
          logger.error("import-wizard insert error", { batch: i, error: err.message });
          skipErrors.push({ row: i + 1, issues: [err.message] });
        }
      }

      // Clean up workbook from memory
      workbookStore.delete(fileId);

      res.json({
        success: true,
        inserted,
        skipped: skipErrors.length,
        total: sheet.rows.length,
        errors: skipErrors.slice(0, 20),
      });
    } catch (error: any) {
      logger.error("import-wizard execute error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST upload documents — classify with Claude
  app.post("/api/import-wizard/upload-documents", requireAuth, docLimiter, (req: any, res: any, next: any) => {
    docUpload.array("files", 10)(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Fichier trop volumineux (max 20 Mo)" });
        if (err.code === "LIMIT_FILE_COUNT") return res.status(400).json({ error: "Maximum 10 fichiers par upload" });
        return res.status(400).json({ error: err.message || "Erreur upload" });
      }
      next();
    });
  }, async (req: any, res: any) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY non configurée" });

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "Aucun fichier fourni" });

    const results: any[] = [];

    for (const file of files) {
      const docId = randomUUID();
      const doc: StoredDocument = {
        id: docId,
        fileName: file.originalname,
        filePath: file.path,
        mimeType: file.mimetype,
        fileSize: file.size,
        expiresAt: Date.now() + 30 * 60 * 1000,
      };

      try {
        // Read file for classification
        const fileBuffer = fs.readFileSync(file.path);
        const base64 = fileBuffer.toString("base64");

        const contentParts: any[] = [];
        if (file.mimetype === "application/pdf") {
          contentParts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
        } else if (file.mimetype.startsWith("image/")) {
          contentParts.push({ type: "image", source: { type: "base64", media_type: file.mimetype, data: base64 } });
        } else {
          // For non-visual files (Excel, eml), just use filename and first bytes as text
          contentParts.push({ type: "text", text: `Fichier: ${file.originalname} (${file.mimetype}, ${file.size} octets)` });
        }

        contentParts.push({
          type: "text",
          text: `Classifie ce document immobilier. Retourne UNIQUEMENT un JSON:
{
  "type": "bail|quittance|facture|acte_authentique|releve_bancaire|appel_fonds|pv_ag|etat_lieux|avenant|emprunt|assurance|autre",
  "entity": "nom de la SCI ou de l'actif mentionné, ou null",
  "confidence": 0.0 à 1.0
}`,
        });

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 512,
            messages: [{ role: "user", content: contentParts }],
          }),
        });

        if (response.ok) {
          const result = await response.json() as any;
          const text = result.content?.find((b: any) => b.type === "text")?.text || "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            doc.classification = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (err: any) {
        logger.error("document classification error", { file: file.originalname, error: err.message });
      }

      documentStore.set(docId, doc);
      results.push({
        id: docId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        classification: doc.classification || { type: "autre", entity: null, confidence: 0 },
      });
    }

    res.json({ documents: results });
  });

  // POST extract document — detailed extraction with Claude
  app.post("/api/import-wizard/extract-document", requireAuth, docLimiter, async (req: any, res: any) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY non configurée" });

    const { documentId } = req.body;
    const doc = documentStore.get(documentId);
    if (!doc) return res.status(404).json({ error: "Document expiré ou introuvable" });

    try {
      const fileBuffer = fs.readFileSync(doc.filePath);
      const base64 = fileBuffer.toString("base64");
      const docType = doc.classification?.type || "autre";

      const contentParts: any[] = [];
      if (doc.mimeType === "application/pdf") {
        contentParts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
      } else if (doc.mimeType.startsWith("image/")) {
        contentParts.push({ type: "image", source: { type: "base64", media_type: doc.mimeType, data: base64 } });
      } else {
        contentParts.push({ type: "text", text: `Fichier: ${doc.fileName} — contenu base64 (non visuel)` });
      }

      // Type-specific extraction prompts
      const prompts: Record<string, string> = {
        bail: `Extrais les données de ce bail immobilier en JSON:
{ "typeBail": "commercial|professionnel|habitation", "sciNom": "", "actifNom": "", "locataireNom": "",
  "adresse": "", "ville": "", "codePostal": "", "surface": null, "dateDebut": "YYYY-MM-DD", "dateFin": "YYYY-MM-DD",
  "loyerMensuel": null, "loyerAnnuel": null, "charges": null, "depotGarantie": null,
  "indiceReference": "ILC|IRL|ILAT|ICC|null", "trimestreRef": "", "valeurIndiceBase": null,
  "confidence": { "global": 0.0, "fields": {} } }`,
        emprunt: `Extrais les données de cet emprunt immobilier en JSON:
{ "sciNom": "", "actifNom": "", "banque": "", "montantEmprunte": null, "capitalRestantDu": null,
  "tauxAnnuel": null, "dureeAns": null, "dateDebut": "YYYY-MM-DD", "dateFin": "YYYY-MM-DD",
  "typeAmortissement": "constant|in-fine|progressif", "mensualite": null, "assuranceMensuelle": null,
  "typeGarantie": "hypothèque|caution|privilège", "confidence": { "global": 0.0, "fields": {} } }`,
        quittance: `Extrais les données de cette quittance de loyer en JSON:
{ "locataireNom": "", "actifNom": "", "sciNom": "", "periodeDebut": "YYYY-MM-DD", "periodeFin": "YYYY-MM-DD",
  "montantLoyer": null, "montantCharges": null, "montantTotal": null,
  "confidence": { "global": 0.0, "fields": {} } }`,
        facture: `Extrais les données de cette facture en JSON:
{ "sciNom": "", "actifNom": "", "fournisseur": "", "reference": "", "dateFacture": "YYYY-MM-DD",
  "montantHT": null, "montantTTC": null, "objet": "",
  "confidence": { "global": 0.0, "fields": {} } }`,
        acte_authentique: `Extrais les données de cet acte authentique d'acquisition en JSON:
{ "sciNom": "", "nom": "", "adresse": "", "ville": "", "codePostal": "",
  "prixAcquisition": null, "fraisNotaire": null, "dateAcquisition": "YYYY-MM-DD",
  "surface": null, "type": "résidentiel|commercial|bureau|mixte|crèche",
  "confidence": { "global": 0.0, "fields": {} } }`,
      };

      const extractionPrompt = prompts[docType] ||
        `Extrais toutes les données pertinentes de ce document immobilier en JSON structuré. Inclus un champ "confidence" avec un score global (0-1).`;

      contentParts.push({
        type: "text",
        text: `Tu es un expert en immobilier français. ${extractionPrompt}\nRetourne UNIQUEMENT le JSON, sans texte autour. Les montants en nombres, les dates en YYYY-MM-DD.`,
      });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          messages: [{ role: "user", content: contentParts }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(500).json({ error: `Erreur API Claude: ${response.status}` });
      }

      const result = await response.json() as any;
      const text = result.content?.find((b: any) => b.type === "text")?.text || "";

      let extracted;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Extraction échouée", rawText: text };
      } catch {
        extracted = { error: "JSON malformé", rawText: text };
      }

      res.json({
        success: true,
        documentId,
        fileName: doc.fileName,
        classificationType: docType,
        extracted,
      });
    } catch (error: any) {
      logger.error("document extraction error", { error: error.message });
      res.status(500).json({ error: `Erreur extraction: ${error.message}` });
    }
  });
}
