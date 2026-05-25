"use client";

/**
 * Phase 3-N Map impl sub-phase 9b-1 — MapSelectedPinLabel (= 選択 pin 用 HTML overlay)
 *
 * 設計原則 (= CEO + GPT 補正受領、 9a-impl carry 1 件):
 *   - **HTML overlay** (= SVG 内 embed ではない、 sheet open 時 Y を clamp 可能)
 *   - **Y clamp**: map 上部 fixed (= sheet が下から出ても **常に sheet 上端より上の可読領域**)
 *   - **selected 時のみ表示** (= sheet null なら null return)
 *   - **時刻 + title の白カードラベル** (= mock 整合、 spec v3 §4 label policy)
 *   - **pointer-events-none** (= map 操作邪魔しない、 ラベルは表示のみ)
 *   - **auto-pan は実装しない** (= CEO 補正、 fallback として 9b-1 corrective or 9b-1b で検討)
 *
 * 配置:
 *   - map div 内 absolute top-3 inset-x-* 中央寄せ (= 横方向中央、 top 固定)
 *   - z-20 (= DayItemsPanel z-10 / current location z-10 より前、 sheet z-50 より後)
 *
 * 規約:
 *   - 規約 24-extended (= focus-visible 不要 = pointer-events-none + non-interactive)
 *   - 絵文字 0 (= 純 text)
 *   - 中立文体
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-9b-readiness.md (= 9b-1 carry 範囲)
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 §4 (= label policy)
 *   - lib/plan/map/types.ts (= MapSheetViewModel 再利用)
 */

import { type ReactNode } from "react";

