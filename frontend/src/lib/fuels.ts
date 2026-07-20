import type { Theme } from './theme';

// The fuel vocabulary the whole app shares. Keys match the backend's normalised
// fuel keys (see backend/internal/api/statfin.go). Statistics Finland's table
// carries exactly these four pump fuels; the ordering below is canonical and
// drives both the legend and the categorical colour assignment.
//
// Colours are the first four slots of the validated data-viz categorical
// palette, assigned in fixed order (blue, green, magenta, yellow) — the order
// is the colourblind-safety mechanism, not decoration, so it is not reshuffled
// for semantic cuteness. Each slot has a light- and dark-surface step; the two
// are the same hue re-stepped per surface, never an automatic flip.

export type FuelMeta = {
  key: string;
  label: string;
  color: Record<Theme, string>;
};

export const FUELS: FuelMeta[] = [
  { key: '95E10', label: '95E10', color: { light: '#2a78d6', dark: '#3987e5' } },
  { key: '98E5', label: '98E5', color: { light: '#008300', dark: '#008300' } },
  { key: 'diesel', label: 'Diesel', color: { light: '#e87ba4', dark: '#d55181' } },
  { key: 'biokaasu', label: 'Biokaasu', color: { light: '#eda100', dark: '#c98500' } },
];

const BY_KEY = new Map(FUELS.map((f) => [f.key, f]));

export function fuelLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function fuelColor(key: string, theme: Theme): string {
  return BY_KEY.get(key)?.color[theme] ?? '#898781';
}

/** Order an arbitrary set of fuel keys by the canonical FUELS order. */
export function orderFuels(keys: string[]): string[] {
  const rank = new Map(FUELS.map((f, i) => [f.key, i]));
  return [...keys].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
}
