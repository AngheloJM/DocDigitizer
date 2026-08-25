"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { isStaff, ROLE_LABEL, type Role, type User } from "@/lib/types";

export default function UsuariosPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
    try {
      await backend.auth.updateUser(target.id, { is_active: !target.is_active });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el usuario");
    }
  }

  if (user && !isStaff(user.role)) {
    return (
      <div className="bg-error-container text-error text-sm rounded-lg px-3 py-2">
        No tienes permiso para ver la administración de usuarios.
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">Administración</h2>
        <p className="text-sm text-on-surface-variant max-w-2xl">
          Gestiona usuarios existentes. Un admin solo ve estudiantes; un super_admin ve admin y student.
        </p>
      </div>

      {error && <div className="bg-error-container text-error text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">Cargando usuarios...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">No hay usuarios en tu alcance.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-on-surface-variant uppercase tracking-wider bg-gray-50/50">
                  <th className="py-3 px-4 font-medium">Nombre</th>
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Rol</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
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
                      <button
                        type="button"
                        onClick={() => void toggleActive(item)}
                        className="border border-gray-200 text-xs font-medium py-1.5 px-3 rounded-md hover:bg-gray-50"
                      >
                        {item.is_active ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
