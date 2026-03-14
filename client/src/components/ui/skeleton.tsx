import { cn } from "../../lib/utils";

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

/** Basic rectangular skeleton with shimmer animation */
export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn("shimmer rounded-lg bg-muted", className)}
      style={{ width, height }}
    />
  );
}

/** Card-shaped skeleton matching GlassCard dimensions */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("glass rounded-xl p-6 space-y-4", className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

/** Table rows skeleton with multiple columns */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header row */}
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, col) => (
          <Skeleton key={col} className="h-4 flex-1" />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton key={col} className="h-10 flex-1 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** KPI card skeleton matching KpiCard layout */
export function SkeletonKpi({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 space-y-3",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
