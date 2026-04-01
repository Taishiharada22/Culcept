/**
 * Phase 0: 既知ペア関係性インサイト生成（enriched版）
 *
 * Aneurasync全体のデータを活用:
 *   - Stargazer 45軸 → MatchingVector → evaluatePair()
 *   - Attachment心理（愛着スタイル）
 *   - SDT欲求充足（自律性/有能感/関係性）
 *   - パーソナリティ12軸
 *   - Origin 価値観・情熱シグナル
 *   - アーキタイプ
 *
 * 設計原則:
 *   - LLMは「翻訳層」に留める。決定ロジックは構造化出力で完結
 *   - enrichedデータは構造化インサイトの「深み」に使う
 */

import type {
  MatchingVector,
  ReasonCode,
  CautionCode,
  RendezvousCategory,
} from "../types";
import {
  evaluatePair,
  reasonCodesToTexts,
  cautionCodesToTexts,
} from "../evaluate";
import { generateInsight, type CompatibilityInsight } from "../insightGenerator";
import { buildOverallScore } from "../buildLabel";
import type { AttachmentProfile } from "../attachmentProfile";
import type { SDTProfile } from "../sdtAxes";
import type {
  AlterJudgmentPattern,
  AlterGrowthSummary,
  ContradictionSummary,
  PersonMapEntry,
  OriginSummary,
} from "./enrichedDataLoader";

// ============================================================
// Types
// ============================================================

export type EnrichedContext = {
  selfAttachment: AttachmentProfile;
  partnerAttachment: AttachmentProfile;
  selfSDT: SDTProfile;
  partnerSDT: SDTProfile;
  selfPersonality: Record<string, number> | null;
  partnerPersonality: Record<string, number> | null;
  selfOrigin: OriginSummary | null;
  partnerOrigin: OriginSummary | null;
  selfArchetype: string | null;
  partnerArchetype: string | null;
  // Alter データ
  selfAlterPatterns: AlterJudgmentPattern | null;
  partnerAlterPatterns: AlterJudgmentPattern | null;
  selfAlterGrowth: AlterGrowthSummary | null;
  partnerAlterGrowth: AlterGrowthSummary | null;
  // 矛盾（二面性）
  selfContradictions: ContradictionSummary | null;
  partnerContradictions: ContradictionSummary | null;
  // 対人関係図
  selfPersonMap: PersonMapEntry[] | null;
  partnerPersonMap: PersonMapEntry[] | null;
};

export type Phase0PairInsight = {
  /** 1文ナラティブ — 「2人の間に起きやすいこと」 */
  narrative: string;
  /** 共鳴する点（2〜3つ） */
  resonancePoints: Array<{ label: string; description: string }>;
  /** まだ見えていない点（1つ） */
  unobservedPoint: { label: string; description: string } | null;
  /** データ充足度 (0-100) */
  confidence: number;
  /** ベストカテゴリ */
  bestCategory: RendezvousCategory | null;
  /** 双方向スコア */
  overallScore: number | null;
  /** enrichedインサイト（LLMに渡す追加コンテキスト） */
  enrichedInsights: string[];
  /** 構造化データ（デバッグ・スナップショット用） */
  _raw: {
    reasonCodes: ReasonCode[];
    cautionCodes: CautionCode[];
    reasonTexts: string[];
    cautionTexts: string[];
    vectorA: MatchingVector;
    vectorB: MatchingVector;
    compatibilityInsight: CompatibilityInsight | null;
  };
};

// ============================================================
// 構造化インサイト生成
// ============================================================

