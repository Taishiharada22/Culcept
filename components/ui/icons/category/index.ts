/**
 * Aneurasync Category Icon System — barrel export (Phase 2-I)
 *
 * 設計書: docs/alter-plan-phase2-i-category-icon-system-mini-design.md
 *
 * 全 9 icon component を 1 つの import path で利用可能に。
 * 例:
 *   import { CategoryHomeIcon, CategorySensitiveIcon } from "@/components/ui/icons/category";
 */

export { CategoryHomeIcon } from "./CategoryHomeIcon";
export { CategoryOfficeIcon } from "./CategoryOfficeIcon";
export { CategorySchoolIcon } from "./CategorySchoolIcon";
export { CategoryCafeIcon } from "./CategoryCafeIcon";
export { CategoryOutdoorIcon } from "./CategoryOutdoorIcon";
export { CategoryPublicIcon } from "./CategoryPublicIcon";
export { CategoryTransitIcon } from "./CategoryTransitIcon";
export { CategoryUnknownIcon } from "./CategoryUnknownIcon";
export { CategorySensitiveIcon } from "./CategorySensitiveIcon";

export type { CategoryIconProps } from "./types";
