import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatNumber } from "../../lib/utils";
import { getBailLoyer, isResilie } from "@shared/utils/bail";
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

  const bauxActifs = baux.filter((b: any) => !b.archived && !isResilie(b));
  const totalLoyerHT = bauxActifs.reduce((sum: number, b: any) => sum + getBailLoyer(b), 0);
  const totalCharges = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.charges || 0), 0);
  const totalCapacite = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.capacite || 0), 0);
  const totalSurface = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.surface || 0), 0);
  const totalDepotGarantie = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.depotGarantie || 0), 0);
  const totalTaxeFonciere = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.taxeFonciere || 0), 0);

  const totalChargesAn = totalCharges * 12;
  const coutMoyenBerceau = totalCapacite > 0 ? totalLoyerHT / totalCapacite : 0;
  const loyerMoyenM2 = totalSurface > 0 ? totalLoyerHT / totalSurface : 0;
  const chargesMoyennesM2 = totalSurface > 0 ? totalChargesAn / totalSurface : 0;
  const surfaceParBerceau = totalCapacite > 0 ? totalSurface / totalCapacite : 0;
  const chargesParBerceau = totalCapacite > 0 ? totalChargesAn / totalCapacite : 0;
  const totalPaiements = paiements.reduce((sum: number, p: any) => sum + Number(p.montant || 0), 0);

  // Pie chart: répartition loyer par type de bail
  const loyerParType: Record<string, number> = {};
  bauxActifs.forEach((b: any) => {
    const t = b.typeBail || "Non renseigné";
    loyerParType[t] = (loyerParType[t] || 0) + getBailLoyer(b);
  });
  const pieData = Object.entries(loyerParType)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Bar chart: loyer vs charges per bail (top 10)
  const barData = bauxActifs
    .filter((b: any) => getBailLoyer(b) > 0)
    .map((b: any) => ({
      name: b.nom?.length > 18 ? b.nom.substring(0, 18) + "..." : b.nom,
      loyer: getBailLoyer(b),
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

  // Coût total par berceau (loyer + charges annualisées + taxe foncière)
  const coutTotalBerceau = totalCapacite > 0 ? (totalLoyerHT + totalChargesAn + totalTaxeFonciere) / totalCapacite : 0;

  // WALT — Weighted Average Lease Term (years remaining, weighted by rent)
  const walt = useMemo(() => {
    const now = new Date();
    let weightedSum = 0;
    let totalWeight = 0;
    for (const b of bauxActifs) {
      const loyer = getBailLoyer(b);
      const dateFin = (b as any).dateFin;
      if (loyer > 0 && dateFin) {
        const fin = new Date(dateFin);
        if (!isNaN(fin.getTime())) {
          const yearsLeft = Math.max(0, (fin.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          weightedSum += yearsLeft * loyer;
          totalWeight += loyer;
        }
      }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }, [bauxActifs]);

  // Lease expiry profile (number of leases expiring by year)
  const expiryProfile = useMemo(() => {
    const now = new Date();
    const profile: Record<string, { count: number; loyer: number }> = {};
    for (const b of bauxActifs) {
      const dateFin = (b as any).dateFin;
      if (dateFin) {
        const year = new Date(dateFin).getFullYear();
        if (year >= now.getFullYear()) {
          const key = String(year);
          if (!profile[key]) profile[key] = { count: 0, loyer: 0 };
          profile[key].count++;
          profile[key].loyer += getBailLoyer(b);
        }
      }
    }
    return Object.entries(profile)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, data]) => ({ year, count: data.count, loyer: data.loyer }));
  }, [bauxActifs]);

  // Baux sans date de fin
  const bauxSansEcheance = bauxActifs.filter((b: any) => !b.dateFin).length;

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
            metricKey="loyerHT"
          />
          <KpiCard
            label="Charges annuelles"
            value={totalChargesAn}
            formatFn={formatCurrency}
            icon={Target}
            variant="warning"
            gradient
            delay={1}
            metricKey="chargesAnnuelles"
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
            metricKey="prixM2"
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
            label="Surface / berceau"
            value={surfaceParBerceau}
            formatFn={(n) => n > 0 ? `${formatNumber(n)} m²/berc.` : "N/A"}
            icon={Building2}
            delay={5}
          />
          <KpiCard
            label="Charges / berceau"
            value={chargesParBerceau}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/berc.` : "N/A"}
            icon={PiggyBank}
            delay={6}
          />
          <KpiCard
            label="Berceaux total"
            value={totalCapacite}
            formatFn={(n) => `${formatNumber(n)} berceaux`}
            icon={Users}
            delay={7}
          />
        </div>

        {/* Lease management KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="WALT"
            value={walt}
            formatFn={(n) => n > 0 ? `${n.toFixed(1)} ans` : "N/A"}
            icon={TrendingUp}
            variant={walt > 5 ? "success" : walt > 2 ? "warning" : "danger"}
            delay={8}
            subtitle="Durée moyenne pondérée"
            metricKey="walt"
          />
          <KpiCard
            label="Baux actifs"
            value={bauxActifs.length}
            icon={Building2}
            delay={9}
            subtitle={bauxSansEcheance > 0 ? `${bauxSansEcheance} sans échéance` : undefined}
          />
          <KpiCard
            label="Dépôts de garantie"
            value={totalDepotGarantie}
            formatFn={formatCurrency}
            icon={CreditCard}
            delay={10}
          />
          <KpiCard
            label="Paiements enregistrés"
            value={totalPaiements}
            formatFn={formatCurrency}
            icon={CreditCard}
            delay={11}
          />
        </div>


        {/* Lease expiry profile */}
        {expiryProfile.length > 0 && (
          <GlassCard delay={7}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Profil d'echeance des baux
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={expiryProfile} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number, name: string) => name === "Loyer a risque" ? formatCurrency(v) : v} />
                <Bar yAxisId="left" dataKey="count" name="Baux expirant" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={800} />
                <Bar yAxisId="right" dataKey="loyer" name="Loyer a risque" fill="#ef4444" radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

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
                    <th className="px-4 py-3 text-right font-semibold">Surface/berc.</th>
                    <th className="px-4 py-3 text-right font-semibold">Coût total/berc.</th>
                    <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  </tr>
                </thead>
                <tbody>
                  {bauxActifs.map((b: any, i: number) => {
                    const loyer = getBailLoyer(b);
                    const surface = Number(b.surface || 0);
                    const capacite = Number(b.capacite || 0);
                    const charges = Number(b.charges || 0);
                    const loyerM2 = surface > 0 ? loyer / surface : 0;
                    const loyerBerceau = capacite > 0 ? loyer / capacite : 0;
                    const surfBerc = capacite > 0 && surface > 0 ? surface / capacite : 0;
                    const coutTotalBerc = capacite > 0 ? (loyer + charges * 12 + Number(b.taxeFonciere || 0)) / capacite : 0;

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
                        <td className="px-4 py-3 text-right">{surfBerc > 0 ? `${formatNumber(surfBerc)} m²` : "—"}</td>
                        <td className="px-4 py-3 text-right">{coutTotalBerc > 0 ? formatCurrency(coutTotalBerc) : "—"}</td>
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
                {bauxActifs.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right">{formatCurrency(totalLoyerHT)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(totalCharges)}</td>
                      <td className="px-4 py-3 text-right">{totalSurface > 0 ? `${formatNumber(totalSurface)} m²` : "—"}</td>
                      <td className="px-4 py-3 text-right">{totalCapacite || "—"}</td>
                      <td className="px-4 py-3 text-right">{loyerMoyenM2 > 0 ? `${formatCurrency(loyerMoyenM2)}/m²` : "—"}</td>
                      <td className="px-4 py-3 text-right">{coutMoyenBerceau > 0 ? formatCurrency(coutMoyenBerceau) : "—"}</td>
                      <td className="px-4 py-3 text-right">{surfaceParBerceau > 0 ? `${formatNumber(surfaceParBerceau)} m²` : "—"}</td>
                      <td className="px-4 py-3 text-right">{coutTotalBerceau > 0 ? formatCurrency(coutTotalBerceau) : "—"}</td>
                      <td className="px-4 py-3" />
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
