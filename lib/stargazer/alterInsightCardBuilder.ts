/**
 * alterInsightCardBuilder.ts
 *
 * ContextReel 用のインサイトカード選定エンジン。
 * Gate Chain で候補を絞り、最終3枚（1 pinned + 2 secondary）を確定して返す。
 *
 * Gate Chain:
 *   候補生成(最大8) → trust gate → freshness gate → specificity gate
 *   → theme dedup → prediction strict → contradiction quality
 *   → priority + surprise score sort → 上位3枚
 */

import type { TrustLevel } from "./alterUnderstanding";

/* ═══ Public Types ═══ */

export type InsightCardType =
  | "prediction_cycle"
  | "session_insight"
  | "hypothesis"
  | "contradiction"
  | "growth_signal"
  | "pattern"
  | "followup_hook"
  | "cross_feature"
  | "welcome";

export type InsightLayer = "memory" | "understanding" | "prediction";

export type AlterInsightCard = {
  id: string;
  type: InsightCardType;
  layer: InsightLayer;
  icon: string;
  text: string;
  subtext?: string;
  href?: string;
  composerSeed?: string;
  pinned: boolean;
  priority: number;
  /** テーマタグ（theme dedup 用、UI非表示） */
  theme: string;
};

/* ═══ Internal Types ═══ */

/** Gate chain 内部で使う候補 */
type CardCandidate = {
  id: string;
  type: InsightCardType;
  layer: InsightLayer;
  text: string;
  subtext?: string;
  href?: string;
  composerSeed?: string;
  /** 必要な最低 Trust Level */
  requiredTrust: TrustLevel;
  /** 鮮度 (created_at or updated_at) */
  createdAt: Date;
  /** テーマタグ（dedup 用） */
  theme: string;
  /** prediction 固有: 検証ステータス */
  verificationStatus?: string;
  /** prediction 固有: confidence */
  predictionConfidence?: number;
  /** priority スコア（高い = 良い） */
  basePriority: number;
  /** 元データソース */
  source: "session_summary" | "hypothesis" | "causal_map" | "pattern" | "prophecy" | "cross_feature" | "welcome" | "axis_insight" | "blind_spot_drop" | "inner_weather";
};

/** DB から取得した生データ群 */
export type InsightDataSources = {
  /** Stargazer 観測回数（observations + daily_states） */
  observationCount: number;
  sessionsCompleted: number;
  trustLevel: TrustLevel;
  // ── 観測由来（base layer: 常に利用可能） ──
  /** 47軸スコア（stargazer_resolved_types.axis_scores） */
  axisScores: Record<string, number> | null;
  /** 直近の blind spot drop */
  blindSpotDrop: BlindSpotDropRow | null;
  /** 今日の inner weather */
  innerWeather: InnerWeatherRow | null;
  todayProphecy: ProphecyRow | null;
  yesterdayProphecy: ProphecyRow | null;
  prophecyAccuracy: { total: number; correct: number } | null;
  // ── Alter会話由来（additive layer: 加点条件） ──
  sessionSummaries: SessionSummaryRow[];
  hypotheses: HypothesisRow[];
  causalMap: CausalMapRow[];
  patterns: PatternRow[];
  /** 直近3日に表示したカードのテーマ一覧 */
  recentDisplayedThemes?: string[];
};

/* ═══ DB Row Types（API route でマッピング） ═══ */

export type SessionSummaryRow = {
  id: string;
  session_id: string;
  summary_date: string;
  key_themes: string[];
  contradictions_discovered: string[];
  user_admissions: string[];
  deepest_moment: string | null;
  follow_up_hooks: string[];
  created_at: string;
};

export type HypothesisRow = {
  id: string;
  hypothesis_type: string;
  content: string;
  evidence_summary: string;
  domains: string[];
  confidence: number;
  status: string;
  required_trust: number;
  presented_count: number;
  created_at: string;
  last_evaluated: string;
};

export type CausalMapRow = {
  id: string;
  source_fact: string;
  target_axis: string;
  influence: string;
  hypothesis: string;
  confidence: number;
  evidence_count: number;
  contradiction_count: number;
  created_at: string;
};

export type PatternRow = {
  id: string;
  pattern_type: string;
  axis_id: string | null;
  description_ja: string;
  confidence: number;
  confirmation_count: number;
  surfaced: boolean;
  user_reaction: string | null;
  created_at: string;
};

export type ProphecyRow = {
  id: string;
  prophecy_date: string;
  prediction_text: string;
  prediction_category: string;
  prediction_confidence: number | null;
  verification_status: string;
  user_verification_text: string | null;
  created_at: string;
};

export type BlindSpotDropRow = {
  id: string;
  drop_date: string;
  category: string;
  content_title: string;
  content_body: string;
  content_hint: string | null;
  source_axes: string[];
  intensity: number;
  reaction: string | null;
  created_at: string;
};

export type InnerWeatherRow = {
  id: string;
  weather_date: string;
  weather_type: string;
  energy_level: number;
  stress_level: number;
  emotional_tone: string;
  social_battery: number;
  stability: number;
  defense_active: boolean;
  weather_report: string | null;
  created_at: string;
};

