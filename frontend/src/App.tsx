import { useEffect, useMemo, useState } from 'react';
import { Moon, Sun, Fuel } from 'lucide-react';
import type { Trend } from './types';
import { fetchTrend, NotReadyError } from './lib/api';
import { type Theme, loadTheme, saveTheme } from './lib/theme';
import { formatMonth } from './lib/series';
import StatTiles from './components/StatTiles';
import TrendChart from './components/TrendChart';
import VersionBadge from './components/VersionBadge';

// Time-window presets for the chart. null = full history (2002 onwards).
const RANGES: { label: string; months: number | null }[] = [
  { label: '1v', months: 12 },
  { label: '3v', months: 36 },
  { label: '5v', months: 60 },
  { label: '10v', months: 120 },
  { label: 'Max', months: null },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-ready' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; trend: Trend };

function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [rangeIdx, setRangeIdx] = useState(3); // default 10v

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const trend = await fetchTrend();
        if (!cancelled) setState({ kind: 'ready', trend });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof NotReadyError) setState({ kind: 'not-ready' });
        else setState({ kind: 'error', message: (err as Error).message });
      }
    }
    load();
    // If the first fetch found the backend still warming up, retry a few times.
    const retry = setInterval(() => {
      setState((s) => {
        if (s.kind === 'ready') {
          clearInterval(retry);
          return s;
        }
        load();
        return s;
      });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(retry);
    };
  }, []);

  const latestMonth = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const months = state.trend.series.flatMap((s) => s.points.map((p) => p.month));
    return months.length ? months.sort().at(-1)! : null;
  }, [state]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Fuel size={22} strokeWidth={2.2} className="brand-icon" />
          <div>
            <h1>Bensa</h1>
            <p className="tagline">Polttoaineiden keskihinnat Suomessa</p>
          </div>
        </div>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Vaalea teema' : 'Tumma teema'}
          title={theme === 'dark' ? 'Vaalea teema' : 'Tumma teema'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="content">
        {state.kind === 'loading' && <p className="status">Ladataan hintatietoja…</p>}
        {state.kind === 'not-ready' && (
          <p className="status">Haetaan tuoreimpia hintoja Tilastokeskukselta…</p>
        )}
        {state.kind === 'error' && (
          <p className="status status-error">Hintatietojen lataus epäonnistui: {state.message}</p>
        )}

        {state.kind === 'ready' && (
          <>
            <section className="section">
              <div className="section-head">
                <h2>Uusin keskihinta</h2>
                {latestMonth && <span className="section-note">{formatMonth(latestMonth)}</span>}
              </div>
              <StatTiles series={state.trend.series} theme={theme} />
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Hintakehitys</h2>
                <div className="range-picker" role="group" aria-label="Aikaväli">
                  {RANGES.map((r, i) => (
                    <button
                      key={r.label}
                      className={`range-btn ${i === rangeIdx ? 'is-active' : ''}`}
                      onClick={() => setRangeIdx(i)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <TrendChart series={state.trend.series} theme={theme} months={RANGES[rangeIdx].months} />
            </section>

            <p className="attribution">
              Lähde: {state.trend.source}. Hinnat sisältävät arvonlisäveron.
            </p>
          </>
        )}
      </main>

      <footer className="footer">
        <span>
          Polttoaineen hintadata:{' '}
          <a href="https://stat.fi" target="_blank" rel="noreferrer">
            Tilastokeskus
          </a>{' '}
          (CC BY 4.0)
        </span>
        <VersionBadge />
      </footer>
    </div>
  );
}

export default App;
