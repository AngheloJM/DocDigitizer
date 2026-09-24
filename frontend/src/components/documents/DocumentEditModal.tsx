"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormActions } from "@/components/ui/FormActions";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { ShelfListbox } from "@/components/ui/ShelfListbox";
import { MonthOptions } from "@/components/ui/MonthOptions";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { DocumentItem, DocumentUpdateInput } from "@/lib/types";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum, `Máximo ${maximum} caracteres`);

const documentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "El título es obligatorio")
      .max(255, "Máximo 255 caracteres"),
    description: z.string(),
    doc_type: optionalText(100),
    physical_shelf: optionalText(50),
    physical_division: optionalText(50),
    physical_column: optionalText(50),
    physical_volume: optionalText(50),
    archived_year: z.string().refine(
      (value) =>
        value === "" ||
        (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100),
      "Ingresa un año válido",
    ),
    archived_month_start: z.string(),
    archived_month_end: z.string(),
  })
  .superRefine((values, context) => {
    const start = values.archived_month_start
      ? Number(values.archived_month_start)
      : null;
    const end = values.archived_month_end ? Number(values.archived_month_end) : null;

    if ((start || end) && !values.archived_year) {
      context.addIssue({
        code: "custom",
        path: ["archived_year"],
        message: "Indica el año del período",
      });
    }

    if (start && end && end < start) {
      context.addIssue({
        code: "custom",
        path: ["archived_month_end"],
        message: "El mes final no puede ser anterior al inicial",
      });
    }
  });

type DocumentFormValues = z.infer<typeof documentSchema>;

type DocumentEditModalProps = {
  open: boolean;
  document: DocumentItem | null;
  ownerId: string;
  onClose: () => void;
  onSaved: (document: DocumentItem) => void;
};

function getDefaultValues(document: DocumentItem | null): DocumentFormValues {
  return {
    title: document?.title ?? "",
    description: document?.description ?? "",
    doc_type: document?.doc_type ?? "",
    physical_shelf: document?.physical_shelf ?? "",
    physical_division: document?.physical_division ?? "",
    physical_column: document?.physical_column ?? "",
    physical_volume: document?.physical_volume ?? "",
    archived_year: document?.archived_year != null ? String(document.archived_year) : "",
    archived_month_start: document?.archived_month_start != null
      ? String(document.archived_month_start)
      : "",
    archived_month_end: document?.archived_month_end != null
      ? String(document.archived_month_end)
      : "",
  };
}

