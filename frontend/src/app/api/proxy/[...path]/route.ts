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
    let token = access;
    let tokens: TokenResponse | null = null;

    if (!token && refresh) {
      tokens = await refreshTokens(refresh);
      if (tokens) token = tokens.access_token;
    }

    let upstream = await forward(token);

    if (upstream.status === 401 && refresh && !tokens) {
      tokens = await refreshTokens(refresh);
      if (tokens) {
        upstream = await forward(tokens.access_token);
      }
    }

    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    if (tokens) {
      const buf = await upstream.arrayBuffer();
      const response = new NextResponse(buf, {
        status: upstream.status,
        headers: responseHeaders,
      });
      setAuthCookies(response, tokens);
      return response;
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
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
