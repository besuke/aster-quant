import { useEffect, useMemo, useRef, useState } from "react";
import { api, type YieldMonth, type YieldsPayload } from "./api";

// 選んだ月の日米イールドカーブ（公表利回り）を、横軸を年限として重ねる。Carmine Studio の JgbCurveExplorer にならい、
// 月別のデータは一度だけ取得して切り替え、再生中も軸を固定する（選んだ期間の全月の範囲）。計算はしない（表示だけ）。

const PLAY_MS = 150;
const COUNTRIES = ["US", "JP"] as const;
type Country = (typeof COUNTRIES)[number];
const NAME: Record<Country, string> = { US: "米国", JP: "日本" };
const PERIODS = [
  { id: "all", label: "全期間（1974年9月〜）", from: "197409" },
  { id: "2000", label: "2000年以降", from: "200001" },
  { id: "10y", label: "直近10年", from: "" },
] as const;
const ym = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(4))}月`;

export default function YieldCurvePage() {
  const [data, setData] = useState<YieldsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("2000");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 最後に出した取得の応答だけを使う（開発時の StrictMode では effect が2回走り、遅れて届いた2回目の応答で
  // 再生中の月が最新の月に戻っていた。2026-11-15 のブラウザー確認で発見）
  const loadSeq = useRef(0);
  const load = () => {
    const seq = ++loadSeq.current;
    return api
      .yields()
      .then((d) => {
        if (seq !== loadSeq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (seq === loadSeq.current) setError(e.message);
      });
  };
  useEffect(() => {
    void load();
    return () => {
      loadSeq.current++; // 片付けたら、その取得の応答は使わない
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshYields();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  // 選んだ期間の月（取得済みのデータを切り出すだけ）
  const months = useMemo(() => {
    if (!data) return [];
    const last = data.months[data.months.length - 1].month;
    const from = period === "10y" ? `${Number(last.slice(0, 4)) - 10}${last.slice(4)}` : PERIODS.find((p) => p.id === period)!.from;
    return data.months.filter((m) => m.month >= from);
  }, [data, period]);
  useEffect(() => {
    setPlaying(false);
    setIndex(Math.max(0, months.length - 1));
  }, [months]);

  // 期間全体で固定する縦軸
  const yAxis = useMemo(() => {
    const ys = months.flatMap((m) => COUNTRIES.flatMap((c) => m[c].yield_pct)).filter((y): y is number => y !== null);
    if (!ys.length) return { min: 0, max: 1, ticks: [0, 1] };
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const span = hi - lo || 1;
    const step = [0.25, 0.5, 1, 2, 2.5, 5].find((s) => span / s <= 10) ?? 5;
    const min = Math.floor((lo - span * 0.03) / step) * step, max = Math.ceil((hi + span * 0.03) / step) * step;
    const ticks: number[] = [];
    for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
    return { min, max, ticks };
  }, [months]);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setIndex((i) => {
        if (i >= months.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAY_MS);
    return () => window.clearInterval(timer.current);
  }, [playing, months]);

  const month = months[index];
  return (
    <>
      <section className="card" data-testid="yields-view">
        <div className="source-line" data-testid="yields-source">
          <span>
            <b>国債の公表利回り</b>（1・5・10・20・30年、月内最終観測値。計算には使わない）
          </span>
          <span>出典：米国 FRED（DGS1〜DGS30）、日本 財務省「国債金利情報」</span>
          <span>基準日：{month ? `${ym(month.month)}の各年限の観測日（下の表）` : "—"}</span>
        </div>
        <div className="row spread">
          <div className="row">
            <label className="small">
              期間：
              <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="期間">
                {PERIODS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row small muted">
            {data && <span>取得：{data.refreshed_at.slice(0, 16).replace("T", " ")}（最新の観測日 {data.latest_date}）</span>}
            <button className="btn" disabled={refreshing} onClick={refresh}>
              {refreshing ? "取得中…" : "出典から取得・更新"}
            </button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        {!data && !error && <p className="muted">読み込み中…</p>}
        {data && month && (
          <>
            <CurveChart month={month} tenors={data.tenors} yAxis={yAxis} inProgress={month.month === data.in_progress_month} />
            <div className="player" role="group" aria-label="表示する年月">
              <button
                className="btn primary"
                aria-pressed={playing}
                data-testid="yield-play"
                onClick={() => {
                  if (!playing && index >= months.length - 1) setIndex(0);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? "一時停止" : "再生"}
              </button>
              <input
                type="range"
                min={0}
                max={months.length - 1}
                step={1}
                value={index}
                aria-label="年月"
                aria-valuetext={ym(month.month)}
                data-testid="yield-slider"
                onChange={(e) => {
                  setPlaying(false);
                  setIndex(Number(e.target.value));
                }}
              />
              <output className="month-label" data-testid="yield-month">
                {month.month}
              </output>
            </div>
            <p className="muted small">
              {ym(months[0].month)}〜{ym(months[months.length - 1].month)} の {months.length} か月。縦軸は期間全体の範囲で固定している（再生中も変えない）。
            </p>
            <YieldTable month={month} tenors={data.tenors} inProgress={month.month === data.in_progress_month} />
            <details>
              <summary>出典と扱い</summary>
              <ul className="small">
                <li>米国：{data.countries.US.source}</li>
                <li>日本：{data.countries.JP.source}</li>
                <li>{data.conventions.monthly}</li>
                <li>{data.conventions.missing}</li>
                <li>{data.conventions.basis}</li>
              </ul>
            </details>
          </>
        )}
      </section>
    </>
  );
}

const W = 760, H = 380, M = { l: 52, r: 70, t: 24, b: 58 };
const X_MAX = 31;

function CurveChart({ month, tenors, yAxis, inProgress }: { month: YieldMonth; tenors: number[]; yAxis: { min: number; max: number; ticks: number[] }; inProgress: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (t: number) => M.l + (t / X_MAX) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - yAxis.min) / (yAxis.max - yAxis.min)) * (H - M.t - M.b);
  const missY = H - M.b + 34; // 欠損の印を置く帯（軸の下）
  const segs = (c: Country) => {
    const v = month[c].yield_pct;
    const out: string[] = [];
    for (let k = 0; k < tenors.length - 1; k++) {
      if (v[k] !== null && v[k + 1] !== null) out.push(`M${x(tenors[k])},${y(v[k]!)}L${x(tenors[k + 1])},${y(v[k + 1]!)}`);
    }
    return out.join("");
  };
  const lastPoint = (c: Country) => {
    const v = month[c].yield_pct;
    for (let k = tenors.length - 1; k >= 0; k--) if (v[k] !== null) return { t: tenors[k], v: v[k]! };
    return null;
  };
  const anyMissing = COUNTRIES.some((c) => month[c].yield_pct.some((v) => v === null));
  return (
    <figure className="chart">
      <figcaption>
        <b>
          日米の国債利回りカーブ（{ym(month.month)}、月内最終観測値）{inProgress && <span className="chip st-partial">月の途中</span>}
        </b>
        <span className="legend">
          {COUNTRIES.map((c) => (
            <span key={c}>
              <svg width="26" height="12" aria-hidden="true">
                <line x1="1" y1="6" x2="25" y2="6" className={`ln-${c}`} />
                {c === "US" ? <circle cx="13" cy="6" r="4" className={`pt-${c}`} /> : <rect x="9" y="2" width="8" height="8" className={`pt-${c}`} />}
              </svg>
              {NAME[c]}国債
            </span>
          ))}
          {anyMissing && (
            <span>
              <svg width="14" height="12" aria-hidden="true">
                <circle cx="7" cy="6" r="4" className="miss" />
              </svg>
              欠損（公表値なし）
            </span>
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ym(month.month)}の日米国債利回りカーブ`} onMouseLeave={() => setHover(null)}>
        {yAxis.ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : "grid"} />
            <text x={M.l - 8} y={y(t) + 4} className="tick" textAnchor="end">
              {t.toFixed(Number.isInteger(t) ? 0 : 2)}
            </text>
          </g>
        ))}
        {tenors.map((t) => (
          <text key={t} x={x(t)} y={H - M.b + 16} className="tick" textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - M.b + 30} className="axis-label" textAnchor="middle">
          年限（年）
        </text>
        <text x={14} y={M.t + (H - M.t - M.b) / 2} className="axis-label" textAnchor="middle" transform={`rotate(-90 14 ${M.t + (H - M.t - M.b) / 2})`}>
          利回り（%）
        </text>
        {hover !== null && <line x1={x(tenors[hover])} x2={x(tenors[hover])} y1={M.t} y2={H - M.b} className="crosshair" />}
        {COUNTRIES.map((c) => (
          <g key={c}>
            <path d={segs(c)} className={`ln-${c}`} fill="none" />
            {tenors.map((t, k) => {
              const v = month[c].yield_pct[k];
              if (v === null) {
                // 欠損：軸の下の帯に白抜きの印と国名
                return (
                  <g key={t}>
                    <circle cx={x(t) + (c === "US" ? -9 : 9)} cy={missY} r={4.5} className={`miss miss-${c}`} />
                    <text x={x(t) + (c === "US" ? -9 : 9)} y={missY + 15} className="miss-label" textAnchor="middle">
                      {c === "US" ? "米" : "日"}
                    </text>
                  </g>
                );
              }
              return c === "US" ? <circle key={t} cx={x(t)} cy={y(v)} r={4.5} className={`pt-${c}`} /> : <rect key={t} x={x(t) - 4.5} y={y(v) - 4.5} width={9} height={9} className={`pt-${c}`} />;
            })}
            {(() => {
              const p = lastPoint(c);
              return p && <text x={x(p.t) + 10} y={y(p.v) + 4} className="direct-label">{NAME[c]}</text>;
            })()}
          </g>
        ))}
        <text x={M.l - 8} y={missY + 4} className="tick" textAnchor="end">
          欠損
        </text>
        {/* ホバー：年限ごとの当たり判定（印より広い） */}
        {tenors.map((t, k) => {
          const left = k === 0 ? M.l : (x(tenors[k - 1]) + x(t)) / 2;
          const right = k === tenors.length - 1 ? W - M.r : (x(t) + x(tenors[k + 1])) / 2;
          return <rect key={t} className="hit" data-tenor={t} x={left} y={M.t} width={right - left} height={H - M.t} fill="transparent" onMouseEnter={() => setHover(k)} onMouseMove={() => setHover(k)} />;
        })}
        {hover !== null && (
          <g transform={`translate(${Math.min(x(tenors[hover]) + 12, W - M.r - 190)},${M.t + 6})`} className="tooltip" pointerEvents="none">
            <rect width="188" height="62" rx="6" />
            <text x="10" y="18" className="tt-title">
              {tenors[hover]}年
            </text>
            {COUNTRIES.map((c, i) => {
              const v = month[c].yield_pct[hover];
              return (
                <text key={c} x="10" y={36 + i * 16} className="tt-row">
                  {NAME[c]}：{v === null ? "欠損" : `${v.toFixed(3)}%`}（{month[c].obs_date[hover] ?? "—"}）
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </figure>
  );
}

function YieldTable({ month, tenors, inProgress }: { month: YieldMonth; tenors: number[]; inProgress: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data compact yields" data-testid="yield-table">
        <thead>
          <tr>
            <th>年限</th>
            <th className="num">米国（%）</th>
            <th>観測日</th>
            <th className="num">日本（%）</th>
            <th>観測日</th>
          </tr>
        </thead>
        <tbody>
          {tenors.map((t, k) => (
            <tr key={t}>
              <td>{t}年</td>
              {COUNTRIES.map((c) => {
                const v = month[c].yield_pct[k];
                const note = month[c].note[k];
                return [
                  <td key={c + "v"} className={`num ${v === null ? "missing" : ""}`} title={note}>
                    {v === null ? "欠損" : v.toFixed(3)}
                  </td>,
                  <td key={c + "d"} className="small">
                    {month[c].obs_date[k] ?? <span className="muted">{note}</span>}
                    {v !== null && note && <div className="muted">{note}</div>}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {inProgress && <p className="muted small">この月は途中のため、最終観測値はその時点の最新の値である。</p>}
    </div>
  );
}
