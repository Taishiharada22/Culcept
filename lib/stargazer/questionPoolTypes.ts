// lib/stargazer/questionPoolTypes.ts
// 動的質問プール — 次元定義・型・ラベル

import type { TraitAxisKey } from "./traitAxes";
import type { QuestionVariant, ObservationLayer } from "./questionVariants";

// ═══ Dimension Enums ═══

/** 関係対象 — 同じ軸でも相手によって回答が変わる */
export type SubjectContext =
  | "self"
  | "friends"
  | "romantic_partner"
  | "family"
  | "coworkers"
  | "strangers"
  | "acquaintances"
  | "authority"
  | "subordinates"
  | "online_people";

/** 気分・エネルギー状態 — 状態によって揺れる */
export type EnergyTarget =
  | "high_energy"
  | "low_energy"
  | "stressed"
  | "relaxed"
  | "neutral";

/** 質問の表現スタイル — 聞き方で捉え方が変わる */
export type PhrasingStyle =
  | "direct"
  | "scenario"
  | "metaphor"
  | "binary"
  | "memory_recall"
  | "hypothetical"
  | "projection"         // 影絵: 他者の行動への評価で自分を映す
  | "meta_observation";  // メタ観測: 自分の行動パターンへの気づきを問う

/** 観測の角度 — どこから切り込むか */
export type ObservationAngle =
  | "self_reflection"
  | "comparison"
  | "hypothetical"
  | "past_recall"
  | "future_projection"
  | "third_party_view"     // 第三者視点: 「友人はあなたをどう紹介する？」
  | "projection_judgment";  // 投影的判断: 他者を評価することで自分が映る

export type QuestionSource = "hardcoded" | "ai" | "ai_seed" | "ai_lens" | "ai_expand" | "manual";

// ═══ Probe Type (掘り方 — depth_scoreとは独立) ═══

/** 掘り方の角度 — TS union for known types, DB is TEXT for AI extensibility */
export type ProbeType =
  | "surface"         // 表面反応
  | "reason"          // 理由・動機
  | "trigger"         // きっかけ・起源
  | "exception"       // 例外条件
  | "contradiction"   // 矛盾・揺れ
  | "facade_gap"      // 本音と建前
  | "defense"         // 防衛反応
  | "unchosen"        // 未選択行動
  | "memory_link";    // 記憶起点

/** AI発見の新probe_typeも受け入れる拡張型 */
export type ProbeTypeExtended = ProbeType | (string & {});

export const ALL_PROBE_TYPES: ProbeType[] = [
  "surface", "reason", "trigger", "exception",
  "contradiction", "facade_gap", "defense", "unchosen", "memory_link",
];

export const PROBE_TYPE_LABELS: Record<ProbeType, string> = {
  surface: "表面観測（どう反応するか）",
  reason: "理由探査（なぜそうするか）",
  trigger: "起点探査（何がきっかけか）",
  exception: "例外条件（いつ逆になるか）",
  contradiction: "矛盾・揺れ（自己矛盾はどこか）",
  facade_gap: "本音と建前（見せる自分と本当の自分）",
  defense: "防衛反応（自分を守る時のパターン）",
  unchosen: "未選択行動（選ばなかった道から見える本音）",
  memory_link: "記憶起点（過去の経験が今にどう影響するか）",
};

export const PROBE_TYPE_INSTRUCTIONS: Record<ProbeType, string> = {
  surface: "ユーザーの直感的な反応・行動パターンを問う",
  reason: "その反応をする理由・動機を掘り下げる。「なぜ」ではなく場面で引き出す",
  trigger: "その傾向が形成されたきっかけ・原体験を呼び起こす",
  exception: "通常と逆の反応が出る条件・相手・状態を問う。「いつもと違う自分」を引き出す",
  contradiction: "ユーザー自身が気づいていない矛盾・二面性を浮き彫りにする",
  facade_gap: "社会的に見せている自分と、内面で感じている本音のズレを問う",
  defense: "脅威や不安を感じた時に無自覚に発動する自己防衛のパターンを問う",
  unchosen: "実際には選ばなかった行動・避けた道から、隠れた欲求や恐れを引き出す",
  memory_link: "特定の記憶や経験が今の判断パターンにどう繋がっているかを問う",
};

// ═══ Question Status (cooling制御) ═══

export type QuestionStatus = "active" | "cooling" | "archived";

// ═══ 日本語ラベル ═══

