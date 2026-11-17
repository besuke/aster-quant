import { useMemo, useState } from "react";
import { analyticsApi, type ZeroCurveBlock, type ZeroCurvesResponse, type ZeroNode } from "../analyticsApi";
import { LineChart, type Series } from "../charts/LineChart";
import { DateField, f, NumField, PageHead, Status, useCalc } from "./common";

// イールドカーブ：ゼロ金利のノードから、割引係数の対数を単調3次補間したカーブと、平行移動したカーブを作る。
// 計算はサーバー（RiemannFinMath）。Carmine Studio の yield-curves から移した。

const DEFAULT_EV = "2022-08-19";
const DEFAULT_NODES: ZeroNode[] = [
  { tenor: "0D", date: "2022-08-19", ratePct: 0.05 }, { tenor: "1M", date: "2022-09-19", ratePct: 0.06 },
  { tenor: "3M", date: "2022-11-21", ratePct: 0.08 }, { tenor: "6M", date: "2023-02-20", ratePct: 0.11 },
  { tenor: "1Y", date: "2023-08-21", ratePct: 0.18 }, { tenor: "2Y", date: "2024-08-19", ratePct: 0.32 },
  { tenor: "3Y", date: "2025-08-19", ratePct: 0.48 }, { tenor: "5Y", date: "2027-08-19", ratePct: 0.75 },
  { tenor: "10Y", date: "2032-08-19", ratePct: 1.15 },
];
const C = { zero: "var(--series-1)", disc: "var(--series-2)", shift: "var(--series-3)" };

export default function YieldCurvesPage() {
  const [ev, setEv] = useState(DEFAULT_EV);
  const [nodes, setNodes] = useState<ZeroNode[]>(DEFAULT_NODES);
  const [shiftBp, setShiftBp] = useState(50);
  // 評価日を変えたら、ノードの日付は年限から作り直す（日付を空にしてサーバーに任せる）
  const req = useMemo(() => ({ evaluationDate: ev, nodes, shiftBp }), [ev, nodes, shiftBp]);
  const { data, error, loading } = useCalc(req, analyticsApi.zeroCurves);

  const setNode = (i: number, p: Partial<ZeroNode>) => setNodes((ns) => ns.map((n, k) => (k === i ? { ...n, ...p } : n)));
  const reset = () => { setEv(DEFAULT_EV); setNodes(DEFAULT_NODES); setShiftBp(50); };

  return (
    <div className="page">
      <PageHead title="イールドカーブ"><Status loading={loading} error={error} /></PageHead>
      <div className="qc-controls" role="group" aria-label="カーブの条件">
        <DateField label="評価日" value={ev} onChange={(v) => { setEv(v); setNodes((ns) => ns.map((n) => ({ ...n, date: undefined }))); }} />
        <NumField label="平行移動（bp）" value={shiftBp} step={5} min={-500} max={500} onChange={setShiftBp} />
        <input type="range" min={-200} max={200} step={5} value={shiftBp} onChange={(e) => setShiftBp(Number(e.target.value))} aria-label="平行移動（bp）" style={{ width: 220 }} />
        <button type="button" onClick={reset}>初期値に戻す</button>
        {data && <span className="qc-state">{data.conventions.engine}</span>}
      </div>

      <div className="split">
        <section className="card">
          <h2>ノード（ゼロ金利、連続複利）</h2>
          <div className="table-wrap">
            <table className="data qc-edit">
              <thead><tr><th>年限</th><th>日付</th><th className="num">ゼロ金利（%）</th><th /></tr></thead>
              <tbody>
                {nodes.map((n, i) => (
                  <tr key={i}>
                    <td><input type="text" value={n.tenor} style={{ width: "4.5rem" }} aria-label={`${i + 1}行目の年限`}
                      onChange={(e) => setNode(i, { tenor: e.target.value.toUpperCase(), date: undefined })} /></td>
                    <td><input type="date" value={n.date ?? data?.nodes.find((x) => x.tenor === n.tenor)?.date ?? ""} aria-label={`${n.tenor} の日付`}
                      onChange={(e) => setNode(i, { date: e.target.value || undefined })} /></td>
                    <td className="num"><input type="number" step={0.01} value={n.ratePct} style={{ width: "6rem" }} aria-label={`${n.tenor} のゼロ金利`}
                      onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) setNode(i, { ratePct: v }); }} /></td>
                    <td><button type="button" className="qc-small" onClick={() => setNodes((ns) => ns.filter((_, k) => k !== i))} disabled={nodes.length <= 2} aria-label={`${n.tenor} を削除`}>削除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setNodes((ns) => [...ns, { tenor: "20Y", ratePct: ns[ns.length - 1]?.ratePct ?? 1 }])}>ノードを足す</button>
          </div>
        </section>
        <section className="card">
          <h2>年限ごとの値{data ? `（評価日 ${data.evaluation_date}）` : ""}</h2>
          {data && <CurveTable d={data} />}
        </section>
      </div>

      {data && <CurveCharts d={data} />}
    </div>
  );
}

