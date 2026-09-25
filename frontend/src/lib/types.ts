export type Role = "student" | "admin" | "super_admin";

export type ManageableRole = Exclude<Role, "super_admin">;

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
  assigned_to_id: string | null;
  physical_shelf: string | null;
  physical_division: string | null;
  physical_column: string | null;
  physical_volume: string | null;
  archived_year: number | null;
  archived_month_start: number | null;
  archived_month_end: number | null;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
  deleted_at: string | null;
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

export type LocationNode = {
  value: string;
  document_count: number;
};

export const ROLE_LABEL: Record<Role, string> = {
  // Clave API temporal (`student`); el texto se puede cambiar sin tocar permisos.
  student: "Usuario",
  admin: "Administrador",
  super_admin: "Super administrador",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  student: "Solo ve Documentos: lo suyo o lo asignado. Busca ahí mismo, sin otras pestañas.",
  admin: "Gestiona usuarios y los documentos/archivo de todos.",
  super_admin:
    "Igual que un administrador, además puede crear administradores y cambiar roles.",
};

export const MANAGEABLE_ROLES: ManageableRole[] = ["student", "admin"];

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Completado",
  failed: "Fallido",
  reprocessing: "Reprocesando",
};

/** Staff: admin y super_admin. */
export function isStaff(role: Role) {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: Role) {
  return role === "super_admin";
}

/** Solo staff entra a Administración de usuarios. */
export function canManageUsers(role: Role) {
  return isStaff(role);
}

/** Solo super_admin cambia roles y crea administradores. */
export function canChangeRoles(role: Role) {
  return isSuperAdmin(role);
}

export function canCreateAdmin(role: Role) {
  return isSuperAdmin(role);
}

/** Solo staff asigna documentos a otras personas. */
export function canAssignDocuments(role: Role) {
  return isStaff(role);
}

/** Staff puede navegar inicio, archivo físico y búsqueda avanzada. */
export function canBrowseArchive(role: Role) {
  return isStaff(role);
}

export function canUseAdvancedSearch(role: Role) {
  return isStaff(role);
}

/** Staff, dueño o usuario asignado pueden editar / subir escaneo / reprocesar. */
export function canEditDocument(
  role: Role,
  userId: string,
  document: { user_id: string; assigned_to_id: string | null },
) {
  return (
    isStaff(role) ||
    document.user_id === userId ||
    document.assigned_to_id === userId
  );
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

export function needsScanUpload(status: string, hasOriginal: boolean) {
  return (status === "pending" || status === "failed") && !hasOriginal;
}


const FAILURE_REASONS = [
  { match: "no tiene un archivo original", message: "El documento no tiene un archivo. Sube el escaneo para procesarlo." },
  { match: "supero el limite", message: "El procesamiento tardó demasiado y se canceló." },
  { match: "encrypted", message: "El PDF está protegido con contraseña." },
  { match: "cannot open broken document", message: "El PDF está dañado y no se puede abrir." },
  { match: "failed to open stream", message: "El PDF está dañado y no se puede abrir." },
  { match: "cannot identify image file", message: "El archivo está dañado o no es una imagen válida." },
];

const GENERIC_FAILURE_REASON = "No se pudo procesar el documento por un error interno.";

export function failureReason(errorMessage: string | null) {
  if (!errorMessage) return GENERIC_FAILURE_REASON;
  const text = errorMessage.toLowerCase();
  const known = FAILURE_REASONS.find((reason) => text.includes(reason.match));
  return known ? known.message : GENERIC_FAILURE_REASON;
}

export type UserCreateInput = {
  email: string;
  password: string;
  full_name: string;
  role: ManageableRole;
};

export type UserUpdateInput = {
  role?: ManageableRole;
  is_active?: boolean;
  password?: string;
};

export type DocumentUpdateInput = {
  title?: string;
  description?: string | null;
  doc_type?: string | null;
  physical_shelf?: string | null;
  physical_division?: string | null;
  physical_column?: string | null;
  physical_volume?: string | null;
  archived_year?: number | null;
  archived_month_start?: number | null;
  archived_month_end?: number | null;
  assigned_to_id?: string | null;
};
