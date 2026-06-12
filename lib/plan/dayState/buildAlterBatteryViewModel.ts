/**
 * buildAlterBatteryViewModel — DayStateRecord + MomentState → 表示用 ViewModel（pure）
 *
 * 正本: docs/alter-tab-visual-contract.md §4（Session B はこの出力だけを見る）
 * 規律:
 *  - 正本 VM の文字列に数値（% / 点数 / 確率）を出さない（数値化は表示 derived 層の責務 — visual-contract §0.1 緩和後も VM 層の規律は不変）。visualFill は描画専用。
 *  - N-3 禁止語（おすすめ/これをした方がいい/最適/推奨/改善/警告/危険/注意/リスク）を生成文字列に含めない
 *    （テストで regression 検証）。断定形ではなく観測トーン（〜に見ています / 〜そうです）。
 *  - sleep: source ≠ user_reported なら band は必ず "unknown"。recoveryQuality: 導出源は前夜 Night Check のみ。
 *  - morningReveal: 朝（early_morning/morning）かつ前日 Night Check 回答済みのみ。それ以外は null。
 *    adjustmentNote は B1 解錠前は「記録した」系固定文（反映済み表現は Stage 3 から）。
 *  - 事実由来の時間量（夜の余白 "2.5h"）は表示可（設計書 §4.2 の精密化ルール）。
 */

import type {
  AlterBatteryViewModel,
  Band,
  BatteryZoneVM,
  DayFeasibilityLevel,
  DayFelt,
  DaySegmentLite,
  DayStateEstimates,
  DayStateRecordV0,
  EnergyLevelValue,
  EvidenceTag,
  MomentStateV0,
  OutingToleranceLevel,
  ReserveLevel,
  ConfidentValue,
} from "./dayStateTypes";
import { isMorningRevealBucket } from "./timeOfDay";

// ── Band 写像（visual-contract §4 で凍結） ──
export function energyToBand(v: EnergyLevelValue): Band {
  return v === "depleted" ? "very_low" : v;
}
export function reserveToBand(v: ReserveLevel): Band {
  return v;
}
export function outingToBand(v: OutingToleranceLevel): Band {
  return v;
}
export function feasibilityToBand(v: DayFeasibilityLevel): Band {
  return v === "likely_steady" ? "high" : v === "mixed" ? "medium" : v === "likely_fragile" ? "low" : "unknown";
}
export const DAYFELT_TO_BAND: Record<DayFelt, Band> = { 5: "high", 4: "high", 3: "medium", 2: "low", 1: "very_low" };

// band ↔ visualFill の整合（band=low なのに fill 0.8 等は contract violation — テスト対象）
export const BAND_FILL: Record<Band, number> = {
  very_low: 0.12,
  low: 0.32,
  medium: 0.55,
  high: 0.8,
  unknown: 0,
};

// 帯語（very_low 用の語も確定済み — N-3 適合）
export const BAND_TEXT: Record<Band, string> = {
  very_low: "ほとんど残っていません",
  low: "少なめ",
  medium: "ふつう",
  high: "余裕あり",
  unknown: "読めていません",
};

// EvidenceTag → 表示語（事実語のみ・帯語優先。axis_prior_used は内部専用のため非表示）
const EVIDENCE_LABEL: Partial<Record<EvidenceTag, string>> = {
  shift_night: "夜勤明け",
  shift_work: "勤務日",
  day_off: "休みの日",
  dense_schedule: "予定が密",
  long_travel_chain: "移動が多め",
  low_evening_slack: "夜の余白少なめ",
  large_free_block: "まとまった空きあり",
  weather_rain: "雨・雪",
  weather_heat: "暑さ",
  user_tired_tap: "本人入力",
  user_mood_input: "本人入力",
  user_correction: "本人補正",
  carry_over_debt: "昨日の持ち越し",
};

// 系統ごとの根拠帰属（§9.2-3 の「各系統に根拠チップ併記」— 無関係な根拠を並べない）
const ZONE_EVIDENCE: Record<"body" | "brain" | "heart" | "outing", EvidenceTag[]> = {
  body: ["shift_night", "shift_work", "day_off", "long_travel_chain", "user_tired_tap", "carry_over_debt", "user_correction"],
  brain: ["dense_schedule", "large_free_block", "low_evening_slack", "user_correction"],
  heart: ["user_mood_input", "low_evening_slack", "dense_schedule", "user_correction"],
  outing: ["long_travel_chain", "weather_rain", "weather_heat", "shift_night", "day_off", "user_correction"],
};

function zoneEvidence(tags: EvidenceTag[], zoneKey: keyof typeof ZONE_EVIDENCE, max = 3): string[] {
  return evidenceLabels(tags.filter((t) => ZONE_EVIDENCE[zoneKey].includes(t)), max);
}

function evidenceLabels(tags: EvidenceTag[], max = 3): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const label = EVIDENCE_LABEL[t];
    if (label && !out.includes(label)) out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

