/**
 * B2-disp C / B — Travel Live server action source-contract test。
 *   useActionState 返却・gate first・auth から participant 注入・FormData identity 不信任・no redirect/persistence/write。
 *
 * 設計正本: docs/t11-b-current-user-participant-binding-design.md（§4/§6/§9）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/_actions/travel-live.ts"), "utf8"));

describe("1. gate first + events + adapter + useActionState 返却", () => {
  it('"use server" + gate(isPlanTravelLiveAllowed) + events intake + adapter + toTravelLiveActionState', () => {
    expect(SRC).toMatch(/^"use server";/);
    expect(SRC).toContain("isPlanTravelLiveAllowed");
    expect(SRC).toContain("buildTravelSessionEventsFromFormData");
    expect(SRC).toContain("buildTravelPlanDisplayResult");
    expect(SRC).toContain("toTravelLiveActionState");
    expect(SRC).toMatch(/Promise<TravelLiveActionState>/);
  });
  it("gate は PLAN_FLAGS（server-only）+ supabaseUrl(env)", () => {
    expect(SRC).toContain("PLAN_FLAGS.travelLive");
    expect(SRC).toContain("PLAN_FLAGS.planRouteLive");
    expect(SRC).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL\s*\?\?\s*process\.env\.SUPABASE_URL/);
  });
});

describe("2. B: participant identity は server auth context のみ", () => {
  it("supabaseServer().auth.getUser() で auth read・未認証/anonymous → unavailable", () => {
    expect(SRC).toContain("supabaseServer");
    expect(SRC).toContain("auth.getUser()");
    expect(SRC).toContain("is_anonymous");
    expect(SRC).toMatch(/!auth\?\.user\s*\|\|\s*auth\.user\.is_anonymous/);
  });
  it("participantIds=[authUserId] / viewerId=authUserId を注入（client 不信任）", () => {
    expect(SRC).toMatch(/const authUserId = auth\.user\.id/);
    expect(SRC).toMatch(/participantIds:\s*\[authUserId\]/);
    expect(SRC).toMatch(/viewerId:\s*authUserId/);
  });
  it("FormData から identity（user_id/participantId/participantIds）を読まない", () => {
    for (const f of ['formData.get("user_id")', 'formData.get("userId")', 'formData.get("participantId")', 'formData.getAll("participantId")', "participantIds: formData"]) {
      expect(SRC).not.toContain(f);
    }
  });
});

describe("3. no redirect / persistence / write / raw・display-safe 返却", () => {
  it("redirect しない・URL query に rich を置かない", () => {
    for (const f of ["redirect", "travelStatus", "next/navigation"]) expect(SRC).not.toContain(f);
  });
  it("Supabase write / service_role / admin path / DB なし（auth read のみ）", () => {
    for (const f of [".insert(", ".update(", ".delete(", ".upsert(", "from(", "service_role", "serviceRole", "admin", "revalidatePath"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("AuthoritativePacketForServer / raw output / diagnostics / booking/calendar を返さない", () => {
    for (const f of ["AuthoritativePacketForServer", "toServerAuthoritativePacket", "output.authoritative", "provided.input", "diagnostics", "provenance", "booking", "calendar"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("送信/realtime/CoAlter/talk/Maps/M2/route-weather-place なし", () => {
    expect(SRC).not.toMatch(/realtime|read_receipt|useCoAlter|\/talk/i);
    expect(SRC).not.toMatch(/googleapis|maps|weather|safe.?link/i);
    expect(SRC).not.toMatch(/m2|personalization/i);
  });
});

describe("4. external links option passing（live gate に従属・FormData/client 不信任）", () => {
  it("includeExternalLinks を isPlanTravelExternalLinksAllowed から計算し adapter に渡す", () => {
    expect(SRC).toContain("isPlanTravelExternalLinksAllowed");
    expect(SRC).toMatch(/const includeExternalLinks = isPlanTravelExternalLinksAllowed\(/);
    expect(SRC).toContain("PLAN_FLAGS.travelExternalLinks");
    expect(SRC).toMatch(/\{ includeExternalLinks \}/); // adapter 第3引数で渡す
  });
  it("includeExternalLinks/externalLinksEnabled/travelExternalLinks を FormData から読まない", () => {
    for (const f of [
      'formData.get("includeExternalLinks")',
      'formData.get("externalLinksEnabled")',
      'formData.get("travelExternalLinks")',
      "includeExternalLinks: formData",
      "travelExternalLinks: formData",
    ]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("NEXT_PUBLIC link flag を参照しない（server-only flag のみ）", () => {
    expect(SRC).not.toContain("NEXT_PUBLIC_PLAN_TRAVEL_EXTERNAL_LINKS");
  });
});

describe("5. best-effort persistence wiring（display-without-save・seam 経由・production unavailable）", () => {
  it("auth 後に persistTravelLiveIntentIfAvailable を呼ぶ・owner は authUserId のみ", () => {
    expect(SRC).toContain("persistTravelLiveIntentIfAvailable");
    expect(SRC).toMatch(/persistTravelLiveIntentIfAvailable\(\{[\s\S]*ownerUserId:\s*authUserId/);
  });
  it("concrete Supabase port / service_role / repository を直接 resolve/注入しない・NEXT_PUBLIC persistence flag なし", () => {
    expect(SRC).not.toContain("createSupabaseTravelSessionDbPort");
    expect(SRC).not.toContain("resolveTravelSessionRepository"); // action は seam を直接呼ばず helper 経由
    expect(SRC).not.toContain("injectedRepository"); // action は repository を注入しない（production unavailable）
    expect(SRC).not.toContain("service_role");
    expect(SRC).not.toMatch(/NEXT_PUBLIC[A-Z_]*PERSIST/i);
  });
  it("display は primary（persistence は action-state を変えない＝return は toTravelLiveActionState(result)）", () => {
    expect(SRC).toMatch(/return toTravelLiveActionState\(result\);/);
  });
});