/* ═══ Constants ═══ */

const LAYER_MAP: Record<InsightCardType, InsightLayer> = {
  session_insight: "memory",
  followup_hook: "memory",
  hypothesis: "understanding",
  contradiction: "understanding",
  growth_signal: "understanding",
  pattern: "understanding",
  prediction_cycle: "prediction",
  cross_feature: "understanding",
  welcome: "prediction",
};

const ICON_MAP: Record<InsightLayer, string> = {
  memory: "💡",
  understanding: "🧩",
  prediction: "🔮",
};

const COMPOSER_SEEDS: Record<InsightCardType, string> = {
  session_insight: "これについてもう少し話したい",
  followup_hook: "この前の話の続きを聞いて",
  prediction_cycle: "昨日の予測、実際どうだった？",
  contradiction: "このズレ、もう少し詳しく見て",
  hypothesis: "この仮説が当たってるか一緒に確かめたい",
  cross_feature: "",
  growth_signal: "この変化、もう少し詳しく見て",
  pattern: "このパターン、本当にある？",
  welcome: "最近ひっかかっていることを1つだけ教えて",
};

/** ラベル語ブラックリスト（性格説明禁止） */
const LABEL_BLACKLIST = [
  "論理的", "慎重", "分析的", "感情的", "直感的",
  "外向的", "内向的", "楽観的", "悲観的", "合理的",
  "成長しています", "パターンがあります",
];

/** 条件節/比較構造を示すキーワード */
const SPECIFICITY_KEYWORDS = [
  "になると", "時ほど", "一方で", "より", "なのに",
  "しやすい", "ときは", "場合は", "けれど", "のに",
  "だけど", "にもかかわらず", "に比べて", "ほど",
  "むしろ", "かえって", "とは対照的に",
];

/** 観測不足とみなす閾値 */
const MIN_OBSERVATION_THRESHOLD = 5;

/** Freshness gate: type 別の最大日数 */
const FRESHNESS_LIMITS: Partial<Record<InsightCardType, number>> = {
  session_insight: 7,
  followup_hook: 14,
  prediction_cycle: 1, // 当日/前日のみ
};

/** テーマ推定キーワード */
const THEME_KEYWORDS: Record<string, string[]> = {
  "仕事": ["仕事", "上司", "職場", "転職", "キャリア", "業務", "同僚"],
  "恋愛": ["恋愛", "パートナー", "恋人", "好き", "デート"],
  "人間関係": ["友人", "友達", "関係", "対人", "社交"],
  "家族": ["家族", "親", "母", "父", "兄弟", "姉妹"],
  "疲労": ["疲", "休み", "体調", "エネルギー", "回復"],
  "本音・回避": ["本音", "飲み込", "避け", "回避", "言えない"],
  "自己理解": ["自分", "性格", "傾向", "クセ", "気づ"],
  "感情": ["感情", "怒り", "悲しみ", "不安", "焦り"],
};

/* ═══ Observation-Derived Axis Insight Rules ═══ */
// 軸スコアの組み合わせから行動的インサイトを検出するルール
// text はラベル語禁止 + SPECIFICITY_KEYWORDS 必須を満たす
type AxisInsightRule = {
  id: string;
  check: (scores: Record<string, number>) => boolean;
  text: string;
  theme: string;
  priority: number;
};

function axisScore(scores: Record<string, number>, key: string): number {
  return scores[key] ?? 0;
}

/**
 * ── 矛盾/盲点ルール ──
 *
 * CEOの構想: 初回から「え、なんでわかるの？」を出す。
 * ラベル描写（「あなたは〜な傾向がある」）ではなく、
 * ドメインを跨ぐ矛盾・自分では気づきにくい盲点を指摘する。
 *
 * 3カテゴリ:
 *   contradiction — 2軸が矛盾する判断パターン（「〜のに」「〜なのに」構造）
 *   blind_spot    — 自分では見えにくい構造的盲点（「気づきにくいけど」構造）
 *   tension       — 内面の緊張・葛藤（「〜したいのに〜できない」構造）
 */
