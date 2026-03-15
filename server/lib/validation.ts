/**
 * Schémas Zod pour la validation des entrées API.
 * Alignés sur shared/schema.ts (Drizzle).
 */
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

// ============================================================
// Middleware de validation
// ============================================================

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return res.status(400).json({ error: "Données invalides", details: errors });
    }
    req.body = result.data;
    next();
  };
}

// ============================================================
// Helpers
// ============================================================

const optStr = z.string().optional().nullable();
const optNum = z.union([z.string(), z.number()]).optional().nullable();
const optBool = z.boolean().optional().nullable();
const optInt = z.union([z.string(), z.number()]).pipe(z.coerce.number().int()).optional().nullable();

// ============================================================
// AUTH
// ============================================================

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(6, "Le nouveau mot de passe doit faire au moins 6 caractères"),
});

export const createUserSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: optStr,
  lastName: optStr,
  role: z.enum(["user", "admin"]).optional().default("user"),
});

// ============================================================
// ASSET MANAGEMENT
// ============================================================

export const sciSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  formeJuridique: optStr,
  capital: optNum,
  regimeFiscal: optStr,
  siret: optStr,
  adresse: optStr,
  ville: optStr,
  codePostal: optStr,
  dateCreation: optStr,
  gerant: optStr,
  expertComptable: optStr,
  banque: optStr,
  iban: optStr,
  notes: optStr,
});

export const associeSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: optStr,
  email: z.string().email("Email invalide").optional().nullable().or(z.literal("")),
  telephone: optStr,
  adresse: optStr,
  siret: optStr,
  notes: optStr,
});

export const participationSchema = z.object({
  associeId: z.string().uuid("ID associé invalide"),
  sciId: z.string().uuid("ID SCI invalide"),
  partsSociales: optNum,
  pourcentage: optNum,
  montantApport: optNum,
  dateEntree: optStr,
  notes: optStr,
});

export const actifSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  sciId: optStr,
  adresse: optStr,
  ville: optStr,
  codePostal: optStr,
  type: optStr,
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  surface: optNum,
  surfaceCarrez: optNum,
  referenceCadastrale: optStr,
  anneeConstruction: optInt,
  dpe: optStr,
  erp: optBool,
  pmi: optBool,
  prixAcquisition: optNum,
  fraisNotaire: optNum,
  fraisAgence: optNum,
  montantTravaux: optNum,
  dateAcquisition: optStr,
  chargesAnnuelles: optNum,
  taxeFonciere: optNum,
  assurancePno: optNum,
  chargesCopropriete: optNum,
  tauxCapitalisation: optNum,
  prixM2Marche: optNum,
  valeurEstimeeSortie: optNum,
  dateEstimation: optStr,
  sourceEstimation: optStr,
  syndic: optStr,
  regimeJuridique: optStr,
  notes: optStr,
  archived: optBool,
});

export const lotSchema = z.object({
  actifId: z.string().uuid("ID actif invalide"),
  sciId: optStr,
  designation: z.string().min(1, "La désignation est requise"),
  type: optStr,
  etage: optStr,
  surface: optNum,
  surfaceCarrez: optNum,
  dpe: optStr,
  loyerMensuel: optNum,
  loyerAnnuel: optNum,
  chargesLot: optNum,
  statut: optStr,
  locataireId: optStr,
  notes: optStr,
  archived: optBool,
});

export const locataireAMSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: optStr,
  email: z.string().email("Email invalide").optional().nullable().or(z.literal("")),
  telephone: optStr,
  adresse: optStr,
  siret: optStr,
  notes: optStr,
});

export const bailAMSchema = z.object({
  lotId: optStr,
  actifId: optStr,
  sciId: optStr,
  locataireId: optStr,
  typeBail: optStr,
  dateDebut: optStr,
  dateFin: optStr,
  dateSignature: optStr,
  loyerMensuel: optNum,
  loyerAnnuel: optNum,
  charges: optNum,
  depotGarantie: optNum,
  indiceReference: optStr,
  trimestreRef: optStr,
  valeurIndiceBase: optNum,
  statut: optStr,
  loyerTheorique: optNum,
  notes: optStr,
  archived: optBool,
});

