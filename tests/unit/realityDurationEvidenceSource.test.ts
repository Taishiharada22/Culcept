import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  createColumnRestrictedDurationEvidenceSource,
  loadGatedDurationEvidenceMap,
  projectDurationEvidenceRowsToMap,
  clampDurationEvidenceLimit,
  MAX_DURATION_EVIDENCE_LIMIT,
  ALLOWED_DURATION_EVIDENCE_COLUMNS,
  FORBIDDEN_DURATION_EVIDENCE_COLUMNS,
  DURATION_EVIDENCE_COLUMNS_SQL,
  EVIDENCE_TABLE,
  type ColumnRestrictedDurationEvidenceRow,
  type ColumnRestrictedDurationEvidenceSource,
  type DurationEvidenceUserContextClient,
  type DurationEvidenceQuery,
  type DurationEvidenceFrom,
} from "@/lib/plan/reality/integration/duration-evidence-source";
import { enrichSeedPlacementsFromEvidences } from "@/lib/plan/reality/seed-placement-enrich";
import { projectSeedRowsToPlacements, type ColumnRestrictedSeedRow } from "@/lib/plan/reality/integration/seed-column-restricted";
import { generateComplete } from "@/lib/plan/reality/complete-generator";
import type { SeedPlacement } from "@/lib/plan/reality/seed-placement";
import type { SmokeGate } from "@/lib/plan/reality/integration/dev-runtime";

interface Calls {
  table: string | null;
  select: string | null;
  eqs: Array<[string, string]>;
  ins: Array<[string, string[]]>;
  ors: string[];
  limit: number | null;
}
function mockClient(rows: readonly ColumnRestrictedDurationEvidenceRow[], opts: { error?: { message: string } } = {}) {
  const calls: Calls = { table: null, select: null, eqs: [], ins: [], ors: [], limit: null };
  const q: DurationEvidenceQuery = {
    eq(c, v) { calls.eqs.push([c, v]); return q; },
    in(c, vals) { calls.ins.push([c, [...vals]]); return q; },
    or(f) { calls.ors.push(f); return q; },
    async limit(n) { calls.limit = n; return opts.error ? { data: null, error: opts.error } : { data: rows, error: null }; },
  };
  const from: DurationEvidenceFrom = { select(c) { calls.select = c; return q; } };
  const client: DurationEvidenceUserContextClient = { from(t) { calls.table = t; return from; } };
  return { client, calls };
}
function row(p: Partial<ColumnRestrictedDurationEvidenceRow> = {}): ColumnRestrictedDurationEvidenceRow {
  return { id: "e1", user_id: "u1", seed_id: "s1", duration_min: 60, source: "seed_explicit", confidence: "high", ...p };
}
function placement(seedRef = "s1"): readonly SeedPlacement[] {
  const rows: ColumnRestrictedSeedRow[] = [
    { id: seedRef, user_id: "u1", desired_date: "2026-06-06", desired_time_hint: "morning", action_shape: "full_go", confidence: 0.9, status: "active" },
  ];
  return projectSeedRowsToPlacements(rows);
}
function complete(placements: readonly SeedPlacement[]) {
  return generateComplete({ placements, existing: [], activeWindow: { startMin: 480, endMin: 1080 }, date: "2026-06-06", bandBounds: { morning: { startMin: 480, endMin: 720 } } });
}
const SRC_PATH = path.join(process.cwd(), "lib/plan/reality/integration/duration-evidence-source.ts");
const SRC = fs.readFileSync(SRC_PATH, "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-3b-3 column 契約", () => {
  it("ALLOWED は structured-only（source_ref / raw を含まない）", () => {
    expect([...ALLOWED_DURATION_EVIDENCE_COLUMNS]).toEqual(["id", "user_id", "seed_id", "duration_min", "source", "confidence"]);
    expect(ALLOWED_DURATION_EVIDENCE_COLUMNS as readonly string[]).not.toContain("source_ref");
  });
  it("FORBIDDEN に source_ref + raw", () => {
    for (const f of ["source_ref", "signal", "desired_action", "raw_text", "title", "location"]) {
      expect(FORBIDDEN_DURATION_EVIDENCE_COLUMNS as readonly string[]).toContain(f);
    }
  });
  it("DURATION_EVIDENCE_COLUMNS_SQL に '*' / source_ref / raw が含まれない", () => {
    expect(DURATION_EVIDENCE_COLUMNS_SQL).toBe("id, user_id, seed_id, duration_min, source, confidence");
    expect(DURATION_EVIDENCE_COLUMNS_SQL).not.toContain("*");
    for (const f of ["source_ref", "signal", "desired_action", "raw_text", "title", "location"]) expect(DURATION_EVIDENCE_COLUMNS_SQL).not.toContain(f);
    expect(EVIDENCE_TABLE).toBe("plan_seed_duration_evidences");
  });
});

