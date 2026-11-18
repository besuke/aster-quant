// サイドバーの線画アイコン（24 x 24、currentColor）と左上の Infrago Quant ロゴ。
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  // レポート分析掲示板：文書と見出しの行
  reports: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  // 日米の国債金利・OIS：座標軸とイールドカーブ
  curve: (
    <>
      <path d="M4 4v16h16" />
      <path d="M6.5 16c3-6 6-8.5 12-9.5" />
    </>
  ),
  // オファーシート作成：キャッシュフロー・債券の比較バー
  offers: (
    <>
      <path d="M3.5 20h17" />
      <path d="M6 20v-6M10 20v-9M14 20v-5M18 20V7" />
    </>
  ),
  // TRS契約書連携：双方向のスワップ矢印
  swap: (
    <>
      <path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5" />
      <path d="M20 16H6M9.5 12.5L6 16l3.5 3.5" />
    </>
  ),
  // IRRBB金利シナリオ：金利ショックのスライダー
  sliders: (
    <>
      <path d="M5 4v16M12 4v16M19 4v16" />
      <circle cx="5" cy="14" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="19" cy="15" r="2" />
    </>
  ),
  // イールドカーブ：ノードの点を通るカーブ
  zero: (
    <>
      <path d="M4 4v16h16" />
      <path d="M6.5 15.5c2.5-4 5.5-6.5 12-8" />
      <circle cx="9" cy="12.2" r="1.3" />
      <circle cx="14" cy="9" r="1.3" />
    </>
  ),
  // TONA OIS：日々の金利の波とスワップ
  ois: (
    <>
      <path d="M3.5 9c2-2.5 4-2.5 6 0s4 2.5 6 0 3-2.5 5 0" />
      <path d="M4 16h14M14.5 13l3.5 3-3.5 3" />
    </>
  ),
  // 債券キャッシュフロー：時間軸の上のクーポンと償還
  bond: (
    <>
      <path d="M3.5 19.5h17" />
      <path d="M6 19.5v-3M10 19.5v-3M14 19.5v-3M18.5 19.5V6" />
      <path d="M16.5 8l2-2 2 2" />
    </>
  ),
  // クレジット・CDS：盾（プロテクション）
  credit: (
    <>
      <path d="M12 3.5l7 2.8v5.4c0 4.3-3 7.4-7 8.8-4-1.4-7-4.5-7-8.8V6.3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  // 国債先物・CTD：複数の銘柄から1つを選ぶ棒
  futures: (
    <>
      <path d="M3.5 20h17" />
      <path d="M6 20v-8M10 20v-12M14 20v-6M18 20v-9" />
      <path d="M8.5 6.5l1.5-2 1.5 2" />
    </>
  ),
  // 早期償還：コール日で折れる残高の階段
  callable: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 6h4v4h4v4h4v4" />
      <path d="M17 6h3" />
    </>
  ),
  // 発行体格付け推移：階段状に動く格付け
  rating: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 16h4v-4h4v-3h4V6" />
      <path d="M5 20.5v-1M9 20.5v-1M13 20.5v-1M17 20.5v-1" />
    </>
  ),
  // 格付け枠管理：メーターと枠
  limit: (
    <>
      <path d="M4.5 16.5a7.5 7.5 0 1 1 15 0" />
      <path d="M12 16.5l3-4.5" />
      <path d="M4 20h16" />
    </>
  ),
  // グループの開閉
  chevron: <path d="M9 6l6 6-6 6" />,
  // TRS契約書連携：書類と矢印
  trs: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 13h6M12.5 10.5L15 13l-2.5 2.5M9 17h5" />
    </>
  ),
  // アセットスワップ：債券（棒）と交換の矢印
  asw: (
    <>
      <path d="M4 20h16" />
      <path d="M6.5 20v-5M10 20v-7" />
      <path d="M4.5 8h10M12 5.5L14.5 8 12 10.5" />
      <path d="M19.5 12h-6M16 9.5L13.5 12 16 14.5" />
    </>
  ),
  // クレジットVaR：損失の分布と裾
  var: (
    <>
      <path d="M3.5 20h17" />
      <path d="M4.5 19c3-.2 4-6 6.5-11 2 5 3.5 10.5 8.5 11" />
      <path d="M15 20v-4.5" strokeDasharray="1.5 2" />
    </>
  ),
  // Infrago Quant Server：2段のサーバーユニット
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h6M11 16.5h6" />
    </>
  ),
  // サイドバーの折りたたみ・展開
  collapse: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9.5 4v16M15.5 10l-2 2 2 2" />
    </>
  ),
  expand: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9.5 4v16M13.5 10l2 2-2 2" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

// 左サイドバー上部の SVG ロゴ（花・星標を深い緑の濃淡で描く。タブのアイコンは index.html に同じ図を入れる）
export function BrandLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-testid="brand-logo"
    >
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="#e7f3ec" stroke="#166534" strokeWidth={1.6} />
      <g transform="rotate(45 12 12)" fill="#15803d" opacity={0.88}>
        <ellipse cx="12" cy="12" rx="2.2" ry="7.2" />
        <ellipse cx="12" cy="12" rx="7.2" ry="2.2" />
      </g>
      <g fill="#14532d">
        <ellipse cx="12" cy="12" rx="2.2" ry="7.4" />
        <ellipse cx="12" cy="12" rx="7.4" ry="2.2" />
      </g>
      <circle cx="12" cy="12" r="2.7" fill="#fbbf24" stroke="#052e16" strokeWidth={1.2} />
    </svg>
  );
}