import type { MapSheetViewModel } from "@/lib/plan/map/types";
import type { EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category color tokens (= MapBottomSheet 同 pattern、 frozen file 不触で inline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_TIME_TEXT_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-600',
  meal: 'text-orange-600',
  work: 'text-blue-600',
  home: 'text-emerald-600',
  other: 'text-slate-600',
};

const CATEGORY_BORDER_CLASS: Record<EventCategory, string> = {
  cafe: 'border-indigo-200',
  meal: 'border-orange-200',
  work: 'border-blue-200',
  home: 'border-emerald-200',
  other: 'border-slate-200',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 9b-2: pin に水平追従 + Y clamp 用 position 計算 props
 *
 * 数値根拠 (= label box 推定 + sheet 推定):
 *   - LABEL_WIDTH_HALF = 110 (= max-w-[220px] / 2、 左右中央)
 *   - LABEL_HEIGHT ≈ 56 (= time line + title line + py-1.5*2 + border)
 *   - PIN_HEIGHT ≈ 80 (= 涙型 SVG total height 余裕)
 *   - GAP = 8 (= label と pin / sheet の距離)
 *   - TOP_PADDING = 12 (= map div 上端からの最小余白)
 *   - SHEET_HEIGHT_ESTIMATE = 320 (= 8 段構造 + CTA + safe-area 概算)
 */
const LABEL_WIDTH_HALF = 110;
const LABEL_HEIGHT = 56;
const PIN_HEIGHT = 80;
const GAP = 8;
const TOP_PADDING = 12;
const SHEET_HEIGHT_ESTIMATE = 320;

export type PinScreenPosition = {
  /** map div 内 pin 中心 X (= pixel) */
  readonly x: number;
  /** map div 内 pin 中心 Y (= pixel、 anchor = pin tip と同) */
  readonly y: number;
  /** map div 全体 width (= label 左右 clamp 用) */
  readonly mapWidth: number;
  /** map div 全体 height (= sheet top 計算用) */
  readonly mapHeight: number;
  /** sheet 表示中かどうか (= true なら sheet top で Y clamp) */
  readonly sheetVisible: boolean;
};

/**
 * label の最終 (left, top) 座標を計算 (= pure helper、 9b-2 spatial binding 算出 logic)
 *
 * Y rule (= CEO 補正準拠):
 *   1. 第一優先: pin の真上寄り (= idealY = pinY - PIN_HEIGHT - LABEL_HEIGHT - GAP)
 *   2. sheet 表示中で label が sheet と重なる場合: sheet 上端の少し上に clamp
 *   3. それでも上端を超える場合: TOP_PADDING で停止
 *
 * X rule:
 *   - label center = pin center
 *   - 左右はみ出し防止 clamp: [TOP_PADDING, mapWidth - 2*LABEL_WIDTH_HALF - TOP_PADDING]
 */
export function calculateLabelPosition(pos: PinScreenPosition): {
  readonly left: number;
  readonly top: number;
} {
  // X 計算 (= pin 真下から ± half、 左右 clamp)
  const idealLeft = pos.x - LABEL_WIDTH_HALF;
  const minLeft = TOP_PADDING;
  const maxLeft = pos.mapWidth - 2 * LABEL_WIDTH_HALF - TOP_PADDING;
  const left = Math.max(minLeft, Math.min(idealLeft, maxLeft));

  // Y 計算 (= pin 真上、 sheet clamp、 top edge 停止)
  const idealTop = pos.y - PIN_HEIGHT - LABEL_HEIGHT - GAP;
  // sheet 表示中: sheet 上端の少し上 (= sheet で label が隠れない最低 Y)
  const sheetTopY = pos.mapHeight - SHEET_HEIGHT_ESTIMATE;
  const sheetClampTop = sheetTopY - LABEL_HEIGHT - GAP;

  // 1. ideal が sheet clamp より下 (= sheet と被る) → sheet clamp 採用
  // 2. ideal が top edge より上 → TOP_PADDING で停止
  // 3. それ以外 → ideal 採用
  let top: number;
  if (pos.sheetVisible && idealTop > sheetClampTop) {
    top = sheetClampTop;
  } else {
    top = idealTop;
  }
  top = Math.max(top, TOP_PADDING);

  return { left, top };
}

export type MapSelectedPinLabelProps = {
  /** 選択 pin の sheet view model (= null なら overlay 非表示) */
  readonly sheet: MapSheetViewModel | null;
  /**
   * 9b-2: pin screen position (= 動的追従用、 null なら top-center fallback)
   *   undefined / null = 旧 top-center 配置 (= fallback、 map projection 取れない時)
   *   set = pin 真上寄り + Y clamp で sheet 不干渉
   */
  readonly pinPosition?: PinScreenPosition | null;
};

/**
 * MapSelectedPinLabel — selected pin の title + 時刻 を白カードで overlay 表示
 *
 * 表示条件:
 *   - sheet === null → null return
 *   - sheet !== null → 動的 position (= pinPosition set 時) or top-center (= fallback)
 *
 * Layout:
 *   - pinPosition set: absolute style="left: X, top: Y" (= pin 真上寄り + Y clamp)
 *   - pinPosition null: absolute top-3 left-1/2 -translate-x-1/2 (= 旧 top-center fallback)
 *
 * a11y: 既存維持 (= role=status / aria-label / pointer-events-none)
 */
export function MapSelectedPinLabel({ sheet, pinPosition }: MapSelectedPinLabelProps): ReactNode {
  if (!sheet) return null;

  const timeColor = CATEGORY_TIME_TEXT_CLASS[sheet.category];
  const borderColor = CATEGORY_BORDER_CLASS[sheet.category];

  // 9b-2: pinPosition があれば計算、 なければ top-center fallback
  const hasPosition = pinPosition !== undefined && pinPosition !== null;
  const calcPos = hasPosition ? calculateLabelPosition(pinPosition!) : null;

  const positionStyle = calcPos
    ? { left: `${calcPos.left}px`, top: `${calcPos.top}px` }
    : undefined;
  const positionClass = calcPos
    ? "absolute z-20 pointer-events-none rounded-xl border bg-white px-3 py-1.5 shadow-lg max-w-[220px] " +
      borderColor
    : "pointer-events-none absolute left-1/2 top-3 z-20 max-w-[220px] -translate-x-1/2 rounded-xl border bg-white px-3 py-1.5 shadow-lg " +
      borderColor;

  return (
    <div
      role="status"
      aria-label={`選択中: ${sheet.title}`}
      data-testid="plan-map-selected-pin-label"
      className={positionClass}
      {...(positionStyle ? { style: positionStyle } : {})}
    >
      <p
        data-testid="plan-map-selected-pin-label-time"
        className={`text-center text-xs font-semibold tabular-nums ${timeColor}`}
      >
        {sheet.timeRange}
      </p>
      <p
        data-testid="plan-map-selected-pin-label-title"
        className="truncate text-center text-sm font-bold text-slate-900"
      >
        {sheet.title}
      </p>
    </div>
  );
}
