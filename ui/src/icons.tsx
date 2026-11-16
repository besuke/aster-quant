// サイドバーの線画アイコン（24 x 24、currentColor）と左上の AsterQuant ロゴ。
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
  // AsterQuant Server：2段のサーバーユニット
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

// 左サイドバー上部の小さな SVG ロゴ（Aster の星標とイールドカーブを組み合わせ、アクセントの青で描く）
export function BrandLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
       data-testid="brand-logo"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.75} />
      <path d="M6.5 16.5c2.5-4.5 5.2-6.8 11-7.8" stroke="var(--accent)" strokeWidth={2} />
      <path d="M9 6.5v4M7 8.5h4M7.6 7.1l2.8 2.8M10.4 7.1L7.6 9.9" stroke="var(--accent)" strokeWidth={1.5} />
      <circle cx="17.5" cy="8.7" r="1.6" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
