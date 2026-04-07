/**
 * P1.5 Verification Constraints — HDM v1
 *
 * P1 の検証層（rupture / abstention / negcap）は prompt-injection のみだった。
 * P1.5 はこれらを構造的制約に昇格させる:
 *
 * - Abstention → responseMode 制限 + claimStrength cap + hedging 強制
 * - Rupture → repair mode 強制 + phase demotion フラグ
 * - Prediction Crash → confidence 低下 + phase demotion
 * - Negative Capability → 仮説揺さぶり + 断定抑制
 *
 * 設計原則:
 *   - P1 の prompt block は残す（LLM への指示）
 *   - P1.5 はそれに加え、パイプライン変数を直接書き換える
 *   - fail-open: P1.5 エラーは既存フローを止めない
 *
 * @see docs/heart-dynamics-model-v1.md §6.1, §6.2
 */
import "server-only";

import type { RuptureAssessment } from "./ruptureDetection";
import type { AbstentionSignal } from "./abstentionEngine";
import type { NegativeCapabilityState } from "./negativeCapability";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types (re-declare locally to avoid circular imports)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Matches alterHomeAdapter ResponseMode */
type ResponseMode = "conclude" | "branch" | "clarify" | "direct_response" | "repair";

/** Matches alterThinSlice ClaimStrength */
type ClaimStrength = "assert" | "lean_in" | "probe" | "hold";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P1.5 Constraint Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface P15VerificationConstraints {
  /** Claim strength の上限（null = 制限なし） */
  claimStrengthCap: ClaimStrength | null;
  /** ResponseMode を強制上書き（null = 上書きなし） */
  forcedResponseMode: ResponseMode | null;
  /** Mode 上書きの理由 */
  modeOverrideReason: string | null;
  /** 全ての断定にヘッジング（留保表現）を強制 */
  hedgingRequired: boolean;
  /** Phase 降格を要求 */
  phaseDemotionRequested: boolean;
  /** 構造的プロンプトブロック（P1 の hint 系とは別に、行動制約として注入） */
  structuralPromptBlocks: string[];
  /** 発火した制約の識別子（analytics 用） */
  activeConstraints: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Claim Strength Ordering
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STRENGTH_ORDER: ClaimStrength[] = ["hold", "probe", "lean_in", "assert"];

function strengthIndex(s: ClaimStrength): number {
  return STRENGTH_ORDER.indexOf(s);
}

/** 現在の cap と新しい cap のうち、より厳しい方を返す */
function capDown(current: ClaimStrength | null, newCap: ClaimStrength): ClaimStrength {
  if (current === null) return newCap;
  return strengthIndex(current) <= strengthIndex(newCap) ? current : newCap;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: Compute Constraints
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * P1 検証層の出力を構造的制約に変換する。
 *
 * ── 合成ルール（P1.5 監査 2026-04-07 確定） ──
 *
 * 1. claimStrengthCap: 単調降格合成（capDown）。
 *    hold < probe < lean_in < assert の順。常に厳しい方が残る。
 *
 * 2. forcedResponseMode: 後勝ち。評価順 = abstention → rupture。
 *    rupture が検出されれば必ず repair が最終値。
 *    crash / overfit は mode を変えない。
 *
 * 3. phaseDemotionRequested: OR 合成。1つでも true なら true。
 *
 * 4. hedgingRequired: OR 合成。1つでも true なら true。
 *
 * 5. structuralPromptBlocks: 加算。衝突しない（独立した指示）。
 *
 * 6. tone（warm/provocative/analytical）: P1.5 スコープ外。
 *    hedgingRequired が間接的に tone を制約する。
 *    直接的な tone 制御は P2（Phase/Trust 制御）で行う。
 */
export function computeVerificationConstraints(
  rupture: RuptureAssessment | null,
  abstention: AbstentionSignal | null,
  negCap: NegativeCapabilityState | null,
): P15VerificationConstraints {
  const constraints: P15VerificationConstraints = {
    claimStrengthCap: null,
    forcedResponseMode: null,
    modeOverrideReason: null,
    hedgingRequired: false,
    phaseDemotionRequested: false,
    structuralPromptBlocks: [],
    activeConstraints: [],
  };

  // ── P1.5-1: Abstention → 構造的制約 ──
  // abstention は「分からない」を第一級化する。
  // 既存の ResponseMode を潰すのではなく、claim strength を cap して
  // 断定を構造的に不可能にする。
  if (abstention?.shouldAbstain) {
    constraints.hedgingRequired = true;
    constraints.activeConstraints.push(`abstention:${abstention.reason}`);

    switch (abstention.reason) {
      case "insufficient_observation":
        // 観測不足: 断定禁止、問いかけに留める
        constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "probe");
        break;

      case "conflicting_evidence":
        // 矛盾する仮説: 一方に偏らせない → branch で複数視点提示
        constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "probe");
        if (!constraints.forcedResponseMode) {
          constraints.forcedResponseMode = "branch";
          constraints.modeOverrideReason = "abstention_conflicting_evidence";
        }
        break;

      case "out_of_scope":
        // Alter の守備範囲外: 一切の主張を止める
        constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "hold");
        break;

      case "low_confidence_topic":
        // この話題での精度が低い: 慎重に
        constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "probe");
        break;

      case "dignity_risk":
        // 尊厳リスク: 深い分析を避け、受容的に
        constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "hold");
        if (!constraints.forcedResponseMode || constraints.forcedResponseMode !== "repair") {
          constraints.forcedResponseMode = "direct_response";
          constraints.modeOverrideReason = "abstention_dignity_risk";
        }
        break;
    }
  }

  // ── P1.5-2: Rupture → repair mode 強制 + phase demotion ──
  // rupture は最優先。既に選ばれた mode を上書きする。
  if (rupture && rupture.type !== "none") {
    constraints.activeConstraints.push(`rupture:${rupture.type}:sev${rupture.severity.toFixed(2)}`);

    // rupture 検出 → 必ず repair mode
    constraints.forcedResponseMode = "repair";
    constraints.modeOverrideReason = `rupture_${rupture.type}`;

    // 高 severity → Phase 降格
    if (rupture.phaseDemotion) {
      constraints.phaseDemotionRequested = true;
    }

    if (rupture.type === "confrontation") {
      // 対立型: 一切の主張を止める（弁護しない）
      constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "hold");
      constraints.hedgingRequired = true;
    } else {
      // 引きこもり型: probe まで許容（沈黙を埋めるための問いかけ）
      constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "probe");
      constraints.hedgingRequired = true;
    }
  }

  // ── P1.5-3: Prediction Crash → confidence 低下 ──
  if (negCap) {
    if (negCap.crash.severity === "critical") {
      constraints.activeConstraints.push("crash:critical");
      constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "hold");
      constraints.hedgingRequired = true;
      constraints.phaseDemotionRequested = true;
      constraints.structuralPromptBlocks.push(
        "## 構造的制約: 予測精度 critical\n" +
        "断定的洞察の生成を禁止する。全ての分析は仮説として提示すること。\n" +
        "「僕の理解がズレているかもしれない」と正直に伝えること。",
      );
    } else if (negCap.crash.severity === "warning") {
      constraints.activeConstraints.push("crash:warning");
      constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "probe");
      constraints.hedgingRequired = true;
    }

    // ── P1.5-4: Negative Capability → 断定抑制 ──
    if (negCap.overfit.severity === "warning") {
      constraints.activeConstraints.push("overfit:warning");
      constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "lean_in");
      constraints.structuralPromptBlocks.push(
        "## 構造的制約: 過学習警戒\n" +
        "確定的な言い切りを避けること。ユーザーの変化の可能性を常に念頭に置くこと。\n" +
        "「もし逆だったら？」と自問してから応答すること。",
      );
    }

    if (negCap.hypothesisShakeNeeded) {
      constraints.activeConstraints.push("hypothesis_shake");
      constraints.hedgingRequired = true;
      constraints.claimStrengthCap = capDown(constraints.claimStrengthCap, "lean_in");
    }

    if (negCap.uncertainDomains.length > 0) {
      constraints.activeConstraints.push(`uncertain_domains:${negCap.uncertainDomains.join(",")}`);
      constraints.hedgingRequired = true;
    }
  }

  return constraints;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Apply Claim Strength Cap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * thin-slice の ClaimStrength に P1.5 の cap を適用する。
 * cap より強い strength は cap まで降格される。
 */