const AXIS_INSIGHT_RULES: AxisInsightRule[] = [
  // ═══ CONTRADICTION: ドメイン横断の矛盾 ═══

  // 判断基準が場面で逆転する
  {
    id: "ax_rational_intuitive_split",
    check: (s) => axisScore(s, "rational_vs_emotional_decision") < -0.3
      && axisScore(s, "analytical_vs_intuitive") > 0.3,
    text: "仕事では理詰めで判断するのに、対人では直感で動きやすい — 自分でも気づきにくいズレかもしれない",
    theme: "自己理解",
    priority: 0.95,
  },
  // 率直に見えて核心は隠す
  {
    id: "ax_direct_gap",
    check: (s) => axisScore(s, "direct_vs_diplomatic") < -0.3
      && axisScore(s, "public_private_gap") > 0.4,
    text: "率直に話しているように見えるのに、核心だけは飲み込みやすい — 周囲は気づいていないかもしれない",
    theme: "本音・回避",
    priority: 0.9,
  },
  // 独立と承認欲求の同居
  {
    id: "ax_independent_reassurance",
    check: (s) => axisScore(s, "independence_vs_harmony") < -0.3
      && axisScore(s, "reassurance_need") > 0.4,
    text: "一人で決められるのに安心を確かめたくなる — この矛盾に自分では気づきにくい",
    theme: "人間関係",
    priority: 0.9,
  },
  // 場面で人格が切り替わる
  {
    id: "ax_mode_split_gap",
    check: (s) => axisScore(s, "relationship_mode_split") > 0.5
      && axisScore(s, "public_private_gap") > 0.3,
    text: "相手によって自分のモードが切り替わるのに、表に出す自分は一貫しているように見せている",
    theme: "人間関係",
    priority: 0.85,
  },
  // 崩れ時の過制御
  {
    id: "ax_control_emotional",
    check: (s) => axisScore(s, "control_tendency") > 0.4
      && axisScore(s, "emotional_variability") > 0.4,
    text: "感情が揺れるときほど場を仕切ろうとしやすい — 崩れかけのサインが支配欲に出るかもしれない",
    theme: "感情",
    priority: 0.85,
  },

  // ═══ BLIND SPOT: 自分では見えにくい構造 ═══

  // 感情を制御できるのに内側で消耗
  {
    id: "ax_regulate_ruminate",
    check: (s) => axisScore(s, "emotional_regulation") > 0.4
      && axisScore(s, "rumination_tendency") > 0.3,
    text: "感情は抑えられるのに、頭の中では同じことを反芻しやすい — 外から見えない消耗がある",
    theme: "疲労",
    priority: 0.85,
  },
  // 恥型: 行動の失敗を人格に結びつける
  {
    id: "ax_shame",
    check: (s) => axisScore(s, "shame_vs_guilt") > 0.5,
    text: "失敗したとき「自分がダメだから」と感じやすい — 行動と人格を分けにくい盲点があるかもしれない",
    theme: "自己理解",
    priority: 0.85,
  },
  // 努力しているのに外部帰属する
  {
    id: "ax_growth_locus",
    check: (s) => axisScore(s, "growth_mindset") < -0.4
      && axisScore(s, "locus_of_control") > 0.3,
    text: "変わりたいのに「結局は状況次第」と感じやすい — 努力の方向が見えなくなるパターンがある",
    theme: "自己理解",
    priority: 0.8,
  },

  // ═══ TENSION: 内面の緊張・葛藤 ═══

  // 近づきたいけど踏み込まれたくない
  {
    id: "ax_social_boundary",
    check: (s) => axisScore(s, "social_initiative") > 0.4
      && axisScore(s, "boundary_awareness") > 0.4,
    text: "自分から距離を縮められるのに、相手が近づくと壁を作りやすい — この非対称に気づいているか",
    theme: "人間関係",
    priority: 0.8,
  },
  // 完璧主義なのに計画しない
  {
    id: "ax_perfect_spontaneous",
    check: (s) => axisScore(s, "perfectionist_vs_pragmatic") < -0.4
      && axisScore(s, "plan_vs_spontaneous") > 0.3,
    text: "仕上がりにはこだわるのに段取りは後回しにしやすい — 締切前に追い詰められるパターンがないか",
    theme: "仕事",
    priority: 0.75,
  },
  // 社交的だけど一人回復
  {
    id: "ax_extro_iso",
    check: (s) => axisScore(s, "introvert_vs_extrovert") > 0.4
      && axisScore(s, "stress_isolation_vs_social") < -0.3,
    text: "普段は人と一緒にいたいのに、疲れると急に一人になりやすい — 周囲には急な変化に見えているかもしれない",
    theme: "疲労",
    priority: 0.75,
  },
  // 安定志向だけど直感で判断
  {
    id: "ax_stable_intuitive",
    check: (s) => axisScore(s, "change_embrace_vs_resist") > 0.3
      && axisScore(s, "analytical_vs_intuitive") > 0.3,
    text: "安定を求めているはずなのに、いざ選ぶときは直感で飛びやすい — 判断の矛盾に気づきにくい",
    theme: "自己理解",
    priority: 0.8,
  },
];

/* ═══ Main Entry Point ═══ */

/**
 * Gate chain を通して最終3枚のカードを確定する。
 * route.ts は「この3枚をそのまま返す」だけ。UIでの追加フィルタ不要。
 */
