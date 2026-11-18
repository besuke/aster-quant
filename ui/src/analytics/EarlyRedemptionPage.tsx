import { useMemo, useState } from "react";
import { analyticsApi, type EarlyRedemptionRequest, type EarlyRedemptionResponse } from "../analyticsApi";
import { LineChart } from "../charts/LineChart";
import { f, NumField, PageHead, Segmented, Status, Tile, useCalc } from "./common";

// 早期償還：コール条項つき債券（Hull-White 1因子）と MBS（パススルー、PSA・借換えインセンティブ）。
// 計算はサーバー（RiemannFinMath）。Carmine Studio の early-redemption から移した。

const DEFAULT: EarlyRedemptionRequest = {
  bond: { ratePct: 2, aPct: 15, sigmaPct: 1.2, couponPct: 3, firstCallYear: 1, callPrice: 100 },
  mbs: { psaPct: 100, incentive: 20, refiCostPct: 0.5 },
};
type Tab = "bond" | "mbs";

export default function EarlyRedemptionPage() {
  const [tab, setTab] = useState<Tab>("bond");
  const [req, setReq] = useState(DEFAULT);
  const setB = (p: Partial<EarlyRedemptionRequest["bond"]>) => setReq((r) => ({ ...r, bond: { ...r.bond, ...p } }));
  const setM = (p: Partial<EarlyRedemptionRequest["mbs"]>) => setReq((r) => ({ ...r, mbs: { ...r.mbs, ...p } }));
  const stable = useMemo(() => req, [req]);
  const { data, error, loading } = useCalc(stable, analyticsApi.earlyRedemption);

  return (
    <div className="page">
      <PageHead title="早期償還（コール債・MBS）"><Status loading={loading} error={error} /></PageHead>
      <div className="qc-controls" role="group" aria-label="対象">
        <Segmented label="対象" value={tab} onChange={setTab} options={[{ id: "bond", label: "コール条項つき債券" }, { id: "mbs", label: "MBS（パススルー）" }]} />
        <span className="qc-sep" />
        {tab === "bond" ? (
          <>
            <NumField label="金利（%）" value={req.bond.ratePct} step={0.25} min={-2} max={10} onChange={(v) => setB({ ratePct: v })} />
            <NumField label="平均回帰 a（%）" value={req.bond.aPct} step={1} min={1} max={100} onChange={(v) => setB({ aPct: v })} />
            <NumField label="ボラティリティ σ（%）" value={req.bond.sigmaPct} step={0.1} min={0} max={3} onChange={(v) => setB({ sigmaPct: v })} />
            <NumField label="クーポン（%）" value={req.bond.couponPct} step={0.25} min={0} max={10} onChange={(v) => setB({ couponPct: v })} />
            <NumField label="最初のコール（年）" value={req.bond.firstCallYear} step={0.5} min={0.5} max={4.5} onChange={(v) => setB({ firstCallYear: v })} />
            <NumField label="コール価格" value={req.bond.callPrice} step={0.5} min={90} max={120} onChange={(v) => setB({ callPrice: v })} />
          </>
        ) : (
          <>
            <NumField label="PSA（%）" value={req.mbs.psaPct} step={10} min={0} max={500} onChange={(v) => setM({ psaPct: v })} />
            <NumField label="借換えの感応度" value={req.mbs.incentive} step={1} min={0} max={50} onChange={(v) => setM({ incentive: v })} />
            <NumField label="借換え費用（%）" value={req.mbs.refiCostPct} step={0.1} min={0} max={3} onChange={(v) => setM({ refiCostPct: v })} />
          </>
        )}
        <button type="button" onClick={() => setReq(DEFAULT)}>初期値に戻す</button>
      </div>
      {data && (tab === "bond" ? <BondResult d={data} /> : <MbsResult d={data} />)}
      {data && <p className="muted small">{tab === "bond" ? data.conventions.bond : data.conventions.mbs}。{data.conventions.engine}</p>}
    </div>
  );
}

