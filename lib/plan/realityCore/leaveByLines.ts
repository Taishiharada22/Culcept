/**
 * leaveByLines — RO-2 D1+D3（2026-06-20）: 二段出発線（recommended/hard）+ wakeAt/prepareAt 派生（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D1/D3・v0.2）
 * 思想（RO-2 §2 mechanismDecision）: 二段化は **既存 buffer-bucket エンジン**で導く（LSAT 分布版は deferred）。
 *   recommended = arrival − (durMin + buffer_large) … 安全側（早い・≈ 既存 departureLineTimestampHHMM 線）
 *   hard        = arrival − (durMin + buffer_floor) … 最終ライン（遅い・buffer_floor=5 分・CEO v0.2）
 *   単調性 buffer_large ≥ buffer_floor ⇒ recommended.time ≤ hard.time を数理保証（RJ0.1 §7）。
 *   wakeAt/prepareAt は recommended ∧ prepTime の **AND ゲート**（ETA 不在時は偽生成しない）。
 *
 * 不変条件:
 *   - **leaveBy（単一 RealityAttribute）は不変**。本 module は別 type LeaveByLinesV0 を新設し ern に optional sibling 追加。
 *   - ETA 入力未供給（arrival/durMin null）→ 全 4 段 value=null・bandGapMin=null・whyUnresolved 先頭=eta_source_missing。
 *   - hard は保証でない: displayPolicy=notActionable + hardReasonCodes=["guarantee_language_forbidden"]。
 *   - prepTime（heuristic ≤0.35）を recommended/hard 生成に流さない（wakeAt/prepareAt のみが prepTime を受ける）。
 *   - IO / RNG / now / Date / DB / write を持たない（arrival/durMin/prepTime は注入）。
 */
import {
  inferredAttribute,
  heuristicAttribute,
  unknownAttribute,
  realityAttributeViolations,
  type RealityAttribute,
} from "./realityAttribute";
import type { LeaveByUnresolvedReason } from "./eventRealityNode";
import { instantMinusMinutes, jstMinuteEpoch, resolveBufferMinutesFromCatalog } from "./leaveByAdapter";

export const LEAVE_BY_LINES_VERSION = 0;

/** hard が保証文言化されるのを抑制する reasonCode（下流 copy 層が断定文に使うのを契約で禁止）。 */
export const GUARANTEE_LANGUAGE_FORBIDDEN = "guarantee_language_forbidden";

export interface LeaveByLinesV0 {
  readonly recommended: RealityAttribute<string>; // 安全側・buffer_large 線
  readonly hard: RealityAttribute<string>; // 最終ライン・buffer_floor 線（保証でない）
  readonly wakeAt: RealityAttribute<string>; // recommended − prepTime（AND ゲート）
  readonly prepareAt: RealityAttribute<string>; // recommended − prep 残量（AND ゲート）
  readonly bandGapMin: number | null; // hard−recommended の機械差分（debugOnly 参考）
  readonly hardReasonCodes: ReadonlyArray<string>; // hard 解決時 ["guarantee_language_forbidden"]
  readonly whyUnresolved: ReadonlyArray<LeaveByUnresolvedReason>; // 既存 3 値再利用
}

export interface BuildLeaveByLinesInputV0 {
  /** canonical JST ISO（"YYYY-MM-DDTHH:MM:SS+09:00"）。ETA 未供給は null。 */
  readonly arrivalTargetInstant: string | null;
  /** ETA duration（分）。未供給は null。 */
  readonly durMin: number | null;
  /** 安全側 buffer（既定 large=30）。 */
  readonly bufferLargeMin?: number;
  /** 最終ライン buffer（既定 5・CEO v0.2・0 は危険側）。 */
  readonly bufferFloorMin?: number;
  /** D2 PrepTimeModel（heuristic ≤0.35）。wakeAt/prepareAt 派生のみに使う。 */
  readonly prepTime: RealityAttribute<number>;
  readonly lineConfidence?: number; // recommended/hard の確信度（既定 0.5・ETA durMin 不確実性ゆえ控えめ）
}

/** ETA 未供給で全段 null の dormant LeaveByLines（捏造しない・honest-null）。 */
export function unresolvedLeaveByLines(reasons?: ReadonlyArray<LeaveByUnresolvedReason>): LeaveByLinesV0 {
  return {
    recommended: unknownAttribute<string>(),
    hard: unknownAttribute<string>(),
    wakeAt: unknownAttribute<string>(),
    prepareAt: unknownAttribute<string>(),
    bandGapMin: null,
    hardReasonCodes: [],
    whyUnresolved: reasons && reasons.length > 0 ? reasons : ["eta_source_missing"],
  };
}

/**
 * buildLeaveByLines — pure。arrival/durMin 双解決時のみ二段を計算し、wakeAt/prepareAt は prepTime と AND。
 *   どれか欠落 → unresolvedLeaveByLines（eta_source_missing）。
 */
