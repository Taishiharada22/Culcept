import { describe, it, expect, expectTypeOf } from "vitest";
import {
  PACE_VALUES,
  CONSTRAINT_SEVERITIES,
  CONSTRAINT_AXES,
  NODE_CONFIDENCES,
  TRANSPORT_MODES,
  ACTIVITY_KINDS,
  UNCERTAINTY_LEVELS,
  PARTICIPANT_SOURCE_KINDS,
  TRAVEL_MODES,
  type Pace,
  type ConstraintSeverity,
  type ParticipantSourceRef,
  type ParticipantSourceKind,
  type TravelParticipant,
  type TravelCorePlan,
  type TravelCandidate,
  type TravelConstraint,
  type TravelNode,
} from "@/lib/shared/travel/core-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 as-const データ定数の網羅性 lock（リテラル union の正本が静かに変わらない保証）
// ─────────────────────────────────────────────────────────────────────────────

describe("値ドメイン as-const の網羅性", () => {
  it("固定セット（要素・順序）", () => {
    expect(PACE_VALUES).toEqual(["slow", "normal", "intense"]);
    expect(CONSTRAINT_SEVERITIES).toEqual(["red_line", "hard", "soft", "preference"]);
    expect(CONSTRAINT_AXES).toEqual(["time", "budget", "distance", "fatigue", "weather", "preference", "crowd"]);
    expect(NODE_CONFIDENCES).toEqual(["anchor", "wander"]);
    expect(TRANSPORT_MODES).toEqual(["walk", "train", "bus", "car", "domestic_flight", "other"]);
    expect(UNCERTAINTY_LEVELS).toEqual(["high", "medium", "low"]);
    expect(TRAVEL_MODES).toEqual(["daily", "travel"]);
    expect(ACTIVITY_KINDS).toContain("onsen");
    expect(ACTIVITY_KINDS.length).toBe(10);
  });

  it("重複なし（集合サイズ = 配列長）", () => {
    for (const arr of [
      PACE_VALUES,
      CONSTRAINT_SEVERITIES,
      CONSTRAINT_AXES,
      NODE_CONFIDENCES,
      TRANSPORT_MODES,
      ACTIVITY_KINDS,
      UNCERTAINTY_LEVELS,
      PARTICIPANT_SOURCE_KINDS,
      TRAVEL_MODES,
    ]) {
      expect(new Set(arr).size).toBe(arr.length);
    }
  });

  it("リテラル union が as-const 配列と一致（型レベル）", () => {
    expectTypeOf<Pace>().toEqualTypeOf<(typeof PACE_VALUES)[number]>();
    expectTypeOf<ConstraintSeverity>().toEqualTypeOf<(typeof CONSTRAINT_SEVERITIES)[number]>();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 ★ CEO 3-source 分離: participant の出自が pair モデルに縛られないこと
// ─────────────────────────────────────────────────────────────────────────────

describe("ParticipantSourceRef — domain-neutral 3-source 分離", () => {
  it("4 kind（self + 3 source）が定数として揃う", () => {
    expect(PARTICIPANT_SOURCE_KINDS).toEqual([
      "self",
      "talk_pair_member",
      "culcept_relation",
      "plan_session",
    ]);
  });

  it("discriminated union が各 source を表現でき、kind の網羅 switch が成立する", () => {
    const refs: ParticipantSourceRef[] = [
      { kind: "self", userId: "u1" },
      { kind: "talk_pair_member", pairStateId: "p1", userId: "u2" },
      { kind: "culcept_relation", relationId: "r1", userId: "u3" },
      { kind: "plan_session", planSessionId: "s1", userId: "u4" },
    ];
    // travel core は kind を解釈しないが、外部解決層が網羅 switch できることを保証
    const resolved = refs.map((ref): ParticipantSourceKind => {
      switch (ref.kind) {
        case "self":
          return ref.kind;
        case "talk_pair_member":
          return ref.kind;
        case "culcept_relation":
          return ref.kind;
        case "plan_session":
          return ref.kind;
        default: {
          // 網羅性: 新 source を足したらここで型エラーになる
          const _exhaustive: never = ref;
          return _exhaustive;
        }
      }
    });
    expect(resolved).toEqual(PARTICIPANT_SOURCE_KINDS);
  });

  it("旧 /talk pair を仮定しない: talk_pair_member 以外の source 単独で participant を構成できる", () => {
    const culceptOnly: TravelParticipant = {
      participantId: "P_a",
      source: { kind: "culcept_relation", relationId: "rel_1", userId: "u9" },
    };
    const planOnly: TravelParticipant = {
      participantId: "P_b",
      source: { kind: "plan_session", planSessionId: "sess_1", userId: "u10" },
    };
    expect(culceptOnly.source.kind).toBe("culcept_relation");
    expect(planOnly.source.kind).toBe("plan_session");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 構造健全性: 代表オブジェクトが型を満たす（コンパイル + 最小 runtime assert）
// ─────────────────────────────────────────────────────────────────────────────

describe("コア型の構造健全性", () => {
  it("solo（participants 1 名）の TravelCorePlan が成立する", () => {
    const solo: TravelCorePlan = {
      participants: [{ participantId: "P0", source: { kind: "self", userId: "u1" } }],
      scope: { mode: "daily", window: { kind: "single_day", date: "2026-07-01" } },
      candidates: [],
    };
    expect(solo.participants).toHaveLength(1);
    expect(solo.candidates).toEqual([]);
  });

  it("pair + 1泊2日 range + candidate 骨格が成立する", () => {
    const node: TravelNode = {
      nodeId: "n1",
      startMin: 600,
      endMin: 660,
      place: { placeRefId: "pl1", externalId: "ChIJ_example", label: "美術館" },
      activityKind: "sightseeing",
      budgetBand: { lo: 0, hi: 2000, confidence: 0.8, currency: "JPY" },
      fatigueLoad: 2,
      nodeConfidence: "anchor",
    };
    const constraint: TravelConstraint = {
      constraintId: "c1",
      axis: "time",
      severity: "hard",
      owner: { kind: "participant", participantId: "P1" },
      visibility: "private",
      descriptor: "return_by:20:00",
    };
    const candidate: TravelCandidate = {
      candidateId: "cand_A",
      title: "水辺とアートを楽しむ一日",
      tags: ["ゆったり", "アート重視"],
      itinerary: { days: [{ dayIndex: 0, date: "2026-07-01", nodes: [node], edges: [] }] },
      tradeoff: { cost: 0.4, distance: 0.3, fatigue: 0.35, experienceVariety: 0.6 },
      constraints: [constraint],
      rationale: { shared: "移動を軽めに、20時帰宅で構成", forParticipant: { P1: "あなたの希望で夕方は短縮" } },
      uncertainty: "medium",
      reversal: { cancellable: true, deadline: "2026-06-30", fee: { lo: 0, hi: 0, confidence: 1, currency: "JPY" } },
    };
    const plan: TravelCorePlan = {
      participants: [
        { participantId: "P1", source: { kind: "plan_session", planSessionId: "s1", userId: "uA" } },
        { participantId: "P2", source: { kind: "plan_session", planSessionId: "s1", userId: "uB" } },
      ],
      scope: { mode: "travel", window: { kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 } },
      candidates: [candidate],
      pace: "slow",
    };
    expect(plan.participants).toHaveLength(2);
    expect(plan.candidates[0].itinerary.days[0].nodes[0].nodeConfidence).toBe("anchor");
    // M5: private 制約は構造に存在してよい（出力フィルタは別層の責務）
    expect(plan.candidates[0].constraints[0].visibility).toBe("private");
  });

  it("BudgetBand は point estimate でなく lo/hi 帯（Idea 7）", () => {
    const band = { lo: 20000, hi: 30000, confidence: 0.7, currency: "JPY" as const };
    expect(band.hi).toBeGreaterThanOrEqual(band.lo);
  });
});
