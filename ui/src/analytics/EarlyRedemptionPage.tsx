import { useMemo, useState } from "react";
import { analyticsApi, type EarlyRedemptionRequest, type EarlyRedemptionResponse } from "../analyticsApi";
import { LineChart } from "../charts/LineChart";
import { f, NumField, PageHead, Segmented, Status, Tile, useCalc } from "./common";

// 早期償還：コール条項つき債券（Hull-White 1因子）と MBS（パススルー、PSA・借換えインセンティブ）。
// 計算はサーバー（RiemannFinMath）。Carmine Studio の early-redemption から移した。

const DEFAULT: EarlyRedemptionRequest = {
  bond: { ratePct: 2, aPct: 15, sigmaPct: 1.2, couponPct: 3, firstCallYear: 1, callPrice: 100 },
  mbs: { psaPct: 100, incentive: 20, refiCostPct: 0.5, oasPrice: 110 },
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
            <NumField label="OAS を解く価格" value={req.mbs.oasPrice} step={1} min={50} max={150} onChange={(v) => setM({ oasPrice: v })} />
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
      <section className="card" data-testid="call-decision-section">
        <h2>コール判断：金利がどこまで下がればコールするか</h2>
        <p className="muted small">
          各コール日に、クーポンを除いた以降の支払いの価値（継続価値。以降のコールを織り込み済み）がコール価格を上回れば、発行体はコールします。クーポンが市場金利より高いと、金利が低い側でコールします。
          境界は、コールする状態のうち最も高い短期金利です。状態は Hull-White の格子（321点）で、計算は RiemannFinMath です。
        </p>
        <div className="two-col">
          <LineChart title="コール判断の境界（この短期金利より低ければコール）" origin="2026-11-02" xMin={b.exercise_boundary[0].payment_time - 0.25} xMax={b.exercise_boundary[b.exercise_boundary.length - 1].payment_time + 0.25}
            xLabel="コール日（年）" yLabel="短期金利（%）" xTicks={b.exercise_boundary.map((r) => ({ x: r.payment_time, label: String(r.payment_time) }))}
            series={[{ key: "bd", label: "境界", color: "var(--series-1)", points: b.exercise_boundary.filter((r) => r.call_below_short_rate !== null).map((r) => ({ x: r.payment_time, y: (r.call_below_short_rate as number) * 100, date: `${r.payment_time}年` })) }]}
            formatY={(y) => `${y.toFixed(2)}%`} formatTick={(y) => y.toFixed(1)} legend={false} />
          <LineChart title={`${b.decision_time}年のコール判断：継続価値とコール価格`} origin="2026-11-02" xMin={-2} xMax={8} xLabel="短期金利（%）" yLabel="価格"
            xTicks={[-2, 0, 2, 4, 6, 8].map((x) => ({ x, label: String(x) }))}
            series={[
              { key: "k", label: "継続価値（クーポン除き）", color: "var(--series-1)", points: b.decision.map((r) => ({ x: r.short_rate * 100, y: r.continuation_ex_coupon, date: `${(r.short_rate * 100).toFixed(2)}%` })) },
              { key: "c", label: "コール価格", color: "var(--series-2)", dashed: true, points: b.decision.map((r) => ({ x: r.short_rate * 100, y: r.call_price, date: `${(r.short_rate * 100).toFixed(2)}%` })) },
            ]}
            formatY={(y) => y.toFixed(2)} formatTick={(y) => y.toFixed(0)} />
        </div>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead><tr><th className="num">コール日（年）</th><th className="num">コールする短期金利の上限（%）</th><th className="num">格子のうちコールする割合</th></tr></thead>
            <tbody>{b.exercise_boundary.map((r) => (
              <tr key={r.payment_time}><td className="num">{r.payment_time}</td><td className="num">{r.call_below_short_rate === null ? "—（コールしない）" : f(r.call_below_short_rate * 100, 2)}</td><td className="num">{f(r.share_of_grid_called * 100, 1)}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
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

/** ダイナミック OAS（Hull-White の経路）、静的 OAS、経路での評価。計算は RiemannFinMath（compute_mbs_oas・compute_mbs_path_values）。 */
function OasResult({ d }: { d: EarlyRedemptionResponse }) {
  const { paths, oas, static: st } = d.mbs;
  const months = paths.rates[0]?.length ?? 0;
  const bp = (x: number) => `${f(x, 1)} bp`;
  const pathSeries = paths.rates.map((r, i) => ({
    key: `p${i}`, label: `経路 ${i + 1}`, color: "var(--series-1)", strokeWidth: 1, opacity: 0.55, inLegend: false,
    points: r.map((y, k) => ({ x: (k + 1) / 12, y: y * 100, date: `${k + 1}か月` })),
  }));
  const years = [0, 5, 10, 15, 20, 25, 30].map((x) => ({ x, label: String(x) }));
  const priceTicks = oas.by_price.map((r) => ({ x: r.price, label: String(r.price) }));
  const psaColors: Record<number, string> = { 0: "var(--series-1)", 50: "var(--series-3)", 100: "var(--series-2)" };
  const spreadTicks = [-200, -100, 0, 100, 200, 300].map((x) => ({ x, label: String(x) }));
  return (
    <>
      <section className="card" data-testid="oas-section">
        <h2>OAS（オプション調整後スプレッド）：ダイナミックと静的</h2>
        <p className="muted small">
          OAS は、経路ごとの現在価値の平均が市場価格に一致するように、短期金利に加えるスプレッドです。ダイナミック OAS は Hull-White の金利経路（{months}か月、初期カーブ 2%、a = 15%、σ = 1.2%）の上で、
          借換え金利は短期金利、割引率は短期金利 + 3% として解きます。静的 OAS は、金利 4% 一定・借換え金利 5% 一定の 1 本の経路で解いたものです。
        </p>
        <div className="qc-tiles">
          <Tile emphasis label={`ダイナミック OAS（500本、価格 ${f(oas.price, 2)}）`} value={bp(oas.dynamic_500_bp)} note={`20本では ${bp(oas.dynamic_20_bp)}`} />
          <Tile label={`静的 OAS（価格 ${f(oas.price, 2)}）`} value={bp(oas.static_bp)} note="金利 4% 一定、借換え金利 5% 一定" />
          <Tile label="経路での評価価格（20本の平均）" value={f(paths.mean_price, 3)} note={`WAL ${f(paths.mean_wal, 2)} 年。20本それぞれの価格は ${f(Math.min(...paths.price), 1)}〜${f(Math.max(...paths.price), 1)}`} />
          <Tile label="2000本の平均価格" value={f(paths.mc.mean_price, 3)} note={`標準誤差 ${f(paths.mc.standard_error, 3)}、WAL ${f(paths.mc.mean_wal, 2)} 年（seed ${paths.mc.seed}）`} />
        </div>
        <div className="two-col" style={{ marginTop: 10 }}>
          <LineChart title={`Hull-White の短期金利の経路（${paths.count}本）`} origin="2026-11-02" xMin={0} xMax={30} xLabel="経過年数" yLabel="短期金利（%）" xTicks={years}
            series={pathSeries} formatY={(y) => `${y.toFixed(2)}%`} formatTick={(y) => y.toFixed(1)} legend={false} tooltipRows={3} />
          <LineChart title="市場価格ごとの OAS：ダイナミック（20本）と静的" origin="2026-11-02" xMin={oas.by_price[0].price} xMax={oas.by_price[oas.by_price.length - 1].price} xLabel="市場価格" yLabel="OAS（bp）" xTicks={priceTicks} zeroLine
            series={[
              { key: "d", label: "ダイナミック OAS", color: "var(--series-1)", points: oas.by_price.map((r) => ({ x: r.price, y: r.dynamic_bp, date: `価格 ${r.price}` })) },
              { key: "s", label: "静的 OAS", color: "var(--series-2)", dashed: true, points: oas.by_price.map((r) => ({ x: r.price, y: r.static_bp, date: `価格 ${r.price}` })) },
            ]}
            formatY={(y) => `${y.toFixed(1)} bp`} formatTick={(y) => y.toFixed(0)} />
        </div>
      </section>
      <section className="card" data-testid="static-oas-section">
        <h2>静的 OAS：PSA と価格ごと、スプレッドと価格の関係</h2>
        <div className="two-col">
          <div className="table-wrap">
            <table className="data">
              <caption>PSA 0・50・100%、借換え金利 5%（インセンティブなし）、ゼロ金利 4% に加えるスプレッドで、架空の価格 95・105 に合わせる</caption>
              <thead><tr><th className="num">PSA（%）</th><th className="num">価格</th><th className="num">静的 OAS（bp）</th></tr></thead>
              <tbody>{st.table.map((r) => (
                <tr key={`${r.psa_percent}-${r.assumed_price}`}><td className="num">{r.psa_percent}</td><td className="num">{r.assumed_price}</td><td className="num">{f(r.oas_bp, 2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <LineChart title="スプレッドと価格（PSA 別）" origin="2026-11-02" xMin={-200} xMax={300} xLabel="スプレッド（bp）" yLabel="価格" xTicks={spreadTicks}
            series={[0, 50, 100].map((psa) => ({
              key: `psa${psa}`, label: `PSA ${psa}%`, color: psaColors[psa],
              points: st.price_curve.filter((r) => r.psa_percent === psa).map((r) => ({ x: r.spread_bp, y: r.price, date: `${r.spread_bp} bp` })),
            }))}
            formatY={(y) => y.toFixed(2)} formatTick={(y) => y.toFixed(0)} />
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
      <OasResult d={d} />
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
