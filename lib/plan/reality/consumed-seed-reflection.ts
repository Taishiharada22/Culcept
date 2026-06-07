/**
 * Reality Control OS — A1-6-5b Consumed Seed → DraftPlan Reflection（**pure・no-DB・no-raw**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.7
 *
 * 役割: **consumed**（accept された）seed を **確定 plan item** として DraftPlan computation に反映するための **pure transform**。
 *   A1-6-5a で accept = status→consumed のみに修正済。reflection（consumed seed が plan に現れること）は **read/computation 側**の責務。
 *   本 module は live read（status='consumed' の column-restricted read）から渡された **display-relevant 値**（seedRef/raw を持たない）を
 *   plan item に変換する pure 部のみ。実 read / DraftPlan 注入 / DB write は **別 slice（live）**。
 *
 *   **二層モデル**（active と consumed の分離）:
 *     - **active seed** → candidate surface（A1-5・「候補があります」）。本 module は触らない（active は引き続き surface 側）。
 *     - **consumed seed** → **確定 plan item**（本 module）。user が accept した intent ゆえ candidate より committed。
 *
 *   **generateComplete を使わない判断**: generateComplete（A1-4・gap-fitting）は full day context（existing nodes/gaps/bandBounds）= live read が必要で
 *     pure にならず、governance も proposed/tentative（候補用）で確定 item に不適。→ **consumed 専用 builder** で band 既定配置 + 確定。
 *     gap-fitting（既存 node との衝突回避）は live computation の後段 refinement に分離（本 pure base は band 既定）。
 *
 * 厳守:
 *   - **raw 発話なしで成立**: 入力は column-restricted（duration/date/band/actionShape）のみ。**raw / source_ref / seedRef を入力にも出力にも持たない**。
 *   - **generic label は過度に断定しない**: 構造（band + duration + 非断定のコミットメント修飾）のみ。活動内容を assert しない。
 *   - **consumed のみ plan item 化**: `isConsumedReflectable` で status='consumed' ∧ duration>0 のみ通す（active/expired/rejected を誤って item 化しない・fail-closed）。
 *   - pure・no-DB・barrel 非 export。id は付与しない（live computation が seedRef を server-side で紐付け・display item には出さない）。
 */

import type { PlanSeedStatus } from "../plan-seed";
import type { TimeBand } from "./seed-placement";
import type { ActionShape } from "../../stargazer/alterHomeAdapter";

/** 1 日の分（24h）。band 既定配置の clamp 上限。 */
const MAX_DAY_MIN = 24 * 60;

/**
 * consumed seed の reflect 入力（**display-relevant・column-restricted**・**raw / seedRef を持たない**）。
 *   live reader（status='consumed' の column-restricted read）が seedRef を落として渡す。
 */
export interface ConsumedSeedReflectInput {
  /** seed status。**consumed のみ** reflect（guard）。 */
  readonly status: PlanSeedStatus;
  /** 所要時間（分）。確定 item には >0 必須（null/0 は reflect しない）。 */
  readonly durationMin: number | null;
  /** 希望日（YYYY-MM-DD / undated null）。 */
  readonly date: string | null;
  /** 希望時間帯（morning/afternoon/evening / anytime は null）。 */
  readonly band: TimeBand | null;
  /** 判断の形（任意・label の**非断定**コミットメント修飾に使う・活動内容は断定しない）。 */
  readonly actionShape?: ActionShape | null;
}

/** consumed seed → **確定 plan item**（**display-safe**・**seedRef / raw / source_ref を持たない**）。 */
export interface ConsumedPlanItem {
  /** generic・非断定 label（raw 不使用・例「午後の予定（60分）」）。 */
  readonly label: string;
  /** 開始（分・band 既定。live が PRM / gap-fit で override 可）。 */
  readonly startMin: number;
  /** 終了（分・start + duration を MAX_DAY_MIN で clamp）。 */
  readonly endMin: number;
  /** 希望日（YYYY-MM-DD / null）。 */
  readonly date: string | null;
  /** 時間帯（display 用・null=anytime）。 */
  readonly band: TimeBand | null;
  /** **確定**（consumed=user accepted）。candidate（提案）と区別する flag。 */
  readonly confirmed: true;
}

