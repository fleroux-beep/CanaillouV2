/**
 * Indexation automatique — Sync INSEE + indexation baux AM
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
import {
  RefreshCw, Database, Calculator, Zap, CheckCircle,
  TrendingUp, Calendar, AlertTriangle, History,
} from "lucide-react";

interface IndexRecord {
  id: string;
  type: string;
  trimestre: string;
  valeur: string;
}

interface BailAM {
  id: string;
  actifId: string | null;
  typeBail: string | null;
  indiceReference: string | null;
  trimestreRef: string | null;
  valeurIndiceBase: string | null;
  loyerBaseHT: string | null;
  loyerHTActu: string | null;
  loyerAnnuel: string | null;
  forceManual: boolean | null;
  archived: boolean | null;
  notes: string | null;
}

interface HistoriqueRow {
  id: string;
  bailId: string;
  dateApplication: string;
  ancienLoyer: string | null;
  nouveauLoyer: string | null;
  indiceBase: string | null;
  indiceNouveau: string | null;
  typeIndice: string | null;
  trimestre: string | null;
  tauxVariation: string | null;
  notes: string | null;
  createdAt: string;
}

function fmtEuro(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!v || isNaN(n) || n === 0) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €";
}

function fmtTaux(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!v || isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

export default function IndexationAutoPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: allIndices = [] } = useQuery<IndexRecord[]>({
    queryKey: ["/api/indexation/indices"],
    queryFn: () => apiRequest("/api/indexation/indices"),
  });

  const { data: baux = [] } = useQuery<BailAM[]>({
    queryKey: ["/api/indexation/baux-am"],
    queryFn: () => apiRequest("/api/indexation/baux-am"),
  });

  const { data: historique = [] } = useQuery<HistoriqueRow[]>({
    queryKey: ["/api/indexation/historique"],
    queryFn: () => apiRequest("/api/indexation/historique"),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/indexation/indices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/indexation/baux-am"] });
    queryClient.invalidateQueries({ queryKey: ["/api/indexation/historique"] });
  };

  const syncINSEEMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/sync-insee", { method: "POST" }),
    onSuccess: (data) => { setLastResult({ type: "insee", ...data }); invalidateAll(); },
  });

  const autoIndexMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/auto-index", { method: "POST" }),
    onSuccess: (data) => { setLastResult({ type: "index", ...data }); invalidateAll(); },
  });

  const fullPipelineMutation = useMutation({
    mutationFn: () => apiRequest("/api/indexation/full-pipeline", { method: "POST" }),
    onSuccess: (data) => { setLastResult({ type: "pipeline", ...data }); invalidateAll(); },
  });

  // Stats
  const indiceTypes = ["IRL", "ILC", "ILAT", "ICC"];
  const latestByType = indiceTypes.map((type) => {
    const vals = allIndices.filter((i) => i.type === type).sort((a, b) => b.trimestre.localeCompare(a.trimestre));
    return { type, latest: vals[0] || null, count: vals.length };
  });

  const bauxEligibles = baux.filter((b) =>
    b.indiceReference && b.loyerBaseHT && Number(b.loyerBaseHT) > 0
    && b.valeurIndiceBase && Number(b.valeurIndiceBase) > 0
    && !b.forceManual && !b.archived,
  );
  const bauxNonIndexes = bauxEligibles.filter((b) => {
    const base = Number(b.loyerBaseHT);
    const actu = Number(b.loyerHTActu || 0);
    return actu === 0 || Math.abs(actu - base) < 0.01;
  });
  const bauxSansIndice = baux.filter((b) => !b.indiceReference && !b.archived);

  const isAnyLoading = syncINSEEMutation.isPending || autoIndexMutation.isPending || fullPipelineMutation.isPending;

  // Historique columns
  const histColumns: Column<HistoriqueRow>[] = [
    { key: "dateApplication", label: "Date", sortable: true, render: (r) => r.dateApplication || "—" },
    { key: "typeIndice", label: "Indice", sortable: true, render: (r) => r.typeIndice ? <Badge>{r.typeIndice}</Badge> : "—" },
    { key: "trimestre", label: "Trimestre", sortable: true, render: (r) => r.trimestre || "—" },
    { key: "ancienLoyer", label: "Ancien loyer", align: "right", render: (r) => fmtEuro(r.ancienLoyer) },
    { key: "nouveauLoyer", label: "Nouveau loyer", align: "right", render: (r) => <span className="font-semibold">{fmtEuro(r.nouveauLoyer)}</span> },
    { key: "tauxVariation", label: "Variation", align: "right", render: (r) => {
      const n = Number(r.tauxVariation);
      if (isNaN(n)) return "—";
      return <span className={n > 0 ? "text-emerald-600 font-medium" : n < 0 ? "text-red-500 font-medium" : ""}>{fmtTaux(r.tauxVariation)}</span>;
    }},
    { key: "notes", label: "Notes", render: (r) => <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{r.notes || "—"}</span> },
  ];

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <PageHeader
          title="Indexation Automatique"
          description="Synchronisation INSEE et indexation automatique des loyers (baux AM)"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Indices en base" value={allIndices.length} icon={Database} variant="primary" gradient delay={0} />
          <KpiCard label="Baux éligibles" value={bauxEligibles.length} icon={Calculator} variant="primary" gradient delay={1} />
          <KpiCard label="En attente" value={bauxNonIndexes.length} icon={AlertTriangle} variant={bauxNonIndexes.length > 0 ? "warning" : "success"} gradient delay={2} />
          <KpiCard label="Sans indice" value={bauxSansIndice.length} icon={AlertTriangle} variant={bauxSansIndice.length > 0 ? "warning" : "success"} gradient delay={3} />
          <KpiCard label="Indexations appliquées" value={historique.length} icon={History} variant="primary" gradient delay={4} />
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
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
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
                <p className="text-xs text-muted-foreground mb-4">Applique l'indexation sur les {bauxEligibles.length} baux AM éligibles</p>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
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
                <p className="text-xs text-muted-foreground mb-4">Sync INSEE + attribution indices + indexation</p>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
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
        {lastResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard>
              <div className="flex items-start gap-3 p-4">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="text-sm space-y-1">
                  <h4 className="font-semibold">{lastResult.message}</h4>
                  {lastResult.sync && (
                    <p className="text-muted-foreground">
                      INSEE: {lastResult.sync.synced} indices synchronisés
                      {lastResult.sync.errors?.length > 0 && <span className="text-amber-500"> — {lastResult.sync.errors.join(", ")}</span>}
                    </p>
                  )}
                  {lastResult.assignDefaults && (
                    <p className="text-muted-foreground">
                      Attribution: {lastResult.assignDefaults.assigned} baux mis à jour
                    </p>
                  )}
                  {lastResult.indexation && (
                    <p className="text-muted-foreground">
                      Indexation: {lastResult.indexation.indexed} baux indexés, {lastResult.indexation.skipped || 0} ignorés
                      {lastResult.indexation.errors?.length > 0 && <span className="text-amber-500"> — {lastResult.indexation.errors.length} erreur(s)</span>}
                    </p>
                  )}
                  {lastResult.synced !== undefined && !lastResult.sync && (
                    <p className="text-muted-foreground">{lastResult.synced} indices synchronisés</p>
                  )}
                  {lastResult.indexed !== undefined && !lastResult.indexation && (
                    <p className="text-muted-foreground">{lastResult.indexed} baux indexés</p>
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
              <motion.div key={type} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
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

        {/* Historique des indexations */}
        {historique.length > 0 && (
          <Section title="Historique des indexations">
            <DataTable
              data={historique}
              columns={histColumns}
              searchKeys={["typeIndice", "trimestre", "notes"]}
              searchPlaceholder="Rechercher..."
              emptyMessage="Aucune indexation appliquée"
              exportFileName="historique-indexations"
            />
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
