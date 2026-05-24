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
import { getMeaningText, getNarrative } from "@/lib/plan/list/categoryMeaning";
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
    // 防御: unknown locationCategory string (= type 違反 case) → undefined、 heuristic に fall-through
    if (explicit !== undefined && explicit !== 'other') {
      return explicit;
    }
    // 'outdoor'/'public'/'transit'/'unknown' / 不明値 は heuristic に fall-through
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
  // 8b-7: getNarrative で 5W1H 文章 (= location 含む自然な日本語)、 fallback で getMeaningText
  const alterNote =
    getNarrative(category, startTime, location, anchor.title) ??
    getMeaningText(category, startTime);

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
// endTime inference (= 8b-6 追加、 CEO 「未指定なら推論で出していい」)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Category 別 default duration (= minutes、 8b-6)
 *
 * 「極端にあり得ない duration を避ける」 (= CEO 明示):
 *   - cafe: 90 min (= ひと息 〜 短い作業)
 *   - meal: 60 min (= 一般的食事 + 余白)
 *   - work: 240 min (= 半日仕事の見立て)
 *   - home: 120 min (= ゆっくり過ごす想定)
 *   - other: 60 min (= 中庸 fallback)
 */
const CATEGORY_DEFAULT_DURATION_MIN: Record<EventCategory, number> = {
  cafe: 90,
  meal: 60,
  work: 240,
  home: 120,
  other: 60,
};

const DURATION_MIN_CLAMP_MIN = 30; // 最低 30 分
const DURATION_MAX_CLAMP_MIN = 240; // 最大 4 時間
const TRANSITION_BUFFER_MIN = 30; // 次 event との余裕 buffer

/**
 * "HH:MM" 文字列を分単位に変換 (= 00:00 → 0、 23:59 → 1439)
 */
function hhmmToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = Number.parseInt(parts[0] ?? '0', 10);
  const m = Number.parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * 分単位を "HH:MM" 文字列に変換 (= 0 → "00:00"、 1439 → "23:59"、 1440 以上は "23:59" clamp)
 */
