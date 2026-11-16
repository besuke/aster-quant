import { useEffect, useState } from "react";
import { api, fmt, type ServerInfo } from "./api";
import { useServerConnection } from "./serverConnection";

// AsterQuant Server の接続確認ページ（Carmine Studio の接続ページにならう）。右上の表示から開く。

export default function ServerPage() {
  const { last, history, checking, intervalSec, checkNow } = useServerConnection();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState<number | null>(null);

  const load = async () => {
    setError(null);
    const t0 = performance.now();
    try {
      const i = await api.server();
      setRoundTrip(performance.now() - t0);
      setInfo(i);
    } catch (e) {
      setError((e as Error).message);
      setInfo(null);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const okCount = history.filter((h) => h.ok).length;
  return (
    <div className="page">
      <section className="intro">
        <h1>AsterQuant Server</h1>
      </section>
      <section className="card" data-testid="server-status">
        <div className="row spread">
          <div>
            <span className={`server-badge big ${last === null ? "checking" : last.ok ? "ok" : "bad"}`}>
              <span className="dot" aria-hidden="true" />
              {last === null ? "確認中" : last.ok ? "接続中" : "未接続"}
            </span>
            <span className="muted small">
              　{intervalSec} 秒ごとに /api/health で確認（直近 {history.length} 回のうち {okCount} 回応答）
              {last?.roundTripMs != null ? `、最後の往復 ${last.roundTripMs.toFixed(0)} ms` : ""}
            </span>
          </div>
          <button className="btn" disabled={checking} onClick={() => { checkNow(); void load(); }}>
            いま確認する
          </button>
        </div>
        {last && !last.ok && <div className="error">{last.error ?? "応答がない"}。R API が起動しているかを確かめる。</div>}
        {error && <div className="error">{error}</div>}
      </section>

      {info && (
        <>
          <div className="two-col">
            <section className="card" data-testid="server-urls">
              <h2>開くアドレス</h2>
              <dl className="detail">
                <div>
                  <dt>利用者に案内する URL</dt>
                  <dd>
                    {info.urls.share ? (
                      <a href={info.urls.share} className="mono" data-testid="share-url">{info.urls.share}</a>
                    ) : (
                      <span className="muted">なし（この R API は {info.listen.host} だけで待ち受けている）</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>配備先のホスト</dt>
                  <dd>
                    {info.urls.public_host ?? "—"}（{info.urls.public_host_source}）
                  </dd>
                </div>
                <div>
                  <dt>この PC の中</dt>
                  <dd className="mono">{info.urls.local}</dd>
                </div>
                <div>
                  <dt>このページを開いたアドレス</dt>
                  <dd className="mono" data-testid="page-origin">{window.location.origin}/</dd>
                </div>
              </dl>
              <p className="muted small">{info.urls.note}</p>
            </section>
            <section className="card" data-testid="server-info">
              <h2>サーバー</h2>
              <dl className="detail">
                <div><dt>名前</dt><dd>{info.name === "QuantLet Server" ? "AsterQuant Server" : info.name}（{info.app_version}）</dd></div>
                <div><dt>計算エンジン</dt><dd>{info.engine.name} {info.engine.version}</dd></div>
                <div><dt>待ち受け</dt><dd className="mono">{info.listen.host}:{info.listen.port}{info.listen.serves_page ? "（画面も配る）" : "（API だけ）"}</dd></div>
                <div><dt>R</dt><dd>{info.runtime.r_version}（{info.runtime.platform}、PID {info.runtime.pid}、論理プロセッサ {info.runtime.logical_processors}）</dd></div>
                <div><dt>起動</dt><dd>{info.started_at.replace("T", " ").slice(0, 19)}（稼働 {fmt(info.uptime_seconds / 3600, 1)} 時間、API 要求 {info.requests_served} 件）</dd></div>
                <div>
                  <dt>計算の確認</dt>
                  <dd>
                    {info.probe.calculation}：1 回 {fmt(info.probe.seconds_each * 1000, 3)} ms（サーバー内）
                    {roundTrip !== null && `、このページからの往復 ${roundTrip.toFixed(0)} ms（ネットワークと計算の合計）`}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
          <section className="card">
            <details open>
              <summary>応答する経路（{info.routes.length}）</summary>
              <div className="table-wrap">
                <table className="data compact">
                  <thead>
                    <tr><th>メソッド</th><th>経路</th><th>使う画面</th></tr>
                  </thead>
                  <tbody>
                    {info.routes.map((r) => (
                      <tr key={r.method + r.path}><td>{r.method}</td><td className="mono">{r.path}</td><td>{r.page.replace("QuantLet Server", "AsterQuant Server")}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
