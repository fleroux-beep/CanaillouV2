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
import { SkeletonKpi, SkeletonCard } from "../../components/ui/skeleton";
import {
  Activity, Heart, AlertTriangle, CheckCircle, TrendingUp,
  Building2, Shield, ChevronDown, ChevronUp, Lightbulb, Landmark,
  ArrowUpDown,
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

type SortOption = "score-asc" | "score-desc" | "name" | "sci";
type ViewMode = "actifs" | "sci";

interface SciScore {
  sciId: string;
  sciNom: string;
  scoreGlobal: number;
  niveau: string;
  couleur: string;
  nbActifs: number;
  actifs: any[];
  dimensions: { label: string; score: number; weight: number; detail: string; color: string }[];
}

export default function ScoreSantePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("score-asc");
  const [viewMode, setViewMode] = useState<ViewMode>("actifs");

  const { data: scores = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/am/score-sante"],
    queryFn: () => apiRequest("/api/am/score-sante"),
  });

  const sortedScores = useMemo(() => {
    const s = [...scores];
    switch (sortBy) {
      case "score-asc": return s.sort((a, b) => a.scoreGlobal - b.scoreGlobal);
      case "score-desc": return s.sort((a, b) => b.scoreGlobal - a.scoreGlobal);
      case "name": return s.sort((a, b) => (a.actifNom || "").localeCompare(b.actifNom || ""));
      case "sci": return s.sort((a, b) => (a.sciNom || "").localeCompare(b.sciNom || "") || a.scoreGlobal - b.scoreGlobal);
      default: return s;
    }
  }, [scores, sortBy]);

  // SCI-level aggregation
  const sciScores = useMemo((): SciScore[] => {
    const map = new Map<string, { sciNom: string; actifs: any[] }>();
    for (const s of scores) {
      const key = s.sciId || "unknown";
      if (!map.has(key)) map.set(key, { sciNom: s.sciNom, actifs: [] });
      map.get(key)!.actifs.push(s);
    }
    return Array.from(map.entries()).map(([sciId, { sciNom, actifs }]) => {
      const avgScore = Math.round(actifs.reduce((sum: number, a: any) => sum + a.scoreGlobal, 0) / actifs.length);
      // Aggregate dimensions by averaging scores per label
      const dimLabels = actifs[0]?.dimensions?.map((d: any) => d.label) || [];
      const dimensions = dimLabels.map((label: string) => {
        const dimScores = actifs.map((a: any) => a.dimensions.find((d: any) => d.label === label)?.score || 0);
        const avg = Math.round(dimScores.reduce((s: number, v: number) => s + v, 0) / dimScores.length);
        const weight = actifs[0]?.dimensions?.find((d: any) => d.label === label)?.weight || 0;
        return { label, score: avg, weight, detail: `Moyenne: ${avg}/100`, color: avg >= 70 ? "green" : avg >= 40 ? "amber" : "red" };
      });
      const niveau = avgScore >= 80 ? "Excellent" : avgScore >= 60 ? "Bon" : avgScore >= 40 ? "Attention" : "Critique";
      const couleur = avgScore >= 80 ? "green" : avgScore >= 60 ? "blue" : avgScore >= 40 ? "amber" : "red";
      return { sciId, sciNom, scoreGlobal: avgScore, niveau, couleur, nbActifs: actifs.length, actifs, dimensions };
    }).sort((a, b) => a.scoreGlobal - b.scoreGlobal);
  }, [scores]);

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

  const barData = useMemo(() => {
    if (viewMode === "sci") {
      return sciScores.map((s) => ({
        nom: s.sciNom.length > 15 ? s.sciNom.slice(0, 15) + "…" : s.sciNom,
        score: s.scoreGlobal,
        couleur: s.couleur,
      }));
    }
    return sortedScores.map((s: any) => ({
      nom: s.actifNom.length > 15 ? s.actifNom.slice(0, 15) + "…" : s.actifNom,
      score: s.scoreGlobal,
      couleur: s.couleur,
    }));
  }, [sortedScores, sciScores, viewMode]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Score de Santé" description="Chargement des données..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
        <SkeletonCard />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

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

        {/* Controls: view mode + sort */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            {([
              { key: "actifs" as ViewMode, label: "Par Actif", icon: Building2 },
              { key: "sci" as ViewMode, label: "Par SCI", icon: Landmark },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                  viewMode === key
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {viewMode === "actifs" && (
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium"
              >
                <option value="score-asc">Score croissant</option>
                <option value="score-desc">Score décroissant</option>
                <option value="name">Nom A→Z</option>
                <option value="sci">Par SCI</option>
              </select>
            </div>
          )}
        </div>

        {/* Bar chart */}
        {barData.length > 0 && (
          <Section title={viewMode === "sci" ? "Score moyen par SCI" : "Comparatif des scores"}>
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

        {/* SCI view */}
        {viewMode === "sci" && (
          <Section title="Détail par SCI">
            <div className="space-y-4">
              {sciScores.map((sci, i) => {
                const isExpanded = expandedId === sci.sciId;
                const radarData = sci.dimensions.map((d) => ({
                  dimension: d.label,
                  score: d.score,
                  fullMark: 100,
                }));
                return (
                  <motion.div
                    key={sci.sciId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.1 + i * 0.06, 0.6) }}
                  >
                    <GlassCard>
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : sci.sciId)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-white font-bold text-lg ${
                            sci.couleur === "green" ? "bg-green-500" :
                            sci.couleur === "blue" ? "bg-blue-500" :
                            sci.couleur === "amber" ? "bg-amber-500" : "bg-red-500"
                          }`}>
                            {sci.scoreGlobal}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold">{sci.sciNom}</h3>
                            <p className="text-xs text-muted-foreground">{sci.nbActifs} actif{sci.nbActifs > 1 ? "s" : ""} — {sci.niveau}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="hidden sm:flex items-center gap-4 text-xs">
                            {sci.dimensions.map((d) => (
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
                                <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Profil moyen</h4>
                                <div className="h-[250px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart data={radarData}>
                                      <PolarGrid stroke="hsl(var(--border))" />
                                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                                      <Radar
                                        dataKey="score"
                                        fill={niveauColors[sci.niveau] || "#3b82f6"}
                                        fillOpacity={0.3}
                                        stroke={niveauColors[sci.niveau] || "#3b82f6"}
                                        strokeWidth={2}
                                      />
                                    </RadarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              {/* Actifs list within SCI */}
                              <div>
                                <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Actifs</h4>
                                <div className="space-y-2">
                                  {sci.actifs
                                    .sort((a: any, b: any) => a.scoreGlobal - b.scoreGlobal)
                                    .map((actif: any) => (
                                    <div key={actif.actifId} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                                      <span className="text-sm font-medium">{actif.actifNom}</span>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                          actif.couleur === "green" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                          actif.couleur === "blue" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                          actif.couleur === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        }`}>
                                          {actif.scoreGlobal}/100
                                        </span>
                                        <span className="text-xs text-muted-foreground">{actif.niveau}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
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
        )}

        {/* Actifs view */}
        {viewMode === "actifs" && (
          <Section title="Détail par actif">
            <div className="space-y-4">
              {sortedScores.map((score: any, i: number) => {
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
        )}
      </motion.div>
    </AnimatePresence>
  );
}
