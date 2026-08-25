import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  BACKEND_URL,
  COOKIE_ACCESS,
  COOKIE_EXPIRES,
  COOKIE_REFRESH,
  API_PREFIX,
} from "@/lib/config";
import type { TokenResponse } from "@/lib/types";

export function backendUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_URL}${API_PREFIX}${normalized}`;
}

function cookieOpts(httpOnly: boolean, maxAge: number) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
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
  const accessTtl = tokens.expires_in > 0 ? tokens.expires_in : 900;
  response.cookies.set(COOKIE_ACCESS, tokens.access_token, cookieOpts(true, accessTtl));
  response.cookies.set(COOKIE_REFRESH, tokens.refresh_token, cookieOpts(true, 60 * 60 * 24 * 7));
  // visible en el browser para renovar el access antes de que expire (15 min)
  const exp = Math.floor(Date.now() / 1000) + accessTtl - 30;
  response.cookies.set(COOKIE_EXPIRES, String(exp), cookieOpts(false, 60 * 60 * 24 * 7));
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(COOKIE_ACCESS, "", cookieOpts(true, 0));
  response.cookies.set(COOKIE_REFRESH, "", cookieOpts(true, 0));
  response.cookies.set(COOKIE_EXPIRES, "", cookieOpts(false, 0));
}

export async function getAuthCookies() {
  const store = await cookies();
  return {
    access: store.get(COOKIE_ACCESS)?.value,
    refresh: store.get(COOKIE_REFRESH)?.value,
  };
}
