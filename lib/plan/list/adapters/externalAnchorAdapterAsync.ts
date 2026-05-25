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
import type { AlterNoteContext } from "@/lib/plan/llm/types";

import { convertExternalAnchorListWithDayBookends } from "./externalAnchorAdapter";
import { generateAlterNoteBatch } from "@/lib/plan/llm/alterNoteGenerator";

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
    ctxList.push({
      category: e.category,
      startTime: e.startTime,
      ...(e.endTime !== undefined ? { endTime: e.endTime } : {}),
      ...(anchor.title !== undefined ? { title: anchor.title } : {}),
      ...(e.location !== undefined ? { location: e.location } : {}),
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
