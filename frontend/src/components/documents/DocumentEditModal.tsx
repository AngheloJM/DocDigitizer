"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormActions } from "@/components/ui/FormActions";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { FormSection } from "@/components/ui/FormSection";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { DocumentItem, DocumentUpdateInput, Folder } from "@/lib/types";

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

type FolderOption = {
  id: string;
  label: string;
};

type DocumentEditModalProps = {
  open: boolean;
  document: DocumentItem | null;
  onClose: () => void;
  onSaved: (document: DocumentItem) => void;
};

function getDefaultValues(document: DocumentItem): DocumentFormValues {
  return {
    title: document.title,
    description: document.description ?? "",
    doc_type: document.doc_type ?? "",
    folder_id: document.folder_id ?? "",
    physical_shelf: document.physical_shelf ?? "",
    physical_division: document.physical_division ?? "",
    physical_column: document.physical_column ?? "",
    physical_volume: document.physical_volume ?? "",
    archived_year: document.archived_year ? String(document.archived_year) : "",
    archived_month_start: document.archived_month_start
      ? String(document.archived_month_start)
      : "",
    archived_month_end: document.archived_month_end
      ? String(document.archived_month_end)
      : "",
  };
}

async function loadFolderTree(ownerId: string): Promise<FolderOption[]> {
  async function visit(parentId: string | null, depth: number): Promise<FolderOption[]> {
    const folders = await backend.folders.list(parentId, ownerId);
    const branches = await Promise.all(
      folders.map(async (folder: Folder) => {
        const current: FolderOption = {
          id: folder.id,
          label: `${"— ".repeat(depth)}${folder.name}`,
        };
        const children = await visit(folder.id, depth + 1);
        return [current, ...children];
      }),
    );

    return branches.flat();
  }

  return visit(null, 0);
}

export function DocumentEditModal({
  open,
  document,
  onClose,
  onSaved,
}: DocumentEditModalProps) {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
  });

  useEffect(() => {
    if (!open || !document) return;

    let cancelled = false;
    reset(getDefaultValues(document));
    setServerError(null);
    setFolders([]);
    setFolderLoading(true);

    loadFolderTree(document.user_id)
      .then((options) => {
        if (!cancelled) setFolders(options);
      })
      .catch(() => {
        if (!cancelled) {
          setServerError("No se pudieron cargar las carpetas disponibles.");
        }
      })
      .finally(() => {
        if (!cancelled) setFolderLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, document, reset]);

  if (!document) return null;

  function requestClose() {
    if (isSubmitting) return;
    if (isDirty && !window.confirm("Hay cambios sin guardar. ¿Deseas cerrar?")) return;
    onClose();
  }

  async function onSubmit(values: DocumentFormValues) {
    if (!document) return;
    setServerError(null);

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

    try {
      const updated = await backend.documents.update(document.id, payload);
      onSaved(updated);
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : "No se pudo actualizar el documento",
      );
    }
  }

  return (
    <Modal
      open={open}
      title="Editar documento"
      description={document.title}
      onClose={requestClose}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6 p-4 sm:p-6">
          {serverError && (
            <div
              role="alert"
              className="rounded-2xl bg-error-container px-4 py-3 text-sm text-error"
            >
              {serverError}
            </div>
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
                  <option value="" disabled={Boolean(document.folder_id)}>
                    {document.folder_id ? "Selecciona una carpeta" : "Sin carpeta"}
                  </option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
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
              <FormField id="physical-shelf" label="Estante">
                <input id="physical-shelf" {...register("physical_shelf")} placeholder="Ej: E-03" className={formControlClass} />
              </FormField>
              <FormField id="physical-division" label="División">
                <input id="physical-division" {...register("physical_division")} placeholder="Ej: B-02" className={formControlClass} />
              </FormField>
              <FormField id="physical-column" label="Columna">
                <input id="physical-column" {...register("physical_column")} placeholder="Ej: C-01" className={formControlClass} />
              </FormField>
              <FormField id="physical-volume" label="Tomo">
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
                required={document.archived_year !== null}
                error={errors.archived_year?.message}
              >
                <input
                  id="archived-year"
                  {...register("archived_year")}
                  required={document.archived_year !== null}
                  inputMode="numeric"
                  placeholder="2026"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.archived_year)}
                />
              </FormField>
              <FormField id="archived-month-start" label="Mes inicial">
                <select id="archived-month-start" {...register("archived_month_start")} className={formControlClass}>
                  <MonthOptions allowEmpty={document.archived_month_start === null} />
                </select>
              </FormField>
              <FormField id="archived-month-end" label="Mes final" error={errors.archived_month_end?.message}>
                <select
                  id="archived-month-end"
                  {...register("archived_month_end")}
                  className={formControlClass}
                  aria-invalid={Boolean(errors.archived_month_end)}
                >
                  <MonthOptions allowEmpty={document.archived_month_end === null} />
                </select>
              </FormField>
            </div>
          </FormSection>
        </div>

        <FormActions submitLabel="Guardar cambios" isSubmitting={isSubmitting} submitDisabled={!isDirty} onCancel={requestClose} />
      </form>
    </Modal>
  );
}

function MonthOptions({ allowEmpty }: { allowEmpty: boolean }) {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  return (
    <>
      <option value="" disabled={!allowEmpty}>Sin especificar</option>
      {months.map((month, index) => (
        <option key={month} value={index + 1}>{month}</option>
      ))}
    </>
  );
}
