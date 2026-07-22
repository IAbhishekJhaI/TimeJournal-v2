import { ApiError } from "./errors";

/**
 * Best-effort in-memory sliding-window rate limiter.
 *
 * Scope caveat: this counts requests within a single serverless instance's
 * memory. On Vercel each instance limits independently, so the effective
 * ceiling is (limit x live instances). That's fine as an abuse guard at this
 * scale (<=20 users); for a hard global limit, swap the `hits` store for
 * Upstash Redis (`@upstash/ratelimit`) behind the same `checkRateLimit`
 * signature (IMPLEMENTATION_PLAN.md §2.7).
 */
const buckets = new Map<string, number[]>();

export interface RateLimit {
  limit: number;
  windowMs: number;
}

// Sensible defaults per logical action; tune as real usage appears.
export const RATE_LIMITS = {
  entriesWrite: { limit: 120, windowMs: 60_000 }, // heavy painting bursts
  quicklogParse: { limit: 60, windowMs: 60_000 },
  import: { limit: 5, windowMs: 60 * 60_000 }, // rare, expensive
  exportNow: { limit: 12, windowMs: 60_000 },
} as const satisfies Record<string, RateLimit>;

/**
 * Records a hit for `key` and throws ApiError(429) if it exceeds `limit`
 * within `windowMs`. `key` should include the user id and the action, e.g.
 * `entries:write:<uid>`.
 */
export function checkRateLimit(key: string, { limit, windowMs }: RateLimit): void {
  const now = Date.now();
  const cutoff = now - windowMs;

  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  buckets.set(key, hits);

  if (hits.length > limit) {
    const retryAfterMs = windowMs - (now - hits[0]);
    throw new ApiError(
      429,
      `rate limit exceeded, retry in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
  }

  // Opportunistic cleanup so the map doesn't grow unbounded for idle keys.
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) {
      const live = v.filter((t) => t > cutoff);
      if (live.length === 0) buckets.delete(k);
      else buckets.set(k, live);
    }
  }
}

/** Test-only: clears all rate-limit state. */
export function __resetRateLimits(): void {
  buckets.clear();
}
