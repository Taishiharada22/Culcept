/**
 * Phase 3-N Plan P2 Step 2 G3-B — judge harness runner structure 検証
 *
 * 検証範囲 (= runner 構造の pure 部分):
 *   - buildJudgeUserPrompt (= pure、 入力 mutate なし)
 *   - extractBestAndWorst (= pure、 sort 順序)
 *   - computeLatencyStats (= pure、 統計計算)
 *   - judgeCandidateStub (= stub return、 deterministic)
 *
 * 不変原則:
 *   - 実 LLM 呼出は本 test では skip (= runJudgeHarnessFullStub は stub return)
 *   - pure helper のみ検証
 */

import { describe, it, expect } from "vitest";

import {
  buildJudgeUserPrompt,
  judgeCandidateStub,
  extractBestAndWorst,
  computeLatencyStats,
  runJudgeHarnessFullStub,
  JUDGE_SYSTEM_PROMPT,
} from "../../eval/judgeHarnessRunner";
import type {
  EvalCase,
  EvalOutputCandidate,
  EvalScoredEntry,
} from "../../eval/planAlterNoteJudgeHarness";
import {
  PLAN_ALTER_NOTE_DATASET,
  EVAL_USER_PROFILES,
} from "../../eval/planAlterNoteDataset";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JUDGE_SYSTEM_PROMPT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("JUDGE_SYSTEM_PROMPT", () => {
  it("3 軸名を含む (= naturalness / personalness / non_pushy)", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("naturalness");
    expect(JUDGE_SYSTEM_PROMPT).toContain("personalness");
    expect(JUDGE_SYSTEM_PROMPT).toContain("non_pushy");
  });

  it("1-5 階指示を含む", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("1-5");
  });

  it("JSON 出力指示を含む", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("JSON");
  });

  it("Aneurasync 文脈言及を含む", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("Aneurasync");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildJudgeUserPrompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildJudgeUserPrompt", () => {
  const sampleCase: EvalCase = {
    caseId: "P1_syn-cafe-01",
    anchor: PLAN_ALTER_NOTE_DATASET[0]!,
    userProfile: EVAL_USER_PROFILES[0]!,
  };
  const candidate: EvalOutputCandidate = {
    source: "step2_llm",
    text: "夕方のカフェ、 学びに静かに沈む時間",
  };

  it("予定 + profile + 評価対象文 を含む", () => {
    const prompt = buildJudgeUserPrompt(sampleCase, candidate);
    expect(prompt).toContain("カテゴリ:");
    expect(prompt).toContain("時刻:");
    expect(prompt).toContain("判断モード:");
    expect(prompt).toContain("夕方のカフェ、 学びに静かに沈む時間");
    expect(prompt).toContain("step2_llm");
  });

  it("title / location なし anchor でも安全", () => {
    const minimalCase: EvalCase = {
      caseId: "P5_syn-other-01",
      anchor: { ...PLAN_ALTER_NOTE_DATASET[0]!, title: undefined as never },
      userProfile: EVAL_USER_PROFILES[4]!,
    };
    const prompt = buildJudgeUserPrompt(minimalCase, candidate);
    expect(prompt).toContain("step2_llm");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// judgeCandidateStub
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("judgeCandidateStub (= deterministic stub)", () => {
  const sampleCase: EvalCase = {
    caseId: "P1_syn-cafe-01",
    anchor: PLAN_ALTER_NOTE_DATASET[0]!,
    userProfile: EVAL_USER_PROFILES[0]!,
  };

  it("source 別 deterministic score を return (= test 用 stub)", async () => {
    const det = await judgeCandidateStub(sampleCase, {
      source: "deterministic",
      text: "deterministic 文",
    });
    expect(det.score.naturalness).toBe(3.5);
    expect(det.score.personalness).toBe(1.5);

    const s1 = await judgeCandidateStub(sampleCase, {
      source: "step1_llm",
      text: "step1 文",
    });
    expect(s1.score.naturalness).toBe(4.0);
    expect(s1.score.personalness).toBe(2.2);

    const s2 = await judgeCandidateStub(sampleCase, {
      source: "step2_llm",
      text: "step2 文",
    });
    expect(s2.score.naturalness).toBe(4.2);
    expect(s2.score.personalness).toBe(3.5);
  });

  it("caseId + judge tag を return", async () => {
    const r = await judgeCandidateStub(sampleCase, {
      source: "step2_llm",
      text: "test",
    });
    expect(r.caseId).toBe(sampleCase.caseId);
    expect(r.judge).toBe("llm_as_judge");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractBestAndWorst
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractBestAndWorst (= sort + slice)", () => {
  const entries: EvalScoredEntry[] = Array.from({ length: 15 }, (_, i) => ({
    caseId: `case-${i}`,
    candidate: { source: "step2_llm", text: `text-${i}` },
    judge: "llm_as_judge",
    score: {
      naturalness: 3 + (i % 3),
      personalness: 2 + (i % 3),
      non_pushy: 4,
    },
  }));

  it("best 10 / worst 10 抽出", () => {
    const { best, worst } = extractBestAndWorst(entries, 10);
    expect(best.length).toBe(10);
    expect(worst.length).toBe(10);
  });

  it("best は naturalness + personalness 総合上位、 worst は下位", () => {
    const { best, worst } = extractBestAndWorst(entries, 5);
    // best[0] の総合 score ≥ worst[0] の総合 score
    const bestTotal = best[0]!.score.naturalness + best[0]!.score.personalness;
    const worstTotal = worst[0]!.score.naturalness + worst[0]!.score.personalness;
    expect(bestTotal).toBeGreaterThanOrEqual(worstTotal);
  });

  it("step2_llm のみ対象 (= deterministic / step1 は除外)", () => {
    const mixed: EvalScoredEntry[] = [
      ...entries,
      {
        caseId: "det-1",
        candidate: { source: "deterministic", text: "det" },
        judge: "llm_as_judge",
        score: { naturalness: 5, personalness: 5, non_pushy: 5 },
      },
    ];
    const { best } = extractBestAndWorst(mixed, 1);
    // deterministic は除外、 best は step2 のもの
    expect(best[0]!.candidate.source).toBe("step2_llm");
  });

  it("入力 mutate なし", () => {
    const snapshot = JSON.stringify(entries);
    extractBestAndWorst(entries, 5);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeLatencyStats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeLatencyStats", () => {
  it("空配列 → 全 zero", () => {
    const s = computeLatencyStats([]);
    expect(s.count).toBe(0);
    expect(s.p50).toBe(0);
    expect(s.p95).toBe(0);
  });

  it("単一値", () => {
    const s = computeLatencyStats([1000]);
    expect(s.count).toBe(1);
    expect(s.p50).toBe(1000);
    expect(s.avg).toBe(1000);
    expect(s.max).toBe(1000);
  });

  it("100 件 sorted: p50=50ms, p95=95ms", () => {
    const latencies = Array.from({ length: 100 }, (_, i) => (i + 1));
    const s = computeLatencyStats(latencies);
    expect(s.count).toBe(100);
    expect(s.p50).toBe(51); // sort で 0-indexed 50 番目 = 値 51
    expect(s.p95).toBe(96); // sort で 0-indexed 95 番目 = 値 96
    expect(s.avg).toBeCloseTo(50.5, 1);
    expect(s.max).toBe(100);
  });

  it("入力 mutate なし", () => {
    const lat = [3, 1, 2];
    const snapshot = JSON.stringify(lat);
    computeLatencyStats(lat);
    expect(JSON.stringify(lat)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runJudgeHarnessFullStub
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runJudgeHarnessFullStub (= entry stub)", () => {
  it("250 case 数 + stub note を return", async () => {
    const r = await runJudgeHarnessFullStub();
    expect(r.totalCases).toBe(250);
    expect(r.note).toContain("STUB");
  });
});
