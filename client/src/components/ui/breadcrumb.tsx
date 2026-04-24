import { Link, useLocation } from "wouter";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "asset-management": "Asset Management",
  "gestion-locative": "Gestion Locative",
  dashboard: "Tableau de bord",
  scis: "SCIs",
  actifs: "Actifs",
  lots: "Lots",
  baux: "Baux",
  emprunts: "Emprunts",
  locataires: "Locataires",
  associes: "Associés",
  travaux: "Travaux",
  valorisation: "Valorisation",
  "controle-gestion": "Contrôle de gestion",
  arbitrages: "Arbitrages",
  patrimoine: "Patrimoine",
  "scis-associes": "SCIs & Associés",
  carte: "Carte",
  calendrier: "Calendrier",
  reporting: "Reporting",
  simulateur: "Simulateur",
  "etude-marche": "Analyse patrimoniale",
  alertes: "Alertes",
  "indexation-auto": "Indexation auto",
  "score-sante": "Score de Santé",
  import: "Import de données",
  "extraction-bail": "Extraction Bail PDF",
  "projections-predictives": "Projections",
  bailleurs: "Bailleurs",
  paiements: "Paiements",
  kpi: "KPIs",
  projections: "Projections",
  indices: "Indices",
  tresorerie: "Trésorerie",
  documents: "Documents",
  "controle-bailleur": "Contrôle bailleur",
  admin: "Administration",
};

export function Breadcrumb() {
  const [location] = useLocation();

  if (location === "/") return null;

  const segments = location.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs: { label: string; href: string }[] = [];
  let pathSoFar = "";

  for (const segment of segments) {
    pathSoFar += `/${segment}`;
    const label = ROUTE_LABELS[segment] || segment;
    crumbs.push({ label, href: pathSoFar });
  }

  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
      <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
        <span>Accueil</span>
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            {isLast ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
