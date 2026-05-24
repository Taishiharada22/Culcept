/**
 * Phase 3-N List impl sub-phase 8a-pre / 8b-2 — ExternalAnchor → List view model adapter
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 案 1b 採用、 adapter 先行):
 *   - **pure module** (= LLM / API / DB / network 不使用、 純粋関数のみ)
 *   - **ExternalAnchor → StrictEventCardViewModel** 単件変換 (= 既存 anchor data model から新 view model へ)
 *   - **ExternalAnchor[] → events 配列** list 変換 (= startTime asc 整列、 day 集約)
 *   - **8b-2 追加**: ExternalAnchor[] → TransitionViewModel[] 生成 (= 隣り合う events から簡易 transition、 label='移動')
 *   - **8b-2 追加**: alterNote 注入 (= categoryMeaning module で生成、 Alter 由来観測 / 解釈)
 *
 *   - 8a 最小範囲: 全 anchor を **user origin (= createUserEvent)** として変換
 *     (= imported 由来 / alter_generated 由来 の扱いは将来 adapter 拡張で対応)
 *   - 8b 範囲拡張:
 *     - alterNote 注入 (= categoryMeaning.getMeaningText 経由、 Alter 由来観測として明示)
 *     - transitions 生成 (= 隣り合う events 間で endTime 定義あり時のみ、 label '移動' 固定)
 *   - 範囲外:
 *     - executionLayerCounts (= undefined、 sub-phase 8b では確認のみ)
 *     - imported / alter_generated 由来扱い (= 将来 adapter 拡張)
 *     - 距離 / mode 等の route truth (= TransitionChip は抽象 「移動」 のみ、 8b で truth 主張禁止)
 *
 *   - 規約 「DB / env / package / dependency 変更禁止」 遵守
 *   - 既存 lib/plan/list/* file 改変 0 (= types.ts / sourceProvenance.ts / copyContract.ts / featureFlags.ts 不触)
 *
 * 設計書:
 *   - decision-log (= sub-phase 8 8a/8b/8c 分割方針 + 案 1b 採用 + 8b redefine)
 *   - lib/plan/external-anchor.ts (= ExternalAnchor 型)
 *   - lib/plan/list/sourceProvenance.ts (= StrictEventCardViewModel + createUserEvent factory)
 *   - lib/plan/list/types.ts (= EventCategory + TransitionViewModel)
 *   - lib/plan/list/categoryMeaning.ts (= 8b-1 で先行実装、 alterNote 注入用)
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
import { type EventCategory, type TransitionViewModel } from "@/lib/plan/list/types";
import { getMeaningText } from "@/lib/plan/list/categoryMeaning";
import { inferCategoryFromText } from "@/lib/plan/list/categoryInference";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category mapping (= LocationCategory → EventCategory)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LocationCategory → EventCategory 決定的 mapping (= 8a 最小範囲、 8b-5 で fallback 拡張)
 *
 * 「決定的」 値のみ (= mapping 結果が non-'other' になる LocationCategory):
 *   - home (= 家) → home
 *   - office (= 職場) → work
 *   - school (= 学校) → work
 *   - cafe (= カフェ) → cafe
 *
 * 「非決定的」 値 (= 'other' に落ちる、 8b-5 で title/locationText heuristic に fallback):
 *   - outdoor / public / transit / unknown / undefined
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
 * 旧 API 保持 (= 既存 test 互換、 8b-5 内部では使われない)
 */
function mapCategory(locationCategory: LocationCategory | undefined): EventCategory {
  if (locationCategory === undefined) {
    return 'other';
  }
  return LOCATION_CATEGORY_TO_EVENT_CATEGORY[locationCategory];
}

/**
 * 8b-5 corrective: anchor から category を 4 段階優先順位で解決
 *
 * 優先順位 (= CEO + GPT 合議 2026-05-24):
 *   1. **explicit locationCategory** が決定的な値 ('home'/'office'/'school'/'cafe') → 直接 mapping
 *   2. **title keyword heuristic** (= inferCategoryFromText)
 *   3. **locationText keyword heuristic** (= inferCategoryFromText 再利用)
 *   4. **'other' fallback** (= 判断不能)
 *
 * 不変原則 (= GPT 重要条件):
 *   - 表示のための deterministic fallback (= 元データ書き換えなし)
 *   - inferred category を storage に保存しない (= adapter view layer 専用)
 *   - LLM 不使用 (= pure keyword matching)
 */
