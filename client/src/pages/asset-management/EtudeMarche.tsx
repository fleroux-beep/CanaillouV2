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
  Home, Store, Briefcase, Loader2, BarChart3,
  Globe, Eye, Layers, ArrowRight, CheckCircle2, XCircle,
  ShieldCheck, ShieldAlert, Info, Target,
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

interface Phase2Entry {
  source: string;
  prixM2Median?: number | null;
  prixM2Bas?: number | null;
  prixM2Haut?: number | null;
  loyerM2Median?: number | null;
  loyerM2Bas?: number | null;
  loyerM2Haut?: number | null;
  nbAnnonces: number | null;
  tauxCapiDeduit?: number | null;
  notes: string | null;
  dateReleve: string | null;
}

interface Phase2Data {
  vente: Phase2Entry[];
  location: Phase2Entry[];
  tauxCapiMoyen: number | null;
  dateReleve: string | null;
}

type NoteConfiance = "A" | "B" | "C" | "D" | "E";

interface SourceAnalysee {
  source: string;
  valeur: number;
  nbAnnonces: number;
  poids: number;
  outlier: boolean;
  rayonKm: number;
}

interface EstimationAnalyse {
  valeurConsolidee: number;
  valeurBasse: number;
  valeurHaute: number;
  nbSources: number;
  nbAnnoncesTotal: number;
  scoreConfiance: number;
  noteConfiance: NoteConfiance;
  explicationConfiance: string;
  sources: SourceAnalysee[];
}

interface AnalyseData {
  vente: EstimationAnalyse | null;
  location: EstimationAnalyse | null;
  tauxCapiConsolide: number | null;
  tauxCapiConfiance: number | null;
  tauxCapiNote: NoteConfiance | null;
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
  lat: number | null;
  lng: number | null;
  tauxCapitalisation: string | null;
  prixM2Marche: string | null;
}

interface EtudeActif {
  actif: ActifInfo;
  avertissements?: string[];
  phase1: Phase1Data;
  phase2: Phase2Data;
  analyse?: AnalyseData;
}

// ============================================================
// Helpers
// ============================================================

