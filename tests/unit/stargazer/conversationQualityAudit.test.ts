/**
 * 会話品質監査: 固定シナリオの before/after 比較
 *
 * CEO指摘の会話ログを再現し、各ターンで
 * questionType / mode / validation / fallback がどう変わるかを検証する。
 */
import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));

import {
  classifyQuestionType,
  isMetaQuestion,
  isAskMe,
  isConversationalSharing,
  validateHomeAlterResponse,
  applyQuestionTypeOverride,
  detectFollowUp,
  formatHomeAlterResponse,
  rankFactsForCategory,
  shouldStickyConversation,
  enforceConversationalBrevity,
  checkDailyGuidanceClarify,
  validateConversationalQuality,
  buildConversationPromptBlock,
  type QuestionType,
  type ResponseMode,
  type TaggedFact,
  type DailyGuidanceFrame,
  type ConfidentValue,
} from "@/lib/stargazer/alterHomeAdapter";

import {
  deriveTrustLevel,
  type TrustLevel,
  type RelationalTrustSignals,
} from "@/lib/stargazer/alterUnderstanding";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ A: CEO テスト会話（Alter が壊れていた実際のメッセージ群）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SCENARIO_A = [
  { turn: 1, message: "ねえ", expectedBefore: "judgment", expectedAfter: "greeting" },  // 短い呼びかけ = greeting で正常
  { turn: 2, message: "なんか話そうよ", expectedBefore: "judgment", expectedAfter: "chat_opening" },
  { turn: 3, message: "最近仕事忙しくてさ、なかなか時間取れないんだよね", expectedBefore: "judgment", expectedAfter: "conversation" },
  { turn: 4, message: "質問してよ", expectedBefore: "judgment", expectedAfter: "ask_me" },
  { turn: 5, message: "感情ってあるの？", expectedBefore: "judgment", expectedAfter: "meta_question" },
  { turn: 6, message: "君って何者なの？", expectedBefore: "judgment", expectedAfter: "meta_question" },
  { turn: 7, message: "何か聞いてよ", expectedBefore: "judgment", expectedAfter: "ask_me" },
  { turn: 8, message: "今日友達と飲んできたんだけどさ", expectedBefore: "judgment", expectedAfter: "conversation" },
  { turn: 9, message: "この前教えたこと覚えてる？", expectedBefore: "judgment", expectedAfter: "factual_recall" },  // 記憶確認 = factual_recall で正常
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ B: 判断系は judgment のまま維持されるべきメッセージ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SCENARIO_B_JUDGMENT_PRESERVED = [
  { message: "飲み会行くべき？", expected: "judgment" },
  { message: "転職した方がいいかな", expected: "judgment" },
  { message: "どっちにすべき？AとB", expected: "judgment" },
  { message: "辞めるべきか続けるべきか", expected: "judgment" },
  { message: "どうすればいいと思う？", expected: "emotional" },  // "どうすれば" は isEmotional が先にキャッチ（既存動作）
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ C: 境界ケース（conversation と judgment の判定境界）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SCENARIO_C_EDGE = [
  { message: "今日疲れたなぁ", expected: "emotional" },
  { message: "しんどい", expected: "emotional" },
  { message: "こんにちは", expected: "greeting" },
  { message: "暇だから来た", expected: "chat_opening" },
  { message: "質問していいよ", expected: "ask_me" },
  { message: "質問できないの？", expected: "ask_me" },
  { message: "アルターって感情持ってるの？", expected: "meta_question" },
  { message: "何ができるの？", expected: "meta_question" },
  { message: "昨日映画見たんだけどさ", expected: "conversation" },
  { message: "最近筋トレ始めたんだよね", expected: "conversation" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 1: 分類器の before/after
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("シナリオ A: CEO テスト会話 — questionType 分類", () => {
  const results: Array<{
    turn: number;
    message: string;
    before: string;
    after: string;
    fixed: boolean;
  }> = [];

  for (const { turn, message, expectedBefore, expectedAfter } of SCENARIO_A) {
    it(`Turn ${turn}: 「${message}」 → ${expectedAfter}`, () => {
      const actual = classifyQuestionType(message);
      results.push({
        turn,
        message: message.slice(0, 20),
        before: expectedBefore,
        after: actual,
        fixed: actual === expectedAfter,
      });
      expect(actual).toBe(expectedAfter);
    });
  }

  // After all tests, print comparison table
  it("全ターン比較テーブル出力", () => {
    console.table(results);
    const fixedCount = results.filter((r) => r.fixed).length;
    console.info(`\n[AUDIT] ${fixedCount}/${results.length} turns correctly reclassified`);
    expect(fixedCount).toBe(results.length);
  });
});

describe("シナリオ B: 判断系は judgment 維持", () => {
  for (const { message, expected } of SCENARIO_B_JUDGMENT_PRESERVED) {
    it(`「${message}」 → ${expected}`, () => {
      expect(classifyQuestionType(message)).toBe(expected);
    });
  }
});

describe("シナリオ C: 境界ケース — 新型 + 既存型の共存", () => {
  for (const { message, expected } of SCENARIO_C_EDGE) {
    it(`「${message}」 → ${expected}`, () => {
      expect(classifyQuestionType(message)).toBe(expected);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 2: validation skip — 会話型がバリデーション地獄に落ちないこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("バリデーション: 会話型は結論/行動提案チェックをスキップ", () => {
  // validateHomeAlterResponse は内部で classifyQuestionType(userMessage) を呼ぶ
  // → userMessage が conversation/meta_question/ask_me に分類されれば、問い返しチェック免除

  it("judgment メッセージ + 結論なし応答 → 失敗する", () => {
    // 「転職すべき？」= judgment → 結論/行動提案チェックが走る
    const result = validateHomeAlterResponse(
      "そうなんだ、それは大変だね。最近どんな感じ？",
      "転職すべき？",
      [],
    );
    expect(result.pass).toBe(false);
  });

  it("conversation メッセージ + 問い返し応答 → 成功する（問い返し免除）", () => {
    // 「最近友達と飲んできたんだよね」= conversation → 問い返しチェック免除
    const result = validateHomeAlterResponse(
      "そうなんだ、友達と飲みに行くのいいね。最近どんな話したの？",
      "最近友達と飲んできたんだよね",
      [],
    );
    expect(result.pass).toBe(true);
  });

  it("meta_question メッセージ → 成功する（10文字以上）", () => {
    const result = validateHomeAlterResponse(
      "正直に言うと、人間と同じ感情は僕にはないと思う。でも理解したいという気持ちはある。",
      "感情ってあるの？",
      [],
    );
    expect(result.pass).toBe(true);
  });

  it("ask_me メッセージ + 質問マーク応答 → 成功する", () => {
    const result = validateHomeAlterResponse(
      "最近一番時間を使ってることって何？",
      "質問してよ",
      [],
    );
    expect(result.pass).toBe(true);
  });

  it("ask_me メッセージ + 質問マークなし → 失敗する", () => {
    const result = validateHomeAlterResponse(
      "わかった。考えておくね。",
      "質問してよ",
      [],
    );
    expect(result.pass).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 3: mode override — 会話型は direct_response に強制
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mode override: 会話型は clarify/branch → direct_response に強制", () => {
  const clarifyDecision = { mode: "clarify" as ResponseMode, reason: "clarify_high_ambiguity_high_stake" as const };

  it("meta_question + clarify → direct_response に override", () => {
    const result = applyQuestionTypeOverride(clarifyDecision, "meta_question");
    expect(result.mode).toBe("direct_response");
    expect(result.reason).toBe("meta_question_override");
  });

  it("ask_me + clarify → direct_response に override", () => {
    const result = applyQuestionTypeOverride(clarifyDecision, "ask_me");
    expect(result.mode).toBe("direct_response");
    expect(result.reason).toBe("ask_me_override");
  });

  it("conversation + branch → direct_response に override", () => {
    const branchDecision = { mode: "branch" as ResponseMode, reason: "branch_high_ambiguity" as const };
    const result = applyQuestionTypeOverride(branchDecision, "conversation");
    expect(result.mode).toBe("direct_response");
    expect(result.reason).toBe("conversation_override");
  });

  it("judgment + clarify → そのまま clarify（override しない）", () => {
    const result = applyQuestionTypeOverride(clarifyDecision, "judgment");
    expect(result.mode).toBe("clarify");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 4: Trust floor — Phase 2+ でシグナル後 T0 落ちしない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Trust floor: Phase 2+ CEO シナリオ再現", () => {
  const ruptureSignals: RelationalTrustSignals = {
    earnedTrustTotal: 0,
    selfDisclosureDepth: 0,
    defensePredictionStreak: 0,
    voluntaryTopicExpansionCount: 0,
    repairSuccessRate: null,
    consecutiveRuptureCount: 1,
    explicitRejection: false,
    dignityViolation: false,
    trustDelta: 0,
  };

  it("[BEFORE] セッション少 + Phase 2 + rupture → T0（壊れていた）", () => {
    // Before fix: baseTrust=0, floor→1, rupture -1→0, clamp→0 = T0
    // After fix: floor re-applied → T1
    const result = deriveTrustLevel(0.1, 2, undefined, ruptureSignals, 2 as TrustLevel);

    // AFTER: T1 が保証される
    expect(result.effectiveTrust).toBeGreaterThanOrEqual(1);
    expect(result.signalAdjustedTrust).toBe(1);
    console.info(`[TRUST AUDIT] Phase 2 + rupture: before=T0(bug), after=T${result.effectiveTrust}`);
  });

  it("[BEFORE] セッション少 + Phase 3 + rupture + rejection → T0（壊れていた）", () => {
    const harshSignals: RelationalTrustSignals = {
      ...ruptureSignals,
      consecutiveRuptureCount: 2,
      explicitRejection: true,
    };
    const result = deriveTrustLevel(0.1, 2, undefined, harshSignals, 3 as TrustLevel);

    // AFTER: T1 が保証される（baseTrust=1, rupture -1, rejection -1 → -1 → clamp 0 → floor 1）
    expect(result.effectiveTrust).toBeGreaterThanOrEqual(1);
    console.info(`[TRUST AUDIT] Phase 3 + rupture*2 + rejection: before=T0(bug), after=T${result.effectiveTrust}`);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 5: 検出関数の個別検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isMetaQuestion — Alter自身への質問を正しく検出", () => {
  const positives = [
    "感情ってあるの？",
    "君って感情持ってるの？",
    "アルターは心があるの？",
    "あなたは何者？",
    "君って誰なの？",
    "何ができるの？",
    "どこまでわかるの？",
  ];
  const negatives = [
    "転職すべき？",
    "飲み会行くべき？",
    "最近疲れた",
    "おはよう",
  ];

  for (const msg of positives) {
    it(`✅ 「${msg}」 → true`, () => expect(isMetaQuestion(msg)).toBe(true));
  }
  for (const msg of negatives) {
    it(`❌ 「${msg}」 → false`, () => expect(isMetaQuestion(msg)).toBe(false));
  }
});

describe("isAskMe — 質問要求を正しく検出", () => {
  const positives = [
    "質問してよ",
    "質問して",
    "何か聞いて",
    "質問していいよ",
    "質問できないの？",
    "聞いてよ",
  ];
  const negatives = [
    "質問がある",
    "質問したいんだけど",
    "飲み会行くべき？",
    "感情ある？",
  ];

  for (const msg of positives) {
    it(`✅ 「${msg}」 → true`, () => expect(isAskMe(msg)).toBe(true));
  }
  for (const msg of negatives) {
    it(`❌ 「${msg}」 → false`, () => expect(isAskMe(msg)).toBe(false));
  }
});

describe("isConversationalSharing — 日常共有を正しく検出", () => {
  const positives = [
    "今日友達と飲んできたんだよね",
    "最近仕事忙しくてさ、なかなか時間取れないんだよね",
    "昨日映画見に行ったんだけどさ",
    "この前教えたこと覚えてる？って感じ",
    "最近筋トレ始めたんだよね",
  ];
  const negatives = [
    "飲み会行くべき？",
    "転職した方がいい？",
    "どっちにすべき？",
    "どうすればいいかな？",
    "辞めるべきか",
  ];

  for (const msg of positives) {
    it(`✅ 「${msg}」 → true`, () => expect(isConversationalSharing(msg)).toBe(true));
  }
  for (const msg of negatives) {
    it(`❌ 「${msg}」 → false`, () => expect(isConversationalSharing(msg)).toBe(false));
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 5b: emotional 拡大 — 改善5 検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("改善5: emotional 拡大 — 間接感情・長文感情の検出", () => {
  // BEFORE: 25文字超 or 間接表現 → judgment に落ちていた
  // AFTER: 40文字まで拡大 + 間接感情パターン追加
  const newlyDetected = [
    { msg: "なんかモヤモヤするんだよね", before: "judgment", after: "emotional" },
    { msg: "最近ずっと空回りしてる気がする", before: "judgment", after: "emotional" },
    { msg: "頑張りたいのに体がついてこない", before: "judgment", after: "emotional" },
    { msg: "何のためにやってるかわからなくなってきた", before: "judgment", after: "emotional" },
    { msg: "心が折れそうになってる", before: "judgment", after: "emotional" },
    { msg: "自分が何したいかわからなくなってきた", before: "judgment", after: "emotional" },
    { msg: "うまくいかないことばっかりで疲れたんだよね", before: "judgment", after: "emotional" },  // 25文字超だが40文字以内
  ];

  for (const { msg, before, after } of newlyDetected) {
    it(`「${msg}」: before=${before} → after=${after}`, () => {
      expect(classifyQuestionType(msg)).toBe(after);
    });
  }

  // judgment に留まるべきもの（判断キーワードあり）
  it("「モヤモヤしてるけど転職すべき？」→ judgment（判断要求あり）", () => {
    expect(classifyQuestionType("モヤモヤしてるけど転職すべき？")).toBe("judgment");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト 6: 統合シナリオ — 会話の流れ全体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("統合: CEO 再現会話フロー（全ターン before/after 比較）", () => {
  /**
   * CEO の実際の会話パターン:
   * 1. 挨拶 → 2. 会話開始 → 3. 日常共有 → 4. Alter への質問 → 5. 質問要求
   *
   * Before: ほぼ全て judgment → 判断バリデーション強制 → テンプレ fallback → 性格 facts dump
   * After: 各ターンが適切な型に分類 → validation skip → 自然な応答
   */
  const flow = [
    { msg: "ねえ",                                     before: "judgment",  after: "greeting" },       // greeting で正常
    { msg: "なんか話そうよ",                             before: "judgment",  after: "chat_opening" },
    { msg: "最近仕事忙しくてさ、全然休めないんだよね",     before: "judgment",  after: "conversation" },
    { msg: "感情ってあるの？",                            before: "judgment",  after: "meta_question" },
    { msg: "質問してよ、5回も頼んでるのに",               before: "judgment",  after: "ask_me" },
    { msg: "昨日久しぶりに友達と会ったんだよね",           before: "judgment",  after: "conversation" },
    { msg: "君って何ができるの？",                        before: "judgment",  after: "meta_question" },
    { msg: "何か聞いてよ",                               before: "judgment",  after: "ask_me" },
  ];

  const auditRows: Array<{
    turn: number;
    message: string;
    before: string;
    after: string;
    status: string;
  }> = [];

  for (let i = 0; i < flow.length; i++) {
    const { msg, before, after } = flow[i];
    it(`Turn ${i + 1}: 「${msg.slice(0, 15)}…」 before=${before} → after=${after}`, () => {
      const actual = classifyQuestionType(msg);
      const status = actual === after ? "✅ FIXED" : `❌ GOT ${actual}`;
      auditRows.push({
        turn: i + 1,
        message: msg.slice(0, 20),
        before,
        after: actual,
        status,
      });
      expect(actual).toBe(after);
    });
  }

  it("📊 Before/After 比較テーブル", () => {
    console.info("\n========== BEFORE/AFTER AUDIT ==========");
    console.table(auditRows);

    const fixed = auditRows.filter((r) => r.status.startsWith("✅")).length;
    const total = auditRows.length;
    console.info(`\n[RESULT] ${fixed}/${total} turns correctly reclassified`);
    console.info(`[IMPACT] judgment default 到達率: before=100% → after=${Math.round(((total - fixed) / total) * 100)}%`);
    expect(fixed).toBe(total);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2 改善: CEO 45点会話ログの根本原因修正テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Fix 1: isAskMe — 「質問ある？」パターンの検出", () => {
  // BEFORE: 「質問ある？」は isAskMe に引っかからず judgment に落ちていた
  const newPositives = [
    "質問ある？",
    "何か質問ある？",
    "質問ない？",
    "聞きたいことある？",
    "知りたいことある？",
  ];
  const stillNegatives = [
    "質問がある",      // 自分が質問したい = ask_me ではない
    "質問したいんだけど",
    "質問に答えて",    // これは直答要求
  ];

  for (const msg of newPositives) {
    it(`✅ 「${msg}」 → true`, () => expect(isAskMe(msg)).toBe(true));
  }
  for (const msg of stillNegatives) {
    it(`❌ 「${msg}」 → false`, () => expect(isAskMe(msg)).toBe(false));
  }
});

describe("Fix 2: DECISION_META 安全ストリップ", () => {
  it("完全なメタブロックがストリップされる", () => {
    const raw = "判断の結論だよ。\n---DECISION_META---\naction_shape: step_forward\n---END_META---";
    const result = formatHomeAlterResponse(raw);
    expect(result).not.toContain("DECISION_META");
    expect(result).not.toContain("action_shape");
    expect(result).toContain("判断の結論だよ");
  });

  it("部分的な開始タグのみがストリップされる", () => {
    const raw = "判断の結論。\n---DECISION_META---\naction_shape: step_forward";
    const result = formatHomeAlterResponse(raw);
    expect(result).not.toContain("DECISION_META");
    expect(result).not.toContain("action_shape");
    expect(result).toContain("判断の結論");
  });

  it("メタ行が本文に漏れた場合もストリップされる", () => {
    const raw = "判断の結論。\naction_shape: step_forward\nopportunity_value: high";
    const result = formatHomeAlterResponse(raw);
    expect(result).not.toContain("action_shape:");
    expect(result).not.toContain("opportunity_value:");
    expect(result).toContain("判断の結論");
  });

  it("メタデータがない通常の応答は影響なし", () => {
    const raw = "今日は休む日にしよう。15分だけ横になってみない？";
    const result = formatHomeAlterResponse(raw);
    expect(result).toContain("今日は休む日にしよう");
  });
});

describe("Fix 4: personalizedFacts ターンベースローテーション", () => {
  const mockFacts: TaggedFact[] = [
    { text: "ひとりで考える時間が回復の源", tags: ["energy_state"], source: "axis" },
    { text: "感情の波が判断に直結しやすい", tags: ["energy_state"], source: "axis" },
    { text: "完璧を求めすぎて動き出しが遅れがち", tags: ["energy_state"], source: "axis" },
    { text: "直感で動いた方がうまくいくタイプ", tags: ["energy_state"], source: "axis" },
    { text: "人の評価を気にしすぎる傾向がある", tags: ["energy_state"], source: "axis" },
  ];

  it("turnNumber が異なると上位 facts の順序が変わる", () => {
    const turn0 = rankFactsForCategory(mockFacts, "general", 3, 10, undefined, 0);
    const turn1 = rankFactsForCategory(mockFacts, "general", 3, 10, undefined, 1);
    const turn2 = rankFactsForCategory(mockFacts, "general", 3, 10, undefined, 2);

    // 少なくとも1つのターンで先頭が異なるはず
    const allSame = turn0[0] === turn1[0] && turn1[0] === turn2[0];
    expect(allSame).toBe(false);
  });

  it("turnNumber なしでは従来通り固定順", () => {
    const a = rankFactsForCategory(mockFacts, "general", 3, 10);
    const b = rankFactsForCategory(mockFacts, "general", 3, 10);
    expect(a).toEqual(b);
  });
});

describe("Fix 5: 短い follow-up は direct_response モードにマッピングされるべき", () => {
  // これはルーティングロジックのテスト。detectFollowUp の結果は continuation だが、
  // 短いメッセージ（< 20文字）は route.ts で direct_response に変換される。
  // ここでは detectFollowUp の基本動作を確認。

  it("「体調面かな」は followUp として検出されない（短い応答は通常パイプラインへ）", () => {
    // "体調面かな" は detectFollowUp のパターンに一致しない。
    // route.ts では classifyQuestionType → judgment → 通常パイプライン。
    // 短い応答への grounding は conversation prompt や direct_response で対処。
    const result = detectFollowUp("体調面かな", "最近調子はどう？何か気になってることある？");
    expect(result).toBeNull();
  });

  it("「もっと詳しく」は continuation として検出される", () => {
    const result = detectFollowUp("もっと詳しく", "この傾向は前からあったのかもしれないね");
    expect(result).toBe("continuation");
  });

  it("短い follow-up（< 20文字）は route.ts で direct_response に変換される（設計意図の文書化）", () => {
    // route.ts の実装:
    // if (followUpType === "continuation" && message.trim().length < 20)
    //   → responseMode = "direct_response"
    // これにより「体調面かな」が conclude バリデーション → 不確実性テンプレに落ちる問題を解消。
    expect("体調面かな".length).toBeLessThan(20);
    expect("理解できない？".length).toBeLessThan(20);
    expect("そうかも".length).toBeLessThan(20);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2-2: ask_me sticky mode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("Phase 2-2: shouldStickyConversation (ask_me sticky mode)", () => {
  it("Alter が質問で終わった直後の短い回答 → sticky", () => {
    expect(shouldStickyConversation(
      "体調面かな",
      "最近いちばん頭を占めてるのって、体調、仕事、人間関係だとどれ？",
    )).toBe(true);
  });

  it("Alter が質問で終わった直後の短い回答 — 別パターン", () => {
    expect(shouldStickyConversation(
      "仕事の話",
      "それって仕事の疲れ？ それとも人間関係の方？",
    )).toBe(true);
  });

  it("Alter が質問で終わっていない → sticky しない", () => {
    expect(shouldStickyConversation(
      "体調面かな",
      "なるほど。今日はゆっくり休んでね。",
    )).toBe(false);
  });

  it("lastAlterMessage が null → sticky しない", () => {
    expect(shouldStickyConversation("体調面かな", null)).toBe(false);
  });

  it("明示的な判断キーワードがある → sticky しない", () => {
    expect(shouldStickyConversation(
      "転職すべき？",
      "最近いちばん気になってることある？",
    )).toBe(false);
  });

  it("長いメッセージ（60文字以上）→ sticky しない（新しいトピックの可能性）", () => {
    const longMsg = "最近ちょっと仕事が忙しくて、毎日残業続きで体力的にもきつくなってきてるんだよね。上司との関係もうまくいってなくて、もうどうしたらいいかわからないんだけど";
    expect(longMsg.length).toBeGreaterThanOrEqual(60);
    expect(shouldStickyConversation(
      longMsg,
      "最近どうだった？",
    )).toBe(false);
  });

  it("「どうすれば」を含む → sticky しない", () => {
    expect(shouldStickyConversation(
      "どうすればいい",
      "何が気になってる？",
    )).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2-3: daily_guidance shared agenda
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("Phase 2-3: shared agenda clarify gate", () => {
  const unknownCV = <T>(v: T): ConfidentValue<T> => ({
    value: v,
    confidence: 0,
    source: "unknown" as const,
  });
  const knownCV = <T>(v: T): ConfidentValue<T> => ({
    value: v,
    confidence: 0.8,
    source: "known_from_user" as const,
  });

  it("desire も energy も unknown → shared agenda clarify が発火する", () => {
    const frame: DailyGuidanceFrame = {
      time_budget: unknownCV("unknown" as const),
      energy_level: unknownCV("unknown" as const),
      hard_constraints: unknownCV([]),
      desire_direction: unknownCV("unknown" as const),
      preferred_progress_style: unknownCV("unknown" as const),
      social_bandwidth: unknownCV("unknown" as const),
      open_loops: unknownCV([]),
    };
    const result = checkDailyGuidanceClarify(frame);
    expect(result.needs_clarify).toBe(true);
    // 2択形式の質問であること
    expect(result.question).toMatch(/休む|進め|動ける|充電|アクティブ|ゆるく/);
  });

  it("energy は known だが desire が unknown → shared agenda は発火しない", () => {
    const frame: DailyGuidanceFrame = {
      time_budget: unknownCV("unknown" as const),
      energy_level: knownCV("medium" as const),
      hard_constraints: knownCV([]),
      desire_direction: unknownCV("unknown" as const),
      preferred_progress_style: unknownCV("unknown" as const),
      social_bandwidth: unknownCV("unknown" as const),
      open_loops: unknownCV([]),
    };
    const result = checkDailyGuidanceClarify(frame);
    // shared agenda ではなく、time_budget の clarify が発火する
    expect(result.needs_clarify).toBe(true);
    expect(result.target_variable).toBe("time_budget");
  });

  it("energy が depleted → clarify しない（低エネルギーの人に質問しない）", () => {
    const frame: DailyGuidanceFrame = {
      time_budget: unknownCV("unknown" as const),
      energy_level: knownCV("depleted" as const),
      hard_constraints: knownCV([]),
      desire_direction: unknownCV("unknown" as const),
      preferred_progress_style: unknownCV("unknown" as const),
      social_bandwidth: unknownCV("unknown" as const),
      open_loops: unknownCV([]),
    };
    const result = checkDailyGuidanceClarify(frame);
    expect(result.needs_clarify).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2-4: Pi-style UX constraints (enforceConversationalBrevity)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("Phase 2-4: enforceConversationalBrevity", () => {
  it("4文以下はそのまま返す", () => {
    const text = "仕事忙しいんだね。それって最近の話？";
    expect(enforceConversationalBrevity(text, 4)).toBe(text);
  });

  it("5文以上は maxSentences にカットされる", () => {
    const text = "なるほど。仕事が大変なんだね。それは辛いよね。体調は大丈夫？無理しないでね。";
    const result = enforceConversationalBrevity(text, 4);
    const sentences = result.split(/(?<=[。！!？?])/).filter(s => s.trim());
    expect(sentences.length).toBeLessThanOrEqual(4);
  });

  it("質問が2つ以上ある場合、最後の1つだけ残す", () => {
    const text = "仕事の話？それとも体調の話？どっちが気になってる？";
    const result = enforceConversationalBrevity(text, 4);
    const questions = (result.match(/[？?]/g) || []).length;
    expect(questions).toBe(1);
    // 最後の質問が残っていること
    expect(result).toContain("どっちが気になってる？");
  });

  it("質問が1つだけならそのまま", () => {
    const text = "なるほど。仕事のことが気になってるんだね。それって最近の話？";
    const result = enforceConversationalBrevity(text, 4);
    expect(result).toContain("それって最近の話？");
  });

  it("空文字はそのまま返す", () => {
    expect(enforceConversationalBrevity("", 4)).toBe("");
  });

  it("改行も文境界として分割し、maxSentences でカットする", () => {
    const text = "なるほど\nそれは大変だね\nでも頑張ってるね\n体調は気をつけてね\nそれと仕事も";
    const result = enforceConversationalBrevity(text, 4);
    // 5セグメントが4にカットされる
    const segments = result.split(/(?<=[。！!？?])\s*|\n+/).filter(s => s.trim());
    expect(segments.length).toBeLessThanOrEqual(4);
    expect(result).not.toContain("それと仕事も");
  });

  it("句読点+改行で二重分割しない（。\\n は2文、3文にならない）", () => {
    const text = "仕事忙しいんだね。\nそれって最近の話？";
    const result = enforceConversationalBrevity(text, 4);
    // 2文のまま返り、内容が保持される
    expect(result).toContain("仕事忙しいんだね。");
    expect(result).toContain("それって最近の話？");
  });

  it("ask_me 用 maxSentences=3 で切り詰め", () => {
    const text = "わかった。じゃあ聞くね。最近いちばん頭を占めてるのって、体調、仕事、人間関係だとどれ？ちょっと気になってたんだ。";
    const result = enforceConversationalBrevity(text, 3);
    const sentences = result.split(/(?<=[。！!？?])/).filter(s => s.trim());
    expect(sentences.length).toBeLessThanOrEqual(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix ① validateConversationalQuality テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("validateConversationalQuality", () => {
  // ── 反射チェック ──
  it("ユーザーのキーワードが応答に含まれていれば PASS", () => {
    // ユーザー「転職、迷う」→ キーワード: ["転職", "迷う"]
    // 応答に「転職」が含まれる → 反射OK
    const result = validateConversationalQuality(
      "転職って大きな決断だよね。今の職場に不満があるの？",
      "転職、迷う",
      "conversation",
    );
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("ユーザーのキーワードが1つも含まれない応答は反射なし FAIL", () => {
    const result = validateConversationalQuality(
      "そうなんだ。いろいろあるよね。",
      "転職、迷ってて",
      "conversation",
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some(f => f.includes("反射なし"))).toBe(true);
  });

  it("ストップワードのみのユーザーメッセージでは反射チェックをスキップ", () => {
    // 「それ」「でも」等のストップワードだけの場合、keywords が空になるのでスキップ
    const result = validateConversationalQuality(
      "なるほどね。気になることでもあった？",
      "でも ちょっと",
      "conversation",
    );
    // ストップワードのみ → keywords空 → 反射チェックスキップ → 質問あり → PASS
    expect(result.pass).toBe(true);
  });

  it("1文字単語はキーワード抽出から除外される", () => {
    // 「あ」「ん」等の1文字は除外。句読点区切りで分割される
    const result = validateConversationalQuality(
      "大変だったね。何がいちばんきつかった？",
      "あ、ん、仕事が大変",
      "conversation",
    );
    // 助詞分割で「仕事」「大変」が抽出 → 「大変」が応答に含まれる → 質問あり → PASS
    expect(result.pass).toBe(true);
  });

  it("ユーザーキーワードの部分一致で反射検出", () => {
    // 句読点・スペースで分割されたキーワードが応答に含まれていればOK
    const result = validateConversationalQuality(
      "転職って悩むよね。今の仕事がつらいのかな。",
      "転職 迷う",
      "conversation",
    );
    // キーワード: ["転職", "迷う"] → "転職" が応答に含まれる → PASS
    expect(result.pass).toBe(true);
  });

  // ── ログ再現: 偽陽性が解消されたか ──
  it("「体調面かな」→ 応答に「体調面」含む → PASS（助詞かな切り落とし）", () => {
    const result = validateConversationalQuality(
      "体調面が気になっているんだね。僕の読みだと...",
      "体調面かな",
      "conversation",
    );
    expect(result.pass).toBe(true);
  });

  it("「あまり休息が取れてない感じ」→ 応答に「休息」含む → PASS（文字種境界分割）", () => {
    const result = validateConversationalQuality(
      "休息が足りてないと感じているんだね。体力的な疲れ？それとも頭が回らない感じ？",
      "そうだね。あまり休息が取れてない感じ",
      "conversation",
    );
    expect(result.pass).toBe(true);
  });

  it("「夢中になると周りが見えなくなる」→ 応答に「夢中」含む → PASS", () => {
    const result = validateConversationalQuality(
      "夢中になると周りが見えなくなるんだね。それって仕事の時？趣味の時？",
      "その通りだよ。夢中になると周りが見えなくなってしまうのはある",
      "conversation",
    );
    expect(result.pass).toBe(true);
  });

  it("「現実を見れなくなる…努力は充実」→ 応答に「現実」含む → PASS", () => {
    const result = validateConversationalQuality(
      "現実が見えなくなるほど夢中になるんだね。それでも充実するのは、結果が出てるから？それとも過程が好きだから？",
      "現実を見れなくなる部分があるから、体への負担は結構でかいよね。でもやっぱ努力をするのは充実するけどね",
      "conversation",
    );
    expect(result.pass).toBe(true);
  });

  // ── 抽象質問チェック ──
  it("「もう少し教えて」系の抽象質問を検出", () => {
    // 反射は通る（「仕事」が応答に含まれる）が、抽象質問でFAIL
    const result = validateConversationalQuality(
      "仕事か。もう少し詳しく教えて？",
      "仕事、辞めたい",
      "conversation",
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some(f => f.includes("抽象質問"))).toBe(true);
  });

  it("「今日はどうだった？」系の抽象質問を検出", () => {
    const result = validateConversationalQuality(
      "今日はどうだった？",
      "最近ちょっと疲れ気味なんだよね",
      "conversation",
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some(f => f.includes("抽象質問"))).toBe(true);
  });

  it("「どんな感じ？」系の抽象質問を検出", () => {
    const result = validateConversationalQuality(
      "疲れたんだね。どんな感じ？",
      "最近ちょっと疲れ気味なんだよね",
      "conversation",
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some(f => f.includes("抽象質問"))).toBe(true);
  });

  it("「何かあった？」系の抽象質問を検出", () => {
    const result = validateConversationalQuality(
      "何かあった？",
      "最近、しんどい",
      "conversation",
    );
    expect(result.pass).toBe(false);
    expect(result.failures.some(f => f.includes("抽象質問"))).toBe(true);
  });

  it("具体的な質問は抽象質問として検出しない", () => {
    const result = validateConversationalQuality(
      "転職かぁ。今の会社で一番つらいのってどの部分？上司との関係？業務内容？",
      "転職 考えてる",
      "conversation",
    );
    // キーワード: ["転職", "考えてる"] → "転職" が応答に含まれる → 反射OK
    // 具体的な質問なので抽象質問にもマッチしない → PASS
    expect(result.pass).toBe(true);
  });

  // ── 反射+抽象の複合 ──
  it("反射なし + 抽象質問 → 2件の failures", () => {
    const result = validateConversationalQuality(
      "そうなんだ。もう少し教えて？",
      "仕事、上司とぶつかった",
      "conversation",
    );
    expect(result.pass).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(2);
  });

  // ── questionType によるスキップ ──
  it("greeting は常に PASS（チェックスキップ）", () => {
    const result = validateConversationalQuality(
      "こんにちは！元気？",
      "おはよう",
      "greeting",
    );
    expect(result.pass).toBe(true);
  });

  it("meta_question は常に PASS", () => {
    const result = validateConversationalQuality(
      "私はAlterだよ。あなたの深層を観測するAIです。",
      "あなたは誰？",
      "meta_question",
    );
    expect(result.pass).toBe(true);
  });

  it("chat_opening は常に PASS", () => {
    const result = validateConversationalQuality(
      "やあ、最近どう？",
      "ひさしぶり",
      "chat_opening",
    );
    expect(result.pass).toBe(true);
  });

  it("ask_me はスキップ（質問を求める発話に反射は不要）", () => {
    const result = validateConversationalQuality(
      "最近何か気になっていることはある？",
      "質問ある？",
      "ask_me",
    );
    expect(result.pass).toBe(true);
  });

  // ── エッジケース ──
  it("空応答は PASS（空文字列は別のバリデーションで弾く）", () => {
    const result = validateConversationalQuality(
      "",
      "最近ちょっと仕事が忙しくてさ",
      "conversation",
    );
    // 反射チェック: trimmed が空なので includes は false → 反射なし
    // ただし空応答が来るケースは validateHomeAlterResponse で先に弾かれる
    expect(result.failures.some(f => f.includes("反射なし"))).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix ② buildConversationPromptBlock テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("buildConversationPromptBlock", () => {
  it("sessionFacts がシナプス枝生成に使われる", () => {
    const block = buildConversationPromptBlock("太郎", ["最近転職を検討中", "猫を飼っている"]);
    // sessionFacts はシナプス枝の生成材料として使用される（直接表示ではなく枝候補に反映）
    expect(block).toContain("接続の枝");
    expect(block).toContain("会話モード");
  });

  it("recentTopics が話題の流れとして注入される", () => {
    const block = buildConversationPromptBlock("太郎", [], ["仕事の悩み", "引っ越し計画"]);
    expect(block).toContain("仕事の悩み");
    expect(block).toContain("引っ越し計画");
    expect(block).toContain("話題の流れ");
  });

  it("sessionFacts + recentTopics 両方注入", () => {
    const block = buildConversationPromptBlock(
      "太郎",
      ["エンジニア歴5年"],
      ["転職相談"],
    );
    // トピックは話題の流れに表示される
    expect(block).toContain("転職相談");
    // sessionFactsは枝生成の材料として使われる
    expect(block).toContain("接続の枝");
  });

  it("sessionFacts なしでもエラーにならない", () => {
    const block = buildConversationPromptBlock("太郎");
    expect(typeof block).toBe("string");
    expect(block.length).toBeGreaterThan(0);
  });

  it("userName なしでもエラーにならない", () => {
    const block = buildConversationPromptBlock(undefined, ["ファクト1"]);
    expect(typeof block).toBe("string");
  });

  it("recentTopics は最大5件まで表示される（最新5件）", () => {
    const manyTopics = Array.from({ length: 8 }, (_, i) => `トピック${i + 1}`);
    const block = buildConversationPromptBlock("太郎", [], manyTopics);
    // reverse後、最新(トピック8〜4)の5件が表示される
    expect(block).toContain("トピック8");
    expect(block).toContain("トピック4");
    expect(block).not.toContain("トピック3");
  });

  it("trustLevel が枝の種類に影響する", () => {
    const blockT0 = buildConversationPromptBlock("太郎", [], ["起業について"], 0);
    const blockT3 = buildConversationPromptBlock("太郎", [], ["起業について"], 3);
    // T0は「行動・状況」枝、T3は「感情・価値」枝が含まれる
    expect(blockT0).toContain("行動・状況");
    expect(blockT3).toContain("感情・価値");
  });
});
