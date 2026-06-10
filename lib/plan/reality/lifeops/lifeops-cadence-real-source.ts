/**
 * 横 R2 — A-4-c20 Life Ops Cadence Real Source（**pure 合成層・新規 DB query 0・write 0**・barrel 非 export）
 *
 * 設計: docs/life-ops-cadence-real-read-a4-c20-mini-design.md
 *
 * 役割: 実データ由来の「前回いつ完了したか」を **中間 DTO（confidence/freshness/source 付き）** に正規化し、
 *   `CadenceObservation[]`（縦 seam 型）へ安全変換する合成層。audit（§1）の結論により今日の feed は
 *   **feedback_done（M1 lifeops done・c8 column-restricted read 経由）のみ**。将来の構造化 source はこの層に plug する。
 *
 * 厳守:
 *   - **calendar title / free text / 店舗名 / placeQuery / raw event name 推定・LLM 分類・external API を行わない**
 *     （入力は c8 辞書 firewall 済み observation のみ・出口でも辞書 roundtrip 再検証）。
 *   - raw DB row を candidate へ直接流さない（DTO → CadenceObservation の二段変換のみ）。
 *   - **confidence=low は inputs に流さない**（「強く候補化しない」の実装・freshness は観測 metadata で足切りしない）。
 *   - gate: master ∧ cadence flag（c7 dormant `LIFEOPS_CADENCE_READONLY` の初 wiring）∧ staging ∧ !production・default OFF。
 */

import type { LifeOpsCategoryId } from "../../../lifeops/category-model";
import type { BeautyMenu } from "../../../lifeops/cadence-model";
import { getCadenceSpec, daysBetween } from "../../../lifeops/cadence-model";
import type { CadenceObservation } from "../../../lifeops/candidate-types";
import { lifeOpsFeedbackHandle, parseLifeOpsFeedbackHandle, type LifeOpsFeedbackObservation } from "./lifeops-feedback-source";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../../shift/devFixtureHost";

export type LifeOpsCadenceConfidence = "high" | "medium" | "low";
export type LifeOpsCadenceFreshness = "fresh" | "stale" | "unknown";
/** 将来 source が増える前提の union（structured_completion 等）。 */
export type LifeOpsCadenceSourceKind = "feedback_done" | "structured_completion";

/** 中間 DTO（enum + ISO + 観測 metadata のみ・raw/user_id/id/source_ref/自由文を持たない）。 */
export interface LifeOpsCadenceRealObservation {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly lastCompletedAtISO: string;
  readonly confidence: LifeOpsCadenceConfidence;
  readonly source: LifeOpsCadenceSourceKind;
  readonly freshness: LifeOpsCadenceFreshness;
}

/** freshness 境界（L-2 typicalIntervalDays の何倍まで fresh か）。 */
export const CADENCE_FRESHNESS_INTERVAL_FACTOR = 3;

function freshnessOf(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null, lastISO: string, nowISO: string): LifeOpsCadenceFreshness {
  const spec = getCadenceSpec(categoryId, menu);
  if (!spec || spec.typicalIntervalDays <= 0) return "unknown"; // spec なし → 捏造しない
  const elapsed = daysBetween(lastISO, nowISO);
  if (elapsed === null || elapsed < 0) return "unknown";
  return elapsed <= spec.typicalIntervalDays * CADENCE_FRESHNESS_INTERVAL_FACTOR ? "fresh" : "stale";
}

/**
 * feedback_done（c13 semantics: cadence を動かせる唯一の action）→ 中間 DTO。
 *   done のみ・key ごと最新 1 件・confidence=high（明示 user 操作の事実記録）。
 */
export function feedbackDoneToRealCadence(
  observations: readonly LifeOpsFeedbackObservation[],
  nowISO: string,
): readonly LifeOpsCadenceRealObservation[] {
  const latest = new Map<string, LifeOpsFeedbackObservation>();
  for (const o of observations) {
    if (o.action !== "done") continue; // accept/dismiss/later は cadence に使わない（c13 lock の mirror）
    const key = `${o.categoryId}:${o.menu ?? ""}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(o.actedAtISO) > Date.parse(prev.actedAtISO)) latest.set(key, o);
  }
  return [...latest.values()].map((o) => ({
    categoryId: o.categoryId,
    menu: o.menu,
    lastCompletedAtISO: o.actedAtISO,
    confidence: "high" as const,
    source: "feedback_done" as const,
    freshness: freshnessOf(o.categoryId, o.menu, o.actedAtISO, nowISO),
  }));
}

/**
 * 中間 DTO → 縦 seam `CadenceObservation[]`（**confidence=low は流さない**・辞書 roundtrip 再検証・不一致 drop）。
 */
export function realCadenceToCadenceObservations(dtos: readonly LifeOpsCadenceRealObservation[]): readonly CadenceObservation[] {
  const out: CadenceObservation[] = [];
  for (const d of dtos) {
    if (d.confidence === "low") continue; // 強く候補化しない（足切りは confidence のみ）
    const parsed = parseLifeOpsFeedbackHandle(lifeOpsFeedbackHandle(d.categoryId, d.menu));
    if (!parsed || parsed.categoryId !== d.categoryId || parsed.menu !== d.menu) continue; // 辞書外/汚染 → drop
    if (Number.isNaN(Date.parse(d.lastCompletedAtISO))) continue;
    out.push({ categoryId: d.categoryId, menu: d.menu, lastCompletedAtISO: d.lastCompletedAtISO });
  }
  return out;
}

/** feedback channel と real channel の同 key・異 ISO 衝突数（counts のみ・観測用）。 */
export function countCadenceKeyConflicts(a: readonly CadenceObservation[], b: readonly CadenceObservation[]): number {
  const key = (c: CadenceObservation) => `${c.categoryId}:${c.menu ?? ""}`;
  const byKey = new Map(a.map((c) => [key(c), c.lastCompletedAtISO]));
  let n = 0;
  for (const c of b) {
    const prev = byKey.get(key(c));
    if (prev !== undefined && prev !== c.lastCompletedAtISO) n++;
  }
  return n;
}

/** gate（master ∧ cadence ∧ staging ∧ !production・**default OFF**・LIFEOPS_MAINLINE とは独立・pure）。 */
export function isLifeOpsCadenceReadAllowed(env: { readonly master: boolean; readonly cadence: boolean; readonly supabaseUrl: string | undefined }): boolean {
  const url = env.supabaseUrl ?? "";
  return env.master === true && env.cadence === true && url.includes(STAGING_PROJECT_REF) && !url.includes(PRODUCTION_PROJECT_REF);
}
