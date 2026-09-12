import { api } from "@/lib/api";
import type {
  DocumentItem,
  DocumentUpdateInput,
  Folder,
  LocationNode,
  Paginated,
  SearchResult,
  User,
  UserCreateInput,
  UserUpdateInput,
} from "@/lib/types";

export type DocumentListFilters = {
  page?: number;
  perPage?: number;
  folderId?: string | null;
  statusFilter?: string | null;
  physicalShelf?: string | null;
  physicalDivision?: string | null;
  physicalColumn?: string | null;
  physicalVolume?: string | null;
  archivedYear?: number | null;
  assignedToId?: string | null;
};


export type LocationFilters = {
  physicalShelf?: string | null;
  physicalDivision?: string | null;
  physicalColumn?: string | null;
};
export type SearchFilters = {
  q: string;
  docType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  folderId?: string | null;
  ownerId?: string | null;
  page?: number;
  perPage?: number;
};

export const backend = {
  auth: {
    me: () => api<User>("/auth/me"),

    listUsers: (page = 1, perPage = 20) =>
      api<Paginated<User>>(`/auth/users?page=${page}&per_page=${perPage}`),

    createUser: (data: UserCreateInput) =>
      api<User>("/auth/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    updateUser: (id: string, data: UserUpdateInput) =>
      api<User>(`/auth/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  folders: {
    list: (parentId?: string | null, ownerId?: string | null) => {
      const params = new URLSearchParams();

      if (parentId) params.set("parent_id", parentId);
      if (ownerId) params.set("owner_id", ownerId);

      const query = params.toString();

      return api<Folder[]>(query ? `/folders?${query}` : "/folders");
    },

    create: (data: {
      name: string;
      description?: string | null;
      parent_id?: string | null;
    }) =>
      api<Folder>("/folders", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    remove: (id: string) =>
      api<void>(`/folders/${id}`, {
        method: "DELETE",
      }),
  },

  documents: {
    list: (filters: DocumentListFilters = {}) => {
      const params = new URLSearchParams({
        page: String(filters.page ?? 1),
        per_page: String(filters.perPage ?? 50),
      });

      if (filters.folderId) params.set("folder_id", filters.folderId);

      if (filters.statusFilter)
        params.set("status_filter", filters.statusFilter);

      if (filters.physicalShelf)
        params.set("physical_shelf", filters.physicalShelf);

      if (filters.physicalDivision)
        params.set("physical_division", filters.physicalDivision);

      if (filters.physicalColumn)
        params.set("physical_column", filters.physicalColumn);

      if (filters.physicalVolume)
        params.set("physical_volume", filters.physicalVolume);

      if (filters.archivedYear != null)
        params.set("archived_year", String(filters.archivedYear));

      if (filters.assignedToId)
        params.set("assigned_to_id", filters.assignedToId);

      return api<Paginated<DocumentItem>>(
        `/documents?${params.toString()}`
      );
    },

    locations: (filters: LocationFilters = {}) => {
      const params = new URLSearchParams();

      if (filters.physicalShelf)
        params.set("physical_shelf", filters.physicalShelf);

      if (filters.physicalDivision)
        params.set("physical_division", filters.physicalDivision);

      if (filters.physicalColumn)
        params.set("physical_column", filters.physicalColumn);

      const query = params.toString();

      return api<LocationNode[]>(
        query
          ? `/documents/locations?${query}`
          : "/documents/locations"
      );
    },

    update: (id: string, data: DocumentUpdateInput) =>
      api<DocumentItem>(`/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    upload: (form: FormData) =>
      api<{
        document_id: string;
        task_id: string | null;
        status: string;
      }>("/documents/upload", {
        method: "POST",
        body: form,
      }),

    uploadToExisting: (id: string, form: FormData) =>
      api<{
        document_id: string;
        task_id: string | null;
        status: string;
      }>(`/documents/${id}/upload`, {
        method: "POST",
        body: form,
      }),

    status: (id: string) =>
      api<{
        status: string;
        processed_at: string | null;
      }>(`/documents/${id}/status`),

    reprocess: (id: string) =>
      api<{
        document_id: string;
        task_id: string | null;
        status: string;
      }>(`/documents/${id}/reprocess`, {
        method: "POST",
      }),

    downloadUrl: (id: string) =>
      `/api/proxy/documents/${id}/download`,
  },


  search: (filters: SearchFilters) => {
    const params = new URLSearchParams({
      q: filters.q.trim(),
      page: String(filters.page ?? 1),
      per_page: String(filters.perPage ?? 20),
    });
    if (filters.docType?.trim()) params.set("doc_type", filters.docType.trim());
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    if (filters.folderId) params.set("folder_id", filters.folderId);
    if (filters.ownerId) params.set("owner_id", filters.ownerId);
    return api<Paginated<SearchResult>>(`/search?${params.toString()}`);
  },
};
