import { NextRequest, NextResponse } from "next/server";
import { backendUrl, clearAuthCookies, setAuthCookies } from "@/lib/auth-cookies";
import type { TokenResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  let payload: { email?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: "Body inválido" }, { status: 422 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    });
  } catch {
    return NextResponse.json(
      { detail: "No se pudo conectar con el backend en http://127.0.0.1:8001" },
      { status: 502 },
    );
  }

  const body = await upstream.json().catch(() => ({ detail: "Respuesta inválida del backend" }));
  if (!upstream.ok) {
    return NextResponse.json(body, { status: upstream.status });
  }

  const tokens = body as TokenResponse;
  const response = NextResponse.json({ ok: true, expires_in: tokens.expires_in });
  setAuthCookies(response, tokens);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
