import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatNumber } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { SkeletonKpi, SkeletonCard, SkeletonTable } from "../../components/ui/skeleton";
import {
  Building2, FileText, Users, BarChart3, MapPin, Calculator,
  PiggyBank, AlertTriangle, CreditCard, TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { getBailLoyer, isResilie } from "@shared/utils/bail";

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

const toArray = (v: unknown): any[] => Array.isArray(v) ? v : [];

export default function GLDashboard() {
  const [, navigate] = useLocation();
  const { data: rawBaux, isLoading: l1, isError: e1, error: err1 } = useQuery({ queryKey: ["/api/gl/baux"], queryFn: () => apiRequest("/api/gl/baux") });
  const { data: rawBailleurs, isLoading: l2, isError: e2, error: err2 } = useQuery({ queryKey: ["/api/gl/bailleurs"], queryFn: () => apiRequest("/api/gl/bailleurs") });
  const { data: rawPaiements, isLoading: l3, isError: e3, error: err3 } = useQuery({ queryKey: ["/api/gl/paiements"], queryFn: () => apiRequest("/api/gl/paiements") });

  const baux = toArray(rawBaux);
  const bailleurs = toArray(rawBailleurs);
  const paiements = toArray(rawPaiements);
  const isLoading = l1 || l2 || l3;
  const hasError = e1 || e2 || e3;
  const errorDetail = [err1, err2, err3].filter(Boolean).map((e: any) => e?.message).join(" | ");

  // Exclure les baux archivés ET résiliés des totaux : un bail résilié ne génère
  // plus de loyers même s'il existe encore en base.
  const bauxActifs = baux.filter((b: any) => !b.archived && !isResilie(b));
  const totalLoyerHT = bauxActifs.reduce((sum: number, b: any) => sum + getBailLoyer(b), 0);
  const totalSurface = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.surface || 0), 0);
  const totalCapacite = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.capacite || 0), 0);
  const totalCharges = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.charges || 0), 0);
  const totalDepotGarantie = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.depotGarantie || 0), 0);

  // Paiements stats
  const totalPaiements = paiements.reduce((sum: number, p: any) => sum + Number(p.montant || 0), 0);

  // Paiements par mois (last 12 months)
  const paiementsMensuels = useMemo(() => {
    const now = new Date();
    const months: { name: string; montant: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      const montant = paiements
        .filter((p: any) => (p.date || p.datePaiement || "").startsWith(key))
        .reduce((s: number, p: any) => s + Number(p.montant || 0), 0);
      months.push({ name: label, montant });
    }
    return months;
  }, [paiements]);

  // Échéances proches (baux expirant dans 6 mois)
  const echeancesProches = useMemo(() => {
    const now = new Date();
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    return bauxActifs
      .filter((b: any) => {
        if (!b.dateFin) return false;
        const fin = new Date(b.dateFin);
        return fin > now && fin <= sixMonths;
      })
      .map((b: any) => {
        const fin = new Date(b.dateFin);
        const days = Math.ceil((fin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...b, daysLeft: days };
      })
      .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
  }, [bauxActifs]);

  // Loyers par ville (pie chart)
  const loyerParVille: Record<string, number> = {};
  bauxActifs.forEach((b: any) => {
    const v = b.ville || "Non renseigné";
    loyerParVille[v] = (loyerParVille[v] || 0) + getBailLoyer(b);
  });
  const pieData = Object.entries(loyerParVille)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Bar chart: loyer par bail
  const barData = bauxActifs
    .filter((b: any) => getBailLoyer(b) > 0)
    .map((b: any) => ({
      name: b.nom?.length > 15 ? b.nom.substring(0, 15) + "..." : b.nom,
      loyer: getBailLoyer(b),
      charges: Number(b.charges || 0),
    }))
    .sort((a: any, b: any) => b.loyer - a.loyer)
    .slice(0, 10);

  // Indices référence breakdown
  const indicesCount: Record<string, number> = {};
  bauxActifs.forEach((b: any) => {
    const idx = b.indiceReference || "Non défini";
    indicesCount[idx] = (indicesCount[idx] || 0) + 1;
  });

  // Early returns AFTER all hooks (React rules of hooks)
  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Gestion Locative" description="Chargement des données..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-8">
        <PageHeader title="Gestion Locative" description="Suivi des baux commerciaux" />
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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Gestion Locative"
          description="Suivi des baux commerciaux — crèches et locaux"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Loyer HT annuel" value={totalLoyerHT}
            formatFn={formatCurrency} icon={BarChart3}
            variant="primary" gradient delay={0} metricKey="loyerHT"
          />
          <KpiCard
            label="Baux actifs" value={bauxActifs.length}
            icon={FileText} variant="success" gradient delay={1}
          />
          <KpiCard
            label="Surface totale" value={totalSurface}
            formatFn={(n) => `${formatNumber(n)} m²`} icon={Building2}
            variant="warning" gradient delay={2} metricKey="surface"
          />
          <KpiCard
            label="Capacité" value={totalCapacite}
            formatFn={(n) => `${formatNumber(n)} berceaux`} icon={Users}
            variant="primary" gradient delay={3}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Loyer mensuel" value={totalLoyerHT / 12} formatFn={formatCurrency} icon={BarChart3} delay={4} metricKey="loyerHT" />
          <KpiCard
            label="Loyer / berceau"
            value={totalCapacite > 0 ? totalLoyerHT / totalCapacite : 0}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/berc.` : "N/A"}
            icon={Calculator} delay={5}
          />
          <KpiCard
            label="Surface / berceau"
            value={totalCapacite > 0 ? totalSurface / totalCapacite : 0}
            formatFn={(n) => n > 0 ? `${formatNumber(n)} m²/berc.` : "N/A"}
            icon={Building2} delay={6}
          />
          <KpiCard
            label="Coût locatif / berceau"
            value={totalCapacite > 0 ? (totalLoyerHT + totalCharges * 12) / totalCapacite : 0}
            formatFn={(n) => n > 0 ? `${formatCurrency(n)}/berc.` : "N/A"}
            icon={PiggyBank} delay={7}
          />
        </div>

        {/* Échéances proches */}
        {echeancesProches.length > 0 && (
          <GlassCard delay={5}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Échéances dans les 6 mois
            </h3>
            <div className="space-y-2">
              {echeancesProches.map((b: any) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/gestion-locative/baux/${b.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{b.nom}</span>
                    <span className="text-sm text-muted-foreground">{b.ville}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {new Date(b.dateFin).toLocaleDateString("fr-FR")}
                    </span>
                    <Badge variant={b.daysLeft <= 90 ? "danger" : "warning"}>
                      {b.daysLeft}j
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Charts row 1: Pie + Bar */}
        <div className="grid gap-6 lg:grid-cols-2">
          {pieData.length > 0 && (
            <GlassCard delay={6}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Loyers par ville
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

          {barData.length > 0 && (
            <GlassCard delay={7}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Loyer vs Charges (Top sites)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} layout="vertical" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
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

        {/* Paiements mensuels (area chart) */}
        {paiementsMensuels.some((m) => m.montant > 0) && (
          <GlassCard delay={8}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Paiements des 12 derniers mois
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={paiementsMensuels}>
                <defs>
                  <linearGradient id="gradPaiements" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Area
                  type="monotone" dataKey="montant" name="Paiements"
                  stroke="#3b82f6" fill="url(#gradPaiements)"
                  strokeWidth={2.5} animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* Indices breakdown */}
        {Object.keys(indicesCount).length > 0 && (
          <GlassCard delay={9}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Indices de référence
            </h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(indicesCount).map(([idx, count]) => (
                <motion.div
                  key={idx}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2"
                >
                  <span className="text-sm font-semibold text-primary">{idx}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {count} {count > 1 ? "baux" : "bail"}
                  </span>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Baux table */}
        {bauxActifs.length > 0 && (
          <Section title="Baux en cours" delay={5}>
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
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="loyerHT">Loyer HT</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="charges">Charges</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold"><InfoTooltip metricKey="surface">Surface</InfoTooltip></th>
                    <th className="px-4 py-3 text-right font-semibold">Berceaux</th>
                    <th className="px-4 py-3 text-right font-semibold">Loyer/berc.</th>
                    <th className="px-4 py-3 text-right font-semibold">m²/berc.</th>
                    <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  </tr>
                </thead>
                <tbody>
                  {bauxActifs.map((b: any, i: number) => (
                    <motion.tr
                      key={b.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.03, 0.6 + 0.5) }}
                      className="border-t transition-colors hover:bg-muted/20 cursor-pointer"
                      onClick={() => navigate(`/gestion-locative/baux/${b.id}`)}
                    >
                      <td className="px-4 py-3 font-medium">{b.nom}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {b.ville || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{getBailLoyer(b) > 0 ? formatCurrency(getBailLoyer(b)) : "—"}</td>
                      <td className="px-4 py-3 text-right">{b.charges ? formatCurrency(b.charges) : "—"}</td>
                      <td className="px-4 py-3 text-right">{b.surface ? `${b.surface} m²` : "—"}</td>
                      <td className="px-4 py-3 text-right">{b.capacite || "—"}</td>
                      <td className="px-4 py-3 text-right">{b.capacite && getBailLoyer(b) > 0 ? formatCurrency(getBailLoyer(b) / Number(b.capacite)) : "—"}</td>
                      <td className="px-4 py-3 text-right">{b.capacite && b.surface ? `${formatNumber(Number(b.surface) / Number(b.capacite))} m²` : "—"}</td>
                      <td className="px-4 py-3">
                        {b.indiceReference ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {b.indiceReference}
                          </span>
                        ) : "—"}
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
