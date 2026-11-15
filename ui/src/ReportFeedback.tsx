import { useEffect, useMemo, useState, type ReactElement } from "react";
import { api, type Feedback, type FeedbackComment } from "./api";

// レポートへの反応（いいね／ダメ）とコメント・返信。保存はサーバー（レポートの案件フォルダーの feedback.json）。
// 閲覧者の区別はブラウザーごとの ID（localStorage）。表示名もブラウザーに覚える（保存に失敗しても動く）。

function stored(key: string, make: () => string): string {
  try {
    const v = window.localStorage.getItem(key);
    if (v) return v;
    const n = make();
    window.localStorage.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}
const clientId = () => stored("quantlet.client", () => `c${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`);

export default function ReportFeedback({ reportId, onChange }: { reportId: string; onChange?: () => void }) {
  const client = useMemo(clientId, []);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [author, setAuthor] = useState(() => stored("quantlet.author", () => ""));
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFb(null);
    api.feedback(reportId, client).then(setFb).catch((e: Error) => setError(e.message));
  }, [reportId, client]);

  const act = async (f: () => Promise<Feedback>) => {
    setBusy(true);
    setError(null);
    try {
      setFb(await f());
      onChange?.();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const react = (r: "like" | "dislike") => act(() => api.react(reportId, client, fb?.my_reaction === r ? null : r));
  const saveAuthor = (v: string) => {
    setAuthor(v);
    try {
      window.localStorage.setItem("quantlet.author", v);
    } catch {
      /* 覚えられなくても続ける */
    }
  };
  const post = async (body: string, parent: string | null) => {
    const ok = await act(() => api.comment(reportId, { text: body, author, parent_id: parent, client_id: client }));
    if (ok) {
      if (parent) {
        setReplyTo(null);
        setReplyText("");
      } else setText("");
    }
  };

  const children = (id: string | null) => (fb?.comments ?? []).filter((c) => (c.parent_id ?? null) === id);
  const thread = (c: FeedbackComment): ReactElement => (
    <div className="comment" key={c.id} data-testid={`comment-${c.id}`}>
      <div className="comment-meta">
        <b>{c.author}</b>・{c.created_at.slice(0, 16).replace("T", " ")}
      </div>
      <div className="comment-text">{c.text}</div>
      {replyTo === c.id ? (
        <div className="reply-form">
          <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} aria-label="返信" placeholder="返信を書く" />
          <div className="row">
            <button className="btn primary" disabled={busy || !replyText.trim()} onClick={() => void post(replyText, c.id)}>
              返信する
            </button>
            <button className="btn" onClick={() => setReplyTo(null)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button className="link" onClick={() => setReplyTo(c.id)}>
          返信
        </button>
      )}
      <div className="replies">
        {children(c.id).map((r) => (
          thread(r)
        ))}
      </div>
    </div>
  );

  return (
    <section className="card" data-testid="report-feedback">
      <h2>反応とコメント</h2>
      <div className="reactions">
        <button className="btn" aria-pressed={fb?.my_reaction === "like"} disabled={busy || !fb} onClick={() => void react("like")} data-testid="like">
          👍 いいね {fb?.likes ?? 0}
        </button>
        <button className="btn" aria-pressed={fb?.my_reaction === "dislike"} disabled={busy || !fb} onClick={() => void react("dislike")} data-testid="dislike">
          👎 ダメ {fb?.dislikes ?? 0}
        </button>
        <span className="muted small">もう一度押すと取り消す</span>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="comments">
        {fb && !fb.comments.length && <p className="muted small">コメントはまだない。</p>}
        {children(null).map((c) => (
          thread(c)
        ))}
      </div>
      <div className="comment-form">
        <div className="row">
          <label className="small">
            表示名：
            <input className="text" value={author} onChange={(e) => saveAuthor(e.target.value)} placeholder="利用者" maxLength={40} aria-label="表示名" />
          </label>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="コメントを書く" aria-label="コメント" maxLength={2000} />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void post(text, null)} data-testid="comment-post">
          コメントする
        </button>
      </div>
    </section>
  );
}
