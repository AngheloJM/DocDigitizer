"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { DocumentItem } from "@/lib/types";

function DocumentosContent() {
  const params = useSearchParams();
  const router = useRouter();
  const openUpload = params.get("upload") === "1";
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(openUpload);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await backend.documents.list();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const pending = items.filter((item) => ["pending", "processing", "reprocessing"].includes(item.status));
    if (pending.length === 0) return;
    const timer = window.setInterval(async () => {
      try {
        const updates = await Promise.all(pending.map((item) => backend.documents.status(item.id)));
        setItems((current) =>
          current.map((item) => {
            const index = pending.findIndex((row) => row.id === item.id);
            if (index < 0) return item;
            return { ...item, status: updates[index].status, processed_at: updates[index].processed_at };
          }),
        );
      } catch {
        /* ignore polling errors */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [items]);

  async function onUpload(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim()) return;
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    try {
      await backend.documents.upload(form);
      setTitle("");
      setFile(null);
      setUploading(false);
      router.replace("/documentos");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir el documento");
    }
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 items-start justify-between mb-12">
        <div>
          <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">Documentos</h2>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Sube un archivo para digitalizarlo (OCR + PDF/A). Formatos: png, jpg, jpeg, tiff, bmp, pdf. Máximo 20 MB.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploading((value) => !value)}
          className="bg-primary text-white text-sm font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 hover:bg-primary-light transition-colors whitespace-nowrap shadow-sm"
        >
          <Icon name="upload" className="text-lg" /> Subir documento
        </button>
      </div>

      {uploading && (
        <form onSubmit={onUpload} className="bg-white rounded-xl p-5 border border-gray-200 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-on-surface">Carga en un paso</h3>
          <p className="text-xs text-on-surface-variant">
            Si el PDF tiene varias páginas, solo se procesa la primera. El resto no se digitaliza todavía.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">Título</label>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">Archivo</label>
            <input
              required
              type="file"
              accept=".png,.jpg,.jpeg,.tiff,.bmp,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-primary text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-primary-light">
              Subir
            </button>
            <button type="button" onClick={() => setUploading(false)} className="border border-gray-200 text-sm py-2 px-4 rounded-lg">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <div className="bg-error-container text-error text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-on-surface">Listado</h3>
        </div>
        {loading ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">Cargando documentos...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">No hay documentos todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] text-on-surface-variant uppercase tracking-wider bg-gray-50/50">
                  <th className="py-3 px-4 font-medium">Título</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 font-medium">{doc.title}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {doc.status === "completed" ? (
                        <a
                          href={backend.documents.downloadUrl(doc.id)}
                          className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-primary/5 inline-flex"
                          title="Descargar"
                        >
                          <Icon name="download" className="text-lg" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-on-surface-variant">—</span>
                      )}
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

export default function DocumentosPage() {
  return (
    <Suspense fallback={<p className="text-sm text-on-surface-variant">Cargando documentos...</p>}>
      <DocumentosContent />
    </Suspense>
  );
}
