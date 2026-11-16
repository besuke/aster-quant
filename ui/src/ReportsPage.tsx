import { useEffect, useRef, useState } from "react";
import { api, fmt, type BoardRow, type Evidence, type ReportDetail, type UploadResult } from "./api";
import Upload from "./Upload";
import ReportFeedback from "./ReportFeedback";

// レポート分析：「掲示板」「レポート登録」「レポート一覧」の3画面を上部のタブで切り替える。
//   #reports（掲示板）、#reports/board/<id>（掲示板の詳細：反応・コメント）、#reports/register（登録）、
//   #reports/list（一覧）、#reports/list/<id>（要約・原文根拠・オファーとの紐づけ）。以前の #reports/<id> は一覧の詳細を開く
// 登録の処理（保存・AI の読解・原文の照合・紐づけ）はサーバー（R）。保存先などは README。

const mmdd = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");
const surnames = (a: string | null) => (a ? a.split("・").map((x) => x.split(/\s/)[0]).join("・") : "");
const STATUS: Record<string, string> = { auto: "自動で結びつけた", pending: "候補あり（確定が必要）", confirmed: "確定", rejected: "該当なし", no_match: "マスタにない" };
const stateChip = (s: string) => `chip ${s === "確認済み" ? "st-success" : s === "要確認" ? "st-partial" : "st-failed"}`;

type Tab = "board" | "register" | "list";
const TABS: { id: Tab; label: string }[] = [
  { id: "board", label: "掲示板" },
  { id: "register", label: "レポート登録" },
  { id: "list", label: "レポート一覧" },
];

function parseArg(arg: string | null): { tab: Tab; id: string | null } {
  if (!arg) return { tab: "board", id: null };
  const [a, b] = arg.split("/");
  if (a === "board" || a === "register" || a === "list") return { tab: a, id: b ?? null };
  return { tab: "list", id: a }; // 以前のアドレス #reports/<id>
}

export default function ReportsPage({ arg }: { arg: string | null }) {
  const { tab, id } = parseArg(arg);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadBoard = () => api.reports().then((r) => setBoard(r.reports)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void loadBoard();
  }, []);

  return (
    <div className="page">
      <section className="intro">
        <h1>レポート分析掲示板</h1>
        <div className="tabs-row" role="tablist" aria-label="レポート分析の画面">
          {TABS.map((t) => (
            <a key={t.id} role="tab" aria-selected={tab === t.id} className={`subtab ${tab === t.id ? "active" : ""}`} href={t.id === "board" ? "#reports" : `#reports/${t.id}`} data-testid={`tab-${t.id}`}>
              {t.label}
            </a>
          ))}
        </div>
      </section>
      {error && <div className="error">{error}</div>}
      {tab === "board" && <BoardTab board={board} focusId={id} reload={() => void loadBoard()} />}
      {tab === "register" && <RegisterTab reload={() => void loadBoard()} />}
      {tab === "list" && <ListTab board={board} focusId={id} reload={() => void loadBoard()} />}
    </div>
  );
}

