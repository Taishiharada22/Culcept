/**
 * Reality Control OS — A1-5-4c-0/1 Structured Capture Intake Guard（pure・fail-closed・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.22
 *
 * 役割: **(将来の)extractor（LLM/parse）と capture mapper（A1-5-4a captureToDrafts）の間の境界**。
 *   extractor の **structured 出力（untrusted）** を検証して `StructuredCaptureInput` に変換する純関数。
 *   raw 発話 / prompt / LLM 生出力が DB / Complete path に入らない **最後の防壁**。
 *
 * capture intake boundary（A1-5-4c-0）:
 *   [raw 発話] --(extractor: LLM/parse・**別段階・未接続**)--> [ExtractorStructuredOutput（structured・untrusted）]
 *     --(本 guard・pure・**fail-closed**)--> [StructuredCaptureInput] --(captureToDrafts A1-5-4a)--> [draft] --> ...
 *
 * 厳守:
 *   - **fail-closed**: raw field（signal/desiredAction/desired_action/raw_text/title/location/prompt/transcript）が
 *     1 つでも在れば **reject**（strip でない）。不正な structured 値も reject。
 *   - **seedId / userId / capturedAt は caller/server 注入**（extractor 由来でない・guard は引数を使用）。
 *   - source_ref は **opaque のみ許可**（短い id 形・長文/空白/raw を reject）。
 *   - explicitDuration は **1 < durationMin <= 1440**（enrich `isValidEvidenceDuration` 再利用）かつ confidence ∈ {high,low}。
 *     low は下流 mapper で evidence 化されない（本層は通すだけ）。
 *   - **raw parse / LLM / DB / runtime なし**（pure validation）。server-only 不要・barrel 非 export。
 */

import type { StructuredCaptureInput } from "./seed-capture-mapper";
import type { PlanSeedTimeHint, PlanSeedSource } from "../plan-seed";
import type { ActionShape } from "../../stargazer/alterHomeAdapter";
import { isValidEvidenceDuration, type DurationConfidence } from "./seed-placement-enrich";

/** extractor が出すべき **structured 出力**（raw を含まない・guard は untrusted として検証）。 */
export interface ExtractorStructuredOutput {
  readonly desiredDate?: string;
  readonly desiredTimeHint?: string;
  readonly actionShape?: string;
  readonly confidence: number;
  readonly source: string;
  readonly sourceRef?: string;
  readonly explicitDuration?: { readonly durationMin: number; readonly confidence: string };
}

/** intake が遮断する raw field（fail-closed reject 対象）。 */
export const FORBIDDEN_INTAKE_FIELDS = [
  "signal",
  "desiredAction",
  "desired_action",
  "raw_text",
  "title",
  "location",
  "prompt",
  "transcript",
] as const;

export type IntakeRejectReason =
  | "not_object"
  | "raw_field_present"
  | "invalid_date"
  | "invalid_time_hint"
  | "invalid_action_shape"
  | "invalid_confidence"
  | "invalid_source"
  | "source_ref_not_opaque"
  | "invalid_explicit_duration"
  | "invalid_explicit_confidence";

export type IntakeResult =
  | { readonly ok: true; readonly input: StructuredCaptureInput }
  | { readonly ok: false; readonly reason: IntakeRejectReason; readonly field?: string };

// 型付き valid-set（tsc が各値を PlanSeedTimeHint/PlanSeedSource/ActionShape/DurationConfidence と照合）
const VALID_TIME_HINTS: readonly PlanSeedTimeHint[] = ["morning", "afternoon", "evening", "anytime"];
const VALID_SOURCES: readonly PlanSeedSource[] = ["chat", "manual"];
const VALID_ACTION_SHAPES: readonly ActionShape[] = [
  "full_go", "bounded_go", "prepare_then_go", "trial_then_decide",
  "observe_first", "delegate_or_request", "defer_with_trigger", "skip",
];
const VALID_DURATION_CONFIDENCE: readonly DurationConfidence[] = ["high", "low"];

