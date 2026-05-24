/**
 * Phase 3-N List impl sub-phase 8a-pre — ExternalAnchor → List view model adapter
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 案 1b 採用、 adapter 先行):
 *   - **pure module** (= LLM / API / DB / network 不使用、 純粋関数のみ)
 *   - **ExternalAnchor → StrictEventCardViewModel** 単件変換 (= 既存 anchor data model から新 view model へ)
 *   - **ExternalAnchor[] → TimelineSpineViewModel** list 変換 (= startTime asc 整列、 day 集約)
 *
 *   - 8a 最小範囲: 全 anchor を **user origin (= createUserEvent)** として変換
 *     (= imported 由来 / alter_generated 由来 の扱いは 8a 範囲外、 将来 adapter 拡張で対応)
 *   - 8a 範囲外:
 *     - alterNote 注入 (= source field なし、 undefined)
 *     - executionLayerCounts (= undefined、 sub-phase 8b 以降で扱う)
 *     - transitions (= 8a-impl で別 adapter or 別 path、 本 file は events のみ)
 *
 *   - 規約 「DB / env / package / dependency 変更禁止」 遵守
 *   - 既存 lib/plan/list/* file 改変 0 (= types.ts / sourceProvenance.ts / copyContract.ts / featureFlags.ts 不触)
 *
 * 設計書:
 *   - decision-log (= sub-phase 8 8a/8b/8c 分割方針 + 案 1b 採用)
 *   - lib/plan/external-anchor.ts (= ExternalAnchor 型)
 *   - lib/plan/list/sourceProvenance.ts (= StrictEventCardViewModel + createUserEvent factory)
 *   - lib/plan/list/types.ts (= EventCategory + TimelineSpineViewModel)
 *
 * 不変原則:
 *   - 入力 mutate なし
 *   - 現在時刻参照なし (= test deterministic)
 *   - sensitive anchor の locationText は location field に展開しない (= privacy 配慮、 sensitive は title のみ)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";
import {
  type StrictEventCardViewModel,
  createUserEvent,
} from "@/lib/plan/list/sourceProvenance";
import { type EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category mapping (= LocationCategory → EventCategory)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LocationCategory → EventCategory mapping (= 8a 最小範囲)
 *
 * 既存 LocationCategory (= 8 値) と新 EventCategory (= 5 値) の対応:
 *   - home (= 家) → home
 *   - office (= 職場) → work
 *   - school (= 学校) → work (= 学校も work-like 扱い、 8a 最小)
 *   - cafe (= カフェ) → cafe
 *   - outdoor (= 屋外) → other
 *   - public (= 公共) → other
 *   - transit (= 移動) → other
 *   - unknown (= 未分類) → other
 *   - undefined (= locationCategory 未設定) → other
 *
 * 'meal' (= 食事) に該当する LocationCategory なし (= 既存 anchor data model に食事カテゴリなし、 8a 最小では未対応)
 * 将来: anchor に foodCategory 等が追加されたら adapter 拡張
 */
const LOCATION_CATEGORY_TO_EVENT_CATEGORY: Record<LocationCategory, EventCategory> = {
  home: 'home',
  office: 'work',
  school: 'work',
  cafe: 'cafe',
  outdoor: 'other',
  public: 'other',
  transit: 'other',
  unknown: 'other',
};

/**
 * LocationCategory または undefined を EventCategory に変換
 */
function mapCategory(locationCategory: LocationCategory | undefined): EventCategory {
  if (locationCategory === undefined) {
    return 'other';
  }
  return LOCATION_CATEGORY_TO_EVENT_CATEGORY[locationCategory];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time normalization (= "HH:MM" or ISO 8601 → "HH:MM")
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時刻 string を "HH:MM" 形式に正規化 (= pure、 timezone 変換なし)
 *
 * 入力 format (= ExternalAnchor.startTime / endTime):
 *   - "HH:MM" (= 既に正規化済) → そのまま return
 *   - "HH:MM:SS" → "HH:MM" に丸める
 *   - ISO 8601 (= "2026-05-24T09:00:00Z" 等) → UTC HH:MM 抽出
 *
 * 不正な入力 (= 5 文字未満 or HH:MM パターン不一致) → "00:00" fallback (= 8a 最小、 厳格な validation は将来)
 */
function normalizeTimeToHHMM(time: string): string {
  // ISO 8601 (= "T" を含む) の場合
  if (time.includes('T')) {
    const tIndex = time.indexOf('T');
    const afterT = time.slice(tIndex + 1, tIndex + 6); // "HH:MM"
    if (/^\d{2}:\d{2}$/.test(afterT)) {
      return afterT;
    }
    return '00:00';
  }

  // 既に "HH:MM" or "HH:MM:SS"
  const hhmm = time.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(hhmm)) {
    return hhmm;
  }

  return '00:00';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Location resolution (= privacy 配慮)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor → location string 解決 (= privacy 配慮)
 *
 * - sensitiveCategory 定義あり (= 医療 / 法務 / 試験 / その他) → location 出さない (= undefined、 既存 AnchorThumbnail と整合)
 * - locationText が空 or undefined → undefined
 * - それ以外 → locationText
 */
function resolveLocation(anchor: ExternalAnchor): string | undefined {
  if (anchor.sensitiveCategory !== undefined) {
    return undefined;
  }
  if (anchor.locationText === undefined || anchor.locationText.length === 0) {
    return undefined;
  }
  return anchor.locationText;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single anchor → StrictEventCardViewModel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単件 ExternalAnchor を StrictEventCardViewModel に変換 (= 8a 最小、 user origin 固定)
 *
 * 8a 最小マッピング:
 *   - id / title → 直接
 *   - startTime → "HH:MM" 正規化
 *   - endTime → "HH:MM" 正規化 (= undefined ならそのまま undefined)
 *   - location → locationText (= sensitive 除外、 privacy 配慮)
 *   - category → mapCategory(locationCategory)
 *   - sourceModel → createUserEvent 由来 (= origin: 'user', authority: 'user_owned')
 *   - alterNote → undefined (= 8a 範囲外)
 *   - executionLayerCounts → undefined (= 8a 範囲外、 sub-phase 8b 以降で扱う)
 */
export function convertExternalAnchorToEventCard(
  anchor: ExternalAnchor,
): StrictEventCardViewModel {
  const startTime = normalizeTimeToHHMM(anchor.startTime);
  const endTime =
    anchor.endTime !== undefined ? normalizeTimeToHHMM(anchor.endTime) : undefined;
  const location = resolveLocation(anchor);
  const category = mapCategory(anchor.locationCategory);

  return createUserEvent({
    id: anchor.id,
    title: anchor.title,
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
    ...(location !== undefined ? { location } : {}),
    category,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// List → TimelineSpine input (= events 配列、 startTime asc 整列)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor 配列を TimelineSpine consume 用 events 配列に変換
 *
 * - 各 anchor を convertExternalAnchorToEventCard で変換
 * - startTime 昇順整列 (= "HH:MM" string sort、 24h 時刻なら lexicographic = chronological)
 * - 入力 mutate なし
 * - 8a 範囲: events のみ (= transitions は 8a-impl で別 path、 本 module は events 専用)
 */
export function convertExternalAnchorListToTimelineEvents(
  anchors: ReadonlyArray<ExternalAnchor>,
): ReadonlyArray<StrictEventCardViewModel> {
  const converted = anchors.map((a) => convertExternalAnchorToEventCard(a));
  return [...converted].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
