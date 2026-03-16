import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  computeSciKpis,
  getLoyerAnnuelActif,
  getChargesAnnuelles,
} from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Calculator, Receipt, TrendingUp, Percent } from "lucide-react";

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

  const actifsActifs = actifs.filter((a: any) => !a.archived);

  // Portfolio-level aggregation
  let totalLoyers = 0;
  let totalCharges = 0;
  let totalTaxeFonciere = 0;
  let totalAssurancePno = 0;
  let totalChargesCopro = 0;
  let totalAutres = 0;

  for (const a of actifsActifs) {
    totalLoyers += getLoyerAnnuelActif(a, baux, lots);
    totalCharges += getChargesAnnuelles(a);

    const taxeFonciere = Number(a.taxeFonciere || 0);
    const assurancePno = Number(a.assurancePno || 0);
    const chargesCopro = Number(a.chargesCopropriete || a.chargesAnnuelles || 0);
    totalTaxeFonciere += taxeFonciere;
    totalAssurancePno += assurancePno;
    totalChargesCopro += chargesCopro;
  }

  // "Autres" = total charges minus the categorized charges
  // (in case getChargesAnnuelles adds them all together)
  totalAutres = totalCharges - totalTaxeFonciere - totalAssurancePno - totalChargesCopro;
  if (totalAutres < 0) totalAutres = 0;

  const noi = totalLoyers - totalCharges;
  const ratioChargesLoyers = totalLoyers > 0 ? (totalCharges / totalLoyers) * 100 : 0;

  // Per-SCI data
  const sciKpis = scis.map((sci: any) => computeSciKpis(sci, actifs, baux, lots, emprunts));

  // Pie chart: charges breakdown
  const chargesPieData = [
    { name: "Taxe foncière", value: totalTaxeFonciere },
    { name: "Assurance PNO", value: totalAssurancePno },
    { name: "Charges copropriété", value: totalChargesCopro },
    { name: "Autres", value: totalAutres },
  ].filter((d) => d.value > 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Contrôle de gestion"
          description="Suivi budgétaire et analyse des charges"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Loyers annuels"
            value={totalLoyers}
            formatFn={formatCurrency}
            icon={TrendingUp}
            variant="success"
            gradient
            delay={0}
          />
          <KpiCard
            label="Charges totales"
            value={totalCharges}
            formatFn={formatCurrency}
            icon={Receipt}
            variant="warning"
            gradient
            delay={1}
          />
          <KpiCard
            label="NOI"
            value={noi}
            formatFn={formatCurrency}
            icon={Calculator}
            variant={noi >= 0 ? "primary" : "danger"}
            gradient
            delay={2}
          />
          <KpiCard
            label="Ratio charges/loyers"
            value={ratioChargesLoyers}
            formatFn={(n) => formatPercent(n)}
            icon={Percent}
            variant={ratioChargesLoyers < 30 ? "success" : ratioChargesLoyers < 50 ? "warning" : "danger"}
            gradient
            delay={3}
          />
        </div>

        {/* Charges breakdown pie chart */}
        {chargesPieData.length > 0 && (
          <GlassCard delay={4}>
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
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                />
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

        {/* Per-SCI table */}
        {sciKpis.length > 0 && (
          <Section title="Détail par SCI" delay={5}>
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
                    <th className="px-4 py-3 text-right font-semibold">Loyers/an</th>
                    <th className="px-4 py-3 text-right font-semibold">Charges/an</th>
                    <th className="px-4 py-3 text-right font-semibold">NOI</th>
                    <th className="px-4 py-3 text-right font-semibold">Ratio charges</th>
                    <th className="px-4 py-3 text-right font-semibold">Cash-flow net</th>
                  </tr>
                </thead>
                <tbody>
                  {sciKpis.map((k: any, i: number) => {
                    const ratio = k.loyerAnnuel > 0 ? (k.charges / k.loyerAnnuel) * 100 : 0;
                    return (
                      <motion.tr
                        key={k.sci.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(0.6 + i * 0.05, 0.6 + 0.5) }}
                        className="border-t transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3 font-medium">{k.sci.nom}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(k.loyerAnnuel)}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(k.charges)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${k.noi >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {formatCurrency(k.noi)}
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
                        <td className={`px-4 py-3 text-right font-medium ${k.cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {formatCurrency(k.cashFlowNet)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalLoyers)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(totalCharges)}</td>
                    <td className={`px-4 py-3 text-right ${noi >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {formatCurrency(noi)}
                    </td>
                    <td className="px-4 py-3 text-right">{formatPercent(ratioChargesLoyers)}</td>
                    <td className="px-4 py-3 text-right">—</td>
                  </tr>
                </tfoot>
              </table>
            </motion.div>
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
