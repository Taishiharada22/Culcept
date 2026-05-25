/**
 * Phase 2-I 拡張: Category color (Tailwind className) mapping
 *
 * 各 LocationCategory に **subtle accent color** を割当 (= monochrome から脱却)。
 * Brand icon との対比で「色なしの一般 category」 → 「色付きの主張ある category」 へ。
 *
 * 設計思想:
 *   - Aneurasync 「観測の入口」 「強制しない」 思想を守る (= 警告色 amber/red 強用しない、 saturate 抑える)
 *   - Phase 2-E / 2-F で確立した警告色禁止を踏襲、 ただし category 識別性は確保
 *   - currentColor 継承の icon component には className で text-color を渡す形
 */

import type { LocationCategory } from "@/lib/plan/location-category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Category 別 text-color Tailwind class。
 *
 * 配色 (= Aneurasync 思想整合):
 *   - home:     amber 暖色   (= 「聖域」 = 温かみ)
 *   - office:   indigo       (= プロフェッショナル、 落ち着き)
 *   - school:   blue         (= 学術的、 集中)
 *   - cafe:     amber-800    (= 深いコーヒー色、 温かみ)
 *   - outdoor:  emerald      (= 自然 / green、 開放感)
 *   - public:   violet       (= 文化施設、 格式)
 *   - transit:  slate        (= ニュートラル、 通過)
 *   - unknown:  slate-400    (= 抑えた、 未分類)
 *
 * 注:
 *   - 「警告色」 (= amber-saturate-strong / red) は使わない
 *   - sensitive 用 color はないが、 呼出側で sensitive 優先 + slate で統一
 */
export const CATEGORY_COLOR_CLASS: Record<LocationCategory, string> = {
  home: "text-amber-700",
  office: "text-indigo-600",
  school: "text-blue-600",
  cafe: "text-amber-800",
  outdoor: "text-emerald-600",
  public: "text-violet-600",
  transit: "text-slate-500",
  unknown: "text-slate-400",
};

/**
 * Category color を class として取得。
 * "none" / undefined / 不明は slate-400 (= unknown 同等)。
 * sensitive=true 時は slate-500 (= 抑えた、 内容秘匿 priority)。
 */
export function pickCategoryColorClass(args: {
  category?: LocationCategory | "none";
  sensitive?: boolean;
}): string {
  if (args.sensitive) return "text-slate-500";
  if (!args.category || args.category === "none") {
    return CATEGORY_COLOR_CLASS.unknown;
  }
  return CATEGORY_COLOR_CLASS[args.category];
}