function CurveTable({ d }: { d: ZeroCurvesResponse }) {
  const s = d.shifted_curve.table;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>年限</th><th>日付</th><th className="num">割引係数</th><th className="num">ゼロ金利</th>
          <th className="num">{`${d.shift_bp >= 0 ? "+" : ""}${d.shift_bp}bp 後のゼロ金利`}</th></tr></thead>
        <tbody>{d.curve.table.map((r, i) => (
          <tr key={r.tenor}><th scope="row">{r.tenor}</th><td className="nowrap">{r.date}</td><td className="num">{f(r.discount, 8)}</td>
            <td className="num">{r.zero_continuous === null ? "—" : `${f(r.zero_continuous * 100, 4)}%`}</td>
            <td className="num">{s[i]?.zero_continuous == null ? "—" : `${f(s[i].zero_continuous! * 100, 4)}%`}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function CurveCharts({ d }: { d: ZeroCurvesResponse }) {
  const xMax = Math.max(...d.nodes.map((n) => n.time)) + 0.1;
  const pts = (b: ZeroCurveBlock, pick: (p: ZeroCurveBlock["points"][number]) => number | null) =>
    b.points.flatMap((p) => { const y = pick(p); return y === null ? [] : [{ x: p.time, y, date: p.date }]; });
  const dots = d.nodes.filter((n) => n.time > 0).map((n) => ({ x: n.time, y: n.zero_rate * 100, date: `${n.date}（${n.tenor}）` }));
  const shiftLabel = `${d.shift_bp >= 0 ? "+" : ""}${d.shift_bp}bp`;
  const both = (pick: (p: ZeroCurveBlock["points"][number]) => number | null, withDots = false): Series[] => [
    { key: "c", label: "カーブ", color: C.zero, points: pts(d.curve, pick), dots: withDots ? dots : undefined },
    ...(d.shift_bp !== 0 ? [{ key: "s", label: shiftLabel, color: C.shift, dashed: true, points: pts(d.shifted_curve, pick) }] : []),
  ];
  const pctOf = (v: number | null) => (v === null ? null : v * 100);
  return (
    <div className="qc-grid-3">
      <LineChart title="ゼロ金利（連続複利、点はノード）" series={both((p) => pctOf(p.zero_continuous), true)} origin={d.evaluation_date} xMax={xMax} height={260} yLabel="ゼロ金利（%）"
        formatY={(y) => `${y.toFixed(4)}%`} formatTick={(y) => y.toFixed(2)} legend />
      <LineChart title="割引係数" series={both((p) => p.discount)} origin={d.evaluation_date} xMax={xMax} height={260} yLabel="割引係数"
        formatY={(y) => y.toFixed(8)} formatTick={(y) => y.toFixed(3)} legend />
      <LineChart title="フォワード金利（隣り合う日のあいだ、連続複利）" series={both((p) => pctOf(p.forward_step))} origin={d.evaluation_date} xMax={xMax} height={260} yLabel="フォワード（%）"
        formatY={(y) => `${y.toFixed(4)}%`} formatTick={(y) => y.toFixed(2)} legend />
    </div>
  );
}
