/**
 * Alter Understanding System
 *
 * Alterを「答えるAI」から「ユーザーの第2の自己」へ昇華させるための
 * 理解レイヤーの基盤。既存の判断エンジン（ForceBalance + ActionShape）を
 * 壊さず、その上に新しい層を積む。
 *
 * Layer 0: Trust Gate    — 理解の「出し方」を制御
 * Layer 1: Trait         — Stargazer由来の性格構造（既存）
 * Layer 2: State         — 今この瞬間の心理的キャパシティ
 * Layer 3: Life Context  — 人間関係・経済・生活環境
 * Layer 4: Narrative     — 歴史・反復テーマ・傷・意味づけ
 * Layer 5: Cross-Context — 領域を超えた反復と矛盾
 * Layer 6: Decision      — 全層統合の判断（既存 ForceBalance + ActionShape）
 *
 * 横断機能: Micro Insight Engine — 小さなズレの検知と自然な提示
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UnderstandingUnit — 全ての理解に付ける4軸タグ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 情報の出所。「わかったつもり」を防ぐために不可欠 */
export type EpistemicSource =
  | "user_stated"        // ユーザーが明言した
  | "user_implied"       // 発言から推定（「母が…」→ 母親がいる）
  | "behavior_observed"  // 行動パターンから観測（時間帯、頻度、回避）
  | "alter_inferred"     // Alterが推論した（Cross-Context等）
  | "contradicted";      // ユーザーの言動が矛盾している

/** 時間スケール。一時的状態と恒常的性格の混同を防ぐ */
export type Temporality =
  | "momentary"    // 今この瞬間（「今日は疲れた」）
  | "situational"  // 現在の状況（「転職活動中」）→ 数週間〜数ヶ月
  | "persistent"   // 継続的傾向（「人前が苦手」）→ 年単位
  | "structural";  // 深層構造（「承認を求め続ける」）→ 人格レベル

/** 理解の最小単位。全ての理解にこの4軸タグが付く */
export interface UnderstandingUnit {
  /** 理解の内容 */
  content: string;
  /** 理解のカテゴリ */
  category: UnderstandingCategory;
  /** 情報源 */
  source: EpistemicSource;
  /** 時間スケール */
  temporality: Temporality;
  /** 確信度 0.0-1.0 */
  confidence: number;
  /** 裏付けとなる観測の数 */
  evidence_count: number;
  /** 最後に確認された日時 */
  last_confirmed: string; // ISO date
  /** 30日以上未確認なら true */
  possibly_stale: boolean;
}

export type UnderstandingCategory =
  | "person"          // 重要人物に関する理解
  | "environment"     // 生活環境（仕事、住居、経済）
  | "emotion"         // 感情状態や感情パターン
  | "behavior"        // 行動パターンや習慣
  | "value"           // 価値観や優先事項
  | "wound"           // 心理的な傷や恐れ
  | "contradiction"   // 矛盾する発言や行動
  | "life_stage";     // 人生段階や転機

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 0: Trust Gate — 信頼度に応じた開示制御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 信頼レベル。Alterが知っていることと、出していいことを分離する。
 *
 * T0: 反映のみ（「〜と言ってましたね」）
 * T1: パターン提示（「〜する傾向がありそうですね」）
 * T2: 仮説提示（「もしかして〜？」）
 * T3: 接続提示（「仕事でも恋愛でも同じパターンでは？」）
 * T4: 直言（「正直に言う」）
 */
export type TrustLevel = 0 | 1 | 2 | 3 | 4;

/** Trust Gate の計算に使うシグナル */
export interface TrustSignals {
  /** 完了セッション数 */
  session_count: number;
  /** ユーザーが自発的に深い話をした回数 */
  deep_disclosure_count: number;
  /** Alterの指摘に対する受容率 (0-1) */
  insight_acceptance_rate: number;
  /** 「違う」と言えた回数（心理的安全性の証拠） */
  correction_count: number;
  /** Micro Insightに対する反応の傾向 */
  micro_insight_reception: "positive" | "neutral" | "negative" | "unknown";
}

/**
 * Trust Level を計算する（TrustSignals ベース版）。
 * 量（セッション数）だけでなく、質（開示の深さ、安全性の証拠）を重視する。
 *
 * 現在は TrustSignals の全フィールドが蓄積されていないため、
 * route.ts では deriveTrustLevel() を使用。
 * Phase 5 で stargazer_alter_reactions のデータが十分蓄積された時点で
 * こちらに移行する。
 */
export function calculateTrustLevel(signals: TrustSignals): TrustLevel {
  const { session_count, deep_disclosure_count, insight_acceptance_rate, correction_count } = signals;

  // T4: 明確な信頼関係が確立されている
  // セッション数だけでなく、開示の深さと安全性の両方が必要
  if (
    session_count >= 40 &&
    deep_disclosure_count >= 10 &&
    insight_acceptance_rate >= 0.6 &&
    correction_count >= 3 // 「違う」と言えることが安全性の証拠
  ) {
    return 4;
  }

  // T3: クロスコンテキストの接続を提示できる
  if (
    session_count >= 20 &&
    deep_disclosure_count >= 5 &&
    insight_acceptance_rate >= 0.5
  ) {
    return 3;
  }

  // T2: 仮説を提示できる
  if (
    session_count >= 8 &&
    deep_disclosure_count >= 2 &&
    insight_acceptance_rate >= 0.3
  ) {
    return 2;
  }

  // T1: パターンを提示できる
  if (session_count >= 3) {
    return 1;
  }

  // T0: 反映のみ
  return 0;
}

/**
 * この理解を、現在のTrust Levelで提示してよいか判定する。
 */
export function canDisclose(
  unit: UnderstandingUnit,
  trustLevel: TrustLevel,
): boolean {
  // 事実の反映はいつでもOK
  if (unit.source === "user_stated") return true;

  // ユーザーの発言から推定したものはT1から
  if (unit.source === "user_implied") return trustLevel >= 1;

  // 行動観測からのパターンはT1から（ただし控えめに）
  if (unit.source === "behavior_observed") return trustLevel >= 1;

  // Alterの推論はT2から
  if (unit.source === "alter_inferred") {
    // 深層構造（傷、防衛機制）はT3以上
    if (unit.category === "wound") return trustLevel >= 3;
    // 矛盾の指摘はT2以上
    if (unit.category === "contradiction") return trustLevel >= 2;
    // その他の推論はT2以上
    return trustLevel >= 2;
  }

  // 矛盾はT2から
  if (unit.source === "contradicted") return trustLevel >= 2;

  return false;
}

/**
 * 理解の提示形式を、Trust Levelに応じて決定する。
 */
export function getDisclosureStyle(trustLevel: TrustLevel): DisclosureStyle {
  switch (trustLevel) {
    case 0: return { verb: "reflect", suffix: "", hedge: "" };
    case 1: return { verb: "observe", suffix: "かもしれない", hedge: "なんとなく" };
    case 2: return { verb: "hypothesize", suffix: "んじゃないかな", hedge: "もしかして" };
    case 3: return { verb: "connect", suffix: "かもしれない。違ったら教えて", hedge: "思い過ごしかもしれないけど" };
    case 4: return { verb: "state", suffix: "", hedge: "正直に言うと" };
  }
}

export interface DisclosureStyle {
  verb: "reflect" | "observe" | "hypothesize" | "connect" | "state";
  suffix: string;
  hedge: string;
}

/**
 * growthState の連続 trustLevel (0-1) と sessionsCompleted から
 * 離散 TrustLevel (0-4) を導出する。
 *
 * 将来 TrustSignals（deep_disclosure_count, insight_acceptance_rate 等）が
 * 十分蓄積されたら calculateTrustLevel() に移行する（Phase 5 の範囲）。
 */
export function deriveTrustLevel(
  continuousTrust: number,
  sessionsCompleted: number,
): TrustLevel {
  if (continuousTrust >= 0.85 && sessionsCompleted >= 40) return 4;
  if (continuousTrust >= 0.7 && sessionsCompleted >= 20) return 3;
  if (continuousTrust >= 0.4 && sessionsCompleted >= 8) return 2;
  if (sessionsCompleted >= 3) return 1;
  return 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: State Layer — 今この瞬間の心理的状態推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーの今この瞬間の心理的状態 */
export interface UserState {
  /** 心理的余力 0.0-1.0 (0=枯渇, 1=十分) */
  psychological_capacity: number;
  /** 感情的負荷 0.0-1.0 (0=軽い, 1=重い) */
  emotional_load: number;
  /** 認知疲労 0.0-1.0 */
  cognitive_fatigue: number;
  /** 推定の根拠 */
  estimation_basis: StateEstimationBasis[];
}

export type StateEstimationBasis =
  | "time_of_day"        // 時間帯から推定
  | "day_of_week"        // 曜日から推定
  | "topic_weight"       // 話題の重さから推定
  | "language_signal"    // 言語シグナルから推定
  | "explicit_statement" // ユーザーの明示的発言
  | "personality_default"; // 性格ベースのデフォルト

/**
 * ユーザーの心理的状態を軽量に推定する（LLM不使用）。
 * コスト: ゼロ（ルールベース）。
 *
 * 推定方法（優先度順）:
 *   1. 明示的発言（「疲れた」「元気」等）
 *   2. 時間帯・曜日
 *   3. 話題の重さ
 *   4. 言語シグナル（文長、感情語密度）
 */
export function estimateUserState(
  message: string,
  timestamp?: Date,
): UserState {
  let capacity = 0.6;    // デフォルト: まあまあ
  let emotional_load = 0.3;
  let cognitive_fatigue = 0.3;
  const basis: StateEstimationBasis[] = [];

  const now = timestamp ?? new Date();

  // ── 1. 明示的発言 ──
  if (/疲れ[たてる]|しんどい|きつい|つらい|辛い|限界|ぐったり|へとへと|ヘトヘト/.test(message)) {
    capacity -= 0.25;
    cognitive_fatigue += 0.2;
    basis.push("explicit_statement");
  }
  if (/元気|調子いい|やる気|テンション高|いい感じ|楽しい/.test(message)) {
    capacity += 0.15;
    emotional_load -= 0.1;
    basis.push("explicit_statement");
  }
  if (/不安[だで]|心配|怖い|こわい|落ち込[むみんで]|泣[いき]/.test(message)) {
    emotional_load += 0.25;
    capacity -= 0.1;
    basis.push("explicit_statement");
  }
  if (/イライラ|ムカ[つっ]|腹[がの]立|怒[りる]|キレ/.test(message)) {
    emotional_load += 0.2;
    basis.push("explicit_statement");
  }
  if (/眠[いれ]|寝不足|寝てない|睡眠.*[不足悪取]/.test(message)) {
    capacity -= 0.2;
    cognitive_fatigue += 0.25;
    basis.push("explicit_statement");
  }

  // ── 2. 時間帯 ──
  const hour = now.getHours();
  if (hour >= 23 || hour < 5) {
    // 深夜: 認知疲労が高く、感情が先行しやすい
    capacity -= 0.15;
    cognitive_fatigue += 0.15;
    basis.push("time_of_day");
  } else if (hour >= 5 && hour < 9) {
    // 早朝: 比較的クリア
    capacity += 0.05;
    basis.push("time_of_day");
  }

  // ── 3. 曜日 ──
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0) {
    // 日曜: 明日への不安が出やすい（サザエさん症候群）
    emotional_load += 0.05;
    basis.push("day_of_week");
  } else if (dayOfWeek === 5) {
    // 金曜: 疲労蓄積 + 解放感
    cognitive_fatigue += 0.05;
    basis.push("day_of_week");
  }

  // ── 4. 話題の重さ ──
  const HEAVY_TOPIC_SIGNALS = /死[にぬ]|自[殺傷]|別れ[たる]|離婚|裏切|暴力|虐待|借金|破[産綻]|倒産|リストラ|解雇|うつ|鬱|パニック/;
  const MEDIUM_TOPIC_SIGNALS = /転職|退職|告白|喧嘩|揉め|不満|ストレス|プレッシャー|孤独|寂し|後悔/;

  if (HEAVY_TOPIC_SIGNALS.test(message)) {
    emotional_load += 0.3;
    capacity -= 0.15;
    basis.push("topic_weight");
  } else if (MEDIUM_TOPIC_SIGNALS.test(message)) {
    emotional_load += 0.15;
    basis.push("topic_weight");
  }

  // ── 5. 言語シグナル ──
  const msgLength = message.length;

  // 極端に短い + 感情語多い = 切迫
  const emotionWords = (message.match(/[不嫌怖辛苦悲寂焦悩困迷疲]/g) ?? []).length;
  const emotionDensity = msgLength > 0 ? emotionWords / msgLength : 0;

  if (msgLength < 20 && emotionDensity > 0.1) {
    emotional_load += 0.15;
    capacity -= 0.1;
    basis.push("language_signal");
  }

  // 長文で丁寧 = まだ余裕がある
  if (msgLength > 100 && /ですが|ですけど|のですが|ました/.test(message)) {
    capacity += 0.05;
    basis.push("language_signal");
  }

  // デフォルト推定のフォールバック
  if (basis.length === 0) {
    basis.push("personality_default");
  }

  // 複数シグナルのスタックによる極端値を防止
  // capacity は最低 0.15（完全ゼロだと全ての行動提案が潰れる）
  // emotional_load / cognitive_fatigue は最大 0.85（天井飽和を防ぐ）
  return {
    psychological_capacity: clamp(capacity, 0.15, 1),
    emotional_load: clamp(emotional_load, 0, 0.85),
    cognitive_fatigue: clamp(cognitive_fatigue, 0, 0.85),
    estimation_basis: basis,
  };
}

/**
 * State Layer の推定結果を、既存の ForceBalance に反映するための調整値を返す。
 * ForceBalance 本体は変更せず、調整値を加算する形で統合する。
 */
export function computeStateAdjustment(state: UserState): StateForceAdjustment {
  const adj: StateForceAdjustment = {
    protect_pressure_delta: 0,
    expand_pressure_delta: 0,
    simplify_response: false,
    prefer_conclude_over_clarify: false,
  };

  // 心理的余力が低い → 守り方向 + 選択肢をシンプルに
  if (state.psychological_capacity < 0.35) {
    adj.protect_pressure_delta += 0.15;
    adj.expand_pressure_delta -= 0.1;
    adj.simplify_response = true;
  }

  // 感情的負荷が高い → まず受け取ることが先（質問より結論）
  if (state.emotional_load > 0.65) {
    adj.prefer_conclude_over_clarify = true;
    adj.protect_pressure_delta += 0.1;
  }

  // 認知疲労が高い → シンプルな選択肢に
  if (state.cognitive_fatigue > 0.6) {
    adj.simplify_response = true;
  }

  return adj;
}

export interface StateForceAdjustment {
  /** ForceBalance.protect_pressure に加算する値 */
  protect_pressure_delta: number;
  /** ForceBalance.expand_pressure に加算する値 */
  expand_pressure_delta: number;
  /** 応答をシンプルにすべきか（選択肢を減らす、短くする） */
  simplify_response: boolean;
  /** clarifyより conclude を優先すべきか（感情負荷高い時） */
  prefer_conclude_over_clarify: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 3: Life Context — 重要人物と環境の蓄積
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 重要人物マップの1エントリ */
export interface PersonEntry {
  /** 呼称（「母」「田中さん」「彼女」等） */
  label: string;
  /** 関係性の種類 */
  role: PersonRole;
  /** 関係の質感 */
  quality: string | null; // 自由テキスト。「温かいが条件付き」等
  /** この人の前でユーザーがどう振る舞うか */
  user_behavior_with: string | null;
  /** 感情トレンド */
  sentiment_trend: "improving" | "stable" | "declining" | null;
  /** 最後に言及された日時 */
  last_mentioned: string; // ISO date
  /** 情報源 */
  source: EpistemicSource;
}

export type PersonRole =
  | "parent" | "sibling" | "partner" | "ex" | "crush"
  | "close_friend" | "friend" | "acquaintance"
  | "boss" | "senior" | "colleague" | "subordinate" | "client"
  | "other";

/** 生活環境情報 */
export interface EnvironmentContext {
  living_situation: string | null;
  work_or_school: string | null;
  financial_pressure: "stable" | "tight" | "crisis" | null;
  source: EpistemicSource;
}

/** ライフステージ */
export interface LifeStageContext {
  current: string | null;
  upcoming_change: string | null;
  source: EpistemicSource;
}

/** Life Context 全体 */
export interface LifeContext {
  people: PersonEntry[];
  environment: EnvironmentContext;
  life_stage: LifeStageContext;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Micro Insight Engine — 小さなズレの検知と提示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Micro Insight のシグナル種別 */
export type MicroSignalType =
  | "language_shift"      // いつもと違う言葉遣い
  | "time_pattern"        // いつもと違う時間帯
  | "topic_absence"       // いつも出る人物/話題が出てこない
  | "topic_repetition"    // 同じ話題が繰り返される
  | "sentiment_shift"     // 特定の人物/話題への態度変化
  | "behavior_mismatch"   // 言っていることとやっていることのズレ
  | "energy_action_gap";  // エネルギー・意欲と行動の不一致

/** 検知されたシグナル（まだ提示するかは未決定） */
export interface MicroSignal {
  type: MicroSignalType;
  /** 何を検知したか */
  observation: string;
  /** 関連する人物やトピック */
  related_topic: string | null;
  /** 検知日時 */
  detected_at: string; // ISO date
  /** シグナルの強さ 0.0-1.0 */
  strength: number;
}

/** 複数シグナルが収束したときに生成される Micro Insight 候補 */
export interface MicroInsightCandidate {
  /** 収束したシグナル群 */
  signals: MicroSignal[];
  /** 提示の提案文 */
  suggested_prompt: string;
  /** 提示の型 */
  presentation_type: MicroInsightPresentationType;
  /** 必要な Trust Level */
  required_trust: TrustLevel;
  /** 収束の質スコア（Phase 2）。提示レベルの決定根拠 */
  convergence_score?: ConvergenceScore;
}

/**
 * 提示の型。検知の精度より、提示の形が10倍重要。
 *
 * casual_check:   「そういえば、〇〇さんとはどう？」
 * observation:    「最近、仕事の話が多いね」
 * gentle_inquiry: 「〇〇のとき、少し言葉を選んでる感じがする。何かある？」
 * connection:     「仕事で〇〇なとき、恋愛でも似た感じになってない？」
 */
export type MicroInsightPresentationType =
  | "casual_check"    // 最も安全。自然な関心として聞く
  | "observation"     // 事実レベルの観察共有
  | "gentle_inquiry"  // パターンの提示 + opt-out
  | "connection";     // Cross-Context接続（最も深い）

/**
 * ユーザーのメッセージからMicro Insightシグナルを検知する。
 * 単発では動かない。蓄積して収束を待つ。
 */
export function detectMicroSignals(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>,
  previousSignals: MicroSignal[],
): MicroSignal[] {
  const newSignals: MicroSignal[] = [];
  const now = new Date().toISOString();

  // ── 1. Energy × Action Mismatch ──
  // 「やりたい」「やらなきゃ」と言っているのに、行動が進んでいない
  // ※ 「大丈夫」は社交辞令で使われるため除外。明確な元気表現のみ。
  const hasPositiveEnergy = /元気[だで]|調子いい|やる気|テンション高/.test(message);
  const hasStuckAction = /進[まめん]ない|できてない|やれてない|手[がを]つけ|着手.*ない|先延ばし|後回し|放置|やらなきゃ.*けど|しなきゃ.*けど/.test(message);
  const hasDesireButNoAction = /したい.*けど.*でき|やりたい.*けど.*[ない無]|始め.*たい.*けど/.test(message);

  if ((hasPositiveEnergy && hasStuckAction) || hasDesireButNoAction) {
    newSignals.push({
      type: "energy_action_gap",
      observation: "エネルギーや意欲はありそうなのに、行動が止まっている",
      related_topic: null,
      detected_at: now,
      strength: 0.6,
    });
  }

  // ── 2. Behavior Mismatch ──
  // 「大丈夫」と言いながら重い話をしている
  // ※ 重い内容判定は2語以上の合致で発火（単発の「不安」等だけでは発火しない）
  const saysFine = /大丈夫|平気|問題ない|心配しないで/.test(message);
  const heavyWords = (message.match(/別れ|転職|退職|喧嘩|辛い|つらい|不安|怖い|死|限界|もう[いやだ嫌]/g) ?? []);

  if (saysFine && heavyWords.length >= 2) {
    newSignals.push({
      type: "behavior_mismatch",
      observation: "「大丈夫」と言いながら重い内容に触れている",
      related_topic: null,
      detected_at: now,
      strength: 0.7,
    });
  }

  // 「忙しい」+ 長文 は、忙しさを説明しているだけの可能性があるため
  // 長文閾値を上げ、かつ相談性の高いシグナルとの共起を要求
  const saysBusy = /忙しい|時間.*ない|余裕.*ない/.test(message);
  const hasConsultationSignal = /どうし[たよ]|どうすれば|アドバイス|相談|聞いて/.test(message);
  if (saysBusy && message.length > 250 && hasConsultationSignal) {
    newSignals.push({
      type: "behavior_mismatch",
      observation: "「忙しい」と言いながら長く相談している",
      related_topic: null,
      detected_at: now,
      strength: 0.4,
    });
  }

  // ── 3. Topic Repetition ──
  // 直近の会話で同じテーマが3回以上出ている
  if (conversationHistory.length >= 4) {
    const userMessages = conversationHistory
      .filter(m => m.role === "user")
      .map(m => m.content);
    const allUserText = [...userMessages, message].join(" ");

    const REPEATING_THEMES = [
      { theme: "仕事の不満", pattern: /上司|職場|仕事.*[嫌辛きつ]|会社.*[嫌辛やめ]/ },
      { theme: "恋愛の不安", pattern: /彼[女氏]|好きな人|恋人|連絡.*[来こない]|既読/ },
      { theme: "孤独感", pattern: /一人|孤独|寂し|誰も|ぼっち/ },
      { theme: "自己否定", pattern: /自分.*[だめダメ駄目]|価値.*ない|できない.*自分|情けない/ },
    ];

    for (const { theme, pattern } of REPEATING_THEMES) {
      const matches = allUserText.match(new RegExp(pattern.source, "g"));
      if (matches && matches.length >= 3) {
        // 既に同じテーマの repetition シグナルがなければ追加
        const alreadyDetected = previousSignals.some(
          s => s.type === "topic_repetition" && s.related_topic === theme
        );
        if (!alreadyDetected) {
          newSignals.push({
            type: "topic_repetition",
            observation: `「${theme}」に繰り返し触れている`,
            related_topic: theme,
            detected_at: now,
            strength: 0.5,
          });
        }
      }
    }
  }

  // ── 4. Sentiment Shift ──
  // 特定の人物について、以前と異なる感情トーンで話している
  // (この検知はconversationHistoryが十分にある場合のみ)
  if (conversationHistory.length >= 2) {
    // 人物パターン: 複合語の誤マッチを防ぐ（母音、父性、母子手帳 等を除外）
    const PERSON_PATTERNS = [
      { label: "母", pattern: /(?:お?母[親さ]|母)[がにはをと、。]/ },
      { label: "父", pattern: /(?:お?父[親さ]|父)[がにはをと、。]/ },
      { label: "彼女/彼氏", pattern: /彼[女氏][がにはをの、。]|恋人|パートナー/ },
      { label: "上司", pattern: /上司[がにはをの、。]/ },
      { label: "友達", pattern: /友達[がにはをの、。]|友人[がにはをの、。]|親友[がにはをの、。]/ },
    ];

    for (const { label, pattern } of PERSON_PATTERNS) {
      if (pattern.test(message)) {
        // この人物が以前の会話に出ていたか確認
        const previousMentions = conversationHistory.filter(
          m => m.role === "user" && pattern.test(m.content)
        );
        if (previousMentions.length > 0) {
          // 感情トーンの変化を簡易検出
          const prevNegative = previousMentions.some(m =>
            /嫌|辛|怖|不満|苦|怒|悲/.test(m.content)
          );
          const nowPositive = /好き|感謝|嬉し|楽し|ありがた/.test(message);
          const prevPositive = previousMentions.some(m =>
            /好き|感謝|嬉し|楽し|ありがた/.test(m.content)
          );
          const nowNegative = /嫌|辛|怖|不満|苦|怒|悲/.test(message);

          if ((prevNegative && nowPositive) || (prevPositive && nowNegative)) {
            newSignals.push({
              type: "sentiment_shift",
              observation: `${label}についての感情トーンが変化している`,
              related_topic: label,
              detected_at: now,
              strength: 0.6,
            });
          }
        }
      }
    }
  }

  return newSignals;
}

/**
 * 蓄積されたシグナルから、収束（3つ以上の同方向シグナル）を判定し、
 * Micro Insight候補を生成する。
 *
 * 原則: 単発のシグナルでは絶対に動かない。
 */
/** 収束の質を表すスコア。提示レベルの決定に使う */
export interface ConvergenceScore {
  /** シグナル数 */
  signal_count: number;
  /** 異なるセッション（タイムスタンプ）数 */
  session_diversity: number;
  /** 最初と最後のシグナル間の日数 */
  temporal_spread_days: number;
  /** 異なるシグナルタイプ数 */
  type_diversity: number;
  /** 総合スコア (0-1) */
  combined: number;
}

/**
 * シグナル群の収束品質をスコアリングする。
 * スコアが高いほど深い提示（gentle_inquiry, connection）が許可される。
 */
function scoreConvergence(sigs: MicroSignal[]): ConvergenceScore {
  const timestamps = new Set(sigs.map(s => s.detected_at));
  const types = new Set(sigs.map(s => s.type));

  const dates = sigs.map(s => new Date(s.detected_at).getTime());
  const spreadMs = dates.length >= 2 ? Math.max(...dates) - Math.min(...dates) : 0;
  const spreadDays = spreadMs / (1000 * 60 * 60 * 24);

  // 各軸を 0-1 に正規化して重み付き平均
  const countScore = Math.min(1, (sigs.length - 1) / 4);          // 2→0.25, 5→1.0
  const sessionScore = Math.min(1, (timestamps.size - 1) / 3);    // 2→0.33, 4→1.0
  const spreadScore = Math.min(1, spreadDays / 5);                // 1日→0.2, 5日→1.0
  const typeScore = Math.min(1, (types.size - 1) / 2);            // 2→0.5, 3→1.0

  const combined = countScore * 0.2 + sessionScore * 0.35 + spreadScore * 0.3 + typeScore * 0.15;

  return {
    signal_count: sigs.length,
    session_diversity: timestamps.size,
    temporal_spread_days: Math.round(spreadDays * 10) / 10,
    type_diversity: types.size,
    combined: Math.round(combined * 100) / 100,
  };
}

/**
 * 収束スコアに基づいて最大許可される提示タイプを決定する。
 * trustLevel による制約も適用する。
 */
function maxPresentationType(
  score: ConvergenceScore,
  trustLevel: TrustLevel,
): MicroInsightPresentationType {
  // Trust Level による上限
  if (trustLevel < 1) return "casual_check";
  if (trustLevel < 2 && score.combined < 0.5) return "casual_check";

  // 収束スコアによる上限
  if (score.combined >= 0.7 && trustLevel >= 3) return "connection";
  if (score.combined >= 0.5 && trustLevel >= 2) return "gentle_inquiry";
  if (score.combined >= 0.3) return "observation";
  return "casual_check";
}

export function checkSignalConvergence(
  signals: MicroSignal[],
  trustLevel: TrustLevel,
): MicroInsightCandidate | null {
  if (signals.length < 2) return null;

  // 直近7日以内のシグナルだけを対象
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 7);
  const recent = signals.filter(s => new Date(s.detected_at) >= recentCutoff);

