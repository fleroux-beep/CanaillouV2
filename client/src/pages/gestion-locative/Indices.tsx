import { useState } from "react";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

interface Indice { id: string; type: string; trimestre: string; valeur: string; }
const empty: Partial<Indice> = { type: "", trimestre: "", valeur: "" };

export default function IndicesPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Indice>("/api/gl/indices", "Indice");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Indice | null>(null);
  const [form, setForm] = useState<Partial<Indice>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: Column<Indice>[] = [
    { key: "type", label: "Type", sortable: true, render: (r) => <Badge variant="primary">{r.type}</Badge> },
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
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (editing) { await update({ ...form, id: editing.id } as any); } else { await create(form); } setDialogOpen(false); };

  return (
    <div className="space-y-6">
      <PageHeader title="Indices" description="ILC, IRL, ILAT, ICC" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25">
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
    </div>
  );
}
