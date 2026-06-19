/**
 * C — Pure Durable Travel Session Persistence 契約型（**pure types + interface only**・SQL/DB/Supabase/apply なし）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md（§4-12/§14 案 C + CEO `rendered` 補正）
 *
 * ★ これは **real persistence ではない**（型 + repository interface のみ・runtime/DB/migration 非接触）。
 *   in-memory harness（`travel-session-intent-harness-types.ts`）の契約を **DB 永続モデルの型**として具体化。
 *
 * 正本 = 構造化 input intent（confirmed/explicit）+ owner + inert link metadata + provenance/visibility。
 * ★ **持たない（型で排除）**: AuthoritativePacketForServer / TravelPlanEngineOutput / DisplayPacketForClient /
 *   PlanIntelligenceProjection / CoAlterProjectionCue[] / raw diagnostics / FitResult / executionAuthority /
 *   booking/calendar/action / href / generatedUrl / live availability・price / fetched・preview 内容。
 * ★ display（engine output/packet/projection/cues/href/generated URL）は **永続せず caller が recompute**。
 */

import type { SafeTravelLinkEligibility } from "./safe-link-types";
import type { TravelSlotKey, SlotStatus, SlotFillState, SlotValue } from "./slot-types";
import type { ConstraintOwner, Visibility } from "./core-types";

/** 永続 visibility（shared/private）。 */
export type TravelSessionPersistedVisibility = "shared" | "private";

/** 永続 session の中立 status（**authoritative でない・実行権限を表さない**）。 */
export type PersistedTravelSessionStatus = "draft" | "ready_snapshot";

/** provenance（**参照 id のみ**・本文/raw/LLM/diagnostics を持たない）。 */
export interface TravelSessionPersistenceProvenance {
  /** message id / action id / session window id 等の **参照 ID のみ**（本文非保持）。 */
  refIds: string[];
}

/** 永続 link の source（**manual のみ**・`generated_maps_search` は recompute ゆえ永続しない）。 */
export type PersistedTravelLinkSource = "user_provided" | "manual_official" | "manual_maps";

/** session root（owner + 中立 status + visibility + 注入 timestamp）。 */
export interface PersistedTravelSession {
  id: string;
  ownerUserId: string;
  status: PersistedTravelSessionStatus;
  visibility: TravelSessionPersistedVisibility;
  /** 注入文字列（`Date.now` を型に持たない・caller/DB 供給）。 */
  createdAt: string;
  updatedAt: string;
}

/** 構造化 slot intent（confirmed/explicit・band/enum/areaText/descriptor・**raw score なし**＝SlotValue 契約）。 */
export interface PersistedTravelSessionInput {
  sessionId: string;
  slotKey: TravelSlotKey;
  /** band/enum/areaText/descriptor のみ（raw axis score を含まない）。 */
  value: SlotValue;
  slotStatus: SlotStatus;
  fillState: SlotFillState;
  owner: ConstraintOwner;
  visibility: Visibility;
  provenance: TravelSessionPersistenceProvenance;
}

/** inert safe-link metadata（**manual のみ**・href/generatedUrl/fetched/preview/availability/price を持たない）。 */
export interface PersistedTravelSessionLink {
  sessionId: string;
  source: PersistedTravelLinkSource;
  /** inert 外部参照 value（**href にしない・fetch しない**・そのまま carry）。`url` でなく value。 */
  externalReference: string;
  /** ★ 永続 link は **常に false**（generated は永続しない＝recompute）。 */
  generated: false;
  /** ★ 常に inert。 */
  inert: true;
  eligibility: SafeTravelLinkEligibility;
  visibility: TravelSessionPersistedVisibility;
  provenance: TravelSessionPersistenceProvenance;
  /**
   * ★ static な表示適格フラグ（display する資格があるか）。CEO 補正で `rendered` を採らず static eligibility を採用。
   *   **NOT analytics**・**NOT action authority**・**NOT booking/scheduling**・**NOT user behavior persistence**。
   */
  renderable: boolean;
}

/** 読み出し bundle（**display は含まない＝caller が recompute**）。 */
export interface PersistedTravelSessionBundle {
  session: PersistedTravelSession;
  inputs: PersistedTravelSessionInput[];
  links: PersistedTravelSessionLink[];
}

/** 書き込み入力（id/timestamp は DB 採番ゆえ持たない・session 経由で sessionId 付与）。 */
export interface TravelSessionPersistenceWriteInput {
  ownerUserId: string;
  status: PersistedTravelSessionStatus;
  visibility: TravelSessionPersistedVisibility;
  inputs: Omit<PersistedTravelSessionInput, "sessionId">[];
  links: Omit<PersistedTravelSessionLink, "sessionId">[];
}

/** 中立エラー。 */
export type TravelSessionPersistenceError =
  | "forbidden_field" // authoritative / raw output / diagnostics / projection / cues / href / generatedUrl 等
  | "non_inert_link" // link が inert:true でない
  | "not_owner" // RLS は DB 層だが contract でも owner 不一致を表現
  | "invalid_input";

export type TravelSessionPersistenceResult =
  | { ok: true; bundle: PersistedTravelSessionBundle }
  | { ok: false; error: TravelSessionPersistenceError };

/**
 * repository 契約（**interface only**・concrete DB 実装/ Supabase/ service_role/ fetch/ SQL を含まない）。
 *   - 読み出しは **persisted bundle のみ**を返す（display packet/projection/cues/authoritative/raw output を返さない）。
 *   - display は **caller が recompute**。RLS 強制は **DB 層（後）**＝本 interface は強制しない（型契約のみ）。
 */
export interface TravelSessionRepositoryContract {
  saveTravelSessionIntent(input: TravelSessionPersistenceWriteInput): Promise<TravelSessionPersistenceResult>;
  loadTravelSessionIntent(sessionId: string, ownerUserId: string): Promise<PersistedTravelSessionBundle | null>;
  listTravelSessionIntents(ownerUserId: string): Promise<PersistedTravelSession[]>;
  deleteTravelSessionIntent(sessionId: string, ownerUserId: string): Promise<{ ok: boolean }>;
}
