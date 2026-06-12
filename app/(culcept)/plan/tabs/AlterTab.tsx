"use client";

/**
 * AlterTab — /plan の ALTER タブ container（W3a 配線）
 *
 * 正本: docs/day-state-w3-execution-plan.md §2 / docs/alter-tab-visual-contract.md
 * 役割: PlanClient の既存データ（dayGraphByDate / dayIndicatorByIso / sources / anchors）を
 *   adapter（lib/plan/alterTab/adapter.ts）で DayStateBuildInput に写像し、pure chain
 *   buildDayStateRecord → deriveMomentState → buildAlterBatteryViewModel → buildScreenViewModel
 *   の出力を AlterTabBody に渡す。
 *
 * W3a の意味論（過大主張しない — 実行計画 §2.3）:
 *  - 保存ゼロ: 補正・睡眠・Night Check 回答は in-memory（リロードで消える）。永続化は W4
 *  - estimatesFrozen はマウント毎に再凍結（表示検証専用。match 率の蓄積は W4 から）
 *  - yesterdayRecord は null 固定（前日レコードは W4 の localStorage 読取から）
 *    → Morning Reveal / recoveryQuality は構造的に非表示・unknown（正直表示）
 *  - now はこの component が評価して pure 層へ注入（mount 後 + 1 分 tick。SSR mismatch 防止で初期 null）
 *
 * W3b（read-only 供給系 — 実行計画 §3）:
 *  - b-1/b-3: GET /api/plan/day-state-hints（bounded read・fail-open）→ dailyModeHint+confidence /
 *    estimatedWalkLevel。失敗時は undefined のまま = W2 の保守的 fallback / unknown 表示
 *  - b-2: weather は既存 weatherService（my-style・Open-Meteo・キー不要）を client 直で流用。
 *    pop は既存 weatherInfoToDaily の規約値（rain 80 / else 10）。失敗時は null = 欠測の正直表示
 */

