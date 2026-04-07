/**
 * Memory Policy — HDM v1 P2-4
 *
 * 記憶政策の本体は「量」ではなく:
 *   書き込み基準・矛盾検出・更新停止・忘却・説明可能性
 *
 * 設計原則:
 *   - 全パラメータは確定ではなく「現時点の最有力仮説」
 *   - 矛盾観測は矛盾フラグ付き、単発で整合しないものは未確定
 *   - 古い矛盾観測は削除ではなく低重み化
 *   - Narrative は固定せず書き換え追跡
 *   - 「完全に分かった」に到達しない（Negative Capability）
 *   - counter-evidence は一級市民
 *
 * 4段階ライフサイクル:
 *   candidate → tentative → active → weakening
 *   いきなり active に上げない。単発観測は candidate に留まる。
 *
 * 有効重み = freshness × consistency × (1 - contradictionPressure)
 *
 * カスケード制約:
 *   - narrative revision 1回あたりの decay は最大 0.1
 *   - 1ターンの合計 cascade decay は最大 0.2
 *
 * DB migration 不要: 既存データからの純粋関数計算のみ。
 *
 * @see docs/heart-dynamics-model-v1.md §9 (Memory Policy)
 */
import "server-only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 記憶の種類 — 種類ごとに寿命も重み付けも異なる */
export type MemoryType =
  | "trait_hypothesis"
  | "wound_hypothesis"
  | "body_mapping"
  | "narrative"
  | "contradiction_evidence";

/** ライフサイクル段階 */
export type LifecycleStage =
  | "candidate"    // 単発観測。prompt に使用しない
  | "tentative"    // 複数観測あり。hedging 付きで使用可
  | "active"       // 十分な証拠。通常使用
  | "weakening";   // 反例増加 or 陳腐化。使用を縮小

/** 有効重みの3軸 */
export interface EffectiveWeightFactors {
  /** 最終確認からの鮮度 (0-1) */
  freshness: number;
  /** 証拠の整合性 (0-1) — 支持 vs 反証の比率 */
  consistency: number;
  /** 反例の圧力 (0-1) — counter-evidence の強さ */
  contradictionPressure: number;
}

/** 有効重みの計算結果 */
export interface EffectiveWeight {
  factors: EffectiveWeightFactors;
  /** 合成重み (0-1) */
  weight: number;
  /** 算出されたライフサイクル段階 */
  stage: LifecycleStage;
}

/** 記憶エントリの共通入力（各テーブルから抽出） */
export interface MemoryEntry {
  /** 記憶の種類 */
  type: MemoryType;
  /** 支持証拠の数 */
  evidenceCount: number;
  /** 反例の数 */
  counterEvidenceCount: number;
  /** 強い反例の数（body_mapping 用。他は 0） */
  strongCounterEvidenceCount: number;
  /** 最後に支持証拠が確認された日時 (ISO string, null = 未確認) */
  lastConfirmedAt: string | null;
  /** 作成日時 (ISO string) */
  createdAt: string;
  /** narrative revision が発生した回数（narrative 用。他は 0） */
  revisionCount: number;
  /** narrative freezing 検出日時（narrative 用。他は null） */
  frozenSince: string | null;
}

/** ライフサイクル遷移の結果 */
export interface LifecycleTransition {
  from: LifecycleStage;
  to: LifecycleStage;
  reason: string;
}