export function buildInsightCards(data: InsightDataSources): AlterInsightCard[] {
  const { observationCount, sessionsCompleted, trustLevel } = data;

  // ── Welcome 条件: 観測不足 AND Alter未使用 AND 既存データなし ──
  // 観測が十分なユーザーには、Alter会話がなくても観測由来カードを出す
  const hasEnoughObservation = observationCount >= MIN_OBSERVATION_THRESHOLD;
  const hasAlterData = data.sessionSummaries.length > 0
    || data.hypotheses.length > 0
    || data.patterns.length > 0;
  if (!hasEnoughObservation && sessionsCompleted === 0 && !hasAlterData) {
    return [buildWelcomeCard()];
  }

  // ── 候補生成（最大8） ──
  const candidates = generateCandidates(data);
  if (candidates.length === 0) {
    return [buildWelcomeCard()];
  }

  // ── Gate Chain ──
  let pool = candidates;
  pool = trustGate(pool, trustLevel);
  pool = freshnessGate(pool);
  pool = specificityGate(pool);
  pool = predictionStrictGate(pool, data);
  pool = contradictionQualityGate(pool, data);
  pool = themeDedupGate(pool, data.recentDisplayedThemes ?? []);

  if (pool.length === 0) {
    return [buildWelcomeCard()];
  }

  // ── Priority + Surprise Score sort ──
  const scored = pool.map((c) => ({
    candidate: c,
    score: computePinnedScore(c, data),
  }));
  scored.sort((a, b) => b.score - a.score);

  // ── 上位3枚: 1 pinned + 2 secondary ──
  const pinned = scored[0]!.candidate;
  const secondaryCandidates = scored.slice(1);

  // pinned と同テーマの secondary は除外
  const secondary = secondaryCandidates
    .filter((s) => s.candidate.theme !== pinned.theme)
    .slice(0, 2)
    .map((s) => s.candidate);

  // secondary が足りない場合、同テーマでも追加
  if (secondary.length < 2) {
    const remaining = secondaryCandidates
      .filter((s) => !secondary.includes(s.candidate))
      .slice(0, 2 - secondary.length)
      .map((s) => s.candidate);
    secondary.push(...remaining);
  }

  return [
    toCard(pinned, true),
    ...secondary.map((c) => toCard(c, false)),
  ];
}

/* ═══ Candidate Generation ═══ */

function generateCandidates(data: InsightDataSources): CardCandidate[] {
  const candidates: CardCandidate[] = [];

  // ═══ BASE LAYER: 観測データ由来（常に利用可能） ═══

  // 1. 軸スコアからの行動的インサイト
  candidates.push(...generateAxisCandidates(data.axisScores));

  // 2. Blind spot drop
  candidates.push(...generateBlindSpotCandidates(data));

  // 3. Inner weather × 軸スコアの状態連動
  candidates.push(...generateWeatherCandidates(data));

  // 4. Prediction cycle (today + yesterday prophecy)
  candidates.push(...buildProphecyCandidates(data));

  // ═══ ADDITIVE LAYER: Alter会話由来（加点条件） ═══
  candidates.push(...generateAlterCandidates(data));

  return candidates.slice(0, 12);
}

/* ── Observation-Derived Generators ── */

function generateAxisCandidates(scores: Record<string, number> | null): CardCandidate[] {
  if (!scores || Object.keys(scores).length === 0) return [];
  const candidates: CardCandidate[] = [];

  for (const rule of AXIS_INSIGHT_RULES) {
    if (rule.check(scores)) {
      candidates.push({
        id: rule.id,
        type: "contradiction",
        layer: "understanding",
        text: rule.text,
        composerSeed: "これ、自分では気づいてた？",
        requiredTrust: 0,
        createdAt: new Date(),
        theme: rule.theme,
        basePriority: rule.priority,
        source: "axis_insight",
      });
    }
  }

  // ルール不一致の場合でも、最も偏りが大きい軸からフォールバックカードを生成
  if (candidates.length === 0) {
    const fallback = buildFallbackAxisInsight(scores);
    if (fallback) candidates.push(fallback);
  }

  // 上位3つまで
  return candidates.slice(0, 3);
}

/** 軸名 → 偏りがあるときの盲点テキスト（左:-1寄り、右:+1寄り） */
const AXIS_FALLBACK_TEXTS: Record<string, { left: string; right: string; theme: string }> = {
  control_tendency: {
    left: "主導権を手放しても気にならない — 逆に、必要なときに主張できなくなるリスクが見えにくい",
    right: "場を仕切りたくなりやすい — 周囲からは「余裕がないとき」にそれが強まるように見えているかもしれない",
    theme: "人間関係",
  },
  public_private_gap: {
    left: "表裏が少ないぶん、隠したいことまで見えてしまいやすい — その自覚があるか",
    right: "外に見せる自分と内側にズレがある — 本人は一貫しているつもりでも、周囲はそのギャップに気づいている",
    theme: "本音・回避",
  },
  rumination_tendency: {
    left: "切り替えが早いぶん、振り返りが浅くなることがある — 同じ失敗を繰り返していないか",
    right: "一度考え始めると止まりにくい — 深く掘る力はあるが、外から見えない消耗が蓄積している",
    theme: "疲労",
  },
  reassurance_need: {
    left: "安心確認を求めない — そのぶん相手には「気にしてないのかな」と映りやすいかもしれない",
    right: "安心を確かめたくなりやすい — 相手にとっては「また確認？」になっている可能性がある",
    theme: "人間関係",
  },
  boundary_awareness: {
    left: "距離感に鈍い — 踏み込みすぎて相手が引いているのに気づきにくいことがある",
    right: "距離感に敏感 — 相手が近づこうとしているのに壁を作ってしまうことがある",
    theme: "人間関係",
  },
  emotional_variability: {
    left: "感情が安定しているように見えるが、動じなさすぎて周囲に「冷たい」と映ることがある",
    right: "感情の振れ幅が大きい — エネルギッシュに見えるが、消耗の波も激しいかもしれない",
    theme: "感情",
  },
};

