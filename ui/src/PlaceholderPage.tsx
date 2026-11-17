// 未実装の項目の画面（「準備中」）。サイドメニューの構成だけ先に決めてあり、画面は順に足す。
export default function PlaceholderPage({ title, note }: { title: string; note?: string }) {
  return (
    <div className="page">
      <section className="intro">
        <h1>{title}</h1>
      </section>
      <section className="card placeholder" data-testid="placeholder">
        <p className="placeholder-badge">準備中</p>
        <p className="muted">この画面はまだ実装していません。{note}</p>
      </section>
    </div>
  );
}
