/**
 * Anchor-First Deterministic Planner — W2-1 テスト
 *
 * CEO方針 2026-04-19:
 *   LLM の sequenceOrder は advisory。clock (fixed_*) と window (window_*) は
 *   ハード制約。
 *
 * 核テスト:
 *   1. 「22:00 ランチ」再発防止: window_noon のランチが hard anchor で埋められても
 *      window_end を超えて押し出されない（cannotFitWindow=true で startTime 空）
 *   2. LLM 誤 order が clock 順を壊さない: sequenceOrder 逆でも時刻順で並ぶ
 *   3. window_end HARD: window_noon 180分 with 12:00 fixed 60min → 入らず cannotFit
 *   4. window は gap に入る: 11:00 fixed 60min, window_noon 60min → 12:00 配置
 *   5. window 内で shrink 動作: user duration でなく推論 duration なら短縮
 *   6. user 明示 duration は保護される: shrink されず cannotFit
 *   7. flex item は sequenceOrder を尊重（他制約がないとき）
 */
import { describe, test, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

let buildDayPlan: typeof import("@/lib/alter-morning/planningEngine").buildDayPlan;

beforeAll(async () => {
  const { preloadVocabulary } = await import("@/lib/alter-morning/intentParser");
  await preloadVocabulary();
  const eng = await import("@/lib/alter-morning/planningEngine");
  buildDayPlan = eng.buildDayPlan;
});

import type { PlanItem, DayConditions } from "@/lib/alter-morning/types";

const NOW = new Date("2026-04-20T09:00:00+09:00");

function makeItem(partial: Partial<PlanItem>): PlanItem {
  return {
    id: partial.id ?? "item_x",
    kind: partial.kind ?? "todo",
    text: partial.text ?? partial.what ?? "",
    what: partial.what ?? partial.text ?? null,
    durationMin: partial.durationMin ?? 60,
    fixedStart: partial.fixedStart ?? false,
    orderHint: partial.orderHint ?? 0,
    sourceTurnIndex: 0,
    completed: false,
    ...partial,
  } as PlanItem;
}

const baseConditions: DayConditions = { mainTransport: "walk" } as any;

describe("anchor-first 3 パス配置 — W2-1", () => {
  test("22:00 ランチ再発防止: 17:00 仕事 + 18:00 会議 でランチが window 外に押し出されない", () => {
    // CEO 2026-04-18 実機観測ケース:
    //   「今からカフェで仕事」「サドヤでランチ」「18時ミーティング」入力で
    //   LLM が order=[work, lunch, meeting] を返し、lunch が 22:00 に押し出された
    //
    // 新設計では lunch は window_noon (11-14時) に配置試行 → 入らなければ
    // cannotFitWindow=true（startTime なし）。22:00 配置は絶対にしない。
    const items: PlanItem[] = [
      makeItem({
        id: "work",
        kind: "fixed",
        what: "仕事",
        text: "仕事",
        startTime: "17:00",
        durationMin: 50,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 0, // LLM は仕事を一番最初に置いた（誤り）
      }),
      makeItem({
        id: "lunch",
        kind: "todo",
        what: "ランチ",
        text: "ランチ",
        durationMin: 60,
        timeConstraintType: "window_noon",
        durationSource: "inferred",
        sequenceOrder: 1,
      }),
      makeItem({
        id: "meeting",
        kind: "fixed",
        what: "ミーティング",
        text: "ミーティング",
        startTime: "18:00",
        durationMin: 60,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 2,
      }),
    ];

    const plan = buildDayPlan(items, baseConditions, NOW);
    const lunch = plan.items.find(i => i.id === "lunch")!;
    expect(lunch).toBeDefined();

    // lunch が 22:00 に配置されていない（絶対条件）
    expect(lunch.startTime).not.toBe("22:00");
    expect(lunch.startTime).not.toBe("21:00");
    expect(lunch.startTime).not.toBe("20:00");

    // window_noon (11:00-13:59) に収まるか、cannotFitWindow=true で startTime 無し
    if (lunch.startTime) {
      const [h, m] = lunch.startTime.split(":").map(Number);
      const mins = h * 60 + m;
      expect(mins).toBeGreaterThanOrEqual(11 * 60);
      expect(mins + lunch.durationMin).toBeLessThanOrEqual(14 * 60);
    } else {
      expect(lunch.cannotFitWindow).toBe(true);
    }
  });

  test("LLM の逆 sequenceOrder が clock 順を壊さない", () => {
    // LLM が order=[17:00 夕方の用事, 12:00 昼飯, 10:00 朝] と逆順で返しても
    // 配置は時刻昇順になる。
    const items: PlanItem[] = [
      makeItem({
        id: "evening",
        kind: "fixed",
        what: "夕方の用事",
        text: "夕方の用事",
        startTime: "17:00",
        durationMin: 30,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 0,
      }),
      makeItem({
        id: "noon",
        kind: "fixed",
        what: "昼飯",
        text: "昼飯",
        startTime: "12:00",
        durationMin: 60,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 1,
      }),
      makeItem({
        id: "morning",
        kind: "fixed",
        what: "朝の用事",
        text: "朝の用事",
        startTime: "10:00",
        durationMin: 30,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 2,
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    // 非 travel item の並びは時刻順
    const nonTravel = plan.items.filter(i => i.kind !== "travel" && !i.proposal);
    const ids = nonTravel.map(i => i.id);
    expect(ids.indexOf("morning")).toBeLessThan(ids.indexOf("noon"));
    expect(ids.indexOf("noon")).toBeLessThan(ids.indexOf("evening"));
  });

  test("window_end ハード: 埋まっていて入らなければ cannotFitWindow=true", () => {
    // 12:00-13:00 fixed で window_noon (11-14) の 180分ランチを試みる → 入らない
    const items: PlanItem[] = [
      makeItem({
        id: "blocker",
        kind: "fixed",
        what: "重要会議",
        text: "重要会議",
        startTime: "12:00",
        durationMin: 60,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 0,
      }),
      makeItem({
        id: "lunch180",
        kind: "todo",
        what: "長いランチ",
        text: "長いランチ",
        durationMin: 180, // user 明示（shrink 不可）
        durationSource: "user",
        timeConstraintType: "window_noon",
        sequenceOrder: 1,
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    const lunch = plan.items.find(i => i.id === "lunch180")!;
    expect(lunch.cannotFitWindow).toBe(true);
    expect(lunch.startTime).toBeUndefined();
  });

  test("window_noon: 11:00-12:00 fixed の後 gap 12:00-14:00 にランチが収まる", () => {
    const items: PlanItem[] = [
      makeItem({
        id: "prep",
        kind: "fixed",
        what: "下準備",
        text: "下準備",
        startTime: "11:00",
        durationMin: 60,
        fixedStart: true,
        timeConstraintType: "fixed_start",
        sequenceOrder: 0,
      }),
      makeItem({
        id: "lunch",
        kind: "todo",
        what: "ランチ",
        text: "ランチ",
        durationMin: 60,
        durationSource: "inferred",
        timeConstraintType: "window_noon",
        sequenceOrder: 1,
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    const lunch = plan.items.find(i => i.id === "lunch")!;
    expect(lunch.startTime).toBe("12:00");
    expect(lunch.cannotFitWindow).toBeUndefined();
  });

  test("inferred duration は shrink される（window 内 gap が短い時）", () => {
    // 11:00-12:30 fixed。window_noon (11-14) の残り gap は 12:30-14:00=90分
    // 60分 lunch は入るので shrink 不要、そのまま 12:30 配置。
    // これは shrink 必要ケースを作り直す: 13:00-14:00 fixed を追加して gap=12:30-13:00=30分
    const items: PlanItem[] = [
      makeItem({
        id: "morning_work",
        kind: "fixed",
        what: "午前仕事",
        text: "午前仕事",
        startTime: "11:00",
        durationMin: 90, // 11:00-12:30
        fixedStart: true,
        timeConstraintType: "fixed_start",
      }),
      makeItem({
        id: "afternoon_meeting",
        kind: "fixed",
        what: "午後会議",
        text: "午後会議",
        startTime: "13:00",
        durationMin: 60,
        fixedStart: true,
        timeConstraintType: "fixed_start",
      }),
      makeItem({
        id: "lunch",
        kind: "todo",
        what: "ランチ",
        text: "ランチ",
        durationMin: 45, // 推論 duration
        durationSource: "inferred",
        timeConstraintType: "window_noon",
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    const lunch = plan.items.find(i => i.id === "lunch")!;
    expect(lunch.startTime).toBeDefined();
    expect(lunch.cannotFitWindow).toBeUndefined();
    // gap=12:30-13:00=30分、SHRINK_BUFFER=10 → available=20分、>=MIN 15 なので shrink 採用
    // lunch.startTime は 12:30、durationMin は短縮されて 20 分 (45→20)
    expect(lunch.startTime).toBe("12:30");
    expect(lunch.durationMin).toBeLessThan(45);
    expect(lunch.durationMin).toBeGreaterThanOrEqual(15);
    expect(lunch.durationShrunkByPlacement).toBe(true);
  });

  test("user 明示 duration は保護される（shrink されず cannotFit になる）", () => {
    // 上と同じ gap=30分、60分の user duration → shrink 不可 → cannotFitWindow
    const items: PlanItem[] = [
      makeItem({
        id: "morning_work",
        kind: "fixed",
        what: "午前仕事",
        text: "午前仕事",
        startTime: "11:00",
        durationMin: 90,
        fixedStart: true,
        timeConstraintType: "fixed_start",
      }),
      makeItem({
        id: "afternoon_meeting",
        kind: "fixed",
        what: "午後会議",
        text: "午後会議",
        startTime: "13:00",
        durationMin: 60,
        fixedStart: true,
        timeConstraintType: "fixed_start",
      }),
      makeItem({
        id: "lunch",
        kind: "todo",
        what: "ランチ",
        text: "ランチ",
        durationMin: 60,
        durationSource: "user", // 明示
        timeConstraintType: "window_noon",
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    const lunch = plan.items.find(i => i.id === "lunch")!;
    expect(lunch.cannotFitWindow).toBe(true);
    expect(lunch.startTime).toBeUndefined();
  });

  test("flex item は sequenceOrder を尊重する", () => {
    // 時間制約のない純粋な flex item のみ → LLM の order 通り配置
    const items: PlanItem[] = [
      makeItem({
        id: "third",
        kind: "todo",
        what: "三番目",
        text: "三番目",
        durationMin: 30,
        sequenceOrder: 2,
      }),
      makeItem({
        id: "first",
        kind: "todo",
        what: "一番目",
        text: "一番目",
        durationMin: 30,
        sequenceOrder: 0,
      }),
      makeItem({
        id: "second",
        kind: "todo",
        what: "二番目",
        text: "二番目",
        durationMin: 30,
        sequenceOrder: 1,
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    const nonTravel = plan.items.filter(i => i.kind !== "travel" && !i.proposal);
    const ids = nonTravel.map(i => i.id);
    expect(ids.indexOf("first")).toBeLessThan(ids.indexOf("second"));
    expect(ids.indexOf("second")).toBeLessThan(ids.indexOf("third"));
  });

  test("同じ window 複数: sequenceOrder で決着", () => {
    // window_noon に 2 件 → 早い window.start に配置、2 件目は gap に
    const items: PlanItem[] = [
      makeItem({
        id: "lunch_b",
        kind: "todo",
        what: "ランチ B",
        text: "ランチ B",
        durationMin: 45,
        durationSource: "inferred",
        timeConstraintType: "window_noon",
        sequenceOrder: 1,
      }),
      makeItem({
        id: "lunch_a",
        kind: "todo",
        what: "ランチ A",
        text: "ランチ A",
        durationMin: 45,
        durationSource: "inferred",
        timeConstraintType: "window_noon",
        sequenceOrder: 0,
      }),
    ];
    const plan = buildDayPlan(items, baseConditions, NOW);
    const a = plan.items.find(i => i.id === "lunch_a")!;
    const b = plan.items.find(i => i.id === "lunch_b")!;
    // 両方 window_noon (11-14) 内
    expect(a.startTime).toBeDefined();
    expect(b.startTime).toBeDefined();
    // a は b より早い
    expect(a.startTime! < b.startTime!).toBe(true);
  });
});
