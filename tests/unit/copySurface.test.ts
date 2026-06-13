/**
 * renderCopy / copyViolations（RJ2e = CopySurface user-facing 文面 v0）— CEO 必須 16 fixtures
 * 正本: docs/reality-copy-surface-impl-design-rj2e-0.md（RJ2e-0/RJ2e-0A・§11 exact catalog）
 *
 * 核: consumer view → exact template / choice label のみで文面化。三層防御（入力 view precheck・出力 exact catalog・walker）。
 *   assertion/verdict/departure/category/raw 文面禁止。resolve_overlap は duplicate/衝突を断定しない（RJ1b）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { graphViewerKey } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { inferredAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import type { CommitmentSignalV0 } from "@/lib/plan/realityCore/commitmentSignal";
import { buildRealityJudgmentInput, type TargetScope } from "@/lib/plan/realityCore/realityJudgmentInput";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";
import { evaluateCollapseRisk } from "@/lib/plan/realityCore/collapseRisk";
import { evaluateCollapsePropagation } from "@/lib/plan/realityCore/collapsePropagation";
import { evaluateInterventionEligibility } from "@/lib/plan/realityCore/interventionEligibility";
import { evaluateInterventionDecision } from "@/lib/plan/realityCore/interventionDecision";
import { deriveSurfacePlan } from "@/lib/plan/realityCore/judgmentSurfacePlan";
import { deriveSurfaceClaims, bindClaimsToPlan } from "@/lib/plan/realityCore/surfaceClaim";
import { deriveClarificationQuestions } from "@/lib/plan/realityCore/clarificationQuestion";
import { deriveSurfaceProjection, type SurfaceProjectionConsumerViewV0 } from "@/lib/plan/realityCore/surfaceProjection";
import { renderCopy, copyViolations, type RenderedCopyV0 } from "@/lib/plan/realityCore/copySurface";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const EARLY_UTC = new Date(Date.UTC(2026, 5, 12, 0, 0));

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", sourceId: "src-manual", title: "予定", date: DATE, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
function base(anchors: ExternalAnchor[], utcNow: Date = EARLY_UTC) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(utcNow);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
  return { ern, mv, cs, momentSnapshot };
}
function snap(b: ReturnType<typeof base>, opts: { ernOverrides?: Record<string, Partial<EventRealityNodeV0>>; csOverrides?: Record<string, Partial<CommitmentSignalV0>> } = {}) {
  const ern = b.ern.map((e) => (opts.ernOverrides?.[e.eventRealityNodeId] ? { ...e, ...opts.ernOverrides[e.eventRealityNodeId] } : e));
  const cs = b.cs.map((c) => (opts.csOverrides?.[c.targetNodeId] ? { ...c, ...opts.csOverrides[c.targetNodeId] } : c));
  return assembleRealityGraph({ ern, mv: b.mv, cs, momentSnapshot: b.momentSnapshot, viewerKey: VIEWER });
}
function viewFor(snapshot: ReturnType<typeof snap>, scope: TargetScope): SurfaceProjectionConsumerViewV0 {
  const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
  const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
  const elig = evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: scope });
  const dec = evaluateInterventionDecision({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig });
  const plan = deriveSurfacePlan({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig, interventionDecision: dec });
  const claimSet = deriveSurfaceClaims({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
  const bound = bindClaimsToPlan(plan, claimSet);
  const questionSet = deriveClarificationQuestions({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
  return deriveSurfaceProjection({ boundSurface: bound, questionSet }).consumerView;
}
function copyFor(snapshot: ReturnType<typeof snap>, scope: TargetScope): { view: SurfaceProjectionConsumerViewV0; copy: RenderedCopyV0 } {
  const view = viewFor(snapshot, scope);
  return { view, copy: renderCopy(view) };
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const EV = (id: string): TargetScope => ({ kind: "event", eventRealityNodeId: ERN(id) });
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
const permLevel = (n: number) => inferredAttribute(n, 0.7, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"];
const boolTrue = () => inferredAttribute(true, 0.7, ["test_gate"], { status: "inferred", displayPolicy: "visible" });
const boolFalse = () => inferredAttribute(false, 0.7, ["test_absent"], { status: "inferred", displayPolicy: "visible" });
const gatesAbsent = () => ({ otherPeoplePossible: boolFalse(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() });
const CLEAR_PERM = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
function confHard(b: ReturnType<typeof base>, ernId: string): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2), fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}
const blockedSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } } });
const observeSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
const gateSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });
const fourGateSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { ...CLEAR_PERM, sensitiveFlagged: true } }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolTrue(), workOrShiftPossible: boolTrue() } } });
function collisionSnap(ids: string[]) {
  const b = base(ids.map((id) => anchor({ id, startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" })));
  const ernOverrides: Record<string, Partial<EventRealityNodeV0>> = {};
  const csOverrides: Record<string, Partial<CommitmentSignalV0>> = {};
  for (const id of ids) { ernOverrides[ERN(id)] = confHard(b, ERN(id)); csOverrides[ERN(id)] = gatesAbsent(); }
  return snap(b, { ernOverrides, csOverrides });
}

// CEO 文面承認済 exact catalog（test 正本・実装と一致）
const CLAIM_EXACT: Record<string, string> = { observation: "メモがあります。", status_note: "確認前の注意点があります。", info_incomplete: "まだ未確定の点があります。", needs_confirmation: "確認が必要な点があります。" };
const QUESTION_EXACT: Record<string, string> = { needs_verification: "確認しますか？", resolve_overlap: "重なって見える予定があります。確認しますか？", resolve_missing_info: "未確定の点を確認しますか？" };
const CHOICE_EXACT: Record<string, string[]> = { needs_verification: ["確認する", "あとで"], resolve_overlap: ["あとで確認", "まだ決めない"], resolve_missing_info: ["確認する", "そのまま"] };

describe("RJ2e #1 display suppress → copies []", () => {
  it("blocked → suppress・copies []", () => {
    const { copy } = copyFor(blockedSnap(), EV("a1"));
    expect(copy.display).toBe("suppress");
    expect(copy.claimCopies).toEqual([]);
    expect(copy.questionCopies).toEqual([]);
    expect(copyViolations(copy)).toEqual([]);
  });
});

describe("RJ2e #2 passive view → claim copies only", () => {
  it("observe → claim copies・question copies []", () => {
    const { copy } = copyFor(observeSnap(), EV("a1"));
    expect(copy.display).toBe("render");
    expect(copy.claimCopies.length).toBeGreaterThan(0);
    expect(copy.questionCopies).toEqual([]);
    expect(copyViolations(copy)).toEqual([]);
  });
});

describe("RJ2e #3 ask view → claim + question copies", () => {
  it("gate → claim + question copies", () => {
    const { copy } = copyFor(gateSnap(), EV("a1"));
    expect(copy.claimCopies.length).toBeGreaterThan(0);
    expect(copy.questionCopies.length).toBeGreaterThan(0);
    expect(copyViolations(copy)).toEqual([]);
  });
});

describe("RJ2e #4/#14 exact template whitelist + dynamic interpolation なし", () => {
  it("全 copy text が exact catalog と一致・tamper text → violation", () => {
    const { copy } = copyFor(fourGateSnap(), EV("a1"));
    for (const cc of copy.claimCopies) expect(cc.text).toBe(CLAIM_EXACT[cc.kind]);
    for (const qc of copy.questionCopies) expect(qc.text).toBe(QUESTION_EXACT[qc.kind]);
    const tampered: RenderedCopyV0 = { ...copy, claimCopies: copy.claimCopies.map((c, i) => (i === 0 ? { ...c, text: `${c.text}〜さん` } : c)) };
    expect(copyViolations(tampered).some((m) => m.includes("exact catalog と不一致"))).toBe(true);
  });
});

describe("RJ2e #5 exact choice label whitelist", () => {
  it("全 choiceLabels が exact catalog と一致・tamper → violation", () => {
    const { copy } = copyFor(gateSnap(), EV("a1"));
    for (const qc of copy.questionCopies) expect(qc.choiceLabels).toEqual(CHOICE_EXACT[qc.kind]);
    const tampered: RenderedCopyV0 = { ...copy, questionCopies: copy.questionCopies.map((q) => ({ ...q, choiceLabels: ["削除する", "移動する"] })) };
    const v = copyViolations(tampered);
    expect(v.some((m) => m.includes("choiceLabels が exact catalog と不一致") || m.includes("forbidden lexicon"))).toBe(true);
  });
});

describe("RJ2e #6-10 forbidden lexicon が出ない", () => {
  it("verdict/departure/sensitive/probability/action 語が rendered copy に出ない", () => {
    for (const s of [fourGateSnap(), collisionSnap(["a1", "a2"]), observeSnap()]) {
      const { copy } = copyFor(s, s === collisionSnap(["a1", "a2"]) ? { kind: "day" } : EV("a1"));
      const json = JSON.stringify(copy);
      const forbidden = ["成立", "遅刻", "崩れ", "失敗", "間に合", "出発", "時刻", "分後", "ルート", "到着", "予約", "支払", "仕事", "シフト", "相手", "機微", "確率", "スコア", "％", "削除", "送信", "支払う", "実行", "自動"];
      for (const t of forbidden) expect(json.includes(t)).toBe(false);
      expect(copyViolations(copy)).toEqual([]);
    }
  });
});

describe("RJ2e #11 subjectRef/relationRef/raw id が文面に出ない", () => {
  it("raw id token 非出現", () => {
    const { copy } = copyFor(collisionSnap(["a1", "a2", "a3"]), { kind: "day" });
    const json = JSON.stringify(copy);
    for (const t of ["ern:", "cl:", "subject_", "relation_", "sp:", "pj:"]) expect(json.includes(t)).toBe(false);
    expect(copyViolations(copy)).toEqual([]);
  });
});

describe("RJ2e #12 resolve_overlap が duplicate 断定しない", () => {
  it("collision → resolve_overlap copy が重複/同じ予定/別の予定/削除/移動/出発 を含まない", () => {
    const { copy } = copyFor(collisionSnap(["a1", "a2"]), { kind: "day" });
    const ro = copy.questionCopies.find((q) => q.kind === "resolve_overlap");
    expect(ro).toBeTruthy();
    const blob = ro!.text + ro!.choiceLabels.join("");
    for (const t of ["重複", "同じ予定", "別の予定", "削除", "移動", "出発", "間に合"]) expect(blob.includes(t)).toBe(false);
    expect(ro!.choiceLabels).toEqual(["あとで確認", "まだ決めない"]);
  });
});

describe("RJ2e #13 view precheck が走る", () => {
  it("unsafe view（raw id 注入）→ renderCopy throw", () => {
    const view = viewFor(observeSnap(), EV("a1"));
    const unsafe = { ...view, claims: [{ kind: "observation" as const, subjectRef: `ern:${DATE}:a1` }] } as unknown as SurfaceProjectionConsumerViewV0;
    expect(() => renderCopy(unsafe)).toThrow();
  });
});

describe("RJ2e #15 serialization backstop", () => {
  it("正常 copy → backstop PASS・raw id 注入 copy → 検出", () => {
    const { copy } = copyFor(gateSnap(), EV("a1"));
    expect(copyViolations(copy)).toEqual([]);
    const leaked: RenderedCopyV0 = { ...copy, claimCopies: copy.claimCopies.map((c) => ({ ...c, text: `${c.text} ern:${DATE}:a1` })) };
    expect(copyViolations(leaked).some((m) => m.includes("raw id"))).toBe(true);
  });
});

describe("RJ2e #16 IO 不接触（source-scan）", () => {
  it("copySurface.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/copySurface.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2e happy-path: 4 gate → 全 needs_verification 同一文面", () => {
  it("sensitive 含む 4 gate が同一テンプレートで区別不能", () => {
    const { copy } = copyFor(fourGateSnap(), EV("a1"));
    const nv = copy.questionCopies.filter((q) => q.kind === "needs_verification");
    expect(nv.length).toBe(4);
    expect(new Set(nv.map((q) => q.text)).size).toBe(1);
    expect(nv.every((q) => q.text === "確認しますか？")).toBe(true);
  });
});
