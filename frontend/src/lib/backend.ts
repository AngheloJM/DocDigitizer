import { api } from "@/lib/api";
import type { DocumentItem, Folder, Paginated, SearchResult, User } from "@/lib/types";

export type DocumentListFilters = {
  page?: number;
  perPage?: number;
  folderId?: string | null;
  statusFilter?: string | null;
  physicalShelf?: string | null;
  archivedYear?: number | null;
};

export const backend = {
  auth: {
    me: () => api<User>("/auth/me"),
    listUsers: (page = 1, perPage = 20) =>
      api<Paginated<User>>(`/auth/users?page=${page}&per_page=${perPage}`),
    updateUser: (id: string, data: { role?: string; is_active?: boolean }) =>
      api<User>(`/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  folders: {
    list: (parentId?: string | null) =>
      api<Folder[]>(parentId ? `/folders?parent_id=${parentId}` : "/folders"),
    create: (data: { name: string; description?: string | null; parent_id?: string | null }) =>
      api<Folder>("/folders", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: string) => api<void>(`/folders/${id}`, { method: "DELETE" }),
  },
  documents: {
    list: (filters: DocumentListFilters = {}) => {
      const params = new URLSearchParams({
        page: String(filters.page ?? 1),
        per_page: String(filters.perPage ?? 50),
      });
      if (filters.folderId) params.set("folder_id", filters.folderId);
      if (filters.statusFilter) params.set("status_filter", filters.statusFilter);
      if (filters.physicalShelf) params.set("physical_shelf", filters.physicalShelf);
      if (filters.archivedYear != null) params.set("archived_year", String(filters.archivedYear));
      return api<Paginated<DocumentItem>>(`/documents?${params.toString()}`);
    },
    upload: (form: FormData) =>
      api<{ document_id: string; task_id: string | null; status: string }>("/documents/upload", {
        method: "POST",
        body: form,
      }),
    uploadToExisting: (id: string, form: FormData) =>
      api<{ document_id: string; task_id: string | null; status: string }>(`/documents/${id}/upload`, {
        method: "POST",
        body: form,
      }),
    status: (id: string) =>
      api<{ status: string; processed_at: string | null }>(`/documents/${id}/status`),
    downloadUrl: (id: string) => `/api/proxy/documents/${id}/download`,
  },
  search: (q: string) => api<Paginated<SearchResult>>(`/search?q=${encodeURIComponent(q)}`),
};
