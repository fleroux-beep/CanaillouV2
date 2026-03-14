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
  getRendementBrut,
} from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { TrendingUp, Landmark, ArrowUpDown } from "lucide-react";

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

export default function ValorisationPage() {
  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const actifsActifs = actifs.filter((a: any) => !a.archived);

  // Compute per-actif data
  const actifData = actifsActifs.map((a: any) => {
    const sci = scis.find((s: any) => s.id === a.sciId);
    const valeurEstimee = getValeurEstimee(a, baux, lots);
    const prixAcquisition = getPrixAcquisition(a);
    const plusValue = valeurEstimee - prixAcquisition;
    const loyerAnnuel = getLoyerAnnuelActif(a, baux, lots);
    const rendementBrut = getRendementBrut(loyerAnnuel, valeurEstimee);
    const surface = Number(a.surfaceCarrez || a.surface || 0);

    return {
      id: a.id,
      nom: a.nom || a.adresse || `Actif #${a.id}`,
      sciNom: sci?.nom || "—",
      surface,
      prixAcquisition,
      valeurEstimee,
      plusValue,
      rendementBrut,
    };
  });

  // Totals
  const totalValorisation = actifData.reduce((sum: number, a: any) => sum + a.valeurEstimee, 0);
  const totalAcquisition = actifData.reduce((sum: number, a: any) => sum + a.prixAcquisition, 0);
  const totalPlusValue = totalValorisation - totalAcquisition;

  // Chart data
  const chartData = actifData
    .filter((a: any) => a.prixAcquisition > 0 || a.valeurEstimee > 0)
    .map((a: any) => ({
      name: a.nom.length > 20 ? a.nom.substring(0, 20) + "..." : a.nom,
      "Prix acquisition": a.prixAcquisition,
      "Valeur estimée": a.valeurEstimee,
    }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Valorisation"
          description="Analyse de la valorisation du patrimoine"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Valorisation totale"
            value={totalValorisation}
            formatFn={formatCurrency}
            icon={TrendingUp}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Prix d'acquisition total"
            value={totalAcquisition}
            formatFn={formatCurrency}
            icon={Landmark}
            variant="warning"
            gradient
            delay={1}
          />
          <KpiCard
            label="Plus/Moins value"
            value={totalPlusValue}
            formatFn={formatCurrency}
            icon={ArrowUpDown}
            variant={totalPlusValue >= 0 ? "success" : "danger"}
            gradient
            delay={2}
          />
        </div>

        {/* Bar chart: Prix acquisition vs Valeur estimée */}
        {chartData.length > 0 && (
          <GlassCard delay={3}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Prix d'acquisition vs Valeur estimée par actif
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="Prix acquisition" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={800} />
                <Bar dataKey="Valeur estimée" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={200} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex justify-center gap-6">
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} />
                Prix d'acquisition
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#3b82f6" }} />
                Valeur estimée
              </div>
            </div>
          </GlassCard>
        )}

        {/* Table per actif */}
        {actifData.length > 0 && (
          <Section title="Détail par actif" delay={4}>
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
                    <th className="px-4 py-3 text-right font-semibold">Surface (m²)</th>
                    <th className="px-4 py-3 text-right font-semibold">Prix acquisition</th>
                    <th className="px-4 py-3 text-right font-semibold">Valeur estimée</th>
                    <th className="px-4 py-3 text-right font-semibold">+/- Value</th>
                    <th className="px-4 py-3 text-right font-semibold">Rdt brut</th>
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
                      <td className="px-4 py-3 text-right">{a.surface > 0 ? `${a.surface.toFixed(0)}` : "—"}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(a.prixAcquisition)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(a.valeurEstimee)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${a.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {a.plusValue >= 0 ? "+" : ""}{formatCurrency(a.plusValue)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatPercent(a.rendementBrut)}</td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalAcquisition)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalValorisation)}</td>
                    <td className={`px-4 py-3 text-right ${totalPlusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {totalPlusValue >= 0 ? "+" : ""}{formatCurrency(totalPlusValue)}
                    </td>
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
