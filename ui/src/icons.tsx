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

// 左サイドバー上部の SVG ロゴ（Aster＝紫苑の花・星標を紫系の濃淡で描く）
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
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="#f3e8ff" stroke="#7c3aed" strokeWidth={1.6} />
      <g transform="rotate(45 12 12)" fill="#9333ea" opacity={0.88}>
        <ellipse cx="12" cy="12" rx="2.2" ry="7.2" />
        <ellipse cx="12" cy="12" rx="7.2" ry="2.2" />
      </g>
      <g fill="#6d28d9">
        <ellipse cx="12" cy="12" rx="2.2" ry="7.4" />
        <ellipse cx="12" cy="12" rx="7.4" ry="2.2" />
      </g>
      <circle cx="12" cy="12" r="2.7" fill="#fbbf24" stroke="#4c1d95" strokeWidth={1.2} />
    </svg>
  );
}
