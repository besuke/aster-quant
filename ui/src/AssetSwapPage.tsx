import { useEffect, useMemo, useState } from "react";
import { api, fmt, type A1Result, type OfferRow, type Workflow } from "./api";

// アセットスワップ：個別銘柄の評価の入口。オファーシートの最新の計算結果（円債・外貨建て）から銘柄を探し、
// 銘柄の詳細（ASW の内訳・キャッシュフロー・関連レポート）はオファーシートの画面（#offers/<ISIN>）で開く。
// 計算処理は新しく作らず、オファーシートと同じもの（サーバーの A1 の計算）を使う。

const BOOK: Record<Workflow, string> = { JPY: "円債", ISO: "外貨建て" };
const STATUS: Record<string, string> = { success: "計算済み", partial: "一部未計算", unsupported: "未対応", skipped: "入力不合格", failed: "失敗" };

interface Row extends OfferRow { workflow: Workflow; valuation_date: string }

export default function AssetSwapPage() {
  const [runs, setRuns] = useState<Partial<Record<Workflow, A1Result>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.a1Latest().then((r) => setRuns(r.runs)).catch((e: Error) => setError(e.message));
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!runs) return [];
    return (["JPY", "ISO"] as const).flatMap((w) => (runs[w]?.offers ?? []).map((o) => ({ ...o, workflow: w, valuation_date: runs[w]!.valuation_date })));
  }, [runs]);
  const shown = rows.filter((r) => !q.trim() || `${r.ISIN} ${r.security_name ?? ""} ${r.broker_names ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const isin = q.trim().toUpperCase();
  const known = /^[A-Z0-9]{12}$/.test(isin) && rows.some((r) => r.ISIN === isin);

  return (
    <div className="page">
      <section className="intro intro-bar">
        <h1>アセットスワップ</h1>
        {runs && <span className="muted small">オファーシートの最新の計算結果：{(["JPY", "ISO"] as const).filter((w) => runs[w]).map((w) => `${BOOK[w]} ${runs[w]!.valuation_date}`).join("、") || "なし"}</span>}
      </section>
      <section className="card">
        <div className="row">
          <label>銘柄を探す（ISIN・銘柄名・ブローカー）
            <input className="text" style={{ marginLeft: 8, width: 280 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：JPTEST000022" data-testid="asw-search" />
          </label>
          {known && <a className="btn primary" href={`#offers/${isin}`} data-testid="asw-open">{isin} の詳細を開く</a>}
          <a className="btn" href="#offers">オファーシートを取り込む・計算する</a>
        </div>
        {error && <p className="error">{error}</p>}
        {runs && !rows.length && <p className="muted">計算済みのオファーがまだない。「オファーシート」から取り込んで計算すると、ここに銘柄が並ぶ。</p>}
        {!!rows.length && (
          <div className="table-wrap tall">
            <table className="data">
              <thead><tr><th>ISIN</th><th>銘柄名</th><th>区分</th><th>通貨</th><th className="num">オファー価格</th><th className="num">ASW（bp）</th><th className="num">円換算 ASW・JGBスプレッド（bp）</th><th>状態</th><th /></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={`${r.workflow}-${r.ISIN}-${r.offer_source_row}`}>
                  <td className="mono">{r.ISIN}</td><td>{r.security_name ?? "—"}</td><td>{BOOK[r.workflow]}</td><td>{r.currency ?? "—"}</td>
                  <td className="num">{fmt(r.offer_price, 3)}</td><td className="num">{fmt(r.native_asw_bp, 2)}</td>
                  <td className="num">{fmt(r.workflow === "JPY" ? r.jgb_spread_bp : r.jpy_asw_bp, 2)}</td>
                  <td><span className={`chip st-${r.pricing_status}`}>{STATUS[r.pricing_status] ?? r.pricing_status}</span></td>
                  <td><a href={`#offers/${r.ISIN}`}>詳細</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
