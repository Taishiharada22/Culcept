/**
 * Phase 2-I: Category Icon Map — anchor から表示すべき icon component を選ぶ pure helper
 *
 * 設計書: docs/alter-plan-phase2-i-category-icon-system-mini-design.md §3.3
 *
 * 役割:
 *   anchor.locationCategory + sensitiveCategory 状態から、 表示すべき
 *   SVG icon component を返す。 sensitive anchor は **常に** CategorySensitiveIcon に
 *   置換され、 内容を露出しない (= privacy 優先)。
 *
 * 不変原則 (Aneurasync 思想 + 既存仕様):
 *   - sensitive 優先 (= category 値に関わらず privacy 配慮)
 *   - category undefined / 不明 → CategoryUnknownIcon (= fallback)
 *   - pure (= input mutate なし、 deterministic)
 *   - LocationCategory enum 不変 (= 8 値、 既存 schema 完全互換)
 */

import * as React from "react";

import type { LocationCategory } from "@/lib/plan/location-category";
import {
  CategoryHomeIcon,
  CategoryOfficeIcon,
  CategorySchoolIcon,
  CategoryCafeIcon,
  CategoryOutdoorIcon,
  CategoryPublicIcon,
  CategoryTransitIcon,
  CategoryUnknownIcon,
  CategorySensitiveIcon,
  type CategoryIconProps,
} from "@/components/ui/icons/category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LocationCategory → Icon component の mapping (8 値完全 cover)。
 */
export const CATEGORY_ICON_MAP: Record<
  LocationCategory,
  React.ComponentType<CategoryIconProps>
> = {
  home: CategoryHomeIcon,
  office: CategoryOfficeIcon,
  school: CategorySchoolIcon,
  cafe: CategoryCafeIcon,
  outdoor: CategoryOutdoorIcon,
  public: CategoryPublicIcon,
  transit: CategoryTransitIcon,
  unknown: CategoryUnknownIcon,
};

/**
 * Sensitive anchor 専用 icon (= LocationCategory に依らず、 privacy 配慮)。
 */
export const SENSITIVE_CATEGORY_ICON = CategorySensitiveIcon;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * anchor から表示すべき icon component を選ぶ。
 *
 * 優先順位:
 *   1. sensitive=true → CategorySensitiveIcon (= privacy 優先、 category 無視)
 *   2. category=valid → CATEGORY_ICON_MAP[category]
 *   3. category=undefined / 不明 → CategoryUnknownIcon (= fallback)
 *
 * @param args.category locationCategory (= 既存 anchor.locationCategory)
 * @param args.sensitive sensitive anchor か (= !!anchor.sensitiveCategory)
 * @returns React component (= JSX で render 可能)
 */
export function pickCategoryIcon(args: {
  category?: LocationCategory;
  sensitive?: boolean;
}): React.ComponentType<CategoryIconProps> {
  if (args.sensitive) return SENSITIVE_CATEGORY_ICON;
  const cat = args.category ?? "unknown";
  return CATEGORY_ICON_MAP[cat];
}
