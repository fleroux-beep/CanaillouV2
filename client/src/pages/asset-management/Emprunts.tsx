import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../../lib/queryClient";
import { useCrud } from "../../hooks/useCrud";
import { DataTable, type Column } from "../../components/ui/data-table";
import { FormDialog } from "../../components/ui/form-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormField, FormGrid } from "../../components/ui/form-field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { PageHeader } from "../../components/ui/page-header";
import { KpiCard } from "../../components/ui/kpi-card";
import { GlassCard } from "../../components/ui/glass-card";
import { Section } from "../../components/ui/section";
import { Badge } from "../../components/ui/badge";
import { formatCurrency, formatPercent } from "../../lib/utils";
import { Plus, Pencil, Trash2, TrendingDown, Calculator, RefreshCw, Landmark, Percent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts";

interface Emprunt {
  id: string; sciId?: string; actifId?: string; banque?: string; montantEmprunte?: string;
  capitalRestantDu?: string; tauxAnnuel?: string; dureeAns?: number; dureeMois?: number;
  dateDebut?: string; dateFin?: string; typeAmortissement?: string; mensualite?: string;
  assuranceMensuelle?: string; tauxAssurance?: string; typeGarantie?: string; notes?: string; archived?: boolean;
}
interface SCI { id: string; nom: string; }
interface Actif { id: string; nom: string; }

const empty: Partial<Emprunt> = {};

/* ═══════════ Onglet Emprunts (CRUD existant) ═══════════ */
function EmpruntsTab() {
  const { data, create, update, remove, creating, updating, deleting } = useCrud<Emprunt>("/api/am/emprunts", "Emprunt");
  const { data: scis } = useCrud<SCI>("/api/am/scis", "SCI");
  const { data: actifs } = useCrud<Actif>("/api/am/actifs", "Actif");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Emprunt | null>(null);
  const [form, setForm] = useState<Partial<Emprunt>>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));

  const columns: Column<Emprunt>[] = [
    { key: "banque", label: "Banque", sortable: true, render: (r) => <span className="font-medium">{r.banque || "—"}</span> },
    { key: "sciId", label: "SCI", sortable: true, render: (r) => r.sciId ? <Badge variant="primary">{sciMap[r.sciId] || "—"}</Badge> : "—" },
    { key: "montantEmprunte", label: "Montant", align: "right", sortable: true, render: (r) => r.montantEmprunte ? formatCurrency(r.montantEmprunte) : "—" },
    { key: "capitalRestantDu", label: "CRD", align: "right", sortable: true, render: (r) => r.capitalRestantDu ? formatCurrency(r.capitalRestantDu) : "—" },
    { key: "tauxAnnuel", label: "Taux", align: "right", sortable: true, render: (r) => r.tauxAnnuel ? formatPercent(r.tauxAnnuel) : "—" },
    { key: "mensualite", label: "Mensualité", align: "right", sortable: true, render: (r) => r.mensualite ? formatCurrency(r.mensualite) : "—" },
    { key: "dateFin", label: "Échéance", sortable: true },
    { key: "actions", label: "", align: "right", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); setForm(r); setDialogOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  const onChange = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { await update({ ...form, id: editing.id } as any); } else { await create(form); }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditing(null); setForm(empty); setDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25">
          <Plus className="h-4 w-4" /> Nouvel emprunt
        </motion.button>
      </div>
      <DataTable data={data.filter((e) => !e.archived)} columns={columns} searchKeys={["banque"]} searchPlaceholder="Rechercher..." emptyMessage="Aucun emprunt" exportFileName="emprunts" />
      <FormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Modifier l'emprunt" : "Nouvel emprunt"} onSubmit={handleSubmit} loading={creating || updating} size="lg">
        <FormGrid>
          <FormField label="Banque" name="banque" value={form.banque} onChange={onChange} />
          <FormField label="SCI" name="sciId" value={form.sciId} onChange={onChange} options={scis.map((s) => ({ value: s.id, label: s.nom }))} />
          <FormField label="Actif" name="actifId" value={form.actifId} onChange={onChange} options={actifs.map((a) => ({ value: a.id, label: a.nom }))} />
          <FormField label="Type amortissement" name="typeAmortissement" value={form.typeAmortissement} onChange={onChange} options={[
            { value: "constant", label: "Constant" }, { value: "in-fine", label: "In fine" }, { value: "progressif", label: "Progressif" },
          ]} />
          <FormField label="Montant emprunté" name="montantEmprunte" value={form.montantEmprunte} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Capital restant dû" name="capitalRestantDu" value={form.capitalRestantDu} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Taux annuel" name="tauxAnnuel" value={form.tauxAnnuel} onChange={onChange} type="number" suffix="%" />
          <FormField label="Mensualité" name="mensualite" value={form.mensualite} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Durée (ans)" name="dureeAns" value={form.dureeAns} onChange={onChange} type="number" />
          <FormField label="Durée (mois)" name="dureeMois" value={form.dureeMois} onChange={onChange} type="number" />
          <FormField label="Date début" name="dateDebut" value={form.dateDebut} onChange={onChange} type="date" />
          <FormField label="Date fin" name="dateFin" value={form.dateFin} onChange={onChange} type="date" />
          <FormField label="Assurance/mois" name="assuranceMensuelle" value={form.assuranceMensuelle} onChange={onChange} type="number" suffix="EUR" />
          <FormField label="Taux assurance" name="tauxAssurance" value={form.tauxAssurance} onChange={onChange} type="number" suffix="%" />
          <FormField label="Type garantie" name="typeGarantie" value={form.typeGarantie} onChange={onChange} options={[
            { value: "hypotheque", label: "Hypotheque" }, { value: "caution", label: "Caution" }, { value: "privilege", label: "Privilege" },
          ]} />
        </FormGrid>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={3} className="mt-4" />
      </FormDialog>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} loading={deleting} />
    </div>
  );
}

