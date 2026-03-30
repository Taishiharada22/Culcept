// ============================================================
// Rendezvous Counselor 型定義
// AI結婚相談所カウンセラー + コーチングシステム
// ============================================================

import type {
  RendezvousCategory,
  RendezvousCardDTO,
  MatchingVector,
} from "../types";

// ---------- 切断理由（切った側が選択） ----------

/** 切った側が2-3タップで選ぶ軽い理由 */
export type DisconnectReasonCode =
  | "rhythm_mismatch"        // リズムが合わなかった
  | "depth_mismatch"         // 深まるイメージが持てなかった
  | "not_ready"              // 今は接続に集中できない
  | "other_connection"       // 他に気になる接続がある
  | "felt_unsafe"            // 安心できなかった
  | "no_spark"               // ピンとこなかった
  | "communication_gap"      // コミュニケーションが噛み合わなかった
  | "values_gap"             // 価値観の違いを感じた
  | "other";                 // その他

export const DISCONNECT_REASON_LABELS: Record<DisconnectReasonCode, string> = {
  rhythm_mismatch: "リズムが合わなかった",
  depth_mismatch: "深まるイメージが持てなかった",
  not_ready: "今は接続に集中できない",
  other_connection: "他に気になる接続がある",
  felt_unsafe: "安心できなかった",
  no_spark: "ピンとこなかった",
  communication_gap: "コミュニケーションが噛み合わなかった",
  values_gap: "価値観の違いを感じた",
  other: "その他",
};

// ---------- 切断分析結果 ----------

/** AI が生成する「傾向の発見」（切られた側に届く） */
export type TendencyInsight = {
  /** 傾向の要約（1文） */
  tendency: string;
  /** その傾向の説明（2-3文、共感的トーン） */
  explanation: string;
  /** この傾向は欠点ではないという補足 */
  reframe: string;
  /** 関連する Stargazer 軸 */
  relatedAxes: string[];
  /** 過去の同様パターンのカウント */
  patternCount: number;
  /** 信頼度 0-1 */
  confidence: number;
};

/** 切断分析の完全結果 */
export type DisconnectAnalysis = {
  id: string;
  candidateId: string;
  disconnectedByUserId: string;
  disconnectedUserId: string;
  reasonCode: DisconnectReasonCode;
  reasonDetail: string | null;
  /** AI が生成した構造的分析 */
  structuralAnalysis: {
    /** 噛み合わなかったポイント（両者のベクトル差分から） */
    mismatchPoints: Array<{
      dimension: string;
      label: string;
      description: string;
    }>;
    /** 両者のコミュニケーションスタイルの違い */
    communicationGap: string | null;
    /** 深層的な理由の推論 */
    deeperInsight: string;
  };
  /** 切られた側に届く傾向の発見 */
  tendencyInsight: TendencyInsight;
  createdAt: string;
};

// ---------- 次の候補提案 ----------

/** 「ちょっと待ってね」→「この方はどうかな？」フロー */
export type NextSuggestion = {
  /** 提案される候補カード */
  card: RendezvousCardDTO;
  /** なぜこの人が合うかの説明（傾向を踏まえた理由） */
  whyThisPerson: string;
  /** 前回の傾向をどう解消するか */
  addressesTendency: string;
  /** カウンセラーからのメッセージ */
  counselorMessage: string;
};

// ---------- アバター仲介 ----------

export type AvatarIntroMode = "avatar" | "direct";

export type AvatarIntroduction = {
  id: string;
  candidateId: string;
  fromUserId: string;
  toUserId: string;
  mode: AvatarIntroMode;
  /** アバターが生成した挨拶メッセージ */
  avatarMessage: string | null;
  /** 相手のプロフィールから導いた話題提案 */
  suggestedTopics: string[];
  createdAt: string;
};

// ---------- ブリーフィング ----------

/** 接続開始前のAIブリーフィング */
export type PreConnectionBriefing = {
  id: string;
  candidateId: string;
  userId: string;
  /** 相手の傾向（ポジティブに表現） */
  counterpartTraits: Array<{
    trait: string;
    advice: string;
  }>;
  /** 共通して反応しやすい話題 */
  suggestedTopics: string[];
  /** 最初の15分のアドバイス */
  openingAdvice: string;
  /** 注意点（ネガティブにならない表現） */
  awarenessPoints: string[];
  /** カテゴリ別の追加アドバイス */
  categorySpecificAdvice: string | null;
  createdAt: string;
};

// ---------- ポストレビュー ----------

export type InteractionType = "chat" | "call" | "date";

