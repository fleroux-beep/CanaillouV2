import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line,
  ScatterChart, Scatter, ZAxis, Legend, LabelList, ReferenceLine,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent, formatNumber } from "../../lib/utils";
import {
  getValeurEstimee,
  getLoyerAnnuelActif,
  getChargesAnnuelles,
  getPrixAcquisition,
  getRendementBrut,
  getRendementNet,
  computeDCF,
  computeIRR,
  computeNPV,
  type DCFResult,
} from "../../lib/am-calculations";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import { KpiCard } from "../../components/ui/kpi-card";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  TrendingUp, Landmark, ArrowUpDown, Calculator, BarChart3,
  PieChartIcon, Ruler, Building2, Percent,
} from "lucide-react";

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

  const { sortKey, sortDir, handleSort, sortData } = useSortableTable();

  const [dcfDiscountRate, setDcfDiscountRate] = useState(6);
  const [dcfGrowthRate, setDcfGrowthRate] = useState(2);
  const [dcfExitCapRate, setDcfExitCapRate] = useState(5);
  const [dcfYears, setDcfYears] = useState(10);

  const actifsActifs = useMemo(() => actifs.filter((a: any) => !a.archived), [actifs]);

  // Per-actif data enriched
  const actifData = useMemo(() => actifsActifs.map((a: any) => {
    const sci = scis.find((s: any) => s.id === a.sciId);
    const valeurEstimee = getValeurEstimee(a, baux, lots);
    const prixAcquisition = getPrixAcquisition(a);
    const plusValue = valeurEstimee - prixAcquisition;
    const loyerAnnuel = getLoyerAnnuelActif(a, baux, lots);
    const charges = getChargesAnnuelles(a);
    const rendementBrut = getRendementBrut(loyerAnnuel, prixAcquisition);
    const rendementNet = getRendementNet(loyerAnnuel, charges, prixAcquisition);
    const surface = Number(a.surfaceCarrez || a.surface || 0);
    const prixM2 = surface > 0 ? prixAcquisition / surface : 0;
    const valeurM2 = surface > 0 ? valeurEstimee / surface : 0;
    const prixM2Marche = Number(a.prixM2Marche || 0);

    // Méthode capitalisation
    const tauxCapi = Number(a.tauxCapitalisation || 0);
    const loyerNet = Math.max(0, loyerAnnuel - charges);
    const valeurCapitalisation = tauxCapi > 0 && loyerNet > 0 ? loyerNet / (tauxCapi / 100) : 0;

    // Méthode comparables
    const valeurComparables = surface > 0 && prixM2Marche > 0 ? surface * prixM2Marche : 0;

    return {
      id: a.id,
      nom: a.nom || a.adresse || `Actif #${a.id}`,
      sciNom: sci?.nom || "—",
      surface,
      prixAcquisition,
      valeurEstimee,
      plusValue,
      plusValuePct: prixAcquisition > 0 ? (plusValue / prixAcquisition) * 100 : 0,
      loyerAnnuel,
      charges,
      noi: loyerNet,
      rendementBrut,
      rendementNet,
      prixM2,
      valeurM2,
      prixM2Marche,
      valeurCapitalisation,
      valeurComparables,
      tauxCapi,
    };
  }), [actifsActifs, scis, baux, lots]);

  // Totals
  const totalValorisation = actifData.reduce((sum: number, a: any) => sum + a.valeurEstimee, 0);
  const totalAcquisition = actifData.reduce((sum: number, a: any) => sum + a.prixAcquisition, 0);
  const totalPlusValue = totalValorisation - totalAcquisition;
  const totalPlusValuePct = totalAcquisition > 0 ? (totalPlusValue / totalAcquisition) * 100 : 0;
  const totalSurface = actifData.reduce((sum: number, a: any) => sum + a.surface, 0);
  const totalLoyers = actifData.reduce((sum: number, a: any) => sum + a.loyerAnnuel, 0);
  const totalCharges = actifData.reduce((sum: number, a: any) => sum + a.charges, 0);
  const totalNOI = totalLoyers - totalCharges;
  const avgRendementBrut = totalValorisation > 0 ? (totalLoyers / totalValorisation) * 100 : 0;
  const avgRendementNet = totalValorisation > 0 ? (totalNOI / totalValorisation) * 100 : 0;
  const avgPrixM2 = totalSurface > 0 ? totalAcquisition / totalSurface : 0;
  const avgValeurM2 = totalSurface > 0 ? totalValorisation / totalSurface : 0;

  // DCF portfolio-level
  const dcfResult: DCFResult | null = useMemo(() => {
    if (totalNOI <= 0 || totalAcquisition <= 0) return null;
    return computeDCF(totalNOI, dcfGrowthRate, dcfDiscountRate, dcfExitCapRate, dcfYears, totalAcquisition);
  }, [totalNOI, totalAcquisition, dcfGrowthRate, dcfDiscountRate, dcfExitCapRate, dcfYears]);

  // IRR simplifié (achat puis cash flows annuels + revente)
  const portfolioIRR = useMemo(() => {
    if (totalAcquisition <= 0 || totalNOI <= 0) return null;
    const flows = [-totalAcquisition];
    for (let y = 1; y <= 10; y++) {
      const cf = totalNOI * Math.pow(1 + dcfGrowthRate / 100, y);
      flows.push(y === 10 ? cf + totalValorisation : cf);
    }
    return computeIRR(flows);
  }, [totalAcquisition, totalNOI, totalValorisation, dcfGrowthRate]);

  // VAN à différents taux
  const vanSensitivity = useMemo(() => {
    if (totalAcquisition <= 0 || totalNOI <= 0) return [];
    const flows = [-totalAcquisition];
    for (let y = 1; y <= 10; y++) {
      const cf = totalNOI * Math.pow(1 + dcfGrowthRate / 100, y);
      flows.push(y === 10 ? cf + totalValorisation : cf);
    }
    return [3, 4, 5, 6, 7, 8, 9, 10].map((rate) => ({
      taux: `${rate}%`,
      van: computeNPV(flows, rate),
    }));
  }, [totalAcquisition, totalNOI, totalValorisation, dcfGrowthRate]);

  // Chart data: acquisition vs estimée
  const comparisonChart = actifData
    .filter((a: any) => a.prixAcquisition > 0 || a.valeurEstimee > 0)
    .map((a: any) => ({
      name: a.nom.length > 18 ? a.nom.substring(0, 18) + "…" : a.nom,
      "Prix acquisition": a.prixAcquisition,
      "Valeur estimée": a.valeurEstimee,
    }));

  // Scatter: prix/m² acquisition vs valeur/m²
  const scatterData = actifData
    .filter((a: any) => a.prixM2 > 0 && a.valeurM2 > 0)
    .map((a: any) => ({
      name: a.nom,
      x: a.prixM2,
      y: a.valeurM2,
      z: a.surface,
    }));

  // Méthodes de valorisation breakdown
  const methodData = actifData
    .filter((a: any) => a.valeurCapitalisation > 0 || a.valeurComparables > 0)
    .map((a: any) => ({
      name: a.nom.length > 18 ? a.nom.substring(0, 18) + "…" : a.nom,
      "Capitalisation": a.valeurCapitalisation,
      "Comparables": a.valeurComparables,
      "Retenue": a.valeurEstimee,
    }));

  // Plus-value pie chart
  const pvByActif = actifData
    .filter((a: any) => Math.abs(a.plusValue) > 0)
    .sort((a: any, b: any) => b.plusValue - a.plusValue)
    .map((a: any) => ({
      name: a.nom,
      value: Math.abs(a.plusValue),
      positive: a.plusValue >= 0,
    }));

  // DCF projected cash-flows chart
  const dcfChartData = dcfResult?.projectedCashFlows.map((cf, i) => ({
    year: `N+${i + 1}`,
    "Cash-flow": Math.round(cf),
  })) || [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Valorisation"
          description="Analyse approfondie de la valorisation du patrimoine"
        />

        {/* Hero KPIs - Row 1 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Valorisation totale"
            value={totalValorisation}
            formatFn={formatCurrency}
            icon={TrendingUp}
            variant="primary"
            gradient
            delay={0}
            metricKey="valorisation"
          />
          <KpiCard
            label="Prix d'acquisition total"
            value={totalAcquisition}
            formatFn={formatCurrency}
            icon={Landmark}
            variant="warning"
            gradient
            delay={1}
            metricKey="prixAcquisition"
          />
          <KpiCard
            label="Plus/Moins value"
            value={totalPlusValue}
            formatFn={formatCurrency}
            icon={ArrowUpDown}
            variant={totalPlusValue >= 0 ? "success" : "danger"}
            trend={totalPlusValuePct}
            gradient
            delay={2}
            metricKey="plusValueLatente"
          />
          <KpiCard
            label="Rendement net"
            value={avgRendementNet}
            formatFn={(n) => formatPercent(n)}
            icon={Percent}
            variant={avgRendementNet > 5 ? "success" : avgRendementNet > 3 ? "warning" : "danger"}
            gradient
            delay={3}
            metricKey="rendementNet"
          />
        </div>

        {/* Hero KPIs - Row 2 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Surface totale"
            value={totalSurface}
            formatFn={(n) => `${formatNumber(n)} m²`}
            icon={Ruler}
            delay={4}
            metricKey="surface"
          />
          <KpiCard
            label="Prix moyen / m²"
            value={avgPrixM2}
            formatFn={formatCurrency}
            icon={Building2}
            delay={5}
            metricKey="prixM2"
          />
          <KpiCard
            label="Valeur moyenne / m²"
            value={avgValeurM2}
            formatFn={formatCurrency}
            icon={BarChart3}
            delay={6}
            metricKey="prixM2"
          />
          {portfolioIRR != null && (
            <KpiCard
              label="TRI estimé (10 ans)"
              value={portfolioIRR}
              formatFn={(n) => formatPercent(n)}
              icon={Calculator}
              variant={portfolioIRR > 8 ? "success" : portfolioIRR > 5 ? "primary" : "warning"}
              metricKey="tri"
              delay={7}
            />
          )}
        </div>

        {/* Bar chart: acquisition vs estimée */}
        {comparisonChart.length > 0 && (
          <GlassCard delay={8}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Prix d'acquisition vs Valeur estimée par actif
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={comparisonChart} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
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

        {/* Méthodes de valorisation comparées */}
        {methodData.length > 0 && (
          <GlassCard delay={9}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Comparaison des méthodes de valorisation
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={methodData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="Capitalisation" fill="#8b5cf6" radius={[4, 4, 0, 0]} animationDuration={800} />
                <Bar dataKey="Comparables" fill="#06b6d4" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={200} />
                <Bar dataKey="Retenue" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={400} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex justify-center gap-6">
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#8b5cf6" }} />
                Capitalisation (NOI / taux)
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#06b6d4" }} />
                Comparables (m² × prix marché)
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} />
                Valeur retenue (médiane)
              </div>
            </div>
          </GlassCard>
        )}

        {/* Scatter: Prix/m² acquisition vs Valeur/m² */}
        {scatterData.length > 0 && (() => {
          const allValues = scatterData.flatMap((d: any) => [d.x, d.y]);
          const minVal = Math.floor(Math.min(...allValues) * 0.85 / 500) * 500;
          const maxVal = Math.ceil(Math.max(...allValues) * 1.15 / 500) * 500;
          const diagonalData = [{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }];
          // Anti-collision: compute label positions
          const labelPositions: { x: number; y: number; anchor: string; name: string }[] = [];
          const sorted = [...scatterData].sort((a: any, b: any) => a.x - b.x);
          sorted.forEach((d: any, i: number) => {
            let bestDy = -20;
            let bestDx = 0;
            let bestAnchor = "middle";
            // Try multiple positions and pick the one farthest from existing labels
            const candidates = [
              { dx: 0, dy: -20, anchor: "middle" },
              { dx: 12, dy: -8, anchor: "start" },
              { dx: -12, dy: -8, anchor: "end" },
              { dx: 0, dy: 22, anchor: "middle" },
              { dx: 18, dy: 4, anchor: "start" },
              { dx: -18, dy: 4, anchor: "end" },
            ];
            let bestMinDist = -1;
            for (const c of candidates) {
              const cx = (d.x || 0) + c.dx;
              const cy = (d.y || 0) + c.dy;
              let minDist = Infinity;
              for (const prev of labelPositions) {
                const dist = Math.hypot(cx - prev.x, cy - prev.y);
                minDist = Math.min(minDist, dist);
              }
              if (minDist > bestMinDist) {
                bestMinDist = minDist;
                bestDx = c.dx;
                bestDy = c.dy;
                bestAnchor = c.anchor;
              }
            }
            labelPositions.push({ x: (d.x || 0) + bestDx, y: (d.y || 0) + bestDy, anchor: bestAnchor, name: d.name });
          });
          const posMap = new Map(labelPositions.map((p) => [p.name, p]));

          return (
          <GlassCard delay={10}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Prix/m² acquisition vs Valeur/m² estimée
            </h3>
            <p className="mb-5 text-xs text-muted-foreground">
              Taille des bulles = surface. Au-dessus de la diagonale = plus-value latente.
            </p>
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 25, right: 30, bottom: 15, left: 10 }}>
                <defs>
                  <linearGradient id="plusValueZone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.07} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="moinsValueZone" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.07} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                  <filter id="bubbleShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis
                  type="number" dataKey="x" name="Prix/m² acq."
                  tickFormatter={(v) => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k€`}
                  tick={{ fontSize: 11 }}
                  domain={[minVal, maxVal]}
                  label={{ value: "Prix/m² acquisition", position: "insideBottom", offset: -5, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  type="number" dataKey="y" name="Valeur/m² est."
                  tickFormatter={(v) => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k€`}
                  tick={{ fontSize: 11 }}
                  domain={[minVal, maxVal]}
                  label={{ value: "Valeur/m² estimée", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <ZAxis type="number" dataKey="z" range={[80, 500]} name="Surface" />
                {/* Diagonal y=x reference line */}
                <ReferenceLine
                  segment={diagonalData}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  opacity={0.5}
                  label={{ value: "y = x", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  {...chartTooltipStyle}
                  cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    const pv = d.y - d.x;
                    const pvPct = d.x > 0 ? ((d.y - d.x) / d.x * 100) : 0;
                    return (
                      <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", padding: "12px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
                        <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{d.name}</p>
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 12px", fontSize: 12 }}>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>Achat</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(d.x)}/m²</span>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>Estimation</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(d.y)}/m²</span>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>Surface</span>
                          <span style={{ fontWeight: 600 }}>{d.z?.toFixed(0)} m²</span>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>+/- value</span>
                          <span style={{ fontWeight: 700, color: pv >= 0 ? "#10b981" : "#ef4444" }}>
                            {pv >= 0 ? "+" : ""}{formatCurrency(pv)}/m² ({pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} animationDuration={800} style={{ filter: "url(#bubbleShadow)" }}>
                  {scatterData.map((d: any, i: number) => (
                    <Cell
                      key={i}
                      fill={d.y >= d.x ? "#10b981" : "#ef4444"}
                      fillOpacity={0.75}
                      stroke={d.y >= d.x ? "#059669" : "#dc2626"}
                      strokeWidth={1.5}
                    />
                  ))}
                  <LabelList
                    dataKey="name"
                    content={({ x, y, value }: any) => {
                      const pos = posMap.get(value as string);
                      if (!pos) return null;
                      // Convert data coords to pixel offset relative to the dot
                      const label = String(value).length > 20 ? String(value).substring(0, 20) + "…" : value;
                      return (
                        <g>
                          <line
                            x1={x} y1={y}
                            x2={x + (pos.anchor === "start" ? 10 : pos.anchor === "end" ? -10 : 0)}
                            y2={y + (pos.y < (y || 0) ? -12 : 12)}
                            stroke="hsl(var(--muted-foreground))"
                            strokeWidth={0.5}
                            opacity={0.4}
                          />
                          <text
                            x={x + (pos.anchor === "start" ? 14 : pos.anchor === "end" ? -14 : 0)}
                            y={y + (pos.y < (y || 0) ? -16 : 18)}
                            textAnchor={pos.anchor as "start" | "middle" | "end"}
                            fontSize={11}
                            fontWeight={500}
                            fill="hsl(var(--foreground))"
                          >
                            {label}
                          </text>
                        </g>
                      );
                    }}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-3 flex justify-center gap-8">
              <div className="flex items-center gap-2 text-xs">
                <div className="h-3 w-3 rounded-full border-2 border-emerald-600" style={{ background: "rgba(16,185,129,0.75)" }} />
                <span className="text-muted-foreground">Plus-value latente</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-3 w-3 rounded-full border-2 border-red-600" style={{ background: "rgba(239,68,68,0.75)" }} />
                <span className="text-muted-foreground">Moins-value</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-px w-6 border-t-2 border-dashed border-muted-foreground" />
                <span className="text-muted-foreground">Diagonale (valeur = prix)</span>
              </div>
            </div>
          </GlassCard>
          );
        })()}

        {/* DCF Section */}
        {totalNOI > 0 && (
          <Section title="Analyse DCF (Discounted Cash Flow)" delay={11}>
            <GlassCard>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground"><InfoTooltip metricKey="dcf">Taux d'actualisation (%)</InfoTooltip></label>
                  <input
                    type="number"
                    value={dcfDiscountRate}
                    onChange={(e) => setDcfDiscountRate(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm"
                    step={0.5}
                    min={1}
                    max={20}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Croissance loyers (%/an)</label>
                  <input
                    type="number"
                    value={dcfGrowthRate}
                    onChange={(e) => setDcfGrowthRate(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm"
                    step={0.5}
                    min={0}
                    max={10}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground"><InfoTooltip metricKey="tauxCapitalisation">Cap rate de sortie (%)</InfoTooltip></label>
                  <input
                    type="number"
                    value={dcfExitCapRate}
                    onChange={(e) => setDcfExitCapRate(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm"
                    step={0.5}
                    min={1}
                    max={15}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Horizon (années)</label>
                  <input
                    type="number"
                    value={dcfYears}
                    onChange={(e) => setDcfYears(Number(e.target.value))}
                    className="w-full rounded-lg border bg-background/60 px-3 py-2 text-sm"
                    step={1}
                    min={3}
                    max={30}
                  />
                </div>
              </div>

              {dcfResult && (
                <>
                  <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border bg-muted/30 p-4 text-center">
                      <p className="text-xs text-muted-foreground"><InfoTooltip metricKey="van">Valeur actuelle nette (VAN)</InfoTooltip></p>
                      <p className={`mt-1 text-xl font-bold ${dcfResult.totalPV - totalAcquisition >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(dcfResult.totalPV - totalAcquisition)}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4 text-center">
                      <p className="text-xs text-muted-foreground">Valeur DCF totale</p>
                      <p className="mt-1 text-xl font-bold text-primary">
                        {formatCurrency(dcfResult.totalPV)}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4 text-center">
                      <p className="text-xs text-muted-foreground"><InfoTooltip metricKey="valeurTerminale">Valeur terminale</InfoTooltip></p>
                      <p className="mt-1 text-xl font-bold">
                        {formatCurrency(dcfResult.terminalValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dcfResult.totalPV > 0 ? formatPercent((dcfResult.pvTerminal / dcfResult.totalPV) * 100) : "—"} de la valeur totale
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4 text-center">
                      <p className="text-xs text-muted-foreground"><InfoTooltip metricKey="tri">TRI du projet</InfoTooltip></p>
                      <p className={`mt-1 text-xl font-bold ${(dcfResult.irr ?? 0) > dcfDiscountRate ? "text-green-600" : "text-red-500"}`}>
                        {dcfResult.irr != null ? formatPercent(dcfResult.irr) : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* DCF cash-flow chart */}
                  {dcfChartData.length > 0 && (
                    <>
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Cash-flows projetés
                      </h4>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={dcfChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="Cash-flow" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={800}>
                            {dcfChartData.map((_: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </>
              )}
            </GlassCard>
          </Section>
        )}

        {/* VAN Sensitivity */}
        {vanSensitivity.length > 0 && (
          <GlassCard delay={12}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Sensibilité de la VAN au taux d'actualisation
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={vanSensitivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="taux" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Line
                  type="monotone"
                  dataKey="van"
                  name="VAN"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* Detailed table */}
        {actifData.length > 0 && (
          <Section title="Détail par actif" delay={13}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader sortKey="nom" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Actif</SortHeader>
                    <SortHeader sortKey="sciNom" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>SCI</SortHeader>
                    <SortHeader sortKey="surface" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right"><InfoTooltip metricKey="surface">Surface</InfoTooltip></SortHeader>
                    <SortHeader sortKey="prixAcquisition" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right"><InfoTooltip metricKey="prixAcquisition">Prix acq.</InfoTooltip></SortHeader>
                    <SortHeader sortKey="tauxCapi" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right"><InfoTooltip metricKey="tauxCapitalisation">Taux capi</InfoTooltip></SortHeader>
                    <SortHeader sortKey="valeurCapitalisation" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Val. Capitalisation</SortHeader>
                    <SortHeader sortKey="valeurComparables" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Val. Comparables</SortHeader>
                    <SortHeader sortKey="valeurEstimee" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right"><InfoTooltip metricKey="valorisation">Val. retenue</InfoTooltip></SortHeader>
                    <SortHeader sortKey="plusValue" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right"><InfoTooltip metricKey="plusValueLatente">+/- Value</InfoTooltip></SortHeader>
                    <SortHeader sortKey="rendementNet" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right"><InfoTooltip metricKey="rendementNet">Rdt net</InfoTooltip></SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortData(actifData).map((a: any, i: number) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 1.1) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{a.nom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.sciNom}</td>
                      <td className="px-4 py-3 text-right">{a.surface > 0 ? `${a.surface.toFixed(0)} m²` : "—"}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(a.prixAcquisition)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{a.tauxCapi > 0 ? formatPercent(a.tauxCapi) : "—"}</td>
                      <td className="px-4 py-3 text-right text-purple-600">{a.valeurCapitalisation > 0 ? formatCurrency(a.valeurCapitalisation) : "—"}</td>
                      <td className="px-4 py-3 text-right text-cyan-600">{a.valeurComparables > 0 ? formatCurrency(a.valeurComparables) : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(a.valeurEstimee)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${a.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {a.plusValue >= 0 ? "+" : ""}{formatCurrency(a.plusValue)}
                        <span className="ml-1 text-xs opacity-70">({a.plusValuePct >= 0 ? "+" : ""}{formatPercent(a.plusValuePct)})</span>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${a.rendementNet > 5 ? "text-green-600" : a.rendementNet > 3 ? "text-amber-600" : "text-red-500"}`}>
                        {formatPercent(a.rendementNet)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right">{totalSurface > 0 ? `${totalSurface.toFixed(0)} m²` : "—"}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalAcquisition)}</td>
                    <td className="px-4 py-3 text-right"></td>
                    <td className="px-4 py-3 text-right text-purple-600">{formatCurrency(actifData.reduce((s: number, a: any) => s + a.valeurCapitalisation, 0))}</td>
                    <td className="px-4 py-3 text-right text-cyan-600">{formatCurrency(actifData.reduce((s: number, a: any) => s + a.valeurComparables, 0))}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalValorisation)}</td>
                    <td className={`px-4 py-3 text-right ${totalPlusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {totalPlusValue >= 0 ? "+" : ""}{formatCurrency(totalPlusValue)}
                    </td>
                    <td className="px-4 py-3 text-right">{formatPercent(avgRendementNet)}</td>
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