export const SUBJECT_LABELS: Record<SubjectContext, string> = {
  self: "自分自身",
  friends: "友人",
  romantic_partner: "恋愛相手",
  family: "家族",
  coworkers: "職場の人",
  strangers: "初対面の人",
  acquaintances: "知り合い程度の人",
  authority: "目上の人・上司",
  subordinates: "後輩・部下",
  online_people: "ネット上の人",
};

export const ENERGY_LABELS: Record<EnergyTarget, string> = {
  high_energy: "エネルギーが高い時",
  low_energy: "疲れている時",
  stressed: "ストレスを感じている時",
  relaxed: "リラックスしている時",
  neutral: "特に普通の状態",
};

export const PHRASING_LABELS: Record<PhrasingStyle, string> = {
  direct: "直接的な質問",
  scenario: "シナリオ型（場面想像）",
  metaphor: "比喩・たとえ",
  binary: "二択・対比",
  memory_recall: "記憶呼び起こし",
  hypothetical: "仮定法（もし〜なら）",
  projection: "投影型（他者の行動への評価）",
  meta_observation: "メタ観測（自分の行動への気づき）",
};

export const PHRASING_INSTRUCTIONS: Record<PhrasingStyle, string> = {
  direct: "直接的に「今の自分は〜？」「あなたは〜？」と問う形式",
  scenario:
    "「こんな場面を想像して...」と具体的シナリオを提示し、その中での反応を問う形式",
  metaphor:
    "比喩やたとえを使って間接的に問う形式（例: 天気、色、動物、風景で表すなら）",
  binary:
    "「AとBならどちら？」「〜か、それとも〜か？」の二項対立から内面を引き出す形式",
  memory_recall:
    "「最近こんなことがあった？」「最後に〜したのはいつ？」と具体的記憶を呼び起こす形式",
  hypothetical:
    "「もし〜だったら？」「〜が起きたらどうする？」と仮定で問う形式",
  projection:
    "他者の行動や判断を提示し、それへの評価・反応を問う形式。評価に本人の価値観が映る",
  meta_observation:
    "「最近〇〇が増えていますが、なぜだと思いますか？」と自分の行動パターンへの気づきを問う形式",
};

export const ANGLE_LABELS: Record<ObservationAngle, string> = {
  self_reflection: "内省（自分を見つめる）",
  comparison: "他者比較（人との違いに気づく）",
  hypothetical: "仮定（もしもの世界で考える）",
  past_recall: "過去想起（経験を振り返る）",
  future_projection: "未来投影（これからの自分を想像する）",
  third_party_view: "第三者視点（他者から見た自分）",
  projection_judgment: "投影的判断（他者評価に映る自分）",
};

export const ANGLE_INSTRUCTIONS: Record<ObservationAngle, string> = {
  self_reflection: "自分自身の内面を静かに見つめ直す視点から問う",
  comparison:
    "他者や過去の自分と比較する視点から問う（「周りの人と比べて」「以前の自分と比べて」）",
  hypothetical:
    "仮の状況を想像させる視点から問う（「もしこんな状況なら」）",
  past_recall:
    "過去の具体的な経験を振り返る視点から問う（「思い出してみて」）",
  future_projection:
    "未来の自分や状況を投影する視点から問う（「1年後」「理想の状態では」）",
  third_party_view:
    "第三者（友人・家族・同僚）の目から自分を見る視点（「あなたの友人ならどう言う？」）",
  projection_judgment:
    "他者の行動を評価することで無意識に自分の基準が漏れる視点（投影法の原理）",
};

// ═══ 全次元値リスト ═══

export const ALL_SUBJECTS: SubjectContext[] = [
  "self",
  "friends",
  "romantic_partner",
  "family",
  "coworkers",
  "strangers",
  "acquaintances",
  "authority",
  "subordinates",
  "online_people",
];

export const ALL_ENERGIES: EnergyTarget[] = [
  "high_energy",
  "low_energy",
  "stressed",
  "relaxed",
  "neutral",
];

export const ALL_PHRASING_STYLES: PhrasingStyle[] = [
  "direct",
  "scenario",
  "metaphor",
  "binary",
  "memory_recall",
  "hypothetical",
  "projection",
  "meta_observation",
];

export const ALL_ANGLES: ObservationAngle[] = [
  "self_reflection",
  "comparison",
  "hypothetical",
  "past_recall",
  "future_projection",
  "third_party_view",
  "projection_judgment",
];

// ═══ Observation Lens ═══

export interface ObservationLens {
  id: string;
  nameJa: string;
  description: string;
  probingTargets: string[];
  relatedAxes: string[];
  exampleSituations: string[];
  discoverySource: string;
  status: "proposed" | "active" | "cooling" | "exhausted" | "archived";
  questionsGenerated: number;
  qualityMetrics: LensQualityMetrics;
  avgQuality: number;
}

