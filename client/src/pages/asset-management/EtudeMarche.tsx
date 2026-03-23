import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { PageHeader } from "../../components/ui/page-header";
import { GlassCard } from "../../components/ui/glass-card";
import { Badge } from "../../components/ui/badge";
import {
  RefreshCw, Building2, MapPin, TrendingUp, TrendingDown,
  Database, Search, ChevronDown, ChevronUp, AlertTriangle,
  Home, Store, Briefcase, Loader2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface Phase1Data {
  valeurVenale: {
    prixM2Median: number;
    prixM2Bas: number;
    prixM2Haut: number;
    nbTransactions: number | null;
    periode: string | null;
    source: string;
  } | null;
  valeurLocative: {
    loyerM2Median: number;
    loyerM2Bas: number;
    loyerM2Haut: number;
    periode: string | null;
    source: string;
  } | null;
  tauxCapi: {
    taux: number;
    tauxBas: number;
    tauxHaut: number;
    fiabilite: string | null;
    methode: string | null;
  } | null;
}

interface Phase2Entry {
  source: string;
  prixM2Median?: number | null;
  prixM2Bas?: number | null;
  prixM2Haut?: number | null;
  loyerM2Median?: number | null;
  loyerM2Bas?: number | null;
  loyerM2Haut?: number | null;
  nbAnnonces: number | null;
  tauxCapiDeduit?: number | null;
  notes: string | null;
  dateReleve: string | null;
}

interface Phase2Data {
  vente: Phase2Entry[];
  location: Phase2Entry[];
  tauxCapiMoyen: number | null;
  dateReleve: string | null;
}

interface ActifInfo {
  id: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  type: string | null;
  surface: string | null;
  surfaceCarrez: string | null;
  lat: number | null;
  lng: number | null;
  tauxCapitalisation: string | null;
  prixM2Marche: string | null;
}

interface EtudeActif {
  actif: ActifInfo;
  phase1: Phase1Data;
  phase2: Phase2Data;
}

// ============================================================
// Helpers
// ============================================================

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    meilleursagents: "MeilleursAgents",
    leboncoin: "LeBonCoin",
    seloger: "SeLoger",
    seloger_bc: "SeLoger B&C",
    pap: "PAP",
    bureauxlocaux: "BureauxLocaux",
  };
  return labels[source] || source;
}

function sourceBadgeColor(source: string): string {
  const colors: Record<string, string> = {
    meilleursagents: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    leboncoin: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    seloger: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    seloger_bc: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    pap: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    bureauxlocaux: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  };
  return colors[source] || "bg-muted text-muted-foreground";
}

function typeIcon(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t.includes("bureau")) return Briefcase;
  if (t.includes("commercial") || t.includes("commerce")) return Store;
  if (t.includes("résidentiel") || t.includes("residentiel")) return Home;
  return Building2;
}

function fmtPrix(v: number | null | undefined): string {
  if (v == null || v === 0) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €/m²";
}

function fmtLoyer(v: number | null | undefined): string {
  if (v == null || v === 0) return "-";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + " €/m²/mois";
}

function fmtTaux(v: number | null | undefined): string {
  if (v == null || v === 0) return "-";
  return v.toFixed(2) + " %";
}

function ecartPercent(v1: number | null | undefined, v2: number | null | undefined): string | null {
  if (!v1 || !v2 || v2 === 0) return null;
  const diff = ((v1 - v2) / v2) * 100;
  return (diff >= 0 ? "+" : "") + diff.toFixed(1) + "%";
}

// ============================================================
// Sub-components
// ============================================================

