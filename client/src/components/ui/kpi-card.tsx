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
  trend?: number; // % change, positive = up
  subtitle?: string;
  className?: string;
  gradient?: boolean;
  delay?: number;
}

const variantStyles: Record<Variant, string> = {
  default: "border-border",
  primary: "border-primary/20 bg-primary/5",
  success: "border-green-500/20 bg-green-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  danger: "border-red-500/20 bg-red-500/5",
};

const gradientStyles: Record<Variant, string> = {
  default: "gradient-primary text-white",
  primary: "gradient-primary text-white",
  success: "gradient-success text-white",
  warning: "gradient-warning text-white",
  danger: "gradient-danger text-white",
};

const iconColors: Record<Variant, string> = {
  default: "text-primary",
  primary: "text-primary",
  success: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
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
      transition={{ duration: 0.4, delay: delay * 0.08, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      role="region"
      aria-label={`${label}: ${formatFn ? formatFn(value) : value}${trendLabel ? `, ${trendLabel}` : ""}`}
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 transition-shadow",
        isGradient ? gradientStyles[variant] : `bg-card ${variantStyles[variant]}`,
        "hover:shadow-lg",
        className
      )}
    >
      {/* Decorative circle */}
      {isGradient && (
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" aria-hidden="true" />
      )}

      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <p className={cn("text-sm font-medium", isGradient ? "text-white/80" : "text-muted-foreground")}>
            {label}
          </p>
          <div className="text-2xl font-bold tracking-tight">
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
            "flex h-10 w-10 items-center justify-center rounded-lg",
            isGradient ? "bg-white/20" : "bg-muted"
          )} aria-hidden="true">
            <Icon className={cn("h-5 w-5", isGradient ? "text-white" : iconColors[variant])} />
          </div>
        )}
      </div>

      {trend !== undefined && (
        <div className={cn("mt-3 flex items-center gap-1 text-xs font-medium")}>
          {trend > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
          ) : trend < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={cn(
            trend > 0 ? (isGradient ? "text-white" : "text-green-600") :
            trend < 0 ? (isGradient ? "text-white" : "text-red-600") :
            (isGradient ? "text-white/60" : "text-muted-foreground")
          )}>
            {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}
