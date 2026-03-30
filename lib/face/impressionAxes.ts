/* ─────────────────────────────────────────────
   Group B: 印象パーツ系 — 鼻・口元
   + 顔全体の印象軸

   各軸は bipolar (-1 ~ +1)
   ───────────────────────────────────────────── */

export interface ImpressionAxis {
  id: string;
  label: string;
  leftLabel: string; // -1 side
  rightLabel: string; // +1 side
  leftIcon: string;
  rightIcon: string;
}

/* ── 鼻の印象 ── */

export const NOSE_AXES: ImpressionAxis[] = [
  {
    id: "height",
    label: "高さ",
    leftLabel: "低め",
    rightLabel: "高め",
    leftIcon: "⬇️",
    rightIcon: "⬆️",
  },
  {
    id: "sharpness",
    label: "シャープさ",
    leftLabel: "丸め",
    rightLabel: "シャープ",
    leftIcon: "🟠",
    rightIcon: "🔷",
  },
  {
    id: "presence",
    label: "存在感",
    leftLabel: "ナチュラル",
    rightLabel: "存在感あり",
    leftIcon: "🌿",
    rightIcon: "✨",
  },
];

/* ── 口元の印象 ── */

export const MOUTH_AXES: ImpressionAxis[] = [
  {
    id: "thickness",
    label: "厚さ",
    leftLabel: "薄め",
    rightLabel: "ふっくら",
    leftIcon: "➖",
    rightIcon: "💋",
  },
  {
    id: "corner",
    label: "口角",
    leftLabel: "下がり気味",
    rightLabel: "上がり気味",
    leftIcon: "🔽",
    rightIcon: "🔼",
  },
  {
    id: "softness",
    label: "柔らかさ",
    leftLabel: "シャープ",
    rightLabel: "柔らかい",
    leftIcon: "🔷",
    rightIcon: "☁️",
  },
];

/* ── 顔全体の印象 ── */

export const FACE_IMPRESSION_AXES: ImpressionAxis[] = [
  {
    id: "warm_cool",
    label: "温度感",
    leftLabel: "クール",
    rightLabel: "ウォーム",
    leftIcon: "❄️",
    rightIcon: "🔥",
  },
  {
    id: "soft_sharp",
    label: "質感",
    leftLabel: "シャープ",
    rightLabel: "ソフト",
    leftIcon: "🔷",
    rightIcon: "☁️",
  },
  {
    id: "mature_youthful",
    label: "年齢感",
    leftLabel: "若々しい",
    rightLabel: "大人っぽい",
    leftIcon: "🌱",
    rightIcon: "🌳",
  },
  {
    id: "cute_cool",
    label: "印象タイプ",
    leftLabel: "クール",
    rightLabel: "キュート",
    leftIcon: "💎",
    rightIcon: "🎀",
  },
  {
    id: "friendly_mysterious",
    label: "雰囲気",
    leftLabel: "ミステリアス",
    rightLabel: "親しみやすい",
    leftIcon: "🌙",
    rightIcon: "☀️",
  },
];
