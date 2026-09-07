import type { ReactNode } from "react";

type FormFieldProps = {
  id: string;
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

export const formControlClass =
  "w-full rounded-2xl border border-outline-variant bg-white px-3 py-2.5 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant";

export function FormField({
  id,
  label,
  children,
  error,
  hint,
  required = false,
  className = "",
}: FormFieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-on-surface-variant"
      >
        {label}
        {required && <span className="ml-1 text-error" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}
