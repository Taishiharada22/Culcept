/**
 * OP-5.3.1 extractLegacySnapshot.test.ts — MorningPlan → LegacyShadowSnapshot 変換 test
 *
 * 検証カテゴリ:
 *   1. null / undefined → empty snapshot
 *   2. journeyOrigin kind の各値 (known_exact / known_label_only / unknown / undefined)
 *   3. journeyEnd 同上
 *   4. targetDate 取り出し
 *   5. segmentsCount (= items.kind === "travel")
 *   6. pure (= input mutate / deterministic)
 */

import { describe, it, expect } from "vitest";
import { extractLegacySnapshot } from "@/lib/alter-morning/op5/extractLegacySnapshot";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makePlan(opts: {
  date?: string;
  journeyOrigin?: JourneyAnchorState;
  journeyEnd?: JourneyAnchorState;
  items?: PlanItem[];
}): MorningPlan {
  return {
    date: opts.date ?? "2026-05-06",
    items: opts.items ?? [],
    dayConditions: {} as MorningPlan["dayConditions"],
    createdAt: "2026-05-06T00:00:00.000Z",
    confirmed: false,
    status: "provisional",
    ...(opts.journeyOrigin !== undefined ? { journeyOrigin: opts.journeyOrigin } : {}),
    ...(opts.journeyEnd !== undefined ? { journeyEnd: opts.journeyEnd } : {}),
  };
}

