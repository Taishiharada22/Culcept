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
  /** Phase 1.5.4.5: 二人の合意制約（hard/soft 分離、validator の hard constraint として使う） */
  agreedConstraints?: AgreedConstraint[];
  /** Phase 1.5.4.6: 話題アンカー（現在スコープ）。anchor 優先で全解析を組み直す */
  topicAnchor?: TopicAnchor;
  /** Phase 1.5.4.6: primary scope に残ったメッセージ数（監査用） */
  primaryScopeCount?: number;
  /** Phase 1.5.4.6: background only に落ちたメッセージ数（監査用） */
  backgroundScopeCount?: number;
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
  /** talk_messages.id（任意。Phase 1.5.4.6 以降の topic anchor 参照用） */
  id?: string;
  senderId: string;
  body: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// Phase 1.5.4.6: Topic Scope — 「来週木曜のランチ」に四国が混ざらないように
// ─────────────────────────────────────────────

/**
 * 起動直前メッセージ（または CoAlter 呼び出し時のユーザーメッセージ）から
 * 抽出した「現在話している話題の核」。
 *
 * 以降の会話分析はこの anchor + 前後数件（primary scope）を優先し、
 * 古い話題（「四国」等）は background only として扱う。
 */
export interface TopicAnchor {
  /** talk_messages.id（起動直前の talk_messages を指す。null = invoke 時の userMessage を採用した場合） */
  messageId: string | null;
  /** anchor 発話そのもの（監査・UI 表示用） */
  text: string;
  /** anchor から抽出された scope（regex/軽量 LLM で取る） */
  detectedScope: TopicScope;
  /** anchor 採用の確信度（0.0〜1.0）。低い時は UI で「変更」ボタン露出 */
  confidence: number;
  /** anchor 採用の根拠（"user_message" / "last_talk_message" / "manual_override" など） */
  source: TopicAnchorSource;
}

export type TopicAnchorSource =
  | "user_message"       // invoke 時に渡された userMessage
  | "last_talk_message"  // talk_messages の直前 1 件
  | "manual_override";   // UI から後で「この話」と指定した場合（Phase 1.5.7+）

/**
 * anchor から抽出される話題スコープ。
 *
 * 設計原則:
 *  - theme / timeRef / placeRef は string で保持（正規化は後続 phase）
 *  - confidence は scope 抽出そのものの確からしさ
 */
