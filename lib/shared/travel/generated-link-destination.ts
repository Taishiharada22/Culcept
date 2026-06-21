/**
 * B（adapter producer wiring）抽出 slice — `extractGeneratedLinkDestination`（**pure・unwired・生成しない**）
 *
 * 設計正本: docs/t11-b-adapter-producer-wiring-design.md（§6 + CEO owner 補正）
 *
 * 役割: `ExtractedSlot[]` から **confirmed かつ shared-safe な単一 destination 候補**を抽出する（将来の adapter
 *   producer が generated Maps 検索 link を作る材料）。**link を生成しない・URL を作らない・配線しない**。
 *
 * ★ owner 規則（CEO 補正・最安全を採用）: shared-safe = `visibility === "shared"` ∧ `owner?.kind === "shared"`。
 *   **owner absent は shared-safe 扱いしない（除外）＝legacy fallback を有効化しない**（履歴データで absent があり得る場合のみ、
 *   明示コメント + test 付きで別途緩める。本実装は緩めない）。
 *
 * 厳守:
 *   - destination は **explicit 由来の confirmed-real** のみ採る（grounding: ready destination は session_context
 *     normalized でなく explicit surface 由来＝status "confirmed"）。**session_context / display・projection text から推論しない**。
 *   - 複数の **distinct な areaText** がある時は **fail-closed（null）**＝勝手に first/last を選ばない。
 *   - **URL を生成しない**・`buildGeneratedMapsSearchIntent` / `prepareSafeTravelLinkHrefModels` を呼ばない・
 *     engine/provider/M2/CoAlter/`/talk`/adapter/panel/Maps・Places API/fetch/DB/Supabase を呼ばない・import しない。
 *   - **deterministic / idempotent**・入力 slots を mutate しない。
 */

import type { ExtractedSlot } from "./slot-types";
import type { TravelExternalLinkDestinationCandidate } from "./travel-external-link-preparation";

type DestinationSlot = Extract<ExtractedSlot, { key: "destination_area" }>;

/**
 * confirmed shared-safe な単一 destination 候補を抽出（else null）。
 *   - `key === "destination_area"` ∧ `status === "confirmed"` ∧ `fillState === "filled"`
 *     ∧ `visibility === "shared"` ∧ `owner?.kind === "shared"` ∧ 非空 areaText（trim 後）。
 *   - distinct な areaText が **ちょうど 1 個**のときのみ候補化（0 or 複数 → null・fail-closed）。
 */
export function extractGeneratedLinkDestination(
  slots: readonly ExtractedSlot[],
): TravelExternalLinkDestinationCandidate | null {
  if (!Array.isArray(slots)) return null;

  const candidates = slots.filter(
    (s): s is DestinationSlot =>
      s.key === "destination_area" &&
      s.status === "confirmed" &&
      s.fillState === "filled" &&
      s.visibility === "shared" &&
      s.owner?.kind === "shared" && // ★ owner absent も除外（strict・legacy fallback なし）
      typeof s.value?.areaText === "string" &&
      s.value.areaText.trim().length > 0,
  );
  if (candidates.length === 0) return null;

  // distinct な areaText（trim 正規化）。複数の異なる行き先は推測せず fail-closed。
  const distinct = [...new Set(candidates.map((s) => s.value.areaText.trim()))];
  if (distinct.length !== 1) return null;

  return { label: distinct[0], status: "confirmed", visibility: "shared", owner: { kind: "shared" } };
}
