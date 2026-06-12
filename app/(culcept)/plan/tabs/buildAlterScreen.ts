/**
 * buildAlterScreen — AlterTab の container ロジック（pure・テスト可能に抽出）
 *
 * 正本: docs/day-state-w3-execution-plan.md / 設計書 §3-6
 * 役割: 本人入力・hints・hydration・補正・Night Check 回答を受け、pure チェーン
 *   buildDayStateRecord → applyUserCorrection → gradeNightCheck → buildAlterBatteryViewModel
 *   → buildScreenViewModel を 1 本に束ねる。AlterTab は本関数を useMemo で呼ぶだけ。
 *
 * W6-smoke-fix の意図: 「補正→水位反映」「夜の Night Check 表示」を node で fixture 検証可能にし、
 *   実機 FAIL の root cause を pure レベルで切り分ける（React reactivity と時刻ソースを分離）。
 *
 * 規律: 副作用ゼロ（保存・fetch・時刻 API 直呼びなし）。時刻は jstNow を注入。
 */

import { applyUserCorrection, buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { buildAlterBatteryViewModel } from "@/lib/plan/dayState/buildAlterBatteryViewModel";
import { gradeNightCheck } from "@/lib/plan/dayState/gradeNightCheck";
import type {
  DailyGuidanceMode,
  DayFelt,
  DayStateBuildInput,
  DayStateRecordV0,
  EstimatedWalkLevel,
  NightCheckGradeV0,
  PlanVerdict,
  SleepQualityInput,
  UserCorrection,
  WeatherCondition,
} from "@/lib/plan/dayState/dayStateTypes";
import type { ActivityMoodCode } from "@/lib/coalter/activity/intent";
import { jstMinutesOf } from "@/lib/plan/alterTab/adapter";
import { buildScreenViewModel, type AlterScreenViewModel } from "../components/alter/screenViewModel";

export interface AlterScreenHints {
  dailyModeHint?: DailyGuidanceMode;
  dailyModeHintConfidence?: number;
  estimatedWalkLevel?: EstimatedWalkLevel;
}

export interface AlterScreenHydrated {
  /** その日の初回凍結（保存済みがあればそれが正本） */
  frozen: DayStateRecordV0["estimatesFrozen"] | null;
  /** 前日 record（Morning Reveal / recoveryQuality / carried_over 用） */
  yesterday: DayStateRecordV0 | null;
  /** Reveal が過去マウントで表示済みか（1 朝 1 回） */
  revealAlreadySeen: boolean;
}

export interface AlterNightAnswer {
  dayFelt: DayFelt;
  answeredAt: string; // "HH:MM"
  planVerdict?: PlanVerdict;
}

export interface BuildAlterScreenInputs {
  /** JST 壁時計（getHours 等が JST）。時刻ソース一本化 — FAIL 2 対策 */
  jstNow: Date;
  /** adapter.buildAlterDayInput の出力（事実写像のみ・estimates 非含） */
  dayInput: { date: string; input: DayStateBuildInput };
  weather: { condition: WeatherCondition; pop: number } | null;
  hints: AlterScreenHints;
  sleepQuality?: SleepQualityInput;
  moodCode?: ActivityMoodCode;
  corrections: UserCorrection[];
  nightAnswer: AlterNightAnswer | null;
  hydrated: AlterScreenHydrated | null;
}

export interface AlterScreenResult {
  date: string;
  record: DayStateRecordV0;
  nightGrade: NightCheckGradeV0 | null;
  revealForDate: string | null;
  screen: AlterScreenViewModel;
}

export function buildAlterScreen(args: BuildAlterScreenInputs): AlterScreenResult {
  const { date, input: factsInput } = args.dayInput;
  const input = { ...factsInput, weather: args.weather };
  const hydrated = args.hydrated;

  let record: DayStateRecordV0 = buildDayStateRecord({
    ...input,
    sleepQuality: args.sleepQuality,
    moodCode: args.moodCode,
    dailyModeHint: args.hints.dailyModeHint,
    dailyModeHintConfidence: args.hints.dailyModeHintConfidence,
    estimatedWalkLevel: args.hints.estimatedWalkLevel,
  });
  // W4: その日の初回凍結を正本に（facts/estimates 現在値は毎回最新・凍結だけ据え置き — 契約 §3.2）。
  // estimates（band/source の源）は触らないため、補正は estimates 経由で必ず反映される（FAIL 1 検証点）。
  if (hydrated?.frozen) {
    record = { ...record, estimatesFrozen: hydrated.frozen };
  }
  for (const c of args.corrections) {
    record = applyUserCorrection(record, c);
  }

  let nightGrade: NightCheckGradeV0 | null = null;
  if (args.nightAnswer) {
    nightGrade = gradeNightCheck(record, {
      dayFelt: args.nightAnswer.dayFelt,
      answeredAt: args.nightAnswer.answeredAt,
      planVerdict: args.nightAnswer.planVerdict,
    });
    record = {
      ...record,
      nightCheck: {
        answeredAt: args.nightAnswer.answeredAt,
        answeredFor: date,
        dayFelt: args.nightAnswer.dayFelt,
        planVerdict: args.nightAnswer.planVerdict,
        verdicts: nightGrade.verdicts,
      },
      carryOverOut: nightGrade.carryOverOut,
    };
  }

  // FAIL 2: deriveMomentState も JST の nowHHMM（input.nowHHMM = toHHMM(jstNow)）。
  // screenViewModel の now marker（jstMinutesOf）と同一ソース = 時刻分裂なし。
  const moment = deriveMomentState({ nowHHMM: input.nowHHMM, segments: input.segments });
  let vm = buildAlterBatteryViewModel(record, moment, hydrated?.yesterday ?? null, input.segments);
  // Morning Reveal 1 朝 1 回（既読管理は §6.2 で container 層の責務。null は VM 契約の正規状態）
  if (vm.morningReveal && hydrated?.revealAlreadySeen) {
    vm = { ...vm, morningReveal: null };
  }

  return {
    date,
    record,
    nightGrade,
    revealForDate: vm.morningReveal?.forDate ?? null,
    screen: buildScreenViewModel(vm, { nowMinJst: jstMinutesOf(args.jstNow) }),
  };
}
