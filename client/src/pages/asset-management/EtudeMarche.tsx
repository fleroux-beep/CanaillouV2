import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency } from "../../lib/utils";
import { PageHeader } from "../../components/ui/page-header";
import { GlassCard } from "../../components/ui/glass-card";
import { KpiCard } from "../../components/ui/kpi-card";
import { Badge } from "../../components/ui/badge";
import { Section } from "../../components/ui/section";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
  RefreshCw, Building2, MapPin, TrendingUp, TrendingDown,
  Database, AlertTriangle, Home, Store, Briefcase, Loader2,
  Sparkles, ShieldCheck, Target, ArrowUpRight, ArrowDownRight,
  Minus, Zap, Shield, ArrowLeft, BarChart3, Eye,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface Phase1Data {
  valeurVenale: { prixM2Median: number; prixM2Bas: number; prixM2Haut: number; nbTransactions: number | null; periode: string | null; source: string } | null;
  valeurLocative: { loyerM2Median: number; loyerM2Bas: number; loyerM2Haut: number; periode: string | null; source: string } | null;
  tauxCapi: { taux: number; tauxBas: number; tauxHaut: number; fiabilite: string | null; methode: string | null } | null;
}

interface InternalMetrics {
  surface: number; prixAcq: number; prixM2: number;
  loyerAnnuel: number; loyerM2Mensuel: number; rendementBrut: number;
  tauxCapiInterne: number | null; ecartPrixPct: number | null; ecartLoyerPct: number | null;
  nbLots: number; lotsOccupes: number; tauxOccupation: number;
}

interface AnalyseIA {
  id: string;
  positionnement: { loyerVsMarche: string; ecartLoyerPct: number; prixVsMarche: string; ecartPrixPct: number; commentaire: string };
  potentiel: { margeLoyer: number; plusValue: number; horizonAns: number; commentaire: string };
  risques: Array<{ type: string; niveau: "faible" | "modéré" | "élevé"; description: string }>;
  recommandations: Array<{ action: string; priorite: "haute" | "moyenne" | "basse"; impact: string; detail: string }>;
  comparables: string;
  synthese: string;
  confidence: "A" | "B" | "C" | "D" | "E";
  model: string;
  createdAt: string;
}

interface EtudeActif {
  actif: { id: string; nom: string; adresse: string | null; ville: string | null; codePostal: string | null; type: string | null; surface: string | null; surfaceCarrez: string | null; dpe: string | null };
  avertissements?: string[];
  phase1: Phase1Data;
  interne: InternalMetrics;
  analyseIA: AnalyseIA | null;
}

// ============================================================
// Helpers
// ============================================================

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

function ecartBadge(pct: number | null) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const isPositive = pct > 2;
  const isNegative = pct < -2;
  const color = isPositive ? "text-red-500 bg-red-500/10" : isNegative ? "text-emerald-600 bg-emerald-500/10" : "text-muted-foreground bg-muted/50";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${color}`}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function ecartLoyerBadge(pct: number | null) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const isPositive = pct > 2;
  const isNegative = pct < -2;
  // For rent: above market = good (you're earning more)
  const color = isPositive ? "text-emerald-600 bg-emerald-500/10" : isNegative ? "text-red-500 bg-red-500/10" : "text-muted-foreground bg-muted/50";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${color}`}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "Très fiable" },
  B: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400", label: "Fiable" },
  C: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "Indicatif" },
  D: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400", label: "Fragile" },
  E: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400", label: "Insuffisant" },
};

