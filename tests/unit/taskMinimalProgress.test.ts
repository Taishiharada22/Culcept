/**
 * P2-2 — RJ5 minimalProgress producer / validator の不変条件テスト。
 *  - 空/巨大/曖昧/言い換え/根拠なし/禁止語 candidate は reject（honest-null + reasonCode）
 *  - LLM/fixture 由来は heuristic（conf≤0.35・notActionable）・validated 止まり（直接採用禁止）
 *  - user_confirmed のみ acceptedMinimalProgress になる
 *  - 生成 attribute は INV-RC1（realityAttributeViolations=[]）に適合
 */
import { describe, it, expect } from "vitest";
import { realityAttributeViolations, HEURISTIC_CONFIDENCE_MAX } from "@/lib/plan/realityCore/realityAttribute";
import {
  produceMinimalProgress,
  MINIMAL_PROGRESS_MAX_LEN,
  type MinimalProgressCandidateInputV0,
  type TaskDecompositionContextV0,
} from "@/lib/plan/realityCore/taskMinimalProgress";

const CTX: TaskDecompositionContextV0 = { taskText: "資料を作成する", canSplit: true };
const cand = (over: Partial<MinimalProgressCandidateInputV0> = {}): MinimalProgressCandidateInputV0 => ({
  text: "資料の構成を箇条書きで作る",
  sourceKind: "llm",
  evidenceRefs: ["llm:gpt"],
  ...over,
});

describe("RJ5 produceMinimalProgress — validation 不変条件", () => {
  it("#1 candidate なし → none / 未validated / 未採用", () => {
    const r = produceMinimalProgress([], CTX);
    expect(r.decompositionStatus).toBe("none");
    expect(r.validatedByEngine).toBe(false);
    expect(r.acceptedMinimalProgress).toBeNull();
    expect(r.confirmationRequired).toBe(false);
  });

  it("#2 空 / 巨大 / 曖昧 / 言い換え / 根拠なし / 禁止語 は reject", () => {
    const reasons = (c: Partial<MinimalProgressCandidateInputV0>) =>
      produceMinimalProgress([cand(c)], CTX).candidates[0].rejectReason;
    expect(reasons({ text: "   " })).toBe("empty");
    expect(reasons({ text: "あ".repeat(MINIMAL_PROGRESS_MAX_LEN + 1) })).toBe("too_large");
    expect(reasons({ ambiguous: true })).toBe("ambiguous");
    expect(reasons({ text: "資料を作成する" })).toBe("paraphrase_not_next_action"); // task本文の言い換え
    expect(reasons({ text: "見出しを1つ書く", evidenceRefs: [] })).toBe("no_evidence");
    expect(reasons({ text: "気合で資料を進める" })).toBe("banned_word");
  });

  it("#3 valid LLM candidate は validated 止まり・heuristic・直接採用されない", () => {
    const r = produceMinimalProgress([cand()], CTX);
    expect(r.decompositionStatus).toBe("validated");
    expect(r.validatedByEngine).toBe(true);
    expect(r.acceptedMinimalProgress).toBeNull(); // ★LLM 直接採用禁止
    expect(r.confirmationRequired).toBe(true);
    const a = r.candidates[0].attribute!;
    expect(a.status).toBe("heuristic");
    expect(a.confidence).toBeLessThanOrEqual(HEURISTIC_CONFIDENCE_MAX);
    expect(a.displayPolicy).toBe("notActionable");
    expect(realityAttributeViolations("mp", a)).toEqual([]);
  });

  it("#4 user_confirmed candidate のみ acceptedMinimalProgress になる", () => {
    const r = produceMinimalProgress([cand({ sourceKind: "user_confirmed", evidenceRefs: ["user:tap"] })], CTX);
    expect(r.decompositionStatus).toBe("accepted");
    expect(r.acceptedMinimalProgress).not.toBeNull();
    expect(r.confirmationRequired).toBe(false);
    const a = r.acceptedMinimalProgress!;
    expect(a.status).toBe("confirmed");
    expect(a.displayPolicy).toBe("visible");
    expect(realityAttributeViolations("mp", a)).toEqual([]);
  });

  it("#5 LLM + user_confirmed 混在でも採用は user_confirmed のみ", () => {
    const r = produceMinimalProgress(
      [cand({ text: "参考資料を1つ開く" }), cand({ text: "目次を3行書く", sourceKind: "user_confirmed", evidenceRefs: ["user:tap"] })],
      CTX,
    );
    expect(r.validatedByEngine).toBe(true);
    expect(r.decompositionStatus).toBe("accepted");
    expect(r.acceptedMinimalProgress!.value).toBe("目次を3行書く");
  });

  it("#6 全 candidate reject なら proposed（validated でない・未採用）", () => {
    const r = produceMinimalProgress([cand({ text: "資料を作成する" }), cand({ text: "  " })], CTX);
    expect(r.validatedByEngine).toBe(false);
    expect(r.decompositionStatus).toBe("proposed");
    expect(r.acceptedMinimalProgress).toBeNull();
  });
});
