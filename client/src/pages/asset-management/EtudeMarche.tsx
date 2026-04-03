import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { PageHeader } from "../../components/ui/page-header";
import { GlassCard } from "../../components/ui/glass-card";
import { KpiCard } from "../../components/ui/kpi-card";
import { Badge } from "../../components/ui/badge";
import { Section } from "../../components/ui/section";
import {
  RefreshCw, Building2, MapPin, TrendingUp, TrendingDown,
  Database, Search, ChevronDown, AlertTriangle,
  Home, Store, Briefcase, Loader2, Sparkles,
  Eye, ShieldCheck, Target,
  ArrowUpRight, ArrowDownRight, Minus, Zap, Shield,
  CheckCircle2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface Phase1Data {
  valeurVenale: {
    prixM2Median: number;
    prixM2Bas: number;
    prixM2Haut: number;
    nbTransactions: number | null;
    periode: string | null;
    source: string;
  } | null;
  valeurLocative: {
    loyerM2Median: number;
    loyerM2Bas: number;
    loyerM2Haut: number;
    periode: string | null;
    source: string;
  } | null;
  tauxCapi: {
    taux: number;
    tauxBas: number;
    tauxHaut: number;
    fiabilite: string | null;
    methode: string | null;
  } | null;
}

interface AnalyseIA {
  id: string;
  positionnement: {
    loyerVsMarche: string;
    ecartLoyerPct: number;
    prixVsMarche: string;
    ecartPrixPct: number;
    commentaire: string;
  };
  potentiel: {
    margeLoyer: number;
    plusValue: number;
    horizonAns: number;
    commentaire: string;
  };
  risques: Array<{
    type: string;
    niveau: "faible" | "modéré" | "élevé";
    description: string;
  }>;
  recommandations: Array<{
    action: string;
    priorite: "haute" | "moyenne" | "basse";
    impact: string;
    detail: string;
  }>;
  comparables: string;
  synthese: string;
  confidence: "A" | "B" | "C" | "D" | "E";
  model: string;
  createdAt: string;
}

interface ActifInfo {
  id: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  type: string | null;
  surface: string | null;
  surfaceCarrez: string | null;
}

interface EtudeActif {
  actif: ActifInfo;
  avertissements?: string[];
  phase1: Phase1Data;
  analyseIA: AnalyseIA | null;
}

// ============================================================
// Helpers
// ============================================================

function typeIcon(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t.includes("bureau")) return Briefcase;
  if (t.includes("commercial") || t.includes("commerce")) return Store;
  if (t.includes("résidentiel") || t.includes("residentiel")) return Home;
  return Building2;
}

function typeGradient(type: string | null): string {
  const t = (type || "").toLowerCase();
  if (t.includes("bureau")) return "from-violet-500 to-purple-600";
  if (t.includes("commercial") || t.includes("commerce")) return "from-emerald-500 to-teal-600";
  if (t.includes("résidentiel") || t.includes("residentiel")) return "from-blue-500 to-indigo-600";
  if (t.includes("crèche") || t.includes("creche")) return "from-pink-500 to-rose-600";
  return "from-orange-500 to-amber-600";
}

function fmtPrix(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €/m²";
}

function fmtLoyer(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + " €/m²/mois";
}

function fmtTaux(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toFixed(2) + "%";
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "Très fiable" },
  B: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400", label: "Fiable" },
  C: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "Indicatif" },
  D: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400", label: "Fragile" },
  E: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400", label: "Insuffisant" },
};

const RISQUE_ICONS: Record<string, typeof Shield> = {
  vacance: Building2,
  obsolescence_energetique: Zap,
  marche: TrendingDown,
  reglementaire: Shield,
  structural: AlertTriangle,
  fiscal: Target,
};

const RISQUE_COLORS: Record<string, string> = {
  faible: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "modéré": "text-amber-500 bg-amber-500/10 border-amber-500/20",
  "élevé": "text-red-500 bg-red-500/10 border-red-500/20",
};

