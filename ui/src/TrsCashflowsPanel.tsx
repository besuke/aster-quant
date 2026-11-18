import { useState } from "react";
import { api, fmt, fmtTrunc3, type SheetRow, type TrsCashflows } from "./api";

// TRS 契約書の案件からキャッシュフロー・スケジュールを作る。日程と金額は rmql がサーバーで計算し、画面は表示だけ。
// 画面では FundingLeg と ReturnLeg を一つの表にまとめ、「レッグ」列で区別する。
// Excel（FundingLeg・ReturnLeg の2シート）は契約書の PDF と同じベース名で保存される。

const STATUS_CLASS: Record<string, string> = { 確定: "st-success", 試算: "st-partial", 算出不可: "st-none" };

export default function TrsCashflowsPanel({ caseId, baseName }: { caseId: string; baseName: string | null }) {
  const [data, setData] = useState<TrsCashflows | null>(null);
  const [scenario, setScenario] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api.trsCashflows(caseId, scenario.trim() === "" ? null : Number(scenario)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" data-testid="trs-cashflows">
      <h2>キャッシュフロー・スケジュール（FundingLeg・ReturnLeg）</h2>
      <p className="small">
        原文と照合した契約条件から、両レッグの計算期間・リセット日・金利決定日・観測期間・支払日・評価日と金額を rmql で作り、Excel に保存する。
        ファイル名は契約書の PDF と同じベース名（{baseName ?? "共通名"}）。
      </p>
      <div className="row controls">
        <label className="small">
          ReturnLeg の試算シナリオ（指数の年率、%。空欄なら試算しない）：
          <input className="num-input" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="例 2" inputMode="decimal" aria-label="シナリオの年率" />
        </label>
        <button className="btn primary" disabled={busy} onClick={() => void run()} data-testid="trs-cashflows-run">
          {busy ? "作成中…" : data ? "作り直す" : "キャッシュフローを作る"}
        </button>
        {data && (
          <>
            <a className="btn" href={api.trsCashflowsUrl(caseId)} data-testid="trs-excel">
              Excel を保存（{data.file}）
            </a>
            <a className="btn" href={api.documentDownloadUrl(caseId)} data-testid="trs-pdf">
              契約書 PDF を保存（{data.base_name}.pdf）
            </a>
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className="meta small">
            <span>評価日 {data.evaluation_date}（市場データの日付）</span>
            <span>{data.engine}</span>
            {!data.name_confirmed && <span className="warn">ファイル名に不明な部分がある（UNKNOWN）：{Object.values(data.name_missing).join("；")}</span>}
          </div>
          <LegTable funding={data.sheets.FundingLeg} ret={data.sheets.ReturnLeg} />
          <div className="two-col">
            <details open>
              <summary>
                契約条件との照合（{data.checks.filter((c) => c.一致).length}/{data.checks.length} 一致）
              </summary>
              <div className="table-wrap">
                <table className="data compact" data-testid="trs-checks">
                  <thead>
                    <tr>
                      <th>レッグ</th>
                      <th>照合</th>
                      <th>契約</th>
                      <th>rmql</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.checks.map((c, i) => (
                      <tr key={i}>
                        <td>{c.レッグ}</td>
                        <td>{c.照合}</td>
                        <td className="mono">{c.契約}</td>
                        <td className="mono">{c.計算}</td>
                        <td>
                          <span className={`chip ${c.一致 ? "st-success" : c.照合.startsWith("（参考）") ? "st-partial" : "st-failed"}`}>{c.一致 ? "一致" : c.照合.startsWith("（参考）") ? "不一致（参考）" : "不一致"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details open>
              <summary>使った契約条件（不足・前提 {data.terms.filter((t) => t.状態 !== "原文どおり").length} 件）</summary>
              <div className="table-wrap">
                <table className="data compact">
                  <thead>
                    <tr>
                      <th>項目</th>
                      <th>原文の値</th>
                      <th>変換後</th>
                      <th>状態</th>
                      <th>備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.terms.map((t, i) => (
                      <tr key={i}>
                        <td>{t.項目}</td>
                        <td>{t.原文の値}</td>
                        <td className="mono">{t.変換後}</td>
                        <td>
                          <span className={`chip ${t.状態 === "原文どおり" ? "st-success" : t.状態 === "前提" ? "st-partial" : "st-failed"}`}>{t.状態}</span>
                        </td>
                        <td className="small">{t.備考}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </>
      )}
    </section>
  );
}


// 両レッグを一つの表に。日程と金額は rmql の計算結果（サーバーが返したシートの値）をそのまま並べる
type Leg = "FundingLeg" | "ReturnLeg";
interface LegRow {
  leg: Leg;
  period: number;
  start: string | null;
  end: string | null;
  calcDate: string | null;
  calcNote: string;
  payDate: string | null;
  amount: number | null;
  status: string;
  basis: string;
}

const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

function toRows(leg: Leg, rows: SheetRow[]): LegRow[] {
  return rows
    .filter((r) => "期間" in r)
    .map((r) => ({
      leg,
      period: Number(r.期間),
      start: s(r.計算期間開始日),
      end: s(r.計算期間終了日),
      calcDate: leg === "FundingLeg" ? s(r.金利決定日) : s(r.評価日),
      calcNote:
        leg === "FundingLeg"
          ? `金利決定日。観測 ${s(r.観測期間開始日) ?? "—"}〜${s(r.観測期間終了日) ?? "—"}${r.複利金利_pct != null ? `、複利 ${fmtTrunc3(Number(r.複利金利_pct))}%` : ""}`
          : `評価日。期初 ${s(r.期初の評価日) ?? "当初価格"}${r.騰落率_pct != null ? `、騰落 ${fmt(Number(r.騰落率_pct), 4)}%` : ""}`,
      payDate: s(r.支払日),
      amount: r.金額 == null ? null : Number(r.金額),
      status: String(r.金額の状態 ?? ""),
      basis: String(r.金額の根拠 ?? ""),
    }));
}

function LegTable({ funding, ret }: { funding: SheetRow[]; ret: SheetRow[] }) {
  const unavailable = ([["FundingLeg", funding], ["ReturnLeg", ret]] as [Leg, SheetRow[]][])
    .filter(([, rows]) => rows.length && !("期間" in rows[0]))
    .map(([leg, rows]) => `${leg}：算出不可。不足項目：${String(rows[0].不足項目)}`);
  const rows = [...toRows("FundingLeg", funding), ...toRows("ReturnLeg", ret)].sort((a, b) => a.period - b.period || (a.leg === "FundingLeg" ? -1 : 1));
  const notes = (leg: Leg, sheet: SheetRow[]) => ({
    leg,
    schedule: [...new Set(sheet.map((r) => s(r.日程の状態)).filter(Boolean))] as string[],
    missing: [...new Set(sheet.map((r) => s(r.不足項目)).filter(Boolean))] as string[],
    amount: [...new Set(sheet.filter((r) => "期間" in r).map((r) => `${r.金額の状態}：${r.金額の根拠}`))],
  });
  return (
    <div className="sheet" data-testid="legs-table">
      {unavailable.map((u) => (
        <div key={u} className="error">{u}</div>
      ))}
      <div className="table-wrap">
        <table className="data compact">
          <thead>
            <tr>
              <th>レッグ</th>
              <th className="num">期間</th>
              <th>計算期間</th>
              <th>計算日・評価日</th>
              <th>受渡日・支払日</th>
              <th className="num">金額（JPY）</th>
              <th>算出状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.leg + r.period} title={r.basis} data-leg={r.leg}>
                <td>{r.leg}</td>
                <td className="num">{r.period}</td>
                <td className="mono">
                  {r.start ?? "—"} 〜 {r.end ?? "—"}
                </td>
                <td>
                  <span className="mono">{r.calcDate ?? "—"}</span>
                  <div className="muted small">{r.calcNote}</div>
                </td>
                <td className={r.payDate ? "mono" : "muted"}>{r.payDate ?? "不足（定義なし）"}</td>
                <td className="num">{r.amount === null ? <span className="muted">空欄</span> : fmt(r.amount, 0)}</td>
                <td>
                  <span className={`chip ${STATUS_CLASS[r.status] ?? ""}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="small">
        {[notes("FundingLeg", funding), notes("ReturnLeg", ret)].flatMap((n) => [
          ...n.schedule.map((x) => <li key={n.leg + "s" + x}>{n.leg} の日程：{x}</li>),
          ...n.missing.map((x) => <li key={n.leg + "m" + x} className="bad-text">{n.leg} の不足：{x}</li>),
          ...n.amount.map((x) => <li key={n.leg + "a" + x}>{n.leg} の金額：{x}</li>),
        ])}
      </ul>
    </div>
  );
}