export interface TopicScope {
  /** 検出テーマ（会話の核がどのテーマか） */
  theme: ConversationTheme;
  /** 時期の手がかり（「来週木曜」「今週末」等）— null = anchor に時間表現が無い */
  timeRef: string | null;
  /** 場所の手がかり（「渋谷」「徳島」等）— null = anchor に場所表現が無い */
  placeRef: string | null;
  /** scope 抽出の確信度（theme/time/place の合成） */
  confidence: number;
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
// Phase 1.5.4.5: Agreed Constraints
// ─────────────────────────────────────────────

/**
 * 合意制約の種別。
 *
 * - exclusion:   除外制約（「映画館併設じゃない」「チェーン店以外」）
 * - preference:  雰囲気・体験志向（「ガヤガヤ系」「落ち着いた」「2人で楽しめる」）
 * - budget:      金額（「5000円前後」「安め」）
 * - style:       具体ジャンル・形式（「フレンチかラーメン」「カジュアル」）
 * - companions:  同席者・人数（「2人で」「家族も」）
 */
export type AgreedConstraintKind =
  | "exclusion"
  | "preference"
  | "budget"
  | "style"
  | "companions";

/**
 * 制約の強さ。
 *
 * - hard: 違反候補は必ず reject する（"A じゃない" 等の明示的除外、予算上限、同席条件）
 * - soft: 違反しても文脈次第で許容（"ガヤガヤ系がいい" 等の preference 寄り）
 *
 * Phase 1.5.4.5 では hard のみを validator で強制。soft は reasoning への反映のみ。
 */
export type AgreedConstraintStrength = "hard" | "soft";

/**
 * 会話から抽出された「二人の合意制約」
 *
 * Phase 1.5.4.5 の核心データ。単なる preference と違い、
 * 「二人で明示的に合意した」ものだけを採り、候補検査の hard constraint として使う。
 */
export interface AgreedConstraint {
  kind: AgreedConstraintKind;
  /** 正規化された表現（例: "no_attached_venue"、"budget_around_5000"、"style_french_or_ramen"） */
  normalizedValue: string;
  /** 元の発話断片（誤抽出監査のため保持） */
  sourceText: string;
  /** 抽出の確信度（0.0〜1.0） */
  confidence: number;
  /** hard constraint か soft か */
  strength: AgreedConstraintStrength;
  /** この制約を合意した発話者（A/B の userId、不明なら null） */
  agreedBy?: string | null;
}

// ─────────────────────────────────────────────
// Phase 1.5.4.5: Candidate Validation
// ─────────────────────────────────────────────

/**
 * slot / 候補の reject 理由コード。
 *
 * re-prompt の品質向上 + 運用ログ監査のため、boolean ではなく reason code を返す。
 */
export type ValidationReasonCode =
  // slot 粒度不足
  | "abstract_where"              // where が抽象（「駅周辺」「人気店」等）
  | "abstract_what"               // what が抽象（「恋愛映画」「おいしい料理」等）
  | "missing_movie_title"         // movie テーマで作品名なし
  | "missing_venue_proper_noun"   // food/travel テーマで固有名詞なし
  | "missing_station_or_area"     // 最寄駅 or エリア情報なし
  | "missing_budget_band"         // 予算帯不明
  // hard constraint 違反
  | "violates_exclusion"          // 除外制約違反（「併設じゃない」を破っている）
  | "violates_budget"             // 予算制約違反
  | "violates_companions"         // 同席条件違反
  | "violates_style"              // ジャンル/形式違反
  // core slot 欠落
  | "missing_core_slot"           // テーマの core slot が埋まってない
  // その他
  | "duplicate_candidate"         // 既出候補と重複
  | "empty_slots"                 // slots そのものが空
  // Phase 1.5.4.6+: 3案差分 + 密度
  | "candidates_too_similar"      // 3案が実質同じ（axisScores/slot/title のいずれでも差がない）
  | "thin_practical_info"         // practicalInfo が薄い（数字項目不足）
  // P0-1 / P0-2: movie catalog 厳密検査
  | "movie_title_not_in_catalog"  // 作品名が構造化 catalog に存在しない（LLM の発明）
  | "theater_not_in_catalog"      // 劇場名が catalog の実在劇場に一致しない
  | "movie_missing_showtime"      // 上映中作品で showtime / upcoming-note がない
  | "movie_upcoming_without_note"; // 公開予定作品で「公開予定」明示がない

/**
 * 1 候補の validation 結果。
 */
export interface CandidateValidationResult {
  /** 採用可能か */
  ok: boolean;
  /** reject された理由（ok=true なら空配列） */
  reasons: ValidationReasonCode[];
  /** 違反した制約の元テキスト（ログ用、ok=true なら空配列） */
  violatedConstraints: string[];
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

/**
 * P0-1: 構造化された映画上映情報。
 *
 * 「検索→構造化→選択」パイプラインの中間データ。
 * LLM が作品名を発明するのを防ぐため、候補は必ずこの catalog から選ぶ。
 */
export interface MovieScreening {
  /** 作品名（正規化済み） */
  title: string;
  /** 映画館名（「TOHOシネマズ新宿」等。不明なら null） */
  theater: string | null;
  /**
   * 公開ステータス。
   * - showing:  明示的に「上映中 / 公開中 / 絶賛上映」が検出された
   * - upcoming: 明示的に「公開予定 / 近日公開 / N月N日公開」が検出された
   * - ended:    明示的に「上映終了 / 公開終了」が検出された、または
   *             release year がリファレンス日付より 1 年以上前で showing 明示なし（Phase A.6 P1）
   * - unknown:  いずれの手がかりも取れなかった
   */
  status: "showing" | "upcoming" | "ended" | "unknown";
  /** 公開年（"2024年公開" 等から抽出）。不明なら null */
  releaseYear?: number | null;
  /** 上映時刻のリスト（"19:00", "21:30" 等） */
  showtimes: string[];
  /** 上映時間（分）。不明なら null */
  runtimeMinutes: number | null;
  /** 外部評価（Filmarks 4.2, 映画.com 3.8 等） */
  rating: string | null;
  /** 情報ソースURL */
  sourceUrl: string;
  /** 情報ソース（"映画.com" / "Filmarks" 等） */
  source: string;
  /** 元 snippet の要約（LLM に渡す補助情報） */
  snippet: string;
}

// ─────────────────────────────────────────────
// Phase B: 3-mode 共通基盤 — ActivityCandidate (2026-04-18)
//
// 設計原則:
//  - FoodVenue / MovieScreening は pure entity（店そのもの / 作品そのもの）
//  - ActivityCandidate は「提案単位の wrapper」— candidateId / sourceUrl /
//    sourceDomain / confidence / 時間制約を持つ
//  - 同じ店でも別の search から出れば別の ActivityCandidate になりうる
//    （ただし candidateId は同一になるよう設計 → daily-mode dedup の土台）
//  - extends ではなく composition。境界を崩さない
// ─────────────────────────────────────────────

/** 提案対象のドメイン（Phase B 時点では food のみ実装、movie/activity は将来） */
export type ActivityDomain = "food" | "movie" | "activity";

/** 予約必要度（booking resolver が決まる前の一時的な分類） */
export type ReservationNeed = "required" | "recommended" | "none" | "unknown";

/**
 * 時間帯ウィンドウ（食事の「ランチ 11:30-14:30」「ディナー 17:00-22:00」等）。
 *
 * dayOfWeek = null なら全曜日。特定曜日のみなら 0(日)〜6(土)。
 */
export interface TimeWindow {
  dayOfWeek: number | null;
  /** 開始時刻（0-23） */
  startHour: number;
  /** 終了時刻（1-24、startHour より大きいこと） */
  endHour: number;
}

/**
 * 食事候補の pure entity（店そのもの）。
 *
 * 「店は 1 つ」— 同じ店が別 search で出ても entity は同一の意味論。
 * candidateId / sourceUrl 等の「提案単位の情報」はここには含めない。
 */
export interface FoodVenue {
  /** 店名（必須。parse 出力境界で null の venue は除外される） */
  name: string;
  /** 最寄駅（「渋谷駅」「新宿駅東口」等）。不明なら null */
  station: string | null;
  /** エリア（「渋谷区道玄坂」「代官山」等）。不明なら null */
  area: string | null;
  /** 価格帯（「¥3,000〜¥3,999」「5,000円前後」等、正規化せず raw 文字列）。不明なら null */
  priceBand: string | null;
  /** 営業時間（raw。「17:00-24:00」「11:30〜14:30」等）。不明なら null */
  openingHours: string | null;
  /** 外部評価（食べログ 3.52、★4.2 等）。不明なら null */
  rating: string | null;
  /** 元 snippet の要約（narration 素材） */
  snippet: string;
}

/**
 * 提案単位の wrapper。3-mode 共通契約。
 *
 * - candidateId: `{domain}:{sourceDomain}:{normalizedName}:{normalizedStationOrArea}`
 *   スナップショット非依存の stable material だけで生成する（URL path / snippet は使わない）。
 *   cross-source dedup（tabelog vs retty で同一店舗）は Phase B スコープ外。
 * - confidence: name はゲート（必須）。priceBand/stationOrArea/openingHours/rating/
 *   known domain の加点式。上限 1.0
 * - bestTimeWindows: parse では基本空。ranker / orchestrator が埋める
 * - reservationNeed: bookingResolver 実装前は "unknown"
 */
export interface ActivityCandidate<TEntity = FoodVenue | MovieScreening> {
  /** 一意キー（daily-mode dedup 用、stable material から生成） */
  candidateId: string;
  /** 情報源 URL（searchCandidates 由来） */
  sourceUrl: string;
  /** 情報源ドメイン（tabelog.com 等、hostname 部分のみ） */
  sourceDomain: string;
  /** 提案信頼度（0.0〜1.0） */
  confidence: number;
  /** ドメイン discriminator */
  domain: ActivityDomain;
  /** ドメイン固有エンティティ（food なら FoodVenue） */
  entity: TEntity;
  /** 所要時間の推定（分）。不明なら null */
  durationEstimate: number | null;
  /** 推奨時間帯（openingHours / ドメイン既定値から導出） */
  bestTimeWindows: TimeWindow[];
  /** 予約必要度（bookingResolver 前は "unknown"） */
  reservationNeed: ReservationNeed;
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
  /** Phase 1.5.4.5: validation 結果メタ（admin / 監査 / UI 透過用） */
  validation?: {
    /** reject された候補数 */
    rejectedCount: number;
    /** 発生した reject 理由コード（重複除去済み） */
    rejectReasons: ValidationReasonCode[];
    /** retry も失敗して clarify に落ちたか */
    fallbackToClarify?: boolean;
    /** 適用された hard constraint の数 */
    hardConstraintsCount?: number;
    /** P0-4: 両 provider 失敗 / 検索結果ゼロで絞り込み要請に倒したか */
    providerFailure?: boolean;
  };
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
  /**
   * Phase A (2026-04-18): 候補詳細（bottom sheet 用）。
   *
   * logic 合成（narrationBuilder.buildCandidateDetail）で埋まる。
   * 既存 UI への影響を抑えるため optional。LLM は prose のみ書き換え可。
   */
  detail?: CandidateDetail;
}

// ─────────────────────────────────────────────
// Phase A: Booking Handoff (2026-04-18)
//
// 設計原則:
//  1. URL は searchCandidates からしか取らない（ハルシネーション禁止）
//  2. confidence は providerType × マッチ強度で決まる。third_party は high にならない
//  3. 映画は confidence によらず CTA を「予約」にしない（上映ページ誘導止まり）
// ─────────────────────────────────────────────

/**
 * 予約/詳細確認の外部導線種別（Phase B Commit 3 で 3→5 分類に拡張）。
 *
 * - official                       : 映画館サイト・レストラン自社サイト等の「公式ドメイン」
 *                                    URL パス上に /reserve, /booking, /ticket, /reservation 等を含む
 * - official_site                  : 公式ドメインだが予約確定ページではない（トップ / メニュー）
 * - official_reservation_partner   : 公式が採用している予約 SaaS
 *                                    (TableCheck / OpenTable / Toreta / ebica / Hitosara 等) への導線
 *                                    公式予約パートナードメイン whitelist で判定
 * - third_party_listing            : 食べログ / ぐるなび / Retty / ホットペッパー / Filmarks 等の
 *                                    第三者リスティングサイト (Phase B Commit 3 以前は "third_party")
 * - unknown                        : 5 分類のいずれにも確信を持って振れない判定不能ケース。
 *                                    **hard filter にしない / CTA 非表示** の明示的カテゴリであり
 *                                    エラーではない。監査の起点として別カウンタに計上する
 *
 * 後方互換: Phase B Commit 3 以前の "third_party" は "third_party_listing" に機械 rename。
 * semantics は不変で、string の変更のみ。movie 側は実質 official / official_site /
 * third_party_listing の 3 分類運用 (official_reservation_partner と unknown は食向け)。
 */
export type BookingProviderType =
  | "official"
  | "official_site"
  | "official_reservation_partner"
  | "third_party_listing"
  | "unknown";

/**
 * 導線 URL の確信度。
 *
 * - high   : official + 予約/購入導線が確定
 *            → 食事のみ「公式の予約ページへ」CTA として出す
 * - medium : official_site（予約ページではない） or third_party の強マッチ
 *            → 「公式サイトで確認する」「食べログで見る」等
 * - low    : snippet 依存 / entity 一致が弱い / ページ種別曖昧
 *            → CTA 非表示 or 最弱ラベル
 *
 * 注: movie は theme 側の方針で high に到達しても CTA は「上映ページを見る」止まり。
 */
export type BookingConfidence = "high" | "medium" | "low";

/**
 * 外部導線ハンドオフの構造化結果。
 *
 * - URL は必ず searchCandidates 由来（resolver で検証）
 * - phone は v1 では CTA として出さない（保持のみ / 将来の食事 fallback 用）
 */
export interface BookingHandoff {
  /** 予約/購入導線の URL。無ければ null */
  bookingUrl: string | null;
  /** 公式サイト URL（予約でなくトップ/メニュー等を含む）。無ければ null */
  officialUrl: string | null;
  /** 電話番号（v1 では CTA にしない。将来の食事 fallback 用に保持） */
  phone: string | null;
  /** CTA のラベル（theme × confidence × providerType で決定） */
  label: string;
  /** 導線種別（resolver が判定） */
  providerType: BookingProviderType;
  /** 第三者サイト名など表示用プロバイダ名（「食べログ」「Filmarks」等）。null 可 */
  providerName: string | null;
  /** ラベル降格の根拠となる確信度 */
  confidence: BookingConfidence;
}

/**
 * 候補詳細（bottom sheet 用）。
 *
 * 原則:
 *  - logic 合成。LLM は prose フィールドのみ書き換え可能（postprocessor 保護）。
 *  - alternatives は Layer 2 の residual（役割外上位）から 0-2 件（上限 2）。
 *  - sources は searchCandidates の url/source を logic で束ねる。
 */
export interface CandidateDetail {
  /** 2 人にとってこの候補がどう機能するか（1-2 文） */
  why2People: string;
  /** 住所 / 所在エリア（catalog / search から取れれば）。null 可 */
  address: string | null;
  /** アクセス（「渋谷駅 徒歩 5 分」等）。null 可 */
  access: string | null;
  /** 価格帯（食事で使用。映画では null 可） */
  priceBand: string | null;
  /** 営業時間 / 上映時間帯（テーマで意味が変わる）。null 可 */
  operatingHours: string | null;
  /**
   * 代替候補（0-2 件、上限 2 固定）。
   *
   * Layer 2 で役割からは外れたが有力だったものをピックアップ。
   * LLM は呼ばない。
   */
  alternatives: CandidateAlternative[];
  /** 外部導線ハンドオフ（null = 導線なし / 取得失敗） */
  booking: BookingHandoff | null;
  /** 出典（searchCandidates 由来。UI にはソース名で表示） */
  sources: CandidateSource[];
}

/** 代替候補（bottom sheet の「こっちもあるよ」枠） */
export interface CandidateAlternative {
  title: string;
  /** 選ばれなかった理由（logic 由来、1 文） */
  reason: string;
  /** 出典 URL（searchCandidates の url を引き写す）。null 可 */
  url: string | null;
}

/** 出典エントリ（bottom sheet フッター用） */
export interface CandidateSource {
  /** 表示ラベル（「映画.com」「食べログ」等） */
  label: string;
  /** 出典 URL */
  url: string;
}

// ─────────────────────────────────────────────
// CoAlter 4-layer rebuild (2026-04-18)
//
// Layer 0: briefBuilder (LLM + parser_fallback)    → ConversationBrief
// Layer 1: movieCatalog (logic)                    → MovieScreening[]  (既存)
// Layer 2: movieRanker (logic)                     → RankedCandidate[]
// Layer 3: narrationBuilder + narrationEnricher / narrationTemplate
//
// 設計原則:
//  - LLM は「意図の読み取り」と「自然言語化」に限定
//  - 事実（作品名・劇場・時間・評価）は logic で決める
//  - ロジック由来の narration はテンプレートではなく事実ベースの本文
//  - rankingAxes は closed-set preset のみ（自由生成禁止）
// ─────────────────────────────────────────────

/**
 * Layer 0 出力: 会話から抽出した「今回決めたいこと」の構造化ブリーフ。
 *
 * source="llm"          → LLM 成功時。high confidence 前提。
 * source="parser_fallback" → LLM 失敗時。正規表現 + heuristics で最低限を埋める。
 */
export interface ConversationBrief {
  /** テーマ（Layer 1 以降の分岐キー） */
  theme:
    | "movie"
    | "food"
    | "travel"
    | "date"
    | "schedule"
    | "gift"
    | "general";

