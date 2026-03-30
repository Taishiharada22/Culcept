/* ─────────────────────────────────────────────
   Group A: 骨格系 比較サンプルデータ
   輪郭・目・眉 の離散候補

   EyeAnalysisClient の EYE_TYPES と同じパターン:
   { key, label, icon, desc }
   ───────────────────────────────────────────── */

import type { ComparisonCategoryId } from "@/types/face-phenotype";

export interface FaceRefOption {
  key: string;
  label: string;
  icon: string;
  desc: string;
}

export interface FaceComparisonCategory {
  id: ComparisonCategoryId;
  label: string;
  icon: string;
  options: FaceRefOption[];
}

/* ── 輪郭 ── */

const FACE_SHAPE_OPTIONS: FaceRefOption[] = [
  {
    key: "oval",
    label: "卵型",
    icon: "🥚",
    desc: "あごに向かって自然に細くなる、バランスの良い形。横幅と縦の比率が調和している",
  },
  {
    key: "round",
    label: "丸顔",
    icon: "🟡",
    desc: "横幅と縦の比率が近く、頬がふっくらとしている。全体的にやわらかい印象",
  },
  {
    key: "oblong",
    label: "面長",
    icon: "📐",
    desc: "縦の長さが横幅より目立ち、すっきりした印象。頬の張りは控えめ",
  },
  {
    key: "square",
    label: "ベース型",
    icon: "🔲",
    desc: "あごのラインがしっかりしていて、フェイスラインに角がある。頬が横に張る",
  },
  {
    key: "heart",
    label: "ハート型",
    icon: "💛",
    desc: "額やこめかみが広く、あご先に向かって細くなる。頬骨が広め",
  },
  {
    key: "inverted_triangle",
    label: "逆三角形",
    icon: "🔻",
    desc: "額が広くあごがシャープ。フェイスラインがすっきりしていてシャープな印象",
  },
];

/* ── 目の形 ── */

const EYE_SHAPE_OPTIONS: FaceRefOption[] = [
  {
    key: "armond",
    label: "アーモンド型",
    icon: "🌰",
    desc: "横幅と縦幅のバランスが良く、両端が軽く尖った目",
  },
  {
    key: "kirenaga",
    label: "切れ長",
    icon: "🍃",
    desc: "横に長く、縦幅が狭めの涼しげな目",
  },
  {
    key: "tsurime",
    label: "つり目",
    icon: "🔺",
    desc: "目尻が目頭より高い位置にある、キリッとした目",
  },
  {
    key: "tareme",
    label: "たれ目",
    icon: "🔽",
    desc: "目尻が目頭より低い位置にある穏やかな目",
  },
  {
    key: "marume",
    label: "丸目",
    icon: "⭕",
    desc: "縦幅が大きく、丸みのある可愛らしい目",
  },
  {
    key: "yanagiba",
    label: "柳葉型",
    icon: "🌿",
    desc: "細く長く、柳の葉のような優美な目",
  },
];

/* ── 眉 ── */

const BROW_SHAPE_OPTIONS: FaceRefOption[] = [
  {
    key: "straight",
    label: "ストレート",
    icon: "➖",
    desc: "直線的で落ち着いた眉。角度がほぼなくナチュラルな印象",
  },
  {
    key: "soft_arch",
    label: "やわらかアーチ",
    icon: "🌙",
    desc: "ゆるやかなカーブを描く自然な眉。やさしい印象を与える",
  },
  {
    key: "high_arch",
    label: "高めアーチ",
    icon: "⛰️",
    desc: "山が高く、立体感のある眉。華やかでメリハリのある印象",
  },
  {
    key: "round",
    label: "ラウンド",
    icon: "🌀",
    desc: "丸みのある弧を描く眉。おだやかで親しみやすい印象",
  },
  {
    key: "flat",
    label: "平行",
    icon: "〰️",
    desc: "上下のラインが平行に近い眉。モダンですっきりした印象",
  },
  {
    key: "ascending",
    label: "上がり眉",
    icon: "📈",
    desc: "眉尻に向かって上がる眉。意志の強さや凛とした印象",
  },
  {
    key: "thick_natural",
    label: "太め自然",
    icon: "🌳",
    desc: "太さがありナチュラルな眉。力強く健康的な印象",
  },
];

/* ── カテゴリ定義 ── */

export const FACE_COMPARISON_CATEGORIES: FaceComparisonCategory[] = [
  {
    id: "face_shape",
    label: "輪郭",
    icon: "🫥",
    options: FACE_SHAPE_OPTIONS,
  },
  {
    id: "eye_shape",
    label: "目の形",
    icon: "👁️",
    options: EYE_SHAPE_OPTIONS,
  },
  {
    id: "brow_shape",
    label: "眉",
    icon: "🖊️",
    options: BROW_SHAPE_OPTIONS,
  },
];

export function getCategoryById(
  id: ComparisonCategoryId,
): FaceComparisonCategory | undefined {
  return FACE_COMPARISON_CATEGORIES.find((c) => c.id === id);
}
