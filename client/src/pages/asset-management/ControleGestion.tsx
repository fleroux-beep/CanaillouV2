import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
  AreaChart, Area,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent, formatNumber } from "../../lib/utils";
import {
  computeSciKpis,
  getLoyerAnnuelActif,
  getChargesAnnuelles,
  getRendementNet,
  getValeurEstimee,
  getPrixAcquisition,
  getTotalCRD,
  getServiceDette,
  computeMultiYearProjection,
  computeAssocieNAV,
  type ProjectionYear,
} from "../../lib/am-calculations";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  Calculator, Receipt, TrendingUp, Percent, Building2,
  Users, ArrowDownUp, BarChart3, LineChartIcon,
} from "lucide-react";
import { InfoTooltip } from "../../components/ui/info-tooltip";

function EditableCell({ actifId, field, value, updateFn }: { actifId: string; field: string; value: number; updateFn: any }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value || 0));

  if (!editing) {
    return (
      <td
        className="px-4 py-3 text-right text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => { setVal(String(value || 0)); setEditing(true); }}
        title="Cliquer pour modifier"
      >
        {value > 0 ? formatCurrency(value) : "—"}
      </td>
    );
  }

  return (
    <td className="px-4 py-1 text-right">
      <input
        type="number"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const num = parseFloat(val) || 0;
          if (num !== value) {
            updateFn.mutate({ id: actifId, [field]: String(num) });
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
      />
    </td>
  );
}

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