  /** エリア（「渋谷」「新宿」等）。不明なら null */
  area: string | null;

  /** おおよその時間 */
  approximateTime: {
    /** YYYY-MM-DD or 「今週末」等の正規化後。不明なら null */
    date: string | null;
    /** 時間帯 */
    timeSlot: "morning" | "afternoon" | "evening" | "night" | null;
    /** 希望開始時刻（24h hour, 0-23）。null なら未指定 */
    preferredStartHour: number | null;
  };

  /**
   * 会話から読み取った「気分・雰囲気」の closed vocabulary。
   * 自由生成禁止。
   */
  mood: BriefMood[];

  /** 二人の合意制約（既存型を再利用） */
  hardConstraints: AgreedConstraint[];

  /**
   * この会話に合うランキング軸 preset を選ぶ。
   * 自由生成禁止 — 3種の preset のみ。
   */
  rankingAxes: RankingAxesSelection;

  /**
   * まだ決められない場合の primary question（1件のみ）。
   * 決まっているなら null。
   *
   * 「3件全部揃わないから clarify」ではなく、
   * 「この一点が決まれば動く」という設計。
   */
  primaryUnresolvedQuestion: PrimaryUnresolvedQuestion | null;

  /** ブリーフ全体の確信度（0.0〜1.0） */
  confidence: number;

