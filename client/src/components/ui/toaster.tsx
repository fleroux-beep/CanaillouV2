import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ToastVariant = "default" | "success" | "warning" | "destructive";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextType {
  toast: (t: Omit<Toast, "id">) => void;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 3;

const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: typeof Info;
    containerClass: string;
    iconClass: string;
    progressClass: string;
  }
> = {
  default: {
    icon: Info,
    containerClass:
      "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100",
    iconClass: "text-blue-600 dark:text-blue-400",
    progressClass: "bg-blue-500 dark:bg-blue-400",
  },
  success: {
    icon: CheckCircle2,
    containerClass:
      "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100",
    iconClass: "text-green-600 dark:text-green-400",
    progressClass: "bg-green-500 dark:bg-green-400",
  },
  warning: {
    icon: AlertTriangle,
    containerClass:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
    iconClass: "text-amber-600 dark:text-amber-400",
    progressClass: "bg-amber-500 dark:bg-amber-400",
  },
  destructive: {
    icon: XCircle,
    containerClass:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
    iconClass: "text-red-600 dark:text-red-400",
    progressClass: "bg-red-500 dark:bg-red-400",
  },
};

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within Toaster");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Progress bar                                                              */
/* -------------------------------------------------------------------------- */

function ProgressBar({ durationMs, className }: { durationMs: number; className: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Force a reflow so the browser registers width: 100% before transitioning.
    el.getBoundingClientRect();
    el.style.width = "0%";
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden rounded-b-lg">
      <div
        ref={ref}
        className={cn("h-full w-full opacity-40 transition-[width] ease-linear", className)}
        style={{ transitionDuration: `${durationMs}ms` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Single toast                                                              */
/* -------------------------------------------------------------------------- */

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  const variant = t.variant ?? "default";
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "pointer-events-auto relative flex w-80 items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg",
        config.containerClass,
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconClass)} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{t.title}</p>
        {t.description && (
          <p className="mt-1 text-sm leading-snug opacity-80">{t.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        className="shrink-0 rounded-md p-0.5 opacity-50 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <ProgressBar durationMs={AUTO_DISMISS_MS} className={config.progressClass} />
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toaster provider                                                          */
/* -------------------------------------------------------------------------- */

export function Toaster({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();

      setToasts((prev) => {
        const next = [...prev, { ...t, id }];
        // Enforce the max-visible cap by dropping the oldest.
        if (next.length > MAX_VISIBLE) {
          return next.slice(next.length - MAX_VISIBLE);
        }
        return next;
      });

      setTimeout(() => {
        dismiss(id);
      }, AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-3 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} t={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
