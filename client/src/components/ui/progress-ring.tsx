import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 8,
  color = "hsl(var(--primary))",
  trackColor = "hsl(var(--muted))",
  label,
  sublabel,
  className,
}: ProgressRingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`flex flex-col items-center ${className || ""}`}>
      <svg ref={ref} width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={
            isInView
              ? { strokeDashoffset: circumference - (clampedValue / 100) * circumference }
              : {}
          }
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      {label && (
        <div className="mt-2 text-center">
          <div className="text-sm font-semibold">{label}</div>
          {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
