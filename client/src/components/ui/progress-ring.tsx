import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface ProgressRingProps {
  value: number;
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
  strokeWidth = 10,
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
      <div className="relative">
        <svg ref={ref} width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            opacity={0.3}
          />
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
        {/* Center label */}
        {label && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold tracking-tight">{label}</span>
            {sublabel && <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{sublabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
