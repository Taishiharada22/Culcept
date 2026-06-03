import { describe, it, expect } from "vitest";

import {
  rerankPlaceAffinity,
  computeBaseScore,
  computePersonaTerm,
  buildFactReason,
  activityTypeMatch,
  distanceFit,
  PERSONA_EPSILON,
  type PlaceAffinityInput,
  type PlaceAffinityContext,
  type PlaceAffinityPrior,
} from "@/lib/plan/compose/placeAffinity";

const ctx = (over: Partial<PlaceAffinityContext> = {}): PlaceAffinityContext => ({
  activityKey: "work",
  personaPrior: null,
  ...over,
});
const item = (over: Partial<PlaceAffinityInput> = {}): PlaceAffinityInput => ({
  id: over.id ?? "x",
  label: over.label ?? "place",
  ...over,
});

const ALLOWED_REASONS = new Set([
  "いつもの場所です",
  "前回のこの予定でも選んでいます",
  "最近使った場所です",
  "近くて移動が少ない候補です",
  "この予定タイプに近い場所です",
]);
// persona/人格・取れない場所性質を理由に出していないことの番兵
const FORBIDDEN_REASON_WORDS = [
  "静か", "電源", "個室", "高級", "雰囲気", "混雑",
  "内向", "外向", "好きそう", "タイプなので", "性格",
];

describe("placeAffinity — fail-open / 基本（テスト1,2,9）", () => {
  it("空配列 → 空配列", () => {
    expect(rerankPlaceAffinity([], ctx())).toEqual([]);
  });

  it("persona=null は throw せず、prior=zero と同順（fail-open）", () => {
    const items = [
      item({ id: "a", distanceMeters: 800 }),
      item({ id: "b", distanceMeters: 400, types: ["library"] }),
    ];
    const nullOrder = rerankPlaceAffinity(items, ctx({ personaPrior: null })).map((r) => r.id);
    const zeroOrder = rerankPlaceAffinity(
      items,
      ctx({ personaPrior: { routineNovelty: 0, soloSocial: 0 } }),
    ).map((r) => r.id);
    expect(nullOrder).toEqual(zeroOrder);
  });

  it("決定的・同期（Promise でない / 2回同一）= no I/O・no async", () => {
    const items = [
      item({ id: "a", distanceMeters: 800 }),
      item({ id: "b", matchedThisActivity: true, historyCount: 2 }),
    ];
    const r1 = rerankPlaceAffinity(items, ctx());
    const r2 = rerankPlaceAffinity(items, ctx());
    expect(Array.isArray(r1)).toBe(true); // Promise でない
    expect(r1).toEqual(r2); // 副作用/外部依存なし＝決定的
  });
});

describe("placeAffinity — persona は最弱の tie-breaker（GPT 補正1・テスト3,4）", () => {
  it("personaTerm の絶対値は ε(=0.05) を超えない", () => {
    const extreme: PlaceAffinityPrior = { routineNovelty: 1, soloSocial: 1 };
    const cases = [item({ types: ["bar"] }), item({ types: ["library"], historyCount: 3 }), item({})];
    for (const it of cases) {
      expect(Math.abs(computePersonaTerm(it, extreme))).toBeLessThanOrEqual(PERSONA_EPSILON + 1e-9);
    }
  });

  it("base 差が明確(≥2ε=0.10)な候補は persona で逆転しない", () => {
    const A = item({ id: "A", matchedThisActivity: true, historyCount: 1 }); // base ~1.35
    const B = item({ id: "B", distanceMeters: 400, types: ["library"] }); // base ~1.00
    const dBase = computeBaseScore(A, ctx()) - computeBaseScore(B, ctx());
    expect(dBase).toBeGreaterThanOrEqual(0.1);
    // B を最大限後押しする persona でも A が上のまま
    const proB: PlaceAffinityPrior = { routineNovelty: 1, soloSocial: 0 };
    const order = rerankPlaceAffinity([B, A], ctx({ personaPrior: proB })).map((r) => r.id);
    expect(order[0]).toBe("A");
  });

  it("極端に遠い候補を persona だけで近い候補の上に上げない", () => {
    const near = item({ id: "near", distanceMeters: 300 });
    const far = item({ id: "far", distanceMeters: 9000, types: ["bar"] }); // social 寄り types
    const dBase = computeBaseScore(near, ctx()) - computeBaseScore(far, ctx());
    expect(dBase).toBeGreaterThanOrEqual(0.1);
    const social: PlaceAffinityPrior = { routineNovelty: 1, soloSocial: 1 };
    const order = rerankPlaceAffinity([far, near], ctx({ personaPrior: social })).map((r) => r.id);
    expect(order[0]).toBe("near");
  });

  it("ほぼ同点(base 差<0.05)では persona が順序に影響してよい", () => {
    // generic で activityTypeMatch=0・距離同じ → base 等しい。types のみ solo/social 差。
    const C = item({ id: "C", distanceMeters: 800, types: ["library"] }); // solo
    const D = item({ id: "D", distanceMeters: 800, types: ["bar"] }); // social
    const g = ctx({ activityKey: "generic" });
    expect(Math.abs(computeBaseScore(C, g) - computeBaseScore(D, g))).toBeLessThan(0.05);
    const social: PlaceAffinityPrior = { routineNovelty: 0, soloSocial: 1 };
    const order = rerankPlaceAffinity([C, D], { ...g, personaPrior: social }).map((r) => r.id);
    expect(order[0]).toBe("D"); // social 寄り → bar(D) が上
  });
});

