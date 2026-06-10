/**
 * 横 R2 — A-4-c22 Life Ops Deadline Completion Suppression（**pure・presentation suppression・write 0**・barrel 非 export）
 *
 * 設計: docs/life-ops-deadline-completion-a4-c22-mini-design.md
 *
 * 役割: done/completion feedback（c8 DTO）を見て、**同 key の deadline 候補だけ**を preview の候補集合から
 *   一時的に外す（presentation suppression）。deadlineObservations/DB は不変更＝done row が消えれば候補は自動的に戻る。
 *
 * 厳守:
 *   - **action==="done" のみ**抑制に使う（accept/later/dismiss は絶対に使わない・c13 semantics の mirror）。
 *   - 対象は `dueReason.kind === "deadline"` のみ（cycle は c14/c20 cadence の担当・event_prep/unknown は素通し＝二重処理禁止）。
 *   - **stale done 防御（永久抑制の構造的禁止）**: occurrence window 照合。候補の `daysUntilDeadline − leadDays` から
 *     今回 occurrence の窓開始を導出し、**窓開始以降の done だけ**が抑制に使える（去年の done は今年の候補を消せない）。
 *   - 辞書 roundtrip 再検証（偽装/enum 外 menu の done は drop）。出力は候補配列+count のみ（key/label/reason 非搬出）。
 */

import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import { lifeOpsFeedbackHandle, parseLifeOpsFeedbackHandle, type LifeOpsFeedbackObservation } from "./lifeops-feedback-source";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LifeOpsCompletionSuppressionResult {
  readonly candidates: readonly LifeOpsCandidate[];
  /** 抑制した deadline 候補数（**数のみ**・integrationMeta 用）。 */
  readonly suppressedDeadlineCount: number;
}

/**
 * done feedback → deadline 候補の presentation suppression（pure・collector 後/pool cap 前に適用）。
 */
export function applyLifeOpsCompletionSuppression(args: {
  readonly candidates: readonly LifeOpsCandidate[];
  /** c8 gated read の出力（全 action 可・内部で done のみ採用）。raw DB row は受けない。 */
  readonly doneFeedback: readonly LifeOpsFeedbackObservation[];
  readonly nowMs: number;
}): LifeOpsCompletionSuppressionResult {
  const { candidates, doneFeedback, nowMs } = args;
  if (doneFeedback.length === 0) return { candidates, suppressedDeadlineCount: 0 }; // 0 件は同一参照で静かに

  // key → 最新 done 時刻（done のみ・辞書 roundtrip 再検証・不正 ISO drop）。
  const latestDoneMs = new Map<string, number>();
  for (const o of doneFeedback) {
    if (o.action !== "done") continue; // accept/later/dismiss は抑制に使わない
    const parsed = parseLifeOpsFeedbackHandle(lifeOpsFeedbackHandle(o.categoryId, o.menu));
    if (!parsed || parsed.categoryId !== o.categoryId || parsed.menu !== o.menu) continue; // 辞書外/汚染 → drop
    const t = Date.parse(o.actedAtISO);
    if (Number.isNaN(t)) continue;
    const key = `${o.categoryId}:${o.menu ?? ""}`;
    const prev = latestDoneMs.get(key);
    if (prev === undefined || t > prev) latestDoneMs.set(key, t);
  }
  if (latestDoneMs.size === 0) return { candidates, suppressedDeadlineCount: 0 };

  let suppressed = 0;
  const kept = candidates.filter((c) => {
    if (c.dueReason.kind !== "deadline") return true; // cycle/event_prep は本 helper の対象外（素通し）
    const doneMs = latestDoneMs.get(`${c.category}:${c.menu ?? ""}`);
    if (doneMs === undefined) return true; // 他 deadline は残る
    // occurrence window 照合: 窓開始（deadline − leadDays）以降の done だけが今回 occurrence を完了したと言える。
    const windowStartMs = nowMs + (c.dueReason.daysUntilDeadline - c.dueReason.leadDays) * DAY_MS;
    if (doneMs < windowStartMs) return true; // stale done（去年の done 等）は無視＝永久抑制を構造的に禁止
    suppressed++;
    return false; // presentation suppression（source 不変更・done row が消えれば次 render で戻る）
  });
  return { candidates: kept, suppressedDeadlineCount: suppressed };
}