import { useEffect, useMemo, useState } from "react";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import type { BuildDayGraphResult } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";
import { applyUserCorrection, buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import {
  buildAlterBatteryViewModel,
  NIGHT_CHECK_CHIPS,
  NIGHT_CHECK_FOLLOWUP_CHIPS,
} from "@/lib/plan/dayState/buildAlterBatteryViewModel";
import { gradeNightCheck } from "@/lib/plan/dayState/gradeNightCheck";
import type {
  DailyGuidanceMode,
  DayFelt,
  DayStateRecordV0,
  EstimateFieldKey,
  EstimatedWalkLevel,
  PlanVerdict,
  SleepQualityInput,
  UserCorrection,
  WeatherCondition,
} from "@/lib/plan/dayState/dayStateTypes";
import type { ActivityMoodCode } from "@/lib/coalter/activity/intent";
import { buildAlterDayInput, subjectiveDateFor, toHHMM } from "@/lib/plan/alterTab/adapter";
import { isNightShiftSpan } from "@/lib/plan/dayState/timeOfDay";
// W3b b-2: 既存 weatherService の流用（client-only・Open-Meteo・API キー不要。lib/shared 化は将来課題）
import { fetchWeather, weatherInfoToDaily } from "@/app/(immersive)/my-style/_lib/weatherService";
import {
  AlterTabBody,
  type CorrectionDirection,
  type CorrectionTarget,
  type SleepChoice,
} from "../components/alter/AlterTabBody";
import { buildScreenViewModel, jstNowMinutes } from "../components/alter/screenViewModel";

export interface AlterTabProps {
  anchors: ExternalAnchor[];
  sources: ExternalAnchorSource[];
  dayGraphByDate?: Readonly<Record<string, BuildDayGraphResult>>;
  dayIndicatorByIso?: ReadonlyMap<string, DayIndicatorViewModel>;
}

/** 睡眠シートのチップ語 → SleepQualityInput（型契約の 3 値） */
const SLEEP_CHOICE_TO_QUALITY: Record<SleepChoice, SleepQualityInput> = {
  "よく眠れた": "good",
  "浅い": "shallow",
  "短い": "short",
};

/** 補正シートの対象 → estimates フィールド（3 系統 + 外出耐性。recoveryNeed は対象外 — §3.2） */
const CORRECTION_TARGET_TO_FIELD: Record<CorrectionTarget, EstimateFieldKey> = {
  brain: "focusReserve",
  heart: "emotionalReserve",
  body: "energyLevel",
  outingTolerance: "outingTolerance",
};

/**
 * クイックリプライ → moodCode。意味が一意に対応する 2 件のみ写像し、
 * それ以外は VM に流さない（曖昧な語から状態を捏造しない。表示 ack は AlterTabBody 側）。
 */
const QUICK_REPLY_TO_MOOD: Partial<Record<string, ActivityMoodCode>> = {
  "元気": "energetic",
  "少し疲れた": "tired",
};

/** Night Check 主問チップ → dayFelt（chips は 5→1 の順で定義されている） */
function chipToDayFelt(chip: string): DayFelt | null {
  const idx = NIGHT_CHECK_CHIPS.indexOf(chip);
  if (idx < 0) return null;
  return (5 - idx) as DayFelt;
}

/** followup チップ → planVerdict */
const FOLLOWUP_CHIP_TO_VERDICT: Record<string, PlanVerdict> = {
  [NIGHT_CHECK_FOLLOWUP_CHIPS[0]]: "as_seen",
  [NIGHT_CHECK_FOLLOWUP_CHIPS[1]]: "partial_drift",
  [NIGHT_CHECK_FOLLOWUP_CHIPS[2]]: "major_drift",
};

interface NightAnswerState {
  dayFelt: DayFelt;
  answeredAt: string; // "HH:MM"
  planVerdict?: PlanVerdict;
}

/** W3b b-1/b-3: hints route の応答（fail-open。欠落は undefined = W2 fallback） */
interface DayStateHints {
  dailyModeHint?: DailyGuidanceMode;
  dailyModeHintConfidence?: number;
  estimatedWalkLevel?: EstimatedWalkLevel;
}

const DAILY_MODES: ReadonlyArray<DailyGuidanceMode> = [
  "recover",
  "reset",
  "advance",
  "maintenance",
  "social",
  "explore",
];
const WALK_LEVELS: ReadonlyArray<EstimatedWalkLevel> = ["low", "medium", "high"];

export function AlterTab({ anchors, sources, dayGraphByDate, dayIndicatorByIso }: AlterTabProps) {
  // now は mount 後に確定 + 1 分 tick（SSR hydration mismatch 防止 — PlanClient と同パターン）
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // in-memory 本人入力（W3a: 保存なし。W4 で localStorage へ）
  const [sleepQuality, setSleepQuality] = useState<SleepQualityInput | undefined>(undefined);
  const [moodCode, setMoodCode] = useState<ActivityMoodCode | undefined>(undefined);
  const [corrections, setCorrections] = useState<UserCorrection[]>([]);
  const [nightAnswer, setNightAnswer] = useState<NightAnswerState | null>(null);

  // シフト表取り込み source（image / pdf = SR 経路）の id 集合
  const shiftSourceIds = useMemo(
    () =>
      new Set(
        sources.filter((s) => s.sourceType === "image" || s.sourceType === "pdf").map((s) => s.id),
      ),
    [sources],
  );

  // ── W3b: read-only 供給系 ──
  // b-2 weather（client 直・失敗は欠測のまま = unknown 正直表示）
  const [weather, setWeather] = useState<{ condition: WeatherCondition; pop: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWeather();
        if (!cancelled) {
          setWeather({
            condition: res.weather.condition,
            // pop は record 側で未消費（rain/snow の condition のみが信号）。型上 null の場合は 0
            pop: weatherInfoToDaily(res.weather).pop_max ?? 0,
          });
        }
      } catch {
        // 欠測（weather: null）のまま。outingTolerance 等は unknown 側へ倒れる
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // adapter 入力（hints fetch と screen 構築で共有。estimates を含まない事実写像のみ）
  const dayInput = useMemo(() => {
    if (!now) return null;
    // 主観日キー（00:00-04:59 は前日）で暦日キーの Record / Map を引く — ずれは adapter 関数で吸収
    const subjectiveKey = subjectiveDateFor(now);
    return buildAlterDayInput({
      now,
      graphResult: dayGraphByDate?.[subjectiveKey],
      dayIndicatorVariant: dayIndicatorByIso?.get(subjectiveKey)?.variant,
      anchors,
      shiftSourceIds,
    });
  }, [now, dayGraphByDate, dayIndicatorByIso, anchors, shiftSourceIds]);

  // b-1/b-3 hints（主観日・本人入力が変わった時のみ refetch。1 分 tick では再取得しない）
  const [hints, setHints] = useState<DayStateHints>({});
  const subjectiveDate = dayInput?.date;
  const shiftKind = dayInput?.input.shift.kind;
  const shiftStart = dayInput?.input.shift.startTime;
  const shiftEnd = dayInput?.input.shift.endTime;
  useEffect(() => {
    if (!subjectiveDate) return;
    let cancelled = false;
    const params = new URLSearchParams({ date: subjectiveDate });
    if (moodCode) params.set("mood", moodCode);
    if (sleepQuality) params.set("sleep", sleepQuality);
    if (shiftKind === "work" && isNightShiftSpan(shiftStart, shiftEnd) === true) {
      params.set("nightShift", "1");
    }
    fetch(`/api/plan/day-state-hints?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (cancelled || !j || typeof j !== "object") return;
        const o = j as Record<string, unknown>;
        // 応答値も allowlist 検証（JSON を信用しない）。検証落ちは undefined = fallback
        setHints({
          dailyModeHint: DAILY_MODES.includes(o.dailyModeHint as DailyGuidanceMode)
            ? (o.dailyModeHint as DailyGuidanceMode)
            : undefined,
          dailyModeHintConfidence:
            typeof o.dailyModeHintConfidence === "number" ? o.dailyModeHintConfidence : undefined,
          estimatedWalkLevel: WALK_LEVELS.includes(o.estimatedWalkLevel as EstimatedWalkLevel)
            ? (o.estimatedWalkLevel as EstimatedWalkLevel)
            : undefined,
        });
      })
      .catch(() => {
        // fail-open: hints なしのまま（W2 fallback）
      });
    return () => {
      cancelled = true;
    };
  }, [subjectiveDate, moodCode, sleepQuality, shiftKind, shiftStart, shiftEnd]);

  const screen = useMemo(() => {
    if (!now || !dayInput) return null;

    const { date, input: factsInput } = dayInput;
    const input = { ...factsInput, weather };

    let record: DayStateRecordV0 = buildDayStateRecord({
      ...input,
      sleepQuality,
      moodCode,
      dailyModeHint: hints.dailyModeHint,
      dailyModeHintConfidence: hints.dailyModeHintConfidence,
      estimatedWalkLevel: hints.estimatedWalkLevel,
    });
    for (const c of corrections) {
      record = applyUserCorrection(record, c);
    }
    if (nightAnswer) {
      const grade = gradeNightCheck(record, {
        dayFelt: nightAnswer.dayFelt,
        answeredAt: nightAnswer.answeredAt,
        planVerdict: nightAnswer.planVerdict,
      });
      record = {
        ...record,
        nightCheck: {
          answeredAt: nightAnswer.answeredAt,
          answeredFor: date,
          dayFelt: nightAnswer.dayFelt,
          planVerdict: nightAnswer.planVerdict,
          verdicts: grade.verdicts,
        },
        carryOverOut: grade.carryOverOut,
      };
    }

    const moment = deriveMomentState({ nowHHMM: input.nowHHMM, segments: input.segments });
    // yesterdayRecord = null（W3a: 永続化なし。Morning Reveal は W4 から）
    const vm = buildAlterBatteryViewModel(record, moment, null, input.segments);
    return buildScreenViewModel(vm, { nowMinJst: jstNowMinutes(now) });
  }, [now, dayInput, weather, hints, sleepQuality, moodCode, corrections, nightAnswer]);

  if (!now || !screen) {
    // mount 前の 1 frame のみ（SSR / hydration 安全のための空殻。スピナー演出は不要）
    return <div className="min-h-[200px]" aria-busy="true" />;
  }

  return (
    <AlterTabBody
      screen={screen}
      onSleepInput={(choice) => setSleepQuality(SLEEP_CHOICE_TO_QUALITY[choice])}
      onCorrection={(target: CorrectionTarget, direction: CorrectionDirection) =>
        setCorrections((prev) => [
          ...prev,
          { at: toHHMM(new Date()), field: CORRECTION_TARGET_TO_FIELD[target], direction },
        ])
      }
      onNightCheckAnswer={(chip) => {
        const felt = chipToDayFelt(chip);
        if (felt !== null) {
          setNightAnswer({ dayFelt: felt, answeredAt: toHHMM(new Date()) });
          return;
        }
        const verdict = FOLLOWUP_CHIP_TO_VERDICT[chip];
        if (verdict && nightAnswer) {
          setNightAnswer({ ...nightAnswer, planVerdict: verdict });
        }
      }}
      onQuickReply={(chip) => {
        const mood = QUICK_REPLY_TO_MOOD[chip];
        if (mood) setMoodCode(mood);
      }}
    />
  );
}