describe("A1-5-3b-3 source — query shape", () => {
  it("SELECT は ALLOWED のみ・'*' / source_ref / raw なし", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedDurationEvidenceSource(client, { seedIds: ["s1"], limit: 200 }).loadEvidenceMap("u1");
    expect(calls.select).toBe(DURATION_EVIDENCE_COLUMNS_SQL);
    expect(calls.select).not.toContain("*");
    for (const f of ["source_ref", "signal", "desired_action", "raw_text", "title", "location"]) expect(calls.select).not.toContain(f);
  });
  it("table は plan_seed_duration_evidences", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedDurationEvidenceSource(client, { seedIds: ["s1"], limit: 200 }).loadEvidenceMap("u1");
    expect(calls.table).toBe(EVIDENCE_TABLE);
  });
  it("bounded: user_id eq + seed_id in + limit", async () => {
    const { client, calls } = mockClient([]);
    await createColumnRestrictedDurationEvidenceSource(client, { seedIds: ["a", "b"], limit: 50 }).loadEvidenceMap("u9");
    expect(calls.eqs).toContainEqual(["user_id", "u9"]);
    expect(calls.ins).toContainEqual(["seed_id", ["a", "b"]]);
    expect(calls.limit).toBe(50);
  });
  it("limit clamp（>上限→上限・0→1・NaN→上限）", async () => {
    expect(clampDurationEvidenceLimit(99999)).toBe(MAX_DURATION_EVIDENCE_LIMIT);
    expect(clampDurationEvidenceLimit(0)).toBe(1);
    expect(clampDurationEvidenceLimit(Number.NaN)).toBe(MAX_DURATION_EVIDENCE_LIMIT);
    const { client, calls } = mockClient([]);
    await createColumnRestrictedDurationEvidenceSource(client, { seedIds: ["s1"], limit: 99999 }).loadEvidenceMap("u1");
    expect(calls.limit).toBe(MAX_DURATION_EVIDENCE_LIMIT);
  });
  it("expired 除外: activeAsOfIso 注入時のみ expires_at OR（SELECT には載せない）", async () => {
    const w = mockClient([]);
    await createColumnRestrictedDurationEvidenceSource(w.client, { seedIds: ["s1"], limit: 200, activeAsOfIso: "2026-06-05T00:00:00Z" }).loadEvidenceMap("u1");
    expect(w.calls.ors.some((f) => f.includes("expires_at"))).toBe(true);
    expect(w.calls.select).not.toContain("expires_at");
    const n = mockClient([]);
    await createColumnRestrictedDurationEvidenceSource(n.client, { seedIds: ["s1"], limit: 200 }).loadEvidenceMap("u1");
    expect(n.calls.ors.length).toBe(0);
  });
  it("seedIds 空 → load 0（query 未発行・{}）", async () => {
    const { client, calls } = mockClient([row()]);
    const map = await createColumnRestrictedDurationEvidenceSource(client, { seedIds: [], limit: 200 }).loadEvidenceMap("u1");
    expect(map).toEqual({});
    expect(calls.table).toBeNull();
  });
  it("error / data null → null", async () => {
    const { client } = mockClient([], { error: { message: "boom" } });
    expect(await createColumnRestrictedDurationEvidenceSource(client, { seedIds: ["s1"], limit: 200 }).loadEvidenceMap("u1")).toBeNull();
  });
  it("source 経由でも valid row → map（query→projection 一気通貫）", async () => {
    const { client } = mockClient([row({ seed_id: "s1", source: "seed_explicit", duration_min: 60, confidence: "high" })]);
    const map = await createColumnRestrictedDurationEvidenceSource(client, { seedIds: ["s1"], limit: 200 }).loadEvidenceMap("u1");
    expect(map?.["s1"]?.[0]).toEqual({ seedRef: "s1", durationMin: 60, source: "seed_explicit", confidence: "high" });
  });
});

