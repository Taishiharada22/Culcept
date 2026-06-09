/**
 * Reality Control OS — A-4-b Display-apply Reflection Preview Harness（**pure・fixture・no-write・Plan 本線非接続**・barrel 非 export）
 *
 * 設計: docs/reality-apply-target-decision-a4-0.md（A-4-b）/ docs/reality-apply-transaction-design.md（Display-apply）
 *
 * 役割: Display-apply の一連の pure chain を **1 関数で通す** harness。
 *   `ChangeSet draft（R5-2 出力）→ A-2 prepareApplyDraft → A-1 evaluateApplyPrecondition → A-4-a reflectChangeSetIntoDraftPlan`
 *   ＝「提案が DraftPlan preview にどう映るか」の **観測用 computation**。**apply / write / persist の意味を持たない**
 *   （naming も `ReflectionPreview` とし、apply 実行と誤解させない）。
 *
 * 厳守:
 *   - **pure・no-write**（Supabase/fetch/route/PlanClient なし）・DraftPlan は **fixture を caller が渡す**（Plan 本線から取らない）。
 *   - **A-2 が失敗（prepared=null）なら reflect しない**。**A-1 が can_apply でなければ reflect しない**（blockers summary のみ返す）。
 *   - 未反映時は **入力 DraftPlan を同一参照で返す**（preview にも痕跡を残さない）。
 *   - summary は **安定コードのみ**（raw/PII/seedRef/utterance/personality/trait を返さない・redaction は A-2/A-4-a が担保）。
 *   - cross-track 不接触（consumed-seed-merge / plan-seed-status-executor / capture RPC / plan_seeds migration を import しない・draft-plan は型のみ）。
 */

import type { ChangeSet } from "../change-set";
import type { WorldState } from "../world-state/world-state";
import type { DraftPlan, DraftPlanItemOrigin } from "../../draft-plan";
import type { SourceTrace } from "../source-trace";
import type { ActionKind, PermissionLevel, RiskFlag } from "./permission-model";
import { prepareApplyDraft, type IdMintPort } from "./apply-draft-prepare";
import {
  evaluateApplyPrecondition,
  type AppliedSetSnapshot,
  type ApplyPreconditionVerdict,
} from "./apply-precondition";
import { reflectChangeSetIntoDraftPlan } from "./reflect-change-set-into-draft-plan";

export interface ReflectionPreviewInput {
  /** R5-2 の ChangeSet draft（synthetic id・sourceTraces 空のまま渡してよい＝A-2 が整形）。 */
  readonly draft: ChangeSet;
  /** preview 先の DraftPlan **fixture**（Plan 本線から取らない・mutation しない）。 */
  readonly draftPlan: DraftPlan;
  /** 現実状態（fixture / 4-D reader 由来を caller が渡す）。 */
  readonly liveWorldState: WorldState;
  /** A-2: id mint port（実採番しない・display 用 deterministic fake）。 */
  readonly idMint: IdMintPort;
  /** A-2: 注入 provenance（既存観測由来・auditable のみ通る）。 */
  readonly provenance: readonly SourceTrace[];
  /** A-1: 実 permission level。 */
  readonly level: PermissionLevel;
  /** A-1: **apply 用 ActionKind**（propose ではない）。 */
  readonly applyAction: ActionKind;
  readonly flags?: readonly RiskFlag[];
  readonly baseVersion?: string;
  readonly computedAtMs?: number;
  readonly nowMs?: number;
  readonly appliedSnapshot?: AppliedSetSnapshot;
  readonly confirmation?: { readonly confirmed: boolean };
  /** A-4-a: draft の対象日（same-day filter）。 */
  readonly changeSetDate: string;
  /** A-4-a: 反映 origin（既存 union 値のみ・既定 rhythm_inferred）。 */
  readonly origin?: DraftPlanItemOrigin;
}

/** chain がどこまで進んだか（安定コード）。 */
export type ReflectionPreviewStage = "prepare" | "precondition" | "reflect" | "done";

/** **安定コードのみ**の summary（raw/PII なし）。 */
export interface ReflectionPreviewSummary {
  readonly stage: ReflectionPreviewStage;
  readonly prepareBlockers: readonly string[];
  readonly preconditionVerdict: ApplyPreconditionVerdict | null;
  readonly preconditionBlockers: readonly string[];
  readonly reflectedItemCount: number;
  readonly warnings: readonly string[];
}

export interface ReflectionPreviewResult {
  /** DraftPlan preview に反映されたか（＝表示候補が出来たか・apply ではない）。 */
  readonly reflected: boolean;
  /** preview（未反映時は **入力と同一参照**）。 */
  readonly draftPlan: DraftPlan;
  readonly summary: ReflectionPreviewSummary;
}

/**
 * A-4-b: Display-apply chain を fixture で通す（**pure・観測のみ・書かない**）。
 *   prepare 失敗 → stage="prepare"・reflect しない。precondition≠can_apply → stage="precondition"・reflect しない。
 *   reflect で新規 0（duplicate 等）→ stage="reflect"・reflected=false。成功 → stage="done"・reflected=true。
 */
export function buildReflectionPreview(input: ReflectionPreviewInput): ReflectionPreviewResult {
  // ── stage 1: A-2 prepare（G1 provenance + G2 real id）。失敗なら reflect に進まない ──
  const prep = prepareApplyDraft({ draft: input.draft, idMint: input.idMint, provenance: input.provenance });
  if (!prep.prepared) {
    return {
      reflected: false,
      draftPlan: input.draftPlan, // 同一参照（preview 不変）
      summary: {
        stage: "prepare",
        prepareBlockers: prep.blockers,
        preconditionVerdict: null,
        preconditionBlockers: [],
        reflectedItemCount: 0,
        warnings: prep.warnings,
      },
    };
  }

  // ── stage 2: A-1 precondition（apply ActionKind で再評価・stale/conflict/undo/idempotency/confirmation）──
  const pre = evaluateApplyPrecondition({
    draft: prep.prepared,
    liveWorldState: input.liveWorldState,
    level: input.level,
    applyAction: input.applyAction,
    flags: input.flags,
    baseVersion: input.baseVersion,
    computedAtMs: input.computedAtMs,
    nowMs: input.nowMs,
    appliedSnapshot: input.appliedSnapshot,
    confirmation: input.confirmation,
  });
  if (!pre.canApply) {
    return {
      reflected: false,
      draftPlan: input.draftPlan, // 同一参照（blockers summary だけ返す）
      summary: {
        stage: "precondition",
        prepareBlockers: [],
        preconditionVerdict: pre.verdict,
        preconditionBlockers: pre.blockers,
        reflectedItemCount: 0,
        warnings: [...prep.warnings, ...pre.warnings],
      },
    };
  }

  // ── stage 3: A-4-a reflect（additive・same-day・duplicate guard・HH:MM 保持・redaction）──
  const refl = reflectChangeSetIntoDraftPlan(input.draftPlan, prep.prepared, {
    changeSetDate: input.changeSetDate,
    origin: input.origin,
  });
  const reflectedItemCount = refl.draftPlan.items.length - input.draftPlan.items.length;
  return {
    reflected: reflectedItemCount > 0,
    draftPlan: refl.draftPlan, // 新規 0 なら A-4-a が同一参照を返す
    summary: {
      stage: reflectedItemCount > 0 ? "done" : "reflect",
      prepareBlockers: [],
      preconditionVerdict: pre.verdict,
      preconditionBlockers: [],
      reflectedItemCount,
      warnings: [...prep.warnings, ...pre.warnings, ...refl.warnings],
    },
  };
}
