/**
 * T6B — 決定論 readiness core（**pure・未配線**）
 *
 * 設計: readiness-types.ts + GPT note 2026-06-12
 *
 * 入力: T5 `DecisionResult` + 選択された `TravelProposal`（+ 任意 `ReadinessPolicy` 純 input）
 * 出力: `ReadinessResult`（許可レベルのみ・**実予約/カレンダー/外部 booking は実行しない**）
 *
 * 厳守（純・決定論）:
 *   - 場所/経路/予約 API・カレンダー write・LLM・外部データ・I/O・DB なし。import は travel core/types のみ。
 *   - **fail-closed**: required 欠如 / blocked / 選択不正 では提案させない。
 *   - 確認必須: 有償予約 / 長期移動 / 取消不能 / 相手影響 / 高 uncertainty / private 制約衝突。
 *   - ★ private 制約衝突は確認/ブロックを起こしてよいが、**shared rationale / shared view に漏らさない**。
 */

import type { ViewerScopedRationale } from "./core-types";
import type { DecisionResult } from "./decision-types";
import type { TravelProposal } from "./proposal-types";
import type {
  ActionKind,
  ConfirmationReason,
  ReadinessPolicy,
  ReadinessResult,
  RequiredConfirmation,
} from "./readiness-types";

export interface ReadinessInput {
  decision: DecisionResult;
  /** decision.recommendedProposalId に一致する案（呼び出し側が供給・T6 は lookup しない） */
  selected: TravelProposal | null;
  policy?: ReadinessPolicy;
}

const ACTION_RANK: Record<ActionKind, number> = {
  discuss_only: 0,
  propose_plan: 1,
  schedule_hold: 2,
  reserve_or_book_later: 3,
};

const ACTION_JA: Record<ActionKind, string> = {
  discuss_only: "相談",
  propose_plan: "提案",
  schedule_hold: "仮おさえ",
  reserve_or_book_later: "予約手続き",
};

