/**
 * Axe 5 — Extraction de bail PDF via Claude Vision
 */
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  Upload, FileText, CheckCircle, AlertTriangle, Loader2,
  Copy, Download, Eye, Building2, Calendar, DollarSign,
} from "lucide-react";

interface ExtractedData {
  typeBail?: string;
  parties?: {
    bailleur?: { nom?: string; adresse?: string; siret?: string };
    preneur?: { nom?: string; adresse?: string; siret?: string };
  };
  bien?: {
    adresse?: string; ville?: string; codePostal?: string;
    surface?: number; description?: string; type?: string;
  };
  conditions?: {
    dateDebut?: string; dateFin?: string; dureeAns?: number;
    loyerAnnuelHT?: number; loyerMensuelHT?: number; charges?: number;
    depotGarantie?: number; taxe?: string; tvaTaux?: number;
  };
  indexation?: {
    indiceReference?: string; trimestreRef?: string; valeurIndiceBase?: number;
  };
  periodeFerme?: { debut?: string; fin?: string; dureeAns?: number };
  echeancesTriennales?: string[];
  garanties?: { type?: string; montant?: number };
  clausesParticulieres?: string[];
  confiance?: { score?: number; champsIncertains?: string[]; notes?: string };
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}

export default function ExtractionBailPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ extracted: ExtractedData; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/bail-pdf/extract", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      setResult({ extracted: data.extracted, fileName: data.fileName });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyJSON = () => {
    if (result?.extracted) {
      navigator.clipboard.writeText(JSON.stringify(result.extracted, null, 2));
    }
  };

  const d = result?.extracted;
  const confiance = d?.confiance?.score != null ? Math.round(d.confiance.score * 100) : null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Extraction Bail PDF"
          description="Uploadez un bail PDF — Claude Vision extrait automatiquement les données"
        />

        {/* Upload zone */}
        <GlassCard>
          <div className="p-6">
            <div
              className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              {file ? (
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024 / 1024).toFixed(2)} Mo</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">Glissez-déposez un bail PDF ici</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">ou cliquez pour sélectionner — PDF ou image (max 20 Mo)</p>
                </div>
              )}
            </div>

            {file && (
              <div className="flex justify-center mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleUpload}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-shadow"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {loading ? "Analyse en cours..." : "Analyser avec Claude Vision"}
                </motion.button>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div className="flex items-center gap-3 p-4 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <p className="text-sm">{error}</p>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Results */}
        {d && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Confidence score */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm font-semibold">Extraction terminée — {result?.fileName}</span>
              </div>
              <div className="flex items-center gap-2">
                {confiance !== null && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    confiance >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    confiance >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    Confiance: {confiance}%
                  </span>
                )}
                <button
                  onClick={copyJSON}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" /> Copier JSON
                </button>
              </div>
            </div>

            {/* Extracted data */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Bail info */}
              <GlassCard>
                <div className="p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <FileText className="h-4 w-4 text-orange-500" /> Bail
                  </h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Type" value={d.typeBail} />
                    <Row label="Durée" value={d.conditions?.dureeAns ? `${d.conditions.dureeAns} ans` : null} />
                    <Row label="Date début" value={d.conditions?.dateDebut} />
                    <Row label="Date fin" value={d.conditions?.dateFin} />
                    <Row label="Date signature" value={d.conditions?.dateDebut} />
                  </div>
                </div>
              </GlassCard>

              {/* Bien */}
              <GlassCard>
                <div className="p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Building2 className="h-4 w-4 text-blue-500" /> Bien
                  </h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Adresse" value={d.bien?.adresse} />
                    <Row label="Ville" value={d.bien?.ville} />
                    <Row label="Code postal" value={d.bien?.codePostal} />
                    <Row label="Surface" value={d.bien?.surface ? `${d.bien.surface} m²` : null} />
                    <Row label="Type" value={d.bien?.type} />
                  </div>
                </div>
              </GlassCard>

              {/* Conditions financières */}
              <GlassCard>
                <div className="p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <DollarSign className="h-4 w-4 text-green-500" /> Conditions financières
                  </h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Loyer annuel HT" value={d.conditions?.loyerAnnuelHT ? `${formatValue(d.conditions.loyerAnnuelHT)} €` : null} />
                    <Row label="Loyer mensuel HT" value={d.conditions?.loyerMensuelHT ? `${formatValue(d.conditions.loyerMensuelHT)} €` : null} />
                    <Row label="Charges" value={d.conditions?.charges ? `${formatValue(d.conditions.charges)} €` : null} />
                    <Row label="Dépôt de garantie" value={d.conditions?.depotGarantie ? `${formatValue(d.conditions.depotGarantie)} €` : null} />
                    <Row label="Taxe" value={d.conditions?.taxe} />
                    <Row label="TVA" value={d.conditions?.tvaTaux ? `${d.conditions.tvaTaux}%` : null} />
                  </div>
                </div>
              </GlassCard>

              {/* Indexation */}
              <GlassCard>
                <div className="p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Calendar className="h-4 w-4 text-purple-500" /> Indexation & Périodes
                  </h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Indice" value={d.indexation?.indiceReference} />
                    <Row label="Trimestre réf." value={d.indexation?.trimestreRef} />
                    <Row label="Valeur indice base" value={d.indexation?.valeurIndiceBase} />
                    <Row label="Période ferme" value={d.periodeFerme?.debut && d.periodeFerme?.fin ? `${d.periodeFerme.debut} → ${d.periodeFerme.fin}` : null} />
                    {d.echeancesTriennales && d.echeancesTriennales.length > 0 && (
                      <Row label="Échéances triennales" value={d.echeancesTriennales.filter(Boolean).join(", ")} />
                    )}
                  </div>
                </div>
              </GlassCard>

              {/* Parties */}
              <GlassCard>
                <div className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Bailleur</h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Nom" value={d.parties?.bailleur?.nom} />
                    <Row label="Adresse" value={d.parties?.bailleur?.adresse} />
                    <Row label="SIRET" value={d.parties?.bailleur?.siret} />
                  </div>
                  <h3 className="text-sm font-semibold mb-3 mt-4">Preneur</h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Nom" value={d.parties?.preneur?.nom} />
                    <Row label="Adresse" value={d.parties?.preneur?.adresse} />
                    <Row label="SIRET" value={d.parties?.preneur?.siret} />
                  </div>
                </div>
              </GlassCard>

              {/* Clauses */}
              {d.clausesParticulieres && d.clausesParticulieres.filter(Boolean).length > 0 && (
                <GlassCard>
                  <div className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Clauses particulières</h3>
                    <ul className="space-y-1.5">
                      {d.clausesParticulieres.filter(Boolean).map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </GlassCard>
              )}
            </div>

            {/* Champs incertains */}
            {d.confiance?.champsIncertains && d.confiance.champsIncertains.filter(Boolean).length > 0 && (
              <GlassCard>
                <div className="flex items-start gap-3 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">Champs incertains</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.confiance.champsIncertains.filter(Boolean).join(", ")}
                    </p>
                    {d.confiance.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{d.confiance.notes}</p>
                    )}
                  </div>
                </div>
              </GlassCard>
            )}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${value ? "" : "text-muted-foreground/40"}`}>
        {formatValue(value)}
      </span>
    </div>
  );
}
