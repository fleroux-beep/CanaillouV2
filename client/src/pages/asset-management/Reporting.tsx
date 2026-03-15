import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  computeSciKpis,
  getValeurEstimee,
  getLoyerAnnuelActif,
  getChargesAnnuelles,
  getTotalCRD,
  getServiceDette,
  getLTV,
} from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  BookOpen, Landmark, Building2, TrendingUp, PiggyBank, Wallet,
} from "lucide-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

export default function ReportingPage() {
  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const actifsActifs = actifs.filter((a: any) => !a.archived);
  const empruntsActifs = emprunts.filter((e: any) => !e.archived);
  const lotsActifs = lots.filter((l: any) => !l.archived);

  const sciKpis = scis.map((sci: any) => computeSciKpis(sci, actifs, baux, lots, emprunts));

  let valorisation = 0;
  let loyerAnnuel = 0;
  let charges = 0;
  for (const a of actifsActifs) {
    valorisation += getValeurEstimee(a, baux, lots);
    loyerAnnuel += getLoyerAnnuelActif(a, baux, lots);
    charges += getChargesAnnuelles(a);
  }
  const crd = getTotalCRD(empruntsActifs);
  const serviceDette = getServiceDette(empruntsActifs);
  const noi = loyerAnnuel - charges;

  // Repartition par type d'actif
  const typeCount: Record<string, { count: number; valorisation: number }> = {};
  actifsActifs.forEach((a: any) => {
    const t = a.type || "Non defini";
    if (!typeCount[t]) typeCount[t] = { count: 0, valorisation: 0 };
    typeCount[t].count++;
    typeCount[t].valorisation += getValeurEstimee(a, baux, lots);
  });
  const typeData = Object.entries(typeCount).map(([name, v]) => ({ name, ...v }));

  // Repartition geographique
  const villeCount: Record<string, number> = {};
  actifsActifs.forEach((a: any) => {
    const v = a.ville || "Non renseignee";
    villeCount[v] = (villeCount[v] || 0) + 1;
  });
  const villeData = Object.entries(villeCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Reporting"
          description="Synthèse et rapports du patrimoine"
        />

        {/* Synthèse */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="SCIs" value={scis.length} icon={Landmark} variant="primary" gradient delay={0} />
          <KpiCard label="Actifs" value={actifsActifs.length} icon={Building2} variant="success" gradient delay={1} />
          <KpiCard label="Valorisation" value={valorisation} formatFn={formatCurrency} icon={TrendingUp} variant="warning" gradient delay={2} />
          <KpiCard label="Fonds propres" value={valorisation - crd} formatFn={formatCurrency} icon={Wallet} variant="primary" gradient delay={3} />
        </div>

        {/* Synthèse financière par SCI */}
        <Section title="Synthèse par SCI" delay={2}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="overflow-x-auto rounded-xl border bg-card shadow-sm"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">SCI</th>
                  <th className="px-4 py-3 text-right font-semibold">Actifs</th>
                  <th className="px-4 py-3 text-right font-semibold">Valorisation</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyers/an</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges</th>
                  <th className="px-4 py-3 text-right font-semibold">NOI</th>
                  <th className="px-4 py-3 text-right font-semibold">CRD</th>
                  <th className="px-4 py-3 text-right font-semibold">Cash-flow</th>
                  <th className="px-4 py-3 text-right font-semibold">LTV</th>
                </tr>
              </thead>
              <tbody>
                {sciKpis.map((k: any, i: number) => (
                  <motion.tr
                    key={k.sci.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(0.4 + i * 0.05, 0.4 + 0.5) }}
                    className="border-t transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 font-medium">{k.sci.nom}</td>
                    <td className="px-4 py-3 text-right">{k.actifs.length}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(k.valorisation)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(k.loyerAnnuel)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(k.charges)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(k.noi)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(k.crd)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${k.cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {formatCurrency(k.cashFlowNet)}
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
                {/* Total row */}
                <tr className="border-t-2 bg-muted/10 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{actifsActifs.length}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(valorisation)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(loyerAnnuel)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(charges)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(noi)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(crd)}</td>
                  <td className={`px-4 py-3 text-right ${noi - serviceDette >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {formatCurrency(noi - serviceDette)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatPercent(getLTV(crd, valorisation))}</td>
                </tr>
              </tbody>
            </table>
          </motion.div>
        </Section>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {typeData.length > 0 && (
            <GlassCard delay={5}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Répartition par type
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100}
                    paddingAngle={3}
                    dataKey="valorisation"
                    animationBegin={200} animationDuration={1000}
                  >
                    {typeData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {typeData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.name} ({d.count})
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {villeData.length > 0 && (
            <GlassCard delay={6}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Répartition géographique
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={villeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="value" name="Actifs" fill="#8b5cf6" radius={[0, 4, 4, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