/** ルールにヒットしなかった場合、最も偏った軸からフォールバックカードを生成 */
function buildFallbackAxisInsight(scores: Record<string, number>): CardCandidate | null {
  const fallbackKeys = Object.keys(AXIS_FALLBACK_TEXTS);
  let bestKey = "";
  let bestAbs = 0;

  for (const key of fallbackKeys) {
    const abs = Math.abs(scores[key] ?? 0);
    if (abs > bestAbs) {
      bestAbs = abs;
      bestKey = key;
    }
  }

  // 偏りが小さすぎる場合は生成しない
  if (bestAbs < 0.25 || !bestKey) return null;

  const entry = AXIS_FALLBACK_TEXTS[bestKey]!;
  const text = (scores[bestKey] ?? 0) < 0 ? entry.left : entry.right;

  return {
    id: `ax_fb_${bestKey}`,
    type: "pattern",
    layer: "understanding",
    text,
    composerSeed: "これ、自分ではどう思う？",
    requiredTrust: 0,
    createdAt: new Date(),
    theme: entry.theme,
    basePriority: 0.55,
    source: "axis_insight",
  };
}

function generateBlindSpotCandidates(data: InsightDataSources): CardCandidate[] {
  if (!data.blindSpotDrop) return [];
  const drop = data.blindSpotDrop;
  if (!drop.content_body || drop.content_body.length < 10) return [];

  return [{
    id: `bs_${drop.id}`,
    type: "pattern",
    layer: "understanding",
    text: drop.content_title || drop.content_body,
    subtext: drop.content_hint ?? undefined,
    composerSeed: "この盲点、もう少し掘り下げて",
    requiredTrust: 0,
    createdAt: new Date(drop.created_at),
    theme: inferTheme(drop.content_body),
    basePriority: 0.7 + drop.intensity * 0.15,
    source: "blind_spot_drop",
  }];
}

function generateWeatherCandidates(data: InsightDataSources): CardCandidate[] {
  if (!data.innerWeather || !data.axisScores) return [];
  const w = data.innerWeather;

  // ストレス高 × 軸スコアからの示唆
  if (w.stress_level >= 0.7) {
    const hasControlTendency = axisScore(data.axisScores, "control_tendency") > 0.3;
    const text = hasControlTendency
      ? "今日はストレスが高い状態 — こういうときほど周囲を仕切りたくなりやすいかもしれない"
      : "今日はストレスが高い状態 — 判断を急がないほうがいいかもしれない";
    return [{
      id: `iw_${w.id}`,
      type: "growth_signal",
      layer: "understanding",
      text,
      subtext: "今日",
      composerSeed: "今日の調子、どう思う？",
      requiredTrust: 0,
      createdAt: new Date(w.created_at),
      theme: "疲労",
      basePriority: 0.6,
      source: "inner_weather",
    }];
  }

  // エネルギー低 × 防御モード
  if (w.energy_level <= 0.3 && w.defense_active) {
    return [{
      id: `iw_${w.id}`,
      type: "growth_signal",
      layer: "understanding",
      text: "エネルギーが低くて防御モードが入っている — 今日は無理より回復を優先したほうがいいかもしれない",
      subtext: "今日",
      composerSeed: "今日の調子、どう思う？",
      requiredTrust: 0,
      createdAt: new Date(w.created_at),
      theme: "疲労",
      basePriority: 0.55,
      source: "inner_weather",
    }];
  }

  return [];
}

/* ── Alter-Derived Generators (Additive Layer) ── */

