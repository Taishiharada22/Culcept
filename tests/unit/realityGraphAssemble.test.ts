/**
 * assembleRealityGraph（RC2a-6 = RealityGraphSnapshot v0 root assembler）— CEO 必須 12 項
 * 正本: docs/reality-graph-contract-hardening-rg06.md §1 / identity-hardening-rg06b §1-4/§12 / CEO RC2a-6 GO
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
import {
  assembleRealityGraph,
  realityGraphSnapshotViolations,
  GRAPH_ASSEMBLER_VERSION,
  GRAPH_SCHEMA_VERSION,
  VIEWER_SCOPE_PENDING,
} from "@/lib/plan/realityCore/realityGraphSnapshot";
import {
  buildGraphBaseId,
  graphViewerKey,
  derivationRevision,
  revisionOf,
  REALITY_DERIVATION_VERSIONS,
} from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self"); // 擬名化（raw UUID を fixture に書かない）

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as unknown as ExternalAnchor;
}

/** anchors + JST now から compile 済み材料一式を作る */
function materials(anchors: ExternalAnchor[], utcNow: Date) {
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

const NOON_UTC = new Date(Date.UTC(2026, 5, 12, 3, 0)); // JST 12:00
const TWO_PLACES = [
  anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
  anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
];

function graphFor(anchors: ExternalAnchor[], utcNow: Date, viewerKey: string | undefined = VIEWER) {
  const m = materials(anchors, utcNow);
  return assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey });
}

describe("manifest 一致（RC2a-1b §4）", () => {
  it("GRAPH_ASSEMBLER_VERSION === manifest.graphAssembler / GRAPH_SCHEMA_VERSION === manifest.graphSchema", () => {
    expect(GRAPH_ASSEMBLER_VERSION).toBe(REALITY_DERIVATION_VERSIONS.graphAssembler);
    expect(GRAPH_SCHEMA_VERSION).toBe(REALITY_DERIVATION_VERSIONS.graphSchema);
  });
});

describe("#1 same input → deterministic graphBaseId / snapshotId", () => {
  it("同一入力で 2 回 assemble → graphBaseId / snapshotId 一致", () => {
    const a = graphFor(TWO_PLACES, NOON_UTC);
    const b = graphFor(TWO_PLACES, NOON_UTC);
    expect(a.graphBaseId).toBeTruthy();
    expect(a.snapshotId).toBeTruthy();
    expect(a.graphBaseId).toBe(b.graphBaseId);
    expect(a.snapshotId).toBe(b.snapshotId);
  });
  it("graphBaseId は inputRevisionSet から再構成できる（basis の透明性）", () => {
    const a = graphFor(TWO_PLACES, NOON_UTC);
    expect(a.graphBaseId).toBe(
      buildGraphBaseId({ subjectiveDate: a.subjectiveDate, viewerKey: a.viewerScope.viewerKey, inputRevisionSet: a.inputRevisionSet }),
    );
    expect(a.inputRevisionSet.derivationRevision).toBe(derivationRevision(REALITY_DERIVATION_VERSIONS));
  });
});

describe("#2 computedAt/builtAt の秒/ms は graphBaseId を揺らさない（分は snapshotId 層のみ）", () => {
  it("同分・秒違い → graphBaseId も snapshotId も不変", () => {
    const a = graphFor(TWO_PLACES, new Date(Date.UTC(2026, 5, 12, 3, 0, 1, 100))); // 12:00:01.1
    const b = graphFor(TWO_PLACES, new Date(Date.UTC(2026, 5, 12, 3, 0, 59, 900))); // 12:00:59.9
    expect(a.graphBaseId).toBe(b.graphBaseId);
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(a.builtAt.nowInstant).not.toBe(b.builtAt.nowInstant); // metadata は異なる（identity 対象外）
  });
  it("分が進む → graphBaseId 不変（day-level）/ snapshotId は変化（minute-level）", () => {
    const a = graphFor(TWO_PLACES, new Date(Date.UTC(2026, 5, 12, 3, 0))); // 12:00
    const b = graphFor(TWO_PLACES, new Date(Date.UTC(2026, 5, 12, 3, 1))); // 12:01
    expect(a.graphBaseId).toBe(b.graphBaseId); // 2 層モデル: base は分に依存しない
    expect(a.snapshotId).not.toBe(b.snapshotId); // 分は snapshot 層でのみ入る
  });
});

describe("#3 derivationVersion が変われば identity basis が変わる", () => {
  it("derivationRevision を bump すると graphBaseId が変わる（コード更新後の同 id 防止）", () => {
    const a = graphFor(TWO_PLACES, NOON_UTC);
    const bumped = { ...a.inputRevisionSet, derivationRevision: revisionOf({ ...REALITY_DERIVATION_VERSIONS, graphAssembler: 1 }) };
    expect(buildGraphBaseId({ subjectiveDate: a.subjectiveDate, viewerKey: a.viewerScope.viewerKey, inputRevisionSet: bumped })).not.toBe(a.graphBaseId);
  });
});

