// Carmine Studio の src/components/LineChart.tsx を写したもの（クラス名だけ qc- を付けて、Infrago Quant の既存のグラフの書式と分けた）。
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

// A small SVG line chart drawn from the API's numbers. One y-axis; the x-axis is the date (ticks at
// 1 January, labelled with the year, as scale_x_date(date_labels = "%Y") in the Quarto figures).
// Series share their x values; the crosshair tooltip reads every series at the nearest date.

export interface SeriesPoint {
  x: number; // years from the evaluation date (Actual/365 Fixed), only for placing the point
  y: number;
  date: string; // ISO date
}

export interface Series {
  key: string;
  label: string;
  color: string; // CSS variable reference
  points: SeriesPoint[];
  dashed?: boolean;
  dots?: SeriesPoint[]; // points drawn as markers (e.g. the pillars), in the series color
  strokeWidth?: number; // default 2; thin lines for many paths
  opacity?: number; // stroke opacity, default 1
  inLegend?: boolean; // false keeps the series out of the legend (one entry stands for many paths drawn alike)
}

interface Props {
  title: string;
  series: Series[];
  origin: string; // the evaluation date (x = 0)
  xMax: number; // years shown
  formatY: (y: number) => string;
  formatTick?: (y: number) => string;
  yLabel: string;
  height?: number;
  markers?: { x: number; label: string }[];
  zeroLine?: boolean;
  footer?: ReactNode;
  /** A numeric x-axis instead of dates: its ticks and its title (x runs from xMin to xMax). */
  xTicks?: { x: number; label: string }[];
  xLabel?: string;
  xMin?: number;
  /** Show the legend (default: when there are two or more series). Off for many paths drawn alike. */
  legend?: boolean;
  /** At most this many rows in the tooltip; the rest are counted. */
  tooltipRows?: number;
  /** A fixed y-range, so that frames of an animation share their axis (default: from the data). */
  yRange?: [number, number];
}

