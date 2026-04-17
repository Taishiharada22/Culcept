/**
 * CoAlter — 関係性支援OS 型定義
 *
 * 5層アーキテクチャ:
 *   L1: 個人理解（双方のAlterPersonality）
 *   L2: 関係理解（温度差・合いやすい点・摩擦点・公平性台帳）
 *   L3: 会話理解（テーマ・膠着点・Caring Intensity）
 *   L4: 外部接続（Adaptive RAG — Web検索）
 *   L5: 提案生成（要約→解釈→関係性に即した提案）
 */

// ─────────────────────────────────────────────
// Session & State
// ─────────────────────────────────────────────

/** CoAlterのペア単位の有効化状態 */
export type CoAlterPairState =
  | "inactive"        // 未有効化
  | "pending_consent"  // 片方が起動、相手の同意待ち
  | "enabled"          // 有効化済み（セッション外）
  | "disabled";        // opt-outで無効化済み

/** CoAlterセッションの状態 */
export type CoAlterSessionState =
  | "active"   // 実行中
  | "completed" // 提案完了で自然終了
  | "cancelled"; // ユーザーが手動終了

/**
 * Phase 1.5: セッションの意思決定状態
 *
 * - draft: 初回提案（まだ動かしてない）
 * - pivoting: refine/reroll で軸を動かしている最中
 * - decided: ユーザーが採用ボタンを押して Plan Shelf に保存された
 *
 * 自動判定はしない。UI イベントで遷移する。
 */
export type SessionDecisionState = "draft" | "pivoting" | "decided";

// ─────────────────────────────────────────────
// Phase 1.5: 評価軸
// ─────────────────────────────────────────────

/**
 * 評価軸のキー。
 * 共通軸（price, access, novelty）はテーマ非依存。
 * それ以外はテーマ固有軸。
 */
export type AxisKey =
  | "price"
  | "access"
  | "novelty"
  // food
  | "quietness"
  | "atmosphere"
  // movie
  | "tone"
  | "runtime"
  // travel
  | "activity"
  | "relaxation"
  // schedule
  | "flexibility"
  | "effort";

/** 軸のメタ情報（UI 表示用） */
export interface Axis {
  key: AxisKey;
  /** 日本語ラベル（例: "静かさ"） */
  label: string;
  /** 0側の意味（例: "賑やか"） */
  lowLabel: string;
  /** 3側の意味（例: "静か"） */
  highLabel: string;
}

/** 軸スコア（0-3 の4段階） */
export type AxisScores = Partial<Record<AxisKey, 0 | 1 | 2 | 3>>;

/** refine 時の軸の ± 操作（+1=上げる / -1=下げる） */
export type AxisDelta = -1 | 1;

/** 次の reroll に一度だけ渡す軸の操作（memory only） */
export type PendingAxisDeltas = Partial<Record<AxisKey, AxisDelta>>;

/** CoAlterの動作モード */
export type CoAlterMode =
  | "decision"   // Phase 1: 共同意思決定支援
  | "negotiate"  // Phase 2: 好みが矛盾時の第三案生成
  | "clarify"    // Phase 2: すれ違い検出→論点可視化
  | "reflect";   // Phase 3: 過去の会話パターン振り返り

/** CoAlterセッション */
export interface CoAlterSession {
  id: string;
  threadId: string;
  threadType: "talk"; // Phase 1はTalk限定。将来 "rendezvous" 追加
  userAId: string;
  userBId: string;
  initiatedBy: string;
  mode: CoAlterMode;
  state: CoAlterSessionState;
  createdAt: string;
  endedAt: string | null;
}

/** CoAlterメッセージのロール */
export type CoAlterMessageRole = "user_a" | "user_b" | "coalter";

/** CoAlterメッセージ */
export interface CoAlterMessage {
  id: string;
  sessionId: string;
  role: CoAlterMessageRole;
  senderId: string | null; // CoAlterの場合null
  content: string;
  metadata: CoAlterMessageMetadata;
  createdAt: string;
}

/** CoAlterメッセージのメタデータ */
export interface CoAlterMessageMetadata {
  /** 提案カードデータ（CoAlterの応答時のみ） */
  proposalCard?: ProposalCard;
  /** トリガー情報（起動時のみ） */
  trigger?: TriggerInfo;
}

// ─────────────────────────────────────────────
// Trigger Detection (Phase 1)
// ─────────────────────────────────────────────

/** トリガー判定結果 */
export type TriggerConfidence = "strong" | "soft" | "none";

