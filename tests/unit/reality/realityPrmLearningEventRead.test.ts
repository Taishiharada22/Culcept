/**
 * A1-7-26 PRM Learning Event Read Mapper + Supabase Reader — pure/mock tests（実 DB read 0）。
 *   row→DryRunLearningEvent faithful 再構築 / insert→read round-trip 一致 / 不正 action skip /
 *   reader(mock client) が events を返す・error/null→[]（fail-open）/ read columns に raw/seedRef/user_id/signal なし /
 *   read events を既存 aggregateDryRunEvents に流して観測できる。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { toPrmLearningEventInsertRow } from "@/lib/plan/reality/learning/prm-learning-event-insert";
import {
  prmLearningEventRowToDryRunEvent,
  prmLearningEventRowsToDryRunEvents,
  PRM_LEARNING_EVENT_READ_COLUMNS,
  type PrmLearningEventReadRow,
} from "@/lib/plan/reality/learning/prm-learning-event-read";
import {
  createSupabasePrmLearningEventReader,
  type PrmLearningEventReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { aggregateDryRunEvents } from "@/lib/plan/reality/learning/dry-run-aggregation";

const HANDLE = "c1:" + "a".repeat(64);
const ACTED = "2026-06-15T09:00:00.000Z";
function ctx(p: Partial<CandidateActionContext> = {}): CandidateActionContext {
  return { handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...p };
}
function readRow(action: "accept" | "dismiss" | "later", over: Partial<PrmLearningEventReadRow> = {}): PrmLearningEventReadRow {
  return { handle: HANDLE, action, desired_date: "2026-06-15", band: "afternoon", confidence_band: "high", duration_min: 60, source_kind: "seed_explicit", acted_at: ACTED, ...over };
}

describe("A1-7-26 prmLearningEventRowToDryRunEvent — faithful 再構築", () => {
  it("row → event（signal/hypotheses が action から再導出・context 写る）", () => {
    const e = prmLearningEventRowToDryRunEvent(readRow("dismiss"));
    expect(e.kind).toBe("dry_run_learning_event");
    expect(e.action).toBe("dismiss");
    expect(e.signal).toBe("non_adoption");
    expect(e.hypotheses).toEqual(["not_selected", "not_now", "mismatch_unknown"]);
    expect(e.band).toBe("afternoon");
    expect(e.confidenceBand).toBe("high");
    expect(e.actedAtISO).toBe(ACTED);
    expect(e.certainty).toBe("low");
    expect(e.assertsPreference).toBe(false);
  });

  it("insert→read round-trip: 再構築 event が元 event と一致", () => {
    for (const a of ["accept", "dismiss", "later"] as const) {
      const original = toDryRunLearningEvent(ctx(), a, ACTED);
      const row = toPrmLearningEventInsertRow(original, { capturedAtISO: ACTED, expiresAtISO: "2026-12-12T09:00:00.000Z" });
      const read: PrmLearningEventReadRow = {
        handle: row.handle, action: row.action, desired_date: row.desired_date, band: row.band,
        confidence_band: row.confidence_band, duration_min: row.duration_min, source_kind: row.source_kind, acted_at: row.acted_at,
      };
      expect(prmLearningEventRowToDryRunEvent(read)).toEqual(original); // 完全一致
    }
  });

  it("複数 rows → events（不正 action は skip）", () => {
    const rows = [readRow("accept"), { ...readRow("dismiss"), action: "bogus" as never }, readRow("later")];
    const events = prmLearningEventRowsToDryRunEvents(rows);
    expect(events.map((e) => e.action)).toEqual(["accept", "later"]); // bogus skip
  });

  it("read columns に raw/seedRef/user_id/id/signal が含まれない", () => {
    expect(PRM_LEARNING_EVENT_READ_COLUMNS).not.toMatch(/raw|seed_?ref|source_ref|user_id|\bid\b|signal/);
    expect(PRM_LEARNING_EVENT_READ_COLUMNS).toContain("handle");
    expect(PRM_LEARNING_EVENT_READ_COLUMNS).toContain("acted_at");
  });
});

describe("A1-7-26 createSupabasePrmLearningEventReader — read-only・fail-open・観測", () => {
  function mockClient(mode: { rows?: readonly PrmLearningEventReadRow[]; error?: { message: string }; nullData?: boolean } = {}) {
    const calls: { table: string; cols: string; eqs: [string, string][] }[] = [];
    const client: PrmLearningEventReadClient = {
      from(table) {
        const q = { table, cols: "", eqs: [] as [string, string][] };
        calls.push(q);
        const data = (mode.nullData ? null : (mode.rows ?? [])) as unknown as readonly Record<string, unknown>[] | null;
        const chain = {
          eq(c: string, v: string) { q.eqs.push([c, v]); return chain; },
          order() { return chain; },
          limit() { return Promise.resolve({ data, error: mode.error ?? null }); },
        };
        return { select(cols: string) { q.cols = cols; return chain; } };
      },
    };
    return { client, calls };
  }
  const USER = "99999999-9999-4999-8999-999999999999";

  it("rows → DryRunLearningEvent[]・table/cols/eq(user_id) 正しい", async () => {
    const { client, calls } = mockClient({ rows: [readRow("accept"), readRow("later")] });
    const events = await createSupabasePrmLearningEventReader(client, USER).readLearningEvents();
    expect(events.map((e) => e.signal)).toEqual(["adoption", "deferral"]);
    expect(calls[0]!.table).toBe("prm_learning_events");
    expect(calls[0]!.cols).toBe(PRM_LEARNING_EVENT_READ_COLUMNS);
    expect(calls[0]!.eqs).toContainEqual(["user_id", USER]);
  });

  it("error → []（fail-open）", async () => {
    const { client } = mockClient({ error: { message: "db error" } });
    expect(await createSupabasePrmLearningEventReader(client, USER).readLearningEvents()).toEqual([]);
  });
  it("null data → []（fail-open）", async () => {
    const { client } = mockClient({ nullData: true });
    expect(await createSupabasePrmLearningEventReader(client, USER).readLearningEvents()).toEqual([]);
  });

  it("read events → aggregateDryRunEvents で観測できる（dismiss×3 evening → pattern）", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => readRow("dismiss", { handle: "c1:" + String.fromCharCode(98 + i).repeat(64), band: "evening", acted_at: `2026-06-1${i + 1}T09:00:00.000Z` }));
    const { client } = mockClient({ rows });
    const events = await createSupabasePrmLearningEventReader(client, USER).readLearningEvents();
    const report = aggregateDryRunEvents(events, { dedupeSameDay: true });
    expect(report.totalEvents).toBe(3);
    const band = report.patterns.find((p) => p.dimension === "band" && p.value === "evening");
    expect(band?.dominantAction).toBe("dismiss");
  });
});
