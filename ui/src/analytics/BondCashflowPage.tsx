import { useMemo, useState } from "react";
import { analyticsApi, type BondRequest, type BondResponse } from "../analyticsApi";
import { FlowChart } from "../charts/FlowChart";
import { LineChart } from "../charts/LineChart";
import { DateField, f, NumField, PageHead, Status, t3, Tile, useCalc, yearsFrom } from "./common";

// 債券キャッシュフロー（固定利付債、半年払い）。単利利回りから単価・複利利回り・経過利子・Zスプレッド・金利リスク・
// キャッシュフローを出す。計算はサーバー（rmql）。Carmine Studio の deterministic-cashflow から移した。

const DEFAULT: BondRequest = { tradeDate: "2022-03-30", issueDate: "2022-04-01", maturityDate: "2062-04-01", couponPct: 7.5, simpleYieldPct: 6.515, zSpreadBp: 50 };

export default function BondCashflowPage() {
  const [req, setReq] = useState<BondRequest>(DEFAULT);
  const set = (p: Partial<BondRequest>) => setReq((r) => ({ ...r, ...p }));
  const stable = useMemo(() => req, [req]);
  const { data, error, loading } = useCalc(stable, analyticsApi.bond);

  return (
    <div className="page">
      <PageHead title="債券キャッシュフロー"><Status loading={loading} error={error} /></PageHead>
      <div className="qc-controls" role="group" aria-label="債券の条件">
        <DateField label="取引日" value={req.tradeDate} onChange={(v) => set({ tradeDate: v })} />
        <DateField label="発行日" value={req.issueDate} onChange={(v) => set({ issueDate: v })} />
        <DateField label="償還日" value={req.maturityDate} onChange={(v) => set({ maturityDate: v })} />
        <NumField label="クーポン（%）" value={req.couponPct} step={0.1} min={0} max={20} onChange={(v) => set({ couponPct: v })} />
        <NumField label="単利利回り（%）" value={req.simpleYieldPct} step={0.005} min={0.001} max={20} onChange={(v) => set({ simpleYieldPct: v })} />
        <NumField label="Zスプレッド（bp）" value={req.zSpreadBp} step={5} min={-500} max={1000} onChange={(v) => set({ zSpreadBp: v })} />
        <button type="button" onClick={() => setReq(DEFAULT)}>初期値に戻す</button>
      </div>
      {data && <Result d={data} />}
    </div>
  );
}

function Result({ d }: { d: BondResponse }) {
  const r = d.risk;
  const future = d.cashflows.filter((c) => c.received);
  const xMax = Math.max(1, yearsFrom(d.settlement_date, d.inputs.maturityDate) + 0.2);
  const py = d.price_yield;
  const pt = (k: "price" | "duration_approx" | "convexity_approx") => py.map((p) => ({ x: p.yield_pct, y: p[k], date: `複利利回り ${p.yield_pct.toFixed(3)}%` }));
  const xMin = py[0]?.yield_pct ?? 0;
  const xHi = py[py.length - 1]?.yield_pct ?? 10;
  const now = { x: d.compound_yield_pct, y: d.clean_price, date: `いまの利回り ${t3(d.compound_yield_pct)}%` };
  const ticks = Array.from({ length: Math.floor(xHi - xMin) + 1 }, (_, i) => xMin + i).filter((_, i, a) => a.length <= 12 || i % 2 === 0).map((x) => ({ x, label: `${x}%` }));

  return (
    <>
      <div className="qc-tiles">
        <Tile emphasis label="単価（クリーン）" value={f(d.clean_price, 3)} note={`単利 ${f(d.inputs.simpleYieldPct, 3)}% から。残存 ${f(d.remaining_years, 7)} 年`} />
        <Tile label="複利利回り（半年複利）" value={`${t3(d.compound_yield_pct)}%`} note="単価から逆算、小数3桁" />
        <Tile label="経過利子 / 利含み価格" value={`${f(d.accrued, 6)} / ${f(d.dirty_price, 6)}`} note={`受渡日 ${d.settlement_date}`} />
        <Tile label="BPV" value={`${f(r.bpv_sen, 4)} 銭/bp`} note={`${f(r.bpv_yen, 6)} 円/bp（額面100）`} />
        <Tile label="修正デュレーション" value={t3(r.modified_duration)} note="小数3桁（4桁目切り捨て）" />
        <Tile label="コンベクシティ" value={t3(r.convexity)} note="小数3桁（4桁目切り捨て）" />
        <Tile label={`Zスプレッド ${f(d.inputs.zSpreadBp, 1)}bp の価格`} value={f(d.z_spread_npv, 6)} note={`スプレッドなし ${f(d.flat_dirty_price, 6)}（差 ${f(d.z_spread_npv - d.flat_dirty_price, 6)}）`} />
      </div>
      <div className="two-col">
        <FlowChart title={`将来のキャッシュフロー（${future.length} 件、額面100あたり）`} origin={d.settlement_date} xMax={xMax} yLabel="金額"
          series={[{ key: "coupon", label: "クーポン", color: "var(--series-1)" }, { key: "redemption", label: "償還", color: "var(--series-2)" }]}
          bars={future.map((c) => ({ date: c.payment_date, x: yearsFrom(d.settlement_date, c.payment_date), value: c.amount, series: c.kind, label: c.kind === "coupon" ? "クーポン" : "償還" }))}
          formatY={(y) => y.toFixed(2)} />
        <LineChart title="価格と複利利回り（一次・二次の近似つき）" origin={d.settlement_date} xMin={xMin} xMax={xHi} xLabel="複利利回り（%）" yLabel="単価" xTicks={ticks}
          series={[
            { key: "p", label: "価格", color: "var(--series-1)", points: pt("price") },
            { key: "d", label: "一次近似（デュレーション）", color: "var(--series-2)", dashed: true, points: pt("duration_approx") },
            { key: "c", label: "二次近似（＋コンベクシティ）", color: "var(--series-3)", dashed: true, points: pt("convexity_approx") },
            { key: "now", label: "いまの利回り", color: "var(--muted)", points: [now], dots: [now] },
          ]}
          formatY={(y) => y.toFixed(3)} formatTick={(y) => y.toFixed(0)} />
      </div>
      <section className="card">
        <h2>キャッシュフロー（{d.cashflows.length} 件）</h2>
        <div className="table-wrap tall">
          <table className="data">
            <thead><tr><th className="num">#</th><th>支払日</th><th>種類</th><th>計算期間</th><th className="num">金額</th><th>状態</th></tr></thead>
            <tbody>{d.cashflows.map((c, i) => (
              <tr key={`${c.payment_date}-${c.kind}`} className={c.received ? undefined : "muted"}><td className="num">{i + 1}</td><td>{c.payment_date}</td>
                <td>{c.kind === "coupon" ? "クーポン" : "償還"}</td><td>{c.accrual_start ? `${c.accrual_start} 〜 ${c.accrual_end}` : "—"}</td>
                <td className="num">{f(c.amount, 6)}</td><td>{c.received ? "将来" : "受渡日以前"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted small">{d.conventions.bond}。{d.conventions.yen}。{d.conventions.engine}</p>
      </section>
    </>
  );
}
