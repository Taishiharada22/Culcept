// ============================================================
// Rendezvous 型定義
// ============================================================

// ---------- Enums ----------

export type RendezvousCategory =
  | "romantic"
  | "friendship"
  | "cocreation"
  | "community"
  | "partner";

export type RendezvousCandidateState =
  | "candidate_generated"
  | "delivered"
  | "a_liked"
  | "b_liked"
  | "mutual_liked"
  | "chat_opened"
  | "expired"
  | "dismissed";

export type RendezvousUserState =
  | "unseen"
  | "seen"
  | "liked"
  | "passed"
  | "saved"
  | "muted"
  | "expired";

export type EncounterTriggerType =
  | "physical_proximity"
  | "event_overlap"
  | "community_overlap"
  | "place_overlap"
  | "schedule_overlap"
  | "manual_seed"
  | "system_retest";

export type EncounterEvaluationStatus =
  | "pending"
  | "evaluating"
  | "not_eligible"
  | "not_mutual"
  | "candidate_created"
  | "suppressed"
  | "failed";

export type RendezvousNotificationType =
  | "new_candidate"
  | "waiting_response"
  | "mutual_like"
  | "chat_opened"
  | "reminder";

export type SuppressionType =
  | "pass_cooldown"
  | "expired_cooldown"
  | "hide_forever"
  | "report_review_hold"
  | "safety_hold"
  | "duplicate_hold";

export type ReportReasonCode =
  | "unsafe_behavior"
  | "harassment"
  | "impersonation"
  | "spam"
  | "sexual_misconduct"
  | "hate_or_abuse"
  | "other";

// ---------- Matching Vector ----------

export type MatchingVector = {
  conversation_temperature: number; // 0..1
  distance_need: number; // 0..1
  depth_speed: number; // 0..1
  stability_need: number; // 0..1
  stimulation_need: number; // 0..1
  initiative: number; // 0..1
  emotional_openness: number; // 0..1
  conflict_directness: number; // 0..1
  social_energy: number; // 0..1
  structure_preference: number; // 0..1
};

// ---------- Reason / Caution Codes ----------

export type ReasonCode =
  | "conversation_pace_close"
  | "distance_preference_aligned"
  | "depth_speed_aligned"
  | "emotional_temperature_close"
  | "complementary_roles"
  | "decision_style_aligned"
  | "stable_connection_potential"
  | "light_connection_potential"
  | "community_blend_potential"
  | "creative_role_fit"
  | "life_rhythm_aligned"
  | "values_foundation_strong"
  // Phase 1: 心理学的深度
  | "attachment_safety_aligned"
  | "conflict_repair_compatible"
  | "autonomy_respected"
  // Phenotype
  | "appearance_affinity";

export type CautionCode =
  | "silence_interpretation_gap"
  | "decision_speed_gap"
  | "depth_progression_gap"
  | "distance_need_gap"
  | "initiative_gap"
  | "emotional_expression_gap"
  | "conflict_style_gap"
  | "rhythm_gap"
  // Phase 1: 心理学的深度
  | "anxious_avoidant_risk"
  | "repair_style_gap"
  | "autonomy_tension";

// ---------- Dealbreaker Profile ----------

/**
 * プロフィール編集で収集する「絶対条件」データ
 * profile_details JSONB カラムに格納される
 */
export type DealbreakerProfile = {
  /** 結婚への意欲: "すぐにでも" | "2-3年以内" | "いい人がいれば" | "考えていない" */
  marriageIntent?: string;
  /** 子どもについて: "欲しい" | "いらない" | "相手に合わせる" | "未定" */
  childrenPreference?: string;
  /** ライフスタイルスライダー 0-100 */
  lifestyleMorningNight?: number;   // 0=朝型, 100=夜型
  lifestyleIndoorOutdoor?: number;  // 0=インドア, 100=アウトドア
  lifestyleSoloSocial?: number;     // 0=ひとり, 100=みんな
  /** エリア（都道府県） */
  prefecture?: string;
  /** 出会いの目的 */
  meetingPurposes?: string[];
  /** 会いやすさ */
  availability?: string[];

  // ── Partner 枠拡張フィールド ──

  /** 喫煙: "吸わない" | "たまに吸う" | "毎日吸う" */
  smokingStatus?: string;
  /** 喫煙許容度: "絶対NG" | "たまにならOK" | "気にしない" */
  smokingTolerance?: string;
  /** 居住地域の希望: 都道府県配列（空 = 問わない） */
  preferredPrefectures?: string[];
  /** 宗教・信条: "なし" | "仏教" | "キリスト教" | "イスラム教" | "神道" | "その他" */
  religion?: string;
  /** 宗教の重要度: "必須一致" | "理解があればOK" | "気にしない" */
  religionImportance?: string;
};