function inheritForParticipant(d: DecisionResult): Record<string, string> {
  return { ...d.rationale.forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: assessReadiness
// ─────────────────────────────────────────────────────────────────────────────

export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const d = input.decision;
  const intended: ActionKind = input.policy?.intendedAction ?? "propose_plan";

  const nonRecommend = (state: ReadinessResult["state"], shared: string, pendingQuestion: ReadinessResult["pendingQuestion"]): ReadinessResult => ({
    authoritative: true,
    state,
    actionKind: "discuss_only",
    requiredConfirmations: [],
    riskFlags: [],
    blockers: d.blockers,
    pendingQuestion,
    participantApprovalRequired: [],
    rationale: { shared, forParticipant: inheritForParticipant(d) },
    inputError: d.inputError,
  });

  // 1. blocked（hard gate）
  if (d.state === "blocked") return nonRecommend("blocked", "まだ提案できる段階ではありません", null);
  // 2. needs_question
  if (d.state === "needs_question") return nonRecommend("needs_question", "決めるにはもう少し情報が必要です", d.followUpQuestion);
  // 3. tie → not_ready（単一案が未確定）
  if (d.state === "tie") return nonRecommend("not_ready", "案が拮抗しています。好みを教えてください", d.followUpQuestion);

  // 4. recommend
  const selected = input.selected;
  if (!selected || selected.candidateId !== d.recommendedProposalId) {
    return nonRecommend("not_ready", "選択された案が確定していません", null);
  }

  const rank = ACTION_RANK[intended];
  const participantIds = d.impact.map((e) => e.participantId);
  const multiParticipant = participantIds.length >= 2;
  const overnight = selected.timeWindow?.kind === "range";
  const uncertaintyHigh = selected.uncertainty === "high";
  const stretchedPrivate = d.impact.some((e) => e.stretchedPrivate > 0);

  const riskFlags: ConfirmationReason[] = [];
  const requiredConfirmations: RequiredConfirmation[] = [];
  const detect = (reason: ConfirmationReason, present: boolean, gate: boolean, visibility: RequiredConfirmation["visibility"]) => {
    if (!present) return;
    riskFlags.push(reason);
    if (gate) requiredConfirmations.push({ reason, visibility });
  };

  detect("paid_booking", !!input.policy?.involvesPaidBooking, rank >= 3, "shared");
  detect("long_travel", overnight, rank >= 2, "shared");
  detect("irreversible", !!input.policy?.irreversible, rank >= 2, "shared");
  detect("other_participant_impact", multiParticipant, rank >= 2, "shared");
  detect("high_uncertainty", uncertaintyHigh, rank >= 1, "shared");
  detect("private_constraint_conflict", stretchedPrivate, rank >= 1, "private");

  const state: ReadinessResult["state"] = requiredConfirmations.length > 0 ? "needs_confirmation" : "ready_to_propose";
  // schedule_hold 以上は共有資源を commit → 参加者承認が必要
  const participantApprovalRequired = rank >= 2 && multiParticipant ? participantIds : [];

  const rationale = buildRecommendRationale(d, intended, state, requiredConfirmations, stretchedPrivate);

  return {
    authoritative: true,
    state,
    actionKind: intended,
    requiredConfirmations,
    riskFlags,
    blockers: d.blockers,
    pendingQuestion: null,
    participantApprovalRequired,
    rationale,
    inputError: null,
  };
}

function buildRecommendRationale(
  d: DecisionResult,
  intended: ActionKind,
  state: ReadinessResult["state"],
  confirmations: RequiredConfirmation[],
  stretchedPrivate: boolean,
): ViewerScopedRationale {
  const forParticipant = inheritForParticipant(d);
  // ★ shared 文には shared 確認理由のみ。private 確認理由は出さない。
  const sharedReasons = confirmations.filter((c) => c.visibility === "shared").map((c) => c.reason);
  let shared: string;
  if (state === "ready_to_propose") {
    shared = `この案を${ACTION_JA[intended]}できます。`;
  } else {
    shared = sharedReasons.length > 0
      ? `${ACTION_JA[intended]}の前に確認が必要です（${sharedReasons.join("・")}）。`
      : `${ACTION_JA[intended]}の前に確認が必要です。`;
  }
  // private 衝突は当人にのみ（誰かは impact で判別）
  if (stretchedPrivate) {
    for (const e of d.impact) {
      if (e.stretchedPrivate > 0) {
        forParticipant[e.participantId] = [forParticipant[e.participantId], "あなたの希望と一部ぶつかる点があります（確認）"].filter(Boolean).join("・");
      }
    }
  }
  return { shared, forParticipant };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: shared 射影（M5・private を漏らさない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手にも見せてよい **display/提案専用** の形。
 *   - private 確認/リスク（private_constraint_conflict）を除去。
 *   - **private 理由のみで needs_confirmation だった場合は ready_to_propose に戻す**
 *     （private な確認は当人側で扱う・相手には ready に見える）。
 *   - rationale.forParticipant 全削除。
 *
 * ★ T6.1: 戻り値は `authoritative: false`。**この結果を実行権限として使ってはならない**。
 *   shared 上 `ready_to_propose` でも、schedule/reserve/book の可否は必ず authoritative=true の
 *   元の `assessReadiness` 結果（= `hasActionAuthority`）で判定する。private 確認はそこで gate され続ける。
 */
export function toSharedReadinessView(r: ReadinessResult): ReadinessResult {
  const sharedConfirmations = r.requiredConfirmations.filter((c) => c.visibility === "shared");
  const sharedRiskFlags = r.riskFlags.filter((f) => f !== "private_constraint_conflict");
  const state: ReadinessResult["state"] =
    r.state === "needs_confirmation" && sharedConfirmations.length === 0 ? "ready_to_propose" : r.state;
  return {
    ...r,
    authoritative: false, // ★ display 専用・実行権限ではない
    state,
    requiredConfirmations: sharedConfirmations,
    riskFlags: sharedRiskFlags,
    rationale: { shared: r.rationale.shared, forParticipant: {} },
  };
}

/**
 * ★ T6.1 実行権限の唯一の判定口（schedule/reserve/book してよいか）。
 *   - **authoritative=false（shared 射影）からは決して true を返さない** → private 確認を隠した
 *     display が実行権限に化けない。
 *   - state が ready_to_propose かつ未確認の requiredConfirmations が無いときのみ true。
 */
export function hasActionAuthority(r: ReadinessResult): boolean {
  return r.authoritative === true && r.state === "ready_to_propose" && r.requiredConfirmations.length === 0;
}
