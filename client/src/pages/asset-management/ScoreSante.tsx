/**
 * Axe 4 — Score de santé par actif + recommandations
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  Activity, Heart, AlertTriangle, CheckCircle, TrendingUp,
  Building2, Shield, ChevronDown, ChevronUp, Lightbulb,
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

const niveauColors: Record<string, string> = {
  Excellent: "#10b981",
  Bon: "#3b82f6",
  Attention: "#f59e0b",
  Critique: "#ef4444",
};

const barColors: Record<string, string> = {
  green: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  red: "#ef4444",
};

export default function ScoreSantePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ["/api/am/score-sante"],
    queryFn: () => apiRequest("/api/am/score-sante"),
  });

  const summary = useMemo(() => {
    if (scores.length === 0) return { avg: 0, excellent: 0, bon: 0, attention: 0, critique: 0 };
    const avg = Math.round(scores.reduce((s: number, sc: any) => s + sc.scoreGlobal, 0) / scores.length);
    return {
      avg,
      excellent: scores.filter((s: any) => s.niveau === "Excellent").length,
      bon: scores.filter((s: any) => s.niveau === "Bon").length,
      attention: scores.filter((s: any) => s.niveau === "Attention").length,
      critique: scores.filter((s: any) => s.niveau === "Critique").length,
    };
  }, [scores]);

  const barData = useMemo(() => scores.map((s: any) => ({
    nom: s.actifNom.length > 15 ? s.actifNom.slice(0, 15) + "…" : s.actifNom,
    score: s.scoreGlobal,
    couleur: s.couleur,
  })), [scores]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Score de Santé"
          description="Évaluation multi-dimensionnelle de chaque actif — rendement, endettement, couverture, occupation, complétude"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Score moyen" value={summary.avg} icon={Activity} variant="primary" gradient delay={0} subtitle="/100" />
          <KpiCard label="Excellent" value={summary.excellent} icon={CheckCircle} variant="success" gradient delay={1} />
          <KpiCard label="Bon" value={summary.bon} icon={Heart} variant="primary" gradient delay={2} />
          <KpiCard label="Attention" value={summary.attention} icon={AlertTriangle} variant="warning" gradient delay={3} />
          <KpiCard label="Critique" value={summary.critique} icon={AlertTriangle} variant="danger" gradient delay={4} />
        </div>

        {/* Bar chart */}
        {barData.length > 0 && (
          <Section title="Comparatif des scores">
            <GlassCard>
              <div className="h-[300px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="nom" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={60} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: number) => [`${v}/100`, "Score"]} />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                      {barData.map((entry: any, i: number) => (
                        <Cell key={i} fill={barColors[entry.couleur] || barColors.blue} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>
        )}

        {/* Per-actif cards */}
        <Section title="Détail par actif">
          <div className="space-y-4">
            {scores.map((score: any, i: number) => {
              const isExpanded = expandedId === score.actifId;
              const radarData = score.dimensions.map((d: any) => ({
                dimension: d.label,
                score: d.score,
                fullMark: 100,
              }));

              return (
                <motion.div
                  key={score.actifId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.1 + i * 0.06, 0.6) }}
                >
                  <GlassCard>
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : score.actifId)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-white font-bold text-lg ${
                          score.couleur === "green" ? "bg-green-500" :
                          score.couleur === "blue" ? "bg-blue-500" :
                          score.couleur === "amber" ? "bg-amber-500" : "bg-red-500"
                        }`}>
                          {score.scoreGlobal}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">{score.actifNom}</h3>
                          <p className="text-xs text-muted-foreground">{score.sciNom} — {score.niveau}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="hidden sm:flex items-center gap-4 text-xs">
                          {score.dimensions.map((d: any) => (
                            <div key={d.label} className="text-center">
                              <p className={`font-bold ${
                                d.color === "green" ? "text-green-600" :
                                d.color === "amber" ? "text-amber-600" : "text-red-600"
                              }`}>{d.score}</p>
                              <p className="text-muted-foreground">{d.label}</p>
                            </div>
                          ))}
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-border/40"
                        >
                          <div className="p-4 grid gap-6 lg:grid-cols-2">
                            {/* Radar */}
                            <div>
                              <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Profil</h4>
                              <div className="h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart data={radarData}>
                                    <PolarGrid stroke="hsl(var(--border))" />
                                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                                    <Radar
                                      dataKey="score"
                                      fill={niveauColors[score.niveau] || "#3b82f6"}
                                      fillOpacity={0.3}
                                      stroke={niveauColors[score.niveau] || "#3b82f6"}
                                      strokeWidth={2}
                                    />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                            {/* Metrics + Recommandations */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Métriques clés</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Rendement brut</span>
                                    <p className="font-semibold">{score.metriques.rendementBrut}%</p>
                                  </div>
                                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">LTV</span>
                                    <p className="font-semibold">{score.metriques.ltv}%</p>
                                  </div>
                                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">DSCR</span>
                                    <p className="font-semibold">{score.metriques.dscr ? score.metriques.dscr + "x" : "N/A"}</p>
                                  </div>
                                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Occupation</span>
                                    <p className="font-semibold">{score.metriques.tauxOccupation}%</p>
                                  </div>
                                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">NOI</span>
                                    <p className="font-semibold">{formatCurrency(score.metriques.noi)}</p>
                                  </div>
                                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Cash-flow net</span>
                                    <p className={`font-semibold ${score.metriques.cashFlowNet < 0 ? "text-red-500" : ""}`}>
                                      {formatCurrency(score.metriques.cashFlowNet)}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {score.recommandations.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <Lightbulb className="h-3.5 w-3.5" /> Recommandations
                                  </h4>
                                  <ul className="space-y-1.5">
                                    {score.recommandations.map((r: string, ri: number) => (
                                      <li key={ri} className="flex items-start gap-2 text-xs text-muted-foreground">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                                        {r}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}