/** トリガー情報 */
export interface TriggerInfo {
  confidence: TriggerConfidence;
  matchedPattern: string | null; // マッチしたパターン名
  message: string;               // トリガーとなったメッセージ
}

// ─────────────────────────────────────────────
// L1: 個人理解
// ─────────────────────────────────────────────

/** CoAlterが使用する個人プロフィール（AlterPersonalityのサブセット + 拡張） */
export interface CoAlterPersonProfile {
  userId: string;
  displayName: string | null;

  // コミュニケーションスタイル（45軸から抽出）
  communicationStyle: {
    directVsDiplomatic: number | null;  // 0=外交的, 1=直接的
    conflictStyle: number | null;       // 0=回避型, 1=対立型
    attachmentStyle: number | null;     // 0=回避, 1=安定
    reassuranceNeed: number | null;     // 安心の求め方
    emotionalVariability: number | null; // 感情の振れ幅
  };

  // 意思決定傾向
  decisionStyle: {
    /** 新規性 vs 安定性の選好（0=安定重視, 1=新規性重視） */
    noveltyPreference: number | null;
    /** 決定の速さ（0=慎重, 1=即断） */
    decisionSpeed: number | null;
    /** リスク許容度（0=リスク回避, 1=リスク歓迎） */
    riskTolerance: number | null;
  };

  // 好み・趣味（life_profile_entriesから）
  interests: string[];
  values: string[];

  // アーキタイプ情報（提案の調整に使用）
  archetypeCode: string | null;
  coreFear: string | null;
  coreDesire: string | null;
}

// ─────────────────────────────────────────────
// L2: 関係理解
// ─────────────────────────────────────────────

/** ペアの関係性メタデータ */
export interface RelationshipContext {
  /** 45軸での高一致ペア */
  commonGround: string[];
  /** 45軸での高不一致ペア */
  frictionPoints: string[];
  /** 公平性台帳（内部のみ、Phase 1では非表示） */
  fairnessLedger: FairnessEntry[];
  /** 過去のCoAlterセッション回数 */
  pastSessionCount: number;
}

/** 公平性台帳のエントリ */
export interface FairnessEntry {
  sessionId: string;
  /** -1.0（完全にA寄り）〜 +1.0（完全にB寄り）、0=均衡 */
  biasScore: number;
  decidedAt: string;
}

// ─────────────────────────────────────────────
// L3: 会話理解
// ─────────────────────────────────────────────

/** 会話の解析結果 */
export interface ConversationAnalysis {
  /** 会話のテーマ（映画、食事、旅行、予定調整、プレゼント、その他） */
  theme: ConversationTheme;
  /** 膠着点の説明 */
  stalemate: string | null;
  /** 直近の会話メッセージ（解析対象） */
  recentMessages: ConversationTurn[];
  /** 各人のCaring Intensity（0=無関心, 1=強い関心） */
  caringIntensityA: number;
  caringIntensityB: number;
  /** 会話から抽出された制約（日時、場所、予算等） */
  extractedConstraints: ExtractedConstraints;
  /** 条件充足度（0.0〜1.0）— 推薦に必要な条件がどれだけ揃っているか */
  constraintScore: number;
}

export type ConversationTheme =
  | "movie"
  | "food"
  | "travel"
  | "schedule"
  | "gift"
  | "activity"
  | "general";

/** 会話の1ターン */
export interface ConversationTurn {
  senderId: string;
  body: string;
  createdAt: string;
}

/** 会話から抽出された現実制約 */
export interface ExtractedConstraints {
  date: string | null;        // 「○月○日」「今週末」等
  location: string | null;    // 「渋谷」「近くで」等
  budget: string | null;      // 「安め」「3000円くらい」等
  timeSlot: string | null;    // 「夜」「午後」「19時」等
  preferences: string[];      // その他の明示的希望
}

// ─────────────────────────────────────────────
// L4: 外部接続
// ─────────────────────────────────────────────

/** Web検索の判断結果 */
export interface SearchDecision {
  shouldSearch: boolean;
  reason: string;
  queries: string[]; // 生成された検索クエリ（0-3個）
}

/** 検索結果の候補アイテム */
export interface SearchCandidate {
  title: string;
  description: string;
  /** 外部評価（食べログスコア、Google評価等） */
  externalRating: string | null;
  /** 現実情報（場所、時間、価格等） */
  practicalInfo: string | null;
  /** 情報ソース */
  source: string;
  /** 元URL（クリック可能なリンクとして提示） */
  url: string | null;
}

// ─────────────────────────────────────────────
// L5: 提案生成
// ─────────────────────────────────────────────

