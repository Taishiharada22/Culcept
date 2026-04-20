/**
 * CoAlter Stage 1d — Food Lens Adapter
 *
 * 位置づけ（`docs/coalter-food-three-stage-design.md` §2.2.5）:
 *   S1 出力の `TwoPersonLensToday` を食事ドメイン視点で読み直す薄い翻訳器。
 *   `TwoPersonLensToday` 本体はドメイン非依存のまま保持し、food 固有の
 *   4 軸 (hungerLevel / timeWindow / atmosphereDesire / moodTags) を派生する。
 *
 * 契約:
 *   - **logic のみ**。LLM・外部 I/O 禁止
 *   - 目標 latency: ≤ 100ms（純関数＋軽量 regex）
 *   - UI には触らない（shape 提供のみ）
 *   - 2026-04-20 F-1 scope: rev 2（requestedTimeSlots / occasion）は含めない
 *     — doc §2.2.5 の rev 2 拡張は将来 F-x で再登場予定
 *   - `derivationSource` は narration 内部引用専用。diagnostics / KPI 禁止
 *     （生テキストを含む可能性があるため。types.ts の CEO lock 2026-04-20 A 準拠）
 */

import type {
  ConversationTurn,
  EnvironmentalObservation,
  TwoPersonLensToday,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

export type HungerLevel =
  | "very_hungry"
  | "hungry"
  | "peckish"
  | "satisfied"
  | "unknown";

export type TimeWindow =
  | "breakfast"
  | "lunch"
  | "late_lunch"
  | "tea"
  | "dinner"
  | "late_night";

export type Quietness = "quiet" | "moderate" | "lively" | "either";
export type Density = "private" | "spacious" | "intimate" | "either";
export type Lighting = "warm_low" | "neutral" | "bright" | "either";

export interface AtmosphereDesire {
  quietness: Quietness;
  density: Density;
  lighting: Lighting;
}

export interface FoodContext {
  hungerLevel: HungerLevel;
  timeWindow: TimeWindow;
  atmosphereDesire: AtmosphereDesire;
  moodTags: string[];
}

/**
 * 各軸の派生由来。narration が「S1 の何から引いたか」を書けるようにするための参照。
 *
 * 値は短い source-ref 文字列（例: "environmental.timeOfDay=morning",
 * "todayReading.mode=recover", "turn.regex:hunger_explicit"）で、
 * 原文は含めない（PII 配慮）。narration 内部でのみ使用する。
 */
export interface DerivationSource {
  hungerLevel: string[];
  timeWindow: string[];
  atmosphereDesire: string[];
  moodTags: string[];
}

export interface FoodLensToday {
  /** 元の S1 出力をそのまま保持。narration 側で lens.sourcedFrom 等を引ける。 */
  lens: TwoPersonLensToday;
  foodContext: FoodContext;
  derivationSource: DerivationSource;
}

export interface BuildFoodLensTodayInput {
  lens: TwoPersonLensToday;
  environmental: EnvironmentalObservation;
  /** 直近会話。regex signal 用。長大な履歴ではなく S1 と同じ窓で十分。 */
  turns: ConversationTurn[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Regex signals（ユーザー発話からの軽量抽出）
// ═══════════════════════════════════════════════════════════════════════════

const HUNGER_VERY = /お腹.{0,3}空|腹.{0,2}減|ハラヘ|空腹|がっつり|たらふく|ペコペコ/;
const HUNGER_PECKISH = /軽く|ちょっと|少しだけ|小腹|つまむ/;
const HUNGER_SATISFIED = /満腹|お腹.{0,3}いっぱい|食べたばかり|さっき食べ|もうお腹/;

const TIME_BREAKFAST = /朝(ご飯|食|ごはん)|モーニング|朝活/;
const TIME_LUNCH = /ランチ|昼(ご飯|食|ごはん|時)/;
const TIME_LATE_LUNCH = /遅めのランチ|午後.{0,3}(お茶|おやつ前)/;
const TIME_TEA = /(お茶|カフェ|おやつ|ティー(タイム)?)/;
const TIME_DINNER = /(ディナー|晩(ご飯|飯|ごはん)|夜(ご飯|ごはん)|今夜|夕飯|夕食)/;
const TIME_LATE_NIGHT = /(深夜|夜食|締め.{0,2}の|シメ.{0,2}の)/;

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `TwoPersonLensToday` + 環境 + 直近会話から `FoodLensToday` を派生する。
 *
 * **純関数**: 同一入力なら同一出力。副作用なし。
 */
export function buildFoodLensToday(
  input: BuildFoodLensTodayInput,
): FoodLensToday {
  const { lens, environmental, turns } = input;
  const messagesText = turns.map((t) => t.body).join("\n");

  const hunger = deriveHungerLevel(messagesText, environmental);
  const timeWin = deriveTimeWindow(messagesText, environmental);
  const atmos = deriveAtmosphereDesire(lens);
  const moods = deriveMoodTags(lens);

  return {
    lens,
    foodContext: {
      hungerLevel: hunger.value,
      timeWindow: timeWin.value,
      atmosphereDesire: atmos.value,
      moodTags: moods.value,
    },
    derivationSource: {
      hungerLevel: hunger.sources,
      timeWindow: timeWin.sources,
      atmosphereDesire: atmos.sources,
      moodTags: moods.sources,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Derivations（各軸、純関数）
// ═══════════════════════════════════════════════════════════════════════════

interface Derived<T> {
  value: T;
  sources: string[];
}

function deriveHungerLevel(
  text: string,
  env: EnvironmentalObservation,
): Derived<HungerLevel> {
  const sources: string[] = [];
  if (HUNGER_SATISFIED.test(text)) {
    sources.push("turn.regex:hunger_satisfied");
    return { value: "satisfied", sources };
  }
  if (HUNGER_VERY.test(text)) {
    sources.push("turn.regex:hunger_very");
    return { value: "very_hungry", sources };
  }
  if (HUNGER_PECKISH.test(text)) {
    sources.push("turn.regex:hunger_peckish");
    return { value: "peckish", sources };
  }
  // fallback: 時間帯から「食事帯なら hungry」と推測。厳密ではないので low-confidence。
  if (env.timeOfDay === "morning" || env.timeOfDay === "evening") {
    sources.push(`environmental.timeOfDay=${env.timeOfDay}`);
    return { value: "hungry", sources };
  }
  sources.push(`environmental.timeOfDay=${env.timeOfDay}:no_signal`);
  return { value: "unknown", sources };
}

function deriveTimeWindow(
  text: string,
  env: EnvironmentalObservation,
): Derived<TimeWindow> {
  const sources: string[] = [];
  // 会話中の明示指示を優先。
  if (TIME_LATE_NIGHT.test(text)) {
    sources.push("turn.regex:late_night");
    return { value: "late_night", sources };
  }
  if (TIME_BREAKFAST.test(text)) {
    sources.push("turn.regex:breakfast");
    return { value: "breakfast", sources };
  }
  if (TIME_LATE_LUNCH.test(text)) {
    sources.push("turn.regex:late_lunch");
    return { value: "late_lunch", sources };
  }
  if (TIME_LUNCH.test(text)) {
    sources.push("turn.regex:lunch");
    return { value: "lunch", sources };
  }
  if (TIME_DINNER.test(text)) {
    sources.push("turn.regex:dinner");
    return { value: "dinner", sources };
  }
  if (TIME_TEA.test(text)) {
    sources.push("turn.regex:tea");
    return { value: "tea", sources };
  }
  // fallback: environmental.timeOfDay から直マッピング。
  sources.push(`environmental.timeOfDay=${env.timeOfDay}`);
  switch (env.timeOfDay) {
    case "morning":
      return { value: "breakfast", sources };
    case "afternoon":
      return { value: "lunch", sources };
    case "evening":
      return { value: "dinner", sources };
    case "night":
      return { value: "late_night", sources };
  }
}

function deriveAtmosphereDesire(
  lens: TwoPersonLensToday,
): Derived<AtmosphereDesire> {
  const sources: string[] = [];
  const temp = lens.relationalLens.temperature;
  const mode = lens.todayReading.mode;
  sources.push(`relationalLens.temperature=${temp}`);
  sources.push(`todayReading.mode=${mode}`);

  // quietness
  let quietness: Quietness;
  if (mode === "recover") quietness = "quiet";
  else if (mode === "celebrate") quietness = "lively";
  else if (mode === "connect") quietness = temp === "warm" ? "quiet" : "moderate";
  else if (mode === "challenge") quietness = "moderate";
  else quietness = temp === "cool" ? "moderate" : "either";

  // density
  let density: Density;
  if (mode === "recover") density = "private";
  else if (mode === "connect") density = temp === "warm" ? "intimate" : "private";
  else if (mode === "celebrate") density = "spacious";
  else if (mode === "challenge") density = "spacious";
  else density = "either";

  // lighting
  let lighting: Lighting;
  if (mode === "recover") lighting = "warm_low";
  else if (mode === "connect") lighting = "warm_low";
  else if (mode === "celebrate") lighting = "bright";
  else if (mode === "challenge") lighting = "neutral";
  else lighting = "either";

  return {
    value: { quietness, density, lighting },
    sources,
  };
}

/**
 * mode + latentNeeds + careAxes を翻訳して日本語 tag に正規化。
 * narration に使える短い言語化を優先し、length を 5 件までに抑える。
 */
function deriveMoodTags(lens: TwoPersonLensToday): Derived<string[]> {
  const sources: string[] = [];
  const tags = new Set<string>();

  const modeTag = MODE_TO_TAG[lens.todayReading.mode];
  if (modeTag) {
    tags.add(modeTag);
    sources.push(`todayReading.mode=${lens.todayReading.mode}`);
  }

  for (const need of lens.todayReading.latentNeeds ?? []) {
    const normalized = need.trim();
    if (normalized.length > 0 && normalized.length <= 16) {
      tags.add(normalized);
    }
  }
  if ((lens.todayReading.latentNeeds ?? []).length > 0) {
    sources.push("todayReading.latentNeeds");
  }

  for (const axis of lens.relationalLens.careAxes ?? []) {
    const normalized = axis.trim();
    if (normalized.length > 0 && normalized.length <= 16) {
      tags.add(normalized);
    }
  }
  if ((lens.relationalLens.careAxes ?? []).length > 0) {
    sources.push("relationalLens.careAxes");
  }

  const limited = Array.from(tags).slice(0, 5);
  return { value: limited, sources };
}

const MODE_TO_TAG: Record<string, string> = {
  recover: "疲労回復",
  celebrate: "祝祭",
  connect: "近づく",
  challenge: "挑む",
  maintain: "平常",
};

// ═══════════════════════════════════════════════════════════════════════════
// Test-only exports
// ═══════════════════════════════════════════════════════════════════════════

export const __internal = {
  deriveHungerLevel,
  deriveTimeWindow,
  deriveAtmosphereDesire,
  deriveMoodTags,
  HUNGER_VERY,
  HUNGER_PECKISH,
  HUNGER_SATISFIED,
  TIME_BREAKFAST,
  TIME_LUNCH,
  TIME_LATE_LUNCH,
  TIME_TEA,
  TIME_DINNER,
  TIME_LATE_NIGHT,
};
