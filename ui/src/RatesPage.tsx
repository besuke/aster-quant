import { useEffect, useMemo, useState } from "react";
import { api, fmt, type OisCurves, type OisDataset } from "./api";
import YieldCurvePage from "./YieldCurvePage";

// 日米の国債金利・OIS。国債の公表利回り（比較用）と評価用の OIS（オファーシートの ASW が使うカーブ）を切り替えて見る。
// どちらの表示も一度取得したデータを保ち、切り替えで取り直さない。計算はサーバー（OIS は RiemannFinMath）。

type View = "yields" | "ois";

export default function RatesPage() {
  const [view, setView] = useState<View>("yields");
  return (
    <div className="page">
      <section className="intro intro-bar">
        <h1>日米の国債金利・OIS</h1>
        <div className="segmented" role="group" aria-label="表示する金利">
          <button aria-pressed={view === "yields"} onClick={() => setView("yields")} data-testid="view-yields">
            国債の公表利回り
          </button>
          <button aria-pressed={view === "ois"} onClick={() => setView("ois")} data-testid="view-ois">
            評価用 OIS
          </button>
        </div>
      </section>
      <div hidden={view !== "yields"}>
        <YieldCurvePage />
      </div>
      <div hidden={view !== "ois"}>
        <OisView />
      </div>
    </div>
  );
}

const CCY_ORDER = ["USD", "JPY", "EUR"]; // 色の順（米国＝青、日本＝橙、ユーロ＝緑）は国債の表示とそろえる
const CCY_NAME: Record<string, string> = { USD: "USD（SOFR）", JPY: "JPY（TONA）", EUR: "EUR（€STR）", GBP: "GBP（SONIA）" };
const cssKey = (c: string) => (c === "USD" ? "US" : c === "JPY" ? "JP" : c);

