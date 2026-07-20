import type { TrendSeries } from '../types';
import type { Theme } from '../lib/theme';
import { fuelColor, fuelLabel, orderFuels } from '../lib/fuels';
import { formatDelta, formatMonth, formatPrice, summarise } from '../lib/series';

type Props = {
  series: TrendSeries[];
  theme: Theme;
};

// One tile per fuel: the latest national average, plus year-on-year change.
// A stat tile, not a chart — the number is the headline; the tiny delta is
// secondary. For fuel prices, "up" is bad for the reader, so rising prices are
// coloured as the negative/critical state and falling as good, regardless of
// arrow direction.
function StatTiles({ series, theme }: Props) {
  const summaries = orderFuels(series.map((s) => s.fuel))
    .map((fuel) => summarise(series.find((s) => s.fuel === fuel)!))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="tiles">
      {summaries.map((s) => {
        const yoy = s.yoyDelta;
        const dir = yoy === undefined ? 'flat' : yoy > 0 ? 'up' : yoy < 0 ? 'down' : 'flat';
        return (
          <div className="tile" key={s.fuel}>
            <div className="tile-head">
              <span className="tile-dot" style={{ background: fuelColor(s.fuel, theme) }} />
              <span className="tile-label">{fuelLabel(s.fuel)}</span>
            </div>
            <div className="tile-value">
              {formatPrice(s.latest.price)} <span className="tile-unit">€/l</span>
            </div>
            <div className="tile-foot">
              {yoy !== undefined && (
                <span className={`tile-delta tile-delta-${dir}`}>
                  {formatDelta(yoy)} €&nbsp;v/v
                </span>
              )}
              <span className="tile-month">{formatMonth(s.latest.month)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default StatTiles;
