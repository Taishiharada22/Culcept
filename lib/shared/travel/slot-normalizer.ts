/**
 * T2C — Travel slot 決定論 normalizer（**pure・門番**・未配線）
 *
 * 設計: docs/t2-intent-slot-extraction-design.md §5（決定論境界の赤線）
 *
 * 役割: 抽出器（将来は LLM・現在は fake extractor）が出した raw/proposed スロットを、
 * **T1B helpers を門番**にして検証・正規化し、TravelCore 互換のクリーンな ExtractedSlot に
 * 落とす。不正は **fail-closed で reject**。LLM・I/O・solver は一切含まない。
 *
 * 厳守（純・決定論）:
 *   - LLM / fetch / DB / process.env / Date.now / Math.random なし。
 *   - import は core-types / core-helpers / slot-types のみ（**personalization/M2 非依存**）。
 *   - EngineOnly 等の **独自 symbol ブランド付きオブジェクトは「非 plain」として拒否**
 *     （personalization を import せず、`Object.getOwnPropertySymbols` で汎用検出）。
 *   - excess/unknown フィールドは **再構築で除去**（TS が弾けない excess を runtime で strip）。
 *   - evidence は参照のみに再構築（本文・provider・source kind が混入しても落とす）。
 *   - 冪等: normalize(normalize(x)) == normalize(x)。
 */

import { PACE_VALUES, type ConstraintOwner, type Pace } from "./core-types";
import {
  isValidBudgetBand,
  isValidMinuteOfDay,
  isValidPlanWindow,
  normalizeBudgetBand,
} from "./core-helpers";
import {
  DESCRIPTOR_KEYS,
  EXTRACTION_SURFACES,
  MISSING_SLOT_PRIORITIES,
  SLOT_FILL_STATES,
  SLOT_STATUSES,
  TRAVEL_SLOT_KEYS,
  type EvidenceRef,
  type ExtractedSlot,
  type ExtractedSlotSet,
  type ExtractionSurface,
  type MissingSlotQuestion,
  type SlotValue,
  type TravelSlotKey,
} from "./slot-types";

// ─────────────────────────────────────────────────────────────────────────────
// 結果型
// ─────────────────────────────────────────────────────────────────────────────

export type NormalizeRejectReason =
  | "not_object"
  | "unknown_slot_key"
  | "invalid_status"
  | "invalid_fill_state"
  | "invalid_owner"
  | "invalid_visibility"
  | "incoherent_visibility"
  | "invalid_evidence"
  | "invalid_budget"
  | "invalid_window"
  | "invalid_minutes"
  | "invalid_value_shape"
  | "unknown_descriptor_key"
  | "branded_or_nonplain_value";

export type NormalizeResult =
  | { ok: true; slot: ExtractedSlot }
  | { ok: false; reason: NormalizeRejectReason; key: TravelSlotKey | "unknown" };

