import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { PageHeader } from "../../components/ui/page-header";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../lib/utils";
import {
  TreePine, Building2, Key, FileText, Users, ChevronRight,
  Landmark, MapPin,
} from "lucide-react";
import ActifsPage from "./Actifs";
import LotsPage from "./Lots";
import BauxAMPage from "./Baux";
import LocatairesAMPage from "./Locataires";
import CartePage from "./Carte";

interface SCI { id: string; nom: string; }
interface Actif { id: string; nom: string; sciId?: string; ville?: string; type?: string; surface?: string; prixAcquisition?: string; archived?: boolean; }
interface Lot { id: string; actifId: string; designation: string; type?: string; surface?: string; statut?: string; loyerMensuel?: string; archived?: boolean; }
interface BailAM { id: string; lotId?: string; actifId?: string; sciId?: string; locataireId?: string; loyerMensuel?: string; loyerAnnuel?: string; statut?: string; typeBail?: string; }
interface Locataire { id: string; nom: string; prenom?: string; }

function ArbrePatrimoine() {
  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });
  const { data: actifs = [] } = useQuery<Actif[]>({
    queryKey: ["/api/am/actifs"],
    queryFn: () => apiRequest("/api/am/actifs"),
  });
  const { data: lots = [] } = useQuery<Lot[]>({
    queryKey: ["/api/am/lots"],
    queryFn: () => apiRequest("/api/am/lots"),
  });
  const { data: baux = [] } = useQuery<BailAM[]>({
    queryKey: ["/api/am/baux"],
    queryFn: () => apiRequest("/api/am/baux"),
  });
  const { data: locataires = [] } = useQuery<Locataire[]>({
    queryKey: ["/api/am/locataires"],
    queryFn: () => apiRequest("/api/am/locataires"),
  });

  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const locataireMap = Object.fromEntries(locataires.map((l) => [l.id, `${l.nom} ${l.prenom || ""}`]));
  const activeActifs = actifs.filter((a) => !a.archived);
  const activeLots = lots.filter((l) => !l.archived);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // KPIs
  const totalActifs = activeActifs.length;
  const totalLots = activeLots.length;
  const totalBaux = baux.filter((b: any) => !b.archived).length;
  const totalSurface = activeActifs.reduce((s, a) => s + (a.surface ? parseFloat(a.surface) : 0), 0);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Actifs" value={totalActifs} icon={Building2} variant="primary" gradient delay={0} />
          <KpiCard label="Lots" value={totalLots} icon={Key} variant="success" gradient delay={1} />
          <KpiCard label="Baux" value={totalBaux} icon={FileText} variant="warning" gradient delay={2} />
          <KpiCard label="Surface totale" value={totalSurface} formatFn={(n) => `${n.toLocaleString("fr-FR")} m²`} icon={MapPin} variant="primary" gradient delay={3} />
        </div>

        {/* Tree: SCI → Actifs → Lots → Baux */}
        {scis.map((sci, si) => {
          const sciActifs = activeActifs.filter((a) => a.sciId === sci.id);
          const sciKey = `sci-${sci.id}`;
          const sciExpanded = expanded[sciKey] !== false; // expanded by default

          return (
            <Section key={sci.id} title="" delay={si}>
              <GlassCard>
                <button
                  onClick={() => toggle(sciKey)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${sciExpanded ? "rotate-90" : ""}`} />
                  <Landmark className="h-5 w-5 text-orange-500" />
                  <span className="text-lg font-semibold">{sci.nom}</span>
                  <Badge variant="primary" className="ml-2">{sciActifs.length} actif(s)</Badge>
                </button>

                {sciExpanded && (
                  <div className="ml-8 mt-4 space-y-3">
                    {sciActifs.length === 0 && (
                      <p className="text-sm text-muted-foreground">Aucun actif rattache</p>
                    )}
                    {sciActifs.map((actif) => {
                      const actifLots = activeLots.filter((l) => l.actifId === actif.id);
                      const actifBaux = baux.filter((b) => b.actifId === actif.id);
                      const actifKey = `actif-${actif.id}`;
                      const actifExpanded = expanded[actifKey] !== false;

                      return (
                        <div key={actif.id} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                          <button
                            onClick={() => toggle(actifKey)}
                            className="flex w-full items-center gap-3 text-left"
                          >
                            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${actifExpanded ? "rotate-90" : ""}`} />
                            <Building2 className="h-4 w-4 text-rose-500" />
                            <span className="font-medium">{actif.nom}</span>
                            {actif.ville && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{actif.ville}
                              </span>
                            )}
                            {actif.type && <Badge variant="outline" className="text-xs">{actif.type}</Badge>}
                            {actif.surface && <span className="text-xs text-muted-foreground">{actif.surface} m²</span>}
                          </button>

                          {actifExpanded && (
                            <div className="ml-8 mt-3 space-y-2">
                              {/* Lots */}
                              {actifLots.length > 0 && (
                                <div className="space-y-1">
                                  {actifLots.map((lot) => {
                                    const lotBaux = baux.filter((b) => b.lotId === lot.id);
                                    return (
                                      <div key={lot.id} className="flex items-center gap-2 rounded bg-muted/20 px-3 py-2 text-sm">
                                        <Key className="h-3.5 w-3.5 text-amber-500" />
                                        <span className="font-medium">{lot.designation}</span>
                                        {lot.type && <Badge variant="outline" className="text-xs">{lot.type}</Badge>}
                                        {lot.surface && <span className="text-xs text-muted-foreground">{lot.surface} m²</span>}
                                        {lot.statut && (
                                          <Badge variant={lot.statut === "loué" ? "success" : "warning"} className="text-xs">
                                            {lot.statut}
                                          </Badge>
                                        )}
                                        {lot.loyerMensuel && (
                                          <span className="text-xs font-medium ml-auto">{formatCurrency(lot.loyerMensuel)}/mois</span>
                                        )}
                                        {lotBaux.map((bail) => (
                                          <Badge key={bail.id} variant="primary" className="text-xs ml-1">
                                            {locataireMap[bail.locataireId || ""] || "Bail"}
                                          </Badge>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {/* Direct baux (without lot) */}
                              {actifBaux.filter((b) => !b.lotId).length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground font-medium">Baux directs :</p>
                                  {actifBaux
                                    .filter((b) => !b.lotId)
                                    .map((bail) => (
                                      <div key={bail.id} className="flex items-center gap-2 rounded bg-muted/20 px-3 py-2 text-sm">
                                        <FileText className="h-3.5 w-3.5 text-green-500" />
                                        <span>{locataireMap[bail.locataireId || ""] || "Bail sans locataire"}</span>
                                        {bail.typeBail && <Badge variant="outline" className="text-xs">{bail.typeBail}</Badge>}
                                        {bail.loyerMensuel && (
                                          <span className="text-xs font-medium ml-auto">{formatCurrency(bail.loyerMensuel)}/mois</span>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              )}
                              {actifLots.length === 0 && actifBaux.filter((b) => !b.lotId).length === 0 && (
                                <p className="text-xs text-muted-foreground">Aucun lot ou bail rattache</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            </Section>
          );
        })}

        {/* Actifs sans SCI */}
        {activeActifs.filter((a) => !a.sciId).length > 0 && (
          <Section title="Actifs sans SCI" delay={scis.length + 1}>
            <GlassCard>
              <div className="space-y-2">
                {activeActifs
                  .filter((a) => !a.sciId)
                  .map((actif) => (
                    <div key={actif.id} className="flex items-center gap-3 rounded-lg bg-muted/20 px-4 py-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{actif.nom}</span>
                      {actif.ville && <span className="text-sm text-muted-foreground">{actif.ville}</span>}
                    </div>
                  ))}
              </div>
            </GlassCard>
          </Section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function VuePatrimoinePage() {
  const [activeTab, setActiveTab] = useState("arbre");

  return (
    <div className="space-y-6">
      <PageHeader title="Patrimoine" description="Vue complète du patrimoine immobilier" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="arbre">Arbre patrimoine</TabsTrigger>
          <TabsTrigger value="actifs">Actifs</TabsTrigger>
          <TabsTrigger value="lots">Lots</TabsTrigger>
          <TabsTrigger value="baux">Baux</TabsTrigger>
          <TabsTrigger value="locataires">Locataires</TabsTrigger>
          <TabsTrigger value="carte">Carte</TabsTrigger>
        </TabsList>
        <TabsContent value="arbre">
          <ArbrePatrimoine />
        </TabsContent>
        <TabsContent value="actifs">
          <ActifsPage />
        </TabsContent>
        <TabsContent value="lots">
          <LotsPage />
        </TabsContent>
        <TabsContent value="baux">
          <BauxAMPage />
        </TabsContent>
        <TabsContent value="locataires">
          <LocatairesAMPage />
        </TabsContent>
        <TabsContent value="carte">
          <CartePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
