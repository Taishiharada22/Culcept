/**
 * シフト確認結果 → /plan 保存入力 変換器（pure）— SR Step 5
 *
 * 確認画面（source-of-truth cell review）でユーザーが承認した projection
 * （ShiftRosterProjection）を、/plan の保存入力に落とす純関数。
 *
 * 二層に分ける（CEO 指示「休みは anchor でない」）:
 *   1. 勤務（timed_event） → CreateExternalAnchorInput（one_off, 時間付き anchor）
 *   2. 休み（day_indicator）/ 希望休（candidate） → ShiftDayImportIndicator（anchor でない日レベル印）
 *   3. unresolved → skipped（保存しない。確認画面で要解決。沈黙させず返す）
 *
 * 不変原則:
 *   - pure（IO なし・LLM なし・副作用なし・時刻参照なし）
 *   - 休みを timed anchor にしない（時間枠を作らない）
 *   - unresolved を黙って捨てない（skipped で返し、import action が保存をブロック/警告）
 *   - sourceType="shift_image" は migration draft 適用（DB CHECK）まで保存不可。
 *     本 module は型レベルの入力生成のみで DB write はしない。
 */

import type {
  CreateExternalAnchorInput,
  CreateOneOffAnchorInput,
} from "@/lib/plan/external-anchor-input";
import type { AnchorRigidity } from "@/lib/plan/external-anchor";
import type {
  ShiftRosterProjection,
  UnresolvedCell,
} from "./shiftRosterProjection";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day-level 印（anchor でない）— SR Step 4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 休み / 希望休 の日レベル印。**anchor ではない**（時間枠を持たない）。
 * /plan ではその日に「休み」「希望休」バッジを出すだけで、タイムラインに枠を作らない。
 *
 * - kind "off"         : 確定した休み（公休 H / BD など）。countsAsPublicHoliday で公休数監査可能。
 * - kind "off_request" : 希望休（HREQ など）。未確定の申請段階 → 控えめ表示。
 */
export interface ShiftDayImportIndicator {
  /** YYYY-MM-DD */
  date: string;
  kind: "off" | "off_request";
  /** 表示ラベル（例「公休」「希望休」） */
  label: string;
  /** 公休カウント対象か（off のみ意味を持つ。off_request は常に false） */
  countsAsPublicHoliday: boolean;
  /** 原稿の表記（監査・逆引き用） */
  rawCode: string;
  semanticType: string;
}

/** 保存できなかったセル（確認画面で要解決） */
export type ShiftImportSkipped = UnresolvedCell;

/** シフト取り込みの保存計画（pure 変換の出力） */
export interface ShiftImportPlan {
  /** 勤務 → one_off anchor 入力（保存対象） */
  anchorInputs: CreateExternalAnchorInput[];
  /** 休み / 希望休 → 日レベル印（anchor でない・保存対象だが別経路） */
  dayIndicators: ShiftDayImportIndicator[];
  /** 未解決セル（保存しない。import action が保存をブロックする根拠） */
  skipped: ShiftImportSkipped[];
}

export interface BuildShiftImportPlanOptions {
  /** 勤務 anchor の rigidity（既定 "hard"：シフトは固定義務） */
  rigidity?: AnchorRigidity;
}

const SHIFT_SOURCE_TYPE = "shift_image" as const;

/**
 * 確認済み projection を /plan 保存計画に変換する（pure）。
 *
 * 勤務の翌日跨ぎ（endsNextDay）は endTime < startTime として表現され、
 * 跨ぎ判定は API 層の責務（CreateExternalAnchorInput の契約どおり）。
 * よって本 module は endTime をそのまま渡し、endsNextDay 専用 field は持たせない。
 */
export function buildShiftImportPlan(
  projection: ShiftRosterProjection,
  options: BuildShiftImportPlanOptions = {}
): ShiftImportPlan {
  const rigidity: AnchorRigidity = options.rigidity ?? "hard";

  const anchorInputs: CreateExternalAnchorInput[] = projection.timedEvents.map(
    (ev): CreateOneOffAnchorInput => ({
      anchorKind: "one_off",
      date: ev.date,
      title: ev.title,
      startTime: ev.startTime,
      ...(ev.endTime ? { endTime: ev.endTime } : {}),
      rigidity,
      sourceType: SHIFT_SOURCE_TYPE,
    })
  );

  const dayIndicators: ShiftDayImportIndicator[] = [
    ...projection.dayIndicators.map(
      (di): ShiftDayImportIndicator => ({
        date: di.date,
        kind: "off",
        label: di.label,
        countsAsPublicHoliday: di.countsAsPublicHoliday,
        rawCode: di.rawCode,
        semanticType: di.semanticType,
      })
    ),
    ...projection.candidates.map(
      (c): ShiftDayImportIndicator => ({
        date: c.date,
        kind: "off_request",
        label: c.label,
        countsAsPublicHoliday: false,
        rawCode: c.rawCode,
        semanticType: c.semanticType,
      })
    ),
  ];

  return {
    anchorInputs,
    dayIndicators,
    skipped: [...projection.unresolved],
  };
}

/**
 * 保存可能か（未解決セルが無いか）。
 * import action はこれが false の間、保存をブロックする想定。
 */
export function isShiftImportReady(plan: ShiftImportPlan): boolean {
  return plan.skipped.length === 0;
}
