/**
 * T11-E-B — Travel input provider 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-e-projection-provider-interface-design.md（+ CEO/GPT 修正: realOnly は sources 由来・hand-authored 権限 flag として信用しない）
 *
 * 役割: 「`TravelPlanEngineInput` をどう得るか」を display chain から切り離す provider seam の型。
 *   provider は **input を供給 or 拒否するだけ**（display packet / projection / cues / diagnostics を返さない）。
 *   real input 不在では **fail-closed**（not_ready・input なし）。
 *
 * ★ provenance honest: `realOnly` は `sources` から **派生**（dev_fixture を含めば realOnly=false）。
 *   検証 helper（travel-input-provider.ts）が hand-authored な realOnly 詐称を fail-closed で弾く。
 *
 * 純粋性: 型 + as-const のみ。**DisplayPacketForClient / PlanIntelligenceProjection / CoAlterProjectionCue /
 *   diagnostics / raw engine output 型を含まない**（input までの契約）。
 */

import type { TravelPlanEngineInput } from "./engine-types";
import type { ExtractedSlot } from "./slot-types";
import type { ReadinessPolicy } from "./readiness-types";
import type { FairnessHistoryInput } from "./decision-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 source / prerequisite 語彙
// ─────────────────────────────────────────────────────────────────────────────

export const TRAVEL_INPUT_SOURCE_KINDS = [
  "dev_fixture", //                  決定論 fixture（dev-only）
  "session_slots", //                session 由来 slots
  "user_intake", //                  user intake 由来
  "m2_personalization", //           M2 由来 fit/preference
  "route_weather_place_enriched", // route/weather/place 付与
] as const;
export type TravelInputSourceKind = (typeof TRAVEL_INPUT_SOURCE_KINDS)[number];

export const TRAVEL_INPUT_PREREQUISITES = [
  "fixture_not_allowed", //  production 相当 gate で dev_fixture が拒否された
  "session_slots",
  "user_intake",
  "destination",
  "date_or_range",
  "participants",
  "m2_personalization",
  "route_weather_place",
] as const;
export type TravelInputPrerequisite = (typeof TRAVEL_INPUT_PREREQUISITES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 provenance（出所明示・realOnly は sources 由来）
// ─────────────────────────────────────────────────────────────────────────────

export interface TravelInputProvenance {
  /** input に寄与した source（honest・dev_fixture が混ざれば real でない） */
  sources: TravelInputSourceKind[];
  /** ★ sources 由来であるべき（dev_fixture を含めば false）。検証 helper が詐称を弾く */
  realOnly: boolean;
  /** 0..1（任意・どれだけ揃っているか） */
  completeness?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 gate / result（server-only・client へ serialize しない）
// ─────────────────────────────────────────────────────────────────────────────

/** 呼び出し側が渡す gate（env は route 境界で評価し fixtureAllowed に解決）。 */
export interface TravelInputProviderGate {
  /** dev_fixture provider を許可するか（production 相当は false） */
  fixtureAllowed: boolean;
}

/** ★ TravelPlanEngineInput は private slots/fit/cancelWeather を含み得る＝**server-only**（client へ渡さない）。 */
export interface TravelInputReadyResult {
  status: "ready";
  input: TravelPlanEngineInput;
  provenance: TravelInputProvenance;
}

export interface TravelInputNotReadyResult {
  status: "not_ready";
  /** input は持たない（fail-closed） */
  provenance: TravelInputProvenance;
  /** 非 retracted slot が無い（=「聞く」: 提供させる） */
  missing: TravelInputPrerequisite[];
  /**
   * ★ T11-G1: slot は在るが confirmed-real でない（proposed / 派生のみ / partial）＝「確認させる」。
   *   missing と分離（actionable）。dev fixture provider は使わない（undefined）。
   */
  unconfirmed?: TravelInputPrerequisite[];
}

export type TravelInputResult = TravelInputReadyResult | TravelInputNotReadyResult;

/** provider = gate を受け input を供給 or 拒否するだけ。 */
export type TravelInputProvider = (gate: TravelInputProviderGate) => TravelInputResult;

// ─────────────────────────────────────────────────────────────────────────────
// §4 T11-G1: session/intake provider 入力（server-only・正規化済 slots を受ける）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * server session/intake から組む real input の素材（**抽出/正規化済 slots を受ける**・生会話は受けない）。
 *   - hard 必須（destination_area / date_or_range / participants）は confirmed-real 必須（§ helper）。
 *   - soft 補完（budget/pace/mobility/red_line/soft_preference/time_window）は proposed/派生/private 可。
 *   - ★ TravelPlanEngineInput 同様 server-only（private slot を含み得る・client へ serialize しない）。
 */
export interface TravelIntakeInput {
  /** session 抽出 + slot-normalizer 正規化済（upstream の出力・retracted も含み得る＝provider が除外） */
  slots: ExtractedSlot[];
  /** 参加者（1–2・MVP・unique・非空を helper が検証） */
  participantIds: string[];
  /** 任意・viewer 射影対象（指定時は participantIds に含まれること） */
  viewerId?: string;
  /** 任意・intake で確認した予約意図（provider は derive せず pass-through） */
  policy?: ReadinessPolicy;
  /** 任意・過去の偏り（純 input） */
  fairnessHistory?: FairnessHistoryInput;
}
