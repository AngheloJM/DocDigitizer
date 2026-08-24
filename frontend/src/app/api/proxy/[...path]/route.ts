import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getAuthCookies, refreshTokens, setAuthCookies } from "@/lib/auth-cookies";
import type { TokenResponse } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = backendUrl(`/${path.join("/")}${request.nextUrl.search}`);
  const { access, refresh } = await getAuthCookies();

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  async function forward(token?: string) {
    const nextHeaders = new Headers(headers);
    if (token) nextHeaders.set("Authorization", `Bearer ${token}`);
    return fetch(target, {
      method,
      headers: nextHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
    });
  }

  try {
    let upstream = await forward(access);
    let tokens: TokenResponse | null = null;

    if (upstream.status === 401 && refresh) {
      tokens = await refreshTokens(refresh);
      if (tokens) {
        upstream = await forward(tokens.access_token);
      }
    }

    const responseHeaders = new Headers();
    const pass = ["content-type", "content-disposition", "content-length"];
    for (const name of pass) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
    if (tokens) setAuthCookies(response, tokens);
    return response;
  } catch {
    return NextResponse.json(
      { detail: "No se pudo conectar con el backend en http://127.0.0.1:8001" },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
