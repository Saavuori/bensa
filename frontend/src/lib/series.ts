import type { TrendSeries, TrendPoint } from '../types';

// Derived views over the raw series. Kept separate from the components so the
// "what does the latest month say" logic is testable and stated once.

export type FuelSummary = {
  fuel: string;
  latest: TrendPoint;
  // Change vs the same month a year earlier, as a signed absolute euro delta.
  // Undefined when the series has no point for that month — biogas, for one,
  // only starts in 2025M01.
  yoyDelta?: number;
};

export function summarise(series: TrendSeries): FuelSummary | null {
  const pts = series.points;
  if (pts.length === 0) return null;
  const latest = pts[pts.length - 1];
  // Look the month up by key, not by counting 12 points back: the backend
  // drops months PxWeb reports as null, so a series can have gaps.
  const yearAgo = pts.find((p) => p.month === shiftMonth(latest.month, -12));
  return {
    fuel: series.fuel,
    latest,
    yoyDelta: yearAgo ? round(latest.price - yearAgo.price) : undefined,
  };
}

// "2026M06" -> [2026, 6]; null if the key isn't in PxWeb's monthly format.
function parseMonth(month: string): [year: number, month: number] | null {
  const m = month.match(/^(\d{4})M(\d{2})$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Move a "2026M06" key by `delta` months; unparseable keys come back as-is. */
export function shiftMonth(month: string, delta: number): string {
  const ym = parseMonth(month);
  if (!ym) return month;
  const i = ym[0] * 12 + ym[1] - 1 + delta;
  return `${Math.floor(i / 12)}M${String((i % 12) + 1).padStart(2, '0')}`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// "2026M06" -> "6/2026" for display; falls back to the raw key if it doesn't
// match, so a format change upstream degrades to something readable.
export function formatMonth(month: string): string {
  const ym = parseMonth(month);
  return ym ? `${ym[1]}/${ym[0]}` : month;
}

/** A month key -> a fractional year, for positioning points on a time axis. */
export function monthToX(month: string): number {
  const ym = parseMonth(month);
  return ym ? ym[0] + (ym[1] - 1) / 12 : 0;
}

export function formatPrice(price: number): string {
  return price.toFixed(3).replace('.', ',');
}

export function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${Math.abs(delta).toFixed(3).replace('.', ',')}`;
}
