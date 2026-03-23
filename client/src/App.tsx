import { Route, Switch } from "wouter";
import { useAuth } from "./contexts/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
// Asset Management
import AMDashboard from "./pages/asset-management/Dashboard";
import SCIsPage from "./pages/asset-management/SCIs";
import ActifsPage from "./pages/asset-management/Actifs";
import ActifDetailPage from "./pages/asset-management/ActifDetail";
import LotsPage from "./pages/asset-management/Lots";
import BauxAMPage from "./pages/asset-management/Baux";
import EmpruntsPage from "./pages/asset-management/Emprunts";
import LocatairesAMPage from "./pages/asset-management/Locataires";
import AssociesPage from "./pages/asset-management/Associes";
import TravauxPage from "./pages/asset-management/Travaux";
import ValorisationPage from "./pages/asset-management/Valorisation";
import ControleGestionPage from "./pages/asset-management/ControleGestion";
import ArbitragesPage from "./pages/asset-management/Arbitrages";
import CartePage from "./pages/asset-management/Carte";
import CalendrierAMPage from "./pages/asset-management/Calendrier";
import ReportingPage from "./pages/asset-management/Reporting";
import SCIsAssociesPage from "./pages/asset-management/SCIsAssocies";
import VuePatrimoinePage from "./pages/asset-management/VuePatrimoine";
import SimulateurPage from "./pages/asset-management/Simulateur";
import DonneesMarche from "./pages/asset-management/DonneesMarche";
// Gestion Locative
import GLDashboard from "./pages/gestion-locative/Dashboard";
import BauxGLPage from "./pages/gestion-locative/Baux";
import BailleursPage from "./pages/gestion-locative/Bailleurs";
import LocatairesGLPage from "./pages/gestion-locative/Locataires";
import PaiementsGLPage from "./pages/gestion-locative/Paiements";
import GLKPIPage from "./pages/gestion-locative/KPI";
import ProjectionsPage from "./pages/gestion-locative/Projections";
import AlertesPage from "./pages/gestion-locative/Alertes";
import IndicesPage from "./pages/gestion-locative/Indices";
import CalendrierGLPage from "./pages/gestion-locative/Calendrier";
import BailGLDetailPage from "./pages/gestion-locative/BailDetail";
import TresoreriePage from "./pages/gestion-locative/Tresorerie";
import DocumentsGLPage from "./pages/gestion-locative/Documents";
import ControleBailleurPage from "./pages/gestion-locative/ControleBailleur";
import AdminPage from "./pages/AdminPage";

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
        <Route path="/asset-management/donnees-marche" component={DonneesMarche} />

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
      </ErrorBoundary>
    </AppLayout>
  );
}
