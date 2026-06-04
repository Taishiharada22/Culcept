import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  createColumnRestrictedSeedSource,
  loadGatedActivePlacements,
  clampSeedLimit,
  MAX_SEED_LIMIT,
  type SeedUserContextClient,
  type SeedQuery,
  type SeedFrom,
  type ColumnRestrictedSeedSource,
} from "@/lib/plan/reality/integration/seed-source";
import {
  SEED_COLUMNS_SQL,
  SEED_TABLE,
  type ColumnRestrictedSeedRow,
} from "@/lib/plan/reality/integration/seed-column-restricted";
import { isPlaceable } from "@/lib/plan/reality/seed-placement";
import { generateComplete } from "@/lib/plan/reality/complete-generator";
import type { SmokeGate } from "@/lib/plan/reality/integration/dev-runtime";

// ── spy mock client（実 DB なし・呼び出し記録のみ） ──
interface Calls {
  table: string | null;
  select: string | null;
  eqs: Array<[string, string]>;
  ors: string[];
  limit: number | null;
}
function mockClient(rows: readonly ColumnRestrictedSeedRow[], opts: { error?: { message: string } } = {}) {
  const calls: Calls = { table: null, select: null, eqs: [], ors: [], limit: null };
  const q: SeedQuery = {
    eq(c, v) { calls.eqs.push([c, v]); return q; },
    or(f) { calls.ors.push(f); return q; },
    async limit(n) { calls.limit = n; return opts.error ? { data: null, error: opts.error } : { data: rows, error: null }; },
  };
  const from: SeedFrom = { select(c) { calls.select = c; return q; } };
  const client: SeedUserContextClient = { from(t) { calls.table = t; return from; } };
  return { client, calls };
}
function row(p: Partial<ColumnRestrictedSeedRow> = {}): ColumnRestrictedSeedRow {
  return { id: "s1", user_id: "u1", desired_date: null, desired_time_hint: null, action_shape: null, confidence: 0.9, status: "active", ...p };
}

const SOURCE_PATH = path.join(process.cwd(), "lib/plan/reality/integration/seed-source.ts");
const SOURCE_SRC = fs.readFileSync(SOURCE_PATH, "utf8");
// TS コメント（/* */ と //）除去 → 実コードのみ検査（コメント語の誤検出防止）
const SOURCE_CODE = SOURCE_SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-2-2-2c seed source — column-restricted SELECT 契約", () => {
  it("SELECT は SEED_COLUMNS_SQL（許可列）のみ・'*' なし", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    expect(calls.select).toBe(SEED_COLUMNS_SQL);
    expect(calls.select).toBe("id, user_id, desired_date, desired_time_hint, action_shape, confidence, status");
    expect(calls.select).not.toContain("*");
  });

  it("raw / source_ref を SELECT しない（signal/desired_action/raw_text/title/location/source_ref）", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    for (const forbidden of ["signal", "desired_action", "raw_text", "title", "location", "source_ref"]) {
      expect(calls.select).not.toContain(forbidden);
    }
  });

  it("table は plan_seeds 固定（SEED_TABLE）", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    expect(calls.table).toBe(SEED_TABLE);
    expect(calls.table).toBe("plan_seeds");
  });

  it("bounded: user_id 明示 + status='active' + limit", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedSeedSource(client, { limit: 20 }).loadActivePlacements("u9");
    expect(calls.eqs).toContainEqual(["user_id", "u9"]);
    expect(calls.eqs).toContainEqual(["status", "active"]);
    expect(calls.limit).toBe(20);
  });

  it("limit は clamp される（>50→50・0/負→1・NaN→50）", async () => {
    expect(clampSeedLimit(1000)).toBe(MAX_SEED_LIMIT);
    expect(clampSeedLimit(0)).toBe(1);
    expect(clampSeedLimit(-5)).toBe(1);
    expect(clampSeedLimit(Number.NaN)).toBe(MAX_SEED_LIMIT);
    const { client, calls } = mockClient([]);
    await createColumnRestrictedSeedSource(client, { limit: 9999 }).loadActivePlacements("u1");
    expect(calls.limit).toBe(MAX_SEED_LIMIT);
  });

  it("expired 除外: activeAsOfIso 注入時のみ expires_at の WHERE OR を足す（SELECT には載せない）", async () => {
    const withBound = mockClient([]);
    await createColumnRestrictedSeedSource(withBound.client, { limit: 50, activeAsOfIso: "2026-06-05T00:00:00Z" }).loadActivePlacements("u1");
    expect(withBound.calls.ors.some((f) => f.includes("expires_at"))).toBe(true);
    expect(withBound.calls.select).not.toContain("expires_at"); // WHERE のみ・SELECT しない

    const noBound = mockClient([]);
    await createColumnRestrictedSeedSource(noBound.client, { limit: 50 }).loadActivePlacements("u1");
    expect(noBound.calls.ors.length).toBe(0); // 注入なし → expires_at フィルタなし
  });
});