const RISQUE_ICONS: Record<string, typeof Shield> = {
  vacance: Building2, obsolescence_energetique: Zap, marche: TrendingDown,
  reglementaire: Shield, structural: AlertTriangle, fiscal: Target,
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

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const style = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.E;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border ${style.bg} ${style.text}`}>
      <ShieldCheck className="h-3 w-3" />
      {confidence} — {style.label}
    </span>
  );
}

function DataMetric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "blue" | "emerald" | "amber" | "purple" }) {
  const gradients = { blue: "from-blue-500 to-indigo-500", emerald: "from-emerald-500 to-teal-500", amber: "from-amber-500 to-orange-500", purple: "from-purple-500 to-violet-500" };
  const gradient = accent ? gradients[accent] : "from-gray-500 to-gray-600";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card p-4">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${gradient}`} />
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function SyncActions({ syncing, onSync, analysingAll, onAnalyseAll }: {
  syncing: boolean; onSync: () => void; analysingAll: boolean; onAnalyseAll: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={syncing}
        onClick={onSync}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50">
        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
        Sync DVF + ANIL
      </motion.button>
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={analysingAll}
        onClick={onAnalyseAll}
        className="flex items-center gap-2 rounded-lg gradient-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50">
        {analysingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Analyser tous les actifs
      </motion.button>
    </div>
  );
}

// ============================================================
// Tab 1: Portfolio View
// ============================================================

function PortfolioTab({ data, onSelectActif }: { data: EtudeActif[]; onSelectActif: (id: string) => void }) {
  const columns: Column<EtudeActif>[] = [
    {
      key: "nom", label: "Actif", sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-sm">{r.actif.nom}</p>
          {r.actif.ville && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{r.actif.ville}{r.actif.codePostal ? ` (${r.actif.codePostal})` : ""}</p>}
        </div>
      ),
    },
    {
      key: "type", label: "Type", sortable: true,
      render: (r) => r.actif.type ? <Badge>{r.actif.type}</Badge> : "—",
    },
    {
      key: "prixM2Marche", label: "Prix/m² marché", sortable: true, align: "right",
      render: (r) => fmtPrix(r.phase1.valeurVenale?.prixM2Median),
      exportValue: (r) => r.phase1.valeurVenale?.prixM2Median || 0,
    },
    {
      key: "prixM2Interne", label: "Prix/m² achat", sortable: true, align: "right",
      render: (r) => r.interne.prixM2 > 0 ? fmtPrix(r.interne.prixM2) : "—",
      exportValue: (r) => r.interne.prixM2 || 0,
    },
    {
      key: "ecartPrix", label: "Ecart prix", sortable: true, align: "center",
      render: (r) => ecartBadge(r.interne.ecartPrixPct),
      exportValue: (r) => r.interne.ecartPrixPct ?? 0,
    },
    {
      key: "loyerM2Marche", label: "Loyer/m² marché", sortable: true, align: "right",
      render: (r) => fmtLoyer(r.phase1.valeurLocative?.loyerM2Median),
      exportValue: (r) => r.phase1.valeurLocative?.loyerM2Median || 0,
    },
    {
      key: "loyerM2Interne", label: "Loyer/m² réel", sortable: true, align: "right",
      render: (r) => r.interne.loyerM2Mensuel > 0 ? fmtLoyer(r.interne.loyerM2Mensuel) : "—",
      exportValue: (r) => r.interne.loyerM2Mensuel || 0,
    },
    {
      key: "ecartLoyer", label: "Ecart loyer", sortable: true, align: "center",
      render: (r) => ecartLoyerBadge(r.interne.ecartLoyerPct),
      exportValue: (r) => r.interne.ecartLoyerPct ?? 0,
    },
    {
      key: "tauxCapi", label: "Taux capi", sortable: true, align: "right",
      render: (r) => {
        const marche = r.phase1.tauxCapi?.taux;
        const interne = r.interne.tauxCapiInterne;
        if (marche) return <span title="Taux marché (DVF/ANIL)">{fmtTaux(marche)}</span>;
        if (interne) return <span className="text-muted-foreground" title="Rendement interne">{fmtTaux(interne)}</span>;
        return "—";
      },
      exportValue: (r) => r.phase1.tauxCapi?.taux || r.interne.tauxCapiInterne || 0,
    },
    {
      key: "confidence", label: "IA", sortable: true, align: "center",
      render: (r) => r.analyseIA ? <ConfidenceBadge confidence={r.analyseIA.confidence} /> : <span className="text-xs text-muted-foreground">—</span>,
      exportValue: (r) => r.analyseIA?.confidence || "",
    },
  ];

  // KPI summary
  const totalActifs = data.length;
  const withDVF = data.filter((d) => d.phase1.valeurVenale).length;
  const withIA = data.filter((d) => d.analyseIA).length;
  const avgTauxCapi = (() => {
    const taux = data.map((d) => d.phase1.tauxCapi?.taux || d.interne.tauxCapiInterne).filter((t): t is number => t != null && t > 0);
    return taux.length > 0 ? taux.reduce((a, b) => a + b, 0) / taux.length : 0;
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Actifs" value={totalActifs} icon={Building2} />
        <KpiCard title="Couverture DVF" value={`${withDVF}/${totalActifs}`} subtitle={totalActifs > 0 ? `${Math.round((withDVF / totalActifs) * 100)}%` : ""} icon={Database} />
        <KpiCard title="Analyses IA" value={`${withIA}/${totalActifs}`} subtitle={totalActifs > 0 ? `${Math.round((withIA / totalActifs) * 100)}%` : ""} icon={Sparkles} />
        <KpiCard title="Taux capi moyen" value={avgTauxCapi > 0 ? fmtTaux(avgTauxCapi) : "—"} icon={TrendingUp} />
      </div>

      <DataTable
        data={data}
        columns={columns}
        searchKeys={["actif.nom", "actif.ville", "actif.type"]}
        searchPlaceholder="Rechercher un actif..."
        emptyMessage="Aucun actif. Ajoutez des actifs dans la section Asset Management."
        onRowClick={(r) => onSelectActif(r.actif.id)}
        exportFileName="etude-marche"
      />
    </div>
  );
}

// ============================================================
// Tab 2: Asset Detail View (Fiche)
// ============================================================

function FicheActifTab({ item, onBack, onAnalyse, analysing }: {
  item: EtudeActif; onBack: () => void; onAnalyse: (id: string) => void; analysing: boolean;
}) {
  const { actif, phase1, interne, analyseIA, avertissements } = item;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-border/40 bg-card hover:bg-muted/50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </motion.button>
          <div>
            <h2 className="text-lg font-bold">{actif.nom}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {actif.ville && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{actif.ville}</span>}
              {actif.type && <Badge variant="secondary">{actif.type}</Badge>}
              {actif.dpe && <Badge variant="secondary">DPE {actif.dpe}</Badge>}
            </div>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={analysing}
          onClick={() => onAnalyse(actif.id)}
          className="flex items-center gap-2 rounded-lg gradient-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50">
          {analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {analyseIA ? "Rafraîchir l'analyse" : "Lancer l'analyse IA"}
        </motion.button>
      </div>

      {/* Warnings */}
      {avertissements && avertissements.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
            {avertissements.map((a, i) => <p key={i}>{a}</p>)}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Market data + Internal metrics */}
        <div className="space-y-4">
          <Section title="Données de marché (DVF / ANIL)" icon={Database}>
            <div className="space-y-3">
              <DataMetric label="Valeur vénale (DVF)" value={fmtPrix(phase1.valeurVenale?.prixM2Median)}
                sub={phase1.valeurVenale ? `${fmtPrix(phase1.valeurVenale.prixM2Bas)} — ${fmtPrix(phase1.valeurVenale.prixM2Haut)}${phase1.valeurVenale.nbTransactions ? ` · ${phase1.valeurVenale.nbTransactions} tx` : ""}` : "Aucune donnée DVF"} accent="blue" />
              <DataMetric label="Valeur locative (ANIL)" value={fmtLoyer(phase1.valeurLocative?.loyerM2Median)}
                sub={phase1.valeurLocative ? `${fmtLoyer(phase1.valeurLocative.loyerM2Bas)} — ${fmtLoyer(phase1.valeurLocative.loyerM2Haut)}` : "Aucune donnée ANIL"} accent="emerald" />
              <DataMetric label="Taux capitalisation marché" value={fmtTaux(phase1.tauxCapi?.taux)}
                sub={phase1.tauxCapi ? `${fmtTaux(phase1.tauxCapi.tauxBas)} — ${fmtTaux(phase1.tauxCapi.tauxHaut)} · Fiabilité ${phase1.tauxCapi.fiabilite || "n/a"}` : "Non calculable (nécessite DVF + ANIL)"} accent="amber" />
            </div>
          </Section>

          <Section title="Métriques internes" icon={BarChart3}>
            <div className="grid grid-cols-2 gap-3">
              <DataMetric label="Prix/m² d'achat" value={interne.prixM2 > 0 ? fmtPrix(interne.prixM2) : "—"} sub={interne.ecartPrixPct != null ? `${interne.ecartPrixPct > 0 ? "+" : ""}${interne.ecartPrixPct.toFixed(1)}% vs marché` : undefined} />
              <DataMetric label="Loyer/m² réel" value={interne.loyerM2Mensuel > 0 ? fmtLoyer(interne.loyerM2Mensuel) : "—"} sub={interne.ecartLoyerPct != null ? `${interne.ecartLoyerPct > 0 ? "+" : ""}${interne.ecartLoyerPct.toFixed(1)}% vs marché` : undefined} />
              <DataMetric label="Rendement brut" value={interne.rendementBrut > 0 ? fmtTaux(interne.rendementBrut) : "—"} accent="purple" />
              <DataMetric label="Occupation" value={`${interne.tauxOccupation}%`} sub={`${interne.lotsOccupes}/${interne.nbLots} lots`} />
            </div>
          </Section>
        </div>

        {/* Right: AI Analysis */}
        <div className="space-y-4">
          {analyseIA ? (
            <>
              <Section title="Analyse IA" icon={Sparkles}
                actions={<ConfidenceBadge confidence={analyseIA.confidence} />}>
                {/* Synthèse */}
                <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-4 mb-4">
                  <p className="text-sm leading-relaxed">{analyseIA.synthese}</p>
                </div>

                {/* Positionnement */}
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Positionnement</h4>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 p-3">
                    {analyseIA.positionnement.ecartLoyerPct > 2 ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> :
                     analyseIA.positionnement.ecartLoyerPct < -2 ? <ArrowDownRight className="h-4 w-4 text-red-500" /> :
                     <Minus className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Loyer</p>
                      <p className="text-sm font-bold">{analyseIA.positionnement.ecartLoyerPct > 0 ? "+" : ""}{analyseIA.positionnement.ecartLoyerPct}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 p-3">
                    {analyseIA.positionnement.ecartPrixPct < -2 ? <ArrowDownRight className="h-4 w-4 text-emerald-500" /> :
                     analyseIA.positionnement.ecartPrixPct > 2 ? <ArrowUpRight className="h-4 w-4 text-red-500" /> :
                     <Minus className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prix</p>
                      <p className="text-sm font-bold">{analyseIA.positionnement.ecartPrixPct > 0 ? "+" : ""}{analyseIA.positionnement.ecartPrixPct}%</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4">{analyseIA.positionnement.commentaire}</p>

                {/* Potentiel */}
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Potentiel</h4>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <DataMetric label="Marge loyer" value={`+${analyseIA.potentiel.margeLoyer}%`} accent="emerald" />
                  <DataMetric label="Plus-value" value={`+${analyseIA.potentiel.plusValue}%`} accent="blue" />
                  <DataMetric label="Horizon" value={`${analyseIA.potentiel.horizonAns} ans`} accent="purple" />
                </div>
                <p className="text-xs text-muted-foreground mb-4">{analyseIA.potentiel.commentaire}</p>

                {/* Risques */}
                {analyseIA.risques.length > 0 && (
                  <>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Risques</h4>
                    <div className="space-y-2 mb-4">
                      {analyseIA.risques.map((r, i) => {
                        const Icon = RISQUE_ICONS[r.type] || AlertTriangle;
                        const color = RISQUE_COLORS[r.niveau] || RISQUE_COLORS["modéré"];
                        return (
                          <div key={i} className={`flex items-start gap-2 rounded-lg border p-3 ${color}`}>
                            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="text-xs">
                              <span className="font-bold capitalize">{r.niveau}</span>
                              <span className="mx-1">·</span>
                              <span className="capitalize">{r.type.replace("_", " ")}</span>
                              <p className="mt-0.5 opacity-80">{r.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Recommandations */}
                {analyseIA.recommandations.length > 0 && (
                  <>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recommandations</h4>
                    <div className="space-y-2">
                      {analyseIA.recommandations.map((r, i) => (
                        <div key={i} className="rounded-lg border border-border/40 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${PRIORITE_COLORS[r.priorite] || ""}`}>
                              {r.priorite}
                            </span>
                            <span className="text-sm font-semibold">{r.action}</span>
                          </div>
                          {r.impact && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{r.impact}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{r.detail}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Comparables */}
                {analyseIA.comparables && (
                  <>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-4">Marché local</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{analyseIA.comparables}</p>
                  </>
                )}

                <p className="text-[10px] text-muted-foreground mt-4">
                  Modèle: {analyseIA.model} · {new Date(analyseIA.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </Section>
            </>
          ) : (
            <GlassCard className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 mb-4">
                <Sparkles className="h-6 w-6 text-purple-500" />
              </div>
              <h3 className="font-semibold mb-1">Analyse IA non disponible</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Lancez l'analyse IA pour obtenir le positionnement marché, les risques et recommandations pour cet actif.
              </p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function EtudeMarche() {
  const queryClient = useQueryClient();
  const [selectedActifId, setSelectedActifId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data = [], isLoading } = useQuery<EtudeActif[]>({
    queryKey: ["/api/am/marche/etude"],
    queryFn: () => apiRequest("GET", "/api/am/marche/etude").then((r) => r.json()),
  });

  // Sync Phase 1 (DVF + ANIL + taux capi)
  const syncMutation = useMutation({
    mutationFn: async () => {
      const dvf = await apiRequest("POST", "/api/am/marche/sync-dvf").then((r) => r.json());
      const anil = await apiRequest("POST", "/api/am/marche/sync-anil").then((r) => r.json());
      const capi = await apiRequest("POST", "/api/am/marche/compute-taux-capi").then((r) => r.json());
      return { dvf, anil, capi };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
      setStatus({ type: "success", message: `Sync terminée : ${result.dvf.synced || 0} DVF, ${result.anil.synced || 0} ANIL, ${result.capi.computed || 0} taux capi` });
      setTimeout(() => setStatus(null), 8000);
    },
    onError: (err: any) => {
      setStatus({ type: "error", message: err.message || "Erreur lors de la synchronisation" });
    },
  });

  // Analyse IA single asset
  const analyseSingleMutation = useMutation({
    mutationFn: (actifId: string) => apiRequest("POST", `/api/am/marche/analyse-ia/${actifId}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
      setStatus({ type: "success", message: "Analyse IA terminée" });
      setTimeout(() => setStatus(null), 5000);
    },
    onError: (err: any) => setStatus({ type: "error", message: err.message }),
  });

  // Analyse IA all assets
  const analyseAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/am/marche/analyse-ia").then((r) => r.json()),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
      setStatus({ type: "success", message: `Analyse IA terminée : ${result.analysed}/${result.total} actifs analysés` });
      setTimeout(() => setStatus(null), 8000);
    },
    onError: (err: any) => setStatus({ type: "error", message: err.message }),
  });

  const selectedItem = useMemo(
    () => data.find((d) => d.actif.id === selectedActifId) || null,
    [data, selectedActifId],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Étude de marché" description="Positionnement de vos actifs par rapport au marché (DVF, ANIL, IA)"
        actions={<SyncActions syncing={syncMutation.isPending} onSync={() => syncMutation.mutate()}
          analysingAll={analyseAllMutation.isPending} onAnalyseAll={() => analyseAllMutation.mutate()} />} />

      {/* Status message */}
      <AnimatePresence>
        {status && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className={`rounded-lg border p-3 text-sm ${status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"}`}>
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content: portfolio or detail */}
      {selectedItem ? (
        <FicheActifTab
          item={selectedItem}
          onBack={() => setSelectedActifId(null)}
          onAnalyse={(id) => analyseSingleMutation.mutate(id)}
          analysing={analyseSingleMutation.isPending}
        />
      ) : (
        <PortfolioTab data={data} onSelectActif={setSelectedActifId} />
      )}
    </div>
  );
}