  /**
   * フィールド単位の確信度（Augmentation A）。
   * parser_fallback で埋めたフィールドは 0.4 以下、LLM 由来は 0.7 以上が目安。
   * Layer 2 の hard filter / clarify 判断で参照。
   */
  fieldConfidence?: {
    theme?: number;
    area?: number;
    approximateTime?: number;
  };

  /** ブリーフ生成元 */
  source: "llm" | "parser_fallback";
}

/** Brief の mood closed vocabulary */
export type BriefMood =
  | "重すぎない"
  | "会話が続く"
  | "静か"
  | "盛り上がる"
  | "癒し"
  | "刺激"
  | "ノスタルジア"
  | "軽め"
  | "非日常"
  | "安心";

/**
 * ランキング軸 preset。closed-set。
 *
 * - balance_focus: 基本（二人の折り合い）
 * - safety_adventure_discovery: 探索的（新しさ重視）
 * - calm_stimulating_nostalgic: ムード軸（気分で決めたい）
 */
export type RankingAxesPreset =
  | "balance_focus"
  | "safety_adventure_discovery"
  | "calm_stimulating_nostalgic";

/** preset が提供する役割ラベル。closed-set。 */
export type RankingRole =
  | "balance"
  | "aFocus"
  | "bFocus"
  | "safety"
  | "adventure"
  | "discovery"
  | "calm"
  | "stimulating"
  | "nostalgic";

/** Layer 0 が選んだ軸 preset と、その選択理由 */
export interface RankingAxesSelection {
  preset: RankingAxesPreset;
  /** preset が露出する役割。UI/narration で使う */
  roles: RankingRole[];
  /** なぜこの preset を選んだか（narration への素材） */
  rationale: string;
}

/** Layer 0 が出す primary question */
export interface PrimaryUnresolvedQuestion {
  /** 識別キー（"area" / "timeSlot" / "date" 等） */
  key: string;
  /** ユーザーへの問い */
  question: string;
  /** 該当する 5W1H スロット */
  slot: import("@/lib/coalter/slots").SlotKey;
}

// ─────────────────────────────────────────────
// Layer 2: movie ranker — input / output
// ─────────────────────────────────────────────

/** Layer 2 入力 */
export interface RankInput {
  brief: ConversationBrief;
  catalog: MovieScreening[];
  /** 前回までに採用済みの candidate key（reroll 用） */
  avoidKeys: string[];
  /** L1 プロフィール（interest match の素材） */
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
}

/** Layer 2 出力 */
export interface RankOutput {
  /** 採用された候補。0件 → clarify 誘導 / 1-2件 → 部分返却 / 3件 → 正規返却 */
  ranked: RankedCandidate[];
  /**
   * 代替案プール（役割外上位、0-2 件、上限 2 固定）。
   *
   * Phase A (2026-04-18) CEO 方針:
   *  - 追加 LLM 呼び出しはしない（Layer 2 の residual のみ）
   *  - 全候補で共有。各 candidate の detail.alternatives はここから選ぶ
   */
  alternatives: RankedAlternative[];
  /** ハードフィルタで落とされた監査トレース */
  filterTrace: FilterTrace[];
  /** ランカーが適用した preset（brief と同じだが、監査のため再掲） */
  appliedPreset: RankingAxesPreset;
  /** フィルタ前後の件数 */
  counts: {
    inputCatalog: number;
    afterHardFilter: number;
    afterDiversity: number;
  };
}

/**
 * 役割から外れたが有力だった候補（bottom sheet の「こっちもあるよ」枠）。
 *
 * 事実フィールドのみ持つ。LLM は呼ばない。
 */
export interface RankedAlternative {
  title: string;
  theater: string | null;
  showtime: string | null;
  releaseStatus: "showing" | "upcoming" | "ended" | "unknown";
  sourceUrl: string;
  rating: string | null;
  /** 選ばれなかった主要理由（logic 由来、1 文） */
  reason: string;
  /** この alternative が最も強かった role */
  topRole: RankingRole;
  /** その role でのスコア */
  topRoleScore: number;
}

/**
 * ハードフィルタで落とされた候補の監査行。
 */
export interface FilterTrace {
  title: string | null;
  theater: string | null;
  /** 落とされた理由コード（複数可） */
  reasons: HardFilterReason[];
}

/**
 * ハードフィルタ理由 (Augmentation B の #7 を含む)。
 */
export type HardFilterReason =
  | "violates_release_status"       // hardConstraints "公開中のみ" + upcoming
  | "violates_timeslot"             // 「夜」希望 + showtime 全て非該当
  | "violates_area"                 // area 指定 + 劇場が該当エリア外
  | "violates_preferred_start_hour" // preferredStartHour±2h に showtime なし
  | "violates_avoid_keys"           // 前回採用済み
  | "missing_identity"              // title/theater 共に null
  | "missing_where"                 // Phase A.5: theater が紐付けられない（作品×映画館で初めて1候補）
  | "stale_release"                 // Phase A.6 P1: 既に上映終了 / リリースが古すぎる
  | "unknown_status_without_showtime"; // Augmentation B: showtimes=[] AND status="unknown"

/**
 * Layer 2 が返す 1 候補。title / theater / showtime / runtime / rating /
 * releaseStatus / axisScores / rationale は **Layer 3 LLM から書き換え禁止**
 * （narrationEnricher の postprocessor で強制）。
 */
export interface RankedCandidate {
  /** 一意キー（avoidKeys 用、重複判定用） */
  candidateKey: string;
  /** この候補の役割（preset.roles の 1 つ） */
  role: RankingRole;

