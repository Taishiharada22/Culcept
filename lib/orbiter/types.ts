// ============================================================
// Orbiter Phase 2: 型定義
// AIアドバイザー基盤としての学習型関係性エンジン
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CautionCode } from "@/lib/rendezvous/types";

// ── Signal Infrastructure ──

export type OrbiterSignalType =
  | "detail_view"
  | "detail_view_end"
  | "like"
  | "pass"
  | "revisit"
  | "chat_message_sent"
  | "reflection_submitted";

export interface DetailViewEndPayload {
  durationMs: number;
  scrollDepth?: number; // 0-1
}

export interface LikePassPayload {
  decision: "like" | "pass";
  timeToDecisionMs: number | null;
}

export interface RevisitPayload {
  visitNumber: number;
}

export interface ChatSignalPayload {
  threadId: string;
}

// ── Reflection Types ──

export type ReflectionQuestion =
  | "naturalness" // 自然体でいられた？ 1-5
  | "energy_after" // 会った後のエネルギー -2..+2
  | "want_to_meet_again" // また会いたい？ y/n/maybe
  | "felt_like_self" // 自分らしくいられた？ 1-5
  | "surprise" // 意外な発見があった？ freetext
  | "tension_source"; // 緊張の原因 freetext (optional)

export type ReflectionType = "pre_meeting" | "post_meeting" | "chat_phase";

export interface OrbiterReflection {
  id: string;
  userId: string;
  candidateId: string;
  reflectionType: ReflectionType;
  answers: Partial<Record<ReflectionQuestion, string | number | boolean>>;
  createdAt: string;
}

// ── User Model: Attraction Layers ──

export type AttractionLayer = "stated" | "instant" | "sustained" | "healthy";

export interface AttractionAxisWeight {
  axis: TraitAxisKey;
  weight: number; // -1..+1 (negative = attracted to low score on this axis)
  sampleCount: number;
  confidence: number; // 0-1
}

// ── User Model: Breakpoint Triggers ──

export type BreakpointOutcome =
  | "pass"
  | "like_then_stale"
  | "like_successful"
  | "unknown";

export interface BreakpointTrigger {
  cautionCode: CautionCode;
  sensitivityScore: number; // 0-1 (1 = always problematic for this user)
  historicalOutcome: BreakpointOutcome;
  sampleCount: number;
}

// ── Feature 1: Attraction Discovery ──

export interface AttractionDivergence {
  axis: TraitAxisKey;
  axisLabel: string;
  statedDirection: number; // what user says they want
  actualDirection: number; // what they actually like
  narrative: string; // 日本語: "言葉では〇〇を求めるが、実際は△△に惹かれる傾向"
}

export interface AttractionProfile {
  statedPreferences: {
    desiredTypes: string[];
    communicationStyle: string | null;
    pacePreference: string | null;
    similarityVsComplementarity: number; // 0-1
  };
  instantAttraction: {
    topAxes: AttractionAxisWeight[];
    pattern: "similar" | "complementary" | "mixed";
    confidence: number;
  } | null;
  divergences: AttractionDivergence[];
}

// ── Feature 2: Friction Forecast ──

export type FrictionSeverity = "low" | "medium" | "high";

export interface FrictionForecastItem {
  cautionCode: CautionCode;
  scenario: string; // 具体的な場面描写
  severity: FrictionSeverity;
  personalSensitivity: number; // 0-1 from breakpoint triggers
  advice: string; // 対処アドバイス
  isPersonalized: boolean; // true if based on personal history
}

export interface FrictionForecast {
  items: FrictionForecastItem[];
  overallRisk: FrictionSeverity;
  personalizedCount: number;
  narrativeSummary: string; // 1文の概要
}

// ── Feature 3: Self State Report ──

export interface AxisShiftReport {
  axis: TraitAxisKey;
  axisLabel: string;
  previousCenter: number;
  currentCenter: number;
  shiftDirection: "left" | "right" | "stable";
  shiftMagnitude: number;
  narrative: string;
}

export type DecisionQualityHint = "optimal" | "caution" | "rest_first";

export interface SelfStateReport {
  currentState: {
    energy: string;
    emotion: string;
    social: string;
    overallLabel: string; // "穏やかで安定" etc.
  } | null;
  recentShifts: AxisShiftReport[];
  attractionWarning: string | null;
  recommendation: string;
  decisionQualityHint: DecisionQualityHint;
}