const SOURCE_META: Record<string, { label: string; color: string; dot: string }> = {
  meilleursagents: { label: "MeilleursAgents", color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20", dot: "bg-indigo-500" },
  leboncoin: { label: "LeBonCoin", color: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20", dot: "bg-orange-500" },
  seloger: { label: "SeLoger", color: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20", dot: "bg-red-500" },
  seloger_bc: { label: "SeLoger B&C", color: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20", dot: "bg-rose-500" },
  pap: { label: "PAP", color: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20", dot: "bg-sky-500" },
  bureauxlocaux: { label: "BureauxLocaux", color: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20", dot: "bg-teal-500" },
};

function sourceLabel(source: string): string {
  return SOURCE_META[source]?.label || source;
}

function sourceBadge(source: string) {
  const meta = SOURCE_META[source] || { color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {sourceLabel(source)}
    </span>
  );
}

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

function Phase2Table({ entries, mode }: { entries: Phase2Entry[]; mode: "vente" | "location" }) {
  if (entries.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      <div className="bg-muted/30 px-4 py-2.5 border-b border-border/30">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {mode === "vente" ? "Annonces en vente" : "Annonces en location"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-muted/10">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plateforme</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Médian</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fourchette</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Annonces</th>
              {mode === "vente" && (
                <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Taux capi</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {entries.map((entry, i) => (
              <tr key={i} className="hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3">{sourceBadge(entry.source)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {mode === "vente" ? fmtPrix(entry.prixM2Median) : fmtLoyer(entry.loyerM2Median)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums">
                  {mode === "vente"
                    ? `${fmtPrix(entry.prixM2Bas)} — ${fmtPrix(entry.prixM2Haut)}`
                    : `${fmtLoyer(entry.loyerM2Bas)} — ${fmtLoyer(entry.loyerM2Haut)}`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.nbAnnonces || "—"}</td>
                {mode === "vente" && (
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtTaux(entry.tauxCapiDeduit)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Analyse / Confiance components
// ============================================================

const NOTE_STYLES: Record<NoteConfiance, { bg: string; text: string; border: string; ring: string }> = {
  A: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", ring: "ring-emerald-500/20" },
  B: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30", ring: "ring-blue-500/20" },
  C: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30", ring: "ring-amber-500/20" },
  D: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30", ring: "ring-orange-500/20" },
  E: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/30", ring: "ring-red-500/20" },
};

function ConfidenceBadge({ note, score }: { note: NoteConfiance; score: number }) {
  const style = NOTE_STYLES[note];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${style.bg} ${style.text} ${style.border}`}>
      {note === "A" || note === "B" ? (
        <ShieldCheck className="h-3.5 w-3.5" />
      ) : (
        <ShieldAlert className="h-3.5 w-3.5" />
      )}
      {note} · {score}/100
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : score >= 40 ? "bg-amber-500" : score >= 20 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-8 text-right">{score}%</span>
    </div>
  );
}

function AnalyseBlock({ analyse, mode }: { analyse: EstimationAnalyse; mode: "vente" | "location" }) {
  const isVente = mode === "vente";
  const fmt = isVente ? fmtPrix : fmtLoyer;
  const style = NOTE_STYLES[analyse.noteConfiance];

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Target className={`h-4 w-4 ${style.text}`} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Estimation consolidée {isVente ? "vente" : "location"}
            </p>
            <p className="text-xl font-bold tracking-tight mt-0.5">{fmt(analyse.valeurConsolidee)}</p>
          </div>
        </div>
        <ConfidenceBadge note={analyse.noteConfiance} score={analyse.scoreConfiance} />
      </div>

      {/* Fourchette + stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card/50 border border-border/30 px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">Fourchette</p>
          <p className="text-xs font-bold mt-0.5">{fmt(analyse.valeurBasse)} — {fmt(analyse.valeurHaute)}</p>
        </div>
        <div className="rounded-lg bg-card/50 border border-border/30 px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">Sources valides</p>
          <p className="text-xs font-bold mt-0.5">{analyse.nbSources} source{analyse.nbSources > 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-lg bg-card/50 border border-border/30 px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">Annonces</p>
          <p className="text-xs font-bold mt-0.5">{analyse.nbAnnoncesTotal} annonce{analyse.nbAnnoncesTotal > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Barre de confiance */}
      <ConfidenceBar score={analyse.scoreConfiance} />

      {/* Explication */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>{analyse.explicationConfiance}</p>
      </div>

      {/* Sources avec poids et outliers */}
      {analyse.sources.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Détail des sources</p>
          {analyse.sources.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs ${s.outlier ? "opacity-40 line-through" : ""}`}>
              {sourceBadge(s.source)}
              <span className="font-bold tabular-nums">{fmt(s.valeur)}</span>
              <span className="text-muted-foreground">· {s.nbAnnonces} ann.</span>
              <span className="text-muted-foreground">· poids {Math.round(s.poids * 100)}%</span>
              {s.outlier && (
                <span className="text-red-500 text-[10px] font-medium no-underline">outlier exclu</span>
              )}
              {s.rayonKm > 5 && !s.outlier && (
                <span className="text-amber-500 text-[10px]">rayon {s.rayonKm}km</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Phase2Block({ data }: { data: Phase2Data }) {
  const hasData = data.vente.length > 0 || data.location.length > 0;

  if (!hasData) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/20 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
          <Globe className="h-5 w-5 text-purple-500" />
        </div>
        <div>
          <p className="text-sm font-medium">Aucune donnée de marché collectée</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lancez la synchronisation Phase 2 pour scraper les plateformes immobilières.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Phase2Table entries={data.vente} mode="vente" />
      <Phase2Table entries={data.location} mode="location" />
      {data.tauxCapiMoyen != null && (
        <div className="inline-flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-2.5">
          <BarChart3 className="h-4 w-4 text-purple-500" />
          <span className="text-xs font-medium text-muted-foreground">Taux capi. moyen Phase 2 :</span>
          <span className="text-sm font-bold">{fmtTaux(data.tauxCapiMoyen)}</span>
        </div>
      )}
    </div>
  );
}

function SyntheseBlock({ phase1, phase2, analyse }: { phase1: Phase1Data; phase2: Phase2Data; analyse?: AnalyseData }) {
  const p1Prix = phase1.valeurVenale?.prixM2Median;
  const p1Loyer = phase1.valeurLocative?.loyerM2Median;
  const p1Taux = phase1.tauxCapi?.taux;

  // Utiliser les valeurs consolidées de l'analyse si disponible, sinon fallback sur la moyenne simple
  const p2Prix = analyse?.vente?.valeurConsolidee ?? (
    phase2.vente.filter((v) => v.prixM2Median).length > 0
      ? Math.round(phase2.vente.filter((v) => v.prixM2Median).reduce((sum, v) => sum + (v.prixM2Median || 0), 0) / phase2.vente.filter((v) => v.prixM2Median).length)
      : null
  );

  const p2Loyer = analyse?.location?.valeurConsolidee ?? (
    phase2.location.filter((l) => l.loyerM2Median).length > 0
      ? Math.round(phase2.location.filter((l) => l.loyerM2Median).reduce((sum, l) => sum + (l.loyerM2Median || 0), 0) / phase2.location.filter((l) => l.loyerM2Median).length * 100) / 100
      : null
  );

  const p2Taux = analyse?.tauxCapiConsolide ?? phase2.tauxCapiMoyen;

  const comparisons = [
    { label: "Valeur vénale", p1: p1Prix, p2: p2Prix, fmt: fmtPrix, icon: Building2 },
    { label: "Valeur locative", p1: p1Loyer, p2: p2Loyer, fmt: fmtLoyer, icon: Home },
    { label: "Taux de capitalisation", p1: p1Taux, p2: p2Taux, fmt: fmtTaux, icon: BarChart3, suffix: " pts" },
  ].filter((c) => c.p1 && c.p2);

  if (comparisons.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/30 to-muted/10 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-orange-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Synthèse — Écart Phase 1 vs Phase 2
          </h4>
        </div>
      </div>
      <div className="p-5">
        <div className={`grid grid-cols-1 gap-4 ${comparisons.length >= 3 ? "sm:grid-cols-3" : comparisons.length === 2 ? "sm:grid-cols-2" : ""}`}>
          {comparisons.map((c, i) => {
            const diff = c.suffix
              ? (c.p2! - c.p1!)
              : ((c.p2! - c.p1!) / c.p1!) * 100;
            const diffLabel = c.suffix
              ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}${c.suffix}`
              : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
            const isUp = diff > 0;
            const isSmall = Math.abs(diff) < 5;

            return (
              <div key={i} className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card border border-border/40">
                  <c.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-medium text-muted-foreground">{c.fmt(c.p1)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <span className="text-sm font-bold">{c.fmt(c.p2)}</span>
                  </div>
                </div>
                <div className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                  isSmall ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : isUp ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                  {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {diffLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActifCard({ etude, index }: { etude: EtudeActif; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { actif, phase1, phase2, analyse } = etude;
  const Icon = typeIcon(actif.type);
  const gradient = typeGradient(actif.type);

  const hasP1 = !!(phase1.valeurVenale || phase1.valeurLocative || phase1.tauxCapi);
  const hasP2 = phase2.vente.length > 0 || phase2.location.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <GlassCard hover={false} className="overflow-hidden !p-0">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-4 p-5 text-left hover:bg-muted/20 transition-colors"
        >
          {/* Icon with gradient */}
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
            <Icon className="h-5 w-5 text-white" />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold truncate">{actif.nom}</h3>
              {actif.type && (
                <Badge variant="outline" className="text-[10px] py-0 shrink-0 capitalize">
                  {actif.type}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[actif.adresse, actif.ville, actif.codePostal].filter(Boolean).join(", ") || "—"}
              </span>
              {actif.surface && (
                <span className="text-muted-foreground/60">·</span>
              )}
              {actif.surface && (
                <span>{Number(actif.surface).toFixed(0)} m²</span>
              )}
            </div>
          </div>

          {/* Status indicators + Quick KPIs */}
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            {/* Phase 1 status */}
            <div className="flex items-center gap-1.5">
              {hasP1 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <span className="text-[10px] font-medium text-muted-foreground">P1</span>
            </div>
            {/* Phase 2 status */}
            <div className="flex items-center gap-1.5">
              {hasP2 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <span className="text-[10px] font-medium text-muted-foreground">P2</span>
            </div>

            {/* Quick taux capi */}
            {(phase1.tauxCapi || phase2.tauxCapiMoyen || analyse?.tauxCapiConsolide) && (
              <div className="border-l border-border/40 pl-4">
                <p className="text-[10px] text-muted-foreground">Taux capi</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold tabular-nums">
                    {fmtTaux(phase1.tauxCapi?.taux || analyse?.tauxCapiConsolide || phase2.tauxCapiMoyen)}
                  </p>
                  {analyse?.tauxCapiNote && (
                    <span className={`text-[10px] font-bold ${NOTE_STYLES[analyse.tauxCapiNote].text}`}>
                      {analyse.tauxCapiNote}
                    </span>
                  )}
                </div>
              </div>
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
                {/* Avertissements sur la compatibilité des données */}
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

                {/* Phase 1 */}
                <div>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                      <Database className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <h4 className="text-sm font-bold">Phase 1 — Données officielles</h4>
                    <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/20">
                      DVF + ANIL
                    </Badge>
                  </div>
                  <Phase1Block data={phase1} />
                </div>

                {/* Phase 2 */}
                <div>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                      <Globe className="h-3.5 w-3.5 text-purple-500" />
                    </div>
                    <h4 className="text-sm font-bold">Phase 2 — Plateformes immobilières</h4>
                    <Badge variant="outline" className="text-[10px] py-0 bg-purple-500/5 text-purple-600 dark:text-purple-400 border-purple-500/20">
                      6 sources
                    </Badge>
                    {phase2.dateReleve && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        Relevé du {new Date(phase2.dateReleve).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                  <Phase2Block data={phase2} />
                </div>

                {/* Analyse intelligente */}
                {analyse && (analyse.vente || analyse.location) && (
                  <div>
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <h4 className="text-sm font-bold">Analyse consolidée</h4>
                      <Badge variant="outline" className="text-[10px] py-0 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        Pondération intelligente
                      </Badge>
                      {analyse.tauxCapiConsolide != null && analyse.tauxCapiNote && (
                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Taux capi consolidé :</span>
                          <span className="text-sm font-bold">{fmtTaux(analyse.tauxCapiConsolide)}</span>
                          <ConfidenceBadge note={analyse.tauxCapiNote} score={analyse.tauxCapiConfiance!} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {analyse.vente && <AnalyseBlock analyse={analyse.vente} mode="vente" />}
                      {analyse.location && <AnalyseBlock analyse={analyse.location} mode="location" />}
                    </div>
                  </div>
                )}

                {/* Synthèse */}
                <SyntheseBlock phase1={phase1} phase2={phase2} analyse={analyse} />
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

  const { data: etudes = [], isLoading, isError, error } = useQuery<EtudeActif[]>({
    queryKey: ["/api/am/marche/etude"],
    queryFn: () => apiRequest("/api/am/marche/etude"),
  });

  const syncScrapingMutation = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/sync-scraping", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
    },
  });

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

  // Filter
  const types = [...new Set(etudes.map((e) => e.actif.type).filter(Boolean))];
  const filtered = filter === "all" ? etudes : etudes.filter((e) => e.actif.type === filter);

  const isSyncing = syncScrapingMutation.isPending || syncPhase1Mutation.isPending;

  // Summary KPIs
  const actifsWithP1 = etudes.filter((e) => e.phase1.valeurVenale || e.phase1.valeurLocative).length;
  const actifsWithP2 = etudes.filter((e) => e.phase2.vente.length > 0 || e.phase2.location.length > 0).length;
  const avgTauxCapi = (() => {
    const vals = etudes
      .map((e) => e.phase1.tauxCapi?.taux || e.phase2.tauxCapiMoyen)
      .filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader
        title="Étude de marché"
        description="Analyse comparative par actif — données officielles (DVF/ANIL) et plateformes immobilières"
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
              Phase 1 (DVF + ANIL)
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => syncScrapingMutation.mutate()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:shadow-xl disabled:opacity-50"
            >
              {syncScrapingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Phase 2 (scraping)
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
              Phase 1 synchronisée avec succès — données DVF, ANIL et taux de capitalisation mis à jour.
            </p>
          </motion.div>
        )}
        {syncScrapingMutation.isSuccess && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Phase 2 synchronisée — {(syncScrapingMutation.data as any)?.scraped || 0} résultats collectés pour {(syncScrapingMutation.data as any)?.total || 0} actifs.
            </p>
          </motion.div>
        )}
        {(syncPhase1Mutation.isError || syncScrapingMutation.isError) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Erreur : {(syncPhase1Mutation.error || syncScrapingMutation.error)?.message}
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
              label="Couverture Phase 1"
              value={actifsWithP1}
              icon={Database}
              variant={actifsWithP1 > 0 ? "success" : "danger"}
              delay={1}
              subtitle={etudes.length > 0 ? `${Math.round((actifsWithP1 / etudes.length) * 100)}% du portefeuille` : undefined}
            />
            <KpiCard
              label="Couverture Phase 2"
              value={actifsWithP2}
              icon={Globe}
              variant={actifsWithP2 > 0 ? "success" : "danger"}
              delay={2}
              subtitle={etudes.length > 0 ? `${Math.round((actifsWithP2 / etudes.length) * 100)}% du portefeuille` : undefined}
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
          <p className="text-sm text-muted-foreground">Chargement des études de marché…</p>
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
              Ajoutez des actifs avec une adresse, un code postal et des coordonnées GPS pour lancer l'étude de marché.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Actif cards */}
      <div className="space-y-3">
        {filtered.map((etude, i) => (
          <ActifCard key={etude.actif.id} etude={etude} index={i} />
        ))}
      </div>
    </motion.div>
  );
}
