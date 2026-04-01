// lib/stargazer/axisInferenceEngine.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 軸推論エンジン v1
//
// 観測済みの性格軸スコアから、未観測の深層軸・安全性軸を推論する。
// estimateCognitiveFromTraits() と同じパターンだが、
// より多くのソース軸と心理学的根拠に基づく重み付けを使用。
//
// 推論スコアの信頼度上限: 0.35（直接観測の 0.65 に対して）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { isExpansionAxis, type TraitAxisKey } from "./traitAxes";
import { EXPANSION_INFERENCE_CONFIDENCE_CAP } from "./expansionDiscovery";

// ── 型定義 ──

export interface InferenceSource {
  sourceAxis: TraitAxisKey;
  weight: number;
  rationale: string;
}

export interface InferenceRule {
  targetAxis: TraitAxisKey;
  sources: InferenceSource[];
  /** 推論の信頼度上限（デフォルト 0.35） */
  maxConfidence: number;
  /** 心理学的根拠 */
  citation: string;
}

export interface InferenceResult {
  axis: TraitAxisKey;
  estimatedScore: number;
  confidence: number;
  source: "inferred";
  sources: InferenceSource[];
  citation: string;
}

// ── 推論の信頼度上限 ──
const INFERENCE_CONFIDENCE_CAP = 0.35;

// ── 深層6軸の推論ルール ──

const DEPTH_INFERENCE_RULES: InferenceRule[] = [
  {
    targetAxis: "attachment_style",
    sources: [
      { sourceAxis: "reassurance_need", weight: 0.5, rationale: "安心欲求が高い → 不安型愛着の傾向" },
      { sourceAxis: "emotional_regulation", weight: -0.3, rationale: "感情調整力が低い → 不安型愛着の傾向" },
      { sourceAxis: "intimacy_pace", weight: 0.2, rationale: "親密化が早い → 不安型、遅い → 回避型" },
    ],
    maxConfidence: INFERENCE_CONFIDENCE_CAP,
    citation: "Bartholomew & Horowitz (1991) — 4-category attachment model",
  },
  {
    targetAxis: "locus_of_control",
    sources: [
      { sourceAxis: "independence_vs_harmony", weight: -0.4, rationale: "独立志向 → 内的統制" },
      { sourceAxis: "cautious_vs_bold", weight: 0.3, rationale: "大胆さ → 内的統制（自分で状況を変えられる信念）" },
      { sourceAxis: "plan_vs_spontaneous", weight: -0.2, rationale: "計画性 → 内的統制（行動で結果を制御する志向）" },
    ],
    maxConfidence: INFERENCE_CONFIDENCE_CAP,
    citation: "Rotter (1966) — Internal-external locus of control scale",
  },
  {
    targetAxis: "growth_mindset",
    sources: [
      { sourceAxis: "change_embrace_vs_resist", weight: -0.5, rationale: "変化歓迎 → 成長志向" },
      { sourceAxis: "tradition_vs_novelty", weight: 0.3, rationale: "新奇志向 → 成長志向" },
      { sourceAxis: "perfectionist_vs_pragmatic", weight: 0.2, rationale: "実用重視 → 成長志向（プロセスを許容）" },
    ],
    maxConfidence: INFERENCE_CONFIDENCE_CAP,
    citation: "Dweck (2006) — Mindset: The New Psychology of Success",
  },
  {
    targetAxis: "shame_vs_guilt",
    sources: [
      { sourceAxis: "public_private_gap", weight: 0.4, rationale: "表裏ギャップが大きい → 恥の傾向（自己全体への脅威感）" },
      { sourceAxis: "emotional_regulation", weight: -0.3, rationale: "感情調整困難 → 恥の傾向" },
      { sourceAxis: "direct_vs_diplomatic", weight: 0.2, rationale: "外交的 → 恥回避パターン" },
    ],
    maxConfidence: INFERENCE_CONFIDENCE_CAP,
    citation: "Tangney & Dearing (2002) — Shame and Guilt",
  },
  {
    targetAxis: "rumination_tendency",
    sources: [
      { sourceAxis: "emotional_variability", weight: 0.4, rationale: "感情変動が大きい → 反芻しやすい" },
      { sourceAxis: "stress_isolation_vs_social", weight: -0.3, rationale: "ストレス時に孤立 → 反芻に陥りやすい" },
      { sourceAxis: "analytical_vs_intuitive", weight: -0.2, rationale: "分析的 → 思考の反復に陥りやすい" },
    ],
    maxConfidence: INFERENCE_CONFIDENCE_CAP,
    citation: "Nolen-Hoeksema (1991) — Response Styles Theory",
  },
  {
    targetAxis: "fairness_sensitivity",
    sources: [
      { sourceAxis: "independence_vs_harmony", weight: 0.3, rationale: "調和志向 → 不公平に敏感" },
      { sourceAxis: "direct_vs_diplomatic", weight: -0.3, rationale: "率直な人 → 不公平を直接指摘する傾向" },
      { sourceAxis: "boundary_awareness", weight: 0.3, rationale: "境界認識が高い → 公平性への感度が高い" },
    ],
    maxConfidence: INFERENCE_CONFIDENCE_CAP,
    citation: "Schmitt et al. (2004) — Justice Sensitivity Inventory",
  },
];

