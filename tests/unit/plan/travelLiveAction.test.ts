/**
 * B2-disp C — Travel Live server action source-contract test。
 *   server action は実行せず source-contract で検証（"use server" + gate + permissioned + no persistence + no engine）。
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md（§5/§7/§14 + CEO boundary）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/_actions/travel-live.ts"), "utf8"));

describe("1. server action 範型（gate + permissioned + PRG）", () => {
  it('"use server" + gate(isPlanTravelLiveAllowed) + permissioned intake + provider', () => {
    expect(SRC).toMatch(/^"use server";/);
    expect(SRC).toContain("isPlanTravelLiveAllowed");
    expect(SRC).toContain("buildTravelSessionEventsFromFormData");
    expect(SRC).toContain("bindTravelSessionIntake");
    expect(SRC).toContain("getProductionTravelInput");
    expect(SRC).toContain("redirect");
  });
  it("gate は PLAN_FLAGS（server-only）+ supabaseUrl(env) で合成・production deny は helper 側", () => {
    expect(SRC).toContain("PLAN_FLAGS.travelLive");
    expect(SRC).toContain("PLAN_FLAGS.planRouteLive");
    expect(SRC).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL\s*\?\?\s*process\.env\.SUPABASE_URL/);
  });
});

describe("2. engine を呼ばず rich display を転送しない（CEO boundary・no persistence）", () => {
  it("runTravelPlanEngine / buildTravelPlanDisplayResult / toServerAuthoritativePacket を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "toServerAuthoritativePacket", "AuthoritativePacketForServer", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("redirect/query に diagnostics/provenance/projection/cues/missing 詳細を載せない（coarse status のみ）", () => {
    for (const f of ["diagnostics", "provenance", "projection", "cues", "provided.missing", "provided.unconfirmed", "provided.input"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).toMatch(/travelStatus=\$\{encodeURIComponent\(provided\.status\)\}/);
  });
});

describe("3. permissioned / no persistence / no side effect", () => {
  it("status / user_id を FormData から読まない（intake helper 経由のみ）", () => {
    for (const f of ['formData.get("status")', 'formData.get("user_id")', 'formData.get("userId")', "TravelPlanEngineInput"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/persistence/Supabase write・booking/calendar/action なし", () => {
    for (const f of [".insert(", ".update(", ".delete(", ".upsert(", "supabaseServer", "from(", "booking", "calendar", "revalidatePath"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("send/realtime/read receipt・CoAlter/talk・Maps/safe link・M2/route/weather/place なし", () => {
    expect(SRC).not.toMatch(/realtime|read_receipt|useCoAlter|\/talk/i);
    expect(SRC).not.toMatch(/googleapis|maps|weather|safe.?link/i);
    expect(SRC).not.toMatch(/m2|personalization/i);
  });
});
