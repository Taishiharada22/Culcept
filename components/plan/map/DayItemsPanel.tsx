"use client";

/**
 * Phase 3-N Map impl sub-phase 9a-impl Step δ — DayItemsPanel (= 左下 当日リスト + 凡例 hybrid)
 *
 * 設計原則 (= CEO + GPT 補正 #4 「first-pass: 凡例 + 当日リスト hybrid」):
 *   - **map 左下 overlay** (= absolute、 半透明白背景)
 *   - **時刻順** 当日 pin enumeration (= mock 上から下、 朝→夜)
 *   - 各 row: **小カテゴリ icon** + **カテゴリ表示名** (= 「カフェ」 「ランチ」 「オフィス」 「帰宅」)
 *   - **collapse / expand** (= 下端 chevron button)
 *   - **タップで pin selected 同期** (= MapTab newSelectedPinId 経由、 sheet 連動)
 *   - **selected row 強調** (= bg + 太字)
 *   - empty (= 当日 pin 0) → null return
 *
 * 規約:
 *   - 規約 24-extended: focus-visible:border-slate-300
 *   - 絵文字 0 (= 全 SVG)
 *   - 中立文体 (= 機能ラベルのみ)
 *
 * Aneurasync 哲学:
 *   - 「観測 + 解釈」: 当日の category 分布を視覚化、 行動指示なし
 *   - 「主戦場 = sheet」: panel は補助、 タップ → sheet で意味回収
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 §4 (= left-bottom panel)
 *   - lib/plan/map/types.ts
 */

import { useState, type ComponentType, type ReactNode } from "react";

import type { EventCategory } from "@/lib/plan/list/types";
import {
  CategoryCafeIcon,
  CategoryHomeIcon,
  CategoryUnknownIcon,
  type CategoryIconProps,
} from "@/components/ui/icons/category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category styling + display name (= MapBottomSheet 同 pattern + 表示名)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_CIRCLE_BG_CLASS: Record<EventCategory, string> = {
  cafe: 'bg-indigo-500',
  meal: 'bg-orange-500',
  work: 'bg-blue-500',
  home: 'bg-emerald-500',
  other: 'bg-slate-500',
};

/**
 * カテゴリ表示名 (= mock 左下 panel の「カフェ / ランチ / オフィス / 帰宅」 整合)
 *
 * EventCategory → 日本語短表記:
 *   - cafe → 「カフェ」
 *   - meal → 「ランチ」 (= 昼食、 mock 整合。 朝食 / 夕食はまとめて「ランチ」 表記)
 *   - work → 「オフィス」 (= work_school → office、 mock 整合)
 *   - home → 「帰宅」 (= mock 整合)
 *   - other → 「その他」 (= fallback)
 */
const CATEGORY_DISPLAY_NAME: Record<EventCategory, string> = {
  cafe: 'カフェ',
  meal: 'ランチ',
  work: 'オフィス',
  home: '帰宅',
  other: 'その他',
};

/**
 * meal 専用 SVG icon (= MapBottomSheet 同実装、 小サイズ用、 inline 重複許容)
 */
function MealIcon({ className, size = 12, ariaLabel }: CategoryIconProps): ReactNode {
  const isInteractive = !!ariaLabel;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      <path d="M7 3 v6" />
      <path d="M9 3 v6" />
      <path d="M11 3 v6 a2 2 0 0 1 -2 2 h-2 a2 2 0 0 1 -2 -2 V3" />
      <path d="M9 11 v10" />
      <path d="M17 3 c2 0 3 4 3 8 h-3 v10" />
    </svg>
  );
}

/**
 * work 専用 Briefcase icon (= MapBottomSheet 同実装)
 */
function BriefcaseIcon({ className, size = 12, ariaLabel }: CategoryIconProps): ReactNode {
  const isInteractive = !!ariaLabel;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      <path d="M9 6 V4.5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V6" />
      <rect x="3.5" y="6" width="17" height="13" rx="1.5" />
      <path d="M3.5 11 H20.5" />
    </svg>
  );
}

