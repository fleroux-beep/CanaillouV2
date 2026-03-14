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

interface Paiement { id: string; bailId: string; date: string; montant: string; type: string; methode?: string; reference?: string; notes?: string; }
const empty: Partial<Paiement> = { bailId: "", date: "", montant: "", type: "" };

export default function PaiementsGLPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Paiement>("/api/gl/paiements", "Paiement");
  const { data: baux } = useCrud<{ id: string; nom: string }>("/api/gl/baux", "Bail");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Paiement | null>(null);
  const [form, setForm] = useState<Partial<Paiement>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const bauxMap = Object.fromEntries(baux.map((b) => [b.id, b.nom]));

  const columns: Column<Paiement>[] = [
    { key: "bailId", label: "Bail", sortable: true, render: (r) => <span className="font-medium">{bauxMap[r.bailId] || "—"}</span> },
    { key: "date", label: "Date", sortable: true },
    { key: "montant", label: "Montant", align: "right", sortable: true, render: (r) => formatCurrency(r.montant) },
    { key: "type", label: "Type", sortable: true, render: (r) => <Badge>{r.type}</Badge> },
    { key: "methode", label: "Methode" },
    { key: "reference", label: "Reference" },
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
      <PageHeader title="Paiements" description="Paiements en gestion locative" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25">
          <Plus className="h-4 w-4" /> Nouveau paiement
        </motion.button>
      } />
      <DataTable data={data} columns={columns} searchKeys={["reference", "type"]} searchPlaceholder="Rechercher..." emptyMessage="Aucun paiement" exportFileName="paiements" />
      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier le paiement" : "Nouveau paiement"} onSubmit={handleSubmit} loading={creating || updating}>
        <FormGrid>
          <FormField label="Bail" name="bailId" value={form.bailId} onChange={onChange} required options={baux.map((b) => ({ value: b.id, label: b.nom }))} />
          <FormField label="Date" name="date" value={form.date} onChange={onChange} type="date" required />
          <FormField label="Montant" name="montant" value={form.montant} onChange={onChange} type="number" suffix="EUR" required />
          <FormField label="Type" name="type" value={form.type} onChange={onChange} required options={[
            { value: "loyer", label: "Loyer" }, { value: "charges", label: "Charges" },
            { value: "depot_garantie", label: "Depot de garantie" }, { value: "regularisation", label: "Regularisation" },
            { value: "autre", label: "Autre" },
          ]} />
          <FormField label="Methode" name="methode" value={form.methode} onChange={onChange} options={[
            { value: "virement", label: "Virement" }, { value: "cheque", label: "Cheque" },
            { value: "prelevement", label: "Prelevement" }, { value: "especes", label: "Especes" },
          ]} />
          <FormField label="Reference" name="reference" value={form.reference} onChange={onChange} />
        </FormGrid>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}
