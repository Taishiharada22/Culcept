/**
 * T2B — Travel intent/slot 抽出 契約型（**additive pure schema/types only**・未配線）
 *
 * 設計: docs/t2-intent-slot-extraction-design.md + CEO 3 補正 2026-06-12
 *   ① date_or_range は session context 注入も可（chat/form 抽出だけではない）
 *   ② 構造化 surface（form/quick_action/adjustment）は confirmed 直行可・自由文は proposed
 *   ③ relation_context は default private・input が明示した場合のみ shared 可
 *
 * このファイルの厳格な性質:
 *   - **型 + as-const メタデータのみ**（関数・runtime 抽出・LLM・normalizer 実装・solver なし）。
 *   - slot value は TravelCore-T1A/T1B 互換（BudgetBand / Pace / TravelPlanWindow / ConstraintOwner 等を再利用）。
 *   - **生の性格スコア（axis snapshot 形）を slot value にしない**（§6 / privacy）。
 *
 * ★ 三直交の分離（どの型もこれらを 1 概念に collapse しない）:
 *   (A) participant source（TravelCore `ParticipantSourceRef`）… 本ファイルは **participantId（id）でのみ参照**。
 *       source kind は埋め込まない。
 *   (B) adapter provider / data mode（TalkBridge: fixture / talk_thread / …）… 本ファイルに **一切登場しない**。
 *   (C) extraction source surface（本ファイルの `ExtractionSurface`）… EvidenceRef.surface がこれ。
 */

import type {
  BudgetBand,
  ConstraintOwner,
  Pace,
  TravelPlanWindow,
  Visibility,
} from "./core-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 Slot keys
// ─────────────────────────────────────────────────────────────────────────────

export const TRAVEL_SLOT_KEYS = [
  "destination_area",
  "date_or_range",
  "time_window",
  "budget_band",
  "pace",
  "mobility_tolerance",
  "red_line",
  "soft_preference",
] as const;
export type TravelSlotKey = (typeof TRAVEL_SLOT_KEYS)[number];

// note: 旧設計 §1 の `participant_constraint` / `shared_condition` は **key ではなく
//   (key + owner) の射影**。owner フィールド（§7 SlotBase.owner）で表現し、key には昇格しない
//   （owner を key に collapse しないため）。

// ─────────────────────────────────────────────────────────────────────────────
// §2 Status / fill state
// ─────────────────────────────────────────────────────────────────────────────

