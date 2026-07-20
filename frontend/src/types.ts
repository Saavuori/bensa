// Mirrors backend/internal/models. Kept in sync by hand — the two are small.

export type TrendPoint = {
  month: string; // PxWeb period key, e.g. "2026M06"
  price: number;
};

export type TrendSeries = {
  fuel: string; // normalised key: 95E10, 98E5, diesel, biokaasu
  points: TrendPoint[];
};

export type Trend = {
  series: TrendSeries[];
  fetchedAt: string;
  source: string;
};
