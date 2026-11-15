import { useEffect, useState } from "react";
import { api } from "./api";
import OfferSheetPage from "./OfferSheetPage";
import TrsPage from "./TrsPage";
import RatesPage from "./RatesPage";
import ReportBoardPage from "./ReportBoardPage";
import IrrbbPage from "./IrrbbPage";

// 左のサイドメニュー（Carmine Studio と同じ構成）。画面を足すときは、この表に項目を足す。
const PAGES = [
  { id: "reports", label: "レポート分析掲示板" },
  { id: "rates", label: "日米の国債金利・OIS" },
  { id: "offers", label: "オファーシート作成" },
  { id: "trs", label: "TRS契約書連携" },
  { id: "irrbb", label: "IRRBB金利シナリオ" },
] as const;
type PageId = (typeof PAGES)[number]["id"];
// 以前のアドレス（#a1/…、#c1、#yields）も開けるようにする
const ALIASES: Record<string, PageId> = { a1: "offers", c1: "trs", yields: "rates", bbg: "offers" };

// 画面の場所は URL のハッシュ（#画面/引数）。例：#offers/JPTEST000022（その銘柄のオファー）、#reports/RPT_…（レポート）
function parseHash(): { page: PageId; arg: string | null } {
  const [p, ...rest] = window.location.hash.slice(1).split("/");
  const page = (PAGES.find((x) => x.id === p)?.id ?? ALIASES[p] ?? "reports") as PageId;
  return { page, arg: rest.length ? decodeURIComponent(rest.join("/")) : null };
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
    <div className="shell">
      <nav className="sidebar" aria-label="画面の一覧">
        <a className="brand" href="#reports">
          QuantLet<span className="brand-sub">運用分析・業務支援</span>
        </a>
        <ul data-testid="side-menu">
          {PAGES.map((p) => (
            <li key={p.id}>
              <a href={`#${p.id}`} className={route.page === p.id ? "active" : ""} aria-current={route.page === p.id ? "page" : undefined}>
                {p.label}
              </a>
            </li>
          ))}
        </ul>
        <div className={`health ${healthOk === false ? "bad" : healthOk ? "ok" : ""}`} title="R の API（server/server.R）">
          {health}
        </div>
      </nav>
      <main className="content">
        {route.page === "reports" && <ReportBoardPage focusId={route.arg} />}
        {route.page === "rates" && <RatesPage />}
        {route.page === "offers" && <OfferSheetPage focusIsin={route.arg} />}
        {route.page === "trs" && <TrsPage />}
        {route.page === "irrbb" && <IrrbbPage />}
      </main>
    </div>
  );
}