// ── Feature 4: Scene Recommender ──

export type SceneType =
  | "cafe"
  | "walk"
  | "activity"
  | "group"
  | "creative"
  | "food"
  | "nature"
  | "online"
  | "event";

export interface SceneRecommendation {
  type: SceneType;
  title: string; // "静かなカフェで一対一"
  description: string; // なぜこのシーンが合うか
  reason: string; // どの軸に基づくか
  confidenceLevel: number; // 0-1
  bestFor: string; // "最初の出会い" | "2回目以降" etc.
}

export interface SceneRecommendationResult {
  scenes: SceneRecommendation[];
  bestFirst: SceneRecommendation;
  avoidScenes: { type: SceneType; reason: string }[];
}

// ── Feature 5: Relationship Trajectory ──

export type TrajectoryType =
  | "slow_deep" // ゆっくり深まる型
  | "fast_intense" // 急速に深まる型
  | "oscillating" // 揺れながら進む型
  | "parallel_growth" // 並走成長型
  | "complementary_fit" // 補完安定型
  | "creative_tension"; // 創造的緊張型

export interface TrajectoryPhase {
  name: string; // "蜜月期" | "調整期" etc.
  description: string;
  estimatedDuration: string; // "1-3ヶ月" etc.
  riskPoints: string[];
  growthOpportunities: string[];
}

export interface TrajectoryForecast {
  type: TrajectoryType;
  typeLabel: string; // Japanese label
  typeDescription: string;
  phases: TrajectoryPhase[];
  estimatedPace: "slow" | "moderate" | "fast";
  paceNarrative: string;
  keyRiskAxis: TraitAxisKey | null;
}

// ── Feature 6: Dual Outfit ──

export interface DualOutfitAdvice {
  selfExpression: {
    keywords: string[]; // "ミニマル", "クリーン" etc.
    narrative: string; // "あなたのミニマルな美意識を活かして..."
    colorTone: string; // "暖色系" | "寒色系" | "モノトーン" | "パステル"
  };
  pairHarmony: {
    overlapStyle: string; // "ふたりとも〇〇を好む"
    contrastStyle: string; // "〇〇で差をつけると面白い"
    harmonyLevel: "high" | "medium" | "divergent";
  };
  practicalTips: string[];
  sceneAdjustment: string | null;
}

// ── Voice & Headline ──

/** Orbiter の声色。状況に応じて自動選択される */
export type OrbiterTone =
  | "curious"      // 好奇心。データが少ない時、初回訪問
  | "tentative"    // 仮説提示。パターンが見え始めた時
  | "confident"    // 確信。十分なデータに基づく見解
  | "gentle"       // 穏やか。ユーザーの状態が悪い時
  | "provocative"  // 挑発。何度も見に来ているのに行動しない時
  | "honest";      // 率直。見解を修正する時、矛盾を指摘する時

/** Orbiter が今この瞬間に伝えたい意図 */
export type OrbiterIntent =
  | "first_impression"  // 初回: まだわからないが、ひとつ気になる
  | "pattern_noticed"   // パターン発見: 見え始めたものがある
  | "question"          // 問いかけ: ユーザーに考えてほしいことがある
  | "state_warning"     // 状態警告: 今は判断に適さない
  | "delta_report"      // 変化報告: 前回から変わったことがある
  | "provocation"       // 挑発: 行動を促す
  | "revision"          // 見解更新: 前の判断を撤回・修正
  | "encouragement"     // 後押し: 良い兆候を伝える
  // Phase 4: 無自覚観測
  | "avoidance_insight" // 回避パターン発見: 避けているものに気づかせる
  | "anomaly_noticed"   // パターン破壊: いつもと違う選択をした瞬間
  | "resonance"         // 越境共鳴: 性格と判断の交差点
  | "era_transition"    // 地層転換: 判断フェーズの切り替わり
  // Phase 5: 判断原理
  | "principle_revealed"  // 判断公理が明確になった
  | "shadow_encounter"    // 影の原型に向かう選択
  | "digest_updated"      // 自画像が更新された
  | "omen_detected";      // 変化の予兆を検出

/**
 * Orbiter が「今、一番伝えたいこと」。
 * ダッシュボードの先頭に1つだけ表示される。
 */
