/**
 * D5 — Candidate Collection dev preview render + source-contract test。
 *   render（renderToStaticMarkup・route 非依存）+ page/component/fixture の guard 配線を source-contract で検証。
 *   flag default OFF・read-only・no runtime/no 送信/no 外部 link/no booking・private 非表示・rank 非表示。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { CandidateCollectionDisplay } from "@/app/(culcept)/plan/dev-travel-candidate-collection/CandidateCollectionDisplay";
import { FIXTURE_COLLECTION_DRAFT } from "@/app/(culcept)/plan/dev-travel-candidate-collection/fixture";
import { projectDisplayCandidateCollection } from "@/lib/shared/travel/candidate-collection-display";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const DIR = "app/(culcept)/plan/dev-travel-candidate-collection";
const PAGE = strip(read(`${DIR}/page.tsx`));
const COMP = strip(read(`${DIR}/CandidateCollectionDisplay.tsx`));
const FIXTURE = strip(read(`${DIR}/fixture.ts`));

const collection = projectDisplayCandidateCollection(FIXTURE_COLLECTION_DRAFT);
const html = () => renderToStaticMarkup(<CandidateCollectionDisplay collection={collection} />);

// ── 1. flag gate（default OFF・fail-closed）────────────────────────────────────
describe("1. flag gate", () => {
  it("PLAN_FLAGS.travelProjectionPreview は env 未設定で false（本番デフォルト OFF）", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
  });
  it("page は !PLAN_FLAGS.travelProjectionPreview で Disabled・新 flag 追加なし", () => {
    expect(PAGE).toMatch(/if\s*\(\s*!PLAN_FLAGS\.travelProjectionPreview\s*\)/);
    expect(PAGE).toContain("<Disabled");
    expect(PAGE).not.toMatch(/PLAN_TRAVEL_CANDIDATE_COLLECTION/); // 専用 flag を足していない（既存再利用）
  });
  it("flag ON 時のみ display 投影 → CandidateCollectionDisplay を render", () => {
    expect(PAGE).toContain("projectDisplayCandidateCollection");
    expect(PAGE).toContain("<CandidateCollectionDisplay");
  });
});

// ── 2. render（fixture collection）────────────────────────────────────────────
describe("2. render は client-safe・自然文コピー・private/rank/booking なし", () => {
  it("title・tags・shared rationale・HH:MM を表示", () => {
    const h = html();
    expect(h).toContain("温泉でととのう休日");
    expect(h).toContain("#relax");
    expect(h).toContain("静かな環境で疲れを抜く一日。移動は少なめ。");
    expect(h).toContain("10:00");
  });
  it("順番がおすすめ順位でない旨 + draft 提案 disclaimer を自然文で表示", () => {
    const h = html();
    expect(h).toContain("候補の下書き");
    expect(h).toContain("順番はおすすめ順位ではありません");
    expect(h).toContain("予約・確定・送信・実行は行いません");
  });
  it("private viewer rationale（forParticipant）を render しない", () => {
    const h = html();
    expect(h).not.toContain("PRIVATE_本人向けの理由");
    expect(h).not.toContain("forParticipant");
  });
  it("rank 番号 / ranked machine text / 内部 flag を render しない", () => {
    const h = html();
    // 注: 「おすすめ順位ではありません」と否定文で言及するのは可（rank の affordance/machine text が禁止対象）。
    for (const f of ["ranked", "dominatedBy", "paretoOptimal", "data-rank", "serverOnly", "authoritative", "provenance", "executionAuthority"]) {
      expect(h).not.toContain(f);
    }
  });
  it("booking/action button・外部 href/Maps link・externalId を render しない", () => {
    const h = html();
    for (const f of ["<button", "<form", "onclick", "<a ", "href", "http"]) expect(h).not.toContain(f);
    expect(h).not.toMatch(/maps/i);
    expect(h).not.toContain("place_demo_onsen"); // externalId は inert・UI に出さない
  });
});

// ── 3. source-contract（page / component / fixture）───────────────────────────
describe("3. page は read-only・no runtime/送信/DB/外部・TravelCorePlan 非接触", () => {
  it("runtime（engine/converter/insertion/assembler）を実行しない", () => {
    for (const f of ["runTravelPlanEngine", "convertScheduledDraftEnvelopeToTravelCandidate", "addTravelCandidateToCollectionDraft", "assembleScheduledDraft", "evaluateFit", "TravelCorePlan"]) {
      expect(PAGE).not.toContain(f);
    }
  });
  it("fetch/API/DB/Supabase/送信/realtime/useCoAlter/talk/外部 Maps/booking/href を持たない", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "/talk", "realtime", "readReceipt", "read_receipt", "googleapis", "booking", "href"]) {
      expect(PAGE).not.toContain(f);
    }
  });
});
describe("4. component は read-only・action/外部 link なし・draft envelope を受けない", () => {
  it("prop は DisplayCandidateCollection（serverOnly/draft envelope を受けない）", () => {
    expect(COMP).toContain("collection: DisplayCandidateCollection");
    for (const f of ["CandidateCollectionDraft", "serverOnly", "executionAuthority", "TravelCandidate "]) expect(COMP).not.toContain(f);
  });
  it("button/input/form/onClick/useState/fetch/useCoAlter/<a/href/externalId/ranked を持たない", () => {
    for (const f of ["<button", "<input", "<form", "onClick", "useState", "fetch(", "useCoAlter", "<a ", "href", "externalId", "ranked"]) {
      expect(COMP).not.toContain(f);
    }
  });
});
describe("5. fixture は fixture のみ・runtime/外部なし", () => {
  it("engine/converter/insertion/fetch/supabase/maps を持たない", () => {
    for (const f of ["runTravelPlanEngine", "convertScheduledDraftEnvelopeToTravelCandidate", "addTravelCandidateToCollectionDraft", "fetch(", "supabase", "googleapis", "/api/"]) {
      expect(FIXTURE).not.toContain(f);
    }
  });
});
