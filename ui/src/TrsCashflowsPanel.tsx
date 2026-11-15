import { useState } from "react";
import { api, fmt, type SheetRow, type TrsCashflows } from "./api";

// C1 の案件から TRS のキャッシュフロー・スケジュールを作る。日程と金額は RiemannFinMath がサーバーで計算し、画面は表示だけ。
// Excel（FundingLeg・ReturnLeg の2シート）は契約書の PDF と同じベース名で保存される。

const STATUS_CLASS: Record<string, string> = { 確定: "st-success", 試算: "st-partial", 算出不可: "st-none" };
const FUNDING_COLS = ["期間", "計算期間開始日", "計算期間終了日", "リセット日", "金利決定日", "観測期間開始日", "観測期間終了日", "支払日", "複利金利_pct", "金額", "金額の状態"];
const RETURN_COLS = ["期間", "計算期間開始日", "計算期間終了日", "期初の評価日", "評価日", "規則による評価日", "支払日", "期末の水準", "騰落率_pct", "金額", "金額の状態"];
const LABEL: Record<string, string> = { 複利金利_pct: "複利金利（%）", 騰落率_pct: "騰落率（%）", 金額: "金額（JPY）" };

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
        原文と照合した契約条件から、両レッグの計算期間・リセット日・金利決定日・観測期間・支払日・評価日と金額を RiemannFinMath で作り、Excel に保存する。
        ファイル名は契約書の PDF と同じベース名（{baseName ?? "共通名"}）。
      </p>
      <div className="row">
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
          <Sheet title="FundingLeg" rows={data.sheets.FundingLeg} cols={FUNDING_COLS} />
          <Sheet title="ReturnLeg" rows={data.sheets.ReturnLeg} cols={RETURN_COLS} />
          <details open>
            <summary>
              契約条件との照合（{data.checks.filter((c) => c.一致).length}/{data.checks.length} 一致）
            </summary>
            <table className="data compact" data-testid="trs-checks">
              <thead>
                <tr>
                  <th>レッグ</th>
                  <th>照合</th>
                  <th>契約</th>
                  <th>RiemannFinMath</th>
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
          </details>
          <details>
            <summary>使った契約条件（不足・前提 {data.terms.filter((t) => t.状態 !== "原文どおり").length} 件）</summary>
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
          </details>
        </>
      )}
    </section>
  );
}

function Sheet({ title, rows, cols }: { title: string; rows: SheetRow[]; cols: string[] }) {
  if (rows.length && "不足項目" in rows[0] && !("期間" in rows[0])) {
    return (
      <div className="error">
        {title}：算出不可。不足項目：{String(rows[0].不足項目)}
      </div>
    );
  }
  const notes = [...new Set(rows.map((r) => String(r.日程の状態 ?? "")))].filter(Boolean);
  const missing = [...new Set(rows.map((r) => String(r.不足項目 ?? "")))].filter(Boolean);
  return (
    <div className="sheet" data-testid={`sheet-${title}`}>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="data compact">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={typeof rows[0]?.[c] === "number" && c !== "期間" ? "num" : ""}>
                  {LABEL[c] ?? c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} title={String(r.金額の根拠 ?? "")}>
                {cols.map((c) => {
                  const v = r[c];
                  if (c === "金額の状態") return <td key={c}><span className={`chip ${STATUS_CLASS[String(v)] ?? ""}`}>{String(v)}</span></td>;
                  if (v === null || v === undefined || v === "") return <td key={c} className="muted">{c === "支払日" ? "不足" : "—"}</td>;
                  if (typeof v === "number") return <td key={c} className="num">{c === "期間" ? v : c === "金額" ? fmt(v, 0) : fmt(v, 4)}</td>;
                  return <td key={c} className="mono">{v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="small">
        {notes.map((n) => (
          <li key={n}>日程：{n}</li>
        ))}
        {missing.map((n) => (
          <li key={n} className="bad-text">不足：{n}</li>
        ))}
        {[...new Set(rows.map((r) => `${r.金額の状態}：${r.金額の根拠}`))].map((n) => (
          <li key={n}>金額：{n}</li>
        ))}
      </ul>
    </div>
  );
}
