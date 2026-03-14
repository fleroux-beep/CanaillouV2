import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, LineChart, Line, Legend,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  computeStressTests, computeDCF, computeNPV,
  computeMultiYearProjection,
  getValeurEstimee, getLoyerAnnuelActif, getChargesAnnuelles,
  getTotalCRD, getServiceDette, getPrixAcquisition,
} from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import {
  Shield, TrendingUp, Activity, Calculator, AlertTriangle,
  Target, Gauge, BarChart3,
} from "lucide-react";

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

function SliderInput({
  label, value, onChange, min, max, step, unit, description,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string; description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-sm font-semibold tabular-nums text-primary">{value}{unit}</span>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary h-2 rounded-full appearance-none bg-muted cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

export default function SimulateurPage() {
  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const [activeTab, setActiveTab] = useState("dcf");

  // DCF parameters
  const [growthRate, setGrowthRate] = useState(2.5);
  const [discountRate, setDiscountRate] = useState(6);
  const [exitCapRate, setExitCapRate] = useState(5.5);
  const [dcfYears, setDcfYears] = useState(10);

  // Projection parameters
  const [projGrowthLoyer, setProjGrowthLoyer] = useState(2.5);
  const [projInflationCharges, setProjInflationCharges] = useState(2);
  const [projAppreciationActif, setProjAppreciationActif] = useState(1.5);
  const [projYears, setProjYears] = useState(10);

  // Portfolio totals
  const actifsActifs = actifs.filter((a: any) => !a.archived);
  const empruntsActifs = emprunts.filter((e: any) => !e.archived);

  let valorisation = 0, loyerAnnuel = 0, charges = 0, totalAcquisition = 0;
  for (const a of actifsActifs) {
    valorisation += getValeurEstimee(a, baux, lots);
    loyerAnnuel += getLoyerAnnuelActif(a, baux, lots);
    charges += getChargesAnnuelles(a);
    totalAcquisition += getPrixAcquisition(a);
  }

  const noi = loyerAnnuel - charges;
  const crd = getTotalCRD(empruntsActifs);
  const serviceDette = getServiceDette(empruntsActifs);
  const cashFlowNet = noi - serviceDette;

  // DCF
  const dcfResult = useMemo(
    () => computeDCF(noi, growthRate, discountRate, exitCapRate, dcfYears, totalAcquisition),
    [noi, growthRate, discountRate, exitCapRate, dcfYears, totalAcquisition]
  );

  const dcfChartData = useMemo(() => {
    const r = discountRate / 100;
    return dcfResult.projectedCashFlows.map((cf, i) => ({
      name: `N+${i + 1}`,
      "Cash-flow projeté": Math.round(cf),
      "Valeur actualisée": Math.round(cf / Math.pow(1 + r, i + 1)),
    }));
  }, [dcfResult, discountRate]);

  // NPV sensitivity
  const npvSensitivity = useMemo(() => {
    const rates = [3, 4, 5, 6, 7, 8, 9, 10];
    const flows = [-totalAcquisition, ...dcfResult.projectedCashFlows];
    flows[flows.length - 1] += dcfResult.terminalValue;
    return rates.map((r) => ({
      taux: `${r}%`,
      van: Math.round(computeNPV(flows, r)),
    }));
  }, [totalAcquisition, dcfResult]);

  // Stress tests
  const stressResults = useMemo(
    () => computeStressTests(loyerAnnuel, charges, serviceDette, valorisation, crd),
    [loyerAnnuel, charges, serviceDette, valorisation, crd]
  );

  // Multi-year projection
  const amortAnnuel = empruntsActifs.length > 0 ? crd / 20 : 0;
  const projection = useMemo(
    () => computeMultiYearProjection(
      loyerAnnuel, charges, serviceDette, valorisation, crd,
      projGrowthLoyer, projInflationCharges, projAppreciationActif, amortAnnuel, projYears
    ),
    [loyerAnnuel, charges, serviceDette, valorisation, crd, projGrowthLoyer, projInflationCharges, projAppreciationActif, amortAnnuel, projYears]
  );

  const projChartData = projection.map((p) => ({
    name: p.label,
    "Loyers": Math.round(p.loyers),
    "NOI": Math.round(p.noi),
    "Cash-flow": Math.round(p.cashFlow),
  }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Simulateur SCPI"
          description="DCF, stress tests et projections multi-facteurs"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Valeur DCF" value={dcfResult.totalPV}
            formatFn={formatCurrency} icon={Target}
            variant="primary" gradient delay={0}
          />
          <KpiCard
            label="TRI projeté" value={dcfResult.irr || 0}
            formatFn={(n) => n > 0 ? formatPercent(n) : "N/A"}
            icon={TrendingUp} variant="success" gradient delay={1}
          />
          <KpiCard
            label="Prime DCF" value={dcfResult.totalPV - totalAcquisition}
            formatFn={formatCurrency} icon={Activity}
            variant={dcfResult.totalPV > totalAcquisition ? "success" : "danger"}
            gradient delay={2}
          />
          <KpiCard
            label="Val. terminale" value={dcfResult.terminalValue}
            formatFn={formatCurrency} icon={Calculator}
            variant="warning" gradient delay={3}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dcf">DCF & TRI</TabsTrigger>
            <TabsTrigger value="stress">Stress Tests</TabsTrigger>
            <TabsTrigger value="projection">Projection N+10</TabsTrigger>
            <TabsTrigger value="sensibilite">Sensibilite</TabsTrigger>
          </TabsList>

          {/* DCF Tab */}
          <TabsContent value="dcf">
            <div className="grid gap-6 lg:grid-cols-3 mt-6">
              {/* Parameters */}
              <GlassCard delay={0} className="space-y-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Hypothèses DCF
                </h3>
                <SliderInput
                  label="Croissance loyers" value={growthRate} onChange={setGrowthRate}
                  min={0} max={8} step={0.5} unit="%" description="Taux ILC/ILAT prévisionnel"
                />
                <SliderInput
                  label="Taux d'actualisation" value={discountRate} onChange={setDiscountRate}
                  min={2} max={15} step={0.5} unit="%" description="WACC / coût du capital"
                />
                <SliderInput
                  label="Cap rate de sortie" value={exitCapRate} onChange={setExitCapRate}
                  min={3} max={10} step={0.25} unit="%" description="Taux de capitalisation à la revente"
                />
                <SliderInput
                  label="Horizon" value={dcfYears} onChange={setDcfYears}
                  min={5} max={20} step={1} unit=" ans"
                />
              </GlassCard>

              {/* Chart */}
              <GlassCard delay={1} className="lg:col-span-2">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Cash-flows projetés vs actualisés
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={dcfChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="Cash-flow projeté" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Valeur actualisée" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">PV Cash-flows</div>
                    <div className="text-lg font-bold text-primary">{formatCurrency(dcfResult.pvCashFlows)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">PV Terminal</div>
                    <div className="text-lg font-bold text-amber-600">{formatCurrency(dcfResult.pvTerminal)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">Valeur totale DCF</div>
                    <div className="text-lg font-bold text-green-600">{formatCurrency(dcfResult.totalPV)}</div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Stress Test Tab */}
          <TabsContent value="stress">
            <div className="space-y-6 mt-6">
              {/* Stress table */}
              <GlassCard delay={0}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Scenarios de stress
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left font-semibold">Scenario</th>
                        <th className="px-4 py-3 text-right font-semibold">Loyers</th>
                        <th className="px-4 py-3 text-right font-semibold">Charges</th>
                        <th className="px-4 py-3 text-right font-semibold">NOI</th>
                        <th className="px-4 py-3 text-right font-semibold">Cash-flow</th>
                        <th className="px-4 py-3 text-right font-semibold">DSCR</th>
                        <th className="px-4 py-3 text-right font-semibold">Rdt net</th>
                        <th className="px-4 py-3 text-center font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stressResults.map((s, i) => {
                        const isBase = i === 0;
                        const danger = s.dscr < 1 || s.cashFlowAjuste < 0;
                        const warning = s.dscr < 1.2 && s.dscr >= 1;
                        return (
                          <motion.tr
                            key={s.label}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(0.1 + i * 0.05, 0.1 + 0.5) }}
                            className={`border-t transition-colors hover:bg-muted/20 ${isBase ? "bg-muted/10 font-medium" : ""}`}
                          >
                            <td className="px-4 py-3 font-medium">{s.label}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(s.loyerAjuste)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(s.chargesAjustees)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(s.noiAjuste)}</td>
                            <td className={`px-4 py-3 text-right font-medium ${s.cashFlowAjuste < 0 ? "text-red-500" : "text-green-600"}`}>
                              {formatCurrency(s.cashFlowAjuste)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                s.dscr >= 1.5 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                s.dscr >= 1.2 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                s.dscr >= 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              }`}>
                                {s.dscr > 0 ? s.dscr.toFixed(2) + "x" : "N/A"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">{formatPercent(s.rendementNet)}</td>
                            <td className="px-4 py-3 text-center">
                              {danger ? (
                                <Badge variant="danger">Critique</Badge>
                              ) : warning ? (
                                <Badge variant="warning">Vigilance</Badge>
                              ) : (
                                <Badge variant="success">OK</Badge>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {/* Stress bar chart */}
              <GlassCard delay={1}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Impact sur le cash-flow
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stressResults.map((s) => ({ name: s.label, "Cash-flow": Math.round(s.cashFlowAjuste), DSCR: s.dscr }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number, name: string) =>
                      name === "DSCR" ? v.toFixed(2) + "x" : formatCurrency(v)
                    } />
                    <Bar dataKey="Cash-flow" animationDuration={800}>
                      {stressResults.map((s, i) => (
                        <Cell key={i} fill={s.cashFlowAjuste >= 0 ? "#10b981" : "#ef4444"} radius={[4, 4, 0, 0] as any} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Projection Tab */}
          <TabsContent value="projection">
            <div className="grid gap-6 lg:grid-cols-3 mt-6">
              {/* Parameters */}
              <GlassCard delay={0} className="space-y-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Hypothèses de projection
                </h3>
                <SliderInput
                  label="Croissance loyers" value={projGrowthLoyer} onChange={setProjGrowthLoyer}
                  min={0} max={6} step={0.5} unit="%" description="Indexation annuelle estimée"
                />
                <SliderInput
                  label="Inflation charges" value={projInflationCharges} onChange={setProjInflationCharges}
                  min={0} max={8} step={0.5} unit="%" description="Hausse annuelle des charges"
                />
                <SliderInput
                  label="Appreciation actifs" value={projAppreciationActif} onChange={setProjAppreciationActif}
                  min={-3} max={6} step={0.5} unit="%" description="Revalorisation annuelle du patrimoine"
                />
                <SliderInput
                  label="Horizon" value={projYears} onChange={setProjYears}
                  min={3} max={20} step={1} unit=" ans"
                />
              </GlassCard>

              {/* Chart */}
              <GlassCard delay={1} className="lg:col-span-2">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Évolution projetée
                </h3>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={projChartData}>
                    <defs>
                      <linearGradient id="gradLoyers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradNoi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradCf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Area type="monotone" dataKey="Loyers" stroke="#3b82f6" fill="url(#gradLoyers)" strokeWidth={2} />
                    <Area type="monotone" dataKey="NOI" stroke="#10b981" fill="url(#gradNoi)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Cash-flow" stroke="#8b5cf6" fill="url(#gradCf)" strokeWidth={2} />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </GlassCard>
            </div>

            {/* Projection table */}
            <Section title="Détail annuel" delay={2}>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2 text-left font-semibold">Année</th>
                      <th className="px-3 py-2 text-right font-semibold">Loyers</th>
                      <th className="px-3 py-2 text-right font-semibold">Charges</th>
                      <th className="px-3 py-2 text-right font-semibold">NOI</th>
                      <th className="px-3 py-2 text-right font-semibold">Cash-flow</th>
                      <th className="px-3 py-2 text-right font-semibold">Valorisation</th>
                      <th className="px-3 py-2 text-right font-semibold">Rdt net</th>
                      <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                      <th className="px-3 py-2 text-right font-semibold">LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((p, i) => (
                      <tr key={p.year} className={`border-t hover:bg-muted/20 ${i === 0 ? "bg-muted/10 font-medium" : ""}`}>
                        <td className="px-3 py-2 font-medium">{p.label}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(p.loyers)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(p.charges)}</td>
                        <td className="px-3 py-2 text-right text-green-600">{formatCurrency(p.noi)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${p.cashFlow >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {formatCurrency(p.cashFlow)}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(p.valorisation)}</td>
                        <td className="px-3 py-2 text-right">{formatPercent(p.rendementNet)}</td>
                        <td className="px-3 py-2 text-right">{p.dscr > 0 ? p.dscr.toFixed(2) + "x" : "N/A"}</td>
                        <td className="px-3 py-2 text-right">{formatPercent(p.ltv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </TabsContent>

          {/* Sensitivity Tab */}
          <TabsContent value="sensibilite">
            <div className="grid gap-6 lg:grid-cols-2 mt-6">
              {/* NPV sensitivity */}
              <GlassCard delay={0}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Sensibilite de la VAN au taux d'actualisation
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={npvSensitivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="taux" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="van" name="VAN" animationDuration={800}>
                      {npvSensitivity.map((entry, i) => (
                        <Cell key={i} fill={entry.van >= 0 ? "#10b981" : "#ef4444"} radius={[4, 4, 0, 0] as any} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </GlassCard>

              {/* Yield vs LTV matrix */}
              <GlassCard delay={1}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Matrice rendement / levier
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left font-semibold">Scenario</th>
                        <th className="px-3 py-2 text-right font-semibold">Rdt net</th>
                        <th className="px-3 py-2 text-right font-semibold">LTV</th>
                        <th className="px-3 py-2 text-right font-semibold">DSCR</th>
                        <th className="px-3 py-2 text-center font-semibold">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stressResults.map((s, i) => {
                        const score =
                          (s.dscr >= 1.5 ? 3 : s.dscr >= 1.2 ? 2 : s.dscr >= 1 ? 1 : 0) +
                          (s.rendementNet >= 5 ? 3 : s.rendementNet >= 3 ? 2 : s.rendementNet >= 1 ? 1 : 0) +
                          (s.ltv <= 50 ? 3 : s.ltv <= 70 ? 2 : s.ltv <= 80 ? 1 : 0);
                        const rating = score >= 8 ? "AAA" : score >= 6 ? "AA" : score >= 4 ? "A" : score >= 2 ? "BBB" : "BB";
                        const ratingColor = score >= 8 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          score >= 6 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                          score >= 4 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
                        return (
                          <tr key={i} className={`border-t hover:bg-muted/20 ${i === 0 ? "bg-muted/10" : ""}`}>
                            <td className="px-3 py-2 font-medium">{s.label}</td>
                            <td className="px-3 py-2 text-right">{formatPercent(s.rendementNet)}</td>
                            <td className="px-3 py-2 text-right">{formatPercent(s.ltv)}</td>
                            <td className="px-3 py-2 text-right">{s.dscr > 0 ? s.dscr.toFixed(2) + "x" : "N/A"}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${ratingColor}`}>
                                {rating}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {/* Growth sensitivity chart */}
              <GlassCard delay={2} className="lg:col-span-2">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Sensibilite du cash-flow a la croissance des loyers
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[0, 1, 2, 3, 4, 5].map((g) => {
                    const proj = computeMultiYearProjection(
                      loyerAnnuel, charges, serviceDette, valorisation, crd,
                      g, 2, 1.5, amortAnnuel, 10
                    );
                    return {
                      croissance: `${g}%`,
                      "CF N+5": Math.round(proj[5]?.cashFlow || 0),
                      "CF N+10": Math.round(proj[10]?.cashFlow || 0),
                    };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="croissance" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="CF N+5" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="CF N+10" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </GlassCard>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </AnimatePresence>
  );
}
