/**
 * A-4-c19 — Life Ops Mainline Gate（**dormant・consumer なし**＝設計の具体化のみ）unit。
 *   lock: flag default OFF・gate matrix（staging first/production deny/planRouteLive 連動）・
 *   dormant 維持（app/ に consumer 0・barrel 非 export）＝本線 UI は別 CEO GO まで構造的に存在しない。
 *
 * 設計: docs/life-ops-mainline-readiness-a4-c19-design.md（§5）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

describe("c19 — mainline flag（default OFF・dormant）", () => {
  it("PLAN_FLAGS.lifeopsMainline は default OFF → gate false", () => {
    expect(PLAN_FLAGS.lifeopsMainline).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: PLAN_FLAGS.lifeopsMainline, planRouteLive: true, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("gate matrix: mainline ∧ planRouteLive ∧ staging → true / production は flag ON でも常に false", () => {
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: STAGING_URL })).toBe(true);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: PROD_URL })).toBe(false); // 第 2 段は別 CEO gate
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: false, supabaseUrl: STAGING_URL })).toBe(false); // /plan が死んでいれば出さない
    expect(isLifeOpsMainlineAllowed({ mainline: false, planRouteLive: true, supabaseUrl: STAGING_URL })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: undefined })).toBe(false);
  });
});

describe("c19 — dormant 維持（本線実装なしの構造 lock）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("app/ 配下に lifeops-mainline-gate / lifeopsMainline の consumer 0（本線 UI 未接続）", () => {
    const offenders: string[] = [];
    for (const rel of fs.readdirSync(path.join(process.cwd(), "app"), { recursive: true }) as string[]) {
      const s = rel.toString();
      if (!/\.(ts|tsx)$/.test(s)) continue;
      const src = read(path.join("app", s));
      if (src.includes("lifeops-mainline-gate") || src.includes("lifeopsMainline")) offenders.push(s);
    }
    expect(offenders).toEqual([]); // 本線 slice（別 CEO GO）で初めて consumer が生まれる
  });
  it("barrel 非 export・gate は pure（DB/fetch/process.env なし）", () => {
    expect(read("lib/plan/reality/integration/index.ts")).not.toContain("lifeops-mainline-gate");
    const code = read("lib/plan/reality/lifeops/lifeops-mainline-gate.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const banned of ["@supabase", "createclient", "service_role", "fetch(", "process.env", ".insert(", "server-only", "notification"]) {
      expect(code.toLowerCase()).not.toContain(banned.toLowerCase()); // supabaseUrl（caller 注入の文字列 field）は許容
    }
  });
});