export interface OrbiterHeadline {
  message: string;         // メイン: 1-2文
  subMessage?: string;     // 補足: なぜこれを言うのか（1文以内）
  intent: OrbiterIntent;
  tone: OrbiterTone;
  confidence: number;      // 0-1: この発言の確度
}

/** Orbiter が機能する文脈情報 */
export interface OrbiterContext {
  visitCount: number;             // この候補者の詳細ページ訪問回数
  candidateState: string;         // candidate state machine
  category: string;               // rendezvous category
  hasReflection: boolean;         // リフレクション提出済みか
  daysSinceDelivery: number;      // 配信からの経過日数
  /** 有効期限までの残り日数 (null=期限なし) */
  daysUntilExpiry?: number | null;
  /** 前回の訪問からの経過時間(時間単位) */
  hoursSinceLastVisit?: number | null;
}

// ── Orbiter Memory (内的独白) ──

/**
 * メモの種類。Orbiterの「内面」を構成する。
 *
 * observation: 行動から読み取った事実 ("3回目の訪問で初めてすれ違いセクションまでスクロールした")
 * hypothesis:  事実から立てた仮説 ("この人は摩擦を恐れているのでは？")
 * question:    次に確かめたいこと ("次にlikeかpassか、その理由を見たい")
 * revision:    過去の仮説を修正 ("最初は摩擦を恐れていると思ったが、実際は慎重なだけ")
 * milestone:   節目の記録 ("初めてのlike", "5回目の再訪問")
 */
export type OrbiterMemoType =
  | "observation"
  | "hypothesis"
  | "question"
  | "revision"
  | "milestone";

/**
 * Orbiterの内的独白。
 * 人間のセラピストがセッション後にノートに書くものに相当する。
 * 蓄積されることで、Orbiterは「覚えている存在」になる。
 */
export interface OrbiterMemo {
  id: string;
  userId: string;
  candidateId: string;
  memoType: OrbiterMemoType;
  content: string;              // 日本語。Orbiterの内的思考
  confidence: number;           // 0-1。この思考の確度
  linkedMemoId: string | null;  // revision の場合、修正対象のメモID
  metadata: {
    visitCount?: number;        // このメモが生成された時の訪問回数
    triggerSignal?: string;     // きっかけとなったシグナル
    relatedAxis?: string;       // 関連する軸
    previousContent?: string;   // revision時: 修正前の内容
    [key: string]: unknown;
  };
  createdAt: string;
}

/**
 * Orbiterの記憶状態。Voice Engineに渡される。
 * 「前回何を言ったか」「どんな仮説を持っているか」を保持する。
 */
export interface OrbiterMemoryState {
  /** この候補者に関する全メモ (最新順, 最大20件) */
  memos: OrbiterMemo[];
  /** 最新の仮説 (あれば) */
  latestHypothesis: OrbiterMemo | null;
  /** 未検証の質問 (あれば) */
  pendingQuestion: OrbiterMemo | null;
  /** マイルストーン数 */
  milestoneCount: number;
  /** 仮説が修正された回数 (Orbiterの成長度合い) */
  revisionCount: number;
}

// ── Temporal Pulse ──

/**
 * 時間に関する知覚。Orbiterが「今」をどう感じているか。
 */
export interface TemporalPulse {
  /** 切迫度: 0=余裕あり, 1=期限間近 */
  urgency: number;
  /** ユーザーの訪問リズム */
  visitRhythm: "first" | "regular" | "returning_after_gap" | "obsessive";
  /** マイルストーン検知 */
  milestone: OrbiterMilestone | null;
}

export type OrbiterMilestoneType =
  | "first_view"         // 初めてこの人を見た
  | "first_revisit"      // 初めて再訪問した
  | "deep_engagement"    // 長時間滞在 (>3min)
  | "decision_point"     // 期限が近い
  | "pattern_emerging"   // 5回以上の判断データ蓄積
  | "first_mutual"       // 初めてのマッチ
  | "reflection_given";  // リフレクション提出

export interface OrbiterMilestone {
  type: OrbiterMilestoneType;
  narrative: string;    // "初めての再訪問。何かが引っかかっている。"
  significance: number; // 0-1
}

// ── Cross-Candidate Patterns (候補者横断パターン) ──

