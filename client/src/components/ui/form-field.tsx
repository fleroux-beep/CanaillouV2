import { useId } from "react";
import { cn } from "../../lib/utils";

interface FormFieldProps {
  label: string;
  name?: string;
  value?: string | number | undefined;
  defaultValue?: string | number | undefined;
  onChange?: (name: string, value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  prefix?: string;
  suffix?: string;
  children?: React.ReactNode;
}

export function FormField({
  label,
  name,
  value,
  defaultValue,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
  options,
  rows,
  prefix,
  suffix,
  children,
}: FormFieldProps) {
  const id = useId();
  const baseClass =
    "w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:shadow-sm";

  if (children) {
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
        {children}
      </div>
    );
  }

  const isControlled = onChange !== undefined && value !== undefined;
  const valueProps = isControlled
    ? { value: value ?? "", onChange: (e: any) => onChange(name!, e.target.value) }
    : { defaultValue: defaultValue ?? value ?? "" };

  if (options) {
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
        <select
          id={id}
          name={name}
          {...valueProps}
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
        <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
        <textarea
          id={id}
          name={name}
          {...valueProps}
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
      <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60" aria-hidden="true">{prefix}</span>
        )}
        <input
          id={id}
          name={name}
          type={type}
          {...valueProps}
          placeholder={placeholder}
          className={cn(baseClass, prefix && "pl-8", suffix && "pr-12")}
          required={required}
          aria-required={required}
          step={type === "number" ? "any" : undefined}
        />
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground/50" aria-hidden="true">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/** Responsive grid for form fields */
export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn(
      "grid gap-5",
      cols === 2 && "sm:grid-cols-2",
      cols === 3 && "sm:grid-cols-3",
      cols === 4 && "sm:grid-cols-2 lg:grid-cols-4"
    )}>
      {children}
    </div>
  );
}
