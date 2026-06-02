/**
 * Reality Control OS — Shadow Runner skeleton（Stage 2 / runtime-unconnected）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §2（shadow run）
 *
 * adapter 出力（RealityInput）＋候補 → Reality kernel（rank→receptivity→invariant）を通し、
 * **redacted summary**（counts / enum / risk / mode / rejected reason / delivery mode /
 * redacted id のみ）を返す純関数。
 *
 * 厳守（GPT 監査）— runtime-unconnected skeleton:
 *   - 既存 runtime / route / UI / Server Action / PlanClient から呼ばない・接続しない。
 *   - 実ユーザーデータを読まない（入力は引数）。console raw log なし。
 *   - DB 保存 / push / PRM 実更新 / native / Routes / 自動予定変更 なし。
 *   - **raw を出さない**：title / location / user text / 第三者名 / source raw signal を
 *     summary に含めない（型に存在しない＋id は redacted index に置換）。
 *   - **importanceHint / catastrophic は raw title 推測から決めない**（deriveImportance は
 *     structured signal のみ。raw text を受け取らない）。
 *
 * 候補生成（composition/repair generator）は未実装ゆえ、候補は呼び出し側（fixture）から渡す
 * = skeleton（kernel pipeline の配線のみ検証）。
 */

import { rankCandidates, type BestActionCandidate, type GateKind } from "../best-action";
import { evaluateReceptivityGate, type DeliveryMode, type ReceptivityInput } from "../receptivity-gate";
import { checkAllInvariants, type DecisionContext, type EngineMode, type InvariantId } from "../invariant-check";
import type { ImportanceTier } from "../lsat";
import type { RealityInput } from "./input-adapter";

/**
 * importance を **構造化シグナルのみ** から導く（raw title/本文を読まない）。
 * catastrophic は不可逆な構造化根拠（hardDeadline ∧ reservation/payment/external）からのみ。
 */
export interface StructuredImportanceSignals {
  readonly rigidity: "hard" | "soft";
  readonly userDeclared?: ImportanceTier; // 本人が明示
  readonly reservation?: boolean;
  readonly payment?: boolean;
  readonly hardDeadline?: boolean;
  readonly involvesOthers?: boolean;
  readonly externalDependency?: boolean;
  readonly cascadeRisk?: boolean;
}

export function deriveImportance(s: StructuredImportanceSignals): ImportanceTier {
  if (s.userDeclared) return s.userDeclared;
  // 不可逆 + 外部/予約/支払い → catastrophic（raw 推測ではなく構造化根拠）
  if (s.hardDeadline && (s.reservation || s.payment || s.externalDependency)) return "catastrophic";
  const elevated = s.reservation || s.payment || s.involvesOthers || s.cascadeRisk || s.externalDependency;
  if (s.rigidity === "hard" || elevated) return "important";
  return "normal";
}

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface ShadowSummary {
  readonly mode: EngineMode;
  readonly candidateCount: number;
  /** redacted ref（"c{index}"。raw id を出さない） */
  readonly bestRef: string | null;
  readonly rejected: readonly { readonly ref: string; readonly gates: readonly GateKind[] }[];
  readonly deliveryMode: DeliveryMode | null;
  readonly invariantViolations: readonly InvariantId[];
  /** counts/enum のみの 1 行（raw を含まない） */
  readonly line: string;
}

export interface ShadowInput {
  /** adapter 出力（mode 等） */
  readonly input: RealityInput;
  /** 候補（generator 未実装ゆえ fixture から） */
  readonly candidates: readonly BestActionCandidate[];
  readonly receptivity?: ReceptivityInput;
  readonly intervened: boolean;
  readonly conditionPresent: boolean;
}

function riskFromGates(gateCount: number): RiskLevel {
  if (gateCount === 0) return "none";
  if (gateCount === 1) return "low";
  if (gateCount === 2) return "medium";
  return "high";
}

/** shadow 実行（純関数）。adapter→kernel を通し redacted summary を返す。 */
export function runShadow(shadow: ShadowInput): ShadowSummary {
  const { candidates } = shadow;
  // raw id → redacted index ref
  const refOf = new Map<string, string>();
  candidates.forEach((c, i) => refOf.set(c.id, `c${i}`));

  const rank = rankCandidates(candidates);
  const bestRef = rank.best ? refOf.get(rank.best.candidate.id) ?? null : null;
  const rejected = rank.rejected.map((r) => ({
    ref: refOf.get(r.candidate.id) ?? "c?",
    gates: r.gates.filter((g) => !g.pass).map((g) => g.gate),
  }));

  const delivery = shadow.receptivity ? evaluateReceptivityGate(shadow.receptivity) : null;
  const deliveryMode = delivery?.mode ?? null;

  let invariantViolations: InvariantId[] = [];
  if (rank.best) {
    const ctx: DecisionContext = {
      mode: shadow.input.mode,
      candidate: rank.best.candidate,
      delivery: delivery ?? undefined,
      intervened: shadow.intervened,
      conditionPresent: shadow.conditionPresent,
    };
    invariantViolations = checkAllInvariants(ctx)
      .filter((r) => r.applicable && !r.pass)
      .map((r) => r.id);
  }

  const worstReject = rejected.reduce((m, r) => Math.max(m, r.gates.length), 0);
  const risk = riskFromGates(worstReject + invariantViolations.length);

  const line =
    `mode=${shadow.input.mode} candidates=${candidates.length} best=${bestRef ?? "none"} ` +
    `rejected=${rejected.length} delivery=${deliveryMode ?? "none"} ` +
    `violations=${invariantViolations.length} risk=${risk}`;

  return {
    mode: shadow.input.mode,
    candidateCount: candidates.length,
    bestRef,
    rejected,
    deliveryMode,
    invariantViolations,
    line,
  };
}
