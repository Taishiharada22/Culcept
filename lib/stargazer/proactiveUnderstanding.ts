/**
 * Proactive Understanding Engine
 *
 * Alter を「聞かれたら答えるAI」から「能動的に理解を深めるAI」へ進化させる。
 * ChatGPT/Gemini は受動的応答。Alter は「予測 → 反応回収 → モデル更新 → 次の予測」のループ。
 *
 * 設計書: docs/proactive-understanding-engine.md
 *
 * 7つのコンポーネント:
 *  1. Understanding Model — 6カテゴリの理解度管理（品質加重 confidence）
 *  2. Causal Map — 事実→判断傾向への因果接続
 *  3. Trust Budget — Earned Trust + Contextual Access の2層構造
 *  4. Predictive Probe Builder — 軸スコアから予測+質問を事前計算
 *  5. Probe Scheduler — Gate構造 + Consent Gate（サブドメイン単位）
 *  6. Payback Tracker — 質問→因果マップ更新→ユーザーへの価値変換
 *  7. Expression Rules — Phase別表現制約
 *
 * ON/OFFゲート: 全機能を個別に無効化可能。CEOが実会話で最終判断。
 */

import type { TraitAxisKey } from "./traitAxes";
import type {
  TrustLevel,
  UnderstandingCategory,
  EpistemicSource,
  LifeContextEntry,
} from "./alterUnderstanding";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ON/OFF ゲート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProactiveEngineGates {
  engine_enabled: boolean;
  probe_injection_enabled: boolean;
  causal_link_injection_enabled: boolean;
  gap_injection_enabled: boolean;
  trust_tracking_enabled: boolean;
  causal_map_update_enabled: boolean;
  payback_tracking_enabled: boolean;
  // ── Phase 2 gates（デフォルト false、段階的に有効化）──
  stance_vector_enabled: boolean;          // TASK-1: StanceVector による強度調整
  continuity_filter_enabled: boolean;      // TASK-2: canAssumeContinuity フィルタ
  axis_metadata_enabled: boolean;          // TASK-3: StargazerAxis メタデータ参照
  voi_scoring_enabled: boolean;            // TASK-4: VoI によるプローブ優先度
  implicit_signal_enabled: boolean;        // TASK-5a: ImplicitSignal 検出・蓄積
  embedded_sensor_enabled: boolean;        // TASK-5b: EmbeddedSensor prompt 注入
}

