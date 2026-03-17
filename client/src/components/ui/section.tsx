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
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        {children}
      </motion.div>
    </motion.div>
  );
}
