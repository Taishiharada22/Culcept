/**
 * D — In-Memory Travel Session Repository **Contract Harness**（**pure・process-memory・DB/SQL/Supabase 非接触**）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md（§14 案 C/D + CEO 命名補正）
 *
 * ★ これは **real persistence ではない**（process-memory Map のみ・restart で消える）。
 *   `TravelSessionRepositoryContract` を満たし、「**許可された persisted bundle のみ save/load できる**・
 *   display を recompute しない・authoritative/raw/display/href/generatedUrl/availability を保持しない」を検証する harness。
 *
 * 厳守:
 *   - Map のみ・**Date.now/Math.random は注入時のみ**（default 固定 stub＝deterministic）・process.env なし。
 *   - **DB/Supabase/service_role/fetch/SQL/app・UI/M2/CoAlter/`/talk` を import しない**。
 *   - save は write input のみ・load は persisted bundle のみ返す・**engine/projection/cue/href/generatedUrl 生成なし**。
 *   - forbidden field（authoritative/raw output/display/projection/cues/diagnostics/booking/href/generatedUrl/
 *     availability/price 等）を含む入力は **reject**（forbidden_field）。inert でない link は reject（non_inert_link）。
 *   - 入力を mutate しない・deterministic/idempotent。
 */

import type {
  PersistedTravelSession,
  PersistedTravelSessionBundle,
  PersistedTravelSessionInput,
  PersistedTravelSessionLink,
  TravelSessionPersistenceResult,
  TravelSessionPersistenceWriteInput,
  TravelSessionRepositoryContract,
} from "./travel-session-persistence-types";

/** 永続してはならない field（**exact key 一致**で recursive scan・legit key と衝突しないよう exact）。 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "authoritative", "executionAuthority", "packet", "projection", "cues", "diagnostics",
  "href", "generatedUrl", "availability", "price", "livePrice", "cancellation",
  "booking", "calendar", "fetched", "preview", "fitResult", "fitSummary", "route", "weather",
]);

/** 入力に forbidden key が含まれるか（recursive・exact key）。 */
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

export interface InMemoryTravelSessionRepositoryHarnessOptions {
  /** 注入 clock（default 固定 stub＝deterministic・Date.now を使わない）。 */
  now?: () => string;
}

/** harness（contract + test 用 size）。 */
export interface InMemoryTravelSessionRepositoryHarness extends TravelSessionRepositoryContract {
  size(): number;
}

/**
 * pure in-memory な repository contract harness（real persistence ではない）。
 */
export function createInMemoryTravelSessionRepositoryHarness(
  options: InMemoryTravelSessionRepositoryHarnessOptions = {},
): InMemoryTravelSessionRepositoryHarness {
  const store = new Map<string, PersistedTravelSessionBundle>();
  const now = options.now ?? (() => "1970-01-01T00:00:00.000Z"); // 固定 stub（注入で上書き可）
  let counter = 0;

  return {
    async saveTravelSessionIntent(
      input: TravelSessionPersistenceWriteInput,
    ): Promise<TravelSessionPersistenceResult> {
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

      counter += 1;
      const id = `mem-travel-session-${counter}`; // 採番（Date.now/random 不使用）
      const stamp = now();
      const session: PersistedTravelSession = {
        id,
        ownerUserId: input.ownerUserId,
        status: input.status,
        visibility: input.visibility,
        createdAt: stamp,
        updatedAt: stamp,
      };
      // ★ 入力を mutate しない（新 object/array を構築・sessionId のみ付与）。
      const inputs: PersistedTravelSessionInput[] = input.inputs.map((i) => ({ ...i, sessionId: id }));
      const links: PersistedTravelSessionLink[] = input.links.map((l) => ({ ...l, sessionId: id }));
      const bundle: PersistedTravelSessionBundle = { session, inputs, links };
      store.set(id, bundle);
      return { ok: true, bundle };
    },

    async loadTravelSessionIntent(
      sessionId: string,
      ownerUserId: string,
    ): Promise<PersistedTravelSessionBundle | null> {
      const bundle = store.get(sessionId);
      if (!bundle) return null;
      if (bundle.session.ownerUserId !== ownerUserId) return null; // owner 不一致 → null（RLS は DB 層だが harness も owner gate）
      return bundle;
    },

    async listTravelSessionIntents(ownerUserId: string): Promise<PersistedTravelSession[]> {
      const out: PersistedTravelSession[] = [];
      for (const bundle of store.values()) {
        if (bundle.session.ownerUserId === ownerUserId) out.push(bundle.session);
      }
      return out;
    },

    async deleteTravelSessionIntent(sessionId: string, ownerUserId: string): Promise<{ ok: boolean }> {
      const bundle = store.get(sessionId);
      if (!bundle || bundle.session.ownerUserId !== ownerUserId) return { ok: false };
      store.delete(sessionId);
      return { ok: true };
    },

    size() {
      return store.size;
    },
  };
}
