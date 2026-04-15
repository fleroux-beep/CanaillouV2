import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "../../lib/utils";
import { getChargesAnnuelles, getLoyerAnnuelActif, getPrixAcquisition } from "../../lib/am-calculations";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  PiggyBank,
  Ruler,
  Home,
  TrendingUp,
  FileText,
} from "lucide-react";

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
  chargesCopropriete?: string;
  chargesAnnuelles?: string;
  taxeFonciere?: string;
  assurancePno?: string;
  tauxCapitalisation?: string;
  prixM2Marche?: string;
  syndic?: string;
  notes?: string;
}

interface Lot {
  id: string;
  designation: string;
  type?: string;
  etage?: string;
  surface?: string;
  surfaceCarrez?: string;
  statut?: string;
}

interface BailLite {
  id: string;
  actifId?: string;
  lotId?: string;
  loyerBaseHT?: string;
  loyerHTActu?: string;
  statut?: string;
  archived?: boolean;
}

interface SCI {
  id: string;
  nom: string;
}

const typeVariant: Record<string, "primary" | "success" | "warning" | "danger" | "default"> = {
  residentiel: "warning",
  commercial: "danger",
  bureau: "primary",
  mixte: "warning",
  creche: "success",
};

export default function ActifDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: actif } = useQuery<Actif>({
    queryKey: [`/api/am/actifs/${params.id}`],
    queryFn: () => apiRequest(`/api/am/actifs/${params.id}`),
    enabled: !!params.id,
  });

  const { data: lots = [] } = useQuery<Lot[]>({
    queryKey: [`/api/am/actifs/${params.id}/lots`],
    queryFn: () => apiRequest(`/api/am/actifs/${params.id}/lots`),
    enabled: !!params.id,
  });

  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });

  const { data: allBaux = [] } = useQuery<BailLite[]>({
    queryKey: ["/api/am/baux"],
    queryFn: () => apiRequest("/api/am/baux"),
  });

  if (!actif) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const sciName = scis.find((s) => s.id === actif.sciId)?.nom;
  const prixAcq = Number(actif.prixAcquisition ?? 0);
  const fraisTotal = getPrixAcquisition(actif as any);
  const chargesTotal = getChargesAnnuelles(actif as any);
  const actifBaux = allBaux.filter((b) => b.actifId === params.id);
  const loyerAnnuelTotal = getLoyerAnnuelActif(actif as any, actifBaux as any, lots as any[]);

  const getLoyerMensuelLot = (lotId: string): number => {
    const bail = actifBaux.find(
      (b) => b.lotId === lotId && !b.archived && b.statut !== "résilié",
    );
    if (!bail) return 0;
    const annuel = Number(bail.loyerHTActu || bail.loyerBaseHT || 0);
    return annuel > 0 ? Math.round((annuel / 12) * 100) / 100 : 0;
  };
  const lotsLoues = lots.filter((l) => l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue").length;

  const descParts = [actif.type, sciName, actif.ville].filter(Boolean);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
        <button onClick={() => navigate("/asset-management/actifs")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour aux actifs
        </button>

        <PageHeader
          title={actif.nom}
          description={descParts.length > 0 ? descParts.join(" — ") : undefined}
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Prix acquisition" metricKey="prixAcquisition" value={prixAcq} formatFn={formatCurrency} icon={Building2} variant="primary" gradient delay={0} />
          <KpiCard label="Coût total" metricKey="prixAcquisition" value={fraisTotal} formatFn={formatCurrency} icon={PiggyBank} variant="warning" gradient delay={1} />
          <KpiCard label="Loyer annuel (lots)" metricKey="loyerHT" value={loyerAnnuelTotal} formatFn={formatCurrency} icon={TrendingUp} variant="success" gradient delay={2} />
          <KpiCard label="Lots" value={lots.length} formatFn={(n) => `${lotsLoues}/${n} loués`} icon={Home} delay={3} />
        </div>

        {/* Informations générales */}
        <GlassCard>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <MapPin className="h-4 w-4" /> Informations générales
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Adresse" value={actif.adresse || "—"} />
            <InfoRow label="Ville" value={actif.ville || "—"} />
            <InfoRow label="Code postal" value={actif.codePostal || "—"} />
            <InfoRow label="SCI" value={sciName ? <Badge variant="primary">{sciName}</Badge> : "—"} />
            <InfoRow label="Type" value={actif.type ? <Badge variant={typeVariant[actif.type] || "default"}>{actif.type}</Badge> : "—"} />
            <InfoRow label="Date acquisition" value={formatDate(actif.dateAcquisition)} />
            <InfoRow label={<InfoTooltip metricKey="surface">Surface</InfoTooltip>} value={actif.surface ? `${actif.surface} m²` : "—"} />
            <InfoRow label={<InfoTooltip metricKey="surfaceCarrez">Surface Carrez</InfoTooltip>} value={actif.surfaceCarrez ? `${actif.surfaceCarrez} m²` : "—"} />
            <InfoRow label="DPE" value={actif.dpe ? <Badge>{actif.dpe}</Badge> : "—"} />
            <InfoRow label="Syndic" value={actif.syndic || "—"} />
          </div>
        </GlassCard>

        {/* Acquisition */}
        <GlassCard delay={1}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <PiggyBank className="h-4 w-4" /> Acquisition
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoRow label={<InfoTooltip metricKey="prixAcquisition">Prix acquisition</InfoTooltip>} value={actif.prixAcquisition ? formatCurrency(actif.prixAcquisition) : "—"} />
            <InfoRow label="Frais notaire" value={actif.fraisNotaire ? formatCurrency(actif.fraisNotaire) : "—"} />
            <InfoRow label="Frais agence" value={actif.fraisAgence ? formatCurrency(actif.fraisAgence) : "—"} />
            <InfoRow label="Travaux" value={actif.montantTravaux ? formatCurrency(actif.montantTravaux) : "—"} />
          </div>
        </GlassCard>

        {/* Charges annuelles */}
        <GlassCard delay={2}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <Calendar className="h-4 w-4" /> Charges annuelles
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label={<InfoTooltip metricKey="chargesAnnuelles">Charges annuelles</InfoTooltip>} value={actif.chargesAnnuelles ? formatCurrency(actif.chargesAnnuelles) : "—"} />
            <InfoRow label={<InfoTooltip metricKey="taxeFonciere">Taxe foncière</InfoTooltip>} value={actif.taxeFonciere ? formatCurrency(actif.taxeFonciere) : "—"} />
            <InfoRow label={<InfoTooltip metricKey="assurance">Assurance PNO</InfoTooltip>} value={actif.assurancePno ? formatCurrency(actif.assurancePno) : "—"} />
          </div>
        </GlassCard>

        {/* Valorisation */}
        <GlassCard delay={3}>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Valorisation
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label={<InfoTooltip metricKey="tauxCapitalisation">Taux capitalisation</InfoTooltip>} value={actif.tauxCapitalisation ? `${actif.tauxCapitalisation}%` : "—"} />
            <InfoRow label={<InfoTooltip metricKey="prixM2">Prix/m² marché</InfoTooltip>} value={actif.prixM2Marche ? `${formatCurrency(actif.prixM2Marche)}/m²` : "—"} />
          </div>
        </GlassCard>

        {/* Lots */}
        <Section title={`Lots (${lots.length})`} delay={4}>
          <GlassCard hover={false}>
            {lots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun lot rattaché à cet actif.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Désignation</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Étage</th>
                      <th className="pb-3 font-medium text-right"><InfoTooltip metricKey="surface">Surface</InfoTooltip></th>
                      <th className="pb-3 font-medium text-right"><InfoTooltip metricKey="mensualite">Loyer mensuel</InfoTooltip></th>
                      <th className="pb-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot) => (
                      <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 font-medium">{lot.designation}</td>
                        <td className="py-3">{lot.type ? <Badge>{lot.type}</Badge> : "—"}</td>
                        <td className="py-3">{lot.etage || "—"}</td>
                        <td className="py-3 text-right">{lot.surface ? `${lot.surface} m²` : "—"}</td>
                        <td className="py-3 text-right">{(() => { const m = getLoyerMensuelLot(lot.id); return m > 0 ? formatCurrency(m) : "—"; })()}</td>
                        <td className="py-3">
                          {lot.statut ? (
                            <Badge variant={lot.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue" ? "success" : "warning"}>{lot.statut}</Badge>
                          ) : "—"}
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
        {actif.notes && (
          <Section title="Notes" delay={5}>
            <GlassCard hover={false}>
              <p className="whitespace-pre-wrap text-sm">{actif.notes}</p>
            </GlassCard>
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function InfoRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
