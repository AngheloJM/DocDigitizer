import { useState } from "react";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import type { FolderOption } from "@/lib/folder-options";
import type { User } from "@/lib/types";

export type SearchFilterValues = {
  query: string;
  docType: string;
  dateFrom: string;
  dateTo: string;
  folderId: string;
  ownerId: string;
};

type SearchFiltersPanelProps = {
  values: SearchFilterValues;
  folders: FolderOption[];
  owners: User[];
  showOwnerFilter: boolean;
  loading: boolean;
  foldersLoading: boolean;
  ownersLoading: boolean;
  dateError: string | null;
  onChange: (values: SearchFilterValues) => void;
  onSubmit: () => void;
  onClear: () => void;
};

export function SearchFiltersPanel({
  values,
  folders,
  owners,
  showOwnerFilter,
  loading,
  foldersLoading,
  ownersLoading,
  dateError,
  onChange,
  onSubmit,
  onClear,
}: SearchFiltersPanelProps) {
  const activeAdvancedFilters = [
    values.docType,
    values.dateFrom,
    values.dateTo,
    values.folderId,
    showOwnerFilter ? values.ownerId : "",
  ].filter(Boolean).length;
  const hasValues = Boolean(values.query.trim() || activeAdvancedFilters);
  const [advancedOpen, setAdvancedOpen] = useState(activeAdvancedFilters > 0);

  function update<K extends keyof SearchFilterValues>(
    field: K,
    value: SearchFilterValues[K],
  ) {
    onChange({ ...values, [field]: value });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="mb-6 rounded-2xl border border-outline-variant bg-white p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary/5 text-primary">
          <Icon name="search" className="text-lg" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Buscar documentos</h3>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <FormField id="search-query" label="Texto a buscar" className="min-w-0 flex-1">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant"
            />
            <input
              id="search-query"
              value={values.query}
              onChange={(event) => update("query", event.target.value)}
              placeholder="Ej: certificado de calificaciones"
              className={`${formControlClass} pl-10`}
              autoComplete="off"
              required
            />
          </div>
        </FormField>

        <div className="flex flex-col gap-2 sm:flex-row lg:pb-px">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-search-filters"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon name="tune" className="text-lg text-primary" />
            Filtros avanzados
            {activeAdvancedFilters > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-secondary-container px-1.5 py-0.5 text-[10px] font-bold text-on-secondary">
                {activeAdvancedFilters}
              </span>
            )}
            <Icon
              name={advancedOpen ? "expand_less" : "expand_more"}
              className="text-lg text-on-surface-variant"
            />
          </button>

          <button
            type="submit"
            disabled={loading || !values.query.trim() || Boolean(dateError)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="search" className="text-lg" />
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </div>

      {advancedOpen && (
        <div
          id="advanced-search-filters"
          className="mt-5 border-t border-outline-variant pt-5"
        >
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-on-surface">Criterios adicionales</h4>
            </div>

            {activeAdvancedFilters > 0 && (
              <span className="mt-2 self-start rounded-full bg-secondary-container px-2.5 py-1 text-[11px] font-semibold text-on-secondary sm:mt-0">
                {activeAdvancedFilters} filtro{activeAdvancedFilters === 1 ? "" : "s"} activo
                {activeAdvancedFilters === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              id="search-doc-type"
              label="Tipo documental"
              hint="Debe coincidir con el tipo registrado en el documento."
            >
              <input
                id="search-doc-type"
                value={values.docType}
                onChange={(event) => update("docType", event.target.value)}
                placeholder="Ej: Acta de defensa"
                className={formControlClass}
                autoComplete="off"
              />
            </FormField>

            <FormField id="search-date-from" label="Fecha de registro desde">
              <input
                id="search-date-from"
                type="date"
                value={values.dateFrom}
                onChange={(event) => update("dateFrom", event.target.value)}
                max={values.dateTo || undefined}
                className={formControlClass}
              />
            </FormField>

            <FormField
              id="search-date-to"
              label="Fecha de registro hasta"
              error={dateError ?? undefined}
            >
              <input
                id="search-date-to"
                type="date"
                value={values.dateTo}
                onChange={(event) => update("dateTo", event.target.value)}
                min={values.dateFrom || undefined}
                className={formControlClass}
                aria-invalid={Boolean(dateError)}
              />
            </FormField>

            {showOwnerFilter && (
              <FormField
                id="search-owner"
                label="Propietario"
                hint={ownersLoading ? "Cargando usuarios..." : undefined}
              >
                <select
                  id="search-owner"
                  value={values.ownerId}
                  onChange={(event) => update("ownerId", event.target.value)}
                  disabled={ownersLoading}
                  className={formControlClass}
                >
                  <option value="">Todos los propietarios</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.full_name} · {owner.email}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField
              id="search-folder"
              label="Carpeta"
              hint={foldersLoading ? "Cargando carpetas..." : undefined}
              className={
                showOwnerFilter ? "sm:col-span-2 lg:col-span-2" : "sm:col-span-2 lg:col-span-3"
              }
            >
              <select
                id="search-folder"
                value={values.folderId}
                onChange={(event) => update("folderId", event.target.value)}
                disabled={foldersLoading}
                className={formControlClass}
              >
                <option value="">Todas las carpetas</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="mt-5 flex justify-end border-t border-outline-variant pt-4">
            <button
              type="button"
              onClick={onClear}
              disabled={!hasValues || loading}
              className="rounded-2xl px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpiar todos los filtros
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