// ---------- DB Row Types ----------

export type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say";

export type RendezvousProfile = {
  id: string;
  user_id: string;
  is_enabled: boolean;
  is_paused: boolean;
  display_name: string | null;
  avatar_asset_url: string | null;
  avatar_version: number;
  primary_category: RendezvousCategory;
  enabled_categories: RendezvousCategory[];
  visibility_scope: string;
  notification_enabled: boolean;
  notification_delay_mode: string;
  notification_delay_min_minutes: number;
  notification_delay_max_minutes: number;
  show_in_home: boolean;
  public_mood_summary: string | null;
  public_style_summary: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  created_at: string;
  updated_at: string;
};

export type RendezvousPreferences = {
  id: string;
  user_id: string;
  desired_relation_types: RendezvousCategory[];
  communication_style: string | null;
  pace_preference: string | null;
  distance_preference: string | null;
  depth_preference: string | null;
  stability_vs_stimulation: number;
  similarity_vs_complementarity: number;
  initiative_preference: string | null;
  emotional_expression_preference: string | null;
  conflict_resolution_preference: string | null;
  excluded_relation_types: string[];
  excluded_traits: string[];
  matching_vector: MatchingVector;
  created_at: string;
  updated_at: string;
};

export type RendezvousCandidate = {
  id: string;
  user_a: string;
  user_b: string;
  source_event_id: string | null;
  category: RendezvousCategory;
  a_to_b_score: number;
  b_to_a_score: number;
  overall_score: number;
  reason_codes: ReasonCode[];
  reason_texts: string[];
  caution_codes: CautionCode[];
  caution_texts: string[];
  label: string | null;
  state: RendezvousCandidateState;
  delivered_at: string | null;
  expires_at: string | null;
  matched_at: string | null;
  chat_opened_at: string | null;
  suppressed_until: string | null;
  created_at: string;
  updated_at: string;
};