describe("#4 dayGraphSnapshotId が変われば graphBaseId が変わる", () => {
  it("別 anchors（別 anchor ID 集合 → 別 dayGraphSnapshotId）→ 別 graphBaseId", () => {
    // computeSnapshotId は date + anchor ID 集合 + day 境界 + gap のみを含む。
    // 確実に dayGraphSnapshotId を変えるには anchor ID 集合を変える。
    const a = graphFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    const b = graphFor(TWO_PLACES, NOON_UTC); // a1 + a2（ID 集合が違う）
    expect(a.inputRevisionSet.dayGraphRevision).not.toBe(b.inputRevisionSet.dayGraphRevision);
    expect(a.graphBaseId).not.toBe(b.graphBaseId);
  });

  // ── RC2a-6A で CLOSED（旧 [KNOWN GAP] の tripwire が flip）──
  // dayGraphSnapshotId は content-aware 化された（computeSnapshotId v2 = anchor 内容 revision を含む）。
  // よって **同一 anchor ID 集合でも時刻/場所変更で dayGraphRevision → graphBaseId/snapshotId が変わる**。
  // RC2a identity chain 全体が root 修正を継承（realityCore は無変更で恩恵を受ける）。
  it("[RC2a-6A CLOSED] 同一 ID 集合で anchor 時刻/場所変更 → dayGraphSnapshotId 変化 → graphBaseId/snapshotId 変化", () => {
    const a = graphFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    const b = graphFor([anchor({ id: "a1", startTime: "13:00", endTime: "14:00", locationText: "新宿" })], NOON_UTC);
    expect(a.inputRevisionSet.dayGraphRevision).not.toBe(b.inputRevisionSet.dayGraphRevision); // 内容変更が input revision に乗る
    expect(a.graphBaseId).not.toBe(b.graphBaseId); // → graphBaseId も変化（root fix を継承）
    expect(a.snapshotId).not.toBe(b.snapshotId);
    expect(a.momentSnapshot.momentSnapshotCacheKey).not.toBe(b.momentSnapshot.momentSnapshotCacheKey); // chain 全体が修正を継承
  });
});

describe("#5 duplicate ern / mv / cs id は fail", () => {
  it("duplicate eventRealityNodeId → throw", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    expect(() => assembleRealityGraph({ ern: [...m.ern, ...m.ern], mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER })).toThrow(/duplicate eventRealityNodeId/);
  });
  it("duplicate movementRealityId → throw", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    expect(() => assembleRealityGraph({ ern: m.ern, mv: [...m.mv, ...m.mv], cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER })).toThrow(/duplicate movementRealityId/);
  });
  it("duplicate commitmentSignalId → throw", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    expect(() => assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: [...m.cs, ...m.cs], momentSnapshot: m.momentSnapshot, viewerKey: VIEWER })).toThrow(/duplicate commitmentSignalId/);
  });
  it("材料が momentSnapshot と別集合 → throw（別 graph 由来の検出）", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    const other = materials([anchor({ id: "z9", startTime: "09:00", endTime: "09:30", locationText: "品川" })], NOON_UTC);
    expect(() => assembleRealityGraph({ ern: other.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER })).toThrow(/一致しない/);
  });
});

describe("#6 missingInputRefs が Graph root まで失われない", () => {
  it("momentSnapshot の全 ref が graph.missingInputRefs に含まれる + graph-level pending ref が追加される", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    const g = assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER });
    for (const r of m.momentSnapshot.missingInputRefs) {
      expect(g.missingInputRefs.some((gr) => gr.dedupeKey === r.dedupeKey)).toBe(true);
    }
    // graph-level: pending revision を pipeline_capability として追加（environment/hints/shift + record）
    const codes = g.missingInputRefs.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(["environment_pending", "hints_pending", "shift_pending", "day_state_record_pending"]));
    expect(g.pendingInputs).toEqual(expect.arrayContaining(["recordRevision", "environmentRevision", "hintsRevision", "shiftRevision"]));
  });
  it("dayStateRecord 供給時は recordRevision が real・pending から外れる", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    const fakeRecord = {
      date: DATE,
      estimatesFrozen: { at: "2026-06-12T00:00:00.000Z", frozenKind: "morning", values: {} },
      userInputs: { corrections: [], manualLevels: {}, moodCode: null, sleepQuality: null },
      nightCheck: null,
    } as never;
    const g = assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER, dayStateRecord: fakeRecord });
    expect(g.inputRevisionSet.recordRevision).not.toBe("rec0:none");
    expect(g.pendingInputs).not.toContain("recordRevision");
  });
});