function generateAlterCandidates(data: InsightDataSources): CardCandidate[] {
  const candidates: CardCandidate[] = [];

  // 1. Session insights (直近3セッション)
  for (const s of data.sessionSummaries.slice(0, 3)) {
    if (s.deepest_moment) {
      candidates.push({
        id: `si_${s.id}`,
        type: "session_insight",
        layer: "memory",
        text: s.deepest_moment,
        subtext: formatTimeLabel(s.summary_date),
        composerSeed: COMPOSER_SEEDS.session_insight,
        requiredTrust: 0,
        createdAt: new Date(s.created_at),
        theme: inferTheme(s.deepest_moment + " " + s.key_themes.join(" ")),
        basePriority: 0.7,
        source: "session_summary",
      });
    }

    // Follow-up hooks
    for (const hook of s.follow_up_hooks.slice(0, 1)) {
      candidates.push({
        id: `fh_${s.id}_${hook.slice(0, 8)}`,
        type: "followup_hook",
        layer: "memory",
        text: hook,
        subtext: formatTimeLabel(s.summary_date),
        composerSeed: `この前の${extractTopic(hook)}の話の続きを聞いて`,
        requiredTrust: 1,
        createdAt: new Date(s.created_at),
        theme: inferTheme(hook),
        basePriority: 0.6,
        source: "session_summary",
      });
    }

    // Contradictions
    for (const c of s.contradictions_discovered.slice(0, 1)) {
      candidates.push({
        id: `ct_${s.id}_${c.slice(0, 8)}`,
        type: "contradiction",
        layer: "understanding",
        text: c,
        subtext: formatTimeLabel(s.summary_date),
        composerSeed: COMPOSER_SEEDS.contradiction,
        requiredTrust: 2,
        createdAt: new Date(s.created_at),
        theme: inferTheme(c),
        basePriority: 0.75,
        source: "session_summary",
      });
    }
  }

  // 2. Hypotheses (active, limit 5)
  for (const h of data.hypotheses.slice(0, 5)) {
    candidates.push({
      id: `hy_${h.id}`,
      type: h.hypothesis_type === "growth_signal" ? "growth_signal" : "hypothesis",
      layer: "understanding",
      text: h.content,
      subtext: formatTimeLabel(h.last_evaluated),
      composerSeed: h.hypothesis_type === "growth_signal"
        ? COMPOSER_SEEDS.growth_signal
        : COMPOSER_SEEDS.hypothesis,
      requiredTrust: h.required_trust as TrustLevel,
      createdAt: new Date(h.created_at),
      theme: inferTheme(h.content + " " + h.domains.join(" ")),
      basePriority: 0.5 + h.confidence * 0.3,
      source: "hypothesis",
    });
  }

  // 3. Patterns (limit 3)
  for (const p of data.patterns.slice(0, 3)) {
    candidates.push({
      id: `pt_${p.id}`,
      type: "pattern",
      layer: "understanding",
      text: p.description_ja,
      subtext: formatTimeLabel(p.created_at),
      composerSeed: COMPOSER_SEEDS.pattern,
      requiredTrust: 1,
      createdAt: new Date(p.created_at),
      theme: inferTheme(p.description_ja),
      basePriority: 0.4 + p.confidence * 0.2,
      source: "pattern",
    });
  }

  // 4. Causal map → 因果仮説カード (top 3)
  for (const cm of data.causalMap.slice(0, 3)) {
    if (cm.hypothesis && cm.evidence_count >= 1) {
      candidates.push({
        id: `cm_${cm.id}`,
        type: "hypothesis",
        layer: "understanding",
        text: cm.hypothesis,
        subtext: formatTimeLabel(cm.created_at),
        composerSeed: COMPOSER_SEEDS.hypothesis,
        requiredTrust: 1,
        createdAt: new Date(cm.created_at),
        theme: inferTheme(cm.hypothesis + " " + cm.source_fact),
        basePriority: 0.45 + cm.confidence * 0.25,
        source: "causal_map",
      });
    }
  }

  return candidates;
}

function buildProphecyCandidates(data: InsightDataSources): CardCandidate[] {
  const results: CardCandidate[] = [];

  // 昨日の検証済み prophecy
  if (data.yesterdayProphecy) {
    const yp = data.yesterdayProphecy;
    const isVerified = yp.verification_status !== "pending";
    const isRejected = ["off", "opposite"].includes(yp.verification_status);

    if (isVerified) {
      const text = isRejected
        ? convertRejectedToGrowth(yp.prediction_text, yp.prediction_category)
        : yp.prediction_text;

      results.push({
        id: `pc_${yp.id}`,
        type: "prediction_cycle",
        layer: "prediction",
        text,
        subtext: isRejected ? "予測と違った — 変化の兆し" : "昨日の予測 — 的中",
        composerSeed: COMPOSER_SEEDS.prediction_cycle,
        requiredTrust: 0,
        createdAt: new Date(yp.created_at),
        theme: inferTheme(yp.prediction_text),
        verificationStatus: yp.verification_status,
        predictionConfidence: yp.prediction_confidence ?? undefined,
        basePriority: isRejected ? 0.85 : 0.8,
        source: "prophecy",
      });
    }
  }

  // 今日の prophecy は Alter 画面上部に検証UIつきで既にあるため、
  // ContextReel では重複表示しない。昨日の検証済みのみ表示。

  return results;
}

/* ═══ Gate Functions ═══ */

function trustGate(candidates: CardCandidate[], trustLevel: TrustLevel): CardCandidate[] {
  return candidates.filter((c) => c.requiredTrust <= trustLevel);
}

function freshnessGate(candidates: CardCandidate[]): CardCandidate[] {
  const now = new Date();
  return candidates.filter((c) => {
    const limitDays = FRESHNESS_LIMITS[c.type];
    if (limitDays == null) return true;
    const ageMs = now.getTime() - c.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays <= limitDays;
  });
}

/**
 * Specificity gate: 構文レベルで条件節・比較構造を要求。
 * 抽象語のみの文（「慎重です」「パターンがあります」）は除外。
 */
