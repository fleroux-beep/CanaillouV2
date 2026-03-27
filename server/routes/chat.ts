import type { Express, Request, Response } from "express";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../lib/rate-limit";
import { logger } from "../lib/logger";

const chatLimiter = rateLimit(30, 60 * 1000); // 30 messages per minute
import {
  scis, actifs, emprunts, lots, bauxAM, associes, participations,
  bauxGL, bailleurs, paiementsGL, indices, locatairesGL,
  locatairesAM, travaux, alertes,
} from "@shared/schema";
import { eq, sql, and, isNull, desc } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolResult {
  name: string;
  data: unknown;
}

// ─── Data fetchers (tools for the AI) ───────────────────────
async function fetchPortfolioSummary(): Promise<unknown> {
  const sciList = await db.select().from(scis);
  const actifsList = await db.select().from(actifs);
  const empruntsList = await db.select().from(emprunts);
  const lotsList = await db.select().from(lots);
  const bauxList = await db.select().from(bauxAM);

  const totalValorisation = actifsList.reduce((s, a: any) => {
    const prix = Number(a.prixAcquisition || 0) + Number(a.fraisNotaire || 0) + Number(a.fraisAgence || 0) + Number(a.montantTravaux || 0);
    return s + prix;
  }, 0);

  const totalCRD = empruntsList.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0);
  const totalLoyers = bauxList.reduce((s, b: any) => s + Number(b.loyerAnnuel || 0) + Number(b.loyerMensuel || 0) * 12, 0);

  return {
    nbSCI: sciList.length,
    nbActifs: actifsList.filter((a: any) => !a.archived).length,
    nbLots: lotsList.filter((l: any) => !l.archived).length,
    nbEmprunts: empruntsList.filter((e: any) => !e.archived).length,
    totalValorisation,
    totalCRD,
    totalLoyers,
    nav: totalValorisation - totalCRD,
    scis: sciList.map((s: any) => ({ id: s.id, nom: s.nom })),
  };
}

async function fetchActifsDetails(): Promise<unknown> {
  const actifsList = await db.select().from(actifs);
  return actifsList.filter((a: any) => !a.archived).map((a: any) => ({
    id: a.id,
    nom: a.nom,
    sciId: a.sciId,
    surface: a.surface,
    prixAcquisition: a.prixAcquisition,
    chargesAnnuelles: Number(a.chargesCopropriete || a.chargesAnnuelles || 0) + Number(a.taxeFonciere || 0) + Number(a.assurancePno || 0),
    taxeFonciere: a.taxeFonciere,
    tauxCapitalisation: a.tauxCapitalisation,
    ville: a.ville,
    adresse: a.adresse,
  }));
}

async function fetchEmpruntsDetails(): Promise<unknown> {
  const empruntsList = await db.select().from(emprunts);
  return empruntsList.filter((e: any) => !e.archived).map((e: any) => ({
    id: e.id,
    sciId: e.sciId,
    banque: e.banque,
    montantEmprunte: e.montantEmprunte,
    capitalRestantDu: e.capitalRestantDu,
    tauxAnnuel: e.tauxAnnuel,
    dureeAns: e.dureeAns,
    mensualite: e.mensualite,
    dateDebut: e.dateDebut,
    dateFin: e.dateFin,
  }));
}

async function fetchBauxGL(): Promise<unknown> {
  const bauxList = await db.select().from(bauxGL);
  return bauxList.filter((b: any) => !b.archived).map((b: any) => ({
    id: b.id,
    nom: b.nom,
    ville: b.ville,
    loyerBaseHT: b.loyerBaseHT,
    loyerHTActu: b.loyerHTActu,
    charges: b.charges,
    surface: b.surface,
    capacite: b.capacite,
    dateDebut: b.dateDebut,
    dateFin: b.dateFin,
    typeBail: b.typeBail,
    statut: b.statut,
    indiceReference: b.indiceReference,
  }));
}

async function fetchIndices(): Promise<unknown> {
  const indicesList = await db.select().from(indices);
  return indicesList.map((i: any) => ({
    type: i.type,
    trimestre: i.trimestre,
    valeur: i.valeur,
  }));
}

