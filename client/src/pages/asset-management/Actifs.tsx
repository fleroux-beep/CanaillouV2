import { useState } from "react";
import { useLocation } from "wouter";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../lib/utils";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { motion } from "framer-motion";

interface Actif {
  id: string;
  nom: string;
  sciId?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  type?: string;
  surface?: string;
  surfaceCarrez?: string;
  anneeConstruction?: number;
  dpe?: string;
  prixAcquisition?: string;
  fraisNotaire?: string;
  fraisAgence?: string;
  montantTravaux?: string;
  dateAcquisition?: string;
  chargesAnnuelles?: string;
  taxeFonciere?: string;
  assurancePno?: string;
  tauxCapitalisation?: string;
  prixM2Marche?: string;
  syndic?: string;
  notes?: string;
  archived?: boolean;
}

interface SCI { id: string; nom: string; }

const emptyActif: Partial<Actif> = { nom: "" };

export default function ActifsPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Actif>("/api/am/actifs", "Actif");
  const { data: scis } = useCrud<SCI>("/api/am/scis", "SCI");
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Actif | null>(null);
  const [form, setForm] = useState<Partial<Actif>>(emptyActif);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));

  const columns: Column<Actif>[] = [
    { key: "nom", label: "Nom", sortable: true, render: (r) => <span className="font-medium">{r.nom}</span> },
    { key: "sciId", label: "SCI", sortable: true, render: (r) => r.sciId ? <Badge variant="primary">{sciMap[r.sciId] || "—"}</Badge> : "—", exportValue: (r) => r.sciId ? sciMap[r.sciId] || "" : "" },
    { key: "ville", label: "Ville", sortable: true, render: (r) => r.ville ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{r.ville}</span> : "—" },
    { key: "type", label: "Type", sortable: true, render: (r) => r.type ? <Badge>{r.type}</Badge> : "—" },
    { key: "surface", label: "Surface", align: "right", sortable: true, render: (r) => r.surface ? `${r.surface} m²` : "—" },
    { key: "prixAcquisition", label: "Prix acq.", align: "right", sortable: true, render: (r) => r.prixAcquisition ? formatCurrency(r.prixAcquisition) : "—" },
    {
      key: "actions", label: "", align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];

  const openCreate = () => { setEditing(null); setForm(emptyActif); setDialogOpen(true); };
  const openEdit = (a: Actif) => { setEditing(a); setForm(a); setDialogOpen(true); };
  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { await update({ ...form, id: editing.id } as any); }
    else { await create(form); }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actifs"
        description="Biens immobiliers du portefeuille"
        actions={
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={openCreate}
            className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
            <Plus className="h-4 w-4" /> Nouvel actif
          </motion.button>
        }
      />

      <DataTable
        data={data.filter((a) => !a.archived)}
        columns={columns}
        searchKeys={["nom", "ville", "type", "adresse"]}
        searchPlaceholder="Rechercher un actif..."
        emptyMessage="Aucun actif enregistré"
        onRowClick={(r) => navigate(`/asset-management/actifs/${r.id}`)}
      />

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? `Modifier ${editing.nom}` : "Nouvel actif"} onSubmit={handleSubmit} loading={creating || updating} size="xl">
        <FormGrid>
          <FormField label="Nom" name="nom" value={form.nom} onChange={onChange} required />
          <FormField label="SCI" name="sciId" value={form.sciId} onChange={onChange} options={scis.map((s) => ({ value: s.id, label: s.nom }))} />
          <FormField label="Type" name="type" value={form.type} onChange={onChange} options={[
            { value: "residentiel", label: "Residentiel" }, { value: "commercial", label: "Commercial" },
            { value: "bureau", label: "Bureau" }, { value: "mixte", label: "Mixte" },
          ]} />
          <FormField label="Date acquisition" name="dateAcquisition" value={form.dateAcquisition} onChange={onChange} type="date" />
        </FormGrid>
        <FormField label="Adresse" name="adresse" value={form.adresse} onChange={onChange} className="mt-4" />
        <FormGrid>
          <FormField label="Ville" name="ville" value={form.ville} onChange={onChange} />
          <FormField label="Code postal" name="codePostal" value={form.codePostal} onChange={onChange} />
          <FormField label="Surface" name="surface" value={form.surface} onChange={onChange} type="number" suffix="m²" />
          <FormField label="Surface Carrez" name="surfaceCarrez" value={form.surfaceCarrez} onChange={onChange} type="number" suffix="m²" />
        </FormGrid>
        <h3 className="mt-5 mb-3 text-sm font-semibold text-muted-foreground uppercase">Acquisition</h3>
        <FormGrid cols={4}>
          <FormField label="Prix acquisition" name="prixAcquisition" value={form.prixAcquisition} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Frais notaire" name="fraisNotaire" value={form.fraisNotaire} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Frais agence" name="fraisAgence" value={form.fraisAgence} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Travaux" name="montantTravaux" value={form.montantTravaux} onChange={onChange} type="number" suffix="EUR" />
        </FormGrid>
        <h3 className="mt-5 mb-3 text-sm font-semibold text-muted-foreground uppercase">Charges annuelles</h3>
        <FormGrid cols={3}>
          <FormField label="Charges annuelles" name="chargesAnnuelles" value={form.chargesAnnuelles} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Taxe foncière" name="taxeFonciere" value={form.taxeFonciere} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Assurance PNO" name="assurancePno" value={form.assurancePno} onChange={onChange} type="number" suffix="EUR" />
        </FormGrid>
        <h3 className="mt-5 mb-3 text-sm font-semibold text-muted-foreground uppercase">Valorisation</h3>
        <FormGrid cols={3}>
          <FormField label="Taux capitalisation" name="tauxCapitalisation" value={form.tauxCapitalisation} onChange={onChange} type="number" suffix="%" />
          <FormField label="Prix/m² marche" name="prixM2Marche" value={form.prixM2Marche} onChange={onChange} type="number" suffix="EUR/m²" />
          <FormField label="DPE" name="dpe" value={form.dpe} onChange={onChange} options={["A","B","C","D","E","F","G"].map((v) => ({ value: v, label: v }))} />
        </FormGrid>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}