/** カスケード decay の結果 */
export interface CascadeDecay {
  /** 対象の記憶タイプ */
  targetType: MemoryType;
  /** confidence の変動量（負の値 = 低下） */
  confidenceDelta: number;
  /** 理由 */
  reason: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Half-life per memory type（日数）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HALF_LIFE_DAYS: Record<MemoryType, number> = {
  trait_hypothesis: 30,        // 性格特性は比較的安定
  wound_hypothesis: 60,        // 傷は深く、変化が遅い
  body_mapping: 14,            // 身体→感情パターンは季節・ストレスで変動
  narrative: 21,               // 意味づけは中程度のペースで進化
  contradiction_evidence: 14,  // 矛盾信号は鮮度が重要
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cascade limits（反証2の対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** narrative revision 1回あたりの最大 confidence decay */
const MAX_SINGLE_CASCADE_DECAY = 0.1;
/** 1ターンの合計 cascade decay の上限 */
const MAX_TOTAL_CASCADE_DECAY = 0.2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Freshness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 最終確認日からの鮮度を計算する。
 * 指数減衰: freshness = 2^(-days / halfLife)
 *
 * lastConfirmedAt が null の場合は createdAt をフォールバックに使う。
 */
export function computeFreshness(
  lastConfirmedAt: string | null,
  createdAt: string,
  type: MemoryType,
  now?: Date,
): number {
  const referenceDate = lastConfirmedAt ?? createdAt;
  const refTime = new Date(referenceDate).getTime();
  const nowTime = (now ?? new Date()).getTime();
  const daysSince = Math.max(0, (nowTime - refTime) / (1000 * 60 * 60 * 24));
  const halfLife = HALF_LIFE_DAYS[type];

  return Math.pow(2, -daysSince / halfLife);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Consistency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 証拠の整合性を計算する。
 * evidence が counter を大幅に上回る → 高い consistency
 * evidence と counter が拮抗 → 低い consistency
 *
 * 式: evidence / (evidence + counter + 1)
 * +1 はラプラス平滑化（ゼロ除算防止 + 初期保守性）
 */
export function computeConsistency(
  evidenceCount: number,
  counterEvidenceCount: number,
): number {
  const total = evidenceCount + counterEvidenceCount + 1;
  return evidenceCount / total;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contradiction Pressure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 反例の圧力を計算する。
 * counter-evidence の量と強さに基づく。
 * strong counter は2倍の重み（P2-2 Body Lens と同じ）。
 *
 * 式: effectiveCounter / (evidence + effectiveCounter + 1)
 */
export function computeContradictionPressure(
  evidenceCount: number,
  counterEvidenceCount: number,
  strongCounterEvidenceCount: number,
): number {
  const effectiveCounter = counterEvidenceCount + strongCounterEvidenceCount; // strong は counter に既に含まれていない前提
  const total = evidenceCount + effectiveCounter + 1;
  return effectiveCounter / total;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lifecycle Stage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 記憶エントリのライフサイクル段階を算出する。
 *
 * candidate: evidence <= 1
 * tentative: evidence 2-3, consistency > 0.3
 * active: evidence >= 4, consistency > 0.5, freshness > 0.2
 * weakening: contradiction_pressure > 0.4 OR freshness < 0.15
 *
 * weakening は active/tentative からの降格。candidate は weakening にならない（データ不足）。
 */
export function computeLifecycleStage(entry: MemoryEntry, now?: Date): LifecycleStage {
  const freshness = computeFreshness(entry.lastConfirmedAt, entry.createdAt, entry.type, now);
  const consistency = computeConsistency(entry.evidenceCount, entry.counterEvidenceCount);
  const pressure = computeContradictionPressure(
    entry.evidenceCount,
    entry.counterEvidenceCount,
    entry.strongCounterEvidenceCount,
  );

  // candidate: 証拠不足
  if (entry.evidenceCount <= 1) return "candidate";

  // weakening 判定（active/tentative よりも優先）
  if (entry.evidenceCount >= 2 && (pressure > 0.4 || freshness < 0.15)) {
    return "weakening";
  }

  // active: 十分な証拠 + 整合性 + 鮮度
  if (entry.evidenceCount >= 4 && consistency > 0.5 && freshness > 0.2) {
    return "active";
  }

  // tentative: ある程度の証拠
  if (entry.evidenceCount >= 2 && consistency > 0.3) {
    return "tentative";
  }

  // それ以外（整合性が低い candidate-level）
  return "candidate";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Effective Weight
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 記憶エントリの有効重みを計算する。
 *
 * weight = freshness × consistency × (1 - contradictionPressure)
 *
 * 3軸の独立性:
 * - freshness: 時間的鮮度（最終確認からの経過）
 * - consistency: 証拠の方向性（支持 vs 反証の比率）
 * - contradictionPressure: 反例の絶対量（counter-evidence の強さ）
 */
export function computeEffectiveWeight(entry: MemoryEntry, now?: Date): EffectiveWeight {
  const freshness = computeFreshness(entry.lastConfirmedAt, entry.createdAt, entry.type, now);
  const consistency = computeConsistency(entry.evidenceCount, entry.counterEvidenceCount);
  const contradictionPressure = computeContradictionPressure(
    entry.evidenceCount,
    entry.counterEvidenceCount,
    entry.strongCounterEvidenceCount,
  );
  const stage = computeLifecycleStage(entry, now);

  const weight = freshness * consistency * (1 - contradictionPressure);

  return {
    factors: { freshness, consistency, contradictionPressure },
    weight: Math.max(0, Math.min(1, weight)),
    stage,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Inclusion Policy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** prompt への記憶の使用方法 */
export type MemoryUsageMode = "exclude" | "hedged" | "normal";

/**
 * ライフサイクル段階に基づいて、prompt への含め方を決定する。
 *
 * candidate → exclude（単発観測は prompt に使わない）
 * tentative → hedged（「〜かもしれない」レベル）
 * active → normal（通常使用、ただし P1.5 cap に従属）
 * weakening → hedged（信頼度低下中）
 */
export function determineMemoryUsage(stage: LifecycleStage): MemoryUsageMode {
  switch (stage) {
    case "candidate": return "exclude";
    case "tentative": return "hedged";
    case "active": return "normal";
    case "weakening": return "hedged";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Narrative Revision Cascade
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** narrative shift type から cascade 強度を算出 */
function shiftTypeSeverity(shiftType: string): number {
  switch (shiftType) {
    case "valence_flip": return 1.0;   // 極性反転 → 最大の cascade
    case "reframe": return 0.8;        // 意味づけの大幅変化
    case "agency_shift": return 0.6;   // 主体性変化
    case "softening": return 0.3;      // 留保化 → 小さい cascade
    case "intensification": return 0.2; // 確信深化 → 最小の cascade
    default: return 0;                  // minor_variation → cascade なし
  }
}

/**
 * Narrative revision が発生した時、関連する記憶への cascade decay を算出する。
 *
 * カスケード制約:
 * - 1回あたり最大 MAX_SINGLE_CASCADE_DECAY (0.1)
 * - 1ターン合計最大 MAX_TOTAL_CASCADE_DECAY (0.2)
 *
 * @param shiftType narrative shift の種類
 * @param relatedEntries 影響を受ける可能性がある記憶エントリ
 * @returns 各エントリへの confidence delta（負の値）
 */
export function computeNarrativeRevisionCascade(
  shiftType: string,
  relatedEntries: Array<{ id: string; type: MemoryType; currentConfidence: number }>,
): CascadeDecay[] {
  const severity = shiftTypeSeverity(shiftType);
  if (severity === 0) return [];

  const decays: CascadeDecay[] = [];
  let totalDecay = 0;

  for (const entry of relatedEntries) {
    if (totalDecay >= MAX_TOTAL_CASCADE_DECAY) break;

    // decay = severity × MAX_SINGLE_CASCADE_DECAY
    // (valence_flip → 0.1, reframe → 0.08, agency_shift → 0.06, ...)
    const rawDecay = severity * MAX_SINGLE_CASCADE_DECAY;
    const cappedDecay = Math.min(rawDecay, MAX_TOTAL_CASCADE_DECAY - totalDecay);
    const actualDecay = Math.min(cappedDecay, entry.currentConfidence); // confidence を 0 未満にしない

    if (actualDecay > 0.001) {
      decays.push({
        targetType: entry.type,
        confidenceDelta: -actualDecay,
        reason: `narrative_revision:${shiftType}`,
      });
      totalDecay += actualDecay;
    }
  }

  return decays;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contradiction Growth Cascade
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 矛盾が成長した時（新しい counter-evidence が追加された時）、
 * 関連する記憶への cascade decay を算出する。
 *
 * dualityStrength が高いほど cascade が強い。
 */
export function computeContradictionCascade(
  dualityStrength: number,
  relatedEntries: Array<{ id: string; type: MemoryType; currentConfidence: number }>,
): CascadeDecay[] {
  // dualityStrength < 0.3 → cascade なし（軽微な矛盾）
  if (dualityStrength < 0.3) return [];

  const decays: CascadeDecay[] = [];
  let totalDecay = 0;

  for (const entry of relatedEntries) {
    if (totalDecay >= MAX_TOTAL_CASCADE_DECAY) break;

    // decay = dualityStrength × 0.05（contradiction は narrative より穏やかに cascade）
    const rawDecay = dualityStrength * 0.05;
    const cappedDecay = Math.min(rawDecay, MAX_TOTAL_CASCADE_DECAY - totalDecay);
    const actualDecay = Math.min(cappedDecay, entry.currentConfidence);

    if (actualDecay > 0.001) {
      decays.push({
        targetType: entry.type,
        confidenceDelta: -actualDecay,
        reason: `contradiction_growth:strength=${dualityStrength.toFixed(2)}`,
      });
      totalDecay += actualDecay;
    }
  }

  return decays;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Batch Processing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** バッチ処理の結果 */
export interface MemoryPolicyResult {
  /** 各エントリの有効重みとステージ */
  weights: Map<string, EffectiveWeight>;
  /** prompt に含めるべきエントリ（hedged / normal） */
  includable: Array<{ id: string; mode: MemoryUsageMode; weight: number }>;
  /** 除外されるエントリ（candidate or weight ≈ 0） */
  excluded: string[];
  /** lifecycle 遷移が起きたエントリ */
  transitions: Array<{ id: string } & LifecycleTransition>;
}

/**
 * 記憶エントリのバッチに Memory Policy を適用する。
 *
 * @param entries id → MemoryEntry のマップ
 * @param previousStages 前回算出された各エントリの stage（遷移検出用。null = 初回）
 */
export function applyMemoryPolicy(
  entries: Map<string, MemoryEntry>,
  previousStages: Map<string, LifecycleStage> | null,
  now?: Date,
): MemoryPolicyResult {
  const weights = new Map<string, EffectiveWeight>();
  const includable: MemoryPolicyResult["includable"] = [];
  const excluded: string[] = [];
  const transitions: MemoryPolicyResult["transitions"] = [];

  for (const [id, entry] of entries) {
    const ew = computeEffectiveWeight(entry, now);
    weights.set(id, ew);

    const usage = determineMemoryUsage(ew.stage);
    if (usage === "exclude") {
      excluded.push(id);
    } else {
      includable.push({ id, mode: usage, weight: ew.weight });
    }

    // 遷移検出
    if (previousStages) {
      const prevStage = previousStages.get(id);
      if (prevStage && prevStage !== ew.stage) {
        transitions.push({
          id,
          from: prevStage,
          to: ew.stage,
          reason: describeTransitionReason(prevStage, ew.stage, ew.factors),
        });
      }
    }
  }

  // weight 順でソート（高い方が先）
  includable.sort((a, b) => b.weight - a.weight);

  return { weights, includable, excluded, transitions };
}

function describeTransitionReason(
  from: LifecycleStage,
  to: LifecycleStage,
  factors: EffectiveWeightFactors,
): string {
  if (to === "weakening") {
    if (factors.contradictionPressure > 0.4) return "contradiction_pressure_high";
    if (factors.freshness < 0.15) return "stale";
    return "combined_degradation";
  }
  if (to === "active" && from === "tentative") return "sufficient_evidence";
  if (to === "tentative" && from === "candidate") return "second_observation";
  if (to === "tentative" && from === "weakening") return "recovery_new_evidence";
  return `${from}_to_${to}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildMemoryPolicyAnalytics(
  result: MemoryPolicyResult,
  cascadeDecays: CascadeDecay[],
): Record<string, unknown> {
  const stageCounts: Record<string, number> = { candidate: 0, tentative: 0, active: 0, weakening: 0 };
  for (const ew of result.weights.values()) {
    stageCounts[ew.stage]++;
  }

  return {
    memory_total_entries: result.weights.size,
    memory_stage_counts: stageCounts,
    memory_includable_count: result.includable.length,
    memory_excluded_count: result.excluded.length,
    memory_transitions: result.transitions.map(t => ({
      from: t.from,
      to: t.to,
      reason: t.reason,
    })),
    memory_cascade_decays: cascadeDecays.length,
    memory_cascade_total_delta: cascadeDecays.reduce((sum, d) => sum + d.confidenceDelta, 0),
  };
}
