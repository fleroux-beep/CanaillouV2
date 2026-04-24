import { useState, useMemo } from "react";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { PageHeader } from "../../components/ui/page-header";
import { KpiCard } from "../../components/ui/kpi-card";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../lib/utils";
import { Plus, Pencil, Trash2, Landmark, Wallet, Building2, Scale } from "lucide-react";
import { motion } from "framer-motion";

interface SCI {
  id: string;
  nom: string;
  formeJuridique?: string;
  capital?: string;
  regimeFiscal?: string;
  siret?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  dateCreation?: string;
  gerant?: string;
  expertComptable?: string;
  banque?: string;
  iban?: string;
  notes?: string;
}

const emptySci: Partial<SCI> = { nom: "" };

export default function SCIsPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<SCI>("/api/am/scis", "SCI");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SCI | null>(null);
  const [form, setForm] = useState<Partial<SCI>>(emptySci);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: Column<SCI>[] = [
    { key: "nom", label: "Nom", sortable: true, render: (r) => <span className="font-medium">{r.nom}</span> },
    { key: "formeJuridique", label: "Forme", sortable: true, render: (r) => r.formeJuridique ? <Badge variant="primary">{r.formeJuridique}</Badge> : "—" },
    { key: "capital", label: "Capital", align: "right", sortable: true, render: (r) => r.capital ? formatCurrency(r.capital) : "—" },
    { key: "regimeFiscal", label: "Régime", sortable: true },
    { key: "gerant", label: "Gérant", sortable: true },
    { key: "ville", label: "Ville", sortable: true },
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

  const openCreate = () => { setEditing(null); setForm(emptySci); setDialogOpen(true); };
  const openEdit = (sci: SCI) => { setEditing(sci); setForm(sci); setDialogOpen(true); };
  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await update({ ...form, id: editing.id } as SCI);
    } else {
      await create(form);
    }
    setDialogOpen(false);
  };

  const kpis = useMemo(() => {
    const totalCapital = data.reduce((s, sci) => s + (sci.capital ? parseFloat(sci.capital) : 0), 0);
    const nbIS = data.filter((s) => s.regimeFiscal === "IS").length;
    const nbIR = data.filter((s) => s.regimeFiscal === "IR").length;
    return { totalCapital, nbIS, nbIR };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Nombre de SCIs" value={data.length} icon={Building2} variant="primary" gradient delay={0} />
          <KpiCard label="Capital total" value={kpis.totalCapital} formatFn={formatCurrency} icon={Wallet} variant="warning" gradient delay={1} />
          <KpiCard label="Régime IS" value={kpis.nbIS} icon={Landmark} variant="success" gradient delay={2} />
          <KpiCard label="Régime IR" value={kpis.nbIR} icon={Scale} variant="danger" gradient delay={3} />
        </div>
      </div>

      <div className="flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25"
        >
          <Plus className="h-4 w-4" /> Nouvelle SCI
        </motion.button>
      </div>

      <DataTable
        data={data}
        columns={columns}
        searchKeys={["nom", "ville", "gerant", "siret"]}
        searchPlaceholder="Rechercher une SCI..."
        emptyMessage="Aucune SCI enregistrée"
        onRowClick={(r) => openEdit(r)}
      />

      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Modifier ${editing.nom}` : "Nouvelle SCI"}
        onSubmit={handleSubmit}
        loading={creating || updating}
        size="lg"
      >
        <FormGrid>
          <FormField label="Nom" name="nom" value={form.nom} onChange={onChange} required />
          <FormField label="Forme juridique" name="formeJuridique" value={form.formeJuridique} onChange={onChange} options={[
            { value: "SCI", label: "SCI" },
            { value: "SCI IR", label: "SCI IR" },
            { value: "SCI IS", label: "SCI IS" },
            { value: "SARL", label: "SARL" },
            { value: "SAS", label: "SAS" },
          ]} />
          <FormField label="Capital" name="capital" value={form.capital} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Régime fiscal" name="regimeFiscal" value={form.regimeFiscal} onChange={onChange} options={[
            { value: "IR", label: "IR (transparence)" },
            { value: "IS", label: "IS (opaque)" },
          ]} />
          <FormField label="SIRET" name="siret" value={form.siret} onChange={onChange} />
          <FormField label="Date creation" name="dateCreation" value={form.dateCreation} onChange={onChange} type="date" />
          <FormField label="Gérant" name="gerant" value={form.gerant} onChange={onChange} />
          <FormField label="Expert comptable" name="expertComptable" value={form.expertComptable} onChange={onChange} />
          <FormField label="Banque" name="banque" value={form.banque} onChange={onChange} />
          <FormField label="IBAN" name="iban" value={form.iban} onChange={onChange} />
        </FormGrid>
        <FormField label="Adresse" name="adresse" value={form.adresse} onChange={onChange} className="mt-4" />
        <FormGrid cols={2}>
          <FormField label="Ville" name="ville" value={form.ville} onChange={onChange} />
          <FormField label="Code postal" name="codePostal" value={form.codePostal} onChange={onChange} />
        </FormGrid>
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