/**
 * ユーザーの全候補者を横断して見えるパターン。
 * 個別の候補者分析では見えない、ユーザー自身の判断構造を捉える。
 *
 * 人間のアドバイザーが言う:
 * 「あなた、いつも〇〇なタイプをpassして、△△なタイプをlikeしますね」
 * 「最近、判断が早くなっている。自分の軸が固まってきた証拠かも」
 */
export interface CrossCandidatePattern {
  /** パターンの種類 */
  type: CrossPatternType;
  /** 日本語のナラティブ */
  narrative: string;
  /** 確度 */
  confidence: number;
  /** 関連する軸 (あれば) */
  relatedAxes?: TraitAxisKey[];
  /** データポイント数 */
  sampleCount: number;
}

export type CrossPatternType =
  | "consistent_preference"     // 一貫した好み ("いつも社交的な人を選ぶ")
  | "avoidance_pattern"         // 一貫した回避 ("内向的な人を避ける傾向")
  | "contradiction"             // 矛盾した行動 ("安定を求めると言うが、刺激的な人を選ぶ")
  | "growth_signal"             // 成長の兆候 ("判断速度が上がっている", "選択の幅が広がっている")
  | "repetition_warning"        // 繰り返しの警告 ("過去にうまくいかなかったパターンを繰り返している")
  | "decision_style"            // 判断スタイル ("直感型: 30秒以内に決める", "熟考型: 必ず3回以上訪問")
  | "friction_tolerance";       // 摩擦耐性 ("高摩擦の相手でも選ぶ傾向がある")

/**
 * ユーザーの判断パターンの全体像。
 * Orbiter が「この人はこういう人間だ」と言える根拠。
 */
export interface UserJudgmentProfile {
  /** 検出されたパターン (最大5件, 確度順) */
  patterns: CrossCandidatePattern[];
  /** 判断データの総数 */
  totalDecisions: number;
  /** 平均判断時間 (ms, null=計測不可) */
  avgDecisionTimeMs: number | null;
  /** 判断の傾向: like率 */
  likeRate: number;
}

// ── Orbiter Maturity Arc ──

/**
 * Orbiterの成熟段階。ユーザーとの関係が深まるにつれて進化する。
 *
 * guide:    初期。ユーザーの知らないことを教える。発言量が多い。
 * mirror:   中期。パターンを映し返す。問いかけが増える。
 * coach:    後期。ユーザーが自分で気づける質問をする。発言量が減る。
 * witness:  最終。成長を見届ける。静かに後ろに立つ。
 */
export type OrbiterMaturityStage = "guide" | "mirror" | "coach" | "witness";

/**
 * 成熟度の連続スコア (0-100)。
 * 5つの因子 (各0-20) から構成される。
 * 固定閾値ではなく滑らかに変化し、段階移行をリアルに追跡する。
 */
export interface OrbiterMaturityScore {
  total: number; // 0-100
  factors: {
    decisionVolume: number;         // 0-20 判断データ量
    consistency: number;            // 0-20 判断の一貫性
    reflectionDepth: number;        // 0-20 内省の深さ
    revisionOpenness: number;       // 0-20 仮説修正への開放性
    contradictionAwareness: number; // 0-20 矛盾認識
  };
}

export interface OrbiterMaturity {
  stage: OrbiterMaturityStage;
  /** 連続的な成熟度スコア */
  score: OrbiterMaturityScore;
  /** ステージの判定根拠 */
  reason: string;
  /** 沈黙すべきか (witness段階 or データ不足) */
  shouldBeSilent: boolean;
  /** 沈黙の理由 (shouldBeSilent=true の場合) */
  silenceReason?: string;
}

// ── Change Reporting (Delta) ──

export type DeltaType =
  | "decision_speed_change"     // 判断速度の変化
  | "preference_shift"          // 好みの軸の変化
  | "friction_tolerance_change" // 摩擦耐性の変化
  | "visit_pattern_change"      // 訪問パターンの変化
  | "confidence_change";        // 判断の確信度の変化

export interface DeltaItem {
  type: DeltaType;
  description: string;  // "迷いが減っている" etc.
  magnitude: number;     // 0-1
}

export interface OrbiterDelta {
  items: DeltaItem[];
  overallDirection: "growing" | "shifting" | "stable" | "unknown";
  narrative: string;
}

// ── Next Move Suggestions ──

