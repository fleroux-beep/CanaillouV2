import { type ReactNode, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useAuth } from "../contexts/AuthContext";
import { useDarkMode } from "../hooks/useDarkMode";
import {
  LayoutDashboard, Building2, FileText, Users, Landmark, PiggyBank,
  Map, BarChart3, TrendingUp, Calculator, Calendar,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, ArrowLeft,
  AlertTriangle, DollarSign, FolderOpen, ShieldCheck,
  TreePine, Hammer, ArrowLeftRight, FlaskConical, ClipboardList,
  ArrowUpDown, FileBarChart, Menu, X,
} from "lucide-react";
import { cn } from "../lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: any;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const amNavGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { label: "Hub Canaillou", href: "/", icon: ArrowLeft },
    ],
  },
  {
    label: "Patrimoine",
    items: [
      { label: "Tableau de bord", href: "/asset-management/dashboard", icon: LayoutDashboard },
      { label: "Patrimoine", href: "/asset-management/patrimoine", icon: TreePine },
      { label: "SCI & Associes", href: "/asset-management/scis-associes", icon: Landmark },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Emprunts & Credit", href: "/asset-management/emprunts", icon: PiggyBank },
      { label: "Valorisation", href: "/asset-management/valorisation", icon: BarChart3 },
      { label: "Controle de gestion", href: "/asset-management/controle-gestion", icon: ClipboardList },
      { label: "Arbitrages", href: "/asset-management/arbitrages", icon: ArrowUpDown },
    ],
  },
  {
    label: "Simulation",
    items: [
      { label: "Simulateur SCPI", href: "/asset-management/simulateur", icon: FlaskConical },
      { label: "Reporting", href: "/asset-management/reporting", icon: FileBarChart },
    ],
  },
  {
    label: "Suivi",
    items: [
      { label: "Travaux", href: "/asset-management/travaux", icon: Hammer },
      { label: "Calendrier", href: "/asset-management/calendrier", icon: Calendar },
      { label: "Carte", href: "/asset-management/carte", icon: Map },
    ],
  },
];

const glNavGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { label: "Hub Canaillou", href: "/", icon: ArrowLeft },
    ],
  },
  {
    label: "Tableau de bord",
    items: [
      { label: "Vue d'ensemble", href: "/gestion-locative/dashboard", icon: LayoutDashboard },
      { label: "KPI", href: "/gestion-locative/kpi", icon: BarChart3 },
    ],
  },
  {
    label: "Gestion des baux",
    items: [
      { label: "Baux", href: "/gestion-locative/baux", icon: FileText },
      { label: "Bailleurs", href: "/gestion-locative/bailleurs", icon: Building2 },
      { label: "Locataires", href: "/gestion-locative/locataires", icon: Users },
      { label: "Controle bailleur", href: "/gestion-locative/controle-bailleur", icon: ShieldCheck },
    ],
  },
  {
    label: "Analyse",
    items: [
      { label: "Projections", href: "/gestion-locative/projections", icon: TrendingUp },
      { label: "Tresorerie", href: "/gestion-locative/tresorerie", icon: DollarSign },
      { label: "Paiements", href: "/gestion-locative/paiements", icon: PiggyBank },
      { label: "Indices", href: "/gestion-locative/indices", icon: Calculator },
    ],
  },
  {
    label: "Outils",
    items: [
      { label: "Documents", href: "/gestion-locative/documents", icon: FolderOpen },
      { label: "Alertes", href: "/gestion-locative/alertes", icon: AlertTriangle },
      { label: "Calendrier", href: "/gestion-locative/calendrier", icon: Calendar },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { dark, toggle } = useDarkMode();
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const isAM = location.startsWith("/asset-management");
  const isGL = location.startsWith("/gestion-locative");
  const navGroups = isAM ? amNavGroups : isGL ? glNavGroups : [];
  const sectionTitle = isAM ? "Asset Management" : isGL ? "Gestion Locative" : "";
  const sectionColor = isAM ? "from-orange-500 to-amber-600" : "from-rose-500 to-pink-600";

  const renderSidebarContent = (isMobile: boolean) => {
    const isExpanded = isMobile ? true : !collapsed;
    return (
      <>
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-white/[0.06] px-4">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Accueil Canaillou"
            onClick={isMobile ? closeMobile : undefined}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 shadow-lg shadow-orange-500/25"
            >
              <span className="text-sm font-extrabold text-white leading-none">C2</span>
            </motion.div>
            <AnimatePresence>
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden text-base font-bold whitespace-nowrap tracking-tight"
                >
                  CANAILLOU <span className="text-orange-400">V2</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          {isMobile && (
            <button
              onClick={closeMobile}
              className="ml-auto rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Section badge */}
        {sectionTitle && isExpanded && (
          <div className="px-4 pt-4 pb-1">
            <div className={`inline-flex rounded-lg bg-gradient-to-r ${sectionColor} px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white shadow-sm`}>
              {sectionTitle}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3" aria-label={sectionTitle || "Navigation"}>
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-4" : ""}>
              {group.label && isExpanded && (
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">
                  {group.label}
                </div>
              )}
              {!isExpanded && gi > 0 && group.label && (
                <div className="mx-3 mb-2 border-t border-white/[0.06]" />
              )}
              {group.items.map((item) => {
                const active =
                  location === item.href ||
                  (item.href.endsWith("/dashboard") && location === item.href.replace("/dashboard", "")) ||
                  (item.href !== "/" && location.startsWith(item.href) && item.href.length > 5);
                const navLink = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={isMobile ? closeMobile : undefined}
                  >
                    <motion.div
                      whileHover={{ x: 2 }}
                      className={cn(
                        "relative mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                        active
                          ? "bg-white/[0.08] text-white shadow-sm"
                          : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                      )}
                    >
                      <item.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-orange-400")} aria-hidden="true" />
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="truncate"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {active && (
                        <motion.div
                          layoutId={isMobile ? "nav-indicator-mobile" : "nav-indicator"}
                          className="absolute left-0 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-orange-400 to-rose-500"
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                    </motion.div>
                  </Link>
                );
                return !isExpanded ? (
                  <TooltipPrimitive.Root key={item.href}>
                    <TooltipPrimitive.Trigger asChild>
                      {navLink}
                    </TooltipPrimitive.Trigger>
                    <TooltipPrimitive.Portal>
                      <TooltipPrimitive.Content
                        side="right"
                        sideOffset={8}
                        className="z-50 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white shadow-xl border border-white/10"
                      >
                        {item.label}
                        <TooltipPrimitive.Arrow className="fill-zinc-800" />
                      </TooltipPrimitive.Content>
                    </TooltipPrimitive.Portal>
                  </TooltipPrimitive.Root>
                ) : navLink;
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/[0.06] p-3 space-y-1">
          <motion.button
            whileHover={{ x: 2 }}
            onClick={toggle}
            aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/40 hover:bg-white/[0.04] hover:text-white/70 transition-all"
          >
            {dark ? <Sun className="h-[18px] w-[18px]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
            <AnimatePresence>
              {isExpanded && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {dark ? "Mode clair" : "Mode sombre"}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Deplier la barre laterale" : "Replier la barre laterale"}
              aria-expanded={!collapsed}
              className="flex w-full items-center justify-center rounded-xl p-2 text-white/20 hover:bg-white/[0.04] hover:text-white/50 transition-all"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}

          {(isAM || isGL) && (() => {
            const switchLabel = isAM ? "Gestion Locative" : "Asset Management";
            const switchLink = (
              <Link
                href={isAM ? "/gestion-locative/dashboard" : "/asset-management/dashboard"}
                onClick={isMobile ? closeMobile : undefined}
              >
                <motion.div
                  whileHover={{ x: 2 }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/30 hover:bg-white/[0.04] hover:text-white/60 transition-all"
                >
                  <ArrowLeftRight className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate">
                        {switchLabel}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Link>
            );
            return !isExpanded ? (
              <TooltipPrimitive.Root>
                <TooltipPrimitive.Trigger asChild>
                  {switchLink}
                </TooltipPrimitive.Trigger>
                <TooltipPrimitive.Portal>
                  <TooltipPrimitive.Content
                    side="right"
                    sideOffset={8}
                    className="z-50 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white shadow-xl border border-white/10"
                  >
                    {switchLabel}
                    <TooltipPrimitive.Arrow className="fill-zinc-800" />
                  </TooltipPrimitive.Content>
                </TooltipPrimitive.Portal>
              </TooltipPrimitive.Root>
            ) : switchLink;
          })()}

          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-xs font-bold text-white shadow-sm">
                  {(user?.firstName?.[0] || user?.email?.[0] || "U").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-white/70">{user?.firstName || "Utilisateur"}</p>
                  <p className="truncate text-[10px] text-white/30">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="shrink-0 rounded-lg p-1.5 text-white/20 hover:bg-white/5 hover:text-red-400 transition-all"
                aria-label="Deconnexion"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </div>
      </>
    );
  };

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 260 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="hidden md:flex flex-col bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-foreground))] border-r border-white/[0.04]"
        aria-label="Navigation principale"
      >
        {renderSidebarContent(false)}
      </motion.aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={closeMobile}
              aria-hidden="true"
            />
            <motion.aside
              key="mobile-sidebar"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-foreground))] shadow-2xl md:hidden"
              aria-label="Navigation principale"
            >
              {renderSidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-xl p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          {sectionTitle && (
            <span className={`inline-flex rounded-lg bg-gradient-to-r ${sectionColor} px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white`}>
              {sectionTitle}
            </span>
          )}
        </div>

        <div className="p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
    </TooltipPrimitive.Provider>
  );
}