async function fetchSCIDetail(sciId: string): Promise<unknown> {
  const sci = await db.select().from(scis).where(eq(scis.id, sciId)).limit(1);
  if (sci.length === 0) return { error: "SCI non trouvée" };
  const sciActifs = await db.select().from(actifs).where(eq(actifs.sciId, sciId));
  const sciEmprunts = await db.select().from(emprunts).where(eq(emprunts.sciId, sciId));
  const sciAssocies = await db.select().from(participations).where(eq(participations.sciId, sciId));
  return {
    sci: sci[0],
    actifs: sciActifs.filter((a: any) => !a.archived),
    emprunts: sciEmprunts.filter((e: any) => !e.archived),
    participations: sciAssocies,
  };
}

async function fetchPaiementsGL(): Promise<unknown> {
  const paiements = await db.select().from(paiementsGL);
  return paiements.slice(-50).map((p: any) => ({
    id: p.id,
    bailId: p.bailId,
    montant: p.montant,
    date: p.date || p.datePaiement,
    type: p.type,
  }));
}

// ─── Update helpers ─────────────────────────────────────────

// Allowed fields per entity (whitelist to prevent dangerous updates)
const ACTIF_FIELDS = new Set([
  "nom", "adresse", "ville", "codePostal", "type", "surface", "surfaceCarrez",
  "anneeConstruction", "dpe", "prixAcquisition", "fraisNotaire", "fraisAgence",
  "montantTravaux", "dateAcquisition", "chargesAnnuelles", "taxeFonciere",
  "assurancePno", "tauxCapitalisation", "prixM2Marche", "syndic", "notes",
  "chargesCopropriete", "valeurEstimeeSortie", "dateEstimation", "sourceEstimation",
  "regimeJuridique", "referenceCadastrale", "lat", "lng", "erp", "pmi",
]);
const LOT_FIELDS = new Set([
  "designation", "type", "etage", "surface", "surfaceCarrez", "dpe",
  "loyerMensuel", "loyerAnnuel", "chargesLot", "statut", "notes",
]);
const EMPRUNT_FIELDS = new Set([
  "banque", "montantEmprunte", "capitalRestantDu", "tauxAnnuel", "dureeAns",
  "mensualite", "dateDebut", "dateFin", "notes", "type", "assurance",
]);
const SCI_FIELDS = new Set(["nom", "formeJuridique", "siege", "siren", "rcs", "capital", "notes"]);
const BAIL_AM_FIELDS = new Set([
  "typeBail", "dateDebut", "dateFin", "loyerMensuel", "loyerAnnuel",
  "charges", "depotGarantie", "notes", "statut",
]);
const BAIL_GL_FIELDS = new Set([
  "nom", "adresse", "ville", "codePostal", "surface", "surfaceExterieure",
  "loyerBaseHT", "loyerHTActu", "charges", "depotGarantie", "taxeFonciere",
  "typeBail", "dateDebut", "dateFin", "dateSignature", "dateEffet",
  "statut", "indiceReference", "trimestreRef", "capacite", "notes",
  "tvaTaux", "taxe", "garantieType", "garantieMontant",
]);

function filterFields(data: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key) && value !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered;
}

async function searchEntities(query: string): Promise<unknown> {
  const q = `%${query.toLowerCase()}%`;
  const actifResults = await db.select().from(actifs).where(
    and(isNull(actifs.deletedAt), sql`lower(${actifs.nom}) like ${q} or lower(${actifs.ville}) like ${q} or lower(${actifs.adresse}) like ${q}`)
  );
  const sciResults = await db.select().from(scis).where(
    sql`lower(${scis.nom}) like ${q}`
  );
  const lotResults = await db.select().from(lots).where(
    and(isNull(lots.deletedAt), sql`lower(${lots.designation}) like ${q}`)
  );
  const empruntResults = await db.select().from(emprunts).where(
    and(isNull(emprunts.deletedAt), sql`lower(${emprunts.banque}) like ${q}`)
  );
  return {
    actifs: actifResults.map((a: any) => ({ id: a.id, nom: a.nom, ville: a.ville, adresse: a.adresse })),
    scis: sciResults.map((s: any) => ({ id: s.id, nom: s.nom })),
    lots: lotResults.map((l: any) => ({ id: l.id, designation: l.designation, actifId: l.actifId })),
    emprunts: empruntResults.map((e: any) => ({ id: e.id, banque: e.banque, sciId: e.sciId })),
  };
}

