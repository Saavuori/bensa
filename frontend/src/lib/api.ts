import type { Trend } from '../types';

// The trend endpoint is served by the Go backend; in dev, Vite proxies /api to
// it. A 503 is a real, expected state (the first upstream fetch hasn't landed
// yet), so it's surfaced distinctly rather than lumped in with network errors.

export class NotReadyError extends Error {}

export async function fetchTrend(): Promise<Trend> {
  const res = await fetch('/api/trend');
  if (res.status === 503) throw new NotReadyError('data not ready yet');
  if (!res.ok) throw new Error(`/api/trend: HTTP ${res.status}`);
  return res.json() as Promise<Trend>;
}
