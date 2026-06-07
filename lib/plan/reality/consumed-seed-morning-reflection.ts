/**
 * Reality Control OS — A1-6-7 Consumed Seed → MorningPlan Reflection（**pure**・live plan target）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.12
 *
 * 背景（A1-6-7 監査）: A1-6-5c の `consumed-seed-merge.ts` は `DraftPlan` を target するが、`DraftPlan` は
 *   **live computation でない**（Wave-4 stub / 唯一の constructor は A1-6-5c merge 自身）。user が実際に見る live plan は
 *   **`MorningPlan`**（`lib/alter-morning/types.ts`・`items: PlanItem[]`・morning route が serve）。
 *   → CEO 判断（2026-06-08）で reflection の target を **`DraftPlan` → `MorningPlan` に pivot**。本 module はその live 版。
 *
 * 役割: consumed seed（accept 済み候補）を **`MorningPlan` の `PlanItem[]` に additive merge**。
 *   - A1-6-5b `consumedSeedToPlanItem`（guard + generic 非断定 label + band 既定配置）を再利用 → `PlanItem` に map。
 *   - A1-6-5c `ConsumedSeedRepository` / `ReflectableConsumedSeed`（reader 注入 / seedRef-free handle）を再利用。
 *   - reader（A1-6-5d `createConsumedSeedRepository`）は plan-type 非依存ゆえ **そのまま再利用**（rework は merge のみ）。
 *
 * **二層モデルの維持**（A1-6-5c と同一）:
 *   - **active seed** → candidate surface（A1-5）。本 module は触らない（active は MorningPlan に来ない＝surface 側に残る）。
 *   - **consumed seed** → MorningPlan item。MorningPlan 内の seed-origin item は **承認済み**（active proposal は surface 側）。
 *
 * 厳守:
 *   - **consumed seed だけが** MorningPlan item になる（guard: `consumedSeedToPlanItem` が consumed∧duration>0 のみ非 null）。
 *   - active / rejected / expired seed は **混ざらない**（reader が status='consumed' のみ read・merge も guard）。
 *   - merge は **additive**（既存 `plan.items` を壊さない・id 重複は skip・追加 0 なら同一参照を返す no-op）。
 *   - **同日のみ**（`seed.date === plan.date`・undated/別日は除外＝A1-6-5c と同一の保守的挙動）。
 *   - `PlanItem.id = handle`（opaque・一方向 hash・seedRef を含まない）／`what=null`・raw 不使用（display-safe）。
 *   - **pure**（DB/crypto なし・reader は注入）。barrel 非 export。
 */

import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";
import { consumedSeedToPlanItem } from "./consumed-seed-reflection";
import type { ReflectableConsumedSeed, ConsumedSeedRepository } from "./consumed-seed-merge";
import { formatMinutes } from "../timeline-geometry";

/**
 * A1-6-7: reflectable consumed seed → **`PlanItem`**（pure・display-safe・**guard 付き**）。
 *   A1-6-5b `consumedSeedToPlanItem`（consumed∧duration>0 のみ非 null・generic label・band 既定配置）→ `PlanItem` に map。
 *   非 reflectable（active/rejected/expired/duration 欠落）は **null**（呼び出し側で除外）。
 *   - `id = handle`（opaque・seedRef-free）／`kind="todo"`（band-level の柔軟タスク・明示時刻でない）／`fixedStart=false`。
 *   - `text = generic 非断定 label`／`what=null`（活動内容は断定しない・raw 不使用）。
 *   - `startTime = band 既定`（`formatMinutes`）／`durationMin = 配置済 duration`（end−start・MAX_DAY_MIN clamp 済）。
 */
export function consumedSeedToMorningPlanItem(seed: ReflectableConsumedSeed): PlanItem | null {
  const placed = consumedSeedToPlanItem(seed);
  if (placed === null) return null;
  return {
    id: seed.handle,
    kind: "todo",
    text: placed.label,
    what: null,
    startTime: formatMinutes(placed.startMin),
    durationMin: placed.endMin - placed.startMin,
    durationSource: "inferred",
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

/**
 * A1-6-7: consumed seeds を **`MorningPlan` に additive merge**（pure・既存を壊さない）。
 *   - **同日のみ**（`seed.date === plan.date`）／既存 `plan.items` の id と重複する handle は skip。
 *   - 追加が 0 件なら **同一 `plan` 参照を返す**（no-op・無駄な再生成なし）。
 *   - 追加 item は末尾に append（順序は既存 → consumed・display 側で時刻ソートされる前提）。
 */
export function reflectConsumedSeedsIntoMorningPlan(
  plan: MorningPlan,
  seeds: readonly ReflectableConsumedSeed[]
): MorningPlan {
  const existingIds = new Set(plan.items.map((it) => it.id));
  const additions = seeds
    .filter((s) => s.date === plan.date)
    .filter((s) => !existingIds.has(s.handle))
    .map(consumedSeedToMorningPlanItem)
    .filter((x): x is PlanItem => x !== null);
  if (additions.length === 0) return plan;
  return { ...plan, items: [...plan.items, ...additions] };
}

/**
 * A1-6-7: runtime composer（**reader 注入** → read + merge）。route が flag-gated で呼ぶ。
 *   `repository.readReflectableConsumedSeeds`（A1-6-5d real reader・status='consumed' のみ・seedRef-free）
 *   → `reflectConsumedSeedsIntoMorningPlan`（同日・additive）。reader が DB read を担い、本関数は pure merge を合成。
 */
export async function loadConsumedReflectedMorningPlan(
  plan: MorningPlan,
  repository: ConsumedSeedRepository
): Promise<MorningPlan> {
  const seeds = await repository.readReflectableConsumedSeeds({ date: plan.date });
  return reflectConsumedSeedsIntoMorningPlan(plan, seeds);
}