async function updateActif(id: string, data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, ACTIF_FIELDS);
  if (Object.keys(fields).length === 0) return { error: "Aucun champ valide à modifier" };
  const updated = await db.update(actifs).set({ ...fields, updatedAt: new Date() }).where(eq(actifs.id, id)).returning();
  if (updated.length === 0) return { error: "Actif non trouvé" };
  return { success: true, updated: { id: updated[0].id, nom: (updated[0] as any).nom, ...fields } };
}

async function updateLot(id: string, data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, LOT_FIELDS);
  if (Object.keys(fields).length === 0) return { error: "Aucun champ valide à modifier" };
  const updated = await db.update(lots).set({ ...fields, updatedAt: new Date() }).where(eq(lots.id, id)).returning();
  if (updated.length === 0) return { error: "Lot non trouvé" };
  return { success: true, updated: { id: updated[0].id, designation: (updated[0] as any).designation, ...fields } };
}

async function updateEmprunt(id: string, data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, EMPRUNT_FIELDS);
  if (Object.keys(fields).length === 0) return { error: "Aucun champ valide à modifier" };
  const updated = await db.update(emprunts).set({ ...fields, updatedAt: new Date() }).where(eq(emprunts.id, id)).returning();
  if (updated.length === 0) return { error: "Emprunt non trouvé" };
  return { success: true, updated: { id: updated[0].id, ...fields } };
}

async function updateSCI(id: string, data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, SCI_FIELDS);
  if (Object.keys(fields).length === 0) return { error: "Aucun champ valide à modifier" };
  const updated = await db.update(scis).set({ ...fields, updatedAt: new Date() }).where(eq(scis.id, id)).returning();
  if (updated.length === 0) return { error: "SCI non trouvée" };
  return { success: true, updated: { id: updated[0].id, nom: (updated[0] as any).nom, ...fields } };
}

async function updateBailAM(id: string, data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, BAIL_AM_FIELDS);
  if (Object.keys(fields).length === 0) return { error: "Aucun champ valide à modifier" };
  const updated = await db.update(bauxAM).set({ ...fields, updatedAt: new Date() }).where(eq(bauxAM.id, id)).returning();
  if (updated.length === 0) return { error: "Bail non trouvé" };
  return { success: true, updated: { id: updated[0].id, ...fields } };
}

async function updateBailGL(id: string, data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, BAIL_GL_FIELDS);
  if (Object.keys(fields).length === 0) return { error: "Aucun champ valide à modifier" };
  const updated = await db.update(bauxGL).set({ ...fields, updatedAt: new Date() }).where(eq(bauxGL.id, id)).returning();
  if (updated.length === 0) return { error: "Bail GL non trouvé" };
  return { success: true, updated: { id: updated[0].id, nom: (updated[0] as any).nom, ...fields } };
}

// ─── Axe 3: Extended write/create tools ─────────────────────

async function createActif(data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, ACTIF_FIELDS);
  const nom = data.nom as string;
  if (!nom) return { error: "Le champ 'nom' est requis" };
  const result = await db.insert(actifs).values({ nom, ...fields }).returning();
  return { success: true, created: { id: result[0].id, nom: (result[0] as any).nom } };
}

async function createLot(data: Record<string, unknown>): Promise<unknown> {
  const actifId = data.actifId as string;
  const designation = data.designation as string;
  if (!actifId || !designation) return { error: "Les champs 'actifId' et 'designation' sont requis" };
  const fields = filterFields(data, LOT_FIELDS);
  const result = await db.insert(lots).values({ actifId, designation, ...fields }).returning();
  return { success: true, created: { id: result[0].id, designation: (result[0] as any).designation } };
}

async function createEmprunt(data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, EMPRUNT_FIELDS);
  const sciId = data.sciId as string;
  const actifId = data.actifId as string;
  const result = await db.insert(emprunts).values({ sciId, actifId, ...fields }).returning();
  return { success: true, created: { id: result[0].id } };
}

