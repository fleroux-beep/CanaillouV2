import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  getValeurEstimee, getLoyerAnnuelActif, getChargesAnnuelles,
  getTotalCRD, getServiceDette, getRendementBrut, getRendementNet,
  getLTV, getDSCR, getPrixAcquisition,
} from "../../lib/am-calculations";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { ProgressRing } from "../../components/ui/progress-ring";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { SkeletonKpi, SkeletonCard, SkeletonTable } from "../../components/ui/skeleton";
import {
  Building2, Landmark, PiggyBank, TrendingUp,
  BarChart3, Shield, Wallet, CircleDollarSign, Activity,
  AlertTriangle, Layers, ArrowLeft,
} from "lucide-react";
import { getBailLoyer, isResilie } from "@shared/utils/bail";

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

const toArray = (v: unknown): any[] => Array.isArray(v) ? v : [];

type DashboardView = "parc" | "sci" | "actif";

interface KpiRow {
  label: string;
  id: string;
  valorisation: number;
  prixAcquisition: number;
  loyerAnnuel: number;
  charges: number;
  noi: number;
  crd: number;
  serviceDette: number;
  cashFlowNet: number;
  rendementBrut: number;
  rendementNet: number;
  ltv: number;
  dscr: number;
  fondsPropreNets: number;
  nbActifs: number;
  nbLots: number;
  nbLotsLoues: number;
  tauxOccupation: number;
  plusValue: number;
  plusValuePct: number;
}

// ─── Computation helpers ─────────────────────────────────────────

const normLoue = (s: string | null | undefined) =>
  s?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue";

function computeActifKpi(actif: any, allBaux: any[], allLots: any[], allEmprunts: any[], allActifs: any[]): KpiRow {
  const actifLots = allLots.filter((l: any) => l.actifId === actif.id && !l.archived);
  const actifEmprunts = allEmprunts.filter((e: any) => e.actifId === actif.id && !e.archived);
  const sciEmprunts = allEmprunts.filter((e: any) => e.sciId === actif.sciId && !e.actifId && !e.archived);
  const nbActifsInSci = allActifs.filter((a: any) => a.sciId === actif.sciId && !a.archived).length || 1;

  const loyerAnnuel = getLoyerAnnuelActif(actif, allBaux, allLots);
  const charges = getChargesAnnuelles(actif);
  const noi = loyerAnnuel - charges;
  const prixAcq = getPrixAcquisition(actif);
  const valorisation = getValeurEstimee(actif, allBaux, allLots);
  const crd = getTotalCRD(actifEmprunts) + getTotalCRD(sciEmprunts) / nbActifsInSci;
  const serviceDette = getServiceDette(actifEmprunts) + getServiceDette(sciEmprunts) / nbActifsInSci;
  const cashFlowNet = noi - serviceDette;
  const lotsLoues = actifLots.filter((l: any) => normLoue(l.statut)).length;
  const actifBaux = allBaux.filter((b: any) => b.actifId === actif.id && !b.archived && !isResilie(b.statut));

  return {
    label: actif.nom || actif.adresse || "—",
    id: actif.id,
    valorisation, prixAcquisition: prixAcq, loyerAnnuel, charges, noi, crd, serviceDette, cashFlowNet,
    rendementBrut: getRendementBrut(loyerAnnuel, prixAcq),
    rendementNet: getRendementNet(loyerAnnuel, charges, prixAcq),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fondsPropreNets: valorisation - crd,
    nbActifs: 1, nbLots: actifLots.length, nbLotsLoues: lotsLoues,
    tauxOccupation: actifLots.length > 0 ? (lotsLoues / actifLots.length) * 100 : (actifBaux.length > 0 ? 100 : 0),
    plusValue: valorisation - prixAcq,
    plusValuePct: prixAcq > 0 ? ((valorisation - prixAcq) / prixAcq) * 100 : 0,
  };
}