export function DocumentEditModal({
  open,
  document,
  onClose,
  onSaved,
}: DocumentEditModalProps) {
  const isCreating = document === null;
  const [shelves, setShelves] = useState<string[]>([]);
  const [shelfMode, setShelfMode] = useState<"existing" | "new">("existing");
  const [shelfLoading, setShelfLoading] = useState(true);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [shelfAttempt, setShelfAttempt] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const {
    register,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: getDefaultValues(document),
  });

  const selectedShelf = watch("physical_shelf");
  const shelfOptions = Array.from(new Set([
    ...(document?.physical_shelf ? [document.physical_shelf] : []),
    ...shelves,
  ]));

  useEffect(() => {
    if (!open) return;
    reset(getDefaultValues(document));
    setShelfMode("existing");
    setServerError(null);
    setFile(null);
    setFileError(null);
    setUploadedDocumentId(null);
  }, [open, document, reset]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShelfLoading(true);
    setShelfError(null);
    setShelves([]);
    backend.documents.locations()
      .then((nodes) => {
        if (!cancelled) setShelves(nodes.map((node) => node.value).filter((value) => value.trim() !== ""));
      })
      .catch(() => {
        if (!cancelled) setShelfError("No se pudieron cargar los estantes.");
      })
      .finally(() => {
        if (!cancelled) setShelfLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, shelfAttempt]);

  function registerLocation(name: "physical_shelf" | "physical_division" | "physical_column" | "physical_volume") {
    const field = register(name);
    return {
      ...field,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const before = input.value;
        input.value = before.toUpperCase();
        if (start !== null && end !== null) {
          input.setSelectionRange(
            before.slice(0, start).toUpperCase().length,
            before.slice(0, end).toUpperCase().length,
          );
        }
        return field.onChange(event);
      },
    };
  }

  function changeShelf(value: string) {
    const previous = getValues("physical_shelf");
    if (value !== previous) {
      const hasLocation = ["physical_division", "physical_column", "physical_volume"]
        .some((field) => Boolean(getValues(field as keyof DocumentFormValues)));
      if (hasLocation && !window.confirm("Al cambiar de estante se limpiarán división, columna y tomo. ¿Deseas continuar?")) return false;
      setValue("physical_shelf", value, { shouldDirty: true, shouldValidate: true });
      for (const field of ["physical_division", "physical_column", "physical_volume"] as const) {
        setValue(field, "", { shouldDirty: true });
      }
    }
    clearErrors("physical_shelf");
    return true;
  }

  function changeShelfMode(mode: "existing" | "new") {
    if (mode === shelfMode) return;
    if (changeShelf("")) setShelfMode(mode);
  }

  function requestClose() {
    if (isSubmitting || submittingRef.current) return;

    const message = uploadedDocumentId
      ? "El archivo ya se subió, pero falta completar sus datos. " +
        "Si cierras, el documento permanecerá en el listado. ¿Deseas cerrar?"
      : isDirty || file
        ? "Hay cambios sin guardar. ¿Deseas cerrar?"
        : null;

    if (message && !window.confirm(message)) return;
    onClose();
  }

  async function onSubmit(values: DocumentFormValues) {
    if (submittingRef.current || shelfLoading || shelfError) return;
    const shelf = values.physical_shelf.trim();
    if (shelfMode === "new" && !shelf) {
      setError("physical_shelf", { message: "Escribe el nombre del nuevo estante o selecciona Sin estante en Estante existente." });
      return;
    }
    if (shelfMode === "new" && shelfOptions.some((option) => option.trim().toLocaleLowerCase() === shelf.toLocaleLowerCase())) {
      setError("physical_shelf", { message: "Ese estante ya existe. Selecciónalo en Estante existente." });
      return;
    }
    setServerError(null);
    setFileError(null);

    if (isCreating && !uploadedDocumentId) {
      if (!file) {
        setFileError("Selecciona un archivo.");
        return;
      }

      if (!/\.(png|jpe?g|tiff?|bmp|pdf)$/i.test(file.name)) {
        setFileError("Selecciona un archivo PNG, JPG, TIFF, BMP o PDF.");
        return;
      }

      if (file.size === 0) {
        setFileError("El archivo está vacío.");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        setFileError("El archivo no puede superar 20 MiB.");
        return;
      }

    }

    const payload: DocumentUpdateInput = {
      title: values.title.trim(),
      description: values.description.trim(),
      doc_type: values.doc_type.trim(),
      physical_shelf: shelf || null,
      physical_division: values.physical_division.trim(),
      physical_column: values.physical_column.trim(),
      physical_volume: values.physical_volume.trim(),
      archived_year: values.archived_year ? Number(values.archived_year) : null,
      archived_month_start: values.archived_month_start
        ? Number(values.archived_month_start)
        : null,
      archived_month_end: values.archived_month_end
        ? Number(values.archived_month_end)
        : null,
    };

    let targetId = document?.id ?? uploadedDocumentId;
    let savedDocument: DocumentItem;
    submittingRef.current = true;

    try {

      if (!targetId) {
        if (!file) return;

        const form = new FormData();
        form.append("file", file);
        form.append("title", values.title.trim());

        const uploaded = await backend.documents.upload(form);

        targetId = uploaded.document_id;
        // Un reintento completará los metadatos sin volver a subir el archivo.
        setUploadedDocumentId(targetId);
      }
      savedDocument = await backend.documents.update(targetId, payload);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : "No se pudo guardar el documento.";

      setServerError(
        isCreating && targetId
          ? "El archivo ya se subió. No se pudieron guardar todos los datos: " +
            message + " Vuelve a guardar para completar este mismo documento."
          : message,
      );
      return;
    } finally {
      submittingRef.current = false;
    }
    onSaved(savedDocument);
  }

  return (
    <Modal
      open={open}
      title={isCreating ? "Subir documento" : "Editar documento"}
      description={isCreating ? "Selecciona el archivo y completa sus datos." : document?.title}
      onClose={requestClose}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={isSubmitting} className="min-w-0 space-y-6 border-0 p-4 sm:p-6">
          {serverError && (
            <div role="alert" className="rounded-2xl bg-error-container px-4 py-3 text-sm text-error">
              {serverError}
            </div>
          )}
          {isCreating && (
            <FormSection title="Archivo">
              {uploadedDocumentId ? (
                <p role="status" className="text-sm text-on-surface-variant">
                  El archivo ya está subido. Al guardar se completarán los datos
                  de este mismo documento.
                </p>
              ) : (
                <FormField
                  id="document-file"
                  label="Archivo"
                  required
                  error={fileError ?? undefined}
                  hint="PNG, JPG, JPEG, TIF, TIFF, BMP o PDF. Máximo 20 MiB."
                >
                  <input
                    id="document-file"
                    type="file"
                    accept=".png,.jpg,.jpeg,.tif,.tiff,.bmp,.pdf"
                    required
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setFileError(null);
                    }}
                    className={formControlClass}
                    aria-invalid={Boolean(fileError)}
                  />
                </FormField>
              )}
            </FormSection>
          )}

          <FormSection title="Información documental">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                id="document-title"
                label="Título"
                required
                error={errors.title?.message}
                className="md:col-span-2"
              >
                <input
                  id="document-title"
                  {...register("title")}
                  className={formControlClass}
                  aria-invalid={Boolean(errors.title)}
                />
              </FormField>

              <FormField
                id="document-type"
                label="Tipo documental"
                error={errors.doc_type?.message}
              >
                <input
                  id="document-type"
                  {...register("doc_type")}
                  placeholder="Ej: Acta de defensa"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.doc_type)}
                />
              </FormField>

              <FormField
                id="document-description"
                label="Descripción"
                className="md:col-span-2"
              >
                <textarea
                  id="document-description"
                  {...register("description")}
                  rows={3}
                  className={`${formControlClass} resize-y`}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Ubicación física"
            description="Ubicación del documento dentro del archivo físico institucional."
            separated
          >
            <fieldset className="mb-4 space-y-3">
              <legend className="mb-2 text-sm font-medium text-on-surface">Estante</legend>
              <div className="flex flex-wrap gap-4">
                {([
                  { value: "existing", label: "Estante existente" },
                  { value: "new", label: "Nuevo estante" },
                ] as const).map((mode) => (
                  <label key={mode.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-on-surface">
                    <input type="radio" name="shelf-mode" value={mode.value}
                      checked={shelfMode === mode.value} onChange={() => changeShelfMode(mode.value)}
                      className="h-4 w-4 accent-primary" />
                    {mode.label}
                  </label>
                ))}
              </div>
              {shelfError && (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-error">
                  <span>{shelfError}</span>
                  <button type="button" onClick={() => setShelfAttempt((value) => value + 1)}
                    className="min-h-11 rounded-xl px-3 font-medium underline">Reintentar</button>
                </div>
              )}
              <FormField id="physical-shelf" label={shelfMode === "existing" ? "Seleccionar estante" : "Nombre del nuevo estante"}
                error={errors.physical_shelf?.message}
                hint={shelfLoading ? "Cargando estantes…" : shelfMode === "existing"
                  ? "Selecciona un estante de la lista. La ubicación es opcional."
                  : "El estante aparecerá en Archivo al guardar el documento."}>
                {shelfMode === "existing" ? (
                  <ShelfListbox id="physical-shelf" value={selectedShelf} options={shelfOptions}
                    disabled={shelfLoading || Boolean(shelfError)}
                    onChange={changeShelf} invalid={Boolean(errors.physical_shelf)} />
                ) : (
                  <input id="physical-shelf" {...registerLocation("physical_shelf")} autoCapitalize="characters" maxLength={50}
                    placeholder="Ej: E-03" className={formControlClass}
                    aria-invalid={Boolean(errors.physical_shelf)} />
                )}
              </FormField>
              {!shelfLoading && !shelfError && shelfOptions.length === 0 && shelfMode === "existing" && (
                <p className="text-xs text-on-surface-variant">No hay estantes disponibles. Puedes elegir Nuevo estante.</p>
              )}
            </fieldset>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField id="physical-division" label="División" error={errors.physical_division?.message}>
                <input id="physical-division" {...registerLocation("physical_division")} autoCapitalize="characters" placeholder="Ej: B-02" className={formControlClass} />
              </FormField>
              <FormField id="physical-column" label="Columna" error={errors.physical_column?.message}>
                <input id="physical-column" {...registerLocation("physical_column")} autoCapitalize="characters" placeholder="Ej: C-01" className={formControlClass} />
              </FormField>
              <FormField id="physical-volume" label="Tomo" error={errors.physical_volume?.message}>
                <input id="physical-volume" {...registerLocation("physical_volume")} autoCapitalize="characters" placeholder="Ej: T-01" className={formControlClass} />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Período archivado"
            description="Período cubierto por el contenido, diferente de la fecha de registro."
            separated
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                id="archived-year"
                label="Año"
                
                error={errors.archived_year?.message}
              >
                <input
                  id="archived-year"
                  {...register("archived_year")}
                  
                  inputMode="numeric"
                  placeholder="2026"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.archived_year)}
                />
              </FormField>
              <FormField id="archived-month-start" label="Mes inicial">
                <select id="archived-month-start" {...register("archived_month_start")} className={formControlClass}>
                  <MonthOptions allowEmpty />
                </select>
              </FormField>
              <FormField id="archived-month-end" label="Mes final" error={errors.archived_month_end?.message}>
                <select
                  id="archived-month-end"
                  {...register("archived_month_end")}
                  className={formControlClass}
                  aria-invalid={Boolean(errors.archived_month_end)}
                >
                  <MonthOptions allowEmpty />
                </select>
              </FormField>
            </div>
          </FormSection>
        </fieldset>
        <FormActions
          submitLabel={uploadedDocumentId ? "Completar datos" : isCreating ? "Subir documento" : "Guardar cambios"}
          submittingLabel={isCreating ? "Guardando documento..." : "Guardando cambios..."}
          isSubmitting={isSubmitting}
          submitDisabled={shelfLoading || Boolean(shelfError) || (!isCreating && !isDirty)}
          onCancel={requestClose}
        />
      </form>
    </Modal>
  );
}