export const DEFAULT_GATES: ProactiveEngineGates = {
  engine_enabled: true,
  probe_injection_enabled: true,
  causal_link_injection_enabled: true,
  gap_injection_enabled: true,
  trust_tracking_enabled: true,
  causal_map_update_enabled: true,
  payback_tracking_enabled: true,
  // Phase 2 gates — 全て false。Gate有効化スケジュールに従い段階的にtrue
  stance_vector_enabled: false,
  continuity_filter_enabled: false,
  axis_metadata_enabled: false,
  voi_scoring_enabled: false,
  implicit_signal_enabled: false,
  embedded_sensor_enabled: false,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 判定（状態ベース）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Phase = 0 | 1 | 2 | 3;

export interface PhaseInputs {
  sessions_completed: number;
  continuous_trust: number;
  earned_trust_total: number;
  self_disclosure_depth: number;
  causal_map_confidence: number;
  repair_success_rate: number;
  understanding_coverage: number;
}

/**
 * 状態ベースの Phase 判定。
 * セッション数は「必要条件」ではなく「十分条件の一部」。
 * 3回で深く信頼された場合は Phase 1 に早期遷移する。
 * repair_success_rate が 0.5 を下回ったら Phase を1つ下げる。
 */
export function derivePhase(inputs: PhaseInputs): Phase {
  const {
    sessions_completed,
    continuous_trust,
    earned_trust_total,
    self_disclosure_depth,
    causal_map_confidence,
    repair_success_rate,
    understanding_coverage,
  } = inputs;

  // 安全弁: 修復失敗率が高い場合は Phase を下げる
  // (Phase 3→2, 2→1 のデモーション)
  let maxPhase: Phase = 3;
  if (repair_success_rate < 0.5 && sessions_completed >= 6) {
    maxPhase = Math.max(0, maxPhase - 1) as Phase;
  }

  // Phase 3 判定: 3つ以上を満たす
  if (maxPhase >= 3) {
    let p3Count = 0;
    if (sessions_completed >= 12) p3Count++;
    if (earned_trust_total >= 15.0) p3Count++;
    if (understanding_coverage >= 0.5) p3Count++;
    if (causal_map_confidence >= 0.5) p3Count++;
    if (repair_success_rate >= 0.8) p3Count++;
    if (self_disclosure_depth >= 0.8) p3Count++;
    if (p3Count >= 3) return 3;
  }

  // Phase 2 判定: 2つ以上を満たす
  if (maxPhase >= 2) {
    let p2Count = 0;
    if (sessions_completed >= 6) p2Count++;
    if (earned_trust_total >= 8.0) p2Count++;
    if (self_disclosure_depth >= 0.6) p2Count++;
    if (causal_map_confidence >= 0.3) p2Count++;
    if (repair_success_rate >= 0.7) p2Count++;
    if (p2Count >= 2) return 2;
  }

  // Phase 1 判定: いずれかを満たす
  if (sessions_completed >= 3 && continuous_trust >= 0.2) return 1;
  if (earned_trust_total >= 3.0) return 1;
  if (self_disclosure_depth >= 0.4) return 1;

  return 0;
}

/**
 * Phase → 既存 TrustLevel 互換変換。
 * 既存コードが discreteTrustLevel を参照する箇所のために維持。
 */
export function phaseToTrustLevel(phase: Phase): TrustLevel {
  switch (phase) {
    case 0: return 0;
    case 1: return 1;
    case 2: return 2;
    case 3: return 4;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Understanding Model（6カテゴリ × 品質加重 confidence）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Understanding Model の6カテゴリ。
 * 既存の UnderstandingCategory (8種) とは別の抽象度。
 */
export type UMCategory =
  | "judgment"       // 判断構造、認知傾向、意思決定パターン
  | "livelihood"     // 仕事、経済状況、住居、生活リズム
  | "relationships"  // 人間関係マップ、家族、恋人、友人
  | "energy"         // 消耗源、回復源、エネルギーパターン
  | "desire"         // 欲求、恐れ、価値観、目標
  | "behavior";      // 行動パターン、習慣、ルーティン

export const UM_CATEGORIES: UMCategory[] = [
  "judgment", "livelihood", "relationships", "energy", "desire", "behavior",
];

/** 既存 UnderstandingCategory → UMCategory のマッピング */
const CATEGORY_MAP: Record<UnderstandingCategory, UMCategory> = {
  person: "relationships",
  environment: "livelihood",
  emotion: "energy",
  behavior: "behavior",
  value: "desire",
  wound: "desire",
  contradiction: "judgment",
  life_stage: "livelihood",
};

export interface QualityBreakdown {
  fact_diversity: number;
  recency: number;
  contradiction_resolved_ratio: number;
  user_stated_ratio: number;
}

export interface CategoryConfidence {
  category: UMCategory;
  confidence: number;
  fact_count: number;
  stale_count: number;
  last_updated: string;
  quality_breakdown: QualityBreakdown;
}

/**
 * fact の鮮度を計算する。30日で 0.5、90日で 0.2 程度に減衰。
 */
function freshnessWeight(lastConfirmedIso: string): number {
  const daysSince = (Date.now() - new Date(lastConfirmedIso).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1.0;
  // 指数減衰: 半減期30日
  return Math.exp(-0.0231 * daysSince);
}

/** fact 構造（LifeContextEntry + origin を持つもの） */
export interface FactForConfidence {
  source: EpistemicSource;
  origin?: CausalOrigin;
  confidence: number;
  last_confirmed: string;
  contradiction_count?: number;
  contradiction_resolved?: boolean;
  possibly_stale: boolean;
}

/**
 * 品質加重の CategoryConfidence を計算する。
 * fact_count ではなく質で確信度を決める。
 */
export function computeCategoryConfidence(
  category: UMCategory,
  facts: FactForConfidence[],
): CategoryConfidence {
  const now = new Date().toISOString();

  if (facts.length === 0) {
    return {
      category,
      confidence: 0,
      fact_count: 0,
      stale_count: 0,
      last_updated: now,
      quality_breakdown: {
        fact_diversity: 0,
        recency: 0,
        contradiction_resolved_ratio: 1.0,
        user_stated_ratio: 0,
      },
    };
  }

  // 1. fact_diversity: 情報源の種類数 / 5 (EpistemicSource の種類数)
  const uniqueSources = new Set(facts.map(f => f.source));
  const fact_diversity = uniqueSources.size / 5;

  // 2. recency: 鮮度加重平均
  const freshnessValues = facts.map(f => freshnessWeight(f.last_confirmed));
  const recency = freshnessValues.reduce((a, b) => a + b, 0) / freshnessValues.length;

  // 3. contradiction_resolved_ratio
  const contradicted = facts.filter(f => (f.contradiction_count ?? 0) > 0);
  const resolved = contradicted.filter(f => f.contradiction_resolved);
  const contradiction_resolved_ratio =
    contradicted.length === 0 ? 1.0 : resolved.length / contradicted.length;

  // 4. user_stated_ratio
  const userStatedCount = facts.filter(
    f => f.source === "user_stated" || f.origin === "user_stated",
  ).length;
  const user_stated_ratio = userStatedCount / facts.length;

  // 加重合計
  const quality_score =
    fact_diversity * 0.15 +
    recency * 0.25 +
    contradiction_resolved_ratio * 0.25 +
    user_stated_ratio * 0.35;

  // 量の補正: 3個未満のみペナルティ
  const quantity_floor = Math.min(facts.length / 3, 1.0);

  const confidence = quality_score * quantity_floor;
  const stale_count = facts.filter(f => f.possibly_stale).length;

  // last_updated: facts の中で最も新しい last_confirmed
  const lastUpdated = facts
    .map(f => f.last_confirmed)
    .sort()
    .pop() ?? now;

  return {
    category,
    confidence: Math.min(1, Math.max(0, confidence)),
    fact_count: facts.length,
    stale_count,
    last_updated: lastUpdated,
    quality_breakdown: { fact_diversity, recency, contradiction_resolved_ratio, user_stated_ratio },
  };
}

export interface GapAnalysis {
  weakest_category: UMCategory;
  weakest_confidence: number;
  weakest_quality_axis: keyof QualityBreakdown;
  second_weakest_category: UMCategory | null;
  second_weakest_confidence: number | null;
}

/**
 * 6カテゴリの confidence を計算し、最も弱いカテゴリと品質軸を特定する。
 */
export function analyzeUnderstandingGaps(
  allConfidences: CategoryConfidence[],
): GapAnalysis {
  const sorted = [...allConfidences].sort((a, b) => a.confidence - b.confidence);
  const weakest = sorted[0];
  const secondWeakest = sorted.length > 1 ? sorted[1] : null;

  // 最も弱い品質軸を特定
  const qb = weakest.quality_breakdown;
  const axes: Array<keyof QualityBreakdown> = [
    "fact_diversity", "recency", "contradiction_resolved_ratio", "user_stated_ratio",
  ];
  const weakestAxis = axes.reduce((min, axis) =>
    qb[axis] < qb[min] ? axis : min,
  );

  return {
    weakest_category: weakest.category,
    weakest_confidence: weakest.confidence,
    weakest_quality_axis: weakestAxis,
    second_weakest_category: secondWeakest?.category ?? null,
    second_weakest_confidence: secondWeakest?.confidence ?? null,
  };
}

/**
 * 既存の LifeContextEntry[] を UMCategory ごとに分類して confidence を計算。
 */
export function computeAllCategoryConfidences(
  entries: LifeContextEntry[],
): CategoryConfidence[] {
  const grouped = new Map<UMCategory, FactForConfidence[]>();
  for (const cat of UM_CATEGORIES) {
    grouped.set(cat, []);
  }

  for (const entry of entries) {
    const umCat = CATEGORY_MAP[entry.category] ?? "behavior";
    grouped.get(umCat)!.push({
      source: entry.source,
      confidence: entry.confidence,
      last_confirmed: entry.last_confirmed,
      possibly_stale: entry.possibly_stale,
      contradiction_count: 0,
      contradiction_resolved: false,
    });
  }

  return UM_CATEGORIES.map(cat =>
    computeCategoryConfidence(cat, grouped.get(cat)!),
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Causal Map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CausalOrigin =
  | "archetype_prior"
  | "conversation_observed"
  | "user_stated";

export type CausalInfluence = "amplify" | "suppress" | "context";

export interface CausalLink {
  id: string;
  user_id: string;
  source_fact: string;
  target_axis: TraitAxisKey;
  influence: CausalInfluence;
  hypothesis: string;
  origin: CausalOrigin;
  confidence: number;
  evidence_count: number;
  contradiction_count: number;
  last_confirmed_at: string;
  created_at: string;
  updated_at: string;
}

/** origin 別の confidence 上限 */
const ORIGIN_CONFIDENCE_LIMITS: Record<CausalOrigin, { initial: number; max: number }> = {
  archetype_prior: { initial: 0.15, max: 0.3 },
  conversation_observed: { initial: 0.3, max: 0.7 },
  user_stated: { initial: 0.7, max: 0.95 },
};

/**
 * 新しい CausalLink を生成する（confidence は origin に基づいて初期化）。
 */
export function createCausalLink(params: {
  user_id: string;
  source_fact: string;
  target_axis: TraitAxisKey;
  influence: CausalInfluence;
  hypothesis: string;
  origin: CausalOrigin;
}): Omit<CausalLink, "id" | "created_at" | "updated_at"> {
  const limits = ORIGIN_CONFIDENCE_LIMITS[params.origin];
  const now = new Date().toISOString();
  return {
    ...params,
    confidence: limits.initial,
    evidence_count: 0,
    contradiction_count: 0,
    last_confirmed_at: now,
  };
}

/**
 * 新しい証拠が見つかった場合に CausalLink の confidence を更新する。
 */
export function addEvidenceToCausalLink(link: CausalLink): CausalLink {
  const limits = ORIGIN_CONFIDENCE_LIMITS[link.origin];
  const newConfidence = Math.min(
    limits.max,
    link.confidence + 0.1,
  );
  return {
    ...link,
    confidence: newConfidence,
    evidence_count: link.evidence_count + 1,
    last_confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * 矛盾する証拠が見つかった場合に CausalLink の confidence を更新する。
 */
export function addContradictionToCausalLink(link: CausalLink): CausalLink {
  const newConfidence = Math.max(0.1, link.confidence - 0.2);
  return {
    ...link,
    confidence: newConfidence,
    contradiction_count: link.contradiction_count + 1,
    updated_at: new Date().toISOString(),
  };
}

/**
 * 仮説反転フラグの判定。
 * contradiction_count > evidence_count の場合、仮説を反転させるべき。
 */
export function shouldReverseHypothesis(link: CausalLink): boolean {
  return link.contradiction_count > link.evidence_count && link.contradiction_count >= 2;
}

/**
 * 90日以上未確認の CausalLink の confidence を漸減させる。
 */
export function decayCausalLinkConfidence(link: CausalLink): CausalLink {
  const daysSince = (Date.now() - new Date(link.last_confirmed_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 90) return link;
  return {
    ...link,
    confidence: link.confidence * 0.8,
    updated_at: new Date().toISOString(),
  };
}

/**
 * 今ターンの話題に関連する CausalLink を抽出する（prompt 圧縮用）。
 * 最大 maxLinks 本を confidence 降順で返す。
 */
export function selectRelevantCausalLinks(
  links: CausalLink[],
  targetCategories: UMCategory[],
  detectedDomain: TrustDomain | null,
  maxLinks: number = 5,
  /** continuity_filter_enabled 時に渡す — canAssumeContinuity でフィルタ */
  continuityParams?: {
    consent: SubdomainConsent[];
    context: CurrentTopicContext;
  },
): CausalLink[] {
  // カテゴリに関連する軸のセット（簡易マッピング）
  const relevantAxes = new Set<string>();

  // ドメイン→軸の関連付け
  if (detectedDomain) {
    const domainAxisMap: Record<TrustDomain, string[]> = {
      career: ["analytical_vs_intuitive", "perfectionist_vs_pragmatic", "plan_vs_spontaneous", "locus_of_control"],
      relationship: ["intimacy_pace", "boundary_awareness", "attachment_style", "relationship_mode_split"],
      identity: ["independence_vs_harmony", "growth_mindset", "shame_vs_guilt", "locus_of_control"],
      health: ["stress_isolation_vs_social", "emotional_regulation", "rumination_tendency", "energy_rhythm"],
      daily: ["plan_vs_spontaneous", "function_vs_expression", "minimal_vs_maximal", "decision_tempo"],
      creative: ["tradition_vs_novelty", "exploration_closure", "abstract_structuring", "novelty_threshold"],
    };
    for (const axis of domainAxisMap[detectedDomain] ?? []) {
      relevantAxes.add(axis);
    }
  }

  // カテゴリ→軸の関連付け
  for (const cat of targetCategories) {
    const catAxisMap: Record<UMCategory, string[]> = {
      judgment: ["analytical_vs_intuitive", "decision_tempo", "cognitive_updating", "exploration_closure"],
      livelihood: ["plan_vs_spontaneous", "perfectionist_vs_pragmatic", "locus_of_control"],
      relationships: ["intimacy_pace", "boundary_awareness", "attachment_style", "social_initiative"],
      energy: ["stress_isolation_vs_social", "emotional_regulation", "energy_rhythm"],
      desire: ["growth_mindset", "independence_vs_harmony", "change_embrace_vs_resist"],
      behavior: ["plan_vs_spontaneous", "function_vs_expression", "self_disclosure_depth"],
    };
    for (const axis of catAxisMap[cat] ?? []) {
      relevantAxes.add(axis);
    }
  }

  // continuity フィルタ: canAssumeContinuity で継続仮説の妥当性を検証
  const continuityFiltered = continuityParams
    ? links.filter(l => canAssumeContinuity(l, continuityParams.consent, continuityParams.context))
    : links;

  // フィルタリング + ソート
  const relevant = continuityFiltered
    .filter(l => relevantAxes.has(l.target_axis))
    .sort((a, b) => b.confidence - a.confidence);

  if (relevant.length > 0) {
    return relevant.slice(0, maxLinks);
  }

  // 関連軸がなければ confidence 上位を返す（continuity フィルタは適用済み）
  return [...continuityFiltered]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxLinks);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Continuity Filter（前提選択の明示判定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 会話の文脈情報。extractCurrentTopics で抽出される。
 * canAssumeContinuity の contextual relevance 判定に使用。
 */
export interface CurrentTopicContext {
  /** 抽出されたトピック群（キーワード） */
  topics: string[];
  /** 活性化されたドメイン */
  active_domains: TrustDomain[];
  /** 話題に関連する軸 */
  active_axes: TraitAxisKey[];
  /** 0-1: 抽出の確信度。< 0.3 で canAssumeContinuity は全拒否 */
  extraction_confidence: number;
}

/**
 * message + 直近発話 + 軸スコアから現在の文脈を抽出する。
 * 3層ロジック: ドメイン検出 → 軸マッチ → 文脈連続性。
 *
 * @param classifiedDomain - classifyQuestion() の結果（循環依存を避けるため呼び出し側で渡す）
 */
export function extractCurrentTopics(
  message: string,
  recentMessages: string[],
  axisScores: Partial<Record<TraitAxisKey, number>>,
  classifiedDomain?: TrustDomain | null,
): CurrentTopicContext {
  // Layer 1: ドメイン検出（classifyQuestion の結果を優先、フォールバックとしてキーワード）
  const detectedDomains: TrustDomain[] = [];
  if (classifiedDomain) {
    detectedDomains.push(classifiedDomain);
  }
  // キーワードベースの追加検出（classifiedDomain と重複する場合は追加しない）
  const domainKeywords: Record<TrustDomain, RegExp> = {
    career: /仕事|キャリア|転職|上司|職場|会社|ビジネス|同僚|部下|就活|昇進|年収|給料|退職/,
    relationship: /恋人|彼氏|彼女|夫|妻|パートナー|片思い|デート|告白|結婚|離婚|浮気|友達|友人|親友|人間関係|ママ友/,
    identity: /自分|性格|価値観|生き方|人生|アイデンティティ|目標|夢|向いて|才能|強み|弱み/,
    health: /体調|健康|メンタル|うつ|不安|ストレス|疲れ|眠れ|食欲|運動|病院|薬/,
    daily: /日常|習慣|ルーティン|予定|スケジュール|買い物|家事|料理|掃除|趣味/,
    creative: /創作|デザイン|音楽|アート|写真|文章|ブログ|作品|表現|クリエイティブ/,
  };
  const allDomains: TrustDomain[] = ["career", "relationship", "identity", "health", "daily", "creative"];
  for (const domain of allDomains) {
    if (!detectedDomains.includes(domain) && domainKeywords[domain].test(message)) {
      detectedDomains.push(domain);
    }
  }

  // Layer 2: 軸マッチ（STARGAZER_AXES の label + probe_seeds から動的キーワード照合）
  const activeAxes: TraitAxisKey[] = [];
  for (const [axisKey, axisMeta] of Object.entries(STARGAZER_AXES)) {
    // probe_seeds のキーワード断片と照合
    if (axisMeta.probe_seeds.length > 0) {
      const seedMatch = axisMeta.probe_seeds.some(seed => {
        // seed から2文字以上のキーワード断片を抽出して照合
        const fragments = seed.replace(/[？?！!。、,.「」]/g, " ").split(/\s+/).filter(w => w.length >= 2);
        return fragments.some(f => message.includes(f));
      });
      if (seedMatch) {
        activeAxes.push(axisKey as TraitAxisKey);
        continue;
      }
    }
    // label のキーワード照合
    const labelFragments = axisMeta.label.replace(/\s*vs\s*/gi, " ").split(/\s+/).filter(w => w.length >= 2);
    if (labelFragments.some(f => message.includes(f))) {
      activeAxes.push(axisKey as TraitAxisKey);
    }
  }

  // 旧 axisKeywordMap による補完マッチ（STARGAZER_AXES で拾えなかったキーワード用）
  const axisKeywordMap: Partial<Record<TraitAxisKey, RegExp>> = {
    cautious_vs_bold: /大胆|慎重|リスク|チャレンジ|冒険|安全|賭け/,
    analytical_vs_intuitive: /分析|論理|直感|感覚|データ|ロジック|理屈/,
    introvert_vs_extrovert: /一人|内向|外向|社交|人付き合い|ぼっち/,
    plan_vs_spontaneous: /計画|予定|その場|柔軟|準備|段取り/,
    stress_isolation_vs_social: /ストレス.*(?:一人|人)|疲れ.*(?:一人|人)|回復/,
    intimacy_pace: /距離感|距離|近づ|親密|仲良く/,
    attachment_style: /愛着|依存|甘え|頼[るり]|見捨て/,
    conflict_style: /喧嘩|対立|衝突|言い合い|ぶつか/,
    emotional_regulation: /感情.*コントロール|怒り|イライラ|キレ|抑え/,
    boundary_awareness: /境界|断[るり]|NOと言|嫌と言/,
    locus_of_control: /自分次第|運|環境|コントロール|自己責任/,
    growth_mindset: /成長|変[わえ]|努力|限界|伸び/,
  };
  for (const [axis, pattern] of Object.entries(axisKeywordMap)) {
    if (pattern && !activeAxes.includes(axis as TraitAxisKey) && pattern.test(message)) {
      activeAxes.push(axis as TraitAxisKey);
    }
  }

  // axisScores で観測済み軸を active_axes に追加（confidence 0.3以上のもの）
  const domainCategoryMap: Record<string, string[]> = {
    career: ["judgment", "livelihood"],
    relationship: ["relationships"],
    identity: ["desire", "energy"],
    health: ["energy"],
    daily: ["behavior"],
    creative: ["desire", "behavior"],
  };
  for (const [axis, score] of Object.entries(axisScores)) {
    if (score !== undefined && score >= 0.3 && !activeAxes.includes(axis as TraitAxisKey)) {
      // 観測済み軸はドメインと関連する場合のみ追加
      const axisMeta = STARGAZER_AXES[axis as TraitAxisKey];
      if (axisMeta && detectedDomains.length > 0) {
        const relatedCategories = detectedDomains.flatMap(d => domainCategoryMap[d] ?? []);
        if (relatedCategories.includes(axisMeta.category)) {
          activeAxes.push(axis as TraitAxisKey);
        }
      }
    }
  }

  // Layer 3: 文脈連続性（直近3発話のドメイン一致度）
  let domainContinuity = 0;
  if (detectedDomains.length > 0 && recentMessages.length > 0) {
    let matchCount = 0;
    for (const recent of recentMessages.slice(-3)) {
      for (const domain of detectedDomains) {
        if (domainKeywords[domain].test(recent)) {
          matchCount++;
          break;
        }
      }
    }
    domainContinuity = matchCount / Math.min(recentMessages.length, 3);
  }

  // extraction_confidence: ドメイン検出 + 軸マッチ + 文脈連続性の複合
  const domainSignal = detectedDomains.length > 0 ? 0.4 : 0;
  const axisSignal = Math.min(activeAxes.length * 0.1, 0.3);
  const continuitySignal = domainContinuity * 0.3;
  const extraction_confidence = Math.min(1, domainSignal + axisSignal + continuitySignal);

  // トピックキーワード抽出（簡易: message から助詞等を除いた名詞的断片）
  const topics = message
    .replace(/[？?！!。、,.]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10);

  return {
    topics,
    active_domains: detectedDomains,
    active_axes: activeAxes,
    extraction_confidence,
  };
}

/**
 * 因果リンクが現在の会話文脈と関連するかを判定する。
 * target_axis または source_fact が currentTopics と重なるか確認。
 */
export function isContextuallyRelevant(
  link: CausalLink,
  context: CurrentTopicContext,
): boolean {
  // active_axes に直接含まれる場合
  if (context.active_axes.includes(link.target_axis)) {
    return true;
  }

  // active_domains から軸への間接マッチ
  const domainAxisMap: Record<TrustDomain, string[]> = {
    career: ["analytical_vs_intuitive", "perfectionist_vs_pragmatic", "plan_vs_spontaneous", "locus_of_control"],
    relationship: ["intimacy_pace", "boundary_awareness", "attachment_style", "relationship_mode_split", "conflict_style"],
    identity: ["independence_vs_harmony", "growth_mindset", "shame_vs_guilt", "locus_of_control", "self_disclosure_depth"],
    health: ["stress_isolation_vs_social", "emotional_regulation", "rumination_tendency", "energy_rhythm"],
    daily: ["plan_vs_spontaneous", "function_vs_expression", "minimal_vs_maximal", "decision_tempo"],
    creative: ["tradition_vs_novelty", "exploration_closure", "abstract_structuring", "novelty_threshold"],
  };
  for (const domain of context.active_domains) {
    if (domainAxisMap[domain]?.includes(link.target_axis)) {
      return true;
    }
  }

  // source_fact のキーワードが topics と重なる場合
  const factWords = link.source_fact.toLowerCase().split(/[\s/→]+/);
  for (const topic of context.topics) {
    if (factWords.some(fw => fw.includes(topic.toLowerCase()) || topic.toLowerCase().includes(fw))) {
      return true;
    }
  }

  return false;
}

/**
 * 因果リンクの継続仮説を使ってよいかを5条件で判定する。
 * continuity_filter_enabled gate が false なら常に true を返す。
 */
export function canAssumeContinuity(
  link: CausalLink,
  consent: SubdomainConsent[],
  context: CurrentTopicContext,
): boolean {
  // 品質基準: extraction_confidence が低すぎる場合は継続仮説を使わない
  if (context.extraction_confidence < 0.3) {
    return false;
  }

  // 条件1: confidence が十分高い（decay 適用済み想定）
  if (link.confidence < 0.6) {
    return false;
  }

  // 条件2: consent チェック（revoked なら使わない）
  const linkSubdomain = domainToDefaultSubdomain(
    categoryToDomain(categoryFromAxis(link.target_axis)),
  );
  if (isSensitiveSubdomain(linkSubdomain)) {
    const consentRecord = consent.find(c => c.subdomain === linkSubdomain);
    if (!consentRecord || consentRecord.status === "revoked" || consentRecord.status === "none") {
      return false;
    }
  }

  // 条件3: contextual relevance（今の会話文脈と関連するか）
  if (!isContextuallyRelevant(link, context)) {
    return false;
  }

  // 条件4: archetype_prior は高信頼のみ
  if (link.origin === "archetype_prior" && link.confidence < 0.8) {
    return false;
  }

  return true;
}

/**
 * TraitAxisKey から UMCategory を推定する（簡易マッピング）。
 */
function categoryFromAxis(axis: TraitAxisKey): UMCategory {
  const mapping: Partial<Record<TraitAxisKey, UMCategory>> = {
    analytical_vs_intuitive: "judgment",
    decision_tempo: "judgment",
    cognitive_updating: "judgment",
    exploration_closure: "judgment",
    cautious_vs_bold: "judgment",
    plan_vs_spontaneous: "behavior",
    perfectionist_vs_pragmatic: "livelihood",
    locus_of_control: "judgment",
    intimacy_pace: "relationships",
    boundary_awareness: "relationships",
    attachment_style: "relationships",
    social_initiative: "relationships",
    relationship_mode_split: "relationships",
    conflict_style: "relationships",
    relational_investment: "relationships",
    stress_isolation_vs_social: "energy",
    emotional_regulation: "energy",
    energy_rhythm: "energy",
    rumination_tendency: "energy",
    growth_mindset: "desire",
    independence_vs_harmony: "desire",
    change_embrace_vs_resist: "desire",
    function_vs_expression: "behavior",
    self_disclosure_depth: "behavior",
    introvert_vs_extrovert: "behavior",
  };
  return mapping[axis] ?? "behavior";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trust Budget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TrustDomain =
  | "career"
  | "relationship"
  | "identity"
  | "health"
  | "daily"
  | "creative";

export const TRUST_DOMAINS: TrustDomain[] = [
  "career", "relationship", "identity", "health", "daily", "creative",
];

export type TrustEventType =
  | "voluntary_deep_disclosure"
  | "question_answered_detail"
  | "prediction_confirmed"
  | "repair_succeeded"
  | "correction_accepted_quickly"
  | "question_ignored"
  | "correction_unresolved"
  | "prediction_rejected"
  | "ban_violation"
  | "consent_overstepped";

const TRUST_EVENT_WEIGHTS: Record<TrustEventType, number> = {
  voluntary_deep_disclosure: 2.0,
  question_answered_detail: 1.0,
  prediction_confirmed: 1.5,
  repair_succeeded: 1.0,
  correction_accepted_quickly: 0.5,
  question_ignored: -0.5,
  correction_unresolved: -1.5,
  prediction_rejected: -1.0,
  ban_violation: -3.0,
  consent_overstepped: -2.0,
};

export interface TrustEvent {
  id: string;
  user_id: string;
  domain: TrustDomain;
  event_type: TrustEventType;
  weight: number;
  session_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EarnedTrust {
  domain: TrustDomain;
  score: number;
}

export interface ContextualAccess {
  domain: TrustDomain;
  level: number;
  last_active: string;
}

/** ドメイン別の Contextual Access 日次減衰率 */
const CONTEXTUAL_DECAY_RATES: Record<TrustDomain, number> = {
  career: 0.02,
  relationship: 0.03,
  health: 0.04,
  identity: 0.01,
  daily: 0.05,
  creative: 0.02,
};

/**
 * TrustEvent を作成する。
 */
export function createTrustEvent(params: {
  user_id: string;
  domain: TrustDomain;
  event_type: TrustEventType;
  session_id: string;
  metadata?: Record<string, unknown>;
}): Omit<TrustEvent, "id"> {
  return {
    ...params,
    weight: TRUST_EVENT_WEIGHTS[params.event_type],
    metadata: params.metadata ?? {},
    created_at: new Date().toISOString(),
  };
}

/**
 * Earned Trust を更新する（イベントリストから集計）。
 * 減衰なし。累積のみ。
 */
export function computeEarnedTrust(events: TrustEvent[]): EarnedTrust[] {
  const scores = new Map<TrustDomain, number>();
  for (const d of TRUST_DOMAINS) {
    scores.set(d, 0);
  }
  for (const event of events) {
    const current = scores.get(event.domain) ?? 0;
    scores.set(event.domain, current + event.weight);
  }
  return TRUST_DOMAINS.map(d => ({
    domain: d,
    score: Math.max(0, scores.get(d)!),
  }));
}

/**
 * Contextual Access を時間減衰で更新する。
 */
export function decayContextualAccess(access: ContextualAccess): ContextualAccess {
  const daysSince =
    (Date.now() - new Date(access.last_active).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return access;

  const rate = CONTEXTUAL_DECAY_RATES[access.domain];
  const newLevel = Math.max(0, access.level - rate * daysSince);
  return { ...access, level: newLevel };
}

/**
 * ユーザーの自発的言及で Contextual Access を回復する。
 */
export function restoreContextualAccess(
  access: ContextualAccess,
  isUserInitiated: boolean,
): ContextualAccess {
  return {
    ...access,
    level: isUserInitiated ? 0.8 : 0.6,
    last_active: new Date().toISOString(),
  };
}

/**
 * 重大イベント（転職、別れた等）で Contextual Access をリセットする。
 */
export function resetContextualAccessForEvent(
  access: ContextualAccess,
  resetLevel: number = 0.2,
): ContextualAccess {
  return {
    ...access,
    level: resetLevel,
    last_active: new Date().toISOString(),
  };
}

/**
 * Earned Trust の全ドメイン合計を算出する。
 */
export function totalEarnedTrust(trusts: EarnedTrust[]): number {
  return trusts.reduce((sum, t) => sum + t.score, 0);
}

/**
 * 「違う」の処理 — 修復成功の判定。
 * 返すイベントタイプを判定する。
 */
export function classifyRepairOutcome(params: {
  correctionMade: boolean;
  userContinuedToNextTopic: boolean;
  userRequestedFurtherCorrection: boolean;
}): TrustEventType {
  if (params.correctionMade && params.userContinuedToNextTopic) {
    return "repair_succeeded";
  }
  if (params.correctionMade && params.userRequestedFurtherCorrection) {
    return "correction_accepted_quickly"; // ネットで prediction_rejected も加わる
  }
  return "correction_unresolved";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Consent Gate（サブドメイン単位）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ConsentSubdomain =
  | "relationship/romance"
  | "relationship/family"
  | "relationship/friendship"
  | "relationship/professional"
  | "health/mental"
  | "health/body"
  | "health/habits"
  | "identity/wound"
  | "identity/sexuality"
  | "identity/values"
  | "career"
  | "daily"
  | "creative";

export const SENSITIVE_SUBDOMAINS: ConsentSubdomain[] = [
  "relationship/romance",
  "relationship/family",
  "health/mental",
  "health/body",
  "identity/wound",
  "identity/sexuality",
];

export type ConsentStatus = "none" | "implicit" | "explicit" | "revoked";

export interface SubdomainConsent {
  subdomain: ConsentSubdomain;
  status: ConsentStatus;
  updated_at: string;
  cooldown_until: string | null;
}

/**
 * サブドメインが sensitive かどうかを判定する。
 */
export function isSensitiveSubdomain(subdomain: ConsentSubdomain): boolean {
  return SENSITIVE_SUBDOMAINS.includes(subdomain);
}

/**
 * TrustDomain → デフォルト ConsentSubdomain のマッピング。
 * サブドメインを持たない domain はそのまま返す。
 */
export function domainToDefaultSubdomain(domain: TrustDomain): ConsentSubdomain {
  return domain as ConsentSubdomain;
}

/**
 * Consent Gate の通過判定。
 */
export function checkConsentGate(
  subdomain: ConsentSubdomain,
  consent: SubdomainConsent | null,
  currentSessionIndex: number,
  sessionOfLastConsent: number,
): { passed: boolean; reason: string } {
  // sensitive でなければ常に通過
  if (!isSensitiveSubdomain(subdomain)) {
    return { passed: true, reason: "non_sensitive_subdomain" };
  }

  // consent レコードがない → ブロック
  if (!consent) {
    return { passed: false, reason: "no_consent_record" };
  }

  // revoked → 完全ブロック
  if (consent.status === "revoked") {
    return { passed: false, reason: "consent_revoked" };
  }

  // cooldown チェック
  if (consent.cooldown_until) {
    const cooldownEnd = new Date(consent.cooldown_until);
    if (cooldownEnd > new Date()) {
      return { passed: false, reason: "consent_cooldown" };
    }
  }

  // explicit: 過去3セッション以内
  if (consent.status === "explicit") {
    if (currentSessionIndex - sessionOfLastConsent <= 3) {
      return { passed: true, reason: "explicit_consent_recent" };
    }
    return { passed: false, reason: "explicit_consent_expired" };
  }

  // implicit: 過去1セッション以内
  if (consent.status === "implicit") {
    if (currentSessionIndex - sessionOfLastConsent <= 1) {
      return { passed: true, reason: "implicit_consent_recent" };
    }
    return { passed: false, reason: "implicit_consent_expired" };
  }

  // none → ブロック
  return { passed: false, reason: "no_consent" };
}

/**
 * ユーザーが自発的に話題を出した場合に consent を更新する。
 */
export function grantExplicitConsent(subdomain: ConsentSubdomain): SubdomainConsent {
  return {
    subdomain,
    status: "explicit",
    updated_at: new Date().toISOString(),
    cooldown_until: null,
  };
}

/**
 * Alter の質問に対してユーザーが深めた場合の implicit consent。
 */
export function grantImplicitConsent(subdomain: ConsentSubdomain): SubdomainConsent {
  return {
    subdomain,
    status: "implicit",
    updated_at: new Date().toISOString(),
    cooldown_until: null,
  };
}

/**
 * ユーザーが話題を変えた/無視した場合。3セッション cooldown。
 */
export function setConsentCooldown(
  subdomain: ConsentSubdomain,
  cooldownSessions: number = 3,
): SubdomainConsent {
  // セッション数ベースのcooldownを日数に換算（1セッション≈1日と仮定）
  const cooldownMs = cooldownSessions * 24 * 60 * 60 * 1000;
  return {
    subdomain,
    status: "none",
    updated_at: new Date().toISOString(),
    cooldown_until: new Date(Date.now() + cooldownMs).toISOString(),
  };
}

/**
 * ユーザーが明示的に拒否した場合。
 */
export function revokeConsent(subdomain: ConsentSubdomain): SubdomainConsent {
  return {
    subdomain,
    status: "revoked",
    updated_at: new Date().toISOString(),
    cooldown_until: null,
  };
}

/**
 * 親ドメイン全体の revoke が全サブドメインに波及する。
 */
export function revokeParentDomain(domain: TrustDomain): SubdomainConsent[] {
  const subdomainPrefixes: Record<string, ConsentSubdomain[]> = {
    relationship: [
      "relationship/romance", "relationship/family",
      "relationship/friendship", "relationship/professional",
    ],
    health: ["health/mental", "health/body", "health/habits"],
    identity: ["identity/wound", "identity/sexuality", "identity/values"],
  };

  const subs = subdomainPrefixes[domain];
  if (!subs) {
    return [revokeConsent(domain as ConsentSubdomain)];
  }

  return subs.map(sub => revokeConsent(sub));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StargazerAxis（軸の自己記述 — 追加時にAlterへ自動伝播）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 各軸が自身のメタデータを持つ。
 * 新しい軸を追加する際、これらのフィールドを埋めないと型エラーになる。
 * probe_seeds が空の軸は既存テンプレートにフォールバック。
 */
export interface StargazerAxis {
  id: TraitAxisKey;
  label: string;
  category: UMCategory;
  /** 設計時に想定する因果接続候補（observed links は CausalMap に蓄積） */
  causal_affinity_prior: TraitAxisKey[];
  /** この軸を深掘りする質問の種 */
  probe_seeds: string[];
  sensitivity: "low" | "medium" | "high";
  /** この軸に触れるのに必要な最低信頼スコア */
  min_trust_to_probe: number;
}

/**
 * 優先18軸のフルメタデータ + 残り軸のスタブ。
 * Phase 1: judgment / relationships / energy / desire / identity の重要軸
 * Phase 2 で残り軸を追加予定。
 */
export const STARGAZER_AXES: Record<TraitAxisKey, StargazerAxis> = {
  // ── judgment カテゴリ (5軸) ──
  cautious_vs_bold: {
    id: "cautious_vs_bold",
    label: "慎重 vs 大胆",
    category: "judgment",
    causal_affinity_prior: ["locus_of_control", "decision_tempo", "decision_regret"],
    probe_seeds: [
      "大きな決断をする時、最終的に何が背中を押す？",
      "リスクがある選択肢と安全な選択肢、どっちを選ぶ時の自分の癖ってある？",
      "最近「やめとこう」と思ったことで、後から気になったことはある？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  analytical_vs_intuitive: {
    id: "analytical_vs_intuitive",
    label: "分析型 vs 直感型",
    category: "judgment",
    causal_affinity_prior: ["decision_tempo", "abstract_structuring", "cognitive_updating"],
    probe_seeds: [
      "重要なことを決める時、情報を集めてから動く？それとも感覚で先に動く？",
      "直感で「これだ」と思った時と、じっくり考えた時、どっちの判断が当たってる？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  decision_tempo: {
    id: "decision_tempo",
    label: "判断の速度",
    category: "judgment",
    causal_affinity_prior: ["analytical_vs_intuitive", "cautious_vs_bold", "plan_vs_spontaneous"],
    probe_seeds: [
      "決断のスピードって自分で速い方だと思う？遅い方？",
      "迷っている時間が長いと、どんな気持ちになる？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  locus_of_control: {
    id: "locus_of_control",
    label: "統制の所在",
    category: "judgment",
    causal_affinity_prior: ["cautious_vs_bold", "growth_mindset", "shame_vs_guilt"],
    probe_seeds: [
      "うまくいった時、自分の力だと思う？環境やタイミングだと思う？",
      "失敗した時、自分を責める方？仕方ないと思う方？",
    ],
    sensitivity: "medium",
    min_trust_to_probe: 1.0,
  },
  exploration_closure: {
    id: "exploration_closure",
    label: "探索 vs 収束",
    category: "judgment",
    causal_affinity_prior: ["analytical_vs_intuitive", "tradition_vs_novelty", "decision_tempo"],
    probe_seeds: [
      "選択肢がたくさんある時、ワクワクする？それとも早く絞りたい？",
      "調べれば調べるほど迷うタイプ？それとも見えてくるタイプ？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },

  // ── relationships カテゴリ (5軸) ──
  introvert_vs_extrovert: {
    id: "introvert_vs_extrovert",
    label: "内向 vs 外向",
    category: "relationships",
    causal_affinity_prior: ["social_initiative", "stress_isolation_vs_social", "energy_rhythm"],
    probe_seeds: [
      "人と長時間一緒にいた後、エネルギーは増えてる？減ってる？",
      "週末、予定がない方がホッとする？それとも寂しい？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  attachment_style: {
    id: "attachment_style",
    label: "愛着スタイル",
    category: "relationships",
    causal_affinity_prior: ["intimacy_pace", "boundary_awareness", "reassurance_need"],
    probe_seeds: [
      "大切な人がちょっと連絡くれない時、どんな気持ちになる？",
      "人に頼ることと頼られること、どっちが自然にできる？",
    ],
    sensitivity: "high",
    min_trust_to_probe: 2.0,
  },
  conflict_style: {
    id: "conflict_style",
    label: "対立の処し方",
    category: "relationships",
    causal_affinity_prior: ["direct_vs_diplomatic", "emotional_regulation", "boundary_awareness"],
    probe_seeds: [
      "意見がぶつかった時、言い返す方？一旦引く方？",
      "喧嘩の後、自分から謝る方？相手が来るのを待つ方？",
    ],
    sensitivity: "medium",
    min_trust_to_probe: 1.0,
  },
  intimacy_pace: {
    id: "intimacy_pace",
    label: "親密化のペース",
    category: "relationships",
    causal_affinity_prior: ["attachment_style", "self_disclosure_depth", "boundary_awareness"],
    probe_seeds: [
      "新しい人と仲良くなるのに、時間がかかる方？すぐ打ち解ける方？",
      "心を開くまでに必要なものって何だと思う？",
    ],
    sensitivity: "medium",
    min_trust_to_probe: 1.0,
  },
  boundary_awareness: {
    id: "boundary_awareness",
    label: "境界線の意識",
    category: "relationships",
    causal_affinity_prior: ["conflict_style", "attachment_style", "direct_vs_diplomatic"],
    probe_seeds: [
      "嫌な頼まれごとを断るのは得意？苦手？",
      "自分の時間や空間を守ることって、大事にしてる？",
    ],
    sensitivity: "medium",
    min_trust_to_probe: 1.0,
  },

  // ── energy カテゴリ (3軸) ──
  stress_isolation_vs_social: {
    id: "stress_isolation_vs_social",
    label: "ストレス時の回復方法",
    category: "energy",
    causal_affinity_prior: ["introvert_vs_extrovert", "emotional_regulation", "energy_rhythm"],
    probe_seeds: [
      "すごく疲れた日の夜、一人で過ごしたい？誰かに会いたい？",
      "ストレスが溜まった時の自分なりのリセット方法ってある？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  energy_rhythm: {
    id: "energy_rhythm",
    label: "エネルギーのリズム",
    category: "energy",
    causal_affinity_prior: ["stress_isolation_vs_social", "plan_vs_spontaneous", "rumination_tendency"],
    probe_seeds: [
      "1日の中で一番調子がいい時間帯ってある？",
      "エネルギーが切れる時って、どんな兆候がある？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  emotional_regulation: {
    id: "emotional_regulation",
    label: "感情の調整力",
    category: "energy",
    causal_affinity_prior: ["rumination_tendency", "conflict_style", "stress_isolation_vs_social"],
    probe_seeds: [
      "感情が揺れた時、立て直すのにどれくらいかかる方？",
      "怒りとか悲しみって、自分の中でどう処理してる？",
    ],
    sensitivity: "high",
    min_trust_to_probe: 2.0,
  },

  // ── desire カテゴリ (3軸) ──
  growth_mindset: {
    id: "growth_mindset",
    label: "成長志向",
    category: "desire",
    causal_affinity_prior: ["locus_of_control", "change_embrace_vs_resist", "independence_vs_harmony"],
    probe_seeds: [
      "今の自分を変えたいと思うことってある？それとも今のままがいい？",
      "失敗から学べたと実感した経験ってある？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  independence_vs_harmony: {
    id: "independence_vs_harmony",
    label: "自立 vs 調和",
    category: "desire",
    causal_affinity_prior: ["individual_vs_social", "conflict_style", "boundary_awareness"],
    probe_seeds: [
      "自分のやりたいことと周りの期待がぶつかった時、どうする？",
      "「空気を読む」ことって、自分にとって自然なこと？それとも疲れること？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },
  change_embrace_vs_resist: {
    id: "change_embrace_vs_resist",
    label: "変化への姿勢",
    category: "desire",
    causal_affinity_prior: ["growth_mindset", "tradition_vs_novelty", "cautious_vs_bold"],
    probe_seeds: [
      "生活にいきなり変化が起きた時、ワクワクする方？不安になる方？",
      "「変わりたい」と「このままでいたい」、今はどっちが強い？",
    ],
    sensitivity: "low",
    min_trust_to_probe: 0,
  },

  // ── identity カテゴリ (2軸) ──
  shame_vs_guilt: {
    id: "shame_vs_guilt",
    label: "恥 vs 罪悪感",
    category: "desire",
    causal_affinity_prior: ["locus_of_control", "rumination_tendency", "attachment_style"],
    probe_seeds: [
      "失敗した時、「自分がダメだ」と思う？「あの行動が悪かった」と思う？",
      "人に見られたくない自分の一面ってある？",
    ],
    sensitivity: "high",
    min_trust_to_probe: 2.0,
  },
  self_disclosure_depth: {
    id: "self_disclosure_depth",
    label: "自己開示の深さ",
    category: "behavior",
    causal_affinity_prior: ["intimacy_pace", "introvert_vs_extrovert", "boundary_awareness"],
    probe_seeds: [
      "本音を話せる相手って、何人くらいいる？",
      "自分のことを話す時、どこまで話すか線引きしてる？",
    ],
    sensitivity: "medium",
    min_trust_to_probe: 1.0,
  },

  // ── 残り軸（Phase 2 でフルメタデータ追加予定、暫定スタブ）──
  individual_vs_social: { id: "individual_vs_social", label: "個人 vs 集団", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  plan_vs_spontaneous: { id: "plan_vs_spontaneous", label: "計画 vs 即興", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  tradition_vs_novelty: { id: "tradition_vs_novelty", label: "伝統 vs 新奇", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  direct_vs_diplomatic: { id: "direct_vs_diplomatic", label: "直接的 vs 外交的", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  function_vs_expression: { id: "function_vs_expression", label: "機能性 vs 表現性", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  minimal_vs_maximal: { id: "minimal_vs_maximal", label: "ミニマル vs マキシマル", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  perfectionist_vs_pragmatic: { id: "perfectionist_vs_pragmatic", label: "完璧主義 vs 実利主義", category: "livelihood", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  quality_vs_quantity: { id: "quality_vs_quantity", label: "質 vs 量", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  classic_vs_trendy: { id: "classic_vs_trendy", label: "クラシック vs トレンド", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  reassurance_need: { id: "reassurance_need", label: "安心欲求", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  emotional_variability: { id: "emotional_variability", label: "感情の振れ幅", category: "energy", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  social_initiative: { id: "social_initiative", label: "社交の主導性", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  relationship_mode_split: { id: "relationship_mode_split", label: "関係モード分裂", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  boundary_respect: { id: "boundary_respect", label: "境界線の尊重", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  consent_maturity: { id: "consent_maturity", label: "同意の成熟度", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  pressure_risk: { id: "pressure_risk", label: "圧力リスク", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  escalation_risk: { id: "escalation_risk", label: "エスカレーションリスク", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  friend_mode_fit: { id: "friend_mode_fit", label: "友人モード適合", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  intent_stability: { id: "intent_stability", label: "意図の安定性", category: "judgment", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  rejection_response_maturity: { id: "rejection_response_maturity", label: "拒絶反応の成熟度", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  control_tendency: { id: "control_tendency", label: "支配傾向", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  exclusivity_pressure: { id: "exclusivity_pressure", label: "排他性圧力", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  long_term_shift_risk: { id: "long_term_shift_risk", label: "長期変化リスク", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  public_private_gap: { id: "public_private_gap", label: "公私ギャップ", category: "behavior", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  rumination_tendency: { id: "rumination_tendency", label: "反芻傾向", category: "energy", causal_affinity_prior: [], probe_seeds: [], sensitivity: "high", min_trust_to_probe: 2.0 },
  fairness_sensitivity: { id: "fairness_sensitivity", label: "公正感度", category: "judgment", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  abstract_structuring: { id: "abstract_structuring", label: "抽象構造化", category: "judgment", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  decomposition: { id: "decomposition", label: "分解能力", category: "judgment", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  cognitive_updating: { id: "cognitive_updating", label: "認知更新", category: "judgment", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  social_modeling: { id: "social_modeling", label: "社会的モデリング", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  novelty_threshold: { id: "novelty_threshold", label: "新奇性閾値", category: "desire", causal_affinity_prior: [], probe_seeds: [], sensitivity: "low", min_trust_to_probe: 0 },
  decision_regret: { id: "decision_regret", label: "判断の後悔", category: "judgment", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
  relational_investment: { id: "relational_investment", label: "関係への投資", category: "relationships", causal_affinity_prior: [], probe_seeds: [], sensitivity: "medium", min_trust_to_probe: 1.0 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Predictive Probe Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ProbeType = "prediction_led" | "reflective" | "direct";

export type ProbeScope =
  | "utterance_local"
  | "session_pattern"
  | "cross_session"
  | "deep_model";

export interface PredictiveProbe {
  prediction: string;
  prediction_basis: string;
  probe: string;
  probe_type: ProbeType;
  scope: ProbeScope;
  target_category: UMCategory;
  target_domain: TrustDomain;
  target_subdomain: ConsentSubdomain;
  causal_connection: string;
  trust_cost: number;
  requires_consent: boolean;
  skip_safe: boolean;
}

/** Phase 別の scope 制限 */
const PHASE_SCOPE_LIMITS: Record<Phase, ProbeScope[]> = {
  0: ["utterance_local"],
  1: ["utterance_local", "session_pattern"],
  2: ["utterance_local", "session_pattern", "cross_session"],
  3: ["utterance_local", "session_pattern", "cross_session", "deep_model"],
};

/** Phase 別の最大 probe 数/セッション */
const PHASE_MAX_PROBES: Record<Phase, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
};

/**
 * UMCategory → TrustDomain のマッピング
 */
function categoryToDomain(cat: UMCategory): TrustDomain {
  switch (cat) {
    case "judgment": return "identity";
    case "livelihood": return "career";
    case "relationships": return "relationship";
    case "energy": return "health";
    case "desire": return "identity";
    case "behavior": return "daily";
  }
}

/**
 * UMCategory → デフォルト ConsentSubdomain のマッピング
 */
function categoryToSubdomain(cat: UMCategory): ConsentSubdomain {
  switch (cat) {
    case "judgment": return "identity/values";
    case "livelihood": return "career";
    case "relationships": return "relationship/friendship";
    case "energy": return "health/habits";
    case "desire": return "identity/values";
    case "behavior": return "daily";
  }
}

/**
 * quality_breakdown の最弱軸に基づいて質問戦略を決定する。
 */
function probeStrategyFromQualityAxis(axis: keyof QualityBreakdown): {
  probe_type: ProbeType;
  strategy: string;
} {
  switch (axis) {
    case "user_stated_ratio":
      return { probe_type: "prediction_led", strategy: "直接確認で user_stated を増やす" };
    case "contradiction_resolved_ratio":
      return { probe_type: "reflective", strategy: "矛盾を提示して解消を促す" };
    case "recency":
      return { probe_type: "prediction_led", strategy: "最新状況を確認する" };
    case "fact_diversity":
      return { probe_type: "prediction_led", strategy: "異なる情報源からの情報を増やす" };
  }
}

/**
 * 軸スコアから予測テキストを事前計算する（LLM不使用）。
 */
export function generatePredictionFromAxis(
  axisKey: TraitAxisKey,
  score: number,
): { prediction: string; basis: string } | null {
  // 主要な軸についてのみ予測テンプレートを持つ
  const templates: Partial<Record<TraitAxisKey, { high: string; low: string }>> = {
    analytical_vs_intuitive: {
      high: "構造を自分で作れる仕事や状況が合いそう",
      low: "感覚で動ける環境の方が力を発揮しそう",
    },
    introvert_vs_extrovert: {
      high: "人と関わる場面でエネルギーが充電される",
      low: "一人の時間がエネルギー源になっている",
    },
    plan_vs_spontaneous: {
      high: "計画を立ててから動く方が安心する",
      low: "状況に合わせて柔軟に動く方が自然",
    },
    stress_isolation_vs_social: {
      high: "ストレス時に人と話すことで回復する",
      low: "疲れた時は一人になることで回復する",
    },
    perfectionist_vs_pragmatic: {
      high: "妥協するより完成度を上げたい",
      low: "完璧さより前に進むことを重視する",
    },
    independence_vs_harmony: {
      high: "周囲との調和を重んじる",
      low: "自分の考えを優先して動く",
    },
    change_embrace_vs_resist: {
      high: "変化を恐れず新しいことに飛び込む",
      low: "安定した環境で力を発揮する",
    },
    growth_mindset: {
      high: "努力で自分を変えられると信じている",
      low: "持って生まれた特性を重視する",
    },
    attachment_style: {
      high: "人との距離感に安定感がある",
      low: "親密さと距離感の間で揺れやすい",
    },
    locus_of_control: {
      high: "結果は自分の行動次第だと考える",
      low: "環境や運の影響を強く感じる",
    },
    emotional_regulation: {
      high: "感情のコントロールが安定している",
      low: "感情に振り回されやすい面がある",
    },
    energy_rhythm: {
      high: "安定したエネルギーリズムで過ごせる",
      low: "エネルギーの浮き沈みが大きい",
    },
  };

  const template = templates[axisKey];
  if (!template) return null;

  const prediction = score >= 0 ? template.high : template.low;
  const basis = `${axisKey}: ${score.toFixed(2)}`;
  return { prediction, basis };
}

/**
 * Predictive Probe を構築する。
 * 入力: Understanding Model の gap analysis + 軸スコア + Phase
 */
export function buildPredictiveProbe(params: {
  gap: GapAnalysis;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  phase: Phase;
  causalLinks: CausalLink[];
  /** VoI 用: カテゴリ別 confidence（voi_scoring_enabled 時に使用） */
  categoryConfidences?: { category: UMCategory; confidence: number }[];
  /** VoI 用: 今の会話コンテキスト（voi_scoring_enabled 時に使用） */
  activeDecisionContext?: string | null;
  /** VoI gate */
  voiEnabled?: boolean;
}): PredictiveProbe | null {
  const { gap, axisScores, phase, causalLinks, categoryConfidences, activeDecisionContext, voiEnabled } = params;
  const allowedScopes = PHASE_SCOPE_LIMITS[phase];

  // gap の最弱カテゴリに関連する軸を探す
  const targetCategory = gap.weakest_category;
  const domain = categoryToDomain(targetCategory);
  const subdomain = categoryToSubdomain(targetCategory);

  // 関連する CausalLink から軸を探す
  const relevantLinks = causalLinks.filter(
    l => l.confidence >= 0.2,
  );

  // 軸スコアから予測を生成
  let bestPrediction: { prediction: string; basis: string } | null = null;
  let bestAxisKey: TraitAxisKey | null = null;

  // VoI スコアリングが有効な場合: 候補を全収集し、VoI 最大の軸を選択
  if (voiEnabled && categoryConfidences) {
    const confidenceMap = new Map(categoryConfidences.map(c => [c.category, c.confidence]));

    type Candidate = { axisKey: TraitAxisKey; pred: { prediction: string; basis: string }; voi: number };
    const candidates: Candidate[] = [];

    // CausalLink の target_axis から候補を収集
    for (const link of relevantLinks) {
      const score = axisScores[link.target_axis];
      if (score !== undefined) {
        const pred = generatePredictionFromAxis(link.target_axis, score);
        if (pred) {
          const axisMeta = STARGAZER_AXES[link.target_axis];
          const axisConf = confidenceMap.get(axisMeta.category) ?? 0;
          const voi = computeValueOfInformation(axisMeta, axisConf, activeDecisionContext ?? null);
          candidates.push({ axisKey: link.target_axis, pred, voi });
        }
      }
    }

    // 軸スコア全体からも候補を収集
    for (const [key, score] of Object.entries(axisScores)) {
      const axisKey = key as TraitAxisKey;
      if (score !== undefined && !candidates.some(c => c.axisKey === axisKey)) {
        const pred = generatePredictionFromAxis(axisKey, score);
        if (pred) {
          const axisMeta = STARGAZER_AXES[axisKey];
          const axisConf = confidenceMap.get(axisMeta.category) ?? 0;
          const voi = computeValueOfInformation(axisMeta, axisConf, activeDecisionContext ?? null);
          candidates.push({ axisKey, pred, voi });
        }
      }
    }

    // VoI 最大の候補を選択
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.voi - a.voi);
      bestPrediction = candidates[0].pred;
      bestAxisKey = candidates[0].axisKey;
    }
  } else {
    // 既存ロジック: CausalLink 優先 → 軸スコア順
    for (const link of relevantLinks) {
      const score = axisScores[link.target_axis];
      if (score !== undefined) {
        const pred = generatePredictionFromAxis(link.target_axis, score);
        if (pred) {
          bestPrediction = pred;
          bestAxisKey = link.target_axis;
          break;
        }
      }
    }

    if (!bestPrediction) {
      for (const [key, score] of Object.entries(axisScores)) {
        if (score !== undefined) {
          const pred = generatePredictionFromAxis(key as TraitAxisKey, score);
          if (pred) {
            bestPrediction = pred;
            bestAxisKey = key as TraitAxisKey;
            break;
          }
        }
      }
    }
  }

  if (!bestPrediction || !bestAxisKey) return null;

  // probe_type は品質軸から決定
  const strategy = probeStrategyFromQualityAxis(gap.weakest_quality_axis);

  // scope は Phase で制限
  let scope: ProbeScope = "utterance_local";
  if (phase >= 2 && gap.weakest_confidence < 0.3) {
    scope = "cross_session";
  } else if (phase >= 1) {
    scope = "session_pattern";
  }
  if (!allowedScopes.includes(scope)) {
    scope = allowedScopes[allowedScopes.length - 1];
  }

  // 質問テキスト生成（axis_metadata_enabled 時は probe_seeds 優先）
  const probeText = generateProbeText(
    targetCategory, bestPrediction.prediction, strategy.strategy,
    bestAxisKey ?? undefined,
  );

  const requiresConsent = isSensitiveSubdomain(subdomain);

  return {
    prediction: bestPrediction.prediction,
    prediction_basis: bestPrediction.basis,
    probe: probeText,
    probe_type: strategy.probe_type,
    scope,
    target_category: targetCategory,
    target_domain: domain,
    target_subdomain: subdomain,
    causal_connection: `${bestAxisKey} → ${targetCategory}`,
    trust_cost: requiresConsent ? 2.0 : 1.0,
    requires_consent: requiresConsent,
    skip_safe: requiresConsent,
  };
}

/**
 * カテゴリ + 予測 + 戦略から質問テキストを生成する。
 * axis_metadata_enabled 時: 軸の probe_seeds を優先使用。seeds が空ならカテゴリテンプレートにフォールバック。
 */
function generateProbeText(
  category: UMCategory,
  prediction: string,
  _strategy: string,
  /** axis_metadata_enabled 時に渡す — probe_seeds 優先使用 */
  targetAxisKey?: TraitAxisKey,
): string {
  // probe_seeds 優先パス: 軸メタデータから質問の種を取得
  if (targetAxisKey) {
    const axisMeta = STARGAZER_AXES[targetAxisKey];
    if (axisMeta && axisMeta.probe_seeds.length > 0) {
      const seed = axisMeta.probe_seeds[Math.floor(Math.random() * axisMeta.probe_seeds.length)];
      // seed + prediction を組み合わせて質問を構築
      return `${seed}　——ここまでの話から、${prediction}って読んでるんだけど、どう？`;
    }
  }

  // フォールバック: カテゴリ別テンプレート
  const templates: Record<UMCategory, string[]> = {
    judgment: [
      "判断の仕方を見てると、{prediction}。実際のところ、大きな決断ではどうしてる？",
      "ここまでの話から、{prediction}って読んでるんだけど、どう？",
    ],
    livelihood: [
      "{prediction}って印象なんだけど、普段の仕事だとどんな感じ？",
      "今の生活の中で、{prediction}。その辺り、もう少し聞いていい？",
    ],
    relationships: [
      "人との関わり方を見てると、{prediction}。身近な人とはどう？",
      "{prediction}って感じがするんだけど、大切な人との間ではどうだろう",
    ],
    energy: [
      "エネルギーの使い方を見てると、{prediction}。最近の調子はどう？",
      "{prediction}って読んでるんだけど、回復の仕方は合ってる？",
    ],
    desire: [
      "奥にあるものを読むと、{prediction}。自分ではどう感じてる？",
      "{prediction}って方向に見えてるんだけど、本音はどう？",
    ],
    behavior: [
      "行動パターンを見てると、{prediction}。自覚はある？",
      "{prediction}って傾向が見えるんだけど、日常ではどう？",
    ],
  };

  const pool = templates[category];
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template.replace("{prediction}", prediction);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VoI (Value of Information) スコアリング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸の「聞く価値」を定量化する。
 * gap（未知度）× causalReach（因果接続数）× contextBonus（今の会話との関連性）
 */
export function computeValueOfInformation(
  axis: StargazerAxis,
  currentConfidence: number,
  activeDecisionContext: string | null,
): number {
  const gap = 1 - Math.max(0, Math.min(1, currentConfidence));
  const causalReach = axis.causal_affinity_prior.length;
  const contextBonus = activeDecisionContext
    && axis.causal_affinity_prior.some(a => a.includes(activeDecisionContext))
    ? 1.5
    : 1.0;
  return gap * (causalReach / 10) * contextBonus;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Probe Scheduler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProbeSchedulerInput {
  probe: PredictiveProbe;
  phase: Phase;
  earnedTrust: EarnedTrust[];
  contextualAccess: ContextualAccess[];
  consent: SubdomainConsent[];
  frustrationLevel: number;
  probesThisSession: number;
  lastProbeTimestamp: string | null;
  currentSessionIndex: number;
  sessionOfLastConsent: number;
}

export interface ProbeSchedulerResult {
  approved: boolean;
  blocked_by: string | null;
  probe: PredictiveProbe | null;
}

/**
 * Probe Scheduler: 6つの Gate を順番に通過させる。
 * 1つでもブロックされたら probe は注入されない。
 */
export function scheduleProbe(input: ProbeSchedulerInput): ProbeSchedulerResult {
  const {
    probe, phase, earnedTrust, contextualAccess, consent,
    frustrationLevel, probesThisSession, lastProbeTimestamp,
    currentSessionIndex, sessionOfLastConsent,
  } = input;

  // Session Phase Gate: scope が Phase で許可されているか
  const allowedScopes = PHASE_SCOPE_LIMITS[phase];
  if (!allowedScopes.includes(probe.scope)) {
    return { approved: false, blocked_by: "phase_scope_gate", probe: null };
  }

  // Phase Gate: probe 数制限
  const maxProbes = PHASE_MAX_PROBES[phase];
  if (probesThisSession >= maxProbes) {
    return { approved: false, blocked_by: "phase_frequency_gate", probe: null };
  }

  // G1: Earned Trust >= ドメイン別閾値
  // FIX-2: 浅いプローブ (utterance_local) は earned trust ゼロでも許可
  // 新規ユーザーでも「予測付き直答」を出せるようにする
  const domainTrust = earnedTrust.find(t => t.domain === probe.target_domain);
  const isShallowScope = probe.scope === "utterance_local";
  const trustThreshold = probe.requires_consent ? 3.0 : isShallowScope ? 0 : 1.0;
  if (!domainTrust && !isShallowScope) {
    return { approved: false, blocked_by: "G1_earned_trust", probe: null };
  }
  if (domainTrust && domainTrust.score < trustThreshold) {
    return { approved: false, blocked_by: "G1_earned_trust", probe: null };
  }

  // G2: Contextual Access が有効 OR 質問の深度が浅い
  const domainAccess = contextualAccess.find(a => a.domain === probe.target_domain);
  const isShallowProbe = probe.scope === "utterance_local" || probe.scope === "session_pattern";
  if (domainAccess && domainAccess.level < 0.1 && !isShallowProbe) {
    return { approved: false, blocked_by: "G2_contextual_access", probe: null };
  }

  // G3: ユーザーが探索モード（frustration < 2）
  if (frustrationLevel >= 2) {
    return { approved: false, blocked_by: "G3_frustration", probe: null };
  }

  // G4: 前回の probe から十分な間隔
  if (lastProbeTimestamp) {
    const minutesSinceLast =
      (Date.now() - new Date(lastProbeTimestamp).getTime()) / (1000 * 60);
    const minInterval = phase <= 1 ? 10 : 5; // Phase 0-1 は10分、Phase 2-3 は5分
    if (minutesSinceLast < minInterval) {
      return { approved: false, blocked_by: "G4_probe_interval", probe: null };
    }
  }

  // G5: 深い質問 → skip_safe フラグ確認（ロジック側は自動付与済み）

  // G6: Consent Gate（sensitive domain）
  if (probe.requires_consent) {
    const subdomainConsent = consent.find(c => c.subdomain === probe.target_subdomain);
    const consentResult = checkConsentGate(
      probe.target_subdomain,
      subdomainConsent ?? null,
      currentSessionIndex,
      sessionOfLastConsent,
    );
    if (!consentResult.passed) {
      return { approved: false, blocked_by: `G6_consent:${consentResult.reason}`, probe: null };
    }
  }

  return { approved: true, blocked_by: null, probe };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Payback Tracker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PendingPayback {
  source_probe_id: string;
  fact_id: string;
  causal_links: string[];
  used_in_sessions: string[];
  first_used_at: string | null;
}

/**
 * 新しい payback を作成する（質問で情報を得た時）。
 */
export function createPendingPayback(
  probeId: string,
  factId: string,
  causalLinkIds: string[],
): PendingPayback {
  return {
    source_probe_id: probeId,
    fact_id: factId,
    causal_links: causalLinkIds,
    used_in_sessions: [],
    first_used_at: null,
  };
}

/**
 * payback が使われた時に記録する。
 */
export function markPaybackUsed(
  payback: PendingPayback,
  sessionId: string,
): PendingPayback {
  return {
    ...payback,
    used_in_sessions: [...payback.used_in_sessions, sessionId],
    first_used_at: payback.first_used_at ?? new Date().toISOString(),
  };
}

/**
 * 未使用の payback（ユーザーに価値として返されていない情報）を検出する。
 */
export function findUnusedPaybacks(paybacks: PendingPayback[]): PendingPayback[] {
  return paybacks.filter(p => p.used_in_sessions.length === 0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StanceVector（断言強度の共通ベクトル）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Candor Policy の共通言語。
 * Expression Rules / Predictive Probe / assumption selection の3箇所が
 * 同じベクトルを受け取ることで、断言強度の一貫性を保つ。
 */
export interface StanceVector {
  /** 0-1: 断言の強さ（0=最大限に留保、1=完全断言） */
  assertion_intensity: number;
  /** 0-1: 留保の許容度（0=一切留保しない、1=常に留保を付ける） */
  hedge_allowance: number;
  /** 0-1: 仮説の大胆さ（0=確実なことしか言わない、1=推測でも踏み込む） */
  assumption_boldness: number;
}

/**
 * Phase × personality × trust × mood から StanceVector を算出する。
 * personality の boldScore/socialScore が高い → assertion を上げる。
 * mood が negative → assertion を抑制する。
 */
export function computeStanceVector(
  phase: Phase,
  personality: { boldScore?: number; socialScore?: number } | null,
  domainTrustScore: number,
  mood: "positive" | "neutral" | "negative" | null,
): StanceVector {
  // Phase ベースライン
  const phaseBaseline: Record<Phase, StanceVector> = {
    0: { assertion_intensity: 0.2, hedge_allowance: 0.8, assumption_boldness: 0.15 },
    1: { assertion_intensity: 0.35, hedge_allowance: 0.6, assumption_boldness: 0.3 },
    2: { assertion_intensity: 0.55, hedge_allowance: 0.4, assumption_boldness: 0.5 },
    3: { assertion_intensity: 0.75, hedge_allowance: 0.2, assumption_boldness: 0.7 },
  };

  const base = { ...phaseBaseline[phase] };

  // Personality 調整（boldScore: 0-1 の想定）
  if (personality) {
    const bold = personality.boldScore ?? 0.5;
    const social = personality.socialScore ?? 0.5;
    // 大胆な人 → assertion を上げる（最大 +0.15）
    base.assertion_intensity += (bold - 0.5) * 0.3;
    // 社交的な人 → hedge を減らす（最大 -0.1）
    base.hedge_allowance -= (social - 0.5) * 0.2;
    // 大胆な人 → 仮説も大胆に（最大 +0.1）
    base.assumption_boldness += (bold - 0.5) * 0.2;
  }

  // Trust 調整（domainTrustScore: 0-5 の想定）
  const trustNormalized = Math.min(domainTrustScore / 5, 1);
  base.assertion_intensity += trustNormalized * 0.1;
  base.assumption_boldness += trustNormalized * 0.1;

  // Mood 調整
  if (mood === "negative") {
    base.assertion_intensity -= 0.1;
    base.hedge_allowance += 0.1;
  } else if (mood === "positive") {
    base.assertion_intensity += 0.05;
  }

  // Clamp to [0, 1]
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    assertion_intensity: clamp(base.assertion_intensity),
    hedge_allowance: clamp(base.hedge_allowance),
    assumption_boldness: clamp(base.assumption_boldness),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Expression Rules（Phase別表現制約）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExpressionRules {
  phase: Phase;
  allowed_hedges: string[];
  forbidden_patterns: string[];
  /** Phase 0 で特に禁止するキーワード（リテラル一致） */
  forbidden_keywords: string[];
  max_confidence_expression: string;
  /** Candor Policy: 断言強度の共通ベクトル（stance_vector_enabled 時に使用） */
  stance?: StanceVector;
}

const EXPRESSION_RULES: Record<Phase, ExpressionRules> = {
  0: {
    phase: 0,
    allowed_hedges: ["〜に見える", "今の言い方だと〜", "〜かもしれない"],
    forbidden_patterns: [
      "あなたは〜だ", "絶対に", "間違いなく", "〜に決まっている",
      "〜するべきだ", "性格的に", "パターンとして",
      "深層〜", "内面データ〜", "〜を分析する",
    ],
    forbidden_keywords: [
      // CEO実会話で問題になった表現
      "霧", "変人", "混沌",
      // 過剰な性格読解
      "深層心理", "内面の奥", "潜在意識", "無意識のうちに",
      // 抽象解釈（具体性ゼロの逃げ表現）
      "情報を集める", "まず整理", "深く掘り下げ",
    ],
    max_confidence_expression: "今の言い方だと〜に見える",
  },
  1: {
    phase: 1,
    allowed_hedges: ["〜に見える", "〜かもしれない", "もしかすると"],
    forbidden_patterns: [
      "あなたは〜だ", "絶対に", "間違いなく", "〜に決まっている",
      "〜するべきだ",
    ],
    forbidden_keywords: ["霧", "変人", "混沌"],
    max_confidence_expression: "〜に見える",
  },
  2: {
    phase: 2,
    allowed_hedges: ["〜だと思う", "〜の傾向がある", "〜寄りに見えてる"],
    forbidden_patterns: [
      "あなたは〜だ", "絶対に", "間違いなく", "〜に決まっている",
      "〜するべきだ",
    ],
    forbidden_keywords: ["霧", "変人"],
    max_confidence_expression: "〜だと思う",
  },
  3: {
    phase: 3,
    allowed_hedges: ["かなり確信がある", "ほぼ間違いないと思ってる", "ズレてたら教えて"],
    forbidden_patterns: [
      "あなたは〜だ", "絶対に", "間違いなく", "〜に決まっている",
      "〜するべきだ",  // Phase 3 でも禁止
    ],
    forbidden_keywords: [],
    max_confidence_expression: "かなり確信がある。ズレてたら教えて",
  },
};

/**
 * 現在の Phase に対応する Expression Rules を取得する。
 */
export function getExpressionRules(phase: Phase): ExpressionRules {
  return EXPRESSION_RULES[phase];
}

/**
 * Alter の応答が Expression Rules に違反していないかチェックする。
 * forbidden_patterns（正規表現）と forbidden_keywords（リテラル一致）の両方をチェック。
 */
export function checkExpressionViolations(
  response: string,
  phase: Phase,
): { passed: boolean; violations: string[] } {
  const rules = EXPRESSION_RULES[phase];
  const violations: string[] = [];

  for (const pattern of rules.forbidden_patterns) {
    const regex = new RegExp(pattern.replace(/〜/g, ".+?"));
    if (regex.test(response)) {
      violations.push(pattern);
    }
  }

  for (const keyword of rules.forbidden_keywords) {
    if (response.includes(keyword)) {
      violations.push(`[keyword] ${keyword}`);
    }
  }

  return { passed: violations.length === 0, violations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt 注入（圧縮済み）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProactivePromptInput {
  phase: Phase;
  gap: GapAnalysis;
  probe: PredictiveProbe | null;
  relevantLinks: CausalLink[];
  expressionRules: ExpressionRules;
  gates: ProactiveEngineGates;
  currentMessage: string;
  /** PRO-5: Consent status for LLM visibility */
  consent?: SubdomainConsent[];
  /** Candor Policy: 断言強度の共通ベクトル */
  stance?: StanceVector;
  /** 気づきセンサー: 返答に織り込む仮説（TASK-5b） */
  embeddedSensor?: EmbeddedSensor | null;
}

/**
 * EmbeddedSensor — 返答の中に仮説を織り込み、反応を観測する。
 * 1返答1仮説を厳守（影の声1回答1箇所制約と同一原則）。
 */
export interface EmbeddedSensor {
  hypothesis: string;
  target_axis: TraitAxisKey;
  confidence: number;
  style: "assert" | "question" | "muse" | "metaphor";
}

/**
 * EmbeddedSensor を構築する。
 * probe が scheduler で blocked されたとき、返答に仮説を織り込む形で観測する。
 * 1返答1仮説を厳守。
 *
 * @returns null — sensor を埋め込むべきでない場合（probe 通過済み、候補なし等）
 */
export function buildEmbeddedSensor(params: {
  stance: StanceVector;
  /** probe 候補（scheduler でブロックされた元の probe） */
  blockedProbe: PredictiveProbe | null;
  phase: Phase;
  /** 今の会話の active_axes（extractCurrentTopics から取得） */
  activeAxes?: TraitAxisKey[];
  /** 感情温度（0-1）— 高い場合は sensor を抑制 */
  emotionalTemperature?: number;
  /** ユーザーが明確な指示/直答を求めている場合 true */
  isDirectAnswerContext?: boolean;
}): EmbeddedSensor | null {
  const { stance, blockedProbe, phase, activeAxes, emotionalTemperature, isDirectAnswerContext } = params;

  // probe がない（候補自体がなかった）場合は sensor も出さない
  if (!blockedProbe) return null;

  // 抑制: 感情的に高ぶっている場面では sensor を出さない
  if (emotionalTemperature !== undefined && emotionalTemperature > 0.7) return null;

  // 抑制: 明確な直答を求めている場面では sensor を出さない
  if (isDirectAnswerContext) return null;

  // Phase 0 では assertion が低い → muse / metaphor 寄り
  const intensity = stance.assertion_intensity;

  // style 決定: stance の assertion_intensity に連動
  let style: EmbeddedSensor["style"];
  if (intensity > 0.7) {
    style = "assert";
  } else if (intensity > 0.4) {
    style = "question";
  } else if (intensity > 0.2) {
    style = "muse";
  } else {
    style = "metaphor";
  }

  // target_axis: blockedProbe の causal_connection から軸を抽出
  const axisMatch = blockedProbe.causal_connection.split("→")[0]?.trim() as TraitAxisKey | undefined;
  const targetAxis = axisMatch && STARGAZER_AXES[axisMatch]
    ? axisMatch
    : null;

  if (!targetAxis) return null;

  // activeAxes があり、target_axis が会話コンテキストに含まれない場合は抑制
  if (activeAxes && activeAxes.length > 0 && !activeAxes.includes(targetAxis)) {
    return null;
  }

  // probe_seeds から仮説を生成
  const axisMeta = STARGAZER_AXES[targetAxis];
  const seeds = axisMeta.probe_seeds;

  let hypothesis: string;
  if (seeds.length > 0) {
    // probe_seeds の中からランダムに1つ選び、仮説として整形
    hypothesis = seeds[Math.floor(Math.random() * seeds.length)];
  } else {
    // seeds がない場合は prediction をそのまま使う
    hypothesis = blockedProbe.prediction;
  }

  // confidence は blockedProbe の prediction_basis に含まれる軸スコアの絶対値で近似
  const scoreMatch = blockedProbe.prediction_basis.match(/([-\d.]+)$/);
  const confidence = scoreMatch ? Math.min(1, Math.abs(parseFloat(scoreMatch[1]))) : 0.3;

  return {
    hypothesis,
    target_axis: targetAxis,
    confidence,
    style,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 大問い検出 + 1文目仮説強制
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 大問い（人生、大切なもの、向いていること等）を検出する正規パターン */
const BIG_QUESTION_PATTERNS = [
  /何が大切/,
  /何が大事/,
  /何が必要/,
  /何が合って/,
  /どっちが向いて/,
  /何をすべき/,
  /人生.*(?:おいて|にとって|で)/,
  /私.*(?:どう|何).*(?:すべき|するべき|したらいい|がいい)/,
  /今の私に.*(?:必要|大切|大事)/,
  /本当に.*(?:合って|向いて)/,
  /具体的に.*(?:教えて|話して|答えて)/,
  /早く答え/,
  /これだ.*(?:は|って).*どれ/,
  /どういう.*(?:合って|あってる|向いて|がいい|がベスト)/,
  /どんな.*(?:合って|あってる|向いて|がいい|がベスト)/,
];

/**
 * ユーザーの発言が「大問い」かどうかを検出する。
 * 大問いには1文目で仮説的結論を必ず返さなければならない。
 */
export function detectBigQuestion(message: string): boolean {
  return BIG_QUESTION_PATTERNS.some(p => p.test(message));
}

/**
 * Proactive Understanding Engine の system prompt ブロックを構築する。
 * 圧縮済み: top-1 probe, top 1-2 gaps, relevant causal links only。
 */
export function buildProactivePromptBlock(input: ProactivePromptInput): string {
  const { phase, gap, probe, relevantLinks, expressionRules, gates, currentMessage, consent, stance, embeddedSensor } = input;

  if (!gates.engine_enabled) return "";

  const lines: string[] = [];
  lines.push("[Proactive Understanding — 今ターン]");
  lines.push(`Phase: ${phase}`);

  // Gap 情報（top 1-2）
  if (gates.gap_injection_enabled) {
    let gapLine = `理解の薄い領域: ${gap.weakest_category}(${gap.weakest_confidence.toFixed(2)})`;
    if (gap.second_weakest_category && gap.second_weakest_confidence !== null) {
      gapLine += `, ${gap.second_weakest_category}(${gap.second_weakest_confidence.toFixed(2)})`;
    }
    lines.push(gapLine);
    lines.push(`品質課題: ${qualityAxisLabel(gap.weakest_quality_axis)}`);
  }

  // 大問い検出 → 1文目仮説強制
  const isBigQuestion = detectBigQuestion(currentMessage);
  if (isBigQuestion) {
    lines.push("");
    lines.push("[絶対制約] 大問い検出");
    lines.push("1文目で必ず仮説的な結論を述べること。「〜だと思う」「〜が合っている」等の方向提示を最初に出す。");
    lines.push("禁止: 1文目が「ごめん」「まず」「なぜ」「情報を集め」で始まること。");
    lines.push("禁止: 質問を質問で返すこと。ユーザーは答えを求めている。");
    lines.push("形式: [仮説的結論1文] + [その根拠1-2文] + [補足・留保]");
  }

  // Probe（top-1 only）
  if (gates.probe_injection_enabled && probe) {
    lines.push("");
    lines.push("[予測的質問]");
    lines.push(`予測: ${probe.prediction}`);
    lines.push(`根拠: ${probe.prediction_basis}`);
    lines.push(`質問: ${probe.probe}`);
    if (probe.skip_safe) {
      lines.push("注意: 「答えなくてもいい」と伝えること");
    }
  }

  // Causal Links（relevant only, max 5）
  if (gates.causal_link_injection_enabled && relevantLinks.length > 0) {
    lines.push("");
    lines.push("[関連する因果接続]");
    for (const link of relevantLinks.slice(0, 5)) {
      lines.push(
        `${link.source_fact} → ${link.target_axis}: ${link.hypothesis} (${link.confidence.toFixed(2)})`,
      );
    }
  }

  // PRO-5: Consent boundaries — sensitive domains the LLM must not probe
  if (consent && consent.length > 0) {
    const blocked = consent.filter(c =>
      isSensitiveSubdomain(c.subdomain) && (c.status === "revoked" || c.status === "none"),
    );
    if (blocked.length > 0) {
      lines.push("");
      lines.push("[同意制約 — 以下の話題には踏み込まないこと]");
      for (const b of blocked) {
        lines.push(`- ${b.subdomain}: ${b.status === "revoked" ? "明示的に拒否済み" : "未同意"}`);
      }
    }
  }

  // Stance Vector（断言強度の指示）
  if (gates.stance_vector_enabled && stance) {
    lines.push("");
    lines.push("[断言強度]");
    if (stance.assertion_intensity > 0.7) {
      lines.push("あなたの読みに自信を持って伝えてよい。「〜だと思う」→「〜だ」レベルで断言可。");
    } else if (stance.assertion_intensity > 0.4) {
      lines.push("読みを伝えつつ留保を付ける。「〜に見える」「〜だと思う」程度。");
    } else {
      lines.push("慎重に伝える。「〜かもしれない」「〜に見える」程度に留める。");
    }
    if (stance.assumption_boldness > 0.6) {
      lines.push("推測でも踏み込んでよい。仮説を先に出し、反応を見る。");
    }
  }

  // EmbeddedSensor（返答に仮説を織り込む — 1返答1箇所のみ）
  if (gates.embedded_sensor_enabled && embeddedSensor) {
    lines.push("");
    lines.push("[観測点 — 返答の中に以下の仮説を自然に織り込むこと（1箇所のみ）]");
    lines.push(`仮説: ${embeddedSensor.hypothesis}`);
    const styleGuide: Record<EmbeddedSensor["style"], string> = {
      assert: "断言的に述べる。「それは〇〇だと思う」",
      question: "問いかけとして述べる。「〇〇なのかな」",
      muse: "独り言風に述べる。「〇〇かもな、と少し思った」",
      metaphor: "間接的な比喩で表現する。直接的な言い方は避ける",
    };
    lines.push(`表現: ${styleGuide[embeddedSensor.style]}`);
    lines.push("禁止: 「本当は〜でしょ？」「隠してる〜」等の直接的な読み取り表現");
  }

  // Expression Rules
  lines.push("");
  lines.push(`[表現制約] Phase ${phase}`);
  // stance_vector_enabled 時は allowed_hedges を stance で調整
  if (gates.stance_vector_enabled && stance && stance.assertion_intensity > 0.7) {
    // 高 assertion 時: hedges を絞る
    const strongHedges = expressionRules.allowed_hedges.filter(h =>
      !h.includes("かもしれない") && !h.includes("もしかすると"),
    );
    lines.push(`推奨表現: ${(strongHedges.length > 0 ? strongHedges : expressionRules.allowed_hedges).join(" / ")}`);
  } else {
    lines.push(`推奨表現: ${expressionRules.allowed_hedges.join(" / ")}`);
  }
  if (expressionRules.forbidden_keywords.length > 0) {
    lines.push(`絶対禁止ワード: ${expressionRules.forbidden_keywords.join("、")}`);
  }
  lines.push(`禁止パターン: ${expressionRules.forbidden_patterns.slice(0, 3).join(", ")}`);

  return lines.join("\n");
}

function qualityAxisLabel(axis: keyof QualityBreakdown): string {
  switch (axis) {
    case "user_stated_ratio": return "ユーザー直接発言が少ない → 直接確認で補強";
    case "contradiction_resolved_ratio": return "未解消の矛盾がある → 矛盾を提示して確認";
    case "recency": return "情報が古い → 最新状況を確認";
    case "fact_diversity": return "情報源が偏っている → 異なる角度から確認";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trust Event 自動検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの応答から Trust Event を自動検出する。
 */
export function detectTrustEvents(params: {
  userMessage: string;
  alterPreviousMessage: string;
  hadPrediction: boolean;
  domain: TrustDomain;
}): TrustEventType[] {
  const { userMessage, alterPreviousMessage, hadPrediction } = params;
  const events: TrustEventType[] = [];
  const msg = userMessage.toLowerCase();

  // 自発的な深い開示
  const deepDisclosurePatterns = [
    /実は/,
    /正直に言うと/,
    /誰にも言ってない/,
    /本当は/,
    /ずっと.*(?:思って|感じて|悩んで)/,
    /打ち明ける/,
    /告白/,
  ];
  if (deepDisclosurePatterns.some(p => p.test(userMessage))) {
    events.push("voluntary_deep_disclosure");
  }

  // 詳しく答えた（文字数が多い = 詳細に答えた）
  if (userMessage.length > 100 && !msg.includes("違") && !msg.includes("そうじゃない")) {
    events.push("question_answered_detail");
  }

  // 予測への反応
  if (hadPrediction) {
    const confirmPatterns = [
      /そうそう/, /まさに/, /当たってる/, /その通り/,
      /確かに/, /わかってる/, /そうなんだ/,
    ];
    const rejectPatterns = [
      /違う/, /そうじゃない/, /全然/, /違います/,
      /それは違/, /ないな/, /ちょっと違/,
    ];

    if (confirmPatterns.some(p => p.test(userMessage))) {
      events.push("prediction_confirmed");
    }
    if (rejectPatterns.some(p => p.test(userMessage))) {
      events.push("prediction_rejected");
    }
  }

  // 質問無視（短い返答 + 話題転換）
  if (
    alterPreviousMessage.includes("？") &&
    userMessage.length < 20 &&
    !userMessage.includes("？")
  ) {
    // 短い返答で質問に答えていない可能性
    const ignorePatterns = [/それより/, /ところで/, /話変わるけど/, /別の話/];
    if (ignorePatterns.some(p => p.test(userMessage))) {
      events.push("question_ignored");
    }
  }

  return events;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// self_disclosure_depth の計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 会話履歴からユーザーの自己開示の深さを計算する (0.0-1.0)。
 */
export function computeSelfDisclosureDepth(
  conversationHistory: Array<{ role: string; content: string }>,
): number {
  const userMessages = conversationHistory.filter(m => m.role === "user");
  if (userMessages.length === 0) return 0;

  let depthScore = 0;
  let maxDepthHit = 0;

  for (const msg of userMessages) {
    const text = msg.content;

    // Level 1: 基本的な自己開示（0.1）
    if (text.length > 30) depthScore += 0.05;

    // Level 2: 感情表現（0.2）
    const emotionPatterns = [/嬉しい/, /悲しい/, /怒り/, /不安/, /辛い/, /楽しい/, /寂しい/];
    if (emotionPatterns.some(p => p.test(text))) {
      depthScore += 0.1;
      maxDepthHit = Math.max(maxDepthHit, 0.3);
    }

    // Level 3: 個人的な状況の開示（0.4）
    const personalPatterns = [
      /仕事.*(?:悩|辛|困)/, /恋人/, /家族/, /お金/,
      /転職/, /別れ/, /健康/, /病/,
    ];
    if (personalPatterns.some(p => p.test(text))) {
      depthScore += 0.15;
      maxDepthHit = Math.max(maxDepthHit, 0.5);
    }

    // Level 4: 深い自己開示（0.6）
    const deepPatterns = [
      /実は/, /正直に言うと/, /本当は/, /誰にも/,
      /ずっと.*悩/, /怖い/, /トラウマ/,
    ];
    if (deepPatterns.some(p => p.test(text))) {
      depthScore += 0.2;
      maxDepthHit = Math.max(maxDepthHit, 0.7);
    }

    // Level 5: 最深層の開示（0.8+）
    const deepestPatterns = [
      /死にたい/, /自分が嫌/, /生きる意味/, /存在価値/,
      /誰にも言えな/, /打ち明け/,
    ];
    if (deepestPatterns.some(p => p.test(text))) {
      depthScore += 0.3;
      maxDepthHit = Math.max(maxDepthHit, 0.9);
    }
  }

  // 量と最大深度の加重平均
  const normalized = Math.min(1.0, depthScore / Math.max(userMessages.length * 0.1, 1));
  return Math.min(1.0, normalized * 0.4 + maxDepthHit * 0.6);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// repair_success_rate の計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Trust Event 履歴から修復成功率を計算する。
 */
export function computeRepairSuccessRate(events: TrustEvent[]): number {
  const repairAttempts = events.filter(
    e => e.event_type === "repair_succeeded" ||
      e.event_type === "correction_unresolved" ||
      e.event_type === "correction_accepted_quickly",
  );
  if (repairAttempts.length === 0) return 1.0; // 修復が必要になったことがない = 完璧

  const successes = repairAttempts.filter(
    e => e.event_type === "repair_succeeded" || e.event_type === "correction_accepted_quickly",
  ).length;
  return successes / repairAttempts.length;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Orchestrator — 全コンポーネントを統合するメイン関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProactiveEngineInput {
  // 既存データ
  sessions_completed: number;
  continuous_trust: number;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  lifeContextEntries: LifeContextEntry[];
  conversationHistory: Array<{ role: string; content: string }>;
  currentMessage: string;
  alterPreviousMessage: string;

  // Trust 関連
  trustEvents: TrustEvent[];
  contextualAccess: ContextualAccess[];
  consent: SubdomainConsent[];

  // Causal Map
  causalLinks: CausalLink[];

  // セッション状態
  probesThisSession: number;
  lastProbeTimestamp: string | null;
  currentSessionIndex: number;
  sessionOfLastConsent: number;
  frustrationLevel: number;
  detectedDomain: TrustDomain | null;

  // ゲート
  gates?: ProactiveEngineGates;

  // StanceVector 用（任意）
  personality?: { boldScore?: number; socialScore?: number } | null;
  mood?: "positive" | "neutral" | "negative" | null;

  // EmbeddedSensor 抑制用（任意）
  /** 感情温度 0-1 — 高い場合は EmbeddedSensor を抑制 */
  emotionalTemperature?: number;
  /** ユーザーが直答を求めている場合 true */
  isDirectAnswerContext?: boolean;
}

export interface ProactiveEngineOutput {
  phase: Phase;
  trustLevel: TrustLevel;
  promptBlock: string;
  selectedProbe: PredictiveProbe | null;
  probeBlocked: boolean;
  probeBlockReason: string | null;
  gap: GapAnalysis;
  categoryConfidences: CategoryConfidence[];
  detectedTrustEvents: TrustEventType[];
  expressionRules: ExpressionRules;
  isBigQuestion: boolean;
  /** Candor Policy: 算出された StanceVector */
  stance: StanceVector | null;
  /** TASK-2: extractCurrentTopics の抽出結果 */
  currentTopicContext: CurrentTopicContext | null;
  /** TASK-5b: EmbeddedSensor（返答に織り込む仮説） */
  embeddedSensor: EmbeddedSensor | null;
  /** continuity フィルタ: フィルタ前の候補数 */
  continuity_total_candidates: number;
  /** continuity フィルタ: フィルタ通過数 */
  continuity_adopted_count: number;
}

/**
 * Proactive Understanding Engine のメインオーケストレーター。
 * 全コンポーネントを統合し、system prompt ブロックを生成する。
 */
export function runProactiveEngine(input: ProactiveEngineInput): ProactiveEngineOutput {
  const gates = input.gates ?? DEFAULT_GATES;

  if (!gates.engine_enabled) {
    const defaultGap: GapAnalysis = {
      weakest_category: "judgment",
      weakest_confidence: 0,
      weakest_quality_axis: "user_stated_ratio",
      second_weakest_category: null,
      second_weakest_confidence: null,
    };
    return {
      phase: 0,
      trustLevel: 0,
      promptBlock: "",
      selectedProbe: null,
      probeBlocked: false,
      probeBlockReason: null,
      gap: defaultGap,
      categoryConfidences: [],
      detectedTrustEvents: [],
      expressionRules: getExpressionRules(0),
      isBigQuestion: false,
      stance: null,
      currentTopicContext: null,
      embeddedSensor: null,
      continuity_total_candidates: 0,
      continuity_adopted_count: 0,
    };
  }

  // 1. Understanding Model: カテゴリ別 confidence 計算
  const categoryConfidences = computeAllCategoryConfidences(input.lifeContextEntries);
  const gap = analyzeUnderstandingGaps(categoryConfidences);

  // 2. Trust Budget: Earned Trust 計算
  const earnedTrust = computeEarnedTrust(input.trustEvents);

  // 3. self_disclosure_depth
  const selfDisclosureDepth = computeSelfDisclosureDepth(input.conversationHistory);

  // 4. repair_success_rate
  const repairSuccessRate = computeRepairSuccessRate(input.trustEvents);

  // 5. Phase 判定
  const understandingCoverage =
    categoryConfidences.reduce((sum, c) => sum + c.confidence, 0) / categoryConfidences.length;
  const causalMapConfidence = input.causalLinks.length > 0
    ? input.causalLinks.reduce((sum, l) => sum + l.confidence, 0) / input.causalLinks.length
    : 0;

  const phase = derivePhase({
    sessions_completed: input.sessions_completed,
    continuous_trust: input.continuous_trust,
    earned_trust_total: totalEarnedTrust(earnedTrust),
    self_disclosure_depth: selfDisclosureDepth,
    causal_map_confidence: causalMapConfidence,
    repair_success_rate: repairSuccessRate,
    understanding_coverage: understandingCoverage,
  });

  const trustLevel = phaseToTrustLevel(phase);
  const expressionRules = getExpressionRules(phase);

  // 6. Predictive Probe Builder（VoI 有効時は VoI スコアで軸選択）
  let selectedProbe: PredictiveProbe | null = null;
  if (gates.probe_injection_enabled) {
    selectedProbe = buildPredictiveProbe({
      gap,
      axisScores: input.axisScores,
      phase,
      causalLinks: input.causalLinks,
      categoryConfidences: gates.voi_scoring_enabled ? categoryConfidences : undefined,
      activeDecisionContext: gates.voi_scoring_enabled ? (input.detectedDomain ?? null) : undefined,
      voiEnabled: gates.voi_scoring_enabled,
    });
  }

  // 7. Probe Scheduler
  let probeBlocked = false;
  let probeBlockReason: string | null = null;
  const originalProbeBeforeScheduler = selectedProbe; // EmbeddedSensor 用に保持

  if (selectedProbe) {
    const scheduleResult = scheduleProbe({
      probe: selectedProbe,
      phase,
      earnedTrust,
      contextualAccess: input.contextualAccess,
      consent: input.consent,
      frustrationLevel: input.frustrationLevel,
      probesThisSession: input.probesThisSession,
      lastProbeTimestamp: input.lastProbeTimestamp,
      currentSessionIndex: input.currentSessionIndex,
      sessionOfLastConsent: input.sessionOfLastConsent,
    });

    if (!scheduleResult.approved) {
      probeBlocked = true;
      probeBlockReason = scheduleResult.blocked_by;
      selectedProbe = null;
    }
  }

  // 8. Trust Event 自動検出
  let detectedTrustEvents: TrustEventType[] = [];
  if (gates.trust_tracking_enabled) {
    detectedTrustEvents = detectTrustEvents({
      userMessage: input.currentMessage,
      alterPreviousMessage: input.alterPreviousMessage,
      hadPrediction: input.probesThisSession > 0,
      domain: input.detectedDomain ?? "daily",
    });
  }

  // 8b. extractCurrentTopics（continuity_filter_enabled 時）
  let currentTopicContext: CurrentTopicContext | null = null;
  if (gates.continuity_filter_enabled) {
    const recentUserMessages = input.conversationHistory
      .filter(m => m.role === "user")
      .slice(-3)
      .map(m => m.content);
    currentTopicContext = extractCurrentTopics(
      input.currentMessage,
      recentUserMessages,
      input.axisScores,
      input.detectedDomain,
    );
  }

  // 9. Causal Links（関連のみ抽出 — prompt 圧縮 + continuity フィルタ）
  const continuityTotalCandidates = input.causalLinks.length;
  const relevantLinks = gates.causal_link_injection_enabled
    ? selectRelevantCausalLinks(
      input.causalLinks,
      [gap.weakest_category, gap.second_weakest_category].filter(Boolean) as UMCategory[],
      input.detectedDomain,
      5,
      gates.continuity_filter_enabled && currentTopicContext
        ? { consent: input.consent, context: currentTopicContext }
        : undefined,
    )
    : [];
  const continuityAdoptedCount = relevantLinks.length;

  // 10. StanceVector 算出（gate 有効時のみ）
  const domainTrustScore = input.detectedDomain
    ? (earnedTrust.find(t => t.domain === input.detectedDomain)?.score ?? 0)
    : 0;
  const stance = gates.stance_vector_enabled
    ? computeStanceVector(phase, input.personality ?? null, domainTrustScore, input.mood ?? null)
    : null;

  // 10b. EmbeddedSensor 構築（probe がブロックされた場合、stance + gate 有効時）
  let embeddedSensor: EmbeddedSensor | null = null;
  if (gates.embedded_sensor_enabled && stance && probeBlocked) {
    embeddedSensor = buildEmbeddedSensor({
      stance,
      blockedProbe: originalProbeBeforeScheduler,
      phase,
      activeAxes: currentTopicContext?.active_axes,
      emotionalTemperature: input.emotionalTemperature,
      isDirectAnswerContext: input.isDirectAnswerContext,
    });
  }

  // 11. System Prompt 構築
  const promptBlock = buildProactivePromptBlock({
    phase,
    gap,
    probe: selectedProbe,
    relevantLinks,
    expressionRules,
    gates,
    currentMessage: input.currentMessage,
    consent: input.consent,
    stance: stance ?? undefined,
    embeddedSensor,
  });

  return {
    phase,
    trustLevel,
    promptBlock,
    selectedProbe,
    probeBlocked,
    probeBlockReason,
    gap,
    categoryConfidences,
    detectedTrustEvents,
    expressionRules,
    isBigQuestion: detectBigQuestion(input.currentMessage),
    stance,
    currentTopicContext,
    embeddedSensor,
    continuity_total_candidates: continuityTotalCandidates,
    continuity_adopted_count: continuityAdoptedCount,
  };
}
