import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// AsterQuant Server（R の API）との接続。画面全体で一つの状態を持ち、右上の表示はどの画面でもこれを見る。
// 接続中かどうかは、実際に /api/health が答え、その応答が AsterQuant Server のものかで決める（推測しない）。

export interface Check {
  n: number;
  at: Date;
  ok: boolean;
  roundTripMs: number | null;
  error?: string;
}

interface ConnectionState {
  last: Check | null;
  history: Check[];
  checking: boolean;
  intervalSec: number;
  checkNow: () => void;
}

const HISTORY = 40;
const INTERVAL_SEC = 15;
const Ctx = createContext<ConnectionState | null>(null);

export function ServerConnectionProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<Check[]>([]);
  const [checking, setChecking] = useState(false);
  const n = useRef(0);

  const checkNow = useCallback(async () => {
    setChecking(true);
    const t0 = performance.now();
    let check: Check;
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const body = (await res.json()) as { status?: string; name?: string };
      const ok = res.ok && body.status === "ok" && (body.name === "AsterQuant Server" || body.name === "QuantLet Server");
      check = {
        n: ++n.current,
        at: new Date(),
        ok,
        roundTripMs: performance.now() - t0,
        error: ok ? undefined : `応答が AsterQuant Server のものではない（HTTP ${res.status}）`,
      };
    } catch (e) {
      check = { n: ++n.current, at: new Date(), ok: false, roundTripMs: null, error: (e as Error).message };
    }
    setHistory((h) => [...h.slice(-(HISTORY - 1)), check]);
    setChecking(false);
  }, []);

  useEffect(() => {
    void checkNow();
    const id = window.setInterval(() => void checkNow(), INTERVAL_SEC * 1000);
    return () => window.clearInterval(id);
  }, [checkNow]);

  return (
    <Ctx.Provider value={{ last: history[history.length - 1] ?? null, history, checking, intervalSec: INTERVAL_SEC, checkNow: () => void checkNow() }}>
      {children}
    </Ctx.Provider>
  );
}

export function useServerConnection(): ConnectionState {
  const c = useContext(Ctx);
  if (!c) throw new Error("ServerConnectionProvider がない");
  return c;
}

// 右上の表示。クリックすると接続確認ページを開く
export function ServerStatusBadge() {
  const { last } = useServerConnection();
  const state = last === null ? "checking" : last.ok ? "ok" : "bad";
  const label = state === "checking" ? "確認中" : state === "ok" ? "接続中" : "未接続";
  return (
    <a
      href="#server"
      className={`server-badge ${state}`}
      data-testid="server-badge"
      title={last ? `最終確認 ${last.at.toLocaleTimeString("ja-JP")}${last.roundTripMs !== null ? `、往復 ${last.roundTripMs.toFixed(0)} ms` : ""}${last.error ? `、${last.error}` : ""}` : ""}
    >
      <span className="dot" aria-hidden="true" />
      AsterQuant Server：{label}
    </a>
  );
}
