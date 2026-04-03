import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../../lib/queryClient";
import { KpiCard } from "../../../components/ui/kpi-card";
import { GlassCard } from "../../../components/ui/glass-card";
import { Section } from "../../../components/ui/section";
import { FormField } from "../../../components/ui/form-field";
import { formatCurrency } from "../../../lib/utils";
import { TrendingDown, RefreshCw, Calculator, Percent } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Emprunt, SCI, Actif } from "../../../types";

export function RachatCreditTab() {
  const { data: emprunts = [] } = useQuery<Emprunt[]>({
    queryKey: ["/api/am/emprunts"],
    queryFn: () => apiRequest("/api/am/emprunts"),
  });
  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });
  const { data: actifsList = [] } = useQuery<Actif[]>({
    queryKey: ["/api/am/actifs"],
    queryFn: () => apiRequest("/api/am/actifs"),
  });

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));
  const actifMap = Object.fromEntries(actifsList.map((a) => [a.id, a.nom]));
  const activeEmprunts = emprunts.filter((e) => !e.archived);

  // Simulateur
  const [selectedEmprunt, setSelectedEmprunt] = useState<string>("");
  const [nouveauTaux, setNouveauTaux] = useState<string>("3.0");
  const [nouvelleDuree, setNouvelleDuree] = useState<string>("20");
  const [fraisRachat, setFraisRachat] = useState<string>("3.0"); // % IRA
  const [fraisDossier, setFraisDossier] = useState<string>("1500");
  const [fraisGarantie, setFraisGarantie] = useState<string>("2500");

  const emp = activeEmprunts.find((e) => e.id === selectedEmprunt);

  const simulation = useMemo(() => {
    if (!emp) return null;

    const crd = emp.capitalRestantDu ? parseFloat(emp.capitalRestantDu) : (emp.montantEmprunte ? parseFloat(emp.montantEmprunte) : 0);
    const ancienneMens = emp.mensualite ? parseFloat(emp.mensualite) : 0;
    const ancienneAssurance = emp.assuranceMensuelle ? parseFloat(emp.assuranceMensuelle) : 0;
    const ancienneDureeRestante = emp.dureeMois || (emp.dureeAns ? emp.dureeAns * 12 : 240);

    // Calcul ancien cout restant
    const ancienCoutRestant = (ancienneMens + ancienneAssurance) * ancienneDureeRestante;

    // Nouveau prêt
    const nTaux = parseFloat(nouveauTaux) / 100;
    const nDuree = parseInt(nouvelleDuree) * 12;
    const ira = crd * (parseFloat(fraisRachat) / 100); // Indemnite de remboursement anticipe
    const dossier = parseFloat(fraisDossier) || 0;
    const garantie = parseFloat(fraisGarantie) || 0;
    const totalFrais = ira + dossier + garantie;

    // Mensualite nouveau pret (formule amortissement constant)
    const tauxMensuel = nTaux / 12;
    const nouvelleMensualite = tauxMensuel > 0
      ? crd * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -nDuree))
      : crd / nDuree;

    const nouveauCoutTotal = nouvelleMensualite * nDuree + totalFrais;
    const economie = ancienCoutRestant - nouveauCoutTotal;
    const pointMort = economie > 0 ? Math.ceil(totalFrais / (ancienneMens - nouvelleMensualite)) : 0;

    // Tableau amortissement simplifie (annuel)
    const amortissement: Array<{ annee: number; crdDebut: number; interets: number; capital: number; crdFin: number }> = [];
    let crdCourant = crd;
    const nbAnnees = Math.ceil(nDuree / 12);
    for (let a = 1; a <= Math.min(nbAnnees, 30); a++) {
      const moisDansAnnee = a === nbAnnees ? nDuree - (nbAnnees - 1) * 12 : 12;
      let interetsAnnee = 0;
      let capitalAnnee = 0;
      for (let m = 0; m < moisDansAnnee; m++) {
        const interet = crdCourant * tauxMensuel;
        const cap = nouvelleMensualite - interet;
        interetsAnnee += interet;
        capitalAnnee += cap;
        crdCourant = Math.max(0, crdCourant - cap);
      }
      amortissement.push({
        annee: a,
        crdDebut: crdCourant + capitalAnnee,
        interets: interetsAnnee,
        capital: capitalAnnee,
        crdFin: crdCourant,
      });
    }

    return {
      crd, ancienneMens, ancienneAssurance, ancienneDureeRestante,
      ancienCoutRestant, nouvelleMensualite, nDuree, totalFrais,
      ira, dossier, garantie, nouveauCoutTotal, economie, pointMort,
      amortissement,
    };
  }, [emp, nouveauTaux, nouvelleDuree, fraisRachat, fraisDossier, fraisGarantie]);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <Section title="Simulateur de rachat de credit" delay={0}>
          <GlassCard>
            <div className="space-y-6">
              {/* Selection de l'emprunt */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Emprunt a racheter</label>
                  <select
                    value={selectedEmprunt}
                    onChange={(e) => setSelectedEmprunt(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selectionnez un emprunt</option>
                    {(() => {
                      const groups: { sciName: string; items: Emprunt[] }[] = [];
                      for (const emp of activeEmprunts) {
                        const sciName = emp.sciId ? (sciMap[emp.sciId] || "SCI inconnue") : "Sans SCI";
                        let group = groups.find((g) => g.sciName === sciName);
                        if (!group) { group = { sciName, items: [] }; groups.push(group); }
                        group.items.push(emp);
                      }
                      groups.sort((a, b) => a.sciName.localeCompare(b.sciName, "fr"));
                      return groups.map((g) => (
                        <optgroup key={g.sciName} label={g.sciName}>
                          {g.items.map((e) => (
                            <option key={e.id} value={e.id}>
                              {[e.actifId ? actifMap[e.actifId] : null, e.banque].filter(Boolean).join(" / ") || "Emprunt"} — {e.capitalRestantDu ? formatCurrency(e.capitalRestantDu) : e.montantEmprunte ? formatCurrency(e.montantEmprunte) : "N/A"}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                </div>
                <FormField label="Nouveau taux (%)" name="nouveauTaux" value={nouveauTaux} onChange={(_, v) => setNouveauTaux(v)} type="number" suffix="%" />
                <FormField label="Nouvelle durée (ans)" name="nouvelleDuree" value={nouvelleDuree} onChange={(_, v) => setNouvelleDuree(v)} type="number" suffix="ans" />
              </div>

              {/* Frais */}
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="IRA (%)" name="fraisRachat" value={fraisRachat} onChange={(_, v) => setFraisRachat(v)} type="number" suffix="%" />
                <FormField label="Frais de dossier" name="fraisDossier" value={fraisDossier} onChange={(_, v) => setFraisDossier(v)} type="number" suffix="EUR" />
                <FormField label="Frais de garantie" name="fraisGarantie" value={fraisGarantie} onChange={(_, v) => setFraisGarantie(v)} type="number" suffix="EUR" />
              </div>
            </div>
          </GlassCard>
        </Section>

        {simulation && (
          <>
            {/* Résultat KPIs */}
            <div className="grid gap-4 sm:grid-cols-4">
              <KpiCard label="Ancienne mensualité" value={simulation.ancienneMens + simulation.ancienneAssurance} formatFn={(n) => formatCurrency(n)} icon={TrendingDown} variant="warning" gradient delay={0} metricKey="mensualite" />
              <KpiCard label="Nouvelle mensualité" value={simulation.nouvelleMensualite} formatFn={(n) => formatCurrency(n)} icon={RefreshCw} variant="primary" gradient delay={1} metricKey="mensualite" />
              <KpiCard label="Économie totale" value={simulation.economie} formatFn={(n) => formatCurrency(n)} icon={Calculator} variant={simulation.economie > 0 ? "success" : "danger"} gradient delay={2} />
              <KpiCard label="Point mort" value={simulation.pointMort} formatFn={(n) => n > 0 ? `${n} mois` : "N/A"} icon={Percent} variant="primary" gradient delay={3} />
            </div>

            {/* Comparaison */}
            <Section title="Comparaison ancien vs nouveau" delay={2}>
              <GlassCard>
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left font-semibold"></th>
                        <th className="px-4 py-3 text-right font-semibold">Prêt actuel</th>
                        <th className="px-4 py-3 text-right font-semibold">Nouveau prêt</th>
                        <th className="px-4 py-3 text-right font-semibold">Différence</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-4 py-3 font-medium">Capital restant dû</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.crd)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.crd)}</td>
                        <td className="px-4 py-3 text-right">—</td>
                      </tr>
                      <tr className="border-t">
                        <td className="px-4 py-3 font-medium">Mensualité</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.ancienneMens + simulation.ancienneAssurance)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.nouvelleMensualite)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${simulation.nouvelleMensualite < simulation.ancienneMens + simulation.ancienneAssurance ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(simulation.nouvelleMensualite - simulation.ancienneMens - simulation.ancienneAssurance)}
                        </td>
                      </tr>
                      <tr className="border-t">
                        <td className="px-4 py-3 font-medium">Coût total restant</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.ancienCoutRestant)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(simulation.nouveauCoutTotal)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${simulation.economie > 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(-simulation.economie)}
                        </td>
                      </tr>
                      <tr className="border-t bg-muted/10">
                        <td className="px-4 py-3 font-medium">Frais de rachat</td>
                        <td className="px-4 py-3 text-right">—</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(simulation.totalFrais)}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          IRA: {formatCurrency(simulation.ira)} | Dossier: {formatCurrency(simulation.dossier)} | Garantie: {formatCurrency(simulation.garantie)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-semibold">
                        <td className="px-4 py-3">Économie nette</td>
                        <td className="px-4 py-3" colSpan={2}></td>
                        <td className={`px-4 py-3 text-right text-lg ${simulation.economie > 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(simulation.economie)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </GlassCard>
            </Section>

            {/* Amortissement chart */}
            {simulation.amortissement.length > 0 && (
              <Section title="Amortissement du nouveau pret" delay={3}>
                <GlassCard>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={simulation.amortissement}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="annee" tick={{ fontSize: 12 }} label={{ value: "Année", position: "insideBottom", offset: -5 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                        <Area type="monotone" dataKey="crdFin" name="Capital restant" fill="#3b82f6" fillOpacity={0.3} stroke="#3b82f6" />
                        <Area type="monotone" dataKey="interets" name="Intérêts annuels" fill="#ef4444" fillOpacity={0.2} stroke="#ef4444" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </Section>
            )}
          </>
        )}

        {!simulation && (
          <GlassCard>
            <div className="py-12 text-center text-muted-foreground">
              <RefreshCw className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>Selectionnez un emprunt ci-dessus pour simuler un rachat de credit</p>
            </div>
          </GlassCard>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
