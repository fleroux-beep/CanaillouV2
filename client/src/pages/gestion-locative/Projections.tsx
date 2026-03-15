import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, Cell,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
  TrendingUp, Calculator, Gauge, Target, AlertTriangle, Baby,
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

function compound(base: number, rate: number, years: number): number {
  return base * Math.pow(1 + rate / 100, years);
}

function SliderInput({
  label, value, onChange, min, max, step, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-semibold tabular-nums text-primary">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary h-2 rounded-full appearance-none bg-muted cursor-pointer"
      />
    </div>
  );
}

export default function ProjectionsPage() {
  const { data: baux = [] } = useQuery({ queryKey: ["/api/gl/baux"], queryFn: () => apiRequest("/api/gl/baux") });
  const { data: indices = [] } = useQuery({ queryKey: ["/api/gl/indices"], queryFn: () => apiRequest("/api/gl/indices") });

  const [activeTab, setActiveTab] = useState("scenarios");
  const [customRate, setCustomRate] = useState(3);
  const [chargesInflation, setChargesInflation] = useState(2);
  const [horizon, setHorizon] = useState(5);

  const bauxActifs = baux.filter((b: any) => !b.archived);
  const totalLoyerActuel = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.loyerHTActu || b.loyerBaseHT || 0), 0);
  const totalCharges = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.charges || 0), 0);
  const totalSurface = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.surface || 0), 0);
  const totalBerceaux = bauxActifs.reduce((sum: number, b: any) => sum + Number(b.capacite || b.berceaux || 0), 0);

  const loyerN1 = compound(totalLoyerActuel, customRate, 1);
  const loyerN3 = compound(totalLoyerActuel, customRate, 3);
  const loyerNMax = compound(totalLoyerActuel, customRate, horizon);

  // Multi-scenario chart (ILC 2%, ref 3%, high 4%, custom)
  const projectionData = useMemo(() => {
    const scenarios = [
      { key: "ILC 2%", rate: 2 },
      { key: `Référence ${customRate}%`, rate: customRate },
      { key: "Haut 4%", rate: 4 },
    ];
    return Array.from({ length: horizon + 1 }, (_, year) => {
      const row: any = { name: year === 0 ? "Actuel" : `N+${year}` };
      for (const s of scenarios) {
        row[s.key] = Math.round(compound(totalLoyerActuel, s.rate, year));
      }
      return row;
    });
  }, [totalLoyerActuel, customRate, horizon]);

  // Calculate actual average annual rates from indices in DB
  const indiceRates = useMemo(() => {
    const rates: Record<string, number> = {};
    const byType: Record<string, { trimestre: string; valeur: number }[]> = {};
    for (const idx of indices) {
      const t = (idx as any).type;
      if (!byType[t]) byType[t] = [];
      byType[t].push({ trimestre: (idx as any).trimestre, valeur: Number((idx as any).valeur || 0) });
    }
    for (const [type, vals] of Object.entries(byType)) {
      const sorted = vals.sort((a, b) => a.trimestre.localeCompare(b.trimestre));
      if (sorted.length >= 2) {
        const oldest = sorted[0].valeur;
        const latest = sorted[sorted.length - 1].valeur;
        // Estimate number of years between first and last
        const firstYear = parseInt(sorted[0].trimestre.slice(0, 4)) || 0;
        const lastYear = parseInt(sorted[sorted.length - 1].trimestre.slice(0, 4)) || 0;
        const years = Math.max(1, lastYear - firstYear);
        if (oldest > 0) {
          rates[type] = (Math.pow(latest / oldest, 1 / years) - 1) * 100;
        }
      }
    }
    return rates;
  }, [indices]);

  // Per-bail projections grouped by index
  const bailProjections = useMemo(() => {
    return bauxActifs.map((b: any) => {
      const loyer = Number(b.loyerHTActu || b.loyerBaseHT || 0);
      const indice = (b.indiceReference || "").toUpperCase();
      const rate = indiceRates[indice] ?? customRate;
      const n1 = compound(loyer, rate, 1);
      const n3 = compound(loyer, rate, 3);
      const nMax = compound(loyer, rate, horizon);
      const surface = Number(b.surface || 0);
      const berceaux = Number(b.capacite || b.berceaux || 0);
      return {
        id: b.id,
        nom: b.nom || b.adresse || `Bail #${b.id}`,
        indice: indice || "Manuel",
        tauxApplique: rate,
        loyerActuel: loyer,
        loyerN1: n1,
        loyerN3: n3,
        loyerNMax: nMax,
        deltaN3: n3 - loyer,
        deltaPct: loyer > 0 ? ((n3 - loyer) / loyer) * 100 : 0,
        surface,
        berceaux,
        loyerParBerceau: berceaux > 0 ? loyer / berceaux : 0,
        loyerParM2: surface > 0 ? loyer / surface : 0,
      };
    });
  }, [bauxActifs, customRate, horizon, indiceRates]);

  // Charges vs loyers projection
  const loyerVsChargesData = useMemo(() => {
    return Array.from({ length: horizon + 1 }, (_, year) => ({
      name: year === 0 ? "Actuel" : `N+${year}`,
      "Loyers HT": Math.round(compound(totalLoyerActuel, customRate, year)),
      "Charges": Math.round(compound(totalCharges, chargesInflation, year)),
      "Coût locatif total": Math.round(compound(totalLoyerActuel, customRate, year) + compound(totalCharges, chargesInflation, year)),
    }));
  }, [totalLoyerActuel, totalCharges, customRate, chargesInflation, horizon]);

  // Per-index aggregation
  const byIndex = useMemo(() => {
    const groups: Record<string, { loyer: number; count: number; n3: number }> = {};
    for (const bp of bailProjections) {
      const key = bp.indice || "Autre";
      if (!groups[key]) groups[key] = { loyer: 0, count: 0, n3: 0 };
      groups[key].loyer += bp.loyerActuel;
      groups[key].count += 1;
      groups[key].n3 += bp.loyerN3;
    }
    return Object.entries(groups).map(([indice, data]) => ({
      indice,
      loyer: data.loyer,
      count: data.count,
      loyerN3: data.n3,
      delta: data.n3 - data.loyer,
    }));
  }, [bailProjections]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Projections"
          description="Simulation de l'evolution des loyers et charges — Les Petites Canailles"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Loyer actuel total" value={totalLoyerActuel}
            formatFn={formatCurrency} icon={Calculator}
            variant="primary" gradient delay={0}
          />
          <KpiCard
            label="Loyer projeté N+1" value={loyerN1}
            formatFn={formatCurrency} icon={TrendingUp}
            variant="success" gradient delay={1}
          />
          <KpiCard
            label={`Loyer projeté N+${horizon}`} value={loyerNMax}
            formatFn={formatCurrency} icon={Target}
            variant="warning" gradient delay={2}
          />
          <KpiCard
            label="Berceaux total" value={totalBerceaux}
            formatFn={(n) => `${n}`} icon={Baby}
            variant="primary" gradient delay={3}
            subtitle={totalBerceaux > 0 ? `${formatCurrency(totalLoyerActuel / totalBerceaux)}/berceau` : undefined}
          />
        </div>

        {/* Parametres */}
        <GlassCard delay={1}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Hypothèses
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <SliderInput
              label="Taux d'indexation" value={customRate} onChange={setCustomRate}
              min={0} max={8} step={0.5} unit="%"
            />
            <SliderInput
              label="Inflation charges" value={chargesInflation} onChange={setChargesInflation}
              min={0} max={8} step={0.5} unit="%"
            />
            <SliderInput
              label="Horizon" value={horizon} onChange={setHorizon}
              min={3} max={15} step={1} unit=" ans"
            />
          </div>
        </GlassCard>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="scenarios">Multi-scenarios</TabsTrigger>
            <TabsTrigger value="marges">Loyers vs Charges</TabsTrigger>
            <TabsTrigger value="detail">Détail par bail</TabsTrigger>
            <TabsTrigger value="indices">Par indice</TabsTrigger>
          </TabsList>

          {/* Multi-scenario */}
          <TabsContent value="scenarios">
            <GlassCard delay={2} className="mt-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Projection sur {horizon} ans
              </h3>
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart data={projectionData}>
                  <defs>
                    <linearGradient id="gradLow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRef" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="ILC 2%" stroke="#06b6d4" fill="url(#gradLow)" strokeWidth={2} />
                  <Area type="monotone" dataKey={`Référence ${customRate}%`} stroke="#3b82f6" fill="url(#gradRef)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="Haut 4%" stroke="#f59e0b" fill="url(#gradHigh)" strokeWidth={2} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </GlassCard>
          </TabsContent>

          {/* Loyers vs Charges */}
          <TabsContent value="marges">
            <GlassCard delay={2} className="mt-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Évolution loyers vs charges
              </h3>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={loyerVsChargesData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="Loyers HT" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Charges" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Coût locatif total" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          </TabsContent>

          {/* Détail par bail */}
          <TabsContent value="detail">
            <Section title="Projections par bail" delay={2}>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-3 text-left font-semibold">Site</th>
                      <th className="px-3 py-3 text-right font-semibold">Loyer actuel</th>
                      <th className="px-3 py-3 text-left font-semibold">Indice</th>
                      <th className="px-3 py-3 text-right font-semibold">Taux</th>
                      <th className="px-3 py-3 text-right font-semibold">N+1</th>
                      <th className="px-3 py-3 text-right font-semibold">N+3</th>
                      <th className="px-3 py-3 text-right font-semibold">Delta N+3</th>
                      <th className="px-3 py-3 text-right font-semibold">Berceaux</th>
                      <th className="px-3 py-3 text-right font-semibold">Loyer/berceau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bailProjections.map((bp: any, i: number) => (
                      <motion.tr
                        key={bp.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(0.1 + i * 0.03, 0.1 + 0.5) }}
                        className="border-t transition-colors hover:bg-muted/20"
                      >
                        <td className="px-3 py-3 font-medium">{bp.nom}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(bp.loyerActuel)}</td>
                        <td className="px-3 py-3">
                          <Badge variant={bp.indice === "ILC" ? "primary" : bp.indice === "ILAT" ? "success" : bp.indice === "IRL" ? "warning" : "outline"}>
                            {bp.indice}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right">{formatPercent(bp.tauxApplique)}</td>
                        <td className="px-3 py-3 text-right font-medium">{formatCurrency(bp.loyerN1)}</td>
                        <td className="px-3 py-3 text-right font-medium">{formatCurrency(bp.loyerN3)}</td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-green-600 dark:text-green-400">
                            +{formatCurrency(bp.deltaN3)} ({formatPercent(bp.deltaPct)})
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">{bp.berceaux > 0 ? bp.berceaux : "\u2014"}</td>
                        <td className="px-3 py-3 text-right">{bp.loyerParBerceau > 0 ? formatCurrency(bp.loyerParBerceau) : "\u2014"}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                  {bailProjections.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="px-3 py-3">Total</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(totalLoyerActuel)}</td>
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3 text-right">{formatCurrency(loyerN1)}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(loyerN3)}</td>
                        <td className="px-3 py-3 text-right text-green-600">+{formatCurrency(loyerN3 - totalLoyerActuel)}</td>
                        <td className="px-3 py-3 text-right">{totalBerceaux > 0 ? totalBerceaux : "\u2014"}</td>
                        <td className="px-3 py-3 text-right">{totalBerceaux > 0 ? formatCurrency(totalLoyerActuel / totalBerceaux) : "\u2014"}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Section>
          </TabsContent>

          {/* Par indice */}
          <TabsContent value="indices">
            <div className="grid gap-6 lg:grid-cols-2 mt-6">
              <GlassCard delay={2}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Répartition par indice de référence
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left font-semibold">Indice</th>
                        <th className="px-4 py-3 text-right font-semibold">Baux</th>
                        <th className="px-4 py-3 text-right font-semibold">Loyer actuel</th>
                        <th className="px-4 py-3 text-right font-semibold">Loyer N+3</th>
                        <th className="px-4 py-3 text-right font-semibold">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byIndex.map((row) => (
                        <tr key={row.indice} className="border-t hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <Badge variant="primary">{row.indice}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">{row.count}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(row.loyer)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.loyerN3)}</td>
                          <td className="px-4 py-3 text-right text-green-600">+{formatCurrency(row.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <GlassCard delay={3}>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Impact par indice
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byIndex}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="indice" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="loyer" name="Actuel" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="loyerN3" name="N+3" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </GlassCard>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </AnimatePresence>
  );
}
