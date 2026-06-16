/**
 * B2-disp C — Travel Live server action source-contract test（useActionState 返却・no redirect・no persistence）。
 *
 * 設計正本: docs/t11-rich-display-transport-boundary-design.md（§5/§10 + CEO 補正）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/_actions/travel-live.ts"), "utf8"));

describe("1. server action 範型（use server + gate + permissioned + useActionState 返却）", () => {
  it('"use server" + gate + permissioned intake + adapter + toTravelLiveActionState を返す', () => {
    expect(SRC).toMatch(/^"use server";/);
    expect(SRC).toContain("isPlanTravelLiveAllowed");
    expect(SRC).toContain("buildTravelSessionEventsFromFormData");
    expect(SRC).toContain("buildTravelPlanDisplayResult");
    expect(SRC).toContain("toTravelLiveActionState");
    expect(SRC).toMatch(/Promise<TravelLiveActionState>/);
  });
  it("gate は PLAN_FLAGS（server-only）+ supabaseUrl(env)・production deny は helper 側", () => {
    expect(SRC).toContain("PLAN_FLAGS.travelLive");
    expect(SRC).toContain("PLAN_FLAGS.planRouteLive");
    expect(SRC).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL\s*\?\?\s*process\.env\.SUPABASE_URL/);
  });
});

describe("2. redirect/URL/persistence なし・display-safe 返却", () => {
  it("redirect しない・rich を URL query に置かない", () => {
    for (const f of ["redirect", "travelStatus", "next/navigation"]) expect(SRC).not.toContain(f);
  });
  it("AuthoritativePacketForServer / raw engine output / toServerAuthoritativePacket を返さない", () => {
    for (const f of ["AuthoritativePacketForServer", "toServerAuthoritativePacket", "output.authoritative", "provided.input"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/persistence/Supabase write・booking/calendar なし", () => {
    for (const f of [".insert(", ".update(", ".delete(", ".upsert(", "supabaseServer", "revalidatePath", "booking", "calendar"]) {
      expect(SRC).not.toContain(f);
    }
  });
});

describe("3. permissioned / no diagnostics / no side effect", () => {
  it("status / user_id を FormData から読まない（intake helper 経由のみ）", () => {
    for (const f of ['formData.get("status")', 'formData.get("user_id")', 'formData.get("userId")', "TravelPlanEngineInput"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("diagnostics/provenance を返さない・送信/realtime/CoAlter/talk/Maps/M2/route-weather-place なし", () => {
    expect(SRC).not.toContain("diagnostics");
    expect(SRC).not.toContain("provenance");
    expect(SRC).not.toMatch(/realtime|read_receipt|useCoAlter|\/talk/i);
    expect(SRC).not.toMatch(/googleapis|maps|weather|safe.?link/i);
    expect(SRC).not.toMatch(/m2|personalization/i);
  });
});
