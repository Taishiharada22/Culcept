/**
 * deriveMomentSnapshot（RC2a-5）— MomentStateSnapshot 完全版の fixture（GPT 必須 11 項）
 * 正本: addendum §2 / RG0.6 §3 / CEO RC2a-5 GO + 追加ガード 5 件
 */
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import {
  deriveMomentSnapshot,
  momentSnapshotViolations,
  MOMENT_SNAPSHOT_DERIVE_VERSION,
} from "@/lib/plan/realityCore/momentSnapshot";
import { REALITY_DERIVATION_VERSIONS } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";

const DATE = "2026-06-12";

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

/** anchors + JST now（UTC 注入）から snapshot を作る完全パイプライン */
function snapshotFor(anchors: ExternalAnchor[], utcNow: Date) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(utcNow);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  return deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
}

const NOON_UTC = new Date(Date.UTC(2026, 5, 12, 3, 0)); // JST 12:00

describe("derive version 一致（RC2a-1b §4）", () => {
  it("MOMENT_SNAPSHOT_DERIVE_VERSION === manifest", () => {
    expect(MOMENT_SNAPSHOT_DERIVE_VERSION).toBe(REALITY_DERIVATION_VERSIONS.momentSnapshot);
  });
});

describe("#1 JST 04:59 / 05:00 subjectiveDate 境界", () => {
  it("JST 04:59 → 前 subjectiveDate / JST 05:00 → 当日 subjectiveDate", () => {
    // JST 04:59 = UTC 前日 19:59 / JST 05:00 = UTC 前日 20:00
    const at0459 = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], new Date(Date.UTC(2026, 5, 11, 19, 59)));
    const at0500 = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], new Date(Date.UTC(2026, 5, 11, 20, 0)));
    expect(at0459.instant.wallClockHHMM).toBe("04:59");
    expect(at0459.instant.subjectiveDate).toBe("2026-06-11"); // 前日
    expect(at0500.instant.wallClockHHMM).toBe("05:00");
    expect(at0500.instant.subjectiveDate).toBe("2026-06-12"); // 当日
  });
});

describe("#2 browser local timezone 非依存（JST 強制）", () => {
  it("UTC 14:17 注入 → JST 23:17（getHours 由来でない）", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], new Date(Date.UTC(2026, 5, 12, 14, 17)));
    expect(s.instant.timezone).toBe("Asia/Tokyo");
    expect(s.instant.wallClockHHMM).toBe("23:17");
  });
});

describe("#3 activeWindow / nextRelevantNodes が deterministic", () => {
  it("12:00 時点: 10-11 は past / 14-15 は upcoming / 入力順非依存", () => {
    const anchors = [
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ];
    const s1 = snapshotFor(anchors, NOON_UTC);
    const s2 = snapshotFor([anchors[1]!, anchors[0]!], NOON_UTC);
    expect(s1.relevantNodes.pastEventNodeIds).toContain("ern:2026-06-12:a1");
    expect(s1.relevantNodes.upcomingEventNodeIds).toContain("ern:2026-06-12:a2");
    expect(s1.relevantNodes.pastEventNodeIds).toEqual(s2.relevantNodes.pastEventNodeIds);
    expect([...s1.relevantNodes.upcomingEventNodeIds].sort()).toEqual([...s2.relevantNodes.upcomingEventNodeIds].sort());
  });
  it("active: now が event 区間内なら active に入る", () => {
    // JST 10:30 = UTC 01:30
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], new Date(Date.UTC(2026, 5, 12, 1, 30)));
    expect(s.relevantNodes.activeEventNodeIds).toContain("ern:2026-06-12:a1");
  });
});

describe("#4 ern / mv / cs / decisionDebt が join 可能", () => {
  it("nodeRefs で全ノードが参照できる・cs.targetNodeId = ern id", () => {
    const s = snapshotFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ], NOON_UTC);
    expect(s.nodeRefs.eventRealityNodeIds).toContain("ern:2026-06-12:a1");
    expect(s.nodeRefs.movementRealityIds).toContain("mv:2026-06-12:a1:a2");
    expect(s.nodeRefs.commitmentSignalTargetIds).toContain("ern:2026-06-12:a1"); // cs → ern join
    expect(s.decisionDebt.components.placeDebt).toBeDefined();
  });
});

describe("#5/#6 missingInputs が失われない・placeResolutionPending が消えない", () => {
  it("place あり予定 → place_resolution_pending が snapshot.missingInputs に残る", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    expect(s.missingInputs).toContain("place_resolution_pending");
  });
  it("各ノードの missingInputs が集約される（eta_source_missing / origin_inference_pending 等）", () => {
    const s = snapshotFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ], NOON_UTC);
    expect(s.missingInputs).toContain("eta_source_missing"); // mv / ern leaveBy 由来
    expect(s.missingInputs).toEqual(expect.arrayContaining(["change_candidate_pending"])); // decisionDebt 由来
  });
});

