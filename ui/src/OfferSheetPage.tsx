import { useEffect, useRef, useState } from "react";
import { api, fmt, type A1Result, type OfferRow, type OisRefresh, type OisStatus, type RelatedReport, type UploadResult, type Workflow } from "./api";
import Upload from "./Upload";

const STATUS_LABEL: Record<string, string> = {
  success: "計算済み",
  partial: "一部未計算",
  unsupported: "未対応",
  skipped: "入力不合格",
  failed: "失敗",
};

const BOOKS: { workflow: Workflow; title: string; hint: string; spread: string }[] = [
  {
    workflow: "JPY",
    title: "円債オファーシート",
    hint: "JPY建て（ユーロ円債を含む）。シート「円債オファー」を読む。結果は JPY OIS ASW と JGBスプレッド",
    spread: "JGBスプレッド",
  },
  {
    workflow: "ISO",
    title: "外貨オファーシート",
    hint: "円以外の建て通貨（USD・EUR）。シートは自動判定。結果は自国通貨 OIS ASW と円換算 ASW",
    spread: "円換算ASW",
  },
];

export default function OfferSheetPage({ focusIsin }: { focusIsin: string | null }) {
  // サーバーに残る最新の実行結果（画面を開き直しても、レポートから戻っても同じ結果を表示する）
  const [latest, setLatest] = useState<Partial<Record<Workflow, A1Result>> | null>(null);
  useEffect(() => {
    api.a1Latest().then((r) => setLatest(r.runs)).catch(() => setLatest({}));
  }, []);
  return (
    <div className="page">
      <section className="intro">
        <h1>オファーシート作成</h1>
      </section>
      <OisMarketPanel />
      <div className="grid2">
        {BOOKS.map((b) => (
          <BookPanel key={b.workflow} {...b} initial={latest?.[b.workflow] ?? null} focusIsin={focusIsin} />
        ))}
      </div>
    </div>
  );
}