function computeSciKpi(sci: any, allActifs: any[], allBaux: any[], allLots: any[], allEmprunts: any[]): KpiRow {
  const sciActifs = allActifs.filter((a: any) => a.sciId === sci.id && !a.archived);
  const sciLots = allLots.filter((l: any) => sciActifs.some((a: any) => a.id === l.actifId) && !l.archived);
  const sciEmprunts = allEmprunts.filter((e: any) => e.sciId === sci.id && !e.archived);

  let valorisation = 0, loyerAnnuel = 0, charges = 0, prixAcq = 0;
  for (const a of sciActifs) {
    valorisation += getValeurEstimee(a, allBaux, allLots);
    loyerAnnuel += getLoyerAnnuelActif(a, allBaux, allLots);
    charges += getChargesAnnuelles(a);
    prixAcq += getPrixAcquisition(a);
  }

  const noi = loyerAnnuel - charges;
  const crd = getTotalCRD(sciEmprunts);
  const serviceDette = getServiceDette(sciEmprunts);
  const cashFlowNet = noi - serviceDette;
  const lotsLoues = sciLots.filter((l: any) => normLoue(l.statut)).length;

  return {
    label: sci.nom, id: sci.id,
    valorisation, prixAcquisition: prixAcq, loyerAnnuel, charges, noi, crd, serviceDette, cashFlowNet,
    rendementBrut: getRendementBrut(loyerAnnuel, prixAcq),
    rendementNet: getRendementNet(loyerAnnuel, charges, prixAcq),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fondsPropreNets: valorisation - crd,
    nbActifs: sciActifs.length, nbLots: sciLots.length, nbLotsLoues: lotsLoues,
    tauxOccupation: sciLots.length > 0 ? (lotsLoues / sciLots.length) * 100 : 0,
    plusValue: valorisation - prixAcq,
    plusValuePct: prixAcq > 0 ? ((valorisation - prixAcq) / prixAcq) * 100 : 0,
  };
}

function aggregateKpis(rows: KpiRow[], label: string): KpiRow {
  const v = rows.reduce((s, r) => s + r.valorisation, 0);
  const l = rows.reduce((s, r) => s + r.loyerAnnuel, 0);
  const c = rows.reduce((s, r) => s + r.charges, 0);
  const p = rows.reduce((s, r) => s + r.prixAcquisition, 0);
  const noi = l - c;
  const crd = rows.reduce((s, r) => s + r.crd, 0);
  const sd = rows.reduce((s, r) => s + r.serviceDette, 0);
  const cf = noi - sd;
  const nbLots = rows.reduce((s, r) => s + r.nbLots, 0);
  const nbLotsLoues = rows.reduce((s, r) => s + r.nbLotsLoues, 0);
  return {
    label, id: "total", valorisation: v, prixAcquisition: p, loyerAnnuel: l, charges: c, noi, crd,
    serviceDette: sd, cashFlowNet: cf,
    rendementBrut: getRendementBrut(l, p), rendementNet: getRendementNet(l, c, p),
    ltv: getLTV(crd, v), dscr: getDSCR(noi, sd), fondsPropreNets: v - crd,
    nbActifs: rows.reduce((s, r) => s + r.nbActifs, 0), nbLots, nbLotsLoues,
    tauxOccupation: nbLots > 0 ? (nbLotsLoues / nbLots) * 100 : 0,
    plusValue: v - p, plusValuePct: p > 0 ? ((v - p) / p) * 100 : 0,
  };
}

// ─── Shared sub-components ───────────────────────────────────────

function HeroKpis({ kpi }: { kpi: KpiRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <KpiCard label="Prix d'acquisition" value={kpi.prixAcquisition} formatFn={formatCurrency} icon={Building2} variant="default" gradient delay={0} metricKey="prixAcquisition" />
      <KpiCard label="Valorisation" value={kpi.valorisation} formatFn={formatCurrency} icon={TrendingUp} variant="primary" gradient delay={1} metricKey="valorisation" subtitle={kpi.prixAcquisition > 0 ? `${kpi.plusValuePct >= 0 ? "+" : ""}${kpi.plusValuePct.toFixed(1)}% vs acq.` : undefined} />
      <KpiCard label="Loyers annuels" value={kpi.loyerAnnuel} formatFn={formatCurrency} icon={CircleDollarSign} variant="success" gradient delay={2} metricKey="loyerHT" />
      <KpiCard label="NOI" value={kpi.noi} formatFn={formatCurrency} icon={Activity} variant={kpi.noi >= 0 ? "success" : "danger"} gradient delay={3} metricKey="noi" subtitle={`Charges: ${formatCurrency(kpi.charges)}`} />
      <KpiCard label="Dette (CRD)" value={kpi.crd} formatFn={formatCurrency} icon={PiggyBank} variant="warning" gradient delay={4} metricKey="crd" />
      <KpiCard label="Cash-flow net" value={kpi.cashFlowNet} formatFn={formatCurrency} icon={Wallet} variant={kpi.cashFlowNet >= 0 ? "success" : "danger"} gradient delay={5} metricKey="cashFlowNet" />
    </div>
  );
}

