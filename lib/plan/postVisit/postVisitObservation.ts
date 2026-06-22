/**
 * lib/plan/postVisit/postVisitObservation.ts
 *   — 評価OS / Stage 0: post-visit「答え合わせ」観測の pure model（dormant・local shadow only）
 *
 * ★狙い（deep research 統合・CEO GO 2026-06-22）:
 *   場所の「絶対評価（星）」を集めるのではなく、Candidate Lens / Travel / Location Notes の
 *   **「提案がその人に合ったか」を 1 タップで答え合わせ**し、次回の推薦改善に使える観測を作る。
 *   これは purpose-fit lens の cold-start を抜けるために唯一欠けていた測定器官（critical path: 答え合わせ → アーク）。
 *
 * ★絶対原則:
 *   - 星評価なし / SNS・投稿・共有・いいねなし / ranking 反映なし / DB なし / streak・連続記録・gamification なし。
 *   - **未回答 = null（中立扱いしない）**。
 *   - **生 GPS・住所・正確な滞在時間・notes 原文・sensitive 場所は保存しない**。保存は derived / redacted / local-only のみ。
 *   - flag default OFF + production hard block。flag OFF で既存挙動完全不変。
 *
 * ★pure: Date/Math.random/network/DB/外部 API なし。`at` は呼び出し側が渡す（store が stamp）。
 */
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import { opaquePlaceKey } from "@/lib/plan/candidateLens/candidateLensPreferenceStore";
import { sanitizeContextSnapshot, type PostVisitContextSnapshot } from "./postVisitContext";

/**
 * ★flag（dormant・default OFF・production hard block）。OFF で store/UI とも no-op。
 *   dev/dogfood は **source 編集不要**: 環境変数 `NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD=1` で dev session のみ点火可。
 *   production は env が立っていても必ず false。
 */
export const POST_VISIT_CHECK_ENABLED = false;
export function isPostVisitCheckEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false; // ★production hard block（env でも必ず false）
  return POST_VISIT_CHECK_ENABLED || process.env.NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD === "1";
}

// ── 1-tap 答え合わせの回答（4択・星でない）──
export type PostVisitResponse = "keep" | "conditional" | "not_today" | "no_more";
export const POST_VISIT_RESPONSE_LABEL: Record<PostVisitResponse, string> = {
  keep: "また候補に残す",
  conditional: "条件次第",
  not_today: "今日は違った",
  no_more: "もういい",
};
export const POST_VISIT_RESPONSES: readonly PostVisitResponse[] = ["keep", "conditional", "not_today", "no_more"];

// ── 理由 chip（固定集合・★その他は free text を保存しない）──
export type ReasonChipKey =
  | "content_good" | "calm" | "crowded" | "felt_pricey" | "was_tired" | "service"
  | "solo" | "with_someone" | "ok_noon" | "not_night" | "rain_inconvenient" | "commute_tiring" | "other";
export const REASON_CHIP_LABEL: Record<ReasonChipKey, string> = {
  content_good: "内容は良い",
  calm: "落ち着けた",
  crowded: "混んでいた",
  felt_pricey: "高く感じた",
  was_tired: "疲れていた",
  service: "接客が気になった",
  solo: "一人向き",
  with_someone: "誰かとならあり",
  ok_noon: "昼ならあり",
  not_night: "夜は違う",
  rain_inconvenient: "雨の日は不便",
  commute_tiring: "移動がだるい",
  other: "その他",
};
export const REASON_CHIPS: readonly ReasonChipKey[] = [
  "content_good", "calm", "crowded", "felt_pricey", "was_tired", "service",
  "solo", "with_someone", "ok_noon", "not_night", "rain_inconvenient", "commute_tiring", "other",
];
const REASON_CHIP_SET: ReadonlySet<string> = new Set(REASON_CHIPS);

// ── trigger / suppress の語彙 ──
export type PostVisitTrigger =
  | "lens_proposed"    // Candidate Lens が提案した場所
  | "first_visit"      // 初訪問
  | "important_plan"   // 重要予定
  | "discovery_domain" // 旅行/食/観光/Location Notes 由来
  | "early_leave"      // 予定より早く離れた可能性
  | "long_stay"        // 予定より長く滞在した可能性
  | "past_plan";       // 経過した場所付き予定（Calendar 主フロー・最低優先度）
export type SuppressReason =
  | "sensitive"     // sensitive category
  | "home_work"     // 自宅/職場
  | "habitual"      // コンビニ/駅/日常移動
  | "high_fatigue"  // 疲労が強い
  | "after_skip"    // skip/拒否した直後
  | "recent_same";  // 同型質問が直近に出た

