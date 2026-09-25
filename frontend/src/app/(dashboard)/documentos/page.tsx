"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DocumentRecoveryActions } from "@/components/documents/DocumentRecoveryActions";
import { DocumentEditModal } from "@/components/documents/DocumentEditModal";
import { useAuth } from "@/components/providers/AuthProvider";
import { FailureReason } from "@/components/ui/FailureReason";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagina } from "@/components/ui/paginacion";
import { FormField, formControlClass } from "@/components/ui/FormField";
import { MonthOptions } from "@/components/ui/MonthOptions";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import {
  canAssignDocuments,
  canEditDocument,
  formatArchivedPeriod,
  formatPhysicalLocation,
  isStaff,
  type DocumentItem,
  type User,
} from "@/lib/types";

const YEAR_OPTIONS = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
const PAGI_SIZE = 10;

function DocumentosContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const openUpload = params.get("upload") === "1";
  const initialQuery = params.get("q")?.trim() ?? "";
  const staff = Boolean(user && isStaff(user.role));
  const canAssign = Boolean(user && canAssignDocuments(user.role));

  const [items, setItems] = useState<DocumentItem[]>([]);
  const [view, setView] = useState<"table" | "grid">("table");
  const [showTrash, setShowTrash] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(openUpload);
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);

  const [yearFilter, setYearFilter] = useState("");
  const [monthFromFilter, setMonthFromFilter] = useState("");
  const [monthToFilter, setMonthToFilter] = useState("");
  const [shelfFilter, setShelfFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "mine">("all");
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [scanDocId, setScanDocId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanBusyRef = useRef(false);
  const reprocessingRef = useRef(new Set<string>());
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const [editingDocument, setEditingDocument] = useState<DocumentItem | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const listRequestRef = useRef(0);

  useEffect(() => {
    if (!openUpload) return;
    setEditingDocument(null);
    setUploading(true);
    router.replace("/documentos", { scroll: false });
  }, [openUpload, router]);

  const usersById = useMemo(() => {
    const map = new Map<string, User>();
    for (const row of users) map.set(row.id, row);
    return map;
  }, [users]);

  const loadUsers = useCallback(async () => {
    if (!staff) return;
    try {
      const data = await backend.auth.listUsers(1, 100);
      setUsers(data.items.filter((row) => row.is_active));
    } catch {
      /* staff puede seguir sin el selector si falla */
    }
  }, [staff]);

  const load = useCallback(async () => {
    if (!user) return;
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      if (searchQuery.trim() && !showTrash) {
        const data = await backend.search({
          q: searchQuery.trim(),
          page: pagina,
          perPage: PAGI_SIZE,
        });
        if (requestId !== listRequestRef.current) return;
        setItems(data.items.map((row) => row.document));
        setTotal(data.total);
        setTotalPaginas(data.pages);
        return;
      }

      const data = await backend.documents.list({
        page: pagina,
        perPage: PAGI_SIZE,
        archivedYear: yearFilter ? Number(yearFilter) : null,
        archivedMonthFrom: monthFromFilter ? Number(monthFromFilter) : null,
        archivedMonthTo: monthToFilter ? Number(monthToFilter) : null,
        physicalShelf: shelfFilter.trim() || null,
        statusFilter: statusFilter || null,
        assignedToId: assignmentFilter === "mine" ? user.id : null,
        includeDeleted: showTrash,
      });

      if (requestId !== listRequestRef.current) return;
      setItems(data.items);
      setTotal(data.total);
      setTotalPaginas(data.pages);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los documentos");
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, [user, pagina, yearFilter, monthFromFilter, monthToFilter, shelfFilter, statusFilter, assignmentFilter, showTrash, searchQuery]);

  function applySearch(event?: FormEvent) {
    event?.preventDefault();
    const next = searchInput.trim();
    setShowTrash(false);
    setPagina(1);
    setSearchQuery(next);
    const url = next ? `/documentos?q=${encodeURIComponent(next)}` : "/documentos";
    router.replace(url);
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setPagina(1);
    router.replace("/documentos");
  }

  useEffect(() => {
    const nextQuery = params.get("q")?.trim() ?? "";
    setSearchInput(nextQuery);
    setSearchQuery(nextQuery);
  }, [params]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void load();
    return () => { listRequestRef.current += 1; };
  }, [load]);

  useEffect(() => {
    if (showTrash) return;
    const pending = items.filter((item) =>
      ["pending", "processing", "reprocessing"].includes(item.status),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const updates = await Promise.all(pending.map((item) => backend.documents.status(item.id)));
        if (cancelled) return;
        setItems((current) =>
          current.map((item) => {
            const index = pending.findIndex((row) => row.id === item.id);
            if (index < 0) return item;
            return {
              ...item,
              status: updates[index].status,
              processed_at: updates[index].processed_at,
              error_message: updates[index].error_message,
            };
          }),
        );
      } catch {
        /* ignore polling errors */
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [items, showTrash]);


  function openScanPicker(docId: string) {
    setScanDocId(docId);
    setError(null);
    scanInputRef.current?.click();
  }

  async function onScanSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selected || !scanDocId || scanBusyRef.current) return;
    scanBusyRef.current = true;
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
      scanBusyRef.current = false;
      setScanBusy(false);
      setScanDocId(null);
    }
  }

  function canEdit(document: DocumentItem) {
    if (!user) return false;
    return canEditDocument(user.role, user.id, document);
  }

  function handleDocumentSaved() {
    const wasCreating = uploading;
    setUploading(false);
    setEditingDocument(null);

    if (wasCreating && pagina !== 1) {
      setPagina(1);
      return;
    }
    void load();
  }

  function handleDocumentModalClose() {
    setUploading(false);
    setEditingDocument(null);
    void load();
  }

  async function onAssign(docId: string, assignedToId: string) {
    if (!assignedToId) return;
    setAssigningId(docId);
    setError(null);
    try {
      const updated = await backend.documents.update(docId, { assigned_to_id: assignedToId });
      setItems((current) => current.map((doc) => (doc.id === docId ? { ...doc, ...updated } : doc)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo asignar el documento");
    } finally {
      setAssigningId(null);
    }
  }
  async function onReprocess(docId: string) {
    if (reprocessingRef.current.has(docId)) return;
    reprocessingRef.current.add(docId);
    setReprocessingIds(new Set(reprocessingRef.current));
    setError(null);
    try {
      const result = await backend.documents.reprocess(docId);
      setItems((current) => current.map((doc) => doc.id === docId
        ? { ...doc, status: result.status, error_message: null, processed_at: null }
        : doc));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reprocesar el documento");
    } finally {
      reprocessingRef.current.delete(docId);
      setReprocessingIds(new Set(reprocessingRef.current));
    }
  }

  async function onMoveToTrash(docId: string) {
    if (trashBusyId) return;
    const confirmed = window.confirm("¿Mover este documento a la papelera?");
    if (!confirmed) return;
    setTrashBusyId(docId);
    setError(null);
    try {
      await backend.documents.remove(docId);
      if (items.length === 1 && pagina > 1) {
        setPagina((current) => current - 1);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo mover el documento a la papelera");
    } finally {
      setTrashBusyId(null);
    }
  }

  async function onRestore(docId: string) {
    if (trashBusyId) return;
    setTrashBusyId(docId);
    setError(null);
    try {
      await backend.documents.restore(docId);
      if (items.length === 1 && pagina > 1) {
        setPagina((current) => current - 1);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo restaurar el documento");
    } finally {
      setTrashBusyId(null);
    }
  }

  function assigneeLabel(doc: DocumentItem) {
    if (!doc.assigned_to_id) return "Sin asignar";
    if (user && doc.assigned_to_id === user.id) return "Asignado a mí";
    return usersById.get(doc.assigned_to_id)?.full_name ?? "Usuario asignado";
  }

  function renderDocumentTitle(doc: DocumentItem) {
    const assignedToMe = Boolean(user && doc.assigned_to_id === user.id);
    const isOwn = Boolean(user && doc.user_id === user.id);
    return (
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="max-w-xs break-words font-medium text-on-surface">{doc.title}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {doc.doc_type && (
            <span className="max-w-xs break-words text-xs text-on-surface-variant">{doc.doc_type}</span>
          )}
          {assignedToMe && (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-on-secondary">
              Asignado a mí
            </span>
          )}
          {!staff && isOwn && !assignedToMe && (
            <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Propio
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderAssignment(doc: DocumentItem) {
    if (showTrash) {
      return (
        <span className="text-xs text-on-surface-variant">
          {assigneeLabel(doc)}
        </span>
      );
    }
    return (
      <div className="min-w-0 [overflow-wrap:anywhere]">
        {canAssign ? (
          <select
            value={doc.assigned_to_id ?? ""}
            aria-label={`Asignar documento: ${doc.title}`}
            disabled={assigningId === doc.id}
            onChange={(event) => {
              if (event.target.value) void onAssign(doc.id, event.target.value);
            }}
            className="w-full min-w-0 max-w-[180px] max-xl:min-h-11 border border-outline-variant rounded-2xl bg-white px-2 py-1.5 text-base xl:text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="">
              {doc.assigned_to_id ? assigneeLabel(doc) : "Asignar a…"}
            </option>
            {doc.assigned_to_id && !usersById.has(doc.assigned_to_id) && (
              <option value={doc.assigned_to_id}>{assigneeLabel(doc)}</option>
            )}
            {users.map((row) => (
              <option key={row.id} value={row.id}>
                {row.full_name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-on-surface-variant">
            {assigneeLabel(doc)}
          </span>
        )}
      </div>
    );
  }

  function renderActions(doc: DocumentItem) {
    if (showTrash) {
      return (
        <div className="inline-flex flex-wrap items-center gap-1 justify-end">
          <button
            type="button"
            onClick={() => void onRestore(doc.id)}
            disabled={trashBusyId === doc.id}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            title="Restaurar documento"
            aria-label={`Restaurar ${doc.title}`}
          >
            <Icon name="restore" className="text-lg" />
            {trashBusyId === doc.id ? "Restaurando…" : "Restaurar"}
          </button>
        </div>
      );
    }

    return (
      <div className="inline-flex flex-wrap items-center gap-1 justify-end [&_button]:max-xl:min-h-11 [&_button]:max-xl:min-w-11 [&_a]:max-xl:min-h-11 [&_a]:max-xl:min-w-11 [&_button]:items-center [&_button]:justify-center [&_a]:items-center [&_a]:justify-center">
        {canEdit(doc) && (
          <button
            type="button"
            onClick={() => {
              setUploading(false);
              setEditingDocument(doc);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            title="Editar documento"
            aria-label={`Editar ${doc.title}`}
          >
            <Icon name="edit" className="text-lg" />
          </button>
        )}
        {canEdit(doc) && (
          <DocumentRecoveryActions
            document={doc}
            busy={reprocessingIds.has(doc.id) || (scanBusy && scanDocId === doc.id)}
            uploadBusy={scanBusy}
            onUpload={() => openScanPicker(doc.id)}
            onReprocess={() => void onReprocess(doc.id)}
          />
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

        {canEdit(doc) && (
          <button
            type="button"
            onClick={() => void onMoveToTrash(doc.id)}
            disabled={trashBusyId === doc.id}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-on-surface-variant transition-colors hover:bg-error-container hover:text-error focus:outline-none focus:ring-2 focus:ring-error/20 disabled:opacity-50"
            title="Mover a papelera"
            aria-label={`Mover ${doc.title} a la papelera`}
          >
            <Icon name="delete" className="text-lg" />
          </button>
        )}
      </div>
    );
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

      <div className="flex flex-col xl:flex-row gap-4 items-start justify-between mb-8">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">
            {showTrash ? "Papelera" : "Documentos"}
          </h2>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            {showTrash
              ? "Documentos eliminados que pueden restaurarse."
              : "Listado del archivo con ubicación, período y asignación. Los pendientes pueden recibir el escaneo después."}
          </p>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
          {staff && (
            <button
              type="button"
              onClick={() => {
                setShowTrash((current) => !current);
                setPagina(1);
                setSearchInput("");
                setSearchQuery("");
                setError(null);
                router.replace("/documentos");
              }}
              className="w-full sm:w-auto shrink-0 min-h-11 border border-outline-variant text-on-surface text-sm font-medium py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-surface-container transition-colors whitespace-nowrap"
            >
              <Icon name={showTrash ? "arrow_back" : "delete"} className="text-lg" />
              {showTrash ? "Volver a documentos" : "Papelera"}
            </button>
          )}
          {!showTrash && (
            <button
              type="button"
              onClick={() => {
                setEditingDocument(null);
                setUploading(true);
              }}
              className="w-full sm:w-auto shrink-0 min-h-11 bg-primary text-white text-sm font-medium py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-light transition-colors whitespace-nowrap shadow-sm"
            >
              <Icon name="upload" className="text-lg" /> Subir documento
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0 bg-white rounded-2xl p-4 border border-outline-variant mb-6 space-y-4">
        {!showTrash && (
          <form onSubmit={applySearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-on-surface-variant">
                <Icon name="search" className="text-lg" />
              </div>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar documento por texto..."
                className="w-full min-h-11 border border-outline-variant rounded-2xl bg-white pl-10 pr-3 py-2.5 text-base xl:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 sm:flex-none min-h-11 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light transition-colors"
              >
                Buscar
              </button>
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="min-h-11 rounded-2xl border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </form>
        )}
        {searchQuery && !showTrash ? (
          <p className="text-xs text-on-surface-variant">
            Resultados para “{searchQuery}” · {total} documento{total === 1 ? "" : "s"}
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <div className="min-w-0">
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Año archivado
          </label>
          <select
            value={yearFilter}
            disabled={Boolean(searchQuery) && !showTrash}
            onChange={(event) => {
              setYearFilter(event.target.value);
              setPagina(1);
            }}
            className="w-full min-w-0 min-h-11 border border-outline-variant rounded-2xl bg-white px-3 py-2 text-base xl:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-60"
          >
            <option value="">Todos</option>
            {YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <FormField id="document-month-from" label="Mes archivado desde" className="min-w-0">
          <select
            id="document-month-from"
            value={monthFromFilter}
            disabled={Boolean(searchQuery) && !showTrash}
            onChange={(event) => {
              setMonthFromFilter(event.target.value);
              setPagina(1);
            }}
            className={`${formControlClass} min-w-0 min-h-11 text-base xl:text-sm disabled:opacity-60`}
          >
            <MonthOptions allowEmpty emptyLabel="Sin límite inferior" max={monthToFilter ? Number(monthToFilter) : 12} />
          </select>
        </FormField>
        <FormField id="document-month-to" label="Mes archivado hasta" className="min-w-0">
          <select
            id="document-month-to"
            value={monthToFilter}
            disabled={Boolean(searchQuery) && !showTrash}
            onChange={(event) => {
              setMonthToFilter(event.target.value);
              setPagina(1);
            }}
            className={`${formControlClass} min-w-0 min-h-11 text-base xl:text-sm disabled:opacity-60`}
          >
            <MonthOptions allowEmpty emptyLabel="Sin límite superior" min={monthFromFilter ? Number(monthFromFilter) : 1} />
          </select>
        </FormField>
        <div className="min-w-0">
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Estante
          </label>
          <input
            value={shelfFilter}
            disabled={Boolean(searchQuery) && !showTrash}
            onChange={(event) => {
              setShelfFilter(event.target.value);
              setPagina(1);
            }}
            placeholder="Ej: A1"
            className="w-full min-w-0 min-h-11 border border-outline-variant rounded-2xl bg-white px-3 py-2 text-base xl:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-60"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Estado
          </label>
          <select
            value={statusFilter}
            disabled={Boolean(searchQuery) && !showTrash}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPagina(1);
            }}
            className="w-full min-w-0 min-h-11 border border-outline-variant rounded-2xl bg-white px-3 py-2 text-base xl:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-60"
          >
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="processing">Procesando</option>
            <option value="completed">Completado</option>
            <option value="failed">Fallido</option>
          </select>
        </div>
        <div className="min-w-0">
          <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
            Asignación
          </label>
          <select
            value={assignmentFilter}
            disabled={Boolean(searchQuery) && !showTrash}
            onChange={(event) => {
              setAssignmentFilter(event.target.value as "all" | "mine");
              setPagina(1);
            }}
            className="w-full min-w-0 min-h-11 border border-outline-variant rounded-2xl bg-white px-3 py-2 text-base xl:text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-60"
          >
            <option value="all">Todos</option>
            <option value="mine">Asignados a mí</option>
          </select>
        </div>
        </div>
      </div>

      {error && (
        <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>
      )}
      {scanBusy && <p className="text-sm text-on-surface-variant mb-4">Subiendo escaneo...</p>}

      <div className="min-w-0 max-w-full bg-white rounded-2xl border border-outline-variant">
        <div className="p-4 border-b border-outline-variant flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-on-surface">Listado</h3>
            <p className="mt-1 text-xs text-on-surface-variant">{total} documento{total === 1 ? "" : "s"}</p>
          </div>
          <div role="group" aria-label="Vista de documentos" className="inline-flex rounded-2xl border border-outline-variant p-1">
            {([
              { value: "table", label: "Tabla", icon: "view_list" },
              { value: "grid", label: "Tarjetas", icon: "grid_view" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={view === option.value}
                onClick={() => setView(option.value)}
                className={"inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " + (
                  view === option.value ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
                )}
              >
                <span aria-hidden="true"><Icon name={option.icon} className="text-lg" /></span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">Cargando documentos...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">
            {showTrash ? "La papelera está vacía." : "No hay documentos con estos filtros."}
          </div>
        ) : view === "grid" ? (
          <ul aria-label="Documentos en tarjetas" className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {items.map((doc) => (
              <li key={doc.id} className={"flex min-w-0 flex-col gap-4 rounded-2xl border border-outline-variant p-4 " + (
                user && doc.assigned_to_id === user.id ? "bg-secondary-container/40" : "bg-white"
              )}>
                {renderDocumentTitle(doc)}
                <div>
                  <StatusBadge status={doc.status} />
                  <FailureReason status={doc.status} errorMessage={doc.error_message} />
                </div>
                <dl className="space-y-3 text-sm [overflow-wrap:anywhere]">
                  <div>
                    <dt className="text-xs text-on-surface-variant">Período</dt>
                    <dd className="mt-1 text-on-surface">{formatArchivedPeriod(doc)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-on-surface-variant">Ubicación</dt>
                    <dd className="mt-1 text-on-surface">{formatPhysicalLocation(doc)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-on-surface-variant">Asignación</dt>
                    <dd className="mt-1">{renderAssignment(doc)}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex justify-end border-t border-outline-variant pt-3">
                  {renderActions(doc)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"
            role="region"
            aria-label="Listado de documentos; desplázate horizontalmente para ver todas las columnas"
            tabIndex={0}
          >
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="border-b border-outline-variant text-[11px] text-on-surface-variant uppercase tracking-wider bg-surface-container">
                  <th className="py-3 px-4 font-medium">Título</th>
                  <th className="py-3 px-4 font-medium">Período</th>
                  <th className="py-3 px-4 font-medium">Ubicación</th>
                  <th className="py-3 px-4 font-medium">Asignación</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((doc) => {
                  const assignedToMe = Boolean(user && doc.assigned_to_id === user.id);

                  return (
                    <tr
                      key={doc.id}
                      className={`border-b border-outline-variant hover:bg-surface-container transition-colors ${
                        assignedToMe ? "bg-secondary-container/40" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        {renderDocumentTitle(doc)}
                      </td>
                      <td className="py-3 px-4 text-on-surface-variant whitespace-nowrap">
                        {formatArchivedPeriod(doc)}
                      </td>
                      <td className="py-3 px-4 text-on-surface-variant text-xs max-w-[220px] break-words">
                        {formatPhysicalLocation(doc)}
                      </td>
                      <td className="py-3 px-4">
                        {renderAssignment(doc)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={doc.status} />
                        <FailureReason status={doc.status} errorMessage={doc.error_message} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {renderActions(doc)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && items.length > 0 && totalPaginas > 1 && (
          <div className="border-t border-outline-variant p-4">
            <Pagina
              PaginaActual={pagina}
              TotalPaginas={totalPaginas}
              disabled={loading}
              cambioPagina={(selectionPage) => {
                setPagina(selectionPage);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </div>
        )}
      </div>

      {user && (uploading || editingDocument !== null) && (
        <DocumentEditModal
          key={editingDocument?.id ?? "create"}
          open
          document={editingDocument}
          onClose={handleDocumentModalClose}
          onSaved={handleDocumentSaved}
        />
      )}
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
