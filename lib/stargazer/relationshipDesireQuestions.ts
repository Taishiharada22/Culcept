import "server-only";

import type { RendezvousCategory } from "@/lib/rendezvous/types";

// ============================================================
// カテゴリ別「相手に求めるもの」質問セット
// 回答 → rendezvous_ideal_partner_profiles に反映
// ============================================================

export type RelationshipQualityKey =
  | "intimacy"       // 親密さ
  | "excitement"     // ドキドキ/刺激
  | "independence"   // 自立度
  | "depth"          // 深さ
  | "playfulness"    // 遊び心
  | "growth";        // 成長

export type DesireQuestion = {
  id: string;
  prompt: string;
  options: {
    label: string;
    /** 各 relationship_quality への寄与 */
    qualityMapping: Partial<Record<RelationshipQualityKey, number>>;
  }[];
  category: RendezvousCategory | "all";
};

export const RELATIONSHIP_QUALITY_LABELS: Record<RelationshipQualityKey, { ja: string; description: string }> = {
  intimacy: { ja: "親密さ", description: "心を開ける近さ" },
  excitement: { ja: "ドキドキ", description: "予想外の刺激" },
  independence: { ja: "自立", description: "お互いの自由" },
  depth: { ja: "深さ", description: "深い理解と対話" },
  playfulness: { ja: "遊び心", description: "一緒にふざけ合える" },
  growth: { ja: "成長", description: "一緒に変わっていける" },
};

/**
 * カテゴリ別の質問セット
 */
export const DESIRE_QUESTIONS: DesireQuestion[] = [
  // ── 全カテゴリ共通 ──
  {
    id: "desire_core_1",
    prompt: "この関係で一番大切にしたいことは？",
    category: "all",
    options: [
      { label: "安心して本音を言える", qualityMapping: { intimacy: 0.8, depth: 0.6 } },
      { label: "一緒にいてワクワクする", qualityMapping: { excitement: 0.8, playfulness: 0.5 } },
      { label: "お互い干渉しすぎない", qualityMapping: { independence: 0.9 } },
      { label: "一緒に成長できる", qualityMapping: { growth: 0.8, depth: 0.4 } },
    ],
  },
  {
    id: "desire_core_2",
    prompt: "理想の距離感は？",
    category: "all",
    options: [
      { label: "毎日連絡取りたい", qualityMapping: { intimacy: 0.9, independence: -0.3 } },
      { label: "週に数回で十分", qualityMapping: { independence: 0.5, intimacy: 0.3 } },
      { label: "必要な時だけ", qualityMapping: { independence: 0.9, intimacy: -0.2 } },
      { label: "気分による", qualityMapping: { playfulness: 0.4, independence: 0.3 } },
    ],
  },

  // ── 恋愛 ──
  {
    id: "desire_romantic_1",
    prompt: "恋人に一番求めるのは？",
    category: "romantic",
    options: [
      { label: "ドキドキが続くこと", qualityMapping: { excitement: 0.9, playfulness: 0.4 } },
      { label: "深く理解し合えること", qualityMapping: { depth: 0.9, intimacy: 0.6 } },
      { label: "一緒にいて安心すること", qualityMapping: { intimacy: 0.8, independence: -0.1 } },
      { label: "お互いを高め合えること", qualityMapping: { growth: 0.9, depth: 0.3 } },
    ],
  },
  {
    id: "desire_romantic_2",
    prompt: "恋人との会話で好きなのは？",
    category: "romantic",
    options: [
      { label: "くだらないことで笑い合える", qualityMapping: { playfulness: 0.9, intimacy: 0.3 } },
      { label: "お互いの考えを深く話す", qualityMapping: { depth: 0.8, growth: 0.4 } },
      { label: "将来のことを語り合う", qualityMapping: { growth: 0.7, depth: 0.5 } },
      { label: "沈黙が心地いい", qualityMapping: { intimacy: 0.6, independence: 0.4 } },
    ],
  },

  // ── 友情 ──
  {
    id: "desire_friendship_1",
    prompt: "友達に一番求めるのは？",
    category: "friendship",
    options: [
      { label: "何でも話せる信頼", qualityMapping: { intimacy: 0.9, depth: 0.5 } },
      { label: "一緒にいて楽しい", qualityMapping: { playfulness: 0.9, excitement: 0.4 } },
      { label: "困ったとき頼れる", qualityMapping: { depth: 0.6, intimacy: 0.5 } },
      { label: "刺激をくれる", qualityMapping: { excitement: 0.8, growth: 0.5 } },
    ],
  },
  {
    id: "desire_friendship_2",
    prompt: "友達との理想の過ごし方は？",
    category: "friendship",
    options: [
      { label: "一緒に新しいことに挑戦", qualityMapping: { excitement: 0.7, growth: 0.6 } },
      { label: "カフェでだらだら話す", qualityMapping: { intimacy: 0.5, playfulness: 0.4 } },
      { label: "たまに会って濃い時間を", qualityMapping: { depth: 0.7, independence: 0.5 } },
      { label: "それぞれの活動を報告し合う", qualityMapping: { independence: 0.7, growth: 0.3 } },
    ],
  },

  // ── 共創/ビジネス ──
  {
    id: "desire_cocreation_1",
    prompt: "ビジネスパートナーに求めるのは？",
    category: "cocreation",
    options: [
      { label: "実行力とスピード", qualityMapping: { independence: 0.6, growth: 0.5 } },
      { label: "アイデアの化学反応", qualityMapping: { excitement: 0.8, playfulness: 0.4 } },
      { label: "信頼と安定した関係", qualityMapping: { depth: 0.5, intimacy: 0.4 } },
      { label: "ドライでプロフェッショナル", qualityMapping: { independence: 0.9, intimacy: -0.3 } },
    ],
  },

  // ── コミュニティ ──
  {
    id: "desire_community_1",
    prompt: "コミュニティに求めるのは？",
    category: "community",
    options: [
      { label: "居場所感・安心感", qualityMapping: { intimacy: 0.7, depth: 0.3 } },
      { label: "刺激的な出会い", qualityMapping: { excitement: 0.8, growth: 0.4 } },
      { label: "緩やかなつながり", qualityMapping: { independence: 0.8, playfulness: 0.3 } },
      { label: "目標に向かう仲間意識", qualityMapping: { growth: 0.8, depth: 0.5 } },
    ],
  },

  // ── パートナー ──
  {
    id: "desire_partner_1",
    prompt: "パートナーとの関係で重視するのは？",
    category: "partner",
    options: [
      { label: "深い信頼と安心", qualityMapping: { intimacy: 0.9, depth: 0.6 } },
      { label: "お互いの成長を支える", qualityMapping: { growth: 0.9, independence: 0.3 } },
      { label: "一緒にいて自然体でいられる", qualityMapping: { intimacy: 0.5, independence: 0.5, playfulness: 0.3 } },
      { label: "人生を一緒に楽しめる", qualityMapping: { excitement: 0.6, playfulness: 0.7 } },
    ],
  },
];

