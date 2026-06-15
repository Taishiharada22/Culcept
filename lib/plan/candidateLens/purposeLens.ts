/**
 * lib/plan/candidateLens/purposeLens.ts
 *   — Purpose-Adaptive Candidate Lens / Phase 1: 目的レンズ分類（pure）
 *
 * ★思想（CEO 2026-06-15）: 「全候補に同じ情報」でなく「このユーザーが今この候補を選ぶために必要な情報だけ」を
 *   見せる。そのために比較項目を**固定せず、予定の目的（lens）で変える**。本 module は予定→目的レンズの分類のみ。
 *
 * ★pure: 既存 `classifyActivityIconKey`(ActivityIconKey) を土台に、title keyword で purpose を精緻化。
 *   Date/network/DB/外部 API なし。rainy は lens でなく resolver 側の modifier（直交ゆえ lens を増やさない）。
 */
import type { ActivityIconKey } from "@/lib/plan/compose/activityIcon";

/** 目的レンズ（会議前 / 集中作業 / 会話 / 立ち寄り / 一般）。 */
export type PurposeLens = "meeting_prep" | "focus_work" | "conversation" | "errand" | "generic";

/** title keyword（activityKey より具体的な purpose を上書き）。 */
const FOCUS_KW = ["集中", "作業", "もくもく", "ひとり", "一人", "勉強", "執筆", "資料作成", "コード"];
const CONVERSATION_KW = ["相談", "雑談", "お茶", "ランチ", "ディナー", "飲み", "打ち上げ", "歓談", "デート", "面談"];
const ERRAND_KW = ["買い物", "立ち寄り", "立寄り", "受け取り", "受取", "購入", "ついで", "用事"];

function hasKw(text: string, kws: readonly string[]): boolean {
  return kws.some((k) => text.includes(k));
}

/**
 * ★予定 → 目的レンズ（pure・決定論）。title keyword 優先 → activityKey fallback。
 *   meeting→meeting_prep / work→focus_work / food→conversation / その他→generic。
 */
export function classifyPurposeLens(input: { activityKey: ActivityIconKey; title?: string }): PurposeLens {
  const title = (input.title ?? "").trim();
  // ① title keyword（purpose を直接示す語）を最優先
  if (hasKw(title, FOCUS_KW)) return "focus_work";
  if (hasKw(title, CONVERSATION_KW)) return "conversation";
  if (hasKw(title, ERRAND_KW)) return "errand";
  // ② activityKey から
  switch (input.activityKey) {
    case "meeting":
      return "meeting_prep";
    case "work":
      return "focus_work";
    case "food":
      return "conversation";
    case "fitness":
    case "travel":
    case "generic":
    default:
      return "generic";
  }
}

export const PURPOSE_LENS_LABEL: Record<PurposeLens, string> = {
  meeting_prep: "会議前",
  focus_work: "集中作業",
  conversation: "会話",
  errand: "立ち寄り",
  generic: "一般",
};
