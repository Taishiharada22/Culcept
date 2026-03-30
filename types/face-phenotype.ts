/* ─────────────────────────────────────────────
   Face Phenotype Types
   顔まわり判定の型定義

   3グループ構成:
     A. 骨格系 (比較型) — 輪郭・目・眉
     B. 印象パーツ系 (軸スライダー型) — 鼻・口元
     C. 独立モジュール (組み合わせ型) — ヘア → HairRecipe (lib/hair/hairOptions.ts)
   ───────────────────────────────────────────── */

/* ── Group A: 比較型カテゴリ (discrete selection) ── */

export type FaceShapeKey =
  | "oval"
  | "round"
  | "oblong"
  | "square"
  | "heart"
  | "inverted_triangle";

export type EyeShapeKey =
  | "armond"
  | "kirenaga"
  | "tsurime"
  | "tareme"
  | "marume"
  | "yanagiba";

export type BrowShapeKey =
  | "straight"
  | "soft_arch"
  | "high_arch"
  | "round"
  | "flat"
  | "ascending"
  | "thick_natural";

export interface CategorySelection {
  primary: string;
  runner_up?: string;
}

/* ── Group B: 印象軸 (bipolar -1 ~ +1) ── */

export interface NoseImpression {
  height: number; // -1 低め ↔ +1 高め
  sharpness: number; // -1 丸め ↔ +1 シャープ
  presence: number; // -1 ナチュラル ↔ +1 存在感あり
}

export interface MouthImpression {
  thickness: number; // -1 薄め ↔ +1 ふっくら
  corner: number; // -1 下がり気味 ↔ +1 上がり気味
  softness: number; // -1 シャープ ↔ +1 柔らかい
}

/* ── 顔全体の印象軸 ── */

export interface FaceImpressionScores {
  warm_cool: number; // -1 cool ↔ +1 warm
  soft_sharp: number; // -1 sharp ↔ +1 soft
  mature_youthful: number; // -1 youthful ↔ +1 mature
  cute_cool: number; // -1 cool ↔ +1 cute
  friendly_mysterious: number; // -1 mysterious ↔ +1 friendly
}

/* ── 統合プロファイル ── */

export interface FacePhenotypeData {
  // Group A: 骨格系
  face_shape?: CategorySelection;
  eye_shape?: CategorySelection;
  brow_shape?: CategorySelection;
  // Group B: 印象パーツ系
  nose_impression?: NoseImpression;
  mouth_impression?: MouthImpression;
  // Group C: ヘア → HairRecipe (lib/hair/hairOptions.ts) via localStorage
  // 顔全体
  face_impression?: FaceImpressionScores;
}

export type ComparisonCategoryId = "face_shape" | "eye_shape" | "brow_shape";
export type ImpressionCategoryId = "nose" | "mouth";
export type SectionId = "skeletal" | "impression" | "hair" | "overall";
