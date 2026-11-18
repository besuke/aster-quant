import type { IconName } from "./icons";

// サイドメニューの構成（4グループ）。画面を足すときは、この表に足す。
//   views   ：その項目から開ける画面（2つ以上あれば、本文の上に切り替えを出す）。先頭が項目そのものの画面
//   related ：true なら切り替えを「関連画面」として出す（false は同じ項目の中の表示の切り替え）
//   planned ：true なら未実装（「準備中」と表示する）
// 項目の画面は #<画面>（例：#curves）で開く。サーバー接続（#server）は右上の接続ステータスから開く。

export type PageId =
  | "curves" | "ois" | "rates" | "reports" | "issuer-ratings"
  | "offers" | "trs"
  | "asw" | "bond" | "futures" | "callable"
  | "irrbb" | "credit-var" | "cds" | "rating-limits"
  | "server";

export interface View { page: PageId; label: string; icon: IconName }
export interface NavItem { id: string; label: string; icon: IconName; views: View[]; related?: boolean; planned?: boolean }
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const GROUPS: readonly NavGroup[] = [
  {
    id: "market",
    label: "レポートと市場分析",
    items: [
      {
        id: "yield-analysis", label: "イールドカーブ分析", icon: "zero",
        views: [{ page: "curves", label: "イールドカーブ", icon: "zero" }, { page: "ois", label: "TONA OIS・スワップ", icon: "ois" }, { page: "rates", label: "日米の国債金利・OIS", icon: "curve" }],
      },
      { id: "report-summary", label: "レポートサマリー", icon: "reports", views: [{ page: "reports", label: "掲示板・登録・一覧", icon: "reports" }] },
      { id: "issuer-ratings", label: "発行体格付け推移", icon: "rating", planned: true, views: [{ page: "issuer-ratings", label: "発行体格付け推移", icon: "rating" }] },
    ],
  },
  {
    id: "offer",
    label: "オファーレベル",
    items: [
      { id: "offer-sheet", label: "オファーシート", icon: "offers", related: true, views: [{ page: "offers", label: "オファーシート", icon: "offers" }, { page: "trs", label: "TRS契約書連携", icon: "trs" }] },
    ],
  },
  {
    id: "product",
    label: "商品評価",
    items: [
      {
        id: "asset-swap", label: "アセットスワップ", icon: "asw", related: true,
        views: [{ page: "asw", label: "アセットスワップ", icon: "asw" }, { page: "bond", label: "債券キャッシュフロー", icon: "bond" }, { page: "futures", label: "国債先物・CTD", icon: "futures" }],
      },
      { id: "early-redemption", label: "早期償還", icon: "callable", views: [{ page: "callable", label: "コール債・MBS", icon: "callable" }] },
    ],
  },
  {
    id: "risk",
    label: "リスク計算",
    items: [
      { id: "irrbb", label: "IRRBB", icon: "sliders", views: [{ page: "irrbb", label: "IRRBB", icon: "sliders" }] },
      { id: "credit-var", label: "クレジットVaR", icon: "var", planned: true, related: true, views: [{ page: "credit-var", label: "クレジットVaR", icon: "var" }, { page: "cds", label: "クレジット・CDS", icon: "credit" }] },
      { id: "rating-limits", label: "格付け枠管理", icon: "limit", planned: true, views: [{ page: "rating-limits", label: "格付け枠管理", icon: "limit" }] },
    ],
  },
];

export const DEFAULT_PAGE: PageId = "reports"; // トップ URL で開く画面（レポートサマリーの掲示板）
export const PAGE_IDS = new Set<string>([...GROUPS.flatMap((g) => g.items.flatMap((i) => i.views.map((v) => v.page))), "server"]);

// 以前のアドレス（#a1/…、#c1、#yields、Carmine Studio のアドレス）も開けるようにする
export const ALIASES: Record<string, PageId> = {
  a1: "offers", c1: "trs", yields: "rates", bbg: "offers",
  "yield-curves": "curves", "yield-curve-ois": "ois", "deterministic-cashflow": "bond", "credit-cds": "cds",
  "jgb-futures": "futures", "early-redemption": "callable",
};

export function locate(page: PageId): { group: NavGroup; item: NavItem } | null {
  for (const group of GROUPS) for (const item of group.items) if (item.views.some((v) => v.page === page)) return { group, item };
  return null;
}
