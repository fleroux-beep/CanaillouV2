import { motion } from "framer-motion";
import { type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        </div>
        {description && (
          <p className="pl-[1.15rem] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
