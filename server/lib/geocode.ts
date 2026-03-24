/**
 * Géocodage automatique via api-adresse.data.gouv.fr (BAN — Base Adresse Nationale)
 * API gratuite, sans clé, sans limite stricte.
 */
import { logger } from "./logger";

interface GeoResult {
  lat: number;
  lng: number;
  label: string;
  score: number;
}

/**
 * Géocode une adresse française et retourne les coordonnées GPS.
 * Utilise l'API BAN (Base Adresse Nationale) du gouvernement français.
 */
export async function geocodeAddress(
  adresse?: string | null,
  codePostal?: string | null,
  ville?: string | null,
): Promise<GeoResult | null> {
  // Construire la requête avec les éléments disponibles
  const parts = [adresse, codePostal, ville].filter(Boolean);
  if (parts.length === 0) return null;

  const query = parts.join(" ");

  try {
    const params = new URLSearchParams({ q: query, limit: "1" });
    if (codePostal) params.set("postcode", codePostal);

    const url = `https://api-adresse.data.gouv.fr/search/?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "CanaillouV2/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn("geocode: API error", { status: res.status, query });
      return null;
    }

    const data = await res.json() as {
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: { label: string; score: number };
      }>;
    };

    if (!data.features || data.features.length === 0) {
      logger.info("geocode: no result", { query });
      return null;
    }

    const feature = data.features[0];
    const [lng, lat] = feature.geometry.coordinates;
    const score = feature.properties.score;

    // Seuil de confiance minimum (0.4 sur 1.0)
    if (score < 0.4) {
      logger.info("geocode: low score", { query, score, label: feature.properties.label });
      return null;
    }

    return { lat, lng, label: feature.properties.label, score };
  } catch (err: any) {
    // Ne pas bloquer la création d'actif si le géocodage échoue
    logger.warn("geocode: fetch error", { query, error: err.message });
    return null;
  }
}

/**
 * Détermine si un géocodage est nécessaire pour un actif.
 * Retourne true si l'actif a une adresse mais pas de coordonnées,
 * ou si l'adresse a changé.
 */
export function needsGeocoding(
  body: Record<string, any>,
  existing?: Record<string, any> | null,
): boolean {
  // Création : géocoder si une adresse est fournie et pas de lat/lng
  if (!existing) {
    const hasAddress = body.adresse || body.ville || body.codePostal;
    const hasCoords = body.lat != null && body.lng != null;
    return hasAddress && !hasCoords;
  }

  // Mise à jour : géocoder si l'adresse change
  const addressChanged =
    (body.adresse !== undefined && body.adresse !== existing.adresse) ||
    (body.ville !== undefined && body.ville !== existing.ville) ||
    (body.codePostal !== undefined && body.codePostal !== existing.codePostal);

  // Aussi géocoder si l'actif n'a pas encore de coordonnées et a une adresse
  const missingCoords = existing.lat == null || existing.lng == null;
  const hasAddress = (body.adresse ?? existing.adresse) || (body.ville ?? existing.ville);

  return (addressChanged || (missingCoords && hasAddress)) && body.lat == null && body.lng == null;
}
