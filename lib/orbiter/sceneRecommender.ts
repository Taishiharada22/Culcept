// ============================================================
// Orbiter Feature 4: Scene Recommender
// おすすめシーン — 2人の軸傾向と文脈から最適なシーンを提案
//
// SCENE_RULES: 軸条件 → シーンタイプスコア配列
// avoid: スコア-0.3以下のシーン + 理由
// bestFirst: 最高スコアの1つ
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CautionCode, RendezvousCategory } from "@/lib/rendezvous/types";
import type {
  SceneType,
  SceneRecommendation,
  SceneRecommendationResult,
} from "./types";

// ── Scene Type Metadata ──

interface SceneMeta {
  type: SceneType;
  title: string;
  description: string;
  bestFor: string;
}

const SCENE_META: SceneMeta[] = [
  {
    type: "cafe",
    title: "カフェでゆっくり",
    description: "落ち着いた空間でお互いのペースで会話を楽しむ",
    bestFor: "内向的な2人や、じっくり話したい時に",
  },
  {
    type: "walk",
    title: "散歩・ウォーキング",
    description: "自然なペースで歩きながら、横並びでリラックスした会話を",
    bestFor: "緊張しやすい2人や、圧のない対話がしたい時に",
  },
  {
    type: "activity",
    title: "アクティビティ",
    description: "一緒に体を動かして、共通体験から距離を縮める",
    bestFor: "大胆な2人や、言葉以外でも繋がりたい時に",
  },
  {
    type: "group",
    title: "グループで集まる",
    description: "複数人の場で自然な流れで交流し、1対1の圧を軽減する",
    bestFor: "初対面や距離感に差がある時に",
  },
  {
    type: "creative",
    title: "クリエイティブな活動",
    description: "ワークショップや料理教室など、一緒に何かを作る体験",
    bestFor: "共創タイプの関係や、共同作業が好きな2人に",
  },
  {
    type: "food",
    title: "食事を楽しむ",
    description: "美味しいものを共有しながら、リラックスした時間を過ごす",
    bestFor: "お互いの好みを知りたい時や、特別感を出したい時に",
  },
  {
    type: "nature",
    title: "自然の中で",
    description: "公園、庭園、海辺など、自然に囲まれた開放的な空間で",
    bestFor: "リフレッシュしたい時や、広い空間が心地よい2人に",
  },
  {
    type: "online",
    title: "オンラインで",
    description: "ビデオ通話やオンラインゲームなど、遠隔でも楽しめる方法",
    bestFor: "まずは気軽に話したい時や、距離がある場合に",
  },
  {
    type: "event",
    title: "イベント参加",
    description: "展覧会、ライブ、マーケットなど、共通の興味で繋がる",
    bestFor: "共通の趣味がある2人や、会話のきっかけが欲しい時に",
  },
];

// ── Scene Scoring Rules ──

interface SceneRule {
  condition: (
    self: Partial<Record<TraitAxisKey, number>>,
    other: Partial<Record<TraitAxisKey, number>>,
    category: RendezvousCategory,
    cautionCodes: CautionCode[],
  ) => boolean;
  adjustments: Partial<Record<SceneType, number>>;
  reason: string;
}

const getScore = (
  scores: Partial<Record<TraitAxisKey, number>>,
  axis: TraitAxisKey,
): number | undefined => scores[axis];

