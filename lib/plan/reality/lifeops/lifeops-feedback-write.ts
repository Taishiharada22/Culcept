/**
 * 横 R2 — Life Ops Feedback Write Contract（**pure・write 0・default OFF 前提**・barrel 非 export）
 *
 * 設計: docs/life-ops-feedback-write-contract-a4-c9-mini-design.md
 *
 * 役割: Life Ops 候補へのユーザー反応（accept/dismiss/later）を M1 へ記録するための **write contract の pure 部**。
 *   row builder（read 側 c8 と roundtrip 一致）・cooldown 重複 guard・gate。**本 file は何も書かない**。
 *
 * 厳守:
 *   - **accept=「候補を採用した」(intent) であり「やった/完了」ではない**（完了は将来 `done` action=migration gate・
 *     それまで c8 の tentative cadence proxy を維持し done 導入で退役）。
 *   - handle は enum builder（c8 `lifeOpsFeedbackHandle`）のみ＝自由文/店舗名/URL/placeQuery の経路が存在しない。
 *   - ★`source_kind='lifeops'` は **M1 CHECK 拡張 migration（別 gate）が前提**（現 CHECK は seed_explicit|correction のみ）。
 *   - duplicate/spam: 同一 handle×action の cooldown 内 write を guard（fire-once・no-retry 契約）。
 */

import type { LifeOpsCategoryId } from "../../../lifeops/category-model";
import type { BeautyMenu } from "../../../lifeops/cadence-model";
import { lifeOpsFeedbackHandle } from "./lifeops-feedback-source";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../../shift/devFixtureHost";

export type LifeOpsFeedbackAction = "accept" | "dismiss" | "later";

/** write の入力（enum + ISO のみ・自由文なし）。 */
export interface LifeOpsFeedbackWriteIntent {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly action: LifeOpsFeedbackAction;
  /** ユーザー操作時刻（ISO・caller 注入＝pure）。 */
  readonly actedAtISO: string;
}

/** lifeops 専用 source_kind（★実 write には M1 CHECK 拡張 migration が前提＝別 gate）。 */
export const LIFEOPS_SOURCE_KIND = "lifeops";

/** action → 中立 signal（既存 M1 規約 mirror・test で lock）。 */
export const LIFEOPS_FEEDBACK_SIGNAL: Record<LifeOpsFeedbackAction, "adoption" | "non_adoption" | "deferral"> = {
  accept: "adoption",
  dismiss: "non_adoption",
  later: "deferral",
};

/** M1 insert row（lifeops 契約値・既存 type union を 'lifeops' で汚さない独自 shape）。 */
export interface LifeOpsFeedbackWriteRow {
  readonly handle: string;
  readonly action: LifeOpsFeedbackAction;
  readonly signal: "adoption" | "non_adoption" | "deferral";
  readonly desired_date: null;
  readonly band: null;
  /** 明示的ユーザー操作の事実記録（推論 certainty とは別物・M3 の high 禁止と矛盾しない）。 */
  readonly confidence_band: "high";
  readonly duration_min: null;
  readonly source_kind: typeof LIFEOPS_SOURCE_KIND;
  readonly acted_at: string;
  readonly captured_at: null; // DB default NOW()
  readonly expires_at: null; // 長期（done 移行時に再考）
}

/** intent → M1 row（**c8 read adapter と roundtrip 一致**を test で固定）。 */
export function buildLifeOpsFeedbackWriteRow(intent: LifeOpsFeedbackWriteIntent): LifeOpsFeedbackWriteRow {
  return {
    handle: lifeOpsFeedbackHandle(intent.categoryId, intent.menu),
    action: intent.action,
    signal: LIFEOPS_FEEDBACK_SIGNAL[intent.action],
    desired_date: null,
    band: null,
    confidence_band: "high",
    duration_min: null,
    source_kind: LIFEOPS_SOURCE_KIND,
    acted_at: intent.actedAtISO,
    captured_at: null,
    expires_at: null,
  };
}

/** duplicate/spam 防止の既定 cooldown（同一 handle×action）。 */
export const LIFEOPS_FEEDBACK_WRITE_COOLDOWN_MS = 10 * 60 * 1000;

export interface RecentFeedbackWrite {
  readonly handle: string;
  readonly action: LifeOpsFeedbackAction;
  readonly actedAtMs: number;
}

/** 同一 handle×action が cooldown 内 → false（書かない）。fire-once・no-retry 契約の pure guard。 */
export function shouldWriteLifeOpsFeedback(
  recent: readonly RecentFeedbackWrite[],
  intent: LifeOpsFeedbackWriteIntent,
  nowMs: number,
  cooldownMs: number = LIFEOPS_FEEDBACK_WRITE_COOLDOWN_MS,
): boolean {
  const handle = lifeOpsFeedbackHandle(intent.categoryId, intent.menu);
  return !recent.some((r) => r.handle === handle && r.action === intent.action && nowMs - r.actedAtMs < cooldownMs);
}

/** write gate（master ∧ **write flag** ∧ staging ∧ !production・default OFF 前提・pure）。 */
export function isLifeOpsFeedbackWriteAllowed(env: { readonly master: boolean; readonly write: boolean; readonly supabaseUrl: string | undefined }): boolean {
  const url = env.supabaseUrl ?? "";
  return env.master === true && env.write === true && url.includes(STAGING_PROJECT_REF) && !url.includes(PRODUCTION_PROJECT_REF);
}
