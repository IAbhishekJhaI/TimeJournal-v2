import { NextResponse } from "next/server";

/** Lightweight liveness probe (IMPLEMENTATION_PLAN.md §6.1). */
export function GET() {
  return NextResponse.json({ status: "ok", service: "timejournal-v2" });
}
