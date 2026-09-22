"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserCreateModal } from "@/components/users/UserCreateModal";
import { UserPasswordModal } from "@/components/users/UserPasswordModal";
import { UserRoleModal } from "@/components/users/UserRoleModal";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { RoleBadge } from "@/components/users/RoleBadge";
import {
  canChangeRoles,
  canManageUsers,
  ROLE_DESCRIPTION,
  type Role,
  type User,
} from "@/lib/types";

const ROLE_ORDER: Role[] = ["student", "admin", "super_admin"];

export default function UsuariosPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await backend.auth.listUsers();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && canManageUsers(user.role)) void load();
    else setLoading(false);
  }, [user, load]);

  async function toggleActive(target: User) {
    setUpdatingUserId(target.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await backend.auth.updateUser(target.id, {
        is_active: !target.is_active,
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el usuario");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function revokeSessions(target: User) {
    const ok = window.confirm(
      `¿Cerrar todas las sesiones de ${target.full_name}? Tendrá que volver a iniciar sesión.`,
    );
    if (!ok) return;

    setRevokingUserId(target.id);
    setError(null);
    setNotice(null);
    try {
      await backend.auth.revokeSessions(target.id);
      setNotice(`Se cerraron las sesiones de ${target.full_name}.`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudieron cerrar las sesiones del usuario",
      );
    } finally {
      setRevokingUserId(null);
    }
  }

  if (authLoading && !user) {
    return <p className="text-sm text-on-surface-variant">Cargando sesión...</p>;
  }

  if (user && !canManageUsers(user.role)) {
    return (
      <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2">
        No tienes permiso para ver la administración de usuarios.
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-on-surface md:text-[28px]">
            Administración
          </h2>
          <p className="max-w-2xl text-sm text-on-surface-variant">
            Gestiona las cuentas y permisos de acceso al sistema.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!user}
          className="flex w-full shrink-0 min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <Icon name="person_add" className="text-lg" />
          Nuevo usuario
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {ROLE_ORDER.map((role) => (
          <div
            key={role}
            className="rounded-2xl border border-outline-variant bg-white p-4"
          >
            <RoleBadge role={role} />
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              {ROLE_DESCRIPTION[role]}
            </p>
          </div>
        ))}
      </div>

      {error && <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>}
      {notice && (
        <div className="mb-4 rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-on-surface">
          {notice}
        </div>
      )}

      <div className="min-w-0 max-w-full bg-white rounded-2xl border border-outline-variant">
        {loading ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">Cargando usuarios...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">No hay usuarios en tu alcance.</div>
        ) : (
          <div
            className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"
            role="region"
            aria-label="Listado de usuarios; desplázate horizontalmente para ver todas las columnas"
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant text-[11px] text-on-surface-variant uppercase tracking-wider bg-surface-container">
                  <th className="py-3 px-4 font-medium">Nombre</th>
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Rol</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-outline-variant hover:bg-surface-container">
                    <td className="max-w-xs break-words py-3 px-4 font-medium">{item.full_name}</td>
                    <td className="max-w-xs break-words py-3 px-4 text-on-surface-variant">{item.email}</td>
                    <td className="py-3 px-4">
                      <RoleBadge role={item.role} />
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {item.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2 [&_button]:max-xl:min-h-11">
                        {user && canChangeRoles(user.role) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setRoleTarget(item)}
                              className="rounded-2xl border border-outline-variant px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-container"
                            >
                              Cambiar rol
                            </button>
                            <button
                              type="button"
                              onClick={() => setPasswordTarget(item)}
                              className="rounded-2xl border border-outline-variant px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-container"
                            >
                              Resetear clave
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => void revokeSessions(item)}
                          disabled={revokingUserId === item.id}
                          className="rounded-2xl border border-outline-variant px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {revokingUserId === item.id ? "Cerrando..." : "Cerrar sesiones"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleActive(item)}
                          disabled={updatingUserId === item.id}
                          className="rounded-2xl border border-outline-variant px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingUserId === item.id
                            ? "Guardando..."
                            : item.is_active
                              ? "Desactivar"
                              : "Reactivar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {user && (
        <UserCreateModal
          open={createOpen}
          currentUserRole={user.role}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setItems((current) => [created, ...current]);
            setCreateOpen(false);
          }}
        />
      )}

      <UserRoleModal
        open={roleTarget !== null}
        target={roleTarget}
        onClose={() => setRoleTarget(null)}
        onSaved={(updated) => {
          setItems((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
          setRoleTarget(null);
        }}
      />

      <UserPasswordModal
        open={passwordTarget !== null}
        target={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onSaved={() => {
          setNotice(
            passwordTarget
              ? `Contraseña actualizada para ${passwordTarget.full_name}. Sus sesiones quedaron cerradas.`
              : "Contraseña actualizada.",
          );
          setPasswordTarget(null);
        }}
      />
    </>
  );
}
