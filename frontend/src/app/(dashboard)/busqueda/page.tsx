"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { SearchResult } from "@/lib/types";

function BusquedaContent() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(value: string) {
    const q = value.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const data = await backend.search(q);
      setResults(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo buscar");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initial) void search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void search(query);
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">Búsqueda</h2>
        <p className="text-sm text-on-surface-variant max-w-2xl">
          Busca en el texto extraído de documentos ya procesados.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl p-5 border border-outline-variant mb-6 flex gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej: calificación"
          className="flex-1 border border-outline-variant rounded-2xl bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
        <button type="submit" className="bg-primary text-white text-sm font-medium py-2 px-4 rounded-2xl hover:bg-primary-light">
          Buscar
        </button>
      </form>

      {error && <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>}
      {loading && <p className="text-sm text-on-surface-variant">Buscando...</p>}

      {!loading && results.length === 0 && query.trim() && !error && (
        <div className="bg-white rounded-2xl border border-outline-variant py-12 text-center text-sm text-on-surface-variant">
          <Icon name="search_off" className="text-3xl text-outline block mx-auto mb-2" />
          No se encontraron resultados para “{query}”
        </div>
      )}

      <ul className="space-y-3">
        {results.map((item) => (
          <li key={item.document.id} className="bg-white rounded-2xl p-5 border border-outline-variant">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-on-surface">{item.document.title}</p>
                <p className="text-xs text-on-surface-variant mt-1">{item.document.doc_type || "Documento"}</p>
              </div>
              <StatusBadge status={item.document.status} />
            </div>
            <p
              className="text-sm text-on-surface-variant mt-3"
              dangerouslySetInnerHTML={{ __html: sanitizeHighlight(item.highlight) }}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function sanitizeHighlight(html: string) {
  return html.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
}

export default function BusquedaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-on-surface-variant">Cargando búsqueda...</p>}>
      <BusquedaContent />
    </Suspense>
  );
}
