/**
 * Capture Guides (C1L-3) — カテゴリ別 撮影ガイド config（pure・UI 非依存）
 *
 * 目的:
 *   - 背景除去（Cutout v1）が成功しやすい写真をユーザーに撮らせるための撮影ガイド。
 *   - 点線枠は **crop ではなく撮影補助 / segmentation prior**。 枠外を機械的に背景化はしない
 *     （袖・裾・バッグの持ち手・靴の空洞で破綻するため）。
 *
 * 設計:
 *   - frame は **正規化座標（0..1）**。 C1L-4 で `computeCutoutV1({ frame })` の prior にそのまま渡せる。
 *   - 本モジュールは config + getter のみ。 computeCutoutV1 / 撮影 / 保存には接続しない（C1L-3）。
 */

import type { CategoryMain } from "./taxonomy";

/** 正規化矩形（0..1）。 computeCutoutV1 の CutoutFrame と互換（x/y/width/height）。 */
export interface CaptureGuideFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GuideAspect = "portrait" | "landscape" | "square";

export interface CaptureGuide {
  /** ガイドのキー（カテゴリ or "general"）。 */
  key: CategoryMain | "general";
  label: string;
  frame: CaptureGuideFrame;
  aspect: GuideAspect;
  instructions: string[];
}

/** 全ガイド共通の基本指示（短く）。 */
const BASE_INSTRUCTIONS: readonly string[] = [
  "アイテム全体を枠の中に入れてください",
  "白い壁・床・無地の布など、無地の背景がおすすめです",
  "強い影・ハンガー・手の写り込みは避けてください",
];

function aspectOf(frame: CaptureGuideFrame): GuideAspect {
  const ratio = frame.width / frame.height;
  if (ratio > 1.1) return "landscape";
  if (ratio < 0.9) return "portrait";
  return "square";
}

/** カテゴリ別の枠 + 追加指示（基本指示に 1 行足す）。 */
const GUIDE_DEFS: Record<
  CategoryMain | "general",
  { label: string; frame: CaptureGuideFrame; extra?: string }
> = {
  // 上半身: 縦長・肩幅広め
  outer: { label: "アウター", frame: { x: 0.16, y: 0.07, width: 0.68, height: 0.86 }, extra: "肩のラインまで枠に収めてください" },
  tops: { label: "トップス", frame: { x: 0.16, y: 0.07, width: 0.68, height: 0.86 }, extra: "肩のラインまで枠に収めてください" },
  // 細長い縦枠
  bottoms: { label: "ボトムス", frame: { x: 0.30, y: 0.07, width: 0.40, height: 0.86 }, extra: "裾まで真っ直ぐ入るように置いてください" },
  // 横長・低め
  shoes: { label: "シューズ", frame: { x: 0.10, y: 0.36, width: 0.80, height: 0.28 }, extra: "床に置いて、 やや上から撮ると綺麗に抜けます" },
  // 正方形〜縦長の小物枠
  bag: { label: "バッグ", frame: { x: 0.24, y: 0.14, width: 0.52, height: 0.66 }, extra: "持ち手まで枠に収めてください" },
  // 小さめ中央
  accessory: { label: "アクセサリー", frame: { x: 0.33, y: 0.30, width: 0.34, height: 0.40 }, extra: "中央に大きめに写してください" },
  // other は汎用扱い
  other: { label: "アイテム", frame: { x: 0.14, y: 0.10, width: 0.72, height: 0.80 } },
  // カテゴリ未確定時の汎用中央枠
  general: { label: "アイテム", frame: { x: 0.14, y: 0.10, width: 0.72, height: 0.80 } },
};

function buildGuide(key: CategoryMain | "general"): CaptureGuide {
  const def = GUIDE_DEFS[key];
  const instructions = def.extra ? [...BASE_INSTRUCTIONS, def.extra] : [...BASE_INSTRUCTIONS];
  return {
    key,
    label: def.label,
    frame: def.frame,
    aspect: aspectOf(def.frame),
    instructions,
  };
}

/**
 * カテゴリに対応する撮影ガイドを返す。
 * 未確定 / "other" / 未知 → general にフォールバック。
 */
export function getCaptureGuide(category?: CategoryMain | null): CaptureGuide {
  if (category && category !== "other" && category in GUIDE_DEFS) {
    return buildGuide(category);
  }
  if (category === "other") return buildGuide("general");
  return buildGuide("general");
}