describe("A1-5-3b-3 projection — adoptable のみ（high ∧ range ∧ source）", () => {
  it("valid high row → DurationEvidence map", () => {
    const map = projectDurationEvidenceRowsToMap([row({ seed_id: "s1", duration_min: 60, source: "seed_explicit", confidence: "high" })]);
    expect(map["s1"]?.length).toBe(1);
    expect(map["s1"]?.[0]).toEqual({ seedRef: "s1", durationMin: 60, source: "seed_explicit", confidence: "high" });
  });
  it("duration_min は >1 のみ（<=1 / >1440 → 非 evidence 化）", () => {
    expect(projectDurationEvidenceRowsToMap([row({ duration_min: 1 })])).toEqual({});
    expect(projectDurationEvidenceRowsToMap([row({ duration_min: 0 })])).toEqual({});
    expect(projectDurationEvidenceRowsToMap([row({ duration_min: 2000 })])).toEqual({});
  });
  it("invalid source → 非 evidence 化", () => {
    expect(projectDurationEvidenceRowsToMap([row({ source: "garbage" })])).toEqual({});
  });
  it("low / 不正 confidence → 非 evidence 化", () => {
    expect(projectDurationEvidenceRowsToMap([row({ confidence: "low" })])).toEqual({});
    expect(projectDurationEvidenceRowsToMap([row({ confidence: "bogus" })])).toEqual({});
  });
  it("seedRef ごとに集約（低信頼 row は除外）", () => {
    const map = projectDurationEvidenceRowsToMap([
      row({ seed_id: "a", source: "seed_explicit", duration_min: 60 }),
      row({ seed_id: "a", source: "prm_typical", duration_min: 30 }),
      row({ seed_id: "b", source: "correction", duration_min: 45 }),
      row({ seed_id: "c", confidence: "low" }),
    ]);
    expect(Object.keys(map).sort()).toEqual(["a", "b"]);
    expect(map["a"]?.length).toBe(2);
  });
  it("raw / source_ref 混入 row でも出力に出ない（型に無く読まれない）", () => {
    const dirty = { ...row({ seed_id: "s1" }), source_ref: "REF_X", signal: "RAW_Y" } as unknown as ColumnRestrictedDurationEvidenceRow;
    const json = JSON.stringify(projectDurationEvidenceRowsToMap([dirty]));
    expect(json).not.toContain("REF_X");
    expect(json).not.toContain("RAW_Y");
  });
});