// ── 安全性軸の推論ルール ──

const SAFETY_INFERENCE_RULES: InferenceRule[] = [
  {
    targetAxis: "boundary_respect",
    sources: [
      { sourceAxis: "boundary_awareness", weight: 0.6, rationale: "自分の境界認識 → 他者の境界尊重" },
      { sourceAxis: "consent_maturity", weight: 0.4, rationale: "合意成熟度 → 境界尊重行動" },
    ],
    maxConfidence: 0.30,
    citation: "Gottman (1999) — boundary respect as relational maturity indicator",
  },
  {
    targetAxis: "pressure_risk",
    sources: [
      { sourceAxis: "rejection_response_maturity", weight: -0.5, rationale: "拒否への未熟さ → 圧力行使のリスク" },
      { sourceAxis: "control_tendency", weight: 0.3, rationale: "コントロール欲 → 圧力行使" },
      { sourceAxis: "intimacy_pace", weight: 0.2, rationale: "急激な親密化 → 圧力リスク" },
    ],
    maxConfidence: 0.30,
    citation: "McClelland (1975) — Power motivation and interpersonal pressure",
  },
  {
    targetAxis: "escalation_risk",
    sources: [
      { sourceAxis: "pressure_risk", weight: 0.5, rationale: "圧力傾向 → エスカレーションリスク" },
      { sourceAxis: "emotional_regulation", weight: -0.3, rationale: "感情調整困難 → エスカレーション" },
      { sourceAxis: "emotional_variability", weight: 0.2, rationale: "感情変動 → 状況エスカレーション" },
    ],
    maxConfidence: 0.30,
    citation: "Gottman (1994) — Four Horsemen escalation cascade",
  },
  {
    targetAxis: "control_tendency",
    sources: [
      { sourceAxis: "independence_vs_harmony", weight: -0.3, rationale: "独立志向（相手の独立も含む）→ コントロール低" },
      { sourceAxis: "direct_vs_diplomatic", weight: -0.3, rationale: "率直さ → 間接的コントロールよりオープン" },
      { sourceAxis: "reassurance_need", weight: 0.3, rationale: "安心欲求 → コントロールで安心を確保" },
    ],
    maxConfidence: 0.30,
    citation: "Based on attachment anxiety → control behavior pathway",
  },
  {
    targetAxis: "exclusivity_pressure",
    sources: [
      { sourceAxis: "control_tendency", weight: 0.5, rationale: "コントロール欲 → 排他的圧力" },
      { sourceAxis: "reassurance_need", weight: 0.4, rationale: "安心欲求 → 排他性で安心を得る" },
    ],
    maxConfidence: 0.25,
    citation: "McClelland (1975) — Power-affiliation dynamic",
  },
  {
    targetAxis: "long_term_shift_risk",
    sources: [
      { sourceAxis: "emotional_variability", weight: 0.4, rationale: "感情変動性 → 長期態度変化リスク" },
      { sourceAxis: "relationship_mode_split", weight: 0.4, rationale: "関係モード分裂 → 長期的一貫性低下" },
    ],
    maxConfidence: 0.30,
    citation: "Derived from trait stability literature (Roberts & DelVecchio, 2000)",
  },
  {
    targetAxis: "intent_stability",
    sources: [
      { sourceAxis: "plan_vs_spontaneous", weight: -0.4, rationale: "計画性 → 意図の一貫性" },
      { sourceAxis: "perfectionist_vs_pragmatic", weight: -0.3, rationale: "完成度重視 → 意図のぶれにくさ" },
      { sourceAxis: "relationship_mode_split", weight: -0.3, rationale: "モード一貫 → 意図の安定性" },
    ],
    maxConfidence: 0.30,
    citation: "Conscientiousness and behavioral consistency (Costa & McCrae, 1992)",
  },
  {
    targetAxis: "friend_mode_fit",
    sources: [
      { sourceAxis: "introvert_vs_extrovert", weight: -0.3, rationale: "外向性 → 友人関係の安定性" },
      { sourceAxis: "social_initiative", weight: 0.3, rationale: "社交的主導性 → 友達モードの安定" },
      { sourceAxis: "independence_vs_harmony", weight: 0.3, rationale: "調和志向 → 友人との安定関係" },
    ],
    maxConfidence: 0.30,
    citation: "Interpersonal circumplex model (Wiggins, 1995)",
  },
];