const CATEGORY_ICON_COMPONENT: Record<EventCategory, ComponentType<CategoryIconProps>> = {
  cafe: CategoryCafeIcon,
  meal: MealIcon,
  work: BriefcaseIcon,
  home: CategoryHomeIcon,
  other: CategoryUnknownIcon,
};

/**
 * Chevron up/down SVG (= collapse/expand button、 mock 整合)
 */
function ChevronIcon({
  direction,
  className,
}: {
  direction: "up" | "down";
  className?: string;
}): ReactNode {
  const path = direction === "up" ? "M 6 14 L 12 8 L 18 14" : "M 6 10 L 12 16 L 18 10";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={true}
    >
      <path d={path} />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DayItem = {
  /** 対応 anchor id (= MapTab newSelectedPinId と同 key) */
  readonly anchorId: string;
  /** EventCategory (= icon + 色 + 表示名選択用) */
  readonly category: EventCategory;
};

export type DayItemsPanelProps = {
  /** 当日 item list (= 時刻 ascending 整列済み) */
  readonly items: ReadonlyArray<DayItem>;
  /** 現在 selected な pin id (= MapTab newSelectedPinId) */
  readonly selectedId: string | null;
  /** row tap handler (= 該 anchorId を selected 化) */
  readonly onItemTap: (anchorId: string) => void;
};

/**
 * DayItemsPanel — 左下 当日リスト / 凡例 hybrid (= Step δ first-pass)
 *
 * Layout:
 *   - absolute bottom-3 left-3 (= map div 内、 z-10)
 *   - 半透明白背景 + 角丸 + 影 + 細枠
 *   - 縦 list (= 時刻順)、 max-h で scroll
 *   - 下端 chevron button (= collapse / expand)
 *
 * 動作:
 *   - empty → null return (= 当日 pin 0 で消える)
 *   - row tap → onItemTap(anchorId) (= MapTab で setNewSelectedPinId)
 *   - selected row → 強調 (= bg + 太字)
 *   - chevron tap → collapse (= list hide、 chevron だけ残す)
 *
 * a11y:
 *   - ul / li 構造
 *   - tap target = button
 *   - chevron button aria-label
 */
export function DayItemsPanel({
  items,
  selectedId,
  onItemTap,
}: DayItemsPanelProps): ReactNode {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="plan-map-day-items-panel"
      className="absolute bottom-3 left-3 z-10 w-[140px] rounded-xl border border-slate-200 bg-white/95 shadow-md backdrop-blur"
    >
      {!collapsed && (
        <ul
          data-testid="plan-map-day-items-list"
          className="max-h-[180px] overflow-y-auto py-1.5"
        >
          {items.map((item) => {
            const Icon = CATEGORY_ICON_COMPONENT[item.category];
            const circleBg = CATEGORY_CIRCLE_BG_CLASS[item.category];
            const displayName = CATEGORY_DISPLAY_NAME[item.category];
            const isSelected = item.anchorId === selectedId;
            return (
              <li key={item.anchorId}>
                <button
                  type="button"
                  onClick={() => onItemTap(item.anchorId)}
                  aria-label={`${displayName} の予定を選択`}
                  aria-current={isSelected ? "true" : undefined}
                  data-testid={`plan-map-day-items-row-${item.anchorId}`}
                  className={
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition focus:outline-none focus-visible:bg-slate-50 focus-visible:border focus-visible:border-slate-300 " +
                    (isSelected
                      ? "bg-slate-100 font-semibold text-slate-900"
                      : "text-slate-700 hover:bg-slate-50")
                  }
                >
                  {/* 小カテゴリ icon (= 円 bg + 白抜き icon、 w-5 h-5) */}
                  <span
                    aria-hidden={true}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white ${circleBg}`}
                  >
                    <Icon className="" size={12} />
                  </span>
                  <span className="truncate">{displayName}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Collapse / expand button (= 下端 chevron) */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "当日リストを展開" : "当日リストを折りたたむ"}
        data-testid="plan-map-day-items-toggle"
        className={
          "flex w-full items-center justify-center py-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus-visible:border focus-visible:border-slate-300 " +
          (collapsed ? "" : "border-t border-slate-100")
        }
      >
        <ChevronIcon direction={collapsed ? "down" : "up"} />
      </button>
    </div>
  );
}
