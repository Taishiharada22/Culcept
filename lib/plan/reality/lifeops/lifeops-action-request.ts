/**
 * 横 R2 — A-4-c17 Life Ops Action Request Resolver（**pure 検証 core・client 値を信頼しない**・barrel 非 export）
 *
 * 設計: docs/life-ops-gated-writer-wiring-a4-c17-mini-design.md（§1-3〜5）
 *
 * 役割: client から届いた `candidateKey` + `action`（**信頼しない生値**）を、server 側で再計算した
 *   現在の代表候補（rail を持つ唯一の集合）と照合し、成立した場合だけ **server 側 candidate object から
 *   c15 intent を再構築**して返す。client 値は lookup key としてのみ使用（categoryId/menu を直接信用しない）。
 *
 * 厳守:
 *   - **writable は accept | later | dismiss のみ**。`done` は cadence（前回完了日）を動かすため**常時拒否**
 *     （確認 UI 付き別 slice まで）。さらに intent.cadenceEligible でも拒否（二重防御・自動 done の経路なし）。
 *   - 候補照合に失敗（時間経過で代表が変わった等）→ unknown_candidate（安全側 reject・書かない）。
 *   - pure（IO/DB/fetch/Date.now なし）。writer は呼ばない（変換と検証のみ）。
 */

import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import { lifeOpsMomentKey } from "./lifeops-moment-preview";
import { buildLifeOpsActionIntent, type LifeOpsActionIntent } from "./lifeops-action-intent";
import type { LifeOpsFeedbackAction } from "./lifeops-feedback-write";

/** c17 で writer へ渡してよい action（**done を含めない**＝cadence を動かす操作は確認 UI slice まで拒否）。 */
export const LIFEOPS_WRITABLE_ACTIONS: ReadonlySet<LifeOpsFeedbackAction> = new Set(["accept", "later", "dismiss"]);

export type LifeOpsActionRequestRejectReason =
  | "invalid_action" // enum 外 / 型不正 / **done（cadence action は c17 で常時拒否）**
  | "unknown_candidate" // 現在の代表候補に candidateKey が存在しない（stale UI 含む・安全側）
  | "cadence_action_blocked"; // 二重防御: intent が cadence eligible（構造上 done のみ）

export type LifeOpsActionRequestResult =
  | { readonly ok: true; readonly intent: LifeOpsActionIntent }
  | { readonly ok: false; readonly reason: LifeOpsActionRequestRejectReason };

/**
 * client 生値 + server 再計算済み代表候補 → 検証済み intent（**成立時のみ**）。
 */
export function resolveLifeOpsActionRequest(
  repCandidates: readonly LifeOpsCandidate[],
  candidateKeyRaw: unknown,
  actionRaw: unknown,
): LifeOpsActionRequestResult {
  if (typeof candidateKeyRaw !== "string" || typeof actionRaw !== "string") return { ok: false, reason: "invalid_action" };
  if (!LIFEOPS_WRITABLE_ACTIONS.has(actionRaw as LifeOpsFeedbackAction)) {
    return { ok: false, reason: "invalid_action" }; // done / enum 外 / 偽造値はここで全て落ちる
  }
  const action = actionRaw as LifeOpsFeedbackAction;

  const rep = repCandidates.find((c) => lifeOpsMomentKey(c) === candidateKeyRaw);
  if (!rep) return { ok: false, reason: "unknown_candidate" };

  // server 側 candidate object から intent を再構築（c15 辞書 firewall 再通過・client 値は使わない）。
  const intent = buildLifeOpsActionIntent(rep, action);
  if (!intent) return { ok: false, reason: "unknown_candidate" }; // 辞書外候補（理論上 reps に来ないが防御）
  if (intent.cadenceEligible) return { ok: false, reason: "cadence_action_blocked" }; // 二重防御
  return { ok: true, intent };
}
