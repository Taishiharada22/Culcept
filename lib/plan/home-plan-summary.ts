/**
 * Home Plan Pane Summary — 純関数 (pure function)
 *
 * 役割:
 *   `ExternalAnchor[]` を Home の Plan pane が表示する summary 形式に変換する。
 *   I/O / DB call / network 一切なし。test 容易性最大化。
 *
 * 設計書: docs/alter-plan-home-integration-mini-design.md §4
 *
 * 不変原則:
 *   - 完全 pure（同一入力 → 同一出力、副作用なし）
 *   - timezone は user-local（Date 経由、UTC drift 防止のため文字列比較）
 *   - one_off は date 文字列を直接参照、recurring は count のみ扱う（expansion なし）
 *   - sensitive_category は本 wave では特別扱いしない（user 自身の Home 表示のため）
 *   - sorting は安定（startTime 昇順）
 *
 * CEO 補正 (2026-05-19):
 *   - Plan pane は summary view のみ。本 helper も summary に必要な最小情報のみ
 *   - 編集 / 詳細操作の data は /plan 直 URL で fetch（本 helper は触らない）
 */

import type { ExternalAnchor } from "./external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlanSummary {
  /** 今日の one_off anchor 群（startTime 昇順） */
  today: ExternalAnchor[];
  /** 明日の one_off anchor 群（startTime 昇順） */
  tomorrow: ExternalAnchor[];
  /** 今日含む 7 日間の one_off anchor 件数（today / tomorrow も含む） */
  thisWeekOneOffCount: number;
  /** recurring template の総数（expansion は行わない、template の存在のみ count） */
  recurringTemplateCount: number;
  /**
   * 最寄りの予定（next upcoming）:
   *   - 今日の anchor で、現在時刻以降 startTime のもの（時刻昇順最初）
   *   - なければ明日の anchor の startTime 最早
   *   - 両方なければ null
   */
  nextUpcoming: ExternalAnchor | null;
  /** 全体が空か（empty state 判定用） */
  isEmpty: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * anchors を Home Plan pane の summary 形式に変換する。
 *
 * @param anchors  ExternalAnchor[]（順序問わず）
 * @param now      現在時刻（default: new Date()、test 用に inject 可能）
 */
export function buildHomePlanSummary(
  anchors: ReadonlyArray<ExternalAnchor>,
  now: Date = new Date()
): PlanSummary {
  const todayYmd = formatYmd(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYmd = formatYmd(tomorrow);

  // 今週 = 今日から 7 日間（today を 1 日目とする）
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndYmd = formatYmd(weekEnd);

  const today: ExternalAnchor[] = [];
  const tomorrowAnchors: ExternalAnchor[] = [];
  let thisWeekOneOffCount = 0;
  let recurringTemplateCount = 0;

  for (const a of anchors) {
    if (a.anchorKind === "one_off") {
      const d = a.date;
      if (d === todayYmd) today.push(a);
      if (d === tomorrowYmd) tomorrowAnchors.push(a);
      if (d >= todayYmd && d <= weekEndYmd) thisWeekOneOffCount += 1;
    } else {
      recurringTemplateCount += 1;
    }
  }

  // Sort by startTime (HH:mm) 昇順、同時刻は title 昇順（決定論的）
  today.sort(byStartTimeThenTitle);
  tomorrowAnchors.sort(byStartTimeThenTitle);

  // nextUpcoming: 今日の startTime >= now の最早、なければ明日の最早
  const nowHhmm = formatHhmm(now);
  const todayUpcoming = today.find((a) => a.startTime >= nowHhmm);
  const nextUpcoming = todayUpcoming ?? tomorrowAnchors[0] ?? null;

  const isEmpty =
    today.length === 0 &&
    tomorrowAnchors.length === 0 &&
    thisWeekOneOffCount === 0 &&
    recurringTemplateCount === 0;

  return {
    today,
    tomorrow: tomorrowAnchors,
    thisWeekOneOffCount,
    recurringTemplateCount,
    nextUpcoming,
    isEmpty,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internals
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function byStartTimeThenTitle(a: ExternalAnchor, b: ExternalAnchor): number {
  const t = a.startTime.localeCompare(b.startTime);
  if (t !== 0) return t;
  return a.title.localeCompare(b.title);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHhmm(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