const SCENE_RULES: SceneRule[] = [
  // 両方内向的 → カフェ・散歩が良い
  {
    condition: (self, other) => {
      const s = getScore(self, "introvert_vs_extrovert" as TraitAxisKey);
      const o = getScore(other, "introvert_vs_extrovert" as TraitAxisKey);
      return (s ?? 0) < -0.2 && (o ?? 0) < -0.2;
    },
    adjustments: { cafe: 0.8, walk: 0.7, nature: 0.5, group: -0.5, event: -0.3 },
    reason: "お互い落ち着いた場が好きなタイプ",
  },
  // 両方外向的 → グループ・イベントが良い
  {
    condition: (self, other) => {
      const s = getScore(self, "introvert_vs_extrovert" as TraitAxisKey);
      const o = getScore(other, "introvert_vs_extrovert" as TraitAxisKey);
      return (s ?? 0) > 0.2 && (o ?? 0) > 0.2;
    },
    adjustments: { group: 0.6, event: 0.7, activity: 0.5, cafe: -0.2 },
    reason: "お互い社交的で活動的なタイプ",
  },
  // 両方大胆 → アクティビティ
  {
    condition: (self, other) => {
      const s = getScore(self, "cautious_vs_bold" as TraitAxisKey);
      const o = getScore(other, "cautious_vs_bold" as TraitAxisKey);
      return (s ?? 0) > 0.2 && (o ?? 0) > 0.2;
    },
    adjustments: { activity: 0.7, creative: 0.6, event: 0.4 },
    reason: "お互いチャレンジが好きなタイプ",
  },
  // 両方慎重 → カフェ・散歩・オンライン
  {
    condition: (self, other) => {
      const s = getScore(self, "cautious_vs_bold" as TraitAxisKey);
      const o = getScore(other, "cautious_vs_bold" as TraitAxisKey);
      return (s ?? 0) < -0.2 && (o ?? 0) < -0.2;
    },
    adjustments: { cafe: 0.5, walk: 0.6, online: 0.5, activity: -0.4 },
    reason: "お互い慎重に関係を深めたいタイプ",
  },
  // 親密ペースに差 → グループで圧を軽減
  {
    condition: (self, other) => {
      const s = getScore(self, "intimacy_pace" as TraitAxisKey);
      const o = getScore(other, "intimacy_pace" as TraitAxisKey);
      if (s === undefined || o === undefined) return false;
      return Math.abs(s - o) > 0.4;
    },
    adjustments: { group: 0.6, event: 0.4, walk: 0.3, food: -0.2 },
    reason: "距離感の好みに差がある",
  },
  // 共創カテゴリ → クリエイティブ優先
  {
    condition: (_s, _o, category) => category === "cocreation",
    adjustments: { creative: 0.5, activity: 0.3, cafe: 0.2 },
    reason: "共創の関係に向いたシーン",
  },
  // 恋愛カテゴリ → 食事・カフェ優先
  {
    condition: (_s, _o, category) => category === "romantic",
    adjustments: { food: 0.4, cafe: 0.3, walk: 0.3, nature: 0.3 },
    reason: "恋愛的な関係に向いたシーン",
  },
  // コミュニティ → グループ・イベント
  {
    condition: (_s, _o, category) => category === "community",
    adjustments: { group: 0.5, event: 0.5 },
    reason: "コミュニティ活動に向いたシーン",
  },
  // distance_need_gap → 自然・散歩で空間的余白を
  {
    condition: (_s, _o, _c, cautions) =>
      cautions.includes("distance_need_gap"),
    adjustments: { walk: 0.4, nature: 0.5, cafe: -0.2 },
    reason: "距離感の違いがあるので、開放的な空間が安心",
  },
  // silence_interpretation_gap → アクティビティで沈黙の圧を回避
  {
    condition: (_s, _o, _c, cautions) =>
      cautions.includes("silence_interpretation_gap"),
    adjustments: { activity: 0.4, creative: 0.3, walk: 0.3, cafe: -0.3 },
    reason: "沈黙の解釈にズレがあるので、活動があると安心",
  },
  // emotional_expression_gap → 食事で自然な雰囲気を
  {
    condition: (_s, _o, _c, cautions) =>
      cautions.includes("emotional_expression_gap"),
    adjustments: { food: 0.3, walk: 0.3, event: 0.2 },
    reason: "感情表現の温度差を、リラックスした場で和らげる",
  },
  // 質重視 × 質重視 → 食事・カフェを品質高めに
  {
    condition: (self, other) => {
      const s = getScore(self, "quality_vs_quantity" as TraitAxisKey);
      const o = getScore(other, "quality_vs_quantity" as TraitAxisKey);
      return (s ?? 0) < -0.2 && (o ?? 0) < -0.2;
    },
    adjustments: { food: 0.4, cafe: 0.3 },
    reason: "お互い質を大切にするタイプ",
  },
  // 両方新しもの好き → イベント・クリエイティブ
  {
    condition: (self, other) => {
      const s = getScore(self, "tradition_vs_novelty" as TraitAxisKey);
      const o = getScore(other, "tradition_vs_novelty" as TraitAxisKey);
      return (s ?? 0) > 0.2 && (o ?? 0) > 0.2;
    },
    adjustments: { event: 0.5, creative: 0.4, activity: 0.3, cafe: -0.2 },
    reason: "新しい体験を好む2人にぴったり",
  },
  // 両方伝統志向 → 食事・自然
  {
    condition: (self, other) => {
      const s = getScore(self, "tradition_vs_novelty" as TraitAxisKey);
      const o = getScore(other, "tradition_vs_novelty" as TraitAxisKey);
      return (s ?? 0) < -0.2 && (o ?? 0) < -0.2;
    },
    adjustments: { food: 0.4, nature: 0.4, cafe: 0.3 },
    reason: "落ち着いた定番のシーンが心地よい2人",
  },
  // 友情カテゴリ → カフェ・散歩を優先
  {
    condition: (_s, _o, category) => category === "friendship",
    adjustments: { cafe: 0.3, walk: 0.3, group: 0.2, food: 0.2 },
    reason: "友情を深めるのにちょうど良いシーン",
  },
  // 片方がストレスで孤立型 → 散歩・自然（圧が少ない）
  {
    condition: (self, other) => {
      const s = getScore(self, "stress_isolation_vs_social" as TraitAxisKey);
      const o = getScore(other, "stress_isolation_vs_social" as TraitAxisKey);
      return (s ?? 0) < -0.3 || (o ?? 0) < -0.3;
    },
    adjustments: { walk: 0.3, nature: 0.4, online: 0.2, group: -0.3 },
    reason: "ストレス時にひとりになりたい人がいるので、圧の低い場が安心",
  },
  // conflict_style_gap → アクティビティ（対立を共同体験で緩和）
  {
    condition: (_s, _o, _c, cautions) =>
      cautions.includes("conflict_style_gap"),
    adjustments: { activity: 0.3, walk: 0.3, nature: 0.2 },
    reason: "対立スタイルの違いを、体験の共有で緩やかに",
  },
];

