/**
 * Tier1-C B — Generated Maps **検索** hand-off helper（**pure・外部 API/fetch なし・文字列構築のみ**）
 *
 * 設計正本: docs/t11-tier1-c-maps-url-generation-design.md（§7/§8/§13 + CEO 命名補正）
 *
 * 役割: **confirmed かつ shared-safe な destination/entity ラベル**から、ユーザーが自分で地図検索して
 *   確かめるための **検索 hand-off URL** を構築し、inert な `SafeTravelLinkIntent`（`generated:true`）として返す。
 *
 * ★ honesty の核（設計 §3）: `areaText` は未解決の自由文（地名解決層は HOLD）。だから生成物は
 *   **「検索 hand-off」**であって **「これがその場所」ではない**。アプリは断定せず、ユーザーの検証へ手渡す。
 *
 * 厳守:
 *   - **confirmed（destinationStatus==="confirmed" or entityConfirmed===true）かつ shared でのみ生成**。
 *     proposed/unconfirmed/missing/空ラベル/private → **null（URL を捏造しない＝Tier1-A との差）**。
 *   - URL = **固定 base + `encodeURIComponent(label)` のみ**。tracking/private/userId/M2/budget/pace/mobility/
 *     route/weather/API key を **一切含めない**（label 以外を URL に入れない）。
 *   - **Maps/Places API を呼ばない**・**fetch/read/scrape/search/place 解決をしない**・**href にしない**・**UI を描かない**。
 *   - fetch/API/DB/Supabase/Maps・Places SDK/web search/M2/CoAlter/`/talk`/app・UI を import しない。
 */

import type { Visibility } from "./core-types";
import type { SafeTravelLinkIntent } from "./safe-link-types";

/**
 * ★ 固定・keyless な検索 hand-off base（**API client ではない**・単一 source-of-truth・CEO レビュー対象）。
 *   - path 形式（query param なし）に `encodeURIComponent(label)` を連結＝**tracking param/API key を構造的に持てない**。
 *   - これは「アプリが URL を作る」唯一の場所。生成は**文字列構築のみ**で、ネットワークアクセスを伴わない。
 */
export const MAPS_SEARCH_HANDOFF_BASE = "https://www.google.com/maps/search/";

export interface BuildGeneratedMapsSearchInput {
  /** confirmed shared-safe ラベル（destination_area の areaText / 明示 entity ラベル）。private/M2 由来は渡さない。 */
  query: string;
  /** provider 3 状態（confirmed のみ生成候補）。 */
  destinationStatus: "confirmed" | "unconfirmed" | "missing";
  /** 任意・明示束縛された entity が confirmed か。 */
  entityConfirmed?: boolean;
  /** shared-safe gate（**shared のみ生成**・private/非 shared → null）。 */
  visibility: Visibility;
  /** 表示ラベル（中立・予約語を含まない＝caller 責務）。 */
  label: string;
}

/**
 * confirmed shared-safe ラベル → 生成 Maps 検索 hand-off intent（else null）。
 *   ★ URL を捏造しない: 未確定/private/空 → null。生成時のみ eligible な inert intent を返す。
 */
export function buildGeneratedMapsSearchIntent(
  input: BuildGeneratedMapsSearchInput,
): SafeTravelLinkIntent | null {
  if (!input || typeof input.query !== "string" || typeof input.label !== "string") return null;

  const query = input.query.trim();
  if (query.length === 0) return null; // 空ラベル → 生成しない
  if (input.visibility !== "shared") return null; // private/非 shared → 生成しない

  // ★ confirmed（destination）or 明示束縛 confirmed entity のみ。proposed/unconfirmed/missing → 生成しない。
  const confirmed = input.destinationStatus === "confirmed" || input.entityConfirmed === true;
  if (!confirmed) return null;

  // ★ URL は固定 base + label のみ encode（private/userId/M2/budget 等は触れない）。
  const value = MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent(query);

  return {
    source: "generated_maps_search",
    generated: true,
    externalReference: { kind: "url", value, inert: true },
    label: input.label,
    eligibility: "eligible",
    inert: true,
    actionable: false,
    rendered: false,
    fetched: false,
  };
}