function BookPanel(props: { workflow: Workflow; title: string; hint: string; spread: string; initial: A1Result | null; focusIsin: string | null }) {
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [result, setResult] = useState<A1Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OfferRow | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.initial && !result) setResult(props.initial);
  }, [props.initial, result]);
  // #offers/<ISIN>（レポート分析掲示板から戻るとき）：その銘柄の行を開いて表示する
  useEffect(() => {
    if (!props.focusIsin || !result) return;
    const row = result.offers.find((o) => o.ISIN === props.focusIsin);
    if (row) {
      setSelected(row);
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
  }, [props.focusIsin, result]);

  const run = async () => {
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      setResult(await api.runA1(props.workflow, uploaded?.uploadId ?? null));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>{props.title}</h2>
      <Upload kind="a1" accept=".xlsx,.xls" label="オファーExcel（.xlsx）" hint={props.hint} uploaded={uploaded} onUploaded={setUploaded} />
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={run}>
          {busy ? "計算中…" : uploaded ? "アップロードしたシートで計算" : "デモのオファーで計算"}
        </button>
        {result && (
          <a className="btn" href={api.excelUrl(result.run_id)}>
            Excel をダウンロード（{result.output_file}）
          </a>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <>
          <div className="meta small">
            <span>入力：{result.offer_file}（{result.input_note}）</span>
            <span>評価日 {result.valuation_date}</span>
            <span>{result.seconds.toFixed(1)} 秒</span>
          </div>
          <div className="chips">
            {result.counts.map((c) => (
              <span key={c.pricing_status + c.validation_status} className={`chip st-${c.pricing_status}`}>
                {STATUS_LABEL[c.pricing_status] ?? c.pricing_status} {c.n}件
              </span>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ISIN</th>
                  <th>銘柄</th>
                  <th className="num">単価</th>
                  <th className="num">OIS ASW (bp)</th>
                  <th className="num">{props.spread} (bp)</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {result.offers.map((o) => (
                  <tr key={o.ISIN + o.offer_source_row} className={selected === o ? "selected" : ""} onClick={() => setSelected(o)}>
                    <td className="mono">{o.ISIN}</td>
                    <td>
                      {o.security_name ?? "—"}
                      <div className="muted small">{o.broker_names}</div>
                    </td>
                    <td className="num">{fmt(o.offer_price, 3)}</td>
                    <td className="num">{fmt(o.native_asw_bp, 2)}</td>
                    <td className="num">{fmt(props.workflow === "JPY" ? o.jgb_spread_bp : o.jpy_asw_bp, 2)}</td>
                    <td>
                      <span className={`chip st-${o.pricing_status}`}>{STATUS_LABEL[o.pricing_status] ?? o.pricing_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">行を選ぶと詳細を表示する。値は丸めて表示している（丸める前の値は Excel にある）。</p>
          {selected && (
            <div ref={detailRef} data-testid={`offer-detail-${props.workflow}`}>
              <OfferDetail row={selected} workflow={props.workflow} />
            </div>
          )}
          <details>
            <summary>OIS カーブ・計算条件</summary>
            <table className="data compact">
              <thead>
                <tr>
                  <th>通貨</th>
                  <th>指標</th>
                  <th className="num">気配</th>
                  <th>最終期日</th>
                  <th className="num">最大再現誤差 (bp)</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {result.curves.map((c) => (
                  <tr key={c.currency}>
                    <td>{c.currency}</td>
                    <td>{c.index ?? "—"}</td>
                    <td className="num">{c.quotes ?? "—"}</td>
                    <td>{c.last_tenordate ?? "—"}</td>
                    <td className="num">{c.max_abs_quote_error_bp === undefined ? "—" : c.max_abs_quote_error_bp.toExponential(1)}</td>
                    <td>{c.curve_status === "success" ? "構築済み" : c.curve_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              ASW の翌日物レッグ：{String(result.settings.asw_payment_frequency)}・支払ラグ {String(result.settings.asw_payment_lag)}（
              {String(result.settings.assumption_note)}）。{result.market_note}。
            </p>
          </details>
        </>
      )}
    </section>
  );
}

function OfferDetail({ row, workflow }: { row: OfferRow; workflow: Workflow }) {
  const items: [string, string][] = [
    ["銘柄", `${row.security_name ?? "—"}（${row.ISIN}）`],
    ["通貨・クーポン・償還", `${row.currency ?? "—"} · ${row.coupon_rate == null ? "—" : (row.coupon_rate * 100).toFixed(3) + "%"} · ${row.maturity_date ?? "—"}`],
    ["オファー", `${fmt(row.offer_price, 3)}（${row.broker_names ?? "—"}、受渡 ${row.offer_settlementdate ?? "—"}）`],
    ["経過利子・ダーティ価格", `${fmt(row.accrued_per_100, 6)} · ${fmt(row.dirty_price, 6)}`],
    ["ASW 期間", `${row.asw_effective_date ?? "—"} 〜 ${row.asw_maturity_date ?? "—"}`],
    ["OIS ASW", `${fmt(row.native_asw_bp, 6)} bp`],
  ];
  if (workflow === "JPY") {
    items.push(
      ["複利利回り（対象債・補間JGB）", `${fmt(row.jpy_compound_yield_pct ?? null, 7)}% · ${fmt(row.jgb_interpolated_yield_pct ?? null, 7)}%`],
      ["JGBスプレッド", `${fmt(row.jgb_spread_bp ?? null, 6)} bp`],
    );
  } else {
    items.push(
      ["FXスポット・ベーシス", `${fmt(row.fx_spot ?? null, 4)} · ${fmt(row.basis_bp ?? null, 6)} bp`],
      ["円換算ASW（単純和）", `${fmt(row.jpy_asw_bp ?? null, 6)} bp（${fmt(row.simple_sum_bp ?? null, 6)} bp）`],
      ["校正した割引スプレッド z", `${fmt(row.calibrated_discount_spread_bp ?? null, 6)} bp`],
    );
  }
  items.push(
    ["入力検証", row.validation_status === "valid" ? "合格" : row.validation_message],
    ["計算", row.pricing_message || STATUS_LABEL[row.pricing_status] || row.pricing_status],
    ["元の行", `${row.offer_source_file} / ${row.offer_source_sheet} / ${row.offer_source_row} 行目`],
  );
  return (
    <>
      <dl className="detail">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>発行体</dt>
          <dd>{(row.issuer_name as string | null) ?? "—"}<span className="muted small">（デモの発行体マスタ）</span></dd>
        </div>
      </dl>
      <RelatedReports isin={row.ISIN} />
    </>
  );
}

// オファーの銘柄に関連するレポート：ISIN で結びついたもの（銘柄）、発行体で結びついたもの（発行体）、候補のまま（未確定）
function RelatedReports({ isin }: { isin: string }) {
  const [reports, setReports] = useState<RelatedReport[] | null>(null);
  useEffect(() => {
    setReports(null);
    api.relatedReports(isin).then((r) => setReports(r.reports)).catch(() => setReports([]));
  }, [isin]);
  return (
    <div className="related" data-testid="related-reports">
      <h3>関連レポート</h3>
      {reports === null ? (
        <p className="muted small">確認中…</p>
      ) : !reports.length ? (
        <p className="muted small">この銘柄・発行体に結びついたレポートはない。</p>
      ) : (
        <ul className="links">
          {reports.map((r) => (
            <li key={r.report_id}>
              <span className={`chip ${r.level === "候補（未確定）" ? "st-partial" : "st-success"}`}>{r.level}</span>{" "}
              <a href={`#reports/list/${r.report_id}`}>
                {r.issue_date ? `${Number(r.issue_date.slice(5, 7))}/${Number(r.issue_date.slice(8, 10))}` : "—"} ｜ {r.publisher ?? "—"}
                {r.authors ? `・${r.authors.split("・").map((a) => a.split(/\s/)[0]).join("・")}` : ""} ｜ {r.headline}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ASW で使う OIS 市場データの基準日と、Bloomberg からの更新。更新に失敗したときは理由と、今使えるデータの基準日を示す
function OisMarketPanel() {
  const [status, setStatus] = useState<OisStatus | null>(null);
  const [result, setResult] = useState<OisRefresh | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.oisStatus().then(setStatus).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.refreshOis());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const b = status?.bloomberg;
  const bbgDates = (status?.available ?? []).filter((d) => d.kind === "bloomberg").map((d) => d.base_date);
  return (
    <section className="card" data-testid="ois-market">
      <div className="row spread">
        <div>
          <h2>ASW の OIS 市場データ</h2>
          {status && (
            <div className="source-line" data-testid="asw-ois">
              <span>
                基準日：<b>{status.asw.base_date}</b>（{status.asw.label}）
              </span>
              <span>Bloomberg から取得済み：{bbgDates.length ? bbgDates.join("、") : "なし"}</span>
              <span>
                Bloomberg 接続：{status.live_ready ? "設定済み" : "未設定"}（認証情報 {b?.credentials_file_exists ? "あり" : "なし"}、httr2 {b?.httr2_installed ? "あり" : "なし"}）
              </span>
            </div>
          )}
        </div>
        <button className="btn" disabled={busy || !status} onClick={() => void refresh()} data-testid="bbg-refresh">
          {busy ? "Bloomberg から取得中…" : "Bloomberg から更新"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {result && result.status === "failed" && (
        <div className="error" data-testid="bbg-refresh-result">
          更新できなかった（{result.stage}）：{result.reason}。{result.attempted}。<br />
          今使えるデータの基準日：オファーシートの計算は <b>{result.current.asw.base_date}</b>（{result.current.asw.label}）。保存済みの OIS：
          {result.current.available.map((d) => `${d.base_date}（${d.label}）`).join("、") || "なし"}
        </div>
      )}
      {result && result.status === "success" && (
        <div className="notice small" data-testid="bbg-refresh-result">
          Bloomberg から取得した（基準日 {result.base_date}、{result.files?.join("、")}）。オファーシートの計算は、オファー日と同じ基準日の OIS だけを使う。
        </div>
      )}
      {status && (
        <p className="muted small">
          {status.asw.note}。市場データ（OIS・JGB・FX・通貨ベーシス）と銘柄属性は当面デモ（架空）。オファー日がこの基準日と違う行は「入力不合格」になる。
        </p>
      )}
    </section>
  );
}
