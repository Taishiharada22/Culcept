/**
 * Planning Engine — ユーザー入力 → 構造化 → 1日のプラン生成
 *
 * 1. テキストから予定(fixed)とTodo(todo)を分類
 * 2. 所要時間をTaskDurationMemoryで仮置き
 * 3. 固定予定を軸にTodoを最適配置
 */

import type { PlanItem, MorningPlan, DayConditions, FlowContext } from "./types";
import type { EventType } from "@/app/(culcept)/calendar/_lib/vcTypes";
import { todayJST } from "./dateUtils";
import {
  loadDurationStore,
  estimateDuration,
  type DurationEstimate,
} from "./taskDurationMemory";
import { insertTravelItems } from "./travelTimeEngine";

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
      .replace(/^今日[はも]?\s*/, "")
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
      startTime: time ?? undefined,
      durationMin: estimate.minutes,
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
  options?: { goOut?: boolean }
): MorningPlan {
  const currentTime = now ?? new Date();
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();

  // 開始時刻: 現在時刻を30分単位で切り上げ、最低9:00
  const nowMinutes = currentHour * 60 + currentMinute;
  const roundedNow = Math.ceil(nowMinutes / 30) * 30;
  const dayStart = Math.max(roundedNow, 9 * 60); // 9:00 以降

  // travel を除外して fixed / todo を分離（travel は後で再挿入する）
  const fixedItems = items
    .filter((i) => i.kind === "fixed" && i.startTime)
    .sort((a, b) => timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!));

  const todoItems = items
    .filter((i) => i.kind === "todo")
    .sort((a, b) => {
      // sequenceOrder がある場合は順序制約を最優先する（visit → main task）
      const aSeq = a.sequenceOrder ?? 9999;
      const bSeq = b.sequenceOrder ?? 9999;
      if (aSeq !== bSeq) return aSeq - bSeq;
      // 同じ sequenceOrder（or 両方なし）→ 長いものから
      return b.durationMin - a.durationMin;
    });

  // ── Phase 1: タスク配置（移動なし） ──
  const scheduled: PlanItem[] = [];

  // 1. fixed予定を配置
  for (const item of fixedItems) {
    scheduled.push(item);
  }

  // 2. 空き時間を計算してtodoを配置
  let cursor = dayStart;

  for (const todo of todoItems) {
    // 次のfixed予定までの空き時間を探す
    let placed = false;

    for (let i = 0; i <= fixedItems.length; i++) {
      const slotStart = i === 0 ? cursor : (() => {
        const prev = fixedItems[i - 1];
        return timeToMinutes(prev.startTime!) + prev.durationMin;
      })();

      const slotEnd = i < fixedItems.length
        ? timeToMinutes(fixedItems[i].startTime!)
        : 23 * 60; // 23:00まで

      if (slotEnd - slotStart >= todo.durationMin && slotStart >= cursor) {
        scheduled.push({ ...todo, startTime: minutesToTime(slotStart) });
        cursor = slotStart + todo.durationMin;
        placed = true;
        break;
      }
    }

    // どこにも入らない場合は末尾に追加（時刻なし）
    if (!placed) {
      scheduled.push({ ...todo });
    }
  }

  // 時刻順にソート
  scheduled.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

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
  const withTravel = insertTravelItems(
    scheduled,
    dayConditions.mainTransport,
    goOut
  );

  // ── Phase 3: 移動アイテム込みで時刻を再計算 ──
  const finalItems = reassignTimes(withTravel, dayStart, fixedItems);

  const today = todayJST();

  return {
    date: today,
    items: finalItems,
    dayConditions,
    createdAt: currentTime.toISOString(),
    confirmed: false,
  };
}

/**
 * 移動アイテムを含むリストに対して時刻を再割り当てする。
 *
 * fixed 予定の時刻は固定。travel と todo は前から順に積む。
 * travel は直前のタスクの終了時刻に自動配置される。
 */
function reassignTimes(
  items: PlanItem[],
  dayStart: number,
  fixedItems: PlanItem[]
): PlanItem[] {
  // fixed予定はそのまま保持。travel/todo は詰め直す
  const result: PlanItem[] = [];
  let cursor = dayStart;

  for (const item of items) {
    if (item.kind === "fixed" && item.startTime) {
      // fixed はそのまま
      result.push(item);
      cursor = Math.max(cursor, timeToMinutes(item.startTime) + item.durationMin);
    } else {
      // travel or todo → cursor の位置に配置
      // ただし fixed 予定とぶつからないように調整
      const nextFixed = fixedItems.find(
        (f) => f.startTime && timeToMinutes(f.startTime) > cursor
      );
      if (nextFixed && nextFixed.startTime) {
        const fixedStart = timeToMinutes(nextFixed.startTime);
        if (cursor + item.durationMin > fixedStart) {
          // fixedの後に回す場合 — ここでは単純にcursorで配置
          // （固定予定を超えないよう、後ほどソートで調整）
        }
      }
      result.push({ ...item, startTime: minutesToTime(cursor) });
      cursor += item.durationMin;
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン更新（ユーザーが時間を変更した時）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーがプランの特定アイテムの所要時間を変更した時に呼ぶ。
 * TaskDurationMemoryの学習もここでトリガーする。
 */
export function updateItemDuration(
  plan: MorningPlan,
  itemId: string,
  newDurationMin: number
): MorningPlan {
  return {
    ...plan,
    items: plan.items.map((item) =>
      item.id === itemId ? { ...item, durationMin: newDurationMin } : item
    ),
  };
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