export interface LensQualityMetrics {
  responseRate?: number;
  skipRate?: number;
  completionRate?: number;
  answerEntropy?: number;
  perProbeQuality?: Record<string, number>;
  perDepthQuality?: Record<number, number>;
}

// ═══ Question Quality Metrics ═══

export interface QuestionQualityMetrics {
  responseRate?: number;
  skipRate?: number;
  completionRate?: number;
  answerEntropy?: number;
  avgResponseTimeMs?: number;
  followupYield?: number;
}

// ═══ Depth Readiness ═══

export type DataConfidence = "none" | "low" | "medium" | "high";

export interface DepthReadiness {
  maxSafeDepth: number;
  readinessScore: number;
  dataConfidence: DataConfidence;
  factors: {
    answerStability: number;
    skipRate: number;
    avgResponseTime: number;
    answerConsistency: number;
    deepQuestionReception: number;
    lensObservationDepth: Record<string, number>;
  };
}

// ═══ Context Snapshot (深化質問の生成文脈) ═══

export interface ContextSnapshot {
  generatedAt: string;
  generationBatchId: string;
  parentAnswers: {
    questionKey: string;
    prompt: string;
    chosenOptionLabel: string;
    score: number;
    probeType: string;
    depthScore: number;
  }[];
  lensContext: {
    lensId: string;
    lensNameJa: string;
    relatedAxes: string[];
  };
  aiReasoning?: string;
}

// ═══ Pool Question (DB row → runtime) ═══

export interface PoolQuestion {
  id: string;
  questionKey: string;
  variant: QuestionVariant;
  axisId: TraitAxisKey;
  layer: ObservationLayer;
  subject: SubjectContext;
  energyTarget: EnergyTarget;
  phrasingStyle: PhrasingStyle;
  angle: ObservationAngle;
  source: QuestionSource;
  qualityScore: number;
  timesShown: number;
  timesAnswered: number;
  isActive: boolean;
  // Growth Engine extensions
  primaryLensId?: string;
  secondaryLensIds?: string[];
  depthScore: number;
  probeType: ProbeTypeExtended;
  parentQuestionKeys?: string[];
  questionStatus: QuestionStatus;
  uxHint?: string;
  qualityMetrics: QuestionQualityMetrics;
}

// ═══ Selection Criteria ═══

export interface QuestionSelectionCriteria {
  axisId: TraitAxisKey;
  layer?: ObservationLayer;
  preferredSubjects?: SubjectContext[];
  preferredEnergy?: EnergyTarget;
  preferredStyles?: PhrasingStyle[];
  preferredAngles?: ObservationAngle[];
  excludeQuestionKeys?: string[];
  minQuality?: number;
  limit?: number;
  // Growth Engine extensions
  preferredLensIds?: string[];
  preferredProbeTypes?: ProbeTypeExtended[];
  maxDepth?: number;
  userSeed?: string;
}

// ═══ Generation Request ═══

export interface QuestionGenerationRequest {
  axisId: TraitAxisKey;
  subject: SubjectContext;
  energyTarget: EnergyTarget;
  phrasingStyle: PhrasingStyle;
  angle: ObservationAngle;
  count: number;
  existingPrompts?: string[];
  // Growth Engine extensions
  lensId?: string;
  secondaryLensIds?: string[];
  depthScore?: number;
  probeType?: ProbeTypeExtended;
  parentPrompts?: { prompt: string; probeType: string; depth: number }[];
}

// ═══ Lens Discovery Request ═══

export interface LensDiscoveryRequest {
  poolStats: PoolStats;
  existingLenses: ObservationLens[];
  focusCategory?: string;
  count: number;
}

// ═══ Question Expansion Request ═══

export interface QuestionExpansionRequest {
  lens: ObservationLens;
  targetDepth: number;
  probeType: ProbeTypeExtended;
  axisId: TraitAxisKey;
  subject: SubjectContext;
  shallowerQuestions: { prompt: string; probeType: string; depth: number }[];
  count: number;
  existingPrompts?: string[];
}

// ═══ Pool Stats ═══

export interface PoolStats {
  totalActive: number;
  byAxis: Record<string, number>;
  bySubject: Record<string, number>;
  byStyle: Record<string, number>;
  byLens: Record<string, number>;
  byProbeType: Record<string, number>;
  byDepth: Record<number, number>;
  avgQuality: number;
}

// ═══ AI Output (before DB write) ═══

export interface GeneratedQuestion {
  prompt: string;
  options: { label: string; score: number }[];
  reasoning?: string;
}
