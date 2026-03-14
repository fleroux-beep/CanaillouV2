import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatNumber } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { BarChart3, Target, Calculator, Building2, CreditCard, PiggyBank, TrendingUp, Users } from "lucide-react";

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

export default function GLKPIPage() {
  const { data: baux = [] } = useQuery({ queryKey: ["/api/gl/baux"], queryFn: () => apiRequest("/api/gl/baux") });
  const { data: paiements = [] } = useQuery({ queryKey: ["/api/gl/paiements"], queryFn: () => apiRequest("/api/gl/paiements") });

  const bauxActifs = baux.filter((b: any) => !b.archived);
  const totalLoyerHT = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.loyerBaseHT || 0), 0);
  const totalCharges = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.charges || 0), 0);
  const totalCapacite = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.capacite || 0), 0);
  const totalSurface = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.surface || 0), 0);
  const totalDepotGarantie = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.depotGarantie || 0), 0);
  const totalTaxeFonciere = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.taxeFonciere || 0), 0);

  const coutMoyenBerceau = totalCapacite > 0 ? totalLoyerHT / totalCapacite : 0;
  const loyerMoyenM2 = totalSurface > 0 ? totalLoyerHT / totalSurface : 0;
  const chargesMoyennesM2 = totalSurface > 0 ? totalCharges / totalSurface : 0;
  const totalPaiements = paiements.reduce((sum: number, p: any) => sum + Number(p.montant || 0), 0);

  // Pie chart: répartition loyer par type de bail
  const loyerParType: Record<string, number> = {};
  bauxActifs.forEach((b: any) => {
    const t = b.typeBail || "Non renseigné";
    loyerParType[t] = (loyerParType[t] || 0) + Number(b.loyerBaseHT || 0);
  });
  const pieData = Object.entries(loyerParType)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Bar chart: loyer vs charges per bail (top 10)
  const barData = bauxActifs
    .filter((b: any) => b.loyerBaseHT)
    .map((b: any) => ({
      name: b.nom?.length > 18 ? b.nom.substring(0, 18) + "..." : b.nom,
      loyer: Number(b.loyerBaseHT || 0),
      charges: Number(b.charges || 0),
    }))
    .sort((a: any, b: any) => b.loyer - a.loyer)
    .slice(0, 10);

  // Paiements par type
  const paiementsParType = useMemo(() => {
    const grouped: Record<string, number> = {};
    paiements.forEach((p: any) => {
      const t = p.type || "Autre";
      grouped[t] = (grouped[t] || 0) + Number(p.montant || 0);
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [paiements]);

  // Coût total par berceau (loyer + charges + taxe foncière)
  const coutTotalBerceau = totalCapacite > 0 ? (totalLoyerHT + totalCharges + totalTaxeFonciere) / totalCapacite : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="KPI Gestion Locative"
          description="Indicateurs clés de performance"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Loyer total HT"
            value={totalLoyerHT}
            formatFn={formatCurrency}
            icon={BarChart3}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Charges totales"
            value={totalCharges}
            formatFn={formatCurrency}
            icon={Target}
            variant="warning"
            gradient
            delay={1}
          />
          <KpiCard
            label="Coût moyen / berceau"
            value={coutMoyenBerceau}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/berc.` : "N/A"}
            icon={Calculator}
            variant="success"
            gradient
            delay={2}
          />
          <KpiCard
            label="Loyer moyen / m²"
            value={loyerMoyenM2}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/m²` : "N/A"}
            icon={Building2}
            variant="danger"
            gradient
            delay={3}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Coût total / berceau"
            value={coutTotalBerceau}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/berc.` : "N/A"}
            icon={Users}
            delay={4}
          />
          <KpiCard
            label="Charges / m²"
            value={chargesMoyennesM2}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/m²` : "N/A"}
            icon={PiggyBank}
            delay={5}
          />
          <KpiCard
            label="Taxe foncière totale"
            value={totalTaxeFonciere}
            formatFn={formatCurrency}
            icon={Calculator}
            delay={6}
          />
          <KpiCard
            label="Paiements enregistrés"
            value={totalPaiements}
            formatFn={formatCurrency}
            icon={CreditCard}
            delay={7}
          />
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pie: répartition par type de bail */}
          {pieData.length > 0 && (
            <GlassCard delay={4}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Répartition loyer par type de bail
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={200} animationDuration={1000}
                  >
                    {pieData.map((_: any, i: number) => (
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
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Bar: loyer vs charges */}
          {barData.length > 0 && (
            <GlassCard delay={5}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Loyer vs Charges (Top 10)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} layout="vertical" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="loyer" name="Loyer HT" fill="#3b82f6" radius={[0, 4, 4, 0]} animationDuration={800} />
                  <Bar dataKey="charges" name="Charges" fill="#f59e0b" radius={[0, 4, 4, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          )}
        </div>

        {/* Paiements par type */}
        {paiementsParType.length > 0 && (
          <GlassCard delay={6}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Paiements par type
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {paiementsParType.map((pt, i) => (
                <motion.div
                  key={pt.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.3 + i * 0.08, 0.3 + 0.5) }}
                  className="rounded-xl border bg-muted/20 p-4"
                >
                  <Badge variant="primary" className="mb-2">{pt.name}</Badge>
                  <p className="text-lg font-bold">{formatCurrency(pt.value)}</p>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Per-bail table */}
        {bauxActifs.length > 0 && (
          <Section title="Détail par bail" delay={6}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold">Site</th>
                    <th className="px-4 py-3 text-left font-semibold">Ville</th>
                    <th className="px-4 py-3 text-right font-semibold">Loyer HT</th>
                    <th className="px-4 py-3 text-right font-semibold">Charges</th>
                    <th className="px-4 py-3 text-right font-semibold">Surface</th>
                    <th className="px-4 py-3 text-right font-semibold">Capacité</th>
                    <th className="px-4 py-3 text-right font-semibold">Loyer/m²</th>
                    <th className="px-4 py-3 text-right font-semibold">Loyer/berceau</th>
                    <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  </tr>
                </thead>
                <tbody>
                  {bauxActifs.map((b: any, i: number) => {
                    const loyer = Number(b.loyerBaseHT || 0);
                    const surface = Number(b.surface || 0);
                    const capacite = Number(b.capacite || 0);
                    const charges = Number(b.charges || 0);
                    const loyerM2 = surface > 0 ? loyer / surface : 0;
                    const loyerBerceau = capacite > 0 ? loyer / capacite : 0;

                    return (
                      <motion.tr
                        key={b.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(0.6 + i * 0.03, 0.6 + 0.5) }}
                        className="border-t transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3 font-medium">{b.nom}</td>
                        <td className="px-4 py-3">{b.ville || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(loyer)}</td>
                        <td className="px-4 py-3 text-right">{charges ? formatCurrency(charges) : "—"}</td>
                        <td className="px-4 py-3 text-right">{surface ? `${formatNumber(surface)} m²` : "—"}</td>
                        <td className="px-4 py-3 text-right">{capacite || "—"}</td>
                        <td className="px-4 py-3 text-right">{loyerM2 > 0 ? `${formatCurrency(loyerM2)}/m²` : "—"}</td>
                        <td className="px-4 py-3 text-right">{loyerBerceau > 0 ? formatCurrency(loyerBerceau) : "—"}</td>
                        <td className="px-4 py-3">
                          {b.indiceReference ? (
                            <Badge variant="primary">{b.indiceReference}</Badge>
                          ) : (
                            <Badge variant="outline">—</Badge>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </motion.div>
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
