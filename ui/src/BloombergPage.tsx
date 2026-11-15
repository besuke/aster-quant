import { useEffect, useState } from "react";
import { api, type BloombergOis, type BloombergStatus } from "./api";

export default function BloombergPage() {
  const [status, setStatus] = useState<BloombergStatus | null>(null);
  const [res, setRes] = useState<BloombergOis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bloombergStatus().then(setStatus).catch((e: Error) => setError(e.message));
  }, []);

  const dry = async () => {
    setBusy(true);
    setError(null);
    try {
      setRes(await api.bloombergOis("2026-09-01", "2026-10-06", "2026-10-06"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="intro">
        <h1>Bloomberg連携</h1>
        <p>
          Bloomberg Data License から OIS の気配を取り、R で正規化して A1 の OIS 気配ファイルの形にする（RiemannFinMath のカーブ構築にそのまま渡せる）。
          接続設定・認証情報・取得したデータはサーバーのローカル（<code>server/tmp/.Renviron</code>、<code>server/data/market/</code>）にだけ置く。
          取得部分は将来 INDIGO に移す予定で、正規化した表の形を保てば後ろの処理は変わらない。
        </p>
      </section>
      <section className="card">
        <h2>接続設定</h2>
        {status ? (
          <>
            <ul className="small">
              <li>認証情報のパス（QUANTLET_BBG_DL_CREDENTIALS）：{status.config.credentials_set ? (status.config.credentials_file_exists ? "設定済み" : "設定済みだがファイルがない") : "未設定"}</li>
              <li>カタログ ID：{status.config.catalog}</li>
              <li>httr2：{status.config.httr2_installed ? "導入済み" : "未導入"}</li>
              <li>live の取得：{status.live_ready ? "可能" : "不可（上の設定が必要）"}</li>
            </ul>
            <p className="warn small">{status.note}</p>
            <details>
              <summary>候補のティッカー（{status.universe.length}）</summary>
              <table className="data compact">
                <tbody>
                  {status.universe.map((u) => (
                    <tr key={u.ticker}>
                      <td>{u.currency}</td>
                      <td>{u.index}</td>
                      <td>{u.tenor}</td>
                      <td className="mono">{u.ticker}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          !error && <p className="muted">確認中…</p>
        )}
      </section>
      <section className="card">
        <h2>dry run（通信しない）</h2>
        <p className="small">要求本文を作り、架空の値（SYNTHETIC。市場の気配ではない）で正規化と A1 の入力ファイル作成までを通す。画面には件数だけを出す。</p>
        <button className="btn primary" disabled={busy} onClick={dry}>
          {busy ? "実行中…" : "2026-09-01〜2026-10-06 で dry run"}
        </button>
        {error && <div className="error">{error}</div>}
        {res && (
          <div className="small">
            <p>
              {res.mode} · {res.rows} 行 · {res.dates[0]}〜{res.dates[1]} · 保存 <code>server/data/market/bbg_dl/{res.csv_file}</code>
            </p>
            <p>A1 の入力（2026-10-06）：{res.a1_input_files.map((f) => <code key={f}>{f} </code>)}</p>
          </div>
        )}
      </section>
    </div>
  );
}
