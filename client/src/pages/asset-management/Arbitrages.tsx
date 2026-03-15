import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import {
  getValeurEstimee,
  getLoyerAnnuelActif,
  getChargesAnnuelles,
  getPrixAcquisition,
  getTotalCRD,
  getServiceDette,
  getRendementBrut,
  getLTV,
  getDSCR,
} from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Target, Building2, TrendingUp } from "lucide-react";

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

function computeScore(rendement: number, ltv: number, dscr: number): { checks: number; label: string; color: string; bg: string } {
  let checks = 0;
  if (rendement > 5) checks++;
  if (ltv < 60) checks++;
  if (dscr > 1.2) checks++;

  if (checks >= 3) return { checks, label: "Conserver", color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" };
  if (checks === 2) return { checks, label: "Surveiller", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" };
  return { checks, label: "Arbitrer", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" };
}

export default function ArbitragesPage() {
  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const actifsActifs = actifs.filter((a: any) => !a.archived);
  const empruntsActifs = emprunts.filter((e: any) => !e.archived);

  // Per-actif data
  const actifData = actifsActifs.map((a: any) => {
    const sci = scis.find((s: any) => s.id === a.sciId);
    const valeurEstimee = getValeurEstimee(a, baux, lots);
    const prixAcquisition = getPrixAcquisition(a);
    const plusValue = valeurEstimee - prixAcquisition;
    const loyerAnnuel = getLoyerAnnuelActif(a, baux, lots);
    const charges = getChargesAnnuelles(a);
    const noi = loyerAnnuel - charges;

    // Emprunts linked to this actif's SCI
    const sciEmprunts = empruntsActifs.filter((e: any) => e.sciId === a.sciId);
    const crd = getTotalCRD(sciEmprunts);
    const serviceDette = getServiceDette(sciEmprunts);

    const rendementBrut = getRendementBrut(loyerAnnuel, valeurEstimee);
    const ltv = getLTV(crd, valeurEstimee);
    const dscr = getDSCR(noi, serviceDette);
    const score = computeScore(rendementBrut, ltv, dscr);

    return {
      id: a.id,
      nom: a.nom || a.adresse || `Actif #${a.id}`,
      sciNom: sci?.nom || "—",
      prixAcquisition,
      valeurEstimee,
      plusValue,
      rendementBrut,
      ltv,
      dscr,
      score,
    };
  });

  // Totals
  const totalValorisation = actifData.reduce((sum: number, a: any) => sum + a.valeurEstimee, 0);
  const avgRendement = actifData.length > 0
    ? actifData.reduce((sum: number, a: any) => sum + a.rendementBrut, 0) / actifData.length
    : 0;

  // Chart data: rendement brut per actif, sorted descending
  const chartData = [...actifData]
    .filter((a: any) => a.rendementBrut > 0)
    .sort((a, b) => b.rendementBrut - a.rendementBrut)
    .map((a: any) => ({
      name: a.nom.length > 20 ? a.nom.substring(0, 20) + "..." : a.nom,
      rendement: Number(a.rendementBrut.toFixed(2)),
      color: a.rendementBrut > 5 ? "#10b981" : a.rendementBrut > 3 ? "#f59e0b" : "#ef4444",
    }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Arbitrages"
          description="Analyse opportunités d'arbitrage"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Nombre d'actifs"
            value={actifsActifs.length}
            icon={Building2}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Valorisation totale"
            value={totalValorisation}
            formatFn={formatCurrency}
            icon={Target}
            variant="success"
            gradient
            delay={1}
          />
          <KpiCard
            label="Rendement moyen"
            value={avgRendement}
            formatFn={(n) => formatPercent(n)}
            icon={TrendingUp}
            variant={avgRendement > 5 ? "success" : avgRendement > 3 ? "warning" : "danger"}
            gradient
            delay={2}
          />
        </div>

        {/* Bar chart: rendement brut per actif */}
        {chartData.length > 0 && (
          <GlassCard delay={3}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Rendement brut par actif
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11 }}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(v: number) => `${v.toFixed(2)}%`}
                />
                <Bar dataKey="rendement" name="Rendement brut" radius={[4, 4, 0, 0]} animationDuration={800}>
                  {chartData.map((entry: any) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex justify-center gap-6">
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} />
                &gt; 5%
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} />
                3-5%
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
                &lt; 3%
              </div>
            </div>
          </GlassCard>
        )}

        {/* Table per actif with score */}
        {actifData.length > 0 && (
          <Section title="Analyse par actif" delay={4}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold">Actif</th>
                    <th className="px-4 py-3 text-left font-semibold">SCI</th>
                    <th className="px-4 py-3 text-right font-semibold">Prix acquisition</th>
                    <th className="px-4 py-3 text-right font-semibold">Valeur estimée</th>
                    <th className="px-4 py-3 text-right font-semibold">+/- Value</th>
                    <th className="px-4 py-3 text-right font-semibold">Rdt brut</th>
                    <th className="px-4 py-3 text-right font-semibold">LTV</th>
                    <th className="px-4 py-3 text-right font-semibold">DSCR</th>
                    <th className="px-4 py-3 text-center font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {actifData.map((a: any, i: number) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 0.6 + 0.5) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{a.nom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.sciNom}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(a.prixAcquisition)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(a.valeurEstimee)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${a.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {a.plusValue >= 0 ? "+" : ""}{formatCurrency(a.plusValue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`${a.rendementBrut > 5 ? "text-green-600" : a.rendementBrut > 3 ? "text-amber-600" : "text-red-500"}`}>
                          {formatPercent(a.rendementBrut)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`${a.ltv < 60 ? "text-green-600" : a.ltv < 80 ? "text-amber-600" : "text-red-500"}`}>
                          {formatPercent(a.ltv)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`${a.dscr > 1.2 ? "text-green-600" : a.dscr > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {a.dscr > 0 ? a.dscr.toFixed(2) + "x" : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.score.bg} ${a.score.color}`}>
                          {a.score.label}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
