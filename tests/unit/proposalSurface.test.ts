/**
 * RO-5 — Proposal Surface Contract / UI 併存解消 pure view-model。
 *   RO-4 ProposalRouteSetV0 → 表示用 DTO の薄写像。internal trace 非露出・conceptKind 親分離・
 *   empty-day と 4-gram 非共有・三層防御 walker。pure・実 UI 接続なし。
 * 正本設計: docs/reality-os-ro5-proposal-surface-contract-design.md（RO-5 v0.1・10 mustFix 反映）
 *
 * CEO 必須検証点 + mustFix:
 *   - 二重正本回避: empty-day import 0 / conceptKind 親分離 / push ラベル empty-day と 4-gram 非共有（M1）
 *   - leak guard: evidenceRefs/raw id（proute:/trn:/anchor_/gap_）非露出（M3/M6）
 *   - honest: recommended=null→recommendationAbsent / reasons 空→hasNoBasis / confidence hedged
 *   - raw stance 非露出（stanceLabelKey 経由）
 */
import { describe, it, expect } from "vitest";
import {
  buildProposalSurface,
  proposalSurfaceViolations,
  PROPOSAL_SURFACE_VERSION,
  type ProposalSurfaceViewV0,
} from "@/lib/plan/realityCore/proposalSurface";
import type {
  ProposalRouteSetV0,
  ProposalRouteV0,
  ProposalRouteReasonV0,
  RealityProposalStance,
  RouteConfidence,
  RouteBasisBucket,
} from "@/lib/plan/realityCore/proposalRoute";
// end-to-end 用（RO-4 pipeline）
import { buildProposalRoutes } from "@/lib/plan/realityCore/proposalRoute";
import { buildRealityLearningSignal } from "@/lib/plan/realityCore/realityLearningSignal";
import { buildRealityFrame } from "@/lib/plan/realityCore/realityFrame";
import type { RealityGraphSnapshotV0 } from "@/lib/plan/realityCore/realityGraphSnapshot";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import { buildLeaveByLines } from "@/lib/plan/realityCore/leaveByLines";
import { buildTaskRealityNode, type TaskRealityNodeInputV0, type TaskRealityNodeV0 } from "@/lib/plan/realityCore/taskRealityNode";
import type { CorrectionGradientV0 } from "@/lib/plan/realityCore/correctionGradient";
import { inferredAttribute, heuristicAttribute, unknownAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

// ── 直接構築 fixture（surface 単体テスト用） ──
const reason = (stance: RealityProposalStance, basisBucket: RouteBasisBucket, evidenceRefs: string[]): ProposalRouteReasonV0 =>
  ({ stance, basisBucket, evidenceRefs });
function routeSet(over: {
  recommended?: RealityProposalStance | null;
  confidence?: RouteConfidence;
  protectReasons?: ProposalRouteReasonV0[];
  easyReasons?: ProposalRouteReasonV0[];
  pushReasons?: ProposalRouteReasonV0[];
  unresolvedNotes?: string[];
} = {}): ProposalRouteSetV0 {
  const conf = over.confidence ?? "low";
  const r = (stance: RealityProposalStance, reasons: ProposalRouteReasonV0[]): ProposalRouteV0 => ({ stance, reasons, confidence: conf });
  return {
    schemaVersion: 0,
    routeSetId: "proute:seed:trn:t1", // raw id を含む（leak guard 検証用）
    forTarget: { universe: "workLane", kind: "task", id: "trn:t1" },
    routes: [
      r("protect", over.protectReasons ?? []),
      r("easy", over.easyReasons ?? []),
      r("push", over.pushReasons ?? []),
    ],
    recommended: over.recommended ?? null,
    unresolvedCount: over.unresolvedNotes?.length ?? 0,
    unresolvedNotes: over.unresolvedNotes ?? [],
    ledgerRefsObserved: ["trn:t1"], // raw id を含む（leak guard 検証用）
  };
}

// empty-day TIER_INTENT_LINE（empty-day-reasoning.ts:42-44・cross-catalog 4-gram 検証の参照値）
const EMPTY_DAY_LINES = [
  "予定を詰めすぎず、余白を残す組み方です",
  "回復を優先する、軽めの組み方です",
  "前に進めたいこと向けの、動きの多い組み方です",
];
function fourGrams(s: string): Set<string> {
  const clean = s.replace(/[、。]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 4 <= clean.length; i++) out.add(clean.slice(i, i + 4));
  return out;
}

describe("RO-5 構造 — conceptKind 親分離・raw stance 非露出", () => {
  it("#1 conceptKind='reaction_stance'・conceptLabel='今の現実への構え'（empty-day と親分離）", () => {
    const v = buildProposalSurface(routeSet());
    expect(v.conceptKind).toBe("reaction_stance");
    expect(v.conceptLabel).toBe("今の現実への構え");
    expect(PROPOSAL_SURFACE_VERSION).toBe(0);
  });

  it("#2 cards 常に 3（protect/easy/push 順）・stanceLabel は構え語尾", () => {
    const v = buildProposalSurface(routeSet());
    expect(v.cards.map((c) => c.stanceLabelKey)).toEqual(["protect_label", "easy_label", "push_label"]);
    expect(v.cards.map((c) => c.stanceLabel)).toEqual(["守る構え", "楽にいく構え", "進める構え"]);
  });

  it("#3 raw stance 値（'protect'/'easy'/'push'）を DTO に露出しない（stanceLabelKey 経由）", () => {
    const json = JSON.stringify(buildProposalSurface(routeSet({ recommended: "protect" })));
    // stanceLabelKey は 'protect_label' 等。raw 'protect'/'easy'/'push' は単独 token として出ない
    expect(/"protect"/.test(json)).toBe(false);
    expect(/"easy"/.test(json)).toBe(false);
    expect(/"push"/.test(json)).toBe(false);
  });

  it("#4 violations: 正常 DTO は空配列", () => {
    expect(proposalSurfaceViolations(buildProposalSurface(routeSet()))).toEqual([]);
  });
});

describe("RO-5 二重正本回避 — empty-day と 4-gram 非共有（M1）", () => {
  it("#5 全表示文言が empty-day TIER_INTENT_LINE と 4-gram 重複ゼロ", () => {
    const v = buildProposalSurface(routeSet({
      protectReasons: [reason("protect", "diff_collapsed", ["gap_55_to_15"])],
      easyReasons: [reason("easy", "gradient_axis", ["e"])],
      pushReasons: [reason("push", "change_task", ["c"])],
    }));
    const ro5Strings = [
      v.conceptLabel,
      ...v.cards.flatMap((c) => [c.stanceLabel, c.intentLine, ...c.reasons.map((r) => r.basisSummary)]),
      v.confidenceLabel,
    ];
    const emptyDay4g = new Set<string>();
    for (const l of EMPTY_DAY_LINES) for (const g of fourGrams(l)) emptyDay4g.add(g);
    for (const s of ro5Strings) {
      for (const g of fourGrams(s)) {
        expect(emptyDay4g.has(g), `4-gram 衝突: "${g}" in "${s}"`).toBe(false);
      }
    }
  });

  it("#6 push ラベルが empty-day push（前に進めたいこと…）と語頭を共有しない", () => {
    const push = buildProposalSurface(routeSet()).cards[2];
    expect(push.stanceLabel).toBe("進める構え");
    expect(push.stanceLabel.startsWith("前に進め")).toBe(false);
  });
});

describe("RO-5 leak guard — internal trace 非露出（M3/M6）", () => {
  it("#7 DTO に evidenceRefs/forTarget/routeSetId/unresolved*/ledgerRefsObserved が無い", () => {
    const v = buildProposalSurface(routeSet({ protectReasons: [reason("protect", "diff_collapsed", ["gap_55_to_15", "anchor_a1"])] })) as unknown as Record<string, unknown>;
    for (const k of ["evidenceRefs", "forTarget", "routeSetId", "unresolvedCount", "unresolvedNotes", "ledgerRefsObserved"]) {
      expect(k in v).toBe(false);
    }
  });

  it("#8 JSON に raw id token（proute:/trn:/anchor_/gap_/ern:）が出現しない", () => {
    // evidenceRefs に raw id を満載した set でも DTO は basisSummary のみ
    const v = buildProposalSurface(routeSet({
      protectReasons: [reason("protect", "diff_collapsed", ["gap_55_to_15", "anchor_a1", "ern:2026-06-20:a1"])],
      pushReasons: [reason("push", "change_task", ["diff_changed_completionStatus", "trn:t1"])],
    }));
    const json = JSON.stringify(v);
    for (const tok of ["proute:", "trn:", "anchor_", "gap_", "ern:"]) {
      expect(json.includes(tok), `token leak: ${tok}`).toBe(false);
    }
    expect(proposalSurfaceViolations(v)).toEqual([]);
  });

  it("#9 reasons は basisBucket→要約のみ（evidenceRefs 生表示しない・同 bucket は 1 句圧縮）", () => {
    const v = buildProposalSurface(routeSet({
      protectReasons: [reason("protect", "diff_collapsed", ["gap_1_to_0"]), reason("protect", "diff_collapsed", ["gap_9_to_2"])],
    }));
    const protect = v.cards[0];
    expect(protect.reasons).toEqual([{ basisSummary: "直前に動いた予定と関連があります" }]); // 2 evidence → 1 句
  });
});

describe("RO-5 honest — 偽推薦なし・黙らせない・confidence hedged", () => {
  it("#10 recommended=null → recommendationAbsent=true・recommendedStanceLabelKey=null", () => {
    const v = buildProposalSurface(routeSet({ recommended: null }));
    expect(v.recommendationAbsent).toBe(true);
    expect(v.recommendedStanceLabelKey).toBeNull();
  });

  it("#11 recommended=easy → label key で表現（raw stance でなく）", () => {
    const v = buildProposalSurface(routeSet({ recommended: "easy" }));
    expect(v.recommendationAbsent).toBe(false);
    expect(v.recommendedStanceLabelKey).toBe("easy_label");
  });

  it("#12 reasons 空 route は hasNoBasis=true（黙らせない）", () => {
    const v = buildProposalSurface(routeSet({ protectReasons: [reason("protect", "diff_collapsed", ["g"])] }));
    expect(v.cards[0].hasNoBasis).toBe(false); // protect は根拠あり
    expect(v.cards[1].hasNoBasis).toBe(true); // easy は空
    expect(v.cards[2].hasNoBasis).toBe(true); // push は空
  });

  it("#13 confidence は hedged 表現（low|tentative のみ・断定なし）", () => {
    expect(buildProposalSurface(routeSet({ confidence: "low" })).confidenceLabel).toBe("参考程度の見立てです");
    expect(buildProposalSurface(routeSet({ confidence: "tentative" })).confidenceLabel).toBe("暫定の見立てです");
  });
});

describe("RO-5 walker — 三層防御で不正 DTO を検出", () => {
  it("#14 cards!=3 / raw token 混入 / 禁止 field / 順序違反 を検出", () => {
    const bad = {
      schemaVersion: 0, conceptKind: "reaction_stance", conceptLabel: "今の現実への構え", display: "render",
      cards: [
        { stanceLabelKey: "easy_label", stanceLabel: "楽にいく構え", intentLine: "負荷が下がった分を、軽く使う向きです", reasons: [], hasNoBasis: true },
      ], // 3 でない + 順序違反（先頭が easy）
      recommendedStanceLabelKey: null, recommendationAbsent: true, confidenceLabel: "参考程度の見立てです",
      routeSetId: "proute:x:trn:t1", // 禁止 field + raw token
    } as unknown as ProposalSurfaceViewV0;
    const v = proposalSurfaceViolations(bad);
    expect(v.some((m) => /cards は常に 3/.test(m))).toBe(true);
    expect(v.some((m) => /禁止 field "routeSetId"/.test(m))).toBe(true);
    expect(v.some((m) => /RAW_ID_TOKEN/.test(m))).toBe(true);
  });

  it("#15 catalog 外の文言（dynamic 生成）を検出", () => {
    const v = buildProposalSurface(routeSet());
    const tampered = { ...v, cards: v.cards.map((c, i) => i === 0 ? { ...c, stanceLabel: "勝手に作った文言" } : c) } as ProposalSurfaceViewV0;
    expect(proposalSurfaceViolations(tampered).some((m) => /stanceLabel が catalog 外/.test(m))).toBe(true);
  });
});

// ── end-to-end（RO-4 pipeline → RO-5 surface・signal-trace） ──
describe("RO-5 end-to-end — RO-4 ProposalRouteSet → surface", () => {
  const CE: ChangeEligibilityValue = {
    canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
    requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
  };
  function task(id: string, over: Partial<TaskRealityNodeInputV0> = {}): TaskRealityNodeV0 {
    return buildTaskRealityNode({
      taskId: id, title: "作業",
      deadline: inferredAttribute("2026-06-21T18:00:00", 0.7, ["d"], { status: "confirmed" }),
      estimatedDuration: heuristicAttribute(60, 0.3, ["dur"]), cognitiveLoad: heuristicAttribute(0.5, 0.3, ["load"]),
      canSplit: inferredAttribute(true, 0.6, ["s"]), canMove: inferredAttribute(true, 0.6, ["m"]),
      changeEligibility: inferredAttribute(CE, 0.6, ["gov"]), permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["gov"]),
      ...over,
    });
  }
  function snap(ern: EventRealityNodeV0[] = []): RealityGraphSnapshotV0 {
    return { schemaVersion: 0, graphBaseId: "rgb:2026-06-20:vk1:hashA", snapshotId: "rgs:x:780",
      subjectiveDate: "2026-06-20", minuteOfSubjectiveDay: 780, eventRealityNodes: ern, movementRealityNodes: [], commitmentSignals: [] } as unknown as RealityGraphSnapshotV0;
  }
  const grad = (axis: CorrectionGradientV0["axis"], direction: CorrectionGradientV0["direction"]): CorrectionGradientV0 =>
    ({ axis, contextKey: "shift_day|packed", direction, confidenceDelta: 0.2, verdict: null, basis: ["e"] });

  it("#16 RO-4 pipeline 出力を surface 化し leak なし・violations 空", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame, gradients: [grad("duration", "lower")] });
    const sets = buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" });
    expect(sets).toHaveLength(1);
    const view = buildProposalSurface(sets[0]);
    expect(view.conceptKind).toBe("reaction_stance");
    expect(view.cards[1].hasNoBasis).toBe(false); // easy に gradient 根拠
    expect(view.recommendedStanceLabelKey).toBe("easy_label"); // easy のみ evidence
    expect(proposalSurfaceViolations(view)).toEqual([]);
    const json = JSON.stringify(view);
    for (const tok of ["proute:", "trn:", "gap_", "anchor_"]) expect(json.includes(tok)).toBe(false);
  });
});
