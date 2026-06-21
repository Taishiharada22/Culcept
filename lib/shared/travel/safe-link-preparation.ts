/**
 * Safe Link Preparation Wiring A+B — 既構築 intents → display-safe href model[]（**pure・生成/fetch なし**）
 *
 * 設計正本: docs/t11-safe-link-preparation-wiring-design.md（§6/§7/§12 + CEO 補正: generated marker consistency guard）
 *
 * 役割（三層分離の「変換」層）: server caller が集めた **既構築 `SafeTravelLinkIntent[]`**（manual + 任意 generated）を、
 *   UI（`TravelExternalLinks`）が要求する **順序付き・dedupe 済の `SafeTravelLinkHrefModel[]`** に変換する。
 *
 * ★ 厳守（しないこと）:
 *   - **生成しない**（`buildGeneratedMapsSearchIntent` を呼ばない・import しない）。
 *   - **confirmed destination/entity を再判定しない**（生成可否は caller の責務）。
 *   - eligibility を**再実装しない**（`buildSafeTravelLinkHrefModel`＝Tier1-B を再利用）。
 *   - URL を mutate/生成しない・fetch/read/scrape しない・tracking 付与なし・private encode なし。
 *   - engine/provider/M2/CoAlter/`/talk`/Maps・Places API/DB・Supabase/app・UI を呼ばない・import しない。
 *   - **deterministic / idempotent**（Date/random なし・入力を mutate しない）。
 */

import type { SafeTravelLinkIntent, SafeTravelLinkSource } from "./safe-link-types";
import type { SafeTravelLinkHrefModel } from "./safe-link-href-types";
import { buildSafeTravelLinkHrefModel } from "./safe-link-href";

/**
 * ★ 表示順のみ（**ランキング/人気度/推薦順ではない**）。同 source 内は入力順を保つ（stable）。
 */
export const SOURCE_DISPLAY_ORDER: Record<SafeTravelLinkSource, number> = {
  user_provided: 0,
  manual_official: 1,
  manual_maps: 2,
  generated_maps_search: 3,
};

const orderOf = (s: SafeTravelLinkSource): number =>
  SOURCE_DISPLAY_ORDER[s] ?? Number.MAX_SAFE_INTEGER; // 未知 source は末尾（runtime 防御・決定的）

/**
 * ★ generated marker 整合 guard（外部 API/private 検査なし・純粋な構造判定）:
 *   - `generated_maps_search` は `generated === true` 必須（else drop）。
 *   - manual source は `generated === true` を許さない（else drop）。`generated` absent/false は valid。
 */
function isGeneratedMarkerConsistent(intent: SafeTravelLinkIntent): boolean {
  const isGenerated = intent.generated === true;
  if (intent.source === "generated_maps_search") return isGenerated;
  return !isGenerated; // manual: absent/false のみ valid
}

/**
 * 既構築 intents → 順序付き・dedupe 済 href model[]。
 *   1. 固定表示順で stable sort（同 source は入力順保持）。
 *   2. marker 整合 guard で矛盾 intent を drop。
 *   3. Tier1-B helper で eligible のみ model 化（ineligible/invalid は null→drop）。
 *   4. `handoffUrl` で dedupe（先勝ち）。
 */
export function prepareSafeTravelLinkHrefModels(
  intents: SafeTravelLinkIntent[],
): SafeTravelLinkHrefModel[] {
  if (!Array.isArray(intents) || intents.length === 0) return [];

  // 1. 固定表示順（index tiebreak で同 source 入力順を保証・入力配列は mutate しない）
  const ordered = intents
    .map((intent, i) => ({ intent, i }))
    .sort((a, b) => orderOf(a.intent.source) - orderOf(b.intent.source) || a.i - b.i)
    .map((x) => x.intent);

  // 2-4. guard → Tier1-B 変換 → null drop → handoffUrl dedupe（先勝ち）
  const seen = new Set<string>();
  const out: SafeTravelLinkHrefModel[] = [];
  for (const intent of ordered) {
    if (!isGeneratedMarkerConsistent(intent)) continue; // 矛盾 marker → drop
    const model = buildSafeTravelLinkHrefModel(intent); // null = ineligible/invalid → drop
    if (!model) continue;
    if (seen.has(model.handoffUrl)) continue; // dedupe（先勝ち）
    seen.add(model.handoffUrl);
    out.push(model);
  }
  return out;
}
