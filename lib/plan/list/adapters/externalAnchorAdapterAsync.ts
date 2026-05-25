/**
 * Phase 3-N Plan P2 Step 1 — LLM-aware async builder (= server-only)
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2
 *
 * 役割:
 *   - externalAnchorAdapter.ts (= sync、 client から import される pure module) と分離
 *   - 本 file は **server-only** (= generator が server-only のため transitively)
 *   - server action (= app/(culcept)/plan/_actions/enhanceAlterNotes.ts) から呼出
 *
 * GPT 補正 (= popcorn 防止):
 *   - 1 day 分まとめて Promise.all で解決 → 呼出側 (= server action → client) が一括 commit
 *   - 中途差し替えなし、 1 transition のみ
 *
 * Privacy:
 *   - sensitive anchor は LLM 送らない (= ctx に含めず、 deterministic 固定)
 *   - virtual events (= departure / arrival) は固定 alterNote 維持
 *
 * Fail-open:
 *   - flag OFF / LLM 失敗 / cost cap / validation 失敗 → sync builder の output 通り return
 */

import "server-only";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { StrictEventCardViewModel } from "@/lib/plan/list/sourceProvenance";
import type { AlterNoteContext, PersonalModelV2 } from "@/lib/plan/llm/types";

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { convertExternalAnchorListWithDayBookends } from "./externalAnchorAdapter";
import { generateAlterNoteBatch } from "@/lib/plan/llm/alterNoteGenerator";
import { extractPersonalModelV2 } from "@/lib/plan/llm/personalModelExtractorV2";

/**
 * **Async** ExternalAnchor[] → events 配列 + bookends (= LLM alterNote 上書き、 P2 Step 1)
 *
 * 流れ:
 *   1. 既存 sync builder で deterministic alterNote 込み events を取得 (= 既存契約完全踏襲)
 *   2. virtual events (= departure / arrival) を除いた 「真の anchor 由来 events」 だけ抽出
 *   3. sensitive anchor は LLM 送らない (= privacy、 ctx に含めず deterministic 固定)
 *   4. generateAlterNoteBatch で 並列度 5 / cap 20 で 1 日分まとめて解決
 *   5. result.source === 'llm' なら alterNote を LLM 文に置き換え、 'unavailable' は deterministic 維持
 *   6. virtual events は固定 alterNote 維持
 *
 * 不変原則:
 *   - 入力 anchors mutate なし
 *   - 1 transition の return (= popcorn 防止)
 *   - flag OFF → sync builder と同 output
 *   - LLM 失敗 / safety 違反は silent fallback
 */
export async function convertExternalAnchorListWithDayBookendsAsync(
  anchors: ReadonlyArray<ExternalAnchor>,
  options?: {
    readonly userId?: string;
    readonly sessionId?: string;
  },
): Promise<ReadonlyArray<StrictEventCardViewModel>> {
  // 1. 既存 sync builder で deterministic events (= alterNote 込み) を取得
  const events = convertExternalAnchorListWithDayBookends(anchors);
  if (events.length === 0) return events;

  // 2. virtual events を除いた 「真の anchor 由来 events」 を抽出
  const realEvents = events.filter(
    (e) => e.id !== "virtual-departure" && e.id !== "virtual-arrival",
  );
  if (realEvents.length === 0) return events;

  // 3. anchor lookup by id (= sensitive check + title 取得用)
  const anchorById = new Map<string, ExternalAnchor>();
  for (const a of anchors) {
    anchorById.set(a.id, a);
  }

  // 3b. Step 2 v3.1: Personal Model V2 を 1 度だけ抽出 (= 1 user 1 day 1 PM、 cache 効果)
  //     PM integration flag OFF or userId 不在 → undefined (= V1 path に safe degrade)
  //     Step 2 v3.1 stub の extractPersonalModelV2 は現在 Phase 0 fallback を返すが、
  //     ここで呼ぶ entry を確定しておくことで実 Stargazer wire 完了後の差し替えを 1 接点に局所化。
  let personalModelV2: PersonalModelV2 | undefined;
  if (PLAN_FLAGS.personalModelIntegration && options?.userId !== undefined) {
    try {
      personalModelV2 = await extractPersonalModelV2(options.userId);
    } catch {
      // fail-open: PM 抽出失敗 → V1 path に degrade
      personalModelV2 = undefined;
    }
  }

  // 4. LLM context 配列を build (= sensitive は ctx に含めず null marker)
  const ctxList: Array<AlterNoteContext | null> = [];
  for (const e of realEvents) {
    const anchor = anchorById.get(e.id);
    if (anchor === undefined) {
      ctxList.push(null);
      continue;
    }
    if (anchor.sensitiveCategory !== undefined) {
      ctxList.push(null);
      continue;
    }
    // v3.4.2: OneOff anchor の dateOfActivity から dayContext を導出
    //   (= 同 anchor を別日に置いた場合の cache 多様化 + 自然な日付文脈)
    //   形式: "M/D(曜)" 例: "5/31(月)"
    let dayContext: string | undefined;
    if (anchor.anchorKind === "one_off" && anchor.date) {
      try {
        const d = new Date(`${anchor.date}T00:00:00`);
        if (!isNaN(d.getTime())) {
          const m = d.getMonth() + 1;
          const day = d.getDate();
          const weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
          dayContext = `${m}/${day}(${weekday})`;
        }
      } catch {
        // 日付 parse 失敗 → dayContext undefined (= safe degrade)
      }
    }
    ctxList.push({
      category: e.category,
      startTime: e.startTime,
      ...(e.endTime !== undefined ? { endTime: e.endTime } : {}),
      ...(anchor.title !== undefined ? { title: anchor.title } : {}),
      ...(e.location !== undefined ? { location: e.location } : {}),
      ...(dayContext !== undefined ? { dayContext } : {}),
      ...(personalModelV2 !== undefined ? { personalModelV2 } : {}),
    });
  }

  // 5. LLM 対象 ctx だけを抽出
  const nonNullCtxIndices: number[] = [];
  const nonNullCtxList: AlterNoteContext[] = [];
  ctxList.forEach((c, i) => {
    if (c !== null) {
      nonNullCtxIndices.push(i);
      nonNullCtxList.push(c);
    }
  });

  if (nonNullCtxList.length === 0) {
    return events;
  }

  // 6. batch 呼出 (= flag OFF なら即時 unavailable、 並列度 5 / cap 20)
  const batchResults = await generateAlterNoteBatch(nonNullCtxList, options);

  // 7. result を realEvents の index に書き戻す
  const newAlterNoteByEventId = new Map<string, string>();
  batchResults.forEach((r, idx) => {
    if (r.source === "llm") {
      const eventIdx = nonNullCtxIndices[idx]!;
      const event = realEvents[eventIdx]!;
      newAlterNoteByEventId.set(event.id, r.text);
    }
  });

  // 8. events 配列を再構築 (= 該当 event のみ alterNote 上書き、 他は不変)
  if (newAlterNoteByEventId.size === 0) {
    return events;
  }

  return events.map((e) => {
    const newText = newAlterNoteByEventId.get(e.id);
    if (newText === undefined) return e;
    return { ...e, alterNote: newText } as StrictEventCardViewModel;
  });
}
