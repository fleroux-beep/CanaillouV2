/**
 * Axe 2 — Indexation automatique INSEE + cron
 * Interface pour déclencher la sync INSEE et l'auto-indexation
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import {
  RefreshCw, Database, Calculator, Zap, CheckCircle,
  TrendingUp, Calendar, AlertTriangle,
} from "lucide-react";

export default function IndexationAutoPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: indices = [] } = useQuery({
    queryKey: ["/api/gl/indices"],
    queryFn: () => apiRequest("/api/gl/indices"),
  });

  const { data: baux = [] } = useQuery({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });

  const syncINSEEMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/sync-insee", { method: "POST" }),
    onSuccess: (data) => {
      setLastResult({ type: "insee", ...data });
      queryClient.invalidateQueries({ queryKey: ["/api/gl/indices"] });
    },
  });

  const autoIndexMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/auto-index", { method: "POST" }),
    onSuccess: (data) => {
      setLastResult({ type: "index", ...data });
      queryClient.invalidateQueries({ queryKey: ["/api/gl/baux"] });
    },
  });

  const fullPipelineMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/full-pipeline", { method: "POST" }),
    onSuccess: (data) => {
      setLastResult({ type: "pipeline", ...data });
      queryClient.invalidateQueries({ queryKey: ["/api/gl/indices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gl/baux"] });
    },
  });

  // Stats
  const indiceTypes = ["IRL", "ILC", "ILAT", "ICC"];
  const latestByType = indiceTypes.map((type) => {
    const vals = indices.filter((i: any) => i.type === type).sort((a: any, b: any) => b.trimestre.localeCompare(a.trimestre));
    return { type, latest: vals[0] || null, count: vals.length };
  });

  const bauxEligibles = baux.filter((b: any) => b.indiceReference && b.loyerBaseHT && b.valeurIndiceBase && !b.forceManual && !b.archived);
  const bauxNonIndexes = bauxEligibles.filter((b: any) => {
    const base = Number(b.loyerBaseHT);
    const actu = Number(b.loyerHTActu || 0);
    return actu === 0 || actu === base;
  });

  const isAnyLoading = syncINSEEMutation.isPending || autoIndexMutation.isPending || fullPipelineMutation.isPending;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Indexation Automatique"
          description="Synchronisation INSEE et indexation automatique des loyers"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Indices en base" value={indices.length} icon={Database} variant="primary" gradient delay={0} />
          <KpiCard label="Baux éligibles" value={bauxEligibles.length} icon={Calculator} variant="primary" gradient delay={1} />
          <KpiCard label="En attente d'indexation" value={bauxNonIndexes.length} icon={AlertTriangle} variant={bauxNonIndexes.length > 0 ? "warning" : "success"} gradient delay={2} />
          <KpiCard label="Types d'indices" value={indiceTypes.length} icon={TrendingUp} variant="primary" gradient delay={3} />
        </div>

        {/* Actions */}
        <Section title="Actions">
          <div className="grid gap-4 sm:grid-cols-3">
            <GlassCard>
              <div className="flex flex-col items-center text-center p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30 mb-3">
                  <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Sync INSEE</h3>
                <p className="text-xs text-muted-foreground mb-4">Récupère les derniers indices IRL, ILC, ILAT, ICC depuis l'API INSEE</p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => syncINSEEMutation.mutate()}
                  disabled={isAnyLoading}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${syncINSEEMutation.isPending ? "animate-spin" : ""}`} />
                  Synchroniser
                </motion.button>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex flex-col items-center text-center p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30 mb-3">
                  <Calculator className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Auto-Indexation</h3>
                <p className="text-xs text-muted-foreground mb-4">Applique l'indexation sur les {bauxEligibles.length} baux éligibles</p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => autoIndexMutation.mutate()}
                  disabled={isAnyLoading}
                  className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  <Calculator className={`h-4 w-4 ${autoIndexMutation.isPending ? "animate-spin" : ""}`} />
                  Indexer
                </motion.button>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex flex-col items-center text-center p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-900/30 dark:to-rose-900/30 mb-3">
                  <Zap className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Pipeline Complet</h3>
                <p className="text-xs text-muted-foreground mb-4">Sync INSEE + Auto-indexation en une seule opération</p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => fullPipelineMutation.mutate()}
                  disabled={isAnyLoading}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-rose-600 px-4 py-2 text-sm font-medium text-white hover:shadow-md disabled:opacity-50 transition-shadow"
                >
                  <Zap className={`h-4 w-4 ${fullPipelineMutation.isPending ? "animate-spin" : ""}`} />
                  Tout lancer
                </motion.button>
              </div>
            </GlassCard>
          </div>
        </Section>

        {/* Result feedback */}
        {lastResult && (() => {
          // Aggrège les erreurs et baux ignorés provenant des différentes formes de réponses :
          // - sync direct : { synced, errors, skipped }
          // - pipeline : { sync: {...}, indexation: {...} }
          const inseeErrors: string[] = [
            ...(lastResult.errors && lastResult.type === "insee" ? lastResult.errors : []),
            ...(lastResult.sync?.errors ?? []),
          ];
          const indexErrors: string[] = [
            ...(lastResult.errors && lastResult.type === "index" ? lastResult.errors : []),
            ...(lastResult.indexation?.errors ?? []),
          ];
          const indexSkipped: { bail: string; reason: string }[] = [
            ...(lastResult.skipped && lastResult.type === "index" ? lastResult.skipped : []),
            ...(lastResult.indexation?.skipped ?? []),
          ];
          const hasIssues = inseeErrors.length > 0 || indexErrors.length > 0 || indexSkipped.length > 0;
          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <GlassCard>
                <div className="flex items-start gap-3 p-4">
                  {hasIssues ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold">Opération terminée</h4>
                    <p className="text-sm text-muted-foreground mt-1">{lastResult.message}</p>
                    {lastResult.sync && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        INSEE: {lastResult.sync.synced} indices synchronisés
                      </p>
                    )}
                    {lastResult.indexation && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Indexation: {lastResult.indexation.indexed} baux indexés
                      </p>
                    )}
                    {lastResult.synced !== undefined && (
                      <p className="text-xs text-muted-foreground mt-0.5">{lastResult.synced} indices synchronisés</p>
                    )}
                    {lastResult.indexed !== undefined && (
                      <p className="text-xs text-muted-foreground mt-0.5">{lastResult.indexed} baux indexés</p>
                    )}

                    {inseeErrors.length > 0 && (
                      <details className="mt-3" open>
                        <summary className="cursor-pointer text-xs font-semibold text-red-600 dark:text-red-400">
                          Erreurs INSEE ({inseeErrors.length}) — séries non récupérées
                        </summary>
                        <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground space-y-0.5">
                          {inseeErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {indexErrors.length > 0 && (
                      <details className="mt-3" open>
                        <summary className="cursor-pointer text-xs font-semibold text-red-600 dark:text-red-400">
                          Erreurs d'indexation ({indexErrors.length})
                        </summary>
                        <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground space-y-0.5">
                          {indexErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {indexSkipped.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-amber-600 dark:text-amber-400">
                          Baux ignorés ({indexSkipped.length}) — pourquoi ils n'ont pas été indexés
                        </summary>
                        <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground space-y-0.5 max-h-60 overflow-y-auto">
                          {indexSkipped.map((s, i) => (
                            <li key={i}>
                              <span className="font-medium">{s.bail}</span>
                              <span className="text-muted-foreground"> — {s.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })()}

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
      </motion.div>
    </AnimatePresence>
  );
}
