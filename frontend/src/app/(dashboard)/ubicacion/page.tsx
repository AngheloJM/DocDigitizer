"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import {
  formatArchivedPeriod,
  formatPhysicalLocation,
  type DocumentItem,
  type LocationNode,
} from "@/lib/types";

type LevelKey = "shelf" | "division" | "column" | "volume";

const LEVEL_META: Record<
  LevelKey,
  { label: string; plural: string; icon: string; param: string }
> = {
  shelf: { label: "Estante", plural: "Estantes", icon: "shelves", param: "shelf" },
  division: { label: "División", plural: "Divisiones", icon: "view_week", param: "division" },
  column: { label: "Columna", plural: "Columnas", icon: "view_column", param: "column" },
  volume: { label: "Tomo", plural: "Tomos", icon: "menu_book", param: "volume" },
};

function UbicacionContent() {
  const params = useSearchParams();
  const router = useRouter();

  const shelf = params.get("shelf");
  const division = params.get("division");
  const column = params.get("column");
  const volume = params.get("volume");

  const currentLevel: LevelKey = !shelf
    ? "shelf"
    : !division
      ? "division"
      : !column
        ? "column"
        : "volume";

  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showingDocs, setShowingDocs] = useState(false);

  const crumbs = useMemo(() => {
    const items: { label: string; href: string }[] = [{ label: "Archivo físico", href: "/ubicacion" }];
    if (shelf) {
      items.push({ label: `Estante ${shelf}`, href: `/ubicacion?shelf=${encodeURIComponent(shelf)}` });
    }
    if (shelf && division) {
      items.push({
        label: `Div. ${division}`,
        href: `/ubicacion?shelf=${encodeURIComponent(shelf)}&division=${encodeURIComponent(division)}`,
      });
    }
    if (shelf && division && column) {
      items.push({
        label: `Col. ${column}`,
        href: `/ubicacion?shelf=${encodeURIComponent(shelf)}&division=${encodeURIComponent(division)}&column=${encodeURIComponent(column)}`,
      });
    }
    if (shelf && division && column && volume) {
      items.push({
        label: `Tomo ${volume}`,
        href: `/ubicacion?shelf=${encodeURIComponent(shelf)}&division=${encodeURIComponent(division)}&column=${encodeURIComponent(column)}&volume=${encodeURIComponent(volume)}`,
      });
    }
    return items;
  }, [shelf, division, column, volume]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (volume && shelf && division && column) {
        const docs = await backend.documents.list({
          page: 1,
          perPage: 50,
          physicalShelf: shelf,
          physicalDivision: division,
          physicalColumn: column,
          physicalVolume: volume,
        });
        setNodes([]);
        setDocuments(docs.items);
        setShowingDocs(true);
        return;
      }

      const locationNodes = await backend.documents.locations({
        physicalShelf: shelf,
        physicalDivision: division,
        physicalColumn: column,
      });

      if (locationNodes.length === 0 && shelf) {
        const docs = await backend.documents.list({
          page: 1,
          perPage: 50,
          physicalShelf: shelf,
          physicalDivision: division,
          physicalColumn: column,
        });
        setNodes([]);
        setDocuments(docs.items);
        setShowingDocs(true);
      } else {
        setNodes(locationNodes);
        setDocuments([]);
        setShowingDocs(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la ubicación");
      setNodes([]);
      setDocuments([]);
      setShowingDocs(false);
    } finally {
      setLoading(false);
    }
  }, [shelf, division, column, volume]);

  useEffect(() => {
    void load();
  }, [load]);

  function goToNode(value: string) {
    const next = new URLSearchParams();
    if (currentLevel === "shelf") {
      next.set("shelf", value);
    } else if (currentLevel === "division" && shelf) {
      next.set("shelf", shelf);
      next.set("division", value);
    } else if (currentLevel === "column" && shelf && division) {
      next.set("shelf", shelf);
      next.set("division", division);
      next.set("column", value);
    } else if (currentLevel === "volume" && shelf && division && column) {
      next.set("shelf", shelf);
      next.set("division", division);
      next.set("column", column);
      next.set("volume", value);
    }
    router.push(`/ubicacion?${next.toString()}`);
  }

  const meta = LEVEL_META[currentLevel];
  const parentHref = crumbs.length > 1 ? crumbs[crumbs.length - 2].href : null;

  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">
          Ubicación física
        </h2>
        <p className="text-sm text-on-surface-variant max-w-2xl">
          Navega el archivo real: estante → división → columna → tomo.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-2 mb-6 text-sm">
        {crumbs.map((crumb, index) => (
          <span key={crumb.href} className="inline-flex items-center gap-2">
            {index > 0 && <Icon name="chevron_right" className="text-base text-on-surface-variant" />}
            {index === crumbs.length - 1 ? (
              <span className="font-medium text-on-surface">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="text-primary hover:underline">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {parentHref && (
        <button
          type="button"
          onClick={() => router.push(parentHref)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          <Icon name="arrow_back" className="text-base" />
          Volver
        </button>
      )}

      {error && (
        <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-on-surface-variant">Cargando ubicación...</div>
      ) : showingDocs ? (
        <div className="bg-white rounded-2xl border border-outline-variant">
          <div className="p-4 border-b border-outline-variant flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-on-surface">Documentos en esta ubicación</h3>
            <p className="text-xs text-on-surface-variant">
              {documents.length} documento{documents.length === 1 ? "" : "s"}
            </p>
          </div>
          {documents.length === 0 ? (
            <div className="py-10 text-center text-sm text-on-surface-variant">
              No hay documentos en este nivel.
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {documents.map((doc) => (
                <li key={doc.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface">{doc.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                      <StatusBadge status={doc.status} />
                      <span>{formatArchivedPeriod(doc)}</span>
                      <span>{formatPhysicalLocation(doc)}</span>
                    </div>
                  </div>
                  {doc.status === "completed" && (
                    <a
                      href={backend.documents.downloadUrl(doc.id)}
                      className="text-primary text-sm shrink-0 hover:underline"
                    >
                      Descargar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : nodes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-outline-variant py-12 text-center text-sm text-on-surface-variant">
          <Icon name="inventory_2" className="text-3xl text-outline block mx-auto mb-2" />
          No hay ubicaciones físicas registradas todavía.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <h3 className="text-sm font-semibold text-on-surface">{meta.plural}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {nodes.map((node) => (
              <button
                key={node.value}
                type="button"
                onClick={() => goToNode(node.value)}
                className="text-left bg-white rounded-2xl border border-outline-variant p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name={meta.icon} className="text-xl" />
                  </div>
                  <Icon
                    name="chevron_right"
                    className="text-on-surface-variant group-hover:text-primary transition-colors"
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-on-surface truncate">
                  {meta.label} {node.value}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {node.document_count} documento{node.document_count === 1 ? "" : "s"}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function UbicacionPage() {
  return (
    <Suspense fallback={<p className="text-sm text-on-surface-variant">Cargando ubicación...</p>}>
      <UbicacionContent />
    </Suspense>
  );
}