function makeTravelItem(id: string): PlanItem {
  return {
    id,
    kind: "travel",
    text: "移動",
    what: "移動",
    durationMin: 15,
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

function makeFixedItem(id: string): PlanItem {
  return {
    id,
    kind: "fixed",
    text: "予定",
    what: "予定",
    durationMin: 30,
    fixedStart: true,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

function makeTodoItem(id: string): PlanItem {
  return {
    id,
    kind: "todo",
    text: "タスク",
    what: "タスク",
    durationMin: 30,
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. null / undefined → empty snapshot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — null / undefined", () => {
  it("null → empty snapshot", () => {
    const snap = extractLegacySnapshot(null);
    expect(snap).toEqual({
      targetDate: null,
      journeyOriginKind: null,
      journeyOriginSource: null,
      journeyOriginLabel: null,
      journeyEndKind: null,
      journeyEndSource: null,
      journeyEndLabel: null,
      segmentsCount: 0,
    });
  });

  it("undefined → empty snapshot", () => {
    const snap = extractLegacySnapshot(undefined);
    expect(snap.targetDate).toBeNull();
    expect(snap.journeyOriginKind).toBeNull();
    expect(snap.journeyEndKind).toBeNull();
    expect(snap.segmentsCount).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. journeyOrigin kind 別
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — journeyOrigin", () => {
  it("known_exact → kind / source / label 取り出し", () => {
    const plan = makePlan({
      journeyOrigin: {
        kind: "known_exact",
        label: "自宅",
        lat: 35,
        lng: 139,
        source: "user_declared",
      },
    });
    const snap = extractLegacySnapshot(plan);
    expect(snap.journeyOriginKind).toBe("known_exact");
    expect(snap.journeyOriginSource).toBe("user_declared");
    expect(snap.journeyOriginLabel).toBe("自宅");
  });

  it("known_label_only → kind / source / label 取り出し (= coords なし)", () => {
    const plan = makePlan({
      journeyOrigin: {
        kind: "known_label_only",
        label: "ホテル",
        source: "user_explicit_endpoint",
      },
    });
    const snap = extractLegacySnapshot(plan);
    expect(snap.journeyOriginKind).toBe("known_label_only");
    expect(snap.journeyOriginSource).toBe("user_explicit_endpoint");
    expect(snap.journeyOriginLabel).toBe("ホテル");
  });

  it("unknown → kind のみ、 source / label null", () => {
    const plan = makePlan({
      journeyOrigin: { kind: "unknown", reason: "denied" },
    });
    const snap = extractLegacySnapshot(plan);
    expect(snap.journeyOriginKind).toBe("unknown");
    expect(snap.journeyOriginSource).toBeNull();
    expect(snap.journeyOriginLabel).toBeNull();
  });

  it("journeyOrigin undefined → 全 null", () => {
    const plan = makePlan({});
    const snap = extractLegacySnapshot(plan);
    expect(snap.journeyOriginKind).toBeNull();
    expect(snap.journeyOriginSource).toBeNull();
    expect(snap.journeyOriginLabel).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. journeyEnd
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — journeyEnd", () => {
  it("known_exact + known_label_only + unknown 分岐すべて", () => {
    const planExact = makePlan({
      journeyEnd: {
        kind: "known_exact",
        label: "ホテル",
        lat: 35.1,
        lng: 139.1,
        source: "default_round_trip",
      },
    });
    expect(extractLegacySnapshot(planExact).journeyEndKind).toBe("known_exact");
    expect(extractLegacySnapshot(planExact).journeyEndSource).toBe(
      "default_round_trip",
    );
    expect(extractLegacySnapshot(planExact).journeyEndLabel).toBe("ホテル");

    const planLabelOnly = makePlan({
      journeyEnd: {
        kind: "known_label_only",
        label: "東京駅",
        source: "comprehension_explicit",
      },
    });
    expect(extractLegacySnapshot(planLabelOnly).journeyEndKind).toBe(
      "known_label_only",
    );
    expect(extractLegacySnapshot(planLabelOnly).journeyEndSource).toBe(
      "comprehension_explicit",
    );

    const planUnknown = makePlan({
      journeyEnd: { kind: "unknown", reason: "no_endpoint_signal" },
    });
    expect(extractLegacySnapshot(planUnknown).journeyEndKind).toBe("unknown");
    expect(extractLegacySnapshot(planUnknown).journeyEndSource).toBeNull();
    expect(extractLegacySnapshot(planUnknown).journeyEndLabel).toBeNull();
  });

  it("journeyEnd undefined → 全 null", () => {
    const plan = makePlan({});
    const snap = extractLegacySnapshot(plan);
    expect(snap.journeyEndKind).toBeNull();
    expect(snap.journeyEndSource).toBeNull();
    expect(snap.journeyEndLabel).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. targetDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — targetDate", () => {
  it("plan.date を取り出す", () => {
    const plan = makePlan({ date: "2026-05-07" });
    expect(extractLegacySnapshot(plan).targetDate).toBe("2026-05-07");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. segmentsCount (= items.kind === "travel")
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — segmentsCount", () => {
  it("空 items → 0", () => {
    const plan = makePlan({ items: [] });
    expect(extractLegacySnapshot(plan).segmentsCount).toBe(0);
  });

  it("travel 1 件 + fixed 2 件 → 1", () => {
    const plan = makePlan({
      items: [
        makeFixedItem("f1"),
        makeTravelItem("t1"),
        makeFixedItem("f2"),
      ],
    });
    expect(extractLegacySnapshot(plan).segmentsCount).toBe(1);
  });

  it("travel 3 件 + fixed 1 件 + todo 1 件 → 3", () => {
    const plan = makePlan({
      items: [
        makeTravelItem("t1"),
        makeFixedItem("f1"),
        makeTravelItem("t2"),
        makeTodoItem("td1"),
        makeTravelItem("t3"),
      ],
    });
    expect(extractLegacySnapshot(plan).segmentsCount).toBe(3);
  });

  it("travel 0 件 (= fixed のみ) → 0", () => {
    const plan = makePlan({
      items: [makeFixedItem("f1"), makeFixedItem("f2")],
    });
    expect(extractLegacySnapshot(plan).segmentsCount).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 複合 plan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — 複合 plan", () => {
  it("origin known_exact + end known_label_only + travel 2 件", () => {
    const plan = makePlan({
      date: "2026-05-08",
      journeyOrigin: {
        kind: "known_exact",
        label: "自宅",
        lat: 35,
        lng: 139,
        source: "registered_home",
      },
      journeyEnd: {
        kind: "known_label_only",
        label: "ホテル",
        source: "user_explicit_endpoint",
      },
      items: [
        makeTravelItem("t1"),
        makeFixedItem("f1"),
        makeTravelItem("t2"),
      ],
    });
    const snap = extractLegacySnapshot(plan);
    expect(snap).toEqual({
      targetDate: "2026-05-08",
      journeyOriginKind: "known_exact",
      journeyOriginSource: "registered_home",
      journeyOriginLabel: "自宅",
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: "ホテル",
      segmentsCount: 2,
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. pure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractLegacySnapshot — pure", () => {
  it("input plan を mutate しない", () => {
    const plan = makePlan({
      journeyOrigin: {
        kind: "known_exact",
        label: "自宅",
        lat: 35,
        lng: 139,
        source: "registered_home",
      },
      items: [makeTravelItem("t1"), makeFixedItem("f1")],
    });
    const snapshot = JSON.stringify(plan);
    extractLegacySnapshot(plan);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const plan = makePlan({
      journeyOrigin: {
        kind: "known_label_only",
        label: "ホテル",
        source: "user_explicit_endpoint",
      },
    });
    const a = extractLegacySnapshot(plan);
    const b = extractLegacySnapshot(plan);
    expect(a).toEqual(b);
  });
});
