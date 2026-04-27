import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../../lib/queryClient";
import { useCrud } from "../../../hooks/useCrud";
import { FormDialog } from "../../../components/ui/form-dialog";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../../components/ui/form-field";
import { Badge } from "../../../components/ui/badge";
import { formatCurrency, formatPercent } from "../../../lib/utils";
import { Plus, Pencil, Trash2, Search, Download, ChevronDown, ChevronRight, Inbox, CheckCircle2, AlertTriangle, AlertCircle, Landmark, TrendingDown, Percent, Calendar } from "lucide-react";
import { getAnnuiteEmprunt, reconcileEmprunt, type AMEmprunt } from "../../../lib/am-calculations";
import { findRefTauxEmprunt, compareTauxEmprunt, badgeVariant, type RefTauxEmprunt } from "../../../lib/market-utils";
import { InfoTooltip } from "../../../components/ui/info-tooltip";
import { KpiCard } from "../../../components/ui/kpi-card";
import type { Emprunt, SCI, Actif } from "../../../types";

const empty: Partial<Emprunt> = {};

export function EmpruntsTab() {
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

  const kpis = useMemo(() => {
    const all = data.filter((e) => !e.archived);
    const totalEmprunte = all.reduce((s, e) => s + parseFloat(e.montantEmprunte || "0"), 0);
    const totalCRD = all.reduce((s, e) => s + parseFloat(e.capitalRestantDu || e.montantEmprunte || "0"), 0);
    let sumTauxPondere = 0;
    let sumPoids = 0;
    for (const e of all) {
      const taux = parseFloat(e.tauxAnnuel || "0");
      const poids = parseFloat(e.capitalRestantDu || e.montantEmprunte || "0");
      if (taux > 0 && poids > 0) {
        sumTauxPondere += taux * poids;
        sumPoids += poids;
      }
    }
    const tauxMoyen = sumPoids > 0 ? sumTauxPondere / sumPoids : 0;
    const annuiteTotale = all.reduce((s, e) => s + getAnnuiteEmprunt(e as unknown as AMEmprunt), 0);
    return { totalEmprunte, totalCRD, tauxMoyen, annuiteTotale };
  }, [data]);

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
    if (editing) { await update({ ...form, id: editing.id } as Emprunt); } else { await create(form); }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total emprunté" value={kpis.totalEmprunte} formatFn={formatCurrency} icon={Landmark} variant="primary" gradient delay={0} />
        <KpiCard label="Capital restant dû" value={kpis.totalCRD} formatFn={formatCurrency} icon={TrendingDown} variant="warning" gradient delay={1} metricKey="crd" />
        <KpiCard label="Taux moyen pondéré" value={kpis.tauxMoyen} formatFn={(v) => formatPercent(v, 2)} icon={Percent} variant="success" gradient delay={2} />
        <KpiCard label="Annuité totale" value={kpis.annuiteTotale} formatFn={formatCurrency} icon={Calendar} variant="danger" gradient delay={3} metricKey="annuite" />
      </div>

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
                      const amEmprunt = emp as unknown as AMEmprunt;
                      const annuite = getAnnuiteEmprunt(amEmprunt);
                      const recon = reconcileEmprunt(amEmprunt);
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
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {annuite > 0 ? formatCurrency(annuite) : "—"}
                              {recon && (
                                <span title={recon.detail} className="cursor-help">
                                  {recon.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                                  {recon.status === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                  {recon.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                                </span>
                              )}
                            </div>
                          </td>
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