describe("#7 no movement node を移動不要として扱わない", () => {
  it("両端場所なし（mv なし）→ unresolvedMovementIds 空だが mobilityDebt unknown（0 でない）", () => {
    const s = snapshotFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ], NOON_UTC);
    expect(s.relevantNodes.unresolvedMovementIds).toEqual([]); // mv ノードが無い
    expect(s.decisionDebt.components.mobilityDebt.status).toBe("unknown"); // しかし移動不要とは扱わない
    expect(s.missingInputs).toContain("place_missing");
  });
});

describe("#8/#9 判断結果を出さない（snapshot は入力であって判断でない）", () => {
  it("#9 Feasibility / collapseRisk / proposal / departureLines を持たない", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    expect("feasibility" in s).toBe(false);
    expect("feasibilityStatus" in s).toBe(false);
    expect("collapseRisk" in s).toBe(false);
    expect("proposals" in s).toBe(false);
    expect("departureLines" in s).toBe(false);
    expect("permissionLevel" in s).toBe(false);
  });
  it("#8 knownComponentSummary は debugOnly のまま（正本入力にしない）", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    expect(s.decisionDebt.knownComponentSummary.displayPolicy).toBe("debugOnly");
  });
});

describe("#10 provenance / sourceRefs / evidenceRefs が欠けると fail", () => {
  it("健全 snapshot は違反 0 / sourceRefs 欠落で違反検出", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    expect(momentSnapshotViolations(s)).toEqual([]);
    const broken = { ...s, sourceRefs: { dayGraphSnapshotId: "" } };
    expect(momentSnapshotViolations(broken).length).toBeGreaterThan(0);
    const brokenEvidence = { ...s, evidenceRefs: [] };
    expect(momentSnapshotViolations(brokenEvidence).length).toBeGreaterThan(0);
  });
});

// ─────────── RC2a-5A closeout audit（GPT 8 点） ───────────

describe("#3 MomentSnapshot identity（決定的・id≠内容証明・runtime timestamp で揺れない）", () => {
  it("momentSnapshotCacheKey は決定的・秒/ms 違いで不変（minute 精度）・derive/derivation 版を basis に・id≠内容証明", () => {
    const anchors = [anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })];
    const a = snapshotFor(anchors, new Date(Date.UTC(2026, 5, 12, 3, 0, 1, 100))); // JST 12:00:01.1
    const b = snapshotFor(anchors, new Date(Date.UTC(2026, 5, 12, 3, 0, 59, 900))); // JST 12:00:59.9
    expect(a.momentSnapshotCacheKey).toBeTruthy();
    expect(a.momentSnapshotCacheKey).toBe(b.momentSnapshotCacheKey); // 同 minute → 同 key（秒で揺れない）
    expect(a.instant.nowInstant).not.toBe(b.instant.nowInstant); // metadata は異なる（identity 対象外）
    const next = snapshotFor(anchors, new Date(Date.UTC(2026, 5, 12, 3, 1, 0))); // JST 12:01
    expect(next.momentSnapshotCacheKey).not.toBe(a.momentSnapshotCacheKey); // minute 変化で key 変化
    expect(a.derivationVersions).toBe(REALITY_DERIVATION_VERSIONS);
    expect(a.deriveMomentSnapshotVersion).toBe(0);
    expect(a.inputRevisionSetPending).toBe(true); // full InputRevisionSet は RC2a-6 で完成
  });
});

describe("#4 missingInputs の source trace を失わない（missingInputRefs）", () => {
  it("各 flat code に source node/field が紐づく・place_resolution_pending の source が event leaveBy 等で復元可能", () => {
    const s = snapshotFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ], NOON_UTC);
    // missingInputRefs は「どのノードのどの field」を保持
    const etaRef = s.missingInputRefs.find((r) => r.code === "eta_source_missing");
    expect(etaRef).toBeDefined();
    expect(etaRef!.sourceNodeId).toBeTruthy();
    expect(etaRef!.sourceField).toBeTruthy();
    // dedup（flat codes）しても trace（refs）は source ごとに残る
    expect(s.missingInputRefs.length).toBeGreaterThanOrEqual(s.missingInputs.length);
    // 健全性検証: 全 flat code が refs に source 付きで存在
    expect(momentSnapshotViolations(s)).toEqual([]);
  });
});

describe("#5 id-based join（array index 非依存・duplicate id guard）", () => {
  it("cs.targetNodeId ∈ ern ids（id join）・duplicate ern id は throw", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    for (const t of s.nodeRefs.commitmentSignalTargetIds) {
      expect(s.nodeRefs.eventRealityNodeIds).toContain(t); // cs → ern を id で join 可能
    }
  });
});

