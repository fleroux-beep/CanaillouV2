import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { GlassCard } from "../../components/ui/glass-card";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../lib/utils";
import { apiRequest } from "../../lib/queryClient";
import { Plus, Pencil, Trash2, Calculator, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { InfoTooltip } from "../../components/ui/info-tooltip";

interface Indice { id: string; type: string; trimestre: string; valeur: string; }
interface BailGL { id: string; nom: string; indiceReference?: string; trimestreRef?: string; valeurIndiceBase?: string; loyerBaseHT?: string; loyerHTActu?: string; forceManual?: boolean; archived?: boolean; }
const empty: Partial<Indice> = { type: "", trimestre: "", valeur: "" };

export default function IndicesPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Indice>("/api/gl/indices", "Indice");
  const { data: baux = [] } = useQuery<BailGL[]>({ queryKey: ["/api/gl/baux"], queryFn: () => apiRequest("/api/gl/baux") });
  const queryClient = useQueryClient();

  const updateBail = useMutation({
    mutationFn: (payload: { id: string; loyerHTActu: string }) =>
      apiRequest(`/api/gl/baux/${payload.id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/baux"] }),
  });

  // Build index lookup: type -> latest value + all values by trimestre
  const indexLookup = useMemo(() => {
    const lookup: Record<string, { latest: number; latestTrimestre: string; byTrimestre: Record<string, number> }> = {};
    for (const idx of data) {
      if (!lookup[idx.type]) lookup[idx.type] = { latest: 0, latestTrimestre: "", byTrimestre: {} };
      lookup[idx.type].byTrimestre[idx.trimestre] = Number(idx.valeur);
    }
    // Determine latest by sorting trimestre strings
    for (const [type, info] of Object.entries(lookup)) {
      const sorted = Object.entries(info.byTrimestre).sort(([a], [b]) => b.localeCompare(a));
      if (sorted.length > 0) {
        info.latest = sorted[0][1];
        info.latestTrimestre = sorted[0][0];
      }
    }
    return lookup;
  }, [data]);

  // Calculate indexation simulation for each bail
  const indexationSimulation = useMemo(() => {
    const bauxActifs = baux.filter((b) => !b.archived);
    return bauxActifs
      .filter((b) => b.indiceReference && b.valeurIndiceBase && b.loyerBaseHT && !b.forceManual)
      .map((b) => {
        const idx = indexLookup[b.indiceReference!];
        const baseValue = Number(b.valeurIndiceBase);
        const loyerBase = Number(b.loyerBaseHT);
        const currentLoyer = Number(b.loyerHTActu || b.loyerBaseHT || 0);

        if (!idx || baseValue <= 0 || loyerBase <= 0) return null;

        const newLoyer = loyerBase * (idx.latest / baseValue);
        const variation = ((idx.latest / baseValue) - 1) * 100;
        const needsUpdate = Math.abs(newLoyer - currentLoyer) > 0.01;

        return {
          id: b.id,
          nom: b.nom,
          indice: b.indiceReference!,
          trimestreRef: b.trimestreRef || "—",
          valeurBase: baseValue,
          valeurActuelle: idx.latest,
          trimestreActuel: idx.latestTrimestre,
          loyerBase,
          currentLoyer,
          newLoyer,
          variation,
          needsUpdate,
        };
      })
      .filter(Boolean) as Array<{
        id: string; nom: string; indice: string; trimestreRef: string;
        valeurBase: number; valeurActuelle: number; trimestreActuel: string;
        loyerBase: number; currentLoyer: number; newLoyer: number; variation: number; needsUpdate: boolean;
      }>;
  }, [baux, indexLookup]);

  const applyIndexation = async (bailId: string, newLoyer: number) => {
    await updateBail.mutateAsync({ id: bailId, loyerHTActu: newLoyer.toFixed(2) });
  };

  const applyAllIndexations = async () => {
    const toUpdate = indexationSimulation.filter((s) => s.needsUpdate);
    for (const s of toUpdate) {
      await updateBail.mutateAsync({ id: s.id, loyerHTActu: s.newLoyer.toFixed(2) });
    }
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Indice | null>(null);
  const [form, setForm] = useState<Partial<Indice>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: Column<Indice>[] = [
    { key: "type", label: <InfoTooltip metricKey="indexation">Type</InfoTooltip>, exportLabel: "Type", sortable: true, render: (r) => <Badge variant="primary">{r.type}</Badge> },
    { key: "trimestre", label: "Trimestre", sortable: true, render: (r) => <span className="font-medium">{r.trimestre}</span> },
    { key: "valeur", label: "Valeur", align: "right", sortable: true, render: (r) => <span className="font-mono font-medium">{r.valeur}</span> },
    { key: "actions", label: "", align: "right", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); setForm(r); setDialogOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (editing) { await update({ ...form, id: editing.id } as Indice); } else { await create(form); } setDialogOpen(false); };

  return (
    <div className="space-y-6">
      <PageHeader title="Indices" description="ILC, IRL, ILAT, ICC" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
          <Plus className="h-4 w-4" /> Nouvel indice
        </motion.button>
      } />
      <DataTable data={data} columns={columns} searchKeys={["type", "trimestre"]} searchPlaceholder="Rechercher..." emptyMessage="Aucun indice" exportFileName="indices" />
      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier l'indice" : "Nouvel indice"} onSubmit={handleSubmit} loading={creating || updating}>
        <FormGrid cols={3}>
          <FormField label="Type" name="type" value={form.type} onChange={onChange} required options={[
            { value: "ILC", label: "ILC" }, { value: "IRL", label: "IRL" }, { value: "ILAT", label: "ILAT" }, { value: "ICC", label: "ICC" },
          ]} />
          <FormField label="Trimestre" name="trimestre" value={form.trimestre} onChange={onChange} required placeholder="Ex: T1 2025" />
          <FormField label="Valeur" name="valeur" value={form.valeur} onChange={onChange} required type="number" />
        </FormGrid>
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />

      {/* Indexation automatique */}
      {indexationSimulation.length > 0 && (
        <Section title="Indexation automatique" description="Simulation de révision des loyers basée sur les derniers indices connus">
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <span className="font-semibold">{indexationSimulation.filter((s) => s.needsUpdate).length} bail(s) à mettre à jour</span>
              </div>
              {indexationSimulation.some((s) => s.needsUpdate) && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={applyAllIndexations}
                  disabled={updateBail.isPending}
                  className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${updateBail.isPending ? "animate-spin" : ""}`} />
                  Appliquer toutes
                </motion.button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Bail</th>
                    <th className="pb-2 font-medium">Indice</th>
                    <th className="pb-2 font-medium">Trim. réf.</th>
                    <th className="pb-2 font-medium text-right">Base</th>
                    <th className="pb-2 font-medium text-right">Actuel ({indexationSimulation[0]?.trimestreActuel})</th>
                    <th className="pb-2 font-medium text-right">Loyer actuel</th>
                    <th className="pb-2 font-medium text-right">Nouveau loyer</th>
                    <th className="pb-2 font-medium text-right">Variation</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {indexationSimulation.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 font-medium">{s.nom}</td>
                      <td className="py-3"><Badge variant="primary">{s.indice}</Badge></td>
                      <td className="py-3 text-muted-foreground">{s.trimestreRef}</td>
                      <td className="py-3 text-right font-mono">{s.valeurBase.toFixed(2)}</td>
                      <td className="py-3 text-right font-mono">{s.valeurActuelle.toFixed(2)}</td>
                      <td className="py-3 text-right font-mono">{formatCurrency(s.currentLoyer)}</td>
                      <td className="py-3 text-right font-mono font-semibold">{formatCurrency(s.newLoyer)}</td>
                      <td className="py-3 text-right">
                        <Badge variant={s.variation >= 0 ? "success" : "danger"}>
                          {s.variation >= 0 ? "+" : ""}{s.variation.toFixed(2)}%
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        {s.needsUpdate && (
                          <button
                            onClick={() => applyIndexation(s.id, s.newLoyer)}
                            disabled={updateBail.isPending}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                          >
                            Appliquer
                          </button>
                        )}
                        {!s.needsUpdate && (
                          <span className="text-xs text-muted-foreground">À jour</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </Section>
      )}
    </div>
  );
}
