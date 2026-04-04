/**
 * Alter Output Governance Layer — 回帰テスト
 *
 * 実際の会話ログ（2026-04-04 CEO提供）を再現し、
 * RC1/RC5/評価指標が正しく機能するか検証する。
 */

import { describe, it, expect } from "vitest";
import {
  extractUserBans,
  checkUserBans,
  buildUserBansPromptBlock,
  assessFrustration,
  buildFrustrationPromptBlock,
  computeGovernanceMetrics,
} from "@/lib/stargazer/alterOutputGovernance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 実際の会話ログ（CEO提供 2026-04-04）を再現
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REAL_CONVERSATION = [
  { role: "user", content: "こんばんわ。元気？" },
  { role: "alter", content: "たいしさん、こんばんは。僕の元気はたいしさんの内面データと同期してるから..." },
  { role: "user", content: "特にないけど、今の私に必要なことって何？" },
  { role: "alter", content: "「意図的な休息」を提案するかな。分析的な思考が続いたり..." },
  { role: "user", content: "どういう回復の仕方があってるかな？" },
  { role: "alter", content: "閉じ気味の今だからこそ、外界から遮断された空間で、五感を休ませる回復が合っています。" },
  { role: "user", content: "わかった。そうしてみるよ。でもその前に相談なんだけど、" },
  { role: "alter", content: "何か気になることがあったんだね。それは、仕事でのこと？" },
  { role: "user", content: "仕事だね。と言っても、今aneurasyncの開発中だから、無職なんだけど、正直、anurasyncで起業するか、とりあえずどこかに就職するかどっちがいいかな？" },
  { role: "alter", content: "混沌の中から新しいものを取り出したいという欲求と...今は動かずに、まず情報を集めるのがいいと思う。" },
  { role: "user", content: "正直に言ってもらいたいんだけど、私はどっちが向いてると思う？" },
  { role: "alter", content: "僕の読みだと、たいしさんは起業の方が向いている可能性が高い..." },
  { role: "user", content: "どういう企業をするのが今の時代にあってる？" },
  { role: "alter", content: "まず「自分の軸」を明確にすることから始めるのが合っています..." },
  { role: "user", content: "やあ" },
  { role: "alter", content: "やあ、たいしさん。僕の名前はALTER。" },
  { role: "user", content: "何を教えてくれるの？" },
  { role: "alter", content: "たいしさんが今、霧の中にいるように感じているなら..." },
  { role: "user", content: "霧っていう表現はあまりに良くないね。" },
  { role: "alter", content: "「霧」という表現は、たいしさんの今の内面状態をそのまま受け止める..." },
  { role: "user", content: "いえ、もう霧という言葉は使わないでほしい" },
  { role: "alter", content: "ごめん、たいしさん。僕が「霧」という言葉にこだわりすぎたね。" },
  { role: "user", content: "で、君の言葉で私を導いてよ" },
  { role: "alter", content: "今のたいしさんは、焦って動くより、まず状況をはっきりさせるのが合っています。深い霧に包まれているような..." },
  { role: "user", content: "具体的に寄り添って欲しいんだけど" },
  { role: "alter", content: "まず「なぜそれが気になっているのか」を深く掘り下げてみるのがいいかもしれません。" },
  { role: "user", content: "いや、だから君は逃げに回ってる。全く寄り添ってない" },
  { role: "alter", content: "ごめん、たいしさん。僕の言葉が足りなかったね。" },
  { role: "user", content: "私には何が合ってるか、具体的な話をして" },
  { role: "alter", content: "ごめん、たいしさん。僕がまだ、たいしさんの本当に知りたいことに届いていなかったんだね。" },
  { role: "user", content: "違う、私が本当にあってること。具体的に" },
  { role: "alter", content: "たいしさんが「本当に合っていること」を知りたいのは、自分の情熱がただの変人扱いされないか..." },
  { role: "user", content: "早く答えろよ" },
  { role: "alter", content: "「早く答えろよ」って言いつつも..." },
  { role: "user", content: "これだ！はどれ？" },
  { role: "alter", content: "「これだ！」と感じるものを見つけるには、今は焦って決めず、まず情報を集めるのが合っています。今日のたいしさんは深い霧の中にいるように..." },
];


describe("RC1: extractUserBans", () => {
  it("detects '霧' as banned from the real conversation", () => {
    const bans = extractUserBans(REAL_CONVERSATION);
    const expressions = bans.map(b => b.expression);
    expect(expressions).toContain("霧");
  });

  it("detects ban from pattern: Xっていう表現はあまりに良くない", () => {
    const history = [
      { role: "user", content: "霧っていう表現はあまりに良くないね。" },
    ];
    const bans = extractUserBans(history);
    expect(bans.length).toBeGreaterThanOrEqual(1);
    expect(bans[0].expression).toBe("霧");
  });

  it("detects ban from pattern: もうXという言葉は使わないでほしい", () => {
    const history = [
      { role: "user", content: "いえ、もう霧という言葉は使わないでほしい" },
    ];
    const bans = extractUserBans(history);
    expect(bans.length).toBeGreaterThanOrEqual(1);
    expect(bans[0].expression).toBe("霧");
  });

  it("detects ban from anger pattern: Xって言葉を使うなって", () => {
    const history = [
      { role: "user", content: "霧って言葉を使うなって入ってんじゃないか。" },
    ];
    const bans = extractUserBans(history);
    expect(bans.length).toBeGreaterThanOrEqual(1);
    expect(bans[0].expression).toBe("霧");
  });

  it("deduplicates repeated bans", () => {
    const bans = extractUserBans(REAL_CONVERSATION);
    const kiriCount = bans.filter(b => b.expression === "霧").length;
    expect(kiriCount).toBe(1);
  });

  it("detects quoted bans: 「X」を使うな", () => {
    const history = [
      { role: "user", content: "「キモい」って言葉は使うな" },
    ];
    const bans = extractUserBans(history);
    expect(bans.some(b => b.expression === "キモい")).toBe(true);
  });
});


