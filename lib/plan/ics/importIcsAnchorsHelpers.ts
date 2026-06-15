/**
 * P3 W3-5 — importIcsAnchorsAction の pure helpers (= server action から分離、 単体 test 用)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §2 W3
 *
 * 役割:
 *   - server action ("use server") から import すると server-only が test 環境を破壊するため、
 *     pure 部分 (= dedup partition / draft→input 変換) を非 server module に分離
 *   - action 本体 (= app/(culcept)/plan/_actions/importIcsAnchors.ts) はここから import する
 *
 * 不変原則:
 *   - 副作用なし (= DB / IO / time / random なし)
 *   - 入力 mutate なし
 *   - server-only 依存なし (= vitest "node" 環境で直接 import 可能)
 */

import type { ExternalAnchor } from "../external-anchor";
import type { CreateExternalAnchorInput } from "../external-anchor-input";
import type { IcsAnchorDraft } from "./icsToAnchorMapper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// partitionDraftsByExistingUids
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Drafts と既存 anchors を partition (= externalUid 完全一致で skip)
 *
 * - 既存 anchors の externalUid (= 空でないもの) を Set 化
 * - drafts を 「kept (= 新規)」 と 「skipped (= 重複)」 に分ける
 * - 入力 mutate なし、 順序は drafts と同じ
 */
export function partitionDraftsByExistingUids(
  drafts: ReadonlyArray<IcsAnchorDraft>,
  existingAnchors: ReadonlyArray<ExternalAnchor>,
): { kept: IcsAnchorDraft[]; skipped: number } {
  const existingUids = new Set<string>();
  for (const a of existingAnchors) {
    if (a.externalUid !== undefined && a.externalUid.length > 0) {
      existingUids.add(a.externalUid);
    }
  }

  const kept: IcsAnchorDraft[] = [];
  let skipped = 0;
  for (const d of drafts) {
    if (existingUids.has(d.sourceUid)) {
      skipped += 1;
    } else {
      kept.push(d);
    }
  }
  return { kept, skipped };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// draftToAnchorInput
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * IcsAnchorDraft → CreateExternalAnchorInput 変換 (= pure、 sourceType='ics' 固定)
 *
 * - draft の rigidity をそのまま継承 (= W2 preview で user 選択済)
 * - sourceUid → externalUid (= W3 dedup の主 key)
 * - source ParsedIcsEvent は repository に渡さない (= debug only meta)
 *
 * @throws Error if draft が構造的に不正 (= mapper bug 検出用)
 */
export function draftToAnchorInput(draft: IcsAnchorDraft): CreateExternalAnchorInput {
  const common = {
    title: draft.title,
    startTime: draft.startTime,
    ...(draft.endTime !== undefined ? { endTime: draft.endTime } : {}),
    ...(draft.locationText !== undefined
      ? { locationText: draft.locationText }
      : {}),
    rigidity: draft.rigidity,
    sourceType: "ics" as const,
    externalUid: draft.sourceUid,
    // U1-minimal（2026-06-15）: startTime provenance signal を server へ thread。
    // all-day → server で assumed_default / timed+tzid → imported_exact / timed+floating → system_inferred。
    icsIsAllDay: draft.source.isAllDay,
    icsTzid: draft.source.tzid ?? null,
  };

  if (draft.anchorKind === "recurring") {
    if (draft.validFrom === undefined || draft.recurrenceRule === undefined) {
      throw new Error(
        `draftToAnchorInput: recurring draft missing validFrom/recurrenceRule (sourceUid=${draft.sourceUid})`,
      );
    }
    return {
      ...common,
      anchorKind: "recurring",
      validFrom: draft.validFrom,
      recurrenceRule: draft.recurrenceRule,
    };
  }

  // one_off
  if (draft.date === undefined) {
    throw new Error(
      `draftToAnchorInput: one_off draft missing date (sourceUid=${draft.sourceUid})`,
    );
  }
  return {
    ...common,
    anchorKind: "one_off",
    date: draft.date,
  };
}
