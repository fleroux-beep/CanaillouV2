// ============================================================
// Asset Management — Shared TypeScript Interfaces
// Derived from shared/schema.ts table definitions.
// Numeric columns come back as strings from the API; timestamps
// come back as string | null.
// ============================================================

export interface SCI {
  id: string;
  nom: string;
  formeJuridique?: string;
  capital?: string;
  regimeFiscal?: string;
  siret?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  dateCreation?: string;
  gerant?: string;
  expertComptable?: string;
  banque?: string;
  iban?: string;
  dateRevente?: string;
  tauxRendement?: string;
  dividendesRealises?: string;
  dateClotureExercice?: string;
  notes?: string;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Associe {
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

export interface Participation {
  id: string;
  associeId: string;
  sciId: string;
  partsSociales?: string;
  pourcentage?: string;
  montantApport?: string;
  dateEntree?: string;
  notes?: string;
  createdAt?: string;
}

export interface Actif {
  id: string;
  nom: string;
  sciId?: string;
  adresse?: string;
  ville?: string;
  codePostal?: string;
  type?: string;
  lat?: number;
  lng?: number;
  surface?: string;
  surfaceCarrez?: string;
  referenceCadastrale?: string;
  anneeConstruction?: number;
  dpe?: string;
  erp?: boolean;
  pmi?: boolean;
  // Acquisition
  prixAcquisition?: string;
  fraisNotaire?: string;
  fraisAgence?: string;
  montantTravaux?: string;
  dateAcquisition?: string;
  // Charges annuelles
  chargesAnnuelles?: string;
  taxeFonciere?: string;
  assurancePno?: string;
  chargesCopropriete?: string;
  // Valorisation
  tauxCapitalisation?: string;
  prixM2Marche?: string;
  valeurEstimeeSortie?: string;
  dateEstimation?: string;
  sourceEstimation?: string;
  // Gestion
  syndic?: string;
  regimeJuridique?: string;
  notes?: string;
  archived?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Lot {
  id: string;
  actifId: string;
  sciId?: string;
  designation: string;
  type?: string;
  etage?: string;
  surface?: string;
  surfaceCarrez?: string;
  dpe?: string;
  // Pas de loyer sur le lot — il est porté par le bail associé.
  chargesLot?: string;
  statut?: string;
  locataireId?: string;
  notes?: string;
  archived?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocataireAM {
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

export interface BailAM {
  id: string;
  nom?: string;
  lotId?: string;
  actifId?: string;
  sciId?: string;
  locataireId?: string;
  typeBail?: string;
  dateDebut?: string;
  dateFin?: string;
  dateSignature?: string;
  // Loyer unifié — annuel HT en EUR.
  // loyerBaseHT = saisi à la signature ; loyerHTActu = mis à jour auto
  // par l'indexation INSEE (sync-insee.autoIndexBaux). Le mensuel est
  // calculé côté UI (loyerHTActu / 12).
  loyerBaseHT?: string;
  loyerHTActu?: string;
  forceManual?: boolean;
  charges?: string;
  depotGarantie?: string;
  indiceReference?: string;
  trimestreRef?: string;
  valeurIndiceBase?: string;
  statut?: string;
  notes?: string;
  archived?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Emprunt {
  id: string;
  sciId?: string;
  actifId?: string;
  banque?: string;
  montantEmprunte?: string;
  capitalRestantDu?: string;
  tauxAnnuel?: string;
  taeg?: string;
  dureeAns?: number;
  dureeMois?: number;
  dateDebut?: string;
  dateFin?: string;
  typeAmortissement?: string;
  mensualite?: string;
  assuranceMensuelle?: string;
  tauxAssurance?: string;
  typeGarantie?: string;
  ira?: string;
  notes?: string;
  archived?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Travaux {
  id: string;
  actifId?: string;
  sciId?: string;
  titre: string;
  description?: string;
  budget?: string;
  montantReel?: string;
  dateDebut?: string;
  dateFin?: string;
  statut?: string;
  prestataire?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentAM {
  id: string;
  actifId?: string;
  sciId?: string;
  name: string;
  type: string;
  category?: string;
  storageUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  notes?: string;
  createdAt?: string;
}
