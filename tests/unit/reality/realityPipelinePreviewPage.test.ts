/**
 * P-B/P-C Reality Pipeline Dev Preview Page — guard + 静的配線契約（既存 plan test pattern・env=node・real route/DB 0）。
 *   server component（async・server-only import）は直接 import せず **source-contract** で検証する
 *   （既存 dev-candidate-actions page wiring test と同方式）。
 *
 * 検証: flag OFF guard / non-operator guard / production block / clientへ envelope+meta のみ /
 *   raw・MemoryItem・WorldState・ChangeSet 実体を client に渡さない / no write / no apply / no seed / service_role 不使用。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

const PAGE_PATH = path.join(process.cwd(), "app/(culcept)/plan/dev-reality-pipeline/page.tsx");
const PAGE_RAW = fs.readFileSync(PAGE_PATH, "utf8");
// コメント（block + line）を除いた実コードのみで write/apply の有無を判定する。
const PAGE_CODE = PAGE_RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P-B host 三重ガード（staging/dev のみ・production deny）", () => {
  it("flag=true + staging URL → true（operator 観測可）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: STAGING_URL })).toBe(true);
  });
  it("hostMode 未設定 → false（dormant・本番デフォルト notFound）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: undefined, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("flag=true + production URL → false（production hard block）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: PROD_URL })).toBe(false);
  });
  it("flag=true + URL なし → false（staging allowlist 不成立）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: undefined })).toBe(false);
  });
});

describe("P-B page guard 配線（host + flag + operator auth）", () => {
  it("host 三重ガード（isCandidateActionsPreviewHostAllowed）+ notFound を使う", () => {
    expect(PAGE_CODE).toContain("isCandidateActionsPreviewHostAllowed");
    expect(PAGE_CODE).toContain("notFound()");
  });
  it("REALITY_CANDIDATE_ACTIONS_DEV_HOST + supabase URL を guard に渡す", () => {
    expect(PAGE_CODE).toContain("REALITY_CANDIDATE_ACTIONS_DEV_HOST");
    expect(PAGE_CODE).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("flag OFF guard: PLAN_FLAGS.realityPipelinePreview が false なら read/run しない", () => {
    expect(PAGE_CODE).toContain("PLAN_FLAGS.realityPipelinePreview");
    expect(PAGE_CODE).toMatch(/if\s*\(\s*!PLAN_FLAGS\.realityPipelinePreview\s*\)/);
  });
  it("non-operator guard: auth.getUser → user 無なら read/run しない", () => {
    expect(PAGE_CODE).toContain("auth.getUser()");
    expect(PAGE_CODE).toMatch(/if\s*\(\s*!user\s*\)/);
  });
});

describe("P-B real read 配線（owner-RLS・anchors + M1/M3）", () => {
  it("real anchors → WorldState（createSupabaseWorldStateSourcePorts + assembleWorldState）", () => {
    expect(PAGE_CODE).toContain("createSupabaseWorldStateSourcePorts");
    expect(PAGE_CODE).toContain("assembleWorldState");
  });
  it("real M1/M3 → MemoryItem（createSupabaseMemorySourcePorts + assembleMemoryItems）", () => {
    expect(PAGE_CODE).toContain("createSupabaseMemorySourcePorts");
    expect(PAGE_CODE).toContain("assembleMemoryItems");
  });
  it("pure pipeline（runRealityPipeline）で envelope を作る", () => {
    expect(PAGE_CODE).toContain("runRealityPipeline");
  });
  it("context は fixture 注入（実 context reader を作らない）", () => {
    expect(PAGE_CODE).toContain("FIXTURE_CONTEXT");
    expect(PAGE_CODE).toContain("readContext");
  });
});

describe("P-C/A-4-c client へ渡す payload は envelope + meta + reflection/lifeOps DTO のみ（実体を渡さない）", () => {
  it("RealityPipelinePreviewClient に envelope + meta + reflectionPreview + lifeOpsPreview(DTO) を渡す", () => {
    expect(PAGE_CODE).toContain("<RealityPipelinePreviewClient");
    expect(PAGE_CODE).toMatch(/envelope=\{envelope\}/);
    expect(PAGE_CODE).toMatch(/meta=\{meta\}/);
    expect(PAGE_CODE).toMatch(/reflectionPreview=\{reflectionPreview\}/);
    expect(PAGE_CODE).toMatch(/lifeOpsPreview=\{lifeOpsPreview\}/);
    expect(PAGE_CODE).toContain("computeLifeOpsPreviewDto"); // fixture 入力 compute（新規 read なし）
  });
  it("reflection は computeReflectionPreviewDto（既読 world/memoryItems・新規 read なし）で計算", () => {
    expect(PAGE_CODE).toContain("computeReflectionPreviewDto");
    // 新規 reader/flag を増やしていない（wiring は既存 2 種のみ＝import+call で名前は 2 種類）。
    expect(new Set(PAGE_CODE.match(/createSupabase\w+SourcePorts/g) ?? []).size).toBe(2);
    expect(PAGE_CODE).not.toContain("REALITY_REFLECTION"); // 新 flag なし（既存 REALITY_PIPELINE_PREVIEW のみ）
  });
  it("MemoryItem / WorldState / ChangeSet / DraftPlan 実体・raw row を client props に渡さない", () => {
    // client へ渡す JSX props に実体名が現れないこと（envelope/meta/reflectionPreview のみ）。
    expect(PAGE_CODE).not.toMatch(/memoryItems=\{/);
    expect(PAGE_CODE).not.toMatch(/worldState=\{/);
    expect(PAGE_CODE).not.toMatch(/world=\{/);
    expect(PAGE_CODE).not.toMatch(/rows=\{/);
    expect(PAGE_CODE).not.toMatch(/changeSet=\{/);
    expect(PAGE_CODE).not.toMatch(/draftPlan=\{/);
    expect(PAGE_CODE).not.toMatch(/items=\{/);
  });
});

describe("P-B read-only 契約（no write / no apply / no seed / service_role 不使用）", () => {
  it("write/mutation を持たない（insert/update/delete/upsert なし）", () => {
    expect(PAGE_CODE).not.toMatch(/\.insert\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\.update\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\.upsert\s*\(/);
  });
  it("apply / PlanClient 接続を持たない", () => {
    expect(PAGE_CODE).not.toMatch(/apply/i);
    expect(PAGE_CODE).not.toContain("PlanClient");
  });
  it("seed を持たない", () => {
    expect(PAGE_CODE).not.toMatch(/seed/i);
  });
  it("service_role を使わない（supabaseServer の anon+auth client のみ）", () => {
    expect(PAGE_CODE).not.toMatch(/service_role/i);
    expect(PAGE_CODE).toContain("supabaseServer");
  });
});