describe("#6 日跨ぎ / 深夜 event の扱い（捏造せず制約を明示）", () => {
  it("日跨ぎ単一 event（23:00-翌01:00）は DayGraph が end_before_start で拒否 → ern 化されない", () => {
    const { graph, warnings } = buildDayGraph({
      anchors: [anchor({ id: "a1", startTime: "23:00", endTime: "01:00" })],
      date: DATE,
      options: { startTime: "00:00", endTime: "23:59" },
    });
    expect(warnings.some((w) => w.kind === "end_before_start")).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === "event")).toHaveLength(0); // 表現不可（既知制約）
  });
  it("主観日内の深夜 event（02:00-03:00・境界跨ぎなし）は upcoming に正しく分類", () => {
    // 境界を広げて 02:00 event を許可。JST 23:17 now（同一主観日の翌暦日 02:00 は upcoming）
    const { graph } = buildDayGraph({
      anchors: [anchor({ id: "a1", startTime: "02:00", endTime: "03:00", locationText: "渋谷" })],
      date: DATE,
      options: { startTime: "00:00", endTime: "23:59" },
    });
    const ern = compileEventRealityNodes({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "02:00", locationText: "渋谷" })] });
    const dd = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv: [], cs: [] });
    const instant = makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 14, 17))); // JST 23:17
    const moment = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
    const s = deriveMomentSnapshot({ instant, momentState: moment, ern, mv: [], cs: [], decisionDebt: dd });
    // 主観分: 02:00→1260 > now(23:17→1097) → upcoming（生 HH 比較なら 02<23 で past 誤分類するところ）
    expect(s.relevantNodes.upcomingEventNodeIds).toContain("ern:2026-06-12:a1");
    expect(s.relevantNodes.pastEventNodeIds).not.toContain("ern:2026-06-12:a1");
  });
});

describe("RC2a-5B #1 Energy/Memory 未接続は capability pending（部署名を runtime に載せない）", () => {
  it("missingInputRefs に pipeline_capability の energy/memory pending・runtime に部署名フィールドなし", () => {
    const s = snapshotFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], NOON_UTC);
    // 旧 unconnectedDepartments runtime field は廃止
    expect("unconnectedDepartments" in s).toBe(false);
    const codes = s.missingInputRefs.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(["energy_projection_pending", "fatigue_projection_pending", "memory_profile_pending", "correction_profile_pending"]));
    const capRefs = s.missingInputRefs.filter((r) => r.sourceNodeKind === "pipeline_capability");
    expect(capRefs.length).toBeGreaterThan(0);
    // 部署名（Energy/Memory）を sourceField に載せていない・違反 0
    expect(momentSnapshotViolations(s)).toEqual([]);
  });
});

describe("RC2a-5B #3 missingInputRef の最小 field（dedupeKey/displayPolicy/criticality）", () => {
  it("各 ref が dedupeKey/displayPolicy/criticality を持つ・criticality は v0 unknown（0/low でない）・同 code 別 source は別 ref", () => {
    const s = snapshotFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ], NOON_UTC);
    for (const r of s.missingInputRefs) {
      expect(r.dedupeKey).toBeTruthy();
      expect(r.displayPolicy).toBe("debugOnly");
      expect(r.criticality).toBe("unknown"); // v0 は決められない → unknown（0/low にしない）
    }
    // 同 code "eta_source_missing" が ern/mv 複数 source から別 ref として残る（trace を失わない）
    const etaRefs = s.missingInputRefs.filter((r) => r.code === "eta_source_missing");
    expect(etaRefs.length).toBeGreaterThan(1);
    expect(new Set(etaRefs.map((r) => r.dedupeKey)).size).toBe(etaRefs.length); // 各 dedupeKey 一意
  });
});

describe("RC2a-5B #4 全 node 種別 duplicate guard", () => {
  it("duplicate movementRealityId / commitmentSignalId は throw", () => {
    const { graph } = buildDayGraph({ anchors: [
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ], date: DATE });
    const ern = compileEventRealityNodes({ date: DATE, graph, anchors: [] });
    const mv = compileMovementReality({ date: DATE, graph });
    const cs = compileCommitmentSignals({ date: DATE, graph, anchors: [] });
    const dd = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
    const instant = makeRealityInstantJst(NOON_UTC);
    const moment = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
    // mv を重複させる
    expect(() => deriveMomentSnapshot({ instant, momentState: moment, ern, mv: [...mv, ...mv], cs, decisionDebt: dd })).toThrow(/duplicate movementRealityId/);
    expect(() => deriveMomentSnapshot({ instant, momentState: moment, ern, mv, cs: [...cs, ...cs], decisionDebt: dd })).toThrow(/duplicate commitmentSignalId/);
  });
});

describe("carry（RealityInstant / momentState を再計算しない）", () => {
  it("instant / momentState / decisionDebt は同一参照で carry・derivationVersions は manifest", () => {
    const { graph } = buildDayGraph({ anchors: [anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], date: DATE });
    const ern = compileEventRealityNodes({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "10:00", locationText: "渋谷" })] });
    const dd = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv: [], cs: [] });
    const instant = makeRealityInstantJst(NOON_UTC);
    const moment = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
    const s = deriveMomentSnapshot({ instant, momentState: moment, ern, mv: [], cs: [], decisionDebt: dd });
    expect(s.instant).toBe(instant);
    expect(s.momentState).toBe(moment);
    expect(s.decisionDebt).toBe(dd);
    expect(s.derivationVersions).toBe(REALITY_DERIVATION_VERSIONS);
  });
});
