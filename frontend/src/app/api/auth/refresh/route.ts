import { NextResponse } from "next/server";
import { getAuthCookies, refreshTokens, setAuthCookies, clearAuthCookies } from "@/lib/auth-cookies";

export async function POST() {
  const { refresh } = await getAuthCookies();
  if (!refresh) {
    const response = NextResponse.json({ ok: false }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const tokens = await refreshTokens(refresh);
  if (!tokens) {
    const response = NextResponse.json({ ok: false }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.json({ ok: true, expires_in: tokens.expires_in });
  setAuthCookies(response, tokens);
  return response;
}
