import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  lat?: number;
  lng?: number;
  archived?: boolean;
}

interface SCI {
  id: string;
  nom: string;
}

const typeColors: Record<string, string> = {
  residentiel: "from-orange-500 to-amber-600",
  commercial: "from-rose-500 to-pink-600",
  bureau: "from-cyan-500 to-cyan-600",
  mixte: "from-amber-500 to-amber-600",
};

const typeMarkerColors: Record<string, string> = {
  residentiel: "#3b82f6",
  commercial: "#8b5cf6",
  bureau: "#06b6d4",
  mixte: "#f59e0b",
};

const typeVariant = (t?: string): "primary" | "warning" | "success" | "default" => {
  if (t === "residentiel") return "primary";
  if (t === "commercial") return "success";
  if (t === "bureau") return "primary";
  if (t === "mixte") return "warning";
  return "default";
};

function createMarkerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

export default function CartePage() {
  const { data: actifs = [] } = useQuery<Actif[]>({
    queryKey: ["/api/am/actifs"],
    queryFn: () => apiRequest("/api/am/actifs"),
  });
  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [geocoded, setGeocoded] = useState<Record<string, { lat: number; lng: number }>>({});
  const geocodedRef = useRef<Set<string>>(new Set());

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));
  const activeActifs = actifs.filter((a) => !a.archived);
  const geoActifs = activeActifs.filter((a) => a.lat && a.lng || geocoded[a.id]);

  const nbActifs = activeActifs.length;
  const villes = new Set(activeActifs.map((a) => a.ville).filter(Boolean));
  const nbVilles = villes.size;
  const surfaceTotale = activeActifs.reduce(
    (sum, a) => sum + (a.surface ? parseFloat(a.surface) : 0),
    0
  );

  const grouped = activeActifs.reduce<Record<string, Actif[]>>((acc, a) => {
    const ville = a.ville || "Sans ville";
    if (!acc[ville]) acc[ville] = [];
    acc[ville].push(a);
    return acc;
  }, {});

  const sortedVilles = Object.keys(grouped).sort((a, b) =>
    a === "Sans ville" ? 1 : b === "Sans ville" ? -1 : a.localeCompare(b)
  );

  // Geocode actifs that have addresses but no GPS coordinates
  useEffect(() => {
    const toGeocode = activeActifs.filter(
      (a) => !a.lat && !a.lng && (a.adresse || a.ville) && !geocodedRef.current.has(a.id)
    );
    if (toGeocode.length === 0) return;

    // Mark as in-progress to avoid double-fetching
    toGeocode.forEach((a) => geocodedRef.current.add(a.id));

    const geocodeActif = async (actif: Actif) => {
      const parts = [actif.adresse, actif.codePostal, actif.ville, "France"].filter(Boolean);
      const query = encodeURIComponent(parts.join(", "));
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
          { headers: { "Accept-Language": "fr" } }
        );
        const data = await res.json();
        if (data && data.length > 0) {
          return { id: actif.id, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
      } catch {
        // Geocoding failed silently
      }
      return null;
    };

    // Geocode sequentially with a small delay to respect Nominatim rate limits
    (async () => {
      const results: Record<string, { lat: number; lng: number }> = {};
      for (const actif of toGeocode) {
        const result = await geocodeActif(actif);
        if (result) {
          results[result.id] = { lat: result.lat, lng: result.lng };
        }
        // Nominatim rate limit: 1 request per second
        if (toGeocode.indexOf(actif) < toGeocode.length - 1) {
          await new Promise((r) => setTimeout(r, 1100));
        }
      }
      if (Object.keys(results).length > 0) {
        setGeocoded((prev) => ({ ...prev, ...results }));
      }
    })();
  }, [activeActifs]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([48.8566, 2.3522], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    if (geoActifs.length === 0) return;

    const bounds = L.latLngBounds([]);

    for (const actif of geoActifs) {
      const coords = actif.lat && actif.lng
        ? { lat: actif.lat, lng: actif.lng }
        : geocoded[actif.id];
      if (!coords) continue;

      const color = typeMarkerColors[actif.type || ""] || "#6b7280";
      const icon = createMarkerIcon(color);
      const marker = L.marker([coords.lat, coords.lng], { icon }).addTo(map);

      const sciNom = actif.sciId ? sciMap[actif.sciId] || "" : "";
      const popupContent = `
        <div style="min-width:180px;">
          <strong>${actif.nom}</strong>
          ${sciNom ? `<br/><span style="color:#6b7280;font-size:12px;">${sciNom}</span>` : ""}
          ${actif.type ? `<br/><span style="font-size:11px;background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:9px;">${actif.type}</span>` : ""}
          ${actif.adresse ? `<br/><span style="color:#6b7280;font-size:12px;">${actif.adresse}</span>` : ""}
          ${actif.ville ? `<br/><span style="color:#6b7280;font-size:12px;">${actif.codePostal || ""} ${actif.ville}</span>` : ""}
          ${actif.surface ? `<br/><span style="font-size:12px;">${actif.surface} m²</span>` : ""}
        </div>
      `;
      marker.bindPopup(popupContent);
      bounds.extend([coords.lat, coords.lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [geoActifs, sciMap, geocoded]);

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

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Actifs" value={nbActifs} icon={Building2} variant="primary" gradient delay={0} />
          <KpiCard label="Villes" value={nbVilles} icon={MapPin} variant="success" gradient delay={1} />
          <KpiCard
            label="Surface totale" value={surfaceTotale}
            formatFn={(n) => `${n.toLocaleString("fr-FR")} m²`}
            icon={Landmark} variant="warning" gradient delay={2}
          />
        </div>

        {/* Leaflet Map */}
        <GlassCard delay={3}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Carte interactive
          </h3>
          <div
            ref={mapRef}
            className="h-[550px] w-full rounded-lg overflow-hidden border"
            style={{ zIndex: 0 }}
          />
          {geoActifs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                {activeActifs.some((a) => (a.adresse || a.ville) && !a.lat && !a.lng)
                  ? "Géocodage des adresses en cours..."
                  : "Aucun actif avec adresse ou coordonnées GPS."}
              </p>
            </div>
          )}
          {geoActifs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {Object.entries(typeMarkerColors).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs">
                  <div className="h-3 w-3 rounded-full" style={{ background: color }} />
                  {type}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Grouped by ville */}
        {sortedVilles.map((ville, vi) => (
          <Section key={ville} title={ville} delay={vi + 1}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[ville].map((actif, ai) => (
                <GlassCard key={actif.id} delay={ai} className="relative overflow-hidden">
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
                      typeColors[actif.type || ""] || "from-gray-400 to-gray-500"
                    }`}
                  />
                  <div className="space-y-3 pt-1">
                    <div>
                      <h3 className="font-semibold text-foreground">{actif.nom}</h3>
                      {actif.sciId && sciMap[actif.sciId] && (
                        <p className="text-sm text-muted-foreground">{sciMap[actif.sciId]}</p>
                      )}
                    </div>
                    {actif.type && <Badge variant={typeVariant(actif.type)}>{actif.type}</Badge>}
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        {actif.adresse && <p>{actif.adresse}</p>}
                        <p>{actif.codePostal && `${actif.codePostal} `}{actif.ville}</p>
                      </div>
                    </div>
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
              Aucun actif enregistré
            </p>
          </GlassCard>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
