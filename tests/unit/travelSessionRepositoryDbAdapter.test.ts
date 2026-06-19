/**
 * Durable DB Repository Port + Adapter tests（mock port・pure mapping・real DB なし）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTravelSessionRepositoryFromDbPort } from "@/lib/server/travel/travel-session-repository-db-adapter";
import type {
  TravelSessionDbPort,
  PlanTravelSessionRow,
  PlanTravelSessionInputRow,
  PlanTravelSessionLinkRow,
  PlanTravelSessionInputInsertRow,
  PlanTravelSessionLinkInsertRow,
} from "@/lib/server/travel/travel-session-db-port";
import type { TravelSessionPersistenceWriteInput } from "@/lib/shared/travel/travel-session-persistence-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const ADAPTER_SRC = strip(readFileSync(resolve(process.cwd(), "lib/server/travel/travel-session-repository-db-adapter.ts"), "utf8"));
const PORT_SRC = strip(readFileSync(resolve(process.cwd(), "lib/server/travel/travel-session-db-port.ts"), "utf8"));

/** in-memory mock port（real DB なし・id/timestamp 採番・insert row を capture）。 */
function createMockPort() {
  let n = 0;
  const sessions: PlanTravelSessionRow[] = [];
  const inputs: PlanTravelSessionInputRow[] = [];
  const links: PlanTravelSessionLinkRow[] = [];
  const captured = { sessionInserts: 0, inputInserts: [] as PlanTravelSessionInputInsertRow[], linkInserts: [] as PlanTravelSessionLinkInsertRow[] };
  const port: TravelSessionDbPort = {
    async insertSession(row) {
      captured.sessionInserts += 1;
      const s: PlanTravelSessionRow = { id: `s${++n}`, ...row, created_at: "T", updated_at: "T" };
      sessions.push(s);
      return s;
    },
    async insertInputs(rows) {
      captured.inputInserts.push(...rows);
      const out = rows.map((r) => ({ id: `i${++n}`, ...r, created_at: "T", updated_at: "T" }) as PlanTravelSessionInputRow);
      inputs.push(...out);
      return out;
    },
    async insertLinks(rows) {
      captured.linkInserts.push(...rows);
      const out = rows.map((r) => ({ id: `l${++n}`, ...r, created_at: "T" }) as PlanTravelSessionLinkRow);
      links.push(...out);
      return out;
    },
    async selectBundleByOwner(sessionId, ownerUserId) {
      const s = sessions.find((x) => x.id === sessionId && x.owner_user_id === ownerUserId);
      if (!s) return null;
      return { session: s, inputs: inputs.filter((x) => x.session_id === sessionId), links: links.filter((x) => x.session_id === sessionId) };
    },
    async listByOwner(ownerUserId) {
      return sessions.filter((x) => x.owner_user_id === ownerUserId);
    },
    async deleteByOwner(sessionId, ownerUserId) {
      const i = sessions.findIndex((x) => x.id === sessionId && x.owner_user_id === ownerUserId);
      if (i < 0) return false;
      sessions.splice(i, 1);
      return true;
    },
  };
  return { port, captured, sessions, inputs, links };
}

const writeInput = (over: Partial<TravelSessionPersistenceWriteInput> = {}): TravelSessionPersistenceWriteInput => ({
  ownerUserId: "u1",
  status: "draft",
  visibility: "shared",
  inputs: [
    { slotKey: "destination_area", value: { areaText: "京都" }, slotStatus: "confirmed", fillState: "filled", owner: { kind: "shared" }, visibility: "shared", provenance: { refIds: ["f1"] } },
  ],
  links: [
    { source: "user_provided", externalReference: "https://a.com/1", generated: false, inert: true, eligibility: "eligible", visibility: "shared", provenance: { refIds: [] }, renderable: true },
  ],
  ...over,
});

describe("1. save → port に session/input/link rows（snake_case）を渡す", () => {
  it("write input が DB row 形に mapping されて port へ", async () => {
    const { port, captured } = createMockPort();
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const r = await repo.saveTravelSessionIntent(writeInput());
    expect(r.ok).toBe(true);
    expect(captured.sessionInserts).toBe(1);
    // input row は snake_case（slot_key/session_id/owner_kind/slot_status/fill_state）
    expect(captured.inputInserts[0]).toMatchObject({ slot_key: "destination_area", owner_kind: "shared", slot_status: "confirmed", fill_state: "filled" });
    expect(captured.inputInserts[0].session_id).toMatch(/^s\d+$/);
    // link row は snake_case・generated=false/inert=true 固定
    expect(captured.linkInserts[0]).toMatchObject({ source: "user_provided", external_reference: "https://a.com/1", generated: false, inert: true });
  });
  it("返り bundle は camelCase PersistedTravelSessionBundle（session/inputs/links のみ）", async () => {
    const { port } = createMockPort();
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const r = await repo.saveTravelSessionIntent(writeInput());
    if (!r.ok) throw new Error("ok 期待");
    expect(Object.keys(r.bundle).sort()).toEqual(["inputs", "links", "session"]);
    expect(r.bundle.inputs[0].slotKey).toBe("destination_area");
    expect(r.bundle.links[0].externalReference).toBe("https://a.com/1");
    expect(r.bundle.links[0].inert).toBe(true);
    expect(r.bundle.links[0].generated).toBe(false);
  });
});

