/**
 * Reality Control OS — A1-7-18 Later / Deferred Learning Event Policy（**pure・no-DB・no-server-only**・design-aligned）
 *
 * 設計: docs/prm-later-deferred-policy.md（A1-7-18）/ docs/prm-learning-event-insert-path-design.md（A1-7-13）/ §10.18
 *
 * 役割: accept/dismiss/**later** の学習意味論を **route 非依存の pure policy** に切り出す。
 *   1. `decideLearningWrite`: action が **validly processed（accepted）** なら write（later も対象）。失敗（!accepted）は skip。
 *   2. `learningEventDedupKey`: **handle+action+acted_date（日粒度）** の dedup key。**同日反復（特に later 連打）を 1 信号に collapse**し、
 *      **異日反復は別 key=慢性 deferral として蓄積**する（aggregation 側で適用＝非断定・信号整合）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / network / Date.now / LLM なし。型は erase される type-only import のみ。
 *   - **non-assertion**: later は最弱証拠（多義）→ 同日連打を過大計上しない（dedup grain=日）。異日反復のみ蓄積。
 *   - **既存 event 形と整合**: signal は A1-7-0 と同じ（accept=adoption / dismiss=non_adoption / later=deferral）。
 */

import type { CandidateActionKind } from "../candidate-action";
import type { LearningSignal } from "./dry-run-learning-event";

/** action route の最小 outcome 契約（**accepted のみ参照**・action が signal を決める）。 */
export interface ActionOutcomeForPolicy {
  /** action が validly processed されたか（accept→consumed / dismiss→rejected 成功 / later=deferred 成立）。false=失敗/conflict/unresolved。 */
  readonly accepted: boolean;
}

/** learning write の判定（write/skip + 信号方向 + 理由）。 */
export interface LearningWriteDecision {
  readonly write: boolean;
  readonly signal: LearningSignal | null;
  readonly reason: "adoption" | "non_adoption" | "deferral" | "action_not_accepted";
}

const ACTION_SIGNAL: Record<CandidateActionKind, LearningSignal> = {
  accept: "adoption",
  dismiss: "non_adoption",
  later: "deferral",
};
const ACTION_REASON: Record<CandidateActionKind, "adoption" | "non_adoption" | "deferral"> = {
  accept: "adoption",
  dismiss: "non_adoption",
  later: "deferral",
};

/**
 * A1-7-18: action が accepted（validly processed）なら learning event を write する（**later も対象**）。
 *   - accept → write/adoption / dismiss → write/non_adoption / later → write/deferral（**A1-7-17 の deferred 除外を是正**）。
 *   - !accepted（失敗/conflict/unresolved）→ skip。**later は status 遷移を持たないが accepted=true ゆえ write 対象**。
 *   pure: 副作用なし。glue（route connection）はこの .write で gate する想定（wiring は別 gate）。
 */
export function decideLearningWrite(action: CandidateActionKind, outcome: ActionOutcomeForPolicy): LearningWriteDecision {
  if (!outcome.accepted) return { write: false, signal: null, reason: "action_not_accepted" };
  return { write: true, signal: ACTION_SIGNAL[action], reason: ACTION_REASON[action] };
}

/**
 * A1-7-18: learning event の **dedup key（handle + action + acted_date）**。
 *   - **同日（UTC）反復は同 key**＝同一決定（特に later 連打）を 1 信号に collapse（非断定・信号過大計上防止）。
 *   - **異日反復は別 key**＝慢性 deferral / 再 action を別信号として蓄積。
 *   - accept/dismiss は status 遷移で反復不能ゆえ衝突せず（日粒度でも安全）。
 *   - acted_date は acted_at ISO の先頭 10 文字（YYYY-MM-DD・UTC 日）。null/空は ""（同 handle+action の null を collapse）。
 *   適用層: **aggregation（A1-7-1）**（events は raw 源・append-only。dedup は read 側で信号整合）。
 *   注: UTC 日粒度（local 日精緻化は将来）。
 */
export function learningEventDedupKey(handle: string, action: CandidateActionKind, actedAtISO: string | null): string {
  const actedDate = (actedAtISO ?? "").slice(0, 10);
  return `${handle}::${action}::${actedDate}`;
}
