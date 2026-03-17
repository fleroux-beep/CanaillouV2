import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { Lock, Mail, ArrowRight, Building2, BarChart3, Shield, TrendingUp } from "lucide-react";

const features = [
  { icon: Building2, text: "Gestion de patrimoine immobilier" },
  { icon: BarChart3, text: "Tableaux de bord & KPIs" },
  { icon: TrendingUp, text: "Valorisation & projections" },
  { icon: Shield, text: "Controle des risques" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/50 to-violet-50 dark:from-slate-950 dark:via-indigo-950/50 dark:to-violet-950" />

      {/* Subtle floating shapes */}
      <motion.div
        className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-blue-400/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-violet-400/10 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Left panel - branding (hidden on mobile) */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 hidden w-1/2 flex-col justify-center px-12 lg:flex xl:px-20"
      >
        <div className="max-w-lg">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/20">
            <Building2 className="h-7 w-7 text-white" />
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight xl:text-5xl">
            CANAILLOU <span className="gradient-text-primary">V2</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Votre plateforme de gestion immobiliere.
            Pilotez votre patrimoine avec precision.
          </p>

          <div className="mt-10 space-y-4">
            {features.map((f, i) => (
              <motion.div
                key={f.text}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">{f.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Right panel - login form */}
      <div className="relative z-10 flex w-full items-center justify-center px-6 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl border bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8 text-center"
            >
              {/* Mobile-only icon */}
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/25 lg:hidden">
                <Building2 className="h-7 w-7 text-white" />
              </div>

              <h2 className="text-2xl font-bold tracking-tight">
                <span className="lg:hidden">CANAILLOU <span className="gradient-text-primary">V2</span></span>
                <span className="hidden lg:inline">Connexion</span>
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Accedez a votre espace de gestion
              </p>
            </motion.div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border bg-background/60 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="vous@example.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border bg-background/60 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Votre mot de passe"
                    required
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="group flex w-full items-center justify-center gap-2 rounded-lg gradient-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50"
              >
                {loading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                  />
                ) : (
                  <>
                    Se connecter
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </motion.button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground/50">
            Les Petites Canailles — Gestion immobiliere
          </p>
        </motion.div>
      </div>
    </div>
  );
}