  if (recent.length < 2) return null;

  // 単一ターン収束防止: シグナル群が複数の異なるタイムスタンプを持つことを要求
  // （同一メッセージから検出された複数シグナルは同じ detected_at を共有する）
  const hasMultipleTurns = (sigs: MicroSignal[]): boolean => {
    const timestamps = new Set(sigs.map(s => s.detected_at));
    return timestamps.size >= 2;
  };

  // ── Energy × Action Gap の収束 ──
  const energyGapSignals = recent.filter(s => s.type === "energy_action_gap");
  const behaviorMismatchSignals = recent.filter(s => s.type === "behavior_mismatch");
  const stuckSignals = [...energyGapSignals, ...behaviorMismatchSignals];

  if (stuckSignals.length >= 2 && hasMultipleTurns(stuckSignals)) {
    const convergence = scoreConvergence(stuckSignals);
    const presentationType = maxPresentationType(convergence, trustLevel);
    return {
      signals: stuckSignals,
      suggested_prompt: presentationType === "gentle_inquiry"
        ? "体力の問題じゃないなら、気持ちのどこかで引っかかってるものがあるかもね"
        : "最近、やりたいことと実際の動きにギャップがある感じ？",
      presentation_type: presentationType,
      required_trust: 1,
      convergence_score: convergence,
    };
  }

  // ── Topic Repetition の収束 ──
  // 同じテーマが複数回シグナルとして検出されている（＝別セッションで繰り返している）
  const repetitionSignals = recent.filter(s => s.type === "topic_repetition");
  if (repetitionSignals.length >= 2 && hasMultipleTurns(repetitionSignals)) {
    const topic = repetitionSignals[0]?.related_topic ?? "そのこと";
    const convergence = scoreConvergence(repetitionSignals);
    const presentationType = maxPresentationType(convergence, trustLevel);
    return {
      signals: repetitionSignals.slice(0, 3),
      suggested_prompt: presentationType === "connection"
        ? `${topic}のこと、前にも話してたけど、何かずっと引っかかってる？`
        : `${topic}のこと、最近よく出てくるね`,
      presentation_type: presentationType,
      required_trust: 1,
      convergence_score: convergence,
    };
  }

  // ── Sentiment Shift の収束 ──
  // 感情変化が複数回検出されている（1回だけでは偶然の可能性がある）
  const sentimentSignals = recent.filter(s => s.type === "sentiment_shift");
  if (sentimentSignals.length >= 2 && hasMultipleTurns(sentimentSignals) && trustLevel >= 1) {
    const topic = sentimentSignals[0]?.related_topic ?? "その人";
    const convergence = scoreConvergence(sentimentSignals);
    const presentationType = maxPresentationType(convergence, trustLevel);
    return {
      signals: sentimentSignals,
      suggested_prompt: `そういえば、${topic}との関係、最近何か変わった？`,
      presentation_type: presentationType,
      required_trust: 1,
      convergence_score: convergence,
    };
  }

