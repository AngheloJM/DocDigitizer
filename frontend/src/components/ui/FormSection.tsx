import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  separated?: boolean;
};

export function FormSection({
  title,
  description,
  children,
  separated = false,
}: FormSectionProps) {
  return (
    <section className={separated ? "border-t border-outline-variant pt-6" : undefined}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
