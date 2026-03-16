import { type ReactNode, useId, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  loading?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Enregistrer",
  loading = false,
  size = "md",
}: FormDialogProps) {
  const titleId = useId();
  const descId = useId();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
        >
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative z-10 w-full rounded-2xl border bg-card p-6 shadow-2xl",
              sizes[size],
              "max-h-[85vh] overflow-y-auto scrollbar-thin"
            )}
          >
            {/* Header */}
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-muted-foreground">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            {onSubmit ? (
              <form onSubmit={onSubmit} className="space-y-5" aria-busy={loading}>
                {children}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Annuler
                  </button>
                  <motion.button
                    type="submit"
                    disabled={loading}
                    aria-disabled={loading}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 disabled:opacity-50"
                  >
                    {loading ? "Enregistrement..." : submitLabel}
                  </motion.button>
                </div>
              </form>
            ) : (
              children
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
