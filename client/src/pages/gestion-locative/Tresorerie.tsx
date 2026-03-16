import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency } from "../../lib/utils";
import { useCrud } from "../../hooks/useCrud";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { FormDialog } from "../../components/ui/form-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import {
  DollarSign, CheckCircle2, Clock, XCircle, FileText,
  Calendar, ChevronDown, ChevronUp, Pencil, Trash2,
} from "lucide-react";

interface Facture {
  id: string;
  bailId: string;
  type: string;
  fileName: string;
  dateFacture: string;
  dateEcheance?: string;
  montantHT?: string;
  montantTTC: string;
  reference?: string;
  statut: string;
  datePaiement?: string;
  notes?: string;
}

const chartTooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.75rem",
  },
};

const statutConfig: Record<string, { variant: "success" | "warning" | "danger" | "primary"; label: string }> = {
  paye: { variant: "success", label: "Payé" },
  a_payer: { variant: "warning", label: "À payer" },
  en_attente: { variant: "primary", label: "En attente" },
  refuse: { variant: "danger", label: "Refusé" },
};

export default function TresoreriePage() {
  const { data: factures, create, update, remove, creating, updating, deleting } =
    useCrud<Facture>("/api/gl/factures", "Facture");
  const { data: baux = [] } = useQuery({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Facture | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedStatut, setSelectedStatut] = useState("all");
  const [selectedBail, setSelectedBail] = useState("all");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const activeBaux = baux.filter((b: any) => !b.archived);
  const bauxMap = Object.fromEntries(activeBaux.map((b: any) => [b.id, b.nom]));

  // Filtered factures
  const filtered = useMemo(() => {
    return (factures || []).filter((f: any) => {
      if (selectedStatut !== "all" && f.statut !== selectedStatut) return false;
      if (selectedBail !== "all" && f.bailId !== selectedBail) return false;
      return true;
    });
  }, [factures, selectedStatut, selectedBail]);

  // KPI totals
  const totals = useMemo(() => {
    const all = factures || [];
    const paye = all.filter((f: any) => f.statut === "paye").reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
    const aPayer = all.filter((f: any) => f.statut === "a_payer").reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
    const enAttente = all.filter((f: any) => f.statut === "en_attente").reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
    const refuse = all.filter((f: any) => f.statut === "refuse").reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
    return { paye, aPayer, enAttente, refuse, total: paye + aPayer + enAttente };
  }, [factures]);

  // Monthly grouped data
  const monthlyData = useMemo(() => {
    const grouped = new Map<string, Facture[]>();
    filtered.forEach((f: any) => {
      const d = new Date(f.dateFacture || "");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(f);
    });
    return Array.from(grouped.entries())
      .map(([key, facs]) => {
        const [y, m] = key.split("-");
        const date = new Date(parseInt(y), parseInt(m) - 1);
        const total = facs.reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
        const paye = facs.filter((f: any) => f.statut === "paye").reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
        return {
          key,
          label: date.toLocaleDateString("fr-FR", { year: "numeric", month: "long" }),
          factures: facs,
          total,
          paye,
          count: facs.length,
        };
      })
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

  // Chart data (last 12 months)
  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      const monthFacs = (factures || []).filter((f: any) => (f.dateFacture || "").startsWith(key));
      const total = monthFacs.reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
      const paye = monthFacs.filter((f: any) => f.statut === "paye").reduce((s: number, f: any) => s + Number(f.montantTTC || 0), 0);
      return { name: label, total, paye };
    });
  }, [factures]);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const payload: Record<string, any> = {};
    fd.forEach((v, k) => { payload[k] = v; });
    if (!payload.fileName) payload.fileName = `${payload.type || "facture"}-${payload.dateFacture || ""}`;
    if (editing) {
      await update({ id: editing.id, ...payload } as any);
    } else {
      await create(payload);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const getStatutBadge = (statut: string) => {
    const cfg = statutConfig[statut] || { variant: "primary" as const, label: statut };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Trésorerie & Factures"
          description="Suivi des factures, paiements et flux financiers"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Payé" value={totals.paye}
            formatFn={formatCurrency} icon={CheckCircle2}
            variant="success" gradient delay={0}
          />
          <KpiCard
            label="À payer" value={totals.aPayer}
            formatFn={formatCurrency} icon={DollarSign}
            variant="warning" gradient delay={1}
          />
          <KpiCard
            label="En attente" value={totals.enAttente}
            formatFn={formatCurrency} icon={Clock}
            variant="primary" gradient delay={2}
          />
          <KpiCard
            label="Refusé" value={totals.refuse}
            formatFn={formatCurrency} icon={XCircle}
            variant="danger" gradient delay={3}
          />
        </div>

        {/* Filters + Add button */}
        <GlassCard delay={4}>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Statut</label>
              <select
                value={selectedStatut}
                onChange={(e) => setSelectedStatut(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Tous les statuts</option>
                <option value="paye">Payé</option>
                <option value="a_payer">À payer</option>
                <option value="en_attente">En attente</option>
                <option value="refuse">Refusé</option>
              </select>
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Bail / Crèche</label>
              <select
                value={selectedBail}
                onChange={(e) => setSelectedBail(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Tous les baux</option>
                {activeBaux.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.nom}</option>
                ))}
              </select>
            </div>
            <div className="ml-auto">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                + Nouvelle facture
              </motion.button>
            </div>
          </div>
        </GlassCard>

        {/* Area chart */}
        {chartData.some((d) => d.total > 0) && (
          <GlassCard delay={5}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Factures des 12 derniers mois
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="total" name="Total TTC" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={800} />
                <Bar dataKey="paye" name="Payé" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* Monthly accordion */}
        <Section title="Historique mensuel" delay={6}>
          {monthlyData.length === 0 ? (
            <GlassCard hover={false}>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Aucune facture</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajoutez des factures pour voir l'historique mensuel
                </p>
              </div>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {monthlyData.map((month) => {
                const isExpanded = expandedMonths.has(month.key);
                return (
                  <motion.div
                    key={month.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border bg-card shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => toggleMonth(month.key)}
                      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-semibold capitalize">{month.label}</span>
                        <Badge variant="outline">{month.count} facture{month.count > 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          Payé : {formatCurrency(month.paye)}
                        </span>
                        <span className="text-lg font-bold text-primary">
                          {formatCurrency(month.total)}
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t bg-muted/10 p-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-muted-foreground">
                                <th className="pb-2 font-medium">Bail</th>
                                <th className="pb-2 font-medium">Type</th>
                                <th className="pb-2 font-medium">Date</th>
                                <th className="pb-2 font-medium text-right">Montant TTC</th>
                                <th className="pb-2 font-medium">Statut</th>
                                <th className="pb-2 font-medium">Référence</th>
                                <th className="pb-2 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {month.factures
                                .sort((a: any, b: any) => new Date(b.dateFacture).getTime() - new Date(a.dateFacture).getTime())
                                .map((f: any) => (
                                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                    <td className="py-2 font-medium">{bauxMap[f.bailId] || "—"}</td>
                                    <td className="py-2"><Badge variant="outline">{f.type}</Badge></td>
                                    <td className="py-2">{f.dateFacture}</td>
                                    <td className="py-2 text-right font-medium">{formatCurrency(f.montantTTC)}</td>
                                    <td className="py-2">{getStatutBadge(f.statut)}</td>
                                    <td className="py-2 text-muted-foreground">{f.reference || "—"}</td>
                                    <td className="py-2 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => { setEditing(f); setFormOpen(true); }}
                                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setDeleteId(f.id)}
                                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Facture Form Dialog */}
        <FormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          title={editing ? "Modifier la facture" : "Nouvelle facture"}
          onSubmit={handleSubmit}
          loading={creating || updating}
          size="lg"
        >
          <FormGrid cols={2}>
            <FormField name="bailId" label="Bail / Crèche" required defaultValue={editing?.bailId || ""}
              options={activeBaux.map((b: any) => ({ value: b.id, label: b.nom }))}
            />
            <FormField name="type" label="Type" required defaultValue={editing?.type || ""}
              options={[
                { value: "Loyer", label: "Loyer" },
                { value: "Charges", label: "Charges" },
                { value: "Taxe Foncière", label: "Taxe Foncière" },
                { value: "Régulation Charges", label: "Régulation Charges" },
                { value: "Divers", label: "Divers" },
              ]}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormField name="dateFacture" label="Date facture" type="date" required defaultValue={editing?.dateFacture || ""} />
            <FormField name="dateEcheance" label="Date échéance" type="date" defaultValue={editing?.dateEcheance || ""} />
          </FormGrid>
          <FormGrid cols={3}>
            <FormField name="montantHT" label="Montant HT" type="number" defaultValue={editing?.montantHT || ""} />
            <FormField name="montantTTC" label="Montant TTC" type="number" required defaultValue={editing?.montantTTC || ""} />
            <FormField name="statut" label="Statut" required defaultValue={editing?.statut || "a_payer"}
              options={[
                { value: "a_payer", label: "À payer" },
                { value: "paye", label: "Payé" },
                { value: "en_attente", label: "En attente" },
                { value: "refuse", label: "Refusé" },
              ]}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormField name="reference" label="Référence" defaultValue={editing?.reference || ""} />
            <FormField name="datePaiement" label="Date paiement" type="date" defaultValue={editing?.datePaiement || ""} />
          </FormGrid>
          <FormField name="notes" label="Notes" rows={3} defaultValue={editing?.notes || ""} />
        </FormDialog>

        {/* Delete confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }}
          title="Supprimer cette facture ?"
          loading={deleting}
        />
      </motion.div>
    </AnimatePresence>
  );
}