function OisView() {
  const [datasets, setDatasets] = useState<OisDataset[] | null>(null);
  const [aswId, setAswId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [curves, setCurves] = useState<Record<string, OisCurves>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .oisDatasets()
      .then((r) => {
        setDatasets(r.datasets);
        setAswId(r.asw.id);
        setSelected(r.datasets[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!selected || curves[selected]) return;
    api
      .oisCurves(selected)
      .then((c) => setCurves((m) => ({ ...m, [selected]: c })))
      .catch((e: Error) => setError(e.message));
  }, [selected, curves]);

  const data = selected ? curves[selected] : undefined;
  return (
    <section className="card" data-testid="ois-view">
      <div className="controls-bar">
        <div className="row spread">
          <label className="small">
            保存済みの OIS：
            <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} aria-label="OIS のデータ">
              {(datasets ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.base_date}・{d.label}（{d.currencies.join("・")}）{d.id === aswId ? "・オファーシートで使用中" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data && (
          <div className="source-line" data-testid="ois-source">
            <span>
              <b>評価用 OIS</b>（オファーシートの ASW と同じカーブ）
            </span>
            <span>出典：{data.label}{data.curves[0]?.source ? `（${data.curves[0].source}）` : ""}</span>
            <span>
              基準日：<b>{data.base_date}</b>
              {data.curves[0]?.quote_time ? `（${data.curves[0].quote_time}）` : ""}
            </span>
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {datasets && !datasets.length && <p className="muted">保存済みの OIS がない。</p>}
      {!data && !error && datasets?.length ? <p className="muted">RiemannFinMath でカーブを作っている…</p> : null}
      {data && (
        <div className="two-col">
          <div className="panel-col">
            <OisChart data={data} />
            <p className="muted small">
              {data.conventions.curve}。{data.conventions.zero}。
            </p>
          </div>
          <div className="panel-col">
            <OisTable data={data} />
          </div>
        </div>
      )}
    </section>
  );
}

const W = 760, H = 360, M = { l: 52, r: 96, t: 20, b: 40 };

function OisChart({ data }: { data: OisCurves }) {
  const ok = data.curves.filter((c) => c.status === "success").sort((a, b) => CCY_ORDER.indexOf(a.currency) - CCY_ORDER.indexOf(b.currency));
  const [hover, setHover] = useState<number | null>(null);
  const xMax = Math.ceil(Math.max(...ok.flatMap((c) => c.curve!.map((p) => p.years)), 1));
  const ys = ok.flatMap((c) => c.curve!.map((p) => p.zero_pct));
  const yAxis = useMemo(() => {
    const lo = Math.min(...ys, 0), hi = Math.max(...ys);
    const step = [0.25, 0.5, 1, 2].find((s) => (hi - lo) / s <= 8) ?? 2;
    const ticks: number[] = [];
    for (let t = Math.floor(lo / step) * step; t <= Math.ceil(hi / step) * step + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
    return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
  }, [ys]);
  const x = (t: number) => M.l + (t / xMax) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - yAxis.min) / (yAxis.max - yAxis.min)) * (H - M.t - M.b);
  const xTicks = [1, 2, 5, 10, 15, 20, 30].filter((t) => t <= xMax);
  const at = (c: (typeof ok)[number], t: number) => c.curve!.reduce((b, p) => (Math.abs(p.years - t) < Math.abs(b.years - t) ? p : b));
  return (
    <figure className="chart">
      <figcaption>
        <b>ゼロ金利（連続複利、基準日 {data.base_date}）</b>
        <span className="legend">
          {ok.map((c) => (
            <span key={c.currency}>
              <svg width="26" height="12" aria-hidden="true">
                <line x1="1" y1="6" x2="25" y2="6" className={`ln-${cssKey(c.currency)}`} />
              </svg>
              {CCY_NAME[c.currency] ?? c.currency}
            </span>
          ))}
          <span>● 気配の期日（ピラー）</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${data.base_date} の OIS ゼロ金利カーブ`} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const t = ((px - M.l) / (W - M.l - M.r)) * xMax;
          setHover(t >= 0 && t <= xMax ? t : null);
        }}>
        {yAxis.ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : "grid"} />
            <text x={M.l - 8} y={y(t) + 4} className="tick" textAnchor="end">{t.toFixed(2)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - M.b + 16} className="tick" textAnchor="middle">{t}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} className="axis-label" textAnchor="middle">年（基準日から）</text>
        {ok.map((c) => {
          const k = cssKey(c.currency);
          const d = c.curve!.map((p, i) => `${i ? "L" : "M"}${x(p.years)},${y(p.zero_pct)}`).join("");
          const last = c.curve![c.curve!.length - 1];
          return (
            <g key={c.currency}>
              <path d={d} className={`ln-${k}`} />
              {c.quotes!.map((q) => (
                <circle key={q.tenor} cx={x(q.years)} cy={y(q.zero_pct)} r={3.5} className={`pt-${k}`} />
              ))}
              <text x={x(last.years) + 8} y={y(last.zero_pct) + 4} className="direct-label">{c.currency}</text>
            </g>
          );
        })}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="crosshair" />
            <g transform={`translate(${Math.min(x(hover) + 12, W - M.r - 170)},${M.t + 4})`} className="tooltip" pointerEvents="none">
              <rect width="168" height={22 + ok.length * 16} rx="6" />
              <text x="10" y="16" className="tt-title">{hover.toFixed(2)} 年</text>
              {ok.map((c, i) => (
                <text key={c.currency} x="10" y={32 + i * 16} className="tt-row">{c.currency}：{at(c, hover).zero_pct.toFixed(4)}%</text>
              ))}
            </g>
          </>
        )}
      </svg>
    </figure>
  );
}

function OisTable({ data }: { data: OisCurves }) {
  const ok = data.curves.filter((c) => c.status === "success").sort((a, b) => CCY_ORDER.indexOf(a.currency) - CCY_ORDER.indexOf(b.currency));
  const tenors = [...new Set(ok.flatMap((c) => c.quotes!.map((q) => q.tenor)))];
  const failed = data.curves.filter((c) => c.status !== "success");
  return (
    <div className="table-wrap">
      <table className="data compact" data-testid="ois-table">
        <thead>
          <tr>
            <th>期間</th>
            {ok.map((c) => (
              <th key={c.currency} className="num" colSpan={2}>
                {CCY_NAME[c.currency] ?? c.currency}：気配・ゼロ（%）
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenors.map((t) => (
            <tr key={t}>
              <td>{t}</td>
              {ok.flatMap((c) => {
                const q = c.quotes!.find((x) => x.tenor === t);
                return [
                  <td key={c.currency + "q"} className="num">{q ? fmt(q.quote_pct, 4) : "—"}</td>,
                  <td key={c.currency + "z"} className="num muted">{q ? fmt(q.zero_pct, 4) : "—"}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {failed.map((c) => (
        <div key={c.currency} className="error">{c.currency}：カーブを作れない（{c.message}）</div>
      ))}
    </div>
  );
}
