import { useMemo, useState } from "react";
import { analyticsApi, type CdsRequest, type CdsResponse } from "../analyticsApi";
import { LineChart } from "../charts/LineChart";
import { DateField, f, NumField, PageHead, pct, Segmented, Status, Tile, useCalc, yen } from "./common";

// クレジット・CDS（標準 CDS の評価）。市場スプレッドから Hazard Rate を求め、契約クーポンでの NPV・Upfront・生存確率・
// キャッシュフローを出す。計算はサーバー（rmql）。Carmine Studio の credit-cds から移した。

const DEFAULT: CdsRequest = { tradeDate: "2022-08-19", tenor: "5Y", spreadBp: 30.426, couponBp: 100, recoveryPct: 40, ratePct: 0.25, notional: 1e7, engine: "isda" };
const TENORS = ["1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y"];

export default function CdsPage() {
  const [req, setReq] = useState<CdsRequest>(DEFAULT);
  const set = (p: Partial<CdsRequest>) => setReq((r) => ({ ...r, ...p }));
  const stable = useMemo(() => req, [req]);
  const { data, error, loading } = useCalc(stable, analyticsApi.cds);

  return (
    <div className="page">
      <PageHead title="クレジット・CDS"><Status loading={loading} error={error} /></PageHead>
      <div className="qc-controls" role="group" aria-label="CDS の条件">
        <DateField label="取引日" value={req.tradeDate} onChange={(v) => set({ tradeDate: v })} />
        <label>年限
          <select value={req.tenor} onChange={(e) => set({ tenor: e.target.value })}>{TENORS.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <NumField label="市場スプレッド（bp）" value={req.spreadBp} step={1} min={1} max={2000} onChange={(v) => set({ spreadBp: v })} />
        <NumField label="契約クーポン（bp）" value={req.couponBp} step={25} min={0} max={1000} onChange={(v) => set({ couponBp: v })} />
        <NumField label="回収率（%）" value={req.recoveryPct} step={5} min={0} max={90} onChange={(v) => set({ recoveryPct: v })} />
        <NumField label="割引率（%）" value={req.ratePct} step={0.05} min={-1} max={20} onChange={(v) => set({ ratePct: v })} />
        <NumField label="想定元本" value={req.notional} step={1e6} min={1} width="9rem" onChange={(v) => set({ notional: v })} />
        <Segmented label="評価エンジン" value={req.engine} onChange={(v) => set({ engine: v })} options={[{ id: "isda", label: "ISDA" }, { id: "midpoint", label: "MidPoint" }]} />
        <button type="button" onClick={() => setReq(DEFAULT)}>初期値に戻す</button>
      </div>
      {data && <Result d={data} />}
    </div>
  );
}

function Result({ d }: { d: CdsResponse }) {
  const v = d.value;
  const prob = d.probability_curve;
  const up = d.upfront_by_spread;
  const now = { x: d.inputs.spreadBp, y: d.upfront_amount, date: `いまの市場スプレッド ${f(d.inputs.spreadBp, 3)}bp` };
  return (
    <>
      <div className="qc-tiles">
        <Tile emphasis label="NPV（プロテクションの買い手）" value={yen(v.npv, true)} note={`満期 ${d.maturity_date}（${f(d.years, 2)} 年）`} />
        <Tile label="Fair Upfront" value={yen(d.upfront_amount, true)} note={`想定元本の ${pct(v.fair_upfront, 4)}`} />
        <Tile label="Hazard Rate" value={pct(d.hazard, 4)} note={`近似 s/(1−R) = ${pct(d.hazard_approx, 4)}`} />
        <Tile label="満期の生存確率" value={pct(d.survival_at_maturity, 3)} note={`デフォルト確率 ${pct(1 - d.survival_at_maturity, 3)}`} />
        <Tile label="Fair Spread" value={`${f(v.fair_spread * 1e4, 3)} bp`} note={`割引係数（満期）${f(d.discount_at_maturity, 6)}`} />
        <Tile label="Premium レグ" value={yen(v.coupon_leg_npv)} note={`経過クーポンの払い戻し ${yen(v.accrual_rebate_npv)}`} />
        <Tile label="Protection レグ" value={yen(v.default_leg_npv)} note={`回収率 ${f(d.inputs.recoveryPct, 0)}%`} />
      </div>
      <div className="two-col">
        <LineChart title="累積デフォルト確率（生存確率 = 100% − 累積デフォルト確率）" origin={d.inputs.tradeDate} xMin={0} xMax={prob[prob.length - 1]?.time ?? 5} xLabel="年" yLabel="確率（%）"
          xTicks={Array.from({ length: Math.ceil(prob[prob.length - 1]?.time ?? 5) + 1 }, (_, i) => ({ x: i, label: `${i}年` }))}
          series={[
            { key: "d", label: "累積デフォルト確率", color: "var(--series-2)", points: prob.map((p) => ({ x: p.time, y: p.default_probability * 100, date: `${p.date}（生存確率 ${(p.survival_probability * 100).toFixed(4)}%）` })) },
          ]}
          formatY={(y) => `${y.toFixed(4)}%`} formatTick={(y) => y.toFixed(1)} />
        <LineChart title={`市場スプレッドと Fair Upfront（クーポン ${f(d.inputs.couponBp, 0)}bp、回収率 ${f(d.inputs.recoveryPct, 0)}%）`} origin={d.inputs.tradeDate}
          xMin={up[0]?.spread_bp ?? 0} xMax={up[up.length - 1]?.spread_bp ?? 500} xLabel="市場スプレッド（bp）" yLabel="Upfront（円）" zeroLine
          xTicks={[0, 100, 200, 300, 400, 500].filter((x) => x >= (up[0]?.spread_bp ?? 0)).map((x) => ({ x, label: String(x) }))}
          series={[
            { key: "u", label: "Fair Upfront", color: "var(--series-1)", points: up.map((p) => ({ x: p.spread_bp, y: p.upfront_amount, date: `${p.spread_bp}bp（Hazard ${pct(p.hazard, 3)}）` })) },
            { key: "now", label: "いまの値", color: "var(--series-2)", points: [now], dots: [now] },
          ]}
          formatY={(y) => yen(y, true)} formatTick={(y) => `${Math.round(y / 1e4).toLocaleString("ja-JP")}万`} />
      </div>
      <section className="card">
        <h2>キャッシュフロー（{d.cashflows.length} 期）</h2>
        <div className="table-wrap tall">
          <table className="data">
            <thead><tr><th>支払日</th><th>計算開始</th><th className="num">日数</th><th className="num">クーポン</th><th className="num">割引係数</th><th className="num">生存確率</th><th className="num">期間内のデフォルト確率</th></tr></thead>
            <tbody>{d.cashflows.map((c) => (
              <tr key={c.payment_date}><td>{c.payment_date}</td><td>{c.accrual_start}</td><td className="num">{c.accrual_days}</td><td className="num">{yen(c.coupon_amount)}</td>
                <td className="num">{f(c.discount_factor, 8)}</td><td className="num">{pct(c.survival_probability, 4)}</td><td className="num">{pct(c.default_probability, 4)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted small">{d.conventions.contract}。{d.conventions.curves}。{d.conventions.engine}</p>
      </section>
    </>
  );
}
