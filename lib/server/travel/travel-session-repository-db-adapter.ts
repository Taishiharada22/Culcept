/**
 * Durable DB Repository **Adapter**（port 上に `TravelSessionRepositoryContract` を実装・**pure mapping のみ**）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md（§14 案 C 系）
 *
 * ★ persisted model（camelCase）↔ DB row（snake_case）の **決定論 mapping** のみ。
 *   **display を recompute しない・engine/projection/cue/display-adapter を呼ばない・href/generatedUrl を作らない**。
 *   forbidden field を含む入力は port 書き込み前に reject（guard）。real DB call は port が担う（本層は DB を知らない）。
 *
 * 厳守: Supabase/createClient/service_role/fetch/app・UI/M2/CoAlter/`/talk`/engine/display を import しない。
 */

import type { ConstraintOwner } from "@/lib/shared/travel/core-types";
import type {
  PersistedTravelSession,
  PersistedTravelSessionBundle,
  PersistedTravelSessionInput,
  PersistedTravelSessionLink,
  TravelSessionPersistenceResult,
  TravelSessionPersistenceWriteInput,
  TravelSessionRepositoryContract,
} from "@/lib/shared/travel/travel-session-persistence-types";
import type {
  PlanTravelSessionRow,
  PlanTravelSessionInputRow,
  PlanTravelSessionLinkRow,
  PlanTravelSessionInputInsertRow,
  PlanTravelSessionLinkInsertRow,
  TravelSessionDbPort,
} from "./travel-session-db-port";

/** 永続してはならない field（**exact key**・recursive・harness と同等の guard）。 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "authoritative", "executionAuthority", "packet", "projection", "cues", "diagnostics",
  "href", "generatedUrl", "availability", "price", "livePrice", "cancellation",
  "booking", "calendar", "fetched", "preview", "fitResult", "fitSummary", "route", "weather",
]);
function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value && typeof value === "object") {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) return true;
      if (hasForbiddenKey((value as Record<string, unknown>)[k])) return true;
    }
  }
  return false;
}

// ── row ↔ domain mapping（決定論・display を作らない） ──────────────────────────

function rowToSession(r: PlanTravelSessionRow): PersistedTravelSession {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    status: r.status,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** owner_kind → ConstraintOwner。participant は session owner で再構成（MVP 1-person・participantId 列なし）。 */
function rowToOwner(ownerKind: PlanTravelSessionInputRow["owner_kind"], session: PlanTravelSessionRow): ConstraintOwner {
  return ownerKind === "shared" ? { kind: "shared" } : { kind: "participant", participantId: session.owner_user_id };
}

function rowToInput(r: PlanTravelSessionInputRow, session: PlanTravelSessionRow): PersistedTravelSessionInput {
  return {
    sessionId: r.session_id,
    slotKey: r.slot_key,
    value: r.value,
    slotStatus: r.slot_status,
    fillState: r.fill_state,
    owner: rowToOwner(r.owner_kind, session),
    visibility: r.visibility,
    provenance: r.provenance,
  };
}

function rowToLink(r: PlanTravelSessionLinkRow): PersistedTravelSessionLink {
  return {
    sessionId: r.session_id,
    source: r.source,
    externalReference: r.external_reference,
    generated: false, // 永続 link は非生成（DB CHECK 一致・型 literal）
    inert: true, // 永続 link は inert（DB CHECK 一致）
    eligibility: r.eligibility,
    visibility: r.visibility,
    provenance: r.provenance,
    renderable: r.renderable,
  };
}

function inputToInsertRow(i: Omit<PersistedTravelSessionInput, "sessionId">, sessionId: string): PlanTravelSessionInputInsertRow {
  return {
    session_id: sessionId,
    slot_key: i.slotKey,
    value: i.value,
    slot_status: i.slotStatus,
    fill_state: i.fillState,
    owner_kind: i.owner.kind, // participantId は MVP shared table に保存しない
    visibility: i.visibility,
    provenance: i.provenance,
  };
}

function linkToInsertRow(l: Omit<PersistedTravelSessionLink, "sessionId">, sessionId: string): PlanTravelSessionLinkInsertRow {
  return {
    session_id: sessionId,
    source: l.source,
    external_reference: l.externalReference,
    generated: false,
    inert: true,
    renderable: l.renderable,
    eligibility: l.eligibility,
    visibility: l.visibility,
    provenance: l.provenance,
  };
}

/**
 * `TravelSessionDbPort` 上に `TravelSessionRepositoryContract` を実装（pure mapping・display 非生成）。
 */
export function createTravelSessionRepositoryFromDbPort(
  port: TravelSessionDbPort,
): TravelSessionRepositoryContract {
  return {
    async saveTravelSessionIntent(input: TravelSessionPersistenceWriteInput): Promise<TravelSessionPersistenceResult> {
      if (
        !input ||
        typeof input !== "object" ||
        typeof input.ownerUserId !== "string" ||
        !Array.isArray(input.inputs) ||
        !Array.isArray(input.links)
      ) {
        return { ok: false, error: "invalid_input" };
      }
      if (hasForbiddenKey(input)) return { ok: false, error: "forbidden_field" };
      if (input.links.some((l) => l.inert !== true)) return { ok: false, error: "non_inert_link" };

      // ① session insert（失敗時は cleanup 不要＝session 未作成）。
      let sessionRow;
      try {
        sessionRow = await port.insertSession({
          owner_user_id: input.ownerUserId,
          status: input.status,
          visibility: input.visibility,
        });
      } catch {
        return { ok: false, error: "invalid_input" }; // raw DB diagnostics を client に出さない
      }

      // ② children insert。部分失敗なら ★ best-effort cleanup（session delete→FK cascade で children も削除）。
      //   Supabase JS は跨 table transaction を持たないため、これが atomicity の代替（§8-B）。
      try {
        const inputRows = await port.insertInputs(input.inputs.map((i) => inputToInsertRow(i, sessionRow.id)));
        const linkRows = await port.insertLinks(input.links.map((l) => linkToInsertRow(l, sessionRow.id)));
        const bundle: PersistedTravelSessionBundle = {
          session: rowToSession(sessionRow),
          inputs: inputRows.map((r) => rowToInput(r, sessionRow)),
          links: linkRows.map(rowToLink),
        };
        return { ok: true, bundle };
      } catch {
        try {
          await port.deleteByOwner(sessionRow.id, input.ownerUserId); // owner-scoped cleanup
        } catch {
          /* best-effort: cleanup 失敗は swallow（client に raw を出さない） */
        }
        return { ok: false, error: "invalid_input" };
      }
    },

    async loadTravelSessionIntent(sessionId: string, ownerUserId: string): Promise<PersistedTravelSessionBundle | null> {
      const rows = await port.selectBundleByOwner(sessionId, ownerUserId);
      if (!rows) return null;
      return {
        session: rowToSession(rows.session),
        inputs: rows.inputs.map((r) => rowToInput(r, rows.session)),
        links: rows.links.map(rowToLink),
      };
    },

    async listTravelSessionIntents(ownerUserId: string): Promise<PersistedTravelSession[]> {
      const rows = await port.listByOwner(ownerUserId);
      return rows.map(rowToSession);
    },

    async deleteTravelSessionIntent(sessionId: string, ownerUserId: string): Promise<{ ok: boolean }> {
      const ok = await port.deleteByOwner(sessionId, ownerUserId);
      return { ok };
    },
  };
}
