import type { IconName } from "./icons";

// サイドメニューの構成。画面を足すときは、この表に足す。
//   グループ：label が空のグループは、見出しなしで項目を並べる（いまは 3 つとも見出しあり）。dividerBefore は、そのグループの上に破線を引く。
//   views   ：その項目から開ける画面（2つ以上あれば、本文の上に切り替えを出す）。先頭が項目そのものの画面
//   related ：true なら切り替えを「関連画面」として出す（false は同じ項目の中の表示の切り替え）
//   planned ：true なら未実装（「TBD」の札を出し、画面は開かない）
// 項目の画面は #<画面>（例：#curves）で開く。サーバー接続（#server）は右上の接続ステータスから開く。

export type PageId =
  | "curves" | "ois" | "rates" | "reports" | "issuer-ratings"
  | "offers" | "trs"
  | "asw" | "bond" | "futures" | "callable"
  | "irrbb" | "credit-var" | "cds" | "short-balance" | "frtb-cva" | "fx-hedge" | "deemed-standard"
  | "server";

export interface View { page: PageId; label: string; icon: IconName }
export interface NavItem { id: string; label: string; icon: IconName; views: View[]; related?: boolean; planned?: boolean }
export interface NavGroup { id: string; label: string; items: NavItem[]; dividerBefore?: boolean }

export const GROUPS: readonly NavGroup[] = [
  {
    id: "operations",
    label: "業務支援",
    items: [
      { id: "credit-report", label: "クレジットRPT分析", icon: "reports", views: [{ page: "reports", label: "掲示板・登録・一覧", icon: "reports" }] },
      { id: "offer-sheet", label: "オファーシート作成", icon: "offers", related: true, views: [{ page: "offers", label: "オファーシート", icon: "offers" }, { page: "asw", label: "アセットスワップ", icon: "asw" }] },
      { id: "rating-check", label: "レポート格付検証", icon: "rating", planned: true, views: [{ page: "issuer-ratings", label: "レポート格付検証", icon: "rating" }] },
      { id: "derivative-entry", label: "デリバティブ取引入力", icon: "trs", views: [{ page: "trs", label: "TRS契約書連携", icon: "trs" }] },
      { id: "short-balance", label: "ショート残検証", icon: "limit", planned: true, views: [{ page: "short-balance", label: "ショート残検証", icon: "limit" }] },
      { id: "fx-hedge", label: "為替ヘッジ/カバー発注", icon: "swap", planned: true, views: [{ page: "fx-hedge", label: "為替ヘッジ/カバー発注", icon: "swap" }] },
      { id: "deemed-standard", label: "みなす基準算定支援", icon: "bond", planned: true, views: [{ page: "deemed-standard", label: "みなす基準算定支援", icon: "bond" }] },
    ],
  },
  {
    id: "investment-analysis",
    label: "投資定量分析",
    items: [
      { id: "yield-analysis", label: "イールドカーブ分析", icon: "zero", views: [{ page: "curves", label: "イールドカーブ", icon: "zero" }, { page: "rates", label: "日米の国債金利・OIS", icon: "curve" }] },
      { id: "bond-calc", label: "債券原始計算", icon: "bond", views: [{ page: "bond", label: "債券キャッシュフロー", icon: "bond" }] },
      { id: "futures-ctd", label: "先物CTD", icon: "futures", views: [{ page: "futures", label: "国債先物・CTD", icon: "futures" }] },
      { id: "gps", label: "GPS（含むキーレート）", icon: "ois", views: [{ page: "ois", label: "TONA OIS・スワップ", icon: "ois" }] },
      { id: "credit-spread-cds", label: "クレジットスプレッドCDS", icon: "credit", views: [{ page: "cds", label: "クレジット・CDS", icon: "credit" }] },
      { id: "early-redemption", label: "債券早期償還", icon: "callable", views: [{ page: "callable", label: "コール債・MBS", icon: "callable" }] },
    ],
  },
  {
    id: "regulatory-risk",
    label: "規制リスク関連",
    items: [
      { id: "frtb-cva", label: "FRTB CVAR計算", icon: "var", planned: true, views: [{ page: "frtb-cva", label: "FRTB CVAR計算", icon: "var" }] },
      { id: "credit-var", label: "クレジットVaR", icon: "var", planned: true, views: [{ page: "credit-var", label: "クレジットVaR", icon: "var" }] },
      { id: "irrbb", label: "IRRBB", icon: "sliders", views: [{ page: "irrbb", label: "IRRBB", icon: "sliders" }] },
    ],
  },
];

export const DEFAULT_PAGE: PageId = "reports"; // トップ URL で開く画面（クレジットRPT分析の掲示板）
export const PAGE_IDS = new Set<string>([...GROUPS.flatMap((g) => g.items.filter((i) => !i.planned).flatMap((i) => i.views.map((v) => v.page))), "server"]);

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
