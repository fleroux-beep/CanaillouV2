import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "outline";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  outline: "border border-border/60 text-muted-foreground bg-transparent",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
      variantStyles[variant],
      className
    )}>
      {children}
    </span>
  );
}
