/**
 * A1-7-9 Review Flow Preview — render + guard/no-persist 検証。
 *   review decision records（approve→add_model_entry_candidate / reject→record_rejection / defer→no_model_change /
 *   blocked→invalid not_reviewable）が可視・persisted:false・reviewRequired・certainty≤tentative・嗜好断定なし、
 *   三重ガード + real decision/DB/persistence/route 不使用を確認する。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { ReviewFlowPreviewClient } from "@/app/(culcept)/plan/dev-review-flow/ReviewFlowPreviewClient";

const html = renderToStaticMarkup(<ReviewFlowPreviewClient />);
const DIR = "app/(culcept)/plan/dev-review-flow";
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), DIR, f), "utf8");

describe("A1-7-9 Review Flow Preview — review decision records を可視化", () => {
  it("report が render される（list + record card）", () => {
    expect(html).toContain("Review Flow Preview");
    expect(html).toContain("review-flow-report");
    expect(html).toContain("review-record-card");
  });
  it("decision ごとの effect: approve→add_model_entry_candidate / reject→record_rejection / defer→no_model_change", () => {
    expect(html).toContain("add_model_entry_candidate");
    expect(html).toContain("record_rejection");
    expect(html).toContain("no_model_change");
  });
  it("blocked proposal の review は invalid（not_reviewable・fail-closed）+ valid も混在", () => {
    expect(html).toContain("review-valid");
    expect(html).toContain("review-invalid");
    expect(html).toContain("not_reviewable");
  });
  it("persisted:false / reviewRequired:true / certainty≤tentative / 嗜好断定なし", () => {
    expect(html).toContain("persisted: false");
    expect(html).toContain("reviewRequired: true");
    expect(html).not.toMatch(/"certainty":"high"|嫌い|好み確定/);
  });
});

describe("A1-7-9 page guard + no-persist（render-only・fixtures）", () => {
  it("三重ガード isCandidateActionsPreviewHostAllowed + notFound", () => {
    const page = read("page.tsx");
    expect(page).toContain("isCandidateActionsPreviewHostAllowed");
    expect(page).toContain("notFound()");
  });
  it("client は real decision/DB/persistence/route を呼ばない（fixtures + pure helper のみ）", () => {
    const client = read("ReviewFlowPreviewClient.tsx");
    expect(client).toContain("toReviewDecisionRecords");
    expect(client).not.toContain("fetch(");
    expect(client).not.toContain("supabase");
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("/api/");
  });
});
