import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { PageHeader } from "../../components/ui/page-header";
import { GlassCard } from "../../components/ui/glass-card";
import { KpiCard } from "../../components/ui/kpi-card";
import { Badge } from "../../components/ui/badge";
import { Section } from "../../components/ui/section";
import { DataTable, type Column } from "../../components/ui/data-table";
import {
  Building2, MapPin, TrendingUp, TrendingDown,
  AlertTriangle, Loader2, Sparkles, ShieldCheck, Target,
  ArrowUpRight, ArrowDownRight, Minus, Zap, Shield, ArrowLeft,
  Landmark, Users, Receipt, PiggyBank,
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
  loyerAnnuel: number; loyerM2Mensuel: number; rendementBrut: number; rendementNet: number;
  tauxCapiInterne: number | null; ecartPrixPct: number | null; ecartLoyerPct: number | null;
  chargesAnnuelles: number; taxeFonciere: number; assurancePno: number;
  nbLots: number; lotsOccupes: number; tauxOccupation: number;
}

interface BailDetail {
  locataire: string | null;
  typeBail: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  loyerAnnuel: number;
  depotGarantie: number;
  indiceReference: string | null;
  statut: string | null;
}

interface EmpruntSummary {
  nbEmprunts: number;
  totalCRD: number;
  echeanceAnnuelle: number;
  tauxMoyen: number;
  dateFinDerniere: string | null;
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
  actif: { id: string; nom: string; adresse: string | null; ville: string | null; codePostal: string | null; type: string | null; surface: string | null; surfaceCarrez: string | null; dpe: string | null; sci: string | null; dateAcquisition: string | null };
  phase1: Phase1Data;
  interne: InternalMetrics;
  bauxDetail: BailDetail[];
  empruntSummary: EmpruntSummary | null;
  cashFlowAnnuel: number;
  locatairePrincipal: string | null;
  prochaineEcheanceBail: string | null;
  analyseIA: AnalyseIA | null;
}

interface PortfolioStats {
  totalActifs: number;
  patrimoineTotal: number;
  loyerAnnuelTotal: number;
  rendementBrutMoyen: number;
}

interface EtudeResponse {
  assets: EtudeActif[];
  portfolioStats: PortfolioStats;
}

// ============================================================
// Helpers
// ============================================================

function fmtEuro(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €";
}

function fmtEuroK(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  if (Math.abs(v) >= 1_000_000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v / 1_000_000) + " M€";
  if (Math.abs(v) >= 1_000) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v / 1_000) + " k€";
  return fmtEuro(v);
}

function fmtTaux(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toFixed(2) + "%";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  try {
    const diff = new Date(d).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

function cashFlowBadge(cf: number) {
  if (cf > 0) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold text-emerald-600 bg-emerald-500/10">+{fmtEuroK(cf)}</span>;
  if (cf < 0) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold text-red-500 bg-red-500/10">{fmtEuroK(cf)}</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function bailEcheanceBadge(dateFin: string | null) {
  const days = daysUntil(dateFin);
  if (days == null) return <span className="text-xs text-muted-foreground">—</span>;
  const years = Math.round(days / 365 * 10) / 10;
  if (days < 365) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold text-red-500 bg-red-500/10">{years < 0 ? "Expiré" : `${Math.round(days / 30)} mois`}</span>;
  if (days < 365 * 3) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold text-amber-600 bg-amber-500/10">{years.toFixed(1)} ans</span>;
  return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold text-emerald-600 bg-emerald-500/10">{years.toFixed(1)} ans</span>;
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "Très fiable" },
  B: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400", label: "Fiable" },
  C: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "Indicatif" },
  D: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400", label: "Fragile" },
  E: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400", label: "Insuffisant" },
};

