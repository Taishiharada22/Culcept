/**
 * A1-7-2 Shadow Learning Preview — render + guard/no-persist 検証。
 *   fixture dry-run events → aggregateDryRunEvents の tentative pattern report が描画され、disambiguation 対比
 *   （band→timing / confidence→framing）・counter-evidence・certainty 上限 tentative・stillPossible が可視であること、
 *   三重ガード + real event/DB/persistence/route 不使用（fixtures + pure 集約のみ）を確認する。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { LearningReportPreviewClient } from "@/app/(culcept)/plan/dev-learning-report/LearningReportPreviewClient";

const html = renderToStaticMarkup(<LearningReportPreviewClient />);
const DIR = "app/(culcept)/plan/dev-learning-report";
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), DIR, f), "utf8");

describe("A1-7-2 Shadow Learning Preview — fixture aggregation を可視化", () => {
  it("report が render される（heading + pattern card）", () => {
    expect(html).toContain("Shadow Learning Report");
    expect(html).toContain("learning-report");
    expect(html).toContain("pattern-card");
  });
  it("disambiguation 対比: band evening dismiss→タイミング / confidence high dismiss→提示のズレ（同 dismiss が次元で分岐）", () => {
    expect(html).toContain("タイミング"); // not_now（band evening）
    expect(html).toContain("提示か中身がズレ"); // mismatch_unknown（confidence high）
  });
  it("counter-evidence / certainty tentative / stillPossible が可視", () => {
    expect(html).toContain("counter"); // counterCount label
    expect(html).toContain("tentative"); // certainty 上限
    expect(html).toContain("他に残す"); // stillPossible（非断定）
    expect(html).toContain("assertsPersonality"); // 構造的保証を明示
  });
  it("rendered text が性格・嗜好の**断定形**を含まない（「性格ではなく」等の非断定文は許容）", () => {
    // 断定形（性格は/が/を/的/だ）を禁止。proposal の humility「…性格ではなく」は非断定ゆえ許容。
    expect(html).not.toMatch(/嫌い|好き|性格[はがを的だ]|always|never/i);
  });
});

describe("A1-7-2 page guard + no-persist（render-only・fixtures）", () => {
  it("三重ガード isCandidateActionsPreviewHostAllowed + notFound", () => {
    const page = read("page.tsx");
    expect(page).toContain("isCandidateActionsPreviewHostAllowed");
    expect(page).toContain("notFound()");
    expect(page).toContain("REALITY_CANDIDATE_ACTIONS_DEV_HOST");
  });
  it("client は real event/DB/persistence/route を呼ばない（fixtures + pure aggregate のみ）", () => {
    const client = read("LearningReportPreviewClient.tsx");
    expect(client).toContain("aggregateDryRunEvents");
    expect(client).toContain("projectPrmDryRun"); // A1-7-4: proposal projection も pure
    expect(client).not.toContain("fetch(");
    expect(client).not.toContain("supabase");
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("/api/");
  });
});

describe("A1-7-4 PRM dry-run proposal projection を preview に追加表示", () => {
  it("proposal section が render される（list + candidate + blocked badge）", () => {
    expect(html).toContain("PRM dry-run proposals");
    expect(html).toContain("proposal-list");
    expect(html).toContain("proposal-card");
    expect(html).toContain("proposal-candidate"); // ≥1 candidate（evidence≥5 の tentative のみ）
    expect(html).toContain("proposal-blocked"); // ≥1 blocked
  });
  it("candidate / blocked / blockedReason / reviewRequired / persisted=false が見える", () => {
    expect(html).toContain("candidate");
    expect(html).toContain("blocked");
    expect(html).toContain("要 review"); // reviewRequired
    expect(html).toMatch(/evidence 不足|断定不可/); // blockedReason label（evidence_insufficient / certainty_low）
    expect(html).toContain("persisted"); // persisted: false 明示
  });
  it("tendency framing 維持（dismiss を嫌い / accept を好み確定に変換しない）", () => {
    expect(html).not.toMatch(/嫌い|好み確定|好き/);
    expect(html).toMatch(/採用されにくい傾向|採用されやすい傾向/); // dismiss/accept → tendency
  });
});