export function applyClaimStrengthCap(
  current: "assert" | "lean_in" | "probe" | "hold",
  cap: ClaimStrength | null,
): "assert" | "lean_in" | "probe" | "hold" {
  if (cap === null) return current;
  return strengthIndex(current) > strengthIndex(cap) ? cap : current;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hedging Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * hedging が必要な場合、LLM に断定語の禁止を明示するブロックを返す。
 * P1 の「助言」とは異なり、これは構造的な行動制約。
 */
export function buildHedgingPromptBlock(constraints: P15VerificationConstraints): string | null {
  if (!constraints.hedgingRequired) return null;

  const reasons = constraints.activeConstraints.join(", ");
  return (
    `\n## 構造的制約: ヘッジング必須（${reasons}）\n` +
    `以下のルールを厳守すること:\n` +
    `- 全ての分析・洞察に「〜かもしれない」「〜の可能性がある」等の留保を付けること\n` +
    `- 「確実に」「間違いなく」「明らかに」「絶対に」等の断定語を使わないこと\n` +
    `- 自分の理解が不完全である可能性を前提に話すこと\n` +
    `- 断定禁止は「弱気」ではなく「正直さ」として表現すること`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hypothesis Stats Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HypothesisStats {
  /** 高確信仮説（confidence > 0.8）の割合 */
  highConfidenceRatio: number;
  /** 矛盾する仮説が存在するか */
  hasConflictingHypotheses: boolean;
  /** 仮説の平均 staleness（日数）*/
  avgStaleness: number;
}

/**
 * DB から取得した仮説データから NegCap / Abstention 用の統計を計算する。
 * hypothesisFactEntries が null の場合はデフォルト値を返す。
 */
export function computeHypothesisStats(
  hypotheses: Array<{
    confidence: number;
    status: string;
    updated_at?: string | null;
    contradiction_count?: number;
  }> | null,
): HypothesisStats {
  if (!hypotheses || hypotheses.length === 0) {
    return { highConfidenceRatio: 0, hasConflictingHypotheses: false, avgStaleness: 0 };
  }

  const highConfCount = hypotheses.filter(h => h.confidence > 0.8).length;
  const highConfidenceRatio = highConfCount / hypotheses.length;

  // 矛盾検出: weakening ステータス or contradiction_count > 0
  const hasConflictingHypotheses = hypotheses.some(
    h => h.status === "weakening" || (h.contradiction_count != null && h.contradiction_count > 0),
  );

  // Staleness: updated_at からの日数
  const now = Date.now();
  let totalStaleness = 0;
  let validCount = 0;
  for (const h of hypotheses) {
    if (h.updated_at) {
      const updatedAt = new Date(h.updated_at).getTime();
      if (!isNaN(updatedAt)) {
        totalStaleness += (now - updatedAt) / (1000 * 60 * 60 * 24); // days
        validCount++;
      }
    }
  }
  const avgStaleness = validCount > 0 ? totalStaleness / validCount : 0;

  return { highConfidenceRatio, hasConflictingHypotheses, avgStaleness };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildP15ConstraintAnalytics(
  constraints: P15VerificationConstraints,
): Record<string, unknown> {
  return {
    p15_active_constraints: constraints.activeConstraints,
    p15_claim_cap: constraints.claimStrengthCap,
    p15_forced_mode: constraints.forcedResponseMode,
    p15_mode_override_reason: constraints.modeOverrideReason,
    p15_hedging_required: constraints.hedgingRequired,
    p15_phase_demotion_requested: constraints.phaseDemotionRequested,
    p15_structural_blocks_count: constraints.structuralPromptBlocks.length,
  };
}
