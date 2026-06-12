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
 *
 * W4（localStorage dogfood — 契約 §6.2 Stage 1。storageEnabled prop で gate・既定 OFF）:
 *  - 3 キーのみ: plan_day_state_v0 / plan_night_check_v0 / plan_morning_reveal_v0（DB/Supabase write なし）
 *  - 凍結の正本化: その日の初回凍結（stored estimatesFrozen）を再マウント後も維持
 *    （W3a の「マウント毎再凍結」を廃止 — 採点の前提が成立する）
 *  - 本人入力（mood/sleep/補正/Night Check 回答）は復元・保存。record と Night Check は同時運用（契約注意点 (i)）
 *  - 前日 record の localStorage 読取で Morning Reveal / recoveryQuality / carried_over が実データ駆動に。
 *    Reveal は 1 朝 1 回（既読キーで再マウント時に非表示。表示中マウントでは出続ける）
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import type { BuildDayGraphResult } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";
import {
  NIGHT_CHECK_CHIPS,
  NIGHT_CHECK_FOLLOWUP_CHIPS,
} from "@/lib/plan/dayState/buildAlterBatteryViewModel";
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
import { buildAlterDayInput, subjectiveDateFor, toHHMM, toJstWallClock } from "@/lib/plan/alterTab/adapter";
import { buildAlterScreen } from "./buildAlterScreen";
import { addDaysIso } from "@/lib/plan/alterTab/dayStateHints";
import {
  getBrowserStorage,
  isRevealSeen,
  loadDayStateDays,
  markRevealSeen,
  saveDayStateRecord,
  saveNightCheck,
} from "@/lib/plan/alterTab/dayStateStorage";
import { isNightShiftSpan } from "@/lib/plan/dayState/timeOfDay";
// W3b b-2: 既存 weatherService の流用（client-only・Open-Meteo・API キー不要。lib/shared 化は将来課題）
import { fetchWeather, weatherInfoToDaily } from "@/app/(immersive)/my-style/_lib/weatherService";
import {
  AlterTabBody,
  type CorrectionDirection,
  type CorrectionTarget,
  type SleepChoice,
} from "../components/alter/AlterTabBody";

