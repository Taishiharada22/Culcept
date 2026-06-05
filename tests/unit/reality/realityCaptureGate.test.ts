import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  evaluateCaptureGate,
  refFromSupabaseUrl,
  CAPTURE_STAGING_REF_ALLOWLIST,
  CAPTURE_PROD_REF_DENYLIST,
  type CaptureGateInput,
} from "@/lib/plan/reality/capture-gate";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";

const STAGING = "hjcrvndumgiovyfdacwc"; // culcept-staging
const PROD = "aljavfujeqcwnqryjmhl"; // production
const USER = "11111111-1111-1111-1111-111111111111";

function input(p: Partial<CaptureGateInput> = {}): CaptureGateInput {
  return {
    liveEnabled: true,
    killed: false,
    nodeEnv: "development",
    supabaseUrl: `https://${STAGING}.supabase.co`,
    requestedUserId: USER,
    canaryUserIds: [USER],
    ...p,
  };
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/capture-gate.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5a capture gate — canonical refs（A1-5-ref-fix 単一ソース）", () => {
  it("staging allowlist = canonical STAGING_PROJECT_REF（hjcr）", () => {
    expect(STAGING_PROJECT_REF).toBe(STAGING);
    expect(CAPTURE_STAGING_REF_ALLOWLIST).toEqual([STAGING]);
  });
  it("production denylist = canonical PRODUCTION_PROJECT_REF（aljav）", () => {
    expect(PRODUCTION_PROJECT_REF).toBe(PROD);
    expect(CAPTURE_PROD_REF_DENYLIST).toEqual([PROD]);
  });
});

describe("A1-5-5a capture gate — refFromSupabaseUrl", () => {
  it("staging URL → ref 抽出", () => {
    expect(refFromSupabaseUrl(`https://${STAGING}.supabase.co`)).toBe(STAGING);
  });
  it("undefined / 不正 URL / 非 supabase host → null（fail-closed）", () => {
    expect(refFromSupabaseUrl(undefined)).toBeNull();
    expect(refFromSupabaseUrl("")).toBeNull();
    expect(refFromSupabaseUrl("not-a-url")).toBeNull();
    expect(refFromSupabaseUrl("https://example.com")).toBeNull();
    expect(refFromSupabaseUrl("https://short.supabase.co")).toBeNull(); // 20 文字でない
  });
});

describe("A1-5-5a capture gate — block / allow", () => {
  it("default false（liveEnabled=false）→ block FLAG_OFF", () => {
    const v = evaluateCaptureGate(input({ liveEnabled: false }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("FLAG_OFF");
  });
  it("kill switch（killed=true）が live flag より優先 → block KILLED", () => {
    const v = evaluateCaptureGate(input({ killed: true, liveEnabled: true }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("KILLED");
  });
  it("kill は liveEnabled=false でも KILLED（FLAG_OFF より優先）", () => {
    const v = evaluateCaptureGate(input({ killed: true, liveEnabled: false }));
    if (!v.allow) expect(v.reason).toBe("KILLED");
  });
  it("nodeEnv=production → block PRODUCTION_NODE_ENV", () => {
    const v = evaluateCaptureGate(input({ nodeEnv: "production" }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("PRODUCTION_NODE_ENV");
  });
  it("project ref = aljav（production）→ block PRODUCTION_PROJECT_REF", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: `https://${PROD}.supabase.co` }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("PRODUCTION_PROJECT_REF");
  });
  it("project ref が hjcr 以外（別 ref）→ block NON_STAGING_PROJECT_REF", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: "https://abcdefghij0123456789.supabase.co" }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("NON_STAGING_PROJECT_REF");
  });
  it("URL host ref と expected ref が不一致（未設定/不正）→ block UNRESOLVED_PROJECT_REF（fail-closed）", () => {
    expect((evaluateCaptureGate(input({ supabaseUrl: undefined })) as { reason?: string }).reason).toBe("UNRESOLVED_PROJECT_REF");
    expect((evaluateCaptureGate(input({ supabaseUrl: "not-a-url" })) as { reason?: string }).reason).toBe("UNRESOLVED_PROJECT_REF");
    expect((evaluateCaptureGate(input({ supabaseUrl: "https://example.com" })) as { reason?: string }).reason).toBe("UNRESOLVED_PROJECT_REF");
  });
  it("requestedUserId 空 → block NO_USER", () => {
    const v = evaluateCaptureGate(input({ requestedUserId: "" }));
    if (!v.allow) expect(v.reason).toBe("NO_USER");
  });
  it("canary allowlist 空 → block NO_CANARY_ALLOWLIST（fail-closed）", () => {
    const v = evaluateCaptureGate(input({ canaryUserIds: [] }));
    if (!v.allow) expect(v.reason).toBe("NO_CANARY_ALLOWLIST");
  });
  it("canary allowlist 非該当 → block USER_NOT_CANARY", () => {
    const v = evaluateCaptureGate(input({ canaryUserIds: ["22222222-2222-2222-2222-222222222222"] }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("USER_NOT_CANARY");
  });
  it("全条件充足（canary in / flag on / kill off / staging hjcr / nodeEnv≠prod）→ allow", () => {
    expect(evaluateCaptureGate(input()).allow).toBe(true);
  });
  it("staging でも canary 外なら allow しない（多層の独立性）", () => {
    expect(evaluateCaptureGate(input({ canaryUserIds: ["other"] })).allow).toBe(false);
  });
});

describe("A1-5-5a capture gate — 静的安全（Supabase/DB/runtime 0・pure）", () => {
  it("Supabase client / DB を持たない（createClient/@supabase/.from/.rpc/.insert 不在）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("service_role / LLM を持たない", () => {
    expect(CODE).not.toContain("service_role");
    expect(CODE).not.toContain("openai");
    expect(CODE).not.toContain("anthropic");
  });
  it("server-only でない（pure・入力注入）", () => {
    expect(CODE).not.toContain("server-only");
  });
  it("executable code に ref literal を hard-code しない（canonical 経由）", () => {
    expect(CODE).not.toContain(`"${STAGING}"`);
    expect(CODE).not.toContain(`"${PROD}"`);
  });
  it("reality barrel(index.ts) が capture-gate を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("capture-gate");
  });
});
