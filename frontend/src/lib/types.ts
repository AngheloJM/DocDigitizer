export type Role = "student" | "admin" | "super_admin";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};

export type Folder = {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  parent_id: string | null;
  created_at: string;
};

export type DocumentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "reprocessing";

export type DocumentItem = {
  id: string;
  title: string;
  description: string | null;
  doc_type: string | null;
  status: DocumentStatus | string;
  user_id: string;
  folder_id: string | null;
  physical_shelf: string | null;
  physical_division: string | null;
  physical_column: string | null;
  physical_volume: string | null;
  archived_year: number | null;
  archived_month_start: number | null;
  archived_month_end: number | null;
  assigned_to_id: string | null;
  created_at: string;
  processed_at: string | null;
};

export type DocumentDetail = DocumentItem & {
  original_image?: {
    file_format: string;
    file_size_bytes: number;
    width_px: number | null;
    height_px: number | null;
  } | null;
  generated_pdf?: { version: number; file_size_bytes: number } | null;
  extracted_text?: {
    ocr_confidence: number | null;
    ocr_engine: string;
    word_count: number | null;
  } | null;
};

export type SearchResult = {
  document: DocumentItem;
  highlight: string;
  rank: number;
};

export const ROLE_LABEL: Record<Role, string> = {
  student: "Estudiante",
  admin: "Administrador",
  super_admin: "Super administrador",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Completado",
  failed: "Fallido",
  reprocessing: "Reprocesando",
};

export function isStaff(role: Role) {
  return role === "admin" || role === "super_admin";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const MONTHS = [
  "",
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function formatPhysicalLocation(doc: {
  physical_shelf: string | null;
  physical_division: string | null;
  physical_column: string | null;
  physical_volume: string | null;
}) {
  const parts = [
    doc.physical_shelf ? `Estante ${doc.physical_shelf}` : null,
    doc.physical_division ? `Div. ${doc.physical_division}` : null,
    doc.physical_column ? `Col. ${doc.physical_column}` : null,
    doc.physical_volume ? `Tomo ${doc.physical_volume}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatArchivedPeriod(doc: {
  archived_year: number | null;
  archived_month_start: number | null;
  archived_month_end: number | null;
}) {
  if (!doc.archived_year) return "—";
  const start = doc.archived_month_start ? MONTHS[doc.archived_month_start] : null;
  const end = doc.archived_month_end ? MONTHS[doc.archived_month_end] : null;
  if (start && end && start !== end) return `${start}–${end} ${doc.archived_year}`;
  if (start) return `${start} ${doc.archived_year}`;
  return String(doc.archived_year);
}

export function needsScanUpload(status: string) {
  return status === "pending" || status === "failed";
}
