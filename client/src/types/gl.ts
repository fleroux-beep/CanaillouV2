// ============================================================
// Gestion Locative — Shared TypeScript Interfaces
// Derived from shared/schema.ts table definitions.
// Numeric columns come back as strings from the API; timestamps
// come back as string | null.
// ============================================================

export interface Bailleur {
  id: string;
  nom: string;
  type?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  siret?: string;
  iban?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Gestionnaire {
  id: string;
  nom: string;
  bailleurId?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  societe?: string;
  siret?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocataireGL {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  siret?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BailGL {
  id: string;
  nom: string;
  locataireId?: string;
  bailleurId?: string;
  gestionnaireId?: string;
  typeBail?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  lat?: number;
  lng?: number;
  // Dates
  dateSignature?: string;
  dateEffet?: string;
  dateDebut?: string;
  dateFin?: string;
  periodeFermeDebut?: string;
  periodeFermeFin?: string;
  periodeFermeDureeAns?: number;
  echTrien1?: string;
  echTrien2?: string;
  echTrien3?: string;
  // Loyer
  loyerBaseHT?: string;
  loyerHTActu?: string;
  forceManual?: boolean;
  loyerManuelOverride?: string;
  // Indexation
  indiceReference?: string;
  trimestreRef?: string;
  dateIndiceBase?: string;
  valeurIndiceBase?: string;
  // Charges & Taxes
  charges?: string;
  depotGarantie?: string;
  taxeFonciere?: string;
  taxe?: string;
  tvaTaux?: string;
  // Garanties
  garantieType?: string;
  garantieMontant?: string;
  // Capacite
  surface?: string;
  surfaceExterieure?: string;
  capacite?: number;
  // Statut
  statut?: string;
  archived?: boolean;
  deletedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaiementGL {
  id: string;
  bailId: string;
  date: string;
  montant: string;
  type: string;
  methode?: string;
  reference?: string;
  notes?: string;
  createdAt?: string;
}

export interface FactureGL {
  id: string;
  bailId: string;
  type: string;
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  dateFacture: string;
  dateEcheance?: string;
  montantHT?: string;
  montantTTC: string;
  reference?: string;
  statut: string;
  datePaiement?: string;
  notes?: string;
  createdAt?: string;
}

export interface QuittanceGL {
  id: string;
  bailId: string;
  periodeDebut: string;
  periodeFin: string;
  montantLoyer?: string;
  montantCharges?: string;
  montantTotal?: string;
  dateEmission?: string;
  statut?: string;
  notes?: string;
  createdAt?: string;
}

export interface IndexationGL {
  id: string;
  bailId: string;
  dateApplication: string;
  ancienLoyer?: string;
  nouveauLoyer?: string;
  indiceBase?: string;
  indiceNouveau?: string;
  typeIndice?: string;
  tauxVariation?: string;
  notes?: string;
  createdAt?: string;
}
