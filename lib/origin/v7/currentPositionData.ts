/**
 * 現在地点ステップのデータ定義
 * Origin の入口で「今の自分」を軽く置くための選択肢群
 */

/* ─── A. 今に残るもの ─── */

export type RemainItem = { id: string; label: string; icon: string };

export const REMAIN_ITEMS: RemainItem[] = [
  { id: "caution", label: "慎重さ", icon: "🛡️" },
  { id: "confidence_memory", label: "自信の記憶", icon: "💎" },
  { id: "challenge", label: "挑戦する姿勢", icon: "🔥" },
  { id: "curiosity", label: "探求心", icon: "🔍" },
  { id: "support", label: "支える姿勢", icon: "🤲" },
  { id: "carry_alone", label: "一人で抱える癖", icon: "🎒" },
  { id: "deep_trust", label: "深い信頼を求める感覚", icon: "🤝" },
  { id: "observe", label: "周りをよく見る癖", icon: "👁️" },
  { id: "independence", label: "自立心", icon: "🚀" },
  { id: "adaptability", label: "変化への強さ", icon: "🌊" },
  { id: "kindness", label: "優しさ", icon: "🌿" },
  { id: "vigilance", label: "警戒心", icon: "⚡" },
];

/* ─── B. 今探しているもの ─── */

export type SeekingItem = { id: string; label: string; icon: string };

export const SEEKING_ITEMS: SeekingItem[] = [
  { id: "safe_place", label: "安心できる居場所", icon: "🏠" },
  { id: "passion", label: "本気で打ち込めるもの", icon: "🔥" },
  { id: "next_challenge", label: "次の挑戦", icon: "⛰️" },
  { id: "own_axis", label: "自分の軸", icon: "🧭" },
  { id: "understanding_person", label: "理解してくれる人", icon: "👤" },
  { id: "unnamed", label: "まだ言葉にならない何か", icon: "✨" },
  { id: "calm_relation", label: "落ち着ける関係", icon: "☕" },
  { id: "authentic_place", label: "自分らしくいられる場所", icon: "🌈" },
];

/* ─── C. 今と昔の差分 ─── */

export type DifferenceItem = { id: string; label: string; icon: string };

export const DIFFERENCE_ITEMS: DifferenceItem[] = [
  { id: "now_cautious", label: "今の方が慎重", icon: "🛡️" },
  { id: "now_calm", label: "今の方が落ち着いている", icon: "🍃" },
  { id: "now_supporter", label: "今の方が人を支える側に回りやすい", icon: "🤲" },
  { id: "then_passionate", label: "昔の方が熱かった", icon: "🔥" },
  { id: "then_honest", label: "昔の方が素直だった", icon: "💬" },
  { id: "then_sensitive", label: "昔の方が周りに敏感だった", icon: "📡" },
  { id: "then_innocent", label: "昔の方が無邪気だった", icon: "🌱" },
  { id: "then_confident", label: "昔の方が自信があった", icon: "💎" },
  { id: "then_emotional", label: "昔の方が感情が表に出ていた", icon: "🌊" },
];

/* ─── おすすめ探索導線のマッピング ─── */

export type ExplorationEntry =
  | "perspective"
  | "comparison"
  | "place"
  | "thing"
  | "person"
  | "atmosphere";

/**
 * 現在地点の回答からおすすめ探索導線を推定する
 * remains と seeking を見て、最も関連の高い入口を返す
 */
export function inferRecommendedEntry(
  remains: string[],
  seeking: string[],
): ExplorationEntry {
  // 人間関係系
  if (
    remains.includes("deep_trust") ||
    remains.includes("support") ||
    seeking.includes("understanding_person") ||
    seeking.includes("calm_relation")
  ) {
    return "person";
  }
  // 自己比較系
  if (
    remains.includes("caution") ||
    remains.includes("vigilance") ||
    seeking.includes("own_axis")
  ) {
    return "comparison";
  }
  // 探求・挑戦系
  if (
    remains.includes("curiosity") ||
    remains.includes("challenge") ||
    seeking.includes("next_challenge") ||
    seeking.includes("passion")
  ) {
    return "place";
  }
  // 内省系
  if (
    remains.includes("carry_alone") ||
    remains.includes("observe") ||
    seeking.includes("unnamed")
  ) {
    return "atmosphere";
  }
  // 居場所系
  if (
    seeking.includes("safe_place") ||
    seeking.includes("authentic_place")
  ) {
    return "place";
  }
  // default
  return "comparison";
}

/** おすすめ入口のラベルとガイド文 */
export const ENTRY_META: Record<
  ExplorationEntry,
  { icon: string; label: string; guide: string }
> = {
  perspective: {
    icon: "👥",
    label: "他人の視点から辿る",
    guide: "周りの目を手がかりに、過去のプロフィールを辿れそうです",
  },
  comparison: {
    icon: "🔄",
    label: "今との差から探る",
    guide: "今の自分との違いから、過去の断片が見えてきそうです",
  },
  place: {
    icon: "📍",
    label: "場所の記憶を開く",
    guide: "場所に宿る記憶から、その頃の自分が浮かびそうです",
  },
  thing: {
    icon: "🎒",
    label: "物の記憶を開く",
    guide: "物に紐づく記憶は、意外と鮮明に残っています",
  },
  person: {
    icon: "🤝",
    label: "人間関係から探る",
    guide: "誰の前にいた自分かを辿ると、プロフィールが見えてきそうです",
  },
  atmosphere: {
    icon: "🌡️",
    label: "空気感から辿る",
    guide: "あの頃の空気感から、記憶の温度を辿れそうです",
  },
};

/** 現在地点の回答から接続文（ブリッジテキスト）を生成 */
export function generateBridgeText(
  remains: string[],
  seeking: string[],
): string {
  const remainLabels = remains
    .map((id) => REMAIN_ITEMS.find((r) => r.id === id)?.label)
    .filter(Boolean)
    .slice(0, 2);

  const seekLabel = seeking
    .map((id) => SEEKING_ITEMS.find((s) => s.id === id)?.label)
    .filter(Boolean)[0];

  const parts: string[] = [];

  if (remainLabels.length > 0) {
    parts.push(
      `今のあなたには「${remainLabels.join("」と「")}」が残っています。`,
    );
  }

  if (seekLabel) {
    parts.push(
      `そして今、「${seekLabel}」を探しているようです。`,
    );
  }

  parts.push(
    "このプロフィールをつくった断片を、少しずつ探してみましょう。",
  );

  return parts.join("\n");
}