const PRIORITE_COLORS: Record<string, string> = {
  haute: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  moyenne: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  basse: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
};

// ============================================================
// Sub-components
// ============================================================

function DataMetric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "blue" | "emerald" | "amber" | "purple" }) {
  const accentColors = {
    blue: "from-blue-500 to-indigo-500",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    purple: "from-purple-500 to-violet-500",
  };
  const gradient = accent ? accentColors[accent] : "from-gray-500 to-gray-600";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card p-4">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${gradient}`} />
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const style = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.E;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${style.bg} ${style.text}`}>
      <ShieldCheck className="h-3 w-3" />
      {confidence} — {style.label}
    </span>
  );
}

function Phase1Block({ data }: { data: Phase1Data }) {
  const hasData = data.valeurVenale || data.valeurLocative || data.tauxCapi;

  if (!hasData) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/20 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-medium">Aucune donnée officielle disponible</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lancez la synchronisation Phase 1 (DVF + ANIL) pour récupérer les données officielles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <DataMetric
        label="Valeur vénale (DVF)"
        value={fmtPrix(data.valeurVenale?.prixM2Median)}
        sub={data.valeurVenale
          ? `${fmtPrix(data.valeurVenale.prixM2Bas)} — ${fmtPrix(data.valeurVenale.prixM2Haut)}${data.valeurVenale.nbTransactions ? ` · ${data.valeurVenale.nbTransactions} transactions` : ""}`
          : undefined}
        accent="blue"
      />
      <DataMetric
        label="Valeur locative (ANIL)"
        value={fmtLoyer(data.valeurLocative?.loyerM2Median)}
        sub={data.valeurLocative
          ? `${fmtLoyer(data.valeurLocative.loyerM2Bas)} — ${fmtLoyer(data.valeurLocative.loyerM2Haut)}`
          : undefined}
        accent="emerald"
      />
      <DataMetric
        label="Taux de capitalisation"
        value={fmtTaux(data.tauxCapi?.taux)}
        sub={data.tauxCapi
          ? `${fmtTaux(data.tauxCapi.tauxBas)} — ${fmtTaux(data.tauxCapi.tauxHaut)}${data.tauxCapi.fiabilite ? ` · Fiabilité ${data.tauxCapi.fiabilite}` : ""}`
          : undefined}
        accent="amber"
      />
    </div>
  );
}

function PositionnementBlock({ data }: { data: AnalyseIA["positionnement"] }) {
  const loyerIcon = data.ecartLoyerPct > 2 ? ArrowUpRight : data.ecartLoyerPct < -2 ? ArrowDownRight : Minus;
  const prixIcon = data.ecartPrixPct > 2 ? ArrowUpRight : data.ecartPrixPct < -2 ? ArrowDownRight : Minus;
  const loyerColor = data.ecartLoyerPct > 2 ? "text-emerald-500" : data.ecartLoyerPct < -2 ? "text-red-500" : "text-muted-foreground";
  const prixColor = data.ecartPrixPct > 2 ? "text-emerald-500" : data.ecartPrixPct < -2 ? "text-red-500" : "text-muted-foreground";
  const LoyerIcon = loyerIcon;
  const PrixIcon = prixIcon;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
          <LoyerIcon className={`h-5 w-5 ${loyerColor}`} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Loyer vs marché</p>
            <p className="text-sm font-semibold capitalize">{data.loyerVsMarche}</p>
            <p className={`text-xs font-bold ${loyerColor}`}>{data.ecartLoyerPct > 0 ? "+" : ""}{data.ecartLoyerPct}%</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
          <PrixIcon className={`h-5 w-5 ${prixColor}`} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prix vs marché</p>
            <p className="text-sm font-semibold capitalize">{data.prixVsMarche}</p>
            <p className={`text-xs font-bold ${prixColor}`}>{data.ecartPrixPct > 0 ? "+" : ""}{data.ecartPrixPct}%</p>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{data.commentaire}</p>
    </div>
  );
}

function PotentielBlock({ data }: { data: AnalyseIA["potentiel"] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DataMetric label="Marge loyer" value={`+${data.margeLoyer}%`} accent="emerald" />
        <DataMetric label="Plus-value potentielle" value={`+${data.plusValue}%`} accent="blue" />
        <DataMetric label="Horizon recommandé" value={`${data.horizonAns} ans`} accent="purple" />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{data.commentaire}</p>
    </div>
  );
}

function RisquesBlock({ risques }: { risques: AnalyseIA["risques"] }) {
  if (!risques || risques.length === 0) return null;

  return (
    <div className="space-y-2">
      {risques.map((r, i) => {
        const Icon = RISQUE_ICONS[r.type] || AlertTriangle;
        const colorClass = RISQUE_COLORS[r.niveau] || RISQUE_COLORS["modéré"];
        return (
          <div key={i} className={`flex items-start gap-3 rounded-xl border p-3.5 ${colorClass}`}>
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider">{r.type.replace(/_/g, " ")}</span>
                <Badge variant="outline" className={`text-[10px] py-0 ${colorClass}`}>{r.niveau}</Badge>
              </div>
              <p className="text-xs mt-1 opacity-90">{r.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecommandationsBlock({ recommandations }: { recommandations: AnalyseIA["recommandations"] }) {
  if (!recommandations || recommandations.length === 0) return null;

  return (
    <div className="space-y-2">
      {recommandations.map((r, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">{r.action}</span>
            <Badge variant="outline" className={`text-[10px] py-0 ml-auto ${PRIORITE_COLORS[r.priorite] || ""}`}>
              {r.priorite}
            </Badge>
          </div>
          {r.impact && (
            <p className="text-xs font-semibold text-primary mb-1">{r.impact}</p>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">{r.detail}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Actif Card
// ============================================================

function ActifCard({ etude, index, onAnalyse, isAnalysing }: {
  etude: EtudeActif;
  index: number;
  onAnalyse: (actifId: string) => void;
  isAnalysing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { actif, phase1, analyseIA } = etude;
  const Icon = typeIcon(actif.type);
  const gradient = typeGradient(actif.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <GlassCard className="overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/30"
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
            <Icon className="h-5 w-5 text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold truncate">{actif.nom}</h3>
              {actif.type && (
                <Badge variant="outline" className="text-[10px] py-0 capitalize shrink-0">{actif.type}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {actif.ville && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {actif.ville} {actif.codePostal}
                </span>
              )}
              {actif.surface && (
                <span className="text-xs text-muted-foreground">· {actif.surface} m²</span>
              )}
            </div>
          </div>

          {/* Quick info chips */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Phase 1 status */}
            {phase1.valeurVenale || phase1.valeurLocative ? (
              <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/20">
                <Database className="h-2.5 w-2.5 mr-1" /> DVF/ANIL
              </Badge>
            ) : null}

            {/* AI analysis status */}
            {analyseIA ? (
              <ConfidenceBadge confidence={analyseIA.confidence} />
            ) : (
              <Badge variant="outline" className="text-[10px] py-0 bg-muted text-muted-foreground border-border/50">
                Pas d'analyse IA
              </Badge>
            )}
          </div>

          {/* Chevron */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronDown className="h-5 w-5 text-muted-foreground/50" />
          </motion.div>
        </button>

        {/* Expandable content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="border-t border-border/30 p-5 space-y-6">
                {/* Avertissements */}
                {etude.avertissements && etude.avertissements.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        {etude.avertissements.map((msg, i) => (
                          <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{msg}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Phase 1 — Données officielles */}
                <div>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                      <Database className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <h4 className="text-sm font-bold">Données officielles</h4>
                    <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/20">
                      DVF + ANIL
                    </Badge>
                  </div>
                  <Phase1Block data={phase1} />
                </div>

                {/* Analyse IA */}
                {analyseIA ? (
                  <div className="space-y-6">
                    {/* Header Analyse IA */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20">
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <h4 className="text-sm font-bold">Analyse IA</h4>
                      <ConfidenceBadge confidence={analyseIA.confidence} />
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(analyseIA.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onAnalyse(actif.id); }}
                        disabled={isAnalysing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card px-2.5 py-1.5 text-[10px] font-semibold hover:bg-muted transition-all disabled:opacity-50"
                      >
                        {isAnalysing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Rafraîchir
                      </button>
                    </div>

                    {/* Synthèse */}
                    <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 p-4">
                      <p className="text-sm leading-relaxed">{analyseIA.synthese}</p>
                    </div>

                    {/* Positionnement marché */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Positionnement marché</h5>
                      <PositionnementBlock data={analyseIA.positionnement} />
                    </div>

                    {/* Potentiel */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Potentiel de revalorisation</h5>
                      <PotentielBlock data={analyseIA.potentiel} />
                    </div>

                    {/* Risques */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Risques identifiés</h5>
                      <RisquesBlock risques={analyseIA.risques} />
                    </div>

                    {/* Recommandations */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Recommandations</h5>
                      <RecommandationsBlock recommandations={analyseIA.recommandations} />
                    </div>

                    {/* Comparables */}
                    {analyseIA.comparables && (
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Marché local & comparables</h5>
                        <div className="rounded-xl border border-border/40 bg-card p-4">
                          <p className="text-sm text-muted-foreground leading-relaxed">{analyseIA.comparables}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* No AI analysis yet — CTA */
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-purple-500/30 bg-purple-500/5 p-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg mb-4">
                      <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="text-sm font-bold mb-1">Aucune analyse IA</h4>
                    <p className="text-xs text-muted-foreground text-center max-w-sm mb-4">
                      Lancez l'analyse IA pour obtenir un positionnement marché, des recommandations et une évaluation des risques.
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAnalyse(actif.id); }}
                      disabled={isAnalysing}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:shadow-xl disabled:opacity-50"
                    >
                      {isAnalysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Analyser cet actif
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function EtudeMarche() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [analysingId, setAnalysingId] = useState<string | null>(null);

  const { data: etudes = [], isLoading, isError, error } = useQuery<EtudeActif[]>({
    queryKey: ["/api/am/marche/etude"],
    queryFn: () => apiRequest("/api/am/marche/etude"),
  });

  // Phase 1 sync (DVF + ANIL + taux capi)
  const syncPhase1Mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/am/marche/sync-dvf", { method: "POST" });
      await apiRequest("/api/am/marche/sync-anil", { method: "POST" });
      await apiRequest("/api/am/marche/compute-taux-capi", { method: "POST" });
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
    },
  });

  // Analyse IA — all assets
  const analyseAllMutation = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/analyse-ia", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
    },
  });

  // Analyse IA — single asset
  const analyseSingleMutation = useMutation({
    mutationFn: (actifId: string) => apiRequest(`/api/am/marche/analyse-ia/${actifId}`, { method: "POST" }),
    onSuccess: () => {
      setAnalysingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
    },
    onError: () => {
      setAnalysingId(null);
    },
  });

  function handleAnalyseSingle(actifId: string) {
    setAnalysingId(actifId);
    analyseSingleMutation.mutate(actifId);
  }

  const isSyncing = syncPhase1Mutation.isPending || analyseAllMutation.isPending;

  // Filter
  const types = [...new Set(etudes.map((e) => e.actif.type).filter(Boolean))];
  const filtered = filter === "all" ? etudes : etudes.filter((e) => e.actif.type === filter);

  // Summary KPIs
  const actifsWithP1 = etudes.filter((e) => e.phase1.valeurVenale || e.phase1.valeurLocative).length;
  const actifsWithIA = etudes.filter((e) => e.analyseIA != null).length;
  const avgTauxCapi = (() => {
    const vals = etudes.map((e) => e.phase1.tauxCapi?.taux).filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader
        title="Étude de marché"
        description="Analyse comparative par actif — données officielles (DVF/ANIL) et analyse IA"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => syncPhase1Mutation.mutate()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-card px-4 py-2.5 text-sm font-semibold transition-all hover:bg-muted hover:shadow-sm disabled:opacity-50"
            >
              {syncPhase1Mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4 text-blue-500" />
              )}
              Sync DVF + ANIL
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => analyseAllMutation.mutate()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:shadow-xl disabled:opacity-50"
            >
              {analyseAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyseAllMutation.isPending ? "Analyse en cours..." : "Analyser tous les actifs"}
            </motion.button>
          </div>
        }
      />

      {/* Status messages */}
      <AnimatePresence>
        {syncPhase1Mutation.isSuccess && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Données officielles synchronisées avec succès — DVF, ANIL et taux de capitalisation mis à jour.
            </p>
          </motion.div>
        )}
        {analyseAllMutation.isSuccess && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Analyse IA terminée pour tous les actifs.
            </p>
          </motion.div>
        )}
        {(syncPhase1Mutation.isError || analyseAllMutation.isError) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Erreur : {(syncPhase1Mutation.error as Error)?.message || (analyseAllMutation.error as Error)?.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary KPIs */}
      {etudes.length > 0 && (
        <Section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Actifs analysés" value={etudes.length} icon={Building2} variant="primary" gradient delay={0} />
            <KpiCard
              label="Couverture DVF/ANIL"
              value={actifsWithP1}
              icon={Database}
              variant={actifsWithP1 > 0 ? "success" : "danger"}
              delay={1}
              subtitle={etudes.length > 0 ? `${Math.round((actifsWithP1 / etudes.length) * 100)}% du portefeuille` : undefined}
            />
            <KpiCard
              label="Analyses IA"
              value={actifsWithIA}
              icon={Sparkles}
              variant={actifsWithIA > 0 ? "success" : "danger"}
              delay={2}
              subtitle={etudes.length > 0 ? `${Math.round((actifsWithIA / etudes.length) * 100)}% du portefeuille` : undefined}
            />
            <KpiCard
              label="Taux capi moyen"
              value={avgTauxCapi || 0}
              formatFn={(n) => n > 0 ? formatPercent(n) : "—"}
              icon={TrendingUp}
              variant={avgTauxCapi && avgTauxCapi > 4 ? "success" : avgTauxCapi && avgTauxCapi > 2 ? "warning" : "primary"}
              gradient
              delay={3}
            />
          </div>
        </Section>
      )}

      {/* Filter bar */}
      {types.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={() => setFilter("all")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold border transition-all ${
              filter === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card border-border/50 hover:bg-muted hover:border-border"
            }`}
          >
            Tous ({etudes.length})
          </button>
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type!)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold border transition-all capitalize ${
                filter === type
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border/50 hover:bg-muted hover:border-border"
              }`}
            >
              {type} ({etudes.filter((e) => e.actif.type === type).length})
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Chargement des études de marché...</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg mb-5">
              <AlertTriangle className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-lg font-bold">Erreur de chargement</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              {(error as Error)?.message || "Impossible de charger les études de marché. Veuillez réessayer."}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
          </div>
        </GlassCard>
      )}

      {/* Empty state */}
      {!isLoading && !isError && etudes.length === 0 && (
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 shadow-lg mb-5">
              <Search className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-lg font-bold">Aucun actif à analyser</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Ajoutez des actifs avec une adresse et un code postal pour lancer l'étude de marché.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Actif cards */}
      <div className="space-y-3">
        {filtered.map((etude, i) => (
          <ActifCard
            key={etude.actif.id}
            etude={etude}
            index={i}
            onAnalyse={handleAnalyseSingle}
            isAnalysing={analysingId === etude.actif.id && analyseSingleMutation.isPending}
          />
        ))}
      </div>
    </motion.div>
  );
}
