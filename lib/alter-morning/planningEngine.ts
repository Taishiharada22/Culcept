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

/**
 * PlanItemを時間軸に配置してMorningPlanを生成する。
 *
 * アルゴリズム:
 * 1. fixed予定を時刻順に配置
 * 2. 空き時間にtodoを詰めていく（優先度: 長いタスクから）
 * 3. 開始時刻は現在時刻 or 9:00 のどちらか遅い方
 */
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

    if (earliestFixed !== undefined) {
      // fixed item の1時間前（移動+準備）を dayStart に。最低 7:00。
      dayStart = Math.max(earliestFixed - 60, 7 * 60);
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

  // ── Phase 1: sequenceOrder を真実源とする統合配置 ──
  //
  // 旧設計: fixed/todo に二分してスロット配置 → segment order が壊れる
  // 新設計: sequenceOrder 順に全アイテムを走査し、カーソルを前進させる
  //         fixed item はアンカー（startTime 優先）、todo は直前の位置に配置
  //
  // travel を除外（後で Phase 2 で再挿入する）
  const nonTravel = items.filter(i => i.kind !== "travel");

  // sequenceOrder → orderHint → 入力順 でソート
  const sorted = [...nonTravel].sort((a, b) => {
    const aSeq = a.sequenceOrder ?? a.orderHint ?? 9999;
    const bSeq = b.sequenceOrder ?? b.orderHint ?? 9999;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return 0; // 安定ソート
  });

  // fixed items のアンカー時刻リスト（overlap 検出用）
  const fixedAnchors = sorted
    .filter(i => i.kind === "fixed" && i.startTime)
    .map(i => ({
      start: timeToMinutes(i.startTime!),
      end: timeToMinutes(i.startTime!) + i.durationMin,
    }));

  const scheduled: PlanItem[] = [];
  let cursor = dayStart;

  for (const item of sorted) {
    if (item.kind === "fixed" && item.startTime) {
      // fixed item: アンカー時刻を使用
      scheduled.push(item);
      cursor = Math.max(cursor, timeToMinutes(item.startTime) + item.durationMin);
    } else {
      // todo item: cursor 位置に配置。ただしウィンドウ制約 / fixed 衝突を考慮
      let placedAt = cursor;

      // ウィンドウ制約: timeConstraintType が window_* なら、windowStart 以降に配置
      if (item.timeConstraintType?.startsWith("window_")) {
        const window = TIME_WINDOWS[item.timeConstraintType];
        if (window) {
          // ウィンドウの最早開始以降に配置
          placedAt = Math.max(placedAt, window.start);
        }
      }

      // 次の fixed anchor と衝突するかチェック
      for (const anchor of fixedAnchors) {
        if (placedAt < anchor.start && placedAt + item.durationMin > anchor.start) {
          // 衝突: fixed の後に配置
          placedAt = anchor.end;
        }
      }

      // dayEnd チェック
      if (placedAt + item.durationMin > dayEnd) {
        // 時間内に収まらない → 時刻なしで末尾配置
        scheduled.push({ ...item });
      } else {
        scheduled.push({ ...item, startTime: minutesToTime(placedAt) });
        cursor = placedAt + item.durationMin;
      }
    }
  }

  // 最終ソート: startTime 順（ただし startTime なしは末尾）
  scheduled.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

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
  const filledItems = fillGaps(finalItems, options?.gapFill);

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

    if (earliestFixed !== undefined) {
      dayStart = Math.max(earliestFixed - 60, 7 * 60);
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

  // ── Phase 1: sequenceOrder を真実源とする統合配置（sync 版と同一）──
  const nonTravel = items.filter(i => i.kind !== "travel");
  const sorted = [...nonTravel].sort((a, b) => {
    const aSeq = a.sequenceOrder ?? a.orderHint ?? 9999;
    const bSeq = b.sequenceOrder ?? b.orderHint ?? 9999;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return 0;
  });

  const fixedAnchors = sorted
    .filter(i => i.kind === "fixed" && i.startTime)
    .map(i => ({
      start: timeToMinutes(i.startTime!),
      end: timeToMinutes(i.startTime!) + i.durationMin,
    }));

  const scheduled: PlanItem[] = [];
  let cursor = dayStart;

  for (const item of sorted) {
    if (item.kind === "fixed" && item.startTime) {
      scheduled.push(item);
      cursor = Math.max(cursor, timeToMinutes(item.startTime) + item.durationMin);
    } else {
      let placedAt = cursor;
      if (item.timeConstraintType?.startsWith("window_")) {
        const window = TIME_WINDOWS[item.timeConstraintType];
        if (window) placedAt = Math.max(placedAt, window.start);
      }
      for (const anchor of fixedAnchors) {
        if (placedAt < anchor.start && placedAt + item.durationMin > anchor.start) {
          placedAt = anchor.end;
        }
      }
      if (placedAt + item.durationMin > dayEnd) {
        scheduled.push({ ...item });
      } else {
        scheduled.push({ ...item, startTime: minutesToTime(placedAt) });
        cursor = placedAt + item.durationMin;
      }
    }
  }

  scheduled.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

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
  const filledItems = fillGaps(finalItems, options?.gapFill);

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
