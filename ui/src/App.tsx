import { useEffect, useState } from "react";
import OfferSheetPage from "./OfferSheetPage";
import TrsPage from "./TrsPage";
import RatesPage from "./RatesPage";
import ReportsPage from "./ReportsPage";
import IrrbbPage from "./IrrbbPage";
import ServerPage from "./ServerPage";
import AssetSwapPage from "./AssetSwapPage";
import YieldCurvesPage from "./analytics/YieldCurvesPage";
import TonaOisPage from "./analytics/TonaOisPage";
import BondCashflowPage from "./analytics/BondCashflowPage";
import CdsPage from "./analytics/CdsPage";
import FuturesPage from "./analytics/FuturesPage";
import EarlyRedemptionPage from "./analytics/EarlyRedemptionPage";
import { ServerConnectionProvider, ServerStatusBadge } from "./serverConnection";
import { Icon } from "./icons";
import { ALIASES, DEFAULT_PAGE, GROUPS, locate, PAGE_IDS, type NavItem, type PageId } from "./nav";

// 画面の構成は Carmine Studio と同じ：上の帯（左にロゴと名前、右に Infrago Quant Server の接続表示）、その下に左のサイドバー。
// サイドバーは4つのグループ（全部開いた状態で始まり、名前をクリックすると、そのグループだけ手動で開閉できる）。
// 構成は nav.ts。サーバー接続（#server）は右上の接続ステータスから開く。

// 画面の場所は URL のハッシュ（#画面/引数）。例：#offers/JPTEST000022、#reports/list/RPT_…、#server
function parseHash(): { page: PageId; arg: string | null } {
  const [p, ...rest] = window.location.hash.slice(1).replace(/^\//, "").split("/");
  const page = (PAGE_IDS.has(p) ? p : ALIASES[p] ?? DEFAULT_PAGE) as PageId;
  return { page, arg: rest.length ? decodeURIComponent(rest.join("/")) : null };
}

const SIDEBAR_KEY = "infrago-quant-sidebar-collapsed";
export default function App() {
  const [route, setRoute] = useState(parseHash);
  const here = locate(route.page);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      // 旧名のキー（asterquant-）に保存した状態も引き継ぐ
      return (localStorage.getItem(SIDEBAR_KEY) ?? localStorage.getItem("asterquant-sidebar-collapsed")) === "1";
    } catch {
      return false;
    }
  });
  // グループは最初から全部開いている。名前をクリックすると、そのグループだけ手動で閉じたり開いたりできる（自動では閉じない）
  const [open, setOpen] = useState<string[]>(() => GROUPS.map((g) => g.id));

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // 画面を移ったとき、その画面のグループが手動で閉じてあれば開く（ほかのグループには触らない）
  useEffect(() => {
    const g = locate(route.page)?.group.id;
    if (g) setOpen((o) => (o.includes(g) ? o : [...o, g]));
  }, [route.page]);

  // ブラウザのタブのタイトル：「投資業務支援ポータル/（開いているメニュー名）」。index.html の静的なタイトルは「Infrago Quantlet」のまま（起動スクリプトの確認が読む）
  useEffect(() => {
    const menu = route.page === "server" ? "サーバー接続" : locate(route.page)?.item.label;
    document.title = menu ? `投資業務支援ポータル/${menu}` : "投資業務支援ポータル";
  }, [route.page]);

  const toggleGroup = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
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

  const itemLink = (item: NavItem) => {
    const active = here?.item.id === item.id;
    if (item.planned) {
      // 未実装（TBD）の項目は、画面を開かない
      return (
        <span className="sidebar-planned" title={`${item.label}（TBD）`} aria-disabled="true" data-testid={`nav-${item.id}`}>
          <Icon name={item.icon} />
          <span className="sidebar-label">{item.label}</span>
          <span className="sidebar-soon sidebar-label">TBD</span>
        </span>
      );
    }
    return (
      <a
        href={`#${item.views[0].page}`}
        className={active ? "active" : undefined}
        aria-current={active ? "page" : undefined}
        title={item.planned ? `${item.label}（仕様確認）` : item.label}
        data-testid={`nav-${item.id}`}
      >
        <Icon name={item.icon} />
        <span className="sidebar-label">{item.label}</span>
      </a>
    );
  };

  return (
    <ServerConnectionProvider>
      <header className="site-header">
        <a className="brand" href={`#${DEFAULT_PAGE}`} title="Infrago Quantlet">
          <span className="brand-text">
            <span className="brand-name">Infrago Quantlet</span>
            <span className="brand-sub">市場分析運用判断支援</span>
          </span>
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
          {GROUPS.map((g) => {
            const isOpen = open.includes(g.id);
            const current = here?.group.id === g.id;
            const labelled = g.label !== "";
            return (
              <div key={g.id} className={`sidebar-group${current ? " current" : ""}${g.dividerBefore ? " divided" : ""}${labelled ? "" : " unlabelled"}`} data-testid={`group-${g.id}`}>
                {labelled && (
                  <button
                    type="button"
                    className="sidebar-part"
                    aria-expanded={isOpen}
                    aria-controls={`group-items-${g.id}`}
                    onClick={() => toggleGroup(g.id)}
                    data-testid={`group-toggle-${g.id}`}
                  >
                    <Icon name="chevron" size={12} />
                    <span className="sidebar-label">{g.label}</span>
                  </button>
                )}
                {/* 折りたたんだサイドバー（アイコンだけ）では、グループの開閉に関係なく項目のアイコンを並べる。見出しのないグループは、いつも開いている */}
                <ul id={`group-items-${g.id}`} hidden={labelled && !isOpen && !collapsed}>
                  {g.items.map((item) => <li key={item.id}>{itemLink(item)}</li>)}
                </ul>
              </div>
            );
          })}
        </nav>
        <main className="content">
          {here && here.item.views.length > 1 && (
            <div className="tabs-row" role="tablist" aria-label={here.item.related ? "関連画面" : `${here.item.label}の画面`} data-testid="view-tabs">
              {here.item.related && <span className="tabs-label">関連画面</span>}
              {here.item.views.map((v) => (
                <a key={v.page} role="tab" aria-selected={route.page === v.page} className={`subtab ${route.page === v.page ? "active" : ""}`} href={`#${v.page}`} data-testid={`view-${v.page}`}>
                  <Icon name={v.icon} size={14} />
                  {v.label}
                  {here.item.planned && v.page === here.item.views[0].page ? "（仕様確認）" : ""}
                </a>
              ))}
            </div>
          )}
          {route.page === "curves" && <YieldCurvesPage />}
          {route.page === "ois" && <TonaOisPage />}
          {route.page === "rates" && <RatesPage />}
          {route.page === "reports" && <ReportsPage arg={route.arg} />}
          {route.page === "offers" && <OfferSheetPage focusIsin={route.arg} />}
          {route.page === "trs" && <TrsPage />}
          {route.page === "asw" && <AssetSwapPage />}
          {route.page === "bond" && <BondCashflowPage />}
          {route.page === "futures" && <FuturesPage />}
          {route.page === "callable" && <EarlyRedemptionPage />}
          {route.page === "irrbb" && <IrrbbPage />}
          {route.page === "cds" && <CdsPage />}
          {route.page === "server" && <ServerPage />}
        </main>
      </div>
    </ServerConnectionProvider>
  );
}
