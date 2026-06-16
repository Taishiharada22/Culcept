/**
 * D(C-option) B — In-Memory Travel Session Intent Harness（**pure・process-memory のみ・contract harness**）
 *
 * 設計正本: docs/t11-d-durable-travel-state-persistence-preflight.md（§6/§11 + CEO 命名補正）
 *
 * ★ **real persistence ではない**: in-memory Map のみ・**process restart で消える**・DB/Supabase 非接触・
 *   production `/plan` 非配線。durable モデル（input-only 保持 → recompute・never-persist firewall）の contract 検証用。
 *
 * 厳守:
 *   - in-memory Map のみ。**Date.now/Math.random/process.env/fetch/DB/Supabase/app・UI/M2 を使わない**。
 *   - 許可 intent（events + owner + inert safeLinks）のみ保存。**forbidden 形（authoritative/raw output/diagnostics/
 *     projection/cues/packet/executionAuthority/booking/calendar/href/generatedUrl/availability/livePrice）は拒否**。
 *   - display-safe read は **private descriptor を返さない**。server/internal read のみ private を含む。
 *   - SafeTravelLinkIntent は inert のまま（href/generatedUrl を付与しない）。
 *   - recompute は **注入された pure 関数のみ**呼ぶ（engine/adapter を import しない）。recompute 出力は **保存しない**（ephemeral）。
 */

import type { SessionSurfaceEvent } from "./travel-session-binding-types";
import type {
  TravelSessionIntentHarnessResult,
  TravelSessionIntentRecord,
  TravelSessionIntentRecordInput,
} from "./travel-session-intent-harness-types";

/** 保存禁止 key（authoritative/raw output/diagnostics/projection/packet/booking/href 等）。 */
const FORBIDDEN_KEYS = new Set<string>([
  "authoritative",
  "executionAuthority",
  "diagnostics",
  "booking",
  "calendar",
  "href",
  "generatedUrl",
  "availability",
  "livePrice",
  "fitLabel",
  "hardBlocks",
  "whyThisPlan",
  "questionQueue",
  "recommendedProposalId",
  "projection",
  "cues",
]);

function collectKeys(value: unknown, acc: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, acc);
  } else if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      acc.add(k);
      collectKeys((value as Record<string, unknown>)[k], acc);
    }
  }
}

function hasForbiddenKey(input: unknown): boolean {
  const keys = new Set<string>();
  collectKeys(input, keys);
  for (const f of FORBIDDEN_KEYS) if (keys.has(f)) return true;
  return false;
}

/** intent payload（recompute 注入関数へ渡す・server/internal）。 */
export interface TravelSessionIntentPayload {
  events: SessionSurfaceEvent[];
  participantIds: string[];
}

export interface InMemoryTravelSessionHarness {
  store(input: TravelSessionIntentRecordInput): TravelSessionIntentHarnessResult;
  /** display-safe read（private descriptor を除去・safeLinks は inert のまま）。 */
  getDisplaySafe(id: string): TravelSessionIntentRecord | null;
  /** server/internal read（private を含む・full record）。 */
  getServerInternal(id: string): TravelSessionIntentRecord | null;
  /** 注入 pure 関数で recompute（owner→participantIds・**出力は保存しない**・ephemeral）。 */
  recompute<T>(id: string, recomputeFn: (intent: TravelSessionIntentPayload) => T): T | null;
}

/** process-memory のみの contract harness を生成（real persistence でない）。 */
export function createInMemoryTravelSessionHarness(): InMemoryTravelSessionHarness {
  const store = new Map<string, TravelSessionIntentRecord>();
  let counter = 0; // ★ Date.now/Math.random を使わない決定論 id

  const clone = (r: TravelSessionIntentRecord): TravelSessionIntentRecord => ({
    id: r.id,
    ownerUserId: r.ownerUserId,
    events: [...r.events],
    safeLinks: [...r.safeLinks],
  });

  return {
    store(input) {
      if (!input || typeof input !== "object" || typeof input.ownerUserId !== "string" || !Array.isArray(input.events)) {
        return { ok: false, error: "invalid_input" };
      }
      // ★ forbidden 形（authoritative/raw/diagnostics/projection/booking/href 等）を拒否
      if (hasForbiddenKey(input)) return { ok: false, error: "forbidden_field" };
      const safeLinks = Array.isArray(input.safeLinks) ? input.safeLinks : [];
      for (const l of safeLinks) {
        if (!l || (l as { inert?: unknown }).inert !== true) return { ok: false, error: "non_inert_safe_link" };
      }
      counter += 1;
      const record: TravelSessionIntentRecord = {
        id: `intent:${counter}`,
        ownerUserId: input.ownerUserId,
        events: [...input.events],
        safeLinks: [...safeLinks],
      };
      store.set(record.id, record);
      return { ok: true, record: clone(record) };
    },

    getServerInternal(id) {
      const r = store.get(id);
      return r ? clone(r) : null;
    },

    getDisplaySafe(id) {
      const r = store.get(id);
      if (!r) return null;
      // private descriptor（visibility:"private"）を除去。他 event は shared by nature。
      const events = r.events.filter((e) => !(e.kind === "descriptor_input" && e.visibility === "private"));
      return { id: r.id, ownerUserId: r.ownerUserId, events: [...events], safeLinks: [...r.safeLinks] };
    },

    recompute(id, recomputeFn) {
      const r = store.get(id);
      if (!r) return null;
      // server/internal intent（full events）→ 注入関数で recompute。★ 出力は保存しない（ephemeral）。
      return recomputeFn({ events: [...r.events], participantIds: [r.ownerUserId] });
    },
  };
}
