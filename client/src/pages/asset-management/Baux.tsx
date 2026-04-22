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
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { getBailLoyer, isResilie } from "@shared/utils/bail";

interface BailAM {
  id: string;
  nom?: string;
  lotId?: string;
  actifId?: string;
  sciId?: string;
  locataireId?: string;
  typeBail?: string;
  dateDebut?: string;
  dateFin?: string;
  dateSignature?: string;
  // Modèle loyer à trois niveaux (cf. shared/schema.ts `bauxGL`) :
  //  - loyerBaseHT         : valeur de signature (immuable, annuel HT EUR)
  //  - loyerHTActu         : loyer courant après indexation INSEE auto (cache)
  //  - loyerManuelOverride : valeur forcée quand `forceManual === true`.
  // Par défaut `forceManual = false` → la chaîne base → INSEE → actu pilote tout.
  loyerBaseHT?: string;
  loyerHTActu?: string;
  forceManual?: boolean;
  loyerManuelOverride?: string;
  charges?: string;
  depotGarantie?: string;
  indiceReference?: string;
  trimestreRef?: string;
  valeurIndiceBase?: string;
  statut?: string;
  notes?: string;
}

const emptyBail: Partial<BailAM> = {};

const resolveLoyerAnnuel = getBailLoyer;