describe("A1-5-2-2-2c seed source — projection（active のみ・durationMin null・placeable=false）", () => {
  it("active 行のみ projection（consumed/expired/rejected 除外）", async () => {
    const { client } = mockClient([
      row({ id: "a", status: "active" }),
      row({ id: "b", status: "consumed" }),
      row({ id: "c", status: "expired" }),
      row({ id: "d", status: "rejected" }),
    ]);
    const placements = await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    expect(placements?.map((p) => p.seedRef)).toEqual(["a"]);
  });

  it("durationMin=null / durationSource=unknown / placeable=false", async () => {
    const { client } = mockClient([row({ id: "s1", desired_date: "2026-06-06", action_shape: "full_go" })]);
    const placements = (await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1")) ?? [];
    expect(placements.length).toBe(1);
    for (const p of placements) {
      expect(p.durationMin).toBeNull();
      expect(p.durationSource).toBe("unknown");
      expect(isPlaceable(p)).toBe(false);
    }
  });

  it("projection 結果を generateComplete に流しても candidateCount=0（durationMin null）", async () => {
    const { client } = mockClient([row({ id: "s1", desired_date: "2026-06-06", desired_time_hint: "morning", action_shape: "full_go" })]);
    const placements = (await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1")) ?? [];
    const draft = generateComplete({
      placements,
      existing: [],
      activeWindow: { startMin: 480, endMin: 1080 },
      date: "2026-06-06",
      bandBounds: { morning: { startMin: 480, endMin: 720 } },
    });
    expect(draft).toBeNull(); // durationMin null → isPlaceable false → candidate 0
  });

  it("空表 → rowsRead 0 → placements 空 → candidateCount 0（A1-5-2-2-2b smoke 期待値）", async () => {
    const { client } = mockClient([]);
    const placements = await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    expect(placements).toEqual([]);
    expect(generateComplete({ placements: placements ?? [], existing: [], activeWindow: { startMin: 480, endMin: 1080 }, date: "2026-06-06" })).toBeNull();
  });

  it("error / data null → null（fail-soft・raw を投げない）", async () => {
    const { client } = mockClient([], { error: { message: "boom" } });
    const placements = await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    expect(placements).toBeNull();
  });

  it("raw 混入 row でも出力に raw が出ない（signal/desired_action は読まれない）", async () => {
    const dirty = { ...row({ id: "s1", desired_date: "2026-06-06", action_shape: "full_go" }), signal: "RAW_X", desired_action: "RAW_Y" } as unknown as ColumnRestrictedSeedRow;
    const { client } = mockClient([dirty]);
    const placements = await createColumnRestrictedSeedSource(client, { limit: 50 }).loadActivePlacements("u1");
    const json = JSON.stringify(placements);
    expect(json).not.toContain("RAW_X");
    expect(json).not.toContain("RAW_Y");
  });
});

describe("A1-5-2-2-2c seed source — gate fail-closed（load 0）", () => {
  const base: SmokeGate = { nodeEnv: "development", flagEnabled: true, capability: "dev-only", requestedUserId: "u1", allowedDevUserId: "u1" };
  function spySource() {
    const state = { loads: 0 };
    const source: ColumnRestrictedSeedSource = { async loadActivePlacements() { state.loads += 1; return []; } };
    return { source, state };
  }

  it("production → load 0（source は呼ばれない）", async () => {
    const sp = spySource();
    const out = await loadGatedActivePlacements({ ...base, nodeEnv: "production" }, sp.source);
    expect(out).toEqual([]);
    expect(sp.state.loads).toBe(0);
  });
  it("flag off → load 0", async () => {
    const sp = spySource();
    expect(await loadGatedActivePlacements({ ...base, flagEnabled: false }, sp.source)).toEqual([]);
    expect(sp.state.loads).toBe(0);
  });
  it("capability mismatch → load 0", async () => {
    const sp = spySource();
    expect(await loadGatedActivePlacements({ ...base, capability: undefined }, sp.source)).toEqual([]);
    expect(sp.state.loads).toBe(0);
  });
  it("user mismatch → load 0", async () => {
    const sp = spySource();
    expect(await loadGatedActivePlacements({ ...base, requestedUserId: "intruder" }, sp.source)).toEqual([]);
    expect(sp.state.loads).toBe(0);
  });
  it("全条件 pass → source.load が呼ばれる", async () => {
    const sp = spySource();
    await loadGatedActivePlacements(base, sp.source);
    expect(sp.state.loads).toBe(1);
  });
});

describe("A1-5-2-2-2c seed source — 静的安全（service_role 0 / DB write 0 / from 限定）", () => {
  it("service_role / createClient を import しない", () => {
    expect(SOURCE_CODE).not.toContain("service_role");
    expect(SOURCE_CODE).not.toContain("service role");
    expect(SOURCE_CODE).not.toContain("createClient");
    expect(SOURCE_CODE).not.toContain("SERVICE_ROLE");
  });

  it("DB write（insert/update/delete/upsert）を持たない", () => {
    for (const w of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(SOURCE_CODE).not.toContain(w);
    }
  });

  it("'*' SELECT を持たない", () => {
    expect(SOURCE_CODE).not.toContain('select("*")');
    expect(SOURCE_CODE).not.toContain("select('*')");
  });

  it(".from(...) は SEED_TABLE 経由（plan_seeds リテラル直書きしない）", () => {
    expect(SOURCE_CODE).toContain(".from(SEED_TABLE)");
    expect(SOURCE_CODE).not.toContain('.from("plan_seeds")');
    expect(SOURCE_CODE).not.toContain(".from('plan_seeds')");
  });

  it("reality tree 内で plan_seeds 読取 query を持つのは seed-source.ts のみ（.from(SEED_TABLE)）", () => {
    const root = path.join(process.cwd(), "lib/plan/reality");
    const files = fs.readdirSync(root, { recursive: true }) as string[];
    const offenders: string[] = [];
    for (const rel of files) {
      if (!rel.endsWith(".ts")) continue;
      const full = path.join(root, rel);
      const raw = fs.readFileSync(full, "utf8");
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      if (/\.from\(\s*SEED_TABLE\s*\)/.test(code) || /\.from\(\s*["']plan_seeds["']\s*\)/.test(code)) {
        offenders.push(rel.replace(/\\/g, "/"));
      }
    }
    expect(offenders).toEqual(["integration/seed-source.ts"]);
  });
});
