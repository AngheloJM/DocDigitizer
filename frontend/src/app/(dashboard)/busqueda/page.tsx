"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  SearchFiltersPanel,
  type SearchFilterValues,
} from "@/components/search/SearchFiltersPanel";
import { Icon } from "@/components/ui/Icon";
import { Pagina } from "@/components/ui/paginacion";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import { loadFolderTree, type FolderOption } from "@/lib/folder-options";
import {
  formatArchivedPeriod,
  formatPhysicalLocation,
  isStaff,
  type SearchResult,
  type User,
} from "@/lib/types";

const SEARCH_PAGE_SIZE = 20;

const EMPTY_FILTERS: SearchFilterValues = {
  query: "",
  docType: "",
  dateFrom: "",
  dateTo: "",
  folderId: "",
  ownerId: "",
};

type SearchParamReader = {
  get: (name: string) => string | null;
};

function readFilters(params: SearchParamReader): SearchFilterValues {
  return {
    query: params.get("q") ?? "",
    docType: params.get("doc_type") ?? "",
    dateFrom: params.get("date_from") ?? "",
    dateTo: params.get("date_to") ?? "",
    folderId: params.get("folder_id") ?? "",
    ownerId: params.get("owner_id") ?? "",
  };
}

function readPage(params: SearchParamReader) {
  const parsed = Number.parseInt(params.get("page") ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function toBackendDate(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return date.toISOString();
}

function buildSearchUrl(values: SearchFilterValues, page: number, includeOwner: boolean) {
  const params = new URLSearchParams({ q: values.query.trim() });
  if (values.docType.trim()) params.set("doc_type", values.docType.trim());
  if (values.dateFrom) params.set("date_from", values.dateFrom);
  if (values.dateTo) params.set("date_to", values.dateTo);
  if (values.folderId) params.set("folder_id", values.folderId);
  if (includeOwner && values.ownerId) params.set("owner_id", values.ownerId);
  if (page > 1) params.set("page", String(page));
  return `/busqueda?${params.toString()}`;
}

function BusquedaContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramsKey = searchParams.toString();
  const staff = Boolean(user && isStaff(user.role));

  const initialFilters = readFilters(searchParams);
  const [filters, setFilters] = useState<SearchFilterValues>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilterValues | null>(
    initialFilters.query.trim() ? initialFilters : null,
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => readPage(searchParams));
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<User[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const dateError = useMemo(() => {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      return "La fecha final no puede ser anterior a la inicial.";
    }
    return null;
  }, [filters.dateFrom, filters.dateTo]);

  const runSearch = useCallback(
    async (values: SearchFilterValues, requestedPage: number, includeOwner: boolean) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const data = await backend.search({
          q: values.query,
          docType: values.docType || null,
          dateFrom: values.dateFrom ? toBackendDate(values.dateFrom, false) : null,
          dateTo: values.dateTo ? toBackendDate(values.dateTo, true) : null,
          folderId: values.folderId || null,
          ownerId: includeOwner ? values.ownerId || null : null,
          page: requestedPage,
          perPage: SEARCH_PAGE_SIZE,
        });

        if (requestId !== requestIdRef.current) return;
        setResults(data.items);
        setTotal(data.total);
        setTotalPages(data.pages);
      } catch (requestError) {
        if (requestId !== requestIdRef.current) return;
        setError(
          requestError instanceof ApiError ? requestError.message : "No se pudo buscar",
        );
        setResults([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(paramsKey);
    const nextFilters = readFilters(params);
    const nextPage = readPage(params);

    setFilters(nextFilters);
    setPage(nextPage);

    if (!nextFilters.query.trim()) {
      requestIdRef.current += 1;
      setAppliedFilters(null);
      setResults([]);
      setTotal(0);
      setTotalPages(0);
      setError(null);
      setLoading(false);
      return;
    }

    setAppliedFilters(nextFilters);
    void runSearch(nextFilters, nextPage, staff);
  }, [paramsKey, runSearch, staff]);

  useEffect(() => {
    if (!user || !staff) {
      setOwners([]);
      setOwnersError(null);
      return;
    }

    let cancelled = false;
    setOwnersLoading(true);
    setOwnersError(null);

    backend.auth
      .listUsers(1, 100)
      .then((data) => {
        if (cancelled) return;
        const available = [user, ...data.items.filter((item) => item.is_active)];
        setOwners(Array.from(new Map(available.map((item) => [item.id, item])).values()));
      })
      .catch(() => {
        if (cancelled) return;
        setOwners([user]);
        setOwnersError("No se pudo cargar la lista completa de propietarios.");
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staff, user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const ownerId = staff ? filters.ownerId || null : user.id;
    setFoldersLoading(true);
    setFoldersError(null);

    loadFolderTree(ownerId)
      .then((options) => {
        if (!cancelled) setFolders(options);
      })
      .catch(() => {
        if (cancelled) return;
        setFolders([]);
        setFoldersError("No se pudieron cargar las carpetas disponibles.");
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters.ownerId, staff, user]);

  function handleFiltersChange(nextValues: SearchFilterValues) {
    if (nextValues.ownerId !== filters.ownerId) {
      setFilters({ ...nextValues, folderId: "" });
      return;
    }
    setFilters(nextValues);
  }

  function submitSearch() {
    if (!filters.query.trim() || dateError) return;
    const nextUrl = buildSearchUrl(filters, 1, staff);
    const currentUrl = `/busqueda${paramsKey ? `?${paramsKey}` : ""}`;

    if (nextUrl === currentUrl) {
      setAppliedFilters(filters);
      setPage(1);
      void runSearch(filters, 1, staff);
      return;
    }

    router.push(nextUrl);
  }

  function clearFilters() {
    requestIdRef.current += 1;
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(null);
    setResults([]);
    setTotal(0);
    setPage(1);
    setTotalPages(0);
    setError(null);
    setLoading(false);
    router.push("/busqueda");
  }

  function changePage(nextPage: number) {
    if (!appliedFilters || loading || nextPage === page) return;
    router.push(buildSearchUrl(appliedFilters, nextPage, staff));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight text-on-surface md:text-[28px]">
          Búsqueda
        </h2>
        <p className="max-w-2xl text-sm text-on-surface-variant">
          Busca en el texto extraído y combina filtros para encontrar documentos con mayor precisión.
        </p>
      </div>

      <SearchFiltersPanel
        values={filters}
        folders={folders}
        owners={owners}
        showOwnerFilter={staff}
        loading={loading}
        foldersLoading={foldersLoading}
        ownersLoading={ownersLoading}
        dateError={dateError}
        onChange={handleFiltersChange}
        onSubmit={submitSearch}
        onClear={clearFilters}
      />

      {(ownersError || foldersError) && (
        <div className="mb-4 rounded-2xl border border-secondary/40 bg-secondary-container px-4 py-3 text-sm text-on-surface">
          {ownersError ?? foldersError} Puedes continuar usando los demás filtros.
        </div>
      )}

      {error && (
        <div
          className="mb-4 rounded-2xl bg-error-container px-3 py-2 text-sm text-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {!appliedFilters && !loading && (
        <div className="rounded-2xl border border-outline-variant bg-white py-12 text-center text-sm text-on-surface-variant">
          <Icon name="manage_search" className="mx-auto mb-2 block text-3xl text-outline" />
          Ingresa un texto y aplica los filtros que necesites.
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-outline-variant bg-white py-10 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-on-surface-variant">Buscando documentos...</p>
        </div>
      )}

      {appliedFilters && !loading && !error && results.length === 0 && (
        <div className="rounded-2xl border border-outline-variant bg-white py-12 text-center text-sm text-on-surface-variant">
          <Icon name="search_off" className="mx-auto mb-2 block text-3xl text-outline" />
          No se encontraron resultados para “{appliedFilters.query}”.
        </div>
      )}

      {appliedFilters && !loading && !error && results.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-semibold text-on-surface">Resultados</h3>
            <p className="text-xs text-on-surface-variant">
              {total} documento{total === 1 ? "" : "s"}
            </p>
          </div>

          <ul className="space-y-3">
            {results.map((item) => (
              <li
                key={item.document.id}
                className="rounded-2xl border border-outline-variant bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-on-surface">{item.document.title}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {[item.document.doc_type || "Documento", formatArchivedPeriod(item.document)]
                        .filter((part) => part && part !== "—")
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      {formatPhysicalLocation(item.document)}
                    </p>
                  </div>
                  <StatusBadge status={item.document.status} />
                </div>
                <p
                  className="mt-3 text-sm text-on-surface-variant"
                  dangerouslySetInnerHTML={{ __html: sanitizeHighlight(item.highlight) }}
                />
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 rounded-2xl border border-outline-variant bg-white px-4 py-3">
              <Pagina
                PaginaActual={page}
                TotalPaginas={totalPages}
                disabled={loading}
                cambioPagina={changePage}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

function sanitizeHighlight(html: string) {
  return html
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>");
}

export default function BusquedaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-on-surface-variant">Cargando búsqueda...</p>}>
      <BusquedaContent />
    </Suspense>
  );
}
