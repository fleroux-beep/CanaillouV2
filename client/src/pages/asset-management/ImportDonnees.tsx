/**
 * Import de données — Excel wizard + Document pipeline
 */
import { useState, useMemo, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { KpiCard } from "../../components/ui/kpi-card";
import {
  Upload, FileSpreadsheet, FileText, CheckCircle, AlertTriangle,
  ArrowRight, ArrowLeft, Loader2, Sparkles, Eye, Building2, Landmark,
  DatabaseBackup, X, ChevronDown,
} from "lucide-react";

type Tab = "excel" | "documents";
type ExcelStep = "upload" | "mapping" | "preview" | "result";
type DocStep = "upload" | "classify" | "extract";

// ─── Entity field definitions ────────────────────────────────────
const ENTITY_OPTIONS = [
  { value: "scis", label: "SCIs" },
  { value: "actifs", label: "Actifs" },
  { value: "lots", label: "Lots" },
  { value: "baux", label: "Baux" },
  { value: "emprunts", label: "Emprunts" },
  { value: "locataires", label: "Locataires" },
  { value: "associes", label: "Associés" },
  { value: "travaux", label: "Travaux" },
];

const ENTITY_FIELDS: Record<string, string[]> = {
  scis: ["nom", "formeJuridique", "capital", "regimeFiscal", "siret", "adresse", "ville", "codePostal", "dateCreation", "gerant", "expertComptable", "banque", "iban", "notes"],
  actifs: ["nom", "sciNom", "adresse", "ville", "codePostal", "type", "surface", "surfaceCarrez", "anneeConstruction", "dpe", "prixAcquisition", "fraisNotaire", "fraisAgence", "montantTravaux", "dateAcquisition", "chargesAnnuelles", "taxeFonciere", "assurancePno", "chargesCopropriete", "tauxCapitalisation", "notes"],
  lots: ["designation", "actifNom", "sciNom", "type", "etage", "surface", "surfaceCarrez", "chargesLot", "statut", "notes"],
  baux: ["typeBail", "actifNom", "sciNom", "locataireNom", "dateDebut", "dateFin", "dateSignature", "loyerBaseHT", "loyerHTActu", "charges", "depotGarantie", "indiceReference", "trimestreRef", "valeurIndiceBase", "statut", "notes"],
  emprunts: ["sciNom", "actifNom", "banque", "montantEmprunte", "capitalRestantDu", "tauxAnnuel", "taeg", "dureeAns", "dureeMois", "dateDebut", "dateFin", "typeAmortissement", "mensualite", "assuranceMensuelle", "tauxAssurance", "typeGarantie", "ira", "notes"],
  locataires: ["nom", "prenom", "email", "telephone", "adresse", "siret", "notes"],
  associes: ["nom", "prenom", "email", "telephone", "adresse", "siret", "notes"],
  travaux: ["actifNom", "sciNom", "titre", "description", "budget", "montantReel", "dateDebut", "dateFin", "statut", "prestataire", "notes"],
};

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  bail: { label: "Bail", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  quittance: { label: "Quittance", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  facture: { label: "Facture", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  acte_authentique: { label: "Acte authentique", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  emprunt: { label: "Emprunt", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  releve_bancaire: { label: "Relevé bancaire", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  assurance: { label: "Assurance", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  autre: { label: "Autre", color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

// ─── Fuzzy matching ──────────────────────────────────────────────
function fuzzyMatch(header: string, fields: string[]): string | null {
  const n = header.toLowerCase().replace(/[^a-z0-9àâéèêëïîôùûüç]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const direct = fields.find((f) => f.toLowerCase() === n);
  if (direct) return direct;
  const partial = fields.find((f) => n.includes(f.toLowerCase()) || f.toLowerCase().includes(n));
  if (partial) return partial;
  const synonyms: Record<string, string> = {
    prixacquisition: "prixAcquisition", prix: "prixAcquisition",
    codepostal: "codePostal", cp: "codePostal",
    // Le loyer est désormais annuel HT (loyerBaseHT) — les colonnes mensuelles
    // doivent être converties en annuel par l'utilisateur ou cartographiées manuellement.
    loyerannuel: "loyerBaseHT", loyerbaseht: "loyerBaseHT", loyerhtactu: "loyerHTActu",
    fraisnotaire: "fraisNotaire", fraisagence: "fraisAgence",
    taxefonciere: "taxeFonciere", tf: "taxeFonciere",
    depotgarantie: "depotGarantie", dg: "depotGarantie",
    montanttravaux: "montantTravaux", montantemprunte: "montantEmprunte",
    capitalrestantdu: "capitalRestantDu", crd: "capitalRestantDu",
    tauxannuel: "tauxAnnuel", taux: "tauxAnnuel",
    duree: "dureeAns", dureeannees: "dureeAns",
    sci: "sciNom", nomsci: "sciNom",
    actif: "actifNom", nomactif: "actifNom",
    surface: "surface", surfacecarrez: "surfaceCarrez",
    chargesannuelles: "chargesAnnuelles", charges: "charges",
    assurancepno: "assurancePno", designation: "designation",
    typeamortissement: "typeAmortissement", typebail: "typeBail",
    indice: "indiceReference", trimestre: "trimestreRef",
  };
  return synonyms[n] || null;
}

// ─── Drop Zone component ─────────────────────────────────────────
function DropZone({ accept, multiple, onFiles, loading, label }: {
  accept: string; multiple?: boolean; onFiles: (files: File[]) => void; loading?: boolean; label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors ${
        dragOver ? "border-orange-500 bg-orange-50/10" : "border-border/60 hover:border-orange-400 hover:bg-muted/20"
      }`}
    >
      {loading ? (
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
      ) : (
        <Upload className="h-10 w-10 text-muted-foreground" />
      )}
      <p className="text-sm text-muted-foreground">{loading ? "Traitement en cours..." : label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            i < current ? "bg-green-500 text-white" : i === current ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white" : "bg-muted text-muted-foreground"
          }`}>
            {i < current ? <CheckCircle className="h-4 w-4" /> : i + 1}
          </div>
          <span className={`text-xs font-medium ${i === current ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
          {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Main Page
// ═════════════════════════════════════════════════════════════════
export default function ImportDonneesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("excel");
  const queryClient = useQueryClient();

  // ─── Excel state ───────────────────────────────────────────────
  const [excelStep, setExcelStep] = useState<ExcelStep>("upload");
  const [fileId, setFileId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<any[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [targetEntity, setTargetEntity] = useState("scis");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [resolveRefs, setResolveRefs] = useState(true);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);

  // ─── Doc state ─────────────────────────────────────────────────
  const [docStep, setDocStep] = useState<DocStep>("upload");
  const [documents, setDocuments] = useState<any[]>([]);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<Record<string, any>>({});

  // ─── Excel mutations ───────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import-wizard/upload-excel", {
        method: "POST",
        headers: { "X-Requested-With": "fetch" },
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur upload");
      return res.json();
    },
    onSuccess: (data) => {
      setFileId(data.fileId);
      setSheets(data.sheets);
      if (data.sheets.length > 0) setSelectedSheet(data.sheets[0].name);
      setExcelStep("mapping");
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("/api/import-wizard/preview", {
      method: "POST",
      body: JSON.stringify({ fileId, sheetName: selectedSheet, mapping, targetEntity }),
    }),
    onSuccess: (data: any) => {
      setPreviewData(data);
      setExcelStep("preview");
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => apiRequest("/api/import-wizard/execute", {
      method: "POST",
      body: JSON.stringify({ fileId, sheetName: selectedSheet, mapping, targetEntity, resolveRefsFlag: resolveRefs }),
    }),
    onSuccess: (data: any) => {
      setImportResult(data);
      setExcelStep("result");
      // Invalidate all AM queries
      queryClient.invalidateQueries({ queryKey: ["/api/am"] });
    },
  });

  // ─── Doc mutations ─────────────────────────────────────────────
  const uploadDocsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/import-wizard/upload-documents", {
        method: "POST",
        headers: { "X-Requested-With": "fetch" },
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur upload");
      return res.json();
    },
    onSuccess: (data) => {
      setDocuments(data.documents);
      setDocStep("classify");
    },
  });

  const extractDocMutation = useMutation({
    mutationFn: (documentId: string) => apiRequest("/api/import-wizard/extract-document", {
      method: "POST",
      body: JSON.stringify({ documentId }),
    }),
    onSuccess: (data: any) => {
      setExtractedData((prev) => ({ ...prev, [data.documentId]: data }));
      setExtracting(null);
    },
    onError: () => setExtracting(null),
  });

  // ─── Auto-map when sheet or entity changes ─────────────────────
  const currentSheetHeaders = useMemo(() => {
    const sheet = sheets.find((s: any) => s.name === selectedSheet);
    return sheet?.headers || [];
  }, [sheets, selectedSheet]);

  const autoMap = useCallback(() => {
    const fields = ENTITY_FIELDS[targetEntity] || [];
    const m: Record<string, string> = {};
    for (const h of currentSheetHeaders) {
      const match = fuzzyMatch(h, fields);
      m[h] = match || "—";
    }
    setMapping(m);
  }, [currentSheetHeaders, targetEntity]);

  // Reset and restart
  const resetExcel = () => {
    setExcelStep("upload");
    setFileId(null);
    setSheets([]);
    setSelectedSheet("");
    setMapping({});
    setPreviewData(null);
    setImportResult(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <PageHeader
        title="Import de données"
        description="Importez vos données Excel ou classifiez vos documents (baux, quittances, factures...)"
      />

      {/* Tab switcher */}
      <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1 w-fit">
        {([
          { key: "excel" as Tab, label: "Import Excel", icon: FileSpreadsheet },
          { key: "documents" as Tab, label: "Import Documents", icon: FileText },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              activeTab === key
                ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ═══════ EXCEL TAB ═══════ */}
      {activeTab === "excel" && (
        <div className="space-y-6">
          <Stepper
            steps={["Upload", "Mapping", "Prévisualisation", "Résultat"]}
            current={["upload", "mapping", "preview", "result"].indexOf(excelStep)}
          />

          {/* Step 1: Upload */}
          {excelStep === "upload" && (
            <GlassCard>
              <div className="p-6">
                <h3 className="text-sm font-semibold mb-4">Chargez votre fichier Excel</h3>
                <DropZone
                  accept=".xlsx,.xls,.csv"
                  label="Glissez un fichier Excel (.xlsx, .xls) ou CSV ici, ou cliquez pour sélectionner"
                  loading={uploadMutation.isPending}
                  onFiles={(files) => uploadMutation.mutate(files[0])}
                />
                {uploadMutation.isError && (
                  <p className="mt-3 text-sm text-red-500">{(uploadMutation.error as any)?.message}</p>
                )}
              </div>
            </GlassCard>
          )}

          {/* Step 2: Mapping */}
          {excelStep === "mapping" && (
            <div className="space-y-4">
              <GlassCard>
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Feuille Excel</label>
                      <select
                        value={selectedSheet}
                        onChange={(e) => setSelectedSheet(e.target.value)}
                        className="mt-1 block rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        {sheets.map((s: any) => (
                          <option key={s.name} value={s.name}>{s.name} ({s.rowCount} lignes)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Entité cible</label>
                      <select
                        value={targetEntity}
                        onChange={(e) => setTargetEntity(e.target.value)}
                        className="mt-1 block rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        {ENTITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={autoMap}
                      className="rounded-lg bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5 inline mr-1.5" />
                      Auto-mapping
                    </button>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={resolveRefs}
                        onChange={(e) => setResolveRefs(e.target.checked)}
                        className="rounded"
                      />
                      Résoudre les noms (SCI, actif) → IDs
                    </label>
                  </div>

                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4">Mapping des colonnes</h4>
                  <div className="grid gap-2">
                    {currentSheetHeaders.map((h: string) => (
                      <div key={h} className="flex items-center gap-3 rounded-lg bg-muted/20 px-3 py-2">
                        <span className="text-sm font-medium w-48 truncate" title={h}>{h}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <select
                          value={mapping[h] || "—"}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                          className="flex-1 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
                        >
                          <option value="—">— Ignorer —</option>
                          {(ENTITY_FIELDS[targetEntity] || []).map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Sample data preview */}
                  {(() => {
                    const sheet = sheets.find((s: any) => s.name === selectedSheet);
                    if (!sheet || sheet.sampleRows.length === 0) return null;
                    return (
                      <div className="mt-4">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Aperçu (5 premières lignes)</h4>
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/30">
                                {sheet.headers.map((h: string) => (
                                  <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sheet.sampleRows.map((row: any[], i: number) => (
                                <tr key={i} className="border-t">
                                  {row.map((cell, j) => (
                                    <td key={j} className="px-3 py-1.5 whitespace-nowrap">{cell != null ? String(cell) : "—"}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </GlassCard>

              <div className="flex gap-3">
                <button onClick={resetExcel} className="rounded-lg border border-border/60 px-4 py-2 text-sm hover:bg-muted transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Retour
                </button>
                <button
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending || Object.values(mapping).every((v) => v === "—")}
                  className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {previewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 inline mr-1 animate-spin" /> : <Eye className="h-3.5 w-3.5 inline mr-1" />}
                  Prévisualiser
                </button>
              </div>
              {previewMutation.isError && (
                <p className="text-sm text-red-500">{(previewMutation.error as any)?.message}</p>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {excelStep === "preview" && previewData && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <KpiCard label="Lignes valides" value={previewData.validCount} icon={CheckCircle} variant="success" />
                <KpiCard label="Erreurs" value={previewData.errorCount} icon={AlertTriangle} variant={previewData.errorCount > 0 ? "danger" : "default"} />
              </div>

              <GlassCard>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left font-semibold">#</th>
                        {Object.entries(mapping).filter(([, v]) => v !== "—").map(([, dbField]) => (
                          <th key={dbField} className="px-3 py-2 text-left font-semibold">{dbField}</th>
                        ))}
                        <th className="px-3 py-2 text-left font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.slice(0, 50).map((row: any, i: number) => (
                        <tr key={i} className={`border-t ${!row._valid ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                          <td className="px-3 py-1.5 text-muted-foreground">{row._row}</td>
                          {Object.entries(mapping).filter(([, v]) => v !== "—").map(([, dbField]) => (
                            <td key={dbField} className="px-3 py-1.5 max-w-[200px] truncate">
                              {row[dbField] != null ? String(row[dbField]) : "—"}
                            </td>
                          ))}
                          <td className="px-3 py-1.5">
                            {row._valid ? (
                              <span className="text-green-600 text-xs">OK</span>
                            ) : (
                              <span className="text-red-500 text-xs" title={row._errors?.join("; ")}>
                                <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                                {row._errors?.[0]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.rows.length > 50 && (
                    <p className="mt-2 text-xs text-muted-foreground text-center">
                      ... et {previewData.rows.length - 50} lignes supplémentaires
                    </p>
                  )}
                </div>
              </GlassCard>

              <div className="flex gap-3">
                <button onClick={() => setExcelStep("mapping")} className="rounded-lg border border-border/60 px-4 py-2 text-sm hover:bg-muted transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Modifier le mapping
                </button>
                <button
                  onClick={() => executeMutation.mutate()}
                  disabled={executeMutation.isPending || previewData.validCount === 0}
                  className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {executeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 inline mr-1 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5 inline mr-1" />}
                  Importer {previewData.validCount} ligne{previewData.validCount > 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Result */}
          {excelStep === "result" && importResult && (
            <GlassCard>
              <div className="p-8 text-center space-y-4">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h3 className="text-xl font-bold">Import terminé</h3>
                <div className="flex justify-center gap-6 text-sm">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{importResult.inserted}</p>
                    <p className="text-muted-foreground">importé{importResult.inserted > 1 ? "s" : ""}</p>
                  </div>
                  {importResult.skipped > 0 && (
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                      <p className="text-muted-foreground">ignoré{importResult.skipped > 1 ? "s" : ""}</p>
                    </div>
                  )}
                </div>
                {importResult.errors?.length > 0 && (
                  <div className="mt-4 text-left max-w-md mx-auto">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Erreurs</h4>
                    <ul className="space-y-1 text-xs text-red-500">
                      {importResult.errors.map((e: any, i: number) => (
                        <li key={i}>Ligne {e.row}: {e.issues?.join(", ")}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={resetExcel}
                  className="rounded-lg gradient-primary px-6 py-2 text-sm font-medium text-white mt-4"
                >
                  Nouvel import
                </button>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* ═══════ DOCUMENTS TAB ═══════ */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          <Stepper
            steps={["Upload", "Classification", "Extraction"]}
            current={["upload", "classify", "extract"].indexOf(docStep)}
          />

          {/* Step 1: Upload documents */}
          {docStep === "upload" && (
            <GlassCard>
              <div className="p-6">
                <h3 className="text-sm font-semibold mb-4">Chargez vos documents</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  PDF, images, Excel — baux, quittances, factures, actes, emprunts... Claude IA les classifiera et extraira les données automatiquement.
                </p>
                <DropZone
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.eml"
                  multiple
                  label="Glissez vos documents ici (max 10 fichiers, 20 MB chacun)"
                  loading={uploadDocsMutation.isPending}
                  onFiles={(files) => uploadDocsMutation.mutate(files)}
                />
                {uploadDocsMutation.isError && (
                  <p className="mt-3 text-sm text-red-500">{(uploadDocsMutation.error as any)?.message}</p>
                )}
              </div>
            </GlassCard>
          )}

          {/* Step 2: Classification review */}
          {docStep === "classify" && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <KpiCard label="Documents" value={documents.length} icon={FileText} variant="primary" />
                <KpiCard
                  label="Haute confiance"
                  value={documents.filter((d: any) => d.classification?.confidence >= 0.8).length}
                  icon={CheckCircle}
                  variant="success"
                />
              </div>

              <div className="space-y-3">
                {documents.map((doc: any) => {
                  const cls = doc.classification || {};
                  const typeInfo = DOC_TYPE_LABELS[cls.type] || DOC_TYPE_LABELS.autre;
                  const extracted = extractedData[doc.id];
                  const isExtracting = extracting === doc.id;

                  return (
                    <GlassCard key={doc.id}>
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{doc.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {(doc.fileSize / 1024).toFixed(0)} Ko
                                {cls.entity && <> — <span className="font-medium">{cls.entity}</span></>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                            <span className={`text-xs font-bold ${
                              cls.confidence >= 0.8 ? "text-green-600" : cls.confidence >= 0.5 ? "text-amber-600" : "text-red-500"
                            }`}>
                              {Math.round((cls.confidence || 0) * 100)}%
                            </span>
                            <button
                              onClick={() => { setExtracting(doc.id); extractDocMutation.mutate(doc.id); }}
                              disabled={isExtracting}
                              className="rounded-lg gradient-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {isExtracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 inline mr-1" />}
                              {extracted ? "Re-extraire" : "Extraire"}
                            </button>
                          </div>
                        </div>

                        {/* Extracted data */}
                        {extracted && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            className="mt-4 border-t border-border/40 pt-4"
                          >
                            <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">
                              Données extraites ({extracted.classificationType})
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {Object.entries(extracted.extracted || {}).filter(([k]) => k !== "confidence").map(([key, val]) => (
                                <div key={key} className="rounded-lg bg-muted/30 px-3 py-2">
                                  <span className="text-xs text-muted-foreground">{key}</span>
                                  <p className="font-medium text-sm truncate">
                                    {val != null ? String(val) : "—"}
                                  </p>
                                </div>
                              ))}
                            </div>
                            {extracted.extracted?.confidence && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Confiance globale: <span className="font-bold">{Math.round((extracted.extracted.confidence.global || 0) * 100)}%</span>
                              </p>
                            )}
                          </motion.div>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setDocStep("upload"); setDocuments([]); setExtractedData({}); }} className="rounded-lg border border-border/60 px-4 py-2 text-sm hover:bg-muted transition-colors">
                  <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Nouveaux documents
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
