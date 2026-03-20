import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

interface SparklineProps {
  /** Data points to plot */
  data: number[];
  /** Width in px (default: 80) */
  width?: number;
  /** Height in px (default: 28) */
  height?: number;
  /** Stroke color (Tailwind class or CSS color) */
  color?: string;
  /** Show filled area under the line */
  filled?: boolean;
  /** Additional className */
  className?: string;
  /** Animate on mount */
  animate?: boolean;
}

/**
 * Sparkline — tiny inline SVG chart for displaying trends.
 *
 * Usage:
 *   <Sparkline data={[100, 120, 115, 130, 145]} color="text-emerald-500" />
 */
export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = "text-primary",
  filled = true,
  className,
  animate = true,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const padding = 2;
  const w = width - padding * 2;
  const h = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * w,
    y: padding + h - ((v - min) / range) * h,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  // Determine trend for default color
  const trend = data[data.length - 1] - data[0];
  const autoColor = trend >= 0 ? "text-emerald-500" : "text-red-500";
  const resolvedColor = color === "auto" ? autoColor : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(resolvedColor, className)}
      aria-hidden="true"
    >
      {filled && (
        <motion.path
          d={areaPath}
          fill="currentColor"
          fillOpacity={0.1}
          initial={animate ? { opacity: 0 } : undefined}
          animate={animate ? { opacity: 1 } : undefined}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
      )}
      <motion.path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, opacity: 0 } : undefined}
        animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      {/* End dot */}
      <motion.circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2}
        fill="currentColor"
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.3, delay: 0.7 }}
      />
    </svg>
  );
}
