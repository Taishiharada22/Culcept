/**
 * Planning Engine — ユーザー入力 → 構造化 → 1日のプラン生成
 *
 * 1. テキストから予定(fixed)とTodo(todo)を分類
 * 2. 所要時間をTaskDurationMemoryで仮置き
 * 3. 固定予定を軸にTodoを最適配置
 */

import type { PlanItem, MorningPlan, DayConditions, FlowContext, EndpointAnchor } from "./types";
import type { EventType } from "@/app/(culcept)/calendar/_lib/vcTypes";
import { TIME_WINDOWS } from "./planState";
import { todayJST } from "./dateUtils";
import {
  loadDurationStore,
  estimateDuration,
  type DurationEstimate,
} from "./taskDurationMemory";
import { insertTravelItems, insertTravelItemsAsync } from "./travelTimeEngine";
import { fillGaps, type GapFillOptions } from "./gapFillEngine";
import type { LatLng } from "./routesApiClient";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時刻パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 「14時」「14:00」「午後2時」「夜7時」等を検出
const TIME_REGEX =
  /(?:(?:午前|午後|朝|昼|夕方|夜)\s*)?(\d{1,2})(?::(\d{2}))?(?:時|：)/;

// 午前/午後/夜 等の修飾子
const PERIOD_REGEX = /(午前|午後|朝|昼|夕方|夜)/;

/**
 * テキストから時刻（HH:mm）を抽出する。
 */
