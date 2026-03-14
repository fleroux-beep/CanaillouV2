import { useId } from "react";
import { cn } from "../../lib/utils";

interface FormFieldProps {
  label: string;
  name: string;
  value: string | number | undefined;
  onChange: (name: string, value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  prefix?: string;
  suffix?: string;
}

export function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
  options,
  rows,
  prefix,
  suffix,
}: FormFieldProps) {
  const id = useId();
  const baseClass =
    "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

  if (options) {
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          className={baseClass}
          required={required}
          aria-required={required}
        >
          <option value="">-- Choisir --</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (rows) {
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
        <textarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn(baseClass, "resize-none")}
          required={required}
          aria-required={required}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">{prefix}</span>
        )}
        <input
          id={id}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          className={cn(baseClass, prefix && "pl-8", suffix && "pr-12")}
          required={required}
          aria-required={required}
          step={type === "number" ? "any" : undefined}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden="true">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/** Two-column grid for form fields */
export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn(
      "grid gap-4",
      cols === 2 && "sm:grid-cols-2",
      cols === 3 && "sm:grid-cols-3",
      cols === 4 && "sm:grid-cols-2 lg:grid-cols-4"
    )}>
      {children}
    </div>
  );
}
