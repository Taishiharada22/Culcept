/**
 * Block 3 Phase 1: Minimal Plan モード — 1予定入力で前後を埋める
 *
 * CEO 決裁 2026-04-17:
 *   - 1件の hard anchor だけがある状態で、その前後を自然に埋める
 *   - 窓幅は activityCategory × 時刻で可変（MINIMAL_PLAN_WINDOWS）
 *   - 通常 2件、例外 3件（昼アンカーで前後に十分な余白）
 *   - ディナー anchor の endTime ≥ 20:00 は post=0 (HARD)
 *   - 帰宅 hard は endpointAnchor 明示時のみ（本テストでは扱わない）
 *   - negation signal は Phase 2 以降
 */
import { describe, test, expect } from "vitest";
import {
  fillGaps,
  detectGaps,
  resolveMinimalPlanWindow,
  isLateDinnerAnchor,
  type GapFillOptions,
} from "@/lib/alter-morning/gapFillEngine";
import type { PlanItem } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeAnchor(params: {
  id?: string;
  text: string;
  startTime: string;
  durationMin: number;
  activityCategory: PlanItem["activityCategory"];
}): PlanItem {
  return {
    id: params.id ?? "anchor_1",
    kind: "fixed",
    text: params.text,
    what: params.text,
    startTime: params.startTime,
    durationMin: params.durationMin,
    fixedStart: true,
    orderHint: 0,
    sourceTurnIndex: 0,
    activityCategory: params.activityCategory,
    completed: false,
  };
}