describe("#7 flat missingInputs は refs 由来のみ", () => {
  it("全 flat code が ref に存在・余剰 code なし・sort 済み", () => {
    const g = graphFor(TWO_PLACES, NOON_UTC);
    for (const code of g.missingInputs) {
      expect(g.missingInputRefs.some((r) => r.code === code)).toBe(true);
    }
    expect([...g.missingInputs]).toEqual([...g.missingInputs].sort());
  });
});

describe("#8 raw viewerId が snapshotId / debug に入らない", () => {
  it("viewerKey は擬名化（vk...）・raw 'viewer-self' が id に出ない", () => {
    const g = graphFor(TWO_PLACES, NOON_UTC, graphViewerKey("viewer-self"));
    expect(g.viewerScope.kind).toBe("pseudonymous");
    expect(g.viewerScope.viewerKey.startsWith("vk")).toBe(true);
    expect(g.graphBaseId.includes("viewer-self")).toBe(false);
    expect(g.snapshotId.includes("viewer-self")).toBe(false);
    expect(JSON.stringify(g).includes("viewer-self")).toBe(false);
  });
  it("viewerKey 未供給 → pending sentinel（raw id を作らない）", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    const g = assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot }); // viewerKey 省略
    expect(g.viewerScope.kind).toBe("pending");
    expect(g.viewerScope.viewerKey).toBe(VIEWER_SCOPE_PENDING);
  });
});

describe("#9 runtime Department object が存在しない", () => {
  it("missingInputRef の sourceField に部署名がない・flag/violations 健全", () => {
    const g = graphFor(TWO_PLACES, NOON_UTC);
    const DEPTS = ["Plan", "Mobility", "Energy", "Context", "Memory", "Risk", "Permission", "Communication"];
    for (const r of g.missingInputRefs) expect(DEPTS).not.toContain(r.sourceField);
    expect(g.safetyFlags.noRuntimeDepartmentObject).toBe(true);
    expect(realityGraphSnapshotViolations(g)).toEqual([]);
  });
});

describe("#10 判断結果を出さない（Feasibility/Proposal/DepartureLines/Permission action）", () => {
  it("該当 field が型に存在しない + safetyFlags が宣言", () => {
    const g = graphFor(TWO_PLACES, NOON_UTC);
    for (const k of ["feasibility", "collapseRisk", "proposals", "departureLines", "permissionLevel", "actionBoundary", "recommendation", "threeOptions"]) {
      expect(k in g).toBe(false);
    }
    expect(g.safetyFlags.noFeasibilityOutput).toBe(true);
    expect(g.safetyFlags.noProposalOutput).toBe(true);
    expect(g.safetyFlags.noPermissionRelaxation).toBe(true);
    expect(g.safetyFlags.cacheKeyNotContentProof).toBe(true);
  });
});

describe("#11 array index に依存しない（順序を変えても同一 graph）", () => {
  it("ern/mv/cs を逆順で渡しても graphBaseId/snapshotId/node 整列が一致", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    const a = assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER });
    const b = assembleRealityGraph({
      ern: [...m.ern].reverse(),
      mv: [...m.mv].reverse(),
      cs: [...m.cs].reverse(),
      momentSnapshot: m.momentSnapshot,
      viewerKey: VIEWER,
    });
    expect(a.graphBaseId).toBe(b.graphBaseId);
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(a.eventRealityNodes.map((e) => e.eventRealityNodeId)).toEqual(b.eventRealityNodes.map((e) => e.eventRealityNodeId));
    expect(a.movementRealityNodes.map((x) => x.movementRealityId)).toEqual(b.movementRealityNodes.map((x) => x.movementRealityId));
  });
});

describe("#12 UI/storage/API/DB/location/notification/external read に触れない（静的検査）", () => {
  it("module source に IO / 時刻 API / 乱数の痕跡がない", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/realityGraphSnapshot.ts"), "utf8");
    // コメント（doc に "Date.now なし" 等と書くため）を除去してから実コードのみ走査
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("整合性: builtAt carry / decisionDebt 単一正本 / sourceRefs", () => {
  it("builtAt = momentSnapshot.instant / decisionDebt は同一参照 / cacheKey は sourceRefs に trace", () => {
    const m = materials(TWO_PLACES, NOON_UTC);
    const g = assembleRealityGraph({ ern: m.ern, mv: m.mv, cs: m.cs, momentSnapshot: m.momentSnapshot, viewerKey: VIEWER });
    expect(g.builtAt).toBe(m.momentSnapshot.instant); // carry（同一参照）
    expect(g.decisionDebt).toBe(m.momentSnapshot.decisionDebt); // 単一正本
    expect(g.sourceRefs.momentSnapshotCacheKey).toBe(m.momentSnapshot.momentSnapshotCacheKey);
    expect(g.timezone).toBe("Asia/Tokyo");
    expect(g.integrityViolations).toEqual([]);
    expect(g.derivationVersionSet).toBe(REALITY_DERIVATION_VERSIONS);
  });
});
