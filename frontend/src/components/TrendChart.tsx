import { useMemo, useRef, useState } from 'react';
import type { TrendSeries } from '../types';
import { type Theme } from '../lib/theme';
import { fuelColor, fuelLabel, orderFuels } from '../lib/fuels';
import { formatMonth, formatPrice, monthToX } from '../lib/series';

type Props = {
  series: TrendSeries[];
  theme: Theme;
  // Show only the last `months` months; null = full history.
  months: number | null;
};

// Fixed viewBox, scaled to the container by CSS — crisp at any width without a
// resize observer. Chrome (grid, axes, labels) is recessive; the four series
// lines are the only saturated marks.
const VB_W = 960;
const VB_H = 420;
const PAD = { top: 20, right: 64, bottom: 34, left: 46 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

type Ink = {
  grid: string;
  axis: string;
  muted: string;
  primary: string;
  surface: string;
};

const INK: Record<Theme, Ink> = {
  light: { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', primary: '#0b0b0b', surface: '#fcfcfb' },
  dark: { grid: '#2c2c2a', axis: '#383835', muted: '#898781', primary: '#ffffff', surface: '#1a1a19' },
};

type PlotPoint = { month: string; price: number; x: number; y: number };
type PlotSeries = { fuel: string; color: string; points: PlotPoint[] };

function TrendChart({ series, theme, months }: Props) {
  const ink = INK[theme];
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Trim each series to the requested window, then compute a shared x (time)
  // and y (price) scale across every visible fuel so the lines are comparable
  // on one axis — never a per-series scale.
  const { plot, xs, months: monthKeys, yMin, yMax } = useMemo(() => {
    const trimmed = orderFuels(series.map((s) => s.fuel)).map((fuel) => {
      const s = series.find((x) => x.fuel === fuel)!;
      const pts = months ? s.points.slice(-months) : s.points;
      return { fuel, points: pts };
    });

    // The x-domain is the union of month keys present (all series share the
    // same monthly cadence, but guard anyway).
    const allMonths = new Set<string>();
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of trimmed) {
      for (const p of s.points) {
        allMonths.add(p.month);
        if (p.price < lo) lo = p.price;
        if (p.price > hi) hi = p.price;
      }
    }
    const monthKeys = [...allMonths].sort();
    if (monthKeys.length === 0) {
      return { plot: [] as PlotSeries[], xs: [] as number[], months: [] as string[], yMin: 0, yMax: 1 };
    }

    const xVals = monthKeys.map(monthToX);
    const xLo = xVals[0];
    const xHi = xVals[xVals.length - 1];
    const xSpan = xHi - xLo || 1;
    // Pad the price axis a little so lines don't kiss the frame.
    const yPad = (hi - lo) * 0.08 || 0.05;
    const yMin = Math.max(0, lo - yPad);
    const yMax = hi + yPad;
    const ySpan = yMax - yMin || 1;

    const sx = (yearFrac: number) => PAD.left + ((yearFrac - xLo) / xSpan) * PLOT_W;
    const sy = (price: number) => PAD.top + (1 - (price - yMin) / ySpan) * PLOT_H;

    const xs = xVals.map(sx);

    const plot: PlotSeries[] = trimmed.map((s) => ({
      fuel: s.fuel,
      color: fuelColor(s.fuel, theme),
      points: s.points.map((p) => ({
        month: p.month,
        price: p.price,
        x: sx(monthToX(p.month)),
        y: sy(p.price),
      })),
    }));

    return { plot, xs, months: monthKeys, yMin, yMax };
  }, [series, months, theme]);

  // Y gridlines at rounded euro steps.
  const yTicks = useMemo(() => niceTicks(yMin, yMax, 5), [yMin, yMax]);
  // X labels: a handful of year marks, evenly spaced across whatever window.
  const xTicks = useMemo(() => yearTicks(monthKeys), [monthKeys]);

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || xs.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VB_W;
    // Nearest month by x.
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  const hoverMonth = hoverIdx !== null ? monthKeys[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? xs[hoverIdx] : null;

  // End-labels sit at each line's final point, but the latest prices often
  // cluster within a few cents, so the labels would overlap. Spread them
  // vertically (keeping their order) with a minimum gap, without moving the
  // lines themselves.
  const endLabels = useMemo(() => {
    const items = plot
      .map((s) => {
        const last = s.points[s.points.length - 1];
        return last ? { fuel: s.fuel, color: s.color, y: last.y } : null;
      })
      .filter((x): x is { fuel: string; color: string; y: number } => x !== null)
      .sort((a, b) => a.y - b.y);

    const GAP = 15;
    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < GAP) items[i].y = items[i - 1].y + GAP;
    }
    // If pushing down overflowed the plot, shift the whole stack up to fit.
    const overflow = items.length ? items[items.length - 1].y - (PAD.top + PLOT_H) : 0;
    if (overflow > 0) for (const it of items) it.y -= overflow;
    return items;
  }, [plot]);

  const y = (price: number) => {
    const ySpan = yMax - yMin || 1;
    return PAD.top + (1 - (price - yMin) / ySpan) * PLOT_H;
  };

  return (
    <figure className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="chart-svg"
        role="img"
        aria-label="Polttoaineiden keskihintojen kehitys"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Y grid + labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(t)} y2={y(t)} stroke={ink.grid} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill={ink.muted}>
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X year labels */}
        {xTicks.map((t) => (
          <text key={t.month} x={t.x != null ? t.x : 0} y={VB_H - 12} textAnchor="middle" fontSize={12} fill={ink.muted}>
            {t.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hoverX !== null && (
          <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + PLOT_H} stroke={ink.axis} strokeWidth={1} strokeDasharray="3 3" />
        )}

        {/* Series lines */}
        {plot.map((s) => (
          <path
            key={s.fuel}
            d={linePath(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Direct end-labels (identity without reading the legend), spread
            vertically so clustered latest-prices don't collide. */}
        {endLabels.map((l) => (
          <text key={l.fuel} x={PAD.left + PLOT_W + 6} y={l.y} dominantBaseline="middle" fontSize={12} fontWeight={600} fill={l.color}>
            {fuelLabel(l.fuel)}
          </text>
        ))}

        {/* Hover markers */}
        {hoverIdx !== null &&
          plot.map((s) => {
            const p = s.points[hoverIdx];
            if (!p) return null;
            return <circle key={s.fuel} cx={p.x} cy={p.y} r={4} fill={s.color} stroke={ink.surface} strokeWidth={2} />;
          })}
      </svg>

      {/* Hover tooltip, rendered as HTML above the SVG for crisp text */}
      {hoverIdx !== null && hoverMonth && (
        <div
          className="chart-tooltip"
          style={{ left: `${((hoverX ?? 0) / VB_W) * 100}%` }}
        >
          <div className="chart-tooltip-month">{formatMonth(hoverMonth)}</div>
          {orderFuels(plot.map((s) => s.fuel)).map((fuel) => {
            const s = plot.find((x) => x.fuel === fuel)!;
            const p = s.points[hoverIdx];
            if (!p) return null;
            return (
              <div key={fuel} className="chart-tooltip-row">
                <span className="chart-swatch" style={{ background: s.color }} />
                <span className="chart-tooltip-label">{fuelLabel(fuel)}</span>
                <span className="chart-tooltip-value">{formatPrice(p.price)} €</span>
              </div>
            );
          })}
        </div>
      )}
    </figure>
  );
}

function linePath(points: PlotPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// Rounded, human-friendly y ticks spanning [min,max].
function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

// One label per January present in the window (or evenly sampled if the window
// is short), positioned at its x. Requires the same scale as the plot, so we
// recompute x from the month key against the visible domain.
function yearTicks(monthKeys: string[]): { month: string; label: string; x: number }[] {
  if (monthKeys.length === 0) return [];
  const xVals = monthKeys.map(monthToX);
  const xLo = xVals[0];
  const xHi = xVals[xVals.length - 1];
  const xSpan = xHi - xLo || 1;
  const sx = (yf: number) => PAD.left + ((yf - xLo) / xSpan) * PLOT_W;

  const years = [...new Set(monthKeys.map((m) => m.slice(0, 4)))];
  // Thin out to at most ~8 labels so they never collide.
  const stride = Math.ceil(years.length / 8);
  const picked = years.filter((_, i) => i % stride === 0);
  return picked.map((yr) => {
    // Anchor the label at that year's first present month.
    const month = monthKeys.find((m) => m.startsWith(yr)) ?? `${yr}M01`;
    return { month, label: yr, x: sx(monthToX(month)) };
  });
}

export default TrendChart;