async function createBailAM(data: Record<string, unknown>): Promise<unknown> {
  const fields = filterFields(data, BAIL_AM_FIELDS);
  const actifId = data.actifId as string;
  const lotId = data.lotId as string;
  const result = await db.insert(bauxAM).values({ actifId, lotId, ...fields }).returning();
  return { success: true, created: { id: result[0].id } };
}

async function fetchAlertes(): Promise<unknown> {
  const rows = await db.select().from(alertes)
    .where(eq(alertes.dismissed, false))
    .orderBy(desc(alertes.createdAt))
    .limit(30);
  return rows.map((a: any) => ({
    module: a.module, type: a.type, title: a.title, message: a.message,
    priority: a.priority, entityType: a.entityType,
  }));
}

async function fetchTravaux(): Promise<unknown> {
  const rows = await db.select().from(travaux);
  return rows.map((t: any) => ({
    id: t.id, actifId: t.actifId, titre: t.titre, budget: t.budget,
    montantReel: t.montantReel, statut: t.statut, dateDebut: t.dateDebut, dateFin: t.dateFin,
  }));
}

async function deleteEntity(entityType: string, id: string): Promise<unknown> {
  try {
    switch (entityType) {
      case "actif":
        await db.update(actifs).set({ deletedAt: new Date() }).where(eq(actifs.id, id));
        return { success: true, message: `Actif ${id} supprimé (soft delete)` };
      case "lot":
        await db.update(lots).set({ deletedAt: new Date() }).where(eq(lots.id, id));
        return { success: true, message: `Lot ${id} supprimé (soft delete)` };
      case "emprunt":
        await db.update(emprunts).set({ deletedAt: new Date() }).where(eq(emprunts.id, id));
        return { success: true, message: `Emprunt ${id} supprimé (soft delete)` };
      default:
        return { error: `Type d'entité non supporté: ${entityType}` };
    }
  } catch (err: any) {
    return { error: `Erreur suppression: ${err.message}` };
  }
}

