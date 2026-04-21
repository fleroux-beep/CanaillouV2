import { type ReactNode, useId, useEffect, useCallback, useRef, useState } from "react";
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

  // Local submitting flag: blocks a second submit before the parent's async
  // `loading` flag has time to propagate (guards against fast double-click).
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Reset local lock when dialog closes or parent signals loading finished.
  useEffect(() => {
    if (!open || !loading) {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open, loading]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      if (submittingRef.current || loading) {
        e.preventDefault();
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      onSubmit?.(e);
    },
    [onSubmit, loading]
  );

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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
              "relative z-10 w-full overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl",
              sizes[size],
              "max-h-[85vh] flex flex-col"
            )}
          >
            {/* Accent bar */}
            <div className="h-1 w-full bg-gradient-to-r from-orange-500 to-rose-500" />

            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4">
              <div>
                <h2 id={titleId} className="text-lg font-bold tracking-tight">{title}</h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-muted-foreground">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6">
              {onSubmit ? (
                <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading || submitting}>
                  {children}
                  <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Annuler
                    </button>
                    <motion.button
                      type="submit"
                      disabled={loading || submitting}
                      aria-disabled={loading || submitting}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="rounded-xl gradient-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-shadow hover:shadow-xl hover:shadow-orange-500/25"
                    >
                      {(loading || submitting) ? "Enregistrement..." : submitLabel}
                    </motion.button>
                  </div>
                </form>
              ) : (
                children
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
