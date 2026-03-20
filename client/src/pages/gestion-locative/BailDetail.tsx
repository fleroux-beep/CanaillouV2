import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { FormDialog } from "../../components/ui/form-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  FileText,
  MapPin,
  Calendar,
  PiggyBank,
  Calculator,
  Building2,
  Plus,
  Pencil,
  Trash2,
  FilePenLine,
  RefreshCw,
} from "lucide-react";

interface Avenant {
  id: string;
  bailId: string;
  dateEffet: string;
  dateSignature?: string;
  champsModifies: string;
  titre?: string;
  notes?: string;
  createdAt?: string;
}

interface Renouvellement {
  id: string;
  bailId: string;
  dateEffet: string;
  dateSignature?: string;
  nouvelleDateFin: string;
  champsModifies: string;
  titre?: string;
  notes?: string;
  createdAt?: string;
}

export default function BailGLDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: bail } = useQuery({
    queryKey: [`/api/gl/baux/${params.id}`],
    queryFn: () => apiRequest(`/api/gl/baux/${params.id}`),
    enabled: !!params.id,
  });
  const { data: paiements = [] } = useQuery({
    queryKey: [`/api/gl/baux/${params.id}/paiements`],
    queryFn: () => apiRequest(`/api/gl/baux/${params.id}/paiements`),
    enabled: !!params.id,
  });
  const { data: indexations = [] } = useQuery({
    queryKey: [`/api/gl/baux/${params.id}/indexations`],
    queryFn: () => apiRequest(`/api/gl/baux/${params.id}/indexations`),
    enabled: !!params.id,
  });
  const { data: allBailleurs = [] } = useQuery({
    queryKey: ["/api/gl/bailleurs"],
    queryFn: () => apiRequest("/api/gl/bailleurs"),
  });

  // Avenants & Renouvellements
  const { data: avenants = [] } = useQuery<Avenant[]>({
    queryKey: ["/api/gl/avenants"],
    queryFn: () => apiRequest("/api/gl/avenants"),
  });
  const { data: renouvellements = [] } = useQuery<Renouvellement[]>({
    queryKey: ["/api/gl/renouvellements"],
    queryFn: () => apiRequest("/api/gl/renouvellements"),
  });

  const queryClient = useQueryClient();

  const bailAvenants = avenants.filter((a) => a.bailId === params.id).sort((a, b) => b.dateEffet.localeCompare(a.dateEffet));
  const bailRenouvellements = renouvellements.filter((r) => r.bailId === params.id).sort((a, b) => b.dateEffet.localeCompare(a.dateEffet));

  // Avenant CRUD
  const createAvenant = useMutation({
    mutationFn: (data: Partial<Avenant>) => apiRequest("/api/gl/avenants", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/avenants"] }),
  });
  const updateAvenant = useMutation({
    mutationFn: (data: Partial<Avenant> & { id: string }) => apiRequest(`/api/gl/avenants/${data.id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/avenants"] }),
  });
  const deleteAvenant = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/gl/avenants/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/avenants"] }),
  });

  // Renouvellement CRUD
  const createRenouvellement = useMutation({
    mutationFn: (data: Partial<Renouvellement>) => apiRequest("/api/gl/renouvellements", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/renouvellements"] }),
  });
  const updateRenouvellement = useMutation({
    mutationFn: (data: Partial<Renouvellement> & { id: string }) => apiRequest(`/api/gl/renouvellements/${data.id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/renouvellements"] }),
  });
  const deleteRenouvellement = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/gl/renouvellements/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/gl/renouvellements"] }),
  });

  // Dialog state for avenants
  const [avenantDialogOpen, setAvenantDialogOpen] = useState(false);
  const [editingAvenant, setEditingAvenant] = useState<Avenant | null>(null);
  const [avenantForm, setAvenantForm] = useState<Partial<Avenant>>({ bailId: params.id, dateEffet: "", champsModifies: "", titre: "", notes: "", dateSignature: "" });
  const [deleteAvenantId, setDeleteAvenantId] = useState<string | null>(null);

  // Dialog state for renouvellements
  const [renouvelDialogOpen, setRenouvelDialogOpen] = useState(false);
  const [editingRenouvel, setEditingRenouvel] = useState<Renouvellement | null>(null);
  const [renouvelForm, setRenouvelForm] = useState<Partial<Renouvellement>>({ bailId: params.id, dateEffet: "", nouvelleDateFin: "", champsModifies: "", titre: "", notes: "", dateSignature: "" });
  const [deleteRenouvelId, setDeleteRenouvelId] = useState<string | null>(null);

  const onAvenantChange = (name: string, value: string) => setAvenantForm((f) => ({ ...f, [name]: value }));
  const onRenouvelChange = (name: string, value: string) => setRenouvelForm((f) => ({ ...f, [name]: value }));

  const handleAvenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAvenant) {
      await updateAvenant.mutateAsync({ ...avenantForm, id: editingAvenant.id } as any);
    } else {
      await createAvenant.mutateAsync({ ...avenantForm, bailId: params.id });
    }
    setAvenantDialogOpen(false);
  };

  const handleRenouvelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRenouvel) {
      await updateRenouvellement.mutateAsync({ ...renouvelForm, id: editingRenouvel.id } as any);
    } else {
      await createRenouvellement.mutateAsync({ ...renouvelForm, bailId: params.id });
    }
    setRenouvelDialogOpen(false);
  };

  if (!bail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const bailleurName =
    allBailleurs.find((b: any) => b.id === bail.bailleurId)?.nom || "";

  const descriptionParts = [bail.typeBail, bail.ville, bailleurName].filter(
    Boolean
  );

  const statutVariant: Record<string, "success" | "warning" | "danger" | "default"> = {
    actif: "success",
    en_cours: "success",
    expire: "danger",
    resilie: "danger",
    brouillon: "warning",
  };

  const sortedPaiements = [...paiements].sort(
    (a: any, b: any) =>
      new Date(b.date || b.datePaiement || 0).getTime() -
      new Date(a.date || a.datePaiement || 0).getTime()
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="space-y-6"
      >
        {/* Back button */}
        <button
          onClick={() => navigate("/gestion-locative/baux")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux baux
        </button>

        {/* Header */}
        <PageHeader
          title={bail.nom}
          description={
            descriptionParts.length > 0
              ? descriptionParts.join(" — ")
              : undefined
          }
        />

        {/* Info card */}
        <GlassCard>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <MapPin className="h-4 w-4" />
            Informations générales
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Adresse" value={bail.adresse || "—"} />
            <InfoRow label="Ville" value={bail.ville || "—"} />
            <InfoRow label="Code postal" value={bail.codePostal || "—"} />
            <InfoRow
              label="Surface"
              value={bail.surface ? `${bail.surface} m²` : "—"}
            />
            <InfoRow
              label="Surface extérieure"
              value={
                bail.surfaceExterieure ? `${bail.surfaceExterieure} m²` : "—"
              }
            />
            <InfoRow
              label="Capacité (berceaux)"
              value={bail.capacite != null ? String(bail.capacite) : "—"}
            />
            <InfoRow label="Date signature" value={bail.dateSignature || "—"} />
            <InfoRow label="Date effet" value={bail.dateEffet || "—"} />
            <InfoRow
              label="Statut"
              value={
                bail.statut ? (
                  <Badge
                    variant={statutVariant[bail.statut] || "default"}
                  >
                    {bail.statut}
                  </Badge>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </GlassCard>

        {/* Dates & Périodes */}
        <GlassCard delay={1}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Dates & Périodes
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Date début" value={bail.dateDebut || "—"} />
            <InfoRow label="Date fin" value={bail.dateFin || "—"} />
            <InfoRow
              label="Période ferme début"
              value={bail.periodeFermeDebut || "—"}
            />
            <InfoRow
              label="Période ferme fin"
              value={bail.periodeFermeFin || "—"}
            />
            <InfoRow
              label="Durée période ferme"
              value={bail.periodeFermeDureeAns ? `${bail.periodeFermeDureeAns} ans` : "—"}
            />
            <InfoRow
              label="Échéance triennale 1"
              value={bail.echTrien1 || "—"}
            />
            <InfoRow
              label="Échéance triennale 2"
              value={bail.echTrien2 || "—"}
            />
            <InfoRow
              label="Échéance triennale 3"
              value={bail.echTrien3 || "—"}
            />
          </div>
        </GlassCard>

        {/* Loyer & Charges */}
        <GlassCard delay={2}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <PiggyBank className="h-4 w-4" />
            Loyer & Charges
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow
              label="Loyer base HT"
              value={
                bail.loyerBaseHT ? formatCurrency(bail.loyerBaseHT) : "—"
              }
            />
            <InfoRow
              label="Loyer HT actuel"
              value={
                bail.loyerHTActu ? formatCurrency(bail.loyerHTActu) : "—"
              }
            />
            <InfoRow
              label="Charges"
              value={bail.charges ? formatCurrency(bail.charges) : "—"}
            />
            <InfoRow
              label="Dépôt de garantie"
              value={
                bail.depotGarantie
                  ? formatCurrency(bail.depotGarantie)
                  : "—"
              }
            />
            <InfoRow
              label="Taxe foncière"
              value={
                bail.taxeFonciere
                  ? formatCurrency(bail.taxeFonciere)
                  : "—"
              }
            />
            <InfoRow
              label="Taxe (TVA/CRL)"
              value={bail.taxe || "—"}
            />
            <InfoRow
              label="Taux TVA"
              value={bail.tvaTaux ? `${bail.tvaTaux}%` : "—"}
            />
            <InfoRow
              label="Garantie type"
              value={bail.garantieType || "—"}
            />
            <InfoRow
              label="Garantie montant"
              value={
                bail.garantieMontant
                  ? formatCurrency(bail.garantieMontant)
                  : "—"
              }
            />
          </div>
        </GlassCard>

        {/* Indexation */}
        <GlassCard delay={3}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <Calculator className="h-4 w-4" />
            Indexation
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow
              label={<InfoTooltip metricKey="indexation">Indice de référence</InfoTooltip>}
              value={
                bail.indiceReference ? (
                  <Badge variant="primary">{bail.indiceReference}</Badge>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow
              label="Trimestre de référence"
              value={bail.trimestreRef || "—"}
            />
            <InfoRow
              label="Date indice de base"
              value={bail.dateIndiceBase || "—"}
            />
            <InfoRow
              label="Valeur indice de base"
              value={
                bail.valeurIndiceBase != null
                  ? String(bail.valeurIndiceBase)
                  : "—"
              }
            />
            <InfoRow
              label="Indexation manuelle"
              value={
                bail.forceManual != null ? (
                  <Badge variant={bail.forceManual ? "warning" : "default"}>
                    {bail.forceManual ? "Oui" : "Non"}
                  </Badge>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </GlassCard>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Loyer HT annuel"
            value={Number(bail.loyerHTActu || bail.loyerBaseHT || 0)}
            formatFn={formatCurrency}
            icon={Building2}
            variant="primary"
            gradient
            delay={0}
            metricKey="loyerHT"
          />
          <KpiCard
            label="Charges annuelles"
            value={Number(bail.charges || 0) * 12}
            formatFn={formatCurrency}
            icon={PiggyBank}
            variant="warning"
            gradient
            delay={1}
            metricKey="chargesAnnuelles"
          />
          <KpiCard
            label="Dépôt de garantie"
            value={Number(bail.depotGarantie || 0)}
            formatFn={formatCurrency}
            icon={Calculator}
            variant="success"
            gradient
            delay={2}
            metricKey="depotGarantie"
          />
          <KpiCard
            label="Nb paiements"
            value={paiements.length}
            icon={FileText}
            delay={3}
          />
        </div>

        {/* Per-berceau KPIs (if capacite is set) */}
        {Number(bail.capacite || 0) > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Loyer / berceau"
              value={Number(bail.loyerHTActu || bail.loyerBaseHT || 0) / bail.capacite}
              formatFn={(n) => `${formatCurrency(n)}/berc.`}
              icon={Calculator}
              delay={4}
            />
            <KpiCard
              label="Surface / berceau"
              value={bail.surface ? Number(bail.surface) / bail.capacite : 0}
              formatFn={(n) => Number.isFinite(n) && n > 0 ? `${n.toFixed(1)} m²/berc.` : "N/A"}
              icon={Building2}
              delay={5}
            />
            <KpiCard
              label="Coût total / berceau"
              value={(Number(bail.loyerHTActu || bail.loyerBaseHT || 0) + Number(bail.charges || 0) * 12 + Number(bail.taxeFonciere || 0)) / bail.capacite}
              formatFn={(n) => `${formatCurrency(n)}/berc.`}
              icon={PiggyBank}
              delay={6}
            />
            <KpiCard
              label="Berceaux"
              value={bail.capacite}
              icon={FileText}
              delay={7}
            />
          </div>
        )}

        {/* Paiements table */}
        <Section title="Historique des paiements" delay={4}>
          <GlassCard hover={false}>
            {sortedPaiements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun paiement enregistré pour ce bail.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium text-right">Montant</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Méthode</th>
                      <th className="pb-3 font-medium">Référence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPaiements.map((p: any) => (
                      <tr
                        key={p.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3">
                          {p.date || p.datePaiement || "—"}
                        </td>
                        <td className="py-3 text-right font-medium">
                          {p.montant ? formatCurrency(p.montant) : "—"}
                        </td>
                        <td className="py-3">
                          {p.type ? (
                            <Badge variant="primary">{p.type}</Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3">{p.methode || "—"}</td>
                        <td className="py-3">{p.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </Section>

        {/* Indexations table */}
        <Section title="Historique des indexations" delay={5}>
          <GlassCard hover={false}>
            {indexations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune indexation enregistrée pour ce bail.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Date application</th>
                      <th className="pb-3 font-medium text-right">
                        Ancien loyer
                      </th>
                      <th className="pb-3 font-medium text-right">
                        Nouveau loyer
                      </th>
                      <th className="pb-3 font-medium text-right">
                        Indice base
                      </th>
                      <th className="pb-3 font-medium text-right">
                        Indice nouveau
                      </th>
                      <th className="pb-3 font-medium text-right">
                        Variation (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexations.map((idx: any) => (
                      <tr
                        key={idx.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3">
                          {idx.dateApplication || "—"}
                        </td>
                        <td className="py-3 text-right">
                          {idx.ancienLoyer
                            ? formatCurrency(idx.ancienLoyer)
                            : "—"}
                        </td>
                        <td className="py-3 text-right font-medium">
                          {idx.nouveauLoyer
                            ? formatCurrency(idx.nouveauLoyer)
                            : "—"}
                        </td>
                        <td className="py-3 text-right">
                          {idx.indiceBase != null
                            ? String(idx.indiceBase)
                            : "—"}
                        </td>
                        <td className="py-3 text-right">
                          {idx.indiceNouveau != null
                            ? String(idx.indiceNouveau)
                            : "—"}
                        </td>
                        <td className="py-3 text-right">
                          {idx.tauxVariation != null
                            ? `${Number(idx.tauxVariation).toFixed(2)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </Section>

        {/* Avenants */}
        <Section title="Avenants" delay={6}>
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FilePenLine className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-muted-foreground">{bailAvenants.length} avenant(s)</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setEditingAvenant(null);
                  setAvenantForm({ bailId: params.id, dateEffet: "", champsModifies: "", titre: "", notes: "", dateSignature: "" });
                  setAvenantDialogOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg gradient-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-500/25"
              >
                <Plus className="h-3.5 w-3.5" /> Nouvel avenant
              </motion.button>
            </div>

            {bailAvenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun avenant enregistré pour ce bail.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Titre</th>
                      <th className="pb-3 font-medium">Date effet</th>
                      <th className="pb-3 font-medium">Date signature</th>
                      <th className="pb-3 font-medium">Champs modifiés</th>
                      <th className="pb-3 font-medium">Notes</th>
                      <th className="pb-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bailAvenants.map((a) => (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 font-medium">{a.titre || "—"}</td>
                        <td className="py-3">{a.dateEffet}</td>
                        <td className="py-3">{a.dateSignature || "—"}</td>
                        <td className="py-3 max-w-[200px] truncate">{a.champsModifies}</td>
                        <td className="py-3 max-w-[150px] truncate text-muted-foreground">{a.notes || "—"}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setEditingAvenant(a); setAvenantForm(a); setAvenantDialogOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleteAvenantId(a.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </Section>

        {/* Renouvellements */}
        <Section title="Renouvellements" delay={7}>
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-muted-foreground">{bailRenouvellements.length} renouvellement(s)</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setEditingRenouvel(null);
                  setRenouvelForm({ bailId: params.id, dateEffet: "", nouvelleDateFin: "", champsModifies: "", titre: "", notes: "", dateSignature: "" });
                  setRenouvelDialogOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg gradient-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-500/25"
              >
                <Plus className="h-3.5 w-3.5" /> Nouveau renouvellement
              </motion.button>
            </div>

            {bailRenouvellements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun renouvellement enregistré pour ce bail.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Titre</th>
                      <th className="pb-3 font-medium">Date effet</th>
                      <th className="pb-3 font-medium">Nouvelle date fin</th>
                      <th className="pb-3 font-medium">Date signature</th>
                      <th className="pb-3 font-medium">Champs modifiés</th>
                      <th className="pb-3 font-medium">Notes</th>
                      <th className="pb-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bailRenouvellements.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 font-medium">{r.titre || "—"}</td>
                        <td className="py-3">{r.dateEffet}</td>
                        <td className="py-3 font-medium">{r.nouvelleDateFin}</td>
                        <td className="py-3">{r.dateSignature || "—"}</td>
                        <td className="py-3 max-w-[200px] truncate">{r.champsModifies}</td>
                        <td className="py-3 max-w-[150px] truncate text-muted-foreground">{r.notes || "—"}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setEditingRenouvel(r); setRenouvelForm(r); setRenouvelDialogOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleteRenouvelId(r.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </Section>

        {/* Notes */}
        {bail.notes && (
          <Section title="Notes" delay={8}>
            <GlassCard hover={false}>
              <p className="whitespace-pre-wrap text-sm">{bail.notes}</p>
            </GlassCard>
          </Section>
        )}

        {/* Avenant Dialog */}
        <FormDialog
          open={avenantDialogOpen}
          onClose={() => setAvenantDialogOpen(false)}
          title={editingAvenant ? "Modifier l'avenant" : "Nouvel avenant"}
          onSubmit={handleAvenantSubmit}
          loading={createAvenant.isPending || updateAvenant.isPending}
        >
          <FormGrid cols={2}>
            <FormField label="Titre" name="titre" value={avenantForm.titre} onChange={onAvenantChange} placeholder="Ex: Avenant n°1 - Révision loyer" />
            <FormField label="Date d'effet" name="dateEffet" value={avenantForm.dateEffet} onChange={onAvenantChange} type="date" required />
          </FormGrid>
          <FormGrid cols={2}>
            <FormField label="Date de signature" name="dateSignature" value={avenantForm.dateSignature} onChange={onAvenantChange} type="date" />
            <FormField label="Champs modifiés" name="champsModifies" value={avenantForm.champsModifies} onChange={onAvenantChange} required placeholder="Ex: Loyer HT, charges, surface" />
          </FormGrid>
          <FormField label="Notes / Détails" name="notes" value={avenantForm.notes} onChange={onAvenantChange} rows={3} className="mt-4" placeholder="Détails de l'avenant : modifications apportées, motifs, conditions..." />
        </FormDialog>

        {/* Renouvellement Dialog */}
        <FormDialog
          open={renouvelDialogOpen}
          onClose={() => setRenouvelDialogOpen(false)}
          title={editingRenouvel ? "Modifier le renouvellement" : "Nouveau renouvellement"}
          onSubmit={handleRenouvelSubmit}
          loading={createRenouvellement.isPending || updateRenouvellement.isPending}
        >
          <FormGrid cols={2}>
            <FormField label="Titre" name="titre" value={renouvelForm.titre} onChange={onRenouvelChange} placeholder="Ex: Renouvellement 2025-2028" />
            <FormField label="Date d'effet" name="dateEffet" value={renouvelForm.dateEffet} onChange={onRenouvelChange} type="date" required />
          </FormGrid>
          <FormGrid cols={2}>
            <FormField label="Nouvelle date de fin" name="nouvelleDateFin" value={renouvelForm.nouvelleDateFin} onChange={onRenouvelChange} type="date" required />
            <FormField label="Date de signature" name="dateSignature" value={renouvelForm.dateSignature} onChange={onRenouvelChange} type="date" />
          </FormGrid>
          <FormField label="Champs modifiés" name="champsModifies" value={renouvelForm.champsModifies} onChange={onRenouvelChange} required placeholder="Ex: Date fin, loyer HT, conditions" className="mt-4" />
          <FormField label="Notes / Détails" name="notes" value={renouvelForm.notes} onChange={onRenouvelChange} rows={3} className="mt-4" placeholder="Détails du renouvellement : nouvelles conditions, motifs..." />
        </FormDialog>

        {/* Delete confirmations */}
        <ConfirmDialog
          open={!!deleteAvenantId}
          onClose={() => setDeleteAvenantId(null)}
          onConfirm={async () => { if (deleteAvenantId) { await deleteAvenant.mutateAsync(deleteAvenantId); setDeleteAvenantId(null); } }}
          loading={deleteAvenant.isPending}
        />
        <ConfirmDialog
          open={!!deleteRenouvelId}
          onClose={() => setDeleteRenouvelId(null)}
          onConfirm={async () => { if (deleteRenouvelId) { await deleteRenouvellement.mutateAsync(deleteRenouvelId); setDeleteRenouvelId(null); } }}
          loading={deleteRenouvellement.isPending}
        />
      </motion.div>
    </AnimatePresence>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
