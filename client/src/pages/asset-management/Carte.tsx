import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { PageHeader } from "../../components/ui/page-header";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { MapPin, Building2, Landmark } from "lucide-react";

interface Actif {
  id: string;
  nom: string;
  sciId?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  type?: string;
  surface?: string;
  archived?: boolean;
}

interface SCI {
  id: string;
  nom: string;
}

const typeColors: Record<string, string> = {
  residentiel: "from-blue-500 to-blue-600",
  commercial: "from-violet-500 to-violet-600",
  bureau: "from-cyan-500 to-cyan-600",
  mixte: "from-amber-500 to-amber-600",
};

const typeVariant = (t?: string): "primary" | "warning" | "success" | "default" => {
  if (t === "residentiel") return "primary";
  if (t === "commercial") return "success";
  if (t === "bureau") return "primary";
  if (t === "mixte") return "warning";
  return "default";
};

export default function CartePage() {
  const { data: actifs = [] } = useQuery<Actif[]>({
    queryKey: ["/api/am/actifs"],
    queryFn: () => apiRequest("/api/am/actifs"),
  });
  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));
  const activeActifs = actifs.filter((a) => !a.archived);

  // KPIs
  const nbActifs = activeActifs.length;
  const villes = new Set(activeActifs.map((a) => a.ville).filter(Boolean));
  const nbVilles = villes.size;
  const surfaceTotale = activeActifs.reduce(
    (sum, a) => sum + (a.surface ? parseFloat(a.surface) : 0),
    0
  );

  // Group by ville
  const grouped = activeActifs.reduce<Record<string, Actif[]>>((acc, a) => {
    const ville = a.ville || "Sans ville";
    if (!acc[ville]) acc[ville] = [];
    acc[ville].push(a);
    return acc;
  }, {});

  const sortedVilles = Object.keys(grouped).sort((a, b) =>
    a === "Sans ville" ? 1 : b === "Sans ville" ? -1 : a.localeCompare(b)
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-8"
      >
        <PageHeader
          title="Carte du patrimoine"
          description="Localisation des actifs immobiliers"
        />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Actifs"
            value={nbActifs}
            icon={Building2}
            variant="primary"
            gradient
            delay={0}
          />
          <KpiCard
            label="Villes"
            value={nbVilles}
            icon={MapPin}
            variant="success"
            gradient
            delay={1}
          />
          <KpiCard
            label="Surface totale"
            value={surfaceTotale}
            formatFn={(n) => `${n.toLocaleString("fr-FR")} m²`}
            icon={Landmark}
            variant="warning"
            gradient
            delay={2}
          />
        </div>

        {/* Grouped by ville */}
        {sortedVilles.map((ville, vi) => (
          <Section key={ville} title={ville} delay={vi + 1}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[ville].map((actif, ai) => (
                <GlassCard key={actif.id} delay={ai} className="relative overflow-hidden">
                  {/* Gradient accent bar */}
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
                      typeColors[actif.type || ""] || "from-gray-400 to-gray-500"
                    }`}
                  />

                  <div className="space-y-3 pt-1">
                    {/* Name + SCI */}
                    <div>
                      <h3 className="font-semibold text-foreground">{actif.nom}</h3>
                      {actif.sciId && sciMap[actif.sciId] && (
                        <p className="text-sm text-muted-foreground">
                          {sciMap[actif.sciId]}
                        </p>
                      )}
                    </div>

                    {/* Type badge */}
                    {actif.type && (
                      <Badge variant={typeVariant(actif.type)}>
                        {actif.type}
                      </Badge>
                    )}

                    {/* Address */}
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        {actif.adresse && <p>{actif.adresse}</p>}
                        <p>
                          {actif.codePostal && `${actif.codePostal} `}
                          {actif.ville}
                        </p>
                      </div>
                    </div>

                    {/* Surface */}
                    {actif.surface && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{actif.surface} m²</span>
                      </div>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          </Section>
        ))}

        {activeActifs.length === 0 && (
          <GlassCard>
            <p className="text-center text-muted-foreground py-8">
              Aucun actif enregistre
            </p>
          </GlassCard>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
