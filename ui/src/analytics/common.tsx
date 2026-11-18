import { useEffect, useRef, useState, type ReactNode } from "react";

// 分析の画面（イールドカーブ・TONA OIS・債券キャッシュフロー・クレジット）の共通部品。入力が変わると少し待ってから
// API を呼び、最後に出した要求の応答だけを使う。計算はしない（表示だけ）。

export function useCalc<Q, R>(request: Q, fetcher: (q: Q) => Promise<R>, delayMs = 250) {
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const key = JSON.stringify(request);
  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      fetcher(request)
        .then((d) => { if (my === seq.current) { setData(d); setError(null); setLoading(false); } })
        .catch((e: Error) => { if (my === seq.current) { setError(e.message); setLoading(false); } });
    }, delayMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading };
}

export const f = (x: number | null | undefined, n: number) => (x === null || x === undefined || Number.isNaN(x) ? "—" : x.toLocaleString("ja-JP", { minimumFractionDigits: n, maximumFractionDigits: n }));
export const pct = (x: number | null | undefined, n = 4) => (x === null || x === undefined ? "—" : `${f(x * 100, n)}%`);
export const t3 = (x: number) => (Math.trunc(x * 1000) / 1000).toFixed(3);
export const yen = (x: number, signed = false) => `${signed && x > 0 ? "+" : ""}${Math.round(x).toLocaleString("ja-JP")} 円`;
export const yearsFrom = (origin: string, date: string) => (Date.parse(date) - Date.parse(origin)) / 86_400_000 / 365;

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <span className="error-text" role="alert">{error}</span>;
  return <span className="qc-state" aria-live="polite">{loading ? "計算中…" : "計算済み"}</span>;
}

export function NumField({ label, value, onChange, step, min, max, width }: {
  label: string; value: number; onChange: (v: number) => void; step: number; min?: number; max?: number; width?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label>
      {label}
      <input type="number" step={step} min={min} max={max} value={text} style={width ? { width } : undefined}
        onChange={(e) => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) onChange(v); }} />
    </label>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {label}
      <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="qc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tile({ label, value, note, emphasis }: { label: string; value: ReactNode; note?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`qc-tile${emphasis ? " emphasis" : ""}`}>
      <div className="qc-tile-label">{label}</div>
      <div className="qc-tile-value">{value}</div>
      {note && <div className="qc-tile-note">{note}</div>}
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="intro intro-bar">
      <h1>{title}</h1>
      {children}
    </section>
  );
}
