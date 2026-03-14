import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "../../lib/utils";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  FileText,
  MapPin,
  Calendar,
  PiggyBank,
  Calculator,
  Building2,
} from "lucide-react";

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
            Informations generales
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
              label="Surface exterieure"
              value={
                bail.surfaceExterieure ? `${bail.surfaceExterieure} m²` : "—"
              }
            />
            <InfoRow
              label="Capacite (berceaux)"
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

        {/* Dates & Periodes */}
        <GlassCard delay={1}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Dates & Periodes
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Date debut" value={bail.dateDebut || "—"} />
            <InfoRow label="Date fin" value={bail.dateFin || "—"} />
            <InfoRow
              label="Periode ferme debut"
              value={bail.periodeFermeDebut || "—"}
            />
            <InfoRow
              label="Periode ferme fin"
              value={bail.periodeFermeFin || "—"}
            />
            <InfoRow
              label="Duree periode ferme"
              value={bail.periodeFermeDuree || "—"}
            />
            <InfoRow
              label="Echeance triennale 1"
              value={bail.echTrien1 || "—"}
            />
            <InfoRow
              label="Echeance triennale 2"
              value={bail.echTrien2 || "—"}
            />
            <InfoRow
              label="Echeance triennale 3"
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
              label="Depot de garantie"
              value={
                bail.depotGarantie
                  ? formatCurrency(bail.depotGarantie)
                  : "—"
              }
            />
            <InfoRow
              label="Taxe fonciere"
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
              label="Indice de reference"
              value={
                bail.indiceReference ? (
                  <Badge variant="primary">{bail.indiceReference}</Badge>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow
              label="Trimestre de reference"
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
            value={parseFloat(bail.loyerBaseHT) * 12 || 0}
            formatFn={formatCurrency}
            icon={Building2}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Charges"
            value={parseFloat(bail.charges) || 0}
            formatFn={formatCurrency}
            icon={PiggyBank}
            variant="warning"
            gradient
            delay={1}
          />
          <KpiCard
            label="Depot de garantie"
            value={parseFloat(bail.depotGarantie) || 0}
            formatFn={formatCurrency}
            icon={Calculator}
            variant="success"
            gradient
            delay={2}
          />
          <KpiCard
            label="Nb paiements"
            value={paiements.length}
            icon={FileText}
            delay={3}
          />
        </div>

        {/* Paiements table */}
        <Section title="Historique des paiements" delay={4}>
          <GlassCard hover={false}>
            {sortedPaiements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun paiement enregistre pour ce bail.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium text-right">Montant</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Methode</th>
                      <th className="pb-3 font-medium">Reference</th>
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
                Aucune indexation enregistree pour ce bail.
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

        {/* Notes */}
        {bail.notes && (
          <Section title="Notes" delay={6}>
            <GlassCard hover={false}>
              <p className="whitespace-pre-wrap text-sm">{bail.notes}</p>
            </GlassCard>
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
