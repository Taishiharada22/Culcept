/**
 * composeEdit — ②-3 既存予定のインライン編集の pure 写像（anchor ↔ compose draft / patch）。
 *
 * 思想（保存契約を壊さない核）:
 *   - 既存 anchor を compose の編集 draft にロードする写像と、編集 draft → **PATCH patch** の写像のみ。
 *   - patch は **編集可能フィールドだけの partial**（title/時刻/場所/rigidity）。
 *     repo.updateAnchor が「既存 anchor + patch を merge → validate → 更新」するため、
 *     anchorKind / date / recurrence / source は**自動的に保全**される（partial が安全な理由）。
 *   - companions は migration 未適用のため updatePayload に書かれない（送っても no-op・将来互換）。
 */

import type { AnchorUpdatePatch } from "@/lib/plan/external-anchor-repository";
import type { ExternalAnchor, AnchorRigidity } from "@/lib/plan/external-anchor";
import type {
  ComposeDraftCore,
  ComposeDraftState,
} from "@/lib/plan/compose/composeDraft";
import { formatMinutes, parseMinutes } from "@/lib/plan/timeline-geometry";

/** end 無 / wrap の既存予定を編集ロードする際の既定長（表示・編集の初期値）。 */
const FALLBACK_BLOCK_MIN = 60;

export interface ComposeEditable {
  core: ComposeDraftCore;
  startMin: number;
  endMin: number;
}

/**
 * 保存時の分離（保存契約安全の核）: placed draft を「編集(PATCH)」と「新規(POST)」に分ける。
 * - edits = editingAnchorId 有り → updateAnchor(PATCH)。**絶対に POST しない**＝重複作成なし。
 * - news = editingAnchorId 無し → createAnchorBundle(POST)。
 * - 未配置(unplaced) は対象外。
 */
export function splitDraftsForSave(
  drafts: ReadonlyArray<ComposeDraftState>,
): { edits: ComposeDraftState[]; news: ComposeDraftState[] } {
  const placed = drafts.filter((d) => d.placement.status === "placed");
  return {
    edits: placed.filter((d) => !!d.editingAnchorId),
    news: placed.filter((d) => !d.editingAnchorId),
  };
}

/** 当日の既存 anchor 群 → id ごとの「編集ロード用」データ（compose 右フォームに載せる形）。 */
export function anchorsToComposeEditable(
  anchors: ReadonlyArray<ExternalAnchor>,
): Record<string, ComposeEditable> {
  const out: Record<string, ComposeEditable> = {};
  for (const a of anchors) {
    const startMin = parseMinutes(a.startTime);
    if (startMin == null) continue;
    const rawEnd = a.endTime != null ? parseMinutes(a.endTime) : null;
    const endMin =
      rawEnd != null && rawEnd > startMin ? rawEnd : startMin + FALLBACK_BLOCK_MIN;
    const core: ComposeDraftCore = {
      title: a.title,
      locationText: a.locationText ?? "",
      rigidity: a.rigidity,
    };
    if (a.locationCategory) core.locationCategory = a.locationCategory;
    if (a.companions) core.companions = a.companions;
    out[a.id] = { core, startMin, endMin };
  }
  return out;
}

/**
 * 編集 draft → updateAnchor 用 PATCH patch（編集可能フィールドだけの partial）。
 * - anchorKind / date / recurrence / sourceType は**含めない**（repo が既存値を保全）。
 * - 空 location は送らない（= 既存維持。v1 はクリア非対応）。
 */
export function buildEditPatch(draft: ComposeDraftState): AnchorUpdatePatch {
  const patch: AnchorUpdatePatch = {
    title: draft.core.title.trim(),
    rigidity: (draft.core.rigidity || "soft") as AnchorRigidity,
  };
  if (draft.placement.status === "placed") {
    patch.startTime = formatMinutes(draft.placement.startMin);
    if (draft.placement.endMin != null) {
      patch.endTime = formatMinutes(draft.placement.endMin);
    }
  }
  const loc = draft.core.locationText.trim();
  if (loc) patch.locationText = loc;
  if (draft.core.locationCategory) {
    patch.locationCategory = draft.core.locationCategory;
  }
  return patch;
}