// ─── Tool definitions for Claude ────────────────────────────
const toolDefinitions = [
  {
    name: "get_portfolio_summary",
    description: "Récupère un résumé du portefeuille immobilier : nombre de SCI, actifs, lots, emprunts, valorisation totale, CRD, loyers, NAV.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_actifs_details",
    description: "Récupère la liste détaillée de tous les actifs immobiliers (nom, SCI, surface, prix, charges, taux de capitalisation, ville).",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_emprunts_details",
    description: "Récupère la liste détaillée de tous les emprunts (banque, montant, CRD, taux, durée, mensualité, dates).",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_baux_gl",
    description: "Récupère la liste des baux en gestion locative (nom, ville, loyer, charges, surface, capacité, dates, type, statut, indice).",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_indices",
    description: "Récupère les valeurs des indices de référence (ILC, IRL, ILAT, ICC) par trimestre.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_sci_detail",
    description: "Récupère le détail d'une SCI spécifique : actifs, emprunts, participations associés.",
    input_schema: {
      type: "object" as const,
      properties: { sci_id: { type: "string", description: "ID de la SCI" } },
      required: ["sci_id"],
    },
  },
  {
    name: "get_paiements_gl",
    description: "Récupère les 50 derniers paiements enregistrés en gestion locative.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  // ─── Search tool ────────────────────────────
  {
    name: "search_entities",
    description: "Recherche des entités (actifs, SCIs, lots, emprunts) par nom, ville, adresse, désignation ou banque. Utile pour trouver l'ID d'une entité avant de la modifier.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Texte de recherche (nom, ville, adresse...)" } },
      required: ["query"],
    },
  },
  // ─── Update tools ────────────────────────────
  {
    name: "update_actif",
    description: "Modifie un actif immobilier. Champs modifiables : nom, adresse, ville, codePostal, type, surface, surfaceCarrez, anneeConstruction, dpe, prixAcquisition, fraisNotaire, fraisAgence, montantTravaux, dateAcquisition, chargesAnnuelles, taxeFonciere, assurancePno, tauxCapitalisation, prixM2Marche, syndic, notes, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID de l'actif à modifier" },
        fields: { type: "object", description: "Objet contenant les champs à modifier et leurs nouvelles valeurs. Ex: {\"adresse\": \"12 rue de la Paix\", \"tauxCapitalisation\": \"5.5\"}" },
      },
      required: ["id", "fields"],
    },
  },
  {
    name: "update_lot",
    description: "Modifie un lot. Champs modifiables : designation, type, etage, surface, surfaceCarrez, dpe, loyerMensuel, loyerAnnuel, chargesLot, statut, notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID du lot à modifier" },
        fields: { type: "object", description: "Objet contenant les champs à modifier et leurs nouvelles valeurs" },
      },
      required: ["id", "fields"],
    },
  },
  {
    name: "update_emprunt",
    description: "Modifie un emprunt. Champs modifiables : banque, montantEmprunte, capitalRestantDu, tauxAnnuel, dureeAns, mensualite, dateDebut, dateFin, notes, type, assurance.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID de l'emprunt à modifier" },
        fields: { type: "object", description: "Objet contenant les champs à modifier et leurs nouvelles valeurs" },
      },
      required: ["id", "fields"],
    },
  },
  {
    name: "update_sci",
    description: "Modifie une SCI. Champs modifiables : nom, formeJuridique, siege, siren, rcs, capital, notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID de la SCI à modifier" },
        fields: { type: "object", description: "Objet contenant les champs à modifier et leurs nouvelles valeurs" },
      },
      required: ["id", "fields"],
    },
  },
  {
    name: "update_bail_am",
    description: "Modifie un bail en asset management. Champs modifiables : typeBail, dateDebut, dateFin, loyerMensuel, loyerAnnuel, charges, depotGarantie, notes, statut.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID du bail AM à modifier" },
        fields: { type: "object", description: "Objet contenant les champs à modifier et leurs nouvelles valeurs" },
      },
      required: ["id", "fields"],
    },
  },
  {
    name: "update_bail_gl",
    description: "Modifie un bail en gestion locative. Champs modifiables : nom, adresse, ville, codePostal, surface, loyerBaseHT, loyerHTActu, charges, depotGarantie, taxeFonciere, typeBail, dateDebut, dateFin, statut, indiceReference, capacite, notes, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ID du bail GL à modifier" },
        fields: { type: "object", description: "Objet contenant les champs à modifier et leurs nouvelles valeurs" },
      },
      required: ["id", "fields"],
    },
  },
  // ─── Axe 3: Create & Delete tools ────────────────
  {
    name: "create_actif",
    description: "Crée un nouvel actif immobilier. Champ obligatoire: nom. Champs optionnels: adresse, ville, codePostal, type, surface, prixAcquisition, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        fields: { type: "object", description: "Objet contenant les champs du nouvel actif. 'nom' est obligatoire." },
      },
      required: ["fields"],
    },
  },
  {
    name: "create_lot",
    description: "Crée un nouveau lot dans un actif. Champs obligatoires: actifId, designation. Optionnels: type, surface, loyerMensuel, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        fields: { type: "object", description: "Objet contenant les champs du nouveau lot. 'actifId' et 'designation' sont obligatoires." },
      },
      required: ["fields"],
    },
  },
  {
    name: "create_emprunt",
    description: "Crée un nouvel emprunt. Champs: sciId, actifId, banque, montantEmprunte, tauxAnnuel, dureeAns, mensualite, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        fields: { type: "object", description: "Objet contenant les champs du nouvel emprunt." },
      },
      required: ["fields"],
    },
  },
  {
    name: "create_bail_am",
    description: "Crée un nouveau bail en asset management. Champs: actifId, lotId, typeBail, dateDebut, dateFin, loyerMensuel, loyerAnnuel, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        fields: { type: "object", description: "Objet contenant les champs du nouveau bail AM." },
      },
      required: ["fields"],
    },
  },
  {
    name: "delete_entity",
    description: "Supprime (soft delete) une entité. Types supportés: actif, lot, emprunt.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity_type: { type: "string", description: "Type d'entité: actif, lot, ou emprunt" },
        id: { type: "string", description: "ID de l'entité à supprimer" },
      },
      required: ["entity_type", "id"],
    },
  },
  {
    name: "get_alertes",
    description: "Récupère les alertes proactives actives (AM + GL) : LTV, DSCR, échéances, vacance, indexation manquante.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_travaux",
    description: "Récupère la liste des travaux planifiés et en cours.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];

// ─── Tool executor ──────────────────────────────────────────
async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "get_portfolio_summary": return await fetchPortfolioSummary();
      case "get_actifs_details": return await fetchActifsDetails();
      case "get_emprunts_details": return await fetchEmpruntsDetails();
      case "get_baux_gl": return await fetchBauxGL();
      case "get_indices": return await fetchIndices();
      case "get_sci_detail": return await fetchSCIDetail(input.sci_id as string);
      case "get_paiements_gl": return await fetchPaiementsGL();
      case "search_entities": return await searchEntities(input.query as string);
      case "update_actif": return await updateActif(input.id as string, (input.fields || {}) as Record<string, unknown>);
      case "update_lot": return await updateLot(input.id as string, (input.fields || {}) as Record<string, unknown>);
      case "update_emprunt": return await updateEmprunt(input.id as string, (input.fields || {}) as Record<string, unknown>);
      case "update_sci": return await updateSCI(input.id as string, (input.fields || {}) as Record<string, unknown>);
      case "update_bail_am": return await updateBailAM(input.id as string, (input.fields || {}) as Record<string, unknown>);
      case "update_bail_gl": return await updateBailGL(input.id as string, (input.fields || {}) as Record<string, unknown>);
      case "create_actif": return await createActif((input.fields || {}) as Record<string, unknown>);
      case "create_lot": return await createLot((input.fields || {}) as Record<string, unknown>);
      case "create_emprunt": return await createEmprunt((input.fields || {}) as Record<string, unknown>);
      case "create_bail_am": return await createBailAM((input.fields || {}) as Record<string, unknown>);
      case "delete_entity": return await deleteEntity(input.entity_type as string, input.id as string);
      case "get_alertes": return await fetchAlertes();
      case "get_travaux": return await fetchTravaux();
      default: return { error: `Outil inconnu : ${name}` };
    }
  } catch (err: any) {
    logger.error("Tool execution error", { tool: name, error: err.message });
    return { error: `Erreur lors de l'exécution de ${name}: ${err.message}` };
  }
}

