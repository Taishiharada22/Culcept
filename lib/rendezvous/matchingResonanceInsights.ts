// lib/rendezvous/matchingResonanceInsights.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Matching Resonance Insights（マッチング共鳴洞察）
//
// 脳科学的根拠:
// 「マッチしました」は弱い。「なぜこの人と出会ったのか」が強い。
// 物語（narrative）は扁桃体→海馬→mPFCの経路で処理され、
// 単純な事実情報の5倍記憶に残る（Hasson et al., 2008）。
//
// 設計思想:
// マッチ結果を単なるスコア/理由コードではなく、
// 「二人の間に起きうる物語」として提示する。
// 既存のreasonCodes/cautionCodesの上位レイヤーとして機能。
//
// 追加設計: Encounter Choreography（出会いの振り付け）
// - 二人が最初に何を話すべきかを提案
// - 最初の会話が成功すると、関係の持続率が3倍になる（Hinge研究）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MatchingVector, RendezvousCategory, ReasonCode, CautionCode } from "./types";
import type { StrategyBalanceReport } from "./similarityComplementarityMatrix";
import type { GrowthEdgeResult } from "./growthEdgeMatching";
import type { NarrativePhaseMatchResult } from "./narrativePhaseMatching";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マッチング共鳴洞察の全体 */
export interface ResonanceInsight {
  /** この出会いの一言タイトル */
  headline: string;
  /** 共鳴の物語（2-3文） */
  resonanceNarrative: string;
  /** 成長の物語（GrowthEdgeから） */
  growthNarrative: string | null;
  /** フェーズの物語（NarrativePhaseから） */
  phaseNarrative: string | null;
  /** 出会いの振り付け（最初の会話の提案） */
  encounterChoreography: EncounterChoreography;
  /** この関係のアーキタイプ */
  relationshipArchetype: RelationshipArchetype;
  /** 時間経過による関係の予測（タイムライン） */
  relationshipTimeline: TimelinePhase[];
  /** Anima用の統合コンテキスト */
  animaContext: AnimaMatchContext;
}

/** 出会いの振り付け — 最初の会話を成功させるためのガイド */
export interface EncounterChoreography {
  /** 最初に聞くべき質問 */
  openingQuestion: string;
  /** 話すべきトピック */
  suggestedTopics: string[];
  /** 避けるべきトピック */
  topicsToAvoid: string[];
  /** 会話のテンポ推奨 */
  paceSuggestion: string;
  /** 沈黙が訪れたときの対処 */
  silenceAdvice: string;
}

/** 関係のアーキタイプ */
export interface RelationshipArchetype {
  /** アーキタイプ名 */
  name: string;
  /** 日本語名 */
  nameJa: string;
  /** 説明 */
  description: string;
  /** アイコン */
  emoji: string;
}

/** 関係の時間経過予測 */
export interface TimelinePhase {
  /** フェーズ名 */
  phase: string;
  /** 予想期間 */
  duration: string;
  /** このフェーズで起きること */
  description: string;
  /** 注意点 */
  watchOut: string;
}

