/**
 * B — Travel Session Repository Provider Seam tests（stateless・fail-closed・注入のみ available・no DB）
 *
 * 設計正本: docs/t11-server-action-persistence-wiring-preflight.md（§8 / §11）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveTravelSessionRepository,
  createTravelSessionRepositoryProvider,
} from "@/lib/server/travel/travel-session-repository-provider";
import { createInMemoryTravelSessionRepositoryHarness } from "@/lib/shared/travel/travel-session-repository-harness";
import type { TravelSessionRepositoryContract } from "@/lib/shared/travel/travel-session-persistence-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "lib/server/travel/travel-session-repository-provider.ts"), "utf8"));

describe("1. 既定 fail-closed（注入なし → unavailable）", () => {
  it("注入なし・mode なし → unavailable/disabled", () => {
    expect(resolveTravelSessionRepository({ ownerUserId: "u1" })).toEqual({ status: "unavailable", reason: "disabled" });
  });
  it("mode supabase_unavailable → unavailable/supabase_unavailable（real Supabase は構築しない）", () => {
    expect(resolveTravelSessionRepository({ ownerUserId: "u1", mode: "supabase_unavailable" })).toEqual({ status: "unavailable", reason: "supabase_unavailable" });
  });
  it("mode in_memory_harness だが注入なし → unavailable/no_repository（global harness を作らない）", () => {
    expect(resolveTravelSessionRepository({ ownerUserId: "u1", mode: "in_memory_harness" })).toEqual({ status: "unavailable", reason: "no_repository" });
  });
  it("無効 context（owner 空）→ unavailable/disabled", () => {
    expect(resolveTravelSessionRepository({ ownerUserId: "" }).status).toBe("unavailable");
    // @ts-expect-error runtime 防御
    expect(resolveTravelSessionRepository(null).status).toBe("unavailable");
  });
});

describe("2. 注入された repository → available（owner pass-through）", () => {
  it("in-memory harness を注入 → available・repository は注入そのもの・owner 保持", () => {
    const harness = createInMemoryTravelSessionRepositoryHarness();
    const r = resolveTravelSessionRepository({ ownerUserId: "owner-x", injectedRepository: harness });
    expect(r.status).toBe("available");
    if (r.status !== "available") throw new Error("available 期待");
    expect(r.repository).toBe(harness);
    expect(r.ownerUserId).toBe("owner-x");
  });
  it("createTravelSessionRepositoryProvider().resolve も同じ挙動", () => {
    const provider = createTravelSessionRepositoryProvider();
    const harness = createInMemoryTravelSessionRepositoryHarness();
    expect(provider.resolve({ ownerUserId: "u", injectedRepository: harness }).status).toBe("available");
    expect(provider.resolve({ ownerUserId: "u" }).status).toBe("unavailable");
  });
});

describe("3. no global singleton / cross-user leakage なし", () => {
  it("別々に注入した harness は別々のまま・provider は global を再利用しない", () => {
    const h1 = createInMemoryTravelSessionRepositoryHarness();
    const h2 = createInMemoryTravelSessionRepositoryHarness();
    const r1 = resolveTravelSessionRepository({ ownerUserId: "a", injectedRepository: h1 });
    const r2 = resolveTravelSessionRepository({ ownerUserId: "b", injectedRepository: h2 });
    if (r1.status !== "available" || r2.status !== "available") throw new Error("available 期待");
    expect(r1.repository).toBe(h1);
    expect(r2.repository).toBe(h2);
    expect(r1.repository).not.toBe(r2.repository);
    // 直前に注入した h1 を seam が記憶して再利用したりしない
    expect(resolveTravelSessionRepository({ ownerUserId: "c" }).status).toBe("unavailable");
  });
  it("provider instance は state を持たない（2 instance 独立）", () => {
    const p1 = createTravelSessionRepositoryProvider();
    const p2 = createTravelSessionRepositoryProvider();
    expect(p1).not.toBe(p2);
    expect(p1.resolve({ ownerUserId: "x" }).status).toBe("unavailable");
  });
});

describe("4. resolution 中に repository method を呼ばない", () => {
  it("save/load/list/delete は resolve で呼ばれない", () => {
    const calls: string[] = [];
    const mockRepo: TravelSessionRepositoryContract = {
      saveTravelSessionIntent: async () => { calls.push("save"); return { ok: false, error: "invalid_input" }; },
      loadTravelSessionIntent: async () => { calls.push("load"); return null; },
      listTravelSessionIntents: async () => { calls.push("list"); return []; },
      deleteTravelSessionIntent: async () => { calls.push("delete"); return { ok: false }; },
    };
    const r = resolveTravelSessionRepository({ ownerUserId: "u", injectedRepository: mockRepo });
    expect(r.status).toBe("available");
    expect(calls).toEqual([]); // resolution は method を呼ばない
  });
});

describe("5. source-contract（server-only・no Supabase/DB/service_role/generated types）", () => {
  it('import "server-only" を持つ', () => {
    const raw = readFileSync(resolve(process.cwd(), "lib/server/travel/travel-session-repository-provider.ts"), "utf8");
    expect(raw).toMatch(/import "server-only";/);
  });
  it("Supabase/createClient/service_role/createSupabaseTravelSessionDbPort/generated types/DB を構築/import しない", () => {
    // 注: mode 値 "supabase_unavailable" は中立 reason（import/構築ではない）ゆえ bare /supabase/i は使わない。
    expect(SRC).not.toMatch(/@supabase\/|from ["'][^"']*supabase/i); // Supabase import なし
    expect(SRC).not.toContain("createClient");
    expect(SRC).not.toContain("supabaseServer");
    expect(SRC).not.toContain("createSupabaseTravelSessionDbPort");
    expect(SRC).not.toMatch(/service_role|serviceRole/);
    expect(SRC).not.toMatch(/database\.types|Database\b/);
    expect(SRC).not.toMatch(/\.from\(|\.insert\(|\.rpc\(/);
    expect(SRC).not.toMatch(/\bfetch\(/);
  });
  it("engine/display/mapper/app・UI/M2/CoAlter/talk を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "buildPlanIntelligenceProjection", "mapTravelSessionEventsToPersistenceWriteInput", "buildGeneratedMapsSearchIntent", "booking", "calendar"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|_actions)/);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("module-level mutable state（global singleton）を持たない", () => {
    // let/var の module-level 宣言が無い（const 型/関数のみ）。
    expect(SRC).not.toMatch(/^\s*(let|var)\s+\w/m);
  });
});