/**
 * A1-6-5b: reflect 可能か（**fail-closed**）。**status='consumed' ∧ duration>0** のみ true。
 *   active（候補・surface 側）/ expired / rejected / duration 無 → false（誤って plan item 化しない）。
 */
export function isConsumedReflectable(input: ConsumedSeedReflectInput): boolean {
  return input.status === "consumed" && input.durationMin !== null && input.durationMin > 0;
}

/**
 * band → **既定開始（分）**。**pure default**（live computation が PRM / active window で override 可能）。
 *   anytime/null は正午（720）既定。
 */
export function bandDefaultStartMin(band: TimeBand | null): number {
  switch (band) {
    case "morning":
      return 9 * 60; // 09:00
    case "afternoon":
      return 13 * 60; // 13:00
    case "evening":
      return 18 * 60; // 18:00
    default:
      return 12 * 60; // anytime/null → 正午
  }
}

/** band の表示名（anytime/null は空文字）。 */
function bandLabel(band: TimeBand | null): string {
  switch (band) {
    case "morning":
      return "午前";
    case "afternoon":
      return "午後";
    case "evening":
      return "夜";
    default:
      return "";
  }
}

/**
 * actionShape → **非断定のコミットメント修飾**（活動内容は断定しない・大半は修飾なし）。
 *   approach（短め/お試し/準備して）のみ表す。full_go/observe_first/delegate_or_request/defer_with_trigger/skip/未指定 → 修飾なし。
 */
function commitmentQualifier(shape: ActionShape | null | undefined): string {
  switch (shape) {
    case "bounded_go":
      return "・短め";
    case "trial_then_decide":
      return "・お試し";
    case "prepare_then_go":
      return "・準備して";
    default:
      return "";
  }
}

/**
 * A1-6-5b: consumed seed → **generic plan label**（**raw 不使用・活動内容を断定しない**・pure）。
 *   構造（band + duration + 任意の非断定コミットメント）のみ。例「午後の予定（60分）」「予定（60分・お試し）」。
 */
export function buildGenericPlanLabel(input: ConsumedSeedReflectInput): string {
  const band = bandLabel(input.band);
  const base = band ? `${band}の予定` : "予定";
  return `${base}（${input.durationMin}分${commitmentQualifier(input.actionShape)}）`;
}

/**
 * A1-6-5b: consumed seed → **確定 plan item**（pure・display-safe・**guard 付き**）。
 *   reflect 不可（非 consumed / duration 無）→ **null**（active/expired/rejected を誤って item 化しない）。
 *   placement は band 既定（live computation が PRM / gap-fit で override 可）。**seedRef / raw を出さない**。
 */
export function consumedSeedToPlanItem(input: ConsumedSeedReflectInput): ConsumedPlanItem | null {
  if (!isConsumedReflectable(input)) return null;
  const durationMin = input.durationMin as number; // reflectable ゆえ >0
  const startMin = bandDefaultStartMin(input.band);
  const endMin = Math.min(startMin + durationMin, MAX_DAY_MIN);
  return {
    label: buildGenericPlanLabel(input),
    startMin,
    endMin,
    date: input.date ?? null,
    band: input.band,
    confirmed: true,
  };
}

/**
 * A1-6-5b: consumed seeds → **確定 plan items**（**consumed のみ**・active/expired/rejected/duration 無を除外）。
 *   live computation が DraftPlan に merge する前段の pure projection。順序は入力順を保つ。
 */
export function selectConsumedPlanItems(
  inputs: readonly ConsumedSeedReflectInput[]
): readonly ConsumedPlanItem[] {
  return inputs.map(consumedSeedToPlanItem).filter((x): x is ConsumedPlanItem => x !== null);
}