// ── P4: 拡張軸の推論ルール ──
// 親軸スコアから拡張軸を推論。confidence 上限は EXPANSION_INFERENCE_CONFIDENCE_CAP = 0.25

const EXPANSION_INFERENCE_RULES: InferenceRule[] = [
  {
    targetAxis: "energy_rhythm",
    sources: [
      { sourceAxis: "introvert_vs_extrovert", weight: 0.5, rationale: "外向性 → 活発なエネルギー消費パターン" },
      { sourceAxis: "emotional_variability", weight: 0.3, rationale: "感情変動 → エネルギーリズムの振幅" },
      { sourceAxis: "stress_isolation_vs_social", weight: -0.2, rationale: "孤立回復 → 静かな充電パターン" },
    ],
    maxConfidence: EXPANSION_INFERENCE_CONFIDENCE_CAP,
    citation: "Parent axes: introvert_vs_extrovert, emotional_variability, stress_isolation_vs_social",
  },
  {
    targetAxis: "conflict_style",
    sources: [
      { sourceAxis: "direct_vs_diplomatic", weight: 0.5, rationale: "率直さ → 正面から向き合うスタイル" },
      { sourceAxis: "emotional_regulation", weight: 0.3, rationale: "感情調整力 → 冷静な対面力" },
      { sourceAxis: "independence_vs_harmony", weight: -0.2, rationale: "調和志向 → 距離を取る傾向" },
    ],
    maxConfidence: EXPANSION_INFERENCE_CONFIDENCE_CAP,
    citation: "Parent axes: direct_vs_diplomatic, emotional_regulation, independence_vs_harmony",
  },
  {
    targetAxis: "novelty_threshold",
    sources: [
      { sourceAxis: "change_embrace_vs_resist", weight: -0.5, rationale: "変化歓迎 → 未知への耐性が高い" },
      { sourceAxis: "tradition_vs_novelty", weight: 0.3, rationale: "新奇志向 → 未知の領域を許容" },
      { sourceAxis: "cautious_vs_bold", weight: 0.2, rationale: "大胆さ → 未知を恐れない" },
    ],
    maxConfidence: EXPANSION_INFERENCE_CONFIDENCE_CAP,
    citation: "Parent axes: change_embrace_vs_resist, tradition_vs_novelty, cautious_vs_bold",
  },
  {
    targetAxis: "self_disclosure_depth",
    sources: [
      { sourceAxis: "intimacy_pace", weight: 0.4, rationale: "親密化速度 → 自己開示の深さ" },
      { sourceAxis: "public_private_gap", weight: -0.4, rationale: "表裏一致 → 深い開示傾向" },
      { sourceAxis: "boundary_awareness", weight: -0.2, rationale: "境界柔軟 → 開示に抵抗が低い" },
    ],
    maxConfidence: EXPANSION_INFERENCE_CONFIDENCE_CAP,
    citation: "Parent axes: intimacy_pace, public_private_gap, boundary_awareness",
  },
  {
    targetAxis: "decision_regret",
    sources: [
      { sourceAxis: "rumination_tendency", weight: 0.5, rationale: "反芻傾向 → 決定後も考え続ける" },
      { sourceAxis: "locus_of_control", weight: 0.3, rationale: "外的統制 → 決定への後悔が強い" },
      { sourceAxis: "perfectionist_vs_pragmatic", weight: -0.2, rationale: "完成度重視 → 決定の再評価" },
    ],
    maxConfidence: EXPANSION_INFERENCE_CONFIDENCE_CAP,
    citation: "Parent axes: rumination_tendency, locus_of_control, perfectionist_vs_pragmatic",
  },
  {
    targetAxis: "relational_investment",
    sources: [
      { sourceAxis: "quality_vs_quantity", weight: -0.5, rationale: "質重視 → 狭く深い投資" },
      { sourceAxis: "individual_vs_social", weight: -0.3, rationale: "個人志向 → 少数に深く投資" },
      { sourceAxis: "friend_mode_fit", weight: 0.2, rationale: "友達モード安定 → 関係への投資パターン" },
    ],
    maxConfidence: EXPANSION_INFERENCE_CONFIDENCE_CAP,
    citation: "Parent axes: quality_vs_quantity, individual_vs_social, friend_mode_fit",
  },
];

// ── メイン推論関数 ──

/**
 * 深層6軸を既存スコアから推論
 */
export function inferDepthAxes(
  observedScores: Partial<Record<TraitAxisKey, number>>,
  directlyObservedAxes: Set<TraitAxisKey>,
): InferenceResult[] {
  return runInferenceRules(DEPTH_INFERENCE_RULES, observedScores, directlyObservedAxes);
}

