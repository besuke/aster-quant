import { useEffect, useState } from "react";
import { api } from "./api";
import OfferSheetPage from "./OfferSheetPage";
import TrsPage from "./TrsPage";
import BloombergPage from "./BloombergPage";
import YieldCurvePage from "./YieldCurvePage";
import ReportBoardPage from "./ReportBoardPage";

const TABS = [
  { id: "a1", label: "A1 オファーシート" },
  { id: "reports", label: "レポート掲示板" },
  { id: "yields", label: "日米国債金利" },
  { id: "c1", label: "C1 TRS確認書" },
  { id: "bbg", label: "Bloomberg連携" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// 画面の場所は URL のハッシュ（#タブ/引数）。例：#a1/JPTEST000022（その銘柄のオファーを開く）、#reports/RPT_…（レポートを開く）
function parseHash(): { tab: TabId; arg: string | null } {
  const [t, ...rest] = window.location.hash.slice(1).split("/");
  const tab = (TABS.find((x) => x.id === t)?.id ?? "a1") as TabId;
  return { tab, arg: rest.length ? decodeURIComponent(rest.join("/")) : null };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [health, setHealth] = useState<string>("接続を確認中…");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHealth(`${h.quantlet} · ${h.engine}`);
        setHealthOk(true);
      })
      .catch((e: Error) => {
        setHealth(e.message);
        setHealthOk(false);
      });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          QuantLet<span className="brand-sub">債券運用の分析・業務支援</span>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={route.tab === t.id}
              className={route.tab === t.id ? "tab active" : "tab"}
              onClick={() => {
                window.location.hash = t.id;
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className={`health ${healthOk === false ? "bad" : healthOk ? "ok" : ""}`} title="R の API（server/server.R）">
          {health}
        </div>
      </header>
      <main className="content">
        {route.tab === "a1" && <OfferSheetPage focusIsin={route.arg} />}
        {route.tab === "reports" && <ReportBoardPage focusId={route.arg} />}
        {route.tab === "yields" && <YieldCurvePage />}
        {route.tab === "c1" && <TrsPage />}
        {route.tab === "bbg" && <BloombergPage />}
      </main>
    </div>
  );
}