export const empruntSchema = z.object({
  sciId: optStr,
  actifId: optStr,
  banque: optStr,
  montantEmprunte: optNum,
  capitalRestantDu: optNum,
  tauxAnnuel: optNum,
  taeg: optNum,
  dureeAns: optInt,
  dureeMois: optInt,
  dateDebut: optStr,
  dateFin: optStr,
  typeAmortissement: optStr,
  mensualite: optNum,
  assuranceMensuelle: optNum,
  tauxAssurance: optNum,
  typeGarantie: optStr,
  ira: optNum,
  notes: optStr,
  archived: optBool,
});

export const travauxSchema = z.object({
  actifId: z.string().uuid("ID actif invalide"),
  sciId: optStr,
  titre: z.string().min(1, "Le titre est requis"),
  description: optStr,
  budget: optNum,
  montantReel: optNum,
  dateDebut: optStr,
  dateFin: optStr,
  statut: optStr,
  prestataire: optStr,
  notes: optStr,
});

export const documentAMSchema = z.object({
  actifId: optStr,
  sciId: optStr,
  name: z.string().min(1, "Le nom est requis"),
  type: z.string().min(1, "Le type est requis"),
  category: optStr,
  storageUrl: optStr,
  fileName: optStr,
  fileSize: optInt,
  mimeType: optStr,
  notes: optStr,
});

// ============================================================
// GESTION LOCATIVE
// ============================================================

export const bailleurSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  type: optStr,
  email: z.string().email("Email invalide").optional().nullable().or(z.literal("")),
  telephone: optStr,
  adresse: optStr,
  siret: optStr,
  iban: optStr,
  notes: optStr,
});

export const gestionnaireSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  bailleurId: optStr,
  email: z.string().email("Email invalide").optional().nullable().or(z.literal("")),
  telephone: optStr,
  adresse: optStr,
  societe: optStr,
  siret: optStr,
  notes: optStr,
});

export const locataireGLSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: optStr,
  email: z.string().email("Email invalide").optional().nullable().or(z.literal("")),
  telephone: optStr,
  adresse: optStr,
  siret: optStr,
  notes: optStr,
});

const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Format de date attendu : YYYY-MM-DD").optional().nullable().or(z.literal(""));

export const bailGLSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  locataireId: optStr,
  bailleurId: optStr,
  gestionnaireId: optStr,
  typeBail: optStr,
  adresse: optStr,
  ville: optStr,
  codePostal: optStr,
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  dateSignature: optDate,
  dateEffet: optDate,
  dateDebut: optDate,
  dateFin: optDate,
  periodeFermeDebut: optStr,
  periodeFermeFin: optStr,
  periodeFermeDureeAns: optInt,
  echTrien1: optStr,
  echTrien2: optStr,
  echTrien3: optStr,
  loyerBaseHT: optNum,
  loyerHTActu: optNum,
  forceManual: optBool,
  indiceReference: optStr,
  trimestreRef: optStr,
  dateIndiceBase: optStr,
  valeurIndiceBase: optNum,
  charges: optNum,
  depotGarantie: optNum,
  taxeFonciere: optNum,
  taxe: optStr,
  tvaTaux: optNum,
  garantieType: optStr,
  garantieMontant: optNum,
  surface: optNum,
  surfaceExterieure: optNum,
  capacite: optInt,
  statut: optStr,
  archived: optBool,
  notes: optStr,
});

export const paiementGLSchema = z.object({
  bailId: z.string().uuid("ID bail invalide"),
  date: z.string().min(1, "La date est requise"),
  montant: z.union([z.string(), z.number()]),
  type: z.string().min(1, "Le type est requis"),
  methode: optStr,
  reference: optStr,
  notes: optStr,
});