/**
 * 安全性軸を既存スコアから推論
 * 安全性軸同士の推論連鎖にも対応（control_tendency → exclusivity_pressure 等）
 */
export function inferSafetyAxes(
  observedScores: Partial<Record<TraitAxisKey, number>>,
  directlyObservedAxes: Set<TraitAxisKey>,
): InferenceResult[] {
  // 安全性軸は推論連鎖があるため2パスで実行
  // Pass 1: 直接のトレイト軸から推論可能なもの
  const pass1 = runInferenceRules(SAFETY_INFERENCE_RULES, observedScores, directlyObservedAxes);

  // Pass 1 の結果を暫定スコアとしてマージ
  const mergedScores = { ...observedScores };
  for (const result of pass1) {
    if (!(result.axis in mergedScores)) {
      mergedScores[result.axis] = result.estimatedScore;
    }
  }

  // Pass 2: 推論結果を含めて再推論（連鎖のみ）
  const pass2 = runInferenceRules(SAFETY_INFERENCE_RULES, mergedScores, directlyObservedAxes);

  // Pass 2 で新たに推論できたもののみ追加
  const pass1Axes = new Set(pass1.map((r) => r.axis));
  const combined = [...pass1];
  for (const result of pass2) {
    if (!pass1Axes.has(result.axis)) {
      // 連鎖推論はさらに信頼度を下げる
      combined.push({
        ...result,
        confidence: result.confidence * 0.7,
      });
    }
  }

  return combined;
}

/**
 * P4: 拡張6軸を親軸スコアから推論
 * confidence 上限: EXPANSION_INFERENCE_CONFIDENCE_CAP = 0.25
 */
export function inferExpansionAxes(
  observedScores: Partial<Record<TraitAxisKey, number>>,
  directlyObservedAxes: Set<TraitAxisKey>,
): InferenceResult[] {
  return runInferenceRules(EXPANSION_INFERENCE_RULES, observedScores, directlyObservedAxes);
}

/**
 * 全未観測軸を推論（深層 + 安全性 + 拡張）
 */
export function runFullInference(
  observedScores: Partial<Record<TraitAxisKey, number>>,
  directlyObservedAxes: Set<TraitAxisKey>,
): InferenceResult[] {
  const depthResults = inferDepthAxes(observedScores, directlyObservedAxes);
  const safetyResults = inferSafetyAxes(observedScores, directlyObservedAxes);
  const expansionResults = inferExpansionAxes(observedScores, directlyObservedAxes);

  // 重複排除（同一軸が複数カテゴリに出る場合は confidence 高い方）
  const resultMap = new Map<TraitAxisKey, InferenceResult>();
  for (const result of [...depthResults, ...safetyResults, ...expansionResults]) {
    const existing = resultMap.get(result.axis);
    if (!existing || result.confidence > existing.confidence) {
      resultMap.set(result.axis, result);
    }
  }

  return Array.from(resultMap.values());
}

// ── 内部ヘルパー ──

function runInferenceRules(
  rules: InferenceRule[],
  observedScores: Partial<Record<TraitAxisKey, number>>,
  directlyObservedAxes: Set<TraitAxisKey>,
): InferenceResult[] {
  const results: InferenceResult[] = [];

  for (const rule of rules) {
    // 直接観測済みならスキップ
    if (directlyObservedAxes.has(rule.targetAxis)) continue;

    // ソース軸のうち、スコアが存在するものを集計
    let weightedSum = 0;
    let totalWeight = 0;
    let availableSources = 0;
    const usedSources: InferenceSource[] = [];

    for (const src of rule.sources) {
      const score = observedScores[src.sourceAxis];
      if (score === undefined || score === null) continue;

      weightedSum += score * src.weight;
      totalWeight += Math.abs(src.weight);
      availableSources++;
      usedSources.push(src);
    }

    // 少なくとも1つのソースが必要
    if (availableSources === 0 || totalWeight === 0) continue;

    // 正規化: 重みの合計で割ってスケーリング
    const rawEstimate = weightedSum / totalWeight;
    const estimatedScore = Math.max(-1, Math.min(1, rawEstimate));

    // 信頼度: ソースのカバレッジ率 × 推論上限
    const coverageRatio = availableSources / rule.sources.length;
    const confidence = Math.min(
      rule.maxConfidence,
      coverageRatio * rule.maxConfidence * 0.9 + 0.05, // 最低 0.05
    );

    results.push({
      axis: rule.targetAxis,
      estimatedScore,
      confidence,
      source: "inferred",
      sources: usedSources,
      citation: rule.citation,
    });
  }

  return results;
}

// ── エクスポート: 推論ルールの参照用 ──
export const ALL_INFERENCE_RULES = [...DEPTH_INFERENCE_RULES, ...SAFETY_INFERENCE_RULES, ...EXPANSION_INFERENCE_RULES];
