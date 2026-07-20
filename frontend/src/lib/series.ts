import type { TrendSeries, TrendPoint } from '../types';

// Derived views over the raw series. Kept separate from the components so the
// "what does the latest month say" logic is testable and stated once.

export type FuelSummary = {
  fuel: string;
  latest: TrendPoint;
  // Change vs the previous month and vs the same month a year ago, as signed
  // absolute euro deltas. Undefined when there isn't enough history (only ever
  // true for the first months of the 2002 series, never in practice today).
  momDelta?: number;
  yoyDelta?: number;
};

export function summarise(series: TrendSeries): FuelSummary | null {
  const pts = series.points;
  if (pts.length === 0) return null;
  const latest = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const yearAgo = pts[pts.length - 13];
  return {
    fuel: series.fuel,
    latest,
    momDelta: prev ? round(latest.price - prev.price) : undefined,
    yoyDelta: yearAgo ? round(latest.price - yearAgo.price) : undefined,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// "2026M06" -> "6/2026" for display; falls back to the raw key if it doesn't
// match, so a format change upstream degrades to something readable.
export function formatMonth(month: string): string {
  const m = month.match(/^(\d{4})M(\d{2})$/);
  if (!m) return month;
  return `${Number(m[2])}/${m[1]}`;
}

/** A month key -> a fractional year, for positioning points on a time axis. */
export function monthToX(month: string): number {
  const m = month.match(/^(\d{4})M(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) + (Number(m[2]) - 1) / 12;
}

export function formatPrice(price: number): string {
  return price.toFixed(3).replace('.', ',');
}

export function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${Math.abs(delta).toFixed(3).replace('.', ',')}`;
}
