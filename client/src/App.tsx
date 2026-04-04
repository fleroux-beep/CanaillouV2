import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { useAuth } from "./contexts/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Eager: login is needed immediately
import LoginPage from "./pages/LoginPage";

// Lazy-loaded page components
const HomePage = lazy(() => import("./pages/HomePage"));
// Asset Management
const AMDashboard = lazy(() => import("./pages/asset-management/Dashboard"));
const SCIsPage = lazy(() => import("./pages/asset-management/SCIs"));
const ActifsPage = lazy(() => import("./pages/asset-management/Actifs"));
const ActifDetailPage = lazy(() => import("./pages/asset-management/ActifDetail"));
const LotsPage = lazy(() => import("./pages/asset-management/Lots"));
const BauxAMPage = lazy(() => import("./pages/asset-management/Baux"));
const EmpruntsPage = lazy(() => import("./pages/asset-management/Emprunts"));
const LocatairesAMPage = lazy(() => import("./pages/asset-management/Locataires"));
const AssociesPage = lazy(() => import("./pages/asset-management/Associes"));
const TravauxPage = lazy(() => import("./pages/asset-management/Travaux"));
const ValorisationPage = lazy(() => import("./pages/asset-management/Valorisation"));
const ControleGestionPage = lazy(() => import("./pages/asset-management/ControleGestion"));
const ArbitragesPage = lazy(() => import("./pages/asset-management/Arbitrages"));
const CartePage = lazy(() => import("./pages/asset-management/Carte"));
const CalendrierAMPage = lazy(() => import("./pages/asset-management/Calendrier"));
const ReportingPage = lazy(() => import("./pages/asset-management/Reporting"));
const SCIsAssociesPage = lazy(() => import("./pages/asset-management/SCIsAssocies"));
const VuePatrimoinePage = lazy(() => import("./pages/asset-management/VuePatrimoine"));
const SimulateurPage = lazy(() => import("./pages/asset-management/Simulateur"));
const EtudeMarchePage = lazy(() => import("./pages/asset-management/EtudeMarche"));
const AlertesAMPage = lazy(() => import("./pages/asset-management/AlertesAM"));
const IndexationAutoPage = lazy(() => import("./pages/asset-management/IndexationAuto"));
const ScoreSantePage = lazy(() => import("./pages/asset-management/ScoreSante"));
const ImportDonneesPage = lazy(() => import("./pages/asset-management/ImportDonnees"));
const ExtractionBailPDFPage = lazy(() => import("./pages/asset-management/ExtractionBailPDF"));
const ProjectionsPredictivesPage = lazy(() => import("./pages/asset-management/ProjectionsPredictives"));
// Gestion Locative
const GLDashboard = lazy(() => import("./pages/gestion-locative/Dashboard"));
const BauxGLPage = lazy(() => import("./pages/gestion-locative/Baux"));
const BailleursPage = lazy(() => import("./pages/gestion-locative/Bailleurs"));
const LocatairesGLPage = lazy(() => import("./pages/gestion-locative/Locataires"));
const PaiementsGLPage = lazy(() => import("./pages/gestion-locative/Paiements"));
const GLKPIPage = lazy(() => import("./pages/gestion-locative/KPI"));
const ProjectionsPage = lazy(() => import("./pages/gestion-locative/Projections"));
const AlertesPage = lazy(() => import("./pages/gestion-locative/Alertes"));
const IndicesPage = lazy(() => import("./pages/gestion-locative/Indices"));
const CalendrierGLPage = lazy(() => import("./pages/gestion-locative/Calendrier"));
const BailGLDetailPage = lazy(() => import("./pages/gestion-locative/BailDetail"));
const TresoreriePage = lazy(() => import("./pages/gestion-locative/Tresorerie"));
const DocumentsGLPage = lazy(() => import("./pages/gestion-locative/Documents"));
const ControleBailleurPage = lazy(() => import("./pages/gestion-locative/ControleBailleur"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function PageSpinner() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <span className="text-sm text-muted-foreground">Chargement...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppLayout>
      <ErrorBoundary>
      <Suspense fallback={<PageSpinner />}>
      <Switch>
        <Route path="/" component={HomePage} />

        {/* Asset Management */}
        <Route path="/asset-management" component={AMDashboard} />
        <Route path="/asset-management/dashboard" component={AMDashboard} />
        <Route path="/asset-management/scis" component={SCIsPage} />
        <Route path="/asset-management/actifs/:id" component={ActifDetailPage} />
        <Route path="/asset-management/actifs" component={ActifsPage} />
        <Route path="/asset-management/lots" component={LotsPage} />
        <Route path="/asset-management/baux" component={BauxAMPage} />
        <Route path="/asset-management/emprunts" component={EmpruntsPage} />
        <Route path="/asset-management/locataires" component={LocatairesAMPage} />
        <Route path="/asset-management/associes" component={AssociesPage} />
        <Route path="/asset-management/travaux" component={TravauxPage} />
        <Route path="/asset-management/valorisation" component={ValorisationPage} />
        <Route path="/asset-management/controle-gestion" component={ControleGestionPage} />
        <Route path="/asset-management/arbitrages" component={ArbitragesPage} />
        <Route path="/asset-management/patrimoine" component={VuePatrimoinePage} />
        <Route path="/asset-management/scis-associes" component={SCIsAssociesPage} />
        <Route path="/asset-management/carte" component={CartePage} />
        <Route path="/asset-management/calendrier" component={CalendrierAMPage} />
        <Route path="/asset-management/reporting" component={ReportingPage} />
        <Route path="/asset-management/simulateur" component={SimulateurPage} />
        <Route path="/asset-management/etude-marche" component={EtudeMarchePage} />
        <Route path="/asset-management/alertes" component={AlertesAMPage} />
        <Route path="/asset-management/indexation-auto" component={IndexationAutoPage} />
        <Route path="/asset-management/score-sante" component={ScoreSantePage} />
        <Route path="/asset-management/import" component={ImportDonneesPage} />
        <Route path="/asset-management/extraction-bail" component={ExtractionBailPDFPage} />
        <Route path="/asset-management/projections-predictives" component={ProjectionsPredictivesPage} />

        {/* Gestion Locative */}
        <Route path="/gestion-locative" component={GLDashboard} />
        <Route path="/gestion-locative/dashboard" component={GLDashboard} />
        <Route path="/gestion-locative/baux/:id" component={BailGLDetailPage} />
        <Route path="/gestion-locative/baux" component={BauxGLPage} />
        <Route path="/gestion-locative/bailleurs" component={BailleursPage} />
        <Route path="/gestion-locative/locataires" component={LocatairesGLPage} />
        <Route path="/gestion-locative/paiements" component={PaiementsGLPage} />
        <Route path="/gestion-locative/kpi" component={GLKPIPage} />
        <Route path="/gestion-locative/projections" component={ProjectionsPage} />
        <Route path="/gestion-locative/alertes" component={AlertesPage} />
        <Route path="/gestion-locative/indices" component={IndicesPage} />
        <Route path="/gestion-locative/tresorerie" component={TresoreriePage} />
        <Route path="/gestion-locative/documents" component={DocumentsGLPage} />
        <Route path="/gestion-locative/controle-bailleur" component={ControleBailleurPage} />
        <Route path="/gestion-locative/calendrier" component={CalendrierGLPage} />

        {/* Administration */}
        <Route path="/admin" component={AdminPage} />

        {/* 404 */}
        <Route>
          <div className="flex h-[60vh] items-center justify-center">
            <div className="text-center">
              <p className="text-4xl font-bold text-muted-foreground/30">404</p>
              <p className="mt-2 text-muted-foreground">Page non trouvee</p>
            </div>
          </div>
        </Route>
      </Switch>
      </Suspense>
      </ErrorBoundary>
    </AppLayout>
  );
}
