import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Badge } from "../../components/ui/badge";
import { Calendar, Clock, PiggyBank, FileText, Hammer } from "lucide-react";

interface Emprunt {
  id: string;
  banque?: string;
  dateFin?: string;
  archived?: boolean;
}

interface BailAM {
  id: string;
  lotId?: string;
  dateFin?: string;
}

interface Travaux {
  id: string;
  titre: string;
  dateDebut?: string;
  dateFin?: string;
}

type EventType = "emprunt" | "bail" | "travaux";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: EventType;
}

const typeBadgeVariant: Record<EventType, "primary" | "success" | "warning"> = {
  emprunt: "primary",
  bail: "success",
  travaux: "warning",
};

const typeIcon: Record<EventType, React.ElementType> = {
  emprunt: PiggyBank,
  bail: FileText,
  travaux: Hammer,
};

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendrierAMPage() {
  const { data: emprunts = [] } = useQuery<Emprunt[]>({
    queryKey: ["/api/am/emprunts"],
    queryFn: () => apiRequest("/api/am/emprunts"),
  });
  const { data: baux = [] } = useQuery<BailAM[]>({
    queryKey: ["/api/am/baux"],
    queryFn: () => apiRequest("/api/am/baux"),
  });
  const { data: travaux = [] } = useQuery<Travaux[]>({
    queryKey: ["/api/am/travaux"],
    queryFn: () => apiRequest("/api/am/travaux"),
  });

  // Build events
  const events: CalendarEvent[] = [];

  for (const e of emprunts) {
    if (e.archived) continue;
    if (e.dateFin) {
      events.push({
        id: `emp-${e.id}`,
        date: e.dateFin,
        title: `Échéance emprunt: ${e.banque || "N/A"}`,
        type: "emprunt",
      });
    }
  }

  for (const b of baux) {
    if (b.dateFin) {
      events.push({
        id: `bail-${b.id}`,
        date: b.dateFin,
        title: `Fin de bail: lot ${b.lotId || "N/A"}`,
        type: "bail",
      });
    }
  }

  for (const t of travaux) {
    if (t.dateDebut) {
      events.push({
        id: `trav-deb-${t.id}`,
        date: t.dateDebut,
        title: `Début travaux: ${t.titre}`,
        type: "travaux",
      });
    }
    if (t.dateFin) {
      events.push({
        id: `trav-fin-${t.id}`,
        date: t.dateFin,
        title: `Fin travaux: ${t.titre}`,
        type: "travaux",
      });
    }
  }

  // Sort ascending
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // KPIs
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const currentQuarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

  const eventsThisMonth = events.filter((e) => getMonthKey(e.date) === currentMonth).length;
  const eventsThisQuarter = events.filter((e) => {
    const d = new Date(e.date);
    return d >= currentQuarterStart && d <= currentQuarterEnd;
  }).length;

  // Group by month/year
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    const key = getMonthKey(ev.date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const sortedMonths = Object.keys(grouped).sort();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Calendrier AM"
          description="Échéances et évènements du patrimoine"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total évènements"
            value={events.length}
            icon={Calendar}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Ce mois"
            value={eventsThisMonth}
            icon={Clock}
            variant="success"
            gradient
            delay={1}
          />
          <KpiCard
            label="Ce trimestre"
            value={eventsThisQuarter}
            icon={Calendar}
            variant="warning"
            gradient
            delay={2}
          />
        </div>

        {/* Timeline */}
        <div className="space-y-6">
          {sortedMonths.map((monthKey, mi) => (
            <div key={monthKey}>
              {/* Sticky month header */}
              <div className="sticky top-0 z-10 mb-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-card/95 backdrop-blur-sm border px-4 py-2 shadow-sm">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold capitalize">
                    {formatMonthYear(grouped[monthKey][0].date)}
                  </span>
                  <Badge variant="primary">{grouped[monthKey].length}</Badge>
                </div>
              </div>

              {/* Events for this month */}
              <div className="ml-2 space-y-2 border-l-2 border-border pl-6">
                {grouped[monthKey].map((ev, ei) => {
                  const Icon = typeIcon[ev.type];
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: mi * 0.05 + ei * 0.03 }}
                      className="relative flex items-start gap-4 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-primary bg-card" />

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{ev.title}</span>
                          <Badge variant={typeBadgeVariant[ev.type]}>
                            {ev.type}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDate(ev.date)}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          {events.length === 0 && (
            <GlassCard>
              <p className="text-center text-muted-foreground py-8">
                Aucun évènement à afficher
              </p>
            </GlassCard>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