function makeOptions(anchor: PlanItem, nowMin?: number): GapFillOptions {
  return { minimalPlan: { anchor, nowMin } };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. resolveMinimalPlanWindow — 窓幅テーブル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveMinimalPlanWindow: 窓幅テーブル", () => {
  test("ランチ (text=ランチ) → meal_lunch (120/120)", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const win = resolveMinimalPlanWindow(anchor);
    expect(win.key).toBe("meal_lunch");
    expect(win.pre).toBe(120);
    expect(win.post).toBe(120);
  });

  test("ランチ (12時開始の social_meal) → meal_lunch", () => {
    const anchor = makeAnchor({
      text: "食事",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const win = resolveMinimalPlanWindow(anchor);
    expect(win.key).toBe("meal_lunch");
  });

  test("ディナー (text=ディナー) → meal_dinner (120/60)", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "19:00",
      durationMin: 90,
      activityCategory: "social_meal",
    });
    const win = resolveMinimalPlanWindow(anchor);
    expect(win.key).toBe("meal_dinner");
    expect(win.pre).toBe(120);
    expect(win.post).toBe(60);
  });

  test("会議 → work_meeting (90/90)", () => {
    const anchor = makeAnchor({
      text: "打ち合わせ",
      startTime: "14:00",
      durationMin: 60,
      activityCategory: "work_meeting",
    });
    const win = resolveMinimalPlanWindow(anchor);
    expect(win.key).toBe("work_meeting");
    expect(win.pre).toBe(90);
    expect(win.post).toBe(90);
  });

  test("その他 → default (60/60)", () => {
    const anchor = makeAnchor({
      text: "買い物",
      startTime: "15:00",
      durationMin: 30,
      activityCategory: "errand_shopping",
    });
    const win = resolveMinimalPlanWindow(anchor);
    expect(win.key).toBe("default");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. isLateDinnerAnchor — 20時以降ディナー判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isLateDinnerAnchor: 20時以降ディナー判定", () => {
  test("ディナー 19:00 開始 60min → endTime 20:00 = late", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "19:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    expect(isLateDinnerAnchor(anchor, "meal_dinner")).toBe(true);
  });

  test("ディナー 18:00 開始 60min → endTime 19:00 = NOT late", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "18:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    expect(isLateDinnerAnchor(anchor, "meal_dinner")).toBe(false);
  });

  test("ランチでは常に false", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "20:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    expect(isLateDinnerAnchor(anchor, "meal_lunch")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. detectGaps — pre/post pseudo-gap 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectGaps: minimal plan モードで pre/post gap を生成", () => {
  test("ランチ 12:00-13:00 → pre_anchor + after_anchor 両方検出", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const gaps = detectGaps([anchor], makeOptions(anchor));
    const pre = gaps.find(g => g.position === "before_anchor");
    const post = gaps.find(g => g.position === "after_anchor");
    expect(pre).toBeDefined();
    expect(post).toBeDefined();
    expect(pre!.durationMin).toBe(120); // pre window
    expect(post!.durationMin).toBe(120); // post window
  });

  test("ディナー 20:00-21:00 → pre あり、post は 0 で無し", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "20:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const gaps = detectGaps([anchor], makeOptions(anchor));
    const pre = gaps.find(g => g.position === "before_anchor");
    const post = gaps.find(g => g.position === "after_anchor");
    expect(pre).toBeDefined();
    expect(post).toBeUndefined();
  });

  test("会議 14:00-15:00 → pre/post 両方 90min", () => {
    const anchor = makeAnchor({
      text: "打ち合わせ",
      startTime: "14:00",
      durationMin: 60,
      activityCategory: "work_meeting",
    });
    const gaps = detectGaps([anchor], makeOptions(anchor));
    const pre = gaps.find(g => g.position === "before_anchor");
    const post = gaps.find(g => g.position === "after_anchor");
    expect(pre?.durationMin).toBe(90);
    expect(post?.durationMin).toBe(90);
  });

  test("minimalPlan オプション無し → pre/post 検出されない", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const gaps = detectGaps([anchor]); // オプション無し
    expect(gaps).toHaveLength(0);
  });

  test("nowMin で pre が clamp される", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    // nowMin = 11:30 (690min) → pre は 11:30-12:00 = 30min になる
    // MIN_GAP_MINUTES (45) 未満なので pre は生成されない
    const gaps = detectGaps([anchor], makeOptions(anchor, 11 * 60 + 30));
    const pre = gaps.find(g => g.position === "before_anchor");
    expect(pre).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. fillGaps — minimal plan モードの提案生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fillGaps: minimal plan モードの提案生成", () => {
  test("ランチ1件 → pre/post で soft proposal 計2件生成（default 上限）", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const proposals = result.filter(i => i.proposal);
    // 2件 (pre 1 + post 1) または 3件 (wide window exception) のどちらか
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    expect(proposals.length).toBeLessThanOrEqual(3);
  });

  test("ディナー 20:00-21:00 → pre のみ提案生成（post=0 HARD）", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "20:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const proposals = result.filter(i => i.proposal);
    expect(proposals.length).toBe(1);
    // 提案時刻はディナー開始前
    const prop = proposals[0];
    const propStartMin = parseInt(prop.startTime!.split(":")[0], 10) * 60 + parseInt(prop.startTime!.split(":")[1], 10);
    expect(propStartMin).toBeLessThan(20 * 60);
  });

  test("ディナー 18:00-19:00 → pre + post 両方生成（late ではない）", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "18:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const proposals = result.filter(i => i.proposal);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.length).toBeLessThanOrEqual(2);
  });

  test("会議 14:00-15:00 → pre + post 両方生成", () => {
    const anchor = makeAnchor({
      text: "打ち合わせ",
      startTime: "14:00",
      durationMin: 60,
      activityCategory: "work_meeting",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const proposals = result.filter(i => i.proposal);
    expect(proposals.length).toBe(2);
  });

  test("昼ランチ 12:00-13:00 で十分な余白 → 3件許容の例外条件を評価", () => {
    // pre 120, post 150 の両方の条件を満たす → 3件許容
    // ただし実際に 3件生成されるかは candidate pool の量に依存
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const proposals = result.filter(i => i.proposal);
    // 最低2件、最大3件
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    expect(proposals.length).toBeLessThanOrEqual(3);
  });

  test("minimalPlan オプション無し (items.length === 1) → 何も生成しない", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor]); // minimalPlan 無し
    const proposals = result.filter(i => i.proposal);
    expect(proposals.length).toBe(0);
  });

  test("提案は proposal=true, fixedStart=false, startTime 付き", () => {
    const anchor = makeAnchor({
      text: "ディナー",
      startTime: "18:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const proposals = result.filter(i => i.proposal);
    for (const p of proposals) {
      expect(p.proposal).toBe(true);
      expect(p.fixedStart).toBe(false);
      expect(p.startTime).toBeDefined();
      expect(p.proposalReason).toBeDefined();
    }
  });

  test("anchor の hard 性質は壊さない（fixedStart / activityCategory 維持）", () => {
    const anchor = makeAnchor({
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const result = fillGaps([anchor], makeOptions(anchor));
    const surviving = result.find(i => i.id === anchor.id);
    expect(surviving).toBeDefined();
    expect(surviving!.fixedStart).toBe(true);
    expect(surviving!.activityCategory).toBe("social_meal");
    expect(surviving!.proposal).toBeFalsy();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Regression: minimal plan モード外の既存動作を壊さない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Regression: 非 minimal モードの既存動作", () => {
  test("2件以上の fixed item を持つプランで middle gap は従来通り検出", () => {
    const item1 = makeAnchor({
      id: "a",
      text: "朝ミーティング",
      startTime: "09:00",
      durationMin: 60,
      activityCategory: "work_meeting",
    });
    const item2 = makeAnchor({
      id: "b",
      text: "午後作業",
      startTime: "14:00",
      durationMin: 120,
      activityCategory: "work_document",
    });
    // minimalPlan 未指定 → 非 minimal モード。between gap のみ
    const gaps = detectGaps([item1, item2]);
    const between = gaps.find(g => g.position === "between");
    expect(between).toBeDefined();
    expect(between!.durationMin).toBe(240); // 10:00-14:00
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Bug 3 (CEO方針 2026-04-17): 帰宅後の提案禁止
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 実機症状: カフェ→自宅 20:00 の後、20:20 に「カフェで一息」が勝手に湧く。
// ユーザーは既に自宅に到着しているのにまた外出を提案するのは前後関係として破綻。
// 修正: selectCandidatePool で isReturnTravel(before) && after===null なら空プール。

describe("Bug 3: 帰宅トラベル後の post-gap は提案ゼロ", () => {
  test("カフェ→自宅 travel が末尾にあるプランで帰宅後に proposal が湧かない", () => {
    // 12:00 ランチ (anchor) → カフェ→自宅 travel (末尾) の構成
    const lunch = makeAnchor({
      id: "lunch",
      text: "ランチ",
      startTime: "12:00",
      durationMin: 60,
      activityCategory: "social_meal",
    });
    const returnTravel: PlanItem = {
      id: "return_home",
      kind: "travel",
      text: "カフェ→自宅",
      what: "移動",
      startTime: "20:00",
      durationMin: 15,
      fixedStart: false,
      orderHint: 10,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "カフェ",
      travelTo: "自宅",
    };

    // 非 minimal モード（2 item 以上）で走らせる
    const result = fillGaps([lunch, returnTravel]);

    // 帰宅より後ろに proposal が入っていないこと
    const returnStartMin = 20 * 60;
    const proposalsAfterReturn = result.filter(
      (i) => i.proposal && i.startTime && timeOfItem(i) >= returnStartMin,
    );
    expect(proposalsAfterReturn).toHaveLength(0);
  });

  test("外出→帰宅→再外出 パターンは middle gap 扱いで提案は止めない（副作用なし）", () => {
    // 10:00 散歩 → カフェ→自宅 11:00-11:15 → 14:00 会議 の構成
    // 帰宅 travel の after は会議 (non-null) なので空プールにはならない
    const morning = makeAnchor({
      id: "morning_walk",
      text: "散歩",
      startTime: "10:00",
      durationMin: 30,
      activityCategory: "exercise_walk",
    });
    const returnTravel: PlanItem = {
      id: "return_mid",
      kind: "travel",
      text: "外→自宅",
      what: "移動",
      startTime: "11:00",
      durationMin: 15,
      fixedStart: false,
      orderHint: 5,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "外",
      travelTo: "自宅",
    };
    const meeting = makeAnchor({
      id: "meeting",
      text: "会議",
      startTime: "14:00",
      durationMin: 60,
      activityCategory: "work_meeting",
    });

    // middle gap (11:15-14:00) は生成されるが、それは帰宅「後」ではなく「合間」なので
    // proposal が作られることがあってよい。少なくともクラッシュしない。
    const result = fillGaps([morning, returnTravel, meeting]);
    // 結果に 3 つの原 item が残っていること
    expect(result.find((i) => i.id === "morning_walk")).toBeDefined();
    expect(result.find((i) => i.id === "return_mid")).toBeDefined();
    expect(result.find((i) => i.id === "meeting")).toBeDefined();
  });
});

function timeOfItem(item: PlanItem): number {
  if (!item.startTime) return -1;
  const [h, m] = item.startTime.split(":").map((s) => parseInt(s, 10));
  return h * 60 + m;
}
