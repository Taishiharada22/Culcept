/**
 * L2.1c When Slot Classifier — Comprehension-First v1.3+ Wave 3 (W3-PR-6 Commit 3)
 *
 * 設計書: CEO 方針 2026-04-22「5W1H 三層化（FIXED / PROVISIONAL / ASK）」
 *
 * 責務:
 *   Event.when の確定度を FIXED/PROVISIONAL/ASK で判定する。
 *
 * 三層判定:
 *   - FIXED:       明示 HH:mm がある
 *   - PROVISIONAL: timeHint のみ（morning/noon/afternoon/evening に anchor）
 *                   または活動カテゴリ標準時刻で補完できる（ランチ=12:00 等）
 *                   または前後 event の時刻で推論できる
 *   - ASK:         いずれもなく、時刻 anchor が取れない
 *
 * 設計原則:
 *   - 辞書は保守的（誤爆リスク最小）
 *   - 純関数・副作用なし・LLM 呼び出しなし
 *   - 定数は export（マジックナンバー排除）
 */
import type { Event } from "../comprehension/eventSchema";
import { parseHHmm, resolveStartTimeAnchor } from "./timeSolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Activity category → standard time dictionary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 活動の活動名（activity / activityCanonical）を正規化したキーに対して、
 * 社会通念上の標準開始時刻を与える。
 *
 * 保守主義: 「カフェ」「仕事」のような広い語は入れない（時間帯が強く文脈依存）。
 * 入れるのは「食事系」および「朝会」など時間帯が社会通念として強固な語のみ。
 */
export const ACTIVITY_CATEGORY_DEFAULTS: Record<string, string> = {
  // 朝
  "朝食": "08:00",
  "朝ごはん": "08:00",
  "朝ご飯": "08:00",
  "モーニング": "08:00",
  "breakfast": "08:00",
  "朝会": "09:00",
  // 昼
  "昼食": "12:00",
  "昼ごはん": "12:00",
  "昼ご飯": "12:00",
  "ランチ": "12:00",
  "お昼": "12:00",
  "lunch": "12:00",
  // 夜
  "夕食": "19:00",
  "夕ごはん": "19:00",
  "夕ご飯": "19:00",
  "ディナー": "19:00",
  "夜ごはん": "19:00",
  "夜ご飯": "19:00",
  "dinner": "19:00",
};

/**
 * Event から category default を引く。見つからなければ null。
 * activity / activityCanonical 両方を大小文字無視・trim して検索。
 */
export function lookupCategoryDefault(ev: Event): string | null {
  const keys = [ev.what.activity, ev.what.activityCanonical];
  for (const raw of keys) {
    if (!raw) continue;
    const norm = raw.trim();
    if (norm in ACTIVITY_CATEGORY_DEFAULTS) {
      return ACTIVITY_CATEGORY_DEFAULTS[norm];
    }
    // 小文字化も試す（英字ケース対応）
    const lower = norm.toLowerCase();
    if (lower in ACTIVITY_CATEGORY_DEFAULTS) {
      return ACTIVITY_CATEGORY_DEFAULTS[lower];
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// When slot classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type WhenStartTimeSource =
  | "explicit"         // 明示 HH:mm
  | "hint"             // timeHint → anchor
  | "category_default" // activity category → 辞書
  | "relative"         // 前後 event からの相対推論
  | null;

export type WhenSlotStatus =
  | { kind: "fixed"; source: "explicit"; startTime: string }
  | { kind: "provisional"; source: "hint" | "category_default"; startTime: string }
  | { kind: "ask"; reason: "no_time_anchor" };

export interface WhenClassifierCtx {
  events: Event[];
  index: number;
}

/**
 * Event.when を三層判定する。
 *
 * 判定順:
 *   1. 明示 startTime                         → FIXED
 *   2. timeHint が設定済み                     → PROVISIONAL (hint)
 *   3. activity category default              → PROVISIONAL (category_default)
 *   4. いずれもなし                             → ASK (no_time_anchor)
 *
 * Note:
 *   relative order anchor (〜の後 / 〜の前) は pre-parse 層で linguistic signal
 *   を拾う必要があるため、Commit 4 以降でスコープに入れる。推論だけで adjacent
 *   event から時刻を借りると「コーヒー」の 2 時間前にランチを見て 10:45 を採用
 *   する等、意図しない過剰推論が起きるため、W3-PR-6 では保守的に入れない。
 */
export function classifyWhenSlot(
  ev: Event,
  _ctx: WhenClassifierCtx,
): WhenSlotStatus {
  // 1. 明示
  if (ev.when.startTime) {
    const m = parseHHmm(ev.when.startTime);
    if (m != null) {
      return { kind: "fixed", source: "explicit", startTime: ev.when.startTime };
    }
  }
  // 2. timeHint
  if (ev.when.timeHint) {
    const anchor = resolveStartTimeAnchor(ev);
    if (anchor) {
      return { kind: "provisional", source: "hint", startTime: anchor };
    }
  }
  // 3. category default
  const categoryTime = lookupCategoryDefault(ev);
  if (categoryTime) {
    return { kind: "provisional", source: "category_default", startTime: categoryTime };
  }
  // 4. ASK
  return { kind: "ask", reason: "no_time_anchor" };
}