export interface NormalizeOptions {
  /**
   * relation_context slot を shared にしてよい evidence refId の集合（★ correction③）。
   * relation_context 由来の slot は **既定 private**。ここに全 relation_context refId が
   * 含まれる場合のみ、宣言された shared を維持する（explicit shared）。
   */
  relationSharedRefIds?: ReadonlySet<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 小さなガード（pure）
// ─────────────────────────────────────────────────────────────────────────────

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
/** 独自 symbol プロパティ（EngineOnly 等のブランド）を持つ = 非 plain → 拒否対象 */
const hasOwnSymbols = (v: unknown): boolean =>
  typeof v === "object" && v !== null && Object.getOwnPropertySymbols(v).length > 0;

const SURFACE_SET: ReadonlySet<string> = new Set(EXTRACTION_SURFACES);
const DESCRIPTOR_SET: ReadonlySet<string> = new Set(DESCRIPTOR_KEYS);
const PACE_SET: ReadonlySet<string> = new Set(PACE_VALUES);
const STATUS_SET: ReadonlySet<string> = new Set(SLOT_STATUSES);
const FILL_SET: ReadonlySet<string> = new Set(SLOT_FILL_STATES);
const SLOT_KEY_SET: ReadonlySet<string> = new Set(TRAVEL_SLOT_KEYS);
const PRIORITY_SET: ReadonlySet<string> = new Set(MISSING_SLOT_PRIORITIES);

// ─────────────────────────────────────────────────────────────────────────────
// evidence / owner 再構築（参照のみ・excess strip）
// ─────────────────────────────────────────────────────────────────────────────

function normalizeEvidence(raw: unknown): EvidenceRef[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EvidenceRef[] = [];
  for (const e of raw) {
    if (hasOwnSymbols(e)) return null;
    const r = asRecord(e);
    if (!r) return null;
    if (typeof r.surface !== "string" || !SURFACE_SET.has(r.surface)) return null;
    if (!isNonEmptyString(r.refId)) return null;
    const ref: EvidenceRef = { surface: r.surface as ExtractionSurface, refId: r.refId };
    if (r.speakerParticipantId !== undefined) {
      if (!isNonEmptyString(r.speakerParticipantId)) return null;
      ref.speakerParticipantId = r.speakerParticipantId;
    }
    // ★ rawText / provider / sourceKind 等の excess は **出力に含めない**（再構築）
    out.push(ref);
  }
  return out;
}

function normalizeOwner(raw: unknown): ConstraintOwner | null {
  const r = asRecord(raw);
  if (!r) return null;
  if (r.kind === "shared") return { kind: "shared" };
  if (r.kind === "participant" && isNonEmptyString(r.participantId)) {
    return { kind: "participant", participantId: r.participantId };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// value 再構築（key 別・fail-closed）
// ─────────────────────────────────────────────────────────────────────────────

type ValueResult = { ok: true; value: SlotValue } | { ok: false; reason: NormalizeRejectReason };

function normalizeValue(key: TravelSlotKey, raw: unknown): ValueResult {
  if (hasOwnSymbols(raw)) return { ok: false, reason: "branded_or_nonplain_value" };

  switch (key) {
    case "destination_area": {
      const r = asRecord(raw);
      if (!r || !isNonEmptyString(r.areaText)) return { ok: false, reason: "invalid_value_shape" };
      const v: { areaText: string; placeRefId?: string } = { areaText: r.areaText };
      if (r.placeRefId !== undefined) {
        if (!isNonEmptyString(r.placeRefId)) return { ok: false, reason: "invalid_value_shape" };
        v.placeRefId = r.placeRefId;
      }
      return { ok: true, value: v };
    }
    case "date_or_range": {
      const r = asRecord(raw);
      if (!r) return { ok: false, reason: "invalid_window" };
      if (r.kind === "fuzzy") {
        if (!isNonEmptyString(r.descriptor)) return { ok: false, reason: "invalid_window" };
        return { ok: true, value: { kind: "fuzzy", descriptor: r.descriptor } };
      }
      if (r.kind === "single_day") {
        if (typeof r.date !== "string") return { ok: false, reason: "invalid_window" };
        const w = { kind: "single_day", date: r.date } as const;
        if (!isValidPlanWindow(w)) return { ok: false, reason: "invalid_window" };
        return { ok: true, value: w };
      }
      if (r.kind === "range") {
        if (typeof r.startDate !== "string" || typeof r.endDate !== "string") return { ok: false, reason: "invalid_window" };
        if (r.nights !== 1 && r.nights !== 2) return { ok: false, reason: "invalid_window" };
        const w = { kind: "range", startDate: r.startDate, endDate: r.endDate, nights: r.nights } as const;
        if (!isValidPlanWindow(w)) return { ok: false, reason: "invalid_window" };
        return { ok: true, value: w };
      }
      return { ok: false, reason: "invalid_window" };
    }
    case "time_window": {
      const r = asRecord(raw);
      if (!r) return { ok: false, reason: "invalid_value_shape" };
      const v: { departAfterMin?: number; returnByMin?: number } = {};
      if (r.departAfterMin !== undefined) {
        if (!isFiniteNum(r.departAfterMin) || !isValidMinuteOfDay(r.departAfterMin)) return { ok: false, reason: "invalid_minutes" };
        v.departAfterMin = r.departAfterMin;
      }
      if (r.returnByMin !== undefined) {
        if (!isFiniteNum(r.returnByMin) || !isValidMinuteOfDay(r.returnByMin)) return { ok: false, reason: "invalid_minutes" };
        v.returnByMin = r.returnByMin;
      }
      return { ok: true, value: v };
    }
    case "budget_band": {
      const r = asRecord(raw);
      // ★ axis-score 形（lo/hi なし）はここで弾く（fail-closed）
      if (!r || !isFiniteNum(r.lo) || !isFiniteNum(r.hi)) return { ok: false, reason: "invalid_budget" };
      const band = normalizeBudgetBand({
        lo: r.lo,
        hi: r.hi,
        confidence: isFiniteNum(r.confidence) ? r.confidence : 0,
        currency: "JPY",
      });
      if (!isValidBudgetBand(band)) return { ok: false, reason: "invalid_budget" };
      return { ok: true, value: band };
    }
    case "pace": {
      if (typeof raw !== "string" || !PACE_SET.has(raw)) return { ok: false, reason: "invalid_value_shape" };
      return { ok: true, value: raw as Pace };
    }
    case "mobility_tolerance": {
      const r = asRecord(raw);
      if (!r) return { ok: false, reason: "invalid_value_shape" };
      const v: { maxWalkKm?: number; maxTransfers?: number } = {};
      if (r.maxWalkKm !== undefined) {
        if (!isFiniteNum(r.maxWalkKm) || r.maxWalkKm < 0) return { ok: false, reason: "invalid_value_shape" };
        v.maxWalkKm = r.maxWalkKm;
      }
      if (r.maxTransfers !== undefined) {
        if (!isFiniteNum(r.maxTransfers) || r.maxTransfers < 0) return { ok: false, reason: "invalid_value_shape" };
        v.maxTransfers = r.maxTransfers;
      }
      return { ok: true, value: v };
    }
    case "red_line":
    case "soft_preference": {
      const r = asRecord(raw);
      if (!r) return { ok: false, reason: "invalid_value_shape" };
      if (typeof r.descriptorKey !== "string" || !DESCRIPTOR_SET.has(r.descriptorKey)) {
        return { ok: false, reason: "unknown_descriptor_key" };
      }
      if (!isNonEmptyString(r.descriptorValue)) return { ok: false, reason: "invalid_value_shape" };
      return { ok: true, value: { descriptorKey: r.descriptorKey as (typeof DESCRIPTOR_KEYS)[number], descriptorValue: r.descriptorValue } };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// slot 正規化
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeSlot(raw: unknown, options: NormalizeOptions = {}): NormalizeResult {
  const s = asRecord(raw);
  if (!s) return { ok: false, reason: "not_object", key: "unknown" };

  const key = typeof s.key === "string" && SLOT_KEY_SET.has(s.key) ? (s.key as TravelSlotKey) : null;
  if (key === null) return { ok: false, reason: "unknown_slot_key", key: "unknown" };

  if (typeof s.status !== "string" || !STATUS_SET.has(s.status)) return { ok: false, reason: "invalid_status", key };
  if (typeof s.fillState !== "string" || !FILL_SET.has(s.fillState)) return { ok: false, reason: "invalid_fill_state", key };

  const owner = normalizeOwner(s.owner);
  if (!owner) return { ok: false, reason: "invalid_owner", key };

  if (s.visibility !== "shared" && s.visibility !== "private") return { ok: false, reason: "invalid_visibility", key };
  let visibility: "shared" | "private" = s.visibility;

  const evidence = normalizeEvidence(s.evidence);
  if (!evidence) return { ok: false, reason: "invalid_evidence", key };

  const valueResult = normalizeValue(key, s.value);
  if (!valueResult.ok) return { ok: false, reason: valueResult.reason, key };

  // ★ correction③: relation_context は既定 private。explicit shared でなければ private に clamp。
  const relRefs = evidence.filter((e) => e.surface === "relation_context");
  if (relRefs.length > 0 && visibility === "shared") {
    const allowed = options.relationSharedRefIds;
    const eligible = allowed !== undefined && relRefs.every((e) => allowed.has(e.refId));
    if (!eligible) visibility = "private";
  }

  // 整合性: private はプランの形に影響してよいが「誰の private か」が要る → participant owner 必須
  if (visibility === "private" && owner.kind !== "participant") {
    return { ok: false, reason: "incoherent_visibility", key };
  }

  // status: proposed は検証通過で normalized へ前進（confirmed/normalized/retracted はそのまま）
  const status = s.status === "proposed" ? "normalized" : (s.status as (typeof SLOT_STATUSES)[number]);
  const confidence = isFiniteNum(s.confidence) ? clamp01(s.confidence) : 0;

  const slot = {
    key,
    value: valueResult.value,
    status,
    fillState: s.fillState as (typeof SLOT_FILL_STATES)[number],
    confidence,
    owner,
    visibility,
    evidence,
  } as ExtractedSlot;

  return { ok: true, slot };
}

// ─────────────────────────────────────────────────────────────────────────────
// set 正規化 + 射影
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedSlotSet {
  participantIds: string[];
  /** 受理されたクリーンな slot（solver 入力 = retracted 以外の全 slot。private を含む） */
  slots: ExtractedSlot[];
  rejected: { key: TravelSlotKey | "unknown"; reason: NormalizeRejectReason }[];
  missingSlotQuestions: MissingSlotQuestion[];
}

function normalizeMissingQuestion(raw: unknown): MissingSlotQuestion | null {
  const r = asRecord(raw);
  if (!r) return null;
  if (typeof r.slotKey !== "string" || !SLOT_KEY_SET.has(r.slotKey)) return null;
  if (typeof r.priority !== "string" || !PRIORITY_SET.has(r.priority)) return null;
  if (!isNonEmptyString(r.questionIntent)) return null;
  return {
    slotKey: r.slotKey as TravelSlotKey,
    priority: r.priority as (typeof MISSING_SLOT_PRIORITIES)[number],
    questionIntent: r.questionIntent,
  };
}

export function normalizeSlotSet(raw: unknown, options: NormalizeOptions = {}): NormalizedSlotSet {
  const r = asRecord(raw);
  const participantIds: string[] = [];
  if (r && Array.isArray(r.participantIds)) {
    for (const p of r.participantIds) {
      if (isNonEmptyString(p) && !participantIds.includes(p)) participantIds.push(p);
    }
  }

  const slots: ExtractedSlot[] = [];
  const rejected: { key: TravelSlotKey | "unknown"; reason: NormalizeRejectReason }[] = [];
  const rawSlots = r && Array.isArray(r.slots) ? r.slots : [];
  for (const rs of rawSlots) {
    const res = normalizeSlot(rs, options);
    if (res.ok) slots.push(res.slot);
    else rejected.push({ key: res.key, reason: res.reason });
  }

  const missingSlotQuestions: MissingSlotQuestion[] = [];
  const rawQ = r && Array.isArray(r.missingSlotQuestions) ? r.missingSlotQuestions : [];
  for (const q of rawQ) {
    const nq = normalizeMissingQuestion(q);
    if (nq) missingSlotQuestions.push(nq);
  }

  return { participantIds, slots, rejected, missingSlotQuestions };
}

/**
 * 共有ビュー射影（M5）: shared かつ非 retracted の slot のみ。
 * ★ solver 入力（= NormalizedSlotSet.slots・private 含む）とは別。private はここに出ない。
 */
export function toSharedProjection(slots: readonly ExtractedSlot[]): ExtractedSlot[] {
  return slots.filter((s) => s.visibility === "shared" && s.status !== "retracted");
}

/**
 * 特定 viewer 向け射影: shared + その viewer 自身が owner の private（非 retracted）。
 * （相手の private は出ない）
 */
export function projectForViewer(slots: readonly ExtractedSlot[], viewerParticipantId: string): ExtractedSlot[] {
  return slots.filter((s) => {
    if (s.status === "retracted") return false;
    if (s.visibility === "shared") return true;
    return s.owner.kind === "participant" && s.owner.participantId === viewerParticipantId;
  });
}
