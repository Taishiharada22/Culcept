/**
 * Day State hints（W3b）— facts 由来 DailyGuidanceFrame 合成と hint confidence 規約（pure）
 *
 * 正本: docs/day-state-w3-execution-plan.md §3（b-1 / b-3）/ 設計書 §3.3（契約 C-2）
 * 規律:
 *  - 会話 message 由来の extractDailyGuidanceFrame とは別経路（facts のみ・LLM なし・DB なし）
 *  - 捏造禁止: 信号が無いフィールドは unknown（confidence 0）のまま渡す
 *  - resolveDailyMode が実際に消費するのは energy_level / desire_direction / personality.axisScores
 *    のみ（alterHomeAdapter:8327-8388）。facts からの合成も energy_level に限定する
 *  - dailyModeHintConfidence = 「resolveDailyMode 入力 ConfidentValue 群の min」（契約 C-2）。
 *    信号ゼロでも軸スコア証拠があれば personality prior として 0.2（見立ての下限明示）。
 *    軸スコア証拠も無ければ null = hint を出さない（W2 の保守的 fallback に委ねる）
 */

import type {
  ConfidentValue,
  DailyGuidanceFrame,
} from "@/lib/stargazer/alterHomeAdapter";
import type { ActivityMoodCode } from "@/lib/coalter/activity/intent";
import type { EstimatedWalkLevel, SleepQualityInput } from "@/lib/plan/dayState/dayStateTypes";
import type { MorningPlan } from "@/lib/alter-morning/types";

export interface DayStateHintFacts {
  moodCode?: ActivityMoodCode;
  sleepQuality?: SleepQualityInput;
  /** 当日 work シフトが夜勤帯（22:00-05:00 交差）か */
  isNightShift?: boolean;
}

function unknownStr<T extends string>(): ConfidentValue<T | "unknown"> {
  return { value: "unknown", confidence: 0, source: "unknown" } as ConfidentValue<T | "unknown">;
}

/**
 * facts → DailyGuidanceFrame。energy_level のみ合成し、他フィールドは unknown を正直に渡す。
 * energy 写像は buildDayStateRecord の同種規約（mood 0.7 / sleep 0.5 / 夜勤 inferred 0.5）と整合。
 * 優先順位: moodCode（本人・当日） > sleepQuality（本人・睡眠質） > 夜勤（推定）。
 */
export function synthesizeGuidanceFrame(facts: DayStateHintFacts): DailyGuidanceFrame {
  let energy: DailyGuidanceFrame["energy_level"] = unknownStr();
  if (facts.moodCode === "energetic") {
    energy = { value: "high", confidence: 0.7, source: "user_confirmed" };
  } else if (facts.moodCode === "tired") {
    energy = { value: "low", confidence: 0.7, source: "user_confirmed" };
  } else if (facts.sleepQuality === "short" || facts.sleepQuality === "shallow") {
    energy = { value: "low", confidence: 0.5, source: "user_confirmed" };
  } else if (facts.sleepQuality === "good") {
    // 良眠 = 高エネと断定しない（medium 保守）
    energy = { value: "medium", confidence: 0.4, source: "user_confirmed" };
  } else if (facts.isNightShift) {
    energy = { value: "low", confidence: 0.5, source: "inferred" };
  }
  return {
    time_budget: unknownStr(),
    energy_level: energy,
    hard_constraints: { value: [], confidence: 0, source: "unknown" },
    desire_direction: unknownStr(),
    preferred_progress_style: unknownStr(),
    social_bandwidth: unknownStr(),
    open_loops: { value: [], confidence: 0, source: "unknown" },
  };
}

/** 信号ゼロ時の personality prior の明示下限（「型からの見立て」であることを confidence で示す） */
export const PERSONALITY_PRIOR_CONFIDENCE = 0.2;

/**
 * dailyModeHintConfidence の規約（契約 C-2）。
 *  - frame の消費フィールド（energy / desire）のうち非 unknown のものの min confidence
 *  - 全 unknown でも軸スコア証拠があれば PERSONALITY_PRIOR_CONFIDENCE
 *  - どちらも無ければ null（hint を出さない）
 */
export function resolveHintConfidence(
  frame: DailyGuidanceFrame,
  hasAxisEvidence: boolean,
): number | null {
  const consumed = [frame.energy_level, frame.desire_direction].filter(
    (cv) => cv.value !== "unknown",
  );
  if (consumed.length > 0) {
    return Math.min(...consumed.map((cv) => cv.confidence));
  }
  return hasAxisEvidence ? PERSONALITY_PRIOR_CONFIDENCE : null;
}

const WALK_LEVELS: ReadonlyArray<EstimatedWalkLevel> = ["low", "medium", "high"];

/**
 * 当日 MorningPlan（JSONB 由来）から estimatedWalkLevel を防御的に取り出す。
 * 型 union 外の値・欠落は null（free-text の withWhom から対人負荷を推測しない —
 * interpersonalLoadHint は構造抽出（Stage 1.5）まで保留。実行計画 §3 b-3 注記）。
 */
export function extractWalkLevel(plan: MorningPlan | null): EstimatedWalkLevel | null {
  const raw = plan?.dayConditions?.estimatedWalkLevel;
  return raw !== undefined && (WALK_LEVELS as string[]).includes(raw) ? raw : null;
}

/** "YYYY-MM-DD" に日数を足す（UTC カレンダー演算。fetchPreviousDayPlan の逆算用） */
export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