function PerfAndRings({ kpi }: { kpi: KpiRow }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GlassCard delay={4} className="col-span-2">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Performance</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Rdt brut" value={kpi.rendementBrut} formatFn={formatPercent} icon={BarChart3} variant="success" delay={5} metricKey="rendementBrut" />
          <KpiCard label="Rdt net" value={kpi.rendementNet} formatFn={formatPercent} icon={BarChart3} variant="success" delay={6} metricKey="rendementNet" />
          <KpiCard label="DSCR" value={kpi.dscr} formatFn={(n) => n > 0 ? n.toFixed(2) + "x" : "N/A"} icon={Shield} variant={kpi.dscr >= 1.4 ? "success" : kpi.dscr >= 1.2 ? "primary" : kpi.dscr >= 1 ? "warning" : kpi.dscr > 0 ? "danger" : "default"} delay={7} metricKey="dscr" />
          <KpiCard label="+/- Value" value={kpi.plusValue} formatFn={formatCurrency} icon={TrendingUp} variant={kpi.plusValue >= 0 ? "success" : "danger"} delay={8} subtitle={`${kpi.plusValuePct >= 0 ? "+" : ""}${kpi.plusValuePct.toFixed(1)}%`} />
        </div>
      </GlassCard>
      <GlassCard delay={5} className="flex items-center justify-around">
        <ProgressRing value={kpi.tauxOccupation} color="hsl(142, 76%, 36%)" label={`${kpi.tauxOccupation.toFixed(0)}%`} sublabel="Occupation" />
        <ProgressRing value={kpi.ltv} color={kpi.ltv > 80 ? "hsl(0, 84%, 60%)" : kpi.ltv > 60 ? "hsl(38, 92%, 50%)" : "hsl(221, 83%, 53%)"} label={`${kpi.ltv.toFixed(1)}%`} sublabel="LTV" />
      </GlassCard>
    </div>
  );
}

