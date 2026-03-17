import { useState } from "react";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

interface Locataire { id: string; nom: string; prenom?: string; email?: string; telephone?: string; adresse?: string; siret?: string; notes?: string; }
const empty: Partial<Locataire> = { nom: "" };

export default function LocatairesAMPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Locataire>("/api/am/locataires", "Locataire");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Locataire | null>(null);
  const [form, setForm] = useState<Partial<Locataire>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: Column<Locataire>[] = [
    { key: "nom", label: "Nom", sortable: true, render: (r) => <span className="font-medium">{r.nom} {r.prenom || ""}</span> },
    { key: "email", label: "Email", sortable: true },
    { key: "telephone", label: "Telephone" },
    { key: "siret", label: "SIRET" },
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
      <PageHeader title="Locataires" description="Locataires des biens AM" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
          <Plus className="h-4 w-4" /> Nouveau locataire
        </motion.button>
      } />
      <DataTable data={data} columns={columns} searchKeys={["nom", "prenom", "email", "siret"]} searchPlaceholder="Rechercher..." emptyMessage="Aucun locataire" exportFileName="locataires-am" />
      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier le locataire" : "Nouveau locataire"} onSubmit={handleSubmit} loading={creating || updating}>
        <FormGrid>
          <FormField label="Nom" name="nom" value={form.nom} onChange={onChange} required />
          <FormField label="Prenom" name="prenom" value={form.prenom} onChange={onChange} />
          <FormField label="Email" name="email" value={form.email} onChange={onChange} type="email" />
          <FormField label="Telephone" name="telephone" value={form.telephone} onChange={onChange} />
          <FormField label="SIRET" name="siret" value={form.siret} onChange={onChange} />
        </FormGrid>
        <FormField label="Adresse" name="adresse" value={form.adresse} onChange={onChange} className="mt-4" />
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}