export const SLOT_STATUSES = ["proposed", "normalized", "confirmed", "retracted"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SLOT_FILL_STATES = ["filled", "partial", "missing"] as const;
export type SlotFillState = (typeof SLOT_FILL_STATES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §3 Extraction surfaces（★ correction①: session_context を追加）
// ─────────────────────────────────────────────────────────────────────────────

export const EXTRACTION_SURFACES = [
  "chat_message", //      自由文（LLM 提案・将来 runtime）
  "quick_action", //      構造化・明示操作
  "adjustment_card", //   構造化・明示操作（プラン側調整適用）
  "form_input", //        構造化・明示操作（日付ピッカー / 人数 / モード）
  "session_context", //   CoAlterPlanSession / /plan 選択日 / mode window 由来（注入）★①
  "profile_prior", //     M2 PersonalizationPort 由来（派生 band 値のみ）
  "relation_context", //  Culcept relation 由来（default private / explicit shared 可）★③
] as const;
export type ExtractionSurface = (typeof EXTRACTION_SURFACES)[number];

/**
 * surface ごとの初期 status（as-const メタデータ・normalizer 実装ではない）。
 * ★ correction②: 明示操作系は confirmed 直行 / 自由文は proposed / 注入系は normalized default。
 */
export const SURFACE_INITIAL_STATUS: Record<ExtractionSurface, SlotStatus> = {
  chat_message: "proposed",
  quick_action: "confirmed",
  adjustment_card: "confirmed",
  form_input: "confirmed",
  session_context: "normalized",
  profile_prior: "normalized",
  relation_context: "normalized",
};

/** surface が「明示的ユーザー操作」か（confirmed 直行可否の根拠）。 */
export const SURFACE_IS_EXPLICIT: Record<ExtractionSurface, boolean> = {
  chat_message: false,
  quick_action: true,
  adjustment_card: true,
  form_input: true,
  session_context: false,
  profile_prior: false,
  relation_context: false,
};

/**
 * surface ごとの default visibility。
 * ★ correction③: relation_context は **private 既定**。shared は input が明示した場合のみ
 *   （その強制は normalizer の責務・T2C+。本型は shared を構造的に許可する）。
 */
export const SURFACE_DEFAULT_VISIBILITY: Record<ExtractionSurface, Visibility> = {
  chat_message: "shared", //     ペアチャットは相手も見ている
  quick_action: "shared",
  adjustment_card: "shared",
  form_input: "shared", //       共有プラン UI 上の入力
  session_context: "shared", //  セッション window は共有
  profile_prior: "private", //   M2 由来の個人派生値
  relation_context: "private", // ★ 既定 private（explicit shared のみ shared）
};

// ─────────────────────────────────────────────────────────────────────────────
// §4 Descriptor registry（red_line / soft_preference の正規述語キー・normalizer のみが書く）
// ─────────────────────────────────────────────────────────────────────────────

export const DESCRIPTOR_KEYS = [
  "require", //     必須:   require:onsen
  "avoid", //       回避:   avoid:crowd
  "prefer", //      選好:   prefer:nature
  "atmosphere", //  雰囲気:  atmosphere:calm
  "food_focus", //  食重視:  food_focus:local
  "scene", //       場面:   scene:conversational（「会話しやすい場所」）
] as const;
export type DescriptorKey = (typeof DESCRIPTOR_KEYS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §5 Evidence（参照のみ・本文非保持・3 直交を崩さない）
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidenceRef {
  /** 抽出元 surface（= 3 直交のうち extraction surface 軸 C） */
  surface: ExtractionSurface;
  /** message id / action id / "m2:planParams.budgetPosture" / session window id 等の **参照 ID のみ** */
  refId: string;
  /**
   * 発話者 participantId（任意・**id のみ**）。
   * ★ participant source kind（軸 A）や adapter provider mode（軸 B）は持たない。
   */
  speakerParticipantId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 Slot value 型（TravelCore-T1A/T1B 互換・生 axis score 形は含まない）
// ─────────────────────────────────────────────────────────────────────────────

export interface DestinationAreaValue {
  areaText: string;
  /** 地名解決（外部）後に付与。T2 段階は任意 */
  placeRefId?: string;
}

/**
 * 具体（T1A `TravelPlanWindow`）または未解決の fuzzy。
 * ★ correction①: session_context / form_input は**具体形（TravelPlanWindow）**を注入する。
 *   chat の「来月」等は fuzzy（fillState=partial）。
 */
export type DateOrRangeValue = TravelPlanWindow | { kind: "fuzzy"; descriptor: string };

export interface TimeWindowValue {
  departAfterMin?: number;
  returnByMin?: number;
}

export interface MobilityToleranceValue {
  maxWalkKm?: number;
  maxTransfers?: number;
}

/** red_line / soft_preference の値（正規述語キー + 対象）。normalizer が "key:value" 化して TravelConstraint へ。 */
export interface DescriptorSlotValue {
  descriptorKey: DescriptorKey;
  descriptorValue: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 ExtractedSlot（key で discriminated・共通フィールドは SlotBase）
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotBase {
  status: SlotStatus;
  fillState: SlotFillState;
  /** 0..1（抽出確度。profile_prior 由来は M2 confidence を継承） */
  confidence: number;
  /** shared | { kind:"participant", participantId } — **id 参照のみ**（source kind ではない） */
  owner: ConstraintOwner;
  visibility: Visibility;
  evidence: EvidenceRef[];
}

export type ExtractedSlot =
  | (SlotBase & { key: "destination_area"; value: DestinationAreaValue })
  | (SlotBase & { key: "date_or_range"; value: DateOrRangeValue })
  | (SlotBase & { key: "time_window"; value: TimeWindowValue })
  | (SlotBase & { key: "budget_band"; value: BudgetBand })
  | (SlotBase & { key: "pace"; value: Pace })
  | (SlotBase & { key: "mobility_tolerance"; value: MobilityToleranceValue })
  | (SlotBase & { key: "red_line"; value: DescriptorSlotValue })
  | (SlotBase & { key: "soft_preference"; value: DescriptorSlotValue });

/**
 * 全 slot value の union。
 * 注意（privacy・型の限界）: BudgetBand / Pace / Descriptor 等は生 axis score 形を**拒否**するが、
 * TimeWindow/Mobility は全 optional のため excess-prop を構造的に弾けない（TS の限界）。
 * したがって「profile_prior は band/enum 値のみ・生スコア禁止」の最終強制は **normalizer（T2C+）
 * が既知キーに strip する責務**。本型は band/enum 値が axis 形でないことのみ保証する。
 */
export type SlotValue = ExtractedSlot["value"];

// ─────────────────────────────────────────────────────────────────────────────
// §8 Missing-slot question
// ─────────────────────────────────────────────────────────────────────────────

export const MISSING_SLOT_PRIORITIES = ["required", "recommended", "optional"] as const;
export type MissingSlotPriority = (typeof MISSING_SLOT_PRIORITIES)[number];

export interface MissingSlotQuestion {
  slotKey: TravelSlotKey;
  priority: MissingSlotPriority;
  /** 安定した intent ラベル（ユーザー向け文言ではない。copy 生成は説明層の責務） */
  questionIntent: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §9 ExtractedSlotSet（T2 の出力契約）
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedSlotSet {
  /** この set の対象 participantId（1–2・MVP）。**source kind や provider mode は持たない**（id のみ） */
  participantIds: string[];
  slots: ExtractedSlot[];
  missingSlotQuestions: MissingSlotQuestion[];
}
