/**
 * Durable DB Repository **Port**（**server-side 抽象・pure types only**・real DB/Supabase/generated types なし）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md
 *           SQL draft: docs/sql-drafts/t11-plan-travel-sessions-draft.sql（apply smoke 済）
 *           pure model: lib/shared/travel/travel-session-persistence-types.ts
 *
 * ★ これは **将来 Supabase adapter を差し込むための port 境界**（snake_case DB row ↔ camelCase domain を分離）。
 *   port methods は **owner-RLS-safe 操作**（owner を渡し、real adapter が RLS-scoped query にする）。
 *   port は **display/authoritative/raw/action 系を一切露出しない**（row 列も SQL draft に一致＝排除済）。
 *
 * 厳守: Supabase/generated types/service_role/app・UI を import しない・real DB call をしない（interface のみ）。
 */

import type {
  PersistedTravelSessionStatus,
  TravelSessionPersistedVisibility,
  TravelSessionPersistenceProvenance,
  PersistedTravelLinkSource,
} from "@/lib/shared/travel/travel-session-persistence-types";
import type { SafeTravelLinkEligibility } from "@/lib/shared/travel/safe-link-types";
import type { TravelSlotKey, SlotStatus, SlotFillState, SlotValue } from "@/lib/shared/travel/slot-types";
import type { Visibility } from "@/lib/shared/travel/core-types";

/** owner の kind のみ（SQL `owner_kind text`・participantId は MVP shared table に保存しない）。 */
export type PlanTravelOwnerKind = "shared" | "participant";

// ─────────────────────────────────────────────────────────────────────────────
// row 型（snake_case・SQL draft の列に一致・display/authoritative/raw/href/generatedUrl を持たない）
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanTravelSessionRow {
  id: string;
  owner_user_id: string;
  status: PersistedTravelSessionStatus;
  visibility: TravelSessionPersistedVisibility;
  created_at: string;
  updated_at: string;
}

export interface PlanTravelSessionInputRow {
  id: string;
  session_id: string;
  slot_key: TravelSlotKey;
  /** jsonb（band/enum/areaText/descriptor のみ・raw score なし）。 */
  value: SlotValue;
  slot_status: SlotStatus;
  fill_state: SlotFillState;
  owner_kind: PlanTravelOwnerKind;
  visibility: Visibility;
  provenance: TravelSessionPersistenceProvenance;
  created_at: string;
  updated_at: string;
}

export interface PlanTravelSessionLinkRow {
  id: string;
  session_id: string;
  source: PersistedTravelLinkSource;
  external_reference: string;
  generated: boolean; // DB CHECK で false 固定
  inert: boolean; // DB CHECK で true 固定
  renderable: boolean;
  eligibility: SafeTravelLinkEligibility;
  visibility: TravelSessionPersistedVisibility;
  provenance: TravelSessionPersistenceProvenance;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// insert row 型（id/timestamp は DB 採番ゆえ持たない）
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanTravelSessionInsertRow {
  owner_user_id: string;
  status: PersistedTravelSessionStatus;
  visibility: TravelSessionPersistedVisibility;
}

export interface PlanTravelSessionInputInsertRow {
  session_id: string;
  slot_key: TravelSlotKey;
  value: SlotValue;
  slot_status: SlotStatus;
  fill_state: SlotFillState;
  owner_kind: PlanTravelOwnerKind;
  visibility: Visibility;
  provenance: TravelSessionPersistenceProvenance;
}

export interface PlanTravelSessionLinkInsertRow {
  session_id: string;
  source: PersistedTravelLinkSource;
  external_reference: string;
  generated: false; // 永続 row は非生成
  inert: true; // 永続 link は inert
  renderable: boolean;
  eligibility: SafeTravelLinkEligibility;
  visibility: TravelSessionPersistedVisibility;
  provenance: TravelSessionPersistenceProvenance;
}

/** owner で読み出した bundle rows（display を含まない）。 */
export interface PlanTravelSessionBundleRows {
  session: PlanTravelSessionRow;
  inputs: PlanTravelSessionInputRow[];
  links: PlanTravelSessionLinkRow[];
}

/**
 * DB port（**owner-RLS-safe 操作の抽象**・interface only）。
 *   real adapter（将来）が Supabase user-RLS client で実装。display/authoritative/raw を露出しない。
 */
export interface TravelSessionDbPort {
  insertSession(row: PlanTravelSessionInsertRow): Promise<PlanTravelSessionRow>;
  insertInputs(rows: PlanTravelSessionInputInsertRow[]): Promise<PlanTravelSessionInputRow[]>;
  insertLinks(rows: PlanTravelSessionLinkInsertRow[]): Promise<PlanTravelSessionLinkRow[]>;
  selectBundleByOwner(sessionId: string, ownerUserId: string): Promise<PlanTravelSessionBundleRows | null>;
  listByOwner(ownerUserId: string): Promise<PlanTravelSessionRow[]>;
  deleteByOwner(sessionId: string, ownerUserId: string): Promise<boolean>;
}
