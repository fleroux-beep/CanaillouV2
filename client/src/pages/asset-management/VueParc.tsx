/**
 * Vue Parc — Vue consolidée multi-niveaux
 *
 * 3 niveaux de lecture :
 *  1. Ensemble du parc (portefeuille global)
 *  2. Par SCI
 *  3. Par Actif
 *
 * Chaque niveau affiche les mêmes KPIs pour comparabilité :
 *  Valorisation, Loyers, Charges, NOI, CRD, Service dette, Cash-flow net,
 *  Rendement brut/net, LTV, DSCR, Taux occupation, Fonds propres
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  computeSciKpis,
  getLoyerAnnuelActif,
  getChargesAnnuelles,
  getValeurEstimee,
  getPrixAcquisition,
  getTotalCRD,
  getServiceDette,
  getRendementBrut,
  getRendementNet,
  getLTV,
  getDSCR,
  isResilie,
} from "../../lib/am-calculations";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import {
  Building2, Landmark, TrendingUp, PiggyBank, BarChart3,
  Activity, Wallet, Shield, Percent, ChevronDown, ChevronUp,
  Layers, Eye, CircleDollarSign, Target, Gauge, ArrowUpDown,
} from "lucide-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];
const toArray = (v: unknown): any[] => Array.isArray(v) ? v : [];

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

type ViewLevel = "parc" | "sci" | "actif";

// ─── KPI Row component ──────────────────────────────────────
interface KpiSet {
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

function computeActifKpi(actif: any, allBaux: any[], allLots: any[], allEmprunts: any[], allActifs: any[]): KpiSet {
  const actifLots = allLots.filter((l: any) => l.actifId === actif.id && !l.archived);
  const actifBaux = allBaux.filter((b: any) => b.actifId === actif.id && !b.archived && !isResilie(b.statut));
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
  const lotsLoues = actifLots.filter((l: any) => l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue").length;

  return {
    label: actif.nom || actif.adresse || "—",
    id: actif.id,
    valorisation,
    prixAcquisition: prixAcq,
    loyerAnnuel,
    charges,
    noi,
    crd,
    serviceDette,
    cashFlowNet,
    rendementBrut: getRendementBrut(loyerAnnuel, prixAcq),
    rendementNet: getRendementNet(loyerAnnuel, charges, prixAcq),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fondsPropreNets: valorisation - crd,
    nbActifs: 1,
    nbLots: actifLots.length,
    nbLotsLoues: lotsLoues,
    tauxOccupation: actifLots.length > 0 ? (lotsLoues / actifLots.length) * 100 : (actifBaux.length > 0 ? 100 : 0),
    plusValue: valorisation - prixAcq,
    plusValuePct: prixAcq > 0 ? ((valorisation - prixAcq) / prixAcq) * 100 : 0,
  };
}

function computeSciKpiSet(sci: any, allActifs: any[], allBaux: any[], allLots: any[], allEmprunts: any[]): KpiSet {
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
  const lotsLoues = sciLots.filter((l: any) => l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue").length;

  return {
    label: sci.nom,
    id: sci.id,
    valorisation,
    prixAcquisition: prixAcq,
    loyerAnnuel,
    charges,
    noi,
    crd,
    serviceDette,
    cashFlowNet,
    rendementBrut: getRendementBrut(loyerAnnuel, prixAcq),
    rendementNet: getRendementNet(loyerAnnuel, charges, prixAcq),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fondsPropreNets: valorisation - crd,
    nbActifs: sciActifs.length,
    nbLots: sciLots.length,
    nbLotsLoues: lotsLoues,
    tauxOccupation: sciLots.length > 0 ? (lotsLoues / sciLots.length) * 100 : 0,
    plusValue: valorisation - prixAcq,
    plusValuePct: prixAcq > 0 ? ((valorisation - prixAcq) / prixAcq) * 100 : 0,
  };
}

function computeParcKpi(allActifs: any[], allBaux: any[], allLots: any[], allEmprunts: any[]): KpiSet {
  const actifs = allActifs.filter((a: any) => !a.archived);
  const lots = allLots.filter((l: any) => !l.archived);
  const empruntsActifs = allEmprunts.filter((e: any) => !e.archived);

  let valorisation = 0, loyerAnnuel = 0, charges = 0, prixAcq = 0;
  for (const a of actifs) {
    valorisation += getValeurEstimee(a, allBaux, allLots);
    loyerAnnuel += getLoyerAnnuelActif(a, allBaux, allLots);
    charges += getChargesAnnuelles(a);
    prixAcq += getPrixAcquisition(a);
  }

  const noi = loyerAnnuel - charges;
  const crd = getTotalCRD(empruntsActifs);
  const serviceDette = getServiceDette(empruntsActifs);
  const cashFlowNet = noi - serviceDette;
  const lotsLoues = lots.filter((l: any) => l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue").length;

  return {
    label: "Ensemble du parc",
    id: "parc",
    valorisation,
    prixAcquisition: prixAcq,
    loyerAnnuel,
    charges,
    noi,
    crd,
    serviceDette,
    cashFlowNet,
    rendementBrut: getRendementBrut(loyerAnnuel, prixAcq),
    rendementNet: getRendementNet(loyerAnnuel, charges, prixAcq),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fondsPropreNets: valorisation - crd,
    nbActifs: actifs.length,
    nbLots: lots.length,
    nbLotsLoues: lotsLoues,
    tauxOccupation: lots.length > 0 ? (lotsLoues / lots.length) * 100 : 0,
    plusValue: valorisation - prixAcq,
    plusValuePct: prixAcq > 0 ? ((valorisation - prixAcq) / prixAcq) * 100 : 0,
  };
}

// ─── Main component ─────────────────────────────────────────

export default function VueParcPage() {
  const [viewLevel, setViewLevel] = useState<ViewLevel>("parc");
  const [selectedSciId, setSelectedSciId] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"bar" | "pie" | "radar">("bar");

  const { data: rawScis } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: rawActifs } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: rawLots } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: rawBaux } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: rawEmprunts } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const scis = toArray(rawScis);
  const actifs = toArray(rawActifs);
  const lots = toArray(rawLots);
  const baux = toArray(rawBaux);
  const emprunts = toArray(rawEmprunts);

  // Compute KPIs based on selected view level
  const parcKpi = useMemo(() => computeParcKpi(actifs, baux, lots, emprunts), [actifs, baux, lots, emprunts]);

  const sciKpis = useMemo(() =>
    scis.filter((s: any) => !s.deletedAt).map((sci: any) => computeSciKpiSet(sci, actifs, baux, lots, emprunts)),
    [scis, actifs, baux, lots, emprunts]
  );

  const actifKpis = useMemo(() => {
    const base = actifs.filter((a: any) => !a.archived);
    const filtered = selectedSciId ? base.filter((a: any) => a.sciId === selectedSciId) : base;
    return filtered.map((a: any) => computeActifKpi(a, baux, lots, emprunts, actifs));
  }, [actifs, baux, lots, emprunts, selectedSciId]);

  // Current focus KPI
  const focusKpi = useMemo((): KpiSet => {
    if (viewLevel === "sci" && selectedSciId) {
      return sciKpis.find((s) => s.id === selectedSciId) || parcKpi;
    }
    return parcKpi;
  }, [viewLevel, selectedSciId, sciKpis, parcKpi]);

  // Table data based on level
  const tableRows: KpiSet[] = useMemo(() => {
    if (viewLevel === "parc") return sciKpis;
    if (viewLevel === "sci") return actifKpis;
    return actifKpis;
  }, [viewLevel, sciKpis, actifKpis]);

  const { sortKey, sortDir, handleSort, sortData } = useSortableTable();
  const sorted = sortData(tableRows);

  // Chart data
  const chartData = useMemo(() =>
    sorted.map((k, i) => ({
      nom: k.label.length > 18 ? k.label.slice(0, 18) + "…" : k.label,
      valorisation: k.valorisation,
      crd: k.crd,
      noi: k.noi,
      loyerAnnuel: k.loyerAnnuel,
      cashFlowNet: k.cashFlowNet,
      rendementBrut: k.rendementBrut,
      ltv: k.ltv,
      color: COLORS[i % COLORS.length],
    })),
    [sorted]
  );

  const radarEntities = useMemo(() => sorted.slice(0, 5), [sorted]);
  const radarData = useMemo(() => {
    const dims = ["Rendement", "Endettement", "DSCR", "Occupation", "Cash-flow"] as const;
    const computeDim = (k: KpiSet, dim: string) => {
      if (dim === "Rendement") return Math.min(k.rendementBrut * 10, 100);
      if (dim === "Endettement") return Math.max(0, 100 - k.ltv);
      if (dim === "DSCR") return Math.min(k.dscr * 40, 100);
      if (dim === "Occupation") return k.tauxOccupation;
      return k.cashFlowNet > 0 ? Math.min(100, (k.cashFlowNet / (k.noi || 1)) * 100) : 0;
    };
    return dims.map((dim) => {
      const row: Record<string, any> = { dimension: dim };
      radarEntities.forEach((e) => { row[e.label] = computeDim(e, dim); });
      return row;
    });
  }, [sorted, radarEntities]);

  // Waterfall data
  const waterfallData = useMemo(() => [
    { name: "Loyers", value: focusKpi.loyerAnnuel, fill: "#10b981" },
    { name: "Charges", value: -focusKpi.charges, fill: "#ef4444" },
    { name: "NOI", value: focusKpi.noi, fill: "#3b82f6" },
    { name: "Svc dette", value: -focusKpi.serviceDette, fill: "#f59e0b" },
    { name: "Cash-flow", value: focusKpi.cashFlowNet, fill: focusKpi.cashFlowNet >= 0 ? "#10b981" : "#ef4444" },
  ], [focusKpi]);

  const levelLabel = viewLevel === "parc" ? "Ensemble du parc"
    : viewLevel === "sci" ? (selectedSciId ? sciKpis.find((s) => s.id === selectedSciId)?.label || "SCI" : "Toutes les SCIs")
    : "Par actif";

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Vue Parc"
          description="Vision consolidée — Parc global, par SCI, par Actif"
        />

        {/* Level selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            {([
              { key: "parc" as const, label: "Parc global", icon: Layers },
              { key: "sci" as const, label: "Par SCI", icon: Landmark },
              { key: "actif" as const, label: "Par Actif", icon: Building2 },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setViewLevel(key); if (key === "parc") setSelectedSciId(null); }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                  viewLevel === key
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* SCI filter (when in SCI or Actif mode) */}
          {(viewLevel === "sci" || viewLevel === "actif") && (
            <select
              value={selectedSciId || ""}
              onChange={(e) => setSelectedSciId(e.target.value || null)}
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium"
            >
              <option value="">Toutes les SCIs</option>
              {scis.filter((s: any) => !s.deletedAt).map((sci: any) => (
                <option key={sci.id} value={sci.id}>{sci.nom}</option>
              ))}
            </select>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {levelLabel}
          </span>
        </div>

        {/* Focus KPIs — 3 rows */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Valorisation" value={Math.round(focusKpi.valorisation)} formatFn={formatCurrency} icon={Target} variant="primary" gradient delay={0} metricKey="valorisation" />
          <KpiCard label="Loyers annuels" value={Math.round(focusKpi.loyerAnnuel)} formatFn={formatCurrency} icon={CircleDollarSign} variant="primary" gradient delay={1} metricKey="loyerAnnuelTotal" />
          <KpiCard label="NOI" value={Math.round(focusKpi.noi)} formatFn={formatCurrency} icon={TrendingUp} variant={focusKpi.noi > 0 ? "success" : "danger"} gradient delay={2} metricKey="noi" />
          <KpiCard label="Fonds propres nets" value={Math.round(focusKpi.fondsPropreNets)} formatFn={formatCurrency} icon={Wallet} variant="primary" gradient delay={3} metricKey="fondsPropreNets" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Cash-flow net" value={Math.round(focusKpi.cashFlowNet)} formatFn={formatCurrency} icon={Activity} variant={focusKpi.cashFlowNet >= 0 ? "success" : "danger"} delay={4} metricKey="cashFlowNet" />
          <KpiCard label="CRD (dette)" value={Math.round(focusKpi.crd)} formatFn={formatCurrency} icon={PiggyBank} variant="warning" delay={5} metricKey="crd" />
          <KpiCard label="Plus-value" value={Math.round(focusKpi.plusValue)} formatFn={formatCurrency} icon={TrendingUp} variant={focusKpi.plusValue >= 0 ? "success" : "danger"} delay={6} trend={focusKpi.plusValuePct} />
          <KpiCard label="Service dette" value={Math.round(focusKpi.serviceDette)} formatFn={formatCurrency} icon={PiggyBank} delay={7} metricKey="serviceDette" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Rendement brut" value={Math.round(focusKpi.rendementBrut * 10) / 10} subtitle="%" icon={Percent} variant={focusKpi.rendementBrut >= 5 ? "success" : focusKpi.rendementBrut >= 3 ? "warning" : "danger"} delay={8} metricKey="rendementBrut" />
          <KpiCard label="Rendement net" value={Math.round(focusKpi.rendementNet * 10) / 10} subtitle="%" icon={Percent} variant={focusKpi.rendementNet >= 4 ? "success" : "warning"} delay={9} metricKey="rendementNet" />
          <KpiCard label="LTV" value={Math.round(focusKpi.ltv * 10) / 10} subtitle="%" icon={Shield} variant={focusKpi.ltv <= 60 ? "success" : focusKpi.ltv <= 80 ? "warning" : "danger"} delay={10} metricKey="ltv" />
          <KpiCard label="DSCR" value={Math.round(focusKpi.dscr * 100) / 100} subtitle="x" icon={Gauge} variant={focusKpi.dscr >= 1.2 ? "success" : focusKpi.dscr >= 1 ? "warning" : "danger"} delay={11} metricKey="dscr" />
          <KpiCard label="Taux occupation" value={Math.round(focusKpi.tauxOccupation)} subtitle="%" icon={Building2} variant={focusKpi.tauxOccupation >= 80 ? "success" : "warning"} delay={12} metricKey="tauxOccupation" />
        </div>

        {/* Waterfall + Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Waterfall */}
          <Section title={`Cascade — ${levelLabel}`}>
            <GlassCard>
              <div className="h-[300px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e3).toFixed(0)}k`} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(Math.abs(v))} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {waterfallData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>

          {/* Comparative chart */}
          <Section title="Comparatif">
            <div className="flex gap-1 mb-3 rounded-lg bg-muted/50 p-1 w-fit">
              {([
                { key: "bar" as const, label: "Barres" },
                { key: "pie" as const, label: "Répartition" },
                { key: "radar" as const, label: "Radar" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setChartType(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    chartType === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <GlassCard>
              <div className="h-[300px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "bar" ? (
                    <BarChart data={chartData} margin={{ bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="nom" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip {...chartTooltipStyle} formatter={(v: number, name: string) => [formatCurrency(v), name === "valorisation" ? "Valorisation" : name === "crd" ? "CRD" : "NOI"]} />
                      <Legend />
                      <Bar dataKey="valorisation" name="Valorisation" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="crd" name="CRD" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="noi" name="NOI" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : chartType === "pie" ? (
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%" cy="50%"
                        outerRadius={100}
                        dataKey="valorisation"
                        nameKey="nom"
                        label={({ nom, percent }) => `${nom} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 0.5 }}
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  ) : (
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={90}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      {radarEntities.map((e, i) => (
                        <Radar
                          key={e.id}
                          name={e.label}
                          dataKey={e.label}
                          fill={COLORS[i]}
                          fillOpacity={0.15}
                          stroke={COLORS[i]}
                          strokeWidth={2}
                        />
                      ))}
                    </RadarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>
        </div>

        {/* Detail table */}
        <Section title={viewLevel === "parc" ? "Détail par SCI" : viewLevel === "sci" ? "Détail par Actif" : "Détail par Actif"}>
          <GlassCard>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader label={viewLevel === "parc" ? "SCI" : "Actif"} sortKey="label" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold" />
                    {viewLevel === "parc" && <SortHeader label="Actifs" sortKey="nbActifs" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />}
                    <SortHeader label="Lots" sortKey="nbLots" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="Valorisation" sortKey="valorisation" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="Loyers/an" sortKey="loyerAnnuel" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="Charges" sortKey="charges" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="NOI" sortKey="noi" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="CRD" sortKey="crd" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="Cash-flow" sortKey="cashFlowNet" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="Rdt brut" sortKey="rendementBrut" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="LTV" sortKey="ltv" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="DSCR" sortKey="dscr" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <SortHeader label="Occup." sortKey="tauxOccupation" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
                    <th className="px-3 py-3 text-right font-semibold">+/- Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row: KpiSet, i: number) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => {
                        if (viewLevel === "parc") {
                          setSelectedSciId(row.id);
                          setViewLevel("sci");
                        } else {
                          setExpandedRow(expandedRow === row.id ? null : row.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {row.label}
                        </div>
                      </td>
                      {viewLevel === "parc" && <td className="px-3 py-3 text-right">{row.nbActifs}</td>}
                      <td className="px-3 py-3 text-right">{row.nbLotsLoues}/{row.nbLots}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatCurrency(row.valorisation)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(row.loyerAnnuel)}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{formatCurrency(row.charges)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${row.noi < 0 ? "text-red-500" : ""}`}>{formatCurrency(row.noi)}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{formatCurrency(row.crd)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${row.cashFlowNet < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>{formatCurrency(row.cashFlowNet)}</td>
                      <td className={`px-3 py-3 text-right ${row.rendementBrut < 5 ? "text-amber-600" : "text-green-600"}`}>{formatPercent(row.rendementBrut)}</td>
                      <td className={`px-3 py-3 text-right ${row.ltv > 60 ? "text-red-500" : row.ltv > 40 ? "text-amber-600" : "text-green-600"}`}>{formatPercent(row.ltv)}</td>
                      <td className={`px-3 py-3 text-right ${row.dscr > 0 && row.dscr < 1.2 ? "text-amber-600" : row.dscr >= 1.2 ? "text-green-600" : "text-red-500"}`}>
                        {row.dscr > 0 ? `${row.dscr.toFixed(2)}x` : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right ${row.tauxOccupation < 80 ? "text-amber-600" : "text-green-600"}`}>{row.tauxOccupation.toFixed(0)}%</td>
                      <td className={`px-3 py-3 text-right font-semibold ${row.plusValue >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {row.plusValue >= 0 ? "+" : ""}{formatCurrency(row.plusValue)}
                        <span className="text-[10px] text-muted-foreground ml-1">({row.plusValuePct >= 0 ? "+" : ""}{row.plusValuePct.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Total row */}
                <tfoot>
                  <tr className="bg-muted/40 font-semibold border-t-2">
                    <td className="px-4 py-3">TOTAL</td>
                    {viewLevel === "parc" && <td className="px-3 py-3 text-right">{sorted.reduce((s: number, r: KpiSet) => s + r.nbActifs, 0)}</td>}
                    <td className="px-3 py-3 text-right">{sorted.reduce((s: number, r: KpiSet) => s + r.nbLotsLoues, 0)}/{sorted.reduce((s: number, r: KpiSet) => s + r.nbLots, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(sorted.reduce((s: number, r: KpiSet) => s + r.valorisation, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(sorted.reduce((s: number, r: KpiSet) => s + r.loyerAnnuel, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(sorted.reduce((s: number, r: KpiSet) => s + r.charges, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(sorted.reduce((s: number, r: KpiSet) => s + r.noi, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(sorted.reduce((s: number, r: KpiSet) => s + r.crd, 0))}</td>
                    <td className={`px-3 py-3 text-right ${focusKpi.cashFlowNet < 0 ? "text-red-500" : "text-green-600"}`}>{formatCurrency(sorted.reduce((s: number, r: KpiSet) => s + r.cashFlowNet, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(focusKpi.rendementBrut)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(focusKpi.ltv)}</td>
                    <td className="px-3 py-3 text-right">{focusKpi.dscr > 0 ? `${focusKpi.dscr.toFixed(2)}x` : "—"}</td>
                    <td className="px-3 py-3 text-right">{focusKpi.tauxOccupation.toFixed(0)}%</td>
                    <td className={`px-3 py-3 text-right ${focusKpi.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {focusKpi.plusValue >= 0 ? "+" : ""}{formatCurrency(focusKpi.plusValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </GlassCard>
        </Section>

        {/* Navigation hint */}
        {viewLevel === "parc" && (
          <p className="text-center text-xs text-muted-foreground">
            Cliquez sur une SCI pour voir le détail par actif
          </p>
        )}
        {viewLevel === "sci" && selectedSciId && (
          <div className="flex justify-center">
            <button
              onClick={() => { setViewLevel("parc"); setSelectedSciId(null); }}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Revenir à la vue Parc global
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
