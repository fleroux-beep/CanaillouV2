import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, FileText, ArrowRight, BarChart3, TrendingUp, Shield, Zap } from "lucide-react";

const modules = [
  {
    href: "/asset-management",
    icon: Building2,
    title: "Asset Management",
    description: "Pilotez votre patrimoine immobilier avec une vision institutionnelle : SCIs, valorisation DCF, LTV, DSCR, arbitrages et reporting.",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    iconBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    borderAccent: "hover:border-orange-500/30",
    features: ["SCIs & Associes", "Valorisation DCF", "LTV & DSCR", "Reporting"],
  },
  {
    href: "/gestion-locative",
    icon: FileText,
    title: "Gestion Locative",
    description: "Suivez vos baux commerciaux en detail : loyers, indexations automatiques, echeancier, projections et tresorerie.",
    gradient: "from-rose-500 via-pink-500 to-fuchsia-500",
    iconBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    borderAccent: "hover:border-rose-500/30",
    features: ["Baux commerciaux", "Indexation auto", "Projections", "Tresorerie"],
  },
];

const highlights = [
  { icon: BarChart3, label: "Tableaux de bord", desc: "KPIs en temps reel" },
  { icon: TrendingUp, label: "Analyse", desc: "DCF, stress tests" },
  { icon: Shield, label: "Controle", desc: "Suivi des risques" },
  { icon: Zap, label: "Automatisation", desc: "Indexations, alertes" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-12 lg:px-8">

        {/* Hero section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 shadow-2xl shadow-orange-500/25"
          >
            <Building2 className="h-10 w-10 text-white" />
          </motion.div>

          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
            CANAILLOU <span className="gradient-text-primary">V2</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground leading-relaxed">
            Plateforme de gestion immobiliere pour piloter votre patrimoine
            avec precision et efficacite.
          </p>
        </motion.div>

        {/* Quick highlights */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {highlights.map((h, i) => (
            <motion.div
              key={h.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex flex-col items-center rounded-xl border bg-card/50 p-4 text-center backdrop-blur-sm"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <h.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-semibold">{h.label}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{h.desc}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Module cards */}
        <div className="grid gap-6 sm:grid-cols-2">
          {modules.map((mod, i) => (
            <Link key={mod.href} href={mod.href}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.15 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-lg transition-all hover:shadow-2xl ${mod.borderAccent}`}
              >
                {/* Gradient accent bar */}
                <div className={`h-1.5 bg-gradient-to-r ${mod.gradient}`} />

                <div className="p-6">
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${mod.iconBg}`}>
                      <mod.icon className="h-6 w-6" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground/40 transition-all group-hover:translate-x-1 group-hover:text-foreground" />
                  </div>

                  {/* Title & description */}
                  <h2 className="mb-2 text-xl font-bold tracking-tight">{mod.title}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {mod.description}
                  </p>

                  {/* Feature tags */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {mod.features.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover:bg-muted"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>

        {/* Footer tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center text-xs text-muted-foreground/50"
        >
          Les Petites Canailles — Gestion immobiliere
        </motion.p>
      </div>
    </div>
  );
}