const MARGIN = { top: 18, right: 16, bottom: 34, left: 64 };
const DAY_MS = 86_400_000;

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** 1 January of each year inside the range, every `step` years. */
function yearTicks(origin: string, xMax: number, step: number): { x: number; label: string }[] {
  const o = Date.parse(`${origin}T00:00:00Z`);
  const first = new Date(o).getUTCFullYear() + 1;
  const ticks: { x: number; label: string }[] = [];
  for (let y = Math.ceil(first / step) * step; ; y += step) {
    const x = (Date.UTC(y, 0, 1) - o) / DAY_MS / 365;
    if (x > xMax) break;
    ticks.push({ x, label: String(y) });
  }
  return ticks;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function LineChart({ title, series, origin, xMax, formatY, formatTick, yLabel, height = 280, markers = [], zeroLine, footer, xTicks: customTicks, xLabel, xMin = 0, legend, tooltipRows = Infinity, yRange }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const visible = useMemo(
    () => series.map((s) => ({
      ...s,
      points: s.points.filter((p) => p.x <= xMax + 1e-9),
      dots: s.dots?.filter((p) => p.x <= xMax + 1e-9),
    })),
    [series, xMax],
  );

  const [yMin, yMax] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of visible) for (const p of [...s.points, ...(s.dots ?? [])]) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    if (zeroLine) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (yRange) return yRange;
    if (!Number.isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    return [lo - pad, hi + pad];
  }, [visible, zeroLine, yRange]);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const sx = (x: number) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * innerH;

  const yTicks = niceTicks(yMin, yMax);
  const yearStep = xMax > 12 ? 5 : width < 600 ? 2 : 1;
  const xTicks = customTicks ?? yearTicks(origin, xMax, yearStep);
  const base = visible[0]?.points ?? [];

  const path = (pts: SeriesPoint[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    if (!base.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = xMin + ((e.clientX - rect.left) / rect.width) * (xMax - xMin);
    let lo = 0;
    let hi = base.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (base[mid].x < x) lo = mid;
      else hi = mid;
    }
    setHover(Math.abs(base[lo].x - x) <= Math.abs(base[hi].x - x) ? lo : hi);
  }

  const hp = hover !== null ? base[hover] : null;
  const tipLeft = hp ? Math.min(Math.max(sx(hp.x) + 12, 8), width - 230) : 0;

  return (
    <figure className="qc-chart" ref={wrapRef}>
      <figcaption className="qc-title">{title}</figcaption>
      {(legend ?? visible.length > 1) && (
        <ul className="qc-legend" aria-label="凡例">
          {visible.filter((s) => s.inLegend !== false).map((s) => (
            <li key={s.key}>
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" x2="21" y1="5" y2="5" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="qc-body">
        <svg width={width} height={height} role="img" aria-label={`${title}（縦軸：${yLabel}、横軸：日付）`}>
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line className="qc-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(t)} y2={sy(t)} />
              <text className="qc-tick" x={MARGIN.left - 8} y={sy(t)} dy="0.32em" textAnchor="end">
                {(formatTick ?? formatY)(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <g key={`x${i}-${t.label}`}>
              <line className="qc-axis" x1={sx(t.x)} x2={sx(t.x)} y1={height - MARGIN.bottom} y2={height - MARGIN.bottom + 4} />
              <text className="qc-tick" x={sx(t.x)} y={height - MARGIN.bottom + 17} textAnchor="middle">{t.label}</text>
            </g>
          ))}
          <line className="qc-axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={height - MARGIN.bottom} y2={height - MARGIN.bottom} />
          {zeroLine && yMin < 0 && yMax > 0 && (
            <line className="qc-axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(0)} y2={sy(0)} />
          )}
          {markers.filter((m) => m.x <= xMax).map((m, k) => (
            <g key={m.label}>
              <line className="qc-marker" x1={sx(m.x)} x2={sx(m.x)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
              <text className="qc-marker-label" x={sx(m.x) + 4} y={MARGIN.top + 10 + (k % 2) * 13}>{m.label}</text>
            </g>
          ))}
          {visible.map((s) => (
            <path key={s.key} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.strokeWidth ?? 2} strokeOpacity={s.opacity}
              strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" />
          ))}
          {visible.map((s) => s.dots?.map((p) => (
            <circle key={`${s.key}-${p.date}`} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={s.color} className="qc-dot" />
          )))}
          {hp && (
            <g>
              <line className="qc-crosshair" x1={sx(hp.x)} x2={sx(hp.x)} y1={MARGIN.top} y2={height - MARGIN.bottom} />
              {visible.map((s) => {
                const p = s.points[hover!];
                return p ? <circle key={s.key} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={s.color} className="qc-dot" /> : null;
              })}
            </g>
          )}
          <rect x={MARGIN.left} y={MARGIN.top} width={Math.max(innerW, 0)} height={Math.max(innerH, 0)} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          <text className="qc-axis-label" x={MARGIN.left} y={MARGIN.top - 6}>{yLabel}</text>
          {xLabel && <text className="qc-axis-label" x={width - MARGIN.right} y={height - MARGIN.bottom - 6} textAnchor="end">{xLabel}</text>}
        </svg>
        {hp && (
          <div className="qc-tooltip" style={{ left: tipLeft, top: MARGIN.top }}>
            <div className="qc-tooltip-date">{hp.date}</div>
            {visible.slice(0, tooltipRows).map((s) => {
              const p = s.points[hover!];
              return p ? (
                <div key={s.key} className="qc-tooltip-row">
                  <span className="qc-swatch" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <span className="num">{formatY(p.y)}</span>
                </div>
              ) : null;
            })}
            {visible.length > tooltipRows && <div className="qc-tooltip-row muted">ほか {visible.length - tooltipRows} 系列</div>}
          </div>
        )}
      </div>
      {footer && <div className="qc-footer">{footer}</div>}
    </figure>
  );
}