export function specificityGate(candidates: CardCandidate[]): CardCandidate[] {
  return candidates.filter((c) => {
    // welcome / cross_feature は構文チェック対象外
    if (c.type === "welcome" || c.type === "cross_feature") return true;
    // 観測由来カードは実データに基づくため構文チェック免除
    if (c.source === "axis_insight" || c.source === "blind_spot_drop" || c.source === "inner_weather" || c.source === "prophecy") return true;

    const text = c.text;

    // ラベル語ブラックリスト: 含んでいたら除外
    if (LABEL_BLACKLIST.some((label) => text.includes(label))) return false;

    // 条件節・比較構造のキーワードを1つ以上含むか
    const hasSpecificity = SPECIFICITY_KEYWORDS.some((kw) => text.includes(kw));

    // ~60文字以内チェック（長すぎる文は後で切る、ここでは除外しない）
    // 短すぎる文（10文字未満）は意味が薄い
    if (text.length < 10) return false;

    return hasSpecificity;
  });
}

/**
 * prediction_cycle の厳格条件:
 * - 昨日 verified/partially_verified/rejected あり OR 今日 confidence >= 0.5
 * - かつ specificity 通過済み（この前に実行）
 * - かつ 同テーマ3日連投でない
 */
function predictionStrictGate(candidates: CardCandidate[], data: InsightDataSources): CardCandidate[] {
  return candidates.filter((c) => {
    if (c.type !== "prediction_cycle") return true;

    // 昨日の検証済み or 今日の高 confidence
    if (c.verificationStatus === "pending") {
      if ((c.predictionConfidence ?? 0) < 0.5) return false;
    }

    // 同テーマ3日連投チェック
    const recentThemes = data.recentDisplayedThemes ?? [];
    const sameThemeCount = recentThemes.filter((t) => t === c.theme).length;
    if (sameThemeCount >= 3) return false;

    return true;
  });
}

/**
 * Contradiction 品質基準:
 * 判断パターンのズレのみ許可。表層発言差分は除外。
 */
function contradictionQualityGate(candidates: CardCandidate[], _data: InsightDataSources): CardCandidate[] {
  return candidates.filter((c) => {
    if (c.type !== "contradiction") return true;
    // 軸由来の矛盾/盲点はルールで品質保証済み
    if (c.source === "axis_insight" || c.source === "blind_spot_drop") return true;
    return isDeepContradiction(c.text);
  });
}

/**
 * Theme dedup: pinned と同テーマのカードは除外。
 * 直近3日で同テーマ連続 → priority 下げ（完全除外はしない）。
 */
function themeDedupGate(candidates: CardCandidate[], recentThemes: string[]): CardCandidate[] {
  return candidates.map((c) => {
    const recentCount = recentThemes.filter((t) => t === c.theme).length;
    if (recentCount >= 2) {
      return { ...c, basePriority: c.basePriority * 0.6 };
    }
    if (recentCount >= 1) {
      return { ...c, basePriority: c.basePriority * 0.85 };
    }
    return c;
  });
}

/* ═══ Scoring ═══ */

/**
 * pinned 選定用スコア = priority × surprise score
 *
 * surprise_score = (specificity + novelty + depth + actionable) / 4
 */
function computePinnedScore(c: CardCandidate, data: InsightDataSources): number {
  const specificity = computeSpecificityScore(c.text);
  const novelty = computeNoveltyScore(c, data.recentDisplayedThemes ?? []);
  const depth = computeDepthScore(c);
  const actionable = c.composerSeed ? 1.0 : 0.0;

  const surpriseScore = (specificity + novelty + depth + actionable) / 4;

  // pinned 候補の優先順ボーナス
  // 最優先: ユーザーが気づいていない矛盾/盲点（「え、なんでわかるの？」を出す）
  // 次点: 検証済み prediction（「やっぱりね」体験）
  let typeBonus = 0;
  if (c.type === "contradiction" && c.source === "axis_insight") {
    typeBonus = 0.35; // 軸矛盾/盲点が最優先 — 初回の刺さりを重視
  } else if (c.type === "prediction_cycle" && c.verificationStatus && c.verificationStatus !== "pending") {
    typeBonus = 0.3; // 検証済み prediction — 「やっぱりね」体験
  } else if (c.type === "contradiction") {
    typeBonus = 0.25; // その他の矛盾
  } else if (c.type === "session_insight") {
    typeBonus = 0.2;
  } else if (c.type === "hypothesis") {
    typeBonus = 0.1;
  }

  return c.basePriority * surpriseScore + typeBonus;
}

/** 条件節の数で specificity を 0-1 に */
function computeSpecificityScore(text: string): number {
  const count = SPECIFICITY_KEYWORDS.filter((kw) => text.includes(kw)).length;
  return Math.min(count / 3, 1.0);
}

/** 過去7日で未表示なら高い */
function computeNoveltyScore(c: CardCandidate, recentThemes: string[]): number {
  const appeared = recentThemes.filter((t) => t === c.theme).length;
  if (appeared === 0) return 1.0;
  if (appeared === 1) return 0.5;
  return 0.2;
}

