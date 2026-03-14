import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
}

export function AnimatedCounter({
  value,
  duration = 1200,
  formatFn = (n) => n.toLocaleString("fr-FR"),
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const prevValue = useRef(0);

  useEffect(() => {
    if (!isInView) return;

    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;

      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    }

    requestAnimationFrame(animate);
  }, [value, isInView, duration]);

  return (
    <span ref={ref} className={className}>
      {formatFn(display)}
    </span>
  );
}
