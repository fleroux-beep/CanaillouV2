import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, FileText, ArrowRight, Sparkles } from "lucide-react";

const cards = [
  {
    href: "/asset-management",
    icon: Building2,
    title: "Asset Management",
    description: "Gestion de patrimoine immobilier : SCIs, actifs, lots, emprunts, valorisation, arbitrages, reporting.",
    gradient: "from-blue-500 to-indigo-600",
    shadow: "shadow-blue-500/20",
    features: ["SCIs & Associes", "Valorisation", "LTV & DSCR", "Reporting"],
  },
  {
    href: "/gestion-locative",
    icon: FileText,
    title: "Gestion Locative",
    description: "Suivi des baux commerciaux : loyers, indexations, charges, projections, KPI, tresorerie.",
    gradient: "from-violet-500 to-purple-600",
    shadow: "shadow-violet-500/20",
    features: ["Baux commerciaux", "Indexation auto", "Projections", "KPI"],
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/25"
          >
            <Sparkles className="h-10 w-10 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold tracking-tight">
            Bienvenue sur{" "}
            <span className="gradient-text-primary">Canaillou</span>
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Plateforme de gestion immobiliere
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid gap-6 sm:grid-cols-2">
          {cards.map((card, i) => (
            <Link key={card.href} href={card.href}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.15 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className={`group cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-lg ${card.shadow} transition-all hover:shadow-2xl`}
              >
                {/* Gradient header */}
                <div className={`bg-gradient-to-r ${card.gradient} p-6`}>
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                      <card.icon className="h-6 w-6 text-white" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-white/60 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                  </div>
                  <h2 className="mt-4 text-xl font-bold text-white">{card.title}</h2>
                </div>

                {/* Content */}
                <div className="p-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.features.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
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
      </div>
    </div>
  );
}
