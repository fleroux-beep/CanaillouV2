/**
 * Axe 1 — Alertes intelligentes proactives (vue AM + GL combinée)
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import {
  AlertTriangle, Info, Bell, RefreshCw, Shield, TrendingDown,
  Building2, X, CheckCircle, Clock, Filter,
} from "lucide-react";

type Priority = "urgent" | "haute" | "normale" | "info";

const priorityConfig: Record<Priority, {
  color: string; bg: string; border: string;
  badgeVariant: "danger" | "warning" | "primary" | "default";
  icon: typeof AlertTriangle; label: string;
}> = {
  urgent: {
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/10",
    border: "border-red-200 dark:border-red-800/40",
    badgeVariant: "danger",
    icon: AlertTriangle,
    label: "Urgent",
  },
  haute: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/10",
    border: "border-amber-200 dark:border-amber-800/40",
    badgeVariant: "warning",
    icon: AlertTriangle,
    label: "Haute",
  },
  normale: {
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/10",
    border: "border-blue-200 dark:border-blue-800/40",
    badgeVariant: "primary",
    icon: Info,
    label: "Normale",
  },
  info: {
    color: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-900/10",
    border: "border-gray-200 dark:border-gray-800/40",
    badgeVariant: "default" as any,
    icon: Info,
    label: "Info",
  },
};

export default function AlertesAMPage() {
  const queryClient = useQueryClient();
  const [filterModule, setFilterModule] = useState<"all" | "am" | "gl">("all");
  const [filterPriority, setFilterPriority] = useState<"all" | Priority>("all");

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["/api/alertes/proactives"],
    queryFn: () => apiRequest("/api/alertes/proactives"),
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("/api/alertes/refresh", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alertes/proactives"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/alertes/${id}/dismiss`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alertes/proactives"] }),
  });

  const filtered = useMemo(() => {
    let result = alerts;
    if (filterModule !== "all") result = result.filter((a: any) => a.module === filterModule);
    if (filterPriority !== "all") result = result.filter((a: any) => a.priority === filterPriority);
    // Sort: urgent > haute > normale > info
    const order: Record<string, number> = { urgent: 0, haute: 1, normale: 2, info: 3 };
    result.sort((a: any, b: any) => (order[a.priority] || 3) - (order[b.priority] || 3));
    return result;
  }, [alerts, filterModule, filterPriority]);

  const counts = useMemo(() => ({
    total: alerts.length,
    urgent: alerts.filter((a: any) => a.priority === "urgent").length,
    haute: alerts.filter((a: any) => a.priority === "haute").length,
    am: alerts.filter((a: any) => a.module === "am").length,
    gl: alerts.filter((a: any) => a.module === "gl").length,
  }), [alerts]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Alertes Intelligentes"
            description="Alertes proactives générées automatiquement — AM + GL"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md transition-shadow disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Recalculer
          </motion.button>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total alertes" value={counts.total} icon={Bell} variant="primary" gradient delay={0} />
          <KpiCard label="Urgentes" value={counts.urgent} icon={AlertTriangle} variant="danger" gradient delay={1} />
          <KpiCard label="Asset Management" value={counts.am} icon={Building2} variant="warning" gradient delay={2} />
          <KpiCard label="Gestion Locative" value={counts.gl} icon={Shield} variant="primary" gradient delay={3} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
            {(["all", "am", "gl"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setFilterModule(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterModule === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "all" ? "Tous" : m === "am" ? "AM" : "GL"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
            {(["all", "urgent", "haute", "normale", "info"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterPriority === p ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "all" ? "Toutes" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Alert cards */}
        {isLoading ? (
          <GlassCard>
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </GlassCard>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map((alert: any, i: number) => {
              const config = priorityConfig[alert.priority as Priority] || priorityConfig.info;
              const Icon = config.icon;
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.1 + i * 0.04, 0.5), duration: 0.3 }}
                  className={`flex items-start gap-4 rounded-xl border p-4 transition-shadow hover:shadow-md ${config.bg} ${config.border}`}
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    alert.priority === "urgent" ? "bg-red-100 dark:bg-red-900/30" :
                    alert.priority === "haute" ? "bg-amber-100 dark:bg-amber-900/30" :
                    alert.priority === "normale" ? "bg-blue-100 dark:bg-blue-900/30" :
                    "bg-gray-100 dark:bg-gray-900/30"
                  }`}>
                    <Icon className={`h-4.5 w-4.5 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{alert.title}</h4>
                      <Badge variant={config.badgeVariant}>{config.label}</Badge>
                      <Badge variant={alert.module === "am" ? "warning" : "primary"}>
                        {alert.module === "am" ? "AM" : "GL"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                    {alert.targetDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <Clock className="mr-1 inline-block h-3 w-3" />
                        {new Date(alert.targetDate).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => dismissMutation.mutate(alert.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Masquer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <GlassCard delay={3}>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune alerte</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tous les indicateurs sont dans les normes. Cliquez sur "Recalculer" pour vérifier.
              </p>
            </div>
          </GlassCard>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