/** Phase 1 出力カード（固定テンプレート） */
export interface ProposalCard {
  /** ① ここまでの要点（2-3文） */
  summary: string;
  /** ② 二人が重視している点 */
  priorities: {
    userA: string;
    userB: string;
    common: string | null;
  };
  /** ③ 候補 2〜3 */
  candidates: ProposalCandidate[];
  /** ④ なぜこの候補か（関係性文脈に基づく理由。2-3文） */
  reasoning: string;
  /** ⑤ 退出シグナル（1文） */
  closing: string;
  /** まだ足りない条件（refine時に追加質問として使用） */
  missingConstraints?: MissingConstraint[];
  /** Phase 1.5: このテーマで操作可能な軸（共通軸＋テーマ固有軸） */
  availableAxes?: AxisKey[];
  /** Phase 1.5: 関係性メタ指標（表示のみ。操作対象外） */
  pairFitScore?: 0 | 1 | 2 | 3;
  /** Phase 1.5: セッションの意思決定状態 */
  decisionState?: SessionDecisionState;
  /** Phase 1.5.4: カード全体のテーマ（全候補共通）。UI でアイコン等を切り替えるのに使う */
  theme?: ConversationTheme;
}

/** 不足している条件 */
export interface MissingConstraint {
  /** 条件名（例: "price_range", "atmosphere", "time_slot"） */
  key: string;
  /** ユーザー向けの質問文（例: "予算はどれくらい？"） */
  question: string;
  /** 優先度（1=最も重要） */
  priority: number;
  /** Phase 1.5.4: どの 5W1H スロットが欠けているか（将来の slot-targeted refine 用） */
  slot?: import("@/lib/coalter/slots").SlotKey;
}

/** 提案候補 */
export interface ProposalCandidate {
  rank: number; // 1, 2, 3
  title: string;
  oneLiner: string; // 一言説明
  practicalInfo: string | null; // 現実情報（場所・時間・評価等）
  /** ワンクリックで確認できるURL（検索結果から自動付与） */
  url: string | null;
  /** Phase 1.5: 各軸のスコア（0-3。操作軸の現在値） */
  axisScores?: AxisScores;
  // ─ Phase 1.5.4 5W1H 束プラン（全 optional で後方互換）─
  /**
   * 5W1H のスロット束。テーマに応じて埋まるスロットが変わる。
   * title は自由生成ではなく slots から composeTitle() で合成される。
   */
  slots?: import("@/lib/coalter/slots").SlotBundle;
  /** このカードのテーマ（どの THEME_RULE が適用されたか） */
  theme?: ConversationTheme;
  /** 主軸スロット（テーマから導出されるが、UI で強調する時に参照） */
  coreSlot?: import("@/lib/coalter/slots").SlotKey;
}

// ─────────────────────────────────────────────
// Engine: 5層パイプライン統合
// ─────────────────────────────────────────────

/** エンジンへの入力 */
export interface CoAlterInput {
  threadId: string;
  invokedBy: string; // 起動したユーザーID
  trigger: TriggerInfo;
  /** ユーザーが添えたメッセージ（「映画決めて」等） */
  userMessage: string | null;
}

/** エンジンからの出力 */
export interface CoAlterOutput {
  sessionId: string;
  proposalCard: ProposalCard;
  /** Phase 1.5: このカードに含まれる候補の一意キー（次回の avoidKeys 用） */
  seenCandidateKeys: string[];
  /** 内部メトリクス（analytics用） */
  _internal: {
    searchDecision: SearchDecision;
    caringIntensityA: number;
    caringIntensityB: number;
    fairnessBias: number; // この提案の偏りスコア
    processingTimeMs: number;
  };
}

// ─────────────────────────────────────────────
// API Types
// ─────────────────────────────────────────────

/** POST /api/coalter/activate リクエスト */
export interface ActivateRequest {
  threadId: string;
}

/** POST /api/coalter/accept リクエスト */
export interface AcceptRequest {
  threadId: string;
}

/** POST /api/coalter/invoke リクエスト */
export interface InvokeRequest {
  threadId: string;
  message: string | null; // 「映画決めて」等。ボタン起動時はnull
  /** Phase 1.5: 次の reroll に一度だけ渡す軸の操作（memory only） */
  pendingDeltas?: PendingAxisDeltas;
  /** Phase 1.5: reroll 時に避けたい既出候補キー（seenCandidateKeys） */
  avoidKeys?: string[];
}

/** POST /api/coalter/end リクエスト */
export interface EndRequest {
  sessionId: string;
}

/** 共通レスポンス */
export interface CoAlterApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
