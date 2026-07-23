/**
 * Single choke point for reporting unexpected server errors. Today it emits a
 * structured JSON line (greppable in Vercel logs); it's the one place to plug
 * in Sentry later — `npm i @sentry/nextjs`, then call
 * `Sentry.captureException(error)` here and add `instrumentation.ts`. Keeping
 * it behind this function means no route code changes when that happens
 * (IMPLEMENTATION_PLAN.md §2.7 / §6.1).
 */
/** Walk the `.cause` chain and pull out Postgres error fields if present. */
function unwrapCause(error: unknown): Record<string, unknown> | undefined {
  let cur: unknown = error;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    const c = (cur as { cause?: unknown }).cause;
    if (c === undefined) break;
    cur = c;
  }
  if (!cur || cur === error) return undefined;
  const e = cur as Record<string, unknown>;
  return {
    causeMessage: e.message,
    // Postgres (postgres-js) error fields — the useful bits.
    pgCode: e.code,
    pgDetail: e.detail,
    pgHint: e.hint,
    pgseverity: e.severity,
    pgRoutine: e.routine,
  };
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    level: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...unwrapCause(error),
    ...context,
    at: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}