export type PostReview = {
  id: string;
  candidateId: string;
  userId: string;
  interactionType: InteractionType;
  /** ユーザーの感想（軽い選択式） */
  feeling: PostReviewFeeling;
  freeText: string | null;
  /** AI分析結果 */
  aiInsight: string | null;
  createdAt: string;
};

export type PostReviewFeeling =
  | "great"          // とても良かった
  | "good"           // 良かった
  | "neutral"        // 普通
  | "not_sure"       // よくわからない
  | "uncomfortable"; // 少し違和感があった

export const POST_REVIEW_FEELING_LABELS: Record<PostReviewFeeling, string> = {
  great: "とても良かった",
  good: "良かった",
  neutral: "普通",
  not_sure: "よくわからない",
  uncomfortable: "少し違和感があった",
};

// ---------- 成長トラッキング ----------

/** 長期的な成長の可視化 */
export type GrowthInsight = {
  userId: string;
  /** 累計切断数 */
  totalDisconnects: number;
  /** 累計接続数 */
  totalConnections: number;
  /** 検出されたパターン */
  patterns: GrowthPattern[];
  /** 成長ポイント */
  improvements: GrowthImprovement[];
  /** 次のアドバイス */
  nextAdvice: string | null;
  /** 成長スコア 0-100 */
  growthScore: number;
  generatedAt: string;
};

export type GrowthPattern = {
  /** パターンの名前 */
  name: string;
  /** 説明 */
  description: string;
  /** 発生頻度 */
  frequency: number;
  /** 改善中かどうか */
  improving: boolean;
  /** 最初に検出された日 */
  firstDetectedAt: string;
};

export type GrowthImprovement = {
  /** 改善点の名前 */
  area: string;
  /** 以前の状態 */
  before: string;
  /** 現在の状態 */
  after: string;
  /** 改善が見られた日 */
  detectedAt: string;
};

// ---------- カウンセラーセッション ----------

export type CounselorSessionState =
  | "analyzing"           // 分析中
  | "showing_insight"     // 傾向表示中
  | "searching"           // 次の候補を探し中
  | "suggesting"          // 候補を提案中
  | "choosing_intro"      // 挨拶方法を選択中
  | "avatar_introducing"  // アバターが挨拶中
  | "briefing"            // ブリーフィング表示中
  | "completed";          // 完了

export type CounselorSession = {
  id: string;
  userId: string;
  /** トリガーとなった切断分析 */
  disconnectAnalysisId: string | null;
  state: CounselorSessionState;
  /** セッション中のデータ */
  tendencyInsight: TendencyInsight | null;
  nextSuggestion: NextSuggestion | null;
  introMode: AvatarIntroMode | null;
  briefing: PreConnectionBriefing | null;
  createdAt: string;
  updatedAt: string;
};

// ---------- Recovery Flow ステップ ----------

export type RecoveryStep =
  | "insight"            // 傾向の発見を表示
  | "waiting"            // 「ちょっと待ってね」
  | "suggestion"         // 「この方はどうかな？」
  | "intro_choice"       // 「私が挨拶する？」
  | "avatar_sending"     // アバターが挨拶送信中
  | "briefing"           // ブリーフィング表示
  | "done";              // 完了

// ---------- DB Row Types ----------

export type DisconnectAnalysisRow = {
  id: string;
  candidate_id: string;
  disconnected_by_user_id: string;
  disconnected_user_id: string;
  reason_code: DisconnectReasonCode;
  reason_detail: string | null;
  structural_analysis: Record<string, unknown>;
  tendency_insight: Record<string, unknown>;
  created_at: string;
};

export type CounselorSessionRow = {
  id: string;
  user_id: string;
  disconnect_analysis_id: string | null;
  state: CounselorSessionState;
  session_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TendencyPatternRow = {
  id: string;
  user_id: string;
  pattern_key: string;
  pattern_data: Record<string, unknown>;
  occurrence_count: number;
  improving: boolean;
  first_detected_at: string;
  last_detected_at: string;
  created_at: string;
  updated_at: string;
};

export type PreBriefingRow = {
  id: string;
  candidate_id: string;
  user_id: string;
  briefing_data: Record<string, unknown>;
  created_at: string;
};

export type AvatarIntroRow = {
  id: string;
  candidate_id: string;
  from_user_id: string;
  to_user_id: string;
  mode: AvatarIntroMode;
  avatar_message: string | null;
  suggested_topics: string[];
  created_at: string;
};

export type PostReviewRow = {
  id: string;
  candidate_id: string;
  user_id: string;
  interaction_type: InteractionType;
  feeling: PostReviewFeeling;
  free_text: string | null;
  ai_insight: string | null;
  created_at: string;
};
