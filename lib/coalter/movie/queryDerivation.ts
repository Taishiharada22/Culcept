/**
 * CoAlter Stage 2 Curate (movie) — Query Derivation
 *
 * 三段式 §2.3.1 / mainstream plan §3.2 元 D-2-a / handoff rev 6 §2 Step D-1-a.
 *
 * Stage 1 Understand の出力 `TwoPersonLensToday` を、movie ドメイン固有の検索軸
 * `MovieQuery` に翻訳する pure function。
 *
 *   軸の決定: `todayReading.mode` × `relationalLens.temperature` × `energyBudget`
 *   × `timeBudget` から派生 (三段式 §2.3.1)。
 *   例: mode="recover" + temperature="warm" + energyBudget="low"
 *       → mood="comforting", weight="light", length_max=120
 *
 * 設計原則:
 *   - **決定論的**: 同じ lens を渡せば同じ MovieQuery が返る (副作用ゼロ、time / random 不参照)
 *   - **veto_guard 反映**: `relationalLens.avoidElements` を `exclude` に shallow copy
 *   - **immutable input**: 入力 lens を mutate しない (内部 copy で守る)
 *   - **logic 主体**: LLM 不使用。後段 (D-1-c LLM Ranker) で再評価される一次フィルタ
 *
 * D-1-a scope: 本 file は型 + pure function のみ。Candidate Pool / Soft Filter は
 *   D-1-b (`candidatePool.ts`)、LLM Ranker は D-1-c (`curator.ts`) で別 file。
 *
 * 凍結線整合 (handover §4.2):
 *   - 既存 `lib/coalter/movieOrchestrator.ts` / `movieRanker.ts` / `movieCatalog.ts` /
 *     `webConnector.ts` に touch なし
 *   - `lib/coalter/understanding/**` から型 import のみ (touch なし)
 */

import type {
  RelationalTemperature,
  TodayMode,
  TwoPersonLensToday,
} from "../understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types — MovieQuery (三段式 §2.3.1)
// ═══════════════════════════════════════════════════════════════════════════

/** 鑑賞ムードタグ。LLM Ranker と narration が参照する軸。 */
export type MoodTag =
  | "upbeat"
  | "mellow"
  | "thrilling"
  | "comforting"
  | "thought-provoking";

/** 鑑賞後の疲労度 (energyBudget 由来)。 */
export type WeightTag = "light" | "medium" | "heavy";

/** 上映期間タグ。三段式は now-showing 既定 (Tier 0/1/2 が現上映劇場前提)。 */
export type EraTag = "now-showing" | "any" | "classic";

/**
 * Movie ドメインの検索軸 (三段式 §2.3.1)。
 *
 *   - `genres` / `couple_fit_hints` は **string[]** で柔軟性を保つ (D-1-c で LLM が
 *     拡張・絞り込み可能)
 *   - `length_minutes_max` は `null` で「制限なし」を表す (timeBudget="ample")
 *   - `exclude` は relationalLens.avoidElements の shallow copy (veto_guard)
 */
export type MovieQuery = {
  genres: string[];
  mood: MoodTag;
  weight: WeightTag;
  length_minutes_max: number | null;
  era: EraTag;
  couple_fit_hints: string[];
  exclude: string[];
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Derivation tables — mode / energy / time / temperature → 各軸
// ═══════════════════════════════════════════════════════════════════════════

const MOOD_BY_MODE: Record<TodayMode, MoodTag> = {
  recover: "comforting",
  celebrate: "upbeat",
  connect: "mellow",
  challenge: "thrilling",
  maintain: "mellow",
};

const WEIGHT_BY_ENERGY: Record<"high" | "mid" | "low", WeightTag> = {
  low: "light",
  mid: "medium",
  high: "heavy",
};

const LENGTH_MAX_BY_TIME: Record<"ample" | "limited" | "tight", number | null> =
  {
    ample: null,
    limited: 120,
    tight: 100,
  };

const DEFAULT_GENRES_BY_MODE: Record<TodayMode, readonly string[]> = {
  recover: ["ヒューマンドラマ", "ファンタジー"],
  celebrate: ["コメディ", "ミュージカル"],
  connect: ["ロマンス", "ヒューマンドラマ"],
  challenge: ["サスペンス", "アクション"],
  maintain: ["ヒューマンドラマ"],
};

const COUPLE_FIT_HINTS_TABLE: Record<
  TodayMode,
  Record<RelationalTemperature, readonly string[]>
> = {
  recover: {
    warm: ["静かに寄り添える", "落ち着いて見られる"],
    neutral: ["落ち着いて見られる"],
    cool: ["重くなりすぎない"],
  },
  celebrate: {
    warm: ["話題を作れる", "笑える"],
    neutral: ["笑える"],
    cool: ["明るすぎない楽しさ"],
  },
  connect: {
    warm: ["会話のきっかけになる", "共感しやすい"],
    neutral: ["共感のきっかけになる"],
    cool: ["距離感を保ちつつ共有できる"],
  },
  challenge: {
    warm: ["話題が広がる刺激"],
    neutral: ["新しい視点が入る"],
    cool: ["内省を促す挑戦"],
  },
  maintain: {
    warm: ["安心して観られる"],
    neutral: ["落ち着いて観られる"],
    cool: ["静かに過ごせる"],
  },
};

/**
 * mood の例外規則: challenge × cool は thrilling ではなく thought-provoking
 * (cool な関係温度で挑戦軸は内省的に解釈する、三段式 §2.3.1 軸決定方針)。
 */
function deriveMood(
  mode: TodayMode,
  temperature: RelationalTemperature,
): MoodTag {
  if (mode === "challenge" && temperature === "cool") return "thought-provoking";
  return MOOD_BY_MODE[mode];
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `TwoPersonLensToday` から `MovieQuery` を導出する pure function。
 *
 *   - 副作用なし (DB / network / random / time 不参照)
 *   - 入力 lens を mutate しない
 *   - 同じ lens で常に同じ MovieQuery を返す (決定論)
 *
 * 参照する lens フィールドは 5 つのみ:
 *   - `todayReading.mode`
 *   - `todayReading.energyBudget`
 *   - `todayReading.timeBudget`
 *   - `relationalLens.temperature`
 *   - `relationalLens.avoidElements` (→ exclude へ shallow copy)
 */
export function deriveMovieQuery(lens: TwoPersonLensToday): MovieQuery {
  const { todayReading, relationalLens } = lens;
  const mode = todayReading.mode;
  const temperature = relationalLens.temperature;

  return {
    genres: [...DEFAULT_GENRES_BY_MODE[mode]],
    mood: deriveMood(mode, temperature),
    weight: WEIGHT_BY_ENERGY[todayReading.energyBudget],
    length_minutes_max: LENGTH_MAX_BY_TIME[todayReading.timeBudget],
    era: "now-showing",
    couple_fit_hints: [...COUPLE_FIT_HINTS_TABLE[mode][temperature]],
    exclude: [...relationalLens.avoidElements],
  };
}
