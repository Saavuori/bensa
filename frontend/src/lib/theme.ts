// Theme identity shared by the CSS variables (via a data-theme attribute on
// <html>), the MapLibre basemap, and every color helper in lib/. Dark is the
// default; the choice is explicit — the OS setting is deliberately not read.

export type Theme = 'dark' | 'light';

export const BASEMAP_STYLES: Record<Theme, string> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

/** Outline drawn around map markers so they stay legible against the basemap. */
export const MARKER_STROKE: Record<Theme, string> = {
  dark: '#ffffff',
  light: '#1f2937',
};

const STORAGE_KEY = 'bensa-theme';

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // Private-mode / blocked storage — fall back to the default.
    return 'dark';
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* persistence is a nicety, not worth failing the toggle over */
  }
}
