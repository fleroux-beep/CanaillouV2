/**
 * Axe 6 — Projections prédictives AM
 */
import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, BarChart, Bar, Cell,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  TrendingUp, Calculator, Zap, Activity, Building2,
  ChevronDown, ChevronUp, DollarSign, Target,
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

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

export default function ProjectionsPredictivesPage() {
  const [horizon, setHorizon] = useState(10);
  const [tauxIndexation, setTauxIndexation] = useState(2.0);
  const [tauxInflation, setTauxInflation] = useState(1.5);
  const [tauxCroissance, setTauxCroissance] = useState(1.5);
  const [tauxActualisation, setTauxActualisation] = useState(6.0);
  const [selectedActif, setSelectedActif] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"portfolio" | "dcf" | "detail">("portfolio");

  const projectMutation = useMutation({
    mutationFn: () => apiRequest("/api/am/projections-predictives", {
      method: "POST",
      body: JSON.stringify({
        horizon,
        tauxIndexation,
        tauxInflationCharges: tauxInflation,
        tauxCroissanceMarche: tauxCroissance,
        tauxActualisation,
      }),
      headers: { "Content-Type": "application/json" },
    }),
  });

  const data = projectMutation.data;
  const projections: any[] = data?.projections || [];
  const summary = data?.portfolioSummary;

  // Portfolio-level aggregated projections
  const portfolioData = useMemo(() => {
    if (projections.length === 0) return [];
    const maxYears = projections[0]?.projections?.length || 0;
    const result = [];
    for (let y = 0; y < maxYears; y++) {
      const year: any = { annee: y + 1 };
      year.noi = projections.reduce((s: number, p: any) => s + (p.projections[y]?.noi || 0), 0);
      year.cashFlowNet = projections.reduce((s: number, p: any) => s + (p.projections[y]?.cashFlowNet || 0), 0);
      year.valorisation = projections.reduce((s: number, p: any) => s + (p.projections[y]?.valorisation || 0), 0);
      year.crd = projections.reduce((s: number, p: any) => s + (p.projections[y]?.crd || 0), 0);
      year.nav = projections.reduce((s: number, p: any) => s + (p.projections[y]?.nav || 0), 0);
      year.cashFlowCumule = projections.reduce((s: number, p: any) => s + (p.projections[y]?.cashFlowCumule || 0), 0);
      year.serviceDette = projections.reduce((s: number, p: any) => s + (p.projections[y]?.serviceDette || 0), 0);
      result.push(year);
    }
    return result;
  }, [projections]);

  const selectedData = selectedActif ? projections.find((p: any) => p.actifId === selectedActif) : null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Projections Prédictives"
          description="Simulation multi-années du portefeuille — NOI, cash-flow, LTV, DSCR, DCF"
        />

        {/* Parameters */}
        <GlassCard>
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-4">Paramètres de projection</h3>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="text-xs text-muted-foreground">Horizon (années)</label>
                <input
                  type="range" min={3} max={30} value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="w-full mt-1 accent-orange-500"
                />
                <span className="text-xs font-medium">{horizon} ans</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Indexation loyers (%/an)</label>
                <input
                  type="range" min={0} max={8} step={0.5} value={tauxIndexation}
                  onChange={(e) => setTauxIndexation(Number(e.target.value))}
                  className="w-full mt-1 accent-orange-500"
                />
                <span className="text-xs font-medium">{tauxIndexation}%</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Inflation charges (%/an)</label>
                <input
                  type="range" min={0} max={8} step={0.5} value={tauxInflation}
                  onChange={(e) => setTauxInflation(Number(e.target.value))}
                  className="w-full mt-1 accent-orange-500"
                />
                <span className="text-xs font-medium">{tauxInflation}%</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Croissance marché (%/an)</label>
                <input
                  type="range" min={-2} max={8} step={0.5} value={tauxCroissance}
                  onChange={(e) => setTauxCroissance(Number(e.target.value))}
                  className="w-full mt-1 accent-orange-500"
                />
                <span className="text-xs font-medium">{tauxCroissance}%</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Taux actualisation (%)</label>
                <input
                  type="range" min={3} max={12} step={0.5} value={tauxActualisation}
                  onChange={(e) => setTauxActualisation(Number(e.target.value))}
                  className="w-full mt-1 accent-orange-500"
                />
                <span className="text-xs font-medium">{tauxActualisation}%</span>
              </div>
            </div>
            <div className="flex justify-center mt-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => projectMutation.mutate()}
                disabled={projectMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-shadow"
              >
                {projectMutation.isPending ? <Calculator className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {projectMutation.isPending ? "Calcul en cours..." : "Projeter"}
              </motion.button>
            </div>
          </div>
        </GlassCard>

        {/* Results */}
        {data && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {/* Summary KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="VAN portefeuille" value={Math.round((summary?.vanTotal || 0) / 1000)} subtitle="k€" icon={Target} variant="primary" gradient delay={0} />
              <KpiCard label="TRI moyen" value={summary?.triMoyen || 0} subtitle="%" icon={TrendingUp} variant="success" gradient delay={1} />
              <KpiCard label="Cash-flows cumulés" value={Math.round((summary?.cashFlowsCumulesTotal || 0) / 1000)} subtitle="k€" icon={DollarSign} variant="primary" gradient delay={2} />
              <KpiCard label="Actifs projetés" value={projections.length} icon={Building2} variant="primary" gradient delay={3} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
              {([["portfolio", "Portefeuille"], ["dcf", "DCF par actif"], ["detail", "Détail"]] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-4 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "portfolio" && portfolioData.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                <GlassCard>
                  <div className="p-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">NAV & Valorisation</h4>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={portfolioData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="annee" tick={{ fontSize: 11 }} tickFormatter={(v) => `N+${v}`} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1e6).toFixed(1)}M`} />
                          <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Année N+${l}`} />
                          <Area type="monotone" dataKey="valorisation" fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeWidth={2} name="Valorisation" />
                          <Area type="monotone" dataKey="nav" fill="#10b981" fillOpacity={0.1} stroke="#10b981" strokeWidth={2} name="NAV" />
                          <Area type="monotone" dataKey="crd" fill="#ef4444" fillOpacity={0.1} stroke="#ef4444" strokeWidth={1.5} name="CRD" strokeDasharray="4 4" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard>
                  <div className="p-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Cash-flow net cumulé</h4>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={portfolioData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="annee" tick={{ fontSize: 11 }} tickFormatter={(v) => `N+${v}`} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1e3).toFixed(0)}k`} />
                          <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Année N+${l}`} />
                          <Area type="monotone" dataKey="cashFlowCumule" fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={2} name="CF cumulé" />
                          <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={1.5} name="NOI" dot={false} />
                          <Line type="monotone" dataKey="serviceDette" stroke="#ef4444" strokeWidth={1.5} name="Service dette" dot={false} strokeDasharray="4 4" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </GlassCard>
              </div>
            )}

            {activeTab === "dcf" && (
              <GlassCard>
                <div className="p-4">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">DCF par actif</h4>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projections.map((p: any) => ({
                        nom: p.actifNom.length > 15 ? p.actifNom.slice(0, 15) + "…" : p.actifNom,
                        van: p.dcf.van,
                        tri: p.dcf.tri,
                      }))} margin={{ bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="nom" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1e3).toFixed(0)}k`} />
                        <Tooltip {...chartTooltipStyle} formatter={(v: number, name: string) => [
                          name === "van" ? formatCurrency(v) : `${v}%`, name === "van" ? "VAN" : "TRI"
                        ]} />
                        <Bar dataKey="van" name="VAN" radius={[6, 6, 0, 0]}>
                          {projections.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* DCF table */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-semibold">Actif</th>
                          <th className="pb-2 font-semibold text-right">VAN</th>
                          <th className="pb-2 font-semibold text-right">TRI</th>
                          <th className="pb-2 font-semibold text-right">Val. terminale</th>
                          <th className="pb-2 font-semibold text-right">CF cumulés</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projections.map((p: any) => (
                          <tr key={p.actifId} className="border-b border-border/30 hover:bg-muted/30">
                            <td className="py-2 font-medium">{p.actifNom}</td>
                            <td className={`py-2 text-right font-semibold ${p.dcf.van < 0 ? "text-red-500" : "text-green-600"}`}>{formatCurrency(p.dcf.van)}</td>
                            <td className="py-2 text-right">{p.dcf.tri}%</td>
                            <td className="py-2 text-right">{formatCurrency(p.dcf.valeurTerminale)}</td>
                            <td className="py-2 text-right">{formatCurrency(p.dcf.cashFlowsCumules)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </GlassCard>
            )}

            {activeTab === "detail" && (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {projections.map((p: any) => (
                    <button
                      key={p.actifId}
                      onClick={() => setSelectedActif(p.actifId === selectedActif ? null : p.actifId)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedActif === p.actifId ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p.actifNom}
                    </button>
                  ))}
                </div>

                {selectedData && (
                  <GlassCard>
                    <div className="p-4">
                      <h4 className="text-sm font-semibold mb-3">{selectedData.actifNom} — Projection {horizon} ans</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="pb-2 font-semibold">Année</th>
                              <th className="pb-2 font-semibold text-right">Loyers</th>
                              <th className="pb-2 font-semibold text-right">Charges</th>
                              <th className="pb-2 font-semibold text-right">NOI</th>
                              <th className="pb-2 font-semibold text-right">Service dette</th>
                              <th className="pb-2 font-semibold text-right">CF net</th>
                              <th className="pb-2 font-semibold text-right">Valorisation</th>
                              <th className="pb-2 font-semibold text-right">LTV</th>
                              <th className="pb-2 font-semibold text-right">DSCR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedData.projections.map((y: any) => (
                              <tr key={y.annee} className="border-b border-border/20 hover:bg-muted/20">
                                <td className="py-1.5 font-medium">N+{y.annee}</td>
                                <td className="py-1.5 text-right">{formatCurrency(y.loyerAnnuel)}</td>
                                <td className="py-1.5 text-right">{formatCurrency(y.charges)}</td>
                                <td className="py-1.5 text-right font-semibold">{formatCurrency(y.noi)}</td>
                                <td className="py-1.5 text-right">{formatCurrency(y.serviceDette)}</td>
                                <td className={`py-1.5 text-right font-semibold ${y.cashFlowNet < 0 ? "text-red-500" : ""}`}>{formatCurrency(y.cashFlowNet)}</td>
                                <td className="py-1.5 text-right">{formatCurrency(y.valorisation)}</td>
                                <td className={`py-1.5 text-right ${y.ltv > 60 ? "text-red-500" : ""}`}>{y.ltv}%</td>
                                <td className={`py-1.5 text-right ${y.dscr > 0 && y.dscr < 1.2 ? "text-amber-500" : ""}`}>
                                  {y.dscr > 0 ? y.dscr + "x" : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </GlassCard>
                )}
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
