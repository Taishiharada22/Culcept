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
 *  - 新規 fetch / Supabase read / localStorage 接触ゼロ
 *  - now はこの component が評価して pure 層へ注入（mount 後 + 1 分 tick。SSR mismatch 防止で初期 null）
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
  DayFelt,
  DayStateRecordV0,
  EstimateFieldKey,
  PlanVerdict,
  SleepQualityInput,
  UserCorrection,
} from "@/lib/plan/dayState/dayStateTypes";
import type { ActivityMoodCode } from "@/lib/coalter/activity/intent";
import { buildAlterDayInput, subjectiveDateFor, toHHMM } from "@/lib/plan/alterTab/adapter";
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

  const screen = useMemo(() => {
    if (!now) return null;

    // 主観日キー（00:00-04:59 は前日）で暦日キーの Record / Map を引く — ずれは adapter 関数で吸収
    const subjectiveKey = subjectiveDateFor(now);
    const { date, input } = buildAlterDayInput({
      now,
      graphResult: dayGraphByDate?.[subjectiveKey],
      dayIndicatorVariant: dayIndicatorByIso?.get(subjectiveKey)?.variant,
      anchors,
      shiftSourceIds,
    });

    let record: DayStateRecordV0 = buildDayStateRecord({ ...input, sleepQuality, moodCode });
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
  }, [now, dayGraphByDate, dayIndicatorByIso, anchors, shiftSourceIds, sleepQuality, moodCode, corrections, nightAnswer]);

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
