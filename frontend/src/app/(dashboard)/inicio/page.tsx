"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { FailureReason } from "@/components/ui/FailureReason";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { backend } from "@/lib/backend";
import {
  canBrowseArchive,
  formatArchivedPeriod,
  formatPhysicalLocation,
  type DocumentItem,
} from "@/lib/types";

const RECENT_LIMIT = 8;

type Summary = {
  total: number;
  pending: number;
  completed: number;
  recent: DocumentItem[];
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InicioPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !canBrowseArchive(user.role)) {
      router.replace("/documentos");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [recent, pending, completed] = await Promise.all([
        backend.documents.list({ page: 1, perPage: RECENT_LIMIT }),
        backend.documents.list({ page: 1, perPage: 1, statusFilter: "pending" }),
        backend.documents.list({ page: 1, perPage: 1, statusFilter: "completed" }),
      ]);
      setSummary({
        total: recent.total,
        pending: pending.total,
        completed: completed.total,
        recent: recent.items,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el inicio");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const cards = [
    {
      label: "Total",
      value: summary?.total ?? 0,
      hint: "Documentos del archivo",
      icon: "description",
      tone: "bg-primary/5 text-primary",
    },
    {
      label: "Pendientes",
      value: summary?.pending ?? 0,
      hint: "Sin digitalizar todavía",
      icon: "hourglass_empty",
      tone: "bg-secondary-container text-on-secondary",
    },
    {
      label: "Completados",
      value: summary?.completed ?? 0,
      hint: "Con OCR listo",
      icon: "task_alt",
      tone: "bg-success/10 text-success",
    },
  ];

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl md:text-[28px] font-semibold text-on-surface tracking-tight mb-2">
            {user ? `Hola, ${user.full_name.split(" ")[0]}` : "Inicio"}
          </h2>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Resumen del archivo digital y los últimos documentos registrados.
          </p>
        </div>
        <Link
          href="/documentos?upload=1"
          className="bg-primary text-white text-sm font-medium py-2.5 px-4 rounded-2xl flex items-center gap-2 hover:bg-primary-light transition-colors whitespace-nowrap shadow-sm"
        >
          <Icon name="upload" className="text-lg" /> Subir documento
        </Link>
      </div>

      {error && (
        <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-2xl border border-outline-variant p-5 flex items-start justify-between gap-4"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant font-medium mb-2">
                {card.label}
              </p>
              <p className="text-3xl font-semibold text-on-surface tracking-tight">
                {loading ? "—" : card.value}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">{card.hint}</p>
            </div>
            <span className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${card.tone}`}>
              <Icon name={card.icon} className="text-xl" />
            </span>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-2xl border border-outline-variant">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-outline-variant">
          <div>
            <h3 className="text-sm font-semibold text-on-surface">Actividad reciente</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Últimos documentos, del más nuevo al más antiguo.
            </p>
          </div>
          <Link
            href="/documentos"
            className="text-sm font-medium text-primary hover:text-primary-light transition-colors whitespace-nowrap"
          >
            Ver todos
          </Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-on-surface-variant text-sm">Cargando actividad...</div>
        ) : summary && summary.recent.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-on-surface-variant mb-3">Todavía no hay documentos.</p>
            <Link
              href="/documentos?upload=1"
              className="text-sm font-medium text-primary hover:text-primary-light"
            >
              Subir el primero
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {summary?.recent.map((doc) => (
              <li key={doc.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">{doc.title}</p>
                  <p className="text-xs text-on-surface-variant mt-1 truncate">
                    {formatPhysicalLocation(doc)} · {formatArchivedPeriod(doc)}
                  </p>
                  <FailureReason status={doc.status} errorMessage={doc.error_message} />
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <StatusBadge status={doc.status} />
                  <span className="text-xs text-on-surface-variant whitespace-nowrap">
                    {formatWhen(doc.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