/* ═══════════ Onglet Cout du credit ═══════════ */
function CoutCreditTab() {
  const { data: emprunts = [] } = useQuery<Emprunt[]>({
    queryKey: ["/api/am/emprunts"],
    queryFn: () => apiRequest("/api/am/emprunts"),
  });
  const { data: scis = [] } = useQuery<SCI[]>({
    queryKey: ["/api/am/scis"],
    queryFn: () => apiRequest("/api/am/scis"),
  });

  const sciMap = Object.fromEntries(scis.map((s) => [s.id, s.nom]));
  const activeEmprunts = emprunts.filter((e) => !e.archived);

  // Calcul du cout total pour chaque emprunt
  const coutData = useMemo(() => {
    return activeEmprunts.map((emp) => {
      const montant = emp.montantEmprunte ? parseFloat(emp.montantEmprunte) : 0;
      const mens = emp.mensualite ? parseFloat(emp.mensualite) : 0;
      const assurance = emp.assuranceMensuelle ? parseFloat(emp.assuranceMensuelle) : 0;
      const duree = emp.dureeMois || (emp.dureeAns ? emp.dureeAns * 12 : 0);
      const totalRembourse = (mens + assurance) * duree;
      const coutInterets = totalRembourse - montant;
      const coutAssurance = assurance * duree;
      const coutTotal = coutInterets + coutAssurance;
      const taeg = montant > 0 && duree > 0
        ? ((totalRembourse / montant - 1) / (duree / 12) * 100)
        : 0;

      return {
        id: emp.id,
        banque: emp.banque || "—",
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
    name: c.banque,
    Interets: Math.round(c.coutInterets),
    Assurance: Math.round(c.coutAssurance),
    Capital: Math.round(c.montant),
  }));

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Capital emprunte" value={totalMontant} formatFn={(n) => formatCurrency(n)} icon={Landmark} variant="primary" gradient delay={0} />
          <KpiCard label="Cout des interets" value={totalInterets} formatFn={(n) => formatCurrency(n)} icon={TrendingDown} variant="danger" gradient delay={1} />
          <KpiCard label="Cout assurance" value={totalAssurance} formatFn={(n) => formatCurrency(n)} icon={Calculator} variant="warning" gradient delay={2} />
          <KpiCard label="Coût total du crédit" value={totalCout} formatFn={(n) => formatCurrency(n)} icon={Percent} variant="danger" gradient delay={3} />
        </div>

        {chartData.length > 0 && (
          <Section title="Decomposition par emprunt" delay={1}>
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
                    <Bar dataKey="Interets" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
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
                  <th className="px-4 py-3 text-left font-semibold">SCI</th>
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
                {coutData.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{c.banque}</td>
                    <td className="px-4 py-3">{c.sci}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(c.montant)}</td>
                    <td className="px-4 py-3 text-right">{c.taux.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right">{c.duree > 0 ? `${Math.round(c.duree / 12)} ans` : "—"}</td>
                    <td className="px-4 py-3 text-right text-red-600">{formatCurrency(c.coutInterets)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(c.coutAssurance)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(c.coutTotal)}</td>
                    <td className="px-4 py-3 text-right">{c.taeg.toFixed(2)}%</td>
                  </tr>
                ))}
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

/* ═══════════ Onglet Rachat de credit ═══════════ */
function RachatCreditTab() {
  const { data: emprunts = [] } = useQuery<Emprunt[]>({
    queryKey: ["/api/am/emprunts"],
    queryFn: () => apiRequest("/api/am/emprunts"),
  });

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
    const ancienTaux = emp.tauxAnnuel ? parseFloat(emp.tauxAnnuel) / 100 : 0;
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
                    {activeEmprunts.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.banque || "Emprunt"} — {e.capitalRestantDu ? formatCurrency(e.capitalRestantDu) : e.montantEmprunte ? formatCurrency(e.montantEmprunte) : "N/A"}
                      </option>
                    ))}
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
              <KpiCard label="Ancienne mensualité" value={simulation.ancienneMens + simulation.ancienneAssurance} formatFn={(n) => formatCurrency(n)} icon={TrendingDown} variant="warning" gradient delay={0} />
              <KpiCard label="Nouvelle mensualité" value={simulation.nouvelleMensualite} formatFn={(n) => formatCurrency(n)} icon={RefreshCw} variant="primary" gradient delay={1} />
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

/* ═══════════ Page principale avec onglets ═══════════ */
export default function EmpruntsPage() {
  const [activeTab, setActiveTab] = useState("emprunts");

  return (
    <div className="space-y-6">
      <PageHeader title="Emprunts & Financements" description="Gestion des emprunts, cout du credit et simulation de rachat" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="emprunts">Emprunts</TabsTrigger>
          <TabsTrigger value="cout-credit">Cout du credit</TabsTrigger>
          <TabsTrigger value="rachat-credit">Rachat de credit</TabsTrigger>
        </TabsList>
        <TabsContent value="emprunts">
          <EmpruntsTab />
        </TabsContent>
        <TabsContent value="cout-credit">
          <CoutCreditTab />
        </TabsContent>
        <TabsContent value="rachat-credit">
          <RachatCreditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