/** Anima向けの統合マッチコンテキスト */
export interface AnimaMatchContext {
  /** 二人の関係のテーマ */
  theme: string;
  /** 成長の方向性 */
  growthDirection: string;
  /** 注意すべき摩擦点 */
  frictionPoints: string[];
  /** 推奨する深め方 */
  deepeningStrategy: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Relationship Archetypes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ARCHETYPES: RelationshipArchetype[] = [
  {
    name: "mirror",
    nameJa: "鏡の関係",
    description: "互いに似た価値観を持ち、互いを映し出す。安心感が強いが、成長のために外部の刺激が必要になることがある",
    emoji: "🪞",
  },
  {
    name: "compass",
    nameJa: "羅針盤の関係",
    description: "互いの盲点を照らし合い、方向を示し合う。成長のポテンシャルが高いが、時に居心地の悪さを伴う",
    emoji: "🧭",
  },
  {
    name: "rhythm",
    nameJa: "リズムの関係",
    description: "異なるテンポが補完し合い、自然なハーモニーを生む。一緒にいると心地よいリズムが生まれる",
    emoji: "🎵",
  },
  {
    name: "catalyst",
    nameJa: "触媒の関係",
    description: "互いの存在が変化の触媒になる。一緒にいると新しいことが始まる。ただし変化の速度に注意",
    emoji: "⚡",
  },
  {
    name: "anchor",
    nameJa: "錨の関係",
    description: "安定した基盤を提供し合う。嵐の中でも揺るがない。ただし安定しすぎると停滞のリスクも",
    emoji: "⚓",
  },
  {
    name: "bridge",
    nameJa: "橋の関係",
    description: "異なる世界を繋ぐ存在。互いの知らない世界へのアクセスを提供する。新鮮さが持続する",
    emoji: "🌉",
  },
];

function detectArchetype(
  balance: StrategyBalanceReport,
  growthEdge: GrowthEdgeResult | null,
  phaseMatch: NarrativePhaseMatchResult | null,
): RelationshipArchetype {
  const growthPotential = growthEdge?.mutualGrowthPotential ?? 0;
  const phaseResonance = phaseMatch?.resonance ?? 0.5;

  // 高い価値観一致 + 低い成長ポテンシャル → 鏡
  if (balance.valueAlignment >= 0.8 && growthPotential < 0.3) {
    return ARCHETYPES[0]; // mirror
  }

  // 高い成長ポテンシャル + 高い対称性 → 羅針盤
  if (growthPotential >= 0.5 && (growthEdge?.growthSymmetry ?? 0) >= 0.6) {
    return ARCHETYPES[1]; // compass
  }

  // 高い相補性 + 良いバランス → リズム
  if (balance.approachComplementarity >= 0.7 && balance.balanceQuality === "excellent") {
    return ARCHETYPES[2]; // rhythm
  }

  // フェーズが転換/探索中 + 成長ポテンシャル → 触媒
  if (phaseMatch?.relationship === "contrasting" || phaseResonance < 0.4) {
    return ARCHETYPES[3]; // catalyst
  }

  // 高い安定性一致 + 深化フェーズ → 錨
  if (balance.valueAlignment >= 0.7 && balance.sustainabilityEstimate === "high") {
    return ARCHETYPES[4]; // anchor
  }

  // デフォルト: 橋
  return ARCHETYPES[5]; // bridge
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Encounter Choreography
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 出会いの振り付けを生成
 *
 * Hinge研究: 最初の会話の質が関係の持続率を3倍にする
 * 良い最初の質問 = 相手の経験に基づく、答えやすい、深くなれる
 */
function generateEncounterChoreography(
  archetype: RelationshipArchetype,
  growthEdge: GrowthEdgeResult | null,
  category: RendezvousCategory,
  vectorA: MatchingVector,
  vectorB: MatchingVector,
): EncounterChoreography {
  // アーキタイプに基づく開始質問
  const openingQuestionMap: Record<string, string[]> = {
    mirror: [
      "最近、一番心に残った選択は何ですか？",
      "自分に正直でいられた瞬間について教えてください",
    ],
    compass: [
      "自分の中で一番変わりたいと思っている部分はありますか？",
      "最近、自分の意外な一面を発見したことはありますか？",
    ],
    rhythm: [
      "リラックスしているとき、どんなことを考えていますか？",
      "一緒にいて心地よいと感じる人の特徴は何ですか？",
    ],
    catalyst: [
      "今、一番エネルギーを注いでいることは何ですか？",
      "最近、新しく始めたことはありますか？",
    ],
    anchor: [
      "長く大切にしているものはありますか？",
      "安心できる瞬間について教えてください",
    ],
    bridge: [
      "あなたの世界を一言で表すと？",
      "最近、視野が広がった出来事はありますか？",
    ],
  };

  const questions = openingQuestionMap[archetype.name] ?? openingQuestionMap.bridge;
  const dayHash = Math.floor(Date.now() / 86400000);
  const openingQuestion = questions[dayHash % questions.length];

  // カテゴリに基づくトピック推奨
  const suggestedTopics = generateSuggestedTopics(category, archetype.name, growthEdge);

  // 避けるべきトピック
  const topicsToAvoid = generateTopicsToAvoid(category, vectorA, vectorB);

  // テンポ推奨
  const avgConversation = (vectorA.conversation_temperature + vectorB.conversation_temperature) / 2;
  let paceSuggestion: string;
  if (avgConversation < 0.3) {
    paceSuggestion = "ゆっくりとしたペースで。沈黙も会話の一部として大切にする";
  } else if (avgConversation > 0.7) {
    paceSuggestion = "活発なテンポで。思ったことはどんどん話してOK";
  } else {
    paceSuggestion = "自然なペースで。相手の反応を見ながら深さを調整する";
  }

  // 沈黙への対処
  const silenceAdvice = vectorA.conversation_temperature < vectorB.conversation_temperature
    ? "沈黙は考えている証拠。急かさず、自分も考える時間として使う"
    : "沈黙が訪れたら、最後の話題を少し違う角度から掘り下げてみる";

  return {
    openingQuestion,
    suggestedTopics,
    topicsToAvoid,
    paceSuggestion,
    silenceAdvice,
  };
}

function generateSuggestedTopics(
  category: RendezvousCategory,
  archetypeName: string,
  growthEdge: GrowthEdgeResult | null,
): string[] {
  const topics: string[] = [];

  // カテゴリ共通
  switch (category) {
    case "romantic":
    case "partner":
      topics.push("価値観について（大切にしていること）");
      topics.push("日常の小さな幸せ");
      break;
    case "friendship":
      topics.push("最近ハマっていること");
      topics.push("休日の過ごし方");
      break;
    case "cocreation":
      topics.push("得意なことと苦手なこと");
      topics.push("理想のプロジェクトの進め方");
      break;
    case "community":
      topics.push("この場に来た理由");
      topics.push("関心のある分野");
      break;
  }

  // 成長エッジに基づく深いトピック
  if (growthEdge && growthEdge.growthForA.length > 0) {
    const topGrowth = growthEdge.growthForA[0];
    topics.push(
      `「${topGrowth.myBlindSpotLabel}」について、相手がどう考えているか`,
    );
  }

  return topics.slice(0, 4);
}

function generateTopicsToAvoid(
  category: RendezvousCategory,
  vectorA: MatchingVector,
  vectorB: MatchingVector,
): string[] {
  const avoid: string[] = [];

  // 距離感の不一致が大きい場合
  if (Math.abs(vectorA.distance_need - vectorB.distance_need) > 0.4) {
    avoid.push("「毎日会いたい」「一人の時間が欲しい」等の頻度に関する話題（初回は避ける）");
  }

  // 衝突スタイルの不一致
  if (Math.abs(vectorA.conflict_directness - vectorB.conflict_directness) > 0.5) {
    avoid.push("論争的なトピック（初回は共通点を見つけることに集中）");
  }

  // カテゴリ共通
  if (category === "romantic" || category === "partner") {
    avoid.push("過去の恋愛の詳細（初回は未来志向の話題を優先）");
  }

  return avoid.slice(0, 3);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Relationship Timeline Prediction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateTimeline(
  archetype: RelationshipArchetype,
  category: RendezvousCategory,
  balance: StrategyBalanceReport,
): TimelinePhase[] {
  // 基本タイムライン（カテゴリ共通）
  const timeline: TimelinePhase[] = [];

  // フェーズ1: 出会い
  timeline.push({
    phase: "出会いの衝撃",
    duration: "最初の1-2回",
    description: archetype.name === "mirror"
      ? "「似ている」という安心感。自然に会話が流れる"
      : archetype.name === "compass"
        ? "「違う」という刺激。新しい視点に驚く"
        : "互いのリズムを探り合う。心地よい距離感を見つける",
    watchOut: "第一印象に引きずられすぎない。本質は2-3回目で見える",
  });

  // フェーズ2: 探索
  timeline.push({
    phase: "互いの地図を広げる",
    duration: "1-3ヶ月",
    description: "価値観の深い部分が見え始める。「この人はこういう考え方をする」",
    watchOut: balance.balanceQuality === "imbalanced"
      ? "価値観の小さなズレが見えてくる時期。ズレを否定せず観察する"
      : "心地よさに安住せず、少しだけ踏み込んだ話題にも挑戦する",
  });

  // フェーズ3: 深化
  if (category === "romantic" || category === "partner") {
    timeline.push({
      phase: "矛盾と向き合う",
      duration: "3-6ヶ月",
      description: "互いの矛盾や盲点が見え始める。これは関係の終わりではなく、深化の始まり",
      watchOut: "衝突を避けすぎない。修復の試みが関係を強くする（Gottman研究）",
    });
  }

  return timeline;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ResonanceInsightInput {
  vectorA: MatchingVector;
  vectorB: MatchingVector;
  category: RendezvousCategory;
  overallScore: number;
  reasonCodes: ReasonCode[];
  cautionCodes: CautionCode[];
  /** SimilarityComplementarityMatrixの結果 */
  strategyBalance: StrategyBalanceReport;
  /** GrowthEdgeMatchingの結果（optional） */
  growthEdge?: GrowthEdgeResult;
  /** NarrativePhaseMatchingの結果（optional） */
  phaseMatch?: NarrativePhaseMatchResult;
}

/**
 * マッチング共鳴洞察を生成
 *
 * 全てのマッチング拡張層の結果を統合し、
 * ユーザーに提示する「この出会いの意味」を物語として構成する。
 */
export function generateResonanceInsight(
  input: ResonanceInsightInput,
): ResonanceInsight {
  const {
    vectorA,
    vectorB,
    category,
    strategyBalance,
    growthEdge,
    phaseMatch,
  } = input;

  // アーキタイプ検出
  const archetype = detectArchetype(
    strategyBalance,
    growthEdge ?? null,
    phaseMatch ?? null,
  );

  // ヘッドライン生成
  const headline = generateHeadline(archetype, strategyBalance);

  // 共鳴物語
  const resonanceNarrative = generateResonanceNarrative(
    archetype,
    strategyBalance,
    category,
  );

  // 出会いの振り付け
  const encounterChoreography = generateEncounterChoreography(
    archetype,
    growthEdge ?? null,
    category,
    vectorA,
    vectorB,
  );

  // タイムライン予測
  const relationshipTimeline = generateTimeline(
    archetype,
    category,
    strategyBalance,
  );

  // Animaコンテキスト
  const animaContext: AnimaMatchContext = {
    theme: archetype.nameJa,
    growthDirection: growthEdge?.animaGrowthTheme ?? "互いの安定した領域を共有する",
    frictionPoints: input.cautionCodes.map(cautionToFriction),
    deepeningStrategy: archetype.name === "mirror"
      ? "似ている部分から始めて、小さな違いに好奇心を向ける"
      : archetype.name === "compass"
        ? "違いを恐れず、互いの盲点を優しく照らし合う"
        : "自然なリズムで、無理に深めようとしない",
  };

  return {
    headline,
    resonanceNarrative,
    growthNarrative: growthEdge?.growthStory ?? null,
    phaseNarrative: phaseMatch?.narrative ?? null,
    encounterChoreography,
    relationshipArchetype: archetype,
    relationshipTimeline,
    animaContext,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateHeadline(
  archetype: RelationshipArchetype,
  balance: StrategyBalanceReport,
): string {
  switch (archetype.name) {
    case "mirror":
      return "似た魂が、互いを映す";
    case "compass":
      return "互いの盲点が、新しい方角を指す";
    case "rhythm":
      return "異なるテンポが、ハーモニーを生む";
    case "catalyst":
      return "出会いが、変化の触媒になる";
    case "anchor":
      return "嵐の中でも揺るがない、錨の関係";
    case "bridge":
      return "二つの世界を繋ぐ橋";
    default:
      return `${archetype.emoji} ${archetype.nameJa}`;
  }
}

function generateResonanceNarrative(
  archetype: RelationshipArchetype,
  balance: StrategyBalanceReport,
  category: RendezvousCategory,
): string {
  const valueStr = balance.valueAlignment >= 0.7
    ? "価値観の土台がしっかり重なっている"
    : balance.valueAlignment >= 0.5
      ? "価値観の方向性が近い"
      : "価値観の違いが新しい視点を提供する";

  const approachStr = balance.approachComplementarity >= 0.7
    ? "アプローチが美しく補完し合っている"
    : balance.approachComplementarity >= 0.5
      ? "互いの違いが良いバランスを生んでいる"
      : "似たアプローチを持っている";

  return `${valueStr}。そして${approachStr}。${archetype.description}`;
}

function cautionToFriction(code: CautionCode): string {
  const map: Record<string, string> = {
    silence_interpretation_gap: "沈黙の解釈の違い",
    decision_speed_gap: "意思決定のスピード差",
    depth_progression_gap: "関係の深まるペースの違い",
    distance_need_gap: "距離感の取り方の違い",
    initiative_gap: "主導性のバランス",
    emotional_expression_gap: "感情表現の温度差",
    conflict_style_gap: "衝突時のスタイルの違い",
    rhythm_gap: "生活リズムの違い",
    anxious_avoidant_risk: "不安型×回避型の緊張",
    repair_style_gap: "修復の仕方の違い",
    autonomy_tension: "自律性の緊張",
  };
  return map[code] ?? code;
}
