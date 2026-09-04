"use client";

import { useEffect, useState } from "react";

import { FormActions } from "@/components/ui/FormActions";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { ROLE_LABEL, type ManageableRole, type User } from "@/lib/types";

type UserRoleModalProps = {
  open: boolean;
  target: User | null;
  onClose: () => void;
  onSaved: (user: User) => void;
};

export function UserRoleModal({
  open,
  target,
  onClose,
  onSaved,
}: UserRoleModalProps) {
  const [role, setRole] = useState<ManageableRole>("student");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setRole(target.role === "admin" ? "admin" : "student");
    setError(null);
  }, [target]);

  if (!target) return null;

  function requestClose() {
    if (!saving) onClose();
  }

  async function save() {
    if (!target) return;
    setSaving(true);
    setError(null);

    try {
      const updated = await backend.auth.updateUser(target.id, { role });
      onSaved(updated);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No se pudo cambiar el rol",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Cambiar rol"
      description={target.full_name}
      onClose={requestClose}
      maxWidth="max-w-lg"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="space-y-5 p-4 sm:p-6">
          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-error-container px-4 py-3 text-sm text-error"
            >
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Rol actual
            </p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {ROLE_LABEL[target.role]}
            </p>
          </div>

          <FormField id="new-user-role" label="Nuevo rol">
            <select
              id="new-user-role"
              value={role}
              onChange={(event) => setRole(event.target.value as ManageableRole)}
              className={formControlClass}
            >
              <option value="student">Estudiante</option>
              <option value="admin">Administrador</option>
            </select>
          </FormField>

          {role === "admin" && target.role !== "admin" && (
            <div className="rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm leading-relaxed text-on-surface">
              Este usuario podrá administrar estudiantes y consultar documentos institucionales.
            </div>
          )}
        </div>

        <FormActions
          submitLabel="Confirmar cambio"
          isSubmitting={saving}
          submitDisabled={role === target.role}
          onCancel={requestClose}
        />
      </form>
    </Modal>
  );
}
