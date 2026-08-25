"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { DocumentItem, Folder } from "@/lib/types";

function CarpetasContent() {
  const params = useSearchParams();
  const router = useRouter();
  const parentId = params.get("parent_id");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await backend.folders.list(parentId);
      setFolders(data);
      if (parentId) {
        const docs = await backend.documents.list(1, 20, parentId);
        setDocuments(docs.items);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las carpetas");
    } finally {
      setLoading(false);
    }
  }, [parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    try {
      await backend.folders.create({
          name: name.trim(),
          description: description.trim() || null,
          parent_id: parentId,
        });
      setName("");
      setDescription("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la carpeta");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar esta carpeta?")) return;
    try {
      await backend.folders.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la carpeta");
    }
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 items-start justify-between mb-12">
        <div>
          <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">Carpetas</h2>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Organiza documentos en carpetas y subcarpetas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="bg-primary text-white text-sm font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 hover:bg-primary-light transition-colors whitespace-nowrap shadow-sm"
        >
          <Icon name="add" className="text-lg" /> Nueva carpeta
        </button>
      </div>

      {parentId && (
        <button
          type="button"
          onClick={() => router.push("/carpetas")}
          className="mb-4 text-sm text-primary hover:underline flex items-center gap-1"
        >
          <Icon name="arrow_back" className="text-base" /> Volver a carpetas raíz
        </button>
      )}

      {creating && (
        <form onSubmit={onCreate} className="bg-white rounded-xl p-5 border border-gray-200 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-on-surface">Crear carpeta</h3>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">Nombre</label>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
              Descripción
            </label>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-primary text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-primary-light">
              Guardar
            </button>
            <button type="button" onClick={() => setCreating(false)} className="border border-gray-200 text-sm py-2 px-4 rounded-lg">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <div className="bg-error-container text-error text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Cargando carpetas...</p>
      ) : folders.length === 0 && documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-on-surface-variant">
          {parentId ? "Esta carpeta está vacía." : "No hay carpetas todavía. Crea la primera para empezar."}
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <div key={folder.id} className="bg-white rounded-xl p-5 border border-gray-200 flex flex-col gap-3">
              <button type="button" className="text-left" onClick={() => router.push(`/carpetas?parent_id=${folder.id}`)}>
                <div className="w-10 h-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center mb-3">
                  <Icon name="folder" className="text-xl" />
                </div>
                <h3 className="font-medium text-on-surface">{folder.name}</h3>
                <p className="text-xs text-on-surface-variant mt-1">{folder.description || "Sin descripción"}</p>
              </button>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void onDelete(folder.id)}
                  className="text-on-surface-variant hover:text-red-600 p-1.5 rounded-md hover:bg-red-50"
                  title="Eliminar"
                >
                  <Icon name="delete" className="text-lg" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {parentId && documents.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 mt-6">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-on-surface">Documentos de esta carpeta</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{doc.title}</p>
                    <StatusBadge status={doc.status} />
                  </div>
                  {doc.status === "completed" && (
                    <a href={backend.documents.downloadUrl(doc.id)} className="text-primary text-sm">
                      Descargar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
      )}
    </>
  );
}

export default function CarpetasPage() {
  return (
    <Suspense fallback={<p className="text-sm text-on-surface-variant">Cargando carpetas...</p>}>
      <CarpetasContent />
    </Suspense>
  );
}