const RISQUE_ICONS: Record<string, typeof Shield> = {
  vacance: Building2, locataire: Users, obsolescence_energetique: Zap, marche: TrendingDown,
  reglementaire: Shield, structural: AlertTriangle, fiscal: Target, refinancement: Landmark,
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

function DataMetric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "blue" | "emerald" | "amber" | "purple" | "red" }) {
  const gradients = { blue: "from-blue-500 to-indigo-500", emerald: "from-emerald-500 to-teal-500", amber: "from-amber-500 to-orange-500", purple: "from-purple-500 to-violet-500", red: "from-red-500 to-rose-500" };
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

function SyncActions({ analysingAll, onAnalyseAll }: {
  analysingAll: boolean; onAnalyseAll: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
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
// Tab 1: Portfolio View — Performance patrimoniale
// ============================================================

function PortfolioTab({ data, stats, onSelectActif }: { data: EtudeActif[]; stats: PortfolioStats; onSelectActif: (id: string) => void }) {
  const columns: Column<EtudeActif>[] = [
    {
      key: "nom", label: "Actif", sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-sm">{r.actif.nom}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {r.actif.ville && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{r.actif.ville}</span>}
            {r.actif.sci && <span className="text-muted-foreground/60">· {r.actif.sci}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "type", label: "Type", sortable: true,
      render: (r) => r.actif.type ? <Badge>{r.actif.type}</Badge> : "—",
    },
    {
      key: "loyerAnnuel", label: "Loyer annuel", sortable: true, align: "right",
      render: (r) => r.interne.loyerAnnuel > 0 ? <span className="font-medium">{fmtEuroK(r.interne.loyerAnnuel)}</span> : "—",
      exportValue: (r) => r.interne.loyerAnnuel || 0,
    },
    {
      key: "rendementBrut", label: "Rdt brut", sortable: true, align: "right",
      render: (r) => r.interne.rendementBrut > 0 ? <span className="font-semibold">{fmtTaux(r.interne.rendementBrut)}</span> : "—",
      exportValue: (r) => r.interne.rendementBrut || 0,
    },
    {
      key: "rendementNet", label: "Rdt net", sortable: true, align: "right",
      render: (r) => r.interne.rendementNet > 0 ? <span className="font-semibold">{fmtTaux(r.interne.rendementNet)}</span> : "—",
      exportValue: (r) => r.interne.rendementNet || 0,
    },
    {
      key: "locataire", label: "Locataire", sortable: true,
      render: (r) => r.locatairePrincipal
        ? <span className="text-sm">{r.locatairePrincipal}</span>
        : <span className="text-xs text-muted-foreground italic">Vacant</span>,
      exportValue: (r) => r.locatairePrincipal || "",
    },
    {
      key: "echeanceBail", label: "Échéance bail", sortable: true, align: "center",
      render: (r) => bailEcheanceBadge(r.prochaineEcheanceBail),
      exportValue: (r) => r.prochaineEcheanceBail || "",
    },
    {
      key: "crd", label: "CRD", sortable: true, align: "right",
      render: (r) => r.empruntSummary ? <span className="text-sm">{fmtEuroK(r.empruntSummary.totalCRD)}</span> : "—",
      exportValue: (r) => r.empruntSummary?.totalCRD || 0,
    },
    {
      key: "cashFlow", label: "Cash-flow", sortable: true, align: "right",
      render: (r) => cashFlowBadge(r.cashFlowAnnuel),
      exportValue: (r) => r.cashFlowAnnuel || 0,
    },
    {
      key: "occupation", label: "Occup.", sortable: true, align: "center",
      render: (r) => <span className={`text-xs font-bold ${r.interne.tauxOccupation >= 100 ? "text-emerald-600" : r.interne.tauxOccupation >= 80 ? "text-amber-600" : "text-red-500"}`}>{r.interne.tauxOccupation}%</span>,
      exportValue: (r) => r.interne.tauxOccupation,
    },
    {
      key: "confidence", label: "IA", sortable: true, align: "center",
      render: (r) => r.analyseIA ? <ConfidenceBadge confidence={r.analyseIA.confidence} /> : <span className="text-xs text-muted-foreground">—</span>,
      exportValue: (r) => r.analyseIA?.confidence || "",
    },
  ];

  // Derived KPIs
  const totalCashFlow = data.reduce((s, d) => s + d.cashFlowAnnuel, 0);
  const totalCRD = data.reduce((s, d) => s + (d.empruntSummary?.totalCRD || 0), 0);
  const avgOccupation = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.interne.tauxOccupation, 0) / data.length) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Patrimoine total" value={stats.patrimoineTotal} formatFn={fmtEuroK} icon={Building2} />
        <KpiCard label="Loyer annuel total" value={stats.loyerAnnuelTotal} formatFn={fmtEuroK} icon={Receipt} />
        <KpiCard label="Rendement brut moyen" value={stats.rendementBrutMoyen} formatFn={(n) => n > 0 ? fmtTaux(n) : "—"} icon={TrendingUp} />
        <KpiCard label="Cash-flow total" value={totalCashFlow} formatFn={fmtEuroK} icon={PiggyBank} />
        <KpiCard label="Occupation" value={avgOccupation} formatFn={(n) => `${n}%`} icon={Users} />
      </div>

      <DataTable
        data={data}
        columns={columns}
        searchKeys={["actif.nom", "actif.ville", "actif.type", "locatairePrincipal"]}
        searchPlaceholder="Rechercher un actif, locataire..."
        emptyMessage="Aucun actif. Importez vos données depuis l'onglet Patrimoine."
        onRowClick={(r) => onSelectActif(r.actif.id)}
        exportFileName="analyse-patrimoniale"
      />
    </div>
  );
}

// ============================================================
// Tab 2: Asset Detail View — Fiche patrimoniale
// ============================================================

function FicheActifTab({ item, onBack, onAnalyse, analysing }: {
  item: EtudeActif; onBack: () => void; onAnalyse: (id: string) => void; analysing: boolean;
}) {
  const { actif, interne, bauxDetail, empruntSummary, cashFlowAnnuel, analyseIA } = item;

  // DSCR = Loyer / Échéance emprunts
  const dscr = empruntSummary && empruntSummary.echeanceAnnuelle > 0
    ? Math.round((interne.loyerAnnuel / empruntSummary.echeanceAnnuelle) * 100) / 100
    : null;

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
              {actif.type && <Badge variant="outline">{actif.type}</Badge>}
              {actif.sci && <Badge variant="outline">{actif.sci}</Badge>}
              {actif.dpe && <Badge variant="outline">DPE {actif.dpe}</Badge>}
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

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Performance + Baux + Emprunts */}
        <div className="space-y-4">
          {/* Performance financière */}
          <Section title="Performance financière">
            <div className="grid grid-cols-2 gap-3">
              <DataMetric label="Rendement brut" value={fmtTaux(interne.rendementBrut)} sub={`Loyer ${fmtEuroK(interne.loyerAnnuel)} / Acq. ${fmtEuroK(interne.prixAcq)}`} accent="blue" />
              <DataMetric label="Rendement net" value={fmtTaux(interne.rendementNet)} sub={`Charges ${fmtEuroK(interne.chargesAnnuelles)}/an`} accent="emerald" />
              <DataMetric label="Cash-flow annuel" value={fmtEuroK(cashFlowAnnuel)} sub={cashFlowAnnuel >= 0 ? "Positif" : "Négatif — déficit"} accent={cashFlowAnnuel >= 0 ? "emerald" : "red"} />
              <DataMetric label="Taux d'occupation" value={`${interne.tauxOccupation}%`} sub={`${interne.lotsOccupes}/${interne.nbLots} lots`} accent={interne.tauxOccupation >= 100 ? "emerald" : "amber"} />
              {dscr != null && (
                <DataMetric label="DSCR" value={`${dscr}x`} sub={dscr >= 1.2 ? "Couverture confortable" : dscr >= 1 ? "Couverture limite" : "Couverture insuffisante"} accent={dscr >= 1.2 ? "emerald" : dscr >= 1 ? "amber" : "red"} />
              )}
              <DataMetric label="Prix/m²" value={interne.prixM2 > 0 ? `${new Intl.NumberFormat("fr-FR").format(interne.prixM2)} €/m²` : "—"} sub={interne.surface > 0 ? `${interne.surface} m²` : undefined} />
            </div>
          </Section>

          {/* Situation locative */}
          <Section title="Situation locative">
            {bauxDetail.length > 0 ? (
              <div className="space-y-3">
                {bauxDetail.map((bail, i) => (
                  <div key={i} className="rounded-xl border border-border/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{bail.locataire || "Non renseigné"}</span>
                      </div>
                      {bail.typeBail && <Badge variant="outline">{bail.typeBail}</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Loyer annuel HC</span>
                      <span className="text-right font-medium text-foreground">{fmtEuro(bail.loyerAnnuel)}</span>
                      <span>Dépôt de garantie</span>
                      <span className="text-right font-medium text-foreground">{fmtEuro(bail.depotGarantie)}</span>
                      <span>Début</span>
                      <span className="text-right">{fmtDate(bail.dateDebut)}</span>
                      <span>Fin</span>
                      <span className="text-right">{fmtDate(bail.dateFin)} {bail.dateFin && bailEcheanceBadge(bail.dateFin)}</span>
                      {bail.indiceReference && <>
                        <span>Indexation</span>
                        <span className="text-right font-medium">{bail.indiceReference}</span>
                      </>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Aucun bail enregistré pour cet actif.</p>
            )}
          </Section>

          {/* Endettement */}
          {empruntSummary && (
            <Section title="Endettement">
              <div className="grid grid-cols-2 gap-3">
                <DataMetric label="Capital restant dû" value={fmtEuroK(empruntSummary.totalCRD)} sub={`${empruntSummary.nbEmprunts} emprunt${empruntSummary.nbEmprunts > 1 ? "s" : ""}`} accent="amber" />
                <DataMetric label="Échéance annuelle" value={fmtEuroK(empruntSummary.echeanceAnnuelle)} sub={`Taux moyen ${fmtTaux(empruntSummary.tauxMoyen)}`} />
                {empruntSummary.dateFinDerniere && (
                  <DataMetric label="Fin dernier emprunt" value={fmtDate(empruntSummary.dateFinDerniere)} />
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Right: AI Analysis */}
        <div className="space-y-4">
          {analyseIA ? (
            <>
              <Section title="Analyse IA">
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

                {/* Comparables / Marché */}
                {analyseIA.comparables && (
                  <>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-4">Contexte marché</h4>
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
                Lancez l'analyse IA pour obtenir le positionnement, les risques et recommandations pour cet actif.
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

  const { data: response, isLoading } = useQuery<EtudeResponse>({
    queryKey: ["/api/am/marche/etude"],
    queryFn: () => apiRequest("/api/am/marche/etude"),
  });

  const data = response?.assets || [];
  const portfolioStats = response?.portfolioStats || { totalActifs: 0, patrimoineTotal: 0, loyerAnnuelTotal: 0, rendementBrutMoyen: 0 };

  // Analyse IA single asset
  const analyseSingleMutation = useMutation({
    mutationFn: (actifId: string) => apiRequest(`/api/am/marche/analyse-ia/${actifId}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
      setStatus({ type: "success", message: "Analyse IA terminée" });
      setTimeout(() => setStatus(null), 5000);
    },
    onError: (err: any) => setStatus({ type: "error", message: err.message }),
  });

  // Analyse IA all assets
  const analyseAllMutation = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/analyse-ia", { method: "POST" }),
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
      <PageHeader title="Analyse patrimoniale" description="Performance, risques et positionnement de vos actifs"
        actions={<SyncActions analysingAll={analyseAllMutation.isPending} onAnalyseAll={() => analyseAllMutation.mutate()} />} />

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
        <PortfolioTab data={data} stats={portfolioStats} onSelectActif={setSelectedActifId} />
      )}
    </div>
  );
}
