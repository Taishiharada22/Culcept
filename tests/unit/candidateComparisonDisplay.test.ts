/**
 * B2-D3 — Candidate Comparison Display tests
 *
 * 設計正本: docs/t11-bundle2-dominance-display-preview-preflight.md（§12）
 *
 * 主眼:
 *   - 入力 card 順保持・join は candidateId のみ・sort/除去なし。
 *   - frontier note に "best" 不含・dominated note に "worst" 不含・「順位ではありません」を明示。
 *   - 0/1 → not_comparable_yet・rank 番号/score/totalOrder/「Pareto」一般露出なし。
 *   - 生 dominatedBy id を出さない・weakerAxes は shared-safe 日本語ラベル。
 *   - 未知 overlay id は出さない・欠落 → 捏造せず not_comparable_yet・重複 → fail-closed 該当 id no note。
 *   - executionAuthority/booking/authoritative/FitResult/private 不出。
 *   - source-contract: engine/converter/compareProposals/decide/CoAlter Pareto/display 非呼出・fetch/API/DB/UI なし。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectCandidateComparisonMemo } from "@/lib/shared/travel/candidate-comparison-display";
import type { DisplayCandidateCollection } from "@/lib/shared/travel/candidate-collection-display-types";
import type { CandidateDominanceOverlay } from "@/lib/shared/travel/candidate-dominance-types";

const card = (id: string, title = `t:${id}`): DisplayCandidateCollection["cards"][number] => ({
  candidateId: id,
  title,
  tags: ["x"],
  rationaleShared: "s",
  uncertaintyLabel: "不確実性: 中",
  tradeoffSummary: { cost: 100, distance: 10, fatigue: 2, experienceVariety: 3 },
  days: [],
});
const coll = (ids: string[]): DisplayCandidateCollection => ({
  status: "candidate_draft_collection",
  cards: ids.map((i) => card(i)),
});
const frontier = (id: string): CandidateDominanceOverlay["entries"][number] => ({
  candidateId: id,
  dominatedBy: [],
  paretoOptimal: true,
});
const dominated = (
  id: string,
  by: string,
  worseAxes: Array<"cost" | "distance" | "fatigue" | "experienceVariety">,
): CandidateDominanceOverlay["entries"][number] => ({
  candidateId: id,
  dominatedBy: [by],
  paretoOptimal: false,
  axisDeltas: [
    {
      versusCandidateId: by,
      axes: {
        cost: worseAxes.includes("cost") ? "worse" : "equal",
        distance: worseAxes.includes("distance") ? "worse" : "equal",
        fatigue: worseAxes.includes("fatigue") ? "worse" : "equal",
        experienceVariety: worseAxes.includes("experienceVariety") ? "worse" : "equal",
      },
    },
  ],
});
const overlay = (entries: CandidateDominanceOverlay["entries"]): CandidateDominanceOverlay => ({
  outcome: "candidate_dominance_overlay",
  serverOnly: true,
  authoritative: false,
  advisory: true,
  entries,
  paretoOptimalIds: entries.filter((e) => e.paretoOptimal).map((e) => e.candidateId),
});

// ── 1. 順序保持 / join 規律 ───────────────────────────────────────────────────
describe("1. 順序保持 + join", () => {
  it("notes は入力 card 順（overlay 順でない）", () => {
    const c = coll(["z", "y", "x"]);
    const o = overlay([frontier("x"), frontier("y"), frontier("z")]); // 逆順
    const r = projectCandidateComparisonMemo(c, o);
    expect(r.notes.map((n) => n.candidateId)).toEqual(["z", "y", "x"]);
  });
  it("dominated card は除去されず note と共に残る", () => {
    const c = coll(["A", "B"]);
    const o = overlay([frontier("A"), dominated("B", "A", ["cost", "fatigue"])]);
    const r = projectCandidateComparisonMemo(c, o);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[1].candidateId).toBe("B");
    expect(r.notes[1].kind).toBe("has_clearly_stronger_alternative");
  });
  it("未知 overlay id（card に対応無）は出力に含めない", () => {
    const c = coll(["A", "B"]);
    const o = overlay([frontier("A"), frontier("B"), frontier("GHOST")]);
    const r = projectCandidateComparisonMemo(c, o);
    expect(r.notes.map((n) => n.candidateId).sort()).toEqual(["A", "B"]);
    expect(r.notes.map((n) => n.candidateId)).not.toContain("GHOST");
  });
});

// ── 2. 自然文（best/worst/rank/score/Pareto 不出・order disclaimer）─────────────
describe("2. 自然文 copy", () => {
  it("orderDisclaimer は「順位ではない」「自動決定でない」を明示", () => {
    const r = projectCandidateComparisonMemo(coll(["a", "b"]), overlay([frontier("a"), frontier("b")]));
    expect(r.orderDisclaimer).toContain("おすすめ順位ではありません");
    expect(r.orderDisclaimer).toContain("自動決定ではありません");
  });
  it("frontier copy は 'best' を含まない・「劣る軸なし」を語る", () => {
    const r = projectCandidateComparisonMemo(coll(["A", "B"]), overlay([frontier("A"), dominated("B", "A", ["cost"])]));
    const fr = r.notes.find((n) => n.candidateId === "A")!;
    expect(fr.kind).toBe("no_clear_weakness");
    expect(fr.text).not.toMatch(/best|ベスト|一番|最良|winner/i);
    expect(fr.text).toContain("明確に劣る軸はありません");
  });
  it("dominated copy は 'worst' を含まない・「他に優る軸がある + 順位でない」を語る", () => {
    const r = projectCandidateComparisonMemo(coll(["A", "B"]), overlay([frontier("A"), dominated("B", "A", ["cost", "fatigue"])]));
    const dom = r.notes.find((n) => n.candidateId === "B")!;
    expect(dom.text).not.toMatch(/worst|ワースト|最悪|劣等|loser/i);
    expect(dom.text).toContain("他候補の方が明確に優る軸があります");
    expect(dom.text).toContain("順位ではありません");
  });
  it("出力に rank 番号 / score / totalOrder / Pareto（一般向け）/ 生 dominatedBy を出さない", () => {
    const r = projectCandidateComparisonMemo(coll(["A", "B"]), overlay([frontier("A"), dominated("B", "A", ["cost"])]));
    const json = JSON.stringify(r);
    for (const f of ["\"rank\"", "score", "totalOrder", "Pareto", "pareto", "dominatedBy", "executionAuthority", "booking", "calendar", "accepted", "finalized", "serverOnly", "authoritative", "fitLabel"]) {
      expect(json).not.toContain(f);
    }
    // dominator id "A" は B の text/weakerAxes に出ない
    expect(JSON.stringify(r.notes.find((n) => n.candidateId === "B"))).not.toContain("\"A\"");
  });
});

// ── 3. weakerAxes は shared-safe 日本語ラベル ─────────────────────────────────
describe("3. weakerAxes", () => {
  it("axisDeltas の worse を 日本語ラベルに縮約（重複排除）", () => {
    const c = coll(["A", "B"]);
    const o = overlay([
      frontier("A"),
      {
        candidateId: "B",
        dominatedBy: ["A"],
        paretoOptimal: false,
        axisDeltas: [
          { versusCandidateId: "A", axes: { cost: "worse", distance: "equal", fatigue: "worse", experienceVariety: "equal" } },
        ],
      },
    ]);
    const r = projectCandidateComparisonMemo(c, o);
    const dom = r.notes.find((n) => n.candidateId === "B")!;
    expect(dom.weakerAxes).toEqual(["費用", "疲労"]);
    expect(dom.text).toContain("費用・疲労");
    // 生 axis key を出さない
    for (const k of ["cost", "distance", "fatigue", "experienceVariety"]) expect(dom.text).not.toContain(k);
  });
});

// ── 4. 0/1/欠落/重複（fail-closed・捏造しない）────────────────────────────────
describe("4. fail-closed / not_comparable_yet", () => {
  it("0 candidate → notes 空", () => {
    expect(projectCandidateComparisonMemo(coll([]), overlay([])).notes).toEqual([]);
  });
  it("1 candidate → not_comparable_yet（ranking note 無し）", () => {
    const r = projectCandidateComparisonMemo(coll(["a"]), overlay([frontier("a")]));
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0].kind).toBe("not_comparable_yet");
    expect(r.notes[0].text).toContain("比較対象がまだありません");
  });
  it("欠落 overlay entry → 該当 card は not_comparable_yet（捏造せず）", () => {
    const r = projectCandidateComparisonMemo(coll(["A", "B"]), overlay([frontier("A")])); // B 欠落
    const nb = r.notes.find((n) => n.candidateId === "B")!;
    expect(nb.kind).toBe("not_comparable_yet");
  });
  it("重複 overlay entry → 該当 id を fail-closed（not_comparable_yet・dominance 結論を作らない）", () => {
    const c = coll(["A", "B"]);
    const o = overlay([frontier("A"), dominated("B", "A", ["cost"]), frontier("B")]); // B 重複
    const r = projectCandidateComparisonMemo(c, o);
    const nb = r.notes.find((n) => n.candidateId === "B")!;
    expect(nb.kind).toBe("not_comparable_yet");
  });
});

// ── 5. 不変条件（mutate なし）─────────────────────────────────────────────────
describe("5. mutate しない", () => {
  it("collection / overlay を mutate しない", () => {
    const c = coll(["A", "B"]);
    const o = overlay([frontier("A"), dominated("B", "A", ["cost"])]);
    const snapCardIds = c.cards.map((x) => x.candidateId);
    const snapOverlayIds = o.entries.map((e) => e.candidateId);
    projectCandidateComparisonMemo(c, o);
    expect(c.cards.map((x) => x.candidateId)).toEqual(snapCardIds);
    expect(o.entries.map((e) => e.candidateId)).toEqual(snapOverlayIds);
  });
});

// ── 6. source-contract ───────────────────────────────────────────────────────
describe("6. helper source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/candidate-comparison-display.ts"), "utf8"));

  it("engine/converter/compareProposals/decide/CoAlter Pareto/display を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "convertScheduledDraftEnvelopeToTravelCandidate", "compareProposals", "decide(", "compareTravelCandidatesPareto", "projectDisplayCandidateCollection", "projectDisplayScheduledItinerary", "evaluateFit"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/coalter/i);
  });
  it("一般向け文に best/worst/「Pareto」を含めない・自然文 disclaimer を持つ", () => {
    expect(SRC).not.toMatch(/Pareto/);
    expect(SRC).not.toMatch(/best|worst/i);
    expect(SRC).toContain("おすすめ順位ではありません");
  });
  it("private rationale / FitResult / forced_by_private_constraint を読まない", () => {
    for (const f of ["forParticipant", "FitResult", "forced_by_private_constraint", "fitSummary"]) expect(SRC).not.toContain(f);
  });
  it("fetch/API/DB/Supabase/外部/M2/app/UI/react を import/呼出しない", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|maps/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
  });
});
