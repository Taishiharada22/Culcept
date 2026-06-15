/**
 * B2-D5 — Candidate Comparison Memo dev preview render + source-contract test。
 *   render（renderToStaticMarkup・route 非依存）+ page/component の guard 配線を source-contract で検証。
 *   flag default OFF・rank なし・best/worst 不出・dominated card 残存・booking/href なし・private 不出。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { CandidateComparisonDisplay } from "@/app/(culcept)/plan/dev-travel-candidate-collection/CandidateComparisonDisplay";
import { FIXTURE_COLLECTION_DRAFT } from "@/app/(culcept)/plan/dev-travel-candidate-collection/fixture";
import { projectDisplayCandidateCollection } from "@/lib/shared/travel/candidate-collection-display";
import { computeCandidateDominance } from "@/lib/shared/travel/candidate-dominance";
import { projectCandidateComparisonMemo } from "@/lib/shared/travel/candidate-comparison-display";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const DIR = "app/(culcept)/plan/dev-travel-candidate-collection";
const PAGE = strip(read(`${DIR}/page.tsx`));
const COMP = strip(read(`${DIR}/CandidateComparisonDisplay.tsx`));

const collection = projectDisplayCandidateCollection(FIXTURE_COLLECTION_DRAFT);
const overlay = computeCandidateDominance(FIXTURE_COLLECTION_DRAFT);
const comparison = projectCandidateComparisonMemo(collection, overlay);
const html = () => renderToStaticMarkup(<CandidateComparisonDisplay comparison={comparison} />);

// ── 1. flag gate（page・default OFF・既存 flag 再利用）─────────────────────────
describe("1. flag gate", () => {
  it("PLAN_FLAGS.travelProjectionPreview は env 未設定で false", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
  });
  it("page は同一 flag を再利用（新 flag 追加なし）+ OFF で Disabled", () => {
    expect(PAGE).toMatch(/if\s*\(\s*!PLAN_FLAGS\.travelProjectionPreview\s*\)/);
    expect(PAGE).toContain("<Disabled");
    expect(PAGE).not.toMatch(/PLAN_TRAVEL_COMPARISON|PLAN_TRAVEL_DOMINANCE/);
  });
  it("flag ON で computeCandidateDominance + projectCandidateComparisonMemo を経由して CandidateComparisonDisplay を render", () => {
    expect(PAGE).toContain("computeCandidateDominance");
    expect(PAGE).toContain("projectCandidateComparisonMemo");
    expect(PAGE).toContain("<CandidateComparisonDisplay");
  });
});

// ── 2. fixture render: 3 候補で frontier + dominated 両方が見える ────────────────
describe("2. render（fixture 3 候補・frontier + dominated 両方）", () => {
  it("自然文 disclaimer を表示（順位ではない・自動決定でない）", () => {
    const h = html();
    expect(h).toContain("比較メモ");
    expect(h).toContain("おすすめ順位ではありません");
    expect(h).toContain("自動決定ではありません");
  });
  it("frontier copy は 'best' を含まない・「劣る軸なし」を語る", () => {
    const h = html();
    expect(h).toContain("明確に劣る軸はありません");
    expect(h).not.toMatch(/best|ベスト|一番|最良|winner/i);
  });
  it("dominated copy は 'worst' を含まない・劣る軸（費用/疲労 等）を出す + 順位ではない", () => {
    const h = html();
    expect(h).toContain("他候補の方が明確に優る軸があります");
    expect(h).toContain("順位ではありません");
    expect(h).toMatch(/費用|疲労|移動距離|体験の幅/);
    expect(h).not.toMatch(/worst|ワースト|最悪|loser/i);
  });
  it("dominated card は除去されず note が出る（3 候補分の note）", () => {
    expect(comparison.notes).toHaveLength(3);
    const kinds = comparison.notes.map((n) => n.kind).sort();
    expect(kinds).toContain("no_clear_weakness");
    expect(kinds).toContain("has_clearly_stronger_alternative");
  });
});

// ── 3. 非露出（rank/score/Pareto/raw id/private/serverOnly）────────────────────
describe("3. 非露出", () => {
  it("rank 番号 / score / totalOrder / Pareto / 生 dominatedBy id を render しない", () => {
    const h = html();
    for (const f of ["#1", "#2", "rank", "ranked", "score", "totalOrder", "Pareto", "pareto", "dominatedBy", "candidate:relaxed", "candidate:active", "candidate:expensive"]) {
      expect(h).not.toContain(f);
    }
  });
  it("booking/action button・外部 href/link・externalId を render しない", () => {
    const h = html();
    for (const f of ["<button", "<form", "onclick", "<a ", "href", "http", "place_demo_onsen"]) expect(h).not.toContain(f);
    expect(h).not.toMatch(/maps/i);
  });
  it("serverOnly/authoritative/diagnostics/private rationale を render しない", () => {
    const h = html();
    for (const f of ["serverOnly", "authoritative", "executionAuthority", "provenance", "PRIVATE_本人向け", "forParticipant", "fitLabel"]) {
      expect(h).not.toContain(f);
    }
  });
});

// ── 4. source-contract（page / component）──────────────────────────────────────
describe("4. page/component source-contract", () => {
  it("page は engine/converter/insertion/CoAlter Pareto/compareProposals/decide を呼ばない・TravelCorePlan 非接触", () => {
    for (const f of ["runTravelPlanEngine", "convertScheduledDraftEnvelopeToTravelCandidate", "addTravelCandidateToCollectionDraft", "compareTravelCandidatesPareto", "compareProposals", "decide(", "TravelCorePlan", "evaluateFit", "assembleScheduledDraft"]) {
      expect(PAGE).not.toContain(f);
    }
    expect(PAGE).not.toMatch(/coalter/i);
  });
  it("page: fetch/API/DB/Supabase/送信/realtime/useCoAlter/talk/booking/href を持たない", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "/talk", "realtime", "readReceipt", "read_receipt", "googleapis", "booking", "href"]) {
      expect(PAGE).not.toContain(f);
    }
  });
  it("component prop は DisplayCandidateComparison のみ・overlay/draft を受けない", () => {
    expect(COMP).toContain("comparison: DisplayCandidateComparison");
    for (const f of ["CandidateDominanceOverlay", "CandidateCollectionDraft", "serverOnly", "executionAuthority"]) expect(COMP).not.toContain(f);
  });
  it("component: button/input/form/onClick/useState/fetch/useCoAlter/<a/href/rank/Pareto/best/worst を持たない", () => {
    for (const f of ["<button", "<input", "<form", "onClick", "useState", "fetch(", "useCoAlter", "<a ", "href", "Pareto"]) {
      expect(COMP).not.toContain(f);
    }
    // 注: 「順位」は disclaimer 文に否定形で含まれる（caller の DisplayCandidateComparison 経由）。component source 自体は rank 文言を直書きしない。
    for (const f of ["data-rank", "rank-badge", "best", "worst"]) expect(COMP).not.toContain(f);
  });
});