function resolveCategory(anchor: ExternalAnchor): EventCategory {
  // 1. explicit locationCategory が 'home'/'office'/'school'/'cafe' なら 直接
  if (anchor.locationCategory !== undefined) {
    const explicit = LOCATION_CATEGORY_TO_EVENT_CATEGORY[anchor.locationCategory];
    if (explicit !== 'other') {
      return explicit;
    }
    // 'outdoor'/'public'/'transit'/'unknown' は heuristic に fall-through
  }

  // 2. title keyword heuristic
  const titleHit = inferCategoryFromText(anchor.title);
  if (titleHit !== undefined) {
    return titleHit;
  }

  // 3. locationText keyword heuristic
  if (anchor.locationText !== undefined && anchor.locationText.length > 0) {
    const locationHit = inferCategoryFromText(anchor.locationText);
    if (locationHit !== undefined) {
      return locationHit;
    }
  }

  // 4. fallback
  return 'other';
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
 * 単件 ExternalAnchor を StrictEventCardViewModel に変換 (= 8b 範囲反映、 user origin 固定 + meaning text 注入)
 *
 * 8a 最小 + 8b 拡張マッピング:
 *   - id / title → 直接
 *   - startTime → "HH:MM" 正規化
 *   - endTime → "HH:MM" 正規化 (= undefined ならそのまま undefined)
 *   - location → locationText (= sensitive 除外、 privacy 配慮)
 *   - category → mapCategory(locationCategory)
 *   - sourceModel → createUserEvent 由来 (= origin: 'user', authority: 'user_owned')
 *   - **alterNote → getMeaningText(category, startTime) (= 8b-2 追加、 Alter 由来観測、 'other' は undefined)**
 *   - executionLayerCounts → undefined (= 8b では確認のみ、 future)
 */
export function convertExternalAnchorToEventCard(
  anchor: ExternalAnchor,
): StrictEventCardViewModel {
  const startTime = normalizeTimeToHHMM(anchor.startTime);
  const endTime =
    anchor.endTime !== undefined ? normalizeTimeToHHMM(anchor.endTime) : undefined;
  const location = resolveLocation(anchor);
  // 8b-5 corrective: 4 段階優先順位 (= explicit locationCategory → title heuristic → locationText heuristic → 'other')
  const category = resolveCategory(anchor);
  const alterNote = getMeaningText(category, startTime);

  return createUserEvent({
    id: anchor.id,
    title: anchor.title,
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(alterNote !== undefined ? { alterNote } : {}),
    category,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// List → TimelineSpine input (= events 配列、 startTime asc 整列)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor 配列を TimelineSpine consume 用 events 配列に変換
 *
 * - 各 anchor を convertExternalAnchorToEventCard で変換 (= alterNote 注入込み)
 * - startTime 昇順整列 (= "HH:MM" string sort、 24h 時刻なら lexicographic = chronological)
 * - 入力 mutate なし
 */
export function convertExternalAnchorListToTimelineEvents(
  anchors: ReadonlyArray<ExternalAnchor>,
): ReadonlyArray<StrictEventCardViewModel> {
  const converted = anchors.map((a) => convertExternalAnchorToEventCard(a));
  return [...converted].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// List → transitions 配列 (= 8b-2 追加、 隣り合う events から生成)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor 配列から TransitionChip consume 用 transitions 配列を生成
 *
 * 8b-2 範囲 (= GPT 「truth なき semantics 主張禁止」 と整合):
 *   - **抽象的な「移動」 chip のみ** (= 距離 / mode / 所要時間等の truth 主張なし)
 *   - label = '移動' 固定 (= TransitionViewModel.label の default 通り、 mock の 「移動・リフレッシュ」 等は 8c 以降の解釈拡張)
 *   - events を startTime asc 整列 → 隣り合うペアに対して transition 生成
 *   - **endTime 定義あり時のみ生成** (= endTime なし event の後に transition 出すと不自然)
 *   - **隣 event.startTime > 現 event.endTime のときのみ** (= 重複時刻は transition 不要、 二重表示防止)
 *
 * - 入力 mutate なし
 * - 純粋関数 (= 同入力で同出力)
 */
export function convertExternalAnchorListToTransitions(
  anchors: ReadonlyArray<ExternalAnchor>,
): ReadonlyArray<TransitionViewModel> {
  if (anchors.length < 2) {
    return [];
  }
  const events = convertExternalAnchorListToTimelineEvents(anchors);
  const transitions: TransitionViewModel[] = [];
  for (let i = 0; i < events.length - 1; i += 1) {
    const current = events[i];
    const next = events[i + 1];
    // endTime 定義なし → skip (= 終了不明な event 後に「移動」 を主張しない)
    if (current.endTime === undefined) continue;
    // 隣 event.startTime <= 現 event.endTime (= 重複 / 連続) → skip (= 余白なし、 transition 不要)
    if (next.startTime <= current.endTime) continue;
    transitions.push({
      fromTime: current.endTime,
      toTime: next.startTime,
      label: '移動',
    });
  }
  return transitions;
}
