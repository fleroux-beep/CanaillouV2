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

interface BailAM {
  id: string;
  lotId?: string;
  actifId?: string;
  sciId?: string;
  locataireId?: string;
  typeBail?: string;
  dateDebut?: string;
  dateFin?: string;
  dateSignature?: string;
  loyerMensuel?: string;
  loyerAnnuel?: string;
  charges?: string;
  depotGarantie?: string;
  indiceReference?: string;
  trimestreRef?: string;
  valeurIndiceBase?: string;
  statut?: string;
  loyerTheorique?: string;
  notes?: string;
}

const emptyBail: Partial<BailAM> = {};

export default function BauxAMPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<BailAM>("/api/am/baux", "Bail");
  const { data: actifs } = useCrud<{ id: string; nom?: string }>("/api/am/actifs", "Actif");
  const { data: lots } = useCrud<{ id: string; nom?: string }>("/api/am/lots", "Lot");
  const { data: locataires } = useCrud<{ id: string; nom?: string }>("/api/am/locataires", "Locataire");
  const { data: scis } = useCrud<{ id: string; nom?: string }>("/api/am/scis", "SCI");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BailAM | null>(null);
  const [form, setForm] = useState<Partial<BailAM>>(emptyBail);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const getLocataireName = (id?: string) => locataires.find((l) => l.id === id)?.nom ?? "—";
  const getActifName = (id?: string) => actifs.find((a) => a.id === id)?.nom ?? "—";

  const columns: Column<BailAM>[] = [
    { key: "locataireId", label: "Locataire", sortable: true, render: (r) => <span className="font-medium">{getLocataireName(r.locataireId)}</span> },
    { key: "actifId", label: "Actif", sortable: true, render: (r) => getActifName(r.actifId) },
    { key: "typeBail", label: "Type", sortable: true, render: (r) => r.typeBail ? <Badge variant="primary">{r.typeBail}</Badge> : "—" },
    { key: "loyerMensuel", label: "Loyer mensuel", align: "right", sortable: true, render: (r) => r.loyerMensuel ? formatCurrency(r.loyerMensuel) : "—" },
    { key: "loyerAnnuel", label: "Loyer annuel", align: "right", sortable: true, render: (r) => r.loyerAnnuel ? formatCurrency(r.loyerAnnuel) : "—" },
    {
      key: "statut", label: "Statut", sortable: true,
      render: (r) => {
        if (!r.statut) return "—";
        const variant = r.statut === "actif" ? "success" : r.statut === "expiré" ? "warning" : r.statut === "résilié" ? "danger" : "default";
        return <Badge variant={variant}>{r.statut}</Badge>;
      },
    },
    {
      key: "actions", label: "", align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const openCreate = () => { setEditing(null); setForm(emptyBail); setDialogOpen(true); };
  const openEdit = (bail: BailAM) => { setEditing(bail); setForm(bail); setDialogOpen(true); };
  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await update({ ...form, id: editing.id } as any);
    } else {
      await create(form);
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Baux"
        description="Gestion des baux immobiliers"
        actions={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25"
          >
            <Plus className="h-4 w-4" /> Nouveau bail
          </motion.button>
        }
      />

      <DataTable
        data={data}
        columns={columns}
        searchKeys={["typeBail", "statut"]}
        searchPlaceholder="Rechercher un bail..."
        emptyMessage="Aucun bail enregistré"
      />

      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Modifier le bail" : "Nouveau bail"}
        onSubmit={handleSubmit}
        loading={creating || updating}
        size="lg"
      >
        <FormGrid>
          <FormField label="Lot" name="lotId" value={form.lotId} onChange={onChange} options={lots.map((l) => ({ value: l.id, label: l.nom || l.id }))} />
          <FormField label="Actif" name="actifId" value={form.actifId} onChange={onChange} options={actifs.map((a) => ({ value: a.id, label: a.nom || a.id }))} />
          <FormField label="SCI" name="sciId" value={form.sciId} onChange={onChange} options={scis.map((s) => ({ value: s.id, label: s.nom || s.id }))} />
          <FormField label="Locataire" name="locataireId" value={form.locataireId} onChange={onChange} options={locataires.map((l) => ({ value: l.id, label: l.nom || l.id }))} />
          <FormField label="Type de bail" name="typeBail" value={form.typeBail} onChange={onChange} options={[
            { value: "habitation", label: "Habitation" },
            { value: "commercial", label: "Commercial" },
            { value: "professionnel", label: "Professionnel" },
          ]} />
          <FormField label="Date début" name="dateDebut" value={form.dateDebut} onChange={onChange} type="date" />
          <FormField label="Date fin" name="dateFin" value={form.dateFin} onChange={onChange} type="date" />
          <FormField label="Date signature" name="dateSignature" value={form.dateSignature} onChange={onChange} type="date" />
          <FormField label="Loyer mensuel" name="loyerMensuel" value={form.loyerMensuel} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Loyer annuel" name="loyerAnnuel" value={form.loyerAnnuel} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Charges" name="charges" value={form.charges} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Dépôt de garantie" name="depotGarantie" value={form.depotGarantie} onChange={onChange} type="number" suffix="EUR" />
        </FormGrid>
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Indexation</h3>
          <FormGrid>
            <FormField label="Indice de référence" name="indiceReference" value={form.indiceReference} onChange={onChange} options={[
              { value: "IRL", label: "IRL" },
              { value: "ILC", label: "ILC" },
              { value: "ILAT", label: "ILAT" },
              { value: "ICC", label: "ICC" },
            ]} />
            <FormField label="Trimestre de référence" name="trimestreRef" value={form.trimestreRef} onChange={onChange} />
            <FormField label="Valeur indice de base" name="valeurIndiceBase" value={form.valeurIndiceBase} onChange={onChange} type="number" />
          </FormGrid>
        </div>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }}
        loading={deleting}
      />
    </div>
  );
}
