/**
 * Life Ops L-6 — 予約導線 deep-link（**pure・no-fetch/no-API・no-DB・no-UI**・barrel 非 export）
 *
 * 設計: docs/life-ops-l6-booking-link-mini-design.md / boundary §2 L-6・§5 / Appendix A.3 Phase2・A.4 / permission(L-7)
 *
 * 役割: `placeQuery`（L-1）から予約/検索**ページ**の **deep-link URL を組み立てる pure 層**（Phase 2 提示）。
 *   **fetch/API を呼ばない**（URL 文字列を作るだけ・ユーザーがクリックして初めて外部遷移）。
 *   **permission（L-7）を厳守**: `isActionAllowed("open_link")` が false（医療/買い物/事務）なら空＝美容系のみ。
 *
 * 厳守:
 *   - pure・deterministic・**横エンジン非 import**・**no-fetch/no-network**・no-DB・no-UI・no-実データ源・barrel 非 export。
 *   - 特定店舗/電話/公式/LINE/実検索（Places API）・入力補助/自動予約（Phase3-4）は **非スコープ（CEO ゲート/stop）**。
 */

import type { LifeOpsCandidate } from "./candidate-types";
import { getCategorySpec } from "./category-model";
import { isActionAllowed, type PermissionAssessment } from "./permission";

/** 予約導線のプラットフォーム（MVP）。 */
export type BookingPlatform = "hotpepper_beauty" | "google_maps";

/** 予約/検索ページへの deep-link（fetch しない・検索ページ誘導）。 */
export interface BookingLink {
  readonly platform: BookingPlatform;
  readonly label: string;
  readonly url: string;
}

/** 地域/駅（注入・実データ源は別 slice）。 */
export interface BookingLinkOptions {
  readonly area?: string | null;
}

const HOTPEPPER_BASE = "https://beauty.hotpepper.jp/CSP/bt/freeword/?freeWord=";
const GOOGLE_MAPS_BASE = "https://www.google.com/maps/search/?api=1&query="; // Google 公式 URL scheme

function searchQuery(placeQuery: string, area: string | null): string {
  return area ? `${placeQuery} ${area}` : placeQuery;
}

/**
 * L-6: candidate + permission → 予約/検索ページの deep-link[]（pure・no-fetch）。
 *   open_link 不許可（permission cap）/ placeQuery なし → 空。美容系(body_appearance) のみ hotpepper+google。
 */
export function buildBookingLinks(
  candidate: LifeOpsCandidate,
  assessment: PermissionAssessment,
  opts: BookingLinkOptions = {}
): readonly BookingLink[] {
  if (!isActionAllowed("open_link", assessment)) return []; // permission 尊重（美容系のみ通る）
  const placeQuery = candidate.placeQuery;
  if (!placeQuery) return []; // 検索語なし（事務/準備/薬）

  const encoded = encodeURIComponent(searchQuery(placeQuery, opts.area ?? null));
  const google: BookingLink = { platform: "google_maps", label: "地図で探す", url: `${GOOGLE_MAPS_BASE}${encoded}` };

  // body_appearance ∧ open_link 許可 ＝ 美容系（医療は suggest cap で上で弾かれる）。ホットペッパー対象。
  const isBeauty = getCategorySpec(candidate.category)?.group === "body_appearance";
  if (isBeauty) {
    const hotpepper: BookingLink = { platform: "hotpepper_beauty", label: "ホットペッパーで探す", url: `${HOTPEPPER_BASE}${encoded}` };
    return [hotpepper, google];
  }
  return [google]; // 美容以外で open_link 許可は将来（買い物等・permission 拡張後）
}
