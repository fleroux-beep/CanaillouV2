import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../../lib/queryClient";
import { KpiCard } from "../../../components/ui/kpi-card";
import { GlassCard } from "../../../components/ui/glass-card";
import { Section } from "../../../components/ui/section";
import { Badge } from "../../../components/ui/badge";
import { formatCurrency, formatPercent } from "../../../lib/utils";
import { TrendingDown, Calculator, Landmark, Percent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Emprunt, SCI, Actif } from "../../../types";

export function CoutCreditTab() {
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

  // Calcul du coût total pour chaque emprunt.
  // Source de vérité : mensualité Excel (paiement réel).
  // Décomposition : assurance = mensualité_Excel - formule_actuarielle
  const coutData = useMemo(() => {
    return activeEmprunts.map((emp) => {
      const montant = emp.montantEmprunte ? parseFloat(emp.montantEmprunte) : 0;
      const duree = emp.dureeMois || (emp.dureeAns ? emp.dureeAns * 12 : 0);
      const tauxAnnuel = emp.tauxAnnuel ? parseFloat(emp.tauxAnnuel) / 100 : 0;
      const mensualiteExcel = emp.mensualite ? parseFloat(emp.mensualite) : 0;

      // Formule actuarielle pure (capital + intérêts)
      let mensuActuarielle = 0;
      if (montant > 0 && duree > 0) {
        if (tauxAnnuel > 0) {
          const rm = tauxAnnuel / 12;
          const factor = Math.pow(1 + rm, duree);
          mensuActuarielle = montant * (rm * factor) / (factor - 1);
        } else {
          mensuActuarielle = montant / duree;
        }
      }

      // Déduire l'assurance de l'écart Excel vs formule
      let mens: number;
      let assurance: number;
      if (mensualiteExcel > 0) {
        assurance = Math.max(0, mensualiteExcel - mensuActuarielle);
        mens = mensualiteExcel - assurance;
      } else {
        mens = mensuActuarielle;
        assurance = 0;
        const tauxAssurance = emp.tauxAssurance ? parseFloat(emp.tauxAssurance) / 100 : 0;
        if (montant > 0 && tauxAssurance > 0) {
          assurance = (montant * tauxAssurance) / 12;
        }
      }

      const totalRembourse = (mens + assurance) * duree;
      const coutAssurance = assurance * duree;
      const coutInterets = Math.max(0, (mens * duree) - montant);
      const coutTotal = coutInterets + coutAssurance;
      // TAEG approximation using annualized rate: (totalRembourse/montant)^(12/duree) - 1
      const taeg = montant > 0 && duree > 0
        ? (Math.pow(totalRembourse / montant, 12 / duree) - 1) * 100
        : 0;

      const label = emp.sciId && sciMap[emp.sciId]
        ? `${sciMap[emp.sciId]}${emp.actifId && actifMap[emp.actifId] ? " / " + actifMap[emp.actifId] : ""}`
        : emp.banque || "—";

      return {
        id: emp.id,
        banque: emp.banque || "—",
        label,
        sci: emp.sciId ? sciMap[emp.sciId] || "—" : "—",
        montant,
        taux: emp.tauxAnnuel ? parseFloat(emp.tauxAnnuel) : 0,
        duree,
        mensualite: mens,
        totalRembourse,
        coutInterets: Math.max(0, coutInterets),
        coutAssurance,
        coutTotal: Math.max(0, coutTotal),
        taeg: Math.max(0, taeg),
      };
    });
  }, [activeEmprunts, sciMap]);

  const totalInterets = coutData.reduce((s, c) => s + c.coutInterets, 0);
  const totalAssurance = coutData.reduce((s, c) => s + c.coutAssurance, 0);
  const totalCout = coutData.reduce((s, c) => s + c.coutTotal, 0);
  const totalMontant = coutData.reduce((s, c) => s + c.montant, 0);

  const chartData = coutData.map((c) => ({
    name: c.label,
    Intérêts: Math.round(c.coutInterets),
    Assurance: Math.round(c.coutAssurance),
    Capital: Math.round(c.montant),
  }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Capital emprunté" value={totalMontant} formatFn={(n) => formatCurrency(n)} icon={Landmark} variant="primary" gradient delay={0} />
          <KpiCard label="Coût des intérêts" value={totalInterets} formatFn={(n) => formatCurrency(n)} icon={TrendingDown} variant="danger" gradient delay={1} />
          <KpiCard label="Coût assurance" value={totalAssurance} formatFn={(n) => formatCurrency(n)} icon={Calculator} variant="warning" gradient delay={2} />
          <KpiCard label="Coût total du crédit" value={totalCout} formatFn={(n) => formatCurrency(n)} icon={Percent} variant="danger" gradient delay={3} metricKey="coutCredit" />
        </div>

        {chartData.length > 0 && (
          <Section title="Décomposition par emprunt" delay={1}>
            <GlassCard>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="Capital" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Intérêts" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Assurance" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </Section>
        )}

        <Section title="Détail par emprunt" delay={2}>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold">Banque</th>
                  <th className="px-4 py-3 text-left font-semibold">Actif</th>
                  <th className="px-4 py-3 text-right font-semibold">Montant</th>
                  <th className="px-4 py-3 text-right font-semibold">Taux</th>
                  <th className="px-4 py-3 text-right font-semibold">Durée</th>
                  <th className="px-4 py-3 text-right font-semibold">Intérêts</th>
                  <th className="px-4 py-3 text-right font-semibold">Assurance</th>
                  <th className="px-4 py-3 text-right font-semibold">Coût total</th>
                  <th className="px-4 py-3 text-right font-semibold">TAEG estim.</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group coutData by SCI
                  const sciGroups: { sciId: string; sciName: string; items: typeof coutData }[] = [];
                  const sorted = [...coutData].sort((a, b) => a.sci.localeCompare(b.sci, "fr"));
                  for (const c of sorted) {
                    const emp = activeEmprunts.find((e) => e.id === c.id);
                    const sciId = emp?.sciId || "__none__";
                    let group = sciGroups.find((g) => g.sciId === sciId);
                    if (!group) { group = { sciId, sciName: c.sci, items: [] }; sciGroups.push(group); }
                    group.items.push(c);
                  }
                  return sciGroups.map((group) => {
                    const groupMontant = group.items.reduce((s, c) => s + c.montant, 0);
                    const groupInterets = group.items.reduce((s, c) => s + c.coutInterets, 0);
                    const groupAssurance = group.items.reduce((s, c) => s + c.coutAssurance, 0);
                    const groupCout = group.items.reduce((s, c) => s + c.coutTotal, 0);
                    return (
                      <Fragment key={group.sciId}>
                        <tr className="bg-muted/50">
                          <td className="px-4 py-2" colSpan={2}>
                            <Badge variant="primary">{group.sciName}</Badge>
                            <span className="ml-2 text-xs text-muted-foreground">({group.items.length})</span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">{formatCurrency(groupMontant)}</td>
                          <td colSpan={2}></td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-red-500/70">{formatCurrency(groupInterets)}</td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-amber-500/70">{formatCurrency(groupAssurance)}</td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-red-500/70">{formatCurrency(groupCout)}</td>
                          <td></td>
                        </tr>
                        {group.items.map((c) => {
                          const emp = activeEmprunts.find((e) => e.id === c.id);
                          return (
                            <tr key={c.id} className="border-t hover:bg-muted/20">
                              <td className="px-4 py-3 pl-8 font-medium">{c.banque}</td>
                              <td className="px-4 py-3 text-muted-foreground">{emp?.actifId ? (actifMap[emp.actifId] || "—") : "—"}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(c.montant)}</td>
                              <td className="px-4 py-3 text-right">{formatPercent(c.taux, 2)}</td>
                              <td className="px-4 py-3 text-right">{c.duree > 0 ? `${Math.round(c.duree / 12)} ans` : "—"}</td>
                              <td className="px-4 py-3 text-right text-red-600">{formatCurrency(c.coutInterets)}</td>
                              <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(c.coutAssurance)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(c.coutTotal)}</td>
                              <td className="px-4 py-3 text-right">{formatPercent(c.taeg, 2)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalMontant)}</td>
                  <td className="px-4 py-3" colSpan={2}></td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalInterets)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(totalAssurance)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalCout)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      </motion.div>
    </AnimatePresence>
  );
}
