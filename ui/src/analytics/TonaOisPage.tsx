import { useMemo, useState } from "react";
import { analyticsApi, type TonaCase, type TonaResponse } from "../analyticsApi";
import { LineChart, type Series } from "../charts/LineChart";
import { f, NumField, PageHead, pct, Segmented, Status, Tile, useCalc, yen } from "./common";

// TONA OIS カーブとスワップのシナリオ。保存済みの円 OIS 気配（今はデモの架空データ）から RiemannFinMath でカーブを作り、
// 選んだ年限の気配を動かしたときのカーブと、基準カーブのパーレートで固定した OIS（固定払い・TONA 受け）の PV の変化を見る。
// Carmine Studio の yield-curve-ois から移した。

const C = { base: "var(--series-1)", scen: "var(--series-2)", diff: "var(--series-3)" };
type Pick = (p: TonaCase["curve_points"][number]) => number | null;
const pickDf: Pick = (p) => p.discount;
const pickZero: Pick = (p) => (p.zero_continuous === null ? null : p.zero_continuous * 100);
const pickFwd: Pick = (p) => p.forward_1d_simple * 100;

export default function TonaOisPage() {
  const [swapTenor, setSwapTenor] = useState("7Y");
  const [bumpTenor, setBumpTenor] = useState("7Y");
  const [bumpBp, setBumpBp] = useState(0);
  const [notional, setNotional] = useState(1e10);
  const [range, setRange] = useState<"5" | "10" | "30">("30");
  const req = useMemo(() => ({ swapTenor, bumpTenor, bumpBp, notional }), [swapTenor, bumpTenor, bumpBp, notional]);
  const { data, error, loading } = useCalc(req, analyticsApi.tonaOis, 150);
  const tenors = data?.quotes.map((q) => q.tenor) ?? [];
  const yearTenors = tenors.filter((t) => /Y$/.test(t));

  return (
    <div className="page">
      <PageHead title="TONA OIS カーブとスワップ"><Status loading={loading} error={error} /></PageHead>
      <div className="qc-controls" role="group" aria-label="シナリオの条件">
        <label>スワップの年限
          <select value={swapTenor} onChange={(e) => setSwapTenor(e.target.value)}>
            {(yearTenors.length ? yearTenors : [swapTenor]).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <NumField label="想定元本（円）" value={notional} step={1e9} min={1} width="9rem" onChange={setNotional} />
        <label>動かす気配
          <select value={bumpTenor} onChange={(e) => setBumpTenor(e.target.value)}>
            {(tenors.length ? tenors : [bumpTenor]).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <NumField label="変化幅（bp）" value={bumpBp} step={1} min={-100} max={100} onChange={setBumpBp} />
        <button type="button" className="primary" onClick={() => setBumpBp((b) => Math.min(100, b + 1))}>＋1 bp</button>
        <button type="button" onClick={() => setBumpBp((b) => Math.max(-100, b - 1))}>−1 bp</button>
        <button type="button" onClick={() => setBumpBp(0)} disabled={bumpBp === 0}>リセット</button>
        <span className="qc-sep" />
        <span className="qc-label">横軸</span>
        <Segmented label="横軸の範囲" value={range} onChange={setRange} options={[{ id: "5", label: "5年" }, { id: "10", label: "10年" }, { id: "30", label: "30年" }]} />
      </div>
      {data && <Dashboard d={data} xMax={Number(range)} />}
    </div>
  );
}

function Dashboard({ d, xMax }: { d: TonaResponse; xMax: number }) {
  const t = d.swap_terms;
  const b = d.cases.base.swap;
  const s = d.cases.scenario.swap;
  const show = d.request.bumpBp !== 0;
  const pts = (c: TonaCase, pick: Pick) => c.curve_points.flatMap((p) => { const y = pick(p); return y === null ? [] : [{ x: p.time, y, date: p.date }]; });
  const nodeDots = (c: TonaCase) => c.nodes.flatMap((n) => (n.zero_continuous === null ? [] : [{ x: n.time, y: n.zero_continuous * 100, date: n.date }]));
  const overlay = (pick: Pick, dots = false): Series[] => [
    { key: "b", label: "基準", color: C.base, points: pts(d.cases.base, pick), dots: dots ? nodeDots(d.cases.base) : undefined },
    ...(show ? [{ key: "s", label: `${d.request.bumpTenor} ${d.request.bumpBp > 0 ? "+" : ""}${d.request.bumpBp}bp`, color: C.scen, dashed: true, points: pts(d.cases.scenario, pick), dots: dots ? nodeDots(d.cases.scenario) : undefined }] : []),
  ];
  const diff = (pick: Pick, scale: number): Series[] => {
    const base = d.cases.base.curve_points;
    const sc = d.cases.scenario.curve_points;
    return [{ key: "d", label: "差", color: C.diff, points: base.flatMap((p, i) => { const a = pick(p), c = sc[i] ? pick(sc[i]) : null; return a === null || c === null ? [] : [{ x: p.time, y: (c - a) * scale, date: p.date }]; }) }];
  };
  const markers = d.cases.base.instruments.map((r) => ({ x: (Date.parse(r.pillar_date) - Date.parse(d.evaluation_date)) / 86_400_000 / 365, label: r.tenor }))
    .filter((m) => ["1Y", "2Y", "5Y", "7Y", "10Y", "20Y", "30Y"].includes(m.label));

  return (
    <>
      <div className="qc-tiles">
        <Tile label={`${t.tenor} OIS（固定払い）の基準 PV`} value={yen(b.npv)} note={`固定レート ${pct(t.fixed_rate, 6)}（基準カーブのパーレート）`} />
        <Tile label="シナリオ後の PV" value={show ? yen(s.npv) : "—"} note={show ? `パーレート ${pct(s.par_rate, 6)}` : "気配を動かすと計算する"} />
        <Tile emphasis label="PV の変化（シナリオ − 基準）" value={show ? yen(d.pv_change, true) : "—"} note={show ? `パーレートの変化 ${f(d.par_change_bp, 4)} bp` : `${t.effective_date} 〜 ${t.termination_date}`} />
        <Tile label="固定レグ 1bp あたり" value={yen(b.fixed_leg_bps)} note={`想定元本 ${Math.round(t.notional).toLocaleString("ja-JP")} 円`} />
      </div>
      <div className="qc-grid-3">
        <LineChart title="割引係数" series={overlay(pickDf)} origin={d.evaluation_date} xMax={xMax} height={250} markers={markers} legend yLabel="割引係数"
          formatY={(y) => y.toFixed(10)} formatTick={(y) => y.toFixed(2)} />
        <LineChart title="ゼロ金利（連続複利、点はピラー）" series={overlay(pickZero, true)} origin={d.evaluation_date} xMax={xMax} height={250} markers={markers} legend yLabel="ゼロ金利（%）"
          formatY={(y) => `${y.toFixed(4)}%`} formatTick={(y) => y.toFixed(2)} />
        <LineChart title="フォワード金利（1暦日の単利）" series={overlay(pickFwd)} origin={d.evaluation_date} xMax={xMax} height={250} markers={markers} legend yLabel="フォワード（%）"
          formatY={(y) => `${y.toFixed(4)}%`} formatTick={(y) => y.toFixed(2)} />
      </div>
      {show && (
        <div className="qc-grid-3">
          <LineChart title="割引係数の差（×10⁻⁴）" series={diff(pickDf, 1e4)} origin={d.evaluation_date} xMax={xMax} height={180} markers={markers} zeroLine yLabel="差（×10⁻⁴）"
            formatY={(y) => y.toFixed(4)} formatTick={(y) => y.toFixed(1)} />
          <LineChart title="ゼロ金利の差（bp）" series={diff(pickZero, 100)} origin={d.evaluation_date} xMax={xMax} height={180} markers={markers} zeroLine yLabel="差（bp）"
            formatY={(y) => `${y.toFixed(3)} bp`} formatTick={(y) => y.toFixed(1)} />
          <LineChart title="フォワード金利の差（bp）" series={diff(pickFwd, 100)} origin={d.evaluation_date} xMax={xMax} height={180} markers={markers} zeroLine yLabel="差（bp）"
            formatY={(y) => `${y.toFixed(3)} bp`} formatTick={(y) => y.toFixed(0)} />
        </div>
      )}
      <div className="two-col">
        <section className="card">
          <h2>気配とピラー（{d.dataset.label}、基準日 {d.evaluation_date}）</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>年限</th><th>ピラー日</th><th className="num">基準の気配</th><th className="num">シナリオの気配</th><th className="num">ゼロ金利（基準）</th><th className="num">再現誤差</th></tr></thead>
              <tbody>{d.cases.base.instruments.map((r, i) => {
                const node = d.cases.base.nodes.find((n) => n.date === r.pillar_date);
                const changed = d.quotes[i] && d.quotes[i].rate_scenario !== d.quotes[i].rate_base;
                return (
                  <tr key={r.tenor} className={changed ? "qc-changed" : undefined}><th scope="row">{r.tenor}</th><td>{r.pillar_date}</td>
                    <td className="num">{pct(d.quotes[i]?.rate_base, 3)}</td><td className="num">{pct(d.quotes[i]?.rate_scenario, 3)}</td>
                    <td className="num">{node?.zero_continuous == null ? "—" : pct(node.zero_continuous, 4)}</td><td className="num">{r.reproduction_error.toExponential(1)}</td></tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>スワップのキャッシュフロー（{show ? "シナリオ" : "基準"}）</h2>
          <div className="table-wrap tall">
            <table className="data">
              <thead><tr><th>レグ</th><th>計算期間</th><th>支払日</th><th className="num">金額</th><th className="num">割引係数</th></tr></thead>
              <tbody>{(show ? s : b).cashflows.map((c, i) => (
                <tr key={i}><td>{c.leg === "fixed" ? "固定" : "TONA"}</td><td>{c.accrual_start} 〜 {c.accrual_end}</td><td>{c.payment_date}</td>
                  <td className="num">{yen(c.amount)}</td><td className="num">{f(c.discount, 8)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="muted small">{d.conventions.curve}。{d.conventions.forward}。{d.conventions.engine}</p>
        </section>
      </div>
    </>
  );
}