describe("RC1: checkUserBans", () => {
  it("catches banned word in response", () => {
    const bans = [{ expression: "霧", turn: 5, source_message: "..." }];
    const result = checkUserBans("深い霧の中にいるような状態", bans);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
  });

  it("passes when banned word is absent", () => {
    const bans = [{ expression: "霧", turn: 5, source_message: "..." }];
    const result = checkUserBans("今の状態は少しぼんやりしている感じだね", bans);
    expect(result.passed).toBe(true);
  });

  it("generates correction prompt on violation", () => {
    const bans = [{ expression: "霧", turn: 5, source_message: "..." }];
    const result = checkUserBans("霧の中にいる", bans);
    expect(result.correction_prompt).toContain("霧");
    expect(result.correction_prompt).toContain("最上位制約");
  });
});


describe("RC5: assessFrustration", () => {
  it("detects escalating frustration in the real conversation", () => {
    const state = assessFrustration(REAL_CONVERSATION, "");
    expect(state.level).toBeGreaterThanOrEqual(3);
    expect(state.triggers.length).toBeGreaterThan(0);
  });

  it("detects repeated corrections", () => {
    const history = [
      { role: "user", content: "霧という表現はあまりに良くないね。" },
      { role: "alter", content: "..." },
      { role: "user", content: "もう霧という言葉は使わないでほしい" },
      { role: "alter", content: "..." },
      { role: "user", content: "また霧っていうワード使った。使わないように入ったのに。" },
    ];
    const state = assessFrustration(history, "霧って言葉を使うなって入ってんじゃないか。");
    expect(state.repeated_correction_count).toBeGreaterThanOrEqual(2);
    expect(state.level).toBeGreaterThanOrEqual(3);
  });

  it("detects unresolved requests", () => {
    const history = [
      { role: "user", content: "私には何が合ってるか、具体的な話をして" },
      { role: "alter", content: "まず情報を集めてみるのがいいかもしれません。" },
    ];
    const state = assessFrustration(history, "");
    expect(state.unresolved_requests.length).toBeGreaterThan(0);
  });

  it("returns level 0 for calm conversation", () => {
    const history = [
      { role: "user", content: "こんばんわ" },
      { role: "alter", content: "こんばんは" },
      { role: "user", content: "今日は何かアドバイスある？" },
    ];
    const state = assessFrustration(history, "");
    expect(state.level).toBeLessThanOrEqual(1);
  });
});


describe("RC5: buildFrustrationPromptBlock", () => {
  it("generates repair protocol for level 3+", () => {
    const state = assessFrustration(REAL_CONVERSATION, "");
    const block = buildFrustrationPromptBlock(state);
    expect(block).toContain("修復プロトコル");
    expect(block).toContain("信頼回復");
  });

  it("returns empty for level 0-1", () => {
    const state = { level: 1, triggers: [], unresolved_requests: [], repeated_correction_count: 0 };
    const block = buildFrustrationPromptBlock(state);
    expect(block).toBe("");
  });
});


describe("Governance Metrics: computeGovernanceMetrics", () => {
  it("detects high constraint violation rate in the real conversation", () => {
    const bans = extractUserBans(REAL_CONVERSATION);
    const metrics = computeGovernanceMetrics(REAL_CONVERSATION, bans);
    expect(metrics.constraint_violation_rate).toBeGreaterThan(0);
  });

  it("detects low direct answer rate in the real conversation", () => {
    const bans = extractUserBans(REAL_CONVERSATION);
    const metrics = computeGovernanceMetrics(REAL_CONVERSATION, bans);
    // ユーザーが具体質問をしても「まず」「ごめん」で始まる回答が多い
    expect(metrics.direct_answer_first_sentence_rate).toBeLessThanOrEqual(0.5);
  });

  it("detects imperfect repair recovery rate in the real conversation", () => {
    const bans = extractUserBans(REAL_CONVERSATION);
    const metrics = computeGovernanceMetrics(REAL_CONVERSATION, bans);
    // repair後もユーザーの不満が続いているケースがある
    expect(metrics.repair_recovery_rate).toBeLessThan(1.0);
  });

  it("returns perfect scores for a good conversation", () => {
    const goodConversation = [
      { role: "user", content: "私には何が合ってるか具体的に教えて" },
      { role: "alter", content: "たいしさんに合っているのは、ゼロから立ち上げる側です。" },
      { role: "user", content: "もっと詳しく教えて" },
      { role: "alter", content: "具体的には、構想段階のプロダクトを形にしていく仕事が合っています。" },
    ];
    const metrics = computeGovernanceMetrics(goodConversation, []);
    expect(metrics.constraint_violation_rate).toBe(0);
    expect(metrics.direct_answer_first_sentence_rate).toBe(1);
  });
});