describe("2. load / list / delete（owner-scoped）", () => {
  it("load は rows を PersistedTravelSessionBundle に戻す", async () => {
    const { port } = createMockPort();
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const saved = await repo.saveTravelSessionIntent(writeInput());
    if (!saved.ok) throw new Error("ok 期待");
    const loaded = await repo.loadTravelSessionIntent(saved.bundle.session.id, "u1");
    expect(loaded).not.toBeNull();
    expect(loaded!.inputs[0].slotKey).toBe("destination_area");
    expect(loaded!.session.ownerUserId).toBe("u1");
    expect(await repo.loadTravelSessionIntent(saved.bundle.session.id, "other")).toBeNull(); // owner-scoped
  });
  it("list は session のみ（display field なし）", async () => {
    const { port } = createMockPort();
    const repo = createTravelSessionRepositoryFromDbPort(port);
    await repo.saveTravelSessionIntent(writeInput());
    const list = await repo.listTravelSessionIntents("u1");
    expect(list.length).toBe(1);
    expect(Object.keys(list[0]).sort()).toEqual(["createdAt", "id", "ownerUserId", "status", "updatedAt", "visibility"]);
  });
  it("delete は owner/session scoped（不一致→false）", async () => {
    const { port } = createMockPort();
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const saved = await repo.saveTravelSessionIntent(writeInput());
    if (!saved.ok) throw new Error("ok 期待");
    expect((await repo.deleteTravelSessionIntent(saved.bundle.session.id, "other")).ok).toBe(false);
    expect((await repo.deleteTravelSessionIntent(saved.bundle.session.id, "u1")).ok).toBe(true);
    expect(await repo.loadTravelSessionIntent(saved.bundle.session.id, "u1")).toBeNull();
  });
});

describe("3. forbidden field は port insert 前に reject", () => {
  it("href を含む link → forbidden_field・port insert されない", async () => {
    const { port, captured } = createMockPort();
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const bad = writeInput();
    (bad.links[0] as Record<string, unknown>).href = "https://x";
    const r = await repo.saveTravelSessionIntent(bad);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("reject 期待");
    expect(r.error).toBe("forbidden_field");
    expect(captured.sessionInserts).toBe(0); // port に書かれない
  });
  it("generatedUrl / diagnostics / projection / cues / booking → forbidden_field", async () => {
    const repo = createTravelSessionRepositoryFromDbPort(createMockPort().port);
    for (const key of ["generatedUrl", "diagnostics", "projection", "cues", "booking", "availability", "price"]) {
      const bad = writeInput();
      (bad.inputs[0] as Record<string, unknown>)[key] = "x";
      expect((await repo.saveTravelSessionIntent(bad)).ok).toBe(false);
    }
  });
  it("inert でない link → non_inert_link", async () => {
    const repo = createTravelSessionRepositoryFromDbPort(createMockPort().port);
    const bad = writeInput();
    (bad.links[0] as Record<string, unknown>).inert = false;
    const r = await repo.saveTravelSessionIntent(bad);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("reject 期待");
    expect(r.error).toBe("non_inert_link");
  });
});

describe("4. persisted model の型が generated/source を制約（compile-time）", () => {
  it("generated:true は型が許さない・generated_maps_search source も許さない", async () => {
    const repo = createTravelSessionRepositoryFromDbPort(createMockPort().port);
    const r = await repo.saveTravelSessionIntent(
      writeInput({
        links: [
          // @ts-expect-error generated は false literal・generated:true は型エラー
          { source: "user_provided", externalReference: "https://x", generated: true, inert: true, eligibility: "eligible", visibility: "shared", provenance: { refIds: [] }, renderable: true },
        ],
      }),
    );
    // 型エラーを cast で通した場合でも adapter は insert row で generated=false 固定
    if (r.ok) expect(r.bundle.links[0].generated).toBe(false);
  });
  it("generated_maps_search source は PersistedTravelLinkSource に無い（型）", async () => {
    const repo = createTravelSessionRepositoryFromDbPort(createMockPort().port);
    await repo.saveTravelSessionIntent(
      writeInput({
        links: [
          // @ts-expect-error generated_maps_search は PersistedTravelLinkSource に含まれない
          { source: "generated_maps_search", externalReference: "https://x", generated: false, inert: true, eligibility: "eligible", visibility: "shared", provenance: { refIds: [] }, renderable: true },
        ],
      }),
    );
  });
});

describe("5. source-contract（adapter/port が display/DB/外部を呼ばない）", () => {
  it("adapter は engine/display-adapter/projection/cue/href 生成 helper を呼ばない（function 名）", () => {
    // 注: forbidden-key guard は "generatedUrl"/"href" 等を **reject 用に列挙**するため field 名 grep はしない。
    //   ここでは display/engine helper の **呼び出し（function 名）**が無いことを検証する。
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues", "buildGeneratedMapsSearchIntent", "buildSafeTravelLinkHrefModel", "prepareTravelExternalLinkHrefModels", "toDisplayPacket"]) {
      expect(ADAPTER_SRC).not.toContain(f);
    }
  });
  it("adapter/port は Supabase/createClient/service_role/.from(/fetch/generated types/app・UI を import しない", () => {
    for (const SRC of [ADAPTER_SRC, PORT_SRC]) {
      expect(SRC).not.toMatch(/supabase/i);
      expect(SRC).not.toContain("createClient");
      expect(SRC).not.toMatch(/service_role|serviceRole/);
      expect(SRC).not.toMatch(/\.from\(|\.insert\(|\.rpc\(/);
      expect(SRC).not.toMatch(/\bfetch\(/);
      expect(SRC).not.toMatch(/database\.types|supabase\/types|gen-types|Database\b/);
      expect(SRC).not.toMatch(/from ["']next/);
      expect(SRC).not.toMatch(/from ["']react/);
      expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|_actions)/);
      expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
      expect(SRC).not.toMatch(/\bm2\b/i);
    }
  });
});
