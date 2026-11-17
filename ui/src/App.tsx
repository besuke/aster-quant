import { useEffect, useState } from "react";
import OfferSheetPage from "./OfferSheetPage";
import TrsPage from "./TrsPage";
import RatesPage from "./RatesPage";
import ReportsPage from "./ReportsPage";
import IrrbbPage from "./IrrbbPage";
import ServerPage from "./ServerPage";
import YieldCurvesPage from "./analytics/YieldCurvesPage";
import TonaOisPage from "./analytics/TonaOisPage";
import BondCashflowPage from "./analytics/BondCashflowPage";
import CdsPage from "./analytics/CdsPage";
import FuturesPage from "./analytics/FuturesPage";
import EarlyRedemptionPage from "./analytics/EarlyRedemptionPage";
import { ServerConnectionProvider, ServerStatusBadge } from "./serverConnection";
import { BrandLogo, Icon, type IconName } from "./icons";

// 画面の構成は Carmine Studio と同じ：上の帯（左にロゴと名前、右に Infrago Quant Server の接続表示）、その下に左のサイドバー
// （上に折りたたみ、項目は見出しでまとめる）。画面を足すときは、この表に項目を足す。
const GROUPS: readonly { label: string; pages: readonly { id: PageId; label: string; icon: IconName }[] }[] = [
  {
    label: "金利・カーブ",
    pages: [
      { id: "curves", label: "イールドカーブ", icon: "zero" },
      { id: "ois", label: "TONA OIS・スワップ", icon: "ois" },
      { id: "rates", label: "日米の国債金利・OIS", icon: "curve" },
    ],
  },
  {
    label: "債券・クレジット",
    pages: [
      { id: "bond", label: "債券キャッシュフロー", icon: "bond" },
      { id: "callable", label: "早期償還（コール債・MBS）", icon: "callable" },
      { id: "futures", label: "国債先物・CTD", icon: "futures" },
      { id: "cds", label: "クレジット・CDS", icon: "credit" },
      { id: "offers", label: "オファーシート作成", icon: "offers" },
    ],
  },
  { label: "リスク", pages: [{ id: "irrbb", label: "IRRBB金利シナリオ", icon: "sliders" }] },
  {
    label: "業務",
    pages: [
      { id: "reports", label: "レポート分析掲示板", icon: "reports" },
      { id: "trs", label: "TRS契約書連携", icon: "swap" },
    ],
  },
];
type PageId = "curves" | "ois" | "rates" | "bond" | "callable" | "futures" | "cds" | "offers" | "irrbb" | "reports" | "trs" | "server";
const PAGE_IDS = new Set<string>([...GROUPS.flatMap((g) => g.pages.map((p) => p.id)), "server"]);
const DEFAULT_PAGE: PageId = "curves"; // 最初に開く画面（債券を見るときはまずイールドカーブ）
// 以前のアドレス（#a1/…、#c1、#yields）も開けるようにする
const ALIASES: Record<string, PageId> = { a1: "offers", c1: "trs", yields: "rates", bbg: "offers", "yield-curves": "curves", "yield-curve-ois": "ois", "deterministic-cashflow": "bond", "credit-cds": "cds", "jgb-futures": "futures", "early-redemption": "callable" };

// 画面の場所は URL のハッシュ（#画面/引数）。例：#offers/JPTEST000022、#reports/list/RPT_…、#server
function parseHash(): { page: PageId; arg: string | null } {
  const [p, ...rest] = window.location.hash.slice(1).replace(/^\//, "").split("/");
  const page = (PAGE_IDS.has(p) ? p : ALIASES[p] ?? DEFAULT_PAGE) as PageId;
  return { page, arg: rest.length ? decodeURIComponent(rest.join("/")) : null };
}

const SIDEBAR_KEY = "infrago-quant-sidebar-collapsed";

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      // 旧名のキー（asterquant-）に保存した状態も引き継ぐ
      return (localStorage.getItem(SIDEBAR_KEY) ?? localStorage.getItem("asterquant-sidebar-collapsed")) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* 保存できなくても続ける */
      }
      return next;
    });
  };

  const link = (id: PageId, label: string, icon: IconName) => (
    <a href={`#${id}`} className={route.page === id ? "active" : undefined} aria-current={route.page === id ? "page" : undefined} title={label}>
      <Icon name={icon} />
      <span className="sidebar-label">{label}</span>
    </a>
  );

  return (
    <ServerConnectionProvider>
      <header className="site-header">
        <a className="brand" href={`#${DEFAULT_PAGE}`} title="Infrago Quantlet">
          <BrandLogo />
          <span className="brand-name">Infrago Quantlet</span>
        </a>
        <ServerStatusBadge />
      </header>
      <div className={`layout ${collapsed ? "sidebar-collapsed" : ""}`}>
        <nav className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="画面の一覧" data-testid="side-menu">
          <div className="sidebar-top">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={toggleCollapsed}
              title={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
              aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
              data-testid="sidebar-toggle"
            >
              <Icon name={collapsed ? "expand" : "collapse"} />
              {!collapsed && <span className="sidebar-toggle-label">折りたたむ</span>}
            </button>
          </div>
          {link("server", "サーバー接続", "server")}
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="sidebar-part">{g.label}</div>
              <ul>
                {g.pages.map((p) => <li key={p.id}>{link(p.id, p.label, p.icon)}</li>)}
              </ul>
            </div>
          ))}
        </nav>
        <main className="content">
          {route.page === "curves" && <YieldCurvesPage />}
          {route.page === "ois" && <TonaOisPage />}
          {route.page === "bond" && <BondCashflowPage />}
          {route.page === "callable" && <EarlyRedemptionPage />}
          {route.page === "futures" && <FuturesPage />}
          {route.page === "cds" && <CdsPage />}
          {route.page === "reports" && <ReportsPage arg={route.arg} />}
          {route.page === "rates" && <RatesPage />}
          {route.page === "offers" && <OfferSheetPage focusIsin={route.arg} />}
          {route.page === "trs" && <TrsPage />}
          {route.page === "irrbb" && <IrrbbPage />}
          {route.page === "server" && <ServerPage />}
        </main>
      </div>
    </ServerConnectionProvider>
  );
}