export function generateStructuredInsight(params: {
  vectorA: MatchingVector;
  vectorB: MatchingVector;
  axisCountA: number;
  axisCountB: number;
  totalAxes?: number;
  enriched?: EnrichedContext;
}): Phase0PairInsight {
  const { vectorA, vectorB, axisCountA, axisCountB, totalAxes = 45, enriched } = params;

  const avgAxes = (axisCountA + axisCountB) / 2;
  const confidence = Math.round((avgAxes / totalAxes) * 100);

  const dummyProfile = (userId: string) => ({
    id: userId,
    user_id: userId,
    is_enabled: true,
    is_paused: false,
    display_name: null,
    avatar_asset_url: null,
    avatar_version: 0,
    primary_category: "friendship" as RendezvousCategory,
    enabled_categories: [
      "romantic", "friendship", "cocreation", "community",
    ] as RendezvousCategory[],
    visibility_scope: "all",
    notification_enabled: false,
    notification_delay_mode: "random",
    notification_delay_min_minutes: 180,
    notification_delay_max_minutes: 1440,
    show_in_home: false,
    public_mood_summary: null,
    public_style_summary: null,
    gender: null,
    date_of_birth: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const dummyPreferences = (vector: MatchingVector) => ({
    id: "phase0",
    user_id: "phase0",
    desired_relation_types: [
      "romantic", "friendship", "cocreation", "community",
    ] as RendezvousCategory[],
    communication_style: null,
    pace_preference: null,
    distance_preference: null,
    depth_preference: null,
    stability_vs_stimulation: 0.5,
    similarity_vs_complementarity: 0.5,
    initiative_preference: null,
    emotional_expression_preference: null,
    conflict_resolution_preference: null,
    excluded_relation_types: [],
    excluded_traits: [],
    matching_vector: vector,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // enriched データを evaluatePair に渡す
  const enrichedAB = enriched
    ? {
        selfAttachmentProfile: enriched.selfAttachment,
        otherAttachmentProfile: enriched.partnerAttachment,
        selfSDTProfile: enriched.selfSDT,
        otherSDTProfile: enriched.partnerSDT,
      }
    : undefined;

  const enrichedBA = enriched
    ? {
        selfAttachmentProfile: enriched.partnerAttachment,
        otherAttachmentProfile: enriched.selfAttachment,
        selfSDTProfile: enriched.partnerSDT,
        otherSDTProfile: enriched.selfSDT,
      }
    : undefined;

  const pairResult = evaluatePair({
    profileA: dummyProfile("a"),
    profileB: dummyProfile("b"),
    preferencesA: dummyPreferences(vectorA),
    preferencesB: dummyPreferences(vectorB),
    vectorA,
    vectorB,
    enrichedAB,
    enrichedBA,
  });

  // mutual でなくても全カテゴリからベストを取る
  let bestCategory = pairResult.bestCategory;
  let reasonCodes = pairResult.reasonCodes;
  let cautionCodes = pairResult.cautionCodes;
  let overallScore = pairResult.overallScore;

  if (!bestCategory) {
    const allCategories: RendezvousCategory[] = [
      "friendship", "romantic", "cocreation", "community",
    ];
    let bestScore = 0;
    for (const cat of allCategories) {
      const ab = pairResult.scoreABByCategory[cat];
      const ba = pairResult.scoreBAByCategory[cat];
      if (ab && ba) {
        const score = buildOverallScore(ab.total, ba.total);
        if (score > bestScore) {
          bestScore = score;
          bestCategory = cat;
          reasonCodes = [...ab.reasonCodes, ...ba.reasonCodes]
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 3);
          cautionCodes = [...ab.cautionCodes, ...ba.cautionCodes]
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 2);
          overallScore = score;
        }
      }
    }
  }

  const reasonTexts = reasonCodesToTexts(reasonCodes as string[]);
  const cautionTexts = cautionCodesToTexts(cautionCodes as string[]);

  let compatibilityInsight: CompatibilityInsight | null = null;
  if (bestCategory && overallScore !== null) {
    compatibilityInsight = generateInsight(
      vectorA, vectorB,
      reasonCodes as ReasonCode[],
      cautionCodes as CautionCode[],
      bestCategory,
      Math.round(overallScore * 100),
    );
  }

  // 共鳴する点
  const resonancePoints = reasonTexts.slice(0, 3).map((text) => ({
    label: text,
    description:
      compatibilityInsight?.connectionPoints.find((cp) =>
        cp.description.includes(text.slice(0, 4)),
      )?.description ?? text,
  }));

  // まだ見えていない点
  const unobservedPoint = buildUnobservedPoint(cautionTexts, confidence, vectorA, vectorB);

  // === enriched インサイト（LLMに渡す追加文脈） ===
  const enrichedInsights = enriched
    ? buildEnrichedInsights(enriched, vectorA, vectorB)
    : [];

  // enriched共鳴ポイントを追加（既存のreasonTextsだけでは薄い場合）
  if (enriched && resonancePoints.length < 3) {
    for (const insight of enrichedInsights) {
      if (resonancePoints.length >= 3) break;
      resonancePoints.push({ label: insight, description: insight });
    }
  }

  // 1文ナラティブ
  const narrative = buildStructuredNarrative(
    resonancePoints, unobservedPoint, bestCategory, overallScore, enrichedInsights,
  );

  return {
    narrative,
    resonancePoints,
    unobservedPoint,
    confidence,
    bestCategory,
    overallScore,
    enrichedInsights,
    _raw: {
      reasonCodes: reasonCodes as ReasonCode[],
      cautionCodes: cautionCodes as CautionCode[],
      reasonTexts,
      cautionTexts,
      vectorA,
      vectorB,
      compatibilityInsight,
    },
  };
}

// ============================================================
// Enriched インサイト生成
// ============================================================

function buildEnrichedInsights(
  enriched: EnrichedContext,
  vectorA: MatchingVector,
  vectorB: MatchingVector,
): string[] {
  const insights: string[] = [];

  // 愛着スタイルの相性
  const { selfAttachment, partnerAttachment } = enriched;
  const anxietyDiff = Math.abs(selfAttachment.anxietyLevel - partnerAttachment.anxietyLevel);
  const avoidanceDiff = Math.abs(selfAttachment.avoidanceLevel - partnerAttachment.avoidanceLevel);

  if (selfAttachment.secureBase > 0.6 && partnerAttachment.secureBase > 0.6) {
    insights.push("2人とも安心の土台が安定している。信頼を築きやすい関係");
  } else if (anxietyDiff > 0.3) {
    insights.push("安心の求め方に違いがある。片方が確認を求め、もう片方が距離を取りやすいパターンに注意");
  }

  // SDT欲求の共鳴
  const { selfSDT, partnerSDT } = enriched;
  const autonomyDiff = Math.abs(selfSDT.autonomySatisfaction - partnerSDT.autonomySatisfaction);
  if (autonomyDiff < 0.15) {
    insights.push("自律性の感覚が近い。お互いの自由を自然に尊重し合える");
  }
  if (selfSDT.relatednessSatisfaction > 0.6 && partnerSDT.relatednessSatisfaction > 0.6) {
    insights.push("2人とも深い繋がりへの欲求が高い。関係が深まりやすい");
  }

  // パーソナリティ12軸の相性
  if (enriched.selfPersonality && enriched.partnerPersonality) {
    const sp = enriched.selfPersonality;
    const pp = enriched.partnerPersonality;

    // 表現性の差
    if (sp.e_expression !== undefined && pp.e_expression !== undefined) {
      const diff = Math.abs(sp.e_expression - pp.e_expression);
      if (diff < 0.2) {
        insights.push("感情の出し方が似ている。言葉にしなくても通じやすい関係");
      }
    }

    // 秩序 vs 探索の補完
    if (sp.s_order !== undefined && pp.s_exploration !== undefined) {
      if (sp.s_order > 0.5 && pp.s_exploration > 0.5) {
        insights.push("計画性と冒険心が補い合える。片方が整え、片方が広げる関係");
      }
    }

    // 調和 vs 本音
    if (sp.r_harmony !== undefined && pp.r_authenticity !== undefined) {
      if (sp.r_harmony > 0.5 && pp.r_authenticity > 0.5) {
        insights.push("調和を大切にする人と本音を大切にする人。ぶつかる可能性があるが、お互いに学びが大きい");
      }
    }
  }

  // Origin データの重なり（感情タグ・日常カテゴリ）
  if (enriched.selfOrigin && enriched.partnerOrigin) {
    // 感情タグの共通点
    const selfEmotions = new Set(enriched.selfOrigin.emotionTags);
    const partnerEmotions = new Set(enriched.partnerOrigin.emotionTags);
    const sharedEmotions = [...selfEmotions].filter((e) => partnerEmotions.has(e));
    if (sharedEmotions.length >= 2) {
      insights.push(`日常で感じる感情に「${sharedEmotions.slice(0, 2).join("」「")}」という共通点がある`);
    }

    // 日常カテゴリの共通点
    const selfCats = new Set(enriched.selfOrigin.categories);
    const partnerCats = new Set(enriched.partnerOrigin.categories);
    const sharedCats = [...selfCats].filter((c) => partnerCats.has(c));
    if (sharedCats.length > 0) {
      const catJa: Record<string, string> = {
        work_decision: "仕事の判断", relationship: "人間関係", time_allocation: "時間の使い方",
        self_care: "自分のケア", money: "お金", nothing_special: "日常",
      };
      const names = sharedCats.map((c) => catJa[c] ?? c).slice(0, 2);
      insights.push(`日常の関心領域に「${names.join("」「")}」という共通点がある`);
    }
  }

  // アーキタイプの組み合わせ
  if (enriched.selfArchetype && enriched.partnerArchetype) {
    if (enriched.selfArchetype === enriched.partnerArchetype) {
      insights.push("同じアーキタイプ同士。共鳴しやすいが、盲点も共有しやすい");
    }
  }

  // ── Alter 判断パターン ──
  if (enriched.selfAlterPatterns && enriched.partnerAlterPatterns) {
    const selfTop = getTopActionShape(enriched.selfAlterPatterns.actionShapeDistribution);
    const partnerTop = getTopActionShape(enriched.partnerAlterPatterns.actionShapeDistribution);

    if (selfTop && partnerTop) {
      if (selfTop === partnerTop) {
        const shapeJa = ACTION_SHAPE_JA[selfTop] ?? selfTop;
        insights.push(`判断の仕方が似ている。2人とも「${shapeJa}」タイプ`);
      } else {
        const selfJa = ACTION_SHAPE_JA[selfTop] ?? selfTop;
        const partnerJa = ACTION_SHAPE_JA[partnerTop] ?? partnerTop;
        insights.push(`判断スタイルが異なる。「${selfJa}」と「${partnerJa}」。互いに補い合える可能性がある`);
      }
    }

    // ForceBalance傾向の比較
    const selfFB = enriched.selfAlterPatterns.avgForceBalance;
    const partnerFB = enriched.partnerAlterPatterns.avgForceBalance;
    if (selfFB && partnerFB) {
      const expandDiff = Math.abs(selfFB.expandPressure - partnerFB.expandPressure);
      const protectDiff = Math.abs(selfFB.protectPressure - partnerFB.protectPressure);

      if (expandDiff > 0.25) {
        insights.push("行動への推進力に差がある。片方が進みたい時、もう片方は慎重かもしれない");
      }
      if (protectDiff > 0.25) {
        insights.push("守りの強さに差がある。ストレス時の対処法が異なる可能性");
      }
      if (expandDiff < 0.1 && protectDiff < 0.1) {
        insights.push("行動と守りのバランスが似ている。判断の歩調が自然に合いやすい");
      }
    }
  }

  // ── 矛盾（二面性）──
  if (enriched.selfContradictions && enriched.partnerContradictions) {
    const selfDual = enriched.selfContradictions.dualAxes;
    const partnerDual = enriched.partnerContradictions.dualAxes;

    // 同じ軸で二面性を持っている場合 → 深い共鳴
    const sharedDualAxes = selfDual.filter((s) =>
      partnerDual.some((p) => p.axisId === s.axisId),
    );
    if (sharedDualAxes.length > 0) {
      const axisName = AXIS_JA[sharedDualAxes[0].axisId as keyof MatchingVector] ?? sharedDualAxes[0].axisId;
      insights.push(`2人とも「${axisName}」に二面性を持っている。表面的には矛盾に見えるが、お互いの揺れを理解し合える可能性がある`);
    }
  } else if (enriched.selfContradictions && enriched.selfContradictions.dualAxes.length > 0) {
    // 片方だけに二面性がある
    const axis = enriched.selfContradictions.dualAxes[0];
    const axisName = AXIS_JA[axis.axisId as keyof MatchingVector] ?? axis.axisId;
    insights.push(`あなたの「${axisName}」には揺れがある。相手にそれが伝わるまで時間がかかるかもしれない`);
  }

  // ── Alter 成長データ（価値観の共通点）──
  if (enriched.selfAlterGrowth && enriched.partnerAlterGrowth) {
    const selfValues = new Set(enriched.selfAlterGrowth.coreValues);
    const partnerValues = new Set(enriched.partnerAlterGrowth.coreValues);
    const shared = [...selfValues].filter((v) => partnerValues.has(v));
    if (shared.length > 0 && !insights.some((i) => i.includes("価値観"))) {
      insights.push(`Alterが観測した深層の価値観に「${shared.slice(0, 2).join("」「")}」という共通点がある`);
    }
  }

  return insights.slice(0, 7);
}

// ============================================================
// ヘルパー
// ============================================================

const ACTION_SHAPE_JA: Record<string, string> = {
  full_go: "迷わず行く",
  bounded_go: "範囲を決めて行く",
  prepare_then_go: "準備してから行く",
  trial_then_decide: "小さく試す",
  observe_first: "まず様子を見る",
  delegate_or_request: "誰かに頼る",
  defer_with_trigger: "条件が揃ったら行く",
  skip: "見送る",
};

function getTopActionShape(dist: Record<string, number>): string | null {
  let top: string | null = null;
  let max = 0;
  for (const [shape, count] of Object.entries(dist)) {
    if (count > max) {
      max = count;
      top = shape;
    }
  }
  return top;
}

const AXIS_JA: Record<keyof MatchingVector, string> = {
  conversation_temperature: "会話の温度",
  distance_need: "距離感",
  depth_speed: "深まりの速度",
  stability_need: "安定性",
  stimulation_need: "刺激欲求",
  initiative: "主導性",
  emotional_openness: "感情表現",
  conflict_directness: "葛藤解決",
  social_energy: "社交エネルギー",
  structure_preference: "構造性",
};

function buildUnobservedPoint(
  cautionTexts: string[],
  confidence: number,
  vectorA: MatchingVector,
  vectorB: MatchingVector,
): Phase0PairInsight["unobservedPoint"] {
  if (confidence < 60) {
    const axes = Object.keys(AXIS_JA) as (keyof MatchingVector)[];
    let maxDiff = 0;
    let maxAxis: keyof MatchingVector = "conversation_temperature";
    for (const axis of axes) {
      const diff = Math.abs(vectorA[axis] - vectorB[axis]);
      if (diff > maxDiff) {
        maxDiff = diff;
        maxAxis = axis;
      }
    }
    return {
      label: `${AXIS_JA[maxAxis]}の相性`,
      description: `観測データがまだ十分ではないため、${AXIS_JA[maxAxis]}における2人の噛み合いはまだ見えていません。会話してみることで明らかになるでしょう。`,
    };
  }

  if (cautionTexts.length > 0) {
    return {
      label: cautionTexts[0],
      description: `この部分は実際に会話してみないとわからない領域です。観測はしていますが、確信度はまだ高くありません。`,
    };
  }

  return null;
}

function buildStructuredNarrative(
  resonancePoints: Phase0PairInsight["resonancePoints"],
  _unobservedPoint: Phase0PairInsight["unobservedPoint"],
  bestCategory: RendezvousCategory | null,
  overallScore: number | null,
  enrichedInsights: string[],
): string {
  if (!bestCategory || overallScore === null) {
    return "2人の間にどんな化学反応が起きるか、まだ十分なデータがありません。";
  }

  const score = Math.round(overallScore * 100);
  const topResonance = resonancePoints[0]?.label ?? "共通する感覚";
  const topEnriched = enrichedInsights[0];

  if (score >= 80) {
    return topEnriched
      ? `${topEnriched}。自然と深い対話が生まれやすい関係です。`
      : `2人は「${topResonance}」を軸に、自然と深い対話が生まれやすい関係です。`;
  }
  if (score >= 65) {
    return topEnriched
      ? `${topEnriched}。互いの視点が新しい気づきを生む可能性があります。`
      : `2人の間には「${topResonance}」という共鳴があり、互いの視点が新しい気づきを生む可能性があります。`;
  }
  return topEnriched
    ? `${topEnriched}。違いの中から予想外の発見が生まれやすい関係です。`
    : `2人は異なる角度から物事を見るため、会話の中で予想外の発見が生まれやすい関係です。`;
}
