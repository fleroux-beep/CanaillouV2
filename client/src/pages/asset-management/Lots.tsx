import { useState } from "react";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { formatCurrency, formatNumber } from "../../lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { getBailLoyer, isResilie } from "@shared/utils/bail";

interface Lot { id: string; actifId: string; designation: string; type?: string; etage?: string; surface?: string; statut?: string; notes?: string; archived?: boolean; }
interface Actif { id: string; nom: string; }
interface BailLite { id: string; lotId?: string; loyerBaseHT?: string; loyerHTActu?: string; statut?: string; archived?: boolean; }

const emptyLot: Partial<Lot> = { designation: "" };

export default function LotsPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Lot>("/api/am/lots", "Lot");
  const { data: actifs } = useCrud<Actif>("/api/am/actifs", "Actif");
  const { data: baux } = useCrud<BailLite>("/api/am/baux", "Bail");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lot | null>(null);
  const [form, setForm] = useState<Partial<Lot>>(emptyLot);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const actifMap = Object.fromEntries(actifs.map((a) => [a.id, a.nom]));

  // Le loyer vit uniquement sur le bail — on affiche ici le loyer HT/mois
  // du premier bail actif rattaché au lot (si présent).
  const getLoyerMensuelLot = (lotId: string): number => {
    const bail = baux.find(
      (b) => b.lotId === lotId && !b.archived && !isResilie(b.statut),
    );
    if (!bail) return 0;
    const annuel = getBailLoyer(bail);
    return annuel > 0 ? Math.round((annuel / 12) * 100) / 100 : 0;
  };

  const columns: Column<Lot>[] = [
    { key: "designation", label: "Désignation", sortable: true, render: (r) => <span className="font-medium">{r.designation}</span> },
    { key: "actifId", label: "Actif", sortable: true, render: (r) => r.actifId ? <Badge variant="primary">{actifMap[r.actifId] || "—"}</Badge> : "—", exportValue: (r) => r.actifId ? actifMap[r.actifId] || "" : "" },
    { key: "type", label: "Type", sortable: true, render: (r) => r.type ? <Badge>{r.type}</Badge> : "—" },
    { key: "etage", label: "Étage", sortable: true },
    { key: "surface", label: <InfoTooltip metricKey="surface">Surface</InfoTooltip>, exportLabel: "Surface", align: "right", sortable: true, render: (r) => r.surface ? `${formatNumber(r.surface)} m²` : "—" },
    { key: "statut", label: "Statut", sortable: true, render: (r) => (
      <Badge variant={r.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue" ? "success" : r.statut === "vacant" ? "warning" : "default"}>
        {r.statut || "—"}
      </Badge>
    )},
    {
      key: "loyerMensuel",
      label: <InfoTooltip metricKey="mensualite">Loyer/mois</InfoTooltip>,
      exportLabel: "Loyer/mois (bail)",
      align: "right",
      sortable: true,
      render: (r) => {
        const m = getLoyerMensuelLot(r.id);
        return m > 0 ? formatCurrency(m) : "—";
      },
      exportValue: (r) => {
        const m = getLoyerMensuelLot(r.id);
        return m > 0 ? String(m) : "";
      },
    },
    { key: "actions", label: "", align: "right", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  const openCreate = () => { setEditing(null); setForm(emptyLot); setDialogOpen(true); };
  const openEdit = (l: Lot) => { setEditing(l); setForm(l); setDialogOpen(true); };
  const onChange = (name: string, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { await update({ ...form, id: editing.id } as Lot); }
    else { await create(form); }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Lots" description="Unite locatives des actifs" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={openCreate}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
          <Plus className="h-4 w-4" /> Nouveau lot
        </motion.button>
      } />

      <DataTable data={data.filter((l) => !l.archived)} columns={columns}
        searchKeys={["designation", "type", "etage"]} searchPlaceholder="Rechercher un lot..."
        emptyMessage="Aucun lot enregistré" exportFileName="lots" />

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? `Modifier ${editing.designation}` : "Nouveau lot"} onSubmit={handleSubmit} loading={creating || updating} size="lg">
        <FormGrid>
          <FormField label="Désignation" name="designation" value={form.designation} onChange={onChange} required />
          <FormField label="Actif" name="actifId" value={form.actifId} onChange={onChange} required options={actifs.map((a) => ({ value: a.id, label: a.nom }))} />
          <FormField label="Type" name="type" value={form.type} onChange={onChange} options={[
            { value: "commercial", label: "Commercial" }, { value: "bureau", label: "Bureau" },
            { value: "habitation", label: "Habitation" }, { value: "parking", label: "Parking" }, { value: "cave", label: "Cave" },
            { value: "creche", label: "Crèche" },
          ]} />
          <FormField label="Étage" name="etage" value={form.etage} onChange={onChange} />
          <FormField label="Surface" name="surface" value={form.surface} onChange={onChange} type="number" suffix="m²" />
          <FormField label="Statut" name="statut" value={form.statut} onChange={onChange} options={[
            { value: "loué", label: "Loué" }, { value: "vacant", label: "Vacant" },
          ]} />
        </FormGrid>
        <p className="mt-3 text-xs text-muted-foreground">
          Le loyer est désormais géré uniquement côté bail (indexation INSEE
          automatique). Pour modifier un loyer, ouvrez le bail associé au lot.
        </p>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}
