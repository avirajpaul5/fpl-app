interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > entry.ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, fetchedAt: Date.now(), ttlMs });
}

export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheInvalidatePattern(pattern: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(pattern)) store.delete(key);
  }
}

export function cacheMeta(): Record<string, { age: number; ttl: number }> {
  const now = Date.now();
  const result: Record<string, { age: number; ttl: number }> = {};
  for (const [key, entry] of store.entries()) {
    result[key] = {
      age: Math.round((now - entry.fetchedAt) / 1000),
      ttl: Math.round(entry.ttlMs / 1000),
    };
  }
  return result;
}
