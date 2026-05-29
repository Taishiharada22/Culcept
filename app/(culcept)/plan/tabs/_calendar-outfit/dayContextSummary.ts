/**
 * Slice 2 (Option B-5C) — 最上部 intro を「今日の文脈 1 行」に格上げ（pure / read-only）
 *
 * 役割:
 *   - 既存の汎用 intro（CalendarIntroText / vm.intro）を、 予定がある日は
 *     「Alter は今日をこう見ている」を一瞬で伝える **当日の文脈 1 行**へ差し替える。
 *   - 新規 UI は作らない（既存 intro 文字列を置換するだけ）。 理由カード⑤は「なぜこのコーデか」の
 *     詳細として維持し、 intro は「今日の概要」に役割分離する。
 *
 * 設計判断 (CEO/GPT B-5C):
 *   - 配置は C（intro 格上げ）。 A（理由カード内 summary）/ B（hero 下チップ列）は ⑤ と重複するため不採用。
 *   - **eventCount 0 → null を返し、 既存の上品な汎用 intro を維持**（空状態メッセージ化を避ける）。
 *   - weather は出さない（hero ② が持つ）。 outfit を断定しない（intro は day-context であり推薦文ではない）。
 *
 * privacy (B-3/B-5A と同方針):
 *   - dayContext（機微サニタイズ済）の has* / mobility / maxFormality / dominantActivity のみ使用。
 *   - 機微カテゴリ（医療/法務/試験）の生値・推測は出さない。 formal は「きちんと感」へ丸める。
 *
 * 不変原則: pure。 副作用 / I/O / engine / DB / write なし。
 */

import type { OutfitActivityKind } from "./anchorsToOutfitEvents";
import type { OutfitDayContext } from "./outfitEventProjection";

const ACTIVITY_JA: Record<OutfitActivityKind, string> = {
  meeting: "会議",
  work: "作業",
  meal: "食事",
  social: "お出かけ",
  exercise: "運動",
  move: "移動",
  errand: "用事",
  rest: "休息",
  unknown: "予定",
};

/** 今日の活動の中心を 1〜2 個ピックして「◯◯が中心の日 / ◯◯の予定がある日」 */
function activityPhrase(ctx: OutfitDayContext): string {
  const acts: string[] = [];
  if (ctx.hasMeeting) acts.push("会議");
  if (ctx.hasCafeWork) acts.push("カフェ作業");
  if (ctx.hasMeal) acts.push("外食");
  if (ctx.hasOutdoor) acts.push("屋外の予定");

  if (acts.length >= 2) return `${acts.slice(0, 2).join("と")}が中心の日`;
  if (acts.length === 1) return `${acts[0]}の予定がある日`;
  if (ctx.dominantActivity !== "unknown") return `${ACTIVITY_JA[ctx.dominantActivity]}中心の日`;
  if (ctx.mobility === "high" || ctx.mobility === "medium") return "移動が多めの日";
  return "予定がある日";
}

/** 移動量 × フォーマル度の短い助言（断定しすぎない、 1 文だけ） */
function notePhrase(ctx: OutfitDayContext): string {
  if (ctx.mobility === "high") return "歩きやすさと軽さを意識すると安心です。";
  if (ctx.maxFormality === "formal" || ctx.maxFormality === "office") {
    return ctx.mobility === "medium"
      ? "移動はやや多め、きちんと感を少し残すと安心です。"
      : "きちんと感を少し残すと安心です。";
  }
  if (ctx.maxFormality === "smart_casual") return "程よくきれいめが馴染みます。";
  if (ctx.maxFormality === "casual") return "落ち着いた印象で過ごしやすく整えます。";
  if (ctx.mobility === "medium") return "移動はやや多め、動きやすさも意識します。";
  return "予定に合わせて、軽く整えます。";
}

/**
 * 当日の文脈 1 行を生成。
 *   - eventCount 0 → `null`（呼び出し側は既存の汎用 intro を維持）。
 *   - eventCount > 0 → 「今日は、◯◯が中心の日。{助言}。」
 */
export function buildDayContextSummary(ctx: OutfitDayContext): string | null {
  if (ctx.eventCount === 0) return null; // 予定なし → 上品な汎用 intro を維持
  return `今日は、${activityPhrase(ctx)}。${notePhrase(ctx)}`;
}
