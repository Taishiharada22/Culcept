/**
 * シフト「休み」日レベル表示（色 + バッジ）
 *
 * 設計書: docs/alter-plan-shift-import-contract-and-day-indicator-design.md §4-5
 *
 * CEO 指示（2026-05-30）:
 *   - 休みの日は「色 + バッジ」で示す
 *   - 色は何色か用意し、ユーザー好みで変更できる
 *   - バッジは数種類のアイコンから選べる
 *
 * 設計原則:
 *   - 純粋な presentational（hooks / state / IO なし）
 *   - 色はアイコンに currentColor 継承 → ユーザー選択色で着色（層3・表示）
 *   - H / BD / HREQ の意味差は label とアイコン/色の選択で残す（GPT 補正）
 *   - 「休み」は時間枠（anchor）にしない。日レベルの軽量表示のみ
 */

import type { CSSProperties } from "react";

/** 選べるバッジアイコンのキー */
export type ShiftOffBadgeIconName =
  | "moon" // 休息・夜
  | "coffee" // 一服・オフ
  | "home" // 在宅・自宅
  | "sofa" // くつろぎ
  | "star" // 希望（HREQ 向き）
  | "kyu"; // 「休」文字

/** picker 用の一覧（順序固定） */
export const SHIFT_OFF_BADGE_ICON_NAMES: readonly ShiftOffBadgeIconName[] = [
  "moon",
  "coffee",
  "home",
  "sofa",
  "star",
  "kyu",
];

/** 各アイコンの人間可読ラベル（picker 表示用） */
export const SHIFT_OFF_BADGE_ICON_LABELS: Record<ShiftOffBadgeIconName, string> =
  {
    moon: "月（休息）",
    coffee: "コーヒー（一服）",
    home: "家（在宅）",
    sofa: "ソファ（くつろぎ）",
    star: "星（希望）",
    kyu: "休（文字）",
  };

/**
 * 選べる色パレット（starter）。ユーザーはこの中から選ぶ / カスタム色も可。
 * 落ち着いた色味で揃え、休みが「予定」より一段静かに見えるトーン。
 */
export const SHIFT_OFF_COLOR_PALETTE: readonly { key: string; label: string; value: string }[] =
  [
    { key: "slate", label: "スレート", value: "#64748b" },
    { key: "sky", label: "スカイ", value: "#0ea5e9" },
    { key: "teal", label: "ティール", value: "#14b8a6" },
    { key: "amber", label: "アンバー", value: "#f59e0b" },
    { key: "rose", label: "ローズ", value: "#f43f5e" },
    { key: "violet", label: "バイオレット", value: "#8b5cf6" },
  ];

interface IconProps {
  size?: number;
  className?: string;
}

/** SVG アイコン本体（stroke ベース・currentColor 継承） */
function IconSvg({
  size = 18,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICON_RENDERERS: Record<
  ShiftOffBadgeIconName,
  (props: IconProps) => React.ReactNode
> = {
  moon: (p) => (
    <IconSvg {...p}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </IconSvg>
  ),
  coffee: (p) => (
    <IconSvg {...p}>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1.5" x2="6" y2="4" />
      <line x1="10" y1="1.5" x2="10" y2="4" />
    </IconSvg>
  ),
  home: (p) => (
    <IconSvg {...p}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
    </IconSvg>
  ),
  sofa: (p) => (
    <IconSvg {...p}>
      <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M2 13a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4H2z" />
      <line x1="6" y1="17" x2="6" y2="20" />
      <line x1="18" y1="17" x2="18" y2="20" />
    </IconSvg>
  ),
  star: (p) => (
    <IconSvg {...p}>
      <polygon points="12 2.5 14.9 9 22 9.4 16.5 14 18.4 21 12 17 5.6 21 7.5 14 2 9.4 9.1 9" />
    </IconSvg>
  ),
  kyu: ({ size = 18, className }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fill="currentColor"
      >
        休
      </text>
    </svg>
  ),
};

/** 単体アイコン描画 */
export function ShiftOffBadgeIcon({
  icon,
  size = 18,
  className,
}: {
  icon: ShiftOffBadgeIconName;
  size?: number;
  className?: string;
}) {
  return <>{ICON_RENDERERS[icon]({ size, className })}</>;
}

/**
 * 「休み」日レベルバッジ（色 + アイコン + ラベル）。
 * color: ユーザー選択色。アイコンと枠線・薄背景に反映。
 */
export function ShiftOffBadge({
  icon,
  color,
  label,
  size = 18,
}: {
  icon: ShiftOffBadgeIconName;
  color: string;
  label: string;
  size?: number;
}) {
  const style: CSSProperties = {
    color,
    borderColor: `${color}55`,
    backgroundColor: `${color}14`,
  };
  return (
    <span
      role="img"
      aria-label={`休み: ${label}`}
      data-testid="shift-off-badge"
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={style}
    >
      <ShiftOffBadgeIcon icon={icon} size={size} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}
