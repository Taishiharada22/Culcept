"use client";

/**
 * composeIcons — 予定追加 2カラム体験の SVG アイコン群（P4-2・表示専用）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * すべて currentColor stroke の inline SVG（外部依存なし・emoji 不使用）。
 *   - 入力欄の左右に置く意味アイコン（場所 / 人 / 内容別）
 *   - 日付横の「動かせる / 動かせない」トグル
 */

import type { ActivityIconKey } from "@/lib/plan/compose/activityIcon";

interface IconProps {
  className?: string;
}

const BASE = "h-4 w-4";

function Svg({
  className,
  children,
  "data-testid": testid,
}: IconProps & { children: React.ReactNode; "data-testid"?: string }) {
  return (
    <svg
      data-testid={testid}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? BASE}
    >
      {children}
    </svg>
  );
}

/** 場所（map pin）。「どこで？」左に常時。 */
export function LocationIcon({ className }: IconProps) {
  return (
    <Svg className={className} data-testid="compose-icon-location">
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </Svg>
  );
}

/** 人（👥）。「誰と？」左に常時。 */
export function PeopleIcon({ className }: IconProps) {
  return (
    <Svg className={className} data-testid="compose-icon-people">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17 13.5a5.5 5.5 0 0 1 3.5 5.1" />
    </Svg>
  );
}

/** ＋（参加者追加・履歴呼び出し）。 */
export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className} data-testid="compose-icon-plus">
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** 動かせる（解錠・自由）。 */
export function MovableIcon({ className }: IconProps) {
  return (
    <Svg className={className} data-testid="compose-icon-movable">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1.8" />
      <path d="M12 15v2" />
    </Svg>
  );
}

/** 動かせない（施錠・固定）。 */
export function FixedIcon({ className }: IconProps) {
  return (
    <Svg className={className} data-testid="compose-icon-fixed">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <path d="M12 15v2" />
    </Svg>
  );
}

/** 内容別アイコン（「何をする？」右端）。 */
export function ActivityIcon({
  iconKey,
  className,
}: IconProps & { iconKey: ActivityIconKey }) {
  switch (iconKey) {
    case "meeting":
      return (
        <Svg className={className} data-testid="compose-icon-activity-meeting">
          <path d="M4 5h16v10H8l-4 4V5Z" />
          <path d="M8 9h8M8 12h5" />
        </Svg>
      );
    case "food":
      return (
        <Svg className={className} data-testid="compose-icon-activity-food">
          <path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11" />
          <path d="M17 3c-1.5 0-2.5 2-2.5 5S15.5 12 17 12v9" />
        </Svg>
      );
    case "fitness":
      return (
        <Svg className={className} data-testid="compose-icon-activity-fitness">
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
        </Svg>
      );
    case "travel":
      return (
        <Svg className={className} data-testid="compose-icon-activity-travel">
          <path d="M10.5 3.5 21 12l-10.5 8.5L9 14l-5 1 2-4-2-4 5 1 1.5-4.5Z" />
        </Svg>
      );
    case "work":
      return (
        <Svg className={className} data-testid="compose-icon-activity-work">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </Svg>
      );
    case "generic":
    default:
      return (
        <Svg className={className} data-testid="compose-icon-activity-generic">
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M4 9h16M9 3v4M15 3v4" />
        </Svg>
      );
  }
}
