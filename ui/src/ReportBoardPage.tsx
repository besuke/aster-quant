import { useEffect, useState } from "react";
import { api, fmt, type BoardRow, type Evidence, type ReportDetail, type UploadResult } from "./api";
import Upload from "./Upload";
import ReportFeedback from "./ReportFeedback";

// 業者・格付機関のレポートの掲示板。登録すると、サーバー（R）が原資料を保存し、AI（Claude Code）が見出し・詳細サマリー・
// メタデータを作り、R が原文根拠を照合して案件フォルダー（server/data/cases/reports/<id>/）に記録する。一覧は新着順。

const mmdd = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");
const STATUS: Record<string, string> = { auto: "自動で結びつけた", pending: "候補あり（確定が必要）", confirmed: "確定", rejected: "該当なし", no_match: "マスタにない" };

export default function ReportBoardPage({ focusId }: { focusId: string | null }) {
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [reader, setReader] = useState<"claude_code" | "saved">("claude_code");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);

  const loadBoard = () => api.reports().then((r) => setBoard(r.reports)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void loadBoard();
  }, []);
  useEffect(() => {
    if (!focusId) {
      setDetail(null);
      return;
    }
    api.report(focusId).then(setDetail).catch((e: Error) => setError(e.message));
  }, [focusId]);

  const open = (id: string) => {
    window.location.hash = `reports/${id}`;
  };
  const register = async (sample: boolean) => {
    setBusy(reader === "claude_code" ? "Claude Code がレポートを読んでいる…（1〜数分）" : "登録中…");
    setError(null);
    try {
      const d = await api.registerReport(sample ? { sample: true, reader } : { uploadId: uploaded!.uploadId, reader });
      await loadBoard();
      setUploaded(null);
      open(d.report_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <section className="intro">
        <h1>レポート分析掲示板</h1>
        <p>
          業者や格付機関のレポート（PDF・HTML）を登録すると、AI が日本語の見出しと詳細サマリーを作り、発行元・執筆者・発行日・対象発行体・格付けの変更・主な理由を、原文に記載のある範囲で抽出する。
          抽出した値には原文のページと引用が付き、R が原文と照合する。オファーとは ISIN があれば銘柄単位、発行体だけなら発行体単位で結びつける。
        </p>
      </section>

      <section className="card">
        <h2>レポートを登録</h2>
        <Upload kind="reports" accept=".pdf,.htm,.html" label="レポート（.pdf・.htm・.html）" hint="保存先 server/data/uploads/reports/。登録すると案件フォルダーに記録する" uploaded={uploaded} onUploaded={setUploaded} />
        <div className="row">
          <label className="small">
            読み方：
            <select value={reader} onChange={(e) => setReader(e.target.value as typeof reader)}>
              <option value="claude_code">Claude Code で読む（AI。1〜数分）</option>
              <option value="saved">保存済みの抽出結果（サンプルのみ。AI を呼ばない）</option>
            </select>
          </label>
          <button className="btn primary" disabled={!!busy || !uploaded || reader === "saved"} onClick={() => void register(false)}>
            アップロードしたレポートを登録
          </button>
          <button className="btn" disabled={!!busy} onClick={() => void register(true)} data-testid="register-sample">
            サンプルレポート（架空）を登録
          </button>
        </div>
        {busy && <div className="notice small">{busy}</div>}
        {error && <div className="error">{error}</div>}
      </section>

      <section className="card">
        <h2>新着レポート（{board.length}）</h2>
        {!board.length ? (
          <p className="muted">まだ登録がない。</p>
        ) : (
          <table className="data board" data-testid="board">
            <thead>
              <tr>
                <th>発行日</th>
                <th>発行元・執筆者</th>
                <th>見出し</th>
                <th>オファーとの紐づけ</th>
                <th>状態</th>
                <th>反応</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.report_id} className={detail?.report_id === r.report_id ? "selected" : ""} onClick={() => open(r.report_id)}>
                  <td className="nowrap">{mmdd(r.issue_date)}</td>
                  <td className="nowrap">
                    {r.publisher ?? <span className="muted">記載なし</span>}
                    {r.authors && `・${r.authors.split("・").map((a) => a.split(/\s/)[0]).join("・")}`}
                  </td>
                  <td className="headline" title={r.headline ?? ""}>
                    {r.headline ?? <span className="muted">{r.failure ? `${r.failure.kind}` : "—"}</span>}
                  </td>
                  <td className="small nowrap">
                    {r.isin_links > 0 && <span className="chip st-success">銘柄 {r.isin_links}</span>} {r.issuer_links > 0 && <span className="chip st-success">発行体 {r.issuer_links}</span>}{" "}
                    {r.pending_links > 0 && <span className="chip st-partial">候補 {r.pending_links}</span>}
                  </td>
                  <td>
                    <span className={`chip ${r.state === "確認済み" ? "st-success" : r.state === "要確認" ? "st-partial" : "st-failed"}`}>{r.state}</span>
                  </td>
                  <td className="counts" data-testid={`counts-${r.report_id}`}>
                    👍 {r.feedback?.likes ?? 0}　👎 {r.feedback?.dislikes ?? 0}　💬 {r.feedback?.comment_count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detail && <ReportView detail={detail} onChange={(d) => { setDetail(d); void loadBoard(); }} />}
      {detail?.summary && <ReportFeedback reportId={detail.report_id} onChange={() => void loadBoard()} />}
    </div>
  );
}

function ReportView({ detail, onChange }: { detail: ReportDetail; onChange: (d: ReportDetail) => void }) {
  const s = detail.summary;
  const v = detail.verification;
  const [ev, setEv] = useState<Evidence | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (i: number, issuerId: string | null) => {
    setDeciding(true);
    setErr(null);
    try {
      onChange(await api.decideLink(detail.report_id, i, issuerId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeciding(false);
    }
  };
  if (!s) {
    return (
      <section className="card">
        <h2>{detail.manifest.original_file_name}</h2>
        <div className="error">
          {detail.manifest.failure?.kind}：{detail.manifest.failure?.message}
        </div>
      </section>
    );
  }
  return (
    <>
      <section className="card" data-testid="report-detail">
        <div className="row spread">
          <h2>{s.headline}</h2>
          <a className="btn" href={api.reportDocumentUrl(detail.report_id)} target="_blank" rel="noreferrer">
            原資料を開く
          </a>
        </div>
        <div className="meta small">
          <span>{s.publisher.status === "stated" ? s.publisher.value : "発行元：記載なし"}</span>
          <span>
            {s.authors.filter((a) => a.status === "stated").map((a) => `${a.name}${a.role ? `（${a.role}）` : ""}`).join("、") || "執筆者：記載なし"}
          </span>
          <span>発行日 {s.issue_date.status === "stated" ? s.issue_date.value : "記載なし"}</span>
          <span>案件 {detail.report_id}</span>
          <span>{detail.manifest.reader === "saved" ? "保存済みの抽出結果（AI は呼んでいない）" : "Claude Code が作成"}</span>
          {v && <span className={`chip ${v.state === "確認済み" ? "st-success" : "st-partial"}`}>{v.state}</span>}
        </div>
        {v?.reasons?.length ? <div className="warn small">{v.reasons.join("。")}</div> : null}
        <h3>詳細サマリー</h3>
        <p className="summary-text">{s.summary}</p>
        {s.rating_changes?.length > 0 && (
          <>
            <h3>格付け・アウトルックの変更</h3>
            <table className="data compact">
              <thead>
                <tr>
                  <th>格付機関</th>
                  <th>対象</th>
                  <th>格付け</th>
                  <th>アウトルック</th>
                  <th>日付</th>
                </tr>
              </thead>
              <tbody>
                {s.rating_changes.map((r, i) => (
                  <tr key={i}>
                    <td>{r.agency}</td>
                    <td>
                      {r.issuer} {r.rating_type}
                    </td>
                    <td>
                      {r.rating_from} → {r.rating_to}
                    </td>
                    <td>{r.outlook_to ? `${r.outlook_from} → ${r.outlook_to}` : "—"}</td>
                    <td>{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <div className="split">
        <section className="card">
          <h2>抽出した項目と原文根拠（{v?.evidence.length ?? 0}）</h2>
          <p className="muted small">行を選ぶと、右に原文のページと引用の位置を表示する。照合は R が行った結果。</p>
          <div className="table-wrap tall">
            <table className="data">
              <thead>
                <tr>
                  <th>項目</th>
                  <th>値</th>
                  <th>ページ</th>
                  <th>照合</th>
                </tr>
              </thead>
              <tbody>
                {(v?.evidence ?? []).map((e, i) => (
                  <tr key={i} className={ev === e ? "selected" : ""} onClick={() => setEv(e)}>
                    <td className="small">{e.label}</td>
                    <td>{e.status === "stated" ? e.value : <span className="muted">記載なし</span>}</td>
                    <td className="num">{e.page ?? "—"}</td>
                    <td>
                      <span className={`chip ${e.check === "一致" ? "st-success" : e.check.startsWith("記載なし") ? "st-none" : "st-failed"}`}>{e.check}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card sticky">
          <h2>原文根拠</h2>
          {ev ? <QuoteView e={ev} pages={detail.pages ?? []} /> : <p className="muted">左の表で項目を選ぶ。</p>}
        </section>
      </div>

      <section className="card" data-testid="report-links">
        <h2>オファーとの紐づけ</h2>
        {err && <div className="error">{err}</div>}
        <h3>銘柄単位（ISIN）</h3>
        {detail.links?.isin_links.length ? (
          <ul className="links">
            {detail.links.isin_links.map((l) => (
              <li key={l.isin}>
                <span className="mono">{l.isin}</span> {l.security_name}（{l.issuer_name}）<span className="muted small"> — {l.basis}、{l.page} ページ</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">原文に、マスタにある ISIN の記載はない。</p>
        )}
        {detail.links?.unknown_isins?.length ? <p className="muted small">マスタにない ISIN：{detail.links.unknown_isins.join("、")}</p> : null}
        <h3>発行体単位</h3>
        {detail.links?.issuer_mentions.length ? (
          <ul className="links">
            {detail.links.issuer_mentions.map((m, i) => (
              <li key={i} data-testid={`mention-${i}`}>
                原文の「<b>{m.mention}</b>」（{m.page ?? "—"} ページ）→{" "}
                <span className={`chip ${m.status === "auto" || m.status === "confirmed" ? "st-success" : m.status === "pending" ? "st-partial" : "st-none"}`}>{STATUS[m.status]}</span>{" "}
                {m.issuer_name && <b>{m.issuer_name}</b>}
                <span className="muted small"> — {m.basis}{m.decided_by ? `（${m.decided_by}、${m.decided_at?.slice(0, 16).replace("T", " ")}）` : ""}</span>
                {m.status === "pending" && (
                  <div className="candidates">
                    <span className="small">候補：</span>
                    {m.candidates.map((c) => (
                      <button key={c.issuer_id} className="btn" disabled={deciding} onClick={() => void decide(i + 1, c.issuer_id)}>
                        {c.issuer_name}に確定
                        <span className="muted small">（{c.match === "exact" ? "名前が一致" : "部分一致"}{c.hint ? `、${c.hint}` : ""}）</span>
                      </button>
                    ))}
                    <button className="btn" disabled={deciding} onClick={() => void decide(i + 1, null)}>
                      該当なし
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">対象発行体の記載はない。</p>
        )}
        <p className="muted small">{detail.links?.master_note}</p>
        <h3>対応するオファー（オファーシートの最新の計算結果）</h3>
        {detail.offers?.length ? (
          <table className="data compact" data-testid="report-offers">
            <thead>
              <tr>
                <th>単位</th>
                <th>ISIN</th>
                <th>銘柄</th>
                <th className="num">単価</th>
                <th className="num">OIS ASW (bp)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detail.offers.map((o) => (
                <tr key={o.ISIN + o.workflow}>
                  <td>{o.level}</td>
                  <td className="mono">{o.ISIN}</td>
                  <td>{o.security_name}</td>
                  <td className="num">{fmt(o.offer_price, 3)}</td>
                  <td className="num">{fmt(o.native_asw_bp, 2)}</td>
                  <td>
                    <a className="btn" href={`#offers/${o.ISIN}`}>
                      オファーを開く
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">オファーシートの最新の計算結果に、対応するオファーはない（オファーシートを計算すると表示される）。</p>
        )}
      </section>
    </>
  );
}

// 引用をページ本文の中で探して強調する。PDF の本文は文の途中で改行されるので、空白・改行を無視して探す（照合の判定は R が行った）
function QuoteView({ e, pages }: { e: Evidence; pages: { page: number; text: string }[] }) {
  const page = pages.find((p) => p.page === (e.found_page ?? e.page));
  let parts: [string, string, string] | null = null;
  if (page && e.quote) {
    const chars = [...e.quote.replace(/\s+/g, "")].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const m = new RegExp(chars.join("\\s*")).exec(page.text);
    if (m) parts = [page.text.slice(0, m.index), m[0], page.text.slice(m.index + m[0].length)];
  }
  return (
    <div>
      <dl className="detail">
        <div>
          <dt>項目</dt>
          <dd>{e.label}</dd>
        </div>
        <div>
          <dt>値</dt>
          <dd>{e.value || "—"}</dd>
        </div>
        <div>
          <dt>引用（{e.page ?? "—"} ページ）</dt>
          <dd className="quote">{e.quote || "—"}</dd>
        </div>
        <div>
          <dt>照合（R）</dt>
          <dd>{e.check}</dd>
        </div>
      </dl>
      {page && (
        <pre className="pagetext" data-testid="quote-page">
          {parts ? (
            <>
              {parts[0]}
              <mark>{parts[1]}</mark>
              {parts[2]}
            </>
          ) : (
            page.text
          )}
        </pre>
      )}
    </div>
  );
}