  // ─ 事実フィールド（immutable）─
  title: string;
  theater: string | null;
  /** 採用された開始時刻（複数 showtimes の中からランカーが選んだ 1 つ） */
  showtime: string | null;
  runtimeMinutes: number | null;
  releaseStatus: "showing" | "upcoming" | "ended" | "unknown";
  rating: string | null;
  sourceUrl: string;

  /** 現在役割に対応した軸スコア（preset の roles と対応） */
  axisScores: Partial<Record<RankingRole, number>>;
  /** 総合スコア（Layer 2 内部デバッグ + 監査用） */
  totalScore: number;

  /** Layer 3 narration の素材（immutable）*/
  rationale: SelectionRationale;

  /** この候補の全 scoring 明細（observability） */
  breakdown: ScoreBreakdown;
}

/**
 * narration 用の構造化理由。LLM はこれを元に自然文を書くが、
 * 中身のフィールドは改変できない（postprocess で保護）。
 */
export interface SelectionRationale {
  /** この候補が響く「A 側 interest」ラベル（profileA.interests からヒットしたもの） */
  matchedInterestsA: string[];
  /** B 側同上 */
  matchedInterestsB: string[];
  /** A 側 values ヒット */
  matchedValuesA: string[];
  matchedValuesB: string[];
  /** どの軸で強かったか（role ベース） */
  appealedAxis: RankingRole[];
  /** 必要ならトレードオフ注記（「runtime は長め」等）。null 可 */
  tradeoff: string | null;
  /** 条件崩れ時のヒント（「夜が厳しければ 17 時台も可」等）。null 可 */
  contingencyHint: string | null;
}

/**
 * scoring 明細（observability + 後段デバッグ）。
 */
export interface ScoreBreakdown {
  /** 各 metric の 0-1 値 */
  metrics: {
    novelty: number;
    safety: number;
    runtimeFit: number;
    timeslotFit: number;
    areaFit: number;
    genreMatchA: number;
    genreMatchB: number;
    moodMatch: number;
  };
  /** role→score map（preset が提供する role 分だけ埋まる） */
  roleScores: Partial<Record<RankingRole, number>>;
  /** 最終採用 role */
  assignedRole: RankingRole;
}

// ─────────────────────────────────────────────
// Phase B Commit 2: foodRanker — input / output (2026-04-18)
// ─────────────────────────────────────────────

/**
 * food 用 hard filter 理由コード（9 種）。
 *
 * 境界原則: 「明確な違反」のみ hard。不明な場合は通す。
 */
export type FoodHardFilterReason =
  | "violates_budget"             // budget 制約ありかつ priceBand が超える
  | "violates_area"               // area 指定ありかつ venue.area/station が該当外
  | "violates_cuisine_exclusion"  // exclusion 制約違反
  | "violates_companions"         // 同席条件違反
  | "violates_opening_hours"      // openingHours 既知かつ timeSlot と明確不一致（不明は通す）
  | "closed_permanently"          // snippet に「閉店」「閉業」検出
  | "missing_where"               // station=null AND area=null
  | "insufficient_info"           // confidence < 0.1（name 単独）
  | "violates_avoid_keys";        // candidateId が avoidKeys に含まれる

/**
 * food 用 metric 9 種。
 *
 * - quietnessFit は 静か / 盛り上がる のみ担当
 * - moodMatch は残り mood（重すぎない/会話が続く/癒し/刺激/ノスタルジア/軽め/非日常/安心）
 *   → 二重加点を避けるため責務分離
 * - novelty は confidence と独立（sourceDomain proxy）。balance / safety には使わない
 * - ratingFit 欠損時は 0.5 中立（公式サイト由来を不利にしない）
 */
export interface FoodMetrics {
  budgetFit: number;
  areaFit: number;
  quietnessFit: number;
  novelty: number;
  cuisineMatchA: number;
  cuisineMatchB: number;
  moodMatch: number;
  ratingFit: number;
  /** balance preset のみ active 時のみ非 0（max(prefA,prefB)>=0.5 && |prefA-prefB|>=0.2） */
  compromiseQuality: number;
}

/** food scoring 明細（observability + 後段デバッグ） */
export interface FoodScoreBreakdown {
  metrics: FoodMetrics;
  roleScores: Partial<Record<RankingRole, number>>;
  assignedRole: RankingRole;
}

/** food hard filter trace（追加フィールド: confidence / missingFields で監査強化） */
export interface FoodFilterTrace {
  candidateId: string;
  venueName: string | null;
  reasons: FoodHardFilterReason[];
  /** 観測用: drop 時の confidence（insufficient_info 診断に使う） */
  confidence?: number;
  /** 観測用: 欠けていたフィールド（missing_where 等の診断に使う） */
  missingFields?: string[];
}

/** food ranker input */
export interface FoodRankInput {
  brief: ConversationBrief;
  catalog: ActivityCandidate<FoodVenue>[];
  /** 前回までに採用済みの candidateId（reroll 用） */
  avoidKeys: string[];
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
}

/** food ranker output（movie RankOutput 並行形） */
export interface FoodRankOutput {
  ranked: RankedFoodCandidate[];
  alternatives: RankedFoodAlternative[];
  filterTrace: FoodFilterTrace[];
  appliedPreset: RankingAxesPreset;
  counts: {
    inputCatalog: number;
    afterHardFilter: number;
    afterDiversity: number;
  };
}

/** role 採用候補（事実は pure entity FoodVenue から参照） */
export interface RankedFoodCandidate {
  /** avoidKeys 互換キー（= ActivityCandidate.candidateId 流用） */
  candidateKey: string;
  role: RankingRole;
  /** 事実 entity（venue のメタ情報はすべてここ） */
  venue: FoodVenue;
  sourceUrl: string;
  sourceDomain: string;
  confidence: number;
  axisScores: Partial<Record<RankingRole, number>>;
  totalScore: number;
  rationale: SelectionRationale;
  breakdown: FoodScoreBreakdown;
}

/** 役割外上位（bottom sheet の「こっちもあるよ」枠、上限 2） */
export interface RankedFoodAlternative {
  candidateKey: string;
  venue: FoodVenue;
  sourceUrl: string;
  reason: string;
  topRole: RankingRole;
  topRoleScore: number;
}

// ─────────────────────────────────────────────
// Observability (v1)
// ─────────────────────────────────────────────

/**
 * 1 提案生成あたり 1 行記録される品質監査レコード。
 * supabase: coalter_proposal_quality テーブル。
 */
export interface ProposalQualityRecord {
  sessionId: string;
  briefSource: "llm" | "parser_fallback";
  briefConfidence: number;
  catalogCount: number;
  rankedCount: number;
  rankingAxesPreset: RankingAxesPreset | null;
  narrationMode: "llm" | "logic_template" | "mixed";
  llmSuccessLayer0: boolean;
  llmSuccessLayer3: boolean;
  latencyMsTotal: number;
  latencyMsCatalog: number;
  latencyMsRank: number;
  latencyMsNarration: number;
  /** ユーザー反応（後段イベントで upsert） */
  userAction: "adopted" | "refined" | "rerolled" | "dismissed" | null;
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
  /**
   * 既存 decision path との後方互換用フィールド。
   * - card.mode === "decision" のときは DecisionCard（= ProposalCard + mode タグ）を射影する
   * - card.mode === "negotiate" / "clarify" のときは summary / closing のみ入った placeholder
   *   （candidates は空配列）
   *
   * 新規のクライアントは `card` を使って discriminated union で分岐すること（CEO 6.C 条件 #4）。
   */
  proposalCard: ProposalCard;
  /** Phase 1.5: このカードに含まれる候補の一意キー（次回の avoidKeys 用） */
  seenCandidateKeys: string[];
  /** Phase 1.5.4.6: このセッションで採用された topic anchor（UI 表示 / 変更ボタン用） */
  topicAnchor?: TopicAnchor | null;
  // ─ Phase 2 / 6.C (2026-04-19) ─
  /**
   * 新しい 3-mode の統一出力（discriminated union）。
   * UI は `switch (card.mode)` で分岐する。
   */
  card?: CoAlterCard;
  /**
   * Mode router の trace。Gate 不通過時は null。
   * CEO 6.C 条件 #3: coalter_messages.metadata.routerTrace へ永続化される。
   */
  routerTrace?: RouterTrace | null;
  /** Pre-router gate 結果 */
  gateResult?: PreRouterGateResult;
  /** executor が trace.selectedMode と違う decision を出した理由（観測用） */
  executorFallbackReason?: "gate_blocked" | "theme_not_movie_yet" | null;
  /** 内部メトリクス（analytics用） */
  _internal: {
    searchDecision: SearchDecision;
    caringIntensityA: number;
    caringIntensityB: number;
    fairnessBias: number; // この提案の偏りスコア
    processingTimeMs: number;
  };
  /**
   * [M1 1a] Stage 1 Understand snapshot (optional, flag-gated).
   *   - 既定 OFF: `COALTER_STAGE1_LIVE !== true` のとき欠落
   *   - ON: invoke route が pipeline 完了後に collector + runUnderstanding() を呼び、
   *     結果をここに付与する。既存 CoAlterOutput shape は非破壊
   *   - discriminated union（outcome で分岐）。failed 時は todayReading を意図的に
   *     欠落させ、default 値を意味ある信号と誤読させない
   */
  stage1?: Stage1Snapshot;
}

// ─────────────────────────────────────────────
// Stage 1 Understand snapshot（invoke response 乗せ用）
//
// [CEO lock 2026-04-20 M1 1a] discriminated union。
//   outcome が "failed" のときは todayReading を欠落させる（rule-based の
//   default 値を意味ある信号と誤読させない）。
//   collectorMeta は後続の latency / 過読み検証のために query 数と参照元を記録。
// ─────────────────────────────────────────────

/** Stage 1 collector がどの DB ソースを何回引いたかの記録（観測用） */
export interface Stage1CollectorMeta {
  /** 実行した supabase query 本数（pair_state 取得は invoke 側で既実行なので含めない） */
  queryCount: number;
  /** 参照したテーブル / ビュー名の昇順 distinct list（例: ["talk_messages"]） */
  sources: string[];
}

/** failed: source_coverage が全ゼロ OR confidence < 0.2 のとき */
export interface Stage1SnapshotFailed {
  outcome: "failed";
  understanding_confidence: number;
  lensVersion: string;
  computedAt: string;
  collectorMeta: Stage1CollectorMeta;
  // todayReading は意図的に欠落
}

/** degraded / success: runUnderstanding() が意味ある todayReading を返したとき */
export interface Stage1SnapshotOk {
  outcome: "degraded" | "success";
  understanding_confidence: number;
  todayReading: {
    mode: "recover" | "celebrate" | "connect" | "challenge" | "maintain";
    energyBudget: "high" | "mid" | "low";
    timeBudget: "ample" | "limited" | "tight";
    implicitIntent: string;
    latentNeeds: string[];
    confidence: number;
  };
  lensVersion: string;
  computedAt: string;
  collectorMeta: Stage1CollectorMeta;
}

export type Stage1Snapshot = Stage1SnapshotFailed | Stage1SnapshotOk;

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

// ═════════════════════════════════════════════════════════════════════
// Phase 2: 3-mode 設計本体（2026-04-19 v0.3 gate 通過）
//
// 参照: docs/coalter-phase2-3mode-design.md
//
// 中核原則: 「mode selection」と「安全/同意ゲート」と「実行器」を分離する。
// 4 段階: Pre-router gate → Mode router → Post-router modifier → Executor
//
// フェーズ 6.A スコープ: ここから下の型定義 + preRouterGate + modeRouter。
// executor（negotiateBuilder / clarifyBuilder）はフェーズ 6.B で実装する。
// ═════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// Phase 2: 信号（Signals）
// ─────────────────────────────────────────────

/**
 * 誤読信号。
 * Intent Translation Engine（lib/talk/intentTranslation/intentReconstruction.ts）
 * の戻り値から CoAlter が**読むだけ**で組み立てる。
 * CoAlter 側から intentTranslation を直接 import しない（§3.6 依存禁止表）。
 */
export interface MisreadSignal {
  /** 0-1 の誤読度合い（>=0.7 で clarify 優先トリガー） */
  confidence: number;
  /** 誤読が主にどちら向きか（A→B: A の発話が B に誤読された） */
  direction: "a_to_b" | "b_to_a" | null;
  /** 目印となる直近メッセージの ID（存在すれば） */
  anchorMessageId: string | null;
}

/**
 * 対立信号。
 * lib/coalter/conversationParser.ts（フェーズ 6.B で新設）が算出する。
 */
export interface ContradictionSignal {
  /** 対立が検出されたか */
  detected: boolean;
  /** 対立している軸（AxisKey のサブセット） */
  axes: AxisKey[];
  /** A / B それぞれの立場の要約（短い）。未検出時は null */
  stanceA: string | null;
  stanceB: string | null;
}

/** 膠着信号 */
export interface StallSignal {
  /** 同じ話題が N ターン以上進まない */
  detected: boolean;
  /** 連続膠着ターン数 */
  consecutiveTurns: number;
}

/**
 * 情緒温度（四騎士検出の副産物）。
 * nvcAnalysis の戻り値を CoAlter が**読むだけ**で組み立てる。
 */
export interface EmotionHeat {
  severity: "low" | "mid" | "high";
  /** high の主因（DV / コントロール兆候 etc）。low / mid では null */
  reason: string | null;
}

// ─────────────────────────────────────────────
// Phase 2: Pre-router gate
// ─────────────────────────────────────────────

/** Pre-router gate 入力 */
export interface PreRouterGateInput {
  consent: CoAlterSessionState;
  emotionHeat: EmotionHeat;
}

/** Pre-router gate 結果 */
export type PreRouterGateResult =
  | { pass: true }
  | { pass: false; reason: "consent_not_active" | "emotion_heat_high"; emotionReason?: string | null };

// ─────────────────────────────────────────────
// Phase 2: Mode router
// ─────────────────────────────────────────────

/**
 * modeRouter の分岐名。RouterTrace.reason に入る。
 * 8 分岐（design doc §1.3）。
 */
export type RouterReason =
  | "negotiate_no_proposal_retry_decision"    // 1. 前ターン negotiate proposals=0 → decision 戻し
  | "clarify_self_suppression"                 // 2. 連続 clarify 抑制 → decision
  | "misread_dominant"                         // 3. misread >= 0.7 → clarify
  | "contradiction_detected"                   // 4. contradiction → negotiate
  | "stall_detected"                           // 5. stall → decision（branch 寄り）
  | "ambiguity_conclude"                       // 6. ambiguity conclude → decision
  | "ambiguity_branch"                         // 6. ambiguity branch → decision
  | "ambiguity_clarify_delegate_decision"      // 7. Ambiguity Engine clarify（1 問） → decision
  | "default_decision";                        // 8. default

/** 信号名（trace 用） */
export type SignalName =
  | "misread"
  | "contradiction"
  | "stall"
  | "ambiguity_conclude"
  | "ambiguity_branch"
  | "ambiguity_clarify"
  | "previous_clarify_self_suppress"
  | "previous_negotiate_no_proposal";

/**
 * modeRouter 入力。
 * **純関数**で受ける全入力。DB や session state は外側で取得してここに詰める。
 */
export interface ModeRouterInput {
  /** 直前ターンの mode（初回は null） */
  previousMode: CoAlterMode | null;
  /** 連続 clarify ターン数（clarify 自己増殖防止の閾値用） */
  previousClarifyTurns: number;
  /** 直前が negotiate で proposals=0 だったか（最優先短絡の入力） */
  previousNegotiateNoProposal: boolean;
  /** 誤読信号 */
  misread: MisreadSignal;
  /** 対立信号 */
  contradiction: ContradictionSignal;
  /** 膠着信号 */
  stall: StallSignal;
  /**
   * 既存 Ambiguity Engine からの応答モード。
   * null の場合は「Ambiguity Engine が走っていない / 判定できなかった」を表し、
   * router は default_decision へ落ちる。
   */
  ambiguityResponseMode: AmbiguityResponseMode | null;
}

/**
 * Ambiguity Engine 応答モードのサブセット。
 * 既存型は lib/stargazer/alterHomeAdapter.ts の AmbiguityResponseMode と重なるが、
 * Phase 2 は CoAlter 側から Stargazer 型を直接 import しない（レイヤ分離）。
 * 必要な 3 値のみ再宣言。
 */
export type AmbiguityResponseMode = "conclude" | "branch" | "clarify";

/**
 * modeRouter の戻り値 = RouterTrace。
 * v0.3 で mode 単体返却から trace 返却に昇格（監査・debug 用、§1.3.1）。
 */
export interface RouterTrace {
  /** 最終決定された mode */
  selectedMode: CoAlterMode;
  /** 分岐名（短絡評価で決まった分岐） */
  reason: RouterReason;
  /** 閾値を超えた信号（順序不問） */
  triggeredSignals: SignalName[];
  /** 閾値を超えたが優先順位で抑制された信号 */
  suppressedSignals: SignalName[];
  /** 直前ターンの mode（自己抑制の根拠） */
  previousMode: CoAlterMode | null;
  /** Post-modifier が決定する最大質問数（emotion_heat mid → 0、通常 → 1） */
  questionBudget: 0 | 1;
  /** 生成時刻 ISO8601 */
  timestamp: string;
}

// ─────────────────────────────────────────────
// Phase 2: Post-router modifier
// ─────────────────────────────────────────────

/**
 * Post-router modifier の出力。
 * mode は変えない。語調と質問数を絞る責務のみ。
 */
export interface ToneModifier {
  /** closing 文を柔らかくするか */
  softenClosing: boolean;
  /** 最大質問数（emotion_heat mid → 0、通常 → 1） */
  maxQuestion: 0 | 1;
}

// ─────────────────────────────────────────────
// Phase 2: CoAlterCard discriminated union
// ─────────────────────────────────────────────

/**
 * decision モードの Card（既存 ProposalCard を mode タグで装飾）。
 * ProposalCard 本体は不変。後方互換保持のため、既存コードは
 * ProposalCard 型を使い続けて良い。union として判別するときのみ DecisionCard を使う。
 */
export type DecisionCard = ProposalCard & { mode: "decision" };

/**
 * negotiate モードの Card（フェーズ 6.B で builder 実装）。
 *
 * 契約:
 * - proposals.length = 0 を許容（既存 catalog で materialize できない場合）
 * - ただし pieExpansion の 3 フィールドのうち少なくとも 1 つは非 null である必要あり
 *   （完全空の NegotiateCard を許さない、§4.2）
 */
export interface NegotiateCard {
  mode: "negotiate";
  summary: string;
  interests: {
    a: { nonNegotiable: string[]; negotiable: string[] };
    b: { nonNegotiable: string[]; negotiable: string[] };
  };
  pieExpansion: {
    axisShift: string | null;
    timeShift: string | null;
    placeShift: string | null;
  };
  /** 第三案 0-3 件（0 件許容、v0.3） */
  proposals: ProposalCandidate[];
  closing: string;
}

/**
 * clarify モードの Card（フェーズ 6.B で builder 実装）。
 *
 * 契約（§2.2、§3 棲み分け）:
 * - 候補を持たない（proposals / candidates フィールドを意図的に含まない）
 * - neutralTranslation は**言い換え（paraphrase）のみ**
 *   感情調停・提案・感情中立化は禁止
 * - question は最大 1 問、emotion_heat mid または target 不明のときは 0 問
 */
export interface ClarifyCard {
  mode: "clarify";
  summary: string;
  pointList: {
    facts: string[];
    feelings: string[];
  };
  neutralTranslation: {
    aToB: string | null;
    bToA: string | null;
  };
  question: { target: "a" | "b"; text: string } | null;
  closing: string;
}

/**
 * CoAlter の出力カード統一型（Phase 2 開幕で一括導入、§4.4）。
 * UI 側は switch (card.mode) で分岐する。
 */
export type CoAlterCard = DecisionCard | NegotiateCard | ClarifyCard;