describe("A1-5-3b-3 pipeline — candidateCount（map→enrich→generateComplete）", () => {
  it("seed_explicit high → candidateCount>0", () => {
    const map = projectDurationEvidenceRowsToMap([row({ seed_id: "s1", source: "seed_explicit", duration_min: 60, confidence: "high" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBe(60);
    expect(enriched[0]?.grounding).toBe("strong");
    expect(complete(enriched)).not.toBeNull();
  });
  it("correction high → candidateCount>0", () => {
    const map = projectDurationEvidenceRowsToMap([row({ seed_id: "s1", source: "correction", duration_min: 60, confidence: "high" })]);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.grounding).toBe("strong");
    expect(complete(enriched)).not.toBeNull();
  });
  it("prm_typical high → map に入るが grounding weak → candidateCount=0", () => {
    const map = projectDurationEvidenceRowsToMap([row({ seed_id: "s1", source: "prm_typical", duration_min: 60, confidence: "high" })]);
    expect(map["s1"]?.length).toBe(1);
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), map);
    expect(enriched[0]?.durationMin).toBe(60);
    expect(enriched[0]?.grounding).toBe("weak");
    expect(complete(enriched)).toBeNull();
  });
  it("空 map → candidateCount=0", () => {
    const enriched = enrichSeedPlacementsFromEvidences(placement("s1"), {});
    expect(enriched[0]?.durationMin).toBeNull();
    expect(complete(enriched)).toBeNull();
  });
});

describe("A1-5-3b-3 gate fail-closed（load 0）", () => {
  const base: SmokeGate = { nodeEnv: "development", flagEnabled: true, capability: "dev-only", requestedUserId: "u1", allowedDevUserId: "u1" };
  function spySource() {
    const state = { loads: 0 };
    const source: ColumnRestrictedDurationEvidenceSource = { async loadEvidenceMap() { state.loads += 1; return {}; } };
    return { source, state };
  }
  it("production → {} ・source 呼ばれない", async () => {
    const sp = spySource();
    expect(await loadGatedDurationEvidenceMap({ ...base, nodeEnv: "production" }, sp.source)).toEqual({});
    expect(sp.state.loads).toBe(0);
  });
  it("flag off → {}", async () => { const sp = spySource(); expect(await loadGatedDurationEvidenceMap({ ...base, flagEnabled: false }, sp.source)).toEqual({}); expect(sp.state.loads).toBe(0); });
  it("capability mismatch → {}", async () => { const sp = spySource(); expect(await loadGatedDurationEvidenceMap({ ...base, capability: undefined }, sp.source)).toEqual({}); expect(sp.state.loads).toBe(0); });
  it("user mismatch → {}", async () => { const sp = spySource(); expect(await loadGatedDurationEvidenceMap({ ...base, requestedUserId: "intruder" }, sp.source)).toEqual({}); expect(sp.state.loads).toBe(0); });
  it("pass → source 呼ばれる", async () => { const sp = spySource(); await loadGatedDurationEvidenceMap(base, sp.source); expect(sp.state.loads).toBe(1); });
});

describe("A1-5-3b-3 静的安全", () => {
  it("service_role / createClient を import しない", () => {
    expect(CODE).not.toContain("service_role");
    expect(CODE).not.toContain("createClient");
    expect(CODE).not.toContain("SERVICE_ROLE");
  });
  it("DB write（insert/update/delete/upsert）を持たない", () => {
    for (const w of [".insert(", ".update(", ".delete(", ".upsert("]) expect(CODE).not.toContain(w);
  });
  it("'*' SELECT を持たない", () => {
    expect(CODE).not.toContain('select("*")');
    expect(CODE).not.toContain("select('*')");
  });
  it(".from(...) は EVIDENCE_TABLE 経由（リテラル直書きしない）", () => {
    expect(CODE).toContain(".from(EVIDENCE_TABLE)");
    expect(CODE).not.toContain('.from("plan_seed_duration_evidences")');
  });
  it("reality tree 内で evidence 読取 query を持つのは公認 2 file のみ（allowlist・無断追加を検出）", () => {
    const root = path.join(process.cwd(), "lib/plan/reality");
    const files = fs.readdirSync(root, { recursive: true }) as string[];
    const offenders: string[] = [];
    for (const rel of files) {
      if (!rel.endsWith(".ts")) continue;
      const raw = fs.readFileSync(path.join(root, rel), "utf8");
      const c = raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      if (/\.from\(\s*EVIDENCE_TABLE\s*\)/.test(c) || /\.from\(\s*["']plan_seed_duration_evidences["']\s*\)/.test(c)) {
        offenders.push(rel.replace(/\\/g, "/"));
      }
    }
    expect(offenders.sort()).toEqual([
      "integration/consumed-seed-repository-supabase.ts", // A1-6-5d Part2 consumed reader（DURATION_EVIDENCE_COLUMNS_SQL 限定・user-RLS・staging smoke PASS 済）
      "integration/duration-evidence-source.ts",
    ]);
  });
  it("barrel(integration/index.ts) が duration-evidence-source を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("duration-evidence-source");
  });
});
