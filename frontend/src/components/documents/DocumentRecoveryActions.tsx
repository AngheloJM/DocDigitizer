"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { backend } from "@/lib/backend";
import { needsScanUpload, type DocumentDetail, type DocumentItem } from "@/lib/types";

type Props = {
  document: DocumentItem;
  busy: boolean;
  uploadBusy: boolean;
  onUpload: () => void;
  onReprocess: () => void;
};

export function DocumentRecoveryActions({ document, busy, uploadBusy, onUpload, onReprocess }: Props) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const eligible = ["pending", "failed", "completed"].includes(document.status);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    if (!eligible || busy) return;
    backend.documents.detail(document.id)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [document.id, document.status, eligible, busy, attempt]);

  if (!eligible) return null;
  if (busy) return <span role="status" className="text-xs text-on-surface-variant">Enviando…</span>;
  if (failed) {
    return (
      <button type="button" onClick={() => setAttempt((value) => value + 1)}
        className="rounded-2xl px-2 py-1.5 text-xs text-error hover:bg-error-container"
        aria-label={`No se pudieron consultar las acciones de ${document.title}. Reintentar consulta`}>
        Reintentar consulta
      </button>
    );
  }
  if (!detail || detail.id !== document.id) {
    return <span role="status" className="text-xs text-on-surface-variant">Consultando acciones…</span>;
  }

  const hasOriginal = Boolean(detail.original_image);
  const canUpload = needsScanUpload(detail.status, hasOriginal);
  const canReprocess = hasOriginal && ["completed", "failed"].includes(detail.status);

  return (
    <>
      {canUpload && (
        <button type="button" onClick={onUpload} disabled={uploadBusy}
          className="inline-flex rounded-2xl p-1.5 text-primary hover:bg-primary/5 disabled:opacity-50"
          title="Subir escaneo" aria-label={`Subir escaneo a ${document.title}`}>
          <Icon name="upload_file" className="text-lg" />
        </button>
      )}
      {canReprocess && (
        <button type="button" onClick={onReprocess}
          className="inline-flex rounded-2xl p-1.5 text-on-surface-variant hover:bg-primary/5 hover:text-primary"
          title={detail.status === "failed" ? "Reintentar procesamiento" : "Reprocesar documento"}
          aria-label={`${detail.status === "failed" ? "Reintentar procesamiento de" : "Reprocesar"} ${document.title}`}>
          <Icon name="refresh" className="text-lg" />
        </button>
      )}
      {detail.status === "failed" && hasOriginal && (
        <p className="max-w-xs break-words text-xs text-on-surface-variant">
          Puedes reintentar el procesamiento. Si el archivo está dañado o protegido, usa Subir documento para cargar una copia corregida como documento nuevo.
        </p>
      )}
    </>
  );
}