// ── Main Export ──

export function computeSceneRecommendation(params: {
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  category: RendezvousCategory;
  cautionCodes: CautionCode[];
}): SceneRecommendationResult {
  const { selfAxisScores, counterpartAxisScores, category, cautionCodes } = params;

  // 各シーンのスコアを集計
  const sceneScores: Record<SceneType, { total: number; reasons: string[] }> = {
    cafe: { total: 0, reasons: [] },
    walk: { total: 0, reasons: [] },
    activity: { total: 0, reasons: [] },
    group: { total: 0, reasons: [] },
    creative: { total: 0, reasons: [] },
    food: { total: 0, reasons: [] },
    nature: { total: 0, reasons: [] },
    online: { total: 0, reasons: [] },
    event: { total: 0, reasons: [] },
  };

  for (const rule of SCENE_RULES) {
    if (rule.condition(selfAxisScores, counterpartAxisScores, category, cautionCodes)) {
      for (const [sceneType, adjustment] of Object.entries(rule.adjustments)) {
        const scene = sceneScores[sceneType as SceneType];
        if (scene) {
          scene.total += adjustment;
          if (adjustment > 0) scene.reasons.push(rule.reason);
        }
      }
    }
  }

  // ソート
  const sorted = Object.entries(sceneScores)
    .sort(([, a], [, b]) => b.total - a.total);

  // 上位3つを推薦
  const topScenes: SceneRecommendation[] = sorted
    .slice(0, 3)
    .filter(([, s]) => s.total > 0)
    .map(([type, s]) => {
      const meta = SCENE_META.find((m) => m.type === type)!;
      return {
        type: type as SceneType,
        title: meta.title,
        description: meta.description,
        reason: s.reasons[0] ?? "",
        confidenceLevel: Math.min(1, Math.max(0, s.total)),
        bestFor: meta.bestFor,
      };
    });

  // 避けるべきシーン
  const avoidScenes = sorted
    .filter(([, s]) => s.total < -0.3)
    .map(([type, s]) => ({
      type: type as SceneType,
      reason: s.reasons[0] ?? "相性的に難しい可能性",
    }));

  // bestFirst
  const bestFirst: SceneRecommendation = topScenes[0] ?? {
    type: "cafe" as SceneType,
    title: "カフェでゆっくり",
    description: "まずは落ち着いた場所で会話から始めてみて",
    reason: "汎用的に安心できるシーン",
    confidenceLevel: 0.3,
    bestFor: "初対面や迷った時に",
  };

  return {
    scenes: topScenes,
    bestFirst,
    avoidScenes,
  };
}
