import { useEffect, useState } from "react";
import OfferSheetPage from "./OfferSheetPage";
import TrsPage from "./TrsPage";
import RatesPage from "./RatesPage";
import ReportsPage from "./ReportsPage";
import IrrbbPage from "./IrrbbPage";
import ServerPage from "./ServerPage";
import { ServerConnectionProvider, ServerStatusBadge } from "./serverConnection";
import { BrandLogo, Icon, type IconName } from "./icons";

// 左のサイドメニュー（Carmine Studio と同じアイコン付き・折りたたみ対応の構成）。画面を足すときは、この表に項目を足す。
const PAGES: readonly { id: string; label: string; icon: IconName }[] = [
  { id: "reports", label: "レポート分析掲示板", icon: "reports" },
  { id: "rates", label: "日米の国債金利・OIS", icon: "curve" },
  { id: "offers", label: "オファーシート作成", icon: "offers" },
  { id: "trs", label: "TRS契約書連携", icon: "swap" },
  { id: "irrbb", label: "IRRBB金利シナリオ", icon: "sliders" },
] as const;
type PageId = "reports" | "rates" | "offers" | "trs" | "irrbb" | "server";
// 以前のアドレス（#a1/…、#c1、#yields）も開けるようにする
const ALIASES: Record<string, PageId> = { a1: "offers", c1: "trs", yields: "rates", bbg: "offers" };

// 画面の場所は URL のハッシュ（#画面/引数）。例：#offers/JPTEST000022、#reports/list/RPT_…、#server
function parseHash(): { page: PageId; arg: string | null } {
  const [p, ...rest] = window.location.hash.slice(1).split("/");
  const page = (p === "server" ? "server" : (PAGES.find((x) => x.id === p)?.id as PageId | undefined) ?? ALIASES[p] ?? "reports") as PageId;
  return { page, arg: rest.length ? decodeURIComponent(rest.join("/")) : null };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("asterquant-sidebar-collapsed") === "1";
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
        localStorage.setItem("asterquant-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* 保存できなくても続ける */
      }
      return next;
    });
  };

  return (
    <ServerConnectionProvider>
      <div className={`shell layout ${collapsed ? "sidebar-collapsed" : ""}`}>
        <nav className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="画面の一覧">
          <div className="sidebar-header">
            <a className="brand" href="#reports" title="Aster Quantlet">
              <BrandLogo />
              <span className="brand-text">
                <span className="brand-name">Aster Quantlet</span>
              </span>
            </a>
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={toggleCollapsed}
              title={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
              aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
              data-testid="sidebar-toggle"
            >
              <Icon name={collapsed ? "expand" : "collapse"} />
            </button>
          </div>
          <ul data-testid="side-menu">
            {PAGES.map((p) => (
              <li key={p.id}>
                <a
                  href={`#${p.id}`}
                  className={route.page === p.id ? "active" : ""}
                  aria-current={route.page === p.id ? "page" : undefined}
                  title={p.label}
                >
                  <Icon name={p.icon} />
                  <span className="sidebar-label">{p.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="main-col">
          <header className="topbar-right">
            <ServerStatusBadge />
          </header>
          <main className="content">
            {route.page === "reports" && <ReportsPage arg={route.arg} />}
            {route.page === "rates" && <RatesPage />}
            {route.page === "offers" && <OfferSheetPage focusIsin={route.arg} />}
            {route.page === "trs" && <TrsPage />}
            {route.page === "irrbb" && <IrrbbPage />}
            {route.page === "server" && <ServerPage />}
          </main>
        </div>
      </div>
    </ServerConnectionProvider>
  );
}
