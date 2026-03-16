import { useState } from "react";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

interface Travaux { id: string; actifId?: string; sciId?: string; titre: string; description?: string; budget?: string; montantReel?: string; dateDebut?: string; dateFin?: string; statut?: string; prestataire?: string; notes?: string; }
interface Actif { id: string; nom: string; }

const empty: Partial<Travaux> = { titre: "" };

const statutVariant = (s?: string) => s === "termine" ? "success" : s === "en cours" ? "primary" : s === "annule" ? "danger" : "warning";

export default function TravauxPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Travaux>("/api/am/travaux", "Travaux");
  const { data: actifs } = useCrud<Actif>("/api/am/actifs", "Actif");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Travaux | null>(null);
  const [form, setForm] = useState<Partial<Travaux>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const actifMap = Object.fromEntries(actifs.map((a) => [a.id, a.nom]));

  const columns: Column<Travaux>[] = [
    { key: "titre", label: "Titre", sortable: true, render: (r) => <span className="font-medium">{r.titre}</span> },
    { key: "actifId", label: "Actif", sortable: true, render: (r) => r.actifId ? <Badge variant="primary">{actifMap[r.actifId] || "—"}</Badge> : "—", exportValue: (r) => r.actifId ? actifMap[r.actifId] || "" : "" },
    { key: "statut", label: "Statut", sortable: true, render: (r) => r.statut ? <Badge variant={statutVariant(r.statut)}>{r.statut}</Badge> : "—" },
    { key: "budget", label: "Budget", align: "right", sortable: true, render: (r) => r.budget ? formatCurrency(r.budget) : "—" },
    { key: "montantReel", label: "Reel", align: "right", sortable: true, render: (r) => r.montantReel ? formatCurrency(r.montantReel) : "—" },
    { key: "prestataire", label: "Prestataire", sortable: true },
    { key: "actions", label: "", align: "right", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); setForm(r); setDialogOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (editing) { await update({ ...form, id: editing.id } as any); } else { await create(form); } setDialogOpen(false); };

  return (
    <div className="space-y-6">
      <PageHeader title="Travaux" description="Travaux sur les actifs" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25">
          <Plus className="h-4 w-4" /> Nouveaux travaux
        </motion.button>
      } />
      <DataTable data={data} columns={columns} searchKeys={["titre", "prestataire"]} searchPlaceholder="Rechercher..." emptyMessage="Aucun travaux" exportFileName="travaux" />
      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier les travaux" : "Nouveaux travaux"} onSubmit={handleSubmit} loading={creating || updating} size="lg">
        <FormGrid>
          <FormField label="Titre" name="titre" value={form.titre} onChange={onChange} required />
          <FormField label="Actif" name="actifId" value={form.actifId} onChange={onChange} options={actifs.map((a) => ({ value: a.id, label: a.nom }))} />
          <FormField label="Statut" name="statut" value={form.statut} onChange={onChange} options={[
            { value: "planifie", label: "Planifie" }, { value: "en cours", label: "En cours" }, { value: "termine", label: "Termine" }, { value: "annule", label: "Annule" },
          ]} />
          <FormField label="Prestataire" name="prestataire" value={form.prestataire} onChange={onChange} />
          <FormField label="Budget" name="budget" value={form.budget} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Montant reel" name="montantReel" value={form.montantReel} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Date debut" name="dateDebut" value={form.dateDebut} onChange={onChange} type="date" />
          <FormField label="Date fin" name="dateFin" value={form.dateFin} onChange={onChange} type="date" />
        </FormGrid>
        <FormField label="Description" name="description" value={form.description} onChange={onChange} rows={3} className="mt-4" />
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={2} className="mt-4" />
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}