export default function BauxAMPage() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<BailAM>("/api/am/baux", "Bail");
  const { data: actifs } = useCrud<{ id: string; nom?: string; sciId?: string }>("/api/am/actifs", "Actif");
  const { data: lots } = useCrud<{ id: string; nom?: string; actifId?: string; designation?: string }>("/api/am/lots", "Lot");
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
    {
      key: "loyerHTActu",
      label: <InfoTooltip metricKey="loyerHT">Loyer HT/an</InfoTooltip>,
      exportLabel: "Loyer HT annuel",
      align: "right",
      sortable: true,
      render: (r) => {
        const annuel = resolveLoyerAnnuel(r);
        if (annuel <= 0) return "—";
        if (r.forceManual && Number(r.loyerManuelOverride || 0) > 0) {
          return (
            <span title={`Forcé manuellement — base: ${formatCurrency(r.loyerBaseHT || 0)}`}>
              {formatCurrency(annuel)}
              <span className="ml-1 text-[10px] text-amber-600">M</span>
            </span>
          );
        }
        const indexed = r.loyerHTActu && Number(r.loyerHTActu) !== Number(r.loyerBaseHT || 0);
        return (
          <span title={indexed ? `Base: ${formatCurrency(r.loyerBaseHT || 0)} — indexé auto` : undefined}>
            {formatCurrency(annuel)}
            {indexed ? <span className="ml-1 text-[10px] text-emerald-600">↗</span> : null}
          </span>
        );
      },
    },
    {
      key: "loyerMensuel",
      label: <InfoTooltip metricKey="mensualite">Loyer HT/mois</InfoTooltip>,
      exportLabel: "Loyer HT mensuel",
      align: "right",
      sortable: false,
      render: (r) => {
        const annuel = resolveLoyerAnnuel(r);
        if (annuel <= 0) return "—";
        return formatCurrency(Math.round((annuel / 12) * 100) / 100);
      },
    },
    {
      key: "statut", label: "Statut", sortable: true,
      render: (r) => {
        if (!r.statut) return "—";
        const variant = r.statut === "actif" ? "success" : r.statut === "expiré" ? "warning" : isResilie(r.statut) ? "danger" : "default";
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
  const openEdit = (bail: BailAM) => {
    const f = { ...bail } as any;
    if (f.dateDebut) f.dateDebut = String(f.dateDebut).substring(0, 10);
    if (f.dateFin) f.dateFin = String(f.dateFin).substring(0, 10);
    if (f.dateSignature) f.dateSignature = String(f.dateSignature).substring(0, 10);
    setEditing(bail);
    setForm(f);
    setDialogOpen(true);
  };
  const onChange = (name: string, value: string) => {
    setForm((f) => {
      const updated = { ...f, [name]: value };
      // Cascading: selecting actif → auto-fill SCI
      if (name === "actifId" && value) {
        const actif = actifs.find((a) => a.id === value);
        if (actif?.sciId) updated.sciId = actif.sciId;
      }
      // Cascading: selecting lot → auto-fill actif + SCI
      if (name === "lotId" && value) {
        const lot = lots.find((l) => l.id === value);
        if (lot?.actifId) {
          updated.actifId = lot.actifId;
          const actif = actifs.find((a) => a.id === lot.actifId);
          if (actif?.sciId) updated.sciId = actif.sciId;
        }
      }
      // Confort de saisie : quand l'utilisateur tape un loyer mensuel via
      // le champ virtuel "_loyerBaseMensuel", on stocke en base le loyer
      // annuel HT dans `loyerBaseHT` (le seul champ persisté).
      if (name === "_loyerBaseMensuel" && value) {
        const mensuel = parseFloat(value);
        if (!isNaN(mensuel)) updated.loyerBaseHT = String(Math.round(mensuel * 12 * 100) / 100);
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Retire les champs virtuels (préfixe _) avant l'appel API.
    const payload: any = Object.fromEntries(
      Object.entries(form).filter(([k]) => !k.startsWith("_")),
    );
    if (editing) {
      await update({ ...payload, id: editing.id } as BailAM);
    } else {
      await create(payload);
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
            className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/25"
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
          <FormField label="Actif" name="actifId" value={form.actifId} onChange={onChange} options={actifs.map((a) => ({ value: a.id, label: a.nom || a.id }))} />
          <FormField label="Lot" name="lotId" value={form.lotId} onChange={onChange} options={
            (form.actifId ? lots.filter((l) => l.actifId === form.actifId) : lots)
              .map((l) => ({ value: l.id, label: l.designation || l.nom || l.id }))
          } />
          <FormField label="SCI (auto)" name="sciId" value={form.sciId} onChange={onChange} options={scis.map((s) => ({ value: s.id, label: s.nom || s.id }))} />
          <FormField label="Locataire" name="locataireId" value={form.locataireId} onChange={onChange} options={locataires.map((l) => ({ value: l.id, label: l.nom || l.id }))} />
          <FormField label="Type de bail" name="typeBail" value={form.typeBail} onChange={onChange} options={[
            { value: "habitation", label: "Habitation" },
            { value: "commercial", label: "Commercial" },
            { value: "professionnel", label: "Professionnel" },
            { value: "creche", label: "Crèche" },
          ]} />
          <FormField label="Date début" name="dateDebut" value={form.dateDebut} onChange={onChange} type="date" />
          <FormField label="Date fin" name="dateFin" value={form.dateFin} onChange={onChange} type="date" />
          <FormField label="Date signature" name="dateSignature" value={form.dateSignature} onChange={onChange} type="date" />
          <FormField label="Statut" name="statut" value={form.statut} onChange={onChange} options={[
            { value: "actif", label: "Actif" }, { value: "expiré", label: "Expiré" }, { value: "résilié", label: "Résilié" },
          ]} />
          <FormField
            label="Loyer HT annuel (base)"
            name="loyerBaseHT"
            value={form.loyerBaseHT}
            onChange={onChange}
            type="number"
            suffix="EUR"
          />
          <FormField
            label="Loyer HT mensuel (auto)"
            name="_loyerBaseMensuel"
            value={form.loyerBaseHT ? String(Math.round((Number(form.loyerBaseHT) / 12) * 100) / 100) : ""}
            onChange={onChange}
            type="number"
            suffix="EUR"
          />
          <FormField label="Charges" name="charges" value={form.charges} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Dépôt de garantie" name="depotGarantie" value={form.depotGarantie} onChange={onChange} type="number" suffix="EUR" />
        </FormGrid>

        <div className="mt-6 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={!!form.forceManual}
              onChange={(e) => setForm((f) => ({ ...f, forceManual: e.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">
                Forcer la valeur du loyer (gestion manuelle)
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Par défaut désactivé. Activez uniquement en cas de renégociation
                ponctuelle, réduction commerciale ou dérogation temporaire. Tant
                que cette option est cochée, l'indexation INSEE automatique
                n'écrasera PAS ce bail ; à décocher pour reprendre le calcul
                base × indice nouveau / indice base.
              </div>
            </div>
          </label>
          {form.forceManual && (
            <div className="mt-4">
              <FormField
                label="Loyer HT annuel forcé"
                name="loyerManuelOverride"
                value={form.loyerManuelOverride}
                onChange={onChange}
                type="number"
                suffix="EUR"
              />
            </div>
          )}
        </div>

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