/**
 * カテゴリに適した質問セットを返す
 */
export function getQuestionsForCategory(
  category: RendezvousCategory,
): DesireQuestion[] {
  return DESIRE_QUESTIONS.filter(
    (q) => q.category === "all" || q.category === category,
  );
}

/**
 * 回答セットから relationship_qualities を算出
 */
export function computeRelationshipQualities(
  answers: { questionId: string; selectedIndex: number }[],
): Record<RelationshipQualityKey, number> {
  const totals: Record<RelationshipQualityKey, { sum: number; count: number }> = {
    intimacy: { sum: 0, count: 0 },
    excitement: { sum: 0, count: 0 },
    independence: { sum: 0, count: 0 },
    depth: { sum: 0, count: 0 },
    playfulness: { sum: 0, count: 0 },
    growth: { sum: 0, count: 0 },
  };

  for (const answer of answers) {
    const question = DESIRE_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question || !question.options[answer.selectedIndex]) continue;

    const mapping = question.options[answer.selectedIndex].qualityMapping;
    for (const [key, value] of Object.entries(mapping)) {
      const k = key as RelationshipQualityKey;
      totals[k].sum += value;
      totals[k].count++;
    }
  }

  const result: Record<RelationshipQualityKey, number> = {
    intimacy: 0.5,
    excitement: 0.5,
    independence: 0.5,
    depth: 0.5,
    playfulness: 0.5,
    growth: 0.5,
  };

  for (const [key, { sum, count }] of Object.entries(totals)) {
    if (count > 0) {
      // -1〜1 → 0〜1 に正規化
      result[key as RelationshipQualityKey] = Math.max(0, Math.min(1, (sum / count + 1) / 2));
    }
  }

  return result;
}
