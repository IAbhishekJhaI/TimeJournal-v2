/**
 * Single choke point for reporting unexpected server errors. Today it emits a
 * structured JSON line (greppable in Vercel logs); it's the one place to plug
 * in Sentry later — `npm i @sentry/nextjs`, then call
 * `Sentry.captureException(error)` here and add `instrumentation.ts`. Keeping
 * it behind this function means no route code changes when that happens
 * (IMPLEMENTATION_PLAN.md §2.7 / §6.1).
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    level: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    at: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}
