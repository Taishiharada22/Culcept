/**
 * 横 R2 — A-4-c26 Life Ops Structured Source Contract（**pure DTO + 正規化・将来 source の単一受け口**・barrel 非 export）
 *
 * 設計: docs/life-ops-real-source-contract-a4-c26-mini-design.md（Part 1）
 *
 * 役割: 将来の構造化 source（user structured input／settings・profile／import）が必ず通る中間 DTO と、
 *   縦 seam 型（DeadlineObservation/CadenceObservation）への正規化。**DB row を candidate へ直接流さない**。
 *
 * 厳守:
 *   - **calendar title／free text／店舗名／placeQuery／raw event name 推定・LLM 分類・URL 解析を行わない**
 *     （DTO に free text field 自体が存在しない＝構造的排除。user_id/DB id/raw row/source_ref も同様）。
 *   - categoryId/menu は辞書 enum のみ（出口で roundtrip 再検証・unknown drop）。ISO は検証して不正 drop。
 *   - **confidence=low は流さない**（強く候補化しない・c20 と同一原則）。
 *   - `occurrenceKey`（未指定時は自動導出）と `typicalIntervalDays` は **contract 予約 field**
 *     （occurrence 厳密照合=将来 c22 窓照合の置換・L-9 個人間隔学習で消費。現 seam 型は保持しないため正規化では未消費）。
 */

import type { LifeOpsCategoryId } from "../../../lifeops/category-model";
import type { BeautyMenu } from "../../../lifeops/cadence-model";
import type { CadenceObservation } from "../../../lifeops/candidate-types";
import type { DeadlineObservation } from "../../../lifeops/deadline-engine";
import { lifeOpsFeedbackHandle, parseLifeOpsFeedbackHandle } from "./lifeops-feedback-source";
import type { LifeOpsCadenceConfidence } from "./lifeops-cadence-real-source";

/** 期限系の構造化 source（税/免許/パスポート/支払い/更新/提出 等は全て categoryId enum で表現）。 */
export interface LifeOpsStructuredDeadlineSource {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu?: BeautyMenu | null;
  readonly dueAtISO: string;
  readonly sourceKind: "user_structured_deadline";
  readonly confidence: LifeOpsCadenceConfidence;
  /** occurrence 厳密照合用（未指定→自動導出）。現 seam 型は非保持＝DTO 層予約。 */
  readonly occurrenceKey?: string;
}

/** 周期系の構造化 source（美容院/眉/買い物/日用品/定期メンテ/完了履歴）。 */
export interface LifeOpsStructuredCadenceSource {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu?: BeautyMenu | null;
  readonly lastCompletedAtISO?: string | null;
  /** L-9（個人間隔学習）予約 field（正規化では未消費・L-2 spec が引き続き正本）。 */
  readonly typicalIntervalDays?: number;
  readonly sourceKind: "user_structured_cadence";
  readonly confidence: LifeOpsCadenceConfidence;
}

/**
 * occurrenceKey の自動導出（**非空 segment のみを `:` で join**・非 PII 構造キー）。
 *   ★A-4-c30 finding の恒久対応: **due date 由来で deterministic**（now/smoke 開始時刻/created_at を使わない）。
 *   ★A-4-c32 補正: menu なしで `::`（空 segment）を残さない。
 *     deadline menu なし=`tax_filing:2026-06-25` / menu あり=`beauty_salon:cut:2026-06-25`。
 */
export function deriveLifeOpsOccurrenceKey(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null, dueAtISO: string): string {
  return [categoryId, menu, dueAtISO.slice(0, 10)].filter((s): s is string => !!s).join(":");
}

/**
 * cadence 用 occurrenceKey（occurrence 概念がないため固定 suffix・deterministic・空 segment なし）。
 *   menu なし=`groceries:cadence` / menu あり=`beauty_salon:cut:cadence`。
 */
export function deriveLifeOpsCadenceOccurrenceKey(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null): string {
  return [categoryId, menu, "cadence"].filter((s): s is string => !!s).join(":");
}

function dictValid(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null): boolean {
  const parsed = parseLifeOpsFeedbackHandle(lifeOpsFeedbackHandle(categoryId, menu));
  return parsed !== null && parsed.categoryId === categoryId && parsed.menu === menu;
}

/**
 * 構造化期限 source → DeadlineObservation[]（辞書 roundtrip・ISO 検証・**low confidence drop**・unknown drop）。
 */
export function structuredDeadlinesToObservations(sources: readonly LifeOpsStructuredDeadlineSource[]): readonly DeadlineObservation[] {
  const out: DeadlineObservation[] = [];
  for (const s of sources) {
    if (s.confidence === "low") continue; // 強く候補化しない（期限は本質的に強い提示のため low は丸ごと drop）
    const menu = s.menu ?? null;
    if (!dictValid(s.categoryId, menu)) continue; // 辞書外/汚染 → drop（自由文は構造的に不到達）
    if (Number.isNaN(Date.parse(s.dueAtISO))) continue; // 不正 ISO → drop
    out.push({ categoryId: s.categoryId, deadlineISO: s.dueAtISO });
  }
  return out;
}

/**
 * 構造化周期 source → CadenceObservation[]（辞書 roundtrip・ISO 検証[null は許容=履歴なし]・**low confidence drop**）。
 */
export function structuredCadenceToObservations(sources: readonly LifeOpsStructuredCadenceSource[]): readonly CadenceObservation[] {
  const out: CadenceObservation[] = [];
  for (const s of sources) {
    if (s.confidence === "low") continue;
    const menu = s.menu ?? null;
    if (!dictValid(s.categoryId, menu)) continue;
    const last = s.lastCompletedAtISO ?? null;
    if (last !== null && Number.isNaN(Date.parse(last))) continue; // 不正 ISO → drop（null=履歴なしは正当）
    out.push({ categoryId: s.categoryId, menu, lastCompletedAtISO: last });
  }
  return out;
}
