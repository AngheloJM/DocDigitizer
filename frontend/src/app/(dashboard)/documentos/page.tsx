"use client";

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { Pagina } from "@/components/ui/paginacion";
import {
  formatArchivedPeriod,
  formatPhysicalLocation,
  needsScanUpload,
  type DocumentItem,
} from "@/lib/types";

const YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
const PAGI_SIZE = 10;

function DocumentosContent() {
  const params = useSearchParams();
  const router = useRouter();
  const openUpload = params.get("upload") === "1";
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(openUpload);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [yearFilter, setYearFilter] = useState<string>("");
  const [shelfFilter, setShelfFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scanDocId, setScanDocId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await backend.documents.list({
        page: pagina,
        perPage: PAGI_SIZE,
        archivedYear: yearFilter
          ? Number(yearFilter)
          : null,
        physicalShelf: shelfFilter.trim() || null,
        statusFilter: statusFilter || null,
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPaginas(data.pages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  }, [pagina, yearFilter, shelfFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const pending = items.filter((item) =>
      ["pending", "processing", "reprocessing"].includes(item.status),
    );
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
      if (pagina === 1) {await load();}else{setPagina(1);}
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir el documento");
    }
  }

  function openScanPicker(docId: string) {
    setScanDocId(docId);
    setError(null);
    scanInputRef.current?.click();
  }

  async function onScanSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selected || !scanDocId) return;
    setScanBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", selected);
    try {
      await backend.documents.uploadToExisting(scanDocId, form);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 409
            ? "Este documento ya tiene un archivo adjunto."
            : err.message
          : "No se pudo subir el escaneo",
      );
    } finally {
      setScanBusy(false);
      setScanDocId(null);
    }
  }

  return (
    <>
      <input
        ref={scanInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.tiff,.bmp,.pdf"
        className="hidden"
        onChange={(event) => void onScanSelected(event)}
      />

      <div className="flex flex-col lg:flex-row gap-6 items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">
            Documentos
          </h2>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Listado del archivo con ubicación física y período. Los pendientes sin escaneo pueden
            recibir el archivo después.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploading((value) => !value)}
          className="bg-primary text-white text-sm font-medium py-2.5 px-4 rounded-2xl flex items-center gap-2 hover:bg-primary-light transition-colors whitespace-nowrap shadow-sm"
        >
          <Icon name="upload" className="text-lg" /> Subir documento
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-outline-variant mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Año archivado
          </label>
          <select
            value={yearFilter}
            onChange={(event) => {setYearFilter(event.target.value); setPagina(1);}}
            className="w-full border border-outline-variant rounded-2xl bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">Todos</option>
            {YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Estante
          </label>
          <input
            value={shelfFilter}
            onChange={(event) => {setShelfFilter(event.target.value); setPagina(1);}}
            placeholder="Ej: A1"
            className="w-full border border-outline-variant rounded-2xl bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Estado
          </label>
          <select
            value={statusFilter}
            onChange={(event) => {setStatusFilter(event.target.value); setPagina(1);}}
            className="w-full border border-outline-variant rounded-2xl bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="processing">Procesando</option>
            <option value="completed">Completado</option>
            <option value="failed">Fallido</option>
          </select>
        </div>
      </div>

      {uploading && (
        <form
          onSubmit={onUpload}
          className="bg-white rounded-2xl p-5 border border-outline-variant mb-6 space-y-4"
        >
          <h3 className="text-sm font-semibold text-on-surface">Carga en un paso</h3>
          <p className="text-xs text-on-surface-variant">
            Si el PDF tiene varias páginas, solo se procesa la primera.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
              Título
            </label>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full border border-outline-variant rounded-2xl bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
              Archivo
            </label>
            <input
              required
              type="file"
              accept=".png,.jpg,.jpeg,.tiff,.bmp,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-primary text-white text-sm font-medium py-2 px-4 rounded-2xl hover:bg-primary-light"
            >
              Subir
            </button>
            <button
              type="button"
              onClick={() => setUploading(false)}
              className="border border-outline-variant text-sm py-2 px-4 rounded-2xl"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>
      )}
      {scanBusy && (
        <p className="text-sm text-on-surface-variant mb-4">Subiendo escaneo...</p>
      )}

      <div className="bg-white rounded-2xl border border-outline-variant">
        <div className="p-4 border-b border-outline-variant flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Listado</h3>
          <p className="text-xs text-on-surface-variant">{total} documento{total === 1 ? "" : "s"}</p>
        </div>
        {loading ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">Cargando documentos...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">
            No hay documentos con estos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-outline-variant text-[11px] text-on-surface-variant uppercase tracking-wider bg-surface-container">
                  <th className="py-3 px-4 font-medium">Título</th>
                  <th className="py-3 px-4 font-medium">Período</th>
                  <th className="py-3 px-4 font-medium">Ubicación</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-outline-variant hover:bg-surface-container transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-on-surface">{doc.title}</p>
                      {doc.doc_type && (
                        <p className="text-xs text-on-surface-variant mt-0.5">{doc.doc_type}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant whitespace-nowrap">
                      {formatArchivedPeriod(doc)}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant text-xs max-w-[220px]">
                      {formatPhysicalLocation(doc)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        {needsScanUpload(doc.status) && (
                          <button
                            type="button"
                            onClick={() => openScanPicker(doc.id)}
                            disabled={scanBusy}
                            className="text-primary hover:bg-primary/5 p-1.5 rounded-2xl inline-flex"
                            title="Subir escaneo"
                          >
                            <Icon name="upload_file" className="text-lg" />
                          </button>
                        )}
                        {doc.status === "completed" ? (
                          <a
                            href={backend.documents.downloadUrl(doc.id)}
                            className="text-on-surface-variant hover:text-primary p-1.5 rounded-2xl hover:bg-primary/5 inline-flex"
                            title="Descargar"
                          >
                            <Icon name="download" className="text-lg" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && items.length > 0 && totalPaginas > 1 && (
          <div className="border-t border-outline-variant p-4"
          >
            <Pagina
            PaginaActual={pagina}
            TotalPaginas={totalPaginas}
            disabled={loading}
            cambioPagina={(selectionPage)=> {
              setPagina(selectionPage);
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            
            />
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

// modificaiones mias: dividir la lista por paginas = alexd