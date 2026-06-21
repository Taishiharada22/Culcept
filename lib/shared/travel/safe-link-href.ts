/**
 * Tier1-B B — Safe Travel Link Href model helper（**pure・no UI/生成/fetch**）
 *
 * 設計正本: docs/t11-tier1-b-safe-link-href-render-design.md（§13 + CEO 補正）
 *
 * 役割: **eligible な inert `SafeTravelLinkIntent`** → **display-safe な href model**（href-capable・rendered anchor でない）。
 *   ★ `<a href>` を描かない・URL を生成/fetch/改変/prefetch しない・Maps 生成しない。
 *
 * 厳守:
 *   - `intent.eligibility === "eligible"` のみ model を返す。invalid_url / ineligible_* → null。
 *   - `handoffUrl = intent.externalReference.value`（**unchanged**・tracking param 付与なし・private encode なし）。
 *   - official site / exact place を推定しない・availability/price/cancellation を主張しない。
 *   - fetch/read/scrape/prefetch/link-preview なし・Maps・Places API なし・web search なし・DB/Supabase/app・UI なし・CoAlter/`/talk` なし。
 */

import type { SafeTravelLinkIntent } from "./safe-link-types";
import type { SafeTravelLinkHrefModel } from "./safe-link-href-types";

/**
 * eligible inert intent → href model（else null）。
 *   ★ rendered anchor を作らない（`rendered:false` の data model のみ）。
 */
export function buildSafeTravelLinkHrefModel(intent: SafeTravelLinkIntent): SafeTravelLinkHrefModel | null {
  if (!intent || typeof intent !== "object") return null;
  if (intent.eligibility !== "eligible") return null; // invalid_url / ineligible_* → null
  const ref = intent.externalReference;
  if (!ref || typeof ref.value !== "string" || ref.value.length === 0) return null;

  return {
    kind: "external_handoff",
    handoffUrl: ref.value, // ★ unchanged（生成/fetch/改変/tracking 付与しない）
    label: intent.label,
    external: true,
    authoritative: false,
    rendered: false, // ★ まだ UI 描画していない（<a href> は別 GO）
    // ★ Tier1-C: display-safe 区別 metadata を faithfully carry（source から generated を推論しない・
    //   矛盾の修復はしない＝preparation 層の責務。manual は generated:false）。
    source: intent.source,
    generated: intent.generated === true,
  };
}
