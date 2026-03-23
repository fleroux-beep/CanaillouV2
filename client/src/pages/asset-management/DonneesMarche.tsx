import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { GlassCard } from "../../components/ui/glass-card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { FormDialog } from "../../components/ui/form-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { DataTable, type Column } from "../../components/ui/data-table";
import { KpiCard } from "../../components/ui/kpi-card";
import {
  TrendingUp, Building2, Home, RefreshCw, Plus, Pencil, Trash2,
  Calculator, Landmark, Activity, Shield, BarChart3,
} from "lucide-react";
import { sourceBadgeColor, sourceLabel } from "../../lib/market-utils";

// ============================================================
// Types
// ============================================================

interface RefTauxEmprunt {
  id: string; source: string; typeActif: string; dureeAns: number;
  taux: string; periode?: string; dateReleve?: string; notes?: string;
}
interface RefValeurVenale {
  id: string; source: string; codePostal: string; ville?: string;
  typeBien: string; prixM2Median?: string; prixM2Bas?: string; prixM2Haut?: string;
  nbTransactions?: number; periode?: string; dateReleve?: string; notes?: string;
}
interface RefValeurLocative {
  id: string; source: string; codePostal: string; ville?: string;
  typeBien: string; loyerM2MensuelMedian?: string; loyerM2MensuelBas?: string;
  loyerM2MensuelHaut?: string; periode?: string; dateReleve?: string; notes?: string;
}
interface RefTauxCapi {
  id: string; source: string; codePostal: string; ville?: string;
  typeBien: string; tauxCapi: string; tauxCapiBas?: string; tauxCapiHaut?: string;
  fiabilite?: string; methodeCalcul?: string; periode?: string; dateReleve?: string; notes?: string;
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sourceBadgeColor(source)}`}>
      {sourceLabel(source)}
    </span>
  );
}

function FiabiliteBadge({ level }: { level?: string | null }) {
  const colors = {
    haute: "bg-emerald-500/10 text-emerald-500",
    moyenne: "bg-amber-500/10 text-amber-500",
    faible: "bg-red-500/10 text-red-500",
  };
  const c = colors[(level || "faible") as keyof typeof colors] || colors.faible;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c}`}>{level || "faible"}</span>;
}

// ============================================================
// Tab: Taux d'Emprunt
// ============================================================

function TauxEmpruntTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<RefTauxEmprunt[]>({ queryKey: ["/api/am/marche/taux-emprunt"], queryFn: () => apiRequest("/api/am/marche/taux-emprunt") });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RefTauxEmprunt | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ source: "manuel", typeActif: "résidentiel", dureeAns: "20", taux: "", periode: "", dateReleve: "", notes: "" });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("/api/am/marche/taux-emprunt", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-emprunt"] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/api/am/marche/taux-emprunt/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-emprunt"] }); setDialogOpen(false); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/am/marche/taux-emprunt/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-emprunt"] }); setDeleteId(null); },
  });

  const openCreate = () => { setEditing(null); setForm({ source: "manuel", typeActif: "résidentiel", dureeAns: "20", taux: "", periode: "", dateReleve: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (row: RefTauxEmprunt) => { setEditing(row); setForm({ source: row.source, typeActif: row.typeActif, dureeAns: String(row.dureeAns), taux: row.taux, periode: row.periode || "", dateReleve: row.dateReleve || "", notes: row.notes || "" }); setDialogOpen(true); };

  const handleSubmit = () => {
    const body = { ...form, dureeAns: parseInt(form.dureeAns) };
    if (editing) updateMut.mutate({ id: editing.id, ...body });
    else createMut.mutate(body);
  };

  // Group by typeActif for KPI display
  const grouped = useMemo(() => {
    const map: Record<string, RefTauxEmprunt[]> = {};
    for (const r of data) { (map[r.typeActif] ||= []).push(r); }
    return map;
  }, [data]);

  const columns: Column<RefTauxEmprunt>[] = [
    { key: "source", label: "Source", render: (r) => <SourceBadge source={r.source} /> },
    { key: "typeActif", label: "Type actif" },
    { key: "dureeAns", label: "Durée", render: (r) => `${r.dureeAns} ans` },
    { key: "taux", label: "Taux", render: (r) => `${Number(r.taux).toFixed(2)}%` },
    { key: "periode", label: "Période" },
    { key: "dateReleve", label: "Date relevé" },
    { key: "actions", label: "", render: (r) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="p-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => setDeleteId(r.id)} className="p-1 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(grouped).map(([type, refs]) => {
          const avg = refs.reduce((s, r) => s + Number(r.taux), 0) / refs.length;
          return <KpiCard key={type} label={type} value={avg} formatFn={(n) => `${n.toFixed(2)}%`} subtitle={`${refs.length} entrée(s)`} icon={Landmark} />;
        })}
        {data.length === 0 && <KpiCard label="Aucune donnée" value={0} formatFn={() => "—"} subtitle="Ajoutez des taux" icon={Landmark} />}
      </div>

      <Section title="Grille des taux">
        <div className="flex justify-end -mt-2 mb-3">
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" />Ajouter</button>
        </div>
        <DataTable columns={columns} data={data} emptyMessage="Aucun taux de référence" />
      </Section>

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier le taux" : "Nouveau taux de référence"} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} loading={createMut.isPending || updateMut.isPending}>
        <FormGrid>
          <FormField label="Source">
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="manuel">Manuel</option>
              <option value="bdf">Banque de France</option>
            </select>
          </FormField>
          <FormField label="Type d'actif">
            <select value={form.typeActif} onChange={(e) => setForm({ ...form, typeActif: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="résidentiel">Résidentiel</option>
              <option value="commercial">Commercial</option>
              <option value="bureau">Bureau</option>
              <option value="crèche">Crèche / ERP</option>
              <option value="mixte">Mixte</option>
            </select>
          </FormField>
          <FormField label="Durée (ans)">
            <select value={form.dureeAns} onChange={(e) => setForm({ ...form, dureeAns: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {[7, 10, 15, 20, 25].map((d) => <option key={d} value={d}>{d} ans</option>)}
            </select>
          </FormField>
          <FormField label="Taux (%)">
            <input type="number" step="0.01" value={form.taux} onChange={(e) => setForm({ ...form, taux: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="3.50" />
          </FormField>
          <FormField label="Période">
            <input value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="T1-2026" />
          </FormField>
          <FormField label="Date de relevé">
            <input type="date" value={form.dateReleve} onChange={(e) => setForm({ ...form, dateReleve: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
        </FormGrid>
        <FormField label="Notes">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} />
        </FormField>
      </FormDialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer ce taux ?" message="Cette action est irréversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  );
}

// ============================================================
// Tab: Valeurs Vénales
// ============================================================

function ValeursVenalesTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<RefValeurVenale[]>({ queryKey: ["/api/am/marche/valeurs-venales"], queryFn: () => apiRequest("/api/am/marche/valeurs-venales") });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RefValeurVenale | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ source: "manuel", codePostal: "", ville: "", typeBien: "appartement", prixM2Median: "", prixM2Bas: "", prixM2Haut: "", nbTransactions: "", periode: "", dateReleve: "", notes: "" });

  const syncDVF = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/sync-dvf", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-venales"] }),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("/api/am/marche/valeurs-venales", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-venales"] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/api/am/marche/valeurs-venales/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-venales"] }); setDialogOpen(false); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/am/marche/valeurs-venales/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-venales"] }); setDeleteId(null); },
  });

  const openCreate = () => { setEditing(null); setForm({ source: "manuel", codePostal: "", ville: "", typeBien: "appartement", prixM2Median: "", prixM2Bas: "", prixM2Haut: "", nbTransactions: "", periode: "", dateReleve: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (row: RefValeurVenale) => { setEditing(row); setForm({ source: row.source, codePostal: row.codePostal, ville: row.ville || "", typeBien: row.typeBien, prixM2Median: row.prixM2Median || "", prixM2Bas: row.prixM2Bas || "", prixM2Haut: row.prixM2Haut || "", nbTransactions: row.nbTransactions ? String(row.nbTransactions) : "", periode: row.periode || "", dateReleve: row.dateReleve || "", notes: row.notes || "" }); setDialogOpen(true); };

  const handleSubmit = () => {
    const body = { ...form, nbTransactions: form.nbTransactions ? parseInt(form.nbTransactions) : null };
    if (editing) updateMut.mutate({ id: editing.id, ...body });
    else createMut.mutate(body);
  };

  const columns: Column<RefValeurVenale>[] = [
    { key: "source", label: "Source", render: (r) => <SourceBadge source={r.source} /> },
    { key: "codePostal", label: "Code postal" },
    { key: "ville", label: "Ville" },
    { key: "typeBien", label: "Type" },
    { key: "prixM2Median", label: "Prix/m² médian", render: (r) => r.prixM2Median ? formatCurrency(Number(r.prixM2Median)) : "—" },
    { key: "prixM2Bas", label: "Q1", render: (r) => r.prixM2Bas ? formatCurrency(Number(r.prixM2Bas)) : "—" },
    { key: "prixM2Haut", label: "Q3", render: (r) => r.prixM2Haut ? formatCurrency(Number(r.prixM2Haut)) : "—" },
    { key: "nbTransactions", label: "Nb tx", render: (r) => r.nbTransactions || "—" },
    { key: "periode", label: "Période" },
    { key: "actions", label: "", render: (r) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="p-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => setDeleteId(r.id)} className="p-1 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <Section title="Prix de vente au m² par zone">
        <div className="flex justify-end -mt-2 mb-3 gap-2">
          <button onClick={() => syncDVF.mutate()} disabled={syncDVF.isPending} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${syncDVF.isPending ? "animate-spin" : ""}`} />Sync DVF
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" />Ajouter</button>
        </div>
        {syncDVF.isSuccess && <p className="text-xs text-emerald-500 mb-2">Synchronisation DVF terminée</p>}
        {syncDVF.isError && <p className="text-xs text-destructive mb-2">Erreur sync DVF</p>}
        <DataTable columns={columns} data={data} emptyMessage="Aucune valeur vénale. Lancez une sync DVF ou ajoutez manuellement." />
      </Section>

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier" : "Nouvelle valeur vénale"} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} loading={createMut.isPending || updateMut.isPending}>
        <FormGrid>
          <FormField label="Source">
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="manuel">Manuel</option>
              <option value="dvf">DVF</option>
            </select>
          </FormField>
          <FormField label="Code postal *">
            <input value={form.codePostal} onChange={(e) => setForm({ ...form, codePostal: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="75008" />
          </FormField>
          <FormField label="Ville">
            <input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Type de bien">
            <select value={form.typeBien} onChange={(e) => setForm({ ...form, typeBien: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="appartement">Appartement</option>
              <option value="maison">Maison</option>
              <option value="local_commercial">Local commercial</option>
              <option value="bureau">Bureau</option>
              <option value="terrain">Terrain</option>
            </select>
          </FormField>
          <FormField label="Prix/m² médian">
            <input type="number" value={form.prixM2Median} onChange={(e) => setForm({ ...form, prixM2Median: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Prix/m² bas (Q1)">
            <input type="number" value={form.prixM2Bas} onChange={(e) => setForm({ ...form, prixM2Bas: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Prix/m² haut (Q3)">
            <input type="number" value={form.prixM2Haut} onChange={(e) => setForm({ ...form, prixM2Haut: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Période">
            <input value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="S1-2025" />
          </FormField>
        </FormGrid>
      </FormDialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer ?" message="Cette action est irréversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  );
}

// ============================================================
// Tab: Valeurs Locatives
// ============================================================

function ValeursLocativesTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<RefValeurLocative[]>({ queryKey: ["/api/am/marche/valeurs-locatives"], queryFn: () => apiRequest("/api/am/marche/valeurs-locatives") });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RefValeurLocative | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ source: "manuel", codePostal: "", ville: "", typeBien: "appartement", loyerM2MensuelMedian: "", loyerM2MensuelBas: "", loyerM2MensuelHaut: "", periode: "", dateReleve: "", notes: "" });

  const syncANIL = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/sync-anil", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-locatives"] }),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("/api/am/marche/valeurs-locatives", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-locatives"] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/api/am/marche/valeurs-locatives/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-locatives"] }); setDialogOpen(false); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/am/marche/valeurs-locatives/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/valeurs-locatives"] }); setDeleteId(null); },
  });

  const openCreate = () => { setEditing(null); setForm({ source: "manuel", codePostal: "", ville: "", typeBien: "appartement", loyerM2MensuelMedian: "", loyerM2MensuelBas: "", loyerM2MensuelHaut: "", periode: "", dateReleve: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (row: RefValeurLocative) => { setEditing(row); setForm({ source: row.source, codePostal: row.codePostal, ville: row.ville || "", typeBien: row.typeBien, loyerM2MensuelMedian: row.loyerM2MensuelMedian || "", loyerM2MensuelBas: row.loyerM2MensuelBas || "", loyerM2MensuelHaut: row.loyerM2MensuelHaut || "", periode: row.periode || "", dateReleve: row.dateReleve || "", notes: row.notes || "" }); setDialogOpen(true); };

  const handleSubmit = () => {
    const body = { ...form };
    if (editing) updateMut.mutate({ id: editing.id, ...body });
    else createMut.mutate(body);
  };

  const columns: Column<RefValeurLocative>[] = [
    { key: "source", label: "Source", render: (r) => <SourceBadge source={r.source} /> },
    { key: "codePostal", label: "Code postal" },
    { key: "ville", label: "Ville" },
    { key: "typeBien", label: "Type" },
    { key: "loyerM2MensuelMedian", label: "Loyer/m²/mois", render: (r) => r.loyerM2MensuelMedian ? `${Number(r.loyerM2MensuelMedian).toFixed(1)} €` : "—" },
    { key: "loyerM2MensuelBas", label: "Bas", render: (r) => r.loyerM2MensuelBas ? `${Number(r.loyerM2MensuelBas).toFixed(1)} €` : "—" },
    { key: "loyerM2MensuelHaut", label: "Haut", render: (r) => r.loyerM2MensuelHaut ? `${Number(r.loyerM2MensuelHaut).toFixed(1)} €` : "—" },
    { key: "periode", label: "Période" },
    { key: "actions", label: "", render: (r) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="p-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => setDeleteId(r.id)} className="p-1 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <Section title="Loyers au m² par zone">
        <div className="flex justify-end -mt-2 mb-3 gap-2">
          <button onClick={() => syncANIL.mutate()} disabled={syncANIL.isPending} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${syncANIL.isPending ? "animate-spin" : ""}`} />Sync ANIL
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" />Ajouter</button>
        </div>
        {syncANIL.isSuccess && <p className="text-xs text-emerald-500 mb-2">Synchronisation ANIL terminée</p>}
        {syncANIL.isError && <p className="text-xs text-destructive mb-2">Erreur sync ANIL</p>}
        <DataTable columns={columns} data={data} emptyMessage="Aucune valeur locative. Lancez une sync ANIL ou ajoutez manuellement." />
      </Section>

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier" : "Nouvelle valeur locative"} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} loading={createMut.isPending || updateMut.isPending}>
        <FormGrid>
          <FormField label="Source">
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="manuel">Manuel</option>
              <option value="anil">ANIL</option>
              <option value="oll">OLL</option>
              <option value="interne">Portefeuille</option>
            </select>
          </FormField>
          <FormField label="Code postal *">
            <input value={form.codePostal} onChange={(e) => setForm({ ...form, codePostal: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="75008" />
          </FormField>
          <FormField label="Ville">
            <input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Type de bien">
            <select value={form.typeBien} onChange={(e) => setForm({ ...form, typeBien: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="appartement">Appartement</option>
              <option value="maison">Maison</option>
              <option value="local_commercial">Local commercial</option>
              <option value="bureau">Bureau</option>
              <option value="crèche">Crèche</option>
            </select>
          </FormField>
          <FormField label="Loyer/m²/mois médian">
            <input type="number" step="0.1" value={form.loyerM2MensuelMedian} onChange={(e) => setForm({ ...form, loyerM2MensuelMedian: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Loyer/m²/mois bas">
            <input type="number" step="0.1" value={form.loyerM2MensuelBas} onChange={(e) => setForm({ ...form, loyerM2MensuelBas: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Loyer/m²/mois haut">
            <input type="number" step="0.1" value={form.loyerM2MensuelHaut} onChange={(e) => setForm({ ...form, loyerM2MensuelHaut: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Période">
            <input value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="2025" />
          </FormField>
        </FormGrid>
      </FormDialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer ?" message="Cette action est irréversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  );
}

// ============================================================
// Tab: Taux de Capitalisation
// ============================================================

function TauxCapitalisationTab() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<RefTauxCapi[]>({ queryKey: ["/api/am/marche/taux-capitalisation"], queryFn: () => apiRequest("/api/am/marche/taux-capitalisation") });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RefTauxCapi | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ source: "manuel", codePostal: "", ville: "", typeBien: "appartement", tauxCapi: "", tauxCapiBas: "", tauxCapiHaut: "", fiabilite: "haute", periode: "", dateReleve: "", notes: "" });

  const computeMut = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/compute-taux-capi", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-capitalisation"] }),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("/api/am/marche/taux-capitalisation", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-capitalisation"] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/api/am/marche/taux-capitalisation/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-capitalisation"] }); setDialogOpen(false); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/am/marche/taux-capitalisation/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/am/marche/taux-capitalisation"] }); setDeleteId(null); },
  });

  const openCreate = () => { setEditing(null); setForm({ source: "manuel", codePostal: "", ville: "", typeBien: "appartement", tauxCapi: "", tauxCapiBas: "", tauxCapiHaut: "", fiabilite: "haute", periode: "", dateReleve: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (row: RefTauxCapi) => { setEditing(row); setForm({ source: row.source as any, codePostal: row.codePostal, ville: row.ville || "", typeBien: row.typeBien, tauxCapi: row.tauxCapi, tauxCapiBas: row.tauxCapiBas || "", tauxCapiHaut: row.tauxCapiHaut || "", fiabilite: row.fiabilite || "haute", periode: row.periode || "", dateReleve: row.dateReleve || "", notes: row.notes || "" }); setDialogOpen(true); };

  const handleSubmit = () => {
    const body = { ...form };
    if (editing) updateMut.mutate({ id: editing.id, ...body });
    else createMut.mutate(body);
  };

  const columns: Column<RefTauxCapi>[] = [
    { key: "source", label: "Source", render: (r) => <SourceBadge source={r.source} /> },
    { key: "codePostal", label: "Code postal" },
    { key: "ville", label: "Ville" },
    { key: "typeBien", label: "Type" },
    { key: "tauxCapi", label: "Taux capi", render: (r) => `${Number(r.tauxCapi).toFixed(2)}%` },
    { key: "tauxCapiBas", label: "Bas", render: (r) => r.tauxCapiBas ? `${Number(r.tauxCapiBas).toFixed(2)}%` : "—" },
    { key: "tauxCapiHaut", label: "Haut", render: (r) => r.tauxCapiHaut ? `${Number(r.tauxCapiHaut).toFixed(2)}%` : "—" },
    { key: "fiabilite", label: "Fiabilité", render: (r) => <FiabiliteBadge level={r.fiabilite} /> },
    { key: "methodeCalcul", label: "Méthode", render: (r) => r.methodeCalcul || "—" },
    { key: "actions", label: "", render: (r) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(r)} className="p-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => setDeleteId(r.id)} className="p-1 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <Calculator className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Taux de capitalisation = Loyer annuel/m² / Prix/m²</p>
            <p>Les taux <SourceBadge source="calculé" /> sont dérivés automatiquement des valeurs vénales (DVF) et locatives (ANIL). Les taux <SourceBadge source="manuel" /> que vous saisissez <strong>priment toujours</strong> sur les calculés.</p>
          </div>
        </div>
      </GlassCard>

      <Section title="Taux de capitalisation par zone">
        <div className="flex justify-end -mt-2 mb-3 gap-2">
          <button onClick={() => computeMut.mutate()} disabled={computeMut.isPending} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${computeMut.isPending ? "animate-spin" : ""}`} />Recalculer
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" />Ajouter</button>
        </div>
        {computeMut.isSuccess && <p className="text-xs text-emerald-500 mb-2">Calcul terminé</p>}
        <DataTable columns={columns} data={data} emptyMessage="Aucun taux de capitalisation. Synchronisez DVF+ANIL puis recalculez, ou ajoutez manuellement." />
      </Section>

      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier" : "Nouveau taux de capitalisation"} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} loading={createMut.isPending || updateMut.isPending}>
        <FormGrid>
          <FormField label="Source">
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="manuel">Manuel</option>
              <option value="immostat">ImmoStat</option>
              <option value="calculé">Calculé</option>
            </select>
          </FormField>
          <FormField label="Code postal *">
            <input value={form.codePostal} onChange={(e) => setForm({ ...form, codePostal: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="75008" />
          </FormField>
          <FormField label="Ville">
            <input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Type de bien">
            <select value={form.typeBien} onChange={(e) => setForm({ ...form, typeBien: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="appartement">Appartement</option>
              <option value="maison">Maison</option>
              <option value="local_commercial">Local commercial</option>
              <option value="bureau">Bureau</option>
              <option value="crèche">Crèche</option>
            </select>
          </FormField>
          <FormField label="Taux capi (%) *">
            <input type="number" step="0.01" value={form.tauxCapi} onChange={(e) => setForm({ ...form, tauxCapi: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="5.50" />
          </FormField>
          <FormField label="Taux bas (%)">
            <input type="number" step="0.01" value={form.tauxCapiBas} onChange={(e) => setForm({ ...form, tauxCapiBas: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Taux haut (%)">
            <input type="number" step="0.01" value={form.tauxCapiHaut} onChange={(e) => setForm({ ...form, tauxCapiHaut: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          <FormField label="Fiabilité">
            <select value={form.fiabilite} onChange={(e) => setForm({ ...form, fiabilite: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="haute">Haute</option>
              <option value="moyenne">Moyenne</option>
              <option value="faible">Faible</option>
            </select>
          </FormField>
        </FormGrid>
        <FormField label="Notes / Référence rapport">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} placeholder="Ex: Rapport Cushman & Wakefield T4 2025, bureaux prime Paris QCA" />
        </FormField>
      </FormDialog>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="Supprimer ?" message="Cette action est irréversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function DonneesMarche() {
  const [activeTab, setActiveTab] = useState("taux-emprunt");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 p-6">
      <PageHeader
        title="Données de Marché"
        description="Référentiel centralisé : taux d'emprunt, valeurs vénales, locatives et taux de capitalisation"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="taux-emprunt" className="flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5" />Taux emprunt
          </TabsTrigger>
          <TabsTrigger value="valeurs-venales" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />Valeurs vénales
          </TabsTrigger>
          <TabsTrigger value="valeurs-locatives" className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5" />Valeurs locatives
          </TabsTrigger>
          <TabsTrigger value="taux-capitalisation" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Taux de capi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="taux-emprunt"><TauxEmpruntTab /></TabsContent>
        <TabsContent value="valeurs-venales"><ValeursVenalesTab /></TabsContent>
        <TabsContent value="valeurs-locatives"><ValeursLocativesTab /></TabsContent>
        <TabsContent value="taux-capitalisation"><TauxCapitalisationTab /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
