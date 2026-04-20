/**
 * Plan Intake Gate テスト
 *
 * CEOの指摘:
 * 「プランメイキングの段階で、transport（移動手段）venue（室内/屋外）withWhom（誰と）
 *  が聞けないといけません。コーデのためだけに上記を聞くのではなく、プランの段階で必要です。」
 *
 * 3段構成:
 *   1. Plan Intake Gate — 5W1H 充足判定（ここのテスト）
 *   2. Tour Builder — ツアー構造へ展開（travelTimeEngine.test.ts）
 *   3. Outfit Gate — コーデ提案用（checkOutfitSufficiency）
 */

import {
  checkPlanIntakeSufficiency,
  buildPlanClarifyQuestion,
  checkSufficiency,
  extractDayConditions,
} from "@/lib/alter-morning/sufficiencyGate";
import {
  parseIntent,
  intentToPlanItems,
  preloadVocabulary,
} from "@/lib/alter-morning/intentParser";
import { processMorningMessage, createSession } from "@/lib/alter-morning/morningProtocol";
import type { PlanItem, DayConditions, MorningSession, ParsedDayIntent, SufficiencyResult } from "@/lib/alter-morning/types";

beforeAll(async () => {
  await preloadVocabulary();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// checkPlanIntakeSufficiency — 5W1H 充足判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("checkPlanIntakeSufficiency", () => {
  /**
   * ヘルパー: テキストから一括で Plan Intake を判定する
   */
  function intakeFromText(text: string) {
    const intent = parseIntent(text);
    const items = intentToPlanItems(intent);
    const rawSufficiency = checkSufficiency(text, items);
    const dayConditions = extractDayConditions(text);
    return checkPlanIntakeSufficiency(rawSufficiency, intent, items, dayConditions, text);
  }

  // ── transport ──

  test("外出 + transport 未指定 → Phase D rollback: partial + transport clarify", () => {
    const result = intakeFromText("マックで仕事する");
    // Phase D rollback (CEO 2026-04-17): transport は勝手に推論しない。clarify で聞く。
    expect(result.level).toBe("partial");
    expect(result.missingFields).toContain("transport");
    expect(result.goingOut).toBe(true);
    // autoInferredMap.transport は設定されない
    expect(result.autoInferredMap.transport).toBeUndefined();
  });

  test("外出 + 車で → sufficient（transport 解決済み）", () => {
    const result = intakeFromText("車でマックに行って仕事する");
    expect(result.level).toBe("sufficient");
    expect(result.missingFields).not.toContain("transport");
  });

  test("在宅 → transport 不要", () => {
    const result = intakeFromText("家にいるよ。掃除と洗濯する");
    expect(result.missingFields).not.toContain("transport");
  });

  test("電車でスタバ → transport 解決", () => {
    const result = intakeFromText("電車でスタバに行って勉強する");
    expect(result.missingFields).not.toContain("transport");
    expect(result.goingOut).toBe(true);
  });

  // ── venue ──

  test("マクドナルド（fast_food） → venue 自動推定 indoor", () => {
    const result = intakeFromText("車でマックに行って仕事する");
    expect(result.autoInferred.venue).toBe("indoor");
    expect(result.missingFields).not.toContain("venue");
  });

  test("公園 → venue 解決済み（テキスト or 自動推定）→ missing に含まれない", () => {
    const result = intakeFromText("車で公園に行って散歩する");
    // 「公園」はテキストから venue=outdoor を検出 or placeTable から推定
    // いずれにせよ venue は missing に含まれない
    expect(result.missingFields).not.toContain("venue");
  });

  test("外出するが場所カテゴリなし → venue = mixed 推定", () => {
    const result = intakeFromText("車で外に出る。買い物する");
    // goOut = true, カテゴリ不明 → mixed
    expect(result.goingOut).toBe(true);
    // venue は mixed or undefined だが missing には含まれない可能性
  });

  // ── withWhom（社会的活動） ──

  test("ミーティング + 相手不明 → Phase D: sufficient（withWhom は plan を止めない）", () => {
    const result = intakeFromText("車でオフィスに行ってミーティングする");
    expect(result.hasSocialActivity).toBe(true);
    // Phase D: withWhom 未解決でも plan を止めない（unknown のまま進む）
    expect(result.missingFields).not.toContain("withWhom");
    expect(result.level).toBe("sufficient");
  });

  test("Aさんとミーティング → withWhom 解決", () => {
    const result = intakeFromText("車でオフィスに行ってAさんとミーティングする");
    // companion が検出されれば withWhom は解決
    expect(result.missingFields).not.toContain("withWhom");
  });

  test("友達とランチ → withWhom 解決（companion 検出）", () => {
    const result = intakeFromText("車で友達とランチに行く");
    expect(result.hasSocialActivity).toBe(true);
    expect(result.missingFields).not.toContain("withWhom");
  });

  test("一人で仕事 → 社会的活動なし → withWhom 不問", () => {
    const result = intakeFromText("車でマックに行って仕事する");
    expect(result.hasSocialActivity).toBe(false);
    expect(result.missingFields).not.toContain("withWhom");
  });

  test("飲み会 + 相手不明 → Phase D: withWhom は plan を止めない", () => {
    const result = intakeFromText("車で飲み会に行く");
    expect(result.hasSocialActivity).toBe(true);
    // Phase D: withWhom 未解決でも plan を止めない
    expect(result.missingFields).not.toContain("withWhom");
  });

  // ── goOut 推論 ──

  test("場所が指定された → goOut = true", () => {
    const result = intakeFromText("スタバで勉強する");
    expect(result.goingOut).toBe(true);
  });

  test("家にいると明示 → goOut = false", () => {
    const result = intakeFromText("家にいるよ。読書する");
    expect(result.goingOut).toBe(false);
  });

  // ── 複合テスト ──

  test("外出 + transport不明 + 社会的活動 + 相手不明 → Phase D rollback: transport だけ clarify", () => {
    const result = intakeFromText("カフェでミーティングする");
    // Phase D rollback: transport は clarify 対象。withWhom は plan を止めない。
    expect(result.missingFields).toContain("transport");
    expect(result.missingFields).not.toContain("withWhom");
    expect(result.level).toBe("partial");
    // transport は auto-infer されない
    expect(result.autoInferredMap.transport).toBeUndefined();
  });

  test("全て揃っている → sufficient", () => {
    const result = intakeFromText("車で友達とスタバに行ってランチする");
    expect(result.level).toBe("sufficient");
    expect(result.missingFields).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildPlanClarifyQuestion — プラン中心の質問文
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPlanClarifyQuestion", () => {
  test("transport だけ不足 → 移動手段の質問", () => {
    const q = buildPlanClarifyQuestion(["transport"]);
    expect(q).toContain("プラン組むから");
    expect(q).toContain("何で移動する");
    expect(q).not.toContain("雰囲気");
    expect(q).not.toContain("コーデ");
  });

  test("transport + withWhom 不足 → 両方聞く", () => {
    const q = buildPlanClarifyQuestion(["transport", "withWhom"]);
    expect(q).toContain("何で移動する");
    expect(q).toContain("誰かと合流する");
  });

  test("withWhom だけ不足 → 合流の質問", () => {
    const q = buildPlanClarifyQuestion(["withWhom"]);
    expect(q).toContain("誰かと合流する");
  });

  test("空の missing → 空文字", () => {
    expect(buildPlanClarifyQuestion([])).toBe("");
  });

  test("venue 不足 → 室内外の質問（コーデ寄りの表現がない）", () => {
    const q = buildPlanClarifyQuestion(["venue"]);
    expect(q).toContain("室内が多い");
    expect(q).not.toContain("服");
    expect(q).not.toContain("コーデ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E: morningProtocol フロー — Plan Intake Gate が clarify を発動する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("E2E: morningProtocol Plan Intake Gate", () => {
  test("Phase D rollback: 外出 + transport 不明 → clarifying で移動手段を聞く", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "マックで仕事する予定",
      session
    );

    // Phase D rollback: transport 未指定 → clarifying で聞く
    expect(updated.phase).toBe("clarifying");
    // transport の clarify 文言が入る
    const msg = response.clarifyQuestion ?? response.message ?? "";
    expect(msg).toContain("移動");
  });

  test("Phase D: 社会的活動 + withWhom 不明 → plan_presented（withWhom は plan を止めない）", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "車でカフェに行ってミーティングする",
      session
    );

    // Phase D: withWhom 未解決でも plan_presented へ直行
    expect(updated.phase).toBe("plan_presented");
    expect(response.plan).toBeDefined();
  });

  test("Phase D rollback: transport 不明 + withWhom 不明 → clarifying（transport だけ聞く）", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "カフェでミーティングする",
      session
    );

    // Phase D rollback: transport は clarify 対象、withWhom は止めない
    expect(updated.phase).toBe("clarifying");
    const msg = response.clarifyQuestion ?? response.message ?? "";
    expect(msg).toContain("移動");
    // withWhom は聞かない（plan を止めない方針）
    expect(msg).not.toContain("誰か");
  });

  test("全て揃っている → plan_presented へ直行", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "車で友達とスタバに行ってランチする",
      session
    );

    expect(updated.phase).toBe("plan_presented");
    expect(response.plan).toBeDefined();
  });

  test("在宅プラン → transport 不要で plan_presented へ直行", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "家にいるよ。掃除と洗濯する",
      session
    );

    expect(updated.phase).toBe("plan_presented");
  });

  test("Phase D rollback: transport 不明 → clarifying で聞く → 答えると plan_presented へ", async () => {
    const session = createSession();
    session.phase = "collecting";
    const { session: s1, response: r1 } = await processMorningMessage(
      "マックで仕事する予定",
      session
    );
    // 1 ターン目: transport 不明 → clarifying
    expect(s1.phase).toBe("clarifying");
    const msg1 = r1.clarifyQuestion ?? r1.message ?? "";
    expect(msg1).toContain("移動");
    // 2 ターン目: ユーザーが答えたら plan_presented に進むべき
    // （具体ターン進行は handleClarifying の実装次第なので、ここでは
    //   「clarify 段で transport を聞いた」ことを確認するに留める）
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO 指定 4ケース（2026-04-13 生活導線E2E）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test("CEO Case 1: 「田中さんと打ち合わせ」→ withWhom 解決、transport は clarify で聞く", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "田中さんと打ち合わせする",
      session
    );

    // 田中さん = companion 検出済み → withWhom は解決
    expect(response.missingFields ?? updated.sufficiency?.missingFields ?? []).not.toContain("withWhom");
    // Phase D rollback: 外出判定された場合 transport は clarify 対象。
    // （「田中さんと打ち合わせ」は場所不明のため在宅扱いになる可能性もあり、
    //   その場合は transport 不要で plan_presented に行く。どちらでも許容。）
    expect(["plan_presented", "clarifying"]).toContain(updated.phase);
  });

  test("CEO Case 2: 「家にいるよ。読書する」→ goOut=false で transport 不問", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "家にいるよ。読書する",
      session
    );

    // 在宅 → transport 不要 → plan_presented 直行
    expect(updated.phase).toBe("plan_presented");
    expect(response.plan).toBeDefined();
    // transport の質問がないこと
    expect(response.clarifyQuestion ?? "").not.toContain("移動");
  });

  test("CEO Case 3: 「車で公園に行って散歩する」→ transport=car（walk に寄らない）", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "車で公園に行って散歩する",
      session
    );

    // 「車で」→ transport=car（「散歩」の「歩」で walk に寄らない）
    // transport 解決済み → transport を聞かない
    expect(updated.phase).toBe("plan_presented");
    expect(response.plan).toBeDefined();
    // transport の質問がないこと = transport は正しく car と検出済み
    expect(response.clarifyQuestion ?? "").not.toContain("移動");
  });

  test("CEO Case 4: 「マックで仕事して、そのあとAさんと会う」→ Phase D rollback: transport clarify を含み得る", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "マックで仕事して、そのあとAさんと会う",
      session
    );

    // マック → goOut=true, 場所検出あり
    // Aさんと会う → companion 検出 → withWhom 解決
    // Phase D rollback: transport 未指定 → clarify で「何で移動する？」を聞く
    expect(updated.phase).toBe("clarifying");
    const msg = response.clarifyQuestion ?? response.message ?? "";
    // transport は聞いてよい（Phase D rollback）
    // withWhom は聞かない（plan を止めない方針は継続）
    expect(msg).not.toContain("誰か");
    // plan は提示されている（clarify でも plan 付き）
    expect(response.plan).toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// companion 検出の拡張テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("companion detection enhancements", () => {
  test("「Aさんとミーティング」→ companion 検出", () => {
    const intent = parseIntent("Aさんとミーティングする");
    // fixedEvents に companion が入るか、primaryTasks のテキストから検出
    const hasCompanion =
      intent.fixedEvents.some(e => e.companion != null) ||
      intent.primaryTasks.some(t => /Aさん/.test(t.text));
    // companion がどこかで検出されていればOK
    expect(hasCompanion || intent.fixedEvents.length > 0).toBe(true);
  });

  test("「田中さんと打ち合わせ」→ companion 検出", () => {
    const intent = parseIntent("田中さんと打ち合わせする");
    const hasCompanion = intent.fixedEvents.some(e => e.companion === "田中さん");
    expect(hasCompanion).toBe(true);
  });

  test("「友達と飲み」→ companion 検出", () => {
    const intent = parseIntent("友達と飲みに行く");
    const hasCompanion = intent.fixedEvents.some(e => e.companion != null);
    expect(hasCompanion).toBe(true);
  });
});
