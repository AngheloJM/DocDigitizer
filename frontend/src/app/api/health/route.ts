import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/config";

export async function GET(_request: NextRequest) {
  try {
    const upstream = await fetch(`${BACKEND_URL}/health`, { cache: "no-store" });
    const body = await upstream.json().catch(() => ({ status: "error" }));
    return NextResponse.json({ ok: upstream.ok, backend: BACKEND_URL, ...body }, { status: upstream.ok ? 200 : 502 });
  } catch {
    return NextResponse.json(
      { ok: false, backend: BACKEND_URL, status: "unreachable" },
      { status: 502 },
    );
  }
}
