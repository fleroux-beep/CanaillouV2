import { useState } from "react";
import { useLocation } from "wouter";

const DEFAULT_TVA_RATE = 20; // Taux TVA par défaut en France (%)
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
import { InfoTooltip } from "../../components/ui/info-tooltip";
import type { BailGL as Bail, Bailleur } from "../../types";

const empty: Partial<Bail> = { nom: "" };

export default function BauxGLPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Bail>("/api/gl/baux", "Bail");
  const { data: bailleurs } = useCrud<Bailleur>("/api/gl/bailleurs", "Bailleur");
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bail | null>(null);
  const [form, setForm] = useState<Partial<Bail>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const bailleurMap = Object.fromEntries(bailleurs.map((b) => [b.id, b.nom]));

  const columns: Column<Bail>[] = [
    { key: "nom", label: "Site", sortable: true, render: (r) => <span className="font-medium">{r.nom}</span> },
    { key: "ville", label: "Ville", sortable: true, render: (r) => r.ville ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{r.ville}</span> : "—" },
    { key: "bailleurId", label: "Bailleur", sortable: true, render: (r) => r.bailleurId ? bailleurMap[r.bailleurId] || "—" : "—", exportValue: (r) => r.bailleurId ? bailleurMap[r.bailleurId] || "" : "" },
    { key: "loyerBaseHT", label: <InfoTooltip metricKey="loyerHT">Loyer HT</InfoTooltip>, exportLabel: "Loyer HT", align: "right", sortable: true, render: (r) => (r.loyerHTActu || r.loyerBaseHT) ? formatCurrency(r.loyerHTActu || r.loyerBaseHT) : "—" },
    { key: "loyerTTC", label: <InfoTooltip metricKey="loyerTTC">Loyer TTC</InfoTooltip>, exportLabel: "Loyer TTC", align: "right", sortable: true, render: (r) => {
      const ht = Number(r.loyerHTActu || r.loyerBaseHT || 0);
      if (ht <= 0) return "—";
      const tva = Number(r.tvaTaux || DEFAULT_TVA_RATE);
      if (r.taxe === "TVA") {
        return formatCurrency(ht * (1 + tva / 100));
      }
      if (r.taxe === "CRL") {
        const crl = ht * 0.025;
        return <span>{formatCurrency(ht)} <span className="text-xs text-muted-foreground">(+{formatCurrency(crl)} CRL)</span></span>;
      }
      return formatCurrency(ht);
    }},
    { key: "taxe", label: "Régime fiscal", render: (r) => {
      if (r.taxe === "TVA") return <Badge variant="primary">TVA {r.tvaTaux || DEFAULT_TVA_RATE}%</Badge>;
      if (r.taxe === "CRL") return <Badge variant="warning">CRL 2,5%</Badge>;
      return "—";
    }},
    { key: "surface", label: <InfoTooltip metricKey="surface">Surface</InfoTooltip>, exportLabel: "Surface", align: "right", render: (r) => r.surface ? `${r.surface} m²` : "—" },
    { key: "capacite", label: "Berceaux", align: "right", sortable: true },
    { key: "indiceReference", label: "Indice", render: (r) => r.indiceReference ? <Badge variant="primary">{r.indiceReference}</Badge> : "—" },
    { key: "typeBail", label: "Type", render: (r) => r.typeBail ? <Badge>{r.typeBail}</Badge> : "—" },
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
      <PageHeader title="Baux" description="Baux commerciaux en gestion locative" actions={
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
          <Plus className="h-4 w-4" /> Nouveau bail
        </motion.button>
      } />
      <DataTable data={data.filter((b) => !b.archived)} columns={columns} searchKeys={["nom", "ville", "adresse"]}
        searchPlaceholder="Rechercher un bail..." emptyMessage="Aucun bail"
        onRowClick={(r) => navigate(`/gestion-locative/baux/${r.id}`)} exportFileName="baux-gl" />
      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? `Modifier ${editing.nom}` : "Nouveau bail"} onSubmit={handleSubmit} loading={creating || updating} size="xl">
        <FormGrid>
          <FormField label="Nom / Site" name="nom" value={form.nom} onChange={onChange} required />
          <FormField label="Bailleur" name="bailleurId" value={form.bailleurId} onChange={onChange} options={bailleurs.map((b) => ({ value: b.id, label: b.nom }))} />
          <FormField label="Type bail" name="typeBail" value={form.typeBail} onChange={onChange} options={[
            { value: "commercial", label: "Commercial" }, { value: "professionnel", label: "Professionnel" },
            { value: "habitation", label: "Habitation" }, { value: "derogatoire", label: "Derogatoire" },
          ]} />
          <FormField label="Date signature" name="dateSignature" value={form.dateSignature} onChange={onChange} type="date" />
        </FormGrid>
        <FormField label="Adresse" name="adresse" value={form.adresse} onChange={onChange} className="mt-4" />
        <FormGrid>
          <FormField label="Ville" name="ville" value={form.ville} onChange={onChange} />
          <FormField label="Code postal" name="codePostal" value={form.codePostal} onChange={onChange} />
          <FormField label="Surface" name="surface" value={form.surface} onChange={onChange} type="number" suffix="m²" />
          <FormField label="Capacité (berceaux)" name="capacite" value={form.capacite} onChange={onChange} type="number" />
        </FormGrid>
        <h3 className="mt-5 mb-3 text-sm font-semibold text-muted-foreground uppercase">Loyer & Charges</h3>
        <FormGrid cols={4}>
          <FormField label="Loyer base HT" name="loyerBaseHT" value={form.loyerBaseHT} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Charges" name="charges" value={form.charges} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Dépôt garantie" name="depotGarantie" value={form.depotGarantie} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Taxe foncière" name="taxeFonciere" value={form.taxeFonciere} onChange={onChange} type="number" suffix="EUR" />
        </FormGrid>
        <FormGrid cols={2}>
          <FormField label="Régime fiscal" name="taxe" value={form.taxe} onChange={onChange} options={[
            { value: "TVA", label: "TVA" }, { value: "CRL", label: "CRL (Contribution sur les Revenus Locatifs)" },
          ]} />
          {form.taxe === "TVA" && (
            <FormField label="Taux TVA" name="tvaTaux" value={form.tvaTaux} onChange={onChange} type="number" suffix="%" />
          )}
        </FormGrid>
        <h3 className="mt-5 mb-3 text-sm font-semibold text-muted-foreground uppercase">Indexation</h3>
        <FormGrid cols={4}>
          <FormField label="Indice de référence" name="indiceReference" value={form.indiceReference} onChange={onChange} options={[
            { value: "ILC", label: "ILC" }, { value: "IRL", label: "IRL" }, { value: "ILAT", label: "ILAT" }, { value: "ICC", label: "ICC" },
          ]} />
          <FormField label="Trimestre ref." name="trimestreRef" value={form.trimestreRef} onChange={onChange} placeholder="Ex: T1 2024" />
          <FormField label="Valeur indice base" name="valeurIndiceBase" value={form.valeurIndiceBase} onChange={onChange} type="number" placeholder="Ex: 132.63" />
          <FormField label="Date effet" name="dateEffet" value={form.dateEffet} onChange={onChange} type="date" />
        </FormGrid>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}
