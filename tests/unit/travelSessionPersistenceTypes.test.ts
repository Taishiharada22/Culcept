/**
 * C — Pure Durable Travel Session Persistence 契約型 tests（型 + source-contract・SQL/DB なし）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md（§15 + CEO `rendered` 補正）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  PersistedTravelSession,
  PersistedTravelSessionInput,
  PersistedTravelSessionLink,
  PersistedTravelSessionBundle,
  TravelSessionRepositoryContract,
} from "@/lib/shared/travel/travel-session-persistence-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-session-persistence-types.ts"), "utf8"));

const session: PersistedTravelSession = {
  id: "s1",
  ownerUserId: "u1",
  status: "draft",
  visibility: "shared",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const input: PersistedTravelSessionInput = {
  sessionId: "s1",
  slotKey: "destination_area",
  value: { areaText: "京都" },
  slotStatus: "confirmed",
  fillState: "filled",
  owner: { kind: "shared" },
  visibility: "shared",
  provenance: { refIds: ["form:1"] },
};
const link: PersistedTravelSessionLink = {
  sessionId: "s1",
  source: "user_provided",
  externalReference: "https://a.com/1",
  generated: false,
  inert: true,
  eligibility: "eligible",
  visibility: "shared",
  provenance: { refIds: [] },
  renderable: true,
};
const bundle: PersistedTravelSessionBundle = { session, inputs: [input], links: [link] };

describe("1. persisted model に forbidden field を持てない（runtime key 走査）", () => {
  it("bundle JSON に authoritative/engine output/display/projection/cues/diagnostics/action 系がない", () => {
    const json = JSON.stringify(bundle);
    for (const f of [
      "authoritative", "executionAuthority", "TravelPlanEngineOutput", "DisplayPacketForClient",
      "projection", "cues", "packet", "diagnostics", "provenanceRaw", "fitResult",
      "booking", "calendar", "livePrice", "availability", "cancellation", "route", "weather",
    ]) {
      expect(json).not.toContain(f);
    }
  });
  it("persisted link に href/generatedUrl/fetched/preview/price/availability がない", () => {
    const json = JSON.stringify(link);
    for (const f of ['"href"', "generatedUrl", "fetched", "preview", "livePrice", "availability"]) {
      expect(json).not.toContain(f);
    }
    expect(link.inert).toBe(true); // inert のまま
    expect(link.generated).toBe(false); // 永続 link は generated でない
  });
});

describe("2. source-contract（型ファイルが forbidden を import/参照しない）", () => {
  it("authoritative/engine output/display/projection/cues/FitResult/diagnostics を参照しない", () => {
    for (const f of [
      "AuthoritativePacketForServer", "TravelPlanEngineOutput", "DisplayPacketForClient",
      "PlanIntelligenceProjection", "CoAlterProjectionCue", "FitResult", "executionAuthority",
      "diagnostics", "booking", "calendar",
    ]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("link は href/generatedUrl/fetched/preview/availability/price を型に持たない", () => {
    expect(SRC).not.toContain("href");
    expect(SRC).not.toContain("generatedUrl");
    expect(SRC).not.toContain("fetched");
    expect(SRC).not.toContain("preview");
    expect(SRC).not.toContain("livePrice");
    expect(SRC).not.toContain("availability");
  });
  it("★ CEO 補正: rendered（挙動追跡風）を採らず static renderable を採る", () => {
    expect(SRC).toContain("renderable");
    expect(SRC).not.toContain("rendered"); // 挙動追跡に見える field 名を避ける
  });
  it("DB/Supabase/SQL/service_role/app・UI/M2/CoAlter/talk を import しない（interface only）", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/service_role|serviceRole/);
    expect(SRC).not.toMatch(/createClient|\.from\(|\.insert\(|\.rpc\(/);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/);
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
});

describe("3. repository contract は persisted bundle のみ返す（display 非搭載）", () => {
  it("load は bundle|null、display/projection/cues/authoritative を返さない（型 + 構造）", () => {
    // 型レベル: TravelSessionRepositoryContract.loadTravelSessionIntent の返り値は PersistedTravelSessionBundle | null
    const repo: TravelSessionRepositoryContract = {
      saveTravelSessionIntent: async () => ({ ok: true, bundle }),
      loadTravelSessionIntent: async () => bundle,
      listTravelSessionIntents: async () => [session],
      deleteTravelSessionIntent: async () => ({ ok: true }),
    };
    expect(repo).toBeDefined();
    // 構造: 返る bundle は session/inputs/links のみ（display 系キーなし）
    expect(Object.keys(bundle).sort()).toEqual(["inputs", "links", "session"]);
  });
  it("repository 契約は display packet/projection/cues を型に持たない（SRC）", () => {
    for (const f of ["display:", "DisplayPacketForClient", "PlanIntelligenceProjection", "CoAlterProjectionCue"]) {
      expect(SRC).not.toContain(f);
    }
  });
});

describe("4. 生成 link は永続しない（manual のみ）", () => {
  it("PersistedTravelLinkSource は generated_maps_search を含まない（SRC）", () => {
    expect(SRC).toContain('"user_provided" | "manual_official" | "manual_maps"');
    // generated_maps_search が PersistedTravelLinkSource の union に入らない（recompute）
    expect(SRC).not.toMatch(/PersistedTravelLinkSource[\s\S]*generated_maps_search/);
  });
});
