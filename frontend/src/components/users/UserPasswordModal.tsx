"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormActions } from "@/components/ui/FormActions";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { User } from "@/lib/types";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .max(128, "Máximo 128 caracteres"),
    password_confirmation: z.string(),
  })
  .refine((values) => values.password === values.password_confirmation, {
    path: ["password_confirmation"],
    message: "Las contraseñas no coinciden",
  });

type FormValues = z.infer<typeof schema>;

type UserPasswordModalProps = {
  open: boolean;
  target: User | null;
  onClose: () => void;
  onSaved: (user: User) => void;
};

export function UserPasswordModal({
  open,
  target,
  onClose,
  onSaved,
}: UserPasswordModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", password_confirmation: "" },
  });

  useEffect(() => {
    if (!open) return;
    reset({ password: "", password_confirmation: "" });
    setServerError(null);
  }, [open, target, reset]);

  if (!target) return null;

  function requestClose() {
    if (isSubmitting) return;
    if (isDirty && !window.confirm("Hay información sin guardar. ¿Deseas cerrar?")) return;
    onClose();
  }

  async function onSubmit(values: FormValues) {
    if (!target) return;
    setServerError(null);
    try {
      const updated = await backend.auth.updateUser(target.id, {
        password: values.password,
      });
      onSaved(updated);
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : "No se pudo resetear la contraseña",
      );
    }
  }

  return (
    <Modal
      open={open}
      title="Resetear contraseña"
      description={target.full_name}
      onClose={requestClose}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-5 p-4 sm:p-6">
          {serverError && (
            <div
              role="alert"
              className="rounded-2xl bg-error-container px-4 py-3 text-sm text-error"
            >
              {serverError}
            </div>
          )}

          <p className="text-sm text-on-surface-variant leading-relaxed">
            Se fijará una contraseña nueva y se cerrarán todas las sesiones activas de esta
            persona. Debes comunicarle la clave por otro medio.
          </p>

          <FormField
            id="reset-password"
            label="Nueva contraseña"
            required
            error={errors.password?.message}
          >
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
              className={formControlClass}
              aria-invalid={Boolean(errors.password)}
            />
          </FormField>

          <FormField
            id="reset-password-confirmation"
            label="Confirmar contraseña"
            required
            error={errors.password_confirmation?.message}
          >
            <input
              id="reset-password-confirmation"
              type="password"
              autoComplete="new-password"
              {...register("password_confirmation")}
              className={formControlClass}
              aria-invalid={Boolean(errors.password_confirmation)}
            />
          </FormField>
        </div>

        <FormActions
          submitLabel="Guardar contraseña"
          submittingLabel="Guardando..."
          isSubmitting={isSubmitting}
          onCancel={requestClose}
        />
      </form>
    </Modal>
  );
}
