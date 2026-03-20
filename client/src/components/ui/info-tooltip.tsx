import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import glossary, { type MetricDef } from "../../lib/metrics-glossary";
import { cn } from "../../lib/utils";

interface InfoTooltipProps {
  /** Key in the metrics glossary */
  metricKey?: string;
  /** Or provide a custom definition inline */
  metric?: MetricDef;
  /** Optional children to wrap (if not provided, shows an info icon) */
  children?: React.ReactNode;
  /** Additional class on the wrapper */
  className?: string;
  /** Show as inline with the label text */
  inline?: boolean;
}

/**
 * InfoTooltip — hover-activated tooltip showing metric definition + formula.
 * Renders via Portal to avoid overflow clipping issues.
 */
export function InfoTooltip({ metricKey, metric: customMetric, children, className, inline = true }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const triggerRef = useRef<HTMLSpanElement>(null);

  const def = customMetric || (metricKey ? glossary[metricKey] : undefined);
  if (!def) return <>{children}</>;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 6,
      left: Math.max(8, rect.left + window.scrollX),
    });
  }, []);

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    updatePosition();
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const handleTooltipEnter = () => {
    clearTimeout(timeoutRef.current);
  };

  const handleTooltipLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <span
      ref={triggerRef}
      className={cn("relative", inline ? "inline-flex items-center gap-1" : "inline-block", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      <Info
        className="h-3 w-3 text-muted-foreground/50 hover:text-primary transition-colors cursor-help shrink-0"
        aria-hidden="true"
      />

      {open && position && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleTooltipLeave}
            className="fixed z-[9999] w-72 rounded-xl border border-border/60 bg-popover p-3 shadow-xl shadow-black/10"
            style={{ top: position.top, left: position.left, position: "absolute" }}
          >
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">{def.label}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{def.description}</p>
              {def.formula && (
                <div className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-0.5">Formule</p>
                  <p className="text-[11px] font-mono font-medium text-foreground">{def.formula}</p>
                </div>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-border/60 bg-popover" />
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </span>
  );
}
