// Theme identity shared by the CSS variables (via a data-theme attribute on
// <html>) and the fuel colours in lib/fuels.ts. Dark is the default; the
// choice is explicit — the OS setting is deliberately not read.

export type Theme = 'dark' | 'light';

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