function Phase1Block({ data }: { data: Phase1Data }) {
  const hasData = data.valeurVenale || data.valeurLocative || data.tauxCapi;

  if (!hasData) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        Aucune donnee officielle. Lancez la synchronisation DVF + ANIL depuis "Donnees de marche".
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Valeur vénale */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Valeur venale (DVF)</p>
          <p className="text-lg font-bold">{fmtPrix(data.valeurVenale?.prixM2Median)}</p>
          {data.valeurVenale && (
            <p className="text-xs text-muted-foreground">
              {fmtPrix(data.valeurVenale.prixM2Bas)} — {fmtPrix(data.valeurVenale.prixM2Haut)}
              {data.valeurVenale.nbTransactions ? ` (${data.valeurVenale.nbTransactions} tx)` : ""}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Valeur locative (ANIL)</p>
          <p className="text-lg font-bold">{fmtLoyer(data.valeurLocative?.loyerM2Median)}</p>
          {data.valeurLocative && (
            <p className="text-xs text-muted-foreground">
              {fmtLoyer(data.valeurLocative.loyerM2Bas)} — {fmtLoyer(data.valeurLocative.loyerM2Haut)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Taux capi deduit</p>
          <p className="text-lg font-bold">{fmtTaux(data.tauxCapi?.taux)}</p>
          {data.tauxCapi && (
            <p className="text-xs text-muted-foreground">
              {fmtTaux(data.tauxCapi.tauxBas)} — {fmtTaux(data.tauxCapi.tauxHaut)}
              {data.tauxCapi.fiabilite && (
                <span className={`ml-1 ${
                  data.tauxCapi.fiabilite === "haute" ? "text-emerald-500" :
                  data.tauxCapi.fiabilite === "moyenne" ? "text-amber-500" : "text-red-500"
                }`}>
                  ({data.tauxCapi.fiabilite})
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Phase2Block({ data }: { data: Phase2Data }) {
  const hasData = data.vente.length > 0 || data.location.length > 0;

  if (!hasData) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        Aucune donnee scrapee. Cliquez sur "Synchroniser toutes les plateformes" pour lancer la collecte.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vente */}
      {data.vente.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Valeurs venales (annonces vente)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3 text-right">Median</th>
                  <th className="py-2 pr-3 text-right">Bas</th>
                  <th className="py-2 pr-3 text-right">Haut</th>
                  <th className="py-2 pr-3 text-right">Annonces</th>
                  <th className="py-2 pr-3 text-right">Taux capi</th>
                </tr>
              </thead>
              <tbody>
                {data.vente.map((entry, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sourceBadgeColor(entry.source)}`}>
                        {sourceLabel(entry.source)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtPrix(entry.prixM2Median)}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{fmtPrix(entry.prixM2Bas)}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{fmtPrix(entry.prixM2Haut)}</td>
                    <td className="py-2 pr-3 text-right">{entry.nbAnnonces || "-"}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtTaux(entry.tauxCapiDeduit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Location */}
      {data.location.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Valeurs locatives (annonces location)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3 text-right">Median</th>
                  <th className="py-2 pr-3 text-right">Bas</th>
                  <th className="py-2 pr-3 text-right">Haut</th>
                  <th className="py-2 pr-3 text-right">Annonces</th>
                  <th className="py-2 pr-3 text-right">Taux capi</th>
                </tr>
              </thead>
              <tbody>
                {data.location.map((entry, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sourceBadgeColor(entry.source)}`}>
                        {sourceLabel(entry.source)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtLoyer(entry.loyerM2Median)}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{fmtLoyer(entry.loyerM2Bas)}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{fmtLoyer(entry.loyerM2Haut)}</td>
                    <td className="py-2 pr-3 text-right">{entry.nbAnnonces || "-"}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtTaux(entry.tauxCapiDeduit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Taux capi moyen Phase 2 */}
      {data.tauxCapiMoyen && (
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 inline-block">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Taux capi moyen Phase 2</p>
          <p className="text-lg font-bold">{fmtTaux(data.tauxCapiMoyen)}</p>
        </div>
      )}
    </div>
  );
}

function SyntheseBlock({ phase1, phase2 }: { phase1: Phase1Data; phase2: Phase2Data }) {
  const p1Prix = phase1.valeurVenale?.prixM2Median;
  const p1Loyer = phase1.valeurLocative?.loyerM2Median;
  const p1Taux = phase1.tauxCapi?.taux;

  // Moyenne Phase 2 vente
  const p2Ventes = phase2.vente.filter((v) => v.prixM2Median);
  const p2Prix = p2Ventes.length > 0
    ? Math.round(p2Ventes.reduce((sum, v) => sum + (v.prixM2Median || 0), 0) / p2Ventes.length)
    : null;

  // Moyenne Phase 2 location
  const p2Locations = phase2.location.filter((l) => l.loyerM2Median);
  const p2Loyer = p2Locations.length > 0
    ? Math.round(p2Locations.reduce((sum, l) => sum + (l.loyerM2Median || 0), 0) / p2Locations.length * 100) / 100
    : null;

  const p2Taux = phase2.tauxCapiMoyen;

  const hasAnything = (p1Prix && p2Prix) || (p1Loyer && p2Loyer) || (p1Taux && p2Taux);
  if (!hasAnything) return null;

  return (
    <div className="rounded-lg border-2 border-dashed border-border/60 p-4 mt-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Synthese : ecart Phase 1 vs Phase 2</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Ecart prix */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">Valeur venale</div>
          <EcartBadge v1={p2Prix} v2={p1Prix} />
        </div>
        {/* Ecart loyer */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">Valeur locative</div>
          <EcartBadge v1={p2Loyer} v2={p1Loyer} />
        </div>
        {/* Ecart taux */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">Taux capi</div>
          <EcartBadge v1={p2Taux} v2={p1Taux} suffix=" pts" />
        </div>
      </div>
    </div>
  );
}

function EcartBadge({ v1, v2, suffix }: { v1: number | null | undefined; v2: number | null | undefined; suffix?: string }) {
  if (!v1 || !v2) return <span className="text-xs text-muted-foreground">-</span>;

  const diff = suffix ? (v1 - v2) : ((v1 - v2) / v2) * 100;
  const label = suffix
    ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}${suffix}`
    : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;

  const isPositive = diff > 0;
  const color = Math.abs(diff) < 5
    ? "text-amber-600 dark:text-amber-400"
    : isPositive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${color}`}>
      {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function ActifCard({ etude, index }: { etude: EtudeActif; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const { actif, phase1, phase2 } = etude;
  const Icon = typeIcon(actif.type);

  return (
    <GlassCard delay={index} hover={false} className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate">{actif.nom}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{actif.adresse || `${actif.ville} ${actif.codePostal}`}</span>
              {actif.type && (
                <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                  {actif.type}
                </Badge>
              )}
              {actif.surface && (
                <span className="shrink-0">{Number(actif.surface).toFixed(0)} m²</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Quick KPIs */}
          {phase1.tauxCapi && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-muted-foreground">P1 Taux capi</p>
              <p className="text-sm font-bold">{fmtTaux(phase1.tauxCapi.taux)}</p>
            </div>
          )}
          {phase2.tauxCapiMoyen && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-muted-foreground">P2 Taux capi</p>
              <p className="text-sm font-bold">{fmtTaux(phase2.tauxCapiMoyen)}</p>
            </div>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-5 space-y-5"
        >
          {/* Phase 1 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-blue-500" />
              <h4 className="text-sm font-semibold">Phase 1 — Donnees officielles (DVF + ANIL)</h4>
              <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                Fiable
              </Badge>
            </div>
            <Phase1Block data={phase1} />
          </div>

          {/* Phase 2 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-4 w-4 text-purple-500" />
              <h4 className="text-sm font-semibold">Phase 2 — Donnees marche actuel (scraping)</h4>
              <Badge variant="outline" className="text-[10px] py-0 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                Indicatif
              </Badge>
            </div>
            <Phase2Block data={phase2} />
          </div>

          {/* Synthèse */}
          <SyntheseBlock phase1={phase1} phase2={phase2} />
        </motion.div>
      )}
    </GlassCard>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function EtudeMarche() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  // Fetch étude de marché
  const { data: etudes = [], isLoading } = useQuery<EtudeActif[]>({
    queryKey: ["/api/am/marche/etude"],
    queryFn: () => apiRequest("/api/am/marche/etude"),
  });

  // Sync scraping global
  const syncScrapingMutation = useMutation({
    mutationFn: () => apiRequest("/api/am/marche/sync-scraping", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
    },
  });

  // Sync DVF + ANIL + compute taux capi (Phase 1 complète)
  const syncPhase1Mutation = useMutation({
    mutationFn: async () => {
      const dvf = await apiRequest("/api/am/marche/sync-dvf", { method: "POST" });
      const anil = await apiRequest("/api/am/marche/sync-anil", { method: "POST" });
      const capi = await apiRequest("/api/am/marche/compute-taux-capi", { method: "POST" });
      return { dvf, anil, capi };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/am/marche/etude"] });
    },
  });

  // Filter
  const types = [...new Set(etudes.map((e) => e.actif.type).filter(Boolean))];
  const filtered = filter === "all" ? etudes : etudes.filter((e) => e.actif.type === filter);

  const isSyncing = syncScrapingMutation.isPending || syncPhase1Mutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Etude de marche"
        description="Donnees venales et locatives par actif — Phase 1 (DVF/ANIL) et Phase 2 (scraping plateformes)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => syncPhase1Mutation.mutate()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {syncPhase1Mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4 text-blue-500" />
              )}
              Sync Phase 1 (DVF+ANIL)
            </button>
            <button
              onClick={() => syncScrapingMutation.mutate()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
            >
              {syncScrapingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync Phase 2 (toutes plateformes)
            </button>
          </div>
        }
      />

      {/* Status messages */}
      {syncPhase1Mutation.isSuccess && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          Phase 1 synchronisee avec succes.
        </motion.div>
      )}
      {syncScrapingMutation.isSuccess && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 text-sm text-purple-700 dark:text-purple-300">
          Phase 2 synchronisee. {(syncScrapingMutation.data as any)?.scraped || 0} resultats collectes pour {(syncScrapingMutation.data as any)?.total || 0} actifs.
        </motion.div>
      )}
      {(syncPhase1Mutation.isError || syncScrapingMutation.isError) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
          Erreur: {(syncPhase1Mutation.error || syncScrapingMutation.error)?.message}
        </motion.div>
      )}

      {/* Filter bar */}
      {types.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtrer :</span>
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              filter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border/50 hover:bg-muted"
            }`}
          >
            Tous ({etudes.length})
          </button>
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type!)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                filter === type ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border/50 hover:bg-muted"
              }`}
            >
              {type} ({etudes.filter((e) => e.actif.type === type).length})
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold">Aucun actif</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ajoutez des actifs avec une adresse et un code postal pour voir l'etude de marche.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Actif cards */}
      <div className="space-y-4">
        {filtered.map((etude, i) => (
          <ActifCard key={etude.actif.id} etude={etude} index={i} />
        ))}
      </div>
    </div>
  );
}
