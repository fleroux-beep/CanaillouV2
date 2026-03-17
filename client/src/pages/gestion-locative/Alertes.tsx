import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { AlertTriangle, Info, Clock, Bell } from "lucide-react";

type AlertLevel = "urgent" | "warning" | "info";

interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  description: string;
  bailNom: string;
}

const levelConfig: Record<AlertLevel, { color: string; bg: string; border: string; badgeVariant: "danger" | "warning" | "primary"; icon: typeof AlertTriangle }> = {
  urgent: {
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/10",
    border: "border-red-200 dark:border-red-800/40",
    badgeVariant: "danger",
    icon: AlertTriangle,
  },
  warning: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/10",
    border: "border-amber-200 dark:border-amber-800/40",
    badgeVariant: "warning",
    icon: AlertTriangle,
  },
  info: {
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/10",
    border: "border-orange-200 dark:border-orange-800/40",
    badgeVariant: "primary",
    icon: Info,
  },
};

export default function AlertesPage() {
  const { data: baux = [] } = useQuery({ queryKey: ["/api/gl/baux"], queryFn: () => apiRequest("/api/gl/baux") });
  const { data: allIndices = [] } = useQuery({ queryKey: ["/api/gl/indices"], queryFn: () => apiRequest("/api/gl/indices") });

  const alerts = useMemo(() => {
    const result: Alert[] = [];
    const now = new Date();
    const oneMonth = new Date(now);
    oneMonth.setMonth(oneMonth.getMonth() + 1);
    const threeMonths = new Date(now);
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    const twelveMonths = new Date(now);
    twelveMonths.setMonth(twelveMonths.getMonth() + 12);

    const bauxActifs = baux.filter((b: any) => !b.archived);

    bauxActifs.forEach((b: any) => {
      // Échéance bail (fin de bail)
      if (b.dateFin) {
        const dateFin = new Date(b.dateFin);
        if (dateFin <= sixMonths && dateFin > now) {
          const isUrgent = dateFin <= threeMonths;
          const daysLeft = Math.ceil((dateFin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          result.push({
            id: `echeance-${b.id}`,
            level: isUrgent ? "urgent" : "warning",
            title: "Échéance bail",
            description: `Le bail arrive à échéance dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""} (${new Date(b.dateFin).toLocaleDateString("fr-FR")})`,
            bailNom: b.nom,
          });
        }
        // Bail expiré
        if (dateFin <= now) {
          result.push({
            id: `expire-${b.id}`,
            level: "urgent",
            title: "Bail expiré",
            description: `Le bail a expiré le ${dateFin.toLocaleDateString("fr-FR")}. Renouvellement nécessaire.`,
            bailNom: b.nom,
          });
        }
      }

      // Échéances triennales
      for (const field of ["echTrien1", "echTrien2", "echTrien3"]) {
        const dateStr = b[field];
        if (dateStr) {
          const dateEch = new Date(dateStr);
          if (dateEch > now && dateEch <= sixMonths) {
            const daysLeft = Math.ceil((dateEch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            result.push({
              id: `${field}-${b.id}`,
              level: daysLeft <= 90 ? "urgent" : "warning",
              title: "Échéance triennale",
              description: `Échéance triennale dans ${daysLeft} jours (${dateEch.toLocaleDateString("fr-FR")})`,
              bailNom: b.nom,
            });
          }
        }
      }

      // Période ferme fin
      if (b.periodeFermeFin) {
        const datePF = new Date(b.periodeFermeFin);
        if (datePF > now && datePF <= sixMonths) {
          const daysLeft = Math.ceil((datePF.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          result.push({
            id: `periodefin-${b.id}`,
            level: daysLeft <= 90 ? "urgent" : "warning",
            title: "Fin de période ferme",
            description: `La période ferme se termine dans ${daysLeft} jours (${datePF.toLocaleDateString("fr-FR")})`,
            bailNom: b.nom,
          });
        }
      }

      // Indexation non effectuée : bail avec indice mais loyerHTActu = loyerBaseHT ou absent
      if (b.indiceReference && b.loyerBaseHT) {
        const base = Number(b.loyerBaseHT);
        const actu = Number(b.loyerHTActu || 0);
        if (actu === 0 || actu === base) {
          result.push({
            id: `indexation-pending-${b.id}`,
            level: "warning",
            title: "Indexation non effectuée",
            description: `Le loyer n'a jamais été indexé (indice ${b.indiceReference}). Lancer l'indexation automatique.`,
            bailNom: b.nom,
          });
        }
      }

      // Indice de référence manquant
      if (!b.indiceReference) {
        result.push({
          id: `indice-${b.id}`,
          level: "info",
          title: "Indice manquant",
          description: "Aucun indice de référence n'est renseigné pour ce bail",
          bailNom: b.nom,
        });
      }

      // Charges non renseignées
      if (!b.charges || Number(b.charges) === 0) {
        result.push({
          id: `charges-${b.id}`,
          level: "info",
          title: "Charges non renseignées",
          description: "Le montant des charges n'est pas renseigné ou est à zéro",
          bailNom: b.nom,
        });
      }

      // Dépôt de garantie manquant
      if (!b.depotGarantie || Number(b.depotGarantie) === 0) {
        result.push({
          id: `depot-${b.id}`,
          level: "info",
          title: "Dépôt de garantie manquant",
          description: "Aucun dépôt de garantie renseigné",
          bailNom: b.nom,
        });
      }
    });

    // Sort: urgent first, then warning, then info
    const order: Record<AlertLevel, number> = { urgent: 0, warning: 1, info: 2 };
    result.sort((a, b) => order[a.level] - order[b.level]);

    return result;
  }, [baux, allIndices]);

  const totalAlertes = alerts.length;
  const alertesUrgentes = alerts.filter((a) => a.level === "urgent").length;
  const alertesInfo = alerts.filter((a) => a.level === "info").length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Alertes"
          description="Échéances et événements à surveiller"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total alertes"
            value={totalAlertes}
            icon={Bell}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Alertes urgentes"
            value={alertesUrgentes}
            icon={AlertTriangle}
            variant="danger"
            gradient
            delay={1}
          />
          <KpiCard
            label="Alertes info"
            value={alertesInfo}
            icon={Info}
            variant="warning"
            gradient
            delay={2}
          />
        </div>

        {/* Alert cards */}
        {alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert, i) => {
              const config = levelConfig[alert.level];
              const Icon = config.icon;

              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.15 + i * 0.06, 0.65), duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  className={`flex items-start gap-4 rounded-xl border p-4 transition-shadow hover:shadow-md ${config.bg} ${config.border}`}
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert.level === "urgent" ? "bg-red-100 dark:bg-red-900/30" : alert.level === "warning" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                    <Icon className={`h-4.5 w-4.5 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{alert.title}</h4>
                      <Badge variant={config.badgeVariant}>
                        {alert.level === "urgent" ? "Urgent" : alert.level === "warning" ? "Attention" : "Info"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{alert.description}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      <Clock className="mr-1 inline-block h-3 w-3" />
                      {alert.bailNom}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <GlassCard delay={3}>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Bell className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune alerte</h3>
              <p className="mt-1 text-sm text-muted-foreground">Tous les baux sont en ordre. Aucun événement à signaler.</p>
            </div>
          </GlassCard>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
