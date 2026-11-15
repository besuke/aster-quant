import { useEffect, useMemo, useState } from "react";
import { api, fmt, type IrrbbResult, type IrrbbScenario } from "./api";

// IRRBB 金利シナリオ。計算（ショック、ショック後カーブ、債券の再評価）はサーバーの RiemannFinMath。全 6 シナリオを一度に受け取り、
// 画面はその中でシナリオを切り替えて、グラフと結果表を描き直すだけ。

type SetId = "domestic" | "international";
type Floor = "none" | "zero";

export default function IrrbbPage() {
  const [floor, setFloor] = useState<Floor>("none");
  const [data, setData] = useState<Partial<Record<Floor, IrrbbResult>>>({});
  const [error, setError] = useState<string | null>(null);
  const [set, setSet] = useState<SetId>("domestic");
  const [scenarioId, setScenarioId] = useState("parallel_up");

  useEffect(() => {
    if (data[floor]) return;
    let alive = true;
    api
      .irrbb(floor)
      .then((r) => alive && setData((m) => ({ ...m, [floor]: r })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [floor, data]);

  const r = data[floor];
  const ids = r ? r.scenario_sets[set].ids : [];
  useEffect(() => {
    if (r && !ids.includes(scenarioId)) setScenarioId(ids[0]);
  }, [r, ids, scenarioId]);
  const sc = r?.scenarios.find((s) => s.id === scenarioId);

  return (
    <div className="page">
      <section className="intro">
        <h1>IRRBB金利シナリオ</h1>
      </section>
      <section className="card">
        <div className="row">
          <div className="segmented" role="group" aria-label="シナリオの組">
            {(["domestic", "international"] as SetId[]).map((k) => (
              <button key={k} aria-pressed={set === k} onClick={() => setSet(k)} data-testid={`set-${k}`}>
                {k === "domestic" ? "国内基準行（3シナリオ）" : "国際統一基準行（6シナリオ）"}
              </button>
            ))}
          </div>
          <label className="small">
            金利フロア：
            <select value={floor} onChange={(e) => setFloor(e.target.value as Floor)} aria-label="金利フロア">
              <option value="none">なし</option>
              <option value="zero">0%（参考）</option>
            </select>
          </label>
        </div>
        {r && (
          <div className="row" role="group" aria-label="シナリオ" data-testid="scenario-buttons">
            {ids.map((id) => {
              const s = r.scenarios.find((x) => x.id === id)!;
              return (
                <button key={id} className={`btn ${scenarioId === id ? "primary" : ""}`} aria-pressed={scenarioId === id} onClick={() => setScenarioId(id)}>
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {!r && !error && <p className="muted">RiemannFinMath で計算している…</p>}
        {r && (
          <div className="source-line" data-testid="irrbb-basis">
            <span>
              評価日 <b>{r.valuation_date}</b>
            </span>
            <span>
              基準カーブ：{r.base_curve.name}、基準日 <b>{r.base_curve.base_date}</b>（{r.base_curve.source}）
            </span>
            <span>
              円のショック幅（SRP31.90）：パラレル {r.shock_sizes_bp.parallel_bp}・短期 {r.shock_sizes_bp.short_bp}・長期 {r.shock_sizes_bp.long_bp} bp
            </span>
          </div>
        )}
      </section>

      {r && sc && (
        <>
          <div className="grid2">
            <section className="card">
              <CurveChart sc={sc} />
            </section>
            <section className="card">
              <ShockChart sc={sc} />
            </section>
          </div>
          <section className="card" data-testid="irrbb-result">
            <h2>
              {r.title}（{sc.label}）
            </h2>
            <ResultTable sc={sc} />
          </section>
          <section className="card">
            <h2>サンプル・ポートフォリオ（円建て固定利付債、架空）</h2>
            <div className="table-wrap">
              <table className="data compact" data-testid="irrbb-portfolio">
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th>満期日</th>
                    <th className="num">残存（年）</th>
                    <th className="num">クーポン（%）</th>
                    <th className="num">利払（年）</th>
                    <th className="num">額面（円）</th>
                  </tr>
                </thead>
                <tbody>
                  {r.portfolio.map((b) => (
                    <tr key={b.bond_id}>
                      <td>
                        {b.security_name}
                        <div className="muted small mono">{b.bond_id}</div>
                      </td>
                      <td className="mono">{b.maturity_date}</td>
                      <td className="num">{fmt(b.remaining_years, 2)}</td>
                      <td className="num">{fmt(b.coupon_pct, 2)}</td>
                      <td className="num">{b.coupon_frequency}回</td>
                      <td className="num">{fmt(b.face_amount, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card" data-testid="irrbb-assumptions">
            <h2>前提と参照文書</h2>
            <ul className="small">
              {Object.entries(r.assumptions).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
            <table className="data compact">
              <thead>
                <tr>
                  <th>参照文書</th>
                  <th>公表日</th>
                  <th>適用日</th>
                  <th>使った内容</th>
                </tr>
              </thead>
              <tbody>
                {r.references.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        {d.title}
                      </a>
                      <div className="muted small">{d.publisher}</div>
                    </td>
                    <td className="mono">{d.published}</td>
                    <td className="small">{d.effective ?? "—"}</td>
                    <td className="small">{d.used_for}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">{r.engine}</p>
          </section>
        </>
      )}
    </div>
  );
}

const W = 560, H = 300, M = { l: 50, r: 16, t: 16, b: 38 };

function niceTicks(lo: number, hi: number, n = 6) {
  const span = hi - lo || 1;
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100].find((s) => span / s <= n) ?? 100;
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= Math.ceil(hi / step) * step + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

function CurveChart({ sc }: { sc: IrrbbScenario }) {
  const pts = sc.curve;
  const xMax = Math.ceil(pts[pts.length - 1].years);
  const ys = pts.flatMap((p) => [p.base_zero_pct, p.shocked_zero_pct]);
  const ticks = useMemo(() => niceTicks(Math.min(...ys, 0), Math.max(...ys)), [ys]);
  const x = (t: number) => M.l + (t / xMax) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * (H - M.t - M.b);
  const path = (k: "base_zero_pct" | "shocked_zero_pct") => pts.map((p, i) => `${i ? "L" : "M"}${x(p.years)},${y(p[k])}`).join("");
  const [hover, setHover] = useState<number | null>(null);
  const near = hover === null ? null : pts.reduce((b, p) => (Math.abs(p.years - hover) < Math.abs(b.years - hover) ? p : b));
  return (
    <figure className="chart" data-testid="irrbb-curve-chart">
      <figcaption>
        <b>基準カーブとショック後カーブ（ゼロ金利、連続複利、%）</b>
        <span className="legend">
          <span>
            <svg width="26" height="12" aria-hidden="true"><line x1="1" y1="6" x2="25" y2="6" className="ln-US" /></svg>基準
          </span>
          <span>
            <svg width="26" height="12" aria-hidden="true"><line x1="1" y1="6" x2="25" y2="6" className="ln-JP" /></svg>ショック後（{sc.label}）
          </span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`基準カーブと${sc.label}のショック後カーブ`} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const t = (((e.clientX - b.left) / b.width) * W - M.l) / (W - M.l - M.r) * xMax;
          setHover(t >= 0 && t <= xMax ? t : null);
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : "grid"} />
            <text x={M.l - 6} y={y(t) + 4} className="tick" textAnchor="end">{t.toFixed(2)}</text>
          </g>
        ))}
        {[1, 5, 10, 15, 20, 25, 30].filter((t) => t <= xMax).map((t) => (
          <text key={t} x={x(t)} y={H - M.b + 15} className="tick" textAnchor="middle">{t}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 4} className="axis-label" textAnchor="middle">年（評価日から）</text>
        <path d={path("base_zero_pct")} className="ln-US" />
        <path d={path("shocked_zero_pct")} className="ln-JP" data-testid="shocked-path" />
        {near && (
          <g>
            <line x1={x(near.years)} x2={x(near.years)} y1={M.t} y2={H - M.b} className="crosshair" />
            <g transform={`translate(${Math.min(x(near.years) + 10, W - M.r - 176)},${M.t + 4})`} className="tooltip" pointerEvents="none">
              <rect width="174" height="68" rx="6" />
              <text x="10" y="17" className="tt-title">{near.years.toFixed(2)} 年</text>
              <text x="10" y="34" className="tt-row">基準：{near.base_zero_pct.toFixed(4)}%</text>
              <text x="10" y="50" className="tt-row">ショック後：{near.shocked_zero_pct.toFixed(4)}%</text>
              <text x="10" y="64" className="tt-row">ショック：{near.shock_bp.toFixed(1)} bp{near.floored ? "（フロア）" : ""}</text>
            </g>
          </g>
        )}
      </svg>
    </figure>
  );
}

function ShockChart({ sc }: { sc: IrrbbScenario }) {
  const rows = sc.shocks_by_tenor;
  const ticks = niceTicks(Math.min(0, ...rows.map((r) => r.shock_bp)), Math.max(0, ...rows.map((r) => r.shock_bp)));
  const n = rows.length;
  const bw = (W - M.l - M.r) / n;
  const y = (v: number) => M.t + (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * (H - M.t - M.b);
  return (
    <figure className="chart" data-testid="irrbb-shock-chart">
      <figcaption>
        <b>年限ごとのショック幅（bp、{sc.label}）</b>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${sc.label}の年限ごとのショック幅`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : "grid"} />
            <text x={M.l - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = M.l + i * bw + bw * 0.18;
          const top = Math.min(y(r.shock_bp), y(0));
          const h = Math.max(1, Math.abs(y(r.shock_bp) - y(0)));
          return (
            <g key={r.tenor_years} data-testid={`bar-${r.tenor_years}`}>
              <rect x={x0} y={top} width={bw * 0.64} height={h} rx={3} className="bar">
                <title>{`${r.tenor_years}年：${r.shock_bp.toFixed(1)} bp`}</title>
              </rect>
              <text x={x0 + bw * 0.32} y={r.shock_bp >= 0 ? top - 4 : top + h + 11} className="bar-label" textAnchor="middle">
                {r.shock_bp.toFixed(1)}
              </text>
              <text x={x0 + bw * 0.32} y={H - M.b + 15} className="tick" textAnchor="middle">{r.tenor_years}</text>
            </g>
          );
        })}
        <text x={(M.l + W - M.r) / 2} y={H - 4} className="axis-label" textAnchor="middle">年限（年）</text>
      </svg>
    </figure>
  );
}

function ResultTable({ sc }: { sc: IrrbbScenario }) {
  const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(2)}%`;
  return (
    <div className="table-wrap">
      <table className="data" data-testid="irrbb-table">
        <thead>
          <tr>
            <th>銘柄</th>
            <th className="num">基準PV（円）</th>
            <th className="num">ショック後PV（円）</th>
            <th className="num">PV変化（ショック後−基準、円）</th>
            <th className="num">変化率</th>
          </tr>
        </thead>
        <tbody>
          {sc.bonds.map((b) => (
            <tr key={b.bond_id}>
              <td>{b.security_name}</td>
              <td className="num">{fmt(b.base_pv, 0)}</td>
              <td className="num">{fmt(b.shocked_pv, 0)}</td>
              <td className={`num ${b.pv_change < 0 ? "neg" : ""}`}>{fmt(b.pv_change, 0)}</td>
              <td className="num">{pct(b.pv_change, b.base_pv)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>ポートフォリオ合計</td>
            <td className="num">{fmt(sc.total.base_pv, 0)}</td>
            <td className="num">{fmt(sc.total.shocked_pv, 0)}</td>
            <td className={`num ${sc.total.pv_change < 0 ? "neg" : ""}`}>{fmt(sc.total.pv_change, 0)}</td>
            <td className="num">{pct(sc.total.pv_change, sc.total.base_pv)}</td>
          </tr>
        </tbody>
      </table>
      {sc.floored_points > 0 && <p className="muted small">フロアがかかった点：{sc.floored_points}（月次の点の数）</p>}
    </div>
  );
}
