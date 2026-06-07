/**
 * A1-6-5d Part 2 Consumed Seed Repository — pure/no-run tests（mock client・no real DB read）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.10
 *
 * real reader の query 構築 + row→ReflectableConsumedSeed map を mock client で検証:
 *   plan_seeds eq(user_id).eq(status,consumed) + duration_evidences in(seed_id) / durationMin enrich /
 *   seedRef→handle / consumed のみ / seedRef 非出。実 DB read 0（mock）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  createConsumedSeedRepository,
  type ConsumedSeedReadClient,
} from "@/lib/plan/reality/integration/consumed-seed-repository-supabase";
import { deriveCandidateHandle } from "@/lib/plan/reality/integration/candidate-action-handle";

const USER = "99999999-9999-4999-8999-999999999999";
const SEED_A = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

/** mock client: table ごとに canned rows を返し、query（eqs/ins/select/table）を記録。 */
function mockClient(byTable: Record<string, Row[]>) {
  const queries: { table: string; select: string; eqs: [string, string][]; ins: [string, readonly string[]][] }[] = [];
  const client: ConsumedSeedReadClient = {
    from(table: string) {
      const q = { table, select: "", eqs: [] as [string, string][], ins: [] as [string, readonly string[]][] };
      queries.push(q);
      const chain = {
        eq(c: string, v: string) {
          q.eqs.push([c, v]);
          return chain;
        },
        in(c: string, vs: readonly string[]) {
          q.ins.push([c, vs]);
          return chain;
        },
        async limit() {
          return { data: byTable[table] ?? [], error: null };
        },
      };
      return {
        select(cols: string) {
          q.select = cols;
          return chain;
        },
      };
    },
  };
  return { client, queries };
}

describe("A1-6-5d Part 2 createConsumedSeedRepository — consumed read + duration enrich → ReflectableConsumedSeed", () => {
  it("consumed row + high evidence → ReflectableConsumedSeed（handle・durationMin from evidence・seedRef 非出）", async () => {
    const { client } = mockClient({
      plan_seeds: [{ id: SEED_A, user_id: USER, desired_date: "2026-06-07", desired_time_hint: "afternoon", action_shape: "full_go", confidence: 0.9, status: "consumed" }],
      plan_seed_duration_evidences: [{ seed_id: SEED_A, duration_min: 60, source: "seed_explicit", confidence: "high" }],
    });
    const result = await createConsumedSeedRepository(client, USER).readReflectableConsumedSeeds({ date: "2026-06-07" });
    expect(result).toEqual([
      { status: "consumed", durationMin: 60, date: "2026-06-07", band: "afternoon", actionShape: "full_go", handle: deriveCandidateHandle(SEED_A) },
    ]);
    expect(JSON.stringify(result)).not.toContain(SEED_A); // seedRef 非出（handle のみ）
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("query: plan_seeds eq(user_id).eq(status,consumed) + duration_evidences in(seed_id)", async () => {
    const { client, queries } = mockClient({
      plan_seeds: [{ id: SEED_A, user_id: USER, desired_date: null, desired_time_hint: "anytime", action_shape: null, confidence: 0.5, status: "consumed" }],
      plan_seed_duration_evidences: [],
    });
    await createConsumedSeedRepository(client, USER).readReflectableConsumedSeeds({ date: "2026-06-07" });
    const seedQ = queries.find((q) => q.table === "plan_seeds")!;
    expect(seedQ.eqs).toEqual([["user_id", USER], ["status", "consumed"]]); // consumed のみ・user-RLS
    const evQ = queries.find((q) => q.table === "plan_seed_duration_evidences")!;
    expect(evQ.eqs).toContainEqual(["user_id", USER]);
    expect(evQ.ins).toEqual([["seed_id", [SEED_A]]]);
  });

  it("evidence なし → durationMin null（merge guard で除外される）", async () => {
    const { client } = mockClient({
      plan_seeds: [{ id: SEED_A, user_id: USER, desired_date: "2026-06-07", desired_time_hint: "morning", action_shape: null, confidence: 0.9, status: "consumed" }],
      plan_seed_duration_evidences: [],
    });
    const result = await createConsumedSeedRepository(client, USER).readReflectableConsumedSeeds({ date: "2026-06-07" });
    expect(result[0]!.durationMin).toBeNull();
  });

  it("anytime time_hint → band null / 不正 action_shape → null", async () => {
    const { client } = mockClient({
      plan_seeds: [{ id: SEED_A, user_id: USER, desired_date: "2026-06-07", desired_time_hint: "anytime", action_shape: "garbage", confidence: 0.9, status: "consumed" }],
      plan_seed_duration_evidences: [{ seed_id: SEED_A, duration_min: 30, source: "seed_explicit", confidence: "high" }],
    });
    const result = await createConsumedSeedRepository(client, USER).readReflectableConsumedSeeds({ date: "2026-06-07" });
    expect(result[0]!.band).toBeNull();
    // action_shape は DB CHECK 済前提だが loose に pass-through（merge は label の commitment 修飾にのみ使う）
  });

  it("consumed seed なし → []（merge は no-op）", async () => {
    const { client } = mockClient({ plan_seeds: [], plan_seed_duration_evidences: [] });
    expect(await createConsumedSeedRepository(client, USER).readReflectableConsumedSeeds({ date: "2026-06-07" })).toEqual([]);
  });
});

describe("A1-6-5d Part 2 静的安全（server-only・column-restricted・read-only・no service_role）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/consumed-seed-repository-supabase.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("server-only + read-only（createClient/service_role/.insert/.update/.delete/source_ref を持たない）", () => {
    expect(code).toContain("server-only");
    for (const t of ["createClient", "service_role", ".insert(", ".update(", ".delete(", ".upsert(", "source_ref", "external_anchor", "generateComplete", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(integration/index.ts) が consumed-seed-repository-supabase を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("consumed-seed-repository-supabase");
  });
});
