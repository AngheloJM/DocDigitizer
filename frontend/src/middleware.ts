import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ACCESS, COOKIE_REFRESH } from "@/lib/config";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(
    request.cookies.get(COOKIE_ACCESS)?.value || request.cookies.get(COOKIE_REFRESH)?.value,
  );

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname === "/") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/carpetas", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