export function buildLeaveByLines(input: BuildLeaveByLinesInputV0): LeaveByLinesV0 {
  const { arrivalTargetInstant, durMin } = input;
  if (arrivalTargetInstant === null || durMin === null || !Number.isInteger(durMin) || durMin < 0) {
    return unresolvedLeaveByLines(["eta_source_missing"]);
  }
  const bufLarge = input.bufferLargeMin ?? resolveBufferMinutesFromCatalog("large") ?? 30;
  const bufFloor = input.bufferFloorMin ?? 5; // CEO v0.2
  const conf = input.lineConfidence ?? 0.5;

  const recIso = instantMinusMinutes(arrivalTargetInstant, durMin + bufLarge); // 早い（buffer 多い）
  const hardIso = instantMinusMinutes(arrivalTargetInstant, durMin + bufFloor); // 遅い（buffer 少ない）
  if (recIso === null || hardIso === null) {
    return unresolvedLeaveByLines(["eta_source_missing"]); // domain 外（捏造しない）
  }

  const recommended = inferredAttribute<string>(recIso, conf, ["arrival_target", "buffer_large"], {
    source: "derived",
    status: "inferred",
    displayPolicy: "debugOnly",
  });
  const hard = inferredAttribute<string>(hardIso, conf, ["arrival_target", "buffer_floor"], {
    source: "derived",
    status: "inferred",
    displayPolicy: "notActionable", // 保証文言化を抑制
  });

  // wakeAt / prepareAt = recommended ∧ prepTime の AND ゲート（prep 単独生成禁止）
  let wakeAt: RealityAttribute<string> = unknownAttribute<string>();
  let prepareAt: RealityAttribute<string> = unknownAttribute<string>();
  const prepMin = input.prepTime.value;
  if (prepMin !== null && Number.isInteger(prepMin) && prepMin >= 0) {
    const wakeIso = instantMinusMinutes(recIso, prepMin);
    const prepareIso = instantMinusMinutes(recIso, Math.ceil(prepMin / 2)); // v0: 準備開始 = 中点（昇格閾値は CEO gate）
    const derivedConf = Math.min(conf, input.prepTime.confidence); // 入力下限以下
    if (wakeIso !== null) {
      wakeAt = heuristicAttribute<string>(wakeIso, derivedConf, ["recommended_line", "prep_time"], { displayPolicy: "debugOnly" });
    }
    if (prepareIso !== null) {
      prepareAt = heuristicAttribute<string>(prepareIso, derivedConf, ["recommended_line", "prep_time"], { displayPolicy: "debugOnly" });
    }
  }

  const recEpoch = jstMinuteEpoch(recIso);
  const hardEpoch = jstMinuteEpoch(hardIso);
  const bandGapMin = recEpoch !== null && hardEpoch !== null ? hardEpoch - recEpoch : null;

  return {
    recommended,
    hard,
    wakeAt,
    prepareAt,
    bandGapMin,
    hardReasonCodes: [GUARANTEE_LANGUAGE_FORBIDDEN],
    whyUnresolved: [],
  };
}

/** INV: LeaveByLines の不変条件（空=適合・throw しない）。 */
export function leaveByLinesViolations(lines: LeaveByLinesV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`leaveByLines: ${m}`);

  out.push(...realityAttributeViolations("leaveByLines.recommended", lines.recommended));
  out.push(...realityAttributeViolations("leaveByLines.hard", lines.hard));
  out.push(...realityAttributeViolations("leaveByLines.wakeAt", lines.wakeAt));
  out.push(...realityAttributeViolations("leaveByLines.prepareAt", lines.prepareAt));

  const recResolved = lines.recommended.value !== null;
  const hardResolved = lines.hard.value !== null;

  // recommended と hard は同一 buffer エンジン由来 ＝ 両方 resolved か両方 null
  if (recResolved !== hardResolved) push("recommended と hard の解決状態が不一致（同一エンジン由来のはず）");

  if (recResolved && hardResolved) {
    const recEpoch = jstMinuteEpoch(lines.recommended.value as string);
    const hardEpoch = jstMinuteEpoch(lines.hard.value as string);
    if (recEpoch !== null && hardEpoch !== null && recEpoch > hardEpoch) {
      push(`順序違反: recommended(${recEpoch}) ≤ hard(${hardEpoch}) でない`);
    }
    if (lines.hard.displayPolicy !== "notActionable") push("hard は displayPolicy=notActionable（保証文言抑制）");
    if (!lines.hardReasonCodes.includes(GUARANTEE_LANGUAGE_FORBIDDEN)) push("hard 解決時 hardReasonCodes に guarantee_language_forbidden 必須");
    if (lines.bandGapMin === null || lines.bandGapMin < 0) push(`bandGapMin は解決時 ≥0（got ${String(lines.bandGapMin)}）`);
  } else {
    // dormant: 全段 null・whyUnresolved 非空かつ先頭 eta_source_missing
    if (lines.wakeAt.value !== null || lines.prepareAt.value !== null) push("recommended 未解決なら wakeAt/prepareAt も null（prep 単独生成禁止）");
    if (lines.bandGapMin !== null) push("dormant 時 bandGapMin は null");
    if (lines.whyUnresolved.length === 0 || lines.whyUnresolved[0] !== "eta_source_missing") push("dormant 時 whyUnresolved 先頭=eta_source_missing");
  }

  // wakeAt/prepareAt は recommended 解決を要する（prep 単独生成禁止の二重 guard）
  if (!recResolved && (lines.wakeAt.value !== null || lines.prepareAt.value !== null)) {
    push("wakeAt/prepareAt は recommended.value≠null を要する");
  }
  return out;
}
