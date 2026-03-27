import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { useCrud } from "../../hooks/useCrud";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { PageHeader } from "../../components/ui/page-header";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { Plus, Pencil, Trash2, TrendingDown, Calculator, RefreshCw, Landmark, Percent, TableIcon, Search, Download, ChevronDown, ChevronRight, Inbox, Calendar, Banknote, ShieldCheck, PiggyBank, ArrowRight, Clock, Building2 } from "lucide-react";
import { getAnnuiteEmprunt, computeAmortSchedule, type AMEmprunt, type AmortRow } from "../../lib/am-calculations";
import { findRefTauxEmprunt, compareTauxEmprunt, badgeVariant, type RefTauxEmprunt } from "../../lib/market-utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, ComposedChart, Line } from "recharts";
import { InfoTooltip } from "../../components/ui/info-tooltip";

interface Emprunt {
  id: string; sciId?: string; actifId?: string; banque?: string; montantEmprunte?: string;
  capitalRestantDu?: string; tauxAnnuel?: string; dureeAns?: number; dureeMois?: number;
  dateDebut?: string; dateFin?: string; typeAmortissement?: string; mensualite?: string;
  assuranceMensuelle?: string; tauxAssurance?: string; typeGarantie?: string; ira?: string;
  notes?: string; archived?: boolean;
}
interface SCI { id: string; nom: string; }
interface Actif { id: string; nom: string; }

const empty: Partial<Emprunt> = {};

