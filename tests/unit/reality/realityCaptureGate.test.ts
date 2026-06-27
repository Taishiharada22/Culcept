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
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING = "hjcrvndumgiovyfdacwc"; // culcept-staging
const PROD = "aljavfujeqcwnqryjmhl"; // legacy production (archived・hard-coded for ref-authority regression)
const ACTIVE_PROD = "plodugvgmdkusifdrdfz"; // ACTIVE clean-rebuild production (現行本番・ref-drift 監査で denylist 追加)
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
  it("production denylist = canonical legacy PRODUCTION_PROJECT_REF(aljav) + active CLEAN_PRODUCTION_PROJECT_REF(plod)", () => {
    expect(PRODUCTION_PROJECT_REF).toBe(PROD);
    expect(CLEAN_PRODUCTION_PROJECT_REF).toBe(ACTIVE_PROD);
    // ref-drift 監査: all-production deny（active plod + legacy aljav）に拡張
    expect(CAPTURE_PROD_REF_DENYLIST).toEqual([PROD, ACTIVE_PROD]);
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
  it("project ref = aljav（legacy production）→ block PRODUCTION_PROJECT_REF", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: `https://${PROD}.supabase.co` }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("PRODUCTION_PROJECT_REF");
  });
  it("project ref = plod（ACTIVE production）→ block PRODUCTION_PROJECT_REF（ref-drift 監査で追加）", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: `https://${ACTIVE_PROD}.supabase.co` }));
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

const USER_B = "22222222-2222-2222-2222-222222222222";
const prodUrl = `https://${PROD}.supabase.co`;

describe("A1-5-13 capture gate — production canary lane（default-off scaffold・明示多重）", () => {
  it("default env（productionCanaryEnabled 未指定）+ production ref → block PRODUCTION_PROJECT_REF（既存挙動・production 挙動変更0）", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("PRODUCTION_PROJECT_REF");
  });
  it("production ref + productionCanaryEnabled=false → block（明示 false でも production 不可・canary flag missing 相当）", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: false, realityCanaryUserIds: [USER] }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("PRODUCTION_PROJECT_REF");
  });
  it("production ref + canary flag true + reality canary 該当 user → allow（明示 env 全揃い）", () => {
    expect(evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: true, realityCanaryUserIds: [USER] })).allow).toBe(true);
  });
  it("production ref + canary flag true + non-canary user → block USER_NOT_CANARY", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: true, realityCanaryUserIds: [USER_B] }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("USER_NOT_CANARY");
  });
  it("production ref + canary flag true + reality list 空 → block NO_CANARY_ALLOWLIST（production は reality list 必須・shared へ fallback しない）", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: true, realityCanaryUserIds: [], canaryUserIds: [USER] }));
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toBe("NO_CANARY_ALLOWLIST"); // shared canaryUserIds=[USER] へ fallback しない
  });
  it("production lane でも kill 最優先 → block KILLED", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: true, realityCanaryUserIds: [USER], killed: true }));
    if (!v.allow) expect(v.reason).toBe("KILLED");
  });
  it("production lane でも liveEnabled false → block FLAG_OFF", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: true, realityCanaryUserIds: [USER], liveEnabled: false }));
    if (!v.allow) expect(v.reason).toBe("FLAG_OFF");
  });
  it("productionCanaryEnabled=true でも staging ref なら staging lane（production lane に入らない）", () => {
    // staging ref + production flag true → production lane(isProductionRef false) に入らず staging lane で従来通り
    expect(evaluateCaptureGate(input({ productionCanaryEnabled: true, realityCanaryUserIds: [USER] })).allow).toBe(true);
  });
});

describe("A1-5-13 capture gate — reality 専用 canary が PLAN_CANARY_USER_IDS より優先", () => {
  it("staging: reality list 非空 → reality list を使用（該当 user allow）", () => {
    expect(evaluateCaptureGate(input({ requestedUserId: USER, realityCanaryUserIds: [USER], canaryUserIds: [USER_B] })).allow).toBe(true);
  });
  it("staging: reality list 非空 → shared list のみの user は block（reality 優先＝依存を減らす）", () => {
    const v = evaluateCaptureGate(input({ requestedUserId: USER_B, realityCanaryUserIds: [USER], canaryUserIds: [USER_B] }));
    expect(v.allow).toBe(false); // shared[USER_B] にいても reality list 優先で block
    if (!v.allow) expect(v.reason).toBe("USER_NOT_CANARY");
  });
  it("staging: reality list 空 → shared(PLAN_CANARY_USER_IDS) へ fallback（後方互換維持）", () => {
    expect(evaluateCaptureGate(input({ requestedUserId: USER_B, realityCanaryUserIds: [], canaryUserIds: [USER_B] })).allow).toBe(true);
  });
});

describe("A1-5-13 capture gate — production 挙動変更0 / secret 非出力", () => {
  it("新 field default-off で既存挙動不変（staging→allow / aljav→PRODUCTION_PROJECT_REF）", () => {
    expect(evaluateCaptureGate(input()).allow).toBe(true);
    const prod = evaluateCaptureGate(input({ supabaseUrl: prodUrl }));
    if (!prod.allow) expect(prod.reason).toBe("PRODUCTION_PROJECT_REF");
  });
  it("verdict は allow / reason(enum) のみ・canary UUID を出力しない", () => {
    const v = evaluateCaptureGate(input({ supabaseUrl: prodUrl, productionCanaryEnabled: true, realityCanaryUserIds: [USER] }));
    const json = JSON.stringify(v);
    expect(json).not.toContain(USER); // input UUID を verdict に出さない
    expect(JSON.parse(json)).toEqual({ allow: true });
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
    expect(CODE).not.toContain(`"${ACTIVE_PROD}"`);
  });
  it("reality barrel(index.ts) が capture-gate を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("capture-gate");
  });
});