export default function ControleGestionPage() {
  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });
  const { data: associes = [] } = useQuery({ queryKey: ["/api/am/associes"], queryFn: () => apiRequest("/api/am/associes") });
  const { data: participations = [] } = useQuery({ queryKey: ["/api/am/participations"], queryFn: () => apiRequest("/api/am/participations") });

  const queryClient = useQueryClient();
  const updateActif = useMutation({
    mutationFn: (data: { id: string; [key: string]: any }) =>
      apiRequest(`/api/am/actifs/${data.id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/am/actifs"] }),
  });

  const actifSort = useSortableTable();
  const sciSort = useSortableTable();
  const navSort = useSortableTable();
  const projSort = useSortableTable();

  const [projGrowthLoyer, setProjGrowthLoyer] = useState(2);
  const [projInflationCharges, setProjInflationCharges] = useState(2.5);
  const [projAppreciation, setProjAppreciation] = useState(1.5);
  const [projYears, setProjYears] = useState(10);

  const actifsActifs = useMemo(() => actifs.filter((a: any) => !a.archived), [actifs]);
  const empruntsActifs = useMemo(() => emprunts.filter((e: any) => !e.archived), [emprunts]);

  // Portfolio-level aggregation
  const portfolioData = useMemo(() => {
    let totalLoyers = 0;
    let totalCharges = 0;
    let totalTaxeFonciere = 0;
    let totalAssurancePno = 0;
    let totalChargesCopro = 0;
    let totalValorisation = 0;

    const actifDetails: any[] = [];

    for (const a of actifsActifs) {
      const loyerAnnuel = getLoyerAnnuelActif(a, baux, lots);
      const charges = getChargesAnnuelles(a);
      const valorisation = getValeurEstimee(a, baux, lots);
      const prixAcq = getPrixAcquisition(a);
      const noi = loyerAnnuel - charges;
      const rendementNet = getRendementNet(loyerAnnuel, charges, prixAcq);

      const taxeFonciere = Number(a.taxeFonciere || 0);
      const assurancePno = Number(a.assurancePno || 0);
      const chargesCopro = Number(a.chargesCopropriete || a.chargesAnnuelles || 0);

      totalLoyers += loyerAnnuel;
      totalCharges += charges;
      totalTaxeFonciere += taxeFonciere;
      totalAssurancePno += assurancePno;
      totalChargesCopro += chargesCopro;
      totalValorisation += valorisation;

      const sci = scis.find((s: any) => s.id === a.sciId);
      actifDetails.push({
        id: a.id,
        nom: a.nom || a.adresse || `Actif #${a.id}`,
        sciNom: sci?.nom || "—",
        loyerAnnuel,
        charges,
        noi,
        rendementNet,
        taxeFonciere,
        assurancePno,
        chargesCopro,
        ratioCharges: loyerAnnuel > 0 ? (charges / loyerAnnuel) * 100 : 0,
      });
    }

    let totalAutres = totalCharges - totalTaxeFonciere - totalAssurancePno - totalChargesCopro;
    if (totalAutres < 0) totalAutres = 0;

    const totalCRD = getTotalCRD(empruntsActifs);
    const totalServiceDette = getServiceDette(empruntsActifs);
    const noi = totalLoyers - totalCharges;
    const cashFlowNet = noi - totalServiceDette;

    return {
      totalLoyers, totalCharges, totalTaxeFonciere, totalAssurancePno,
      totalChargesCopro, totalAutres, totalValorisation, totalCRD,
      totalServiceDette, noi, cashFlowNet, actifDetails,
      ratioChargesLoyers: totalLoyers > 0 ? (totalCharges / totalLoyers) * 100 : 0,
    };
  }, [actifsActifs, baux, lots, scis, empruntsActifs]);

  // Per-SCI data
  const sciKpis = useMemo(
    () => scis.map((sci: any) => computeSciKpis(sci, actifs, baux, lots, emprunts)),
    [scis, actifs, baux, lots, emprunts]
  );

  // NAV per associé
  const totalNAV = portfolioData.totalValorisation - portfolioData.totalCRD;
  const associeNAVs = useMemo(
    () => computeAssocieNAV(totalNAV, portfolioData.totalLoyers, associes, participations, sciKpis),
    [totalNAV, portfolioData.totalLoyers, associes, participations, sciKpis]
  );

  // Multi-year projection
  const amortAnnuel = useMemo(() => {
    if (empruntsActifs.length === 0) return 0;
    return empruntsActifs.reduce((sum: number, e: any) => {
      const montant = Number(e.montantEmprunte || 0);
      const duree = Number(e.dureeAns || 0);
      return sum + (duree > 0 ? montant / duree : 0);
    }, 0);
  }, [empruntsActifs]);

  const projection: ProjectionYear[] = useMemo(() => {
    if (portfolioData.totalLoyers <= 0) return [];
    return computeMultiYearProjection(
      portfolioData.totalLoyers,
      portfolioData.totalCharges,
      portfolioData.totalServiceDette,
      portfolioData.totalValorisation,
      portfolioData.totalCRD,
      projGrowthLoyer,
      projInflationCharges,
      projAppreciation,
      amortAnnuel,
      projYears,
    );
  }, [portfolioData, projGrowthLoyer, projInflationCharges, projAppreciation, amortAnnuel, projYears]);

  // Charts data (memoized)
  const chargesPieData = useMemo(() => [
    { name: "Taxe foncière", value: portfolioData.totalTaxeFonciere },
    { name: "Assurance PNO", value: portfolioData.totalAssurancePno },
    { name: "Charges copropriété", value: portfolioData.totalChargesCopro },
    { name: "Autres", value: portfolioData.totalAutres },
  ].filter((d) => d.value > 0), [portfolioData]);

  // Waterfall: Loyers -> Charges -> NOI -> Dette -> Cash-flow (memoized)
  const waterfallData = useMemo(() => [
    { name: "Loyers", value: portfolioData.totalLoyers, fill: "#10b981" },
    { name: "Charges", value: -portfolioData.totalCharges, fill: "#f59e0b" },
    { name: "NOI", value: portfolioData.noi, fill: portfolioData.noi >= 0 ? "#3b82f6" : "#ef4444" },
    { name: "Service dette", value: -portfolioData.totalServiceDette, fill: "#8b5cf6" },
    { name: "Cash-flow net", value: portfolioData.cashFlowNet, fill: portfolioData.cashFlowNet >= 0 ? "#10b981" : "#ef4444" },
  ], [portfolioData]);

  // Per-actif NOI chart (memoized)
  const actifNoiChart = useMemo(() => [...portfolioData.actifDetails]
    .sort((a: any, b: any) => b.noi - a.noi)
    .map((a: any) => ({
      name: a.nom.length > 18 ? a.nom.substring(0, 18) + "…" : a.nom,
      "Loyers": a.loyerAnnuel,
      "Charges": a.charges,
      "NOI": a.noi,
    })), [portfolioData]);

  // Projection chart data (memoized)
  const projectionChart = useMemo(() => projection.map((p) => ({
    year: p.label,
    "Cash-flow": Math.round(p.cashFlow),
    "NOI": Math.round(p.noi),
    "DSCR": Number(p.dscr.toFixed(2)),
    "LTV": Number(p.ltv.toFixed(1)),
  })), [projection]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Contrôle de gestion"
          description="Suivi budgétaire, projections et analyse des charges"
        />

        {/* Hero KPIs - Row 1 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Loyers annuels" value={portfolioData.totalLoyers} formatFn={formatCurrency} icon={TrendingUp} variant="success" gradient delay={0} metricKey="loyerHT" />
          <KpiCard label="Charges totales" value={portfolioData.totalCharges} formatFn={formatCurrency} icon={Receipt} variant="warning" gradient delay={1} metricKey="chargesAnnuelles" />
          <KpiCard label="NOI" value={portfolioData.noi} formatFn={formatCurrency} icon={Calculator} variant={portfolioData.noi >= 0 ? "primary" : "danger"} gradient delay={2} metricKey="noi" />
          <KpiCard
            label="Ratio charges/loyers"
            value={portfolioData.ratioChargesLoyers}
            formatFn={(n) => formatPercent(n)}
            icon={Percent}
            variant={portfolioData.ratioChargesLoyers < 30 ? "success" : portfolioData.ratioChargesLoyers < 50 ? "warning" : "danger"}
            gradient
            delay={3}
          />
        </div>

        {/* KPIs Row 2 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Service de la dette" value={portfolioData.totalServiceDette} formatFn={formatCurrency} icon={ArrowDownUp} delay={4} metricKey="serviceDette" />
          <KpiCard label="Cash-flow net" value={portfolioData.cashFlowNet} formatFn={formatCurrency} icon={BarChart3} variant={portfolioData.cashFlowNet >= 0 ? "success" : "danger"} delay={5} metricKey="cashFlowNet" />
          <KpiCard label="NAV portefeuille" value={totalNAV} formatFn={formatCurrency} icon={Building2} variant="primary" delay={6} metricKey="nav" />
          <KpiCard label="Nombre d'actifs" value={actifsActifs.length} icon={Building2} delay={7} />
        </div>

        {/* Waterfall: Loyers → Cash-flow */}
        <GlassCard delay={8}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Cascade de trésorerie — Du loyer au cash-flow
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" name="Montant" radius={[4, 4, 0, 0]} animationDuration={800}>
                {waterfallData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Charges pie + Per-actif NOI side by side */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Charges breakdown pie chart */}
          {chargesPieData.length > 0 && (
            <GlassCard delay={9}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Répartition des charges
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chargesPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1000}
                  >
                    {chargesPieData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {chargesPieData.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.name}: {formatCurrency(d.value)}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* NOI per actif */}
          {actifNoiChart.length > 0 && (
            <GlassCard delay={10}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Loyers vs Charges par actif
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={actifNoiChart} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="Loyers" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={800} />
                  <Bar dataKey="Charges" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex justify-center gap-6">
                <div className="flex items-center gap-1.5 text-xs"><div className="h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} /> Loyers</div>
                <div className="flex items-center gap-1.5 text-xs"><div className="h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} /> Charges</div>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Per-actif detail table */}
        {portfolioData.actifDetails.length > 0 && (
          <Section title="Détail par actif" delay={11}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader label="Actif" sortKey="nom" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label="SCI" sortKey="sciNom" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="loyerHT">Loyers/an</InfoTooltip>} sortKey="loyerAnnuel" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="taxeFonciere">Taxe fonc.</InfoTooltip>} sortKey="taxeFonciere" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="assurance">Assurance</InfoTooltip>} sortKey="assurancePno" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label="Copropriété" sortKey="chargesCopro" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="chargesAnnuelles">Charges tot.</InfoTooltip>} sortKey="charges" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="noi">NOI</InfoTooltip>} sortKey="noi" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label="Ratio" sortKey="ratioCharges" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="rendementNet">Rdt net</InfoTooltip>} sortKey="rendementNet" align="right" currentSortKey={actifSort.sortKey} sortDir={actifSort.sortDir} onSort={actifSort.handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {actifSort.sortData(portfolioData.actifDetails).map((a: any, i: number) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 1.1) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{a.nom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.sciNom}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(a.loyerAnnuel)}</td>
                      <EditableCell actifId={a.id} field="taxeFonciere" value={a.taxeFonciere} updateFn={updateActif} />
                      <EditableCell actifId={a.id} field="assurancePno" value={a.assurancePno} updateFn={updateActif} />
                      <EditableCell actifId={a.id} field="chargesCopropriete" value={a.chargesCopro} updateFn={updateActif} />
                      <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(a.charges)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${a.noi >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(a.noi)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.ratioCharges < 30 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          a.ratioCharges < 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {formatPercent(a.ratioCharges)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${a.rendementNet > 4 ? "text-green-600" : a.rendementNet > 2 ? "text-amber-600" : "text-red-500"}`}>
                        {formatPercent(a.rendementNet)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalLoyers)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalTaxeFonciere)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalAssurancePno)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalChargesCopro)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(portfolioData.totalCharges)}</td>
                    <td className={`px-4 py-3 text-right ${portfolioData.noi >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(portfolioData.noi)}</td>
                    <td className="px-4 py-3 text-right">{formatPercent(portfolioData.ratioChargesLoyers)}</td>
                    <td className="px-4 py-3 text-right">—</td>
                  </tr>
                </tfoot>
              </table>
            </motion.div>
          </Section>
        )}

        {/* Per-SCI table */}
        {sciKpis.length > 0 && (
          <Section title="Synthèse par SCI" delay={12}>
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
                    <SortHeader label={<InfoTooltip metricKey="valorisation">Valorisation</InfoTooltip>} sortKey="valorisation" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="loyerHT">Loyers/an</InfoTooltip>} sortKey="loyerAnnuel" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="chargesAnnuelles">Charges/an</InfoTooltip>} sortKey="charges" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="noi">NOI</InfoTooltip>} sortKey="noi" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="crd">CRD</InfoTooltip>} sortKey="crd" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="cashFlowNet">Cash-flow</InfoTooltip>} sortKey="cashFlowNet" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                    <th className="px-4 py-3 text-right font-semibold">Ratio</th>
                    <SortHeader label={<InfoTooltip metricKey="ltv">LTV</InfoTooltip>} sortKey="ltv" align="right" currentSortKey={sciSort.sortKey} sortDir={sciSort.sortDir} onSort={sciSort.handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sciSort.sortData(sciKpis).map((k: any, i: number) => {
                    const ratio = k.loyerAnnuel > 0 ? (k.charges / k.loyerAnnuel) * 100 : 0;
                    return (
                      <motion.tr
                        key={k.sci.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(0.6 + i * 0.05, 1.1) }}
                        className="border-t transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3 font-medium">{k.sci.nom}</td>
                        <td className="px-4 py-3 text-right">{k.actifs.length}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(k.valorisation)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(k.loyerAnnuel)}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(k.charges)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${k.noi >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {formatCurrency(k.noi)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatCurrency(k.crd)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${k.cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {formatCurrency(k.cashFlowNet)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            ratio < 30 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            ratio < 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}>
                            {formatPercent(ratio)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={k.ltv < 60 ? "text-green-600" : k.ltv < 80 ? "text-amber-600" : "text-red-500"}>
                            {formatPercent(k.ltv)}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{actifsActifs.length}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalValorisation)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalLoyers)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(portfolioData.totalCharges)}</td>
                    <td className={`px-4 py-3 text-right ${portfolioData.noi >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(portfolioData.noi)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(portfolioData.totalCRD)}</td>
                    <td className={`px-4 py-3 text-right ${portfolioData.cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(portfolioData.cashFlowNet)}</td>
                    <td className="px-4 py-3 text-right">{formatPercent(portfolioData.ratioChargesLoyers)}</td>
                    <td className="px-4 py-3 text-right">{portfolioData.totalValorisation > 0 ? formatPercent((portfolioData.totalCRD / portfolioData.totalValorisation) * 100) : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </motion.div>
          </Section>
        )}

        {/* NAV par associé */}
        {associeNAVs.length > 0 && (
          <Section title="Valeur liquidative par associé (NAV)" delay={13}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader label="Associé" sortKey="associeNom" currentSortKey={navSort.sortKey} sortDir={navSort.sortDir} onSort={navSort.handleSort} />
                    <SortHeader label="Part (%)" sortKey="partPct" align="right" currentSortKey={navSort.sortKey} sortDir={navSort.sortDir} onSort={navSort.handleSort} />
                    <SortHeader label="Apport" sortKey="apport" align="right" currentSortKey={navSort.sortKey} sortDir={navSort.sortDir} onSort={navSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="nav">NAV</InfoTooltip>} sortKey="navPart" align="right" currentSortKey={navSort.sortKey} sortDir={navSort.sortDir} onSort={navSort.handleSort} />
                    <SortHeader label={<InfoTooltip metricKey="plusValueLatente">+/- Value latente</InfoTooltip>} sortKey="plusValueLatente" align="right" currentSortKey={navSort.sortKey} sortDir={navSort.sortDir} onSort={navSort.handleSort} />
                    <SortHeader label="Rendement annualisé" sortKey="rendementAnnuelise" align="right" currentSortKey={navSort.sortKey} sortDir={navSort.sortDir} onSort={navSort.handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {navSort.sortData(associeNAVs).map((a, i) => (
                    <motion.tr
                      key={a.associeId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 1.1) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {a.associeNom}
                      </td>
                      <td className="px-4 py-3 text-right">{formatPercent(a.partPct)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(a.apport)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(a.navPart)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${a.plusValueLatente >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {a.plusValueLatente >= 0 ? "+" : ""}{formatCurrency(a.plusValueLatente)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${a.rendementAnnuelise > 5 ? "text-green-600" : a.rendementAnnuelise > 2 ? "text-amber-600" : "text-red-500"}`}>
                        {formatPercent(a.rendementAnnuelise)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </Section>
        )}

        {/* Multi-year projection */}
        {portfolioData.totalLoyers > 0 && (
          <Section title="Projections multi-annuelles" delay={14}>
            <GlassCard>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Croissance loyers (%/an)</label>
                  <input type="number" value={projGrowthLoyer} onChange={(e) => setProjGrowthLoyer(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm" step={0.5} min={0} max={10} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Inflation charges (%/an)</label>
                  <input type="number" value={projInflationCharges} onChange={(e) => setProjInflationCharges(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm" step={0.5} min={0} max={10} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Appréciation actifs (%/an)</label>
                  <input type="number" value={projAppreciation} onChange={(e) => setProjAppreciation(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm" step={0.5} min={-5} max={10} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Horizon (années)</label>
                  <input type="number" value={projYears} onChange={(e) => setProjYears(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm" step={1} min={3} max={30} />
                </div>
              </div>

              {/* Cash-flow + NOI projection chart */}
              {projectionChart.length > 0 && (
                <>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Évolution NOI et Cash-flow
                  </h4>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={projectionChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                      <Area type="monotone" dataKey="NOI" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} animationDuration={800} />
                      <Area type="monotone" dataKey="Cash-flow" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} animationDuration={800} />
                      <Legend />
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* DSCR + LTV projection */}
                  <h4 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Évolution DSCR et LTV
                  </h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={projectionChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} />
                      <Line yAxisId="left" type="monotone" dataKey="DSCR" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} animationDuration={800} />
                      <Line yAxisId="right" type="monotone" dataKey="LTV" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} animationDuration={800} />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </GlassCard>

            {/* Projection table */}
            {projection.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <SortHeader label="Année" sortKey="year" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="loyerHT">Loyers</InfoTooltip>} sortKey="loyers" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="charges">Charges</InfoTooltip>} sortKey="charges" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="noi">NOI</InfoTooltip>} sortKey="noi" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="serviceDette">Service dette</InfoTooltip>} sortKey="serviceDette" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="cashFlowNet">Cash-flow</InfoTooltip>} sortKey="cashFlow" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="valorisation">Valorisation</InfoTooltip>} sortKey="valorisation" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="rendementNet">Rdt net</InfoTooltip>} sortKey="rendementNet" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="dscr">DSCR</InfoTooltip>} sortKey="dscr" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                      <SortHeader label={<InfoTooltip metricKey="ltv">LTV</InfoTooltip>} sortKey="ltv" align="right" currentSortKey={projSort.sortKey} sortDir={projSort.sortDir} onSort={projSort.handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {projSort.sortData(projection).map((p, i) => (
                      <motion.tr
                        key={p.year}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(0.7 + i * 0.03, 1.2) }}
                        className={`border-t transition-colors hover:bg-muted/20 ${i === 0 ? "bg-muted/10 font-medium" : ""}`}
                      >
                        <td className="px-4 py-3 font-medium">{p.label}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(p.loyers)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(p.charges)}</td>
                        <td className={`px-4 py-3 text-right ${p.noi >= 0 ? "" : "text-red-500"}`}>{formatCurrency(p.noi)}</td>
                        <td className="px-4 py-3 text-right text-purple-600">{formatCurrency(p.serviceDette)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${p.cashFlow >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(p.cashFlow)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(p.valorisation)}</td>
                        <td className="px-4 py-3 text-right">{formatPercent(p.rendementNet)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={p.dscr > 1.2 ? "text-green-600" : p.dscr > 1 ? "text-amber-600" : "text-red-500"}>
                            {p.dscr > 0 ? p.dscr.toFixed(2) + "x" : "N/A"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={p.ltv < 60 ? "text-green-600" : p.ltv < 80 ? "text-amber-600" : "text-red-500"}>
                            {formatPercent(p.ltv)}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