function confidenceWord(c: number): BatteryZoneVM["confidence"] {
  return c >= 0.7 ? "high" : c >= 0.4 ? "medium" : "low";
}

function zone(label: string, band: Band, cvSource: ConfidentValue<unknown>, evidence: string[]): BatteryZoneVM {
  return {
    label,
    band,
    visualFill: BAND_FILL[band],
    confidence: confidenceWord(cvSource.confidence),
    source: cvSource.source === "user_confirmed" || cvSource.source === "known_from_user" ? "本人" : "見立て",
    evidence,
    correctable: true,
  };
}

// 表示テキスト固定テーブル
const OUTING_TEXT: Record<Band, string> = {
  very_low: "今日は外出を軽くしたい見立てです",
  low: "軽めなら動けそう",
  medium: "ふつうに動けそうです",
  high: "動きやすそうです",
  unknown: "まだ読めていません",
};

// dayFeasibility は day-level proxy（断定・強い成立保証の文言禁止）
const FEASIBILITY_TEXT: Record<Band, string> = {
  very_low: "今日の流れは崩れやすそうです",
  low: "今日の流れは崩れやすそうです",
  medium: "今日の流れはややゆらぎそうです",
  high: "今日の流れは大きく崩れにくそうです",
  unknown: "まだ読めていません",
};

const SLEEP_TEXT: Record<"good" | "shallow" | "short" | "unknown", string> = {
  good: "よく眠れたようです",
  shallow: "眠りが浅かったようです",
  short: "睡眠が短めだったようです",
  unknown: "まだ読めていません",
};

const ALTER_MESSAGE: Record<string, string> = {
  recover: "今日は回復に寄せて見ています。",
  reset: "今日は整える日に見ています。",
  advance: "今日は進めやすい流れに見ています。",
  maintenance: "今日はいつも通りの流れに見ています。",
  social: "今日は人と過ごす流れに見ています。",
  explore: "今日は広げやすい流れに見ています。",
};

// B1 解錠前の正規形（反映済み表現「今日は上げて見ています」は Stage 3 から）
export const ADJUSTMENT_NOTE_PRE_B1 = "この差は記録しました。反映はもう少し学んでから";

const NIGHT_CHECK_QUESTION = "今日は、最後まで余力がありましたか？";
const NIGHT_CHECK_QUESTION_CARRIED = "きのうは、最後まで余力がありましたか？";
export const NIGHT_CHECK_CHIPS = ["かなり余った", "少し余った", "ちょうど", "足りなかった", "まったく足りなかった"];
export const QUICK_REPLIES = ["元気", "少し疲れた", "眠い", "集中したい", "外出は軽め"];

function formatHours(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return `${h}h`;
}

function yesterdayLoadBand(yesterday: DayStateRecordV0 | null | undefined): Band {
  if (!yesterday) return "unknown";
  const f = yesterday.facts;
  if (f.density === "packed" || (f.travelChainMin ?? 0) >= 120) return "high";
  if (f.density === "sparse") return "low";
  return "medium";
}

function recoveryQualityCard(
  yesterday: DayStateRecordV0 | null | undefined,
): AlterBatteryViewModel["contextCards"]["recoveryQuality"] {
  const debt = yesterday?.nightCheck ? yesterday.carryOverOut?.recoveryDebt : undefined;
  if (debt === undefined) return { label: "回復の質", band: "unknown", source: "unknown" };
  const band: Band = debt === "none" ? "high" : debt === "some" ? "medium" : "low";
  return { label: "回復の質", band, source: "night_check_derived" };
}

function buildMorningReveal(
  moment: MomentStateV0,
  yesterday: DayStateRecordV0 | null | undefined,
): AlterBatteryViewModel["morningReveal"] {
  if (!isMorningRevealBucket(moment.timeBucket)) return null;
  if (!yesterday?.nightCheck) return null;
  const nc = yesterday.nightCheck;
  const items: NonNullable<AlterBatteryViewModel["morningReveal"]>["items"] = [];

  const energyVerdict = nc.verdicts.energyLevel;
  if (energyVerdict !== undefined) {
    items.push({
      label: "からだの余力",
      estimatedBand: energyToBand(yesterday.estimatesFrozen.values.energyLevel.value),
      actualBand: DAYFELT_TO_BAND[nc.dayFelt],
      verdict: energyVerdict,
    });
  }
  const feasibilityVerdict = nc.verdicts.dayFeasibility;
  if (feasibilityVerdict !== undefined) {
    items.push({
      label: "一日の流れ",
      estimatedBand: feasibilityToBand(yesterday.estimatesFrozen.values.dayFeasibility.value),
      actualBand:
        nc.planVerdict === "as_seen" ? "high" : nc.planVerdict === "partial_drift" ? "medium" : "low",
      verdict: feasibilityVerdict,
    });
  }
  if (items.length === 0) return null;
  return { forDate: nc.answeredFor, items, adjustmentNote: ADJUSTMENT_NOTE_PRE_B1 };
}

