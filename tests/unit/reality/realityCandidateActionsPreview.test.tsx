/**
 * A1-6-8 §9.14 Candidate Action UI render-only preview host — guard + client render + page wiring
 *   既存 plan test pattern（renderToStaticMarkup・@testing-library なし・env=node）。real route/DB 0。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { CandidateActionsPreviewClient } from "@/app/(culcept)/plan/dev-candidate-actions/CandidateActionsPreviewClient";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

describe("A1-6-8 §9.14 isCandidateActionsPreviewHostAllowed — 三重ガード（staging/dev のみ・production deny）", () => {
  it("flag=true + staging URL → true", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: STAGING_URL })).toBe(true);
  });
  it("flag 未設定 → false（dormant・本番デフォルト）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: undefined, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("flag=true + production URL → false（production deny）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: PROD_URL })).toBe(false);
  });
  it("flag=true + URL なし → false（staging allowlist 不成立）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: undefined })).toBe(false);
  });
  it("flag=1 / yes → false（'true' のみ通す）", () => {
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "1", supabaseUrl: STAGING_URL })).toBe(false);
    expect(isCandidateActionsPreviewHostAllowed({ hostMode: "yes", supabaseUrl: STAGING_URL })).toBe(false);
  });
});

describe("A1-6-8 §9.14 CandidateActionsPreviewClient — 初期 render（banner + buttons + plan）", () => {
  it("banner（候補があります）+ accept/dismiss/later ボタン + fixture plan（ミーティング）+ 見出し", () => {
    const html = renderToStaticMarkup(<CandidateActionsPreviewClient />);
    expect(html).toContain("候補があります");
    expect(html).toContain("予定に入れる");
    expect(html).toContain("今はいい");
    expect(html).toContain("あとで");
    expect(html).toContain("candidate-action-buttons");
    expect(html).toContain("ミーティング"); // fixture plan item
    expect(html).toContain("Candidate Action UI Preview");
    expect(html).toContain("preview-plan-items");
  });
  it("render に UUID(seedRef) を出さない（handle は opaque・onClick closure ゆえ static markup 非搬送）", () => {
    const html = renderToStaticMarkup(<CandidateActionsPreviewClient />);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});

describe("A1-6-8 §9.14 page guard wiring（静的配線確認）", () => {
  const PAGE = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/dev-candidate-actions/page.tsx"), "utf8");
  it("page が三重ガード（isCandidateActionsPreviewHostAllowed）+ notFound を使う", () => {
    expect(PAGE).toContain("isCandidateActionsPreviewHostAllowed");
    expect(PAGE).toContain("notFound()");
  });
  it("REALITY_CANDIDATE_ACTIONS_DEV_HOST + supabase URL を guard に渡す", () => {
    expect(PAGE).toContain("REALITY_CANDIDATE_ACTIONS_DEV_HOST");
    expect(PAGE).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("client は real route(postCandidateAction)を呼ばない（render-only）", () => {
    const RAW = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/dev-candidate-actions/CandidateActionsPreviewClient.tsx"), "utf8");
    // コメントを除いた実コードで判定（header コメントは説明上 postCandidateAction に言及する）
    const CLIENT = RAW.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(CLIENT).not.toContain("postCandidateAction");
    expect(CLIENT).toContain("applyCandidateActionResult"); // REAL pure helper は使う
  });
});