function BondResult({ d }: { d: EarlyRedemptionResponse }) {
  const b = d.bond;
  const vols = b.by_volatility;
  const call = b.flows.filter((x) => x.call_price !== null);
  const pt = (k: "callable" | "bullet" | "issuer_call_value") => vols.map((v) => ({ x: v.volatility * 100, y: v[k], date: `σ = ${(v.volatility * 100).toFixed(2)}%` }));
  const now = { x: d.inputs.bond.sigmaPct, y: b.issuer_call_value, date: `いまの σ = ${d.inputs.bond.sigmaPct}%` };
  return (
    <>
      <div className="qc-tiles">
        <Tile emphasis label="コール条項つきの価格" value={f(b.callable, 4)} note="Hull-White 1因子、発行体は価値を最小にするようにコール" />
        <Tile label="コールなし（ブレット）の価格" value={f(b.bullet, 4)} note="同じクーポンと償還の割引現在価値" />
        <Tile label="発行体のコール・オプション" value={f(b.issuer_call_value, 4)} note="ブレット − コール条項つき（投資家から見た価値の減少）" />
        <Tile label="コール日" value={call.length ? `${call[0].time}年〜${call[call.length - 1].time}年` : "なし"} note={`${call.length} 回、コール価格 ${f(d.inputs.bond.callPrice, 2)}`} />
      </div>
      <div className="two-col">
        <LineChart title="ボラティリティと価格（コール条項つき・ブレット）" origin="2026-11-02" xMin={0} xMax={2.5} xLabel="ボラティリティ σ（%）" yLabel="価格"
          xTicks={[0, 0.5, 1, 1.5, 2, 2.5].map((x) => ({ x, label: `${x}%` }))}
          series={[
            { key: "b", label: "ブレット", color: "var(--series-3)", points: pt("bullet") },
            { key: "c", label: "コール条項つき", color: "var(--series-1)", points: pt("callable") },
          ]}
          formatY={(y) => y.toFixed(3)} formatTick={(y) => y.toFixed(1)} />
        <LineChart title="ボラティリティと発行体のコール・オプションの価値" origin="2026-11-02" xMin={0} xMax={2.5} xLabel="ボラティリティ σ（%）" yLabel="オプション価値"
          xTicks={[0, 0.5, 1, 1.5, 2, 2.5].map((x) => ({ x, label: `${x}%` }))}
          series={[
            { key: "o", label: "コール・オプション", color: "var(--series-2)", points: pt("issuer_call_value") },
            { key: "now", label: "いまの σ", color: "var(--muted)", points: [now], dots: [now] },
          ]}
          formatY={(y) => y.toFixed(3)} formatTick={(y) => y.toFixed(1)} />
      </div>
      <section className="card">
        <h2>キャッシュフローとコール価格</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th className="num">時点（年）</th><th className="num">クーポン</th><th className="num">元本</th><th className="num">コール価格</th></tr></thead>
            <tbody>{b.flows.map((x) => (
              <tr key={x.time}><td className="num">{x.time}</td><td className="num">{f(x.coupon, 2)}</td><td className="num">{f(x.principal, 2)}</td><td className="num">{x.call_price === null ? "—" : f(x.call_price, 2)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MbsResult({ d }: { d: EarlyRedemptionResponse }) {
  const m = d.mbs;
  const cf = m.flat_cashflows;
  const cprPt = (k: "falling" | "flat" | "rising") => m.cpr.map((r) => ({ x: r.month / 12, y: r[k] * 100, date: `${r.month}か月` }));
  const balPt = cf.map((r) => ({ x: r.month / 12, y: r.end_balance, date: `${r.month}か月` }));
  const years = [0, 5, 10, 15, 20, 25, 30].map((x) => ({ x, label: String(x) }));
  return (
    <>
      <div className="qc-tiles">
        {m.scenarios.map((s) => (
          <Tile key={s.scenario} emphasis={s.scenario === "金利一定"} label={s.scenario} value={f(s.price_path_discount, 3)}
            note={`WAL ${f(s.weighted_average_life, 2)} 年、割引率 4% 固定の価格 ${f(s.price_fixed_discount, 3)}`} />
        ))}
      </div>
      <div className="two-col">
        <LineChart title="CPR（年率の期限前返済率、借換え金利のシナリオ別）" origin="2026-11-02" xMin={0} xMax={30} xLabel="経過年数" yLabel="CPR（%）" xTicks={years}
          series={[
            { key: "f", label: "借換え金利低下", color: "var(--series-1)", points: cprPt("falling") },
            { key: "n", label: "金利一定", color: "var(--series-3)", points: cprPt("flat") },
            { key: "r", label: "借換え金利上昇", color: "var(--series-2)", dashed: true, points: cprPt("rising") },
          ]}
          formatY={(y) => `${y.toFixed(2)}%`} formatTick={(y) => y.toFixed(0)} />
        <LineChart title="元本残高（金利一定）" origin="2026-11-02" xMin={0} xMax={30} xLabel="経過年数" yLabel="残高" xTicks={years}
          series={[{ key: "b", label: "残高", color: "var(--series-1)", points: balPt }]}
          formatY={(y) => y.toFixed(2)} formatTick={(y) => y.toFixed(0)} legend={false} />
      </div>
      <section className="card">
        <h2>キャッシュフロー（金利一定、元本 {m.pool.balance}）</h2>
        <div className="table-wrap tall">
          <table className="data">
            <thead><tr><th className="num">月</th><th className="num">利息</th><th className="num">約定元本</th><th className="num">期限前返済</th><th className="num">期末残高</th></tr></thead>
            <tbody>{cf.map((r) => (
              <tr key={r.month}><td className="num">{r.month}</td><td className="num">{f(r.interest, 4)}</td><td className="num">{f(r.scheduled_principal, 4)}</td><td className="num">{f(r.prepaid_principal, 4)}</td><td className="num">{f(r.end_balance, 4)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
