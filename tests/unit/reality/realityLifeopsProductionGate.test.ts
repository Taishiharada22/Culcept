/**
 * A-4-c35 — Production Release Gate Matrix（pure・dormant・consumer なし）unit。
 *   GPT 10 lock: ①production fixture 永久不使用 ②source 0→card null ③read/write gate 分離 ④input UI gate と writer gate 分離
 *   ⑤production deny ON なら全不可視/write 不可 ⑥allowlist なしでは production write 不可 ⑦read-only visibility で feedback writer は開かない
 *   ⑧flag OFF で即 false ⑨debug/raw/PII 非表示（既存 lock 参照） ⑩suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-production-release-gate-a4-c35-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  isLifeOpsProductionStageAllowed,
  parseLifeOpsProdAllowlist,
  type LifeOpsProductionStage,
} from "@/lib/plan/reality/lifeops/lifeops-production-gate";
import { resolveLifeOpsSourceMode, resolveEffectiveLifeOpsSourceMode } from "@/lib/plan/reality/lifeops/lifeops-source-policy";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { isLifeOpsFeedbackWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { isLifeOpsStructuredSourceWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { isLifeOpsStructuredSourceReadAllowed } from "@/lib/plan/reality/lifeops/lifeops-structured-storage";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
// P14-B / ref-drift 監査後: production stage gate は ACTIVE production(plod) を識別する。
//   PROD_URL は plod に固定し、legacy aljav は別 const として保持して deny 検証に併用する。
const PROD_URL = `https://${CLEAN_PRODUCTION_PROJECT_REF}.supabase.co`;
const LEGACY_PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const STAGES: readonly LifeOpsProductionStage[] = ["read_visibility", "input_ui", "structured_write", "feedback_write"];
const allOn = { read_visibility: true, input_ui: true, structured_write: true, feedback_write: true } as const;
const allOff = { read_visibility: false, input_ui: false, structured_write: false, feedback_write: false } as const;
const env = (over: Partial<Parameters<typeof isLifeOpsProductionStageAllowed>[1]> = {}) => ({
  stageFlags: allOn,
  allowlistCsv: "user-aaa,user-bbb",
  userId: "user-aaa",
  supabaseUrl: PROD_URL,
  ...over,
});

describe("c35 — production stage gate（dormant・AND 三条件）", () => {
  it("⑧PLAN_FLAGS の prod stage flags は全て default OFF（dormant）", () => {
    expect(PLAN_FLAGS.lifeopsProdReadVisibility).toBe(false);
    expect(PLAN_FLAGS.lifeopsProdInputUi).toBe(false);
    expect(PLAN_FLAGS.lifeopsProdStructuredWrite).toBe(false);
    expect(PLAN_FLAGS.lifeopsProdFeedbackWrite).toBe(false);
  });
  it("成立条件: production URL ∧ stage flag ∧ allowlisted user（全段階）", () => {
    for (const stage of STAGES) expect(isLifeOpsProductionStageAllowed(stage, env())).toBe(true);
  });
  it("⑥allowlist 空/未設定/非掲載 user → 全 false（事故で全開しない）", () => {
    for (const stage of STAGES) {
      expect(isLifeOpsProductionStageAllowed(stage, env({ allowlistCsv: "" }))).toBe(false);
      expect(isLifeOpsProductionStageAllowed(stage, env({ allowlistCsv: undefined }))).toBe(false);
      expect(isLifeOpsProductionStageAllowed(stage, env({ userId: "user-zzz" }))).toBe(false);
      expect(isLifeOpsProductionStageAllowed(stage, env({ userId: undefined }))).toBe(false);
    }
  });
  it("⑧stage flag OFF → 即 false（段階ごとに独立）⑦read だけ ON では write 段は開かない", () => {
    const readOnly = { ...allOff, read_visibility: true };
    expect(isLifeOpsProductionStageAllowed("read_visibility", env({ stageFlags: readOnly }))).toBe(true);
    expect(isLifeOpsProductionStageAllowed("feedback_write", env({ stageFlags: readOnly }))).toBe(false); // ⑦
    expect(isLifeOpsProductionStageAllowed("structured_write", env({ stageFlags: readOnly }))).toBe(false);
    expect(isLifeOpsProductionStageAllowed("input_ui", env({ stageFlags: readOnly }))).toBe(false);
    for (const stage of STAGES) expect(isLifeOpsProductionStageAllowed(stage, env({ stageFlags: allOff }))).toBe(false);
  });
  it("staging では常に false（本 gate は production 専用・staging は既存 gate 群の領分）", () => {
    for (const stage of STAGES) expect(isLifeOpsProductionStageAllowed(stage, env({ supabaseUrl: STAGING_URL }))).toBe(false);
    expect(isLifeOpsProductionStageAllowed("read_visibility", env({ supabaseUrl: undefined }))).toBe(false);
  });
  it("allowlist parser: trim・空要素除去", () => {
    const set = parseLifeOpsProdAllowlist(" user-aaa , ,user-bbb,");
    expect([...set].sort()).toEqual(["user-aaa", "user-bbb"]);
    expect(parseLifeOpsProdAllowlist(undefined).size).toBe(0);
  });
});

describe("c35 — 既存 gate との分離・恒久条項（①③④⑤）", () => {
  it("①production fixture 永久不使用: source policy は flag 非依存（URL 由来）＋実効 mode も real_only から動かない", () => {
    expect(resolveLifeOpsSourceMode({ supabaseUrl: PROD_URL })).toBe("real_only");
    // ref-drift 監査: active plod に加えて legacy aljav も real_only を返すことを固定（all-production deny の明示）。
    expect(resolveLifeOpsSourceMode({ supabaseUrl: LEGACY_PROD_URL })).toBe("real_only");
    expect(resolveEffectiveLifeOpsSourceMode("real_only", false)).toBe("real_only");
    expect(resolveEffectiveLifeOpsSourceMode("real_only", true)).toBe("real_only");
    const policy = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-source-policy.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(policy).not.toContain("process.env"); // flag では開かない kill-switch（c25 恒久）
  });
  it("③④read/write・input UI/writer は別 helper（分離の構造保証）⑤既存 deny は本 slice で不変更", () => {
    // 別関数で実装されている（同一 helper への統合を検出）
    expect(isLifeOpsStructuredSourceReadAllowed).not.toBe(isLifeOpsStructuredSourceWriteAllowed);
    expect(isLifeOpsFeedbackWriteAllowed).not.toBe(isLifeOpsStructuredSourceWriteAllowed);
    // ⑤既存 gate の production deny は維持（flag ON でも false）。active(plod) + legacy(aljav) 両方 deny。
    for (const url of [PROD_URL, LEGACY_PROD_URL]) {
      expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: url })).toBe(false);
      expect(isLifeOpsStructuredSourceReadAllowed({ master: true, structured: true, supabaseUrl: url })).toBe(false);
      expect(isLifeOpsStructuredSourceWriteAllowed({ master: true, write: true, supabaseUrl: url })).toBe(false);
      expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: url })).toBe(false);
    }
  });
  it("dormant: app/ に production-gate / prod stage flag の consumer 0（解禁は段階ごとの別 CEO GO）", () => {
    const offenders: string[] = [];
    for (const rel of fs.readdirSync(path.join(process.cwd(), "app"), { recursive: true }) as string[]) {
      const s = rel.toString();
      if (!/\.(ts|tsx)$/.test(s)) continue;
      const src = fs.readFileSync(path.join(process.cwd(), "app", s), "utf8");
      if (src.includes("lifeops-production-gate") || src.includes("lifeopsProdReadVisibility")) offenders.push(s);
    }
    expect(offenders).toEqual([]);
    expect(fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8")).not.toContain("lifeops-production-gate");
  });
});