function extractTime(text: string): string | null {
  const match = text.match(TIME_REGEX);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;

  // 午後/夜 の修飾子で12時間制を補正
  const periodMatch = text.match(PERIOD_REGEX);
  if (periodMatch) {
    const period = periodMatch[1];
    if ((period === "午後" || period === "夜" || period === "夕方") && hour < 12) {
      hour += 12;
    }
    if (period === "午前" && hour === 12) {
      hour = 0;
    }
  } else if (hour < 7) {
    // 修飾子なしで7未満 → 午後と推定（「3時」=15時が多い）
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventType推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EVENT_TYPE_PATTERNS: Record<string, EventType> = {
  仕事: "work",
  オフィス: "work",
  会議: "work",
  ミーティング: "work",
  面接: "interview",
  デート: "date",
  友達: "friends",
  友人: "friends",
  飲み会: "party",
  パーティ: "party",
  ジム: "sports",
  ランニング: "sports",
  運動: "sports",
  旅行: "travel",
  結婚式: "formal",
  式典: "formal",
  公園: "outdoor",
  散歩: "outdoor",
  ハイキング: "outdoor",
  買い物: "errand",
  銀行: "errand",
  役所: "errand",
  歯医者: "errand",
  病院: "errand",
  美容院: "errand",
  家: "home",
  自宅: "home",
};

function detectEventType(text: string): EventType | undefined {
  for (const [pattern, type] of Object.entries(EVENT_TYPE_PATTERNS)) {
    if (text.includes(pattern)) return type;
  }
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テキスト → PlanItem[] 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParseResult {
  items: PlanItem[];
  /** パーソナライズヒント（UI表示用） */
  personalizeHints: string[];
}

// ── 「と」分割で保護すべきパターン ──
// 「〜と思う」「〜と考える」等は列挙ではなく文法構造
const TO_PROTECT_SUFFIX = /と(思[うっ]|考え|感じ|言[うっ]|聞[いく]|言わ|思っ)/;
// 「友達と」「彼女と」等は「Aと一緒に」のパターン
const TO_PROTECT_COMPANION = /(友達|友人|彼[女氏]|家族|同僚|先輩|後輩|上司|部下|子供|親|母|父|妻|夫|旦那|嫁)と/;

// ── 説明文・付加情報として除外すべきパターン ──
const NOISE_PATTERNS = [
  /^(仕事|バイト)?(です|だ)(から|し|けど|よ|ね|もん)/,  // 「仕事ですからね」
  /^(これ|それ|あれ)[はがも]/,                            // 「これは〜」
  /^(まぁ|まあ|ちなみに|あと|ただ|でも|けど)/,           // 接続詞で始まる補足
  /^(と思[うっ]|って感じ|みたいな|的な)/,                 // 文末の補足
];

// ── 冗長prefixの除去 ──
const PREFIX_CLEANUP = [
  /^今日[はも]?\s*/,
  /^(外に|家で|カフェで|会社で)\s*/,  // 場所prefix → 保持しつつ後で使う
];

/**
 * ユーザーの自由テキストからPlanItemのリストを生成する。
 *
 * 対応形式:
 * - 列挙: 「資料作りと歯医者」「A、B、C」
 * - 文章: 「外に出ようと思ってる。プログラミングの続きや。」
 * - 混合: 「今日は14時に歯医者、あとは資料作り」
 */
export function parseUserInput(text: string): ParseResult {
  const store = loadDurationStore();
  const personalizeHints: string[] = [];

  // Step 1: 句点・読点で分割
  const rawLines = text
    .split(/[\n。]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Step 2: 読点分割（「A、B」は列挙の可能性が高い）
  const splitByComma: string[] = [];
  for (const line of rawLines) {
    const parts = line.split(/、/).map((s) => s.trim()).filter(Boolean);
    splitByComma.push(...parts);
  }

  // Step 3: 「と」分割（保護パターンを除外）
  const lines: string[] = [];
  for (const line of splitByComma) {
    // 「〜と思う」「友達と」等は分割しない
    if (TO_PROTECT_SUFFIX.test(line) || TO_PROTECT_COMPANION.test(line)) {
      lines.push(line);
      continue;
    }
    const parts = line.split(/(?<=.{2,})と(?=.{2,})/);
    if (parts.length > 1 && parts.every((p) => p.length >= 2 && p.length <= 20)) {
      lines.push(...parts.map((p) => p.trim()));
    } else {
      lines.push(line);
    }
  }

  // Step 4: ノイズ除去 + アイテム生成
  const items: PlanItem[] = [];

  for (const line of lines) {
    if (line.length < 2) continue;

    // ノイズ（説明文・補足）を除外
    if (NOISE_PATTERNS.some((p) => p.test(line))) continue;

    const time = extractTime(line);
    const eventType = detectEventType(line);
    const estimate = estimateDuration(line, store);

    // テキストから時刻部分・冗長prefixを除去してクリーンなタイトルにする
    let cleanText = line
      .replace(TIME_REGEX, "")
      .replace(PERIOD_REGEX, "")
      .replace(/^\s*に?\s*/, "")
      .replace(/^(明日|明後日|あさって|今日|昨日|一昨日|おととい)[はも]?\s*/, "")
      .replace(/^(朝|朝から|朝一で)\s*/, "")
      // 文末の意志表現を除去してアクション名に正規化
      .replace(/(よう|おう)と思[うっ]て(る|い[るた])?$/, "る")
      .replace(/(し|やり|行き|出)たいと思[うっ]て?$/, "$1たい")
      .replace(/の続きや$/, "の続き")
      .replace(/(する|やる|行く)つもり$/, "$1")
      .trim();

    // cleanText が空 or 2文字未満ならスキップ（「今日は」のみ等）
    if (!cleanText || cleanText.length < 2) continue;

    if (estimate.hint) {
      personalizeHints.push(estimate.hint);
    }

    items.push({
      id: `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      kind: time ? "fixed" : "todo",
      text: cleanText,
      what: cleanText,
      startTime: time ?? undefined,
      durationMin: estimate.minutes,
      fixedStart: !!time,
      orderHint: items.length,
      sourceTurnIndex: 0,
      eventType,
      completed: false,
    });
  }

  return { items, personalizeHints };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プランニング（時間配置）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時刻を分に変換（"09:30" → 570）
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 分を時刻文字列に変換（570 → "09:30"）
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W2-1 anchor-first placement (CEO方針 2026-04-19)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 固定方針:「LLM は意味を掴む。ロジックが計画を組む。」
 *
 * 旧設計 (〜W1): LLM の `sequenceOrder` を真実源として走査、cursor で前進。
 *   → 「7時にランチ」のような LLM 誤抽出に引きずられて window 外配置が起きた。
 *   → anchor 衝突で todo が push-out され、window.end を超えて 22:00 配置された。
 *
 * 新設計 (W2-1): 3 パスで clock / window を hard に扱う。
 *   Pass 1: Hard clock anchors (fixed_start / fixed_departure / fixed_arrival)
 *           を時刻順に配置、占有区間を記録
 *   Pass 2: window_* items を window.start 早い順に gap-fit。
 *           window.end 超過は shrink → 無理なら cannotFitWindow=true
 *           （startTime は undefined のまま。Safety Gate が拾う）
 *   Pass 3: 時間制約なしの flex items を sequenceOrder 順に残ギャップへ流し込む
 *
 * sequenceOrder が尊重されるのは Pass 3 のみ。Pass 1/2 では clock/window が勝つ。
 */

type Interval = { start: number; end: number };

/**
 * sorted occupied intervals から [rangeStart, rangeEnd] 内で
 * duration 以上の連続空き区間の開始位置を返す。見つからなければ null。
 */
function findFirstGap(
  occupied: Interval[],
  rangeStart: number,
  rangeEnd: number,
  duration: number,
): number | null {
  let cursor = rangeStart;
  for (const block of occupied) {
    if (block.end <= cursor) continue;
    if (block.start >= rangeEnd) break;
    if (block.start - cursor >= duration) {
      return cursor;
    }
    cursor = Math.max(cursor, block.end);
  }
  if (rangeEnd - cursor >= duration) {
    return cursor;
  }
  return null;
}

/**
 * [rangeStart, rangeEnd] 内で確保できる最大の空き gap を探し、
 * shrinkBuffer を末尾に残した上で duration>=minDuration なら
 * {start, duration} を返す。shrink 候補。
 */
function findBestShrinkableGap(
  occupied: Interval[],
  rangeStart: number,
  rangeEnd: number,
  minDuration: number,
  shrinkBuffer: number,
): { start: number; duration: number } | null {
  let cursor = rangeStart;
  let best: { start: number; duration: number } | null = null;
  const consider = (gapStart: number, gapEnd: number) => {
    const available = gapEnd - gapStart - shrinkBuffer;
    if (available >= minDuration) {
      if (!best || available > best.duration) {
        best = { start: gapStart, duration: available };
      }
    }
  };
  for (const block of occupied) {
    if (block.end <= cursor) continue;
    if (block.start >= rangeEnd) break;
    if (block.start > cursor) {
      consider(cursor, Math.min(block.start, rangeEnd));
    }
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < rangeEnd) {
    consider(cursor, rangeEnd);
  }
  return best;
}

function insertSortedInterval(occupied: Interval[], iv: Interval): void {
  let i = 0;
  while (i < occupied.length && occupied[i].start < iv.start) i++;
  occupied.splice(i, 0, iv);
}

/**
 * anchor-first 3 パス配置本体。travel は含まない（Phase 2 で挿入される）。
 *
 * 配置の意味論:
 *   - Pass 1 (hard clock): 時刻順に確定。LLM order は無視。
 *   - Pass 2 (window):     window.start 早い順で gap-fit。window.end は HARD。
 *   - Pass 3 (flex):       **全 item の sequenceOrder を横断した cursor-walk**。
 *                          flex item は直前の hard/window item が置かれた位置以降に置く。
 *                          これで「仕事(1) → 食事(2) → 休憩(3)」のような narrative 順序を壊さない。
 */
function anchorFirstPlace(
  items: PlanItem[],
  dayStart: number,
  dayEnd: number,
): PlanItem[] {
  const SHRINK_BUFFER_MIN = 10;
  const MIN_DURATION = 15;

  // Bucket 分類
  type PlacedRecord = { item: PlanItem; start?: number; end?: number };
  const hardAnchors: PlanItem[] = [];
  const windowItems: PlanItem[] = [];
  const flexItems: PlanItem[] = [];
  for (const item of items) {
    if (item.kind === "travel") continue;
    if (item.kind === "fixed" && item.startTime) {
      hardAnchors.push(item);
    } else if (item.timeConstraintType?.startsWith("window_")) {
      windowItems.push(item);
    } else {
      flexItems.push(item);
    }
  }

  // id → placement 記録（Pass 3 の cursor-walk 用）
  const placements = new Map<string, PlacedRecord>();

  // ── Pass 1: Hard clock anchors — 時刻順にそのまま配置 ──
  hardAnchors.sort(
    (a, b) => timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!),
  );
  const occupied: Interval[] = [];
  for (const anchor of hardAnchors) {
    const start = timeToMinutes(anchor.startTime!);
    const end = start + anchor.durationMin;
    insertSortedInterval(occupied, { start, end });
    placements.set(anchor.id, { item: anchor, start, end });
  }

  // ── Pass 2: Window items — window.start 早い順で gap-fit ──
  // window.end は HARD。push-out は許さない。
  windowItems.sort((a, b) => {
    const aw = TIME_WINDOWS[a.timeConstraintType!];
    const bw = TIME_WINDOWS[b.timeConstraintType!];
    const as = aw?.start ?? Infinity;
    const bs = bw?.start ?? Infinity;
    if (as !== bs) return as - bs;
    return (a.sequenceOrder ?? a.orderHint ?? 0) - (b.sequenceOrder ?? b.orderHint ?? 0);
  });

  for (const item of windowItems) {
    const w = TIME_WINDOWS[item.timeConstraintType!];
    if (!w) {
      flexItems.push(item);
      continue;
    }
    const wStart = Math.max(w.start, dayStart);
    const wEnd = Math.min(w.end + 1, dayEnd);

    const fitStart = findFirstGap(occupied, wStart, wEnd, item.durationMin);
    if (fitStart !== null) {
      const end = fitStart + item.durationMin;
      insertSortedInterval(occupied, { start: fitStart, end });
      const placed: PlanItem = { ...item, startTime: minutesToTime(fitStart) };
      placements.set(item.id, { item: placed, start: fitStart, end });
      continue;
    }
    if (item.durationSource !== "user") {
      const shrunk = findBestShrinkableGap(
        occupied,
        wStart,
        wEnd,
        MIN_DURATION,
        SHRINK_BUFFER_MIN,
      );
      if (shrunk) {
        const finalDuration = Math.min(item.durationMin, shrunk.duration);
        const end = shrunk.start + finalDuration;
        insertSortedInterval(occupied, { start: shrunk.start, end });
        const placed: PlanItem = {
          ...item,
          startTime: minutesToTime(shrunk.start),
          durationMin: finalDuration,
          durationShrunkByPlacement: finalDuration !== item.durationMin,
        };
        placements.set(item.id, { item: placed, start: shrunk.start, end });
        continue;
      }
    }
    // cannotFitWindow — startTime 無し
    placements.set(item.id, {
      item: { ...item, startTime: undefined, cannotFitWindow: true },
    });
  }

  // ── Pass 3: Flex items の cursor-walk ──
  //
  // 全 item を sequenceOrder 昇順で走査し、cursor を前進させる。
  // hard/window anchor は既に配置済みなので cursor をその end まで進めるだけ。
  //
  // flex item は:
  //   1. 「次に来る anchor (sequenceOrder が自分より大きい hard/window placed item)」
  //      の start より前で収めるのが narrative intent に沿う。
  //   2. 収まらず、かつ inferred duration ならその区間に shrink 配置を試みる。
  //   3. それも無理なら cursor 以降の最初の gap（anchor を跨いでも可）に流す。
  const allInOrder = items
    .filter(i => i.kind !== "travel")
    .slice()
    .sort(
      (a, b) =>
        (a.sequenceOrder ?? a.orderHint ?? 9999) -
        (b.sequenceOrder ?? b.orderHint ?? 9999),
    );

  let cursor = dayStart;
  for (let idx = 0; idx < allInOrder.length; idx++) {
    const item = allInOrder[idx];
    const rec = placements.get(item.id);
    if (rec) {
      if (rec.end !== undefined) {
        cursor = Math.max(cursor, rec.end);
      }
      continue;
    }
    // 次に来る配置済み anchor (sequenceOrder 昇順で後続の placed item) の start を探す
    let narrativeLimit: number | undefined;
    for (let j = idx + 1; j < allInOrder.length; j++) {
      const future = allInOrder[j];
      const futureRec = placements.get(future.id);
      if (futureRec?.start !== undefined) {
        narrativeLimit = futureRec.start;
        break;
      }
    }

    // 1. narrativeLimit 以内で full duration を置けるか
    const limitEnd = narrativeLimit !== undefined
      ? Math.min(narrativeLimit, dayEnd)
      : dayEnd;

    let placedStart: number | null = null;
    let placedDuration: number = item.durationMin;
    let shrunk = false;

    if (limitEnd > cursor) {
      const fit = findFirstGap(occupied, cursor, limitEnd, item.durationMin);
      if (fit !== null) {
        placedStart = fit;
      } else if (item.durationSource !== "user") {
        // shrink して narrativeLimit 前に収める
        const shrinkFit = findBestShrinkableGap(
          occupied,
          cursor,
          limitEnd,
          MIN_DURATION,
          SHRINK_BUFFER_MIN,
        );
        if (shrinkFit) {
          placedStart = shrinkFit.start;
          placedDuration = Math.min(item.durationMin, shrinkFit.duration);
          shrunk = placedDuration !== item.durationMin;
        }
      }
    }

    // 2. narrativeLimit 内に置けなかった → anchor を跨いで first gap
    if (placedStart === null) {
      const fallback = findFirstGap(occupied, cursor, dayEnd, item.durationMin);
      if (fallback !== null) {
        placedStart = fallback;
      }
    }

    if (placedStart !== null) {
      const end = placedStart + placedDuration;
      insertSortedInterval(occupied, { start: placedStart, end });
      const placed: PlanItem = {
        ...item,
        startTime: minutesToTime(placedStart),
        durationMin: placedDuration,
        ...(shrunk ? { durationShrunkByPlacement: true } : {}),
      };
      placements.set(item.id, { item: placed, start: placedStart, end });
      cursor = end;
    } else {
      // 1 日に収まらない → 時刻なしで末尾
      placements.set(item.id, { item: { ...item } });
    }
  }

  // 出力: sequenceOrder ではなく startTime 順にソート（startTime なしは末尾）
  const out: PlanItem[] = items
    .filter(i => i.kind !== "travel")
    .map(i => placements.get(i.id)?.item ?? i);
  out.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });
  return out;
}

/**
 * PlanItemを時間軸に配置してMorningPlanを生成する。
 *
 * アルゴリズム:
 * 1. fixed予定を時刻順に配置
 * 2. 空き時間にtodoを詰めていく（優先度: 長いタスクから）
 * 3. 開始時刻は現在時刻 or 9:00 のどちらか遅い方
 */

/**
 * Block 3 Phase 1: hard anchor が 1 件だけなら minimal plan mode を起動する。
 *
 * 判定: non-travel かつ non-proposal のアイテムが 1 件のみ（fixedStart or kind==="fixed"）。
 * 返り値は fillGaps の minimalPlan オプションに直接渡す形。
 *
 * CEO 決裁 2026-04-17:
 *   - 責務は planning 層に置く（sufficiencyGate ではなく generation 側）
 *   - 明示なし帰宅接続は入れない（negation signal は Phase 2 以降）
 */
function resolveMinimalPlanOption(
  items: PlanItem[],
): { anchor: PlanItem; nowMin?: number } | undefined {
  const hardAnchors = items.filter(
    i => !i.proposal && i.kind !== "travel" && (i.fixedStart || i.kind === "fixed"),
  );
  if (hardAnchors.length !== 1) return undefined;
  return { anchor: hardAnchors[0] };
}

export function buildDayPlan(
  items: PlanItem[],
  dayConditions: DayConditions,
  now?: Date,
  options?: {
    goOut?: boolean;
    returnDestination?: string;
    endpointAnchor?: EndpointAnchor;
    targetDate?: string;         // "YYYY-MM-DD" — 未来日の場合は朝始まり
    endTimeConstraint?: string;  // "HH:MM" — この時刻を超えないようスケジュール制限
    departureTime?: string;      // "HH:MM" — 出発時刻（「8時に家を出る」等のプラン起点アンカー）
    /** Gap Fill に渡す天気情報 */
    gapFill?: GapFillOptions;
  }
): MorningPlan {
  const currentTime = now ?? new Date();

  // ── 未来日判定: targetDate が今日より後なら朝 9:00 始まり ──
  const isFutureDate = options?.targetDate && options.targetDate > todayJST();

  let dayStart: number;
  if (options?.departureTime) {
    // 出発時刻が明示されている場合: それをプランの起点にする
    // 「8時に家を出る」→ dayStart = 480（最初のtravelがここから開始）
    dayStart = timeToMinutes(options.departureTime);
  } else if (isFutureDate) {
    dayStart = 9 * 60; // 未来の予定は 9:00 AM 始まり
  } else {
    // ── Morning-aware default ──
    // fixed item の最も早い startTime があればその1時間前を起点にする。
    // なければ「今から」を使うが、夜間（21時以降）は翌朝プラン扱いで 9:00 起点。
    const earliestFixed = items
      .filter(i => i.fixedStart && i.startTime)
      .map(i => timeToMinutes(i.startTime!))
      .sort((a, b) => a - b)[0];

    // CEO方針 2026-04-18 Bug 5-A: earliestWindow も候補に入れる。
    //   「朝マックで仕事 → 12時ランチ」で earliestFixed=12:00 だけ見ると
    //   dayStart=11:00 になって朝タスクが昼アンカーに衝突→押し出される問題を回避。
    //   window_morning を持つ todo があれば window.start (06:00) も候補とする。
    const earliestWindow = items
      .filter(i => i.timeConstraintType?.startsWith("window_"))
      .map(i => {
        const w = TIME_WINDOWS[i.timeConstraintType!];
        return w?.start ?? Infinity;
      })
      .sort((a, b) => a - b)[0];

    const hasWindowAnchor = earliestWindow !== undefined && earliestWindow !== Infinity;
    if (earliestFixed !== undefined || hasWindowAnchor) {
      // fixed 由来: その 60分前（移動+準備 buffer）を起点
      const fixedBase = earliestFixed !== undefined ? earliestFixed - 60 : Infinity;
      // window 由来: window.start そのものを起点（buffer は不要）
      const windowBase = hasWindowAnchor ? earliestWindow : Infinity;
      // どちらか早い方を採用、最低 7:00
      dayStart = Math.max(Math.min(fixedBase, windowBase), 7 * 60);
    } else {
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      const nowMinutes = currentHour * 60 + currentMinute;

      if (nowMinutes >= 21 * 60) {
        // 21時以降: 翌朝プランとして 9:00 起点
        dayStart = 9 * 60;
      } else {
        const roundedNow = Math.ceil(nowMinutes / 30) * 30;
        dayStart = Math.max(roundedNow, 9 * 60);
      }
    }
  }

  // ── endTime 制約: 終了時刻が設定されていればそれを上限にする ──
  const dayEnd = options?.endTimeConstraint
    ? timeToMinutes(options.endTimeConstraint)
    : 23 * 60;

  // ── Phase 1 (W2-1): anchor-first 3 パス配置 ──
  //
  // CEO方針 2026-04-19:
  //   LLM の sequenceOrder は advisory。clock (fixed_*) と window (window_*)
  //   がハード制約。22:00 ランチ再発防止のために LLM の order 駆動を捨てる。
  //
  // travel は除外（Phase 2 で insertTravelItems が挿入する）。
  const nonTravel = items.filter(i => i.kind !== "travel");
  const scheduled = anchorFirstPlace(nonTravel, dayStart, dayEnd);

  // ── Phase 1.5: Location forward inheritance（CEO 2026-04-17 実機検証 fix）──
  //
  // 「明日朝サドヤでランチ、そのあと仕事」パターンで 仕事 に location が無いと、
  // UI カードは「仕事」単独表示 → 「仕事どこでやってるんだ？」という違和感。
  // insertTravelItems は内部的に prevLocation を継続していて、サドヤ→自宅 の帰路は正しく出る
  // のに、その仕事が結局どこだったか見えないのは欠陥。
  //
  // ここで前の item から location を継承する（"user_inferred" マーク）。
  // 明示的に home/自宅 の item には継承しない（帰宅を途中扱いしないため）。
  applyForwardLocationInheritance(scheduled);

  // ── Phase 2: ツアー構造の移動アイテムを挿入 ──
  //
  // Hagerstrand のツアーベース構造:
  //   [自宅] → 移動A → [目的地1] → 移動B → [目的地2] → 移動C → [自宅]
  //
  // 移動アイテムが入ることで:
  //   1. 各タスクの開始時刻が移動時間分だけ後ろにずれる
  //   2. 帰宅時間が明示される
  //   3. コーデ提案の歩き量推定精度が向上する
  const goOut = options?.goOut ?? hasOutboundLocations(scheduled);
  // EndpointAnchor のラベルを帰路の到着地として使用
  const returnLabel = options?.endpointAnchor?.label ?? options?.returnDestination;
  const withTravel = insertTravelItems(
    scheduled,
    dayConditions.mainTransport,
    goOut,
    returnLabel,
  );

  // ── Phase 3: 移動アイテム込みで時刻を再計算 ──
  //
  // CEO方針: departureTime / arrivalTime を exact anchor として渡す
  //   - 最初の travel from home → departureTime exactly
  //   - 最後の return travel → arrivalTime に到着（逆算）
  const fixedForReassign = scheduled.filter(i => i.kind === "fixed" && i.startTime);
  const departureMin = options?.departureTime ? timeToMinutes(options.departureTime) : undefined;
  const arrivalMin = options?.endTimeConstraint ? timeToMinutes(options.endTimeConstraint) : undefined;
  const finalItems = reassignTimes(withTravel, dayStart, fixedForReassign, dayEnd, {
    departureTime: departureMin,
    arrivalTime: arrivalMin,
  });

  // ── Phase 4: Gap filling — 空き時間にAlter提案を差し込む ──
  // Block 3 Phase 1: 1予定モード判定 — hard anchor が 1 件だけなら minimal plan mode
  const minimalPlan = resolveMinimalPlanOption(finalItems);
  const filledItems = fillGaps(finalItems, {
    ...options?.gapFill,
    minimalPlan,
  });

  return {
    date: options?.targetDate ?? todayJST(),
    items: filledItems,
    dayConditions,
    createdAt: currentTime.toISOString(),
    confirmed: false,
    endpointAnchor: options?.endpointAnchor,
    // ── UI anchor 伝播: recalculateSchedule が departure/arrival を尊重するために保存 ──
    departureTime: options?.departureTime,
    arrivalTime: options?.endTimeConstraint,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase C-6: Async版（Routes API 統合）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Routes API 統合のための追加オプション */
export interface AsyncPlanOptions {
  goOut?: boolean;
  returnDestination?: string;
  endpointAnchor?: EndpointAnchor;
  targetDate?: string;
  endTimeConstraint?: string;
  departureTime?: string;
  gapFill?: GapFillOptions;
  /** セグメント ID/ラベル → 座標マッピング（Routes API 用） */
  coordsMap?: Record<string, LatLng>;
  /** 出発地の座標（locationResolver で解決済み） */
  originCoords?: LatLng | null;
  /** 出発時刻 ISO 8601（Routes API の departureTime、TRANSIT 精度向上用） */
  departureTimeIso?: string;
}

/**
 * buildDayPlan の async 版 — Routes API 統合。
 *
 * Phase 1/3/4 は sync の buildDayPlan と同一。
 * Phase 2 のみ insertTravelItemsAsync（Routes API 統合版）を使用。
 *
 * coordsMap / originCoords が未提供の場合は sync 版にフォールバック。
 */
export async function buildDayPlanAsync(
  items: PlanItem[],
  dayConditions: DayConditions,
  now?: Date,
  options?: AsyncPlanOptions,
): Promise<MorningPlan> {
  // coordsMap がなければ sync 版にフォールバック（後方互換）
  if (!options?.coordsMap || Object.keys(options.coordsMap).length === 0) {
    return buildDayPlan(items, dayConditions, now, options);
  }

  const currentTime = now ?? new Date();

  const isFutureDate = options?.targetDate && options.targetDate > todayJST();

  let dayStart: number;
  if (options?.departureTime) {
    dayStart = timeToMinutes(options.departureTime);
  } else if (isFutureDate) {
    dayStart = 9 * 60;
  } else {
    // ── Morning-aware default (async 版も同一ロジック) ──
    const earliestFixed = items
      .filter(i => i.fixedStart && i.startTime)
      .map(i => timeToMinutes(i.startTime!))
      .sort((a, b) => a - b)[0];

    // CEO方針 2026-04-18 Bug 5-A: earliestWindow も候補に入れる
    const earliestWindow = items
      .filter(i => i.timeConstraintType?.startsWith("window_"))
      .map(i => {
        const w = TIME_WINDOWS[i.timeConstraintType!];
        return w?.start ?? Infinity;
      })
      .sort((a, b) => a - b)[0];
    const hasWindowAnchor = earliestWindow !== undefined && earliestWindow !== Infinity;

    if (earliestFixed !== undefined || hasWindowAnchor) {
      const fixedBase = earliestFixed !== undefined ? earliestFixed - 60 : Infinity;
      const windowBase = hasWindowAnchor ? earliestWindow : Infinity;
      dayStart = Math.max(Math.min(fixedBase, windowBase), 7 * 60);
    } else {
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      const nowMinutes = currentHour * 60 + currentMinute;

      if (nowMinutes >= 21 * 60) {
        dayStart = 9 * 60;
      } else {
        const roundedNow = Math.ceil(nowMinutes / 30) * 30;
        dayStart = Math.max(roundedNow, 9 * 60);
      }
    }
  }

  const dayEnd = options?.endTimeConstraint
    ? timeToMinutes(options.endTimeConstraint)
    : 23 * 60;

  // ── Phase 1 (W2-1): anchor-first 3 パス配置（sync 版と同一ロジック） ──
  const nonTravel = items.filter(i => i.kind !== "travel");
  const scheduled = anchorFirstPlace(nonTravel, dayStart, dayEnd);

  // Phase 1.5: Location forward inheritance（sync 版と同一ロジック）
  applyForwardLocationInheritance(scheduled);

  // ── Phase 2: ツアー構造の移動アイテム（Routes API 統合版） ──
  const goOut = options?.goOut ?? hasOutboundLocations(scheduled);
  const returnLabel = options?.endpointAnchor?.label ?? options?.returnDestination;
  const withTravel = await insertTravelItemsAsync(
    scheduled,
    dayConditions.mainTransport,
    goOut,
    options.coordsMap,
    options.originCoords ?? null,
    returnLabel,
    options.departureTimeIso,
  );

  // ── Phase 3: 移動アイテム込みで時刻を再計算（sync 版と同一） ──
  const fixedForReassign = scheduled.filter(i => i.kind === "fixed" && i.startTime);
  const departureMin = options?.departureTime ? timeToMinutes(options.departureTime) : undefined;
  const arrivalMin = options?.endTimeConstraint ? timeToMinutes(options.endTimeConstraint) : undefined;
  const finalItems = reassignTimes(withTravel, dayStart, fixedForReassign, dayEnd, {
    departureTime: departureMin,
    arrivalTime: arrivalMin,
  });

  // ── Phase 4: Gap filling（sync 版と同一） ──
  // Block 3 Phase 1: 1予定モード判定
  const minimalPlan = resolveMinimalPlanOption(finalItems);
  const filledItems = fillGaps(finalItems, {
    ...options?.gapFill,
    minimalPlan,
  });

  return {
    date: options?.targetDate ?? todayJST(),
    items: filledItems,
    dayConditions,
    createdAt: currentTime.toISOString(),
    confirmed: false,
    endpointAnchor: options?.endpointAnchor,
    departureTime: options?.departureTime,
    arrivalTime: options?.endTimeConstraint,
  };
}

/**
 * 移動アイテムを含むリストに対して時刻を再割り当てする。
 *
 * fixed 予定の時刻は固定。travel と todo は前から順に積む。
 *
 * CEO方針: 時間の意味を尊重する
 *   - departureTime → 最初の travel from home は exactly この時刻に開始
 *   - arrivalTime → 最後の return travel は この時刻に到着（逆算配置）
 *   - window_* → todo item はウィンドウ開始以降に配置
 *   - travel before fixed → fixed 開始から逆算（ただし departure anchor を下回らない）
 */
function reassignTimes(
  items: PlanItem[],
  dayStart: number,
  _fixedItems: PlanItem[],
  _dayEnd?: number,
  anchors?: {
    departureTime?: number;  // 出発アンカー（分）— 最初の travel を exactly ここに配置
    arrivalTime?: number;    // 到着アンカー（分）— 最後の return travel の到着時刻
  },
): PlanItem[] {
  const result: PlanItem[] = [];
  let cursor = dayStart;

  // 最初/最後の travel を特定（departure/arrival anchor 用）
  const firstTravelIdx = items.findIndex(i => i.kind === "travel");
  let lastTravelIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "travel") { lastTravelIdx = i; break; }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.kind === "fixed" && item.startTime && item.fixedStart) {
      // fixed はアンカー: そのまま配置
      result.push(item);
      cursor = Math.max(cursor, timeToMinutes(item.startTime) + item.durationMin);
    } else if (item.kind === "travel") {
      // ── CEO 8:00出発 exactly: 最初の travel に departure anchor ──
      if (i === firstTravelIdx && anchors?.departureTime != null) {
        const depTime = anchors.departureTime;
        result.push({ ...item, startTime: minutesToTime(depTime) });
        cursor = depTime + item.durationMin;
      }
      // ── CEO 18:00帰宅 exactly: 最後の travel に arrival anchor ──
      else if (i === lastTravelIdx && anchors?.arrivalTime != null) {
        const arrivalTime = anchors.arrivalTime;
        const travelStart = arrivalTime - item.durationMin;
        // cursor より前には配置しない（overlap 防止）
        const finalStart = Math.max(travelStart, cursor);
        result.push({ ...item, startTime: minutesToTime(finalStart) });
        cursor = finalStart + item.durationMin;
      }
      // ── 通常 travel: 直後が fixed なら逆算、そうでなければ cursor ──
      else {
        const nextItem = items[i + 1];
        if (nextItem && nextItem.kind === "fixed" && nextItem.startTime && nextItem.fixedStart) {
          const fixedStart = timeToMinutes(nextItem.startTime);
          const travelStart = fixedStart - item.durationMin;
          // departure anchor より前には配置しない
          const floor = anchors?.departureTime ?? 0;
          result.push({ ...item, startTime: minutesToTime(Math.max(travelStart, floor)) });
          // cursor は更新しない（fixed が自分で cursor を設定する）
        } else {
          result.push({ ...item, startTime: minutesToTime(cursor) });
          cursor += item.durationMin;
        }
      }
    } else if (item.cannotFitWindow) {
      // W2-1 (2026-04-19): anchor-first placer が window.end 超過で配置不能と
      // 判定した item は startTime を undefined のまま保持する。Safety Gate が
      // 拾って plan_presented を止める根拠になる。
      result.push({ ...item, startTime: undefined });
    } else {
      // todo: cursor 位置に配置。ウィンドウ制約 + fixed 衝突を考慮
      let placedAt = cursor;

      // ウィンドウ制約: window_* なら windowStart 以降に配置
      if (item.timeConstraintType?.startsWith("window_")) {
        const window = TIME_WINDOWS[item.timeConstraintType];
        if (window) {
          placedAt = Math.max(placedAt, window.start);
        }
      }

      // 次の fixed item を前方探索
      for (let j = i + 1; j < items.length; j++) {
        const future = items[j];
        if (future.kind === "fixed" && future.startTime && future.fixedStart) {
          const fixedStart = timeToMinutes(future.startTime);
          if (placedAt < fixedStart && placedAt + item.durationMin > fixedStart) {
            // 衝突: fixed の後に移動
            placedAt = timeToMinutes(future.startTime) + future.durationMin;
          }
          break; // 直近の fixed だけチェック
        }
      }

      result.push({ ...item, startTime: minutesToTime(placedAt) });
      cursor = placedAt + item.durationMin;
    }
  }

  return result;
}

/**
 * scheduled 内に外出先の場所があるか判定する。
 * location が設定されている + homeカテゴリでない → 外出あり
 */
function hasOutboundLocations(items: PlanItem[]): boolean {
  return items.some(
    (item) =>
      item.location != null &&
      item.location.category !== "home"
  );
}

/**
 * Forward inheritance: 位置の無いアイテムに直前のアイテムの location を継承させる。
 * （CEO 2026-04-17 実機検証 — 「ランチ(サドヤ)→仕事」で仕事が場所不明になる問題の対策）
 *
 * ルール:
 *   - travel は対象外
 *   - item.location が既に設定されていれば上書きしない
 *   - 直前 non-travel item に location があれば継承、source="user_inferred"
 *   - 自宅/home カテゴリは継承しない（帰宅を途中扱いにしないため）
 *
 * 破壊的変更: items の各要素を直接ミューテート（buildDayPlan 内の scheduled 配列なので安全）。
 */
function applyForwardLocationInheritance(items: PlanItem[]): void {
  let prev: PlanItem["location"] | undefined = undefined;
  for (const item of items) {
    if (item.kind === "travel") continue;
    if (item.location) {
      prev = item.location;
      continue;
    }
    if (!prev) continue;
    if (prev.category === "home") continue;
    // 継承（新しい location オブジェクトとして — 共有参照を避ける）
    item.location = {
      ...prev,
      source: "user_inferred",
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン更新（ユーザーが時間を変更した時）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーがプランの特定アイテムの所要時間を変更した時に呼ぶ。
 * 変更後、後続アイテムの開始時刻をカスケードで再計算する。
 * fixedStart=true のアイテムは動かさない（アンカー）。
 */
export function updateItemDuration(
  plan: MorningPlan,
  itemId: string,
  newDurationMin: number
): MorningPlan {
  const updatedItems = plan.items.map((item) =>
    item.id === itemId ? { ...item, durationMin: newDurationMin } : item
  );
  return {
    ...plan,
    items: recalculateSchedule(updatedItems, {
      departureTime: plan.departureTime,
      arrivalTime: plan.arrivalTime,
    }),
  };
}

/**
 * スケジュール再計算 — 時間カスケードエンジン。
 *
 * アイテムの duration 変更 / reorder 時に、後続の非 fixedStart アイテムの
 * startTime を前から順に詰め直す。
 *
 * ルール:
 * - fixedStart=true のアイテムは startTime を動かさない（アンカー）
 * - fixedStart=false のアイテムは、直前のアイテムの endTime に配置
 * - window_* 制約のアイテムは、ウィンドウ開始以降に配置（reorder でも保持）
 * - fixed アンカーより前に配置されたアイテムは、アンカー開始に食い込まない
 *
 * CEO P0: departure/arrival アンカー対応（2026-04-16）
 *   - departureTime → 最初の travel を exactly この時刻に配置
 *   - arrivalTime → 最後の travel の到着がこの時刻になるよう逆算配置
 *   - reassignTimes と同一のロジックで UI/サーバー間の不一致を解消
 */
export function recalculateSchedule(
  items: PlanItem[],
  anchors?: {
    departureTime?: string;  // "HH:mm" — 最初の travel の開始時刻
    arrivalTime?: string;    // "HH:mm" — 最後の travel の到着時刻
  },
): PlanItem[] {
  if (items.length === 0) return items;

  const result: PlanItem[] = [];
  let cursor = 0;

  // 最初のアイテムの startTime から cursor を初期化
  const first = items[0];
  if (first.startTime) {
    cursor = timeToMinutes(first.startTime);
  }

  // departure/arrival anchor 用: 最初/最後の travel を特定
  const firstTravelIdx = items.findIndex(i => i.kind === "travel");
  let lastTravelIdx = -1;
  for (let j = items.length - 1; j >= 0; j--) {
    if (items[j].kind === "travel") { lastTravelIdx = j; break; }
  }

  const departureMin = anchors?.departureTime ? timeToMinutes(anchors.departureTime) : undefined;
  const arrivalMin = anchors?.arrivalTime ? timeToMinutes(anchors.arrivalTime) : undefined;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.fixedStart && item.startTime) {
      // アンカー: startTime を維持。cursor をその endTime に更新
      result.push(item);
      cursor = timeToMinutes(item.startTime) + item.durationMin;
    } else if (item.kind === "travel") {
      // ── travel: departure/arrival anchor を尊重 ──
      if (i === firstTravelIdx && departureMin != null) {
        // 最初の travel: departure anchor exactly
        result.push({ ...item, startTime: minutesToTime(departureMin) });
        cursor = departureMin + item.durationMin;
      } else if (i === lastTravelIdx && arrivalMin != null) {
        // 最後の travel: arrival anchor 逆算
        const travelStart = arrivalMin - item.durationMin;
        const finalStart = Math.max(travelStart, cursor);
        result.push({ ...item, startTime: minutesToTime(finalStart) });
        cursor = finalStart + item.durationMin;
      } else if (item.startTime) {
        // 通常 travel: 直後が fixed なら逆算、そうでなければ cursor
        const nextItem = items[i + 1];
        if (nextItem && nextItem.kind === "fixed" && nextItem.startTime && nextItem.fixedStart) {
          const fixedStart = timeToMinutes(nextItem.startTime);
          const travelStart = fixedStart - item.durationMin;
          const floor = departureMin ?? 0;
          result.push({ ...item, startTime: minutesToTime(Math.max(travelStart, floor)) });
          // cursor は fixed が自分で設定する
        } else {
          result.push({ ...item, startTime: minutesToTime(cursor) });
          cursor += item.durationMin;
        }
      } else {
        result.push(item);
      }
    } else if (item.startTime) {
      // 非アンカー非travel で startTime がある → cursor に基づいて再配置
      let newStart = Math.max(cursor, 0);

      // ウィンドウ制約: reorder 後もウィンドウ開始を下回らない
      if (item.timeConstraintType?.startsWith("window_")) {
        const window = TIME_WINDOWS[item.timeConstraintType];
        if (window) {
          newStart = Math.max(newStart, window.start);
        }
      }

      result.push({ ...item, startTime: minutesToTime(newStart) });
      cursor = newStart + item.durationMin;
    } else {
      // startTime なし → そのまま保持
      result.push(item);
    }
  }

  return result;
}

/**
 * プランのアイテムの完了状態を切り替える。
 */
export function toggleItemComplete(
  plan: MorningPlan,
  itemId: string
): MorningPlan {
  return {
    ...plan,
    items: plan.items.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ),
  };
}

/**
 * プランを確定する。
 */
export function confirmPlan(plan: MorningPlan): MorningPlan {
  return { ...plan, confirmed: true };
}
