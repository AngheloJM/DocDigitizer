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
import type { ManageableRole, Role, User, UserCreateInput } from "@/lib/types";

const userSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, "El nombre es obligatorio")
      .max(150, "Máximo 150 caracteres"),
    email: z.string().trim().email("Ingresa un correo válido"),
    role: z.enum(["student", "admin"]),
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

type UserFormValues = z.infer<typeof userSchema>;

type UserCreateModalProps = {
  open: boolean;
  currentUserRole: Role;
  onClose: () => void;
  onCreated: (user: User) => void;
};

const emptyValues: UserFormValues = {
  full_name: "",
  email: "",
  role: "student",
  password: "",
  password_confirmation: "",
};

export function UserCreateModal({
  open,
  currentUserRole,
  onClose,
  onCreated,
}: UserCreateModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    reset(emptyValues);
    setServerError(null);
  }, [open, reset]);

  function requestClose() {
    if (isSubmitting) return;
    if (isDirty && !window.confirm("Hay información sin guardar. ¿Deseas cerrar?")) return;
    onClose();
  }

  async function onSubmit(values: UserFormValues) {
    setServerError(null);
    const role: ManageableRole = currentUserRole === "admin" ? "student" : values.role;
    const payload: UserCreateInput = {
      full_name: values.full_name.trim(),
      email: values.email.trim().toLowerCase(),
      password: values.password,
      role,
    };

    try {
      const created = await backend.auth.createUser(payload);
      onCreated(created);
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.status === 409
            ? "Ya existe una cuenta con este correo."
            : error.message
          : "No se pudo crear el usuario",
      );
    }
  }

  return (
    <Modal
      open={open}
      title="Crear usuario"
      description="Registra una cuenta para ingresar al sistema."
      onClose={requestClose}
      maxWidth="max-w-xl"
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

          <FormSection title="Datos personales">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="user-full-name"
                label="Nombre completo"
                required
                error={errors.full_name?.message}
                className="sm:col-span-2"
              >
                <input
                  id="user-full-name"
                  {...register("full_name")}
                  autoComplete="name"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.full_name)}
                />
              </FormField>

              <FormField
                id="user-email"
                label="Correo electrónico"
                required
                error={errors.email?.message}
                className="sm:col-span-2"
              >
                <input
                  id="user-email"
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@utepsa.edu"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.email)}
                />
              </FormField>

              <FormField id="user-role" label="Rol" className="sm:col-span-2">
                {currentUserRole === "super_admin" ? (
                  <select id="user-role" {...register("role")} className={formControlClass}>
                    <option value="student">Estudiante</option>
                    <option value="admin">Administrador</option>
                  </select>
                ) : (
                  <>
                    <input type="hidden" {...register("role")} />
                    <div
                      id="user-role"
                      className={`${formControlClass} bg-surface-container`}
                    >
                      Estudiante
                    </div>
                    <p className="mt-1.5 text-xs text-on-surface-variant">
                      Un administrador solamente puede crear estudiantes.
                    </p>
                  </>
                )}
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Credenciales"
            description="La contraseña debe tener entre 8 y 128 caracteres."
            separated
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="user-password"
                label="Contraseña"
                required
                error={errors.password?.message}
              >
                <input
                  id="user-password"
                  {...register("password")}
                  type="password"
                  autoComplete="new-password"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.password)}
                />
              </FormField>

              <FormField
                id="user-password-confirmation"
                label="Confirmar contraseña"
                required
                error={errors.password_confirmation?.message}
              >
                <input
                  id="user-password-confirmation"
                  {...register("password_confirmation")}
                  type="password"
                  autoComplete="new-password"
                  className={formControlClass}
                  aria-invalid={Boolean(errors.password_confirmation)}
                />
              </FormField>
            </div>
          </FormSection>
        </div>

        <FormActions
          submitLabel="Crear usuario"
          submittingLabel="Creando..."
          isSubmitting={isSubmitting}
          onCancel={requestClose}
        />
      </form>
    </Modal>
  );
}