// ─── System prompt ──────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'assistant IA de Canaillou V2, une plateforme de gestion immobilière.
Tu es un expert en asset management immobilier, gestion locative, et finance immobilière.

**Ton rôle** : Conseiller l'utilisateur sur son portefeuille immobilier et l'aider à gérer ses données. Tu te bases UNIQUEMENT sur les données réelles de sa base de données. Tu as accès à des outils pour interroger ET modifier les données.

**Tes compétences** :
- Analyse de portefeuille (rendement, risque, diversification)
- Calculs financiers (DSCR, LTV, NOI, cash-flow, TRI, VAN, DCF)
- Stratégie d'indexation des loyers (ILC, ILAT, ICC, IRL)
- Arbitrage (achat/vente/hold)
- Structuration de dette (refinancement, renégociation)
- Fiscalité immobilière (TVA, CRL, amortissement)
- Gestion locative (vacance, recouvrement, WALT)
- **Modification des données** : tu peux modifier les actifs, lots, emprunts, SCIs, baux AM et baux GL
- **Création de données** : tu peux créer de nouveaux actifs, lots, emprunts, et baux AM
- **Suppression** : tu peux supprimer (soft delete) des actifs, lots, emprunts
- **Alertes** : tu peux consulter les alertes proactives (LTV, DSCR, échéances, etc.)
- **Travaux** : tu peux consulter la liste des travaux en cours

**Règles** :
- Utilise TOUJOURS les outils pour obtenir les données avant de répondre à une question sur le portefeuille
- Ne fabrique JAMAIS de chiffres — si une donnée manque, dis-le explicitement
- Présente les montants en EUR avec le format français (espaces comme séparateurs de milliers)
- Sois concis, structuré et actionnable dans tes réponses
- Utilise des tableaux markdown quand c'est pertinent
- Mets en gras les chiffres clés et les recommandations
- Quand on te pose une question d'analyse, commence par récupérer les données nécessaires, puis fais tes calculs
- Réponds toujours en français

