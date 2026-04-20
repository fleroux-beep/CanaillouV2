/**
 * Indexation automatique INSEE — vue consolidée
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../lib/utils";
import {
  RefreshCw, Database, Calculator, Zap, CheckCircle,
  Calendar, AlertTriangle,
} from "lucide-react";

interface Indice {
  id: string;
  type: string;
  trimestre: string;
  valeur: string;
}

interface BailAM {
  id: string;
  nom?: string;
  loyerBaseHT?: string;
  loyerHTActu?: string;
  indiceReference?: string;
  trimestreRef?: string;
  valeurIndiceBase?: string;
  forceManual?: boolean;
  archived?: boolean;
}

export default function IndexationAutoPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: indices = [] } = useQuery<Indice[]>({
    queryKey: ["/api/indexation/indices"],
    queryFn: () => apiRequest("/api/indexation/indices"),
  });

  const { data: baux = [] } = useQuery<BailAM[]>({
    queryKey: ["/api/am/baux"],
    queryFn: () => apiRequest("/api/am/baux"),
  });

  const fullPipelineMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/full-pipeline", { method: "POST" }),
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/indexation/indices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/am/baux"] });
    },
  });

  const activeBaux = baux.filter((b) => !b.archived);
  const bauxWithIndice = activeBaux.filter((b) => b.indiceReference);
  const bauxEligibles = activeBaux.filter(
    (b) => b.indiceReference && b.loyerBaseHT && b.valeurIndiceBase && !b.forceManual,
  );
  const bauxIndexed = bauxEligibles.filter((b) => {
    const base = Number(b.loyerBaseHT || 0);
    const actu = Number(b.loyerHTActu || 0);
    return actu > 0 && actu !== base;
  });

  const indiceTypes = ["IRL", "ILC", "ILAT", "ICC"];
  const latestByType = indiceTypes.map((type) => {
    const vals = indices
      .filter((i) => i.type === type)
      .sort((a, b) => b.trimestre.localeCompare(a.trimestre));
    return { type, latest: vals[0] || null, count: vals.length };
  });

  const bailColumns: Column<BailAM>[] = [
    {
      key: "nom",
      label: "Bail",
      sortable: true,
      render: (r) => <span className="font-medium text-sm">{r.nom || "—"}</span>,
    },
    {
      key: "indiceReference",
      label: "Indice",
      sortable: true,
      render: (r) => r.indiceReference
        ? <Badge variant="primary">{r.indiceReference}</Badge>
        : <span className="text-muted-foreground text-xs">Non défini</span>,
    },
    {
      key: "trimestreRef",
      label: "Trimestre réf.",
      sortable: true,
      render: (r) => <span className="text-sm">{r.trimestreRef || "—"}</span>,
    },
    {
      key: "valeurIndiceBase",
      label: "Valeur base",
      align: "right" as const,
      render: (r) => <span className="text-sm">{r.valeurIndiceBase ? Number(r.valeurIndiceBase).toFixed(2) : "—"}</span>,
    },
    {
      key: "loyerBaseHT",
      label: "Loyer base",
      align: "right" as const,
      sortable: true,
      render: (r) => r.loyerBaseHT ? formatCurrency(r.loyerBaseHT) : "—",
    },
    {
      key: "loyerHTActu",
      label: "Loyer indexé",
      align: "right" as const,
      sortable: true,
      render: (r) => r.loyerHTActu ? formatCurrency(r.loyerHTActu) : "—",
    },
    {
      key: "statut" as any,
      label: "Statut",
      render: (r) => {
        if (r.forceManual) return <Badge variant="outline">Manuel</Badge>;
        if (!r.indiceReference) return <Badge variant="outline">Pas d'indice</Badge>;
        if (!r.valeurIndiceBase) return <Badge variant="warning">Base manquante</Badge>;
        const base = Number(r.loyerBaseHT || 0);
        const actu = Number(r.loyerHTActu || 0);
        if (actu > 0 && actu !== base) return <Badge variant="success">Indexé</Badge>;
        return <Badge variant="warning">En attente</Badge>;
      },
    },
  ];

  const allErrors: string[] = [
    ...(lastResult?.sync?.errors ?? []),
    ...(lastResult?.indexation?.errors ?? []),
    ...(lastResult?.errors ?? []),
  ];
  const allSkipped: { bail: string; reason: string }[] = [
    ...(lastResult?.indexation?.skipped ?? []),
    ...(lastResult?.skipped ?? []),
  ];

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Indexation Automatique"
          description="Synchronisation INSEE et indexation des loyers AM"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Baux avec indice" value={bauxWithIndice.length} icon={Database} variant="primary" gradient delay={0} />
          <KpiCard label="Éligibles à l'indexation" value={bauxEligibles.length} icon={Calculator} variant="primary" gradient delay={1} />
          <KpiCard label="Déjà indexés" value={bauxIndexed.length} icon={CheckCircle} variant="success" gradient delay={2} />
          <KpiCard
            label="En attente"
            value={bauxEligibles.length - bauxIndexed.length}
            icon={AlertTriangle}
            variant={bauxEligibles.length - bauxIndexed.length > 0 ? "warning" : "success"}
            gradient
            delay={3}
          />
        </div>

        {/* Action */}
        <Section title="Synchronisation">
          <GlassCard>
            <div className="flex items-center justify-between p-4">
              <div>
                <h3 className="text-sm font-semibold">Pipeline complet</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Récupère les derniers indices INSEE (IRL, ILC, ILAT, ICC) puis applique l'indexation sur tous les baux éligibles.
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fullPipelineMutation.mutate()}
                disabled={fullPipelineMutation.isPending}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-rose-600 px-5 py-2.5 text-sm font-medium text-white hover:shadow-lg disabled:opacity-50 transition-shadow"
              >
                {fullPipelineMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {fullPipelineMutation.isPending ? "En cours…" : "Lancer la synchronisation"}
              </motion.button>
            </div>
          </GlassCard>
        </Section>

        {/* Result feedback */}
        {lastResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard>
              <div className="flex items-start gap-3 p-4">
                {allErrors.length > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold">
                    {lastResult.message || "Opération terminée"}
                  </h4>
                  {lastResult.sync && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      INSEE : {lastResult.sync.synced ?? 0} indices synchronisés
                    </p>
                  )}
                  {lastResult.indexation && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Indexation : {lastResult.indexation.indexed ?? 0} baux mis à jour
                    </p>
                  )}

                  {allErrors.length > 0 && (
                    <details className="mt-3" open>
                      <summary className="cursor-pointer text-xs font-semibold text-red-600 dark:text-red-400">
                        Erreurs ({allErrors.length})
                      </summary>
                      <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground space-y-0.5">
                        {allErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </details>
                  )}

                  {allSkipped.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Baux ignorés ({allSkipped.length})
                      </summary>
                      <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground space-y-0.5 max-h-60 overflow-y-auto">
                        {allSkipped.map((s, i) => (
                          <li key={i}>
                            <span className="font-medium">{s.bail}</span> — {s.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Latest indices */}
        <Section title="Derniers indices disponibles">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {latestByType.map(({ type, latest, count }, i) => (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
              >
                <GlassCard>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-muted-foreground">{type}</span>
                      <span className="text-[10px] text-muted-foreground">{count} valeurs</span>
                    </div>
                    {latest ? (
                      <>
                        <p className="text-2xl font-bold">{Number(latest.valeur).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <Calendar className="inline-block h-3 w-3 mr-1" />
                          {latest.trimestre}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucune donnée</p>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Baux indexation status table */}
        <Section title="Statut d'indexation par bail">
          <DataTable
            columns={bailColumns}
            data={activeBaux}
            searchKeys={["nom"]}
            searchPlaceholder="Rechercher un bail…"
          />
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}