/** 判断パターンレベルかどうか */
function computeDepthScore(c: CardCandidate): number {
  if (c.type === "contradiction") return 1.0; // 矛盾/盲点が最深
  if (c.type === "prediction_cycle") return 0.9; // 検証済み予測
  if (c.type === "growth_signal") return 0.8;
  if (c.type === "hypothesis") return 0.7;
  if (c.type === "session_insight") return 0.6;
  return 0.4;
}

/* ═══ Quality Functions ═══ */

/**
 * 判断パターンのズレ（深い矛盾）かどうかを判定。
 * 表層的な発言差分（「昨日ラーメン→今日うどん」的なもの）は除外。
 *
 * 深い矛盾の特徴:
 * - 判断の基準や価値観に関わる
 * - 「のに」「けれど」「一方で」等で構造的対比がある
 * - ドメインを跨ぐ矛盾（仕事では X なのに恋愛では Y）
 */
export function isDeepContradiction(text: string): boolean {
  const deepMarkers = [
    "のに", "けれど", "一方で", "にもかかわらず",
    "矛盾", "逆に", "裏腹", "むしろ",
    "なのに", "はずなのに",
  ];
  const hasStructure = deepMarkers.some((m) => text.includes(m));

  // 判断に関わるキーワード
  const judgmentMarkers = [
    "判断", "選", "決め", "優先", "避け", "本音",
    "価値", "基準", "信念", "大事", "譲れない",
  ];
  const hasJudgment = judgmentMarkers.some((m) => text.includes(m));

  return hasStructure || hasJudgment;
}

/**
 * rejected prediction を学習/変化表現に変換。
 * 「予測と違って〜」「〜は前より変わってきてる」形式。
 */
export function convertRejectedToGrowth(predictionText: string, category: string): string {
  // カテゴリ別の変換テンプレート
  const templates: Record<string, (text: string) => string> = {
    avoidance: (t) => `避けると見ていたけど、今回は向き合えていた。${extractCore(t)}は変わってきてる`,
    emotion: (t) => `予測と違って、${extractCore(t)}の感情が表に出ていた。ここは前と違う`,
    social: (t) => `社交面で予測と逆の動きがあった。${extractCore(t)}の反応が変わってきている`,
    decision: (t) => `判断のパターンが予測から外れた。${extractCore(t)}の基準が動いてるかもしれない`,
    energy: (t) => `エネルギーの使い方が予測と違った。${extractCore(t)}の配分が変わってきてる`,
    impulse: (t) => `予測と違う動きがあった。${extractCore(t)}の衝動の出方が前と違う`,
  };

  const template = templates[category] ?? templates.decision!;
  const result = template(predictionText);

  // 60文字以内に収める
  return result.length > 60 ? result.slice(0, 58) + "…" : result;
}

/* ═══ Helper Functions ═══ */

/** 時間ラベル生成（「前回」「昨日」「3日前」等） */
export function formatTimeLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (diffDays === 2) return "一昨日";
  if (diffDays <= 7) return `${diffDays}日前`;
  if (diffDays <= 14) return "先週";
  return "前回";
}

/** テーマ推定 */
function inferTheme(text: string): string {
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return theme;
  }
  return "その他";
}

/** テキストからトピック語を抽出（composerSeed 用） */
function extractTopic(text: string): string {
  // 最初の名詞的フレーズ（ひらがな/カタカナ/漢字の連続）を取る
  const match = text.match(/[一-龥ぁ-んァ-ヶ]{2,6}/);
  return match ? match[0] : "あの";
}

/** prediction text から中核フレーズを取り出す */
function extractCore(text: string): string {
  // 最初の20文字程度を抜き出す
  const trimmed = text.replace(/[。、！？]/g, " ").trim();
  const words = trimmed.split(/\s+/);
  let result = "";
  for (const w of words) {
    if ((result + w).length > 20) break;
    result += (result ? "" : "") + w;
  }
  return result || text.slice(0, 15);
}

/** welcome カード */
function buildWelcomeCard(): AlterInsightCard {
  return {
    id: "welcome",
    type: "welcome",
    layer: "prediction",
    icon: "✦",
    text: "話し始めると、あなたの考え方のクセや矛盾がここに少しずつ見えてきます",
    subtext: undefined,
    composerSeed: "最近ひっかかっていることを1つだけ教えて",
    pinned: true,
    priority: 1,
    theme: "welcome",
  };
}

/** CardCandidate → AlterInsightCard */
function toCard(c: CardCandidate, pinned: boolean): AlterInsightCard {
  const layer = LAYER_MAP[c.type];
  // テキストを60文字以内に
  const text = c.text.length > 60 ? c.text.slice(0, 58) + "…" : c.text;

  return {
    id: c.id,
    type: c.type,
    layer,
    icon: ICON_MAP[layer],
    text,
    subtext: c.subtext,
    href: c.type === "cross_feature" ? c.href : undefined,
    composerSeed: c.composerSeed || COMPOSER_SEEDS[c.type],
    pinned,
    priority: c.basePriority,
    theme: c.theme,
  };
}
