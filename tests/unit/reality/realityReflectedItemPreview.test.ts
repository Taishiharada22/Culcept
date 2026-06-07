/**
 * A1-6-12 (#3) §9.18 Reflected Item card-render preview — 静的配線/ガード検証（MorningPlanCard heavy render 回避ゆえ source 静的確認）。
 *   実 MorningPlanCard 描画（reflected 行が label を捨てず「午後の予定（60分）」を出す）は controlled staging card-verify
 *   （Playwright・untracked・login STAGING_USER_A）で確認済。本 test は guard/配線の構造固定。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DIR = "app/(culcept)/plan/dev-reflected-item";
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), DIR, f), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-6-12 §9.18 reflected-item preview page guard（三重ガード + notFound）", () => {
  const CODE = strip(read("page.tsx"));
  it("isCandidateActionsPreviewHostAllowed（三重ガード再利用）+ notFound", () => {
    expect(CODE).toContain("isCandidateActionsPreviewHostAllowed");
    expect(CODE).toContain("notFound()");
  });
  it("REALITY_CANDIDATE_ACTIONS_DEV_HOST + supabase URL を guard に渡す", () => {
    expect(CODE).toContain("REALITY_CANDIDATE_ACTIONS_DEV_HOST");
    expect(CODE).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("A1-6-12 §9.18 reflected-item preview client（実 MorningPlanCard + 実 reflection helper）", () => {
  const CODE = strip(read("ReflectedItemPreviewClient.tsx"));
  it("実 MorningPlanCard を mount（live 相当の slot モデル描画で検証）", () => {
    expect(CODE).toContain("MorningPlanCard");
    expect(CODE).toContain("<MorningPlanCard");
  });
  it("実 reflection helper consumedSeedToMorningPlanItem で reflected item を生成（ハードコードしない）", () => {
    expect(CODE).toContain("consumedSeedToMorningPlanItem");
  });
  it("real route / DB を呼ばない（render-only・fixture のみ）", () => {
    expect(CODE).not.toContain("postCandidateAction");
    expect(CODE).not.toContain("fetch(");
    expect(CODE).not.toContain("supabaseServer");
  });
});