export interface AlterTabProps {
  anchors: ExternalAnchor[];
  sources: ExternalAnchorSource[];
  dayGraphByDate?: Readonly<Record<string, BuildDayGraphResult>>;
  dayIndicatorByIso?: ReadonlyMap<string, DayIndicatorViewModel>;
  /**
   * W4: localStorage 永続化（plan_day_state_v0 系 3 キー）を有効にするか。
   * server flag（PLAN_FLAGS.dayStateStorageEnabled）を page.tsx → PlanClient 経由で受領。
   * false（既定）= W3a/b と同じ in-memory のみ（保存ゼロ）。
   */
  storageEnabled?: boolean;
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

/** W4 hydration の結果（その日の保存済み状態のスナップショット） */
interface StorageHydration {
  date: string;
  /** その日の初回凍結（保存済みがあればそれが正本） */
  frozen: DayStateRecordV0["estimatesFrozen"] | null;
  /** 前日 record（Morning Reveal / recoveryQuality / carried_over 用） */
  yesterday: DayStateRecordV0 | null;
  /** Reveal が過去マウントで表示済みか（1 朝 1 回） */
  revealAlreadySeen: boolean;
}

export function AlterTab({
  anchors,
  sources,
  dayGraphByDate,
  dayIndicatorByIso,
  storageEnabled = false,
}: AlterTabProps) {
  // now は mount 後に確定 + 1 分 tick（SSR hydration mismatch 防止 — PlanClient と同パターン）
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // FAIL 2 対策: タブ内の「今」は JST 壁時計に一本化（ブラウザ TZ 非依存。
  // チャート now marker = jstNowMinutes と同一ソースにし、timeBucket / 主観日の分裂を防ぐ）
  const jstNow = useMemo(() => (now ? toJstWallClock(now) : null), [now]);

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
  // now ではなく jstNow を注入 → toHHMM / subjectiveDateFor が JST 評価（FAIL 2）。
  const dayInput = useMemo(() => {
    if (!jstNow) return null;
    // 主観日キー（00:00-04:59 JST は前日）で暦日キーの Record / Map を引く — ずれは adapter 関数で吸収
    const subjectiveKey = subjectiveDateFor(jstNow);
    return buildAlterDayInput({
      now: jstNow,
      graphResult: dayGraphByDate?.[subjectiveKey],
      dayIndicatorVariant: dayIndicatorByIso?.get(subjectiveKey)?.variant,
      anchors,
      shiftSourceIds,
    });
  }, [jstNow, dayGraphByDate, dayIndicatorByIso, anchors, shiftSourceIds]);

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

  // W5: 入力スリット送信のセッション束ね（マウント単位・lazy 生成）
  const planSessionIdRef = useRef<string | null>(null);

  // ── 主観日跨ぎ（05:00）のリセット: 開きっぱなしで日付が変わったら前日の本人入力を
  //    新しい日の record に持ち越さない（hydration より先に宣言 = 同一 flush 内で reset → 復元の順） ──
  const prevDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!subjectiveDate) return;
    if (prevDateRef.current !== null && prevDateRef.current !== subjectiveDate) {
      setSleepQuality(undefined);
      setMoodCode(undefined);
      setCorrections([]);
      setNightAnswer(null);
    }
    prevDateRef.current = subjectiveDate;
  }, [subjectiveDate]);

  // ── W4: localStorage hydration（storageEnabled 時のみ。日替わりで再実行） ──
  const [hydration, setHydration] = useState<StorageHydration | null>(null);
  useEffect(() => {
    if (!storageEnabled || !subjectiveDate) return;
    const storage = getBrowserStorage();
    if (!storage) {
      setHydration({ date: subjectiveDate, frozen: null, yesterday: null, revealAlreadySeen: false });
      return;
    }
    const days = loadDayStateDays(storage, subjectiveDate);
    const stored = days[subjectiveDate];
    const yesterdayIso = addDaysIso(subjectiveDate, -1);
    if (stored) {
      // 本人入力の復元（同日内の再マウントで入力が消えない）
      if (stored.userInputs.moodCode) setMoodCode(stored.userInputs.moodCode);
      if (stored.userInputs.sleepQuality) setSleepQuality(stored.userInputs.sleepQuality);
      if (stored.userInputs.corrections.length > 0) setCorrections(stored.userInputs.corrections);
      // answeredFor が当日と一致する回答のみ復元（壊れたデータ・将来の繰り越し回答を当日に混ぜない）
      if (stored.nightCheck && stored.nightCheck.answeredFor === subjectiveDate) {
        setNightAnswer({
          dayFelt: stored.nightCheck.dayFelt,
          answeredAt: stored.nightCheck.answeredAt,
          planVerdict: stored.nightCheck.planVerdict,
        });
      }
    }
    setHydration({
      date: subjectiveDate,
      frozen: stored?.estimatesFrozen ?? null,
      yesterday: days[yesterdayIso] ?? null,
      revealAlreadySeen: isRevealSeen(storage, yesterdayIso),
    });
  }, [storageEnabled, subjectiveDate]);

  const built = useMemo(() => {
    if (!jstNow || !dayInput) return null;
    const hydrated = storageEnabled && hydration?.date === dayInput.date ? hydration : null;
    return buildAlterScreen({
      jstNow,
      dayInput,
      weather,
      hints,
      sleepQuality,
      moodCode,
      corrections,
      nightAnswer,
      hydrated: hydrated
        ? { frozen: hydrated.frozen, yesterday: hydrated.yesterday, revealAlreadySeen: hydrated.revealAlreadySeen }
        : null,
    });
  }, [jstNow, dayInput, weather, hints, sleepQuality, moodCode, corrections, nightAnswer, storageEnabled, hydration]);

  // ── W4: 永続化（record + Night Check 同時 — 契約注意点 (i)。hydration 完了前は書かない） ──
  useEffect(() => {
    if (!storageEnabled || !built || hydration?.date !== built.date) return;
    const storage = getBrowserStorage();
    if (!storage) return;
    saveDayStateRecord(storage, built.record, built.date);
    if (built.nightGrade && nightAnswer) {
      saveNightCheck(
        storage,
        {
          answeredAt: nightAnswer.answeredAt,
          answeredFor: built.date,
          dayFelt: nightAnswer.dayFelt,
          planVerdict: nightAnswer.planVerdict,
          grade: built.nightGrade,
        },
        built.date,
      );
    }
  }, [storageEnabled, built, hydration, nightAnswer]);

  // ── W4: Morning Reveal 既読記録（表示された朝に 1 回だけ書く） ──
  useEffect(() => {
    if (!storageEnabled || !built?.revealForDate || hydration?.date !== built.date) return;
    const storage = getBrowserStorage();
    if (!storage) return;
    if (!isRevealSeen(storage, built.revealForDate)) {
      markRevealSeen(storage, built.revealForDate, new Date().toISOString(), built.date);
    }
  }, [storageEnabled, built, hydration]);

  const screen = built?.screen ?? null;

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
          // 補正時刻も JST 壁時計（採点・lateNightEnd 判定が deriveMomentState と同一ソース）
          { at: toHHMM(toJstWallClock(new Date())), field: CORRECTION_TARGET_TO_FIELD[target], direction },
        ])
      }
      onNightCheckAnswer={(chip) => {
        const felt = chipToDayFelt(chip);
        if (felt !== null) {
          setNightAnswer({ dayFelt: felt, answeredAt: toHHMM(toJstWallClock(new Date())) });
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
      onSend={(message) => {
        // W5: 状態入力スリット → 既存 alter route へ source:"plan" で送信（入口確認まで）。
        // 会話展開・返答表示は行わない（会話→構造抽出は Stage 1.5 の別契約 — センサー未完）。
        // 表示は AlterTabBody の ack「受け取りました」のみ。失敗は silent（fire-and-forget）。
        // sessionId はマウント単位（同一タブ滞在中の複数送信を 1 セッションに束ねる。
        // 未対応環境では省略 = route 側が UUID を生成する既存挙動）
        const text = message.trim();
        if (!text) return;
        if (!planSessionIdRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
          planSessionIdRef.current = crypto.randomUUID();
        }
        void fetch("/api/stargazer/alter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            source: "plan",
            ...(planSessionIdRef.current ? { sessionId: planSessionIdRef.current } : {}),
          }),
        }).catch(() => {});
      }}
    />
  );
}
