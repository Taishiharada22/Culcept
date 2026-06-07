/**
 * Reality Control OS — A1-6-5c Consumed Seed → DraftPlan Merge Skeleton（**pure・no-real-read・no-DB**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.8
 *
 * 役割: A1-6-5b の consumed seed transform を **DraftPlan computation に additive に混ぜる** read/computation 側の骨格。
 *   実 DB read は **repository interface に閉じて注入**（live=実 DB / test=fake）。本 skeleton は repository を呼ぶだけ（実 read は別 GO）。
 *
 *   chain（read/computation skeleton）: repository.readReflectableConsumedSeeds（status='consumed'・seedRef を handle に変換し redact）
 *     → consumedSeedToDraftPlanItem（A1-6-5b の guard + label/time → DraftPlanItem）→ mergeConsumedSeedsIntoDraftPlan（additive）。
 *
 *   **二層モデルの維持**:
 *     - **active seed** → candidate surface（A1-5）。本 module は触らない（active は DraftPlan に来ない＝surface 側に残る）。
 *     - **consumed seed** → DraftPlan item（origin='seed'）。DraftPlan 内の seed-origin item は **承認済み**（active proposal は surface 側）。
 *
 * 厳守:
 *   - **consumed のみ DraftPlan item 化**: consumedSeedToPlanItem（A1-6-5b）の guard（status='consumed' ∧ duration>0）で active/expired/rejected を除外。
 *   - **additive**: 既存 DraftPlan の items 末尾に追加（既存 items / 他 field は不変）。basedOn は触らない（seedRef[UUID] を出さない）。
 *   - **date filter**: plan の date に一致する consumed seed のみ（他日・undated は混ぜない）。**duplicate guard**: 既存 handle は再追加しない（idempotent）。
 *   - **output に seedRef / UUID / raw / source_ref を出さない**: DraftPlanItem.id は **opaque handle**（一方向 hash・seedRef-free）・title は generic 非断定 label。
 *   - pure・no-DB・barrel 非 export。実 read は repository（live・別 GO）。
 */

import type { DraftPlan, DraftPlanItem } from "../draft-plan";
import { formatMinutes } from "../timeline-geometry";
import { consumedSeedToPlanItem, type ConsumedSeedReflectInput } from "./consumed-seed-reflection";

/** 確定 plan item の confidence（accepted・band 既定配置ゆえ moderate-high・seed confidence 連携は後続）。 */
const CONSUMED_ITEM_CONFIDENCE = 0.7;
/** 確定 plan item の reason（generic・raw 不使用・「なぜ置いたか」= 承認済み）。 */
const CONSUMED_ITEM_REASON = "承認した予定";

/**
 * consumed reader が返す **reflectable consumed seed**（**redacted**・**seedRef を持たず opaque handle のみ**）。
 *   handle = A1-6-1 deriveCandidateHandle(seedRef)（live reader が server-side で導出・一方向・seedRef-free）。DraftPlanItem.id に使う。
 */
export interface ReflectableConsumedSeed extends ConsumedSeedReflectInput {
  /** opaque id（一方向 hash・seedRef を含まない）。DraftPlanItem.id 用。 */
  readonly handle: string;
}

/**
 * consumed seed の **DB read を注入**する repository（live=実 DB / test=fake）。**A1-6-5c は no-real-read**（注入のみ）。
 *   live: plan_seeds を status='consumed' で column-restricted read → seedRef を handle に変換し redact → ReflectableConsumedSeed[]。
 *   本 skeleton は実装せず **呼ぶだけ**（実 read / status filter / RLS は live GO）。
 */
export interface ConsumedSeedRepository {
  /** plan の対象日の reflectable consumed seeds を返す（**status='consumed' のみ**・seedRef なし）。 */
  readReflectableConsumedSeeds(ctx: { readonly date: string }): Promise<readonly ReflectableConsumedSeed[]>;
}

/**
 * A1-6-5c: reflectable consumed seed → **DraftPlanItem**（pure・display-safe・**guard 付き**）。
 *   consumedSeedToPlanItem（A1-6-5b の guard + generic label + band 既定配置）→ DraftPlanItem に map。
 *   非 reflectable（非 consumed / duration 無）→ **null**（active/expired/rejected を誤って item 化しない）。
 *   **id は opaque handle**（seedRef-free）・startTime/endTime は formatMinutes で "HH:MM"・origin='seed'・rigidity='suggestion'（band-level movable）。
 */
export function consumedSeedToDraftPlanItem(seed: ReflectableConsumedSeed): DraftPlanItem | null {
  const item = consumedSeedToPlanItem(seed);
  if (item === null) return null;
  return {
    id: seed.handle, // opaque（seedRef を含まない）
    startTime: formatMinutes(item.startMin),
    endTime: formatMinutes(item.endMin),
    title: item.label, // generic 非断定 label（raw 不使用）
    origin: "seed", // PlanSeed 由来（DraftPlan 内の seed-origin = 承認済み・active proposal は surface 側）
    rigidity: "suggestion", // seed-origin・band-level movable
    reason: CONSUMED_ITEM_REASON,
    confidence: CONSUMED_ITEM_CONFIDENCE,
  };
}

/**
 * A1-6-5c: DraftPlan に consumed seeds を **additive に merge**（pure・既存 DraftPlan を壊さない）。
 *   - **date filter**: plan の date 一致のみ（他日・undated[null] は除外＝特定日に置けない）。
 *   - **duplicate guard**: 既存 items の id に一致する handle は再追加しない（idempotent re-merge）。
 *   - consumed のみ item 化（非 reflectable は null で除外）。expired/rejected/active は reader/guard で既に除外。
 *   - **additive**: 既存 items 末尾に追加（既存 items / id / userId / basedOn / 他 field は不変）。merge 対象なし → 元 DraftPlan を完全不変で返す。
 */
export function mergeConsumedSeedsIntoDraftPlan(
  draftPlan: DraftPlan,
  seeds: readonly ReflectableConsumedSeed[]
): DraftPlan {
  const existingIds = new Set(draftPlan.items.map((it) => it.id));
  const consumedItems = seeds
    .filter((s) => s.date === draftPlan.date) // 同日のみ（undated/他日は除外）
    .filter((s) => !existingIds.has(s.handle)) // duplicate guard（既存 handle は再追加しない）
    .map(consumedSeedToDraftPlanItem)
    .filter((x): x is DraftPlanItem => x !== null);
  if (consumedItems.length === 0) return draftPlan; // additive no-op（完全不変・同一参照）
  return { ...draftPlan, items: [...draftPlan.items, ...consumedItems] };
}

/**
 * A1-6-5c: **read/computation skeleton**（repository 注入で consumed seeds を read → DraftPlan に merge）。
 *   live computation が real repository を注入（本 skeleton は fake repository で検証）。実 read は repository に閉じる。
 *   additive・既存 DraftPlan を壊さない・consumed のみ・**seedRef を出さない**。
 */
export async function reflectConsumedSeedsIntoDraftPlan(
  draftPlan: DraftPlan,
  repository: ConsumedSeedRepository
): Promise<DraftPlan> {
  const seeds = await repository.readReflectableConsumedSeeds({ date: draftPlan.date });
  return mergeConsumedSeedsIntoDraftPlan(draftPlan, seeds);
}
