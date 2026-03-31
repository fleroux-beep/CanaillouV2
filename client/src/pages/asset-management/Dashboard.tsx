import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  computeSciKpis, computeDCF, computeStressTests, computeAmortSchedule,
  getValeurEstimee, getLoyerAnnuelActif, getChargesAnnuelles,
  getTotalCRD, getServiceDette, getRendementBrut, getRendementNet,
  getLTV, getDSCR, getPrixAcquisition,
  type AMEmprunt,
} from "../../lib/am-calculations";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import { KpiCard } from "../../components/ui/kpi-card";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { GlassCard } from "../../components/ui/glass-card";
import { ProgressRing } from "../../components/ui/progress-ring";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { SkeletonKpi, SkeletonCard, SkeletonTable } from "../../components/ui/skeleton";
import {
  Building2, Landmark, Users, FileText, PiggyBank, TrendingUp,
  BarChart3, Shield, Wallet, CircleDollarSign, Activity,
  Target, Gauge, AlertTriangle, ArrowDownUp, Banknote, Percent, Layers, Eye,
} from "lucide-react";

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

type DashboardView = "sci" | "actif" | "parc";

interface ParcKpiSet {
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

function computeActifKpiRow(actif: any, allBaux: any[], allLots: any[], allEmprunts: any[], allActifs: any[]): ParcKpiSet {
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
  const lotsLoues = actifLots.filter((l: any) => l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue").length;
  const actifBaux = allBaux.filter((b: any) => b.actifId === actif.id && !b.archived && b.statut !== "résilié");

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

function computeSciKpiRow(sci: any, allActifs: any[], allBaux: any[], allLots: any[], allEmprunts: any[]): ParcKpiSet {
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

function computeParcKpiRow(allActifs: any[], allBaux: any[], allLots: any[], allEmprunts: any[]): ParcKpiSet {
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

export default function AMDashboard() {
  const [dashboardView, setDashboardView] = useState<DashboardView>("sci");
  const [parcSelectedSciId, setParcSelectedSciId] = useState<string | null>(null);
  const [parcChartType, setParcChartType] = useState<"bar" | "pie" | "radar">("bar");

  const { data: rawScis, isLoading: l1, isError: e1, error: err1 } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: rawActifs, isLoading: l2, isError: e2, error: err2 } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: rawLots, isLoading: l3, isError: e3, error: err3 } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: rawBaux, isLoading: l4, isError: e4, error: err4 } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: rawEmprunts, isLoading: l5, isError: e5, error: err5 } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });
  const { data: rawLocataires } = useQuery({ queryKey: ["/api/am/locataires"], queryFn: () => apiRequest("/api/am/locataires") });
  const { data: rawAssocies } = useQuery({ queryKey: ["/api/am/associes"], queryFn: () => apiRequest("/api/am/associes") });

  const scis = toArray(rawScis);
  const actifs = toArray(rawActifs);
  const lots = toArray(rawLots);
  const baux = toArray(rawBaux);
  const emprunts = toArray(rawEmprunts);
  const locataires = toArray(rawLocataires);
  const associes = toArray(rawAssocies);

  const isLoading = l1 || l2 || l3 || l4 || l5;
  const hasError = e1 || e2 || e3 || e4 || e5;
  const errorDetail = [err1, err2, err3, err4, err5].filter(Boolean).map((e: any) => e?.message).join(" | ");

  // All hooks MUST be called before any conditional return (React rules of hooks)
  const actifsActifs = useMemo(() => actifs.filter((a: any) => !a.archived), [actifs]);
  const empruntsActifs = useMemo(() => emprunts.filter((e: any) => !e.archived), [emprunts]);

  const { valorisation, loyerAnnuel, charges, totalAcquisition } = useMemo(() => {
    let v = 0, l = 0, c = 0, t = 0;
    for (const a of actifsActifs) {
      v += getValeurEstimee(a, baux, lots);
      l += getLoyerAnnuelActif(a, baux, lots);
      c += getChargesAnnuelles(a);
      t += getPrixAcquisition(a);
    }
    return { valorisation: v, loyerAnnuel: l, charges: c, totalAcquisition: t };
  }, [actifsActifs, baux, lots]);

  const noi = loyerAnnuel - charges;
  const crd = useMemo(() => getTotalCRD(empruntsActifs), [empruntsActifs]);
  const serviceDette = useMemo(() => getServiceDette(empruntsActifs), [empruntsActifs]);
  const cashFlowNet = noi - serviceDette;
  const fondsPropreNets = valorisation - crd;
  const rendementBrut = getRendementBrut(loyerAnnuel, totalAcquisition);
  const rendementNet = getRendementNet(loyerAnnuel, charges, totalAcquisition);
  const ltv = getLTV(crd, valorisation);
  const dscr = getDSCR(noi, serviceDette);

  const { lotsLoues, lotsTotal, tauxOccupation } = useMemo(() => {
    const loues = lots.filter((l: any) => l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue" && !l.archived).length;
    const total = lots.filter((l: any) => !l.archived).length;
    return { lotsLoues: loues, lotsTotal: total, tauxOccupation: total > 0 ? (loues / total) * 100 : 0 };
  }, [lots]);

  const equityMultiple = totalAcquisition > 0 ? fondsPropreNets / totalAcquisition : 0;
  const distributionYield = fondsPropreNets > 0 ? (cashFlowNet / fondsPropreNets) * 100 : 0;

  const dcfResult = useMemo(
    () => noi > 0 ? computeDCF(noi, 2.5, 6, 5.5, 10, totalAcquisition) : null,
    [noi, totalAcquisition]
  );

  const stressResults = useMemo(
    () => loyerAnnuel > 0 ? computeStressTests(loyerAnnuel, charges, serviceDette, valorisation, crd, empruntsActifs) : [],
    [loyerAnnuel, charges, serviceDette, valorisation, crd, empruntsActifs]
  );
  const worstCaseScenario = stressResults.length > 0 ? stressResults[stressResults.length - 1] : null;

  const sciKpis = useMemo(() => scis.map((sci: any) => computeSciKpis(sci, actifs, baux, lots, emprunts)), [scis, actifs, baux, lots, emprunts]);

  // Parc view: per-actif and per-SCI KPI rows
  const parcSciKpiRows = useMemo(() =>
    scis.filter((s: any) => !s.deletedAt).map((sci: any) => computeSciKpiRow(sci, actifs, baux, lots, emprunts)),
    [scis, actifs, baux, lots, emprunts]
  );

  const parcActifKpiRows = useMemo(() => {
    const base = actifsActifs;
    const filtered = parcSelectedSciId ? base.filter((a: any) => a.sciId === parcSelectedSciId) : base;
    return filtered.map((a: any) => computeActifKpiRow(a, baux, lots, emprunts, actifs));
  }, [actifsActifs, baux, lots, emprunts, actifs, parcSelectedSciId]);

  const parcGlobalKpi = useMemo(() => computeParcKpiRow(actifs, baux, lots, emprunts), [actifs, baux, lots, emprunts]);

  // Determine parc focus KPI and table rows based on dashboardView
  const parcFocusKpi = useMemo((): ParcKpiSet => {
    if (dashboardView === "sci" && parcSelectedSciId) {
      return parcSciKpiRows.find((s) => s.id === parcSelectedSciId) || parcGlobalKpi;
    }
    return parcGlobalKpi;
  }, [dashboardView, parcSelectedSciId, parcSciKpiRows, parcGlobalKpi]);

  const parcTableRows: ParcKpiSet[] = useMemo(() => {
    if (dashboardView === "actif") return parcActifKpiRows;
    if (dashboardView === "sci") return parcSciKpiRows;
    // parc: show SCIs in table by default
    return parcSciKpiRows;
  }, [dashboardView, parcSciKpiRows, parcActifKpiRows]);

  const { sortKey, sortDir, handleSort, sortData } = useSortableTable();
  const parcSorted = sortData(parcTableRows);

  // Sparkline data: distribution across SCIs (sorted by valorisation)
  const sparkValoByScis = useMemo(() => sciKpis.map((k: any) => k.valorisation).sort((a: number, b: number) => a - b), [sciKpis]);
  const sparkLoyerByScis = useMemo(() => sciKpis.map((k: any) => k.loyerAnnuel).sort((a: number, b: number) => a - b), [sciKpis]);
  const sparkNoiByScis = useMemo(() => sciKpis.map((k: any) => k.noi).sort((a: number, b: number) => a - b), [sciKpis]);
  const sparkCrdByScis = useMemo(() => sciKpis.map((k: any) => k.crd).sort((a: number, b: number) => a - b), [sciKpis]);

  // Décomposition dette année N : service dette, capital remboursé, intérêts
  const detteAnneeN = useMemo(() => {
    let serviceDetteN = 0;
    let capitalRembourseN = 0;
    let interetsN = 0;

    for (const emp of empruntsActifs) {
      const schedule = computeAmortSchedule(emp as unknown as AMEmprunt);
      if (schedule.length === 0) continue;
      // Trouver la ligne de l'année en cours, sinon prendre la première
      const currentRow = schedule.find((r) => r.isCurrent) || schedule[0];
      serviceDetteN += currentRow.annuite;
      capitalRembourseN += currentRow.capitalAmorti;
      interetsN += currentRow.interets;
    }

    return { serviceDetteN, capitalRembourseN, interetsN };
  }, [empruntsActifs]);

  // Total restant à rembourser : CRD + intérêts restants + assurance restante
  const totalRestantARembourser = useMemo(() => {
    let total = 0;
    for (const emp of empruntsActifs) {
      const schedule = computeAmortSchedule(emp as unknown as AMEmprunt);
      if (schedule.length === 0) continue;
      const currentIdx = schedule.findIndex((r) => r.isCurrent);
      const startIdx = currentIdx >= 0 ? currentIdx : 0;
      for (let i = startIdx; i < schedule.length; i++) {
        total += schedule[i].capitalAmorti + schedule[i].interets + schedule[i].assurance;
      }
    }
    return total;
  }, [empruntsActifs]);

  // Parc view chart data
  const parcChartData = useMemo(() =>
    parcSorted.map((k, i) => ({
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
    [parcSorted]
  );

  const parcRadarEntities = useMemo(() => parcSorted.slice(0, 5), [parcSorted]);
  const parcRadarData = useMemo(() => {
    const dims = ["Rendement", "Endettement", "DSCR", "Occupation", "Cash-flow"] as const;
    const computeDim = (k: ParcKpiSet, dim: string) => {
      if (dim === "Rendement") return Math.min(k.rendementBrut * 10, 100);
      if (dim === "Endettement") return Math.max(0, 100 - k.ltv);
      if (dim === "DSCR") return Math.min(k.dscr * 40, 100);
      if (dim === "Occupation") return k.tauxOccupation;
      return k.cashFlowNet > 0 ? Math.min(100, (k.cashFlowNet / (k.noi || 1)) * 100) : 0;
    };
    return dims.map((dim) => {
      const row: Record<string, any> = { dimension: dim };
      parcRadarEntities.forEach((e) => { row[e.label] = computeDim(e, dim); });
      return row;
    });
  }, [parcSorted, parcRadarEntities]);

  const parcWaterfallData = useMemo(() => [
    { name: "Loyers", value: parcFocusKpi.loyerAnnuel, fill: "#10b981" },
    { name: "Charges", value: -parcFocusKpi.charges, fill: "#ef4444" },
    { name: "NOI", value: parcFocusKpi.noi, fill: "#3b82f6" },
    { name: "Svc dette", value: -parcFocusKpi.serviceDette, fill: "#f59e0b" },
    { name: "Cash-flow", value: parcFocusKpi.cashFlowNet, fill: parcFocusKpi.cashFlowNet >= 0 ? "#10b981" : "#ef4444" },
  ], [parcFocusKpi]);

  // Early returns AFTER all hooks
  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Asset Management" description="Chargement des données..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="col-span-2"><SkeletonCard /></div>
          <SkeletonCard />
        </div>
        <SkeletonCard />
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
            <p className="mb-2 text-sm text-muted-foreground">
              Impossible de charger les données. Vérifiez votre connexion et réessayez.
            </p>
            {errorDetail && (
              <p className="mb-4 max-w-md rounded bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                {errorDetail}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white"
            >
              Réessayer
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }
  const sciChartData = sciKpis.map((k: any) => ({
    name: k.sci.nom,
    valorisation: k.valorisation,
    loyers: k.loyerAnnuel,
    dette: k.crd,
    cashFlow: k.cashFlowNet,
  }));

  const pieData = sciKpis
    .filter((k: any) => k.valorisation > 0)
    .map((k: any) => ({ name: k.sci.nom, value: k.valorisation }));

  const waterfallData = [
    { name: "Loyers", value: loyerAnnuel, fill: "#3b82f6" },
    { name: "Charges", value: -charges, fill: "#f59e0b" },
    { name: "NOI", value: noi, fill: "#10b981" },
    { name: "Dette", value: -serviceDette, fill: "#ef4444" },
    { name: "Cash-flow", value: cashFlowNet, fill: cashFlowNet >= 0 ? "#10b981" : "#ef4444" },
  ];

  const viewDescription = dashboardView === "sci"
    ? "Vue d'ensemble du patrimoine immobilier — Niveau SCI"
    : dashboardView === "actif"
    ? "Vue d'ensemble du patrimoine immobilier — Niveau Actif"
    : "Vue d'ensemble du patrimoine immobilier — Niveau Parc";

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Asset Management"
          description={viewDescription}
        />

        {/* View switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            {([
              { key: "actif" as DashboardView, label: "Actif", icon: Building2 },
              { key: "sci" as DashboardView, label: "SCI", icon: Landmark },
              { key: "parc" as DashboardView, label: "Parc", icon: Layers },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setDashboardView(key); if (key !== "parc") setParcSelectedSciId(null); }}
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

          {/* SCI filter for Parc & Actif views */}
          {(dashboardView === "actif" || dashboardView === "parc") && (
            <select
              value={parcSelectedSciId || ""}
              onChange={(e) => setParcSelectedSciId(e.target.value || null)}
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium"
            >
              <option value="">Toutes les SCIs</option>
              {scis.filter((s: any) => !s.deletedAt).map((sci: any) => (
                <option key={sci.id} value={sci.id}>{sci.nom}</option>
              ))}
            </select>
          )}
        </div>

        {/* ─── SCI VIEW (current dashboard) ─── */}
        {dashboardView === "sci" && (<>

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Valorisation" value={valorisation}
            formatFn={formatCurrency} icon={TrendingUp}
            variant="primary" gradient delay={0} metricKey="valorisation"
            sparklineData={sparkValoByScis}
          />
          <KpiCard
            label="Loyers annuels" value={loyerAnnuel}
            formatFn={formatCurrency} icon={CircleDollarSign}
            variant="success" gradient delay={1} metricKey="loyerHT"
            sparklineData={sparkLoyerByScis}
          />
          <KpiCard
            label="NOI" value={noi}
            formatFn={formatCurrency} icon={Activity}
            variant={noi >= 0 ? "success" : "danger"} gradient delay={2} metricKey="noi"
            subtitle={`Charges: ${formatCurrency(charges)}`}
            sparklineData={sparkNoiByScis}
          />
          <KpiCard
            label="Dette (CRD)" value={crd}
            formatFn={formatCurrency} icon={PiggyBank}
            variant="warning" gradient delay={3} metricKey="crd"
            sparklineData={sparkCrdByScis}
          />
          <KpiCard
            label="Fonds propres nets" value={fondsPropreNets}
            formatFn={formatCurrency} icon={Wallet}
            variant="primary" gradient delay={4} metricKey="fondsPropres"
          />
        </div>

        {/* Performance + Rings */}
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard delay={4} className="col-span-2">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Performance
            </h3>
            <div className="grid gap-4 sm:grid-cols-4">
              <KpiCard
                label="Rdt brut" value={rendementBrut}
                formatFn={(n) => formatPercent(n)} icon={BarChart3}
                variant="success" delay={5} metricKey="rendementBrut"
              />
              <KpiCard
                label="Rdt net" value={rendementNet}
                formatFn={(n) => formatPercent(n)} icon={BarChart3}
                variant="success" delay={6} metricKey="rendementNet"
              />
              <KpiCard
                label="Cash-flow/an" value={cashFlowNet}
                formatFn={formatCurrency} icon={Activity}
                variant={cashFlowNet >= 0 ? "success" : "danger"} delay={7} metricKey="cashFlowNet"
              />
              <KpiCard
                label="DSCR" value={dscr}
                formatFn={(n) => n > 0 ? n.toFixed(2) + "x" : "N/A"}
                icon={Shield}
                variant={dscr >= 1.4 ? "success" : dscr >= 1.2 ? "primary" : dscr >= 1.0 ? "warning" : dscr > 0 ? "danger" : "default"}
                delay={8} metricKey="dscr"
              />
            </div>
          </GlassCard>

          <GlassCard delay={5} className="flex items-center justify-around">
            <ProgressRing
              value={tauxOccupation}
              color="hsl(142, 76%, 36%)"
              label={`${tauxOccupation.toFixed(0)}%`}
              sublabel="Occupation"
            />
            <ProgressRing
              value={ltv}
              color={ltv > 80 ? "hsl(0, 84%, 60%)" : ltv > 60 ? "hsl(38, 92%, 50%)" : "hsl(221, 83%, 53%)"}
              label={`${ltv.toFixed(1)}%`}
              sublabel="LTV"
            />
          </GlassCard>
        </div>

        {/* Décomposition dette année N */}
        {detteAnneeN.serviceDetteN > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Service dette (année N)"
              value={detteAnneeN.serviceDetteN}
              formatFn={formatCurrency}
              icon={ArrowDownUp}
              variant="warning"
              delay={5}
              metricKey="serviceDette"
            />
            <KpiCard
              label="Capital remboursé (année N)"
              value={detteAnneeN.capitalRembourseN}
              formatFn={formatCurrency}
              icon={Banknote}
              variant="primary"
              delay={5}
              metricKey="amortissement"
              subtitle={detteAnneeN.serviceDetteN > 0
                ? `${((detteAnneeN.capitalRembourseN / detteAnneeN.serviceDetteN) * 100).toFixed(0)}% de l'annuité`
                : undefined}
            />
            <KpiCard
              label="Intérêts payés (année N)"
              value={detteAnneeN.interetsN}
              formatFn={formatCurrency}
              icon={Percent}
              variant="danger"
              delay={5}
              subtitle={detteAnneeN.serviceDetteN > 0
                ? `${((detteAnneeN.interetsN / detteAnneeN.serviceDetteN) * 100).toFixed(0)}% de l'annuité`
                : undefined}
            />
            <KpiCard
              label="Reste à rembourser"
              value={totalRestantARembourser}
              formatFn={formatCurrency}
              icon={Wallet}
              variant="warning"
              delay={5}
              subtitle="CRD + intérêts + assurance"
            />
          </div>
        )}

        {/* SCPI Institutional Metrics */}
        <GlassCard delay={5}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Indicateurs SCPI institutionnels
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="TRI projeté" value={dcfResult?.irr || 0}
              formatFn={(n) => n > 0 ? formatPercent(n) : "N/A"}
              icon={Target} variant="primary" delay={9} metricKey="tri"
            />
            <KpiCard
              label="Valeur DCF" value={dcfResult?.totalPV || 0}
              formatFn={formatCurrency}
              icon={Gauge} variant="success" delay={10} metricKey="dcf"
              sparklineData={dcfResult?.projectedCashFlows}
              subtitle={dcfResult !== null && totalAcquisition > 0
                ? `${((dcfResult.totalPV / totalAcquisition - 1) * 100).toFixed(1)}% vs acq.`
                : undefined}
            />
            <KpiCard
              label="Distribution yield" value={distributionYield}
              formatFn={(n) => formatPercent(n)}
              icon={CircleDollarSign} variant="success" delay={11}
            />
            <KpiCard
              label="Multiple fonds propres" value={equityMultiple}
              formatFn={(n) => n > 0 ? n.toFixed(2) + "x" : "N/A"}
              icon={TrendingUp} variant={equityMultiple >= 1 ? "success" : "danger"} delay={12}
            />
            <KpiCard
              label="Stress DSCR"
              value={worstCaseScenario?.dscr || 0}
              formatFn={(n) => n > 0 ? n.toFixed(2) + "x" : "N/A"}
              icon={AlertTriangle}
              variant={worstCaseScenario && worstCaseScenario.dscr >= 1 ? "warning" : "danger"}
              delay={13}
              subtitle="Crise majeure"
              metricKey="stressDscr"
              sparklineData={stressResults.map((s: any) => s.dscr)}
            />
          </div>
        </GlassCard>

        {/* Compteurs rapides */}
        <Section title="Portefeuille" delay={3}>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <KpiCard label="SCIs" value={scis.length} icon={Landmark} delay={14} />
            <KpiCard label="Actifs" value={actifsActifs.length} icon={Building2} delay={15} />
            <KpiCard label="Lots" value={lotsTotal} icon={FileText} delay={16} subtitle={`${lotsLoues} loués`} />
            <KpiCard label="Baux" value={baux.filter((b: any) => !b.archived).length} icon={FileText} delay={17} />
            <KpiCard label="Locataires" value={locataires.length} icon={Users} delay={18} />
            <KpiCard label="Associés" value={associes.length} icon={Users} delay={19} />
            <KpiCard label="Emprunts" value={empruntsActifs.length} icon={PiggyBank} delay={20} />
          </div>
        </Section>

        {/* Charts */}
        {sciKpis.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <GlassCard delay={8}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Valorisation par SCI
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1000}
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
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

            <GlassCard delay={9}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Loyers vs Dette par SCI
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sciChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="loyers" name="Loyers" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={800} />
                  <Bar dataKey="dette" name="CRD" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={200} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>
        )}

        {/* Waterfall */}
        {loyerAnnuel > 0 && (
          <GlassCard delay={10}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Cascade des revenus
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(v: number) => formatCurrency(Math.abs(v))}
                />
                <Bar dataKey="value" animationDuration={1000}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} radius={[4, 4, 0, 0] as any} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* SCI Detail Table */}
        {scis.length > 0 && (
          <Section title="Détail par SCI" delay={6}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold">SCI</th>
                    <th className="px-4 py-3 text-right font-semibold">Actifs</th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="valorisation">Valorisation</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="loyerHT">Loyers/an</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="noi">NOI</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="crd">CRD</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="cashFlowNet">Cash-flow</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="rendementBrut">Rdt brut</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="dscr">DSCR</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="ltv">LTV</InfoTooltip></th>
                  </tr>
                </thead>
                <tbody>
                  {sciKpis.map((k: any, i: number) => (
                    <motion.tr
                      key={k.sci.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 0.6 + 0.5) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{k.sci.nom}</td>
                      <td className="px-4 py-3 text-right">{k.actifs.length}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(k.valorisation)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(k.loyerAnnuel)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatCurrency(k.noi)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(k.crd)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${k.cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(k.cashFlowNet)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatPercent(k.rendementBrut)}</td>
                      <td className="px-4 py-3 text-right">
                        {k.dscr > 0 ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            k.dscr >= 1.5 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            k.dscr >= 1.2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                            k.dscr >= 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}>
                            {k.dscr.toFixed(2)}x
                          </span>
                        ) : "N/A"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          k.ltv > 80 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          k.ltv > 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        }`}>
                          {formatPercent(k.ltv)}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                {sciKpis.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{actifsActifs.length}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(valorisation)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(loyerAnnuel)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatCurrency(noi)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(crd)}</td>
                      <td className={`px-4 py-3 text-right ${cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(cashFlowNet)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatPercent(rendementBrut)}</td>
                      <td className="px-4 py-3 text-right">{dscr > 0 ? dscr.toFixed(2) + "x" : "N/A"}</td>
                      <td className="px-4 py-3 text-right">{formatPercent(ltv)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </motion.div>
          </Section>
        )}

        </>)}

        {/* ─── ACTIF VIEW ─── */}
        {dashboardView === "actif" && (<>

        {/* Actif KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Valorisation" value={Math.round(parcFocusKpi.valorisation)} formatFn={formatCurrency} icon={Target} variant="primary" gradient delay={0} metricKey="valorisation" />
          <KpiCard label="Loyers annuels" value={Math.round(parcFocusKpi.loyerAnnuel)} formatFn={formatCurrency} icon={CircleDollarSign} variant="primary" gradient delay={1} metricKey="loyerHT" />
          <KpiCard label="NOI" value={Math.round(parcFocusKpi.noi)} formatFn={formatCurrency} icon={TrendingUp} variant={parcFocusKpi.noi > 0 ? "success" : "danger"} gradient delay={2} metricKey="noi" />
          <KpiCard label="Fonds propres nets" value={Math.round(parcFocusKpi.fondsPropreNets)} formatFn={formatCurrency} icon={Wallet} variant="primary" gradient delay={3} metricKey="fondsPropres" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Cash-flow net" value={Math.round(parcFocusKpi.cashFlowNet)} formatFn={formatCurrency} icon={Activity} variant={parcFocusKpi.cashFlowNet >= 0 ? "success" : "danger"} delay={4} metricKey="cashFlowNet" />
          <KpiCard label="CRD (dette)" value={Math.round(parcFocusKpi.crd)} formatFn={formatCurrency} icon={PiggyBank} variant="warning" delay={5} metricKey="crd" />
          <KpiCard label="Plus-value" value={Math.round(parcFocusKpi.plusValue)} formatFn={formatCurrency} icon={TrendingUp} variant={parcFocusKpi.plusValue >= 0 ? "success" : "danger"} delay={6} />
          <KpiCard label="Service dette" value={Math.round(parcFocusKpi.serviceDette)} formatFn={formatCurrency} icon={PiggyBank} delay={7} metricKey="serviceDette" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Rendement brut" value={Math.round(parcFocusKpi.rendementBrut * 10) / 10} subtitle="%" icon={Percent} variant={parcFocusKpi.rendementBrut >= 5 ? "success" : parcFocusKpi.rendementBrut >= 3 ? "warning" : "danger"} delay={8} metricKey="rendementBrut" />
          <KpiCard label="Rendement net" value={Math.round(parcFocusKpi.rendementNet * 10) / 10} subtitle="%" icon={Percent} variant={parcFocusKpi.rendementNet >= 4 ? "success" : "warning"} delay={9} metricKey="rendementNet" />
          <KpiCard label="LTV" value={Math.round(parcFocusKpi.ltv * 10) / 10} subtitle="%" icon={Shield} variant={parcFocusKpi.ltv <= 60 ? "success" : parcFocusKpi.ltv <= 80 ? "warning" : "danger"} delay={10} metricKey="ltv" />
          <KpiCard label="DSCR" value={Math.round(parcFocusKpi.dscr * 100) / 100} subtitle="x" icon={Gauge} variant={parcFocusKpi.dscr >= 1.2 ? "success" : parcFocusKpi.dscr >= 1 ? "warning" : "danger"} delay={11} metricKey="dscr" />
          <KpiCard label="Taux occupation" value={Math.round(parcFocusKpi.tauxOccupation)} subtitle="%" icon={Building2} variant={parcFocusKpi.tauxOccupation >= 80 ? "success" : "warning"} delay={12} metricKey="tauxOccupation" />
        </div>

        {/* Actif detail table */}
        <Section title="Détail par Actif">
          <GlassCard>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader label="Actif" sortKey="label" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold" />
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
                  {parcSorted.map((row: ParcKpiSet, i: number) => (
                    <tr key={row.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {row.label}
                        </div>
                      </td>
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
                <tfoot>
                  <tr className="bg-muted/40 font-semibold border-t-2">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-3 py-3 text-right">{parcSorted.reduce((s, r) => s + r.nbLotsLoues, 0)}/{parcSorted.reduce((s, r) => s + r.nbLots, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.valorisation, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.loyerAnnuel, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.charges, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.noi, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.crd, 0))}</td>
                    <td className={`px-3 py-3 text-right ${parcFocusKpi.cashFlowNet < 0 ? "text-red-500" : "text-green-600"}`}>{formatCurrency(parcSorted.reduce((s, r) => s + r.cashFlowNet, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(parcFocusKpi.rendementBrut)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(parcFocusKpi.ltv)}</td>
                    <td className="px-3 py-3 text-right">{parcFocusKpi.dscr > 0 ? `${parcFocusKpi.dscr.toFixed(2)}x` : "—"}</td>
                    <td className="px-3 py-3 text-right">{parcFocusKpi.tauxOccupation.toFixed(0)}%</td>
                    <td className={`px-3 py-3 text-right ${parcFocusKpi.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {parcFocusKpi.plusValue >= 0 ? "+" : ""}{formatCurrency(parcFocusKpi.plusValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </GlassCard>
        </Section>

        </>)}

        {/* ─── PARC VIEW ─── */}
        {dashboardView === "parc" && (<>

        {/* Parc KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Valorisation" value={Math.round(parcFocusKpi.valorisation)} formatFn={formatCurrency} icon={Target} variant="primary" gradient delay={0} metricKey="valorisation" />
          <KpiCard label="Loyers annuels" value={Math.round(parcFocusKpi.loyerAnnuel)} formatFn={formatCurrency} icon={CircleDollarSign} variant="primary" gradient delay={1} metricKey="loyerHT" />
          <KpiCard label="NOI" value={Math.round(parcFocusKpi.noi)} formatFn={formatCurrency} icon={TrendingUp} variant={parcFocusKpi.noi > 0 ? "success" : "danger"} gradient delay={2} metricKey="noi" />
          <KpiCard label="Fonds propres nets" value={Math.round(parcFocusKpi.fondsPropreNets)} formatFn={formatCurrency} icon={Wallet} variant="primary" gradient delay={3} metricKey="fondsPropres" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Cash-flow net" value={Math.round(parcFocusKpi.cashFlowNet)} formatFn={formatCurrency} icon={Activity} variant={parcFocusKpi.cashFlowNet >= 0 ? "success" : "danger"} delay={4} metricKey="cashFlowNet" />
          <KpiCard label="CRD (dette)" value={Math.round(parcFocusKpi.crd)} formatFn={formatCurrency} icon={PiggyBank} variant="warning" delay={5} metricKey="crd" />
          <KpiCard label="Plus-value" value={Math.round(parcFocusKpi.plusValue)} formatFn={formatCurrency} icon={TrendingUp} variant={parcFocusKpi.plusValue >= 0 ? "success" : "danger"} delay={6} />
          <KpiCard label="Service dette" value={Math.round(parcFocusKpi.serviceDette)} formatFn={formatCurrency} icon={PiggyBank} delay={7} metricKey="serviceDette" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Rendement brut" value={Math.round(parcFocusKpi.rendementBrut * 10) / 10} subtitle="%" icon={Percent} variant={parcFocusKpi.rendementBrut >= 5 ? "success" : parcFocusKpi.rendementBrut >= 3 ? "warning" : "danger"} delay={8} metricKey="rendementBrut" />
          <KpiCard label="Rendement net" value={Math.round(parcFocusKpi.rendementNet * 10) / 10} subtitle="%" icon={Percent} variant={parcFocusKpi.rendementNet >= 4 ? "success" : "warning"} delay={9} metricKey="rendementNet" />
          <KpiCard label="LTV" value={Math.round(parcFocusKpi.ltv * 10) / 10} subtitle="%" icon={Shield} variant={parcFocusKpi.ltv <= 60 ? "success" : parcFocusKpi.ltv <= 80 ? "warning" : "danger"} delay={10} metricKey="ltv" />
          <KpiCard label="DSCR" value={Math.round(parcFocusKpi.dscr * 100) / 100} subtitle="x" icon={Gauge} variant={parcFocusKpi.dscr >= 1.2 ? "success" : parcFocusKpi.dscr >= 1 ? "warning" : "danger"} delay={11} metricKey="dscr" />
          <KpiCard label="Taux occupation" value={Math.round(parcFocusKpi.tauxOccupation)} subtitle="%" icon={Building2} variant={parcFocusKpi.tauxOccupation >= 80 ? "success" : "warning"} delay={12} metricKey="tauxOccupation" />
        </div>

        {/* Parc Waterfall + Comparative Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Cascade des revenus">
            <GlassCard>
              <div className="h-[300px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={parcWaterfallData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e3).toFixed(0)}k`} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(Math.abs(v))} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {parcWaterfallData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>

          <Section title="Comparatif">
            <div className="flex gap-1 mb-3 rounded-lg bg-muted/50 p-1 w-fit">
              {([
                { key: "bar" as const, label: "Barres" },
                { key: "pie" as const, label: "Répartition" },
                { key: "radar" as const, label: "Radar" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setParcChartType(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    parcChartType === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <GlassCard>
              <div className="h-[300px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  {parcChartType === "bar" ? (
                    <BarChart data={parcChartData} margin={{ bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="nom" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip {...chartTooltipStyle} formatter={(v: number, name: string) => [formatCurrency(v), name === "valorisation" ? "Valorisation" : name === "crd" ? "CRD" : "NOI"]} />
                      <Legend />
                      <Bar dataKey="valorisation" name="Valorisation" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="crd" name="CRD" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="noi" name="NOI" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : parcChartType === "pie" ? (
                    <PieChart>
                      <Pie
                        data={parcChartData}
                        cx="50%" cy="50%"
                        outerRadius={100}
                        dataKey="valorisation"
                        nameKey="nom"
                        label={({ nom, percent }: any) => `${nom} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 0.5 }}
                      >
                        {parcChartData.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  ) : (
                    <RadarChart data={parcRadarData} cx="50%" cy="50%" outerRadius={90}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      {parcRadarEntities.map((e, i) => (
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

        {/* Parc detail table */}
        <Section title="Détail par SCI">
          <GlassCard>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader label="SCI" sortKey="label" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold" />
                    <SortHeader label="Actifs" sortKey="nbActifs" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-3 text-right font-semibold" />
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
                  {parcSorted.map((row: ParcKpiSet, i: number) => (
                    <tr key={row.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {row.label}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">{row.nbActifs}</td>
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
                <tfoot>
                  <tr className="bg-muted/40 font-semibold border-t-2">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-3 py-3 text-right">{parcSorted.reduce((s, r) => s + r.nbActifs, 0)}</td>
                    <td className="px-3 py-3 text-right">{parcSorted.reduce((s, r) => s + r.nbLotsLoues, 0)}/{parcSorted.reduce((s, r) => s + r.nbLots, 0)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.valorisation, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.loyerAnnuel, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.charges, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.noi, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(parcSorted.reduce((s, r) => s + r.crd, 0))}</td>
                    <td className={`px-3 py-3 text-right ${parcFocusKpi.cashFlowNet < 0 ? "text-red-500" : "text-green-600"}`}>{formatCurrency(parcSorted.reduce((s, r) => s + r.cashFlowNet, 0))}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(parcFocusKpi.rendementBrut)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(parcFocusKpi.ltv)}</td>
                    <td className="px-3 py-3 text-right">{parcFocusKpi.dscr > 0 ? `${parcFocusKpi.dscr.toFixed(2)}x` : "—"}</td>
                    <td className="px-3 py-3 text-right">{parcFocusKpi.tauxOccupation.toFixed(0)}%</td>
                    <td className={`px-3 py-3 text-right ${parcFocusKpi.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {parcFocusKpi.plusValue >= 0 ? "+" : ""}{formatCurrency(parcFocusKpi.plusValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </GlassCard>
        </Section>

        </>)}

      </motion.div>
    </AnimatePresence>
  );
}
