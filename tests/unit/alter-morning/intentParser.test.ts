/**
 * intentParser テスト — CEO 0点フィードバック修正の検証
 *
 * テストケース:
 * CEO: "うん決まってるよ。これから、BMWにいって、マックで仕事する予定。"
 * 期待: primaryTasks=["仕事"], mainLocation=マクドナルド,
 *       locationSequence=[BMW(visit), マクドナルド(main)],
 *       startWindow="now", certainty="high"
 *
 * + 既存テストケース T1-T4 の回帰テスト
 */

import { parseIntent, buildIntentConfirmMessage, intentToPlanItems, preloadVocabulary } from "@/lib/alter-morning/intentParser";
import { buildDayPlan } from "@/lib/alter-morning/planningEngine";
import { checkOutfitSufficiency, inferVenueFromPlan, buildOutfitClarifyQuestion } from "@/lib/alter-morning/sufficiencyGate";
import type { ParsedDayIntent, DayConditions, MorningPlan } from "@/lib/alter-morning/types";
import { todayJST } from "@/lib/alter-morning/dateUtils";

// 語彙テーブルの事前ロード（vitest では require() が使えないため）
beforeAll(async () => {
  await preloadVocabulary();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO テストケース（0点フィードバック）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO test case: うん決まってるよ。これから、BMWにいって、マックで仕事する予定。", () => {
  const input = "うん決まってるよ。これから、BMWにいって、マックで仕事する予定。";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("primaryTasks は仕事のみ", () => {
    expect(result.primaryTasks).toHaveLength(1);
    expect(result.primaryTasks[0].text).toBe("仕事");
  });

  test("うん決まってるよ はタスクにならない（肯定フィルタ）", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("うん決まってるよ");
    expect(taskTexts).not.toContain("うん");
    expect(taskTexts).not.toContain("決まってるよ");
  });

  test("これから はタスクにならない（時間マーカー → startWindow）", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("これから");
    expect(result.flowContext.startWindow).toBe("now");
  });

  test("BMWにいって はタスクにならない（visit イベント）", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("BMWにいって");
    expect(taskTexts).not.toContain("BMW");
  });

  test("mainLocation はマクドナルド", () => {
    expect(result.mainLocation).toBeDefined();
    expect(result.mainLocation?.label).toBe("マクドナルド");
  });

  test("locationSequence: BMW(visit) → マクドナルド(main)", () => {
    expect(result.locationSequence).toBeDefined();
    expect((result.locationSequence ?? []).length).toBeGreaterThanOrEqual(2);

    const bmw = (result.locationSequence ?? []).find(ls => ls.label === "BMW");
    expect(bmw).toBeDefined();
    expect(bmw?.kind).toBe("visit");

    const mcdonalds = (result.locationSequence ?? []).find(ls => ls.label === "マクドナルド");
    expect(mcdonalds).toBeDefined();
    expect(mcdonalds?.kind).toBe("main");

    // BMW が先（order が小さい）
    expect(bmw?.order ?? 999).toBeLessThan(mcdonalds?.order ?? 0);
  });

  test("certainty は high（予定 + 決まってる）", () => {
    expect(result.flowContext.certainty).toBe("high");
  });

  test("goOut は true", () => {
    expect(result.flowContext.goOut).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 確認メッセージのテスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildIntentConfirmMessage — locationSequence 対応", () => {
  test("visit + main の場合、訪問順序を明示する", () => {
    const input = "うん決まってるよ。これから、BMWにいって、マックで仕事する予定。";
    const result = parseIntent(input);
    const msg = buildIntentConfirmMessage(result);

    // BMW + マクドナルド の両方が言及される
    expect(msg).toContain("BMW");
    expect(msg).toContain("マクドナルド");
    expect(msg).toContain("仕事");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 回帰テスト T1-T4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("T1: 外に行くよ。マックで1日中コード修正かな。", () => {
  const input = "外に行くよ。マックで1日中コード修正かな。";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("タスクはコード修正のみ", () => {
    expect(result.primaryTasks.length).toBeGreaterThanOrEqual(1);
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("外に行くよ");
    const hasCodeFix = taskTexts.some(t => t.includes("コード修正"));
    expect(hasCodeFix).toBe(true);
  });

  test("mainLocation はマクドナルド", () => {
    expect(result.mainLocation).toBeDefined();
    expect(result.mainLocation?.label).toBe("マクドナルド");
  });

  test("goOut は true", () => {
    expect(result.flowContext.goOut).toBe(true);
  });

  test("durationHint は all_day", () => {
    expect(result.flowContext.durationHint).toBe("all_day");
  });

  test("certainty は low（かな）", () => {
    expect(result.flowContext.certainty).toBe("low");
  });
});

describe("T2: 今日は家にいるよ。掃除と洗濯", () => {
  const input = "今日は家にいるよ。掃除と洗濯";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("タスクは掃除と洗濯", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    const hasCleaning = taskTexts.some(t => t.includes("掃除"));
    const hasLaundry = taskTexts.some(t => t.includes("洗濯"));
    expect(hasCleaning).toBe(true);
    expect(hasLaundry).toBe(true);
  });

  test("家にいるよ はタスクにならない", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("家にいるよ");
    expect(taskTexts).not.toContain("今日は家にいるよ");
  });

  test("goOut は false", () => {
    expect(result.flowContext.goOut).toBe(false);
  });
});

describe("T3: 14時に歯医者。そのあとスタバで資料作り", () => {
  const input = "14時に歯医者。そのあとスタバで資料作り";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("fixedEvent に歯医者 14:00", () => {
    expect(result.fixedEvents.length).toBeGreaterThanOrEqual(1);
    const dentist = result.fixedEvents.find(e => e.title.includes("歯医者"));
    expect(dentist).toBeDefined();
    expect(dentist?.startTime).toBe("14:00");
  });

  test("タスクに資料作り", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    const hasReport = taskTexts.some(t => t.includes("資料作り") || t.includes("資料"));
    expect(hasReport).toBe(true);
  });

  test("mainLocation はスターバックス（歯医者は transient で除外）", () => {
    expect(result.mainLocation).toBeDefined();
    expect(result.mainLocation?.label).toBe("スターバックス");
  });
});

describe("T4: 今日は資料作りと英語の勉強と買い物", () => {
  const input = "今日は資料作りと英語の勉強と買い物";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("3つのタスクが抽出される", () => {
    expect(result.primaryTasks.length).toBeGreaterThanOrEqual(3);
    const taskTexts = result.primaryTasks.map(t => t.text);
    const hasReport = taskTexts.some(t => t.includes("資料"));
    const hasEnglish = taskTexts.some(t => t.includes("英語") || t.includes("勉強"));
    const hasShopping = taskTexts.some(t => t.includes("買い物"));
    expect(hasReport).toBe(true);
    expect(hasEnglish).toBe(true);
    expect(hasShopping).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 前分類フィルタの追加テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("肯定フィルタ", () => {
  test("「うん」単独はタスクにならない", () => {
    const result = parseIntent("うん。スタバで勉強する");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("うん");
  });

  test("「はい、決まってるよ」はタスクにならない", () => {
    const result = parseIntent("はい、決まってるよ。図書館で勉強");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("はい");
    expect(taskTexts).not.toContain("決まってるよ");
  });
});

describe("時間マーカーフィルタ", () => {
  test("「午後から」→ startWindow: afternoon", () => {
    const result = parseIntent("午後から。スタバで仕事する");
    expect(result.flowContext.startWindow).toBe("afternoon");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("午後から");
  });

  test("「あとで」→ startWindow: later", () => {
    const result = parseIntent("あとで。買い物に行く");
    expect(result.flowContext.startWindow).toBe("later");
  });
});

describe("訪問パターン", () => {
  test("「銀行に寄って」→ visit イベント", () => {
    const result = parseIntent("銀行に寄って、スタバで仕事する");
    const visits = result.locationSequence?.filter(ls => ls.kind === "visit") ?? [];
    expect(visits.length).toBeGreaterThanOrEqual(1);
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("銀行に寄って");
    expect(taskTexts).not.toContain("銀行");
  });

  test("未知の固有名詞でも文法で場所検出（「Xにいって」）", () => {
    const result = parseIntent("ユニクロにいって、カフェで作業する");
    const visits = result.locationSequence?.filter(ls => ls.kind === "visit") ?? [];
    const hasUniqlo = visits.some(v => v.label.includes("ユニクロ") || v.label.includes("UNIQLO"));
    expect(hasUniqlo).toBe(true);
  });

  test("に無し「BMWいって」でも visit として検出される", () => {
    const result = parseIntent("これから、BMWいって、そのあとマックで仕事する予定");
    const visits = result.locationSequence?.filter(ls => ls.kind === "visit") ?? [];
    const hasBMW = visits.some(v => v.label === "BMW");
    expect(hasBMW).toBe(true);
  });

  test("に無しでも動詞句は除外（「掃除していって」は visit にならない）", () => {
    const result = parseIntent("掃除していって、買い物する");
    const visits = result.locationSequence?.filter(ls => ls.kind === "visit") ?? [];
    const hasCleaning = visits.some(v => v.label.includes("掃除"));
    expect(hasCleaning).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 第2ラウンド: 正確な入力テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO第2入力: これから、BMWいって、そのあとマックで仕事する予定", () => {
  const input = "これから、BMWいって、そのあとマックで仕事する予定";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("primaryTasks は仕事のみ", () => {
    expect(result.primaryTasks).toHaveLength(1);
    expect(result.primaryTasks[0].text).toBe("仕事");
  });

  test("startWindow は now（これから）", () => {
    expect(result.flowContext.startWindow).toBe("now");
  });

  test("mainLocation はマクドナルド", () => {
    expect(result.mainLocation).toBeDefined();
    expect(result.mainLocation?.label).toBe("マクドナルド");
  });

  test("locationSequence: BMW(visit) → マクドナルド(main)", () => {
    const seq = result.locationSequence ?? [];
    expect(seq.length).toBeGreaterThanOrEqual(2);

    const bmw = seq.find(ls => ls.label === "BMW");
    expect(bmw).toBeDefined();
    expect(bmw?.kind).toBe("visit");

    const mcdonalds = seq.find(ls => ls.label === "マクドナルド");
    expect(mcdonalds).toBeDefined();
    expect(mcdonalds?.kind).toBe("main");

    expect(bmw?.order ?? 999).toBeLessThan(mcdonalds?.order ?? 0);
  });

  test("BMWいって はタスクにならない", () => {
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("BMWいって");
    expect(taskTexts).not.toContain("BMW");
  });

  test("certainty は high（予定）", () => {
    expect(result.flowContext.certainty).toBe("high");
  });

  test("goOut は true", () => {
    expect(result.flowContext.goOut).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// intentToPlanItems: 表示テキスト正規化 + 優先順位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("intentToPlanItems — visit 正規化 + 優先順位", () => {
  const input = "これから、BMWいって、そのあとマックで仕事する予定";
  let result: ParsedDayIntent;
  let planItems: ReturnType<typeof intentToPlanItems>;

  beforeAll(() => {
    result = parseIntent(input);
    planItems = intentToPlanItems(result);
  });

  test("PlanItem に「BMWに寄る」が含まれる（生文言「BMWいって」ではない）", () => {
    const texts = planItems.map(p => p.text);
    expect(texts).toContain("BMWに寄る");
    expect(texts).not.toContain("BMWいって");
    expect(texts).not.toContain("BMW行って");
  });

  test("visit アイテムが先、main task が後", () => {
    const bmwIdx = planItems.findIndex(p => p.text === "BMWに寄る");
    const workIdx = planItems.findIndex(p => p.text.includes("仕事"));
    expect(bmwIdx).toBeGreaterThanOrEqual(0);
    expect(workIdx).toBeGreaterThanOrEqual(0);
    expect(bmwIdx).toBeLessThan(workIdx);
  });

  test("main task の表示テキストは「マクドナルドで仕事」", () => {
    const workItem = planItems.find(p => p.text.includes("仕事"));
    expect(workItem).toBeDefined();
    expect(workItem?.text).toBe("マクドナルドで仕事");
  });

  test("main task に mainLocation が付与される", () => {
    const workItem = planItems.find(p => p.text.includes("仕事"));
    expect(workItem?.location).toBeDefined();
    expect(workItem?.location?.label).toBe("マクドナルド");
  });

  test("visit アイテムの eventType は errand", () => {
    const bmwItem = planItems.find(p => p.text === "BMWに寄る");
    expect(bmwItem?.eventType).toBe("errand");
  });

  test("visit アイテムのデフォルト所要時間は30分", () => {
    const bmwItem = planItems.find(p => p.text === "BMWに寄る");
    expect(bmwItem?.durationMin).toBe(30);
  });
});

describe("buildIntentConfirmMessage — CEO第2入力の自然文", () => {
  const input = "これから、BMWいって、そのあとマックで仕事する予定";
  let result: ParsedDayIntent;
  let msg: string;

  beforeAll(() => {
    result = parseIntent(input);
    msg = buildIntentConfirmMessage(result);
  });

  test("メッセージに BMW + マクドナルド + 仕事 が含まれる", () => {
    expect(msg).toContain("BMW");
    expect(msg).toContain("マクドナルド");
    expect(msg).toContain("仕事");
  });

  test("「了解」で始まる", () => {
    expect(msg).toMatch(/^了解/);
  });

  test("訪問順序が明示される（まず〜、そのあと〜）", () => {
    expect(msg).toContain("まず");
    expect(msg).toContain("そのあと");
  });

  test("メインの仕事が強調される", () => {
    expect(msg).toContain("メインは");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 第3ラウンド: 「あるよ」除外 + sequenceOrder テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("availability marker フィルタ", () => {
  test("「あるよ」は予定にならない", () => {
    const result = parseIntent("あるよ。これから、BMWによって、その後マックで仕事する予定");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("あるよ");
    expect(taskTexts).not.toContain("ある");
  });

  test("「ある」単独は予定にならない", () => {
    const result = parseIntent("ある。スタバで勉強する");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("ある");
  });

  test("「あるよ」がタスク化されない（フル入力テスト）", () => {
    const result = parseIntent("あるよ。これから、BMWによって、その後マックで仕事する予定");
    // タスクは仕事のみ（あるよ は除外）
    expect(result.primaryTasks).toHaveLength(1);
    expect(result.primaryTasks[0].text).toBe("仕事");
  });

  test("「うんあるよ」は予定にならない", () => {
    const result = parseIntent("うんあるよ。マックで勉強する");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("うんあるよ");
    expect(taskTexts).not.toContain("ある");
  });

  test("「そうだよ」は予定にならない", () => {
    const result = parseIntent("そうだよ。カフェで作業する");
    const taskTexts = result.primaryTasks.map(t => t.text);
    expect(taskTexts).not.toContain("そうだよ");
  });
});

describe("CEO第3入力: あるよ。これから、BMWによって、その後マックで仕事する予定", () => {
  const input = "あるよ。これから、BMWによって、その後マックで仕事する予定";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("primaryTasks は仕事のみ（あるよ は除外）", () => {
    expect(result.primaryTasks).toHaveLength(1);
    expect(result.primaryTasks[0].text).toBe("仕事");
  });

  test("startWindow は now", () => {
    expect(result.flowContext.startWindow).toBe("now");
  });

  test("mainLocation はマクドナルド", () => {
    expect(result.mainLocation?.label).toBe("マクドナルド");
  });

  test("locationSequence: BMW(visit) → マクドナルド(main)", () => {
    const seq = result.locationSequence ?? [];
    const bmw = seq.find(ls => ls.label === "BMW");
    const mc = seq.find(ls => ls.label === "マクドナルド");
    expect(bmw).toBeDefined();
    expect(bmw?.kind).toBe("visit");
    expect(mc).toBeDefined();
    expect(mc?.kind).toBe("main");
    expect(bmw?.order ?? 999).toBeLessThan(mc?.order ?? 0);
  });

  test("certainty は high", () => {
    expect(result.flowContext.certainty).toBe("high");
  });
});

describe("buildDayPlan — sequenceOrder でスケジューラ順序を維持", () => {
  const input = "あるよ。これから、BMWによって、その後マックで仕事する予定";
  let result: ParsedDayIntent;

  beforeAll(() => {
    result = parseIntent(input);
  });

  test("visit (BMWに寄る) が main task (マクドナルドで仕事) より前に配置される", () => {
    const planItems = intentToPlanItems(result);
    const dayConditions: DayConditions = {};
    // 16:00 に開始するシナリオ
    const plan = buildDayPlan(planItems, dayConditions, new Date("2026-04-13T16:00:00+09:00"));

    const bmwIdx = plan.items.findIndex(p => p.text === "BMWに寄る");
    const workIdx = plan.items.findIndex(p => p.text.includes("仕事"));
    expect(bmwIdx).toBeGreaterThanOrEqual(0);
    expect(workIdx).toBeGreaterThanOrEqual(0);
    // BMWが先に来る
    expect(bmwIdx).toBeLessThan(workIdx);
  });

  test("planItems に sequenceOrder が設定されている", () => {
    const planItems = intentToPlanItems(result);
    const bmw = planItems.find(p => p.text === "BMWに寄る");
    const work = planItems.find(p => p.text.includes("仕事"));
    expect(bmw?.sequenceOrder).toBeDefined();
    expect(work?.sequenceOrder).toBeDefined();
    expect(bmw!.sequenceOrder!).toBeLessThan(work!.sequenceOrder!);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Outfit Sufficiency Gate（コーデ用の独立ゲート）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferVenueFromPlan — 場所カテゴリから venue を自動推定", () => {
  test("マクドナルド（fast_food）→ indoor", () => {
    const input = "マックで仕事する";
    const intent = parseIntent(input);
    const planItems = intentToPlanItems(intent);
    const plan: MorningPlan = {
      date: todayJST(),
      items: planItems,
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      mainLocation: intent.mainLocation,
      flowContext: intent.flowContext,
      parsedIntent: intent,
    };
    const venue = inferVenueFromPlan(plan);
    expect(venue).toBe("indoor");
  });

  test("goOut: true, 場所不明 → mixed", () => {
    const plan: MorningPlan = {
      date: todayJST(),
      items: [],
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      flowContext: { goOut: true },
    };
    const venue = inferVenueFromPlan(plan);
    expect(venue).toBe("mixed");
  });

  test("goOut: false → indoor", () => {
    const plan: MorningPlan = {
      date: todayJST(),
      items: [],
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      flowContext: { goOut: false },
    };
    const venue = inferVenueFromPlan(plan);
    expect(venue).toBe("indoor");
  });
});

describe("checkOutfitSufficiency — コーデ用 gate", () => {
  test("transport + mood 不足 → sufficient: false", () => {
    const input = "マックで仕事する";
    const intent = parseIntent(input);
    const planItems = intentToPlanItems(intent);
    const plan: MorningPlan = {
      date: todayJST(),
      items: planItems,
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      mainLocation: intent.mainLocation,
      flowContext: intent.flowContext,
      parsedIntent: intent,
    };
    const result = checkOutfitSufficiency(plan, ["マックで仕事する"]);
    expect(result.sufficient).toBe(false);
    expect(result.inferredVenue).toBe("indoor");
    expect(result.missingFields).toContain("transport");
    expect(result.missingFields).toContain("mood");
    // venue は自動推定済みなので missingFields に含まれない
    expect(result.resolved.venue).toBe(true);
  });

  test("全情報あり → sufficient: true", () => {
    const input = "電車でマックに行ってカジュアルな格好で仕事する";
    const intent = parseIntent(input);
    const planItems = intentToPlanItems(intent);
    const plan: MorningPlan = {
      date: todayJST(),
      items: planItems,
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      mainLocation: intent.mainLocation,
      flowContext: intent.flowContext,
      parsedIntent: intent,
    };
    const result = checkOutfitSufficiency(plan, [input]);
    expect(result.sufficient).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });
});

describe("buildOutfitClarifyQuestion — 1 問に束ねた質問", () => {
  test("transport + mood → 束ねて質問", () => {
    const question = buildOutfitClarifyQuestion(["transport", "mood"]);
    expect(question).toContain("移動は");
    expect(question).toContain("服は");
    expect(question).toContain("コーデ提案するために");
  });

  test("不足なし → 空文字", () => {
    const question = buildOutfitClarifyQuestion([]);
    expect(question).toBe("");
  });
});