**Règles pour les modifications** :
- Quand l'utilisateur demande de modifier une donnée, utilise d'abord \`search_entities\` ou un outil de lecture pour trouver l'ID de l'entité à modifier
- Confirme toujours à l'utilisateur ce que tu as modifié en résumant les changements effectués
- Si la recherche retourne plusieurs résultats, demande à l'utilisateur de préciser lequel il souhaite modifier
- Si une modification échoue, explique clairement l'erreur à l'utilisateur`;

// ─── Route handler ──────────────────────────────────────────
export function registerChatRoutes(app: Express) {
  app.post("/api/chat", requireAuth, chatLimiter, async (req: Request, res: Response) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "L'assistant IA n'est pas configuré. Ajoutez ANTHROPIC_API_KEY dans les variables d'environnement." });
    }

    const { messages } = req.body as { messages: ChatMessage[] };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages requis" });
    }

    let keepalive: ReturnType<typeof setInterval> | undefined;
    try {
      // Set up SSE for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      // Build messages for Claude
      const claudeMessages: Array<{ role: string; content: any }> = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Send SSE keepalive every 15s to prevent proxy/load-balancer timeouts
      keepalive = setInterval(() => {
        res.write(": keepalive\n\n");
      }, 15_000);

      // Agentic loop: keep calling Claude until we get a final text response
      let continueLoop = true;
      let fullResponse = "";

      while (continueLoop) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout per API call

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: toolDefinitions,
            messages: claudeMessages,
          }),
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const err = await response.text();
          logger.error("Claude API error", { status: response.status, body: err });
          const userMessage = response.status === 401
            ? "Clé API Anthropic invalide ou expirée. Vérifiez la variable ANTHROPIC_API_KEY dans vos variables d'environnement."
            : response.status === 429
            ? "Limite de requêtes API Anthropic atteinte. Réessayez dans quelques instants."
            : `Erreur API Claude (${response.status})`;
          res.write(`data: ${JSON.stringify({ type: "error", error: userMessage })}\n\n`);
          res.end();
          return;
        }

        const result = await response.json() as any;

        // Check if Claude wants to use tools
        const toolUseBlocks = (result.content || []).filter((b: any) => b.type === "tool_use");
        const textBlocks = (result.content || []).filter((b: any) => b.type === "text");

        if (toolUseBlocks.length > 0) {
          // Add assistant message with tool calls
          claudeMessages.push({ role: "assistant", content: result.content });

          // Execute all tool calls
          const toolResults: any[] = [];
          for (const toolCall of toolUseBlocks) {
            // Notify client about tool usage
            res.write(`data: ${JSON.stringify({ type: "tool_use", tool: toolCall.name })}\n\n`);

            const toolResult = await executeTool(toolCall.name, toolCall.input || {});
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: JSON.stringify(toolResult),
            });
          }

          // Add tool results as user message
          claudeMessages.push({ role: "user", content: toolResults });
        } else {
          // No tool calls — final response
          continueLoop = false;
          fullResponse = textBlocks.map((b: any) => b.text).join("\n");
        }

        // Safety: max 10 tool rounds (modifications need search + update + confirm)
        if (claudeMessages.length > messages.length * 2 + 20) {
          continueLoop = false;
          fullResponse = fullResponse || "J'ai atteint la limite de requêtes pour cette question. Pourriez-vous reformuler ?";
        }
      }

      // Stream the final text in chunks for a typing effect
      const chunkSize = 20;
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        const chunk = fullResponse.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`);
      }

      clearInterval(keepalive);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error: any) {
      clearInterval(keepalive);
      const isTimeout = error.name === "AbortError";
      const userMessage = isTimeout
        ? "La requête a mis trop de temps. Essayez une question plus simple."
        : error.message;
      logger.error("Chat error", { error: error.message });
      try {
        res.write(`data: ${JSON.stringify({ type: "error", error: userMessage })}\n\n`);
        res.end();
      } catch {
        res.status(500).json({ error: userMessage });
      }
    }
  });
}