/* ═══════════ Onglet Emprunts (CRUD avec groupement SCI/Actif) ═══════════ */
function EmpruntsTab() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Emprunt>("/api/am/emprunts", "Emprunt");
  const { data: scis } = useCrud<SCI>("/api/am/scis", "SCI");
  const { data: actifsList } = useCrud<Actif>("/api/am/actifs", "Actif");
  const { data: refTaux = [] } = useQuery<RefTauxEmprunt[]>({ queryKey: ["/api/am/marche/taux-emprunt"], queryFn: () => apiRequest("/api/am/marche/taux-emprunt") });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Emprunt | null>(null);
  const [form, setForm] = useState<Partial<Emprunt>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedSCIs, setCollapsedSCIs] = useState<Set<string>>(new Set());

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));
  const actifMap = Object.fromEntries(actifsList.map((a) => [a.id, a.nom]));

  // Filter, sort by SCI then Actif, group
  const grouped = useMemo(() => {
    let items = data.filter((e) => !e.archived);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((e) =>
        (e.banque || "").toLowerCase().includes(q) ||
        (e.sciId && (sciMap[e.sciId] || "").toLowerCase().includes(q)) ||
        (e.actifId && (actifMap[e.actifId] || "").toLowerCase().includes(q))
      );
    }
    // Sort by SCI name, then actif name, then banque
    items.sort((a, b) => {
      const sciA = a.sciId ? (sciMap[a.sciId] || "") : "zzz";
      const sciB = b.sciId ? (sciMap[b.sciId] || "") : "zzz";
      if (sciA !== sciB) return sciA.localeCompare(sciB, "fr");
      const actifA = a.actifId ? (actifMap[a.actifId] || "") : "zzz";
      const actifB = b.actifId ? (actifMap[b.actifId] || "") : "zzz";
      if (actifA !== actifB) return actifA.localeCompare(actifB, "fr");
      return (a.banque || "").localeCompare(b.banque || "", "fr");
    });
    // Group by SCI
    const groups: { sciId: string; sciName: string; emprunts: Emprunt[]; totalCRD: number; totalMontant: number }[] = [];
    for (const emp of items) {
      const sciId = emp.sciId || "__none__";
      let group = groups.find((g) => g.sciId === sciId);
      if (!group) {
        group = { sciId, sciName: emp.sciId ? (sciMap[emp.sciId] || "SCI inconnue") : "Sans SCI", emprunts: [], totalCRD: 0, totalMontant: 0 };
        groups.push(group);
      }
      group.emprunts.push(emp);
      group.totalCRD += parseFloat(emp.capitalRestantDu || emp.montantEmprunte || "0");
      group.totalMontant += parseFloat(emp.montantEmprunte || "0");
    }
    return groups;
  }, [data, search, sciMap, actifMap]);

  const totalCount = grouped.reduce((s, g) => s + g.emprunts.length, 0);

  const toggleSCI = (sciId: string) => {
    setCollapsedSCIs((prev) => {
      const next = new Set(prev);
      if (next.has(sciId)) next.delete(sciId);
      else next.add(sciId);
      return next;
    });
  };

  const exportCSV = () => {
    const headers = ["SCI", "Actif", "Banque", "Montant", "CRD", "Taux", "Annuité", "Taux assur.", "IRA", "Échéance"];
    const rows = grouped.flatMap((g) =>
      g.emprunts.map((e) => {
        const annuite = getAnnuiteEmprunt(e as unknown as AMEmprunt);
        return [
          g.sciName,
          e.actifId ? (actifMap[e.actifId] || "") : "",
          e.banque || "",
          e.montantEmprunte || "",
          e.capitalRestantDu || "",
          e.tauxAnnuel || "",
          annuite > 0 ? annuite.toFixed(2) : "",
          e.tauxAssurance || "",
          e.ira || "",
          e.dateFin || "",
        ].map((v) => {
          const s = String(v);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        });
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emprunts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { await update({ ...form, id: editing.id } as any); } else { await create(form); }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
          <Plus className="h-4 w-4" /> Nouvel emprunt
        </motion.button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..."
            className="w-full rounded-xl border border-border/60 bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>
        <div className="flex-1" />
        <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground">
          <Download className="h-4 w-4" /> Exporter
        </button>
      </div>

      {/* Grouped table */}
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-8"></th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Banque</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actif</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Montant</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip metricKey="crd">CRD</InfoTooltip></th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip metricKey="tauxAnnuel">Taux</InfoTooltip></th>
              <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">vs Marché</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip metricKey="annuite">Annuité</InfoTooltip></th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"><InfoTooltip metricKey="assurance">Taux assur.</InfoTooltip></th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">IRA</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Échéance</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {totalCount === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted"><Inbox className="h-6 w-6 text-muted-foreground/50" /></div>
                    <p className="font-medium text-muted-foreground">Aucun emprunt</p>
                  </div>
                </td>
              </tr>
            ) : (
              grouped.map((group) => {
                const isCollapsed = collapsedSCIs.has(group.sciId);
                return (
                  <AnimatePresence key={group.sciId} initial={false}>
                    {/* SCI group header */}
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-muted/60 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => toggleSCI(group.sciId)}
                    >
                      <td className="px-4 py-2.5" colSpan={3}>
                        <div className="flex items-center gap-2">
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          <Badge variant="primary">{group.sciName}</Badge>
                          <span className="text-xs text-muted-foreground">({group.emprunts.length} emprunt{group.emprunts.length > 1 ? "s" : ""})</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{formatCurrency(group.totalMontant)}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{formatCurrency(group.totalCRD)}</td>
                      <td colSpan={7}></td>
                    </motion.tr>
                    {/* Emprunt rows */}
                    {!isCollapsed && group.emprunts.map((emp, i) => {
                      const annuite = getAnnuiteEmprunt(emp as unknown as AMEmprunt);
                      return (
                        <motion.tr
                          key={emp.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="hover:bg-primary/[0.03] transition-colors"
                        >
                          <td className="px-4 py-3.5"></td>
                          <td className="px-4 py-3.5 font-medium">{emp.banque || "—"}</td>
                          <td className="px-4 py-3.5">{emp.actifId ? <span className="text-muted-foreground">{actifMap[emp.actifId] || "—"}</span> : "—"}</td>
                          <td className="px-4 py-3.5 text-right">{emp.montantEmprunte ? formatCurrency(emp.montantEmprunte) : "—"}</td>
                          <td className="px-4 py-3.5 text-right">{emp.capitalRestantDu ? formatCurrency(emp.capitalRestantDu) : "—"}</td>
                          <td className="px-4 py-3.5 text-right">{emp.tauxAnnuel ? formatPercent(emp.tauxAnnuel) : "—"}</td>
                          <td className="px-4 py-3.5 text-center">
                            {(() => {
                              if (!emp.tauxAnnuel || refTaux.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                              const ref = findRefTauxEmprunt(refTaux, "résidentiel", emp.dureeAns);
                              if (!ref) return <span className="text-xs text-muted-foreground">—</span>;
                              const cmp = compareTauxEmprunt(Number(emp.tauxAnnuel), Number(ref.taux));
                              return <span title={cmp.detail}><Badge variant={badgeVariant(cmp.level)}>{cmp.label}</Badge></span>;
                            })()}
                          </td>
                          <td className="px-4 py-3.5 text-right">{annuite > 0 ? formatCurrency(annuite) : "—"}</td>
                          <td className="px-4 py-3.5 text-right">{emp.tauxAssurance ? formatPercent(emp.tauxAssurance) : "—"}</td>
                          <td className="px-4 py-3.5 text-right">{emp.ira ? formatCurrency(emp.ira) : "—"}</td>
                          <td className="px-4 py-3.5">{emp.dateFin || "—"}</td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setEditing(emp); setForm(emp); setDialogOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteId(emp.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs font-medium text-muted-foreground">{totalCount} {totalCount > 1 ? "résultats" : "résultat"}</div>

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier l'emprunt" : "Nouvel emprunt"} onSubmit={handleSubmit} loading={creating || updating} size="lg">
        <FormGrid>
          <FormField label="Banque" name="banque" value={form.banque} onChange={onChange} />
          <FormField label="SCI" name="sciId" value={form.sciId} onChange={onChange} options={scis.map((s) => ({ value: s.id, label: s.nom }))} />
          <FormField label="Actif" name="actifId" value={form.actifId} onChange={onChange} options={actifsList.map((a) => ({ value: a.id, label: a.nom }))} />
          <FormField label="Type amortissement" name="typeAmortissement" value={form.typeAmortissement} onChange={onChange} options={[
            { value: "constant", label: "Constant" }, { value: "in-fine", label: "In fine" }, { value: "progressif", label: "Progressif" },
          ]} />
          <FormField label="Montant emprunté" name="montantEmprunte" value={form.montantEmprunte} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Capital restant dû" name="capitalRestantDu" value={form.capitalRestantDu} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Taux annuel" name="tauxAnnuel" value={form.tauxAnnuel} onChange={onChange} type="number" suffix="%" />
          <FormField label="Mensualité" name="mensualite" value={form.mensualite} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Durée (ans)" name="dureeAns" value={form.dureeAns} onChange={onChange} type="number" />
          <FormField label="Durée (mois)" name="dureeMois" value={form.dureeMois} onChange={onChange} type="number" />
          <FormField label="Date début" name="dateDebut" value={form.dateDebut} onChange={onChange} type="date" />
          <FormField label="Date fin" name="dateFin" value={form.dateFin} onChange={onChange} type="date" />
          <FormField label="Assurance/mois" name="assuranceMensuelle" value={form.assuranceMensuelle} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Taux assurance" name="tauxAssurance" value={form.tauxAssurance} onChange={onChange} type="number" suffix="%" />
          <FormField label="Type garantie" name="typeGarantie" value={form.typeGarantie} onChange={onChange} options={[
            { value: "hypotheque", label: "Hypotheque" }, { value: "caution", label: "Caution" }, { value: "privilege", label: "Privilege" },
          ]} />
          <FormField label="IRA (Indemnité remb. anticipé)" name="ira" value={form.ira} onChange={onChange} type="number" suffix="EUR" />
        </FormGrid>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}

/* ═══════════ Onglet Cout du credit ═══════════ */
function CoutCreditTab() {
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

  // Calcul du cout total pour chaque emprunt
  const coutData = useMemo(() => {
    return activeEmprunts.map((emp) => {
      const montant = emp.montantEmprunte ? parseFloat(emp.montantEmprunte) : 0;
      const duree = emp.dureeMois || (emp.dureeAns ? emp.dureeAns * 12 : 0);
      const tauxAnnuel = emp.tauxAnnuel ? parseFloat(emp.tauxAnnuel) / 100 : 0;
      const tauxAssurance = emp.tauxAssurance ? parseFloat(emp.tauxAssurance) / 100 : 0;

      // Mensualité : valeur saisie ou calcul actuariel à partir du taux
      let mens = emp.mensualite ? parseFloat(emp.mensualite) : 0;
      if (mens === 0 && montant > 0 && duree > 0) {
        if (tauxAnnuel > 0) {
          const rm = tauxAnnuel / 12;
          const factor = Math.pow(1 + rm, duree);
          mens = montant * (rm * factor) / (factor - 1);
        } else {
          mens = montant / duree;
        }
      }

      // Assurance mensuelle : valeur saisie ou calcul à partir du taux d'assurance (sur capital initial / 12)
      let assurance = emp.assuranceMensuelle ? parseFloat(emp.assuranceMensuelle) : 0;
      if (assurance === 0 && montant > 0 && tauxAssurance > 0) {
        assurance = (montant * tauxAssurance) / 12;
      }

      const totalRembourse = (mens + assurance) * duree;
      const coutAssurance = assurance * duree;
      const coutInterets = Math.max(0, (mens * duree) - montant);
      const coutTotal = coutInterets + coutAssurance;
      // TAEG approximation using annualized rate: (totalRembourse/montant)^(12/duree) - 1
      const taeg = montant > 0 && duree > 0
        ? (Math.pow(totalRembourse / montant, 12 / duree) - 1) * 100
        : 0;

      const label = emp.sciId && sciMap[emp.sciId]
        ? `${sciMap[emp.sciId]}${emp.actifId && actifMap[emp.actifId] ? " / " + actifMap[emp.actifId] : ""}`
        : emp.banque || "—";

      return {
        id: emp.id,
        banque: emp.banque || "—",
        label,
        sci: emp.sciId ? sciMap[emp.sciId] || "—" : "—",
        montant,
        taux: emp.tauxAnnuel ? parseFloat(emp.tauxAnnuel) : 0,
        duree,
        mensualite: mens,
        totalRembourse,
        coutInterets: Math.max(0, coutInterets),
        coutAssurance,
        coutTotal: Math.max(0, coutTotal),
        taeg: Math.max(0, taeg),
      };
    });
  }, [activeEmprunts, sciMap]);

  const totalInterets = coutData.reduce((s, c) => s + c.coutInterets, 0);
  const totalAssurance = coutData.reduce((s, c) => s + c.coutAssurance, 0);
  const totalCout = coutData.reduce((s, c) => s + c.coutTotal, 0);
  const totalMontant = coutData.reduce((s, c) => s + c.montant, 0);

  const chartData = coutData.map((c) => ({
    name: c.label,
    Intérêts: Math.round(c.coutInterets),
    Assurance: Math.round(c.coutAssurance),
    Capital: Math.round(c.montant),
  }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Capital emprunté" value={totalMontant} formatFn={(n) => formatCurrency(n)} icon={Landmark} variant="primary" gradient delay={0} />
          <KpiCard label="Coût des intérêts" value={totalInterets} formatFn={(n) => formatCurrency(n)} icon={TrendingDown} variant="danger" gradient delay={1} />
          <KpiCard label="Coût assurance" value={totalAssurance} formatFn={(n) => formatCurrency(n)} icon={Calculator} variant="warning" gradient delay={2} />
          <KpiCard label="Coût total du crédit" value={totalCout} formatFn={(n) => formatCurrency(n)} icon={Percent} variant="danger" gradient delay={3} metricKey="coutCredit" />
        </div>

        {chartData.length > 0 && (
          <Section title="Décomposition par emprunt" delay={1}>
            <GlassCard>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="Capital" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Intérêts" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Assurance" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>
        )}

        <Section title="Détail par emprunt" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Banque</th>
                  <th className="px-4 py-3 text-left font-semibold">Actif</th>
                  <th className="px-4 py-3 text-right font-semibold">Montant</th>
                  <th className="px-4 py-3 text-right font-semibold">Taux</th>
                  <th className="px-4 py-3 text-right font-semibold">Durée</th>
                  <th className="px-4 py-3 text-right font-semibold">Intérêts</th>
                  <th className="px-4 py-3 text-right font-semibold">Assurance</th>
                  <th className="px-4 py-3 text-right font-semibold">Coût total</th>
                  <th className="px-4 py-3 text-right font-semibold">TAEG estim.</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group coutData by SCI
                  const sciGroups: { sciId: string; sciName: string; items: typeof coutData }[] = [];
                  const sorted = [...coutData].sort((a, b) => a.sci.localeCompare(b.sci, "fr"));
                  for (const c of sorted) {
                    const emp = activeEmprunts.find((e) => e.id === c.id);
                    const sciId = emp?.sciId || "__none__";
                    let group = sciGroups.find((g) => g.sciId === sciId);
                    if (!group) { group = { sciId, sciName: c.sci, items: [] }; sciGroups.push(group); }
                    group.items.push(c);
                  }
                  return sciGroups.map((group) => {
                    const groupMontant = group.items.reduce((s, c) => s + c.montant, 0);
                    const groupInterets = group.items.reduce((s, c) => s + c.coutInterets, 0);
                    const groupAssurance = group.items.reduce((s, c) => s + c.coutAssurance, 0);
                    const groupCout = group.items.reduce((s, c) => s + c.coutTotal, 0);
                    return (
                      <Fragment key={group.sciId}>
                        <tr className="bg-muted/50">
                          <td className="px-4 py-2" colSpan={2}>
                            <Badge variant="primary">{group.sciName}</Badge>
                            <span className="ml-2 text-xs text-muted-foreground">({group.items.length})</span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">{formatCurrency(groupMontant)}</td>
                          <td colSpan={2}></td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-red-500/70">{formatCurrency(groupInterets)}</td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-amber-500/70">{formatCurrency(groupAssurance)}</td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-red-500/70">{formatCurrency(groupCout)}</td>
                          <td></td>
                        </tr>
                        {group.items.map((c) => {
                          const emp = activeEmprunts.find((e) => e.id === c.id);
                          return (
                            <tr key={c.id} className="border-t hover:bg-muted/20">
                              <td className="px-4 py-3 pl-8 font-medium">{c.banque}</td>
                              <td className="px-4 py-3 text-muted-foreground">{emp?.actifId ? (actifMap[emp.actifId] || "—") : "—"}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(c.montant)}</td>
                              <td className="px-4 py-3 text-right">{formatPercent(c.taux, 2)}</td>
                              <td className="px-4 py-3 text-right">{c.duree > 0 ? `${Math.round(c.duree / 12)} ans` : "—"}</td>
                              <td className="px-4 py-3 text-right text-red-600">{formatCurrency(c.coutInterets)}</td>
                              <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(c.coutAssurance)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(c.coutTotal)}</td>
                              <td className="px-4 py-3 text-right">{formatPercent(c.taeg, 2)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalMontant)}</td>
                  <td className="px-4 py-3" colSpan={2}></td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalInterets)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(totalAssurance)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalCout)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Onglet Rachat de credit ═══════════ */
function RachatCreditTab() {
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

  // Simulateur
  const [selectedEmprunt, setSelectedEmprunt] = useState<string>("");
  const [nouveauTaux, setNouveauTaux] = useState<string>("3.0");
  const [nouvelleDuree, setNouvelleDuree] = useState<string>("20");
  const [fraisRachat, setFraisRachat] = useState<string>("3.0"); // % IRA
  const [fraisDossier, setFraisDossier] = useState<string>("1500");
  const [fraisGarantie, setFraisGarantie] = useState<string>("2500");

  const emp = activeEmprunts.find((e) => e.id === selectedEmprunt);

  const simulation = useMemo(() => {
    if (!emp) return null;

    const crd = emp.capitalRestantDu ? parseFloat(emp.capitalRestantDu) : (emp.montantEmprunte ? parseFloat(emp.montantEmprunte) : 0);
    const ancienTaux = emp.tauxAnnuel ? parseFloat(emp.tauxAnnuel) / 100 : 0;
    const ancienneMens = emp.mensualite ? parseFloat(emp.mensualite) : 0;
    const ancienneAssurance = emp.assuranceMensuelle ? parseFloat(emp.assuranceMensuelle) : 0;
    const ancienneDureeRestante = emp.dureeMois || (emp.dureeAns ? emp.dureeAns * 12 : 240);

    // Calcul ancien cout restant
    const ancienCoutRestant = (ancienneMens + ancienneAssurance) * ancienneDureeRestante;

    // Nouveau prêt
    const nTaux = parseFloat(nouveauTaux) / 100;
    const nDuree = parseInt(nouvelleDuree) * 12;
    const ira = crd * (parseFloat(fraisRachat) / 100); // Indemnite de remboursement anticipe
    const dossier = parseFloat(fraisDossier) || 0;
    const garantie = parseFloat(fraisGarantie) || 0;
    const totalFrais = ira + dossier + garantie;

    // Mensualite nouveau pret (formule amortissement constant)
    const tauxMensuel = nTaux / 12;
    const nouvelleMensualite = tauxMensuel > 0
      ? crd * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -nDuree))
      : crd / nDuree;

    const nouveauCoutTotal = nouvelleMensualite * nDuree + totalFrais;
    const economie = ancienCoutRestant - nouveauCoutTotal;
    const pointMort = economie > 0 ? Math.ceil(totalFrais / (ancienneMens - nouvelleMensualite)) : 0;

    // Tableau amortissement simplifie (annuel)
    const amortissement: Array<{ annee: number; crdDebut: number; interets: number; capital: number; crdFin: number }> = [];
    let crdCourant = crd;
    const nbAnnees = Math.ceil(nDuree / 12);
    for (let a = 1; a <= Math.min(nbAnnees, 30); a++) {
      const moisDansAnnee = a === nbAnnees ? nDuree - (nbAnnees - 1) * 12 : 12;
      let interetsAnnee = 0;
      let capitalAnnee = 0;
      for (let m = 0; m < moisDansAnnee; m++) {
        const interet = crdCourant * tauxMensuel;
        const cap = nouvelleMensualite - interet;
        interetsAnnee += interet;
        capitalAnnee += cap;
        crdCourant = Math.max(0, crdCourant - cap);
      }
      amortissement.push({
        annee: a,
        crdDebut: crdCourant + capitalAnnee,
        interets: interetsAnnee,
        capital: capitalAnnee,
        crdFin: crdCourant,
      });
    }

    return {
      crd, ancienneMens, ancienneAssurance, ancienneDureeRestante,
      ancienCoutRestant, nouvelleMensualite, nDuree, totalFrais,
      ira, dossier, garantie, nouveauCoutTotal, economie, pointMort,
      amortissement,
    };
  }, [emp, nouveauTaux, nouvelleDuree, fraisRachat, fraisDossier, fraisGarantie]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <Section title="Simulateur de rachat de credit" delay={0}>
          <GlassCard>
            <div className="space-y-6">
              {/* Selection de l'emprunt */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Emprunt a racheter</label>
                  <select
                    value={selectedEmprunt}
                    onChange={(e) => setSelectedEmprunt(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selectionnez un emprunt</option>
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
                              {[e.actifId ? actifMap[e.actifId] : null, e.banque].filter(Boolean).join(" / ") || "Emprunt"} — {e.capitalRestantDu ? formatCurrency(e.capitalRestantDu) : e.montantEmprunte ? formatCurrency(e.montantEmprunte) : "N/A"}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                </div>
                <FormField label="Nouveau taux (%)" name="nouveauTaux" value={nouveauTaux} onChange={(_, v) => setNouveauTaux(v)} type="number" suffix="%" />
                <FormField label="Nouvelle durée (ans)" name="nouvelleDuree" value={nouvelleDuree} onChange={(_, v) => setNouvelleDuree(v)} type="number" suffix="ans" />
              </div>

              {/* Frais */}
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="IRA (%)" name="fraisRachat" value={fraisRachat} onChange={(_, v) => setFraisRachat(v)} type="number" suffix="%" />
                <FormField label="Frais de dossier" name="fraisDossier" value={fraisDossier} onChange={(_, v) => setFraisDossier(v)} type="number" suffix="EUR" />
                <FormField label="Frais de garantie" name="fraisGarantie" value={fraisGarantie} onChange={(_, v) => setFraisGarantie(v)} type="number" suffix="EUR" />
              </div>
            </div>
          </GlassCard>
        </Section>

        {simulation && (
          <>
            {/* Résultat KPIs */}
            <div className="grid gap-4 sm:grid-cols-4">
              <KpiCard label="Ancienne mensualité" value={simulation.ancienneMens + simulation.ancienneAssurance} formatFn={(n) => formatCurrency(n)} icon={TrendingDown} variant="warning" gradient delay={0} metricKey="mensualite" />
              <KpiCard label="Nouvelle mensualité" value={simulation.nouvelleMensualite} formatFn={(n) => formatCurrency(n)} icon={RefreshCw} variant="primary" gradient delay={1} metricKey="mensualite" />
              <KpiCard label="Économie totale" value={simulation.economie} formatFn={(n) => formatCurrency(n)} icon={Calculator} variant={simulation.economie > 0 ? "success" : "danger"} gradient delay={2} />
              <KpiCard label="Point mort" value={simulation.pointMort} formatFn={(n) => n > 0 ? `${n} mois` : "N/A"} icon={Percent} variant="primary" gradient delay={3} />
            </div>

            {/* Comparaison */}
            <Section title="Comparaison ancien vs nouveau" delay={2}>
              <GlassCard>
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left font-semibold"></th>
                        <th className="px-4 py-3 text-right font-semibold">Prêt actuel</th>
                        <th className="px-4 py-3 text-right font-semibold">Nouveau prêt</th>
                        <th className="px-4 py-3 text-right font-semibold">Différence</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-4 py-3 font-medium">Capital restant dû</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.crd)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.crd)}</td>
                        <td className="px-4 py-3 text-right">—</td>
                      </tr>
                      <tr className="border-t">
                        <td className="px-4 py-3 font-medium">Mensualité</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.ancienneMens + simulation.ancienneAssurance)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.nouvelleMensualite)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${simulation.nouvelleMensualite < simulation.ancienneMens + simulation.ancienneAssurance ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(simulation.nouvelleMensualite - simulation.ancienneMens - simulation.ancienneAssurance)}
                        </td>
                      </tr>
                      <tr className="border-t">
                        <td className="px-4 py-3 font-medium">Coût total restant</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.ancienCoutRestant)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.nouveauCoutTotal)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${simulation.economie > 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(-simulation.economie)}
                        </td>
                      </tr>
                      <tr className="border-t bg-muted/10">
                        <td className="px-4 py-3 font-medium">Frais de rachat</td>
                        <td className="px-4 py-3 text-right">—</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(simulation.totalFrais)}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          IRA: {formatCurrency(simulation.ira)} | Dossier: {formatCurrency(simulation.dossier)} | Garantie: {formatCurrency(simulation.garantie)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="px-4 py-3">Économie nette</td>
                        <td className="px-4 py-3" colSpan={2}></td>
                        <td className={`px-4 py-3 text-right text-lg ${simulation.economie > 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(simulation.economie)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </GlassCard>
            </Section>

            {/* Amortissement chart */}
            {simulation.amortissement.length > 0 && (
              <Section title="Amortissement du nouveau pret" delay={3}>
                <GlassCard>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={simulation.amortissement}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="annee" tick={{ fontSize: 12 }} label={{ value: "Année", position: "insideBottom", offset: -5 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                        <Area type="monotone" dataKey="crdFin" name="Capital restant" fill="#3b82f6" fillOpacity={0.3} stroke="#3b82f6" />
                        <Area type="monotone" dataKey="interets" name="Intérêts annuels" fill="#ef4444" fillOpacity={0.2} stroke="#ef4444" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </Section>
            )}
          </>
        )}

        {!simulation && (
          <GlassCard>
            <div className="py-12 text-center text-muted-foreground">
              <RefreshCw className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>Selectionnez un emprunt ci-dessus pour simuler un rachat de credit</p>
            </div>
          </GlassCard>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Onglet Amortissement par emprunt ═══════════ */
function AmortissementTab() {
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
                        <span className="text-sm font-semibold">{formatPercent(parseFloat(selectedEmprunt.tauxAnnuel || "0") / 100, 2)}</span>
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

/* ═══════════ Page principale avec onglets ═══════════ */
export default function EmpruntsPage() {
  const [activeTab, setActiveTab] = useState("emprunts");

  return (
    <div className="space-y-6">
      <PageHeader title="Emprunts & Financements" description="Gestion des emprunts, coût du crédit et simulation de rachat" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="emprunts">Emprunts</TabsTrigger>
          <TabsTrigger value="amortissement">Amortissement</TabsTrigger>
          <TabsTrigger value="cout-credit">Cout du credit</TabsTrigger>
          <TabsTrigger value="rachat-credit">Rachat de credit</TabsTrigger>
        </TabsList>
        <TabsContent value="emprunts">
          <EmpruntsTab />
        </TabsContent>
        <TabsContent value="amortissement">
          <AmortissementTab />
        </TabsContent>
        <TabsContent value="cout-credit">
          <CoutCreditTab />
        </TabsContent>
        <TabsContent value="rachat-credit">
          <RachatCreditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