export type RendezvousUserStateRow = {
  id: string;
  candidate_id: string;
  user_id: string;
  state: RendezvousUserState;
  seen_at: string | null;
  liked_at: string | null;
  passed_at: string | null;
  saved_at: string | null;
  muted_at: string | null;
  dismissed_at: string | null;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- API DTO Types ----------

export type RendezvousCardDTO = {
  candidateId: string;
  state: RendezvousUserState;
  category: RendezvousCategory;
  syncPercent: number;
  label: string;
  reasons: string[];
  caution: string | null;
  counterpart: {
    displayName: string;
    avatarUrl: string | null;
    publicMoodSummary?: string | null;
    publicStyleSummary?: string | null;
  };
  deliveredAt: string | null;
  /** 追加レンズ: 友達/恋愛/Orbiter の文脈別評価 (optional) */
  contextLens?: ContextLensData;
  /** Living Score: 動的に再計算されるスコア + 軌道 */
  trajectory?: RendezvousTrajectory;
  /** コアフレーズ (optional) */
  corePhrase?: string | null;
};

/** Living Score 軌道情報 */
export type RendezvousTrajectory = {
  livingScore: number;
  direction: "rising" | "stable" | "cooling";
  directionLabel: string;
  sparkline: number[];
};

export type RendezvousFeedResponse = {
  items: RendezvousCardDTO[];
  summary: {
    newCount: number;
    waitingCount: number;
    openedConversationCount: number;
  };
};

export type RendezvousDetailDTO = RendezvousCardDTO & {
  reasons: string[]; // up to 3
  cautions: string[]; // up to 2
  candidateState: RendezvousCandidateState;
  threadId: string | null;
  /** マッチした日時 */
  matchedAt: string | null;
  /** 相手のユーザーID（写真取得等に使用） */
  counterpartUserId: string;
  counterpart: RendezvousCardDTO["counterpart"] & {
    publicMoodSummary: string | null;
    publicStyleSummary: string | null;
  };
  actions: {
    canLike: boolean;
    canPass: boolean;
    canSave: boolean;
    canMute: boolean;
    canBlock: boolean;
    canReport: boolean;
  };
  /** 追加レンズ: 友達/恋愛/Orbiter の詳細文脈評価 (optional) */
  contextLensDetail?: ContextLensDetail;
  /** Phase 1: 関係性の知性 (optional, 後方互換) */
  relationalIntelligence?: RelationalIntelligence;
  /** Phase 2: Orbiter Intelligence (optional, 後方互換) */
  orbiterIntelligence?: import("@/lib/orbiter/types").OrbiterIntelligence;
  /** Phase 2+: Orbiter の時間意識 */
  orbiterContext?: import("@/lib/orbiter/types").OrbiterContext;
  /** 分身会話データ (optional) */
  avatarConversation?: unknown[];
  /** 4カテゴリ双方向相性スコア (optional, 後方互換) */
  categoryScores?: {
    myView: { face: number; vibe: number; style: number; personality: number; overall: number };
    theirView: { face: number; vibe: number; style: number; personality: number; overall: number };
  };
};

export type RendezvousListTab = "new" | "waiting" | "saved" | "conversations";

// ---------- Evaluation Types ----------

export type EvaluationInput = {
  selfPreferences: RendezvousPreferences;
  selfVector: MatchingVector;
  otherPreferences: RendezvousPreferences;
  otherVector: MatchingVector;
  category: RendezvousCategory;
};

export type EvaluationResult = {
  total: number;
  dimensions: Record<string, number>;
  reasonCodes: ReasonCode[];
  cautionCodes: CautionCode[];
};

export type EvaluatePairResult = {
  mutual: boolean;
  bestCategory: RendezvousCategory | null;
  scoreABByCategory: Partial<Record<RendezvousCategory, EvaluationResult>>;
  scoreBAByCategory: Partial<Record<RendezvousCategory, EvaluationResult>>;
  overallScore: number | null;
  reasonCodes: ReasonCode[];
  cautionCodes: CautionCode[];
  label: string | null;
};

export type CategoryWeights = {
  conversation: number;
  distance: number;
  depth: number;
  initiative: number;
  emotional: number;
  conflict: number;
  stability: number;
  categoryAffinity: number;
};

// ---------- Context Lens (追加レイヤー) ----------
// 既存の4カテゴリ評価を壊さず、Rendezvous専用の追加解釈レンズ
// "この接続がどの文脈で自然か" を返す

import type {
  ContextType,
  ContextReason,
} from "./questions/types";
import type { AvatarJudgment } from "./questions/constants";
import type { RelationalIntelligence } from "@/lib/relational/types";

export type { ContextType };

/**
 * 4文脈のスコア (CardDTOに追加)
 * 既存のsyncPercentやcategory等は維持したまま、追加情報として載せる
 */
export type ContextLensData = {
  contextScores: {
    friend: number;  // 0..100
    romance: number;
    orbiter: number;
    cocreation: number;
  };
  bestContext: ContextType;
  avatarJudgment: AvatarJudgment;
  /** 交差した場所や契機 */
  crossingOrigin?: string;
  /** 一致/補完したポイント (2〜4点) */
  alignmentPoints?: string[];
  /** 注意点 (1〜2点) */
  cautionPoints?: string[];
  /** アバター判断のテキスト */
  avatarJudgmentText?: string;
};

export type ContextMatchScore = {
  context: ContextType;
  total: number; // 0..100
  breakdown: {
    laneFit: number; // 0..100
    elementFit: number; // 0..100
    impressionFit: number; // 0..100
    complementFit: number; // 0..100
    conflictPenalty: number; // 0..100
    evidenceStrength: number; // 0..100
  };
  bandLabel: string;
};

export type MatchExplanation = {
  context: ContextType;
  shortReasonChips: string[];
  mediumSummary: string;
  evidenceBullets: string[];
  confidence: number; // 0..1
  conflictText?: string | null;
  fallbackUsed?: boolean;
};

/**
 * 4文脈の詳細評価 (DetailDTOに追加)
 */
export type ContextLensDetail = ContextLensData & {
  contextReasons: ContextReason[];
  recommendedTone?: string;
  matchSummary?: string;
  evidenceBullets?: string[];
  scoreBreakdown?: Partial<Record<ContextType, ContextMatchScore>>;
  explanationsByContext?: Partial<Record<ContextType, MatchExplanation>>;
};