// ---- 掲示板：新着順に発行元・執筆者、短い見出し、反応数。詳細で反応・コメント・返信 ----
function BoardTab({ board, focusId, reload }: { board: BoardRow[]; focusId: string | null; reload: () => void }) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  useEffect(() => {
    if (!focusId) return setDetail(null);
    api.report(focusId).then(setDetail).catch(() => setDetail(null));
  }, [focusId]);
  const rows = board.filter((r) => r.headline);
  return (
    <>
      <section className="card">
        {!rows.length ? (
          <p className="muted">まだ投稿がない。「レポート登録」で登録すると、ここに新着順で並ぶ。</p>
        ) : (
          <div className="table-wrap">
            <table className="data board" data-testid="board">
              <thead>
                <tr>
                  <th>発行日</th>
                  <th>発行元・執筆者</th>
                  <th>見出し</th>
                  <th>反応</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.report_id} className={focusId === r.report_id ? "selected" : ""} onClick={() => (window.location.hash = `reports/board/${r.report_id}`)}>
                    <td className="nowrap">{mmdd(r.issue_date)}</td>
                    <td className="nowrap">
                      {r.publisher ?? <span className="muted">記載なし</span>}
                      {r.authors && `・${surnames(r.authors)}`}
                    </td>
                    <td className="headline" title={r.headline ?? ""}>{r.headline}</td>
                    <td className="counts" data-testid={`counts-${r.report_id}`}>
                      👍 {r.feedback?.likes ?? 0}　👎 {r.feedback?.dislikes ?? 0}　💬 {r.feedback?.comment_count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {detail?.summary && (
        <div className="two-col">
          <section className="card" data-testid="board-detail">
            <div className="row spread">
              <h2>{detail.summary.headline}</h2>
              <a className="btn" href={`#reports/list/${detail.report_id}`} data-testid="open-in-list">
                要約・原文根拠・紐づけを開く
              </a>
            </div>
            <div className="meta small">
              <span>{detail.summary.publisher.status === "stated" ? detail.summary.publisher.value : "発行元：記載なし"}</span>
              <span>{detail.summary.authors.filter((a) => a.status === "stated").map((a) => a.name).join("、") || "執筆者：記載なし"}</span>
              <span>発行日 {detail.summary.issue_date.status === "stated" ? detail.summary.issue_date.value : "記載なし"}</span>
            </div>
            <p className="summary-text">{detail.summary.summary}</p>
          </section>
          <ReportFeedback reportId={detail.report_id} onChange={reload} />
        </div>
      )}
    </>
  );
}

// ---- レポート登録：ファイルの選択と登録、処理状況 ----
function RegisterTab({ reload }: { reload: () => void }) {
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [reader, setReader] = useState<"claude_code" | "saved">("claude_code");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReportDetail | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const register = async (sample: boolean) => {
    setBusy(true);
    setError(null);
    setDone(null);
    setElapsed(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const d = await api.registerReport(sample ? { sample: true, reader } : { uploadId: uploaded!.uploadId, reader });
      setDone(d);
      setUploaded(null);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      window.clearInterval(timer.current);
      setBusy(false);
    }
  };

  const steps = ["原資料の保存と本文の抽出", reader === "claude_code" ? "Claude Code による読解（見出し・要約・メタデータ）" : "保存済みの抽出結果の読込", "原文根拠の照合", "オファーとの紐づけ"];
  return (
    <section className="card" data-testid="register-tab">
      <div className="two-col">
        <div>
          <Upload kind="reports" accept=".pdf,.htm,.html" label="レポート（.pdf・.htm・.html）" hint="業者・格付機関のレポート" uploaded={uploaded} onUploaded={setUploaded} />
          <div className="row">
            <label className="small">
              読み方：
              <select value={reader} onChange={(e) => setReader(e.target.value as typeof reader)} aria-label="読み方">
                <option value="claude_code">Claude Code で読む（AI。1〜数分）</option>
                <option value="saved">保存済みの抽出結果（サンプルのみ。AI を呼ばない）</option>
              </select>
            </label>
            <button className="btn primary" disabled={busy || !uploaded || reader === "saved"} onClick={() => void register(false)} data-testid="register-upload">
              登録する
            </button>
            <button className="btn" disabled={busy} onClick={() => void register(true)} data-testid="register-sample">
              サンプルレポート（架空）を登録
            </button>
          </div>
        </div>
        <div>
          <h3>処理状況</h3>
          <ol className="steps small" data-testid="register-status">
            {steps.map((s, i) => (
              <li key={s} className={busy ? "running" : done ? "done" : ""}>
                {s}
                {busy && i === 1 && reader === "claude_code" && `（経過 ${elapsed} 秒）`}
              </li>
            ))}
          </ol>
          {!busy && !done && !error && <p className="muted small">待機中。ファイルを選んで「登録する」を押す。</p>}
          {busy && <div className="notice small">処理中（経過 {elapsed} 秒）。終わるまでこの画面を開いたままにする。</div>}
          {error && <div className="error">登録できなかった：{error}</div>}
          {done && (
            <div className={done.manifest.failure ? "error" : "notice small"} data-testid="register-result">
              {done.manifest.failure ? (
                <>
                  {done.manifest.failure.kind}：{done.manifest.failure.message}
                </>
              ) : (
                <>
                  登録した：<b>{done.summary?.headline}</b>（{done.verification?.state}、{fmt(done.seconds ?? 0, 0)} 秒）。
                  <a href={`#reports/list/${done.report_id}`}>レポート一覧で開く</a>・<a href={`#reports/board/${done.report_id}`}>掲示板で開く</a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- レポート一覧：登録済みを表で確認し、要約・原文根拠・オファーとの紐づけを開く ----
function ListTab({ board, focusId, reload }: { board: BoardRow[]; focusId: string | null; reload: () => void }) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  useEffect(() => {
    if (!focusId) return setDetail(null);
    api.report(focusId).then(setDetail).catch(() => setDetail(null));
  }, [focusId]);
  return (
    <>
      <section className="card">
        {!board.length ? (
          <p className="muted">登録済みのレポートはない。</p>
        ) : (
          <div className="table-wrap">
            <table className="data" data-testid="report-list">
              <thead>
                <tr>
                  <th>登録</th>
                  <th>発行日</th>
                  <th>発行元</th>
                  <th>執筆者</th>
                  <th>見出し</th>
                  <th>状態</th>
                  <th>オファーとの紐づけ</th>
                  <th>ファイル</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr key={r.report_id} className={focusId === r.report_id ? "selected" : ""} onClick={() => (window.location.hash = `reports/list/${r.report_id}`)}>
                    <td className="nowrap small">{r.registered_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="nowrap">{r.issue_date ?? "—"}</td>
                    <td>{r.publisher ?? <span className="muted">記載なし</span>}</td>
                    <td>{r.authors ?? <span className="muted">記載なし</span>}</td>
                    <td className="headline" title={r.headline ?? ""}>{r.headline ?? <span className="muted">{r.failure?.kind ?? "—"}</span>}</td>
                    <td><span className={stateChip(r.state)}>{r.state}</span></td>
                    <td className="small nowrap">
                      {r.isin_links > 0 && <span className="chip st-success">銘柄 {r.isin_links}</span>} {r.issuer_links > 0 && <span className="chip st-success">発行体 {r.issuer_links}</span>}{" "}
                      {r.pending_links > 0 && <span className="chip st-partial">候補 {r.pending_links}</span>}
                    </td>
                    <td className="small">{r.file_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {detail && <ReportView detail={detail} onChange={(d) => { setDetail(d); reload(); }} />}
    </>
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
        <div className={s.rating_changes?.length > 0 ? "two-col" : ""}>
          <div>
            <h3>詳細サマリー</h3>
            <p className="summary-text">{s.summary}</p>
          </div>
          {s.rating_changes?.length > 0 && (
            <div>
              <h3>格付け・アウトルックの変更</h3>
              <div className="table-wrap">
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
              </div>
            </div>
          )}
        </div>
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
        <div className="two-col">
          <div>
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
          </div>
          <div>
            <h3>対応するオファー（オファーシートの最新の計算結果）</h3>
            {detail.offers?.length ? (
              <div className="table-wrap">
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
              </div>
            ) : (
              <p className="muted small">オファーシートの最新の計算結果に、対応するオファーはない（オファーシートを計算すると表示される）。</p>
            )}
          </div>
        </div>
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
