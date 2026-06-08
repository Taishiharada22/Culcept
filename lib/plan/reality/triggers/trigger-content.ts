/**
 * Reality Control OS — R4-3 Trigger Message Content Builder（**pure・non-assertive**・barrel 非 export）
 *
 * 設計: docs/r4-trigger-asset-audit-and-boundary.md（R4-0）/ trigger-evaluator.ts（R4-2）
 *
 * 役割: 発火 trigger から **非断定・おすすめ前面**の message content を pure に組む。empty_day は R2 の recommended を流用。
 *   **配送しない**（content を作るだけ）・**正本型を作らない**・粗い見積り（leaveBy 等）は coarseNote で断る。
 *
 * 厳守: 非断定（trait/fixed/liked-disliked/断定を出さない）・おすすめは提案であり命令でない・pure。
 */

import type { EmptyDayTier } from "../empty-day/empty-day-generator";
import type { TriggerContext, TriggerKind } from "./trigger-model";
import type { FiredTrigger } from "./trigger-evaluator";

export interface TriggerMessage {
  readonly kind: TriggerKind;
  /** 1 行・非断定・おすすめ前面。 */
  readonly headline: string;
  readonly detail: string | null;
  /** 推奨アクション（提案・1 タップ相当・命令でない）。 */
  readonly recommendedAction: string | null;
  readonly lines: readonly string[];
  /** 粗い見積りの断り（placeholder 由来・null=なし）。 */
  readonly coarseNote: string | null;
}

const TIER_PHRASE: Record<EmptyDayTier, string> = {
  protect: "余白を残す組み方",
  easy: "回復を優先する組み方",
  push: "前に進める組み方",
};

function round5(n: number): number {
  return Math.max(0, Math.round(n / 5) * 5);
}

function buildPreflight(fired: FiredTrigger, now: number | null): TriggerMessage {
  const lines: string[] = [];
  if (fired.leadMinutes != null) lines.push(`次の予定まで約 ${round5(fired.leadMinutes)} 分です`);
  let headline = "そろそろ次の予定の準備を始められます";
  if (fired.leaveByMinute != null && now != null) {
    const minToLeave = fired.leaveByMinute - now;
    if (minToLeave < 0) headline = "出発の目安を過ぎています。今からでも準備を始められます";
    else lines.push(`あと約 ${round5(minToLeave)} 分で出発の目安です`);
  }
  return { kind: "preflight", headline, detail: null, recommendedAction: "準備・移動の支度を始める", lines, coarseNote: "移動時間は概算です" };
}

function buildEmptyDay(ctx: TriggerContext): TriggerMessage {
  const rec = ctx.emptyDay?.recommended ?? null;
  const recommendedAction = rec ? `今日は「${TIER_PHRASE[rec]}」で始められます` : "今日の組み方を見てみる";
  return {
    kind: "empty_day",
    headline: "今日は予定が空いています。こう組めます",
    detail: rec ? `おすすめは${TIER_PHRASE[rec]}です` : null,
    recommendedAction,
    lines: [],
    coarseNote: null,
  };
}

function buildGap(fired: FiredTrigger): TriggerMessage {
  const dur = fired.windowRef ? fired.windowRef.endMinute - fired.windowRef.startMinute : 0;
  return {
    kind: "gap_opportunity",
    headline: `${round5(dur)} 分ほどの空き時間があります`,
    detail: null,
    recommendedAction: "軽い用事か、ひと休みに使えます",
    lines: [],
    coarseNote: null,
  };
}

function buildWindDown(): TriggerMessage {
  return {
    kind: "wind_down",
    headline: "一日おつかれさまでした。明日に向けて整えられます",
    detail: null,
    recommendedAction: "早めに休む準備を始める",
    lines: [],
    coarseNote: null,
  };
}

/** R4-3: 1 発火 trigger → 非断定 message。 */
export function buildTriggerContent(fired: FiredTrigger, ctx: TriggerContext): TriggerMessage {
  const now = ctx.worldState.nowMinute;
  switch (fired.kind) {
    case "preflight":
      return buildPreflight(fired, now);
    case "empty_day":
      return buildEmptyDay(ctx);
    case "gap_opportunity":
      return buildGap(fired);
    case "wind_down":
      return buildWindDown();
  }
}

/** R4-3: 複数発火 → message[]。 */
export function buildAllTriggerContent(fired: readonly FiredTrigger[], ctx: TriggerContext): readonly TriggerMessage[] {
  return fired.map((f) => buildTriggerContent(f, ctx));
}
