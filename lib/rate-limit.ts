const buckets = new Map<string, number[]>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

/**
 * In-memory, best-effort rate limiter. Designed to stop runaway loops inside
 * a single server instance. Uses a simple sliding window per scope+key.
 */
export function consumeRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${scope}:${key}`;
  const existing = buckets.get(bucketKey) || [];
  const recent = existing.filter((ts) => now - ts < windowMs);

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfterMs = windowMs - (now - oldest);
    buckets.set(bucketKey, recent);
    return { allowed: false, retryAfterMs };
  }

  recent.push(now);
  buckets.set(bucketKey, recent);
  return { allowed: true, retryAfterMs: 0 };
}
