// lib/talk/intentTranslation/types.ts
// 意図翻訳エンジン — Phase 1 型定義
//
// 学術的基盤:
//   - Kruger & Epley (2005): テキスト意図伝達精度 56%（対面75%）
//   - Searle (1975): 発話行為理論（拡張分類を適用）
//   - Walther (1992): Social Information Processing Theory
//   - Vinograd et al. (2020): 性格特性による解釈バイアス
//   - Vanderbilt et al. (2025): 愛着スタイルとテキスト解釈
//
// 設計原則:
//   - 既存ロジック（temperatureGapDetector, ruptureDetection, contradictionDetector）を退化させない
//   - 断定しない。「〜の可能性がある」形式で提示
//   - 介入頻度を制限し、alert fatigue を防ぐ

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 発話行為分類（拡張 Searle 分類）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Searle の原典5分類 + 親密関係テキストで頻出する5種を追加。
 * Gottman の "bid for connection" 研究に基づく。
 */
export type SpeechActType =
  // Searle 原典
  | "inform"          // 事実を伝える
  | "request"         // 何かを求める
  | "suggest"         // 提案する
  | "warn"            // 警告する
  | "promise"         // 約束する
  | "apologize"       // 謝罪する
  | "complain"        // 不満を述べる
  | "reassure"        // 安心させる
  | "tease"           // からかう（好意的）
  | "express_emotion" // 感情を表出する
  // 親密関係拡張
  | "bid_for_connection" // 繋がりを求める（Gottman）
  | "set_boundary"       // 境界を設定する
  | "withdraw"           // 距離を取る
  | "test"               // 相手の反応を試す
  | "passive_aggress";   // 受動的攻撃

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 誤読タイプ分類
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** テキスト誤読の7分類 — リサーチに基づく頻度・ダメージ順 */
export type MisreadType =
  | "tone_mismatch"         // 冗談↔真剣の取り違え（最高頻度）
  | "intent_mismatch"       // 心配→詮索、提案→命令
  | "urgency_mismatch"      // 急いでいないのに急かされてると感じる
  | "intensity_mismatch"    // 軽い不満→激怒
  | "boundary_mismatch"     // 距離を取りたい→拒絶（最高ダメージ）
  | "sarcasm_failure"       // 皮肉が文字通りに取られる
  | "silence_misread";      // 返信の遅さ→怒り/無関心

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAD 感情モデル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Valence-Arousal-Dominance 3次元連続モデル */
export type VADVector = {
  /** 快-不快 (-1.0 ~ +1.0) */
  valence: number;
  /** 覚醒度 (0.0 ~ 1.0) */
  arousal: number;
  /** 支配-服従 (-1.0 ~ +1.0) */
  dominance: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 意図解釈
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 単一の解釈候補 */
export type IntentInterpretation = {
  /** 解釈内容（ユーザー表示用、日本語） */
  reading: string;
  /** 発話行為分類 */
  speechAct: SpeechActType;
  /** この解釈の確率 (0.0-1.0) */
  probability: number;
  /** 受信者への感情的インパクト */
  emotionalImpact: VADVector;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 誤読リスクスコア構成要素
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 誤読リスクの分解要素（デバッグ・分析用） */
export type MisreadRiskFactors = {
  /** メッセージの曖昧性 (0.5-2.0) */
  ambiguityFactor: number;
  /** 受信者の感受性 (0.5-2.0) — attachment_style, reassurance_need, emotional_variability */
  receiverSensitivity: number;
  /** 会話の緊張度 (0.5-2.0) — 温度差、rupture履歴 */
  contextRisk: number;
  /** 話題の繊細さ (0.5-3.0) — 関係性・金銭・将来は高い */
  topicWeight: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 日本語曖昧表現シグナル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 曖昧表現の検出結果 */
export type AmbiguousExpressionHit = {
  /** マッチした表現 */
  expression: string;
  /** 文字通りの意味 */
  literalMeaning: string;
  /** 推定される真の意図候補 */
  likelyIntents: Array<{
    intent: string;
    probability: number;
  }>;
  /** 判定に必要な追加文脈 */
  contextNeeded: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 敬語シフト検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KeigoLevel = "casual" | "polite" | "formal";

export type KeigoShiftSignal = {
  /** 検出されたか */
  detected: boolean;
  /** 基準レベル（直近20メッセージの平均） */
  baseline: KeigoLevel;
  /** 現在のレベル */
  current: KeigoLevel;
  /** シフト方向 */
  direction: "distance_increase" | "intimacy_increase" | "none";
  /** シフトの強度 (0.0-1.0) */
  magnitude: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 介入レベル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 三段階介入モデル — alert fatigue 防止
 * 医療分野研究: アラート80%削減で安全性維持（PMC 2024）
 */
export type InterventionLevel =
  | "silent"   // risk < 0.3: 介入なし、内部ログのみ
  | "passive"  // 0.3 ≤ risk < 0.6: タップで表示（プル型）
  | "active";  // risk ≥ 0.6: 送信前に自動表示（プッシュ型、1日3回まで）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reading Simulation 入出力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 送信側 Reading Simulation の入力 */
export type ReadingSimulationInput = {
  /** 送信予定のテキスト */
  message: string;
  /** 送信者のプロファイル（意図翻訳に必要な軸のみ） */
  senderProfile: IntentTranslationProfile;
  /** 受信者のプロファイル */
  receiverProfile: IntentTranslationProfile;
  /** 直近の会話履歴（最大5ターン） */
  conversationContext: ConversationTurn[];
  /** 関係メタデータ */
  relationshipMeta?: RelationshipMeta;
};

/** Reading Simulation の出力 */
export type ReadingSimulationResult = {
  /** 総合誤読リスクスコア (0.0-1.0) */
  misreadRisk: number;
  /** リスク構成要素 */
  riskFactors: MisreadRiskFactors;
  /** 介入レベル */
  interventionLevel: InterventionLevel;
  /** 送信者が最も伝えたい意図 */
  senderIntent: IntentInterpretation;
  /** 受信者が読みそうな解釈（確率順、最大3つ） */
  receiverInterpretations: IntentInterpretation[];
  /** ズレが検出されたか */
  gapDetected: boolean;
  /** ズレの種類 */
  gapType: MisreadType | null;
  /** 代替表現の提案（リスクが高い場合のみ） */
  rewriteSuggestion: string | null;
  /** 受信者向けコンテキストノート（Deep版、Phase 2用） */
  receiverContextNote: string | null;
  /** この分析の確信度 (0.0-1.0) */
  confidence: number;
  /** 日本語曖昧表現の検出結果 */
  ambiguousExpressions: AmbiguousExpressionHit[];
  /** 敬語シフト検出 */
  keigoShift: KeigoShiftSignal;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 意図翻訳用プロファイル（47軸から必要な軸のみ抽出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 意図翻訳に直接使用する11軸。
 * traitAxes.ts の47+軸から、意図推定・解釈バイアス予測に
 * 有効な軸のみを抽出した部分ビュー。
 */
export type IntentTranslationProfile = {
  userId: string;
  /** 率直 ↔ 配慮・外交的 (-1.0 ~ +1.0) */
  direct_vs_diplomatic: number;
  /** 愛着スタイル — 回避(-1) ↔ 安定(0) ↔ 不安(+1) */
  attachment_style: number;
  /** 安心の求め方 — 自己完結(-1) ↔ 確認型(+1) */
  reassurance_need: number;
  /** 感情の振れ幅 — 安定(-1) ↔ 変動大(+1) */
  emotional_variability: number;
  /** 対立スタイル — 回避(-1) ↔ 対決(+1) */
  conflict_style: number;
  /** 表裏の差 — 一貫(-1) ↔ 差が大きい(+1) */
  public_private_gap: number;
  /** 親密化速度 — ゆっくり(-1) ↔ 速い(+1) */
  intimacy_pace: number;
  /** 境界認識 — 緩い(-1) ↔ 明確(+1) */
  boundary_awareness: number;
  /** 自己開示の深さ — 浅い(-1) ↔ 深い(+1) */
  self_disclosure_depth: number;
  /** 感情制御 — 衝動的(-1) ↔ 制御的(+1) */
  emotional_regulation: number;
  /** 関係投資 — 省エネ(-1) ↔ 全力(+1) */
  relational_investment: number;
};

/** 意図翻訳プロファイルに使用する軸キーの一覧 */
export const INTENT_TRANSLATION_AXES: TraitAxisKey[] = [
  "direct_vs_diplomatic",
  "attachment_style",
  "reassurance_need",
  "emotional_variability",
  "conflict_style",
  "public_private_gap",
  "intimacy_pace",
  "boundary_awareness",
  "self_disclosure_depth",
  "emotional_regulation",
  "relational_investment",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 会話ターン・関係メタデータ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ConversationTurn = {
  senderId: string;
  body: string;
  createdAt: string;
};

export type RelationshipMeta = {
  /** 関係カテゴリ（友人/恋人/家族等） */
  category: "friendship" | "romantic" | "family" | "work" | "unknown";
  /** 関係の温度 (temperatureGapDetector 出力) */
  temperatureDelta?: number;
  /** 直近の rupture 有無 */
  recentRupture?: boolean;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 介入 Cooldown 管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type InterventionCooldownState = {
  /** 今日の Active 介入回数 */
  activeCountToday: number;
  /** 直近の Active 介入の連続回数（同一会話内） */
  consecutiveActiveInConversation: number;
  /** cooldown 中か（連続2回 Active → 30分 Passive 降格） */
  inCooldown: boolean;
  /** cooldown 解除時刻 */
  cooldownUntil: string | null;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: 受信側 Intent Reconstruction（意図復元）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 受信側の意図翻訳入力 */
export type IntentReconstructionInput = {
  /** 受信したメッセージ */
  receivedMessage: string;
  /** 送信者のプロファイル */
  senderProfile: IntentTranslationProfile;
  /** 受信者（自分）のプロファイル */
  receiverProfile: IntentTranslationProfile;
  /** 直近の会話履歴（最大5ターン） */
  conversationContext: ConversationTurn[];
  /** 関係メタデータ */
  relationshipMeta?: RelationshipMeta;
  /** 送信者の過去の発話パターン（同一表現の過去使用例） */
  senderPastPatterns?: SenderPastPattern[];
};

/** 送信者の過去の発話パターン（同一・類似表現の文脈） */
export type SenderPastPattern = {
  /** 過去のメッセージ本文 */
  message: string;
  /** その時の会話文脈（簡易サマリー） */
  contextSummary: string;
  /** そのメッセージの後の展開（結果的にどういう意図だったか） */
  outcome: string;
};

/** 💭表示の判定結果 */
export type BubbleHintDecision = {
  /** 💭を表示するか */
  show: boolean;
  /** 表示しない理由（デバッグ用） */
  skipReason: BubbleSkipReason | null;
  /** 表示する場合のヒント内容（日本語、1-2文） */
  hintText: string | null;
  /** ヒントの確信度 (0.0-1.0) */
  confidence: number;
  /** 誤読リスクスコア（Phase 1 と同じ計算式） */
  misreadRisk: number;
};

/** 💭を表示しない理由 */
export type BubbleSkipReason =
  | "low_risk"              // 誤読リスクが低い
  | "low_confidence"        // 確信度が低い
  | "daily_limit_reached"   // 1日の表示上限に達した
  | "cooldown"              // 同一会話でのcooldown中
  | "sender_not_profiled"   // 送信者のStargazerデータ不足
  | "short_conversation"    // 会話履歴が短すぎる
  | "user_disabled";        // ユーザーが機能をOFFにしている

/** 受信側 Intent Reconstruction の出力 */
export type IntentReconstructionResult = {
  /** 送信者の最も可能性の高い意図 */
  primaryIntent: IntentInterpretation & {
    /** この解釈の確信度 (0.0-1.0) */
    confidence: number;
  };
  /** 代替解釈（確率順、最大2つ） */
  alternativeIntents: IntentInterpretation[];
  /** 受信者向けコンテキストノート（ユーザー表示用、1-2文） */
  contextNote: string;
  /** 送信者の通常のコミュニケーションスタイルに関するメモ */
  senderStyleNote: string | null;
  /** 送信者に直接確認すべきか */
  suggestAskSender: boolean;
  /** 分析全体の確信度 (0.0-1.0) */
  confidence: number;
  /** 💭表示の判定結果 */
  bubbleHint: BubbleHintDecision;
  /** 日本語曖昧表現の検出結果 */
  ambiguousExpressions: AmbiguousExpressionHit[];
  /** 敬語シフト検出 */
  keigoShift: KeigoShiftSignal;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: 💭表示制御定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 💭表示の誤読リスク閾値（これ以上で表示対象） */
export const BUBBLE_HINT_RISK_THRESHOLD = 0.35;
/** 💭表示の確信度閾値（これ以上で表示） */
export const BUBBLE_HINT_CONFIDENCE_THRESHOLD = 0.5;
/** 1日あたりの💭表示上限 */
export const MAX_BUBBLE_HINTS_PER_DAY = 5;
/** 同一会話での💭cooldown（ミリ秒） */
export const BUBBLE_HINT_COOLDOWN_MS = 10 * 60 * 1000; // 10分

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 介入 Cooldown 管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Active 介入の1日上限 */
export const MAX_ACTIVE_INTERVENTIONS_PER_DAY = 3;
/** 連続 Active 介入でcooldownが発動する閾値 */
export const CONSECUTIVE_ACTIVE_THRESHOLD = 2;
/** cooldown 期間（ミリ秒） */
export const COOLDOWN_DURATION_MS = 30 * 60 * 1000; // 30分

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: NVC ベース共同 Alter（すれ違い翻訳・仲介）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 学術的基盤:
//   - Rosenberg (2003): Non-Violent Communication — 4要素モデル
//   - Gottman (1994): 四騎士パターン（批判・軽蔑・防��・石壁）
//   - Safran & Muran (2000): 断裂-修復モデル
//   - Fisher & Ury (1981): Getting to Yes — 立場ではなく利益を交渉
//
// 設計原則:
//   - 仲介者 ≠ 裁判官。どちらが正しいかを判定しない
//   - 両者の性格プロファイルを活用し、相手に最適な言い換えを提案
//   - 普段は透明。エスカレーションを検知したときだけ介入
//   - ユーザーの選択肢を増やす（強制しない）

/**
 * NVC（非暴力コミュニケーション）4要素の分析結果。
 * Rosenberg の原典に基づく。
 */
export type NVCDecomposition = {
  /** 事実の観測（判断を含まない記述） */
  observation: {
    text: string;
    /** 判断・評価が混ざっていないか */
    isJudgmentFree: boolean;
  } | null;
  /** 感情（自分の感情、相手への帰属ではない） */
  feelings: Array<{
    feeling: string;
    /** "self" = 自分の感情として表現 / "other_blame" = 相手のせいにしている */
    ownership: "self" | "other_blame";
  }>;
  /** ニーズ（感情の背後にある普遍的な人間のニーズ） */
  needs: Array<{
    need: string;
    /** メッセージ中に明示されているか */
    explicit: boolean;
  }>;
  /** リクエスト（具体的で実行可能な行動の依頼） */
  request: {
    text: string;
    /** "request" = 断られてもOK / "demand" = 断ると罰 / "hint" = 暗示 / "none" = なし */
    type: "request" | "demand" | "hint" | "none";
  } | null;
  /** NVC 準拠度 (0.0-1.0)。高いほど非暴力的な表現 */
  nvcScore: number;
};

/**
 * Gottman の四騎士パターン検出結果。
 * 関係破壊の予測因子として最も強い4パターン。
 */
export type FourHorsemanHit = {
  /** 検出されたパターン */
  pattern: "criticism" | "contempt" | "defensiveness" | "stonewalling";
  /** マッチした表現 */
  trigger: string;
  /** 深刻度 (0.0-1.0) */
  severity: number;
};

/**
 * Gottman カスケード検出結果（nvcAnalysis.ts で算出）。
 */
export type GottmanCascade = {
  detected: boolean;
  sequence: Array<{
    pattern: FourHorsemanHit["pattern"];
    turnIndex: number;
    senderId: string;
  }>;
  progress: number;
  reachedStonewalling: boolean;
};

/**
 * 相互エスカレーション（Tit-for-Tat）検出結果。
 */
export type ReciprocalEscalation = {
  detected: boolean;
  exchangeCount: number;
  intensifying: boolean;
  exchangeScores: Array<{ senderId: string; score: number }>;
};

/**
 * 会話のエスカレーション状態。
 * 仲介発動の判定に使う。
 *
 * v2: Gottman カスケード + 相互エスカレーション追加
 */
export type EscalationState = {
  /** エスカレーションレベル (0.0-1.0) */
  level: number;
  /** 直近の傾向 */
  trend: "escalating" | "stable" | "de_escalating";
  /** 四騎士パターンの検出 */
  fourHorsemen: FourHorsemanHit[];
  /** 会話の温度差 — メッセージ投資量のアシンメトリー */
  temperatureGap: number;
  /** 連続 withdrawal ターン数 */
  withdrawalStreak: number;
  /** Gottman カスケード（四騎士の連鎖出現） */
  cascade?: GottmanCascade;
  /** 相互エスカレーション（tit-for-tat パターン） */
  reciprocalEscalation?: ReciprocalEscalation;
};

/**
 * 仲介が必要かどうかの判定結果。
 */
export type MediationDecision = {
  /** 仲介すべきか */
  shouldMediate: boolean;
  /** 仲介の理由 */
  reason: MediationReason;
  /** 緊急度 */
  urgency: "low" | "medium" | "high";
};

export type MediationReason =
  | "four_horsemen_detected"  // 四騎士パターン（最優先）
  | "escalation_detected"     // エスカレーションが閾値を超えた
  | "style_clash"             // コミュニケーションスタイルの衝突
  | "unspoken_needs"          // 言語化されていないニーズが検出された
  | "rupture_risk"            // 断裂リスクが高い
  | "repeated_pattern"        // 同じすれ違いが繰り返されている
  | "none";

/**
 * 一方の当事者への仲介提案。
 */
export type MediationSuggestion = {
  /** NVC リフレーム: 同じ内容をより建設的に伝える表現 */
  reframe: string;
  /** 相手の状態への洞察（「相手は〜を必要としているかもしれません」） */
  insight: string;
  /** 次の行動ヒント（「〜と聞いてみると良いかもしれません」） */
  actionHint: string;
};

/**
 * 共同 Alter 仲介の入力。
 */
export type MediationInput = {
  /** スレッドID */
  threadId: string;
  /** 最新メッセージ（仲介トリガー） */
  latestMessage: {
    senderId: string;
    body: string;
  };
  /** ユーザー A のプロファイル */
  profileA: IntentTranslationProfile;
  /** ユーザー B のプロファイル */
  profileB: IntentTranslationProfile;
  /** 直近の会話履歴（最大10ターン） */
  conversationContext: ConversationTurn[];
  /** 関係メタデータ */
  relationshipMeta?: RelationshipMeta;
  /** Phase 1 の介入レベル（P1→P3 連携用、任意） */
  phase1InterventionLevel?: InterventionLevel;
};

/**
 * 共同 Alter 仲介の出力。
 */
export type MediationResult = {
  /** 送信者への提案（null = 介入不要） */
  forSender: MediationSuggestion | null;
  /** 受信者への提案（null = 介入不要） */
  forReceiver: MediationSuggestion | null;
  /** 共有インサイト — 両者に見せても安全な会話の洞察 */
  sharedInsight: string | null;
  /** NVC 分析結果 */
  nvcAnalysis: NVCDecomposition;
  /** エスカレーション状態 */
  escalation: EscalationState;
  /** 仲介判定 */
  decision: MediationDecision;
  /** 分析の確信度 (0.0-1.0) */
  confidence: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: 仲介制御定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 仲介発動のエスカレーション閾値 */
export const MEDIATION_ESCALATION_THRESHOLD = 0.5;
/** 四騎士パターン検出時は閾値関係なく即発動 */
export const FOUR_HORSEMEN_ALWAYS_MEDIATE = true;
/** 1日あたりの仲介上限（鬱陶しさ防止） */
export const MAX_MEDIATIONS_PER_DAY = 3;
/** 仲介後の cooldown（ミリ秒） */
export const MEDIATION_COOLDOWN_MS = 15 * 60 * 1000; // 15分