export type NextMoveType =
  | "try_different"   // いつもと違うことを試す
  | "slow_down"       // ペースを落とす
  | "focus_one"       // 一人に集中する
  | "compare"         // 比較してみる
  | "reflect"         // 立ち止まって考える
  | "act_now";        // 今すぐ行動する

export interface NextMoveSuggestion {
  type: NextMoveType;
  suggestion: string;       // ≤30文字
  reason: string;
  experimentGoal: string;
  priority: number;         // 0-1
}

// ── Branching Reflection ──

export type ReflectionTriggerContext =
  | "post_like"
  | "post_pass"
  | "post_chat"
  | "revisit_hesitation"
  | "mutual_liked";

export interface ReflectionNode {
  id: string;
  question: string;
  inputType: "scale" | "choice" | "freetext";
  options?: { label: string; value: string; nextNodeId?: string }[];
  scaleRange?: { min: number; max: number; labels: [string, string] };
  nextNodeId?: string;
  isTerminal?: boolean;
}

export interface ReflectionFlow {
  id: string;
  triggerContext: ReflectionTriggerContext;
  rootNode: ReflectionNode;
}

export interface BranchingReflectionResult {
  flowId: string;
  answers: { nodeId: string; value: string | number }[];
  completedAt: string;
}

// ── Phase 4: 無自覚観測 (Unconscious Observation) ──

// ── Feature 1: 回避地図 (Avoidance Cartography) ──

/** 回避の性質: 意識的 (即断pass) vs 無意識 (深く見てから避ける) */
export type AvoidanceQuality = "conscious" | "unconscious";

/** 一つの回避軸の検出結果 */
export interface AvoidanceAxis {
  axis: TraitAxisKey;
  axisLabel: string;
  /** 回避シグナルの強度 0-1 */
  strength: number;
  /** 意識的回避 (fast pass) vs 無意識回避 (slow pass after deep viewing) */
  quality: AvoidanceQuality;
  /** この軸方向でpassした回数 */
  sampleCount: number;
  /** 回避されている方向 (negative = 左極, positive = 右極) */
  avoidedDirection: number;
}

/** 言動の矛盾: 「欲しい」と言っているのに避けている */
export interface AvoidanceParadox {
  axis: TraitAxisKey;
  axisLabel: string;
  statedDesire: string;
  actualAvoidance: string;
  narrative: string;
}

/** 回避地図: ユーザーのネガティブスペース */
export interface AvoidanceMap {
  /** 回避軸 (最大5, strength順) */
  axes: AvoidanceAxis[];
  /** stated ≠ avoided の矛盾 */
  paradoxes: AvoidanceParadox[];
  /** 無意識回避の比率 (0 = 全て意識的, 1 = 全て無意識) */
  unconsciousRatio: number;
  /** 総合的な洞察 */
  insight: string | null;
  confidence: number;
}

// ── Feature 2: 異常アーカイブ (Anomaly Archive) ──

export type AnomalyType =
  | "pattern_break"    // expected like → got pass (or vice versa)
  | "surprising_pass"  // matched attraction but passed
  | "speed_anomaly"    // decision time ≫ or ≪ average
  | "revisit_anomaly"; // deep engagement then rejection

/** パターンを壊す判断の記録 */
export interface OrbiterAnomaly {
  id: string;
  userId: string;
  candidateId: string;
  anomalyType: AnomalyType;
  /** 異常の説明 */
  description: string;
  /** クロスパターンに基づく予測結果 */
  expectedOutcome: string;
  /** 実際の結果 */
  actualOutcome: string;
  /** 異常の重要度 0-1 */
  significance: number;
  /** 遡及的にパターン化したか */
  becamePattern: boolean;
  metadata: {
    relatedAxes?: TraitAxisKey[];
    decisionTimeMs?: number;
    [k: string]: unknown;
  };
  createdAt: string;
}

/** 異常アーカイブ: パターン破壊の蓄積 */
export interface AnomalyArchive {
  /** 直近の異常 (最大5) */
  recent: Omit<OrbiterAnomaly, "id" | "userId" | "createdAt">[];
  totalCount: number;
  /** 過去の異常が新パターンになったか */
  hasPatternShift: boolean;
  /** 遡及的洞察: 過去の異常が今の行動と繋がった時 */
  retrospectiveInsight: string | null;
}

// ── Feature 3: 越境共鳴 (Cross-Domain Resonance) ──