export const factureGLSchema = z.object({
  bailId: z.string().uuid("ID bail invalide"),
  type: z.string().min(1, "Le type est requis"),
  fileName: z.string().min(1, "Le nom de fichier est requis"),
  fileUrl: optStr,
  fileSize: optInt,
  mimeType: optStr,
  dateFacture: z.string().min(1, "La date est requise"),
  dateEcheance: optStr,
  montantHT: optNum,
  montantTTC: z.union([z.string(), z.number()]),
  reference: optStr,
  statut: z.string().min(1, "Le statut est requis"),
  datePaiement: optStr,
  notes: optStr,
});

export const quittanceGLSchema = z.object({
  bailId: z.string().uuid("ID bail invalide"),
  periodeDebut: z.string().min(1, "La période de début est requise"),
  periodeFin: z.string().min(1, "La période de fin est requise"),
  montantLoyer: optNum,
  montantCharges: optNum,
  montantTotal: optNum,
  dateEmission: optStr,
  statut: optStr,
  notes: optStr,
});

export const indexationGLSchema = z.object({
  bailId: z.string().uuid("ID bail invalide"),
  dateApplication: z.string().min(1, "La date est requise"),
  ancienLoyer: optNum,
  nouveauLoyer: optNum,
  indiceBase: optNum,
  indiceNouveau: optNum,
  typeIndice: optStr,
  tauxVariation: optNum,
  notes: optStr,
});

export const avenantGLSchema = z.object({
  bailId: z.string().uuid("ID bail invalide"),
  dateEffet: z.string().min(1, "La date d'effet est requise"),
  dateSignature: optStr,
  champsModifies: z.string().min(1, "Les champs modifiés sont requis"),
  titre: optStr,
  notes: optStr,
});

export const renouvellementGLSchema = z.object({
  bailId: z.string().uuid("ID bail invalide"),
  dateEffet: z.string().min(1, "La date d'effet est requise"),
  dateSignature: optStr,
  nouvelleDateFin: z.string().min(1, "La nouvelle date de fin est requise"),
  champsModifies: z.string().min(1, "Les champs modifiés sont requis"),
  titre: optStr,
  notes: optStr,
});

export const documentGLSchema = z.object({
  bailId: optStr,
  name: z.string().min(1, "Le nom est requis"),
  type: z.string().min(1, "Le type est requis"),
  category: optStr,
  storageUrl: optStr,
  fileName: optStr,
  fileSize: optInt,
  mimeType: optStr,
  dateDocument: optStr,
  notes: optStr,
});

export const indiceSchema = z.object({
  type: z.enum(["ILC", "IRL", "ILAT", "ICC"], { message: "Type d'indice invalide" }),
  trimestre: z.string().min(1, "Le trimestre est requis"),
  valeur: z.union([z.string(), z.number()]),
});

// ============================================================
// Map resource name → schemas (for CRUD factory)
// ============================================================

export const amSchemas: Record<string, z.AnyZodObject> = {
  scis: sciSchema,
  associes: associeSchema,
  participations: participationSchema,
  actifs: actifSchema,
  lots: lotSchema,
  locataires: locataireAMSchema,
  baux: bailAMSchema,
  emprunts: empruntSchema,
  travaux: travauxSchema,
  documents: documentAMSchema,
};

export const glSchemas: Record<string, z.AnyZodObject> = {
  bailleurs: bailleurSchema,
  gestionnaires: gestionnaireSchema,
  locataires: locataireGLSchema,
  baux: bailGLSchema,
  paiements: paiementGLSchema,
  factures: factureGLSchema,
  quittances: quittanceGLSchema,
  indexations: indexationGLSchema,
  avenants: avenantGLSchema,
  renouvellements: renouvellementGLSchema,
  documents: documentGLSchema,
  indices: indiceSchema,
};
