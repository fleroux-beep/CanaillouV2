import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../../lib/queryClient";
import { KpiCard } from "../../../components/ui/kpi-card";
import { GlassCard } from "../../../components/ui/glass-card";
import { Section } from "../../../components/ui/section";
import { Badge } from "../../../components/ui/badge";
import { formatCurrency, formatPercent } from "../../../lib/utils";
import { TrendingDown, Landmark, TableIcon, ShieldCheck, PiggyBank, ArrowRight, Clock, Calendar, Banknote, Building2 } from "lucide-react";
import { ComposedChart, Bar, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { computeAmortSchedule, type AMEmprunt, type AmortRow } from "../../../lib/am-calculations";
import type { Emprunt, SCI, Actif } from "../../../types";

export function AmortissementTab() {
  const { data: emprunts = [] } = useQuery<Emprunt[]>({
    queryKey: ["/api/am/emprunts"],
    queryFn: () => apiRequest("/api/am/emprunts"),
  });
  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });
  const { data: actifsList = [] } = useQuery<Actif[]>({
    queryKey: ["/api/am/actifs"],
    queryFn: () => apiRequest("/api/am/actifs"),
  });

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));
  const actifMap = Object.fromEntries(actifsList.map((a) => [a.id, a.nom]));
  const activeEmprunts = emprunts.filter((e) => !e.archived);
  const [selectedId, setSelectedId] = useState<string>("");

  const selectedEmprunt = activeEmprunts.find((e) => e.id === selectedId);
  const schedule: AmortRow[] = useMemo(() => {
    if (!selectedEmprunt) return [];
    return computeAmortSchedule(selectedEmprunt as unknown as AMEmprunt);
  }, [selectedEmprunt]);

  const empruntLabel = (emp: Emprunt) => {
    const sci = emp.sciId ? sciMap[emp.sciId] : "";
    const actif = emp.actifId ? actifMap[emp.actifId] : "";
    const parts = [sci, actif, emp.banque].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : `Emprunt #${emp.id.substring(0, 8)}`;
  };

  const totalInterets = schedule.reduce((s, r) => s + r.interets, 0);
  const totalAssurance = schedule.reduce((s, r) => s + r.assurance, 0);
  const totalCout = totalInterets + totalAssurance;
  const capitalEmprunte = parseFloat(selectedEmprunt?.montantEmprunte || "0");
  const crdActuel = parseFloat(selectedEmprunt?.capitalRestantDu || "0") || capitalEmprunte;
  const progressPct = capitalEmprunte > 0 ? Math.round(((capitalEmprunte - crdActuel) / capitalEmprunte) * 100) : 0;
  const currentYearIdx = schedule.findIndex((r) => r.isCurrent);
  const yearsElapsed = currentYearIdx >= 0 ? currentYearIdx + 1 : 0;
  const totalYears = schedule.length;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        {/* ── Sélecteur d'emprunt amélioré ── */}
        <GlassCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                Sélectionnez un emprunt
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-sm transition-all focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">Choisir un emprunt...</option>
                {(() => {
                  const groups: { sciName: string; items: Emprunt[] }[] = [];
                  for (const emp of activeEmprunts) {
                    const sciName = emp.sciId ? (sciMap[emp.sciId] || "SCI inconnue") : "Sans SCI";
                    let group = groups.find((g) => g.sciName === sciName);
                    if (!group) { group = { sciName, items: [] }; groups.push(group); }
                    group.items.push(emp);
                  }
                  groups.sort((a, b) => a.sciName.localeCompare(b.sciName, "fr"));
                  return groups.map((g) => (
                    <optgroup key={g.sciName} label={g.sciName}>
                      {g.items.map((e) => (
                        <option key={e.id} value={e.id}>
                          {[e.actifId ? actifMap[e.actifId] : null, e.banque].filter(Boolean).join(" / ") || `Emprunt #${e.id.substring(0, 8)}`}
                        </option>
                      ))}
                    </optgroup>
                  ));
                })()}
              </select>
            </div>
            {selectedEmprunt && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 font-medium text-primary">
                  <Building2 className="h-3.5 w-3.5" />
                  {selectedEmprunt.sciId ? sciMap[selectedEmprunt.sciId] : "—"}
                </div>
                {selectedEmprunt.banque && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 font-medium text-blue-600 dark:text-blue-400">
                    <Banknote className="h-3.5 w-3.5" />
                    {selectedEmprunt.banque}
                  </div>
                )}
                {selectedEmprunt.dateDebut && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 font-medium">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(selectedEmprunt.dateDebut).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                    {selectedEmprunt.dureeAns && (
                      <><ArrowRight className="h-3 w-3 mx-0.5" />{selectedEmprunt.dureeAns} ans</>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </GlassCard>

        {selectedEmprunt && schedule.length > 0 && (
          <>
            {/* ── Fiche résumé de l'emprunt ── */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/[0.03] p-6 shadow-sm">
                <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
                <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Progression */}
                  <div className="sm:col-span-2 lg:col-span-1">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Progression du remboursement</p>
                    <div className="flex items-center gap-4">
                      <div className="relative h-20 w-20 flex-shrink-0">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="2.5" />
                          <circle cx="18" cy="18" r="16" fill="none" stroke="url(#progressGrad)" strokeWidth="2.5" strokeLinecap="round"
                            strokeDasharray={`${progressPct} ${100 - progressPct}`} strokeDashoffset="0"
                            className="transition-all duration-1000 ease-out" />
                          <defs>
                            <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="hsl(var(--primary))" />
                              <stop offset="100%" stopColor="#f43f5e" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-bold">{progressPct}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{formatCurrency(capitalEmprunte - crdActuel)}</p>
                        <p className="text-xs text-muted-foreground">remboursé sur {formatCurrency(capitalEmprunte)}</p>
                        {yearsElapsed > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Année {yearsElapsed}/{totalYears}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Résumé chiffres clés */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Détail du crédit</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Taux annuel</span>
                        <span className="text-sm font-semibold">{formatPercent(parseFloat(selectedEmprunt.tauxAnnuel || "0"), 2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Mensualité</span>
                        <span className="text-sm font-semibold">{formatCurrency(parseFloat(selectedEmprunt.mensualite || "0"))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Type</span>
                        <Badge variant="outline" className="text-[10px]">{selectedEmprunt.typeAmortissement || "Constant"}</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Répartition coûts */}
                  <div className="sm:col-span-2 lg:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Répartition du coût total</p>
                    <div className="space-y-2.5">
                      {[
                        { label: "Capital", value: capitalEmprunte, color: "bg-blue-500", pct: capitalEmprunte / (capitalEmprunte + totalCout) * 100 },
                        { label: "Intérêts", value: totalInterets, color: "bg-red-500", pct: totalInterets / (capitalEmprunte + totalCout) * 100 },
                        { label: "Assurance", value: totalAssurance, color: "bg-amber-500", pct: totalAssurance / (capitalEmprunte + totalCout) * 100 },
                      ].map((item) => (
                        <div key={item.label} className="group">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.color}`} />
                              {item.label}
                            </span>
                            <span className="font-semibold">{formatCurrency(item.value)} <span className="text-muted-foreground font-normal">({item.pct.toFixed(1)}%)</span></span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.pct}%` }}
                              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
                              className={`h-full rounded-full ${item.color} opacity-80`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground">Coût total du crédit</span>
                      <span className="text-sm font-bold">{formatCurrency(capitalEmprunte + totalCout)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── KPI Cards ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Capital emprunté" value={capitalEmprunte} formatFn={formatCurrency} icon={Landmark} variant="primary" gradient delay={0} metricKey="capitalEmprunte" />
              <KpiCard label="Total intérêts" value={totalInterets} formatFn={formatCurrency} icon={TrendingDown} variant="danger" gradient delay={1} />
              <KpiCard label="Total assurance" value={totalAssurance} formatFn={formatCurrency} icon={ShieldCheck} variant="warning" gradient delay={2} />
              <KpiCard label="Coût total crédit" value={totalCout} formatFn={formatCurrency} icon={PiggyBank} variant="danger" gradient delay={3} metricKey="coutCredit" />
            </div>

            {/* ── Graphique composé : Barres empilées + Ligne CRD ── */}
            <Section title="Évolution annuelle du remboursement" delay={1}>
              <GlassCard>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={schedule.map((r) => ({
                      annee: r.anneeReelle ?? `N+${r.year}`,
                      "Capital remboursé": Math.round(r.capitalAmorti),
                      "Intérêts": Math.round(r.interets),
                      "Assurance": Math.round(r.assurance),
                      "CRD": Math.round(r.capitalFin),
                      isCurrent: r.isCurrent,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis dataKey="annee" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: number, name: string) => [formatCurrency(v), name]}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
                        labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar yAxisId="left" dataKey="Capital remboursé" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="Intérêts" stackId="a" fill="#ef4444" opacity={0.8} radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="Assurance" stackId="a" fill="#f59e0b" opacity={0.7} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="CRD" name="Capital restant dû" stroke="#8b5cf6" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </Section>

            {/* ── Tableau d'amortissement ── */}
            <Section title={`Tableau d'amortissement — ${empruntLabel(selectedEmprunt)}`} delay={2}>
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-muted/60 to-muted/30">
                        <th className="sticky left-0 bg-muted/60 px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Année</th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">CRD début</th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" />Capital</span>
                        </th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Intérêts</span>
                        </th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Assurance</span>
                        </th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Annuité</th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Total annuel</th>
                        <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">CRD fin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {schedule.map((row, idx) => {
                        const pctDone = capitalEmprunte > 0 ? ((capitalEmprunte - row.capitalFin) / capitalEmprunte) * 100 : 0;
                        return (
                          <tr
                            key={row.year}
                            className={[
                              "group transition-colors",
                              row.isCurrent
                                ? "bg-primary/[0.06] hover:bg-primary/[0.10]"
                                : idx % 2 === 0
                                  ? "bg-transparent hover:bg-muted/30"
                                  : "bg-muted/[0.06] hover:bg-muted/30",
                            ].join(" ")}
                          >
                            <td className="sticky left-0 bg-inherit px-4 py-3 font-medium whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${row.isCurrent ? "text-primary font-bold" : ""}`}>
                                  {row.anneeReelle ?? `N+${row.year}`}
                                </span>
                                {row.isCurrent && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                    En cours
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(row.capitalDebut)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-600 dark:text-blue-400">{formatCurrency(row.capitalAmorti)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{formatCurrency(row.interets)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(row.assurance)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.annuite)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(row.totalAnnuel)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="tabular-nums">{formatCurrency(row.capitalFin)}</span>
                                <div className="h-1 w-16 rounded-full bg-muted/40 overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-rose-500 transition-all duration-500" style={{ width: `${pctDone}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-gradient-to-r from-muted/40 to-muted/20">
                        <td className="sticky left-0 bg-muted/40 px-4 py-3.5 font-bold text-sm">Total</td>
                        <td className="px-4 py-3.5"></td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(capitalEmprunte)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(totalInterets)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(totalAssurance)}</td>
                        <td className="px-4 py-3.5"></td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums text-sm">{formatCurrency(capitalEmprunte + totalInterets + totalAssurance)}</td>
                        <td className="px-4 py-3.5"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </Section>

            {/* ── Graphique aire : Capital restant dû ── */}
            <Section title="Évolution du capital restant dû" delay={3}>
              <GlassCard>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={schedule.map((r) => ({
                      annee: r.anneeReelle ?? `N+${r.year}`,
                      "CRD": Math.round(r.capitalFin),
                      "Intérêts cumulés": Math.round(schedule.slice(0, schedule.indexOf(r) + 1).reduce((acc, x) => acc + x.interets, 0)),
                    }))}>
                      <defs>
                        <linearGradient id="crdGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="interetsCumGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis dataKey="annee" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: number, name: string) => [formatCurrency(v), name]}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Area type="monotone" dataKey="CRD" name="Capital restant dû" fill="url(#crdGradient)" stroke="#8b5cf6" strokeWidth={2.5} />
                      <Area type="monotone" dataKey="Intérêts cumulés" fill="url(#interetsCumGradient)" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </Section>
          </>
        )}

        {!selectedEmprunt && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-border/60 bg-gradient-to-br from-card to-muted/20 py-20 text-center">
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.03]">
                <TableIcon className="h-64 w-64" />
              </div>
              <div className="relative space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Landmark className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Aucun emprunt sélectionné</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sélectionnez un emprunt ci-dessus pour afficher son tableau d'amortissement détaillé</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
