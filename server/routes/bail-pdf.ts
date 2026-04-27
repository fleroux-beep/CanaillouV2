/**
 * Axe 5 — Extraction de bail PDF via Claude Vision
 *
 * Upload un PDF de bail, envoie chaque page comme image à Claude Vision,
 * extrait les informations clés (loyer, surface, dates, parties, etc.)
 * et retourne un JSON structuré prêt à importer.
 */
import type { Express } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../lib/rate-limit";

const pdfExtractLimiter = rateLimit(10, 10 * 60 * 1000, "bail-pdf"); // 10 per 10 min
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";

const ALLOWED_BAIL_PDF_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const upload = multer({
  dest: "/tmp/canaillou-uploads/",
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_BAIL_PDF_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers PDF/PNG/JPEG/WebP sont acceptés"));
    }
  },
});

const EXTRACTION_PROMPT = `Tu es un expert en droit immobilier français. Analyse ce document de bail et extrais toutes les informations structurées.

Retourne un JSON avec exactement cette structure (laisse null si l'information n'est pas trouvée) :

{
  "typeBail": "commercial | professionnel | habitation | mixte",
  "parties": {
    "bailleur": { "nom": "", "adresse": "", "siret": "" },
    "preneur": { "nom": "", "adresse": "", "siret": "" }
  },
  "bien": {
    "adresse": "",
    "ville": "",
    "codePostal": "",
    "surface": null,
    "description": "",
    "etage": "",
    "type": "bureau | commerce | habitation | local_commercial"
  },
  "conditions": {
    "dateDebut": "YYYY-MM-DD",
    "dateFin": "YYYY-MM-DD",
    "dureeAns": null,
    "dateSignature": "YYYY-MM-DD",
    "loyerAnnuelHT": null,
    "loyerMensuelHT": null,
    "charges": null,
    "depotGarantie": null,
    "taxeFonciere": null,
    "taxe": "TVA | CRL | aucune",
    "tvaTaux": null
  },
  "indexation": {
    "indiceReference": "ILC | IRL | ILAT | ICC | null",
    "trimestreRef": "",
    "valeurIndiceBase": null
  },
  "periodeFerme": {
    "debut": "YYYY-MM-DD",
    "fin": "YYYY-MM-DD",
    "dureeAns": null
  },
  "echeancesTriennales": ["YYYY-MM-DD", "YYYY-MM-DD", "YYYY-MM-DD"],
  "garanties": {
    "type": "",
    "montant": null
  },
  "clausesParticulieres": [""],
  "confiance": {
    "score": 0.0,
    "champsIncertains": [""],
    "notes": ""
  }
}

Important:
- Les montants doivent être des nombres (pas de symbole €)
- Les dates en format YYYY-MM-DD
- Si un loyer est TTC, convertis en HT si le taux de TVA est indiqué
- Indique le score de confiance (0-1) basé sur la lisibilité et la complétude
- Liste les champs dont tu n'es pas sûr dans champsIncertains`;

export function registerBailPDFRoutes(app: Express) {
  // Ensure upload directory exists
  const uploadDir = process.env.UPLOAD_DIR || "/tmp/canaillou-uploads";
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.post("/api/bail-pdf/extract", requireAuth, pdfExtractLimiter, (req: any, res: any, next: any) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Fichier trop volumineux (max 20 Mo)" });
        return res.status(400).json({ error: err.message || "Erreur upload" });
      }
      next();
    });
  }, async (req: any, res: any) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY non configurée" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }

    const filePath = req.file.path;

    try {
      let imageContents: Array<{ type: string; source?: any; text?: string }> = [];

      if (req.file.mimetype === "application/pdf") {
        // Read PDF as base64 and send directly
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        imageContents = [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ];
      } else {
        // Image file
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        imageContents = [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: req.file.mimetype,
              data: base64,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ];
      }

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
          messages: [
            {
              role: "user",
              content: imageContents,
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        logger.error("Claude Vision API error", { status: response.status, body: err });
        return res.status(500).json({ error: `Erreur API Claude: ${response.status}` });
      }

      const result = await response.json() as any;
      const textContent = result.content?.find((b: any) => b.type === "text")?.text || "";

      // Extract JSON from the response
      let extracted;
      try {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        } else {
          extracted = { error: "Impossible d'extraire le JSON", rawText: textContent };
        }
      } catch {
        extracted = { error: "JSON malformé dans la réponse", rawText: textContent };
      }

      res.json({
        success: true,
        extracted,
        fileName: req.file.originalname,
        fileSize: req.file.size,
      });
    } catch (error: any) {
      logger.error("bail-pdf extraction error", { error: error.message });
      res.status(500).json({ error: "Erreur lors de l'extraction du PDF" });
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(filePath); } catch {}
    }
  });
}
