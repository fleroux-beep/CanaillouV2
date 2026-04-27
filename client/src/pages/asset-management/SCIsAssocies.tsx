import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { PageHeader } from "../../components/ui/page-header";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import {
  Landmark, Users, PieChart as PieChartIcon, TrendingUp,
  Wallet, BarChart3, CircleDollarSign,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import SCIsPage from "./SCIs";
import AssociesPage from "./Associes";
import {
  computeAssocieNAV, computeSciKpis,
  getValeurEstimee, getLoyerAnnuelActif, getChargesAnnuelles,
  getTotalCRD, getServiceDette,
} from "../../lib/am-calculations";

interface SCI {
  id: string;
  nom: string;
  capital?: string;
  formeJuridique?: string;
  regimeFiscal?: string;
  gerant?: string;
}

interface Associe {
  id: string;
  nom: string;
  prenom?: string;
}

interface Actif {
  id: string;
  nom: string;
  sciId?: string;
  prixAcquisition?: string;
  prixM2Marche?: string;
  surface?: string;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#6366f1"];

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

function CapitalGovernancePage() {
  const capitalSort = useSortableTable();
  const pvSort = useSortableTable();

  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });
  const { data: associes = [] } = useQuery<Associe[]>({
    queryKey: ["/api/am/associes"],
    queryFn: () => apiRequest("/api/am/associes"),
  });
  const { data: actifs = [] } = useQuery<Actif[]>({
    queryKey: ["/api/am/actifs"],
    queryFn: () => apiRequest("/api/am/actifs"),
  });
  const { data: participations = [] } = useQuery({
    queryKey: ["/api/am/participations"],
    queryFn: () => apiRequest("/api/am/participations"),
  });

  const queryClient = useQueryClient();
  const upsertParticipation = useMutation({
    mutationFn: (data: any) => {
      if (data.id) {
        return apiRequest(`/api/am/participations/${data.id}`, { method: "PUT", body: JSON.stringify(data) });
      }
      return apiRequest("/api/am/participations", { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/am/participations"] }),
  });

  const totalCapital = useMemo(
    () => scis.reduce((sum, s) => sum + (s.capital ? parseFloat(s.capital) : 0), 0),
    [scis]
  );

  const capitalData = useMemo(
    () =>
      scis
        .filter((s) => s.capital && parseFloat(s.capital) > 0)
        .map((s) => ({ name: s.nom, value: parseFloat(s.capital!) })),
    [scis]
  );

  const plusValueBySci = useMemo(() => {
    return scis.map((sci) => {
      const sciActifs = actifs.filter((a) => a.sciId === sci.id);
      const totalAcquisition = sciActifs.reduce(
        (s, a) => s + (a.prixAcquisition ? parseFloat(a.prixAcquisition) : 0),
        0
      );
      const totalMarche = sciActifs.reduce((s, a) => {
        const prix = a.prixM2Marche ? parseFloat(a.prixM2Marche) : 0;
        const surface = a.surface ? parseFloat(a.surface) : 0;
        return s + prix * surface;
      }, 0);
      const plusValue = totalMarche > 0 ? totalMarche - totalAcquisition : 0;
      return {
        sci: sci.nom,
        acquisition: totalAcquisition,
        marche: totalMarche,
        plusValue,
        nbActifs: sciActifs.length,
      };
    });
  }, [scis, actifs]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Capital total" value={totalCapital} formatFn={(n) => formatCurrency(n)} icon={Landmark} variant="primary" gradient delay={0} />
          <KpiCard label="SCIs" value={scis.length} icon={PieChartIcon} variant="success" gradient delay={1} />
          <KpiCard label="Associés" value={associes.length} icon={Users} variant="warning" gradient delay={2} />
        </div>

        {capitalData.length > 0 && (
          <Section title="Répartition du capital" delay={1}>
            <GlassCard>
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-1/2 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={capitalData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={110} innerRadius={60}
                        paddingAngle={2}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {capitalData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full lg:w-1/2">
                  <div className="overflow-x-auto rounded-xl border bg-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <SortHeader label="SCI" sortKey="nom" currentSortKey={capitalSort.sortKey} sortDir={capitalSort.sortDir} onSort={capitalSort.handleSort} />
                          <SortHeader label="Forme" sortKey="formeJuridique" currentSortKey={capitalSort.sortKey} sortDir={capitalSort.sortDir} onSort={capitalSort.handleSort} />
                          <SortHeader label="Régime" sortKey="regimeFiscal" currentSortKey={capitalSort.sortKey} sortDir={capitalSort.sortDir} onSort={capitalSort.handleSort} />
                          <SortHeader label="Capital" sortKey="capital" align="right" currentSortKey={capitalSort.sortKey} sortDir={capitalSort.sortDir} onSort={capitalSort.handleSort} />
                          <th className="px-4 py-3 text-right font-semibold">Part</th>
                        </tr>
                      </thead>
                      <tbody>
                        {capitalSort.sortData(scis).map((sci) => {
                          const cap = sci.capital ? parseFloat(sci.capital) : 0;
                          const pct = totalCapital > 0 ? ((cap / totalCapital) * 100).toFixed(1) : "0";
                          return (
                            <tr key={sci.id} className="border-t hover:bg-muted/20">
                              <td className="px-4 py-3 font-medium">{sci.nom}</td>
                              <td className="px-4 py-3">
                                {sci.formeJuridique ? <Badge variant="primary">{sci.formeJuridique}</Badge> : "\u2014"}
                              </td>
                              <td className="px-4 py-3">
                                {sci.regimeFiscal ? <Badge>{sci.regimeFiscal}</Badge> : "\u2014"}
                              </td>
                              <td className="px-4 py-3 text-right">{cap > 0 ? formatCurrency(cap) : "\u2014"}</td>
                              <td className="px-4 py-3 text-right">{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </GlassCard>
          </Section>
        )}

        <Section title="Répartition du capital entre associés" delay={1.5}>
          <GlassCard>
            <p className="mb-4 text-xs text-muted-foreground">
              Saisissez le pourcentage de détention de chaque associé dans chaque SCI.
            </p>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold">SCI</th>
                    {associes.map((a: any) => (
                      <th key={a.id} className="px-4 py-3 text-center font-semibold">
                        {a.prenom ? `${a.prenom} ${a.nom}` : a.nom}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scis.map((sci: any) => {
                    const sciParts = participations.filter((p: any) => p.sciId === sci.id);
                    const total = sciParts.reduce((s: number, p: any) => s + (Number(p.pourcentage) || 0), 0);
                    return (
                      <tr key={sci.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{sci.nom}</td>
                        {associes.map((a: any) => {
                          const part = sciParts.find((p: any) => p.associeId === a.id);
                          const pct = part ? Number(part.pourcentage) || 0 : 0;
                          return (
                            <td key={a.id} className="px-4 py-1 text-center">
                              <input
                                type="number"
                                defaultValue={pct}
                                min={0}
                                max={100}
                                step={0.1}
                                onBlur={(e) => {
                                  const newPct = parseFloat(e.target.value) || 0;
                                  if (newPct !== pct) {
                                    upsertParticipation.mutate({
                                      ...(part ? { id: part.id } : {}),
                                      sciId: sci.id,
                                      associeId: a.id,
                                      pourcentage: String(newPct),
                                    });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                                className="w-20 rounded border bg-background px-2 py-1 text-center text-sm"
                              />
                            </td>
                          );
                        })}
                        <td className={`px-4 py-3 text-center font-medium ${Math.abs(total - 100) < 0.01 ? "text-green-600" : "text-red-500"}`}>
                          {total.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </Section>

        <Section title="Plus-value latente par SCI" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <SortHeader label="SCI" sortKey="sci" currentSortKey={pvSort.sortKey} sortDir={pvSort.sortDir} onSort={pvSort.handleSort} />
                  <SortHeader label="Actifs" sortKey="nbActifs" align="right" currentSortKey={pvSort.sortKey} sortDir={pvSort.sortDir} onSort={pvSort.handleSort} />
                  <SortHeader label="Valeur acquisition" sortKey="acquisition" align="right" currentSortKey={pvSort.sortKey} sortDir={pvSort.sortDir} onSort={pvSort.handleSort} />
                  <SortHeader label="Valeur marché estimée" sortKey="marche" align="right" currentSortKey={pvSort.sortKey} sortDir={pvSort.sortDir} onSort={pvSort.handleSort} />
                  <SortHeader label="Plus-value latente" sortKey="plusValue" align="right" currentSortKey={pvSort.sortKey} sortDir={pvSort.sortDir} onSort={pvSort.handleSort} />
                </tr>
              </thead>
              <tbody>
                {pvSort.sortData(plusValueBySci).map((row) => (
                  <tr key={row.sci} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{row.sci}</td>
                    <td className="px-4 py-3 text-right">{row.nbActifs}</td>
                    <td className="px-4 py-3 text-right">{row.acquisition > 0 ? formatCurrency(row.acquisition) : "\u2014"}</td>
                    <td className="px-4 py-3 text-right">{row.marche > 0 ? formatCurrency(row.marche) : "\u2014"}</td>
                    <td className={`px-4 py-3 text-right font-medium ${row.plusValue > 0 ? "text-green-600" : row.plusValue < 0 ? "text-red-600" : ""}`}>
                      {row.marche > 0 ? formatCurrency(row.plusValue) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Gouvernance" delay={3}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scis.map((sci, i) => (
              <GlassCard key={sci.id} delay={i}>
                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground">{sci.nom}</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gérant</span>
                      <span className="font-medium">{sci.gerant || "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Forme</span>
                      <span>{sci.formeJuridique || "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Régime</span>
                      <span>{sci.regimeFiscal || "\u2014"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capital</span>
                      <span>{sci.capital ? formatCurrency(sci.capital) : "\u2014"}</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/** Reporting investisseur — NAV, rendement, distribution par associe */
function InvestorReportingPage() {
  const reportSort = useSortableTable();

  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });
  const { data: associes = [] } = useQuery({ queryKey: ["/api/am/associes"], queryFn: () => apiRequest("/api/am/associes") });
  const { data: participations = [] } = useQuery({ queryKey: ["/api/am/participations"], queryFn: () => apiRequest("/api/am/participations") });

  // Portfolio totals
  const actifsActifs = actifs.filter((a: any) => !a.archived);
  const empruntsActifs = emprunts.filter((e: any) => !e.archived);

  let valorisation = 0, loyerAnnuel = 0, charges = 0;
  for (const a of actifsActifs) {
    valorisation += getValeurEstimee(a, baux, lots);
    loyerAnnuel += getLoyerAnnuelActif(a, baux, lots);
    charges += getChargesAnnuelles(a);
  }
  const noi = loyerAnnuel - charges;
  const crd = getTotalCRD(empruntsActifs);
  const serviceDette = getServiceDette(empruntsActifs);
  const totalNAV = valorisation - crd;
  const cashFlowDistribuable = noi - serviceDette;

  // SCI KPIs for weighted NAV calculation
  const sciKpis = useMemo(
    () => scis.map((sci: any) => computeSciKpis(sci, actifs, baux, lots, emprunts)),
    [scis, actifs, baux, lots, emprunts]
  );

  // NAV per investor
  const navData = useMemo(
    () => computeAssocieNAV(totalNAV, loyerAnnuel, associes, participations, sciKpis),
    [totalNAV, loyerAnnuel, associes, participations, sciKpis]
  );

  const totalApports = navData.reduce((s, n) => s + n.apport, 0);
  const totalPlusValue = navData.reduce((s, n) => s + n.plusValueLatente, 0);

  // Chart data
  const navChartData = navData
    .filter((n) => n.navPart > 0)
    .map((n) => ({ name: n.associeNom, value: Math.round(n.navPart) }));

  const performanceChartData = navData
    .filter((n) => n.apport > 0)
    .map((n) => ({
      name: n.associeNom.split(" ")[0],
      "Apport": Math.round(n.apport),
      "NAV": Math.round(n.navPart),
      "Plus-value": Math.round(n.plusValueLatente),
    }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="NAV totale" value={totalNAV}
            formatFn={formatCurrency} icon={Wallet}
            variant="primary" gradient delay={0}
          />
          <KpiCard
            label="Cash-flow distribuable" value={cashFlowDistribuable}
            formatFn={formatCurrency} icon={CircleDollarSign}
            variant={cashFlowDistribuable >= 0 ? "success" : "danger"} gradient delay={1}
          />
          <KpiCard
            label="Total apports" value={totalApports}
            formatFn={formatCurrency} icon={TrendingUp}
            variant="warning" gradient delay={2}
          />
          <KpiCard
            label="Plus-value latente" value={totalPlusValue}
            formatFn={formatCurrency} icon={BarChart3}
            variant={totalPlusValue >= 0 ? "success" : "danger"} gradient delay={3}
          />
        </div>

        {/* Charts */}
        {navChartData.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* NAV breakdown pie */}
            <GlassCard delay={4}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Répartition NAV par associé
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={navChartData}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={105}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {navChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </GlassCard>

            {/* Apport vs NAV bar */}
            <GlassCard delay={5}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Performance par associé
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="Apport" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="NAV" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Plus-value" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>
        )}

        {/* Detailed table */}
        <Section title="Reporting détaillé par associé" delay={3}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <SortHeader label="Associé" sortKey="associeNom" currentSortKey={reportSort.sortKey} sortDir={reportSort.sortDir} onSort={reportSort.handleSort} />
                  <SortHeader label="Part (%)" sortKey="partPct" align="right" currentSortKey={reportSort.sortKey} sortDir={reportSort.sortDir} onSort={reportSort.handleSort} />
                  <SortHeader label="Apport" sortKey="apport" align="right" currentSortKey={reportSort.sortKey} sortDir={reportSort.sortDir} onSort={reportSort.handleSort} />
                  <SortHeader label="NAV" sortKey="navPart" align="right" currentSortKey={reportSort.sortKey} sortDir={reportSort.sortDir} onSort={reportSort.handleSort} />
                  <SortHeader label="Plus-value" sortKey="plusValueLatente" align="right" currentSortKey={reportSort.sortKey} sortDir={reportSort.sortDir} onSort={reportSort.handleSort} />
                  <SortHeader label="Rdt annualisé" sortKey="rendementAnnuelise" align="right" currentSortKey={reportSort.sortKey} sortDir={reportSort.sortDir} onSort={reportSort.handleSort} />
                  <th className="px-4 py-3 text-right font-semibold">Distribution estimée</th>
                  <th className="px-4 py-3 text-center font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {reportSort.sortData(navData).map((n, i) => {
                  const distribution = cashFlowDistribuable > 0 ? cashFlowDistribuable * (n.partPct / 100) : 0;
                  return (
                    <motion.tr
                      key={n.associeId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.1 + i * 0.05, 0.1 + 0.5) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{n.associeNom || "\u2014"}</td>
                      <td className="px-4 py-3 text-right">{n.partPct > 0 ? formatPercent(n.partPct) : "\u2014"}</td>
                      <td className="px-4 py-3 text-right">{n.apport > 0 ? formatCurrency(n.apport) : "\u2014"}</td>
                      <td className="px-4 py-3 text-right font-medium text-primary">{n.navPart > 0 ? formatCurrency(n.navPart) : "\u2014"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${n.plusValueLatente > 0 ? "text-green-600" : n.plusValueLatente < 0 ? "text-red-500" : ""}`}>
                        {n.apport > 0 ? formatCurrency(n.plusValueLatente) : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {n.rendementAnnuelise > 0 ? formatPercent(n.rendementAnnuelise) : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {distribution > 0 ? formatCurrency(distribution) : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {n.plusValueLatente > 0 ? (
                          <Badge variant="success">+</Badge>
                        ) : n.plusValueLatente < 0 ? (
                          <Badge variant="danger">-</Badge>
                        ) : (
                          <Badge variant="outline">=</Badge>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
              {navData.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{formatPercent(navData.reduce((s, n) => s + n.partPct, 0))}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalApports)}</td>
                    <td className="px-4 py-3 text-right text-primary">{formatCurrency(totalNAV)}</td>
                    <td className={`px-4 py-3 text-right ${totalPlusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {formatCurrency(totalPlusValue)}
                    </td>
                    <td className="px-4 py-3 text-right">\u2014</td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {cashFlowDistribuable > 0 ? formatCurrency(cashFlowDistribuable) : "\u2014"}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

export default function SCIsAssociesPage() {
  const [activeTab, setActiveTab] = useState("scis");

  return (
    <div className="space-y-6">
      <PageHeader title="SCI & Associés" description="Gestion des sociétés civiles et de leurs associés" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scis">SCI</TabsTrigger>
          <TabsTrigger value="associes">Associés</TabsTrigger>
          <TabsTrigger value="capital">Capital & gouvernance</TabsTrigger>
          <TabsTrigger value="reporting">Reporting investisseur</TabsTrigger>
        </TabsList>
        <TabsContent value="scis">
          <SCIsPage />
        </TabsContent>
        <TabsContent value="associes">
          <AssociesPage />
        </TabsContent>
        <TabsContent value="capital">
          <CapitalGovernancePage />
        </TabsContent>
        <TabsContent value="reporting">
          <InvestorReportingPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
