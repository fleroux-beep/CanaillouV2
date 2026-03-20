import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  computeSciKpis, computeDCF, computeStressTests,
  getValeurEstimee, getLoyerAnnuelActif, getChargesAnnuelles,
  getTotalCRD, getServiceDette, getRendementBrut, getRendementNet,
  getLTV, getDSCR, getPrixAcquisition,
} from "../../lib/am-calculations";
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
  Target, Gauge, AlertTriangle,
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

export default function AMDashboard() {
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
  const rendementBrut = getRendementBrut(loyerAnnuel, valorisation);
  const rendementNet = getRendementNet(loyerAnnuel, charges, valorisation);
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

  // Sparkline data: distribution across SCIs (sorted by valorisation)
  const sparkValoByScis = useMemo(() => sciKpis.map((k: any) => k.valorisation).sort((a: number, b: number) => a - b), [sciKpis]);
  const sparkLoyerByScis = useMemo(() => sciKpis.map((k: any) => k.loyerAnnuel).sort((a: number, b: number) => a - b), [sciKpis]);
  const sparkNoiByScis = useMemo(() => sciKpis.map((k: any) => k.noi).sort((a: number, b: number) => a - b), [sciKpis]);
  const sparkCrdByScis = useMemo(() => sciKpis.map((k: any) => k.crd).sort((a: number, b: number) => a - b), [sciKpis]);

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

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Asset Management"
          description="Vue d'ensemble du patrimoine immobilier — Niveau SCPI"
        />

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
              metricKey="dscr"
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
      </motion.div>
    </AnimatePresence>
  );
}