function minutesToHHMM(minutes: number): string {
  const clamped = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * endTime 推論 (= CEO 明示、 8b-6 追加):
 *   - **未指定なら category 別 default duration で推論**
 *   - 次 event の startTime がある場合は (nextStartTime - TRANSITION_BUFFER_MIN) を上限に
 *   - 最低 30 分、 最大 240 分の clamp で「極端な duration」 回避
 *
 * pure (= 入力 mutate なし、 deterministic)
 *
 * @param startTime 現 event の startTime (= "HH:MM")
 * @param category 現 event の EventCategory
 * @param nextStartTime 直後 event の startTime (= 未指定なら infinity 扱い)
 * @returns inferred endTime "HH:MM"
 */
function inferEndTime(
  startTime: string,
  category: EventCategory,
  nextStartTime?: string,
): string {
  const startMin = hhmmToMinutes(startTime);
  const defaultDurationMin = CATEGORY_DEFAULT_DURATION_MIN[category];

  // 次 event あり: nextStartTime - TRANSITION_BUFFER を上限
  let maxAvailableDurationMin = DURATION_MAX_CLAMP_MIN;
  if (nextStartTime !== undefined) {
    const nextMin = hhmmToMinutes(nextStartTime);
    const gapToNextMin = nextMin - startMin;
    // gap が 0 以下 (= 同時刻 or 前後逆転) なら default を使う
    if (gapToNextMin > 0) {
      maxAvailableDurationMin = Math.max(
        DURATION_MIN_CLAMP_MIN,
        gapToNextMin - TRANSITION_BUFFER_MIN,
      );
    }
  }

  // 「若干多めに」 (= CEO) = default duration を採用、 ただし maxAvailable で頭打ち
  const inferredDurationMin = Math.max(
    DURATION_MIN_CLAMP_MIN,
    Math.min(defaultDurationMin, maxAvailableDurationMin, DURATION_MAX_CLAMP_MIN),
  );

  return minutesToHHMM(startMin + inferredDurationMin);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// List → TimelineSpine input (= events 配列、 startTime asc 整列 + endTime 推論)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor 配列を TimelineSpine consume 用 events 配列に変換 (= user 提供 anchor のみ)
 *
 * - 各 anchor を convertExternalAnchorToEventCard で変換 (= alterNote 注入込み)
 * - startTime 昇順整列 (= "HH:MM" string sort、 24h 時刻なら lexicographic = chronological)
 * - **8b-6 追加: endTime 未指定 event は inferEndTime で補う** (= 次 event の startTime 考慮)
 * - 入力 mutate なし
 *
 * 注: 8b-7 「出発」 / 「帰宅」 virtual events は本関数ではなく
 *     **convertExternalAnchorListWithDayBookends** で別途付与 (= 既存 test contract 維持のため分離)
 */
export function convertExternalAnchorListToTimelineEvents(
  anchors: ReadonlyArray<ExternalAnchor>,
): ReadonlyArray<StrictEventCardViewModel> {
  const converted = anchors.map((a) => convertExternalAnchorToEventCard(a));
  const sorted = [...converted].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 8b-6: endTime 未定義 event に対して category default + 次 event 考慮で推論
  return sorted.map((event, index) => {
    if (event.endTime !== undefined) return event;
    const nextStartTime = index + 1 < sorted.length ? sorted[index + 1].startTime : undefined;
    const inferredEndTime = inferEndTime(event.startTime, event.category, nextStartTime);
    return { ...event, endTime: inferredEndTime } as StrictEventCardViewModel;
  });
}

/**
 * 出発 / 帰宅 buffer constants (= 8b-7、 「移動」 想定の余白)
 */
const DEPARTURE_BUFFER_MIN = 30;
const ARRIVAL_BUFFER_MIN = 30;

/**
 * 8b-9: 出発→最初 event 間の transition gap (= 15 min)
 * 「出発」 endTime を first.startTime - 15min にすることで、 transition 自動生成可能になる
 */
const TRANSITION_TO_NEXT_MIN = 15;

/**
 * 8b-7: convertExternalAnchorListToTimelineEvents の結果に
 *       **「出発」 (= 最初) + 「帰宅」 (= 最後) virtual events を付与** (= CEO 明示)
 *
 * 元 list が空ならそのまま空配列 (= 1 日 0 件は bookend 不要)
 *
 * 不変原則:
 *   - 元 list の events は不変 (= 純粋 wrapper)
 *   - virtual events id: 'virtual-departure' / 'virtual-arrival'
 *   - virtual events alterNote は固定 (= getNarrative 通さず、 mock 整合短文)
 */
/**
 * 8b-8 追加: 既存 events 配列から transitions 生成 (= bookends 込み events に対して使う)
 *
 * - 隣り合うペアの endTime → startTime で transition 生成
 * - **endTime がない event の後でも、 次 event との gap > 0 なら生成** (= mock 整合、 必ず移動 chip を出す)
 * - label = '移動' 固定
 * - 入力 mutate なし
 */
export function convertEventsToTransitions(
  events: ReadonlyArray<StrictEventCardViewModel>,
): ReadonlyArray<TransitionViewModel> {
  if (events.length < 2) {
    return [];
  }
  const transitions: TransitionViewModel[] = [];
  for (let i = 0; i < events.length - 1; i += 1) {
    const current = events[i];
    const next = events[i + 1];
    // fromTime: 現 event の endTime (= 必ず推論で補われている前提) / なければ startTime
    const fromTime = current.endTime ?? current.startTime;
    const toTime = next.startTime;
    // gap > 0 のみ生成 (= 重複 / 連続は skip、 二重表示防止)
    if (toTime <= fromTime) continue;
    transitions.push({ fromTime, toTime, label: '移動' });
  }
  return transitions;
}

export function convertExternalAnchorListWithDayBookends(
  anchors: ReadonlyArray<ExternalAnchor>,
): ReadonlyArray<StrictEventCardViewModel> {
  const events = convertExternalAnchorListToTimelineEvents(anchors);
  if (events.length === 0) {
    return events;
  }
  const first = events[0];
  const last = events[events.length - 1];

  // 「出発」 virtual event (= 8b-9: first.startTime 30 min 前 → 15 min 前 で終了、 残 15 min が移動 gap)
  // これにより 8b-9 で convertEventsToTransitions が 出発 → 最初 event の transition を生成可能になる
  const firstMin = hhmmToMinutes(first.startTime);
  const departureStartMin = Math.max(0, firstMin - DEPARTURE_BUFFER_MIN);
  const departureEndMin = Math.max(
    departureStartMin + 1,
    firstMin - TRANSITION_TO_NEXT_MIN, // 15 min 前に終了 → 移動 gap 確保
  );
  const departure: StrictEventCardViewModel = createUserEvent({
    id: 'virtual-departure',
    title: '出発',
    startTime: minutesToHHMM(departureStartMin),
    endTime: minutesToHHMM(departureEndMin),
    category: 'home',
    alterNote: '今日を始めるための家を出る時間',
  });

  // 「帰宅」 virtual event (= 最後 event の endTime 直後、 23:59 で clamp)
  const lastEndMin = last.endTime !== undefined ? hhmmToMinutes(last.endTime) : hhmmToMinutes(last.startTime);
  const arrivalStartMin = Math.min(23 * 60 + 59, lastEndMin + ARRIVAL_BUFFER_MIN);
  const arrivalEndMin = Math.min(23 * 60 + 59, arrivalStartMin + 60);
  const arrival: StrictEventCardViewModel = createUserEvent({
    id: 'virtual-arrival',
    title: '帰宅',
    startTime: minutesToHHMM(arrivalStartMin),
    endTime: minutesToHHMM(arrivalEndMin),
    category: 'home',
    alterNote: '一日を締めくくる、 家に戻る時間',
  });

  return [departure, ...events, arrival];
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
