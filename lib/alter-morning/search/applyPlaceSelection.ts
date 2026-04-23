/**
 * applyPlaceSelection — W3-PR-9 Commit 5a-1
 *
 * 責務:
 *   Places Search で user が選択した NormalizedPlaceCandidate を target event の
 *   where slot に反映する純関数。selection 専用 endpoint から呼ばれる。
 *
 * 設計原則:
 *   - 純関数。events 配列は変更せず新配列を返す。
 *   - target event のみ更新、他の event は参照そのまま（=== 等価性維持）。
 *   - target が見つからない場合は events を変更せずに返す（caller が state diff で検出）。
 *   - place_ref は NormalizedPlaceCandidate.displayName を採用（user 選択の表示名が正本）。
 *   - placeType は "exact_proper_noun"（user が明示選択した = 支店まで確定）。
 *   - coordinates は NormalizedPlaceCandidate.coordinates をコピー。
 *   - provenance は source_type="tool" / confidence="high" にリセット（tool 由来を明示）。
 *   - missing_semantic_critical は "where" を除去（place が確定した）。
 *
 * 非責務:
 *   - state machine の遷移判定、idempotency、session persist は reducer / endpoint が担当。
 *   - target event の探索は event_id による同定のみ（target_ref 解決しない）。
 */

import type { Event } from "../comprehension/eventSchema";
import { toolProvenance } from "../comprehension/eventSchema";
import type { NormalizedPlaceCandidate } from "./normalizedPlace";

export interface ApplyPlaceSelectionInput {
  events: Event[];
  targetEventId: string;
  candidate: NormalizedPlaceCandidate;
}

export interface ApplyPlaceSelectionResult {
  events: Event[];
  /** target が見つかり更新が行われたか（false なら events は入力と同一参照） */
  applied: boolean;
}

export function applyPlaceSelection(
  input: ApplyPlaceSelectionInput,
): ApplyPlaceSelectionResult {
  const { events, targetEventId, candidate } = input;

  const idx = events.findIndex((ev) => ev.event_id === targetEventId);
  if (idx < 0) {
    return { events, applied: false };
  }

  const target = events[idx];
  const updated: Event = {
    ...target,
    where: {
      place_ref: candidate.displayName,
      placeType: "exact_proper_noun",
      coordinates: { lat: candidate.coordinates.lat, lng: candidate.coordinates.lng },
      provenance: toolProvenance("high"),
    },
    missing_semantic_critical: target.missing_semantic_critical.filter(
      (slot) => slot !== "where",
    ),
  };

  const next = events.slice();
  next[idx] = updated;
  return { events: next, applied: true };
}
