import { NextResponse } from "next/server";
import {
  backendUrl,
  clearAuthCookies,
  getAuthCookies,
} from "@/lib/auth-cookies";

export async function POST() {
  const { access, refresh } = await getAuthCookies();

  if (refresh) {
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (access) {
        headers.Authorization = `Bearer ${access}`;
      }
      await fetch(backendUrl("/auth/logout"), {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh_token: refresh }),
        cache: "no-store",
      });
    } catch {
      /* igual borramos cookies locales */
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
