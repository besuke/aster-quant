import { useMemo, useState } from "react";
import { analyticsApi, type FuturesRequest, type FuturesResponse } from "../analyticsApi";
import { LineChart } from "../charts/LineChart";
import { f, NumField, PageHead, Segmented, Status, t3, Tile, useCalc } from "./common";

// 国債先物と CTD。受渡適格銘柄のベーシス・インプライド・レポ・CTD、先物 BPV、利回りの水準ごとの CTD の入れ替わり。
// 計算はサーバー（RiemannFinMath）。入力の価格は架空のデモ。Carmine Studio の jgb-futures から移した。

type Mode = "current" | "flat";

export default function FuturesPage() {
  const [mode, setMode] = useState<Mode>("current");
  const [yieldPct, setYieldPct] = useState(8);
  const [fundingPct, setFundingPct] = useState(1.23);
  const req = useMemo<FuturesRequest>(() => (mode === "current" ? { mode, fundingPct } : { mode, yieldPct, fundingPct }), [mode, yieldPct, fundingPct]);
  const { data, error, loading } = useCalc(req, analyticsApi.futures);

  const pick = (m: Mode) => { setMode(m); if (m === "current") setFundingPct(1.23); else { setYieldPct(8); setFundingPct(9); } };

  return (
    <div className="page">
      <PageHead title="国債先物・CTD"><Status loading={loading} error={error} /></PageHead>
      <div className="qc-controls" role="group" aria-label="市場の前提">
        <Segmented label="市場" value={mode} onChange={pick} options={[{ id: "current", label: "現在の市場（架空の価格）" }, { id: "flat", label: "全銘柄を同じ利回りで評価" }]} />
        {mode === "flat" && <NumField label="複利利回り（%）" value={yieldPct} step={0.25} min={0.1} max={15} onChange={setYieldPct} />}
        <NumField label="Funding Rate（%）" value={fundingPct} step={0.01} min={-1} max={20} onChange={setFundingPct} />
        {mode === "flat" && <button type="button" onClick={() => { setYieldPct(8); setFundingPct(9); }}>ストレス（8%・9%）</button>}
        {data && <span className="qc-state">CTD：<strong>{data.ctd_issue}回債</strong></span>}
      </div>
      {data && <Result d={data} />}
    </div>
  );
}

