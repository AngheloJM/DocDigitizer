export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function errorMessage(status: number, body: unknown) {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)))
        .join(", ");
    }
  }
  if (status === 401) return "Credenciales inválidas o sesión expirada";
  if (status === 403) return "No tienes permiso para esta acción";
  if (status === 404) return "Recurso no encontrado";
  if (status === 409) return "El recurso ya existe";
  if (status === 429) return "Demasiados intentos. Espera 15 minutos.";
  if (status === 502) return "No se pudo conectar con el backend en el puerto 8001";
  return "Ocurrió un error inesperado";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`/api/proxy${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("No se pudo conectar con el frontend proxy", 502);
  }

  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    throw new ApiError(errorMessage(res.status, body), res.status, body);
  }

  return body as T;
}

export async function loginRequest(email: string, password: string) {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el backend en el puerto 8001", 502);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(errorMessage(res.status, body), res.status, body);
  }
  return body as { ok: boolean; expires_in: number };
}

export async function logoutRequest() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
