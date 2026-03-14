import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { Calendar, Clock, FileText } from "lucide-react";

interface BailGL {
  id: string;
  nom: string;
  dateFin?: string;
  echTrien1?: string;
  echTrien2?: string;
  echTrien3?: string;
  periodeFermeFin?: string;
  archived?: boolean;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: "fin-bail" | "triennale" | "periode-ferme";
}

const typeBadgeVariant: Record<string, "primary" | "success" | "warning"> = {
  "fin-bail": "primary",
  triennale: "warning",
  "periode-ferme": "success",
};

const typeLabels: Record<string, string> = {
  "fin-bail": "Fin de bail",
  triennale: "Triennale",
  "periode-ferme": "Période ferme",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getYearKey(dateStr: string): string {
  return String(new Date(dateStr).getFullYear());
}

export default function CalendrierGLPage() {
  const { data: baux = [] } = useQuery<BailGL[]>({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });

  // Build events
  const events: CalendarEvent[] = [];

  for (const b of baux) {
    if (b.archived) continue;
    const nom = b.nom || "N/A";

    if (b.dateFin) {
      events.push({
        id: `fin-${b.id}`,
        date: b.dateFin,
        title: `Fin de bail: ${nom}`,
        type: "fin-bail",
      });
    }

    if (b.echTrien1) {
      events.push({
        id: `trien1-${b.id}`,
        date: b.echTrien1,
        title: `Échéance triennale: ${nom}`,
        type: "triennale",
      });
    }
    if (b.echTrien2) {
      events.push({
        id: `trien2-${b.id}`,
        date: b.echTrien2,
        title: `Échéance triennale: ${nom}`,
        type: "triennale",
      });
    }
    if (b.echTrien3) {
      events.push({
        id: `trien3-${b.id}`,
        date: b.echTrien3,
        title: `Échéance triennale: ${nom}`,
        type: "triennale",
      });
    }

    if (b.periodeFermeFin) {
      events.push({
        id: `pf-${b.id}`,
        date: b.periodeFermeFin,
        title: `Fin période ferme: ${nom}`,
        type: "periode-ferme",
      });
    }
  }

  // Sort ascending
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // KPIs
  const now = new Date();
  const in12Months = new Date(now.getFullYear(), now.getMonth() + 12, now.getDate());
  const echeancesProches = events.filter((e) => {
    const d = new Date(e.date);
    return d >= now && d <= in12Months;
  }).length;

  // Group by year
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    const key = getYearKey(ev.date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const sortedYears = Object.keys(grouped).sort();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Calendrier GL"
          description="Échéances des baux et paiements"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            label="Total échéances"
            value={events.length}
            icon={Calendar}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Échéances < 12 mois"
            value={echeancesProches}
            icon={Clock}
            variant="warning"
            gradient
            delay={1}
          />
        </div>

        {/* Timeline grouped by year */}
        <div className="space-y-6">
          {sortedYears.map((year, yi) => (
            <div key={year}>
              {/* Sticky year header */}
              <div className="sticky top-0 z-10 mb-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-card/95 backdrop-blur-sm border px-4 py-2 shadow-sm">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{year}</span>
                  <Badge variant="primary">{grouped[year].length}</Badge>
                </div>
              </div>

              {/* Events for this year */}
              <div className="ml-2 space-y-2 border-l-2 border-border pl-6">
                {grouped[year].map((ev, ei) => (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: yi * 0.05 + ei * 0.03 }}
                    className="relative flex items-start gap-4 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-primary bg-card" />

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{ev.title}</span>
                        <Badge variant={typeBadgeVariant[ev.type]}>
                          {typeLabels[ev.type]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(ev.date)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <GlassCard>
              <p className="text-center text-muted-foreground py-8">
                Aucune echeance a afficher
              </p>
            </GlassCard>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
