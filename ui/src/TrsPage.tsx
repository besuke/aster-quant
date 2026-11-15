import { useMemo, useState } from "react";
import { api, type C1Result, type ConditionRow, type UploadResult } from "./api";
import Upload from "./Upload";
import TrsCashflowsPanel from "./TrsCashflowsPanel";

const VALUE_STATUS: Record<string, string> = {
  stated: "記載あり",
  blank: "空欄",
  bracketed: "選択肢（未確定）",
  not_found: "記載なし",
};

export default function TrsPage() {
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [reader, setReader] = useState<"saved" | "claude_code">("saved");
  const [result, setResult] = useState<C1Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConditionRow | null>(null);
  const [showPdf, setShowPdf] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      setResult(await api.runC1(uploaded?.uploadId ?? null, reader));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const sections = useMemo(() => {
    const m = new Map<string, ConditionRow[]>();
    for (const c of result?.conditions ?? []) m.set(c.section, [...(m.get(c.section) ?? []), c]);
    return [...m.entries()];
  }, [result]);

  return (
    <div className="page">
      <section className="intro">
        <h1>C1 TRS確認書</h1>
        <p>
          トータル・リターン・スワップの個別契約書（PDF・HTML）をアップロードすると、サーバーの <code>server/data/uploads/c1/</code>{" "}
          に保存し、そこから取込・本文の抽出・契約条件の読解・原文との照合・FpML と Aladdin 向け下書きの作成までを行う。
          推測で値を埋めず、原文に記載のない項目は「記載なし」として残す。
        </p>
      </section>

      <section className="card">
        <Upload
          kind="c1"
          accept=".pdf,.htm,.html"
          label="TRS 確認書（.pdf・.htm・.html）"
          hint="アップロードしないで実行すると、デモの確認書（架空）を使う"
          uploaded={uploaded}
          onUploaded={setUploaded}
        />
        <div className="row">
          <label className="small">
            読み方：
            <select value={reader} onChange={(e) => setReader(e.target.value as "saved" | "claude_code")}>
              <option value="saved">保存済みの抽出結果（デモ。AI を呼ばない）</option>
              <option value="claude_code">Claude Code で読む（開発用。数分かかる）</option>
            </select>
          </label>
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? (reader === "claude_code" ? "Claude Code が読解中…（数分）" : "処理中…") : "取込・抽出・照合を実行"}
          </button>
        </div>
        {reader === "saved" && uploaded && (
          <div className="warn small">
            保存済みの抽出結果はデモの確認書のものである。別の契約書に使うと、原文との照合で不一致になる（それが正しい結果）。実際の契約書は「Claude Code で読む」を選ぶ。
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      {result && (
        <>
          <section className="card">
            <div className="row spread">
              <h2>
                {result.source_file} <span className={`chip ${result.final ? "st-success" : "st-partial"}`}>{result.state}</span>
              </h2>
              <div className="row">
                <button className="btn" onClick={() => setShowPdf((v) => !v)}>
                  {showPdf ? "原資料を閉じる" : "原資料を表示"}
                </button>
                {result.fpml_file && (
                  <a className="btn" href={api.fpmlUrl(result.case_id)}>
                    FpML（{result.fpml_file}）
                  </a>
                )}
              </div>
            </div>
            <div className="meta small">
              <span>案件 {result.case_id}</span>
              <span>{result.reader_note}</span>
              {result.document && (
                <span>
                  {result.document.kind.toUpperCase()} {result.document.pages} ページ · SHA-256 {result.document.sha256.slice(0, 12)}…
                </span>
              )}
              <span>{result.seconds.toFixed(1)} 秒</span>
            </div>
            {result.failure && (
              <div className="error">
                {result.failure.kind}：{result.failure.message}
              </div>
            )}
            {result.summary && (
              <dl className="detail summary">
                {Object.entries(result.summary).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className={v === "Unknown" ? "muted" : ""}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {result.verdicts && (
              <div className="chips">
                {Object.entries(result.verdicts).map(([k, v]) => (
                  <span key={k} className={`chip ${v === "合格" ? "st-success" : v.startsWith("不合格") ? "st-failed" : "st-partial"}`}>
                    {k}：{v}
                  </span>
                ))}
              </div>
            )}
            {showPdf && <iframe className="pdf" title="原資料" src={api.documentUrl(result.case_id)} />}
          </section>

          {result.conditions && (
            <div className="split">
              <section className="card">
                <h2>抽出した契約条件（{result.conditions.length} 項目）</h2>
                <p className="muted small">行を選ぶと、右に原文根拠（ページの本文と引用の位置）を表示する。</p>
                <div className="table-wrap tall">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th>レッグ</th>
                        <th>値</th>
                        <th>記載</th>
                        <th>引用の照合</th>
                      </tr>
                    </thead>
                    {sections.map(([section, rows]) => (
                      <tbody key={section}>
                        <tr className="group">
                          <td colSpan={5}>{section}</td>
                        </tr>
                        {rows.map((c) => (
                          <tr key={c.item_id + c.leg_id + c.seq} className={selected === c ? "selected" : ""} onClick={() => setSelected(c)}>
                            <td>
                              {c.label_ja}
                              {c.required && <span className="req">必須</span>}
                              <div className="muted small mono">{c.item_id}</div>
                            </td>
                            <td className="small">
                              {c.leg_id}
                              {Number(c.seq) > 1 ? ` #${c.seq}` : ""}
                            </td>
                            <td>
                              {c.value || <span className="muted">—</span>} {c.unit && <span className="muted small">{c.unit}</span>}
                            </td>
                            <td className="small">{VALUE_STATUS[c.value_status] ?? c.value_status}</td>
                            <td>
                              <span className={`chip ${c.引用の実在確認 === "一致" ? "st-success" : c.引用の実在確認 === "引用不要" ? "st-none" : "st-failed"}`}>
                                {c.引用の実在確認}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
              </section>
              <section className="card sticky">
                <h2>原文根拠</h2>
                {selected ? <Evidence row={selected} pages={result.pages ?? []} /> : <p className="muted">左の表で項目を選ぶ。</p>}
              </section>
            </div>
          )}

          {result.conditions && <TrsCashflowsPanel key={result.case_id} caseId={result.case_id} baseName={result.naming ? result.naming.name ?? result.naming.review_name : null} />}

          {result.aladdin && (
            <section className="card">
              <h2>
                Aladdin 向け JSON <span className="chip st-partial">下書き・未送信</span>
              </h2>
              <p className="small">
                {result.aladdin.unresolved?.note} 送信先 <code>{result.aladdin.unresolved?.endpoint.url}</code>（環境：
                {result.aladdin.unresolved?.endpoint.environment}、認証：{result.aladdin.unresolved?.endpoint.authentication}）。
              </p>
              <div className="grid2">
                <div>
                  <h3>要求本文の下書き</h3>
                  <pre className="code">{JSON.stringify(result.aladdin.payload, null, 2)}</pre>
                  <a className="small" href={api.aladdinUrl(result.case_id)}>
                    aladdin_request_DRAFT.json を保存
                  </a>
                </div>
                <div>
                  <h3>未確定の項目（{result.aladdin.unresolved?.unresolved?.length ?? 0}）</h3>
                  <p className="muted small">対応表：{result.aladdin.unresolved?.mapping_file}</p>
                  <ul className="unresolved">
                    {(result.aladdin.unresolved?.unresolved ?? []).map((u, i) => (
                      <li key={i}>
                        <b>{u.項目}</b>（{u.条件} = {u.値}）<br />
                        <span className="small">{u.理由}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <section className="card">
            <details>
              <summary>要確認事項・検証の詳細（{result.checks?.length ?? 0} 件）</summary>
              {result.review_items && <pre className="code">{result.review_items}</pre>}
              <table className="data compact">
                <thead>
                  <tr>
                    <th>区分</th>
                    <th>検証</th>
                    <th>結果</th>
                    <th>詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.checks ?? []).map((c, i) => (
                    <tr key={i}>
                      <td>{c.区分}</td>
                      <td>{c.検証}</td>
                      <td>{c.結果}</td>
                      <td className="small">{c.詳細}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            {result.fpml_xml && (
              <details>
                <summary>FpML（{result.fpml_file}）</summary>
                <pre className="code">{result.fpml_xml}</pre>
              </details>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// 引用をページ本文の中で探して強調する。照合は R が行った結果（引用の実在確認）を表示し、ここでは位置を見せるだけ。
function Evidence({ row, pages }: { row: ConditionRow; pages: { page: number; text: string }[] }) {
  const pageNo = Number(row.source_page);
  const page = pages.find((p) => p.page === pageNo);
  const idx = page && row.quote ? page.text.indexOf(row.quote) : -1;
  return (
    <div>
      <dl className="detail">
        <div>
          <dt>項目</dt>
          <dd>
            {row.label_ja}（{row.item_id}）
          </dd>
        </div>
        <div>
          <dt>値</dt>
          <dd>
            {row.value || "—"} {row.unit}
          </dd>
        </div>
        <div>
          <dt>記載・確認</dt>
          <dd>
            {VALUE_STATUS[row.value_status] ?? row.value_status} · {row.review_status}
            {row.review_note && ` · ${row.review_note}`}
          </dd>
        </div>
        <div>
          <dt>引用（{row.source_page ? `${row.source_page} ページ` : "ページ指定なし"}）</dt>
          <dd className="quote">{row.quote || "—"}</dd>
        </div>
        <div>
          <dt>引用の照合（R）</dt>
          <dd>{row.引用の実在確認}</dd>
        </div>
      </dl>
      {page ? (
        <pre className="pagetext">
          {idx >= 0 ? (
            <>
              {page.text.slice(0, idx)}
              <mark>{row.quote}</mark>
              {page.text.slice(idx + row.quote.length)}
            </>
          ) : (
            page.text
          )}
        </pre>
      ) : (
        row.source_page && <p className="muted small">このページの本文はない（文字のないページ）。</p>
      )}
      {page && row.quote && idx < 0 && (
        <p className="muted small">本文の中でそのままの文字列は見つからない（改行・空白の違いなど。R の照合は正規化した文字列で行う）。</p>
      )}
    </div>
  );
}
