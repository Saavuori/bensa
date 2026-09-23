import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { TrendSeries } from '../types';
import type { Theme } from '../lib/theme';
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

// Chrome colours come from the theme tokens in index.css, so the chart and
// the page can't drift apart; only the series colours are picked in JS.
const GRID = { stroke: 'var(--grid)' };
const AXIS = { stroke: 'var(--axis)' };
const MUTED = { fill: 'var(--muted)' };
const SURFACE = { stroke: 'var(--surface)' };

type PlotPoint = { month: string; price: number; x: number; y: number };
type PlotSeries = { fuel: string; color: string; points: PlotPoint[]; byMonth: Map<string, PlotPoint> };

type Layout = {
  plot: PlotSeries[];
  months: string[]; // month keys in the window, oldest first
  xs: number[]; // x of each entry in `months`
  yTicks: { value: number; y: number }[];
  xTicks: { month: string; label: string; x: number }[];
};

const EMPTY: Layout = { plot: [], months: [], xs: [], yTicks: [], xTicks: [] };

function TrendChart({ series, theme, months }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Cut every series to one shared window — the last `months` months across
  // all fuels, not each series' own last `months` points, since biogas only
  // starts in 2025 — then compute a shared x (time) and y (price) scale so the
  // lines are comparable on one axis, never a per-series scale.
  const { plot, months: monthKeys, xs, yTicks, xTicks } = useMemo((): Layout => {
    const allMonths = [...new Set(series.flatMap((s) => s.points.map((p) => p.month)))].sort();
    const monthKeys = months ? allMonths.slice(-months) : allMonths;
    if (monthKeys.length === 0) return EMPTY;
    const inWindow = new Set(monthKeys);

    const trimmed = orderFuels(series.map((s) => s.fuel)).map((fuel) => {
      const s = series.find((x) => x.fuel === fuel)!;
      return { fuel, points: s.points.filter((p) => inWindow.has(p.month)) };
    });

    let lo = Infinity;
    let hi = -Infinity;
    for (const s of trimmed) {
      for (const p of s.points) {
        if (p.price < lo) lo = p.price;
        if (p.price > hi) hi = p.price;
      }
    }

    const xVals = monthKeys.map(monthToX);
    const xLo = xVals[0];
    const xSpan = xVals[xVals.length - 1] - xLo || 1;
    // Pad the price axis a little so lines don't kiss the frame.
    const yPad = (hi - lo) * 0.08 || 0.05;
    const yMin = Math.max(0, lo - yPad);
    const yMax = hi + yPad;
    const ySpan = yMax - yMin || 1;

    const sx = (yearFrac: number) => PAD.left + ((yearFrac - xLo) / xSpan) * PLOT_W;
    const sy = (price: number) => PAD.top + (1 - (price - yMin) / ySpan) * PLOT_H;

    const plot = trimmed.map((s) => {
      const points = s.points.map((p) => ({ month: p.month, price: p.price, x: sx(monthToX(p.month)), y: sy(p.price) }));
      return { fuel: s.fuel, color: fuelColor(s.fuel, theme), points, byMonth: new Map(points.map((p) => [p.month, p])) };
    });

    return {
      plot,
      months: monthKeys,
      xs: xVals.map(sx),
      // Y gridlines at rounded euro steps.
      yTicks: niceTicks(yMin, yMax, 5).map((value) => ({ value, y: sy(value) })),
      // X labels: a handful of year marks, evenly spaced across whatever window.
      xTicks: yearTicks(monthKeys).map((t) => ({ ...t, x: sx(monthToX(t.month)) })),
    };
  }, [series, months, theme]);

  function handleMove(e: PointerEvent<SVGSVGElement>) {
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

  // Switching to a shorter window can leave the index past the new end.
  const hoverMonth = hoverIdx !== null ? (monthKeys[hoverIdx] ?? null) : null;
  const hoverX = hoverMonth !== null ? xs[hoverIdx!] : null;
  // Look points up by month, never by index: the series cover different spans.
  const hovered = hoverMonth
    ? plot.flatMap((s) => {
        const p = s.byMonth.get(hoverMonth);
        return p ? [{ fuel: s.fuel, color: s.color, point: p }] : [];
      })
    : [];

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
          <g key={t.value}>
            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={t.y} y2={t.y} style={GRID} strokeWidth={1} />
            <text x={PAD.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle" fontSize={12} style={MUTED}>
              {t.value.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X year labels */}
        {xTicks.map((t) => (
          <text key={t.month} x={t.x} y={VB_H - 12} textAnchor="middle" fontSize={12} style={MUTED}>
            {t.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hoverX !== null && (
          <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + PLOT_H} style={AXIS} strokeWidth={1} strokeDasharray="3 3" />
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
        {hovered.map((h) => (
          <circle key={h.fuel} cx={h.point.x} cy={h.point.y} r={4} fill={h.color} style={SURFACE} strokeWidth={2} />
        ))}
      </svg>

      {/* Hover tooltip, rendered as HTML above the SVG for crisp text */}
      {hoverMonth !== null && hoverX !== null && (
        <div className="chart-tooltip" style={{ left: `${(hoverX / VB_W) * 100}%` }}>
          <div className="chart-tooltip-month">{formatMonth(hoverMonth)}</div>
          {hovered.map((h) => (
            <div key={h.fuel} className="chart-tooltip-row">
              <span className="chart-swatch" style={{ background: h.color }} />
              <span className="chart-tooltip-label">{fuelLabel(h.fuel)}</span>
              <span className="chart-tooltip-value">{formatPrice(h.point.price)} €</span>
            </div>
          ))}
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

// One label per year present in the window (thinned out if the window is
// long), anchored at that year's first present month; the caller positions it
// on the plot's x scale.
function yearTicks(monthKeys: string[]): { month: string; label: string }[] {
  const years = [...new Set(monthKeys.map((m) => m.slice(0, 4)))];
  // Thin out to at most ~8 labels so they never collide.
  const stride = Math.ceil(years.length / 8);
  const picked = years.filter((_, i) => i % stride === 0);
  return picked.map((yr) => ({ month: monthKeys.find((m) => m.startsWith(yr))!, label: yr }));
}

export default TrendChart;
