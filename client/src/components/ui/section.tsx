import { motion } from "framer-motion";
import { type ReactNode } from "react";

const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

interface SectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function Section({ title, description, children, className, delay = 0 }: SectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: delay * 0.1 }}
      className={className}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        {children}
      </motion.div>
    </motion.div>
  );
}