/** 滞在の **粗い** signal（★正確な滞在時間は保存しない・early/long/asplanned のみ）。 */
export type DwellSignal = "early" | "long" | "asplanned";

/**
 * 保存する観測（★derived / redacted / local-only）。
 * placeKey は opaque hash（場所名/住所/座標は持たない）。response 未回答は null（中立でない）。
 */
export interface PostVisitObservation {
  readonly v: 1;
  /** opaque hash（cyrb53 由来・PII なし）。場所名/住所/座標は保持しない。 */
  readonly placeKey: string;
  /** 目的レンズ（derived・予定名原文は持たない）。 */
  readonly lens: PurposeLens;
  /** どの trigger で聞いたか（derived）。 */
  readonly trigger: PostVisitTrigger;
  /** 1-tap 回答。**未回答は null（中立扱いしない）**。 */
  readonly response: PostVisitResponse | null;
  /** 理由 chip（固定集合の部分集合・free text なし）。 */
  readonly reasonChips: readonly ReasonChipKey[];
  /** 粗い滞在 signal（early/long/asplanned）。正確な分は保存しない。 */
  readonly dwellSignal: DwellSignal | null;
  /** 観測時刻（ms・recency 判定用。GPS/dwell ではない）。呼び出し側が渡す。 */
  readonly at: number;
  /**
   * ★Stage 4-A: 観測時の文脈スナップショット（coarse/nullable/redacted）。**optional＝後方互換**。
   * 既存観測（これが無い）も完全に読める。purpose(lens)/trigger は top-level にあるため重複しない。
   * 将来の複合融合エンジンの教師データ。Fit-Arc は当面これを使わない。
   */
  readonly contextSnapshot?: PostVisitContextSnapshot;
}

/** contextSnapshot を **必ず持つ** 観測（将来の Context Fit 学習が filter する narrowed 型）。 */
export type ContextFitObservation = PostVisitObservation & { readonly contextSnapshot: PostVisitContextSnapshot };
export function hasContextSnapshot(o: PostVisitObservation): o is ContextFitObservation {
  return o.contextSnapshot != null;
}

export interface BuildObservationInput {
  /** 場所の記述子（名前+住所等）。**ここで hash 化し、原文は観測に残さない**。 */
  readonly placeDescriptor: string | null | undefined;
  readonly lens: PurposeLens;
  readonly trigger: PostVisitTrigger;
  /** 未回答は undefined/null → null 保存（中立にしない）。 */
  readonly response?: PostVisitResponse | null;
  readonly reasonChips?: readonly ReasonChipKey[];
  readonly dwellSignal?: DwellSignal | null;
  readonly at: number;
  /** ★Stage 4-A: 観測時の文脈（coarse のみ）。未指定 → contextSnapshot なし（後方互換）。 */
  readonly contextSnapshot?: PostVisitContextSnapshot | null;
}

/**
 * 観測レコードを **redact して** 構築（pure）。
 *   - placeDescriptor は opaquePlaceKey で hash 化（原文は出力に残らない＝PII 遮断）。
 *   - reasonChips は固定集合に filter（未知/自由語を捨てる）。
 *   - response 未指定 → null（中立でない）。
 */
export function buildPostVisitObservation(input: BuildObservationInput): PostVisitObservation {
  const placeKey = opaquePlaceKey(input.placeDescriptor) ?? "p_unknown";
  const reasonChips = (input.reasonChips ?? []).filter((c): c is ReasonChipKey => REASON_CHIP_SET.has(c));
  // ★contextSnapshot は redaction firewall を通す（不正/PII は落ちる・無ければ付けない＝後方互換）
  const contextSnapshot = input.contextSnapshot != null ? sanitizeContextSnapshot(input.contextSnapshot) : null;
  return {
    v: 1,
    placeKey,
    lens: input.lens,
    trigger: input.trigger,
    response: input.response ?? null, // ★未回答=null
    reasonChips,
    dwellSignal: input.dwellSignal ?? null,
    at: input.at,
    ...(contextSnapshot ? { contextSnapshot } : {}), // optional＝存在時のみ付与
  };
}

/** ★store/シリアライズ用の **whitelist**（これ以外のキーは永続化しない＝redaction の defense-in-depth）。 */
export const PERSISTED_OBSERVATION_KEYS = ["v", "placeKey", "lens", "trigger", "response", "reasonChips", "dwellSignal", "at", "contextSnapshot"] as const;