/**
 * opaque source_ref: **id 形のみ**（英数 + _ : . -・1..64）。空白/改行/unicode/raw 長文を reject。
 * 64 上限は「rawっぽい長文」を弾く（UUID=36 等の正当 id は通る）。adversarial probe(A1-5-4c-1)で 128→64 に tighten。
 * ＋ defense-in-depth: source_ref は read seam allowed columns / Complete projection から **firewall 済**（保護 path に到達しない）。
 */
const SOURCE_REF_OPAQUE = /^[A-Za-z0-9_:.\-]{1,64}$/;

/** YYYY-MM-DD かつ実在日（2026-13-45 / 2026-02-30 等を reject）。deterministic（Date.UTC のみ・clock 非依存）。 */
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * A1-5-4c-1: extractor structured 出力（untrusted）→ `StructuredCaptureInput`（**fail-closed**）。
 *   seedId / userId / capturedAt は caller/server 注入（引数）。extracted は検証のみ（raw key があれば reject）。
 *   全 validation を通れば ok。1 つでも違反すれば reason 付きで reject（strip しない）。
 */
export function buildStructuredCaptureInput(
  seedId: string,
  userId: string,
  capturedAt: string,
  extracted: unknown
): IntakeResult {
  if (typeof extracted !== "object" || extracted === null) return { ok: false, reason: "not_object" };
  const e = extracted as Record<string, unknown>;

  // fail-closed: raw field が 1 つでも在れば reject
  for (const f of FORBIDDEN_INTAKE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(e, f)) return { ok: false, reason: "raw_field_present", field: f };
  }

  // confidence（必須・0..1・有限）
  if (typeof e.confidence !== "number" || !Number.isFinite(e.confidence) || e.confidence < 0 || e.confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }
  // source（必須・chat/manual）
  if (typeof e.source !== "string" || !VALID_SOURCES.includes(e.source as PlanSeedSource)) {
    return { ok: false, reason: "invalid_source" };
  }
  // desiredDate（任意・YYYY-MM-DD 実在日）
  if (e.desiredDate !== undefined && (typeof e.desiredDate !== "string" || !isValidYmd(e.desiredDate))) {
    return { ok: false, reason: "invalid_date" };
  }
  // desiredTimeHint（任意）
  if (e.desiredTimeHint !== undefined && (typeof e.desiredTimeHint !== "string" || !VALID_TIME_HINTS.includes(e.desiredTimeHint as PlanSeedTimeHint))) {
    return { ok: false, reason: "invalid_time_hint" };
  }
  // actionShape（任意・8 値）
  if (e.actionShape !== undefined && (typeof e.actionShape !== "string" || !VALID_ACTION_SHAPES.includes(e.actionShape as ActionShape))) {
    return { ok: false, reason: "invalid_action_shape" };
  }
  // sourceRef（任意・opaque id 形のみ）
  if (e.sourceRef !== undefined && (typeof e.sourceRef !== "string" || !SOURCE_REF_OPAQUE.test(e.sourceRef))) {
    return { ok: false, reason: "source_ref_not_opaque" };
  }
  // explicitDuration（任意・range + confidence enum）
  let explicitDuration: { readonly durationMin: number; readonly confidence: DurationConfidence } | undefined;
  if (e.explicitDuration !== undefined) {
    const ed = e.explicitDuration;
    if (typeof ed !== "object" || ed === null) return { ok: false, reason: "invalid_explicit_duration" };
    const d = (ed as Record<string, unknown>).durationMin;
    const c = (ed as Record<string, unknown>).confidence;
    if (typeof d !== "number" || !isValidEvidenceDuration(d)) return { ok: false, reason: "invalid_explicit_duration" };
    if (typeof c !== "string" || !VALID_DURATION_CONFIDENCE.includes(c as DurationConfidence)) return { ok: false, reason: "invalid_explicit_confidence" };
    explicitDuration = { durationMin: d, confidence: c as DurationConfidence };
  }

  const input: StructuredCaptureInput = {
    seedId,
    userId,
    confidence: e.confidence,
    source: e.source as PlanSeedSource,
    capturedAt,
    desiredDate: e.desiredDate as string | undefined,
    desiredTimeHint: e.desiredTimeHint as PlanSeedTimeHint | undefined,
    actionShape: e.actionShape as ActionShape | undefined,
    sourceRef: e.sourceRef as string | undefined,
    explicitDuration,
  };
  return { ok: true, input };
}
