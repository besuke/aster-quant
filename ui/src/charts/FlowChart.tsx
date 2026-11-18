// Carmine Studio の src/components/FlowChart.tsx を写したもの（クラス名だけ qc- を付けて、Infrago Quant の既存のグラフの書式と分けた）。
import { useLayoutEffect, useRef, useState } from "react";

// Cash flows by payment date: receipts above zero, payments below. Bars sit on a date axis
// (ticks on 1 January, labelled with the year). Values come unrounded from the API.

export interface FlowBar {
  date: string;
  x: number; // years from the valuation date
  value: number; // signed
  series: string; // key of the series
  label: string; // what the bar is, for the tooltip
}

export interface FlowSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  title: string;
  origin: string;
  xMax: number;
  bars: FlowBar[];
  series: FlowSeries[];
  yLabel: string;
  formatY: (y: number) => string;
  footer?: React.ReactNode;
  /** A numeric x-axis instead of dates (as in LineChart): its ticks, title and lower end; bars then span `barWidth` in x units. */
  xTicks?: { x: number; label: string }[];
  xLabel?: string;
  xMin?: number;
  barWidth?: number;
  legend?: boolean;
}

const MARGIN = { top: 18, right: 16, bottom: 34, left: 64 };
const DAY_MS = 86_400_000;

function niceTicks(min: number, max: number, count = 5): number[] {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

export function FlowChart({ title, origin, xMax, bars, series, yLabel, formatY, footer, xTicks, xLabel, xMin = 0, barWidth, legend = true }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<FlowBar | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 260;
  const lo = Math.min(0, ...bars.map((b) => b.value));
  const hi = Math.max(0, ...bars.map((b) => b.value));
  const pad = (hi - lo) * 0.06 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const sx = (x: number) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * innerH;
  const color = (k: string) => series.find((s) => s.key === k)?.color ?? "currentColor";
  const barW = barWidth ? Math.max(2, (barWidth / (xMax - xMin)) * innerW - 2) : Math.max(3, Math.min(10, innerW / Math.max(bars.length, 1) / 2));

  const o = Date.parse(`${origin}T00:00:00Z`);
  const step = xMax > 12 ? 5 : width < 520 ? 2 : 1;
  const years: { x: number; label: string }[] = xTicks ? [...xTicks] : [];
  for (let y = Math.ceil((new Date(o).getUTCFullYear() + 1) / step) * step; !xTicks; y += step) {
    const x = (Date.UTC(y, 0, 1) - o) / DAY_MS / 365;
    if (x > xMax) break;
    years.push({ x, label: String(y) });
  }

  return (
    <figure className="qc-chart" ref={ref}>
      <figcaption className="qc-title">{title}</figcaption>
      {legend && <ul className="qc-legend" aria-label="凡例">
        {series.map((s) => (
          <li key={s.key}>
            <svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={s.color} /></svg>
            {s.label}
          </li>
        ))}
      </ul>}
      <div className="qc-body">
        <svg width={width} height={height} role="img" aria-label={`${title}（縦軸：${yLabel}、横軸：${xLabel ?? "支払日"}）`}>
          {niceTicks(yMin, yMax).map((t) => (
            <g key={t}>
              <line className="qc-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(t)} y2={sy(t)} />
              <text className="qc-tick" x={MARGIN.left - 8} y={sy(t)} dy="0.32em" textAnchor="end">{formatY(t)}</text>
            </g>
          ))}
          {years.map((t) => (
            <text key={t.label} className="qc-tick" x={sx(t.x)} y={height - MARGIN.bottom + 17} textAnchor="middle">{t.label}</text>
          ))}
          <line className="qc-axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(0)} y2={sy(0)} />
          {bars.map((b) => {
            const y0 = sy(0);
            const y1 = sy(b.value);
            return (
              <rect key={`${b.series}-${b.date}-${b.label}`} x={sx(b.x) - barW / 2} y={Math.min(y0, y1)} width={barW}
                height={Math.max(1, Math.abs(y1 - y0))} rx="2" fill={color(b.series)} className="qc-bar"
                onPointerEnter={() => setHover(b)} onPointerLeave={() => setHover(null)}>
                <title>{`${b.date} ${b.label}：${formatY(b.value)}`}</title>
              </rect>
            );
          })}
          <text className="qc-axis-label" x={MARGIN.left} y={MARGIN.top - 6}>{yLabel}</text>
          {xLabel && <text className="qc-axis-label" x={width - MARGIN.right} y={height - MARGIN.bottom - 6} textAnchor="end">{xLabel}</text>}
        </svg>
        {hover && (
          <div className="qc-tooltip" style={{ left: Math.min(Math.max(sx(hover.x) + 12, 8), width - 230), top: MARGIN.top }}>
            <div className="qc-tooltip-date">{hover.date}</div>
            <div className="qc-tooltip-row">
              <span className="qc-swatch" style={{ background: color(hover.series) }} />
              <span>{hover.label}</span>
              <span className="num">{formatY(hover.value)}</span>
            </div>
          </div>
        )}
      </div>
      {footer && <div className="qc-footer">{footer}</div>}
    </figure>
  );
}