function Waterfall({ kpi }: { kpi: KpiRow }) {
  if (kpi.loyerAnnuel <= 0) return null;
  const data = [
    { name: "Loyers", value: kpi.loyerAnnuel, fill: "#10b981" },
    { name: "Charges", value: -kpi.charges, fill: "#ef4444" },
    { name: "NOI", value: kpi.noi, fill: "#3b82f6" },
    { name: "Svc dette", value: -kpi.serviceDette, fill: "#f59e0b" },
    { name: "Cash-flow", value: kpi.cashFlowNet, fill: kpi.cashFlowNet >= 0 ? "#10b981" : "#ef4444" },
  ];
  return (
    <GlassCard delay={6}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cascade des revenus</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(Math.abs(v))} />
          <Bar dataKey="value" animationDuration={800}>
            {data.map((e, i) => <Cell key={i} fill={e.fill} radius={[4, 4, 0, 0] as any} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  );
}

function DetailTable({ rows, total, sortKey, sortDir, onSort, onRowClick, entityLabel }: {
  rows: KpiRow[];
  total: KpiRow;
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onRowClick?: (id: string) => void;
  entityLabel: string;
}) {
  const SH = ({ label, sk, className }: { label: string; sk: string; className?: string }) => (
    <SortHeader label={label} sortKey={sk} currentSortKey={sortKey} sortDir={sortDir} onSort={onSort} className={className || "px-3 py-3 text-right font-semibold"} />
  );

  return (
    <Section title={`Détail par ${entityLabel}`}>
      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <SH label={entityLabel} sk="label" className="px-4 py-3 text-left font-semibold" />
                {entityLabel === "SCI" && <SH label="Actifs" sk="nbActifs" />}
                <SH label="Lots" sk="nbLots" />
                <SH label="Valorisation" sk="valorisation" />
                <SH label="Prix acq." sk="prixAcquisition" />
                <SH label="+/- Value" sk="plusValue" />
                <SH label="Loyers/an" sk="loyerAnnuel" />
                <SH label="NOI" sk="noi" />
                <SH label="Cash-flow" sk="cashFlowNet" />
                <SH label="Rdt brut" sk="rendementBrut" />
                <SH label="LTV" sk="ltv" />
                <SH label="DSCR" sk="dscr" />
                <SH label="Occup." sk="tauxOccupation" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(row.id)}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {row.label}
                    </div>
                  </td>
                  {entityLabel === "SCI" && <td className="px-3 py-3 text-right">{row.nbActifs}</td>}
                  <td className="px-3 py-3 text-right">{row.nbLotsLoues}/{row.nbLots}</td>
                  <td className="px-3 py-3 text-right font-semibold">{formatCurrency(row.valorisation)}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(row.prixAcquisition)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${row.plusValue >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {row.prixAcquisition > 0 ? `${row.plusValuePct >= 0 ? "+" : ""}${row.plusValuePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">{formatCurrency(row.loyerAnnuel)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${row.noi < 0 ? "text-red-500" : ""}`}>{formatCurrency(row.noi)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${row.cashFlowNet < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>{formatCurrency(row.cashFlowNet)}</td>
                  <td className={`px-3 py-3 text-right ${row.rendementBrut < 5 ? "text-amber-600" : "text-green-600"}`}>{formatPercent(row.rendementBrut)}</td>
                  <td className={`px-3 py-3 text-right ${row.ltv > 60 ? "text-red-500" : row.ltv > 40 ? "text-amber-600" : "text-green-600"}`}>{formatPercent(row.ltv)}</td>
                  <td className={`px-3 py-3 text-right ${row.dscr > 0 && row.dscr < 1.2 ? "text-amber-600" : row.dscr >= 1.2 ? "text-green-600" : "text-red-500"}`}>
                    {row.dscr > 0 ? `${row.dscr.toFixed(2)}x` : "—"}
                  </td>
                  <td className={`px-3 py-3 text-right ${row.tauxOccupation < 80 ? "text-amber-600" : "text-green-600"}`}>{row.tauxOccupation.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold border-t-2">
                <td className="px-4 py-3">TOTAL</td>
                {entityLabel === "SCI" && <td className="px-3 py-3 text-right">{total.nbActifs}</td>}
                <td className="px-3 py-3 text-right">{total.nbLotsLoues}/{total.nbLots}</td>
                <td className="px-3 py-3 text-right">{formatCurrency(total.valorisation)}</td>
                <td className="px-3 py-3 text-right">{formatCurrency(total.prixAcquisition)}</td>
                <td className={`px-3 py-3 text-right font-semibold ${total.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {total.prixAcquisition > 0 ? `${total.plusValuePct >= 0 ? "+" : ""}${total.plusValuePct.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-3 text-right">{formatCurrency(total.loyerAnnuel)}</td>
                <td className="px-3 py-3 text-right">{formatCurrency(total.noi)}</td>
                <td className={`px-3 py-3 text-right ${total.cashFlowNet < 0 ? "text-red-500" : "text-green-600"}`}>{formatCurrency(total.cashFlowNet)}</td>
                <td className="px-3 py-3 text-right">{formatPercent(total.rendementBrut)}</td>
                <td className="px-3 py-3 text-right">{formatPercent(total.ltv)}</td>
                <td className="px-3 py-3 text-right">{total.dscr > 0 ? `${total.dscr.toFixed(2)}x` : "—"}</td>
                <td className="px-3 py-3 text-right">{total.tauxOccupation.toFixed(0)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </GlassCard>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════
// Main Dashboard
// ═════════════════════════════════════════════════════════════════

export default function AMDashboard() {
  const [dashboardView, setDashboardView] = useState<DashboardView>("parc");
  const [selectedSciId, setSelectedSciId] = useState<string | null>(null);
  const [selectedActifId, setSelectedActifId] = useState<string | null>(null);

  const { data: rawScis, isLoading: l1, isError: e1, error: err1 } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: rawActifs, isLoading: l2, isError: e2, error: err2 } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: rawLots, isLoading: l3, isError: e3, error: err3 } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: rawBaux, isLoading: l4, isError: e4, error: err4 } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: rawEmprunts, isLoading: l5, isError: e5, error: err5 } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const scis = toArray(rawScis);
  const actifs = toArray(rawActifs);
  const lots = toArray(rawLots);
  const baux = toArray(rawBaux);
  const emprunts = toArray(rawEmprunts);

  const isLoading = l1 || l2 || l3 || l4 || l5;
  const hasError = e1 || e2 || e3 || e4 || e5;
  const errorDetail = [err1, err2, err3, err4, err5].filter(Boolean).map((e: any) => e?.message).join(" | ");

  const actifsActifs = useMemo(() => actifs.filter((a: any) => !a.archived), [actifs]);

  // ─── KPI rows ──────────────────────────────────────────────────
  const sciKpiRows = useMemo(() =>
    scis.filter((s: any) => !s.deletedAt).map((sci: any) => computeSciKpi(sci, actifs, baux, lots, emprunts)),
    [scis, actifs, baux, lots, emprunts]
  );

  const allActifKpiRows = useMemo(() =>
    actifsActifs.map((a: any) => computeActifKpi(a, baux, lots, emprunts, actifs)),
    [actifsActifs, baux, lots, emprunts, actifs]
  );

  const parcGlobalKpi = useMemo(() => aggregateKpis(sciKpiRows, "Ensemble du parc"), [sciKpiRows]);

  // ─── Selected SCI ──────────────────────────────────────────────
  const selectedSciKpi = useMemo((): KpiRow | null => {
    if (!selectedSciId) return null;
    return sciKpiRows.find((s) => s.id === selectedSciId) || null;
  }, [selectedSciId, sciKpiRows]);

  const selectedSciActifs = useMemo(() =>
    selectedSciId ? allActifKpiRows.filter((a) => {
      const actif = actifsActifs.find((x: any) => x.id === a.id);
      return actif?.sciId === selectedSciId;
    }) : [],
    [selectedSciId, allActifKpiRows, actifsActifs]
  );

  // ─── Selected Actif ────────────────────────────────────────────
  const selectedActifKpi = useMemo((): KpiRow | null => {
    if (!selectedActifId) return null;
    return allActifKpiRows.find((a) => a.id === selectedActifId) || null;
  }, [selectedActifId, allActifKpiRows]);

  const selectedActifLots = useMemo(() => {
    if (!selectedActifId) return [];
    return lots.filter((l: any) => l.actifId === selectedActifId && !l.archived);
  }, [selectedActifId, lots]);

  const selectedActifBaux = useMemo(() => {
    if (!selectedActifId) return [];
    return baux.filter((b: any) => b.actifId === selectedActifId && !b.archived && !isResilie(b.statut));
  }, [selectedActifId, baux]);

  // ─── Chart data ────────────────────────────────────────────────
  const pieData = useMemo(() =>
    sciKpiRows.filter((k) => k.valorisation > 0).map((k) => ({ name: k.label, value: k.valorisation })),
    [sciKpiRows]
  );

  const { sortKey, sortDir, handleSort, sortData } = useSortableTable();

  // ─── Navigation helpers ────────────────────────────────────────
  const goToSci = (sciId: string) => { setSelectedSciId(sciId); setSelectedActifId(null); setDashboardView("sci"); };
  const goToActif = (actifId: string) => { setSelectedActifId(actifId); setDashboardView("actif"); };
  const goToParc = () => { setSelectedSciId(null); setSelectedActifId(null); setDashboardView("parc"); };
  const goBackFromActif = () => { setSelectedActifId(null); setDashboardView(selectedSciId ? "sci" : "parc"); };

  // ─── Breadcrumb ────────────────────────────────────────────────
  const selectedSciName = scis.find((s: any) => s.id === selectedSciId)?.nom;
  const selectedActifName = selectedActifKpi?.label;

  // ─── Early returns ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Asset Management" description="Chargement des données..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)}</div>
        <div className="grid gap-4 lg:grid-cols-3"><div className="col-span-2"><SkeletonCard /></div><SkeletonCard /></div>
        <SkeletonTable rows={5} columns={8} />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-8">
        <PageHeader title="Asset Management" description="Vue d'ensemble du patrimoine immobilier" />
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-amber-500" />
            <h3 className="mb-2 text-lg font-semibold">Erreur de chargement</h3>
            <p className="mb-2 text-sm text-muted-foreground">Impossible de charger les données.</p>
            {errorDetail && <p className="mb-4 max-w-md rounded bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground break-all">{errorDetail}</p>}
            <button onClick={() => window.location.reload()} className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white">Réessayer</button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ─── Descriptions ──────────────────────────────────────────────
  const viewDescription = dashboardView === "parc"
    ? "Vue d'ensemble du patrimoine immobilier"
    : dashboardView === "sci"
    ? selectedSciName ? `${selectedSciName} — Détail` : "Vue par SCI"
    : selectedActifName ? `${selectedActifName} — Détail` : "Vue par Actif";

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader title="Asset Management" description={viewDescription} />

        {/* ─── Navigation ─── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            {([
              { key: "parc" as DashboardView, label: "Parc", icon: Layers },
              { key: "sci" as DashboardView, label: "SCI", icon: Landmark },
              { key: "actif" as DashboardView, label: "Actif", icon: Building2 },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  if (key === "parc") goToParc();
                  else if (key === "sci") {
                    setSelectedActifId(null);
                    setDashboardView("sci");
                  } else if (key === "actif") {
                    setDashboardView("actif");
                  }
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                  dashboardView === key
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Breadcrumb */}
          {(dashboardView === "sci" || dashboardView === "actif") && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <button onClick={goToParc} className="hover:text-foreground transition-colors">Parc</button>
              {dashboardView === "sci" && !selectedSciId && (
                <>
                  <span>/</span>
                  <span className="text-foreground font-medium">Toutes les SCI</span>
                </>
              )}
              {selectedSciName && (
                <>
                  <span>/</span>
                  <button
                    onClick={() => { setSelectedActifId(null); setDashboardView("sci"); }}
                    className={`hover:text-foreground transition-colors ${dashboardView === "sci" ? "text-foreground font-medium" : ""}`}
                  >
                    {selectedSciName}
                  </button>
                </>
              )}
              {dashboardView === "actif" && !selectedActifId && (
                <>
                  {!selectedSciName && <span>/</span>}
                  {!selectedSciName && <span className="text-foreground font-medium">Tous les actifs</span>}
                </>
              )}
              {dashboardView === "actif" && selectedActifName && (
                <>
                  <span>/</span>
                  <span className="text-foreground font-medium">{selectedActifName}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PARC VIEW                                                  */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {dashboardView === "parc" && (
          <>
            <HeroKpis kpi={parcGlobalKpi} />
            <PerfAndRings kpi={parcGlobalKpi} />

            {/* Waterfall + Pie */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Waterfall kpi={parcGlobalKpi} />
              {pieData.length > 0 && (
                <GlassCard delay={7}>
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Répartition par SCI
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" animationDuration={800}>
                        {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    {pieData.map((d: any, i: number) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {d.name}
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>

            <DetailTable
              rows={sortData(sciKpiRows)}
              total={parcGlobalKpi}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={goToSci}
              entityLabel="SCI"
            />
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SCI VIEW — KPIs of selected SCI or all SCIs               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {dashboardView === "sci" && !selectedSciId && (
          <>
            <HeroKpis kpi={parcGlobalKpi} />
            <PerfAndRings kpi={parcGlobalKpi} />
            <Waterfall kpi={parcGlobalKpi} />

            <DetailTable
              rows={sortData(sciKpiRows)}
              total={parcGlobalKpi}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={goToSci}
              entityLabel="SCI"
            />
          </>
        )}
        {dashboardView === "sci" && selectedSciKpi && (
          <>
            <HeroKpis kpi={selectedSciKpi} />
            <PerfAndRings kpi={selectedSciKpi} />
            <Waterfall kpi={selectedSciKpi} />

            <DetailTable
              rows={sortData(selectedSciActifs)}
              total={selectedSciKpi}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={goToActif}
              entityLabel="Actif"
            />
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ACTIF VIEW — All actifs or selected actif                  */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {dashboardView === "actif" && !selectedActifId && (
          <>
            <HeroKpis kpi={parcGlobalKpi} />
            <PerfAndRings kpi={parcGlobalKpi} />
            <Waterfall kpi={parcGlobalKpi} />

            <DetailTable
              rows={sortData(allActifKpiRows)}
              total={parcGlobalKpi}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={goToActif}
              entityLabel="Actif"
            />
          </>
        )}
        {dashboardView === "actif" && selectedActifKpi && (
          <>
            <HeroKpis kpi={selectedActifKpi} />
            <PerfAndRings kpi={selectedActifKpi} />
            <Waterfall kpi={selectedActifKpi} />

            {/* Lots & Baux info */}
            {(selectedActifLots.length > 0 || selectedActifBaux.length > 0) && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Lots */}
                {selectedActifLots.length > 0 && (
                  <Section title={`Lots (${selectedActifLots.length})`}>
                    <GlassCard>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="px-4 py-2 text-left font-semibold">Lot</th>
                              <th className="px-3 py-2 text-left font-semibold">Type</th>
                              <th className="px-3 py-2 text-right font-semibold">Surface</th>
                              <th className="px-3 py-2 text-right font-semibold">Loyer/mois</th>
                              <th className="px-3 py-2 text-center font-semibold">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedActifLots.map((lot: any) => {
                              // Loyer = dérivé du bail rattaché au lot (source unique).
                              const bailLot = selectedActifBaux.find(
                                (b: any) => b.lotId === lot.id && !isResilie(b.statut) && !b.archived,
                              );
                              const annuelLot = bailLot
                                ? getBailLoyer(bailLot)
                                : 0;
                              const mensuelLot = annuelLot > 0 ? Math.round((annuelLot / 12) * 100) / 100 : 0;
                              return (
                              <tr key={lot.id} className="border-t hover:bg-muted/20">
                                <td className="px-4 py-2 font-medium">{lot.designation || "—"}</td>
                                <td className="px-3 py-2">{lot.type || "—"}</td>
                                <td className="px-3 py-2 text-right">{lot.surface ? `${lot.surface} m²` : "—"}</td>
                                <td className="px-3 py-2 text-right">{mensuelLot > 0 ? formatCurrency(mensuelLot) : "—"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    normLoue(lot.statut)
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  }`}>
                                    {lot.statut || "vacant"}
                                  </span>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </GlassCard>
                  </Section>
                )}

                {/* Baux */}
                {selectedActifBaux.length > 0 && (
                  <Section title={`Baux actifs (${selectedActifBaux.length})`}>
                    <GlassCard>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="px-4 py-2 text-left font-semibold">Type</th>
                              <th className="px-3 py-2 text-right font-semibold">Loyer/an</th>
                              <th className="px-3 py-2 text-left font-semibold">Début</th>
                              <th className="px-3 py-2 text-left font-semibold">Fin</th>
                              <th className="px-3 py-2 text-left font-semibold">Indice</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedActifBaux.map((bail: any) => {
                              const loyerAn = getBailLoyer(bail);
                              return (
                                <tr key={bail.id} className="border-t hover:bg-muted/20">
                                  <td className="px-4 py-2 font-medium">{bail.typeBail || "—"}</td>
                                  <td className="px-3 py-2 text-right">{loyerAn > 0 ? formatCurrency(loyerAn) : "—"}</td>
                                  <td className="px-3 py-2">{bail.dateDebut?.slice(0, 10) || "—"}</td>
                                  <td className="px-3 py-2">{bail.dateFin?.slice(0, 10) || "—"}</td>
                                  <td className="px-3 py-2">{bail.indiceReference || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </GlassCard>
                  </Section>
                )}
              </div>
            )}
          </>
        )}

        {/* Fallback: SCI or Actif view without selection */}
        {dashboardView === "sci" && !selectedSciKpi && (
          <GlassCard>
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Landmark className="mb-3 h-10 w-10" />
              <p className="text-sm">Sélectionnez une SCI dans la vue Parc pour voir son détail.</p>
              <button onClick={goToParc} className="mt-3 rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white">
                <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Retour au Parc
              </button>
            </div>
          </GlassCard>
        )}

        {dashboardView === "actif" && !selectedActifKpi && (
          <GlassCard>
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Building2 className="mb-3 h-10 w-10" />
              <p className="text-sm">Sélectionnez un actif pour voir son détail.</p>
              <button onClick={goBackFromActif} className="mt-3 rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white">
                <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Retour
              </button>
            </div>
          </GlassCard>
        )}

      </motion.div>
    </AnimatePresence>
  );
}
