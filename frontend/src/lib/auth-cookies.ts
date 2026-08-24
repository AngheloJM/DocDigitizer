import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, COOKIE_ACCESS, COOKIE_REFRESH, API_PREFIX } from "@/lib/config";
import type { TokenResponse } from "@/lib/types";

export function backendUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_URL}${API_PREFIX}${normalized}`;
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
  try {
    const res = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TokenResponse;
  } catch {
    return null;
  }
}

export function setAuthCookies(response: NextResponse, tokens: TokenResponse) {
  response.cookies.set(COOKIE_ACCESS, tokens.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in,
  });
  response.cookies.set(COOKIE_REFRESH, tokens.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(COOKIE_ACCESS, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(COOKIE_REFRESH, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getAuthCookies() {
  const store = await cookies();
  return {
    access: store.get(COOKIE_ACCESS)?.value,
    refresh: store.get(COOKIE_REFRESH)?.value,
  };
}
