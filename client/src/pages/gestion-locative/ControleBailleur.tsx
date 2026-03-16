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
  nom?: string;
  bailleurId?: string;
  locataireId?: string;
  adresse?: string;
  ville?: string;
  typeBail?: string;
  dateDebut?: string;
  dateFin?: string;
  loyerBaseHT?: string;
  loyerHTActu?: string;
  charges?: string;
  indiceReference?: string;
  trimestreRef?: string;
  valeurIndiceBase?: string;
  taxeFonciere?: string;
  surface?: string;
  capacite?: number;
  statut?: string;
  archived?: boolean;
}

interface Bailleur { id: string; nom: string; }
interface Locataire { id: string; nom: string; }
interface Paiement { id: string; bailId: string; date: string; montant: string; type?: string; }
interface Indexation { id: string; bailId: string; dateApplication?: string; indiceBase?: string; indiceNouveau?: string; ancienLoyer?: string; nouveauLoyer?: string; }

/* ═══════════ Tab 1: Loyers indexés ═══════════ */
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

  const loyerData = useMemo(() => {
    return baux
      .filter((b) => !b.archived && (b.statut === "actif" || !b.statut))
      .map((bail) => {
        const loyerBase = bail.loyerBaseHT ? parseFloat(bail.loyerBaseHT) : 0;
        const loyerActuel = bail.loyerHTActu ? parseFloat(bail.loyerHTActu) : loyerBase;
        const ecart = loyerActuel - loyerBase;
        const ecartPct = loyerBase > 0 ? ((ecart / loyerBase) * 100) : 0;

        return {
          id: bail.id,
          nom: bail.nom || "—",
          bailleur: bail.bailleurId ? bailleurMap[bail.bailleurId] || "—" : "—",
          adresse: bail.adresse || bail.ville || "—",
          indice: bail.indiceReference || "—",
          trimestre: bail.trimestreRef || "—",
          valeurBase: bail.valeurIndiceBase ? parseFloat(bail.valeurIndiceBase) : 0,
          loyerBase,
          loyerActuel,
          ecart,
          ecartPct,
          type: bail.typeBail || "—",
        };
      });
  }, [baux, bailleurMap]);

  const totalBase = loyerData.reduce((s, l) => s + l.loyerBase, 0);
  const totalActuel = loyerData.reduce((s, l) => s + l.loyerActuel, 0);
  const totalEcart = totalActuel - totalBase;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Loyers de base HT" value={totalBase} formatFn={formatCurrency} icon={Receipt} variant="primary" gradient delay={0} />
          <KpiCard label="Loyers actuels (indexés)" value={totalActuel} formatFn={formatCurrency} icon={TrendingUp} variant="success" gradient delay={1} />
          <KpiCard label="Écart indexation" value={totalEcart} formatFn={formatCurrency} icon={totalEcart >= 0 ? TrendingUp : TrendingDown} variant={totalEcart >= 0 ? "success" : "danger"} gradient delay={2} />
        </div>

        <Section title="Détail par bail" delay={1}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Site</th>
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer de base</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer actuel</th>
                  <th className="px-4 py-3 text-right font-semibold">Écart</th>
                  <th className="px-4 py-3 text-right font-semibold">Écart %</th>
                </tr>
              </thead>
              <tbody>
                {loyerData.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{l.nom}</td>
                    <td className="px-4 py-3">{l.bailleur}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{l.indice}</Badge></td>
                    <td className="px-4 py-3 text-right">{formatCurrency(l.loyerBase)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(l.loyerActuel)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${l.ecart > 0 ? "text-green-600" : l.ecart < 0 ? "text-red-600" : ""}`}>
                      {l.ecart !== 0 ? formatCurrency(l.ecart) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right ${l.ecartPct > 0 ? "text-green-600" : l.ecartPct < 0 ? "text-red-600" : ""}`}>
                      {l.ecartPct !== 0 ? `${l.ecartPct.toFixed(1)}%` : "—"}
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

/* ═══════════ Tab 2: Révisions triennales ═══════════ */
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

  interface RevisionRow {
    id: string; nom: string; bailleur: string; adresse: string; type: string; dateDebut: string;
    dateRevision: string; joursRestants: number; urgent: boolean; passe: boolean;
    loyerActuel: number; indice: string;
  }

  const revisionData: RevisionRow[] = useMemo(() => {
    return baux
      .filter((b) => !b.archived && (b.typeBail === "commercial" || b.typeBail === "professionnel"))
      .map((bail): RevisionRow | null => {
        const debut = bail.dateDebut ? new Date(bail.dateDebut) : null;
        if (!debut || isNaN(debut.getTime())) return null;

        const anneesDepuis = Math.floor((now.getTime() - debut.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        const nextReviewNumber = Math.max(1, Math.ceil(anneesDepuis / 3));
        const nextReviewYears = nextReviewNumber * 3;
        const dateRevision = new Date(debut);
        dateRevision.setFullYear(debut.getFullYear() + nextReviewYears);

        // If this revision is passed, skip to the next one
        if (dateRevision <= now) {
          dateRevision.setFullYear(dateRevision.getFullYear() + 3);
        }

        const joursRestants = Math.ceil((dateRevision.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const urgent = joursRestants <= 180 && joursRestants >= 0;
        const passe = joursRestants < 0;

        const loyerBase = bail.loyerBaseHT ? parseFloat(bail.loyerBaseHT) : 0;
        const loyerActuel = bail.loyerHTActu ? parseFloat(bail.loyerHTActu) : loyerBase;

        return {
          id: bail.id,
          nom: bail.nom || "—",
          bailleur: bail.bailleurId ? bailleurMap[bail.bailleurId] || "—" : "—",
          adresse: bail.adresse || bail.ville || "—",
          type: bail.typeBail || "—",
          dateDebut: bail.dateDebut ? new Date(bail.dateDebut).toLocaleDateString("fr-FR") : "—",
          dateRevision: dateRevision.toISOString().split("T")[0],
          joursRestants,
          urgent,
          passe,
          loyerActuel,
          indice: bail.indiceReference || "ILC",
        };
      })
      .filter((r): r is RevisionRow => r !== null)
      .sort((a, b) => a.joursRestants - b.joursRestants);
  }, [baux, bailleurMap]);

  const urgentes = revisionData.filter((r) => r.urgent).length;
  const passees = revisionData.filter((r) => r.passe).length;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Baux concernés" value={revisionData.length} icon={CalendarDays} variant="primary" gradient delay={0} />
          <KpiCard label="Révisions < 6 mois" value={urgentes} icon={AlertTriangle} variant="warning" gradient delay={1} />
          <KpiCard label="Révisions en retard" value={passees} icon={AlertTriangle} variant="danger" gradient delay={2} />
        </div>

        <Section title="Échéancier des révisions" delay={1}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Site</th>
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Indice</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer HT</th>
                  <th className="px-4 py-3 text-left font-semibold">Prochaine révision</th>
                  <th className="px-4 py-3 text-left font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {revisionData.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{r.nom}</td>
                    <td className="px-4 py-3">{r.bailleur}</td>
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
              <p className="py-8 text-center text-muted-foreground">Aucun bail commercial ou professionnel avec révision triennale</p>
            </GlassCard>
          )}
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Tab 3: Charges & TF appelées ═══════════ */
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
      .filter((b) => !b.archived && (b.statut === "actif" || !b.statut))
      .map((bail) => {
        const chargesMens = bail.charges ? parseFloat(bail.charges) : 0;
        const taxeFonciere = bail.taxeFonciere ? parseFloat(bail.taxeFonciere) : 0;
        const loyerBase = bail.loyerBaseHT ? parseFloat(bail.loyerBaseHT) : 0;
        const loyerActuel = bail.loyerHTActu ? parseFloat(bail.loyerHTActu) : loyerBase;

        return {
          id: bail.id,
          nom: bail.nom || "—",
          bailleur: bail.bailleurId ? bailleurMap[bail.bailleurId] || "—" : "—",
          adresse: bail.adresse || bail.ville || "—",
          chargesMens,
          chargesAn: chargesMens * 12,
          taxeFonciere,
          loyerActuel,
          coutTotal: loyerActuel + chargesMens * 12 + taxeFonciere,
        };
      });
  }, [baux, bailleurMap]);

  const totalChargesAn = chargesData.reduce((s, c) => s + c.chargesAn, 0);
  const totalTF = chargesData.reduce((s, c) => s + c.taxeFonciere, 0);
  const totalCoutLocatif = chargesData.reduce((s, c) => s + c.coutTotal, 0);

  const chartData = chargesData
    .filter((c) => c.chargesAn > 0 || c.taxeFonciere > 0)
    .map((c) => ({
      name: c.nom.length > 25 ? c.nom.slice(0, 22) + "..." : c.nom,
      "Charges/an": Math.round(c.chargesAn),
      "Taxe foncière": Math.round(c.taxeFonciere),
    }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Charges annuelles" value={totalChargesAn} formatFn={formatCurrency} icon={Receipt} variant="primary" gradient delay={0} />
          <KpiCard label="Taxe foncière totale" value={totalTF} formatFn={formatCurrency} icon={Scale} variant="warning" gradient delay={1} />
          <KpiCard label="Coût locatif total" value={totalCoutLocatif} formatFn={formatCurrency} icon={TrendingUp} variant="success" gradient delay={2} />
        </div>

        {chartData.length > 0 && (
          <Section title="Charges et taxes par site" delay={1}>
            <GlassCard>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="Charges/an" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Taxe foncière" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>
        )}

        <Section title="Détail par site" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Site</th>
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer HT</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges/mois</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges/an</th>
                  <th className="px-4 py-3 text-right font-semibold">Taxe foncière</th>
                  <th className="px-4 py-3 text-right font-semibold">Coût total</th>
                </tr>
              </thead>
              <tbody>
                {chargesData.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{c.nom}</td>
                    <td className="px-4 py-3">{c.bailleur}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(c.loyerActuel)}</td>
                    <td className="px-4 py-3 text-right">{c.chargesMens > 0 ? formatCurrency(c.chargesMens) : "—"}</td>
                    <td className="px-4 py-3 text-right">{c.chargesAn > 0 ? formatCurrency(c.chargesAn) : "—"}</td>
                    <td className="px-4 py-3 text-right">{c.taxeFonciere > 0 ? formatCurrency(c.taxeFonciere) : "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.coutTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(chargesData.reduce((s, c) => s + c.loyerActuel, 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalChargesAn / 12)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalChargesAn)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalTF)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalCoutLocatif)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════ Tab 4: Synthèse ═══════════ */
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
  const activeBaux = baux.filter((b) => !b.archived && (b.statut === "actif" || !b.statut));

  // KPIs — loyerBaseHT est annuel
  const totalLoyerAnnuel = activeBaux.reduce((s, b) => {
    const base = b.loyerBaseHT ? parseFloat(b.loyerBaseHT) : 0;
    return s + (b.loyerHTActu ? parseFloat(b.loyerHTActu) : base);
  }, 0);
  const totalChargesMens = activeBaux.reduce((s, b) => s + (b.charges ? parseFloat(b.charges) : 0), 0);
  const totalLoyerCC = totalLoyerAnnuel + totalChargesMens * 12;
  const totalTF = activeBaux.reduce((s, b) => s + (b.taxeFonciere ? parseFloat(b.taxeFonciere) : 0), 0);

  // Paiements des 12 derniers mois (loyer type only)
  const now = new Date();
  const total12m = useMemo(() => {
    const debut = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    return paiements
      .filter((p) => {
        const d = new Date(p.date);
        return !isNaN(d.getTime()) && d >= debut;
      })
      .filter((p) => !p.type || p.type.toLowerCase() === "loyer")
      .reduce((s, p) => s + (p.montant ? parseFloat(p.montant) : 0), 0);
  }, [paiements]);

  const tauxEncaissement = totalLoyerCC > 0 ? Math.min(total12m / totalLoyerCC * 100, 100) : 0;

  // Synthèse par bailleur
  const synthBailleur = useMemo(() => {
    const map: Record<string, { bailleur: string; nbBaux: number; loyerAn: number; charges: number; tf: number }> = {};
    activeBaux.forEach((b) => {
      const bid = b.bailleurId || "none";
      if (!map[bid]) map[bid] = { bailleur: b.bailleurId ? bailleurMap[b.bailleurId] || "—" : "Sans bailleur", nbBaux: 0, loyerAn: 0, charges: 0, tf: 0 };
      map[bid].nbBaux++;
      const base = b.loyerBaseHT ? parseFloat(b.loyerBaseHT) : 0;
      map[bid].loyerAn += b.loyerHTActu ? parseFloat(b.loyerHTActu) : base;
      map[bid].charges += b.charges ? parseFloat(b.charges) : 0;
      map[bid].tf += b.taxeFonciere ? parseFloat(b.taxeFonciere) : 0;
    });
    return Object.values(map).sort((a, b) => b.loyerAn - a.loyerAn);
  }, [activeBaux, bailleurMap]);

  // Alertes
  const alertes = useMemo(() => {
    const list: Array<{ type: "warning" | "danger" | "info"; message: string }> = [];

    activeBaux.forEach((b) => {
      if (b.dateFin) {
        const fin = new Date(b.dateFin);
        if (isNaN(fin.getTime())) return;
        const jours = Math.ceil((fin.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (jours < 0) {
          list.push({ type: "danger", message: `Bail expiré : ${b.nom || b.adresse || "—"} (${new Date(b.dateFin).toLocaleDateString("fr-FR")})` });
        } else if (jours <= 180) {
          list.push({ type: "warning", message: `Bail expire dans ${jours}j : ${b.nom || b.adresse || "—"}` });
        }
      }
    });

    if (tauxEncaissement < 95 && totalLoyerCC > 0) {
      list.push({ type: "warning", message: `Taux d'encaissement à ${tauxEncaissement.toFixed(1)}% (< 95%)` });
    }

    return list;
  }, [activeBaux, tauxEncaissement]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Loyer HT annuel" value={totalLoyerAnnuel} formatFn={formatCurrency} icon={Receipt} variant="primary" gradient delay={0} />
          <KpiCard label="Loyer CC annuel" value={totalLoyerCC} formatFn={formatCurrency} icon={TrendingUp} variant="success" gradient delay={1} />
          <KpiCard label="Taxe foncière totale" value={totalTF} formatFn={formatCurrency} icon={Scale} variant="warning" gradient delay={2} />
          <KpiCard label="Taux encaissement 12m" value={tauxEncaissement} formatFn={(n) => `${n.toFixed(1)}%`} icon={tauxEncaissement >= 95 ? CheckCircle : AlertTriangle} variant={tauxEncaissement >= 95 ? "success" : "warning"} gradient delay={3} />
        </div>

        {/* Alertes */}
        {alertes.length > 0 && (
          <Section title="Alertes" delay={1}>
            <div className="space-y-2">
              {alertes.map((a, i) => (
                <motion.div
                  key={`${a.type}-${a.message}`}
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

        {/* Synthèse par bailleur */}
        <Section title="Synthèse par bailleur" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Bailleur</th>
                  <th className="px-4 py-3 text-right font-semibold">Baux</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer HT/an</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges/mois</th>
                  <th className="px-4 py-3 text-right font-semibold">Loyer CC/an</th>
                  <th className="px-4 py-3 text-right font-semibold">TF/an</th>
                </tr>
              </thead>
              <tbody>
                {synthBailleur.map((s, i) => (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{s.bailleur}</td>
                    <td className="px-4 py-3 text-right">{s.nbBaux}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.loyerAn)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(s.charges)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.loyerAn + s.charges * 12)}</td>
                    <td className="px-4 py-3 text-right">{s.tf > 0 ? formatCurrency(s.tf) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{activeBaux.length}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalLoyerAnnuel)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalChargesMens)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalLoyerCC)}</td>
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
      <PageHeader title="Contrôle bailleur" description="Suivi des loyers indexés, révisions, charges et synthèse globale" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="loyers-indexes">Loyers indexés</TabsTrigger>
          <TabsTrigger value="revisions">Révisions triennales</TabsTrigger>
          <TabsTrigger value="charges-tf">Charges & TF</TabsTrigger>
          <TabsTrigger value="synthese">Synthèse</TabsTrigger>
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
