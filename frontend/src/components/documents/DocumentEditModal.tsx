"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormActions } from "@/components/ui/FormActions";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { MonthOptions } from "@/components/ui/MonthOptions";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { loadFolderTree, type FolderOption } from "@/lib/folder-options";
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
    folder_id: z.string(),
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
    folder_id: document?.folder_id ?? "",
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
  ownerId,
  onClose,
  onSaved,
}: DocumentEditModalProps) {
  const isCreating = document === null;
  const folderOwnerId = document?.user_id ?? ownerId;

  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [folderLoading, setFolderLoading] = useState(true);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: getDefaultValues(document),
  });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    reset(getDefaultValues(document));
    setServerError(null);
    setFolderError(null);
    setFile(null);
    setFileError(null);
    setUploadedDocumentId(null);
    setFolders([]);
    setFolderLoading(true);

    loadFolderTree(folderOwnerId)
      .then((options) => {
        if (!cancelled) setFolders(options);
      })
      .catch(() => {
        if (!cancelled) {
          setFolderError("No se pudieron cargar las carpetas. Cierra y vuelve a abrir el formulario.");
        }
      })
      .finally(() => {
        if (!cancelled) setFolderLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, document, folderOwnerId, reset]);


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
    if (submittingRef.current || folderLoading || folderError) return;
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
      folder_id: values.folder_id || null,
      physical_shelf: values.physical_shelf.trim(),
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
          {(folderError || serverError) && (
            <div role="alert" className="rounded-2xl bg-error-container px-4 py-3 text-sm text-error">
              {folderError || serverError}
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
                id="document-folder"
                label="Carpeta"
                hint={folderLoading ? "Cargando carpetas..." : undefined}
              >
                <select
                  id="document-folder"
                  {...register("folder_id")}
                  disabled={folderLoading}
                  className={formControlClass}
                >
                  <option value="">Sin carpeta</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                  {document?.folder_id && !folders.some((folder) => folder.id === document.folder_id) && 
                  (
                    <option value={document.folder_id}>Carpeta actual</option>
                  )}
                </select>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormField id="physical-shelf" label="Estante" error={errors.physical_shelf?.message}>
                <input id="physical-shelf" {...register("physical_shelf")} placeholder="Ej: E-03" className={formControlClass} />
              </FormField>
              <FormField id="physical-division" label="División" error={errors.physical_division?.message}>
                <input id="physical-division" {...register("physical_division")} placeholder="Ej: B-02" className={formControlClass} />
              </FormField>
              <FormField id="physical-column" label="Columna" error={errors.physical_column?.message}>
                <input id="physical-column" {...register("physical_column")} placeholder="Ej: C-01" className={formControlClass} />
              </FormField>
              <FormField id="physical-volume" label="Tomo" error={errors.physical_volume?.message}>
                <input id="physical-volume" {...register("physical_volume")} placeholder="Ej: T-01" className={formControlClass} />
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
          submitDisabled={folderLoading || Boolean(folderError) || (!isCreating && !isDirty)}
          onCancel={requestClose}
        />
      </form>
    </Modal>
  );
}

