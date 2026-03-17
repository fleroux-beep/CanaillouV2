import { motion } from "framer-motion";
import { AnimatedCounter } from "./animated-counter";
import { cn } from "../../lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Variant = "default" | "primary" | "success" | "warning" | "danger";

interface KpiCardProps {
  label: string;
  value: number;
  formatFn?: (n: number) => string;
  icon?: React.ElementType;
  variant?: Variant;
  trend?: number;
  subtitle?: string;
  className?: string;
  gradient?: boolean;
  delay?: number;
}

const variantStyles: Record<Variant, string> = {
  default: "border-border/50",
  primary: "border-orange-200/60 dark:border-orange-800/40",
  success: "border-emerald-200/60 dark:border-emerald-800/40",
  warning: "border-amber-200/60 dark:border-amber-800/40",
  danger: "border-red-200/60 dark:border-red-800/40",
};

const gradientStyles: Record<Variant, string> = {
  default: "gradient-primary text-white border-transparent",
  primary: "gradient-primary text-white border-transparent",
  success: "gradient-success text-white border-transparent",
  warning: "gradient-warning text-white border-transparent",
  danger: "gradient-danger text-white border-transparent",
};

const iconColors: Record<Variant, string> = {
  default: "text-primary",
  primary: "text-orange-600 dark:text-orange-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

const iconBgColors: Record<Variant, string> = {
  default: "bg-primary/8",
  primary: "bg-orange-500/8 dark:bg-orange-400/10",
  success: "bg-emerald-500/8 dark:bg-emerald-400/10",
  warning: "bg-amber-500/8 dark:bg-amber-400/10",
  danger: "bg-red-500/8 dark:bg-red-400/10",
};

export function KpiCard({
  label,
  value,
  formatFn,
  icon: Icon,
  variant = "default",
  trend,
  subtitle,
  className,
  gradient = false,
  delay = 0,
}: KpiCardProps) {
  const isGradient = gradient;
  const trendLabel = trend !== undefined
    ? `${trend > 0 ? "hausse" : trend < 0 ? "baisse" : "stable"} de ${Math.abs(trend).toFixed(1)}%`
    : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.06, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      role="region"
      aria-label={`${label}: ${formatFn ? formatFn(value) : value}${trendLabel ? `, ${trendLabel}` : ""}`}
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 transition-all",
        isGradient ? gradientStyles[variant] : `bg-card shadow-sm ${variantStyles[variant]}`,
        "hover:shadow-md",
        className
      )}
    >
      {/* Decorative element */}
      {isGradient && (
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" aria-hidden="true" />
      )}

      <div className="relative flex items-start justify-between">
        <div className="space-y-1.5">
          <p className={cn("text-xs font-semibold uppercase tracking-wider", isGradient ? "text-white/70" : "text-muted-foreground")}>
            {label}
          </p>
          <div className={cn("text-2xl font-bold tracking-tight", !isGradient && "text-foreground")}>
            <AnimatedCounter value={value} formatFn={formatFn} />
          </div>
          {subtitle && (
            <p className={cn("text-xs", isGradient ? "text-white/60" : "text-muted-foreground")}>
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            isGradient ? "bg-white/15" : iconBgColors[variant]
          )} aria-hidden="true">
            <Icon className={cn("h-5 w-5", isGradient ? "text-white" : iconColors[variant])} />
          </div>
        )}
      </div>

      {trend !== undefined && (
        <div className={cn("mt-3 flex items-center gap-1.5 text-xs font-medium")}>
          {trend > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          ) : trend < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={cn(
            trend > 0 ? (isGradient ? "text-white" : "text-emerald-600 dark:text-emerald-400") :
            trend < 0 ? (isGradient ? "text-white" : "text-red-600 dark:text-red-400") :
            (isGradient ? "text-white/60" : "text-muted-foreground")
          )}>
            {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}
