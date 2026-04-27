import { useMemo } from "react";
import { useSortableTable, SortHeader } from "../../hooks/useSortableTable";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LabelList,
  ReferenceArea, ReferenceLine,
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
  getRendementNet,
  getLTV,
  getDSCR,
  computeStressTests,
  type StressScenario,
} from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Target, Building2, TrendingUp, ShieldAlert, Scale, AlertTriangle, CheckCircle, Eye } from "lucide-react";
import { InfoTooltip } from "../../components/ui/info-tooltip";

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];

function computeScore(rendement: number, ltv: number, dscr: number): { checks: number; label: string; color: string; bg: string; icon: any } {
  let checks = 0;
  if (rendement > 5) checks++;
  if (ltv < 60) checks++;
  if (dscr > 1.2) checks++;

  if (checks >= 3) return { checks, label: "Conserver", color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: CheckCircle };
  if (checks === 2) return { checks, label: "Surveiller", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", icon: Eye };
  return { checks, label: "Arbitrer", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: AlertTriangle };
}

export default function ArbitragesPage() {
  const { data: scis = [] } = useQuery({ queryKey: ["/api/am/scis"], queryFn: () => apiRequest("/api/am/scis") });
  const { data: actifs = [] } = useQuery({ queryKey: ["/api/am/actifs"], queryFn: () => apiRequest("/api/am/actifs") });
  const { data: lots = [] } = useQuery({ queryKey: ["/api/am/lots"], queryFn: () => apiRequest("/api/am/lots") });
  const { data: baux = [] } = useQuery({ queryKey: ["/api/am/baux"], queryFn: () => apiRequest("/api/am/baux") });
  const { data: emprunts = [] } = useQuery({ queryKey: ["/api/am/emprunts"], queryFn: () => apiRequest("/api/am/emprunts") });

  const actifsActifs = useMemo(() => actifs.filter((a: any) => !a.archived), [actifs]);
  const empruntsActifs = useMemo(() => emprunts.filter((e: any) => !e.archived), [emprunts]);

  // Per-actif data
  const actifData = useMemo(() => actifsActifs.map((a: any) => {
    const sci = scis.find((s: any) => s.id === a.sciId);
    const valeurEstimee = getValeurEstimee(a, baux, lots);
    const prixAcquisition = getPrixAcquisition(a);
    const plusValue = valeurEstimee - prixAcquisition;
    const loyerAnnuel = getLoyerAnnuelActif(a, baux, lots);
    const charges = getChargesAnnuelles(a);
    const noi = loyerAnnuel - charges;

    // Endettement actif : on utilise les emprunts portés directement par l'actif
    // si disponibles ; sinon on prorate les emprunts SCI par valeur de l'actif
    // (et non par nombre d'actifs comme avant — la répartition par tête fausse
    // les ratios pour les SCIs avec actifs hétérogènes).
    const actifEmprunts = empruntsActifs.filter((e: any) => e.actifId === a.id);
    const sciEmprunts = empruntsActifs.filter((e: any) => e.sciId === a.sciId && !e.actifId);
    const sciActifs = actifsActifs.filter((x: any) => x.sciId === a.sciId);
    const sciValorisationTotale = sciActifs.reduce(
      (sum: number, x: any) => sum + getValeurEstimee(x, baux, lots),
      0,
    );
    const partValeur = sciValorisationTotale > 0
      ? valeurEstimee / sciValorisationTotale
      : (sciActifs.length > 0 ? 1 / sciActifs.length : 1);
    const crd = getTotalCRD(actifEmprunts) + getTotalCRD(sciEmprunts) * partValeur;
    const serviceDette = getServiceDette(actifEmprunts) + getServiceDette(sciEmprunts) * partValeur;

    const rendementBrut = getRendementBrut(loyerAnnuel, prixAcquisition);
    const rendementNet = getRendementNet(loyerAnnuel, charges, prixAcquisition);
    const ltv = getLTV(crd, valeurEstimee);
    const dscr = getDSCR(noi, serviceDette);
    // Score : on utilise le rendement NET (revenu après charges) plutôt que brut.
    // Un actif avec gros loyer mais charges énormes ne devrait pas obtenir un score
    // élevé sur le seul rendement brut.
    const score = computeScore(rendementNet, ltv, dscr);
    const cashFlowNet = noi - serviceDette;
    const fondsPropresPct = 100 - ltv;

    return {
      id: a.id,
      nom: a.nom || a.adresse || `Actif #${a.id}`,
      sciNom: sci?.nom || "—",
      prixAcquisition,
      valeurEstimee,
      plusValue,
      plusValuePct: prixAcquisition > 0 ? (plusValue / prixAcquisition) * 100 : 0,
      loyerAnnuel,
      charges,
      noi,
      rendementBrut,
      rendementNet,
      ltv,
      dscr,
      crd,
      serviceDette,
      cashFlowNet,
      fondsPropresPct,
      score,
      sciEmprunts,
    };
  }), [actifsActifs, scis, baux, lots, empruntsActifs]);

  // Totals & averages
  const totalValorisation = actifData.reduce((s: number, a: any) => s + a.valeurEstimee, 0);
  const totalAcquisition = actifData.reduce((s: number, a: any) => s + a.prixAcquisition, 0);
  const totalPlusValue = totalValorisation - totalAcquisition;
  const totalLoyers = actifData.reduce((s: number, a: any) => s + a.loyerAnnuel, 0);
  const totalCharges = actifData.reduce((s: number, a: any) => s + a.charges, 0);
  const totalNOI = totalLoyers - totalCharges;
  const totalCRD = actifData.reduce((s: number, a: any) => s + a.crd, 0);
  const totalServiceDette = actifData.reduce((s: number, a: any) => s + a.serviceDette, 0);
  const totalCashFlow = totalNOI - totalServiceDette;
  const avgRendement = actifData.length > 0 ? actifData.reduce((s: number, a: any) => s + a.rendementBrut, 0) / actifData.length : 0;
  const portfolioLTV = totalValorisation > 0 ? (totalCRD / totalValorisation) * 100 : 0;
  const portfolioDSCR = totalServiceDette > 0 ? totalNOI / totalServiceDette : 0;

  // Score distribution
  const scoreDistrib = {
    conserver: actifData.filter((a: any) => a.score.label === "Conserver").length,
    surveiller: actifData.filter((a: any) => a.score.label === "Surveiller").length,
    arbitrer: actifData.filter((a: any) => a.score.label === "Arbitrer").length,
  };

  // Rendement chart sorted descending
  const rendementChart = [...actifData]
    .filter((a: any) => a.rendementBrut > 0)
    .sort((a, b) => b.rendementBrut - a.rendementBrut)
    .map((a: any) => ({
      name: a.nom.length > 18 ? a.nom.substring(0, 18) + "…" : a.nom,
      rendement: Number(a.rendementBrut.toFixed(2)),
      color: a.rendementBrut > 5 ? "#10b981" : a.rendementBrut > 3 ? "#f59e0b" : "#ef4444",
    }));

  // Scatter: risque (LTV) vs rendement
  const riskReturnData = actifData
    .filter((a: any) => a.rendementBrut > 0)
    .map((a: any) => ({
      name: a.nom,
      x: a.ltv,
      y: a.rendementBrut,
      z: a.valeurEstimee,
      scoreLabel: a.score.label,
      color: a.score.label === "Conserver" ? "#10b981" : a.score.label === "Surveiller" ? "#f59e0b" : "#ef4444",
    }));

  // Radar chart per actif (normalized 0-100)
  const radarData = actifData.map((a: any) => ({
    name: a.nom.length > 12 ? a.nom.substring(0, 12) + "…" : a.nom,
    "Rendement": Math.min(100, a.rendementBrut * 10),
    "Solvabilité": Math.min(100, a.fondsPropresPct),
    "DSCR": Math.min(100, a.dscr * 40),
    "Plus-value": Math.min(100, Math.max(0, a.plusValuePct + 50)),
    "Cash-flow": Math.min(100, a.cashFlowNet > 0 ? 70 + (a.cashFlowNet / 1000) : 30),
  }));

  // Stress tests (portfolio level)
  const stressSort = useSortableTable();
  const detailSort = useSortableTable();

  const stressResults: StressScenario[] = useMemo(() => {
    if (totalLoyers <= 0) return [];
    return computeStressTests(totalLoyers, totalCharges, totalServiceDette, totalValorisation, totalCRD, empruntsActifs);
  }, [totalLoyers, totalCharges, totalServiceDette, totalValorisation, totalCRD, empruntsActifs]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Arbitrages"
          description="Analyse des opportunités d'arbitrage et gestion du risque"
        />

        {/* Hero KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Actifs" value={actifsActifs.length} icon={Building2} variant="primary" gradient delay={0} />
          <KpiCard label="Valorisation" value={totalValorisation} formatFn={formatCurrency} icon={Target} variant="success" gradient delay={1} metricKey="valorisation" />
          <KpiCard label="Rendement moyen" value={avgRendement} formatFn={(n) => formatPercent(n)} icon={TrendingUp} variant={avgRendement > 5 ? "success" : avgRendement > 3 ? "warning" : "danger"} gradient delay={2} metricKey="rendementBrut" />
          <KpiCard label="LTV portefeuille" value={portfolioLTV} formatFn={(n) => formatPercent(n)} icon={Scale} variant={portfolioLTV < 60 ? "success" : portfolioLTV < 80 ? "warning" : "danger"} gradient delay={3} metricKey="ltv" />
        </div>

        {/* Score summary + DSCR + Cash flow */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="DSCR portefeuille" value={portfolioDSCR} formatFn={(n) => n.toFixed(2) + "x"} icon={ShieldAlert} variant={portfolioDSCR > 1.2 ? "success" : portfolioDSCR > 1 ? "warning" : "danger"} delay={4} metricKey="dscr" />
          <KpiCard label="Cash-flow net" value={totalCashFlow} formatFn={formatCurrency} icon={TrendingUp} variant={totalCashFlow >= 0 ? "success" : "danger"} delay={5} metricKey="cashFlowNet" />
          <GlassCard delay={6} className="flex items-center justify-center">
            <div className="flex gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{scoreDistrib.conserver}</p>
                <p className="text-xs text-muted-foreground">Conserver</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{scoreDistrib.surveiller}</p>
                <p className="text-xs text-muted-foreground">Surveiller</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{scoreDistrib.arbitrer}</p>
                <p className="text-xs text-muted-foreground">Arbitrer</p>
              </div>
            </div>
          </GlassCard>
          <KpiCard label="+/- Value totale" value={totalPlusValue} formatFn={formatCurrency} icon={Target} variant={totalPlusValue >= 0 ? "success" : "danger"} delay={7} metricKey="plusValueLatente" />
        </div>

        {/* Rendement bar chart */}
        {rendementChart.length > 0 && (
          <GlassCard delay={8}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Rendement brut par actif
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={rendementChart} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => `${v.toFixed(2)}%`} />
                <Bar dataKey="rendement" name="Rendement brut" radius={[4, 4, 0, 0]} animationDuration={800}>
                  {rendementChart.map((entry: any) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex justify-center gap-6">
              <div className="flex items-center gap-1.5 text-xs"><div className="h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} /> &gt; 5%</div>
              <div className="flex items-center gap-1.5 text-xs"><div className="h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} /> 3-5%</div>
              <div className="flex items-center gap-1.5 text-xs"><div className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} /> &lt; 3%</div>
            </div>
          </GlassCard>
        )}

        {/* Risk-Return matrix (scatter) */}
        {riskReturnData.length > 0 && (() => {
          const maxLtv = Math.max(...riskReturnData.map((d: any) => d.x), 80);
          const maxRdt = Math.max(...riskReturnData.map((d: any) => d.y), 8);
          const domainX = Math.ceil(maxLtv / 10) * 10 + 10;
          const domainY = Math.ceil(maxRdt) + 2;
          // Anti-collision labels
          const lblPositions: { x: number; y: number; anchor: string; name: string }[] = [];
          const sortedRR = [...riskReturnData].sort((a: any, b: any) => a.x - b.x);
          sortedRR.forEach((d: any) => {
            const candidates = [
              { dx: 0, dy: -22, anchor: "middle" },
              { dx: 16, dy: -6, anchor: "start" },
              { dx: -16, dy: -6, anchor: "end" },
              { dx: 0, dy: 24, anchor: "middle" },
              { dx: 20, dy: 6, anchor: "start" },
              { dx: -20, dy: 6, anchor: "end" },
            ];
            let bestMinDist = -1;
            let bestC = candidates[0];
            for (const c of candidates) {
              const cx = (d.x || 0) + c.dx;
              const cy = (d.y || 0) + c.dy;
              let minDist = Infinity;
              for (const prev of lblPositions) {
                const dist = Math.hypot(cx - prev.x, cy - prev.y);
                minDist = Math.min(minDist, dist);
              }
              if (minDist > bestMinDist) { bestMinDist = minDist; bestC = c; }
            }
            lblPositions.push({ x: (d.x || 0) + bestC.dx, y: (d.y || 0) + bestC.dy, anchor: bestC.anchor, name: d.name });
          });
          const posMap = new Map(lblPositions.map((p) => [p.name, p]));

          return (
          <GlassCard delay={9}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Matrice Risque / Rendement
            </h3>
            <p className="mb-5 text-xs text-muted-foreground">
              Axe X = LTV (risque d'endettement) | Axe Y = Rendement brut | Taille = Valorisation
            </p>
            <ResponsiveContainer width="100%" height={460}>
              <ScatterChart margin={{ top: 25, right: 30, bottom: 15, left: 10 }}>
                <defs>
                  <filter id="rrBubbleShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
                  </filter>
                </defs>
                {/* Quadrants colorés : haut-gauche = idéal (rendement élevé, risque faible) */}
                <ReferenceArea x1={0} x2={50} y1={5} y2={domainY} fill="#10b981" fillOpacity={0.04} />
                <ReferenceArea x1={50} x2={domainX} y1={5} y2={domainY} fill="#f59e0b" fillOpacity={0.04} />
                <ReferenceArea x1={0} x2={50} y1={0} y2={5} fill="#f59e0b" fillOpacity={0.03} />
                <ReferenceArea x1={50} x2={domainX} y1={0} y2={5} fill="#ef4444" fillOpacity={0.05} />
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                {/* Lignes seuils */}
                <ReferenceLine x={50} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={1} opacity={0.6} />
                <ReferenceLine y={5} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={1} opacity={0.6} />
                <XAxis
                  type="number" dataKey="x" name="LTV"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11 }}
                  domain={[0, domainX]}
                  label={{ value: "LTV — Risque d'endettement →", position: "insideBottom", offset: -5, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  type="number" dataKey="y" name="Rendement"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  tick={{ fontSize: 11 }}
                  domain={[0, domainY]}
                  label={{ value: "← Rendement brut", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <ZAxis type="number" dataKey="z" range={[100, 600]} name="Valorisation" />
                <Tooltip
                  {...chartTooltipStyle}
                  cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", padding: "12px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color, border: `2px solid ${d.color === "#10b981" ? "#059669" : d.color === "#f59e0b" ? "#d97706" : "#dc2626"}` }} />
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{d.name}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 9999,
                            background: d.color === "#10b981" ? "rgba(16,185,129,0.12)" : d.color === "#f59e0b" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
                            color: d.color,
                          }}>{d.scoreLabel}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", fontSize: 12 }}>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>LTV</span>
                          <span style={{ fontWeight: 600 }}>{d.x.toFixed(1)}%</span>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>Rendement brut</span>
                          <span style={{ fontWeight: 600 }}>{d.y.toFixed(2)}%</span>
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>Valorisation</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(d.z)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={riskReturnData} animationDuration={800} style={{ filter: "url(#rrBubbleShadow)" }}>
                  {riskReturnData.map((d: any, i: number) => (
                    <Cell
                      key={i}
                      fill={d.color}
                      fillOpacity={0.7}
                      stroke={d.color === "#10b981" ? "#059669" : d.color === "#f59e0b" ? "#d97706" : "#dc2626"}
                      strokeWidth={1.5}
                    />
                  ))}
                  <LabelList
                    dataKey="name"
                    content={({ x, y, value }: any) => {
                      const pos = posMap.get(value as string);
                      if (!pos) return null;
                      const label = String(value).length > 22 ? String(value).substring(0, 22) + "…" : value;
                      return (
                        <g>
                          <line
                            x1={x} y1={y}
                            x2={x + (pos.anchor === "start" ? 12 : pos.anchor === "end" ? -12 : 0)}
                            y2={y + (pos.y < (y || 0) ? -14 : 14)}
                            stroke="hsl(var(--muted-foreground))"
                            strokeWidth={0.5}
                            opacity={0.35}
                          />
                          <text
                            x={x + (pos.anchor === "start" ? 16 : pos.anchor === "end" ? -16 : 0)}
                            y={y + (pos.y < (y || 0) ? -18 : 20)}
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
            {/* Quadrant annotations */}
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 max-w-md mx-auto text-[10px] text-muted-foreground">
              <div className="text-right">Rendement elevé + Risque faible</div>
              <div className="text-left font-semibold text-emerald-600 dark:text-emerald-400">Zone ideale</div>
              <div className="text-right">Rendement faible + Risque eleve</div>
              <div className="text-left font-semibold text-red-600 dark:text-red-400">Zone a arbitrer</div>
            </div>
            <div className="mt-3 flex justify-center gap-8">
              <div className="flex items-center gap-2 text-xs">
                <div className="h-3 w-3 rounded-full border-2 border-emerald-600" style={{ background: "rgba(16,185,129,0.7)" }} />
                <span className="text-muted-foreground">Conserver</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-3 w-3 rounded-full border-2 border-amber-600" style={{ background: "rgba(245,158,11,0.7)" }} />
                <span className="text-muted-foreground">Surveiller</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-3 w-3 rounded-full border-2 border-red-600" style={{ background: "rgba(239,68,68,0.7)" }} />
                <span className="text-muted-foreground">Arbitrer</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-px w-6 border-t-2 border-dashed border-amber-500/60" />
                <span className="text-muted-foreground">Seuils (LTV 50% / Rdt 5%)</span>
              </div>
            </div>
          </GlassCard>
          );
        })()}

        {/* Radar chart per actif */}
        {radarData.length > 0 && radarData.length <= 8 && (
          <GlassCard delay={10}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Profil multi-critères par actif
            </h3>
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={[
                { metric: "Rendement", ...Object.fromEntries(radarData.map((d: any) => [d.name, d["Rendement"]])) },
                { metric: "Solvabilité", ...Object.fromEntries(radarData.map((d: any) => [d.name, d["Solvabilité"]])) },
                { metric: "DSCR", ...Object.fromEntries(radarData.map((d: any) => [d.name, d["DSCR"]])) },
                { metric: "Plus-value", ...Object.fromEntries(radarData.map((d: any) => [d.name, d["Plus-value"]])) },
                { metric: "Cash-flow", ...Object.fromEntries(radarData.map((d: any) => [d.name, d["Cash-flow"]])) },
              ]}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                {radarData.map((d: any, i: number) => (
                  <Radar key={d.name} name={d.name} dataKey={d.name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} animationDuration={800} />
                ))}
                <Tooltip {...chartTooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {radarData.map((d: any, i: number) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {d.name}
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Stress Tests */}
        {stressResults.length > 0 && (
          <Section title="Stress Tests — Portefeuille" delay={11}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader sortKey="label" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort}>Scénario</SortHeader>
                    <SortHeader sortKey="vacanceRate" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="tauxVacance">Vacance</InfoTooltip></SortHeader>
                    <SortHeader sortKey="loyerAjuste" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="loyerHTActu">Loyers ajustés</InfoTooltip></SortHeader>
                    <SortHeader sortKey="chargesAjustees" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="charges">Charges ajustées</InfoTooltip></SortHeader>
                    <SortHeader sortKey="noiAjuste" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="noi">NOI</InfoTooltip></SortHeader>
                    <SortHeader sortKey="cashFlowAjuste" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="cashFlowNet">Cash-flow</InfoTooltip></SortHeader>
                    <SortHeader sortKey="dscr" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="dscr">DSCR</InfoTooltip></SortHeader>
                    <SortHeader sortKey="rendementNet" currentSortKey={stressSort.sortKey} sortDir={stressSort.sortDir} onSort={stressSort.handleSort} align="right"><InfoTooltip metricKey="rendementNet">Rdt net</InfoTooltip></SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {stressSort.sortData(stressResults).map((s: StressScenario, i: number) => (
                    <motion.tr
                      key={s.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 1.1) }}
                      className={`border-t transition-colors hover:bg-muted/20 ${i === 0 ? "bg-muted/10 font-medium" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {i === 0 ? s.label : (
                          <span className={s.cashFlowAjuste < 0 ? "text-red-600" : ""}>
                            {s.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{s.vacanceRate > 0 ? `${s.vacanceRate}%` : "—"}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(s.loyerAjuste)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(s.chargesAjustees)}</td>
                      <td className={`px-4 py-3 text-right ${s.noiAjuste < 0 ? "text-red-500 font-medium" : ""}`}>
                        {formatCurrency(s.noiAjuste)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${s.cashFlowAjuste < 0 ? "text-red-500" : "text-green-600"}`}>
                        {formatCurrency(s.cashFlowAjuste)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.dscr > 1.2 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          s.dscr > 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {s.dscr > 0 ? s.dscr.toFixed(2) + "x" : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatPercent(s.rendementNet)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </Section>
        )}

        {/* Detailed analysis table */}
        {actifData.length > 0 && (
          <Section title="Analyse détaillée par actif" delay={12}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="overflow-x-auto rounded-xl border bg-card shadow-sm"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <SortHeader sortKey="nom" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort}>Actif</SortHeader>
                    <SortHeader sortKey="sciNom" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort}>SCI</SortHeader>
                    <SortHeader sortKey="prixAcquisition" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="prixAcquisition">Prix acq.</InfoTooltip></SortHeader>
                    <SortHeader sortKey="valeurEstimee" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="valorisation">Val. est.</InfoTooltip></SortHeader>
                    <SortHeader sortKey="plusValue" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="plusValueLatente">+/- Value</InfoTooltip></SortHeader>
                    <SortHeader sortKey="rendementBrut" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="rendementBrut">Rdt brut</InfoTooltip></SortHeader>
                    <SortHeader sortKey="rendementNet" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="rendementNet">Rdt net</InfoTooltip></SortHeader>
                    <SortHeader sortKey="ltv" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="ltv">LTV</InfoTooltip></SortHeader>
                    <SortHeader sortKey="dscr" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="dscr">DSCR</InfoTooltip></SortHeader>
                    <SortHeader sortKey="cashFlowNet" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="right"><InfoTooltip metricKey="cashFlowNet">Cash-flow</InfoTooltip></SortHeader>
                    <SortHeader sortKey="score.label" currentSortKey={detailSort.sortKey} sortDir={detailSort.sortDir} onSort={detailSort.handleSort} align="center">Score</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {detailSort.sortData(actifData).map((a: any, i: number) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(0.6 + i * 0.05, 1.1) }}
                      className="border-t transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{a.nom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.sciNom}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(a.prixAcquisition)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(a.valeurEstimee)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${a.plusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {a.plusValue >= 0 ? "+" : ""}{formatCurrency(a.plusValue)}
                        <span className="ml-1 text-xs opacity-70">({a.plusValuePct >= 0 ? "+" : ""}{a.plusValuePct.toFixed(1)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={a.rendementBrut > 5 ? "text-green-600" : a.rendementBrut > 3 ? "text-amber-600" : "text-red-500"}>
                          {formatPercent(a.rendementBrut)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={a.rendementNet > 4 ? "text-green-600" : a.rendementNet > 2 ? "text-amber-600" : "text-red-500"}>
                          {formatPercent(a.rendementNet)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={a.ltv < 60 ? "text-green-600" : a.ltv < 80 ? "text-amber-600" : "text-red-500"}>
                          {formatPercent(a.ltv)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={a.dscr > 1.2 ? "text-green-600" : a.dscr > 0 ? "text-red-500" : "text-muted-foreground"}>
                          {a.dscr > 0 ? a.dscr.toFixed(2) + "x" : "N/A"}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${a.cashFlowNet >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(a.cashFlowNet)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.score.bg} ${a.score.color}`}>
                          <a.score.icon className="h-3 w-3" />
                          {a.score.label}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalAcquisition)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalValorisation)}</td>
                    <td className={`px-4 py-3 text-right ${totalPlusValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {totalPlusValue >= 0 ? "+" : ""}{formatCurrency(totalPlusValue)}
                    </td>
                    <td className="px-4 py-3 text-right">{formatPercent(avgRendement)}</td>
                    <td className="px-4 py-3 text-right">{totalValorisation > 0 ? formatPercent((totalNOI / totalValorisation) * 100) : "—"}</td>
                    <td className="px-4 py-3 text-right">{formatPercent(portfolioLTV)}</td>
                    <td className="px-4 py-3 text-right">{portfolioDSCR > 0 ? portfolioDSCR.toFixed(2) + "x" : "N/A"}</td>
                    <td className={`px-4 py-3 text-right ${totalCashFlow >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(totalCashFlow)}</td>
                    <td className="px-4 py-3 text-center">—</td>
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
