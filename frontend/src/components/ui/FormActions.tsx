type FormActionsProps = {
  submitLabel: string;
  onCancel: () => void;
  isSubmitting?: boolean;
  submittingLabel?: string;
  submitDisabled?: boolean;
};

export function FormActions({
  submitLabel,
  onCancel,
  isSubmitting = false,
  submittingLabel = "Guardando...",
  submitDisabled = false,
}: FormActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-outline-variant bg-surface-container/70 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        className="w-full rounded-2xl border border-outline-variant bg-white px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={isSubmitting || submitDisabled}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
