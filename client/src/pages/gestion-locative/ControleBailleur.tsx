import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  CalendarDays, Receipt, Scale, FileBarChart,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface BailGL {
  id: string;
  bailleurId?: string;
  locataireId?: string;
  adresseBien?: string;
  typeBail?: string;
  dateDebut?: string;
  dateFin?: string;
  loyerHC?: string;
  charges?: string;
  loyerCC?: string;
  loyerAnnuel?: string;
  loyerTheorique?: string;
  indiceReference?: string;
  trimestreRef?: string;
  valeurIndiceBase?: string;
  taxeFonciere?: string;
  chargesLocatives?: string;
  provisionCharges?: string;
  regularisationCharges?: string;
  statut?: string;
  periodiciteRevision?: string;
}

interface Bailleur { id: string; nom: string; }
interface Locataire { id: string; nom: string; }
interface Paiement { id: string; bailId: string; date: string; montant: string; type?: string; }
interface Indexation { id: string; bailId: string; dateRevision?: string; indiceBase?: string; indiceNouveau?: string; ancienLoyer?: string; nouveauLoyer?: string; }

/* ═══════════ Tab 1: Loyers indexes ═══════════ */
function LoyersIndexesTab() {
  const { data: baux = [] } = useQuery<BailGL[]>({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });
  const { data: bailleurs = [] } = useQuery<Bailleur[]>({
    queryKey: ["/api/gl/bailleurs"],
    queryFn: () => apiRequest("/api/gl/bailleurs"),
  });

  const bailleurMap = Object.fromEntries(bailleurs.map((b) => [b.id, b.nom]));

  // Calcul loyer indexe vs loyer actuel
  const loyerData = useMemo(() => {
    return baux
      .filter((b) => b.statut === "actif" || !b.statut)
      .map((bail) => {
        const loyerActuel = bail.loyerHC ? parseFloat(bail.loyerHC) : 0;
        const loyerTheo = bail.loyerTheorique ? parseFloat(bail.loyerTheorique) : loyerActuel;
        const ecart = loyerTheo - loyerActuel;
        const ecartPct = loyerActuel > 0 ? ((ecart / loyerActuel) * 100) : 0;

        return {
          id: bail.id,
          bailleur: bail.bailleurId ? bailleurMap[bail.bailleurId] || "—" : "—",
          adresse: bail.adresseBien || "—",
          indice: bail.indiceReference || "—",
          trimestre: bail.trimestreRef || "—",
          valeurBase: bail.valeurIndiceBase ? parseFloat(bail.valeurIndiceBase) : 0,
          loyerActuel,
          loyerTheorique: loyerTheo,
          ecart,
          ecartPct,
          type: bail.typeBail || "—",
        };
      });
  }, [baux, bailleurMap]);

  const totalEcart = loyerData.reduce((s, l) => s + l.ecart, 0);
  const totalActuel = loyerData.reduce((s, l) => s + l.loyerActuel, 0);
  const totalTheorique = loyerData.reduce((s, l) => s + l.loyerTheorique, 0);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Loyers actuels (mois)" value={totalActuel} formatFn={(n) => formatCurrency(n)} icon={Receipt} variant="primary" gradient delay={0} />
          <KpiCard label="Loyers theoriques (mois)" value={totalTheorique} formatFn={(n) => formatCurrency(n)} icon={TrendingUp} variant="success" gradient delay={1} />
          <KpiCard label="Ecart total (mois)" value={totalEcart} formatFn={(n) => formatCurrency(n)} icon={totalEcart >= 0 ? TrendingUp : TrendingDown} variant={totalEcart >= 0 ? "success" : "danger"} gradient delay={2} />
        </div>

        <Section title="Detail par bail" delay={1}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-left font-semibold">Adresse</th>
                  <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer actuel</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer theorique</th>
                  <th className="px-4 py-3 text-right font-semibold">Ecart</th>
                  <th className="px-4 py-3 text-right font-semibold">Ecart %</th>
                </tr>
              </thead>
              <tbody>
                {loyerData.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{l.bailleur}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{l.adresse}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{l.indice}</Badge></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(l.loyerActuel)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(l.loyerTheorique)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${l.ecart > 0 ? "text-green-600" : l.ecart < 0 ? "text-red-600" : ""}`}>
                      {formatCurrency(l.ecart)}
                    </td>
                    <td className={`px-4 py-3 text-right ${l.ecartPct > 0 ? "text-green-600" : l.ecartPct < 0 ? "text-red-600" : ""}`}>
                      {l.ecartPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Tab 2: Revisions triennales ═══════════ */
function RevisionsTriennalesTab() {
  const { data: baux = [] } = useQuery<BailGL[]>({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });
  const { data: bailleurs = [] } = useQuery<Bailleur[]>({
    queryKey: ["/api/gl/bailleurs"],
    queryFn: () => apiRequest("/api/gl/bailleurs"),
  });

  const bailleurMap = Object.fromEntries(bailleurs.map((b) => [b.id, b.nom]));
  const now = new Date();

  // Baux commerciaux avec revision triennale
  interface RevisionRow {
    id: string; bailleur: string; adresse: string; type: string; dateDebut: string;
    dateRevision: string; joursRestants: number; urgent: boolean; passe: boolean;
    loyerActuel: number; indice: string;
  }

  const revisionData: RevisionRow[] = useMemo(() => {
    return baux
      .filter((b) => b.typeBail === "commercial" || b.typeBail === "professionnel")
      .map((bail): RevisionRow | null => {
        const debut = bail.dateDebut ? new Date(bail.dateDebut) : null;
        if (!debut) return null;

        const anneesDepuis = Math.floor((now.getTime() - debut.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        const prochaineRevisionAnnees = Math.ceil((anneesDepuis + 1) / 3) * 3;
        const dateRevision = new Date(debut);
        dateRevision.setFullYear(debut.getFullYear() + prochaineRevisionAnnees);

        const joursRestants = Math.ceil((dateRevision.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const urgent = joursRestants <= 180;
        const passe = joursRestants < 0;

        return {
          id: bail.id,
          bailleur: bail.bailleurId ? bailleurMap[bail.bailleurId] || "—" : "—",
          adresse: bail.adresseBien || "—",
          type: bail.typeBail || "—",
          dateDebut: bail.dateDebut || "—",
          dateRevision: dateRevision.toISOString().split("T")[0],
          joursRestants,
          urgent,
          passe,
          loyerActuel: bail.loyerHC ? parseFloat(bail.loyerHC) : 0,
          indice: bail.indiceReference || "ILC",
        };
      })
      .filter((r): r is RevisionRow => r !== null)
      .sort((a, b) => a.joursRestants - b.joursRestants);
  }, [baux, bailleurMap]);

  const urgentes = revisionData.filter((r) => r.urgent && !r.passe).length;
  const passees = revisionData.filter((r) => r.passe).length;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Baux concernes" value={revisionData.length} icon={CalendarDays} variant="primary" gradient delay={0} />
          <KpiCard label="Revisions < 6 mois" value={urgentes} icon={AlertTriangle} variant="warning" gradient delay={1} />
          <KpiCard label="Revisions en retard" value={passees} icon={AlertTriangle} variant="danger" gradient delay={2} />
        </div>

        <Section title="Echeancier des revisions" delay={1}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-left font-semibold">Adresse</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer HC</th>
                  <th className="px-4 py-3 text-left font-semibold">Prochaine revision</th>
                  <th className="px-4 py-3 text-left font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {revisionData.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.bailleur}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate">{r.adresse}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{r.type}</Badge></td>
                    <td className="px-4 py-3"><Badge variant="primary">{r.indice}</Badge></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.loyerActuel)}</td>
                    <td className="px-4 py-3">{r.dateRevision}</td>
                    <td className="px-4 py-3">
                      {r.passe ? (
                        <Badge variant="danger">En retard</Badge>
                      ) : r.urgent ? (
                        <Badge variant="warning">{r.joursRestants}j restants</Badge>
                      ) : (
                        <Badge variant="success">{r.joursRestants}j restants</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {revisionData.length === 0 && (
            <GlassCard>
              <p className="py-8 text-center text-muted-foreground">Aucun bail commercial ou professionnel avec revision triennale</p>
            </GlassCard>
          )}
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Tab 3: Charges & TF appelees ═══════════ */
function ChargesTFTab() {
  const { data: baux = [] } = useQuery<BailGL[]>({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });
  const { data: bailleurs = [] } = useQuery<Bailleur[]>({
    queryKey: ["/api/gl/bailleurs"],
    queryFn: () => apiRequest("/api/gl/bailleurs"),
  });

  const bailleurMap = Object.fromEntries(bailleurs.map((b) => [b.id, b.nom]));

  const chargesData = useMemo(() => {
    return baux
      .filter((b) => b.statut === "actif" || !b.statut)
      .map((bail) => {
        const charges = bail.chargesLocatives ? parseFloat(bail.chargesLocatives) : 0;
        const provision = bail.provisionCharges ? parseFloat(bail.provisionCharges) : 0;
        const regularisation = bail.regularisationCharges ? parseFloat(bail.regularisationCharges) : 0;
        const taxeFonciere = bail.taxeFonciere ? parseFloat(bail.taxeFonciere) : 0;
        const chargesBail = bail.charges ? parseFloat(bail.charges) : 0;

        return {
          id: bail.id,
          bailleur: bail.bailleurId ? bailleurMap[bail.bailleurId] || "—" : "—",
          adresse: bail.adresseBien || "—",
          chargesReelles: charges,
          provision,
          regularisation,
          taxeFonciere,
          chargesBailMens: chargesBail,
          chargesBailAn: chargesBail * 12,
          ecartCharges: provision * 12 - charges,
        };
      });
  }, [baux, bailleurMap]);

  const totalTF = chargesData.reduce((s, c) => s + c.taxeFonciere, 0);
  const totalChargesReelles = chargesData.reduce((s, c) => s + c.chargesReelles, 0);
  const totalProvision = chargesData.reduce((s, c) => s + c.provision * 12, 0);
  const totalRegularisation = chargesData.reduce((s, c) => s + c.regularisation, 0);

  const chartData = chargesData
    .filter((c) => c.chargesReelles > 0 || c.taxeFonciere > 0)
    .map((c) => ({
      name: c.adresse.length > 25 ? c.adresse.slice(0, 22) + "..." : c.adresse,
      Charges: Math.round(c.chargesReelles),
      Provisions: Math.round(c.provision * 12),
      "Taxe fonciere": Math.round(c.taxeFonciere),
    }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Charges reelles/an" value={totalChargesReelles} formatFn={(n) => formatCurrency(n)} icon={Receipt} variant="primary" gradient delay={0} />
          <KpiCard label="Provisions/an" value={totalProvision} formatFn={(n) => formatCurrency(n)} icon={TrendingUp} variant="success" gradient delay={1} />
          <KpiCard label="Taxe fonciere total" value={totalTF} formatFn={(n) => formatCurrency(n)} icon={Scale} variant="warning" gradient delay={2} />
          <KpiCard label="Regularisations" value={totalRegularisation} formatFn={(n) => formatCurrency(n)} icon={totalRegularisation >= 0 ? CheckCircle : AlertTriangle} variant={totalRegularisation >= 0 ? "success" : "danger"} gradient delay={3} />
        </div>

        {chartData.length > 0 && (
          <Section title="Charges et taxes par bail" delay={1}>
            <GlassCard>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="Charges" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Provisions" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Taxe fonciere" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>
        )}

        <Section title="Detail par bail" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-left font-semibold">Adresse</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges reelles</th>
                  <th className="px-4 py-3 text-right font-semibold">Provisions/an</th>
                  <th className="px-4 py-3 text-right font-semibold">Ecart</th>
                  <th className="px-4 py-3 text-right font-semibold">Taxe fonciere</th>
                  <th className="px-4 py-3 text-right font-semibold">Regularisation</th>
                </tr>
              </thead>
              <tbody>
                {chargesData.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{c.bailleur}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate">{c.adresse}</td>
                    <td className="px-4 py-3 text-right">{c.chargesReelles > 0 ? formatCurrency(c.chargesReelles) : "—"}</td>
                    <td className="px-4 py-3 text-right">{c.provision > 0 ? formatCurrency(c.provision * 12) : "—"}</td>
                    <td className={`px-4 py-3 text-right font-medium ${c.ecartCharges > 0 ? "text-green-600" : c.ecartCharges < 0 ? "text-red-600" : ""}`}>
                      {c.chargesReelles > 0 || c.provision > 0 ? formatCurrency(c.ecartCharges) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{c.taxeFonciere > 0 ? formatCurrency(c.taxeFonciere) : "—"}</td>
                    <td className={`px-4 py-3 text-right ${c.regularisation > 0 ? "text-green-600" : c.regularisation < 0 ? "text-red-600" : ""}`}>
                      {c.regularisation !== 0 ? formatCurrency(c.regularisation) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Tab 4: Synthese ═══════════ */
function SyntheseTab() {
  const { data: baux = [] } = useQuery<BailGL[]>({
    queryKey: ["/api/gl/baux"],
    queryFn: () => apiRequest("/api/gl/baux"),
  });
  const { data: bailleurs = [] } = useQuery<Bailleur[]>({
    queryKey: ["/api/gl/bailleurs"],
    queryFn: () => apiRequest("/api/gl/bailleurs"),
  });
  const { data: paiements = [] } = useQuery<Paiement[]>({
    queryKey: ["/api/gl/paiements"],
    queryFn: () => apiRequest("/api/gl/paiements"),
  });

  const bailleurMap = Object.fromEntries(bailleurs.map((b) => [b.id, b.nom]));
  const activeBaux = baux.filter((b) => b.statut === "actif" || !b.statut);

  // KPIs
  const totalLoyerMensuel = activeBaux.reduce((s, b) => s + (b.loyerHC ? parseFloat(b.loyerHC) : 0), 0);
  const totalChargesMens = activeBaux.reduce((s, b) => s + (b.charges ? parseFloat(b.charges) : 0), 0);
  const totalLoyerCC = totalLoyerMensuel + totalChargesMens;
  const totalTF = activeBaux.reduce((s, b) => s + (b.taxeFonciere ? parseFloat(b.taxeFonciere) : 0), 0);

  // Paiements des 12 derniers mois
  const now = new Date();
  const total12m = useMemo(() => {
    const debut = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    return paiements
      .filter((p) => new Date(p.date) >= debut)
      .reduce((s, p) => s + (p.montant ? parseFloat(p.montant) : 0), 0);
  }, [paiements]);

  const loyerTheo12m = totalLoyerCC * 12;
  const tauxEncaissement = loyerTheo12m > 0 ? (total12m / loyerTheo12m * 100) : 0;

  // Synthese par bailleur
  const synthBailleur = useMemo(() => {
    const map: Record<string, { bailleur: string; nbBaux: number; loyerMens: number; charges: number; tf: number }> = {};
    activeBaux.forEach((b) => {
      const bid = b.bailleurId || "none";
      if (!map[bid]) map[bid] = { bailleur: b.bailleurId ? bailleurMap[b.bailleurId] || "—" : "Sans bailleur", nbBaux: 0, loyerMens: 0, charges: 0, tf: 0 };
      map[bid].nbBaux++;
      map[bid].loyerMens += b.loyerHC ? parseFloat(b.loyerHC) : 0;
      map[bid].charges += b.charges ? parseFloat(b.charges) : 0;
      map[bid].tf += b.taxeFonciere ? parseFloat(b.taxeFonciere) : 0;
    });
    return Object.values(map).sort((a, b) => b.loyerMens - a.loyerMens);
  }, [activeBaux, bailleurMap]);

  // Alertes
  const alertes = useMemo(() => {
    const list: Array<{ type: "warning" | "danger" | "info"; message: string }> = [];

    // Baux expirant dans 6 mois
    activeBaux.forEach((b) => {
      if (b.dateFin) {
        const fin = new Date(b.dateFin);
        const jours = Math.ceil((fin.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (jours < 0) {
          list.push({ type: "danger", message: `Bail expire : ${b.adresseBien || "—"} (expire le ${b.dateFin})` });
        } else if (jours <= 180) {
          list.push({ type: "warning", message: `Bail expire dans ${jours}j : ${b.adresseBien || "—"}` });
        }
      }
    });

    if (tauxEncaissement < 95 && loyerTheo12m > 0) {
      list.push({ type: "warning", message: `Taux d'encaissement a ${tauxEncaissement.toFixed(1)}% (< 95%)` });
    }

    return list;
  }, [activeBaux, tauxEncaissement]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Loyer mensuel HC" value={totalLoyerMensuel} formatFn={(n) => formatCurrency(n)} icon={Receipt} variant="primary" gradient delay={0} />
          <KpiCard label="Loyer CC mensuel" value={totalLoyerCC} formatFn={(n) => formatCurrency(n)} icon={TrendingUp} variant="success" gradient delay={1} />
          <KpiCard label="Taxe fonciere total" value={totalTF} formatFn={(n) => formatCurrency(n)} icon={Scale} variant="warning" gradient delay={2} />
          <KpiCard label="Taux encaissement 12m" value={tauxEncaissement} formatFn={(n) => `${n.toFixed(1)}%`} icon={tauxEncaissement >= 95 ? CheckCircle : AlertTriangle} variant={tauxEncaissement >= 95 ? "success" : "warning"} gradient delay={3} />
        </div>

        {/* Alertes */}
        {alertes.length > 0 && (
          <Section title="Alertes" delay={1}>
            <div className="space-y-2">
              {alertes.map((a, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    a.type === "danger" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300" :
                    a.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300" :
                    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{a.message}</span>
                </motion.div>
              ))}
            </div>
          </Section>
        )}

        {/* Synthese par bailleur */}
        <Section title="Synthese par bailleur" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-right font-semibold">Baux</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer HC/mois</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges/mois</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer CC/mois</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer CC/an</th>
                  <th className="px-4 py-3 text-right font-semibold">TF/an</th>
                </tr>
              </thead>
              <tbody>
                {synthBailleur.map((s, i) => (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{s.bailleur}</td>
                    <td className="px-4 py-3 text-right">{s.nbBaux}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.loyerMens)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.charges)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.loyerMens + s.charges)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency((s.loyerMens + s.charges) * 12)}</td>
                    <td className="px-4 py-3 text-right">{s.tf > 0 ? formatCurrency(s.tf) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{activeBaux.length}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalLoyerMensuel)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalChargesMens)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalLoyerCC)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalLoyerCC * 12)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalTF)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Page principale ═══════════ */
export default function ControleBailleurPage() {
  const [activeTab, setActiveTab] = useState("loyers-indexes");

  return (
    <div className="space-y-6">
      <PageHeader title="Controle bailleur" description="Suivi des loyers indexes, revisions, charges et synthese globale" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="loyers-indexes">Loyers indexes</TabsTrigger>
          <TabsTrigger value="revisions">Revisions triennales</TabsTrigger>
          <TabsTrigger value="charges-tf">Charges & TF</TabsTrigger>
          <TabsTrigger value="synthese">Synthese</TabsTrigger>
        </TabsList>
        <TabsContent value="loyers-indexes">
          <LoyersIndexesTab />
        </TabsContent>
        <TabsContent value="revisions">
          <RevisionsTriennalesTab />
        </TabsContent>
        <TabsContent value="charges-tf">
          <ChargesTFTab />
        </TabsContent>
        <TabsContent value="synthese">
          <SyntheseTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