  return null;
}

/**
 * ユーザーのメッセージから、Life Context（重要人物・環境）を自動抽出する。
 * 相談の中で自然に言及されたものを拾う（経路A: 相談駆動理解）。
 *
 * エピステミック管理の原則:
 * - 単発言及の confidence は控えめに（0.4-0.6）
 * - user_stated（明言）と user_implied（推定）を厳密に区別
 * - 過去形の言及は temporality を "momentary" にする（現在の状況と混同しない）
 * - 同一 content の重複を排除（同じメッセージ内での多重検出を防ぐ）
 */
export function extractLifeContextSignals(
  message: string,
): Array<Partial<UnderstandingUnit>> {
  const units: Array<Partial<UnderstandingUnit>> = [];
  const now = new Date().toISOString();
  const seenContents = new Set<string>(); // 重複排除用

  const addUnit = (unit: Partial<UnderstandingUnit>) => {
    if (unit.content && seenContents.has(unit.content)) return;
    if (unit.content) seenContents.add(unit.content);
    units.push(unit);
  };

  // 過去形判定: 「昔」「前に」「以前」が含まれていたら過去文脈の可能性
  const hasPastContext = /昔|以前[はに]|前[にはの].*[いたっ]|子供の頃|学生時代|若い頃/.test(message);

  // ── 人物の検出 ──
  const PERSON_EXTRACTION = [
    { pattern: /(?:お?母[親さ]|母)[がにはをと、。]/, label: "母", role: "parent" as PersonRole },
    { pattern: /(?:お?父[親さ]|父)[がにはをと、。]/, label: "父", role: "parent" as PersonRole },
    { pattern: /(?:お?兄[さちゃ]?)[がにはをと、。]/, label: "兄", role: "sibling" as PersonRole },
    { pattern: /(?:お?姉[さちゃ]?)[がにはをと、。]/, label: "姉", role: "sibling" as PersonRole },
    { pattern: /弟[がにはをと、。]/, label: "弟", role: "sibling" as PersonRole },
    { pattern: /妹[がにはをと、。]/, label: "妹", role: "sibling" as PersonRole },
    { pattern: /彼女[がにはをの、。]/, label: "彼女", role: "partner" as PersonRole },
    { pattern: /彼氏[がにはをの、。]/, label: "彼氏", role: "partner" as PersonRole },
    { pattern: /恋人[がにはをの、。]/, label: "恋人", role: "partner" as PersonRole },
    { pattern: /上司[がにはをの、。]/, label: "上司", role: "boss" as PersonRole },
    { pattern: /先輩[がにはをの、。]/, label: "先輩", role: "senior" as PersonRole },
    { pattern: /後輩[がにはをの、。]/, label: "後輩", role: "subordinate" as PersonRole },
    { pattern: /同僚[がにはをの、。]/, label: "同僚", role: "colleague" as PersonRole },
    { pattern: /親友[がにはをの、。]/, label: "親友", role: "close_friend" as PersonRole },
  ];

  for (const { pattern, label, role } of PERSON_EXTRACTION) {
    if (pattern.test(message)) {
      // 人物の存在自体は persistent（家族は消えない）だが、
      // 関係性の質は unknown。confidence は控えめに。
      addUnit({
        content: `${label}（${role}）への言及`,
        category: "person",
        source: "user_implied",
        temporality: "persistent",
        confidence: 0.5,  // 単発言及: 存在確認レベル
        evidence_count: 1,
        last_confirmed: now,
        possibly_stale: false,
      });
    }
  }

  // ── 環境の検出 ──
  if (/一人暮らし|ひとり暮らし/.test(message)) {
    addUnit({
      content: "一人暮らし",
      category: "environment",
      source: "user_stated",
      temporality: hasPastContext ? "momentary" : "situational",
      confidence: hasPastContext ? 0.4 : 0.8,  // 明言だが過去文脈なら控えめ
      evidence_count: 1,
      last_confirmed: now,
      possibly_stale: false,
    });
  }
  if (/実家.*[暮住い]|実家[にで]/.test(message)) {
    // 「実家に帰る」は一時的、「実家暮らし」は継続的 — 区別
    const isLiving = /実家.*暮らし|実家.*住/.test(message);
    addUnit({
      content: isLiving ? "実家暮らし" : "実家への言及",
      category: "environment",
      source: "user_implied",
      temporality: isLiving ? "situational" : "momentary",
      confidence: isLiving ? 0.6 : 0.3,
      evidence_count: 1,
      last_confirmed: now,
      possibly_stale: false,
    });
  }
  if (/借金|ローン|金[がのを].*ない|お金.*[ない足苦厳]|生活.*苦/.test(message)) {
    addUnit({
      content: "経済的に厳しい状況の可能性",
      category: "environment",
      source: "user_implied",
      temporality: "situational",
      confidence: 0.4,  // 単発言及の推測: かなり控えめ
      evidence_count: 1,
      last_confirmed: now,
      possibly_stale: false,
    });
  }

  // ── 感情パターンの検出 ──
  if (/いつも.*[不嫌怖]|毎回.*[不嫌怖]|また.*同じ|繰り返[しす]/.test(message)) {
    addUnit({
      content: "反復的な感情パターンへの言及",
      category: "emotion",
      source: "user_stated",
      temporality: "persistent",
      confidence: 0.6,
      evidence_count: 1,
      last_confirmed: now,
      possibly_stale: false,
    });
  }

  // ── ライフステージの検出 ──
  if (/転職.*[考検中したい迷]|仕事.*辞め|退職.*[考検したい]/.test(message)) {
    // 過去形チェック: 「昔転職を考えていた」は現在の状況ではない
    addUnit({
      content: "転職を検討中",
      category: "life_stage",
      source: "user_stated",
      temporality: hasPastContext ? "momentary" : "situational",
      confidence: hasPastContext ? 0.3 : 0.7,
      evidence_count: 1,
      last_confirmed: now,
      possibly_stale: false,
    });
  }
  if (/就[活職]|受験|進学|入[学社]/.test(message)) {
    addUnit({
      content: "進路に関する動き",
      category: "life_stage",
      source: "user_implied",
      temporality: hasPastContext ? "momentary" : "situational",
      confidence: hasPastContext ? 0.3 : 0.5,
      evidence_count: 1,
      last_confirmed: now,
      possibly_stale: false,
    });
  }

  return units;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 「わかったつもり」防止ルール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * この理解を判断に使ってよいか判定する。
 * confidence と evidence_count と鮮度の3重チェック。
 */
export function canUseForDecision(unit: UnderstandingUnit): boolean {
  // 確信度が低すぎる → 保留
  if (unit.confidence < 0.5) return false;
  // 裏付けが1つだけの推論 → 保留
  if (unit.source === "alter_inferred" && unit.evidence_count < 2) return false;
  // 30日以上未確認の situational/momentary → 古い
  if (unit.possibly_stale && (unit.temporality === "momentary" || unit.temporality === "situational")) return false;
  return true;
}

/**
 * この理解をユーザーに提示してよいか判定する。
 * canUseForDecision より厳しい基準。
 */
export function canPresentToUser(unit: UnderstandingUnit, trustLevel: TrustLevel): boolean {
  if (!canDisclose(unit, trustLevel)) return false;
  // 推論で裏付けが2未満 → 黙って持つ
  if (unit.source === "alter_inferred" && unit.evidence_count < 2) return false;
  // 古い情報を断定的に出さない
  if (unit.possibly_stale) return false;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: Life Context v2 — 照合・蓄積・鮮度管理・矛盾検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DB から取得した Life Context エントリ */
export interface LifeContextEntry {
  id: string;
  category: UnderstandingCategory;
  content: string;
  source: EpistemicSource;
  temporality: Temporality;
  confidence: number;
  evidence_count: number;
  last_confirmed: string;
  possibly_stale: boolean;
}

/** 照合結果の種別 */
export type ContextMatchResult = "update" | "contradiction" | "coexist";

/**
 * コンテンツの正規化。敬称や表記ゆれを吸収して照合精度を上げる。
 */
function normalizeContextContent(s: string): string {
  return s
    .replace(/[さくちゃ]ん$/g, "")
    .replace(/お([母父兄姉])/g, "$1")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 既存コンテキストと新規シグナルを照合する。
 * - 同一内容 → "update"（evidence 蓄積）
 * - 矛盾 → "contradiction"
 * - 別の情報 → "coexist"
 */
export function matchContextEntry(
  existing: LifeContextEntry,
  incoming: Partial<UnderstandingUnit>,
): ContextMatchResult {
  const existNorm = normalizeContextContent(existing.content);
  const incomingNorm = normalizeContextContent(incoming.content ?? "");

  // 同一内容 → 更新（evidence 蓄積）
  if (existNorm === incomingNorm) return "update";

  // 同じカテゴリ内の矛盾チェック
  if (existing.category === incoming.category) {
    // 居住系の矛盾: 「一人暮らし」vs「実家」
    if (existing.category === "environment") {
      const livingAlone = /一人暮らし|独り暮らし|ワンルーム/;
      const livingFamily = /実家|家族と|同居/;
      if (
        (livingAlone.test(existing.content) && livingFamily.test(incoming.content ?? "")) ||
        (livingFamily.test(existing.content) && livingAlone.test(incoming.content ?? ""))
      ) {
        return "contradiction";
      }
    }

    // 人物系の矛盾: 「いない」vs「いる」
    if (existing.category === "person") {
      const absent = /いない|別れた|縁を切/;
      const present = /[がはと].*[いる]|付き合/;
      const sameSubject =
        existNorm.slice(0, 2) === incomingNorm.slice(0, 2); // 「彼女」等の先頭2文字で同一人物判定
      if (sameSubject && (
        (absent.test(existing.content) && present.test(incoming.content ?? "")) ||
        (present.test(existing.content) && absent.test(incoming.content ?? ""))
      )) {
        return "contradiction";
      }
    }
  }

  return "coexist";
}

/**
 * evidence 蓄積時の confidence 更新ルール。
 * 複数回確認されるほど confidence が上がるが、上限は 0.9。
 */
export function updatedConfidence(
  currentConfidence: number,
  currentEvidenceCount: number,
): number {
  // 蓄積ごとに +0.1、ただし上限 0.9
  const increment = currentEvidenceCount < 3 ? 0.1 : 0.05;
  return Math.min(0.9, currentConfidence + increment);
}

/**
 * アクティブな（判断に使える）Life Context エントリのみをフィルタする。
 * confidence >= 0.4, possibly_stale = false, temporality != "momentary"
 */
export function filterActiveContext(entries: LifeContextEntry[]): LifeContextEntry[] {
  return entries.filter(e =>
    e.confidence >= 0.4 &&
    !e.possibly_stale &&
    e.temporality !== "momentary"
  );
}

/**
 * アクティブな Life Context を、プロンプトに注入する形式に変換する。
 * 断定を避け、仮説トーンで記述する。
 *
 * 「見ている感」は出してよいが「見透かしている感」は出さない。
 */
export function formatContextForPrompt(
  entries: LifeContextEntry[],
  trustLevel: TrustLevel,
): string {
  if (entries.length === 0) return "";
  if (trustLevel < 1) return "";

  const lines: string[] = [];
  lines.push("【背景理解（参考情報・断定しないこと）】");

  for (const entry of entries.slice(0, 5)) { // 最大5件に制限
    const certainty = entry.confidence >= 0.7
      ? "以前の会話から"
      : "おそらく";
    const staleNote = entry.possibly_stale ? "（しばらく確認していない）" : "";

    // source による表現の使い分け
    if (entry.source === "user_stated") {
      lines.push(`- ${certainty}、${entry.content}。${staleNote}`);
    } else if (entry.source === "user_implied") {
      lines.push(`- ${certainty}、${entry.content}かもしれない。${staleNote}`);
    } else if (entry.source === "alter_inferred" && entry.evidence_count >= 2) {
      lines.push(`- 複数の会話から、${entry.content}の傾向がある。${staleNote}`);
    }
    // behavior_observed, contradicted は注入しない
  }

  if (lines.length <= 1) return ""; // ヘッダのみ

  lines.push("※ 上記は過去の会話からの参考情報。直接言及せず、提案のトーンに自然に反映する。");
  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2: Reaction Learning — Micro Insight 提示後の反応分類
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーの反応分類 */
export type InsightReaction = "accepted" | "denied" | "ignored" | "explored";

/**
 * Micro Insight 提示後のユーザーの次メッセージから反応を推定する。
 *
 * - accepted: 肯定的応答 / 受け入れ
 * - denied: 否定 / 訂正
 * - ignored: 無関係な話題に移行
 * - explored: 提示されたテーマについて詳しく話し始める
 */
export function classifyInsightReaction(
  userMessage: string,
  insightPrompt: string,
): InsightReaction {
  // 否定パターン
  if (/いや[、。]|違[うくい]|そうじゃな|そういうこと[じで]はな|関係な[いく]/.test(userMessage)) {
    return "denied";
  }

  // 肯定パターン
  if (/確かに|そうかも|そうだ[ねな]|それは[あそ]|言われてみれば|そう[いな]えば/.test(userMessage)) {
    return "accepted";
  }

  // 探索パターン: insightPrompt のテーマに関連する長文での応答
  // insightPrompt から主要キーワードを抽出
  const keywords = insightPrompt
    .replace(/[？。、「」…]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .slice(0, 3);

  const hasRelatedContent = keywords.some(k => userMessage.includes(k));
  if (hasRelatedContent && userMessage.length > 80) {
    return "explored";
  }
  if (hasRelatedContent) {
    return "accepted";
  }

  // 無関係な話題に移行 = ignored
  return "ignored";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: 人物マップ蓄積ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DB から取得した人物マップエントリ */
export interface PersonMapEntry {
  id: string;
  user_id: string;
  label: string;
  role: PersonRole;
  sentiment_trend: "improving" | "stable" | "declining" | null;
  mention_count: number;
  influence_score: number; // 0-1: この人物がユーザーの判断にどれだけ影響するか
  last_sentiment: "positive" | "negative" | "mixed" | "neutral" | null;
  last_mentioned: string;
  created_at: string;
}

/**
 * メッセージから人物への言及と感情を抽出する。
 * Phase 2 の extractLifeContextSignals が「存在」を検出するのに対し、
 * こちらは「関係性の質」と「感情の方向」を検出する。
 */
export function extractPersonMentions(
  message: string,
): Array<{ label: string; role: PersonRole; sentiment: "positive" | "negative" | "mixed" | "neutral" }> {
  const mentions: Array<{ label: string; role: PersonRole; sentiment: "positive" | "negative" | "mixed" | "neutral" }> = [];

  const PERSON_PATTERNS: Array<{ pattern: RegExp; label: string; role: PersonRole }> = [
    { pattern: /(?:お?母[親さ]|母)[がにはをとの、。]/, label: "母", role: "parent" },
    { pattern: /(?:お?父[親さ]|父)[がにはをとの、。]/, label: "父", role: "parent" },
    { pattern: /(?:お?兄[さちゃ]?)[がにはをとの、。]/, label: "兄", role: "sibling" },
    { pattern: /(?:お?姉[さちゃ]?)[がにはをとの、。]/, label: "姉", role: "sibling" },
    { pattern: /弟[がにはをとの、。]/, label: "弟", role: "sibling" },
    { pattern: /妹[がにはをとの、。]/, label: "妹", role: "sibling" },
    { pattern: /彼女[がにはをとの、。]/, label: "彼女", role: "partner" },
    { pattern: /彼氏[がにはをとの、。]/, label: "彼氏", role: "partner" },
    { pattern: /恋人[がにはをとの、。]/, label: "恋人", role: "partner" },
    { pattern: /上司[がにはをとの、。]/, label: "上司", role: "boss" },
    { pattern: /先輩[がにはをとの、。]/, label: "先輩", role: "senior" },
    { pattern: /後輩[がにはをとの、。]/, label: "後輩", role: "subordinate" },
    { pattern: /同僚[がにはをとの、。]/, label: "同僚", role: "colleague" },
    { pattern: /親友[がにはをとの、。]/, label: "親友", role: "close_friend" },
    { pattern: /友[人達だ][がにはをとの、。]/, label: "友人", role: "friend" },
  ];

  // 感情語の検出（人物言及の前後30文字以内）
  const positiveSentiment = /感謝|ありがた|嬉し|助[かけ]|支え|好き|信頼|尊敬|優し|楽し/;
  const negativeSentiment = /嫌[いだ]|苦手|怖い|うざ|うんざり|むかつ|怒[りら]|ストレス|辛[いく]|傷つ|裏切|無視/;

  for (const { pattern, label, role } of PERSON_PATTERNS) {
    const match = pattern.exec(message);
    if (!match) continue;

    // 人物言及の前後30文字の感情コンテキストを取得
    const start = Math.max(0, match.index - 30);
    const end = Math.min(message.length, match.index + match[0].length + 30);
    const context = message.slice(start, end);

    const hasPositive = positiveSentiment.test(context);
    const hasNegative = negativeSentiment.test(context);

    let sentiment: "positive" | "negative" | "mixed" | "neutral";
    if (hasPositive && hasNegative) sentiment = "mixed";
    else if (hasPositive) sentiment = "positive";
    else if (hasNegative) sentiment = "negative";
    else sentiment = "neutral";

    mentions.push({ label, role, sentiment });
  }

  return mentions;
}

/**
 * 感情トレンドを更新する。
 * 直近の感情と過去のトレンドから新しいトレンドを計算。
 */
export function updateSentimentTrend(
  currentTrend: "improving" | "stable" | "declining" | null,
  previousSentiment: "positive" | "negative" | "mixed" | "neutral" | null,
  newSentiment: "positive" | "negative" | "mixed" | "neutral",
): "improving" | "stable" | "declining" {
  if (!previousSentiment || !currentTrend) return "stable";

  const sentimentScore = (s: string) => {
    if (s === "positive") return 1;
    if (s === "neutral" || s === "mixed") return 0;
    return -1; // negative
  };

  const diff = sentimentScore(newSentiment) - sentimentScore(previousSentiment);
  if (diff > 0) return "improving";
  if (diff < 0) return "declining";
  return currentTrend; // 変化なし → 前のトレンドを維持
}

/**
 * 人物の影響度スコアを計算する。
 * 言及頻度 + 感情の強さ + 役割の重要度から推定。
 */
export function computeInfluenceScore(
  mentionCount: number,
  role: PersonRole,
  lastSentiment: "positive" | "negative" | "mixed" | "neutral" | null,
): number {
  // 役割による基礎影響度
  const roleWeight: Record<PersonRole, number> = {
    partner: 0.8, parent: 0.7, sibling: 0.5, ex: 0.4, crush: 0.5,
    close_friend: 0.6, friend: 0.4, acquaintance: 0.2,
    boss: 0.6, senior: 0.4, colleague: 0.3, subordinate: 0.3, client: 0.3,
    other: 0.2,
  };

  const base = roleWeight[role] ?? 0.3;

  // 言及頻度による加算（対数スケール、上限0.2）
  const frequencyBonus = Math.min(0.2, Math.log2(mentionCount + 1) * 0.05);

  // 感情の強さによる加算
  const sentimentBonus = lastSentiment === "negative" ? 0.1 : lastSentiment === "mixed" ? 0.05 : 0;

  return Math.min(1.0, base + frequencyBonus + sentimentBonus);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: 環境情報の段階的収集
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 拡張環境パターン（Phase 3 追加分） */
const EXTENDED_ENVIRONMENT_PATTERNS: Array<{
  pattern: RegExp;
  content: string;
  category: "environment" | "life_stage";
  source: EpistemicSource;
  temporality: Temporality;
  baseConfidence: number;
}> = [
  // 仕事関連
  { pattern: /フリーランス|自営|個人事業/, content: "フリーランス/自営業", category: "environment", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },
  { pattern: /会社員|サラリーマン|正社員/, content: "会社員", category: "environment", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },
  { pattern: /パート|アルバイト|バイト/, content: "パート・アルバイト", category: "environment", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },
  { pattern: /学生|大学[にで]|高校[にで]/, content: "学生", category: "environment", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },
  { pattern: /無職|ニート|仕事.*[ない探]|求職/, content: "無職・求職中", category: "environment", source: "user_implied", temporality: "situational", baseConfidence: 0.5 },
  { pattern: /リモート|テレワーク|在宅.*勤務/, content: "リモートワーク", category: "environment", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },

  // 健康関連
  { pattern: /通院|病院.*通[っい]|持病|慢性/, content: "通院・持病あり", category: "environment", source: "user_implied", temporality: "persistent", baseConfidence: 0.5 },
  { pattern: /不眠|寝[れら].*ない|睡眠.*[不悪]/, content: "睡眠の問題", category: "environment", source: "user_stated", temporality: "situational", baseConfidence: 0.6 },
  { pattern: /薬.*飲[んめ]|服薬|処方/, content: "服薬中", category: "environment", source: "user_implied", temporality: "situational", baseConfidence: 0.5 },

  // ライフイベント
  { pattern: /結婚.*[考したい予]|婚約/, content: "結婚の検討", category: "life_stage", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },
  { pattern: /離婚.*[考したい検]/, content: "離婚の検討", category: "life_stage", source: "user_stated", temporality: "situational", baseConfidence: 0.7 },
  { pattern: /妊娠|出産.*[予控近]|産休|育休/, content: "出産・育児期", category: "life_stage", source: "user_stated", temporality: "situational", baseConfidence: 0.8 },
  { pattern: /引[っ越]越[しす]|引っ越/, content: "引っ越し予定/検討", category: "life_stage", source: "user_implied", temporality: "momentary", baseConfidence: 0.5 },
  { pattern: /介護|看[護病]|親.*入院/, content: "介護・看護の状況", category: "life_stage", source: "user_implied", temporality: "situational", baseConfidence: 0.6 },
];

/**
 * 拡張環境パターンでメッセージから追加の Life Context を抽出する。
 * Phase 2 の extractLifeContextSignals に追加される形で呼ぶ。
 */
export function extractExtendedContextSignals(
  message: string,
): Array<Partial<UnderstandingUnit>> {
  const units: Array<Partial<UnderstandingUnit>> = [];
  const now = new Date().toISOString();
  const hasPastContext = /昔|以前[はに]|前[にはの].*[いたっ]|子供の頃|学生時代|若い頃/.test(message);

  for (const { pattern, content, category, source, temporality, baseConfidence } of EXTENDED_ENVIRONMENT_PATTERNS) {
    if (pattern.test(message)) {
      units.push({
        content,
        category,
        source,
        temporality: hasPastContext ? "momentary" : temporality,
        confidence: hasPastContext ? Math.min(baseConfidence, 0.3) : baseConfidence,
        evidence_count: 1,
        last_confirmed: now,
        possibly_stale: false,
      });
    }
  }

  return units;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: 経路C — 構造的補完
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 構造的補完の候補 */
export interface StructuralGap {
  /** 不足している情報カテゴリ */
  category: "person" | "environment" | "life_stage";
  /** 具体的に何が不足しているか */
  gap_type: string;
  /** 補完の優先度 (0-1) */
  priority: number;
  /** 自然に聞くための提案文 */
  suggested_question: string;
}

/**
 * 蓄積された Life Context を分析し、判断に必要だが不足している情報を特定する。
 * 「聞いてもおかしくない」レベルのギャップだけを返す。
 *
 * 経路C = 相談から自然に拾えない構造的情報を、Alter が能動的に聞く。
 * ただし「見透かしている感」を出さないため、以下を厳守:
 * - 質問は1セッションにつき最大1つ
 * - 相談の文脈に関連するギャップのみ
 * - Trust Level 2+ が必要
 */
export function detectStructuralGaps(
  existingContext: LifeContextEntry[],
  currentMessage: string,
  trustLevel: TrustLevel,
): StructuralGap | null {
  if (trustLevel < 2) return null;

  const hasCategory = (cat: string) => existingContext.some(e => e.category === cat && !e.possibly_stale && e.confidence >= 0.4);
  const hasContent = (content: string) => existingContext.some(e => e.content.includes(content) && !e.possibly_stale);

  // 対人相談なのに、相手の関係性が不明
  const mentionsPerson = /[がにはをと].*[言話聞思怒泣笑]|[上先後同].*[輩司僚]/.test(currentMessage);
  const hasPersonContext = hasCategory("person");
  if (mentionsPerson && !hasPersonContext) {
    return {
      category: "person",
      gap_type: "relationship_unknown",
      priority: 0.7,
      suggested_question: "ちなみに、その人とはどういう関係？",
    };
  }

  // 仕事の相談なのに、働き方が不明
  const mentionsWork = /仕事|職場|会社|上司|同僚|転職|プロジェクト/.test(currentMessage);
  const hasWorkContext = hasContent("会社員") || hasContent("フリーランス") || hasContent("学生") || hasContent("パート");
  if (mentionsWork && !hasWorkContext && existingContext.length >= 3) {
    return {
      category: "environment",
      gap_type: "work_style_unknown",
      priority: 0.4,
      suggested_question: "そういえば、普段はどんな働き方をしてるの？",
    };
  }

  // 恋愛の相談なのに、パートナーの有無が不明
  const mentionsRomance = /好き|付き合|恋|彼[女氏]|デート|告白|別れ/.test(currentMessage);
  const hasPartnerContext = hasContent("彼女") || hasContent("彼氏") || hasContent("恋人");
  if (mentionsRomance && !hasPartnerContext && existingContext.length >= 3) {
    return {
      category: "person",
      gap_type: "partner_status_unknown",
      priority: 0.5,
      suggested_question: "今、付き合ってる人はいるの？",
    };
  }

  // 生活の相談なのに、居住環境が不明
  const mentionsLiving = /家[にで]|帰[りっ]|引っ越|生活|家賃/.test(currentMessage);
  const hasLivingContext = hasContent("一人暮らし") || hasContent("実家");
  if (mentionsLiving && !hasLivingContext && existingContext.length >= 5) {
    return {
      category: "environment",
      gap_type: "living_situation_unknown",
      priority: 0.3,
      suggested_question: "ちなみに、今は一人暮らし？",
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3: 段階的開示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 開示レベルの定義 */
export type DisclosureLevel = "silent" | "hint" | "reference" | "explicit";

/**
 * Trust Level と情報の性質に基づいて、蓄積した理解をどの程度表に出してよいかを決定する。
 *
 * silent:    内部で使うが表には出さない（ForceBalance の調整等）
 * hint:      間接的にほのめかす（「前も似た感じだったかも」）
 * reference: 明示的に参照する（「お母さんのこと、気にしてたよね」）
 * explicit:  パターンとして提示する（「いつもこういう時に迷うよね」）
 *
 * 「見ている感」→ hint / reference
 * 「見透かしている感」→ explicit の乱用
 */
export function determineDisclosureLevel(
  entry: LifeContextEntry,
  trustLevel: TrustLevel,
  isRelevantToCurrentMessage: boolean,
): DisclosureLevel {
  // Trust Level 0: 全て silent
  if (trustLevel < 1) return "silent";

  // 古い情報は silent
  if (entry.possibly_stale) return "silent";

  // confidence が低い情報は silent
  if (entry.confidence < 0.4) return "silent";

  // 今の相談に関連しない情報は silent
  if (!isRelevantToCurrentMessage) return "silent";

  // alter_inferred で裏付けが少ない → silent
  if (entry.source === "alter_inferred" && entry.evidence_count < 2) return "silent";

  // contradicted → silent（矛盾した情報は出さない）
  if (entry.source === "contradicted") return "silent";

  // Trust Level 1: hint まで
  if (trustLevel === 1) {
    return entry.evidence_count >= 2 ? "hint" : "silent";
  }

  // Trust Level 2: reference まで
  if (trustLevel === 2) {
    if (entry.confidence >= 0.7 && entry.evidence_count >= 3) return "reference";
    if (entry.evidence_count >= 2) return "hint";
    return "silent";
  }

  // Trust Level 3+: explicit まで（ただし条件付き）
  if (entry.confidence >= 0.8 && entry.evidence_count >= 5 && entry.source === "user_stated") {
    return "explicit";
  }
  if (entry.confidence >= 0.7 && entry.evidence_count >= 3) return "reference";
  if (entry.evidence_count >= 2) return "hint";
  return "silent";
}

/**
 * 開示レベルに応じたプロンプト指示を生成する。
 */
export function formatDisclosureInstruction(
  entry: LifeContextEntry,
  level: DisclosureLevel,
): string | null {
  if (level === "silent") return null;

  const content = entry.content;

  switch (level) {
    case "hint":
      return `【ほのめかし可】「${content}」に関連する情報がある。直接言及せず、提案のニュアンスに反映するだけ。「〜かもしれないけど」程度。`;
    case "reference":
      return `【参照可】「${content}」について以前の会話で触れている。「前に〜って言ってたけど」のように自然に参照してよい。ただし断定は避ける。`;
    case "explicit":
      return `【明示可】「${content}」はこの人の継続的な傾向として確認済み（${entry.evidence_count}回言及）。パターンとして言及してよいが、「いつも」「必ず」等の絶対表現は避ける。`;
    default:
      return null;
  }
}

/**
 * 現在のメッセージに関連する Life Context エントリかどうかを判定する。
 * キーワードマッチで簡易判定。
 */
export function isContextRelevant(
  entry: LifeContextEntry,
  currentMessage: string,
): boolean {
  // 人物: 同じ人物への言及があるか
  if (entry.category === "person") {
    const personLabel = entry.content.replace(/（.*）.*/, ""); // 「母（parent）への言及」→「母」
    return currentMessage.includes(personLabel);
  }

  // 環境: 関連キーワード
  if (entry.category === "environment") {
    const keywords: Record<string, RegExp> = {
      "一人暮らし": /家|帰[りっ]|生活|住|部屋/,
      "実家": /家|帰[りっ]|母|父|親|実家/,
      "会社員": /仕事|職場|会社|上司|同僚/,
      "フリーランス": /仕事|案件|クライアント|納期/,
      "学生": /学校|授業|テスト|試験|卒業/,
      "経済的": /金|お金|貯金|給料|家賃|ローン/,
      "睡眠": /寝|眠|疲|朝|夜/,
    };
    for (const [key, pattern] of Object.entries(keywords)) {
      if (entry.content.includes(key) && pattern.test(currentMessage)) return true;
    }
  }

  // ライフステージ: 直接言及
  if (entry.category === "life_stage") {
    const stageKeywords: Record<string, RegExp> = {
      "転職": /仕事|転職|辞め|退職|キャリア/,
      "結婚": /結婚|婚|付き合|彼[女氏]/,
      "出産": /子ども|子供|妊|出産|育/,
      "介護": /親|母|父|介護|病院/,
    };
    for (const [key, pattern] of Object.entries(stageKeywords)) {
      if (entry.content.includes(key) && pattern.test(currentMessage)) return true;
    }
  }

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 4: Layer 4 — Narrative（自己物語）
// user_narrative と alter_hypothesis の絶対分離
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーの自己物語エントリ */
export interface UserNarrative {
  id: string;
  theme: string;
  content: string;
  domain: "work" | "relationship" | "family" | "friendship" | "self" | "health" | "general" | null;
  mention_count: number;
  first_mentioned: string;
  last_mentioned: string;
}

/** Alter の仮説エントリ */
export interface AlterHypothesis {
  id: string;
  hypothesis_type: "recurring_pattern" | "cross_context" | "growth_signal" | "contradiction_pattern";
  content: string;
  evidence_summary: string;
  domains: string[];
  confidence: number;
  evidence_count: number;
  status: "emerging" | "strengthening" | "stable" | "weakening" | "retired";
  required_trust: number;
  last_evaluated: string;
  presented_count: number;
}

/**
 * ユーザーの自己言及パターンを検出する。
 * 「私は〜」「自分って〜」「昔から〜」等の自己定義的発言を抽出。
 * user_stated のみ。Alter推論は一切含めない。
 */
export function extractUserNarratives(
  message: string,
): Array<{ theme: string; content: string; domain: UserNarrative["domain"] }> {
  const results: Array<{ theme: string; content: string; domain: UserNarrative["domain"] }> = [];

  // 自己言及パターン: 「私は〜タイプ」「自分って〜」「昔から〜」「いつも〜してしまう」
  const NARRATIVE_PATTERNS: Array<{
    pattern: RegExp;
    themeExtractor: (match: RegExpMatchArray) => string;
    contentExtractor: (match: RegExpMatchArray) => string;
  }> = [
    // 「私は〜なタイプ」「自分って〜な人間」
    {
      pattern: /(?:私|自分|俺|僕)[はって]{1,2}(.{3,30})(?:タイプ|人間|性格|ところがある|方だ|方です)/,
      themeExtractor: (m) => `自己認識: ${m[1].slice(0, 20)}`,
      contentExtractor: (m) => m[0],
    },
    // 「昔から〜」「子供の頃から〜」
    {
      pattern: /(?:昔から|子供の頃から|小さい[頃時]から|ずっと)(.{3,40})(?:[。、]|$)/,
      themeExtractor: (m) => `長期傾向: ${m[1].slice(0, 20)}`,
      contentExtractor: (m) => m[0],
    },
    // 「いつも〜してしまう」「つい〜しちゃう」
    {
      pattern: /(?:いつも|つい|どうしても|気がつくと)(.{3,30})(?:してしまう|しちゃう|なっちゃう|なってしまう|になる)/,
      themeExtractor: (m) => `反復行動: ${m[1].slice(0, 20)}`,
      contentExtractor: (m) => m[0],
    },
    // 「〜が苦手」「〜が得意」
    {
      pattern: /(.{2,20})(?:が苦手|が得意|が好き|が嫌い|は無理|には自信がある|には自信がない)/,
      themeExtractor: (m) => `自己評価: ${m[1].slice(0, 15)}`,
      contentExtractor: (m) => m[0],
    },
    // 「〜なのかもしれない」「〜なんだと思う」（自己分析）
    {
      pattern: /(?:私|自分|俺|僕)[はがって]{1,2}(.{3,30})(?:なのかもしれない|なんだと思う|気がする|んだよね)/,
      themeExtractor: (m) => `自己分析: ${m[1].slice(0, 20)}`,
      contentExtractor: (m) => m[0],
    },
  ];

  // ドメイン判定
  const domainKeywords: Record<string, RegExp> = {
    work: /仕事|職場|会社|上司|部下|同僚|転職|キャリア|ビジネス|プロジェクト/,
    relationship: /恋[人愛]|彼[女氏]|パートナー|デート|付き合/,
    family: /家族|母|父|兄|姉|弟|妹|親|実家/,
    friendship: /友[人達だ]|親友|仲間/,
    health: /体調|健康|病[気院]|メンタル|疲[れ労]/,
    self: /自分自身|性格|人生|生き方|価値観/,
  };

  for (const { pattern, themeExtractor, contentExtractor } of NARRATIVE_PATTERNS) {
    const match = message.match(pattern);
    if (!match) continue;

    const content = contentExtractor(match);
    const theme = themeExtractor(match);

    // ドメイン判定
    let domain: UserNarrative["domain"] = "general";
    for (const [d, kw] of Object.entries(domainKeywords)) {
      if (kw.test(content) || kw.test(message)) {
        domain = d as UserNarrative["domain"];
        break;
      }
    }

    results.push({ theme, content, domain });
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 4: Layer 4 — Alter Hypothesis（仮説生成）
// パターン蓄積データから仮説を導出。断定ではなく仮説。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Decision Pattern から反復パターン仮説を生成 */
export function deriveRecurringPatternHypotheses(
  decisionPatterns: Array<{ pattern_key: string; pattern_data: any; observation_count: number; confidence: number }>,
): Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count" | "created_at">> {
  const hypotheses: Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count" | "created_at">> = [];

  for (const p of decisionPatterns) {
    if (p.observation_count < 5 || p.confidence < 0.3) continue;
    const dist = p.pattern_data?.shape_distribution;
    if (!dist) continue;

    const total = Object.values(dist).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0);
    if (total < 5) continue;

    const domain = p.pattern_key.replace("decision_", "");
    const goCount = (dist.full_go ?? 0) + (dist.bounded_go ?? 0) + (dist.trial_then_decide ?? 0);
    const waitCount = (dist.observe_first ?? 0) + (dist.skip ?? 0) + (dist.defer_with_trigger ?? 0);
    const goRatio = goCount / total;

    // 明確な偏りがある場合のみ仮説化（60%以上で偏りとみなす）
    if (goRatio >= 0.7) {
      hypotheses.push({
        hypothesis_type: "recurring_pattern",
        content: `${domain}の判断で「動く」傾向が強い`,
        evidence_summary: `直近${total}回中${goCount}回が go 系（${(goRatio * 100).toFixed(0)}%）`,
        domains: [domain],
        confidence: Math.min(0.8, p.confidence),
        evidence_count: total,
        status: total >= 15 ? "stable" : total >= 8 ? "strengthening" : "emerging",
        required_trust: 2,
      });
    } else if (goRatio <= 0.3) {
      hypotheses.push({
        hypothesis_type: "recurring_pattern",
        content: `${domain}の判断で「慎重」傾向が強い`,
        evidence_summary: `直近${total}回中${waitCount}回が wait 系（${((1 - goRatio) * 100).toFixed(0)}%）`,
        domains: [domain],
        confidence: Math.min(0.8, p.confidence),
        evidence_count: total,
        status: total >= 15 ? "stable" : total >= 8 ? "strengthening" : "emerging",
        required_trust: 2,
      });
    }
  }

  return hypotheses;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 4: Layer 5 — Cross-Context Analysis
// ドメイン横断の反復・矛盾パターンを検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ドメイン横断パターン検出結果 */
export interface CrossContextPattern {
  type: "consistency" | "split" | "domain_contradiction";
  domains: [string, string];
  description: string;
  confidence: number;
  evidence_summary: string;
}

/**
 * Decision Pattern のドメイン間比較で Cross-Context パターンを検出。
 * - consistency: 複数ドメインで同じ傾向
 * - split: ドメインによって傾向が逆転（仕事は攻め、恋愛は守り 等）
 */
export function detectCrossContextPatterns(
  decisionPatterns: Array<{ pattern_key: string; pattern_data: any; observation_count: number; confidence: number }>,
): CrossContextPattern[] {
  const results: CrossContextPattern[] = [];

  // 各ドメインの go/wait 比率を算出
  const domainRatios: Array<{ domain: string; goRatio: number; total: number; confidence: number }> = [];

  for (const p of decisionPatterns) {
    if (p.observation_count < 5) continue;
    const dist = p.pattern_data?.shape_distribution;
    if (!dist) continue;

    const total = Object.values(dist).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0);
    if (total < 5) continue;

    const domain = p.pattern_key.replace("decision_", "");
    const goCount = (dist.full_go ?? 0) + (dist.bounded_go ?? 0) + (dist.trial_then_decide ?? 0);
    domainRatios.push({ domain, goRatio: goCount / total, total, confidence: p.confidence });
  }

  // 2ドメイン以上ないと横断分析は不可能
  if (domainRatios.length < 2) return results;

  // ドメインペアの比較
  for (let i = 0; i < domainRatios.length; i++) {
    for (let j = i + 1; j < domainRatios.length; j++) {
      const a = domainRatios[i];
      const b = domainRatios[j];
      const diff = Math.abs(a.goRatio - b.goRatio);
      const minConfidence = Math.min(a.confidence, b.confidence);
      const minTotal = Math.min(a.total, b.total);

      // Split: ドメイン間で go/wait が大きく逆転（差 0.4 以上）
      if (diff >= 0.4 && minTotal >= 5) {
        const goSide = a.goRatio > b.goRatio ? a : b;
        const waitSide = a.goRatio > b.goRatio ? b : a;
        results.push({
          type: "split",
          domains: [goSide.domain, waitSide.domain],
          description: `${goSide.domain}では「動く」傾向、${waitSide.domain}では「慎重」傾向`,
          confidence: Math.min(0.7, minConfidence),
          evidence_summary: `${goSide.domain}: go ${(goSide.goRatio * 100).toFixed(0)}% (n=${goSide.total}) / ${waitSide.domain}: go ${(waitSide.goRatio * 100).toFixed(0)}% (n=${waitSide.total})`,
        });
      }
      // Consistency: 両ドメインで同じ傾向（差 0.15 以内、かつ両方とも偏りあり）
      else if (diff <= 0.15 && minTotal >= 5) {
        const avgRatio = (a.goRatio + b.goRatio) / 2;
        if (avgRatio >= 0.6) {
          results.push({
            type: "consistency",
            domains: [a.domain, b.domain],
            description: `${a.domain}でも${b.domain}でも「動く」傾向が一貫`,
            confidence: Math.min(0.6, minConfidence),
            evidence_summary: `${a.domain}: go ${(a.goRatio * 100).toFixed(0)}% / ${b.domain}: go ${(b.goRatio * 100).toFixed(0)}%`,
          });
        } else if (avgRatio <= 0.4) {
          results.push({
            type: "consistency",
            domains: [a.domain, b.domain],
            description: `${a.domain}でも${b.domain}でも「慎重」傾向が一貫`,
            confidence: Math.min(0.6, minConfidence),
            evidence_summary: `${a.domain}: go ${(a.goRatio * 100).toFixed(0)}% / ${b.domain}: go ${(b.goRatio * 100).toFixed(0)}%`,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Cross-Context パターンから仮説を生成。
 * 断定ではなく仮説として提示するための required_trust を高めに設定。
 */
export function crossContextToHypotheses(
  patterns: CrossContextPattern[],
): Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count" | "created_at">> {
  return patterns.map(p => ({
    hypothesis_type: "cross_context" as const,
    content: p.description,
    evidence_summary: p.evidence_summary,
    domains: p.domains,
    confidence: p.confidence,
    evidence_count: 2, // 最低2ドメインの証拠
    status: p.confidence >= 0.6 ? "strengthening" as const : "emerging" as const,
    // Cross-Context は Trust Level 3 以上で提示（T3: 接続提示 = 「仕事でも恋愛でも同じパターンでは？」）
    required_trust: 3,
  }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 4: 成長段階追跡
// パターンの時系列変化を検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 成長シグナル */
export interface GrowthSignal {
  type: "pattern_shift" | "new_domain" | "confidence_change";
  description: string;
  evidence: string;
}

/**
 * 既存仮説の状態を新しい証拠で更新する。
 * 仮説のライフサイクル: emerging → strengthening → stable → weakening → retired
 */
export function updateHypothesisStatus(
  current: AlterHypothesis,
  newEvidence: { confidence: number; evidence_count: number },
): { newStatus: AlterHypothesis["status"]; newConfidence: number; growthSignal: GrowthSignal | null } {
  const oldConfidence = current.confidence;
  const newConfidence = clamp(
    (oldConfidence * current.evidence_count + newEvidence.confidence * newEvidence.evidence_count) /
    (current.evidence_count + newEvidence.evidence_count),
    0, 1,
  );
  const totalEvidence = current.evidence_count + newEvidence.evidence_count;

  let newStatus = current.status;
  let growthSignal: GrowthSignal | null = null;

  // ステータス遷移判定
  // 新しい証拠が既存の信頼度より高い → 強化方向
  // 新しい証拠が既存の信頼度より低い → 弱化方向
  const evidenceDirection = newEvidence.confidence - oldConfidence;

  // strengthening: 新証拠が現在より高い + 十分な累積証拠
  if (evidenceDirection > 0.15 && totalEvidence >= 5) {
    newStatus = "strengthening";
  }
  // weakening: 新証拠が現在より大幅に低い
  else if (evidenceDirection < -0.2) {
    newStatus = "weakening";
    growthSignal = {
      type: "confidence_change",
      description: `仮説「${current.content}」の信頼度が低下（${(oldConfidence * 100).toFixed(0)}% → ${(newConfidence * 100).toFixed(0)}%）`,
      evidence: `evidence: ${totalEvidence}件`,
    };
  }

  // 安定判定: 十分な証拠かつ信頼度が安定（変動が小さい）
  if (totalEvidence >= 10 && Math.abs(evidenceDirection) <= 0.1 && newConfidence >= 0.5) {
    newStatus = "stable";
  }

  // 退役判定: 信頼度が十分に低い
  if (newConfidence < 0.2 && totalEvidence >= 5) {
    newStatus = "retired";
  }

  // パターンシフト検出（strengthening → weakening or vice versa）
  if (
    (current.status === "strengthening" && newStatus === "weakening") ||
    (current.status === "stable" && newStatus === "weakening")
  ) {
    growthSignal = {
      type: "pattern_shift",
      description: `パターン変化: 「${current.content}」が変化の兆候`,
      evidence: `status: ${current.status} → ${newStatus}, confidence: ${(oldConfidence * 100).toFixed(0)}% → ${(newConfidence * 100).toFixed(0)}%`,
    };
  }

  return { newStatus, newConfidence, growthSignal };
}

/**
 * 仮説をプロンプトに注入するための指示を生成。
 * 原則: 断定ではなく仮説として。「見透かしている感」を避ける。
 */
export function formatHypothesisForPrompt(
  hypothesis: AlterHypothesis,
  trustLevel: number,
): string | null {
  // Trust Level が required_trust 未満 → 注入しない
  if (trustLevel < hypothesis.required_trust) return null;

  // retired/weakening → 注入しない
  if (hypothesis.status === "retired" || hypothesis.status === "weakening") return null;

  // emerging は confidence 0.5 以上でないと注入しない
  if (hypothesis.status === "emerging" && hypothesis.confidence < 0.5) return null;

  const statusLabel = {
    emerging: "初期仮説",
    strengthening: "確度上昇中の仮説",
    stable: "安定した傾向",
  }[hypothesis.status] ?? "仮説";

  const typeLabel = {
    recurring_pattern: "反復パターン",
    cross_context: "領域横断パターン",
    growth_signal: "変化の兆候",
    contradiction_pattern: "矛盾パターン",
  }[hypothesis.hypothesis_type] ?? "パターン";

  // Cross-Context は特に慎重に
  if (hypothesis.hypothesis_type === "cross_context") {
    return `【${statusLabel}・${typeLabel}】${hypothesis.content}（${hypothesis.evidence_summary}）\n→ これは仮説であり、断定しない。「もしかしたら」「〜の傾向があるかもしれない」のトーンで。相手が気づいていない可能性があるので、押し付けず、確認するように。`;
  }

  // 通常パターン
  return `【${statusLabel}・${typeLabel}】${hypothesis.content}（${hypothesis.evidence_summary}）\n→ これは裏側の参考情報。直接指摘しない。提案のトーンに自然に反映するだけ。`;
}

/**
 * 仮説のフィルタリング: プロンプトに注入する仮説を選別。
 * 1回の応答で最大2つまで。情報過多を防ぐ。
 */
export function selectHypothesesForPrompt(
  hypotheses: AlterHypothesis[],
  trustLevel: number,
  currentDomain: string | null,
): AlterHypothesis[] {
  return hypotheses
    .filter(h => {
      if (trustLevel < h.required_trust) return false;
      if (h.status === "retired" || h.status === "weakening") return false;
      if (h.status === "emerging" && h.confidence < 0.5) return false;
      return true;
    })
    .sort((a, b) => {
      // 現在のドメインに関連する仮説を優先
      const aRelevant = currentDomain && a.domains.includes(currentDomain) ? 1 : 0;
      const bRelevant = currentDomain && b.domains.includes(currentDomain) ? 1 : 0;
      if (aRelevant !== bRelevant) return bRelevant - aRelevant;
      // 信頼度順
      return b.confidence - a.confidence;
    })
    .slice(0, 2); // 最大2つ
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3: 個別ベースライン構築
// patterns テーブルの蓄積データから「この人のいつも」を計算し、
// 今回のセッションとのズレを検出する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ベースライン計算に必要な最低セッション数（反証④: 変化検出の誤り防止） */
export const MIN_BASELINE_SESSIONS = 5;

/** 判断傾向ベースライン（ドメイン別） */
export interface DecisionBaseline {
  domain: string;
  goRatio: number;         // go系 ActionShape の割合
  totalObservations: number;
  topShape: string;        // 最頻出の ActionShape
  confidence: number;      // パターンの confidence
}

/** 感情ベースライン */
export interface EmotionalBaseline {
  avgLoad: number;         // emotional_load の平均
  variance: number;        // 分散（Welford）
  sampleCount: number;
}

/** 質問カテゴリ分布ベースライン */
export interface CategoryBaseline {
  distribution: Record<string, number>;  // カテゴリ別出現回数
  totalQuestions: number;
  dominantCategory: string;              // 最頻出カテゴリ
  dominantRatio: number;                 // 最頻出カテゴリの割合
}

/** 時間帯別エネルギーベースライン */
export interface TimeBlockBaseline {
  timeBlock: string;       // morning / afternoon / evening / night
  avgCapacity: number;
  avgLoad: number;
  avgFatigue: number;
  sampleCount: number;
}

/** ユーザーの統合ベースライン */
export interface UserBaseline {
  /** ベースライン計算に十分なデータがあるか */
  isReady: boolean;
  /** decision patterns のドメイン別ベースライン */
  decisions: DecisionBaseline[];
  /** 感情ベースライン（P2で追加した emotional_baseline から） */
  emotional: EmotionalBaseline | null;
  /** 質問カテゴリ分布（P2で追加した category_distribution から） */
  categories: CategoryBaseline | null;
  /** 時間帯別エネルギー（既存の time_capacity から） */
  timeBlocks: TimeBlockBaseline[];
  /** Alter 対話セッション合計 */
  totalAlterSessions: number;
}

/** 今回のセッションとベースラインのズレ */
export interface BaselineDeviation {
  type: "decision_shift" | "emotional_spike" | "category_unusual" | "energy_unusual";
  description: string;
  magnitude: number;       // 0-1 の正規化されたズレ量
  domain?: string;
  /** facts として注入する際のテキスト */
  factText: string;
}

/**
 * patterns テーブルのデータからユーザーベースラインを計算する。
 * DB クエリの結果をそのまま受け取り、LLM なしで集約する（反証⑥: コスト制約）。
 */
export function computeUserBaseline(
  patterns: Array<{
    pattern_type: string;
    pattern_key: string;
    observation_count: number;
    pattern_data: any;
    confidence: number;
  }>,
): UserBaseline {
  let totalAlterSessions = 0;
  const decisions: DecisionBaseline[] = [];
  let emotional: EmotionalBaseline | null = null;
  let categories: CategoryBaseline | null = null;
  const timeBlocks: TimeBlockBaseline[] = [];

  for (const p of patterns) {
    // ── Decision Baseline ──
    if (p.pattern_type === "decision" && p.pattern_key.startsWith("decision_") && p.pattern_key !== "decision_category_distribution" && p.pattern_key !== "decision_growth_snapshot") {
      totalAlterSessions += p.observation_count;
      const dist = (p.pattern_data as any)?.shape_distribution;
      if (!dist) continue;

      const goBuckets = ["full_go", "bounded_go", "trial_then_decide"];
      const waitBuckets = ["observe_first", "skip", "defer_with_trigger"];
      const goCount = goBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
      const waitCount = waitBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
      const total = goCount + waitCount;
      if (total < MIN_BASELINE_SESSIONS) continue;

      // 最頻出 shape
      let topShape = "unknown";
      let topCount = 0;
      for (const [shape, count] of Object.entries(dist)) {
        if ((count as number) > topCount) {
          topShape = shape;
          topCount = count as number;
        }
      }

      decisions.push({
        domain: p.pattern_key.replace("decision_", ""),
        goRatio: goCount / total,
        totalObservations: total,
        topShape,
        confidence: p.confidence,
      });
    }

    // ── Emotional Baseline（P2 で追加） ──
    if (p.pattern_type === "state" && p.pattern_key === "emotional_baseline") {
      const pd = p.pattern_data as any;
      if (pd?.sample_count >= MIN_BASELINE_SESSIONS) {
        emotional = {
          avgLoad: pd.avg_emotional_load ?? 0.3,
          variance: pd.variance ?? 0,
          sampleCount: pd.sample_count ?? 0,
        };
      }
    }

    // ── Category Distribution Baseline（P2 で追加） ──
    if (p.pattern_type === "decision" && p.pattern_key === "category_distribution") {
      const counts = (p.pattern_data as any)?.category_counts as Record<string, number> | undefined;
      if (counts && p.observation_count >= MIN_BASELINE_SESSIONS) {
        const totalQ = Object.values(counts).reduce((s, v) => s + v, 0);
        let dominant = "general";
        let dominantCount = 0;
        for (const [cat, cnt] of Object.entries(counts)) {
          if (cnt > dominantCount) {
            dominant = cat;
            dominantCount = cnt;
          }
        }
        categories = {
          distribution: counts,
          totalQuestions: totalQ,
          dominantCategory: dominant,
          dominantRatio: totalQ > 0 ? dominantCount / totalQ : 0,
        };
      }
    }

    // ── Time Block Baseline ──
    if (p.pattern_type === "state" && p.pattern_key === "time_capacity") {
      const blocks = (p.pattern_data as any)?.time_blocks;
      if (blocks) {
        for (const [block, data] of Object.entries(blocks)) {
          const d = data as any;
          if (d.sample_count >= 3) { // 時間帯は3回で十分
            timeBlocks.push({
              timeBlock: block,
              avgCapacity: d.avg_capacity ?? 0.5,
              avgLoad: d.avg_load ?? 0.3,
              avgFatigue: d.avg_fatigue ?? 0.3,
              sampleCount: d.sample_count ?? 0,
            });
          }
        }
      }
    }
  }

  const isReady = totalAlterSessions >= MIN_BASELINE_SESSIONS;

  return { isReady, decisions, emotional, categories, timeBlocks, totalAlterSessions };
}

/**
 * 今回のセッションデータとベースラインを比較し、有意なズレを検出する。
 * ズレは facts として注入可能な形式で返す。
 */
export function detectBaselineDeviations(
  baseline: UserBaseline,
  currentSession: {
    domain?: string;
    actionShape?: string;
    emotionalLoad?: number;
    questionCategory?: string;
    timeBlock?: string;
  },
): BaselineDeviation[] {
  if (!baseline.isReady) return [];
  const deviations: BaselineDeviation[] = [];

  // 1. 判断傾向のズレ — 今回の domain の ActionShape がベースラインと異なる
  if (currentSession.domain && currentSession.actionShape) {
    const domainBaseline = baseline.decisions.find(d => d.domain === currentSession.domain);
    if (domainBaseline && domainBaseline.totalObservations >= MIN_BASELINE_SESSIONS) {
      const isGoShape = ["full_go", "bounded_go", "trial_then_decide"].includes(currentSession.actionShape);
      const expectedGo = domainBaseline.goRatio >= 0.5;

      // ベースラインと逆の判断をしている
      if (isGoShape !== expectedGo) {
        const magnitude = Math.abs(domainBaseline.goRatio - (isGoShape ? 1 : 0));
        if (magnitude >= 0.3) { // 30%以上のズレ
          deviations.push({
            type: "decision_shift",
            description: `${currentSession.domain}で普段と異なる判断傾向（普段: ${expectedGo ? "積極的" : "慎重"} → 今回: ${isGoShape ? "積極的" : "慎重"}）`,
            magnitude: Math.min(1, magnitude),
            domain: currentSession.domain,
            factText: `（変化検出）${currentSession.domain}の判断が普段と異なっている可能性`,
          });
        }
      }
    }
  }

  // 2. 感情負荷のズレ — emotional_load がベースラインから±1.5σ以上
  if (baseline.emotional && currentSession.emotionalLoad !== undefined) {
    const sigma = Math.sqrt(baseline.emotional.variance);
    if (sigma > 0.01) { // 分散が極小の場合はスキップ
      const zScore = (currentSession.emotionalLoad - baseline.emotional.avgLoad) / sigma;
      if (Math.abs(zScore) >= 1.5) {
        const direction = zScore > 0 ? "高い" : "低い";
        deviations.push({
          type: "emotional_spike",
          description: `感情負荷が普段より${direction}（z=${zScore.toFixed(1)}）`,
          magnitude: Math.min(1, Math.abs(zScore) / 3),
          factText: `（変化検出）今の感情負荷が普段より${direction}`,
        });
      }
    }
  }

  // 3. 質問カテゴリのズレ — 普段聞かないカテゴリで質問している
  if (baseline.categories && currentSession.questionCategory) {
    const total = baseline.categories.totalQuestions;
    const catCount = baseline.categories.distribution[currentSession.questionCategory] ?? 0;
    const catRatio = total > 0 ? catCount / total : 0;

    // このカテゴリが全体の5%未満（ほぼ聞いたことがない）
    if (catRatio < 0.05 && total >= 10) {
      deviations.push({
        type: "category_unusual",
        description: `普段あまり聞かない${currentSession.questionCategory}カテゴリの質問`,
        magnitude: 0.5,
        factText: `（変化検出）普段と異なる領域（${currentSession.questionCategory}）について考えている`,
      });
    }
  }

  // 4. 時間帯エネルギーのズレ — 今の時間帯の capacity が普段と大きく異なる
  if (currentSession.timeBlock && currentSession.emotionalLoad !== undefined) {
    const blockBaseline = baseline.timeBlocks.find(t => t.timeBlock === currentSession.timeBlock);
    if (blockBaseline && blockBaseline.sampleCount >= 3) {
      const loadDiff = currentSession.emotionalLoad - blockBaseline.avgLoad;
      if (Math.abs(loadDiff) >= 0.25) { // 0.25以上の差
        const direction = loadDiff > 0 ? "高い" : "低い";
        deviations.push({
          type: "energy_unusual",
          description: `${currentSession.timeBlock}の感情負荷が普段より${direction}`,
          magnitude: Math.min(1, Math.abs(loadDiff) * 2),
          factText: `（変化検出）この時間帯にしては感情負荷が普段より${direction}`,
        });
      }
    }
  }

  return deviations;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4: トリガー深掘り質問エンジン
// 5つの条件で「理解を深める質問」を発火する。
// 既存 Route C / detectStructuralGaps と並走し、理解更新に直結するものを優先。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 深掘りプローブの発火トリガー種別 */
export type ProbeTriggerType =
  | "narrative_recurring"       // 繰り返されるテーマ（mention_count >= 3）
  | "hypothesis_needs_evidence" // 仮説が証拠不足で停滞中
  | "baseline_deviation_cause"  // ベースラインからのズレの原因探索
  | "structural_gap"            // 既存の構造的ギャップ（detectStructuralGaps 互換）
  | "cross_domain_split";       // ドメイン間の矛盾パターン

/** 深掘りプローブ */
export interface DeepeningProbe {
  trigger: ProbeTriggerType;
  priority: number;            // 0-1（高いほど発火しやすい）
  question_hint: string;       // LLM に渡す質問の意図/ヒント
  example_question: string;    // 参考例（LLM はそのまま使わない）
  domain?: string;
  /** 発火抑制用: 同一トリガーの最近の使用を避ける */
  dedup_key: string;
}

/** narratives テーブルのエントリ */
export interface NarrativeEntry {
  id: string;
  theme: string;
  content: string;
  domain: string | null;
  mention_count: number;
}

/**
 * 5つのトリガー条件を評価し、最も優先度の高い深掘りプローブを返す。
 * 発火条件:
 *   1. narrative_recurring — 繰り返されるテーマ（自己認識の深掘り）
 *   2. hypothesis_needs_evidence — 仮説がemerging停滞中
 *   3. baseline_deviation_cause — P3ズレの原因探索
 *   4. structural_gap — 構造的文脈の不足（detectStructuralGaps 連動）
 *   5. cross_domain_split — ドメイン間で判断傾向が逆転
 *
 * 最大1件を返す。発火しない場合は null。
 */
export function selectDeepeningProbe(
  input: {
    narratives: NarrativeEntry[];
    hypotheses: AlterHypothesis[];
    baselineDeviations: BaselineDeviation[];
    structuralGap: StructuralGap | null;
    currentMessage: string;
    currentDomain?: string;
    trustLevel: TrustLevel;
    recentProbeKeys: Set<string>; // 直近で使ったプローブの dedup_key
  },
): DeepeningProbe | null {
  if (input.trustLevel < 2) return null;

  const candidates: DeepeningProbe[] = [];

  // ── Trigger 1: narrative_recurring ──
  // mention_count >= 3 の繰り返しテーマを深掘り
  for (const n of input.narratives) {
    if (n.mention_count < 3) continue;
    const dedupKey = `narrative_${n.theme}`;
    if (input.recentProbeKeys.has(dedupKey)) continue;

    const domainMatch = n.domain && n.domain === input.currentDomain;
    const priority = 0.5 + (domainMatch ? 0.15 : 0) + Math.min(0.2, n.mention_count * 0.03);

    candidates.push({
      trigger: "narrative_recurring",
      priority,
      question_hint: `ユーザーは「${n.theme}」について${n.mention_count}回言及している。この繰り返しパターンの背景にある理由や、いつからそう感じているかを自然に探る。`,
      example_question: `「${n.content}」って、いつ頃からそう感じてた？`,
      domain: n.domain ?? undefined,
      dedup_key: dedupKey,
    });
  }

  // ── Trigger 2: hypothesis_needs_evidence ──
  // emerging 状態が長期間停滞している仮説の検証
  for (const h of input.hypotheses) {
    if (h.status !== "emerging") continue;
    if (h.evidence_count >= 3) continue; // 十分な証拠がある → 次の評価で昇格するはず
    const dedupKey = `hypothesis_${h.hypothesis_type}_${h.content.slice(0, 20)}`;
    if (input.recentProbeKeys.has(dedupKey)) continue;

    const domainMatch = input.currentDomain && h.domains.includes(input.currentDomain);
    if (!domainMatch && h.domains.length > 0 && !h.domains.includes("general")) continue;

    candidates.push({
      trigger: "hypothesis_needs_evidence",
      priority: 0.4 + (domainMatch ? 0.15 : 0),
      question_hint: `仮説「${h.content}」の検証に追加の証拠が必要。この仮説が正しいかどうかを判断できる質問を自然に組み込む。断定せず、ユーザー自身に考えさせる形で。`,
      example_question: `こういうとき、いつもこんな感じ？`,
      domain: h.domains[0],
      dedup_key: dedupKey,
    });
  }

  // ── Trigger 3: baseline_deviation_cause ──
  // P3 で検出されたズレの原因を探る
  for (const dev of input.baselineDeviations) {
    if (dev.magnitude < 0.4) continue; // 弱いズレはスキップ
    const dedupKey = `deviation_${dev.type}`;
    if (input.recentProbeKeys.has(dedupKey)) continue;

    candidates.push({
      trigger: "baseline_deviation_cause",
      priority: 0.55 + dev.magnitude * 0.2,
      question_hint: `${dev.description}。この変化の原因（何があったか、最近の状況変化）を自然に探る。「普段と違うね」とは言わない。`,
      example_question: `最近、何か変化あった？`,
      domain: dev.domain,
      dedup_key: dedupKey,
    });
  }

  // ── Trigger 4: structural_gap ──
  // 既存の detectStructuralGaps と互換（Intent Pool フォールバックの前に統合）
  if (input.structuralGap) {
    const dedupKey = `gap_${input.structuralGap.gap_type}`;
    if (!input.recentProbeKeys.has(dedupKey)) {
      candidates.push({
        trigger: "structural_gap",
        priority: input.structuralGap.priority,
        question_hint: `${input.structuralGap.category}に関する文脈が不足している。${input.structuralGap.suggested_question}を自然な流れで聞く。`,
        example_question: input.structuralGap.suggested_question,
        domain: input.structuralGap.category === "person" ? undefined : input.structuralGap.category,
        dedup_key: dedupKey,
      });
    }
  }

  // ── Trigger 5: cross_domain_split ──
  // cross_context 仮説が示すドメイン間の判断傾向の逆転を深掘り
  for (const h of input.hypotheses) {
    if (h.hypothesis_type !== "cross_context") continue;
    if (h.status === "retired" || h.status === "weakening") continue;
    const dedupKey = `cross_${h.domains.sort().join("_")}`;
    if (input.recentProbeKeys.has(dedupKey)) continue;

    if (!input.currentDomain || !h.domains.includes(input.currentDomain)) continue;

    candidates.push({
      trigger: "cross_domain_split",
      priority: 0.6 + h.confidence * 0.15,
      question_hint: `${h.domains.join("と")}で判断傾向が異なるパターンが検出されている（${h.content}）。なぜこの領域では違う判断をするのかを、ユーザー自身に考えさせる形で探る。`,
      example_question: `仕事のときとプライベートで、判断の仕方って変わる？`,
      domain: input.currentDomain,
      dedup_key: dedupKey,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

/**
 * 深掘りプローブをシステムプロンプトに注入するための書式化。
 * Route C の formatIntentForRouteCPrompt と同等の役割。
 */
export function formatDeepeningProbeForPrompt(probe: DeepeningProbe): string {
  const triggerLabels: Record<ProbeTriggerType, string> = {
    narrative_recurring: "繰り返しパターン",
    hypothesis_needs_evidence: "仮説検証",
    baseline_deviation_cause: "変化の探索",
    structural_gap: "文脈補完",
    cross_domain_split: "領域間の違い",
  };

  return [
    `# 理解を深める質問（${triggerLabels[probe.trigger]}）`,
    `意図: ${probe.question_hint}`,
    `参考例: 「${probe.example_question}」`,
    "",
    "※ 参考例をそのまま使わない。回答の最後に自然に1文で添える。",
    "※ 無理に聞かない。回答だけで十分なら質問は省略してよい。",
    "※ 「普段と違う」「いつもと違う」のような決めつけ表現は禁止。",
  ].join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 生活文脈の矛盾イベントから contradiction_pattern 仮説を導出する。
 * 例: ユーザーが以前「仕事は順調」と言っていたが今回「仕事辞めたい」と言った場合、
 * 「仕事への評価が揺れやすい」という contradiction_pattern 仮説を生成する。
 */
export function deriveContradictionHypotheses(
  contradictions: Array<{
    category: string;
    old_content: string;
    new_content: string;
    domain?: string;
  }>,
): Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count">> {
  if (contradictions.length === 0) return [];

  const hypotheses: Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count">> = [];

  // カテゴリ別に矛盾を集約
  const byCategory = new Map<string, typeof contradictions>();
  for (const c of contradictions) {
    const arr = byCategory.get(c.category) ?? [];
    arr.push(c);
    byCategory.set(c.category, arr);
  }

  for (const [category, items] of byCategory) {
    const domain = items[0]?.domain ?? "general";
    hypotheses.push({
      hypothesis_type: "contradiction_pattern",
      content: `${category}に関する認識が変化しやすい（矛盾${items.length}回検出）`,
      evidence_summary: `以前: "${items[0].old_content}" → 現在: "${items[0].new_content}"`,
      domains: [domain],
      confidence: Math.min(0.7, 0.3 + items.length * 0.1),
      evidence_count: items.length,
      status: items.length >= 3 ? "strengthening" : "emerging",
      required_trust: 3, // 矛盾パターンは慎重に提示
    });
  }

  return hypotheses;
}

/**
 * 既存仮説と現在のメッセージの矛盾を検出し、弱体化すべき仮説を返す。
 * メッセージ内のキーワードが仮説の content や evidence と矛盾する場合に発火。
 */
export function detectHypothesisContradictions(
  hypotheses: AlterHypothesis[],
  currentMessage: string,
  lifeContextContradictions: Array<{ category: string; old_content: string; new_content: string }>,
): Array<{ hypothesis: AlterHypothesis; reason: string }> {
  const results: Array<{ hypothesis: AlterHypothesis; reason: string }> = [];
  const msgLower = currentMessage.toLowerCase();

  for (const h of hypotheses) {
    // 1. 行動傾向の仮説 vs 実際の行動の矛盾
    if (h.hypothesis_type === "recurring_pattern") {
      const isGoHypothesis = h.content.includes("動く傾向");
      const isCautiousHypothesis = h.content.includes("慎重傾向");

      // 「動く傾向」仮説に対して慎重な発言
      if (isGoHypothesis && /やめ|見送|待[つっ]|慎重|不安|怖/.test(msgLower)) {
        results.push({ hypothesis: h, reason: "行動傾向仮説に対する慎重な発言を検出" });
      }
      // 「慎重傾向」仮説に対して積極的な発言
      if (isCautiousHypothesis && /やる|決め[たる]|行[くこ]|挑戦|攻め/.test(msgLower)) {
        results.push({ hypothesis: h, reason: "慎重傾向仮説に対する積極的な発言を検出" });
      }
    }

    // 2. 生活文脈の矛盾がドメイン一致する仮説を弱体化
    for (const contradiction of lifeContextContradictions) {
      if (h.domains.some(d => d === contradiction.category || d === "general")) {
        if (h.content.includes(contradiction.category) || h.evidence_summary.includes(contradiction.old_content)) {
          results.push({ hypothesis: h, reason: `生活文脈の矛盾: ${contradiction.old_content} → ${contradiction.new_content}` });
        }
      }
    }
  }

  return results;
}

/**
 * パターン変化から growth_signal 仮説を導出する。
 * 判断傾向が有意に変化した場合（例: 仕事で慎重→積極的に変化）に発火。
 */
export function deriveGrowthSignalHypotheses(
  decisionPatterns: Array<{ pattern_key: string; pattern_data: any; observation_count: number; confidence: number }>,
  previousPatternSnapshot?: Record<string, { goRatio: number; total: number }> | null,
): Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count">> {
  if (!previousPatternSnapshot) return [];

  const hypotheses: Array<Omit<AlterHypothesis, "id" | "last_evaluated" | "presented_count">> = [];

  for (const pattern of decisionPatterns) {
    if (pattern.observation_count < 8) continue; // 十分な観測が必要
    const dist = (pattern.pattern_data as any)?.shape_distribution;
    if (!dist) continue;

    const domain = pattern.pattern_key.replace("decision_", "");
    const prev = previousPatternSnapshot[domain];
    if (!prev || prev.total < 5) continue;

    // 現在の goRatio を計算
    const goBuckets = ["full_go", "bounded_go", "trial_then_decide"];
    const waitBuckets = ["observe_first", "skip", "defer_with_trigger"];
    const goCount = goBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
    const waitCount = waitBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
    const total = goCount + waitCount;
    if (total < 5) continue;

    const currentGoRatio = goCount / total;
    const shift = currentGoRatio - prev.goRatio;

    // 有意な変化（±0.2以上）を検出
    if (Math.abs(shift) >= 0.2) {
      const direction = shift > 0 ? "積極的" : "慎重";
      const from = shift > 0 ? "慎重" : "積極的";
      hypotheses.push({
        hypothesis_type: "growth_signal",
        content: `${domain}の判断が${from}から${direction}に変化している可能性`,
        evidence_summary: `goRatio: ${prev.goRatio.toFixed(2)} → ${currentGoRatio.toFixed(2)}（差: ${shift > 0 ? "+" : ""}${shift.toFixed(2)}）`,
        domains: [domain],
        confidence: Math.min(0.7, 0.3 + Math.abs(shift)),
        evidence_count: total,
        status: "emerging",
        required_trust: 2,
      });
    }
  }

  return hypotheses;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 5: 継続的検証
// followup精度・不気味ライン・Trust閾値・MI精度の計測・改善
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 5-1: Followup 精度測定 ──

/** followup データから判断精度指標を算出 */
export interface JudgmentAccuracyMetrics {
  /** 実行率: 提案を実行した割合 */
  execution_rate: number;
  /** 満足度平均 (1-5) */
  avg_satisfaction: number;
  /** 後悔率: 実行後に後悔した割合 */
  regret_rate: number;
  /** スキップ率: 提案を見送った割合 */
  skip_rate: number;
  /** ドメイン別の精度差 */
  domain_breakdown: Record<string, { execution_rate: number; avg_satisfaction: number; count: number }>;
  /** サンプル数 */
  total_count: number;
}

export function computeJudgmentAccuracy(
  followups: Array<{ metadata: any }>,
): JudgmentAccuracyMetrics {
  const total = followups.length;
  if (total === 0) {
    return {
      execution_rate: 0, avg_satisfaction: 0, regret_rate: 0, skip_rate: 0,
      domain_breakdown: {}, total_count: 0,
    };
  }

  const executed = followups.filter(f => f.metadata?.executed === true);
  const skipped = followups.filter(f => f.metadata?.skip_reason);
  const regretted = executed.filter(f => f.metadata?.did_regret === true);

  const avgSat = executed.length > 0
    ? executed.reduce((s, f) => s + (f.metadata?.satisfaction ?? 3), 0) / executed.length
    : 0;

  // ドメイン別
  const domainMap: Record<string, { exec: number; sat: number; count: number }> = {};
  for (const f of followups) {
    const d = f.metadata?.query_domain ?? "general";
    if (!domainMap[d]) domainMap[d] = { exec: 0, sat: 0, count: 0 };
    domainMap[d].count++;
    if (f.metadata?.executed) {
      domainMap[d].exec++;
      domainMap[d].sat += f.metadata?.satisfaction ?? 3;
    }
  }
  const domainBreakdown: JudgmentAccuracyMetrics["domain_breakdown"] = {};
  for (const [d, v] of Object.entries(domainMap)) {
    domainBreakdown[d] = {
      execution_rate: v.count > 0 ? v.exec / v.count : 0,
      avg_satisfaction: v.exec > 0 ? v.sat / v.exec : 0,
      count: v.count,
    };
  }

  return {
    execution_rate: executed.length / total,
    avg_satisfaction: avgSat,
    regret_rate: executed.length > 0 ? regretted.length / executed.length : 0,
    skip_rate: skipped.length / total,
    domain_breakdown: domainBreakdown,
    total_count: total,
  };
}

// ── 5-2: 不気味ライン検知 ──

/** 不気味ライン違反の種類 */
export type CreepinessViolation =
  | "over_disclosure"     // Trust Level に対して開示しすぎ
  | "premature_pattern"   // 証拠不足でパターンを提示
  | "unsolicited_insight" // 求められていないのに深い洞察を提示
  | "identity_assertion"  // 「あなたは〜な人」と断定
  | "excessive_tracking"  // 行動追跡を感じさせる表現

/** 不気味ライン検知結果 */
export interface CreepinessCheck {
  pass: boolean;
  violations: Array<{ type: CreepinessViolation; detail: string; severity: "warning" | "critical" }>;
}

/**
 * Alter の応答が「不気味ライン」を超えていないかチェック。
 * 「見ている感」は OK、「見透かしている感」は NG。
 */
export function checkCreepinessLine(
  response: string,
  trustLevel: TrustLevel,
  hypothesesInjected: number,
  contextEntriesUsed: number,
): CreepinessCheck {
  const violations: CreepinessCheck["violations"] = [];

  // 断定パターン検出: 「あなたは〜だ」「あなたは〜な人」
  const assertionPatterns = [
    /あなた[はって]{1,2}(.{2,20})[だです](?:よね|ね)?/,
    /あなた[はって]{1,2}(.{2,20})(?:な人|タイプ|性格)/,
    /(?:きっと|絶対に|間違いなく)(.{3,30})[だです]/,
  ];
  for (const p of assertionPatterns) {
    const m = response.match(p);
    if (m) {
      violations.push({
        type: "identity_assertion",
        detail: `断定表現: "${m[0]}"`,
        severity: trustLevel >= 3 ? "warning" : "critical",
      });
    }
  }

  // Trust Level に対する開示量チェック
  // P0修正: T0では全コンテキスト注入をcritical（ブロッキング）に昇格
  // T0 = 反射のみ。知っている前提を混ぜると信頼を最も壊す
  if (trustLevel === 0 && contextEntriesUsed > 0) {
    violations.push({
      type: "over_disclosure",
      detail: `Trust Level 0 で ${contextEntriesUsed} 件のコンテキストを使用（T0は反射のみ）`,
      severity: "critical",
    });
  } else if (trustLevel === 1 && contextEntriesUsed > 3) {
    violations.push({
      type: "over_disclosure",
      detail: `Trust Level ${trustLevel} で ${contextEntriesUsed} 件のコンテキストを使用`,
      severity: "warning",
    });
  }
  if (trustLevel <= 1 && hypothesesInjected > 0) {
    violations.push({
      type: "premature_pattern",
      detail: `Trust Level ${trustLevel} で仮説を注入`,
      severity: "critical",
    });
  }

  // 追跡表現の検出
  const trackingPatterns = [
    /いつも(.{2,15})(?:してる|している|してい?ます|だよ)(?:よね|ね)/,
    /毎回(.{2,15})(?:してる|している|してい?ます|だよ)(?:よね|ね)/,
    /前も(.{2,15})(?:って言って|と言って)(?:た|いた)(?:よね|ね)/,
    /いつも(.{2,15})(?:でる|でいる|んだ)(?:よね|ね)/,
  ];
  for (const p of trackingPatterns) {
    const m = response.match(p);
    if (m && trustLevel < 2) {
      violations.push({
        type: "excessive_tracking",
        detail: `追跡表現: "${m[0]}" (Trust Level ${trustLevel})`,
        severity: "warning",
      });
    }
  }

  return {
    pass: violations.filter(v => v.severity === "critical").length === 0,
    violations,
  };
}

// ── 5-3: Trust Gate 閾値調整 ──

/**
 * Reaction データから Trust Gate の閾値を調整するための推奨値を算出。
 * denied が多い → 閾値を引き上げ（より慎重に）
 * accepted が多い → 閾値を引き下げ可能（現状維持推奨）
 */
export function suggestTrustThresholdAdjustment(
  reactions: Array<{ reaction: string; insight_type: string }>,
): { recommendation: "raise" | "maintain" | "lower"; reason: string; denialRate: number } {
  if (reactions.length < 10) {
    return { recommendation: "maintain", reason: "サンプル不足（10件未満）", denialRate: 0 };
  }

  const denied = reactions.filter(r => r.reaction === "denied").length;
  const ignored = reactions.filter(r => r.reaction === "ignored").length;
  const accepted = reactions.filter(r => r.reaction === "accepted" || r.reaction === "explored").length;
  const denialRate = denied / reactions.length;
  const ignoredRate = ignored / reactions.length;

  // denied 30%以上 → 閾値引き上げ推奨
  if (denialRate >= 0.3) {
    return {
      recommendation: "raise",
      reason: `拒否率 ${(denialRate * 100).toFixed(0)}% — 開示が速すぎる可能性`,
      denialRate,
    };
  }

  // ignored 50%以上 → 閾値引き上げ推奨（関心がない or 不気味）
  if (ignoredRate >= 0.5) {
    return {
      recommendation: "raise",
      reason: `無視率 ${(ignoredRate * 100).toFixed(0)}% — 開示のタイミングか内容が合っていない可能性`,
      denialRate,
    };
  }

  // accepted 60%以上 → 現状の閾値が適切
  if (accepted / reactions.length >= 0.6) {
    return {
      recommendation: "maintain",
      reason: `受容率 ${(accepted / reactions.length * 100).toFixed(0)}% — 閾値は適切`,
      denialRate,
    };
  }

  return { recommendation: "maintain", reason: "パターン不明確 — 現状維持推奨", denialRate };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 5: 失敗罠の自動検知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計書で定義された8つの失敗パターンのうち、
// therapist罠 と oracle罠 は既存の checkCreepinessLine + Trust Gate で暗黙的にカバー。
// 残り6つをここで自動検知する。
//
// 共通設計:
// - warning / critical の2段階
// - analytics に記録（fire-and-forget）
// - critical 時は prompt depth を自動で下げる（応答は止めない）
// - 既存の ForceBalance / ActionShape / Trust Gate は壊さない

/** 罠検知の結果 */
export interface TrapDetection {
  trap_type: TrapType;
  detected: boolean;
  severity: "warning" | "critical" | "none";
  /** 検知に使った指標 */
  indicators: TrapIndicator[];
  /** 推奨アクション */
  recommendation: string;
}

export type TrapType =
  | "surveillance"   // 監視罠: MI提示後の沈黙・話題転換が多い
  | "load"           // 負荷罠: 深い質問への無回答が多い
  | "stagnation"     // 停滞罠: 理解は深まるが判断の質が上がらない
  | "narrative"       // 物語罠: 仮説の受容率が低い（もっともらしいが的外れ）
  | "fixation"       // 固定化罠: 古い理解に引きずられている
  | "projection";    // 投影罠: 存在しないパターンを見出している

export interface TrapIndicator {
  name: string;
  value: number;
  threshold: number;
  breached: boolean;
}

/** 全6罠の検知結果をまとめたもの */
export interface TrapScanResult {
  /** 検知された罠の数 */
  detected_count: number;
  /** critical な罠の数 */
  critical_count: number;
  /** 各罠の詳細 */
  traps: TrapDetection[];
  /** prompt depth を下げるべきか */
  should_reduce_depth: boolean;
  /** MI を抑制すべきか */
  should_suppress_mi: boolean;
  /** Route C を抑制すべきか */
  should_suppress_route_c: boolean;
}

// ── 入力データ型 ──

/** 罠検知に必要なデータ（route.ts から渡す） */
export interface TrapScanInput {
  /** MI の提示後反応 */
  reactions: Array<{ reaction: string; insight_type: string; signal_types: string[] }>;
  /** 直近の clarify / Route C への応答（無回答を検知） */
  recentClarifyEvents: Array<{
    has_response: boolean;
    clarify_type?: string;
    intent_layer?: string;
  }>;
  /** followup データ（判断の質を評価） */
  followups: Array<{
    executed: boolean;
    satisfaction?: number;
    skip_reason?: string;
    domain?: string;
  }>;
  /** 蓄積された仮説 */
  hypotheses: Array<{
    status: string;
    confidence: number;
    last_observed: string;
  }>;
  /** 蓄積された Life Context の鮮度 */
  contextEntries: Array<{
    last_confirmed: string;
    possibly_stale: boolean;
    source: string;
    temporality: string;
  }>;
  /** 直近のセッション数 */
  sessionCount: number;
}

// ── 罠①: 監視罠 ──
// MI提示後の沈黙・話題転換率が20%超で warning、40%超で critical

function detectSurveillanceTrap(input: TrapScanInput): TrapDetection {
  const { reactions } = input;
  if (reactions.length < 5) {
    return { trap_type: "surveillance", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  const ignoreCount = reactions.filter(r => r.reaction === "ignored").length;
  const topicChangeCount = reactions.filter(r => r.reaction === "denied").length; // denied ≒ 話題転換・不快
  const silenceRate = ignoreCount / reactions.length;
  const avoidanceRate = (ignoreCount + topicChangeCount) / reactions.length;

  const indicators: TrapIndicator[] = [
    { name: "silence_rate", value: silenceRate, threshold: 0.2, breached: silenceRate >= 0.2 },
    { name: "avoidance_rate", value: avoidanceRate, threshold: 0.4, breached: avoidanceRate >= 0.4 },
  ];

  if (avoidanceRate >= 0.4) {
    return {
      trap_type: "surveillance",
      detected: true,
      severity: "critical",
      indicators,
      recommendation: "MI の提示を一時停止し、Trust Gate 閾値を引き上げる。提示間隔を倍にする。",
    };
  }
  if (silenceRate >= 0.2) {
    return {
      trap_type: "surveillance",
      detected: true,
      severity: "warning",
      indicators,
      recommendation: "MI の提示頻度を下げる。casual_check 以外の提示を控える。",
    };
  }

  return { trap_type: "surveillance", detected: false, severity: "none", indicators, recommendation: "" };
}

// ── 罠②: 負荷罠 ──
// 深い質問（Route C / understanding clarify）への無回答率が30%超

function detectLoadTrap(input: TrapScanInput): TrapDetection {
  const { recentClarifyEvents } = input;
  if (recentClarifyEvents.length < 3) {
    return { trap_type: "load", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  // 深い質問 = understanding clarify または Route C からの intent_layer が narrative/cross_context
  const deepQuestions = recentClarifyEvents.filter(
    e => e.clarify_type === "understanding" || e.intent_layer === "narrative" || e.intent_layer === "cross_context",
  );
  const allQuestions = recentClarifyEvents;
  const noResponseRate = allQuestions.filter(e => !e.has_response).length / allQuestions.length;
  const deepNoResponseRate = deepQuestions.length > 0
    ? deepQuestions.filter(e => !e.has_response).length / deepQuestions.length
    : 0;

  const indicators: TrapIndicator[] = [
    { name: "overall_no_response_rate", value: noResponseRate, threshold: 0.3, breached: noResponseRate >= 0.3 },
    { name: "deep_no_response_rate", value: deepNoResponseRate, threshold: 0.5, breached: deepNoResponseRate >= 0.5 },
  ];

  if (deepNoResponseRate >= 0.5 && deepQuestions.length >= 3) {
    return {
      trap_type: "load",
      detected: true,
      severity: "critical",
      indicators,
      recommendation: "深い質問（narrative/cross_context）を一時停止。Layer 6 (decision) と Layer 2 (state) の意図のみに制限。",
    };
  }
  if (noResponseRate >= 0.3) {
    return {
      trap_type: "load",
      detected: true,
      severity: "warning",
      indicators,
      recommendation: "質問の頻度を下げる。Route C を一時停止。clarify も decision 系のみに。",
    };
  }

  return { trap_type: "load", detected: false, severity: "none", indicators, recommendation: "" };
}

// ── 罠③: 停滞罠 ──
// followup の satisfaction が下がり続けている or execution_rate が低い

function detectStagnationTrap(input: TrapScanInput): TrapDetection {
  const { followups, sessionCount } = input;
  if (followups.length < 5 || sessionCount < 10) {
    return { trap_type: "stagnation", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  const executionRate = followups.filter(f => f.executed).length / followups.length;
  const withSatisfaction = followups.filter(f => f.satisfaction != null);
  const avgSatisfaction = withSatisfaction.length > 0
    ? withSatisfaction.reduce((s, f) => s + (f.satisfaction ?? 0), 0) / withSatisfaction.length
    : 3; // デフォルトは中立

  // 直近半分 vs 前半分の satisfaction 比較
  const half = Math.floor(withSatisfaction.length / 2);
  const recentHalf = withSatisfaction.slice(half);
  const olderHalf = withSatisfaction.slice(0, half);
  const recentAvg = recentHalf.length > 0
    ? recentHalf.reduce((s, f) => s + (f.satisfaction ?? 0), 0) / recentHalf.length
    : avgSatisfaction;
  const olderAvg = olderHalf.length > 0
    ? olderHalf.reduce((s, f) => s + (f.satisfaction ?? 0), 0) / olderHalf.length
    : avgSatisfaction;
  const satisfactionTrend = recentAvg - olderAvg; // 負 = 下降

  const indicators: TrapIndicator[] = [
    { name: "execution_rate", value: executionRate, threshold: 0.3, breached: executionRate < 0.3 },
    { name: "avg_satisfaction", value: avgSatisfaction, threshold: 2.5, breached: avgSatisfaction < 2.5 },
    { name: "satisfaction_trend", value: satisfactionTrend, threshold: -0.5, breached: satisfactionTrend < -0.5 },
  ];

  if (executionRate < 0.2 && avgSatisfaction < 2.5) {
    return {
      trap_type: "stagnation",
      detected: true,
      severity: "critical",
      indicators,
      recommendation: "判断品質が停滞。ActionShape の粒度を下げ(trial_then_decide優先)、提案のハードルを大幅に下げる。",
    };
  }
  if (executionRate < 0.3 || satisfactionTrend < -0.5) {
    return {
      trap_type: "stagnation",
      detected: true,
      severity: "warning",
      indicators,
      recommendation: "判断品質が伸びていない。提案の具体性を上げ、ハードルを下げる。",
    };
  }

  return { trap_type: "stagnation", detected: false, severity: "none", indicators, recommendation: "" };
}

// ── 罠④: 物語罠 ──
// alter_hypotheses の user_acknowledged = false（≒ denied/ignored）が50%超

function detectNarrativeTrap(input: TrapScanInput): TrapDetection {
  const { reactions, hypotheses } = input;
  if (hypotheses.length < 3) {
    return { trap_type: "narrative", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  // 仮説が多いのに受容率が低い → もっともらしい物語を生成しすぎ
  const lowConfHypotheses = hypotheses.filter(h => h.confidence < 0.4);
  const lowConfRate = lowConfHypotheses.length / hypotheses.length;

  // reactions からの仮説受容率
  const hypothesisRelatedReactions = reactions.filter(r =>
    r.insight_type === "hypothesis" || r.insight_type === "pattern" || r.insight_type === "cross_context",
  );
  const hypothesisDenialRate = hypothesisRelatedReactions.length > 0
    ? hypothesisRelatedReactions.filter(r => r.reaction === "denied").length / hypothesisRelatedReactions.length
    : 0;

  const indicators: TrapIndicator[] = [
    { name: "low_confidence_hypothesis_rate", value: lowConfRate, threshold: 0.5, breached: lowConfRate >= 0.5 },
    { name: "hypothesis_denial_rate", value: hypothesisDenialRate, threshold: 0.5, breached: hypothesisDenialRate >= 0.5 },
  ];

  if (hypothesisDenialRate >= 0.5 && hypothesisRelatedReactions.length >= 5) {
    return {
      trap_type: "narrative",
      detected: true,
      severity: "critical",
      indicators,
      recommendation: "仮説の提示を停止。confidence < 0.6 の仮説を全て凍結。新規仮説生成を一時停止。",
    };
  }
  if (lowConfRate >= 0.5 || (hypothesisDenialRate >= 0.3 && hypothesisRelatedReactions.length >= 3)) {
    return {
      trap_type: "narrative",
      detected: true,
      severity: "warning",
      indicators,
      recommendation: "仮説の提示基準を引き上げ（confidence >= 0.6 のみ）。evidence_count < 3 の仮説は提示しない。",
    };
  }

  return { trap_type: "narrative", detected: false, severity: "none", indicators, recommendation: "" };
}

// ── 罠⑤: 固定化罠 ──
// 60日以上更新されていない persistent/structural な理解が多い

function detectFixationTrap(input: TrapScanInput): TrapDetection {
  const { contextEntries } = input;
  if (contextEntries.length < 5) {
    return { trap_type: "fixation", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  const now = Date.now();
  const persistentEntries = contextEntries.filter(
    e => e.temporality === "persistent" || e.temporality === "structural",
  );
  const staleEntries = persistentEntries.filter(e => {
    const lastConfirmed = new Date(e.last_confirmed).getTime();
    const daysSinceConfirm = (now - lastConfirmed) / (1000 * 60 * 60 * 24);
    return daysSinceConfirm > 60;
  });
  const staleRate = persistentEntries.length > 0 ? staleEntries.length / persistentEntries.length : 0;

  // alter_inferred で更新が古いものは特に危険
  const staleInferred = staleEntries.filter(e => e.source === "alter_inferred");
  const staleInferredRate = persistentEntries.length > 0 ? staleInferred.length / persistentEntries.length : 0;

  const indicators: TrapIndicator[] = [
    { name: "stale_persistent_rate", value: staleRate, threshold: 0.5, breached: staleRate >= 0.5 },
    { name: "stale_inferred_rate", value: staleInferredRate, threshold: 0.3, breached: staleInferredRate >= 0.3 },
    { name: "stale_count", value: staleEntries.length, threshold: 5, breached: staleEntries.length >= 5 },
  ];

  if (staleRate >= 0.5 && staleEntries.length >= 5) {
    return {
      trap_type: "fixation",
      detected: true,
      severity: "critical",
      indicators,
      recommendation: "古い理解（60日超未確認）を判断から除外。alter_inferred の stale は confidence を 0.2 に引き下げ。",
    };
  }
  if (staleInferredRate >= 0.3 || staleEntries.length >= 3) {
    return {
      trap_type: "fixation",
      detected: true,
      severity: "warning",
      indicators,
      recommendation: "stale な理解をプロンプトから除外。Route C で再確認の意図を優先的に選択。",
    };
  }

  return { trap_type: "fixation", detected: false, severity: "none", indicators, recommendation: "" };
}

// ── 罠⑥: 投影罠 ──
// alter_inferred の reject率が30%超 → 存在しないパターンを見出している

function detectProjectionTrap(input: TrapScanInput): TrapDetection {
  const { reactions } = input;
  if (reactions.length < 5) {
    return { trap_type: "projection", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  // inferred 由来のシグナル: behavior_mismatch, topic_repetition, sentiment_shift
  const inferredSignalTypes = new Set(["behavior_mismatch", "topic_repetition", "sentiment_shift", "energy_action_gap"]);
  const inferredReactions = reactions.filter(
    r => r.signal_types?.some(s => inferredSignalTypes.has(s)),
  );

  if (inferredReactions.length < 3) {
    return { trap_type: "projection", detected: false, severity: "none", indicators: [], recommendation: "" };
  }

  const inferredDenialRate = inferredReactions.filter(r => r.reaction === "denied").length / inferredReactions.length;
  const overallDenialRate = reactions.filter(r => r.reaction === "denied").length / reactions.length;

  const indicators: TrapIndicator[] = [
    { name: "inferred_denial_rate", value: inferredDenialRate, threshold: 0.3, breached: inferredDenialRate >= 0.3 },
    { name: "overall_denial_rate", value: overallDenialRate, threshold: 0.3, breached: overallDenialRate >= 0.3 },
  ];

  if (inferredDenialRate >= 0.5) {
    return {
      trap_type: "projection",
      detected: true,
      severity: "critical",
      indicators,
      recommendation: "推論ベースの気づきを全停止。user_stated 由来のみに制限。MI のシグナル検出を見直す。",
    };
  }
  if (inferredDenialRate >= 0.3) {
    return {
      trap_type: "projection",
      detected: true,
      severity: "warning",
      indicators,
      recommendation: "behavior_observed / alter_inferred 由来の MI を抑制。提示には evidence_count >= 3 を必須にする。",
    };
  }

  return { trap_type: "projection", detected: false, severity: "none", indicators, recommendation: "" };
}

// ── 統合: 全罠スキャン ──

/**
 * 6つの失敗罠を一括スキャンし、結果をまとめる。
 * route.ts の Phase 5 (fire-and-forget) で呼ぶ。
 *
 * should_reduce_depth / should_suppress_mi / should_suppress_route_c は
 * 次回のリクエストで参照する（analytics に保存してから取得）。
 */
export function runTrapScan(input: TrapScanInput): TrapScanResult {
  const traps = [
    detectSurveillanceTrap(input),
    detectLoadTrap(input),
    detectStagnationTrap(input),
    detectNarrativeTrap(input),
    detectFixationTrap(input),
    detectProjectionTrap(input),
  ];

  const detected = traps.filter(t => t.detected);
  const critical = detected.filter(t => t.severity === "critical");

  // アクション決定
  const shouldReduceDepth = critical.some(t =>
    t.trap_type === "stagnation" || t.trap_type === "load",
  );
  const shouldSuppressMI = critical.some(t =>
    t.trap_type === "surveillance" || t.trap_type === "projection",
  ) || detected.filter(t =>
    (t.trap_type === "surveillance" || t.trap_type === "projection") && t.severity === "warning",
  ).length >= 2;
  const shouldSuppressRouteC = critical.some(t =>
    t.trap_type === "load",
  ) || detected.some(t =>
    t.trap_type === "load" && t.severity === "warning",
  );

  return {
    detected_count: detected.length,
    critical_count: critical.length,
    traps,
    should_reduce_depth: shouldReduceDepth,
    should_suppress_mi: shouldSuppressMI,
    should_suppress_route_c: shouldSuppressRouteC,
  };
}

// ── 5-4: MI 精度改善 ──

/** Micro Insight の精度指標 */
export interface MIAccuracyMetrics {
  /** 提示されたMI数 */
  total_presented: number;
  /** 受容されたMI数 */
  accepted_count: number;
  /** 拒否されたMI数 */
  denied_count: number;
  /** 無視されたMI数 */
  ignored_count: number;
  /** 受容率 */
  acceptance_rate: number;
  /** タイプ別の受容率 */
  type_breakdown: Record<string, { accepted: number; denied: number; ignored: number; total: number }>;
  /** 無効にすべきシグナルタイプ（denied率50%以上） */
  signals_to_suppress: string[];
}

export function computeMIAccuracy(
  reactions: Array<{ reaction: string; insight_type: string; signal_types: string[] }>,
): MIAccuracyMetrics {
  const total = reactions.length;
  if (total === 0) {
    return {
      total_presented: 0, accepted_count: 0, denied_count: 0, ignored_count: 0,
      acceptance_rate: 0, type_breakdown: {}, signals_to_suppress: [],
    };
  }

  const accepted = reactions.filter(r => r.reaction === "accepted" || r.reaction === "explored");
  const denied = reactions.filter(r => r.reaction === "denied");
  const ignored = reactions.filter(r => r.reaction === "ignored");

  // タイプ別集計
  const typeMap: Record<string, { accepted: number; denied: number; ignored: number; total: number }> = {};
  for (const r of reactions) {
    const t = r.insight_type;
    if (!typeMap[t]) typeMap[t] = { accepted: 0, denied: 0, ignored: 0, total: 0 };
    typeMap[t].total++;
    if (r.reaction === "accepted" || r.reaction === "explored") typeMap[t].accepted++;
    else if (r.reaction === "denied") typeMap[t].denied++;
    else if (r.reaction === "ignored") typeMap[t].ignored++;
  }

  // denied率50%以上のシグナルタイプを抑制推奨
  const toSuppress: string[] = [];
  for (const [type, stats] of Object.entries(typeMap)) {
    if (stats.total >= 3 && stats.denied / stats.total >= 0.5) {
      toSuppress.push(type);
    }
  }

  return {
    total_presented: total,
    accepted_count: accepted.length,
    denied_count: denied.length,
    ignored_count: ignored.length,
    acceptance_rate: accepted.length / total,
    type_breakdown: typeMap,
    signals_to_suppress: toSuppress,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P5: Micro Insight 提示制御強化
// 否定率、連続denied、頻度逸脱、フェイルセーフを統合管理する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** P5: MI 提示制御の判定結果 */
export interface MIGateDecision {
  /** MI 提示を許可するか */
  allowed: boolean;
  /** ブロック理由（allowed=false の場合） */
  blockReason: string;
  /** MI 精度フィードバック（computeMIAccuracy の結果） */
  accuracy: MIAccuracyMetrics | null;
  /** 抑制すべき insight_type のリスト */
  suppressedTypes: string[];
  /** フェイルセーフ発動中か */
  failsafeActive: boolean;
}

/**
 * P5: MI 提示のゲート判定（既存の suppression ロジックを拡張）。
 * 既存の時間/ストリーク/trap/wound に加え、以下を追加:
 *   - 3セッション中最大1回（セッションベースのクールダウン）
 *   - 否定率30%超で全停止（フェイルセーフ）
 *   - 連続denied 3回で30日間停止
 *   - computeMIAccuracy によるタイプ別抑制
 */
/** 最小サンプル数定数（P5 CEO指示: サンプル不足時の誤発動防止） */
const MI_MIN_SAMPLE_GLOBAL_FAILSAFE = 5;   // global deny rate 判定の最小提示数
const MI_MIN_SAMPLE_TYPE_SUPPRESS = 3;     // suppressedTypes 判定のタイプ別最小件数（computeMIAccuracy 側で使用）
const MI_MIN_SAMPLE_CONSECUTIVE = 3;       // consecutive denied の最小連続数（変更なし、元から3）

export function evaluateMIGate(
  input: {
    /** 既存の時間ベース suppression 理由（空文字 = 通過） */
    existingSuppressReason: string;
    /** 全 reaction 履歴（直近50件） */
    reactions: Array<{ reaction: string; insight_type: string; signal_types: string[]; created_at: string }>;
    /** 直近の MI 提示イベントのタイムスタンプ一覧 */
    recentPresentations: Date[];
    /** ユーザーの Alter セッション数（alterSessionCount） */
    alterSessionCount: number;
    /** 今回のセッションで既に MI を提示済みか（1セッション1回制限） */
    sessionMIPresentedCount: number;
  },
): MIGateDecision {
  // ── Fix 1: 1セッション最大1回（sessionId 単位） ──
  if (input.sessionMIPresentedCount >= 1) {
    return {
      allowed: false,
      blockReason: `P5: 1セッション1回制限 — 今回のセッションで既に${input.sessionMIPresentedCount}件提示済み`,
      accuracy: null,
      suppressedTypes: [],
      failsafeActive: false,
    };
  }

  // 既存の suppression が通過していない場合はそのままブロック
  if (input.existingSuppressReason) {
    return {
      allowed: false,
      blockReason: input.existingSuppressReason,
      accuracy: null,
      suppressedTypes: [],
      failsafeActive: false,
    };
  }

  // ── P5: computeMIAccuracy フィードバックループ ──
  const accuracy = computeMIAccuracy(input.reactions);
  // Fix 3: suppressedTypes はタイプ別最小サンプル数を満たした場合のみ有効
  // （computeMIAccuracy 内部で stats.total >= MI_MIN_SAMPLE_TYPE_SUPPRESS を既にチェック済み）
  const suppressedTypes = accuracy.signals_to_suppress;

  // ── フェイルセーフ 1: 全体の否定率 30% 超で全停止 ──
  // Fix 3: 最小サンプル数 MI_MIN_SAMPLE_GLOBAL_FAILSAFE を満たした場合のみ発動
  if (accuracy.total_presented >= MI_MIN_SAMPLE_GLOBAL_FAILSAFE && accuracy.denied_count / accuracy.total_presented > 0.3) {
    return {
      allowed: false,
      blockReason: `failsafe: 否定率 ${(accuracy.denied_count / accuracy.total_presented * 100).toFixed(0)}% > 30% (${accuracy.denied_count}/${accuracy.total_presented}, min=${MI_MIN_SAMPLE_GLOBAL_FAILSAFE})`,
      accuracy,
      suppressedTypes,
      failsafeActive: true,
    };
  }

  // ── フェイルセーフ 2: 連続 denied 3回で30日間停止 ──
  // Fix 3: MI_MIN_SAMPLE_CONSECUTIVE（= 3）は元の条件と同値だが定数として明示
  let consecutiveDenied = 0;
  for (const r of input.reactions) {
    if (r.reaction === "denied") {
      consecutiveDenied++;
    } else {
      break;
    }
  }
  if (consecutiveDenied >= MI_MIN_SAMPLE_CONSECUTIVE) {
    // 最新の denied が30日以内かチェック
    const latestDenied = input.reactions[0];
    if (latestDenied) {
      const daysSinceDenied = (Date.now() - new Date(latestDenied.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDenied < 30) {
        return {
          allowed: false,
          blockReason: `failsafe: 連続 denied ${consecutiveDenied}回 — 30日間停止中 (残${Math.ceil(30 - daysSinceDenied)}日)`,
          accuracy,
          suppressedTypes,
          failsafeActive: true,
        };
      }
    }
  }

  // ── P5: 3セッション中最大1回（セッションベースクールダウン） ──
  // recentPresentations の直近3セッション相当を確認
  // alterSessionCount が少ない場合（< 3）はクールダウンなし
  if (input.recentPresentations.length >= 1 && input.alterSessionCount >= 3) {
    const presentationsInRecentWindow = input.recentPresentations.filter(
      d => (Date.now() - d.getTime()) < 72 * 60 * 60 * 1000 // 72h ≈ 3セッション相当
    ).length;
    if (presentationsInRecentWindow >= 1) {
      return {
        allowed: false,
        blockReason: `P5: 3セッション中1回制限 — 直近72h内に${presentationsInRecentWindow}件提示済み`,
        accuracy,
        suppressedTypes,
        failsafeActive: false,
      };
    }
  }

  return {
    allowed: true,
    blockReason: "",
    accuracy,
    suppressedTypes,
    failsafeActive: false,
  };
}

/**
 * P5 Fix 2: MI 断定表現の出力 lint（post-output validator）
 *
 * Micro Insight が提示された応答に対して、断定表現が残っていないかを検査する。
 * prompt 指示だけでなく、出力後の軽い regex lint で二重保証する。
 *
 * 検出時: 断定部分をソフト化して差し替え（LLM 再生成は不要）
 */
export function lintMIAssertions(
  response: string,
): { clean: string; violations: string[]; patched: boolean } {
  const violations: string[] = [];
  let patched = false;
  let clean = response;

  // MI 断定パターン: 「あなたは〜しています」「パターンが見えます」「〜と推定されます」
  const assertionReplacements: Array<{ pattern: RegExp; replacement: string; label: string }> = [
    // 「あなたは〇〇しています」→ 「〇〇しているように見えることがあるかもしれません」
    { pattern: /あなた[はが](.{2,30})(?:しています|している)/, replacement: "$1しているように見えることがあるかも", label: "行動断定" },
    // 「パターンが見えます」→ 「パターンがあるかもしれません」
    { pattern: /パターンが(?:見え|ある)(?:ます|る)/, replacement: "パターンがあるかもしれません", label: "メタ分析" },
    // 「〜と推定されます」「〜と考えられます」→ 「〜かもしれません」
    { pattern: /(.{2,20})と(?:推定|判断|分析|判定)(?:されます|される|できます)/, replacement: "$1かもしれません", label: "診断風" },
    // 「ストレス状態です」「疲れています」 → 「ストレスを感じているかもしれません」
    { pattern: /(?:ストレス|疲れ|不安|焦り)(?:状態)?(?:です|だ)(?:ね|よね)?/, replacement: "そういった感覚があるかもしれませんね", label: "状態断定" },
    // 「3つのシグナルから」「データから」 → 削除（分析根拠の暴露）
    { pattern: /(?:\d+つの)?(?:シグナル|データ|観測|記録)(?:から|を(?:見ると|分析すると))/, replacement: "", label: "分析暴露" },
  ];

  for (const { pattern, replacement, label } of assertionReplacements) {
    const match = clean.match(pattern);
    if (match) {
      violations.push(`${label}: "${match[0]}"`);
      clean = clean.replace(pattern, replacement);
      patched = true;
    }
  }

  return { clean, violations, patched };
}

/**
 * P5: ベースラインズレを Micro Insight の追加ソースとして変換する。
 * P3 で検出された deviation のうち、magnitude が高く、
 * 既存の MicroSignal として表現可能なものを変換。
 */
export function convertBaselineDeviationsToSignals(
  deviations: BaselineDeviation[],
): MicroSignal[] {
  const signals: MicroSignal[] = [];

  for (const dev of deviations) {
    if (dev.magnitude < 0.5) continue; // 弱いズレは MI に昇格させない

    let signalType: MicroSignalType;
    switch (dev.type) {
      case "emotional_spike":
        signalType = "energy_action_gap";
        break;
      case "decision_shift":
        signalType = "behavior_mismatch";
        break;
      case "category_unusual":
        signalType = "topic_absence"; // 普段のカテゴリが出ない → topic_absence の近似
        break;
      default:
        continue; // energy_unusual は MI に昇格しない
    }

    signals.push({
      type: signalType,
      observation: dev.description,
      related_topic: dev.domain ?? null,
      detected_at: new Date().toISOString(),
      strength: dev.magnitude,
    });
  }

  return signals;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wound Activation Engine — 心理的傷の動的活性度
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計思想:
// 心理的な傷（wound）は常に一定の脅威ではない。
// 特定の人物・テーマ・文脈に触れたとき「活性化」する。
// 活性化度を 0.0-1.0 で動的に測定し、
// 高い場合は MI 抑制・Route C 回避・prompt 慎重化を自動で行う。
//
// 活性化ソース:
// 1. 関連人物への言及（wound と紐づく人物が会話に登場）
// 2. 関連テーマの出現（wound のキーワードが会話に含まれる）
// 3. deny/ignore/avoidance パターン（傷に近い話題での回避行動）
// 4. 感情スパイク（通常より感情的な反応）
// 5. MI 反応（wound 周辺の MI が denied/ignored された）

/** 傷の定義 */
export interface WoundDefinition {
  /** 傷の識別子 */
  wound_id: string;
  /** 傷のテーマ（短い説明） */
  theme: string;
  /** 関連する人物ラベル（extractLifeContextSignals の label と一致） */
  related_persons: string[];
  /** 関連するキーワード（メッセージ内での検出用） */
  related_keywords: RegExp;
  /** 傷の深さ（structural > persistent > situational） */
  depth: Temporality;
  /** 情報源 */
  source: EpistemicSource;
  /** 確信度 */
  confidence: number;
  /** 最終確認日時 */
  last_confirmed: string;
}

/** 活性化ソースの種別 */
export type WoundActivationSource =
  | "person_mention"      // 関連人物への言及
  | "theme_match"         // 関連テーマの出現
  | "avoidance_pattern"   // deny/ignore/回避パターン
  | "emotional_spike"     // 通常より感情的な反応
  | "mi_rejection";       // wound 周辺 MI の拒否

/** 個別の活性化シグナル */
export interface WoundActivationSignal {
  source: WoundActivationSource;
  /** このシグナルの強度 (0.0-1.0) */
  intensity: number;
  /** 検出の根拠 */
  evidence: string;
}

/** 傷の活性化状態 */
export interface WoundActivation {
  /** 対象の傷 */
  wound_id: string;
  /** 傷のテーマ */
  theme: string;
  /** 総合活性化スコア (0.0-1.0) */
  activation_score: number;
  /** 活性化に寄与したシグナル */
  signals: WoundActivationSignal[];
  /** 活性化レベル */
  level: "dormant" | "low" | "moderate" | "high" | "acute";
  /** 推奨アクション */
  recommendations: WoundRecommendation;
}

/** 活性化レベルに応じた推奨アクション */
export interface WoundRecommendation {
  /** MI を抑制すべきか */
  suppress_mi: boolean;
  /** Route C で傷領域を回避すべきか */
  avoid_route_c: boolean;
  /** プロンプトに慎重化指示を入れるべきか */
  add_caution_prompt: boolean;
  /** ForceBalance の protect_pressure を加算すべき量 (0.0-0.3) */
  protect_pressure_boost: number;
  /** プロンプトに追加する注意文 */
  caution_text: string;
}

/** Wound activation 計算の入力データ */
export interface WoundActivationInput {
  /** 登録済みの傷定義（DB or analytics から取得） */
  wounds: WoundDefinition[];
  /** 現在のメッセージ */
  current_message: string;
  /** 直近の会話履歴（wound 検出用、最大10メッセージ） */
  recent_messages: string[];
  /** 直近の MI 反応（wound 周辺のもの） */
  recent_mi_reactions: Array<{ wound_related: boolean; reaction: InsightReaction }>;
  /** Trust Level */
  trust_level: TrustLevel;
  /** 現在の UserState */
  user_state: UserState | null;
}

/** Wound activation の全体結果 */
export interface WoundActivationResult {
  /** 全傷の活性化状態 */
  activations: WoundActivation[];
  /** 最も活性化している傷 */
  most_active: WoundActivation | null;
  /** 全体で MI を抑制すべきか */
  should_suppress_mi: boolean;
  /** 全体で Route C を回避すべきか */
  should_avoid_route_c: boolean;
  /** ForceBalance への protect_pressure 加算（最大値） */
  max_protect_boost: number;
  /** プロンプトに追加する全注意文 */
  caution_prompts: string[];
}

/**
 * メッセージから傷関連の感情スパイクを検出する。
 * 通常の感情表現より強い表現が使われている場合に高いスコアを返す。
 */
function detectEmotionalSpike(message: string): number {
  let score = 0;

  // 強い否定感情
  if (/無理[だ。！]|もう[いや嫌]|死に[たく]|消え[たく]|逃げ[たく]/.test(message)) score += 0.4;
  // 怒り・悲しみの爆発
  if (/ふざけ[るん]な|許[させ]ない|[！!]{2,}|泣[いき].*[たて]|涙/.test(message)) score += 0.3;
  // 繰り返しの嘆き
  if (/なんで.*なんで|どうして.*どうして|また.*また/.test(message)) score += 0.2;
  // 過去形の傷つき言及
  if (/裏切[らり]れ|見捨て[らり]れ|捨て[らり]れ|否定[さ]れ/.test(message)) score += 0.3;
  // 自己否定
  if (/自分[がはの].*[だめ駄目嫌]|私[がはの].*悪い|俺[がはの].*悪い/.test(message)) score += 0.25;

  return Math.min(score, 1.0);
}

/**
 * メッセージ中の回避パターンを検出する。
 * 話題を逸らす、答えを濁す、直接触れないなどの行動。
 */
function detectAvoidancePattern(
  currentMessage: string,
  recentMessages: string[],
): number {
  let score = 0;

  // 直接的な回避表現
  if (/その話[はを].*[やめ止]|もういい|別にいい|関係ない|[話聞]きたくない/.test(currentMessage)) {
    score += 0.5;
  }
  // 話題の急転換（前のメッセージの文脈から大きく外れる）
  if (/ところで|それより|まあいいや|話変わ[るっ]/.test(currentMessage)) {
    score += 0.2;
  }
  // 曖昧化
  if (/[わ分]かんない[けど]|覚えてない|忘れた|知らない/.test(currentMessage)) {
    score += 0.15;
  }
  // 極端に短い返答（直近が長文だったのに急に短くなった）
  if (recentMessages.length > 0) {
    const prevLength = recentMessages[recentMessages.length - 1]?.length ?? 0;
    if (prevLength > 100 && currentMessage.length < 15) {
      score += 0.15;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * 傷の活性化レベルを判定する。
 */
function classifyActivationLevel(score: number): WoundActivation["level"] {
  if (score < 0.1) return "dormant";
  if (score < 0.3) return "low";
  if (score < 0.5) return "moderate";
  if (score < 0.7) return "high";
  return "acute";
}

/**
 * 活性化レベルに応じた推奨アクションを生成する。
 */
function computeWoundRecommendation(
  activation: Pick<WoundActivation, "activation_score" | "level" | "theme">,
  trustLevel: TrustLevel,
): WoundRecommendation {
  const { activation_score, level, theme } = activation;

  // dormant / low: 何もしない
  if (level === "dormant" || level === "low") {
    return {
      suppress_mi: false,
      avoid_route_c: false,
      add_caution_prompt: false,
      protect_pressure_boost: 0,
      caution_text: "",
    };
  }

  // moderate: 軽い注意
  if (level === "moderate") {
    return {
      suppress_mi: false,
      avoid_route_c: trustLevel < 3,  // T3未満なら回避
      add_caution_prompt: true,
      protect_pressure_boost: 0.05,
      caution_text: `「${theme}」に関連する話題が出ています。踏み込みすぎず、ユーザーのペースに合わせてください。`,
    };
  }

  // high: 積極的に保護
  if (level === "high") {
    return {
      suppress_mi: true,
      avoid_route_c: true,
      add_caution_prompt: true,
      protect_pressure_boost: 0.15,
      caution_text: `⚠ 「${theme}」に関連する心理的な傷が活性化しています。この領域への深掘りは避け、ユーザーの安全を最優先してください。指摘・分析・仮説提示は禁止。`,
    };
  }

  // acute: 最大防御
  return {
    suppress_mi: true,
    avoid_route_c: true,
    add_caution_prompt: true,
    protect_pressure_boost: 0.3,
    caution_text: `🛑 「${theme}」に関連する強い感情的反応が検出されています。この領域には一切触れず、安定化を最優先してください。共感と受容のみ。分析・質問・仮説は全て禁止。`,
  };
}

/**
 * 単一の傷について活性化スコアを計算する。
 *
 * 5つの活性化ソースを加重平均:
 * - person_mention: 0.25 — 関連人物への言及
 * - theme_match: 0.30 — 関連テーマの出現（最も直接的）
 * - avoidance_pattern: 0.20 — 回避行動
 * - emotional_spike: 0.15 — 感情の爆発
 * - mi_rejection: 0.10 — MI拒否（間接的だが蓄積する）
 */
function computeSingleWoundActivation(
  wound: WoundDefinition,
  input: WoundActivationInput,
): WoundActivation {
  const signals: WoundActivationSignal[] = [];

  // ── 1. 関連人物への言及 ──
  const allText = [input.current_message, ...input.recent_messages].join(" ");
  for (const person of wound.related_persons) {
    if (allText.includes(person)) {
      signals.push({
        source: "person_mention",
        intensity: input.current_message.includes(person) ? 0.8 : 0.4,
        evidence: `「${person}」への言及を検出`,
      });
      break; // 1人物で十分
    }
  }

  // ── 2. 関連テーマの出現 ──
  if (wound.related_keywords.test(input.current_message)) {
    signals.push({
      source: "theme_match",
      intensity: 0.7,
      evidence: `現在のメッセージで関連テーマを検出`,
    });
  } else {
    // 直近メッセージでの出現は弱いシグナル
    const recentMatch = input.recent_messages.some(m => wound.related_keywords.test(m));
    if (recentMatch) {
      signals.push({
        source: "theme_match",
        intensity: 0.3,
        evidence: `直近の会話で関連テーマを検出`,
      });
    }
  }

  // ── 3. 回避パターン ──
  const avoidanceScore = detectAvoidancePattern(input.current_message, input.recent_messages);
  if (avoidanceScore > 0.1) {
    // 回避パターンがあり、かつ傷のテーマが直近で出ていた場合のみ
    const themeInRecent = input.recent_messages.some(m => wound.related_keywords.test(m));
    if (themeInRecent || wound.related_keywords.test(input.current_message)) {
      signals.push({
        source: "avoidance_pattern",
        intensity: avoidanceScore,
        evidence: `傷テーマ出現後の回避行動を検出 (score: ${avoidanceScore.toFixed(2)})`,
      });
    }
  }

  // ── 4. 感情スパイク ──
  const spikeScore = detectEmotionalSpike(input.current_message);
  if (spikeScore > 0.2) {
    // 傷のテーマが周辺にある場合のみ活性化ソースとしてカウント
    const themeNearby = wound.related_keywords.test(allText);
    if (themeNearby) {
      signals.push({
        source: "emotional_spike",
        intensity: spikeScore,
        evidence: `傷テーマ周辺での感情スパイクを検出 (score: ${spikeScore.toFixed(2)})`,
      });
    }
  }

  // ── 5. MI 拒否 ──
  const woundRelatedMI = input.recent_mi_reactions.filter(r => r.wound_related);
  if (woundRelatedMI.length > 0) {
    const rejectedCount = woundRelatedMI.filter(
      r => r.reaction === "denied" || r.reaction === "ignored"
    ).length;
    const rejectionRate = rejectedCount / woundRelatedMI.length;
    if (rejectionRate > 0.3) {
      signals.push({
        source: "mi_rejection",
        intensity: Math.min(rejectionRate, 0.8),
        evidence: `傷関連MIの拒否率: ${(rejectionRate * 100).toFixed(0)}% (${rejectedCount}/${woundRelatedMI.length})`,
      });
    }
  }

  // ── 加重平均で総合スコアを計算 ──
  const weights: Record<WoundActivationSource, number> = {
    person_mention: 0.25,
    theme_match: 0.30,
    avoidance_pattern: 0.20,
    emotional_spike: 0.15,
    mi_rejection: 0.10,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const signal of signals) {
    const w = weights[signal.source];
    weightedSum += signal.intensity * w;
    totalWeight += w;
  }

  // シグナルがない場合は 0.0（dormant）
  // totalWeight で割らない: シグナルがなければ低い = 安全側に倒す
  const rawScore = signals.length === 0 ? 0 : weightedSum;

  // 傷の深さによるブースト（structural な傷は活性化しやすい）
  const depthMultiplier =
    wound.depth === "structural" ? 1.3 :
    wound.depth === "persistent" ? 1.1 : 1.0;

  // 確信度による減衰（確信度が低い傷は控えめに）
  const confidenceMultiplier = 0.5 + wound.confidence * 0.5;

  const finalScore = Math.min(rawScore * depthMultiplier * confidenceMultiplier, 1.0);
  const level = classifyActivationLevel(finalScore);
  const recommendations = computeWoundRecommendation(
    { activation_score: finalScore, level, theme: wound.theme },
    input.trust_level,
  );

  return {
    wound_id: wound.wound_id,
    theme: wound.theme,
    activation_score: finalScore,
    signals,
    level,
    recommendations,
  };
}

/**
 * 全傷の活性化状態を一括計算する。
 *
 * route.ts から呼ばれ、結果は:
 * - MI 抑制判断
 * - Route C 回避判断
 * - ForceBalance の protect_pressure 加算
 * - プロンプトへの注意文追加
 * に使用される。
 */
export function computeWoundActivation(
  input: WoundActivationInput,
): WoundActivationResult {
  if (input.wounds.length === 0) {
    return {
      activations: [],
      most_active: null,
      should_suppress_mi: false,
      should_avoid_route_c: false,
      max_protect_boost: 0,
      caution_prompts: [],
    };
  }

  const activations = input.wounds.map(wound =>
    computeSingleWoundActivation(wound, input)
  );

  // 最も活性化している傷を特定
  const sorted = [...activations].sort((a, b) => b.activation_score - a.activation_score);
  const mostActive = sorted[0].activation_score > 0.1 ? sorted[0] : null;

  // 全傷の推奨を集約（OR 結合: 1つでも suppress なら全体で suppress）
  const shouldSuppressMI = activations.some(a => a.recommendations.suppress_mi);
  const shouldAvoidRouteC = activations.some(a => a.recommendations.avoid_route_c);
  const maxProtectBoost = Math.max(...activations.map(a => a.recommendations.protect_pressure_boost));
  const cautionPrompts = activations
    .filter(a => a.recommendations.add_caution_prompt)
    .map(a => a.recommendations.caution_text);

  return {
    activations,
    most_active: mostActive,
    should_suppress_mi: shouldSuppressMI,
    should_avoid_route_c: shouldAvoidRouteC,
    max_protect_boost: maxProtectBoost,
    caution_prompts: cautionPrompts,
  };
}

/**
 * メッセージから傷の定義を自動抽出する補助関数。
 * DB に傷が未登録の場合、会話テキストからヒューリスティックに検出する。
 * 検出された傷は confidence が低い状態で返される。
 */
export function detectPotentialWounds(
  messages: string[],
): WoundDefinition[] {
  const wounds: WoundDefinition[] = [];
  const now = new Date().toISOString();
  const allText = messages.join(" ");

  // 裏切り・見捨てられ系
  if (/裏切[らり]|見捨て|捨て[らり]れ|信[じ用].*でき.*ない|信頼.*でき.*ない/.test(allText)) {
    wounds.push({
      wound_id: "auto_betrayal",
      theme: "裏切り・信頼の喪失",
      related_persons: [],
      related_keywords: /裏切[らり]|見捨て|捨て[らり]れ|信[じ用].*でき.*ない|信頼.*でき.*ない/,
      depth: "persistent",
      source: "user_implied",
      confidence: 0.3,
      last_confirmed: now,
    });
  }

  // 否定・承認系
  if (/認めて[もく]れ|認められ[たな]|否定[さ]れ|存在.*否定|自分.*[いら要]ない/.test(allText)) {
    wounds.push({
      wound_id: "auto_rejection",
      theme: "承認の欠如・存在否定",
      related_persons: [],
      related_keywords: /認めて[もく]れ|認められ[たな]|否定[さ]れ|存在.*否定|自分.*[いら要]ない/,
      depth: "structural",
      source: "user_implied",
      confidence: 0.25,
      last_confirmed: now,
    });
  }

  // 喪失・別離系
  if (/亡くな[った]|死[んに].*[だで]|離婚|別[れり].*[たて]|いなくな[った]/.test(allText)) {
    wounds.push({
      wound_id: "auto_loss",
      theme: "喪失・別離",
      related_persons: [],
      related_keywords: /亡くな[った]|死[んに].*[だで]|離婚|別[れり].*[たて]|いなくな[った]/,
      depth: "persistent",
      source: "user_implied",
      confidence: 0.3,
      last_confirmed: now,
    });
  }

  // 支配・コントロール系
  if (/支配|コントロール|束縛|自由.*ない|逃げ[らり]れ[なず]|逆らえ[なず]/.test(allText)) {
    wounds.push({
      wound_id: "auto_control",
      theme: "支配・自由の剥奪",
      related_persons: [],
      related_keywords: /支配|コントロール|束縛|自由.*ない|逃げ[らり]れ[なず]|逆らえ[なず]/,
      depth: "persistent",
      source: "user_implied",
      confidence: 0.25,
      last_confirmed: now,
    });
  }

  // 比較・劣等感系
  if (/比[べら]れ|劣等感|[兄姉弟妹].*[と比]|できない[子奴人]|どうせ.*[だし]/.test(allText)) {
    wounds.push({
      wound_id: "auto_comparison",
      theme: "比較・劣等感",
      related_persons: [],
      related_keywords: /比[べら]れ|劣等感|[兄姉弟妹].*[と比]|できない[子奴人]|どうせ.*[だし]/,
      depth: "persistent",
      source: "user_implied",
      confidence: 0.25,
      last_confirmed: now,
    });
  }

  return wounds;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Financial Pressure — 経済的制約の検出と判断への反映
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計思想:
// ユーザーが経済的に厳しい状況にあるとき、
// 金銭的コストが高い選択肢を積極的に推すのは有害。
// 経済的プレッシャーを 0.0-1.0 で測定し、
// ForceBalance の cost_load を引き上げ、
// 「お金がかかる行動」への提案を抑制する。
//
// 安全原則:
// - 経済状況の「指摘」は絶対にしない（プロンプト注入のみ）
// - crisis レベルでは高コスト選択肢を自動で抑制

/** 経済的プレッシャーのレベル */
export type FinancialPressureLevel = "none" | "mild" | "moderate" | "severe" | "crisis";

/** 経済的プレッシャーの検出結果 */
export interface FinancialPressure {
  /** プレッシャースコア (0.0-1.0) */
  score: number;
  /** レベル */
  level: FinancialPressureLevel;
  /** 検出の根拠 */
  signals: string[];
  /** ForceBalance の cost_load への加算量 */
  cost_load_boost: number;
  /** プロンプトに追加する注意文（空ならなし） */
  prompt_hint: string;
}

/** Financial pressure 計算の入力 */
export interface FinancialPressureInput {
  /** 現在のメッセージ */
  current_message: string;
  /** 直近の会話でのユーザーメッセージ */
  recent_user_messages: string[];
  /** Life Context から検出済みの経済シグナル */
  life_context_economic_signals: Array<Partial<UnderstandingUnit>>;
  /** DB に蓄積された過去の経済シグナル数 */
  historical_economic_signal_count: number;
}

/**
 * 経済的プレッシャーのレベルを判定する。
 */
function classifyFinancialPressureLevel(score: number): FinancialPressureLevel {
  if (score < 0.1) return "none";
  if (score < 0.3) return "mild";
  if (score < 0.5) return "moderate";
  if (score < 0.7) return "severe";
  return "crisis";
}

/**
 * メッセージから経済的プレッシャーの直接的シグナルを検出する。
 */
function detectFinancialSignals(message: string): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // 危機的シグナル（高重み）
  if (/借金|返済|督促|取[りら]立て|破産|自己破産|債務|滞納/.test(message)) {
    score += 0.5;
    signals.push("債務・借金への言及");
  }
  if (/生活[がも].*[苦厳でき]|生活費.*[ないし足]|食[べえ].*[ない行けず]/.test(message)) {
    score += 0.4;
    signals.push("生活困窮への言及");
  }

  // 明確なシグナル（中重み）
  if (/お金[がのを].*ない|金[がのを].*ない|金欠|ピンチ|懐.*寂/.test(message)) {
    score += 0.3;
    signals.push("金銭不足への言及");
  }
  if (/ローン|支払[いえ].*[重き辛つ]|カード.*止|引き落とし.*でき/.test(message)) {
    score += 0.3;
    signals.push("支払い負担への言及");
  }
  if (/節約|切り詰め|我慢.*[してる].*お金|贅沢.*でき/.test(message)) {
    score += 0.2;
    signals.push("節約・我慢への言及");
  }

  // 間接的シグナル（低重み）
  if (/給料.*[安低少]|昇給.*ない|ボーナス.*な[いし]|収入.*減/.test(message)) {
    score += 0.15;
    signals.push("収入に関する懸念");
  }
  if (/高[いく].*[から悩迷買え]|値段|価格.*気|コスト.*気|出費/.test(message)) {
    score += 0.1;
    signals.push("コストへの敏感さ");
  }

  return { score: Math.min(score, 1.0), signals };
}

/**
 * 経済的プレッシャーを計算する。
 *
 * シグナルソース:
 * 1. 現在のメッセージからの直接検出
 * 2. 直近の会話テキストからの蓄積検出
 * 3. Life Context の経済シグナル（extractLifeContextSignals の environment/wound）
 * 4. 過去の経済シグナルの蓄積数（DB）
 */
export function computeFinancialPressure(
  input: FinancialPressureInput,
): FinancialPressure {
  let totalScore = 0;
  const allSignals: string[] = [];

  // 1. 現在のメッセージ
  const currentDetection = detectFinancialSignals(input.current_message);
  totalScore += currentDetection.score * 0.5; // 直近のメッセージの重み: 50%
  allSignals.push(...currentDetection.signals);

  // 2. 直近の会話テキスト
  let recentScore = 0;
  for (const msg of input.recent_user_messages) {
    const detection = detectFinancialSignals(msg);
    recentScore += detection.score;
  }
  if (input.recent_user_messages.length > 0) {
    recentScore /= input.recent_user_messages.length;
  }
  totalScore += recentScore * 0.25; // 直近の会話の重み: 25%
  if (recentScore > 0.1) {
    allSignals.push(`直近の会話で経済シグナル検出 (avg: ${recentScore.toFixed(2)})`);
  }

  // 3. Life Context の経済シグナル
  const economicContextCount = input.life_context_economic_signals.filter(
    s => s.category === "environment" && s.content?.includes("経済")
  ).length;
  if (economicContextCount > 0) {
    totalScore += Math.min(economicContextCount * 0.1, 0.2); // Life Context の重み: 最大 20%
    allSignals.push(`Life Contextに経済シグナル ${economicContextCount} 件`);
  }

  // 4. 過去の蓄積
  if (input.historical_economic_signal_count >= 3) {
    totalScore += 0.1;
    allSignals.push(`過去に経済シグナルが ${input.historical_economic_signal_count} 回蓄積`);
  }

  totalScore = Math.min(totalScore, 1.0);
  const level = classifyFinancialPressureLevel(totalScore);

  // cost_load ブースト量の計算
  let costLoadBoost = 0;
  let promptHint = "";

  if (level === "mild") {
    costLoadBoost = 0.05;
    // mild: プロンプトへの注入は不要
  } else if (level === "moderate") {
    costLoadBoost = 0.10;
    promptHint = "相手は経済的な余裕がやや限られている可能性がある。金銭的コストが高い選択肢を提案する場合は、低コストの代替案も必ず添えること。経済状況には一切言及しないこと。";
  } else if (level === "severe") {
    costLoadBoost = 0.20;
    promptHint = "相手は経済的に厳しい状況にある可能性が高い。高コストの提案は避け、低コスト・無料の選択肢を優先すること。「お金がないなら」等の直接的言及は絶対禁止。自然に低コスト案を提示すること。";
  } else if (level === "crisis") {
    costLoadBoost = 0.35;
    promptHint = "🛑 経済的危機の兆候あり。金銭が必要な行動は一切提案しないこと。無料・自力でできる選択肢のみ。経済状況への言及は絶対禁止。相手の尊厳を最優先すること。";
  }

  return {
    score: totalScore,
    level,
    signals: allSignals,
    cost_load_boost: costLoadBoost,
    prompt_hint: promptHint,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1 Context Modifiers — ドメイン別軸スコア調整
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計思想:
// 性格軸のスコアは「全般的な傾向」だが、実際の判断は文脈に依存する。
// 例: 大胆さ（boldness）が base 0.35 でも、仕事では +0.15（リスクを取る）、
//     恋愛では -0.10（慎重になる）というドメイン差がある。
//
// これを「推論」するのではなく、行動パターンの「観測」から学習する。
// 蓄積データ:
//   - ドメイン別の判断結果（go/wait/noの分布差）
//   - ドメイン別の MI 反応差
//   - ドメイン別の感情表現パターン差
//
// 出力: 修正後の axisScores（特定ドメインにおける実効スコア）

/** ドメイン名（Layer 1 context modifier 用） */
export type ContextDomain = "work" | "romance" | "friend" | "family" | "self";

/** 軸のドメイン別修正値 */
export interface AxisContextModifier {
  /** 軸ID */
  axis_id: string;
  /** ドメイン別のオフセット値（-0.3 〜 +0.3） */
  domain_offsets: Partial<Record<ContextDomain, number>>;
  /** オフセットの根拠 */
  evidence: Partial<Record<ContextDomain, AxisModifierEvidence>>;
}

/** 修正値の根拠 */
export interface AxisModifierEvidence {
  /** 観測回数 */
  observation_count: number;
  /** 確信度 (0.0-1.0) */
  confidence: number;
  /** 推定方法 */
  source: "behavioral_pattern" | "mi_reaction" | "decision_distribution" | "explicit_statement";
  /** 最終更新日時 */
  last_updated: string;
}

/** ドメイン別修正済みの軸スコア */
export interface ContextualizedAxisScores {
  /** ドメイン */
  domain: ContextDomain;
  /** 修正済みスコア（元のスコアとの差分が反映済み） */
  scores: Record<string, number>;
  /** 修正が適用された軸のリスト */
  modified_axes: string[];
}

/** Context modifier 計算の入力 */
export interface ContextModifierInput {
  /** ベースの軸スコア */
  base_axis_scores: Partial<Record<string, number>>;
  /** 対象ドメイン */
  domain: ContextDomain;
  /** DB に蓄積されたドメイン別修正値 */
  stored_modifiers: AxisContextModifier[];
  /** ドメイン別の判断分布（ActionShape 分布） */
  domain_decision_distribution: {
    go_ratio: number;
    wait_ratio: number;
    no_ratio: number;
    total_observations: number;
  } | null;
  /** 全体の判断分布 */
  global_decision_distribution: {
    go_ratio: number;
    wait_ratio: number;
    no_ratio: number;
    total_observations: number;
  } | null;
}

/**
 * ドメイン別の判断分布差から軸の修正値を推定する。
 *
 * ロジック:
 * - あるドメインで go 率が全体より高い → 関連軸を「積極寄り」に補正
 * - あるドメインで no 率が全体より高い → 関連軸を「慎重寄り」に補正
 * - 差が小さい場合は無視（noise）
 *
 * 軸への影響マッピング:
 * - go/wait バランス → decision_tempo, impulse_vs_caution, locus_of_control
 * - 感情パターン差 → emotional_regulation, emotional_variability
 * - 対人パターン差 → social_initiative, direct_vs_diplomatic, boundary_awareness
 */
const DECISION_BEHAVIOR_AXIS_MAP: Record<string, { go_positive: boolean }> = {
  decision_tempo: { go_positive: true },        // go多い → 判断が速い
  impulse_vs_caution: { go_positive: true },     // go多い → 衝動寄り
  locus_of_control: { go_positive: true },       // go多い → 内的統制
  social_initiative: { go_positive: true },      // go多い → 社会的主導性
  exploration_closure: { go_positive: true },    // go多い → 探索寄り
};

/**
 * ドメイン別の判断分布差異から、軸のオフセットを推定する。
 * 最小観測数: 5回。差分: ±15%以上で有意とみなす。
 */
function estimateOffsetFromDecisionDist(
  domainDist: { go_ratio: number; wait_ratio: number; no_ratio: number; total_observations: number },
  globalDist: { go_ratio: number; wait_ratio: number; no_ratio: number; total_observations: number },
): Partial<Record<string, number>> {
  if (domainDist.total_observations < 5 || globalDist.total_observations < 5) return {};

  const goDiff = domainDist.go_ratio - globalDist.go_ratio;
  const offsets: Record<string, number> = {};

  // 差が小さすぎる場合は無視
  if (Math.abs(goDiff) < 0.15) return {};

  // 差の大きさに応じてオフセットを計算（最大 ±0.15）
  const rawOffset = Math.max(-0.15, Math.min(0.15, goDiff * 0.5));

  for (const [axisId, config] of Object.entries(DECISION_BEHAVIOR_AXIS_MAP)) {
    offsets[axisId] = config.go_positive ? rawOffset : -rawOffset;
  }

  return offsets;
}

/**
 * ベースの軸スコアにドメイン別の修正を適用して、文脈化されたスコアを返す。
 *
 * 修正の優先順位:
 * 1. DB に蓄積された明示的なモディファイア（最も信頼）
 * 2. 判断分布差異からの自動推定（中程度の信頼）
 * 3. なければベースのまま
 *
 * 安全制約:
 * - 修正後のスコアは 0.0-1.0 にクランプ
 * - 確信度が低い（< 0.3）修正は適用しない
 * - 観測数が少ない（< 3）修正は適用しない
 */
export function applyContextModifiers(
  input: ContextModifierInput,
): ContextualizedAxisScores {
  const result: Record<string, number> = {};
  const modifiedAxes: string[] = [];

  // ベースをコピー
  for (const [axisId, score] of Object.entries(input.base_axis_scores)) {
    if (score !== undefined && score !== null) {
      result[axisId] = score;
    }
  }

  // 1. DB 蓄積モディファイアを適用
  for (const modifier of input.stored_modifiers) {
    const offset = modifier.domain_offsets[input.domain];
    const evidence = modifier.evidence[input.domain];
    if (offset === undefined || !evidence) continue;

    // 安全制約: 確信度 + 観測数チェック
    if (evidence.confidence < 0.3 || evidence.observation_count < 3) continue;

    const baseScore = result[modifier.axis_id];
    if (baseScore === undefined) continue;

    result[modifier.axis_id] = Math.max(0, Math.min(1, baseScore + offset));
    modifiedAxes.push(modifier.axis_id);
  }

  // 2. 判断分布差異からの自動推定
  if (input.domain_decision_distribution && input.global_decision_distribution) {
    const autoOffsets = estimateOffsetFromDecisionDist(
      input.domain_decision_distribution,
      input.global_decision_distribution,
    );

    for (const [axisId, offset] of Object.entries(autoOffsets)) {
      if (offset === undefined) continue;
      // 既に DB モディファイアで修正済みの軸はスキップ
      if (modifiedAxes.includes(axisId)) continue;

      const baseScore = result[axisId];
      if (baseScore === undefined) continue;

      result[axisId] = Math.max(0, Math.min(1, baseScore + offset));
      modifiedAxes.push(axisId);
    }
  }

  return {
    domain: input.domain,
    scores: result,
    modified_axes: modifiedAxes,
  };
}

/**
 * ドメイン別の判断結果から AxisContextModifier を学習・更新する。
 *
 * 呼び出しタイミング: 判断完了後（analytics 保存時）
 * 蓄積先: stargazer_analytics の "axis_context_modifier" イベント
 */
export function updateContextModifier(
  existingModifier: AxisContextModifier | null,
  axisId: string,
  domain: ContextDomain,
  observedOffset: number,
): AxisContextModifier {
  const now = new Date().toISOString();
  const existing = existingModifier ?? {
    axis_id: axisId,
    domain_offsets: {},
    evidence: {},
  };

  const prevOffset = existing.domain_offsets[domain] ?? 0;
  const prevEvidence = existing.evidence[domain] ?? {
    observation_count: 0,
    confidence: 0,
    source: "decision_distribution" as const,
    last_updated: now,
  };

  // 指数移動平均でオフセットを更新（新しい観測ほど重い）
  const alpha = 0.3; // 学習率
  const newOffset = prevOffset * (1 - alpha) + observedOffset * alpha;

  // 確信度は観測数に基づいて増加（飽和曲線）
  const newObsCount = prevEvidence.observation_count + 1;
  const newConfidence = Math.min(0.9, 1 - 1 / (1 + newObsCount * 0.2));

  return {
    ...existing,
    domain_offsets: {
      ...existing.domain_offsets,
      [domain]: Math.max(-0.3, Math.min(0.3, newOffset)),
    },
    evidence: {
      ...existing.evidence,
      [domain]: {
        observation_count: newObsCount,
        confidence: newConfidence,
        source: prevEvidence.source,
        last_updated: now,
      },
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent Pool — 質問生成の意図プール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計思想:
// 「何を聞くか」（意図）と「どう聞くか」（表現）を分離する。
// 意図は設計者が50-80カテゴリを事前定義。
// LLM は選ばれた意図を自然な質問文に変換するだけ。
// これにより:
//   - clarify の質が安定する（毎回ぶれない）
//   - Route C の構造的補完が体系的になる
//   - 安全フィルタが事前に効く（聞いていいかどうかを意図レベルで判断）
//   - 同じ意図の繰り返しを防げる（cooldown）

/** 意図が属する理解レイヤー */
export type IntentLayer =
  | "trait"          // Layer 1: 性格・判断傾向
  | "state"          // Layer 2: 今の状態
  | "life_context"   // Layer 3: 人間関係・環境・生活
  | "narrative"      // Layer 4: 歴史・反復・傷
  | "cross_context"  // Layer 5: 領域横断パターン
  | "decision";      // Layer 6: 判断に必要な文脈

/** 意図のドメイン適合性 */
export type IntentDomain =
  | "work" | "romance" | "family" | "friendship"
  | "health" | "finance" | "life_transition" | "identity"
  | "universal";  // 全ドメインで有効

/** 意図の使用経路 */
export type IntentRoute =
  | "clarify"       // Mode C: 判断のために聞く
  | "route_c"       // 経路C: 構造的補完（任意の自然な一言）
  | "both";         // 両方で使用可能

/** 質問の形式タイプ */
export type QuestionForm =
  | "choice"        // 選択肢型:「仕事？ それともプライベート？」
  | "permission"    // 許可型:「もう少し聞いてもいい？」
  | "hypothesis"    // 軽い仮説型:「体力じゃなくて、気持ちの問題？」
  | "casual"        // さりげない確認:「そういえば、〇〇は？」
  | "open_light";   // 軽いオープン:「どんな感じ？」

/**
 * 意図の定義。1つの意図 = 1つの「何を知りたいか」。
 * LLM はこの意図を受け取り、文脈に合った自然な質問文を生成する。
 */
export interface QuestionIntent {
  /** 意図の一意ID */
  id: string;
  /** 意図の名前（内部参照用・日本語） */
  name: string;
  /** どのレイヤーの理解を深めるか */
  layer: IntentLayer;
  /** どのドメインで有効か */
  domains: IntentDomain[];
  /** 使用経路 */
  route: IntentRoute;
  /** 必要な最低 Trust Level */
  required_trust: TrustLevel;
  /** 優先度 (0.0-1.0): 判断品質への影響度 */
  base_priority: number;
  /** この意図を使った後の再使用禁止期間（時間） */
  cooldown_hours: number;
  /** 推奨される質問の形式 */
  preferred_forms: QuestionForm[];
  /** LLM に渡す「聞きたいことの説明」 */
  intent_description: string;
  /** 質問例（LLM がトーンを掴むためのサンプル） */
  example_questions: string[];
  /** この意図が有効になる条件（Life Context 上の欠落） */
  activation_condition: IntentActivationCondition;
}

/** 意図が有効になる条件 */
export interface IntentActivationCondition {
  /** メッセージに含まれるべきキーワード（いずれか） */
  message_triggers?: RegExp;
  /** Life Context に特定カテゴリが存在しないこと */
  requires_missing_category?: UnderstandingCategory;
  /** Life Context に特定の content が存在しないこと */
  requires_missing_content?: string[];
  /** 常に有効（判断文脈があれば） */
  always_active?: boolean;
}

// ── Intent Pool: 全意図定義 ──
// 設計書の指示: 最低50個。Layer 3（Life Context）を最も厚く。
// Layer 6（Decision）は clarify 専用で最も直接的。

export const INTENT_POOL: QuestionIntent[] = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 6: Decision — 判断に直接必要な文脈
  // clarify 専用。情報が足りないときに聞く。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "d01_target_person",
    name: "相手の特定",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.95,
    cooldown_hours: 0,  // 毎回聞いてよい（相談ごとに異なるため）
    preferred_forms: ["choice"],
    intent_description: "判断の相手が誰なのかを特定する。相手によって結論が大きく変わる場合に必須。",
    example_questions: [
      "それって、仕事の相手？ それともプライベート？",
      "その人は上司？ 同僚？ それとも友達？",
    ],
    activation_condition: {
      message_triggers: /[がにはをと].*[言話聞思怒泣笑]|誰.*[かに]|相手|相談/,
    },
  },
  {
    id: "d02_interaction_purpose",
    name: "関わりの目的",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.9,
    cooldown_hours: 0,
    preferred_forms: ["choice", "hypothesis"],
    intent_description: "相手に対して何をしたいのか（謝る・距離を置く・深める等）を明らかにする。",
    example_questions: [
      "その人に対して、距離を置きたい？ それとも関係を良くしたい？",
      "伝えたいことがある感じ？ それとも距離を取りたい？",
    ],
    activation_condition: {
      message_triggers: /どうし[たよ]|迷[っいう]|[言伝].*[たいう]|対[応処]|関係/,
    },
  },
  {
    id: "d03_decision_urgency",
    name: "判断の緊急度",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.85,
    cooldown_hours: 2,
    preferred_forms: ["choice"],
    intent_description: "今すぐ決める必要があるか、考える時間があるかを確認する。",
    example_questions: [
      "これ、今日中に決めないといけない感じ？",
      "すぐ返事しないといけない？ それともまだ時間ある？",
    ],
    activation_condition: {
      message_triggers: /どうし[たよ]|決め[なるたら]|返[事答]|期限|締[切め]|急[いぎ]/,
    },
  },
  {
    id: "d04_reversibility",
    name: "判断の可逆性",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.8,
    cooldown_hours: 2,
    preferred_forms: ["hypothesis"],
    intent_description: "その判断がやり直せるものか、一度きりかを確認する。",
    example_questions: [
      "これって、やってみてダメなら戻せる？",
      "一回やったら取り消せない感じ？",
    ],
    activation_condition: {
      message_triggers: /辞め|別れ|告白|引っ越|退職|転職|契約|結婚/,
    },
  },
  {
    id: "d05_what_holds_back",
    name: "引っかかりの特定",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.88,
    cooldown_hours: 1,
    preferred_forms: ["hypothesis", "choice"],
    intent_description: "判断を迷わせている本当の原因（体力？気持ち？環境？人？）を聞く。",
    example_questions: [
      "止まってるのって、体力の問題？ それとも気持ちの問題？",
      "引っかかってるのはどこ？ リスク？ それとも誰かの反応？",
    ],
    activation_condition: {
      message_triggers: /迷[っいう]|でき[なるたら].*けど|[やし]たい.*けど|踏[みめ].*出[せさ]/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: Life Context — 人間関係
  // 最も厚いカテゴリ。会話から自然に蓄積する。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "lc01_relationship_quality",
    name: "関係性の質の確認",
    layer: "life_context",
    domains: ["universal"],
    route: "both",
    required_trust: 1,
    base_priority: 0.7,
    cooldown_hours: 48,
    preferred_forms: ["casual", "open_light"],
    intent_description: "言及された人物との関係が温かいか、緊張しているか、複雑かを把握する。",
    example_questions: [
      "その人とは仲いいほう？",
      "その人の前だと素でいられる感じ？",
    ],
    activation_condition: {
      message_triggers: /[母父兄姉弟妹]|彼[女氏]|上司|先輩|後輩|同僚|友[達人]|親友/,
      requires_missing_category: "person",
    },
  },
  {
    id: "lc02_parent_tension",
    name: "親との緊張の確認",
    layer: "life_context",
    domains: ["family"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.5,
    cooldown_hours: 168,  // 1週間
    preferred_forms: ["casual", "hypothesis"],
    intent_description: "親との関係に緊張や複雑さがないかを確認する。多くの判断の隠れた制約になる。",
    example_questions: [
      "お母さんとはどんな感じ？",
      "親のこと、気にかけてる感じがするけど、関係は悪くない？",
    ],
    activation_condition: {
      message_triggers: /[母父親]|実家|帰[省っ]|家族|育[っち]|子供の頃/,
      requires_missing_content: ["母", "父"],
    },
  },
  {
    id: "lc03_partner_status",
    name: "パートナーの有無",
    layer: "life_context",
    domains: ["romance"],
    route: "both",
    required_trust: 1,
    base_priority: 0.6,
    cooldown_hours: 168,
    preferred_forms: ["casual"],
    intent_description: "恋人やパートナーがいるかどうか。恋愛相談の基本前提。",
    example_questions: [
      "今、付き合ってる人はいるの？",
      "ちなみに今はフリー？",
    ],
    activation_condition: {
      message_triggers: /好き|恋|デート|告白|付き合|出会|モテ|恋愛/,
      requires_missing_content: ["彼女", "彼氏", "恋人", "パートナー"],
    },
  },
  {
    id: "lc04_close_people",
    name: "身近な人の把握",
    layer: "life_context",
    domains: ["universal"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.45,
    cooldown_hours: 168,
    preferred_forms: ["open_light", "casual"],
    intent_description: "一番身近な人が誰かを把握する。判断の相談相手や支えの有無を知る。",
    example_questions: [
      "困ったとき、最初に相談するのって誰？",
      "一番近くにいる人って、誰になるの？",
    ],
    activation_condition: {
      requires_missing_category: "person",
    },
  },
  {
    id: "lc05_boss_relationship",
    name: "上司との関係",
    layer: "life_context",
    domains: ["work"],
    route: "both",
    required_trust: 1,
    base_priority: 0.6,
    cooldown_hours: 72,
    preferred_forms: ["casual", "hypothesis"],
    intent_description: "上司との関係性を把握する。仕事の判断の多くは上司の存在に影響される。",
    example_questions: [
      "上司とはうまくやれてる？",
      "上司の前だと言いたいこと言える感じ？",
    ],
    activation_condition: {
      message_triggers: /上司|部長|課長|マネージャー|ボス|職場.*[人嫌辛合]/,
      requires_missing_content: ["上司"],
    },
  },
  {
    id: "lc06_friend_depth",
    name: "友人関係の深さ",
    layer: "life_context",
    domains: ["friendship"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 168,
    preferred_forms: ["casual", "hypothesis"],
    intent_description: "友人関係が浅く広いか、深く狭いかを把握する。孤立リスクや支援ネットワークの判断材料。",
    example_questions: [
      "本音で話せる友達って、多いほう？",
      "友達は広く浅く？ それとも少数精鋭？",
    ],
    activation_condition: {
      message_triggers: /友[達人]|遊[びぶ]|[孤寂]|一人|仲間/,
    },
  },
  {
    id: "lc07_ex_impact",
    name: "元恋人の影響",
    layer: "life_context",
    domains: ["romance"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,  // 2週間
    preferred_forms: ["hypothesis"],
    intent_description: "過去の恋愛経験が現在の恋愛判断に影響しているかを確認する。",
    example_questions: [
      "前の恋愛で引きずってること、まだある？",
    ],
    activation_condition: {
      message_triggers: /元カノ|元カレ|元彼|元彼女|前[のに].*付き合|別れ.*引きずり?/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: Life Context — 環境・経済
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "lc10_financial_pressure",
    name: "経済的制約の確認",
    layer: "life_context",
    domains: ["finance", "life_transition", "universal"],
    route: "both",
    required_trust: 1,
    base_priority: 0.65,
    cooldown_hours: 168,
    preferred_forms: ["permission", "choice"],
    intent_description: "経済的な余裕の有無を確認する。多くの判断の隠れた制約。",
    example_questions: [
      "ちょっと聞いていい？ お金の面での余裕ってどんな感じ？",
      "金銭的にはゆとりある？ それともカツカツ？",
    ],
    activation_condition: {
      message_triggers: /転職|引っ越|買[いう]|始め|投資|独立|フリーランス|起業|貯金|家賃/,
      requires_missing_content: ["経済的"],
    },
  },
  {
    id: "lc11_work_load",
    name: "仕事の負荷確認",
    layer: "life_context",
    domains: ["work"],
    route: "both",
    required_trust: 1,
    base_priority: 0.6,
    cooldown_hours: 72,
    preferred_forms: ["casual", "choice"],
    intent_description: "仕事の忙しさ・負荷を把握する。時間や余力の制約として判断に影響する。",
    example_questions: [
      "最近、仕事はどのくらい忙しい？",
      "仕事の負荷、今はキツめ？ それとも落ち着いてる？",
    ],
    activation_condition: {
      message_triggers: /仕事|職場|残業|休[みめ]|忙|疲|プロジェクト|納期/,
    },
  },
  {
    id: "lc12_work_style",
    name: "働き方の確認",
    layer: "life_context",
    domains: ["work"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.5,
    cooldown_hours: 168,
    preferred_forms: ["casual", "choice"],
    intent_description: "会社員、フリーランス、パートなど働き方を確認する。制約条件に影響。",
    example_questions: [
      "ちなみに、普段はどんな働き方をしてるの？",
      "会社勤め？ それともフリー？",
    ],
    activation_condition: {
      message_triggers: /仕事|職場|会社|上司|同僚|転職/,
      requires_missing_content: ["会社員", "フリーランス", "学生", "パート"],
    },
  },
  {
    id: "lc13_living_situation",
    name: "居住環境の確認",
    layer: "life_context",
    domains: ["universal"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["casual"],
    intent_description: "一人暮らしか実家暮らしかを確認する。生活の自由度に直結する。",
    example_questions: [
      "ちなみに、今は一人暮らし？",
      "実家？ それとも一人？",
    ],
    activation_condition: {
      message_triggers: /家[にで]|帰[りっ]|引っ越|生活|家賃|料理|洗濯/,
      requires_missing_content: ["一人暮らし", "実家"],
    },
  },
  {
    id: "lc14_commute_time",
    name: "通勤時間の確認",
    layer: "life_context",
    domains: ["work"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.25,
    cooldown_hours: 336,
    preferred_forms: ["casual"],
    intent_description: "通勤時間を把握する。生活の余力に影響する隠れた制約。",
    example_questions: [
      "通勤って、どのくらいかかる？",
    ],
    activation_condition: {
      message_triggers: /通勤|電車|満員|朝[がは].*[辛きつ]|帰[りっ].*遅/,
    },
  },
  {
    id: "lc15_health_constraint",
    name: "健康上の制約確認",
    layer: "life_context",
    domains: ["health", "universal"],
    route: "both",
    required_trust: 2,
    base_priority: 0.55,
    cooldown_hours: 168,
    preferred_forms: ["permission", "hypothesis"],
    intent_description: "慢性的な健康問題や身体的制約がないかを確認する。行動の選択肢に影響する。",
    example_questions: [
      "体調面で、ずっと気になってることってある？",
      "体力的にキツいこと、慢性的にある？",
    ],
    activation_condition: {
      message_triggers: /体調|病[院気]|薬|頭痛|腰|[不眠]眠|疲[れれ]|通院|持病/,
    },
  },
  {
    id: "lc16_sleep_pattern",
    name: "睡眠パターンの確認",
    layer: "life_context",
    domains: ["health"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.3,
    cooldown_hours: 168,
    preferred_forms: ["casual"],
    intent_description: "睡眠の質を把握する。判断力と感情状態の土台。",
    example_questions: [
      "最近ちゃんと寝れてる？",
    ],
    activation_condition: {
      message_triggers: /眠[いれ]|寝[れら]|不眠|夜更かし|朝.*起き|疲[れれ]/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: Life Context — ライフステージ
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "lc20_life_transition",
    name: "人生の転機の確認",
    layer: "life_context",
    domains: ["life_transition"],
    route: "both",
    required_trust: 1,
    base_priority: 0.7,
    cooldown_hours: 168,
    preferred_forms: ["hypothesis", "casual"],
    intent_description: "転職、引越し、結婚、卒業など人生の転機にいるかを確認する。",
    example_questions: [
      "今って、何か大きく変わりそうなタイミング？",
      "生活の中で、今一番動いてることって何？",
    ],
    activation_condition: {
      message_triggers: /変[わえ]|転[職機]|引っ越|新し|始め|辞め|卒業|入[学社]/,
    },
  },
  {
    id: "lc21_career_satisfaction",
    name: "仕事の満足度",
    layer: "life_context",
    domains: ["work"],
    route: "both",
    required_trust: 1,
    base_priority: 0.55,
    cooldown_hours: 168,
    preferred_forms: ["hypothesis", "choice"],
    intent_description: "仕事に満足しているか、不満があるかを確認する。転職判断の前提。",
    example_questions: [
      "今の仕事、ぶっちゃけどう？",
      "仕事自体は好き？ それとも環境が合わない？",
    ],
    activation_condition: {
      message_triggers: /仕事.*[嫌辛合辞]|転職|やりがい|モチベ|キャリア/,
    },
  },
  {
    id: "lc22_future_vision",
    name: "将来のイメージ",
    layer: "life_context",
    domains: ["life_transition", "identity"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 336,
    preferred_forms: ["open_light", "hypothesis"],
    intent_description: "将来どうなりたいかのイメージを把握する。判断の方向性に影響する。",
    example_questions: [
      "3年後、どうなってたら嬉しい？",
      "将来のイメージって、なんとなくある？",
    ],
    activation_condition: {
      message_triggers: /将来|未来|夢|目標|なりたい|キャリア|どうし[たよ]/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 2: State — 今の状態の確認
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "s01_energy_level",
    name: "今のエネルギー状態",
    layer: "state",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.75,
    cooldown_hours: 4,
    preferred_forms: ["choice"],
    intent_description: "今の余力がどれくらいあるかを把握する。判断のハードルを調整する。",
    example_questions: [
      "今、余力ある？ それともギリギリ？",
      "元気なとき？ それとも消耗してる？",
    ],
    activation_condition: {
      message_triggers: /疲[れれ]|しんどい|無理|限界|元気.*ない|やる気.*ない|だるい/,
    },
  },
  {
    id: "s02_emotional_weight",
    name: "感情的な重さ",
    layer: "state",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.7,
    cooldown_hours: 4,
    preferred_forms: ["hypothesis"],
    intent_description: "感情的に重い状態かどうかを把握する。質問の深さと量を調整する。",
    example_questions: [
      "これ、結構キツい話？",
      "気持ち的にはどう？ 重い感じ？",
    ],
    activation_condition: {
      message_triggers: /辛[いく]|苦し|悲し|怒[りっ]|泣[いき]|絶望|不安|落ち込/,
    },
  },
  {
    id: "s03_time_pressure",
    name: "時間的プレッシャー",
    layer: "state",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.8,
    cooldown_hours: 2,
    preferred_forms: ["choice"],
    intent_description: "時間的な切迫があるかを確認する。回答のスピード感を調整する。",
    example_questions: [
      "急ぎ？ それとも考える時間はある？",
    ],
    activation_condition: {
      message_triggers: /急[いぎ]|すぐ|今日中|明日まで|期限|締[切め]|間に合/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 1: Trait — 性格・判断傾向の確認
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "t01_decision_style",
    name: "判断スタイルの確認",
    layer: "trait",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 336,
    preferred_forms: ["choice", "casual"],
    intent_description: "普段の判断スタイル（即断型 vs 熟考型）を確認する。",
    example_questions: [
      "普段は即決するタイプ？ それとも考えてから動くタイプ？",
    ],
    activation_condition: {
      message_triggers: /迷[っいう]|決め[られなた]|どうし[たよ]|選[べべ]ない/,
    },
  },
  {
    id: "t02_risk_tolerance",
    name: "リスク許容度の確認",
    layer: "trait",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["hypothesis"],
    intent_description: "リスクに対する態度（慎重 vs 大胆）を確認する。",
    example_questions: [
      "リスクがあっても飛び込むタイプ？ それとも安全策を取るほう？",
    ],
    activation_condition: {
      message_triggers: /リスク|失敗|怖[いく]|不安|挑[戦む]|冒険|安全/,
    },
  },
  {
    id: "t03_conflict_style",
    name: "対立時の対処スタイル",
    layer: "trait",
    domains: ["work", "romance", "family", "friendship"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 336,
    preferred_forms: ["choice"],
    intent_description: "人と意見が対立したとき、どう対処する傾向があるかを確認する。",
    example_questions: [
      "意見がぶつかったとき、言い返すほう？ それとも飲み込むほう？",
    ],
    activation_condition: {
      message_triggers: /[喧ケ]嘩|対立|意見.*[違ぶ]|言[いえ].*[ないなか]|我慢|揉[めめ]/,
    },
  },
  {
    id: "t04_help_seeking",
    name: "助けの求め方",
    layer: "trait",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.3,
    cooldown_hours: 336,
    preferred_forms: ["casual", "hypothesis"],
    intent_description: "困ったときに人に頼れるか、自分で抱え込む傾向があるかを確認する。",
    example_questions: [
      "困ったとき、人に相談するタイプ？",
      "一人で抱え込みがちなほう？",
    ],
    activation_condition: {
      message_triggers: /一人[でに]|抱え|相談.*[でき]|頼[れり]|助[けけ]/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 4: Narrative — 歴史・反復・傷
  // Trust 要求が高い。丁寧に。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "n01_past_similar",
    name: "過去の類似体験",
    layer: "narrative",
    domains: ["universal"],
    route: "both",
    required_trust: 1,
    base_priority: 0.5,
    cooldown_hours: 72,
    preferred_forms: ["casual", "hypothesis"],
    intent_description: "同じような状況を過去に経験したかを確認する。反復パターンの検出材料。",
    example_questions: [
      "こういうこと、前にもあった？",
      "似た感じで迷ったこと、過去にある？",
    ],
    activation_condition: {
      message_triggers: /また|いつも|毎回|繰り返|同じ.*[こ事]|前にも/,
    },
  },
  {
    id: "n02_turning_point",
    name: "人生の転機の体験",
    layer: "narrative",
    domains: ["life_transition", "identity"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["open_light", "casual"],
    intent_description: "人生で大きく変わった体験がないかを把握する。価値観の源泉を知る。",
    example_questions: [
      "人生で一番大きかった出来事って何？",
      "考え方が変わるきっかけになった体験ってある？",
    ],
    activation_condition: {
      message_triggers: /変わ[っり]|きっかけ|昔|子供の頃|学生時代|価値観/,
    },
  },
  {
    id: "n03_recurring_pattern",
    name: "反復パターンの自覚",
    layer: "narrative",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.45,
    cooldown_hours: 168,
    preferred_forms: ["hypothesis"],
    intent_description: "自分で気づいている反復パターン（いつも同じ失敗をする等）を聞く。",
    example_questions: [
      "自分で『またやってるな』って思うことってある？",
    ],
    activation_condition: {
      message_triggers: /また|いつも|毎回|パターン|[繰く]り返|同じ失敗|癖/,
    },
  },
  {
    id: "n04_regret",
    name: "後悔の体験",
    layer: "narrative",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 336,
    preferred_forms: ["hypothesis", "casual"],
    intent_description: "過去に後悔していることを把握する。判断のregret_directionに影響する。",
    example_questions: [
      "やっておけばよかったって思うこと、ある？",
      "逆に、やらなくてよかったって思うことは？",
    ],
    activation_condition: {
      message_triggers: /後悔|やって.*[ば良けれ]|やめて.*[ば良けれ]|あの時/,
    },
  },
  {
    id: "n05_wound_vicinity",
    name: "傷の周辺の確認",
    layer: "narrative",
    domains: ["universal"],
    route: "route_c",
    required_trust: 3,
    base_priority: 0.3,
    cooldown_hours: 672,  // 4週間
    preferred_forms: ["hypothesis"],
    intent_description: "心理的な傷や恐れの存在を、直接聞かず周辺から確認する。断定禁止。",
    example_questions: [
      "その話になると、ちょっと力が入る感じがする。何か引っかかりがある？ なければ全然いいんだけど",
    ],
    activation_condition: {
      message_triggers: /怖[いく]|不安|傷|トラウマ|裏切|嫌[なわ].*記憶|思い出[すし].*[たく]ない/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 5: Cross-Context — 領域横断パターン
  // 最も慎重に。Trust 3+ 必須。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "cc01_domain_transfer",
    name: "別領域での類似パターン",
    layer: "cross_context",
    domains: ["universal"],
    route: "route_c",
    required_trust: 3,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["hypothesis"],
    intent_description: "仕事での傾向が恋愛にも出ていないかなど、領域を超えたパターンの自覚を確認する。",
    example_questions: [
      "仕事でこういう感じになるとき、プライベートでも似た感じになったりする？",
      "思い過ごしかもしれないけど、恋愛でも同じパターン出てない？",
    ],
    activation_condition: {
      message_triggers: /仕事でも|恋愛でも|プライベートでも|同じ[よこ]|似[たて]/,
    },
  },
  {
    id: "cc02_authority_pattern",
    name: "権威に対するパターン",
    layer: "cross_context",
    domains: ["work", "family"],
    route: "route_c",
    required_trust: 3,
    base_priority: 0.3,
    cooldown_hours: 336,
    preferred_forms: ["hypothesis"],
    intent_description: "上司・親・年上の相手に対して共通する態度がないかを確認する。",
    example_questions: [
      "上司の前で言いたいこと言えないって、親の前でもそう？",
    ],
    activation_condition: {
      message_triggers: /上司.*[言えなか怖]|親.*[言えなか怖]|先輩.*[言えなか怖]|目上|権威|逆らえ/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: Life Context — 最近の変化
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "lc30_recent_change",
    name: "最近の大きな変化",
    layer: "life_context",
    domains: ["universal"],
    route: "both",
    required_trust: 1,
    base_priority: 0.6,
    cooldown_hours: 168,
    preferred_forms: ["casual", "open_light"],
    intent_description: "最近の大きな変化（引越し、異動、別れ等）があったかを確認する。",
    example_questions: [
      "最近、生活で大きく変わったことってある？",
      "ここ1ヶ月で何か変わった？",
    ],
    activation_condition: {
      message_triggers: /最近|変わ[っり]|新しい|始め|引っ越|異動|部署/,
    },
  },
  {
    id: "lc31_stress_source",
    name: "ストレス源の特定",
    layer: "life_context",
    domains: ["universal"],
    route: "both",
    required_trust: 1,
    base_priority: 0.6,
    cooldown_hours: 72,
    preferred_forms: ["choice", "hypothesis"],
    intent_description: "今の主なストレス源を特定する。判断の文脈に不可欠。",
    example_questions: [
      "一番しんどいのって、仕事？ 人間関係？ それとも別のこと？",
      "ストレスの一番の原因って何？",
    ],
    activation_condition: {
      message_triggers: /ストレス|しんどい|疲[れれ]|辛[いく]|限界|[い嫌]やだ|もう[無嫌だ]/,
    },
  },
  {
    id: "lc32_support_system",
    name: "支援ネットワークの確認",
    layer: "life_context",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 336,
    preferred_forms: ["casual"],
    intent_description: "周囲に支えてくれる人がいるかを確認する。孤立度の把握。",
    example_questions: [
      "こういうとき、話を聞いてくれる人っている？",
    ],
    activation_condition: {
      message_triggers: /一人[でに]|誰.*[いなか]|相談|頼[れり]|孤[独立]|寂[しし]/,
    },
  },
  {
    id: "lc33_daily_routine",
    name: "日常のルーティン",
    layer: "life_context",
    domains: ["health", "universal"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.25,
    cooldown_hours: 336,
    preferred_forms: ["casual"],
    intent_description: "日常の生活リズムを把握する。生活の安定度の指標。",
    example_questions: [
      "普段の1日って、だいたいどんな感じ？",
    ],
    activation_condition: {
      message_triggers: /毎日|日課|ルーティン|生活.*リズム|朝.*起き|夜.*寝/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: Life Context — 価値観・アイデンティティ
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "lc40_core_value",
    name: "核心的な価値観",
    layer: "life_context",
    domains: ["identity", "universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.45,
    cooldown_hours: 336,
    preferred_forms: ["open_light", "hypothesis"],
    intent_description: "何を一番大事にしているかを把握する。判断の軸になる。",
    example_questions: [
      "一番譲れないことって何？",
      "これだけは大事にしてるってこと、ある？",
    ],
    activation_condition: {
      message_triggers: /大[事切]|譲[れら]ない|優先|価値観|信念|ポリシー|こだわり/,
    },
  },
  {
    id: "lc41_self_image",
    name: "自己イメージの把握",
    layer: "life_context",
    domains: ["identity"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["hypothesis", "open_light"],
    intent_description: "自分のことをどう捉えているかを把握する。自己像と行動のズレの検出に使う。",
    example_questions: [
      "自分のことを一言で言うと、どんな人？",
      "周りからどう見られてると思う？",
    ],
    activation_condition: {
      message_triggers: /自分.*[はが]|私.*[はが]|僕.*[はが]|性格|タイプ|[よ良]いところ|[だ駄]めな/,
    },
  },
  {
    id: "lc42_motivation_source",
    name: "モチベーションの源泉",
    layer: "life_context",
    domains: ["work", "identity"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["casual", "open_light"],
    intent_description: "何にエネルギーが出るかを把握する。提案の方向性に影響する。",
    example_questions: [
      "どんなときが一番やる気出る？",
      "最近、テンション上がったことって何かあった？",
    ],
    activation_condition: {
      message_triggers: /やる気|モチベ|楽し[いく]|好き.*[こな]|夢中|ワクワク|テンション/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: Life Context — 対人判断の文脈
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "lc50_trust_in_others",
    name: "他者への信頼度",
    layer: "life_context",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["hypothesis"],
    intent_description: "人を信頼しやすいか、警戒しやすいかを把握する。対人判断の前提。",
    example_questions: [
      "人って基本的に信じるほう？ それとも疑うほう？",
    ],
    activation_condition: {
      message_triggers: /信[じ用]|裏切|騙[しさ]|疑[いっう]|怪し|本音|嘘/,
    },
  },
  {
    id: "lc51_boundary_style",
    name: "境界線の引き方",
    layer: "life_context",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.35,
    cooldown_hours: 336,
    preferred_forms: ["choice", "hypothesis"],
    intent_description: "人との境界線を引けるか、巻き込まれやすいかを把握する。",
    example_questions: [
      "断るの、得意？ それとも苦手？",
      "頼まれると断れないタイプ？",
    ],
    activation_condition: {
      message_triggers: /断[れり]|[ことわ].*ない|巻き込|No.*言[えいう]|押[しさ].*[に弱]|お人好し/,
    },
  },
  {
    id: "lc52_attachment_style",
    name: "愛着スタイルの傾向",
    layer: "life_context",
    domains: ["romance", "family"],
    route: "route_c",
    required_trust: 3,
    base_priority: 0.3,
    cooldown_hours: 672,
    preferred_forms: ["hypothesis"],
    intent_description: "近づきすぎると怖くなるか、離れると不安になるかなど愛着パターンを確認する。",
    example_questions: [
      "近づきすぎると逃げたくなる？ それとも離れると不安になるほう？",
    ],
    activation_condition: {
      message_triggers: /距離.*[怖近遠]|近[づい].*[怖不]|離[れさ].*[不怖寂]|依[存頼]|束[縛縛]|自由/,
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 追加: 判断接続系 + 環境補完系（50個超え用）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: "d06_worst_case",
    name: "最悪のケースの想定",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.75,
    cooldown_hours: 4,
    preferred_forms: ["hypothesis"],
    intent_description: "最悪の場合どうなるかを確認する。regret_if_do の見積もりに使う。",
    example_questions: [
      "最悪の場合、何が起きる？",
      "一番怖いのって何？",
    ],
    activation_condition: {
      message_triggers: /怖[いく]|不安|リスク|失敗|最悪|ダメ[だに]|うまくいか/,
    },
  },
  {
    id: "d07_ideal_outcome",
    name: "理想の結果の確認",
    layer: "decision",
    domains: ["universal"],
    route: "clarify",
    required_trust: 0,
    base_priority: 0.7,
    cooldown_hours: 4,
    preferred_forms: ["open_light"],
    intent_description: "本当はどうなりたいかを確認する。opportunity_value の精度向上に使う。",
    example_questions: [
      "理想的にはどうなってほしい？",
      "うまくいったら、どんな感じ？",
    ],
    activation_condition: {
      message_triggers: /どうし[たよ]|どうなり[たる]|理想|望[みむ]|希望|ベスト/,
    },
  },
  {
    id: "lc60_hobby_outlet",
    name: "趣味・発散手段",
    layer: "life_context",
    domains: ["health", "identity"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.25,
    cooldown_hours: 336,
    preferred_forms: ["casual"],
    intent_description: "ストレス発散の手段や趣味があるかを確認する。回復リソースの把握。",
    example_questions: [
      "ストレス溜まったとき、何してる？",
      "趣味とか、気分転換できることってある？",
    ],
    activation_condition: {
      message_triggers: /ストレス|発散|趣味|休[みめ]|リフレッシュ|気分転換/,
    },
  },
  {
    id: "lc61_social_battery",
    name: "社会的バッテリー",
    layer: "life_context",
    domains: ["friendship", "work"],
    route: "route_c",
    required_trust: 1,
    base_priority: 0.3,
    cooldown_hours: 168,
    preferred_forms: ["choice"],
    intent_description: "人と会うと充電される型か、一人で充電する型かを把握する。提案の方向性に影響。",
    example_questions: [
      "人と会うと元気出るタイプ？ それとも一人の時間がないとダメ？",
    ],
    activation_condition: {
      message_triggers: /一人.*[好嫌]|人.*[疲付会]|内向|外向|社交|引きこもり/,
    },
  },
  {
    id: "n06_success_pattern",
    name: "過去の成功パターン",
    layer: "narrative",
    domains: ["universal"],
    route: "route_c",
    required_trust: 2,
    base_priority: 0.4,
    cooldown_hours: 336,
    preferred_forms: ["casual", "open_light"],
    intent_description: "過去にうまくいった体験とそのパターンを把握する。再現可能な強みの特定。",
    example_questions: [
      "最近、うまくいったことって何かあった？",
      "自分でも『これは良かったな』って思う判断ってある？",
    ],
    activation_condition: {
      message_triggers: /うまくい[っか]|成功|良[かい].*判断|自信|得意|強み/,
    },
  },
  {
    id: "lc62_time_availability",
    name: "可処分時間の確認",
    layer: "life_context",
    domains: ["universal"],
    route: "both",
    required_trust: 1,
    base_priority: 0.5,
    cooldown_hours: 72,
    preferred_forms: ["choice"],
    intent_description: "自由に使える時間がどれくらいあるかを把握する。行動提案の粒度に影響。",
    example_questions: [
      "最近、自分の時間ってどのくらいある？",
      "平日の夜って、余裕ある？ それともいっぱいいっぱい？",
    ],
    activation_condition: {
      message_triggers: /時間.*[なない]|忙[しい]|余裕|暇|スケジュール|予定/,
    },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent Selection — 意図の選択ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 選択された意図と選択理由 */
export interface SelectedIntent {
  intent: QuestionIntent;
  /** なぜこの意図が選ばれたか */
  selection_reason: string;
  /** 最終的な優先度スコア (0-1) */
  effective_priority: number;
}

/**
 * 現在の文脈に最適な意図を選択する。
 *
 * 選択基準:
 * 1. activation_condition がマッチするか
 * 2. Trust Level が足りているか
 * 3. cooldown 期間内に同じ意図を使っていないか
 * 4. route が合っているか（clarify / route_c）
 * 5. 上記を全てパスした候補を priority × 文脈ブーストでランキング
 *
 * @param message       ユーザーのメッセージ
 * @param trustLevel    現在の Trust Level
 * @param route         使用経路
 * @param existingContext 蓄積済みの Life Context
 * @param recentIntentIds 直近で使用した意図IDと使用時刻
 * @param domain        検出されたドメイン（あれば）
 */
export function selectIntent(
  message: string,
  trustLevel: TrustLevel,
  route: IntentRoute,
  existingContext: LifeContextEntry[],
  recentIntentIds: Map<string, Date>,
  domain?: string,
): SelectedIntent | null {
  const now = Date.now();
  const candidates: Array<{ intent: QuestionIntent; score: number; reason: string }> = [];

  for (const intent of INTENT_POOL) {
    // ── フィルタ 1: Trust Level ──
    if (trustLevel < intent.required_trust) continue;

    // ── フィルタ 2: Route 適合 ──
    if (intent.route !== "both" && intent.route !== route) continue;

    // ── フィルタ 3: Cooldown ──
    const lastUsed = recentIntentIds.get(intent.id);
    if (lastUsed) {
      const hoursSinceLastUse = (now - lastUsed.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastUse < intent.cooldown_hours) continue;
    }

    // ── フィルタ 4: Activation Condition ──
    const cond = intent.activation_condition;
    let activated = false;

    if (cond.always_active) {
      activated = true;
    }
    if (cond.message_triggers && cond.message_triggers.test(message)) {
      activated = true;
    }
    // requires_missing_category: そのカテゴリが Life Context にないこと
    if (cond.requires_missing_category) {
      const hasCat = existingContext.some(
        e => e.category === cond.requires_missing_category
          && !e.possibly_stale
          && e.confidence >= 0.4,
      );
      if (!hasCat) {
        activated = true; // 欠落 = 意図が有効
      } else if (!cond.message_triggers) {
        continue; // カテゴリがあり、メッセージトリガーもない → 不要
      }
    }
    // requires_missing_content: 特定の content が Life Context にないこと
    if (cond.requires_missing_content) {
      const allPresent = cond.requires_missing_content.every(
        c => existingContext.some(e => e.content.includes(c) && !e.possibly_stale),
      );
      if (allPresent) continue; // 全て既知 → この意図は不要
      activated = true;
    }

    if (!activated) continue;

    // ── スコアリング ──
    let score = intent.base_priority;

    // ドメインマッチボーナス
    if (domain && intent.domains.includes(domain as IntentDomain)) {
      score += 0.1;
    }
    // universal はボーナスなし（ペナルティもなし）
    if (!intent.domains.includes("universal") && domain && !intent.domains.includes(domain as IntentDomain)) {
      score -= 0.15; // ドメイン不一致ペナルティ
    }

    // Layer 6 (decision) は clarify で最優先
    if (route === "clarify" && intent.layer === "decision") {
      score += 0.15;
    }

    // 欠落カテゴリが大きい → 優先度アップ
    if (cond.requires_missing_category) {
      const categoryCount = existingContext.filter(
        e => e.category === cond.requires_missing_category && !e.possibly_stale,
      ).length;
      if (categoryCount === 0) score += 0.05;
    }

    candidates.push({ intent, score, reason: buildSelectionReason(intent, domain) });
  }

  if (candidates.length === 0) return null;

  // 最高スコアの候補を選択
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    intent: best.intent,
    selection_reason: best.reason,
    effective_priority: Math.min(1, Math.max(0, best.score)),
  };
}

function buildSelectionReason(intent: QuestionIntent, domain?: string): string {
  const layerLabel: Record<IntentLayer, string> = {
    trait: "性格理解",
    state: "状態把握",
    life_context: "生活文脈",
    narrative: "物語理解",
    cross_context: "横断パターン",
    decision: "判断文脈",
  };
  const parts = [`${layerLabel[intent.layer]}: ${intent.name}`];
  if (domain) parts.push(`domain=${domain}`);
  return parts.join(", ");
}

/**
 * selectIntent の複数候補版。Route C では補完質問の候補を2-3個持ちたい場合に使う。
 */
export function selectIntentCandidates(
  message: string,
  trustLevel: TrustLevel,
  route: IntentRoute,
  existingContext: LifeContextEntry[],
  recentIntentIds: Map<string, Date>,
  domain?: string,
  maxCandidates: number = 3,
): SelectedIntent[] {
  const results: SelectedIntent[] = [];

  // selectIntent を呼び、選ばれたら recentIntentIds に追加して再度呼ぶ
  const tempRecent = new Map(recentIntentIds);
  for (let i = 0; i < maxCandidates; i++) {
    const selected = selectIntent(message, trustLevel, route, existingContext, tempRecent, domain);
    if (!selected) break;
    results.push(selected);
    // 同じ意図が再選択されないよう仮のcooldownを入れる
    tempRecent.set(selected.intent.id, new Date());
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent → Prompt 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 選択された Intent を LLM に渡すプロンプトフラグメントに変換する。
 * LLM は intent_description + example_questions を受け取り、
 * 文脈に合った自然な質問を生成する。
 */
export function formatIntentForClarifyPrompt(selected: SelectedIntent): string {
  const intent = selected.intent;
  const formLabels: Record<QuestionForm, string> = {
    choice: "選択肢型（「A？ それともB？」）",
    permission: "許可型（「聞いてもいい？」）",
    hypothesis: "軽い仮説型（「もしかして〜？」）",
    casual: "さりげない確認（「そういえば〜」）",
    open_light: "軽いオープン（「どんな感じ？」）",
  };
  const formOptions = intent.preferred_forms
    .map(f => formLabels[f])
    .join(" / ");

  return [
    `# 質問の意図`,
    `目的: ${intent.intent_description}`,
    `推奨形式: ${formOptions}`,
    `参考例:`,
    ...intent.example_questions.map(q => `- 「${q}」`),
    ``,
    `上記の意図に基づき、会話の流れに自然に合う質問を1つだけ生成すること。`,
    `例をそのまま使わず、文脈に合わせて言い換えること。`,
  ].join("\n");
}

/**
 * 選択された Intent を Route C（構造的補完）用のプロンプトフラグメントに変換する。
 * clarify より軽い: 「任意・自然に」の一言として付け加える。
 */
export function formatIntentForRouteCPrompt(selected: SelectedIntent): string {
  const intent = selected.intent;
  const example = intent.example_questions[0] ?? "ちなみに、そのあたりはどう？";

  return [
    `相談に関連して、以下の情報があると理解が深まる。応答の最後に、自然な関心として1文だけ聞いてよい（必須ではない）。`,
    `意図: ${intent.intent_description}`,
    `例: 「${example}」`,
    `※ 無理に聞かない。会話の流れに合わない場合は省略すること。「答えたくなければ全然いい」のニュアンスで。`,
  ].join("\n");
}
