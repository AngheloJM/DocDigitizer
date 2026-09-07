"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserCreateModal } from "@/components/users/UserCreateModal";
import { UserRoleModal } from "@/components/users/UserRoleModal";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { isStaff, ROLE_LABEL, type Role, type User } from "@/lib/types";

export default function UsuariosPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

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
    if (user && isStaff(user.role)) void load();
    else setLoading(false);
  }, [user, load]);

  async function toggleActive(target: User) {
    setUpdatingUserId(target.id);
    setError(null);
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

  if (authLoading && !user) {
    return <p className="text-sm text-on-surface-variant">Cargando sesión...</p>;
  }

  if (user && !isStaff(user.role)) {
    return (
      <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2">
        No tienes permiso para ver la administración de usuarios.
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
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
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <Icon name="person_add" className="text-lg" />
          Nuevo usuario
        </button>
      </div>

      {error && <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>}

      <div className="bg-white rounded-2xl border border-outline-variant">
        {loading ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">Cargando usuarios...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">No hay usuarios en tu alcance.</div>
        ) : (
          <div className="overflow-x-auto">
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
                    <td className="py-3 px-4 font-medium">{item.full_name}</td>
                    <td className="py-3 px-4 text-on-surface-variant">{item.email}</td>
                    <td className="py-3 px-4">{ROLE_LABEL[item.role as Role] ?? item.role}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {item.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {user?.role === "super_admin" && (
                          <button
                            type="button"
                            onClick={() => setRoleTarget(item)}
                            className="rounded-2xl border border-outline-variant px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-container"
                          >
                            Cambiar rol
                          </button>
                        )}

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
    </>
  );
}