export type ResonanceCorrelation =
  | "complementary_seeking"    // 自分と反対のものに惹かれる
  | "similarity_seeking"       // 自分と似たものに惹かれる
  | "safety_friction_link"     // 安全軸が摩擦感度を説明する
  | "unexpected_correlation";  // 回避軸 = 自分の強い軸 (自己回避)

/** 越境共鳴の一つの洞察 */
export interface ResonanceInsight {
  source: "stargazer" | "stargazer_safety" | "cross_domain";
  correlation: ResonanceCorrelation;
  stargazerAxis: TraitAxisKey;
  stargazerAxisLabel: string;
  orbiterPattern?: string;
  selfScore: number;
  attractionWeight: number;
  insight: string;
  confidence: number;
}

/** 越境共鳴: Stargazer性格 × Orbiter判断の交差 */
export interface CrossDomainResonance {
  /** 共鳴洞察 (最大3) */
  insights: ResonanceInsight[];
  overallTheme: "complementary_seeker" | "similarity_seeker" | "complex" | null;
  safetyFrictionLink: boolean;
}

// ── Feature 4: 判断の地層 (Decision Stratigraphy) ──

export type EraType =
  | "exploration"      // 探索期: 広いnet, high like rate, varied axes
  | "focus"            // 収束期: narrowing, consistent axes
  | "wandering"        // 漂流期: no clear pattern
  | "deepening"        // 深化期: revisiting, slow decisions
  | "crystallization"; // 結晶期: strong consistent prefs, fast decisions

/** 判断の一時代 */
export interface DecisionEra {
  type: EraType;
  /** 日本語ラベル: "探索期", "収束期", etc. */
  label: string;
  /** 時系列の順番 (0-based) */
  index: number;
  startDate: string;
  decisionCount: number;
  characterization: string;
  metrics: {
    likeRate: number;
    avgDecisionTimeMs: number | null;
    topAxes: TraitAxisKey[];
  };
}

/** 時代の転換洞察 */
export interface EraTransitionInsight {
  fromEra: EraType;
  toEra: EraType;
  /** 前の時代を振り返る洞察 */
  retrospective: string;
  trigger: string;
}

/** 判断の地層: ユーザーの判断の旅の時代区分 */
export interface DecisionStratigraphy {
  eras: DecisionEra[];
  currentEra: DecisionEra | null;
  latestTransition: EraTransitionInsight | null;
  spanDays: number;
}

// ── Phase 5: 判断原理 (Decision Principles) ──

// ── Feature 1: 判断原理マップ (Decision Principle Map) ──

/** 判断の公理軸。-1〜+1 の連続スペクトル */
export type PrincipleAxis =
  | "safety_adventure"       // 安全 ←→ 冒険
  | "closeness_distance"     // 密着 ←→ 距離
  | "similarity_complement"  // 類似 ←→ 補完
  | "intuition_deliberation" // 直感 ←→ 熟考
  | "stability_growth";      // 安定 ←→ 成長

/** 一つの判断公理 */
export interface DecisionPrinciple {
  axis: PrincipleAxis;
  /** 日本語ラベル: "安全 ↔ 冒険" */
  label: string;
  /** -1 (left pole) to +1 (right pole) */
  score: number;
  confidence: number;
  /** 根拠: "高摩擦の相手を3回連続で選んだ" */
  evidence: string;
  /** 反証の数 */
  exceptions: number;
  /** 例外が閾値を超えた時に出現する抑圧された反対の原理 */
  counterPrinciple: string | null;
}

/** 言動と行動の乖離 */
export interface PrincipleTension {
  axis: PrincipleAxis;
  /** 表明された方向 */
  stated: number;
  /** 実際の行動方向 */
  actual: number;
  /** |stated - actual| */
  gap: number;
  /** "口では冒険と言うが、安全を選んでいる" */
  insight: string;
}

/** 判断原理マップ: ユーザーの判断の構造的法則 */
export interface PrincipleMap {
  /** 5軸の公理 */
  principles: DecisionPrinciple[];
  /** 最も明確な軸 */
  dominantPrinciple: PrincipleAxis;
  /** 内的葛藤 (statedと actual の乖離) */
  tension: PrincipleTension | null;
  /** 総合ナラティブ */
  narrative: string;
  confidence: number;
}

// ── Feature 2: 原型共鳴 (Archetype Resonance) ──

