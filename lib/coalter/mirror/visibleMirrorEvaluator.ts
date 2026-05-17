/**
 * CoAlter AOO Phase B B-5b — Visible Mirror Evaluator (pure orchestration)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §10
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5b 段階):
 *   useMirrorEngine hook 内の **visible 出力判定 logic** を pure function に抽出。
 *   hook (React) は state 管理 + effect lifecycle、本 function は純粋な判定。
 *
 *   この分離により:
 *     - hook を node (jsdom 不要) 環境で test できる ように上流の純粋判定を取り出す
 *     - 4-gate (sleep → cap → text generation → verification) の順序を明示的に
 *     - 各 gate の reason を `VisibleMirrorEvalResult` に enum で残せる (diagnostic 用)
 *
 * 4-gate 順序 (fail-fast):
 *   1. **decision check**: type !== "MIRROR_CANDIDATE" → absent (`decision_stay_silent`)
 *   2. **sleep check**: sleep ON → absent (`sleep_on`)
 *   3. **cap check**: visible cap reached → absent (`visible_cap_reached`)
 *   4. **text generation**: generator returns not_applicable → absent (`text_not_generated`)
 *   5. **verification**: verify fail → absent (`verification_failed` + verificationFailReason)
 *   6. ALL pass → visible (text + templateId)
 *
 *   注: sleep / cap check は generator / verification より**前** に走る (cost ゼロの early-out)
 *
 * 設計原則:
 *   - **pure / deterministic / side-effect-free**
 *   - **counter increment は呼ばない** (caller の責任、test isolation 向上)
 *   - **diagnostic push もしない** (caller 側で reason を取り出して push)
 *   - **input mutation なし**
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 file は新規)
 *   - sleepStore / frequencyCap module への write なし (read only or 引数経由)
 */

import { generateMirrorText } from "./mirrorTextGenerator";
import { verifyMirrorText } from "./postSpeakVerification";
import type { MirrorDecision, MirrorDecisionInput } from "./types";
import type {
  VisibleMirrorEvalResult,
  VisibleMirrorTemplateId,
  MirrorTextGeneratorInput,
} from "./visibleMirrorTypes";

/**
 * Evaluator input — engine 出力 + session-local state を集約。
 *
 * **PII firewall**: raw text / userId / messageId 等は型に存在しない。
 */
export interface VisibleMirrorEvaluatorInput {
  readonly decision: MirrorDecision;
  readonly engineInput: MirrorDecisionInput;
  readonly sleepOn: boolean;
  readonly visibleCapReached: boolean;
  readonly recentlyEmittedTemplateIds: ReadonlyArray<VisibleMirrorTemplateId>;
}

/**
 * Engine input → text generator input への projection (PII drop)。
 *
 * pure / immutable。
 */
function projectToGeneratorInput(
  engineInput: MirrorDecisionInput,
): MirrorTextGeneratorInput {
  const mode: MirrorTextGeneratorInput["mode"] =
    engineInput.modeContext.status === "known" ? engineInput.modeContext.mode : null;

  return {
    mode,
    alignmentBucket: engineInput.alignment.bucket,
    uncertaintyBucket: engineInput.uncertainty.bucket,
    silenceBudgetBucket: engineInput.silenceBudget.bucket,
  };
}

/**
 * Visible Mirror 評価 (4-gate orchestration)。
 *
 * @param input - {@link VisibleMirrorEvaluatorInput}
 * @returns {@link VisibleMirrorEvalResult}
 *
 * **gate 順序**:
 *   1. decision === STAY_SILENT → absent (decision_stay_silent)
 *   2. sleepOn === true → absent (sleep_on)
 *   3. visibleCapReached === true → absent (visible_cap_reached)
 *   4. generator.kind === not_applicable → absent (text_not_generated)
 *   5. verify.ok === false → absent (verification_failed)
 *   6. visible (text + templateId)
 *
 * @example
 *   evaluateVisibleMirror({
 *     decision: { type: "MIRROR_CANDIDATE", reason: "speak_passed", ervScore: 0.9 },
 *     engineInput: {...},
 *     sleepOn: false,
 *     visibleCapReached: false,
 *     recentlyEmittedTemplateIds: [],
 *   })
 *   // → { kind: "visible", text: "...", templateId: "..." }
 */
export function evaluateVisibleMirror(
  input: VisibleMirrorEvaluatorInput,
): VisibleMirrorEvalResult {
  // (1) decision check
  if (input.decision.type !== "MIRROR_CANDIDATE") {
    return { kind: "absent", reason: "decision_stay_silent" };
  }

  // (2) sleep check (cost ゼロ early-out)
  if (input.sleepOn) {
    return { kind: "absent", reason: "sleep_on" };
  }

  // (3) cap check (cost ゼロ early-out)
  if (input.visibleCapReached) {
    return { kind: "absent", reason: "visible_cap_reached" };
  }

  // (4) text generation
  const genInput = projectToGeneratorInput(input.engineInput);
  const gen = generateMirrorText(genInput);
  if (gen.kind !== "generated") {
    return { kind: "absent", reason: "text_not_generated" };
  }

  // (5) verification (7-layer)
  const verify = verifyMirrorText({
    text: gen.text,
    templateId: gen.templateId,
    recentlyEmittedTemplateIds: input.recentlyEmittedTemplateIds,
  });
  if (!verify.ok) {
    return {
      kind: "absent",
      reason: "verification_failed",
      verificationFailReason: verify.reason,
    };
  }

  // (6) ALL pass → visible
  return {
    kind: "visible",
    text: gen.text,
    templateId: gen.templateId,
  };
}
