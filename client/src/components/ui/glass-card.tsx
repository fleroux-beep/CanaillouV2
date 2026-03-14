import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "../../lib/utils";
import { type ReactNode } from "react";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}

export function GlassCard({
  children,
  className,
  delay = 0,
  hover = true,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.08, ease: [0.4, 0, 0.2, 1] }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn("glass rounded-xl p-6 transition-shadow hover:shadow-lg", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
