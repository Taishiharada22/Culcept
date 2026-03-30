// Residue Board — 残留カテゴリ・プリセットデータ

import type { ResidueCategory } from "./workspaceTypes";

/* ─── 残留カテゴリカード ─── */

export type ResidueCategoryCardDef = {
  id: ResidueCategory;
  label: string;
  icon: string;
  description: string;
};

export const RESIDUE_CATEGORY_CARDS: ResidueCategoryCardDef[] = [
  { id: "behavioral_pattern", label: "行動パターン", icon: "🔁", description: "無意識に繰り返す動き方" },
  { id: "interpersonal_habit", label: "対人の癖", icon: "👥", description: "人と関わるときの傾向" },
  { id: "pride", label: "誇り", icon: "👑", description: "自分の中で大切にしていること" },
  { id: "wound", label: "傷", icon: "💔", description: "今も痛みが残る経験" },
  { id: "weapon", label: "武器", icon: "⚔️", description: "身につけた強さや技" },
  { id: "defense", label: "守り方", icon: "🛡️", description: "自分を守るために覚えたこと" },
  { id: "still_seeking", label: "まだ探しているもの", icon: "🔍", description: "今も求め続けていること" },
];

/* ─── プリセットラベル（カテゴリ別） ─── */

export const RESIDUE_PRESET_LABELS: Record<ResidueCategory, string[]> = {
  behavioral_pattern: [
    "先に周囲を見てから動く",
    "役割を果たして安心する",
    "一人で抱える",
    "先回りする",
    "完璧を目指す",
    "自分を少し抑える",
    "石橋を叩いて渡る",
    "すぐに行動する",
  ],
  interpersonal_habit: [
    "空気を読む",
    "相手に合わせる",
    "明るく振る舞う",
    "距離を置く",
    "頼られると断れない",
    "本音を言いにくい",
    "世話を焼く",
    "自分から声をかけにくい",
  ],
  pride: [
    "責任感",
    "粘り強さ",
    "気配りができること",
    "独立心",
    "論理的に考えられること",
    "共感力",
    "柔軟さ",
    "正直さ",
  ],
  wound: [
    "認められなかった記憶",
    "裏切られた経験",
    "挫折の記憶",
    "孤立した感覚",
    "否定された経験",
    "比較された記憶",
    "期待に応えられなかった",
    "自分を出せなかった",
  ],
  weapon: [
    "観察力",
    "適応力",
    "忍耐力",
    "表現力",
    "分析力",
    "行動力",
    "傾聴力",
    "集中力",
  ],
  defense: [
    "感情を出さない",
    "逃げ道を用意する",
    "笑って流す",
    "理論武装する",
    "期待しない",
    "深入りしない",
    "完璧に準備する",
    "受け流す",
  ],
  still_seeking: [
    "本当の居場所",
    "自分らしさ",
    "心から信頼できる人",
    "情熱を感じるもの",
    "安心感",
    "自由",
    "認められること",
    "自己表現の場",
  ],
};

/* ─── 強度カード ─── */

export type IntensityCardDef = {
  id: "strong" | "moderate" | "faint";
  label: string;
  icon: string;
};

export const INTENSITY_CARDS: IntensityCardDef[] = [
  { id: "strong", label: "強く残っている", icon: "🔥" },
  { id: "moderate", label: "時々感じる", icon: "🌊" },
  { id: "faint", label: "かすかに残っている", icon: "🌿" },
];

/* ─── ラベル取得ヘルパー ─── */

export function getResidueCategoryLabel(id: ResidueCategory): string {
  return RESIDUE_CATEGORY_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getIntensityLabel(id: string): string {
  return INTENSITY_CARDS.find((c) => c.id === id)?.label ?? id;
}