function nightCheckState(
  record: DayStateRecordV0,
  moment: MomentStateV0,
  yesterday: DayStateRecordV0 | null | undefined,
): AlterBatteryViewModel["nightCheck"] {
  if (record.nightCheck) {
    return { state: "answered", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS };
  }
  if (moment.isNightCheckWindow) {
    return { state: "main", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS };
  }
  if (isMorningRevealBucket(moment.timeBucket) && yesterday && !yesterday.nightCheck) {
    return { state: "carried_over", question: NIGHT_CHECK_QUESTION_CARRIED, chips: NIGHT_CHECK_CHIPS };
  }
  return { state: "hidden", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS };
}

export function buildAlterBatteryViewModel(
  record: DayStateRecordV0,
  moment: MomentStateV0,
  yesterdayRecord?: DayStateRecordV0 | null,
  // record は segment を保持しない（store slow）ため、「今日の流れ」表示用に
  // build/derive と同じ lite segments を呼び出し側が共有する（事実表示のみ・契約注記）
  segments?: DaySegmentLite[],
): AlterBatteryViewModel {
  const e: DayStateEstimates = record.estimates;

  const outingBand = outingToBand(e.outingTolerance.value);
  const feasibilityBand = feasibilityToBand(e.dayFeasibility.value);

  const sleepQuality = record.userInputs.sleepQuality;
  const sleepSource: "user_reported" | "unknown" = sleepQuality !== undefined ? "user_reported" : "unknown";
  // 型縛り: source ≠ user_reported なら band は必ず unknown（偽データ禁止）
  const sleepBand: Band =
    sleepSource === "user_reported" ? (sleepQuality === "good" ? "high" : "low") : "unknown";

  return {
    battery: {
      brain: zone("集中の余力", reserveToBand(e.focusReserve.value), e.focusReserve, zoneEvidence(record.evidence, "brain")),
      heart: zone("心の余力", reserveToBand(e.emotionalReserve.value), e.emotionalReserve, zoneEvidence(record.evidence, "heart")),
      body: zone("からだの余力", energyToBand(e.energyLevel.value), e.energyLevel, zoneEvidence(record.evidence, "body")),
    },
    contextCards: {
      outingTolerance: {
        label: "外出耐性",
        band: outingBand,
        text: OUTING_TEXT[outingBand],
        evidence: zoneEvidence(record.evidence, "outing"),
        correctable: true,
      },
      eveningSlack: {
        label: "夜の余白",
        text:
          record.facts.eveningSlackMin > 0
            ? `${formatHours(record.facts.eveningSlackMin)} 確保できそう`
            : "夜の余白は少なめです",
        evidence: evidenceLabels(record.evidence.filter((t) => t === "low_evening_slack"), 1),
      },
      sleep: { label: "睡眠", band: sleepBand, text: SLEEP_TEXT[sleepQuality ?? "unknown"], source: sleepSource, correctable: true },
      yesterdayLoad: { label: "昨日の負荷", band: yesterdayLoadBand(yesterdayRecord) },
      recoveryQuality: recoveryQualityCard(yesterdayRecord),
      carryOver: {
        label: "明日への持ち越し",
        band:
          record.carryOverOut === undefined
            ? "unknown"
            : record.carryOverOut.recoveryDebt === "none"
              ? "low"
              : record.carryOverOut.recoveryDebt === "some"
                ? "medium"
                : "high",
      },
      feasibility: { label: "今日の成立見込み", band: feasibilityBand, text: FEASIBILITY_TEXT[feasibilityBand] },
    },
    flowTimeline: { segments: buildFlowSegments(moment, segments) },
    morningReveal: buildMorningReveal(moment, yesterdayRecord),
    alterMessage:
      e.dailyMode.value === "recover" && record.facts.eveningSlackMin > 0
        ? `${ALTER_MESSAGE.recover}夜の余白を残せそうです。`
        : (ALTER_MESSAGE[e.dailyMode.value] ?? "今日を見ています。"),
    quickReplies: QUICK_REPLIES,
    nightCheck: nightCheckState(record, moment, yesterdayRecord),
  };
}

// flowTimeline は事実表示のみ（予測曲線なし）。segments 未提供時は nowSegment のみの最小表示。
function buildFlowSegments(
  moment: MomentStateV0,
  segments?: DaySegmentLite[],
): AlterBatteryViewModel["flowTimeline"]["segments"] {
  if (segments && segments.length > 0) {
    return segments.map((s) => ({
      kind: s.kind,
      startHHMM: s.startHHMM,
      endHHMM: s.endHHMM,
      label: s.label,
      isEveningSlack: s.kind === "gap" && (s.timeBucket === "evening" || s.timeBucket === "night") ? true : undefined,
    }));
  }
  if (!moment.nowSegment) return [];
  return [
    {
      kind: moment.nowSegment.kind,
      startHHMM: moment.nowSegment.startHHMM,
      endHHMM: moment.nowSegment.endHHMM,
    },
  ];
}