/** Stargazer 27原型 × Orbiter選択パターンの交差 */
export interface ArchetypeResonance {
  /** ユーザーの原型コード (e.g. "PEA") */
  archetypeCode: string;
  archetypeName: string;
  /** 影の原型コード */
  shadowCode: string;
  shadowName: string;
  /** 成長の鍵 (原型定義から) */
  growthKey: string;
  /** 影への引力: likeした相手のうち影方向の割合 (0-1) */
  growthPull: number;
  /** 安全圏内率: likeした相手のうち自分と同方向の割合 (0-1) */
  comfortRatio: number;
  /** 影の緊張 (原型定義の shadowTension) */
  shadowTension: string;
  /** 原型と選択の関係についての洞察 */
  insight: string;
  confidence: number;
}

// ── Feature 3: 存在の要約 (Existential Digest) ──

/** 存在の要約の一セクション */
export interface ExistentialSection {
  /** セクション名: "原理" | "成長の縁" | "死角" | "旅路" */
  title: string;
  /** ≤80文字 */
  content: string;
}

/** 全エンジンを統合した「生きた自画像」 */
export interface ExistentialDigest {
  /** 4つのセクション */
  sections: ExistentialSection[];
  /** 全体の一文要約 (≤50文字) */
  essence: string;
  /** 前回から変化したセクションのインデックス */
  changedSections: number[];
  generatedAt: string;
  confidence: number;
}

/** DB永続化用 */
export interface StoredDigest {
  userId: string;
  sections: ExistentialSection[];
  essence: string;
  createdAt: string;
}

// ── Feature 4: 予兆エンジン (Omen Engine) ──

export type OmenType =
  | "era_boundary"          // 地層の境界が近い
  | "principle_shift"       // 判断原理が揺らいでいる
  | "shadow_approach"       // 影に近づいている
  | "pattern_dissolution";  // パターンが溶けている

/** 変化の予兆 */
export interface Omen {
  type: OmenType;
  /** シグナル: "判断速度が加速している" */
  signal: string;
  /** 予測: "次の5回で選び方が変わる可能性がある" */
  prediction: string;
  confidence: number;
  /** "近い将来" | "中期的に" */
  timeHorizon: string;
}

/** 予兆の予報 */
export interface OmenForecast {
  /** 検出された予兆 (最大2) */
  omens: Omen[];
  /** 変化への準備度 (0-1) */
  overallReadiness: number;
  narrative: string | null;
}

// ── Aggregated Output ──

export interface OrbiterIntelligence {
  headline: OrbiterHeadline;
  attractionProfile: AttractionProfile | null;
  frictionForecast: FrictionForecast | null;
  selfStateReport: SelfStateReport | null;
  sceneRecommendation: SceneRecommendationResult | null;
  trajectoryForecast: TrajectoryForecast | null;
  dualOutfit: DualOutfitAdvice | null;
  /** Orbiter の記憶状態 (クライアントには一部のみ公開) */
  memoryDigest?: {
    hasHypothesis: boolean;
    revisionCount: number;
    latestMilestone: string | null;
  };
  /** 時間知覚 */
  temporalPulse?: TemporalPulse;
  /** 候補者横断パターン */
  crossPatterns?: CrossCandidatePattern[];
  /** Orbiter の成熟度 */
  maturity?: OrbiterMaturity;
  /** ユーザーの選び方の変化 */
  delta?: OrbiterDelta | null;
  /** 次の一手提案 */
  nextMove?: NextMoveSuggestion | null;
  /** 分岐型リフレクションフロー */
  reflectionFlow?: ReflectionFlow | null;
  // Phase 4: 無自覚観測
  /** 回避地図 */
  avoidanceMap?: AvoidanceMap | null;
  /** 異常アーカイブ */
  anomalyArchive?: AnomalyArchive | null;
  /** 越境共鳴 */
  resonance?: CrossDomainResonance | null;
  /** 判断の地層 */
  stratigraphy?: DecisionStratigraphy | null;
  // Phase 5: 判断原理
  /** 判断原理マップ */
  principleMap?: PrincipleMap | null;
  /** 原型共鳴 */
  archetypeResonance?: ArchetypeResonance | null;
  /** 存在の要約 */
  existentialDigest?: ExistentialDigest | null;
  /** 予兆 */
  omenForecast?: OmenForecast | null;
}
