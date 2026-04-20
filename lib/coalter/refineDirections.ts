/**
 * CoAlter Refine Directions — クライアント/サーバ両用の型・定数・型ガード
 *
 * Phase 1.5.3 ④
 *
 * 「refineItem 本体は LLM 側（server-only）なのでクライアントから import できない」問題への対応。
 * 型 / ラベル / 型ガードなど runAI に依存しないものは別ファイルに切り出す。
 */

export type RefineDirection =
  | "cheaper" // 予算を抑えめに
  | "earlier" // 時刻を早めに
  | "later" // 時刻を遅めに
  | "closer" // より近場に
  | "quieter" // もっと落ち着ける雰囲気に
  | "livelier"; // もっと賑やかな雰囲気に

export const REFINE_DIRECTION_LABEL: Record<RefineDirection, string> = {
  cheaper: "予算抑えめに",
  earlier: "時刻を早めに",
  later: "時刻を遅めに",
  closer: "近場に",
  quieter: "落ち着ける雰囲気に",
  livelier: "賑やかな雰囲気に",
};

export interface RefineCandidate {
  title: string;
  oneLiner: string;
  practicalInfo: string | null;
  url: string | null;
  /** direction をどう反映したかの短いメモ（UI補助） */
  changeNote: string;
  /** 提案する timeSlot（null なら元の timeSlot を踏襲） */
  timeSlot: string | null;
}

/** direction が妥当かチェック */
export function isRefineDirection(v: unknown): v is RefineDirection {
  return (
    v === "cheaper" ||
    v === "earlier" ||
    v === "later" ||
    v === "closer" ||
    v === "quieter" ||
    v === "livelier"
  );
}