function Result({ d }: { d: FuturesResponse }) {
  const ctd = d.rows.find((r) => r.issue === d.ctd_issue)!;
  const days = Math.round((Date.parse(d.delivery_date) - Date.parse(d.valuation_date)) / 86_400_000);
  const switches = d.ctd_by_level.filter((r, i) => i > 0 && r.ctd_issue !== d.ctd_by_level[i - 1].ctd_issue);
  const levelPts = d.ctd_by_level.map((r) => ({ x: r.yield_pct, y: r.ctd_duration, date: `${r.yield_pct}%：CTD ${r.ctd_issue}回債` }));
  const curvePts = (c: { tenor_years: number; yield_pct: number }[]) => c.map((p) => ({ x: p.tenor_years, y: p.yield_pct, date: `${p.tenor_years}年` }));
  return (
    <>
      <div className="qc-tiles">
        <Tile emphasis label="CTD" value={`${d.ctd_issue}回債`} note={`修正デュレーション ${t3(ctd.duration)}、インプライド・レポ ${f(ctd.implied_repo * 100, 4)}%`} />
        <Tile label="先物BPV（額面100あたり）" value={f(d.futures_bpv, 6)} note={`CTD の DV01 ${f(d.ctd_dv01, 6)} ÷ CF ${f(d.ctd_conversion_factor, 6)}`} />
        <Tile label="先物1枚（額面1億円）の BPV" value={`${Math.round(d.futures_bpv * 1e6).toLocaleString("ja-JP")} 円`} note="先物BPV × 1億円 / 100" />
        <Tile label="先物価格" value={f(d.futures_price, d.mode === "current" ? 2 : 4)} note={`評価日 ${d.valuation_date}、受渡日 ${d.delivery_date}（${days}日）`} />
      </div>
      <section className="card">
        <h2>{d.mode === "current" ? "受渡適格銘柄のベーシスと CTD" : `ストレス：全銘柄 ${f(d.flat_yield! * 100, 2)}% 複利、Funding ${f(d.funding_rate * 100, 2)}%`}</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>回号</th><th className="num">クーポン（%）</th><th>償還日</th><th className="num">価格</th><th className="num">複利利回り（%）</th><th className="num">修正デュレーション</th>
              <th className="num">CF</th><th className="num">Gross Basis</th><th className="num">Net Basis</th><th className="num">Implied Repo（%）</th><th>CTD</th></tr></thead>
            <tbody>{d.rows.map((r) => (
              <tr key={r.issue} className={r.ctd ? "qc-changed" : undefined}>
                <th scope="row">{r.issue}</th><td className="num">{f(r.coupon_pct, 1)}</td><td className="nowrap">{r.maturity_date}</td><td className="num">{f(r.price, 3)}</td>
                <td className="num">{t3(r.yield * 100)}</td><td className="num">{t3(r.duration)}</td><td className="num">{f(r.conversion_factor, 6)}</td>
                <td className="num">{f(r.gross_basis, 4)}</td><td className="num">{f(r.net_basis, 4)}</td><td className="num">{f(r.implied_repo * 100, 4)}</td><td>{r.ctd ? "◀ CTD" : ""}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <div className="two-col">
        <LineChart title={`CTD の修正デュレーション（全銘柄を同じ利回りで評価、Funding ${f(d.funding_rate * 100, 2)}%）`} origin={d.valuation_date} xMin={1} xMax={10}
          yLabel="CTD の修正デュレーション" xLabel="複利利回り（%）" xTicks={Array.from({ length: 10 }, (_, i) => ({ x: i + 1, label: `${i + 1}%` }))}
          series={[{ key: "ctd", label: "CTD", color: "var(--series-1)", points: levelPts, dots: levelPts }]}
          markers={[{ x: 6, label: "標準物 6%" }, ...switches.map((s) => ({ x: s.yield_pct, label: `→${s.ctd_issue}回債` }))]}
          formatY={(y) => t3(y)} formatTick={(y) => y.toFixed(1)}
          footer={switches.length ? `利回り ${switches.map((s) => `${s.yield_pct}%`).join("・")} で CTD が入れ替わる（0.25% 刻み）` : "1〜10% では CTD は入れ替わらない"} />
        <LineChart title="イールドカーブの二つの局面（点線の 6% は標準物のクーポン）" origin={d.valuation_date} xMax={10} yLabel="利回り（%）" xLabel="年限（年）"
          xTicks={[0, 2, 4, 6, 8, 10].map((x) => ({ x, label: String(x) }))}
          series={[
            { key: "c", label: "現在の市場", color: "var(--series-1)", points: curvePts(d.current_curve), dots: curvePts(d.current_curve) },
            { key: "s", label: "ストレス（逆イールド）", color: "var(--series-2)", dashed: true, points: curvePts(d.stress_curve), dots: curvePts(d.stress_curve) },
            { key: "std", label: "標準物のクーポン 6%", color: "var(--muted)", dashed: true, points: [{ x: 0, y: 6, date: "6%" }, { x: 10, y: 6, date: "6%" }] },
          ]}
          formatY={(y) => `${y.toFixed(2)}%`} formatTick={(y) => y.toFixed(0)} />
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Carry の内訳（額面100あたり、保有 {days} 日）</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>回号</th><th className="num">経過利子（評価日）</th><th className="num">経過利子（受渡日）</th><th className="num">保有期間のクーポン</th><th className="num">Funding Cost</th><th className="num">Carry</th><th className="num">受渡価格 F×CF</th></tr></thead>
              <tbody>{d.rows.map((r) => (
                <tr key={r.issue} className={r.ctd ? "qc-changed" : undefined}><th scope="row">{r.issue}</th><td className="num">{f(r.accrued_start, 6)}</td><td className="num">{f(r.accrued_end, 6)}</td>
                  <td className="num">{f(r.coupon_income, 4)}</td><td className="num">{f(r.funding_cost, 6)}</td><td className="num">{f(r.carry, 6)}</td><td className="num">{f(r.futures_invoice, 4)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>各銘柄の DV01 と、その銘柄が CTD なら先物BPV になる値</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>回号</th><th className="num">DV01（±1bp）</th><th className="num">CF</th><th className="num">DV01 ÷ CF</th></tr></thead>
              <tbody>{d.rows.map((r) => (
                <tr key={r.issue} className={r.ctd ? "qc-changed" : undefined}><th scope="row">{r.issue}</th><td className="num">{f(r.dv01, 6)}</td><td className="num">{f(r.conversion_factor, 6)}</td><td className="num">{f(r.dv01 / r.conversion_factor, 6)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="muted small">{d.inputs_note}。{d.conventions.bond}。{d.conventions.carry}。{d.conventions.engine}</p>
        </section>
      </div>
    </>
  );
}