describe("placeAffinity — feature ranking（テスト5・距離・安定ソート8）", () => {
  it("activityKey に合う types が上がる", () => {
    const match = item({ id: "lib", types: ["library"] }); // work に整合
    const non = item({ id: "park", types: ["park"] }); // work に非整合
    const order = rerankPlaceAffinity([non, match], ctx({ activityKey: "work" })).map((r) => r.id);
    expect(order[0]).toBe("lib");
    expect(activityTypeMatch(["library"], "work")).toBe(1);
    expect(activityTypeMatch(["park"], "work")).toBe(0);
  });

  it("近い候補が遠い候補より上（distanceFit 単調）", () => {
    const near = item({ id: "near", distanceMeters: 300 });
    const far = item({ id: "far", distanceMeters: 9000 });
    expect(rerankPlaceAffinity([far, near], ctx()).map((r) => r.id)[0]).toBe("near");
    expect(distanceFit(300)).toBeGreaterThan(distanceFit(9000));
  });

  it("同 score は入力順を保持（安定ソート）", () => {
    const p = item({ id: "p", distanceMeters: 800 });
    const q = item({ id: "q", distanceMeters: 800 });
    expect(rerankPlaceAffinity([p, q], ctx()).map((r) => r.id)).toEqual(["p", "q"]);
    expect(rerankPlaceAffinity([q, p], ctx()).map((r) => r.id)).toEqual(["q", "p"]);
  });
});

describe("placeAffinity — reason は fact-gate のみ（GPT 補正2・テスト6,7）", () => {
  it("理由は許可文字列のみ（取れない情報を捏造しない）", () => {
    const cases = [
      item({ matchedThisActivity: true, historyCount: 3 }),
      item({ matchedThisActivity: true, historyCount: 1 }),
      item({ isRecent: true }),
      item({ distanceMeters: 500 }),
      item({ types: ["library"] }),
      item({}),
    ];
    for (const it of cases) {
      const { reason } = buildFactReason(it, ctx());
      if (reason !== null) expect(ALLOWED_REASONS.has(reason)).toBe(true);
    }
  });

  it("優先順: history > recent > distance > activity_type > null", () => {
    expect(
      buildFactReason(
        item({ matchedThisActivity: true, historyCount: 2, isRecent: true, distanceMeters: 100 }),
        ctx(),
      ).kind,
    ).toBe("history");
    expect(
      buildFactReason(item({ isRecent: true, distanceMeters: 100, types: ["library"] }), ctx()).kind,
    ).toBe("recent");
    expect(buildFactReason(item({ distanceMeters: 100, types: ["library"] }), ctx()).kind).toBe(
      "distance",
    );
    expect(buildFactReason(item({ types: ["library"] }), ctx({ activityKey: "work" })).kind).toBe(
      "activity_type",
    );
    expect(buildFactReason(item({}), ctx()).kind).toBeNull();
  });

  it("取れない場所性質・人格語は理由に出ない（persona 最大でも）", () => {
    const items = [
      item({ id: "h", matchedThisActivity: true, historyCount: 2 }),
      item({ id: "r", isRecent: true }),
      item({ id: "d", distanceMeters: 400 }),
      item({ id: "t", types: ["library"] }),
      item({ id: "none" }),
    ];
    const reasons = rerankPlaceAffinity(items, ctx({ personaPrior: { routineNovelty: 1, soloSocial: 1 } }))
      .map((r) => r.reason)
      .filter((r): r is string => r !== null);
    expect(reasons.length).toBeGreaterThan(0);
    for (const r of reasons) {
      for (const w of FORBIDDEN_REASON_WORDS) expect(r.includes(w)).toBe(false);
    }
  });
});
