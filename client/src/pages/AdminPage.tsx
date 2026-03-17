import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/ui/page-header";
import { GlassCard } from "../components/ui/glass-card";
import { KpiCard } from "../components/ui/kpi-card";
import { Badge } from "../components/ui/badge";
import { FormDialog } from "../components/ui/form-dialog";
import { FormField } from "../components/ui/form-field";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Section } from "../components/ui/section";
import { SkeletonKpi, SkeletonTable } from "../components/ui/skeleton";
import { useToast } from "../components/ui/toaster";
import {
  Users, UserPlus, Shield, ShieldCheck, Trash2,
  CheckCircle2, XCircle, Lock, AlertTriangle,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isApproved: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", role: "user" });

  const { data: rawUsers, isLoading, isError } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("/api/users"),
  });

  const users: User[] = Array.isArray(rawUsers) ? rawUsers : [];

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("/api/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setShowCreate(false);
      setForm({ email: "", password: "", firstName: "", lastName: "", role: "user" });
      toast({ title: "Utilisateur cree", variant: "success" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/users/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Utilisateur approuve", variant: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteTarget(null);
      toast({ title: "Utilisateur supprime", variant: "success" });
    },
  });

  // Check admin access
  if (currentUser?.role !== "admin") {
    return (
      <div className="space-y-8">
        <PageHeader title="Administration" description="Acces restreint" />
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h3 className="mb-2 text-lg font-semibold">Acces refuse</h3>
            <p className="text-sm text-muted-foreground">
              Cette page est reservee aux administrateurs.
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Administration" description="Gestion de la plateforme" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
        <SkeletonTable rows={5} columns={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-8">
        <PageHeader title="Administration" description="Gestion de la plateforme" />
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-amber-500" />
            <h3 className="mb-2 text-lg font-semibold">Erreur de chargement</h3>
            <p className="mb-4 text-sm text-muted-foreground">Impossible de charger les utilisateurs.</p>
            <button onClick={() => window.location.reload()} className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white">
              Reessayer
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  const admins = users.filter(u => u.role === "admin");
  const pending = users.filter(u => !u.isApproved);
  const approved = users.filter(u => u.isApproved);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Administration"
        description="Gestion des utilisateurs et parametres"
        actions={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl gradient-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 hover:shadow-xl transition-shadow"
          >
            <UserPlus className="h-4 w-4" />
            Ajouter un utilisateur
          </motion.button>
        }
      />

      {/* KPIs */}
      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Utilisateurs" value={users.length} icon={Users} variant="primary" delay={0} />
          <KpiCard label="Administrateurs" value={admins.length} icon={ShieldCheck} variant="warning" delay={1} />
          <KpiCard label="Approuves" value={approved.length} icon={CheckCircle2} variant="success" delay={2} />
          <KpiCard label="En attente" value={pending.length} icon={XCircle} variant="danger" delay={3} />
        </div>
      </Section>

      {/* Pending users */}
      {pending.length > 0 && (
        <Section title="Utilisateurs en attente" description="Ces comptes doivent etre approuves pour acceder a la plateforme">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map(u => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-800/40 dark:bg-amber-900/10"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.firstName || u.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => approveMutation.mutate(u.id)}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Approuver
                </motion.button>
              </motion.div>
            ))}
          </div>
        </Section>
      )}

      {/* All users table */}
      <Section title="Tous les utilisateurs" description={`${users.length} compte${users.length > 1 ? "s" : ""} enregistre${users.length > 1 ? "s" : ""}`}>
        <GlassCard className="overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statut</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cree le</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <AnimatePresence>
                  {users.map((u, i) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-xs font-bold text-white">
                            {(u.firstName?.[0] || u.email[0]).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === "admin" ? "warning" : "primary"}>
                          {u.role === "admin" ? "Admin" : "Utilisateur"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isApproved ? "success" : "danger"}>
                          {u.isApproved ? "Approuve" : "En attente"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!u.isApproved && (
                            <button
                              onClick={() => approveMutation.mutate(u.id)}
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                              title="Approuver"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          {u.id !== currentUser?.id && (
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </GlassCard>
      </Section>

      {/* Change password section */}
      <Section title="Securite" description="Changer votre mot de passe">
        <ChangePasswordForm />
      </Section>

      {/* Create user dialog */}
      <FormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Ajouter un utilisateur"
        description="L'utilisateur recevra ses identifiants et pourra se connecter immediatement."
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate(form);
        }}
        submitLabel="Creer le compte"
        loading={createMutation.isPending}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Prenom">
            <input
              value={form.firstName}
              onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="Jean"
            />
          </FormField>
          <FormField label="Nom">
            <input
              value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="Dupont"
            />
          </FormField>
        </div>
        <FormField label="Email" required>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="jean@example.com"
            required
          />
        </FormField>
        <FormField label="Mot de passe" required>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="Min. 6 caracteres"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <Lock className="h-4 w-4" />
            </button>
          </div>
        </FormField>
        <FormField label="Role">
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          >
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </FormField>
      </FormDialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Supprimer cet utilisateur ?"
        message={`Le compte de ${deleteTarget?.email} sera definitivement supprime.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ---------- Change password sub-component ---------- */

function ChangePasswordForm() {
  const { toast } = useToast();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiRequest("/api/auth/password", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      setCurrentPw("");
      setNewPw("");
      toast({ title: "Mot de passe modifie", variant: "success" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  return (
    <GlassCard>
      <form
        onSubmit={e => {
          e.preventDefault();
          mutation.mutate({ currentPassword: currentPw, newPassword: newPw });
        }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mot de passe actuel</label>
          <input
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            required
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            required
            minLength={6}
          />
        </div>
        <motion.button
          type="submit"
          disabled={mutation.isPending}
          whileTap={{ scale: 0.98 }}
          className="shrink-0 rounded-xl gradient-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-shadow"
        >
          {mutation.isPending ? "Modification..." : "Modifier"}
        </motion.button>
      </form>
    </GlassCard>
  );
}
