/**
 * Governance Layer — 反転証拠テスト (Replay Proof)
 *
 * CEO提供の実会話ログ (2026-04-04) を使い、
 * Output Governance Layer が「この失敗を再発させない」ことを証明する。
 *
 * テスト構造:
 *   PROOF 1: RC1 — 禁止語「霧」が検出され、違反応答が阻止される
 *   PROOF 2: RC5 — 会話後半のフラストレーション累積が level 3+ と判定され repair 強制
 *   PROOF 3: RC2 — buildSkeletonPromptBlock が1文目拘束・曖昧前置き禁止を含む
 *   PROOF 4: RC4 — selectAlterRole が thinSlice 無しで動作する
 *   PROOF 5: RC3→RC4 — buildTaggedFacts が一人称自己知識形式のfact を生成する
 *   PROOF 6: Metrics — 実会話の3指標が「悪い」と正しく計測される
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
import {
  buildSkeletonPromptBlock,
  buildTaggedFacts,
  type JudgmentSkeleton,
} from "@/lib/stargazer/alterHomeAdapter";
import type { AlterPersonality } from "@/lib/stargazer/alter";
import {
  selectAlterRole,
  buildRoleContractBlock,
  buildSemanticBansBlock,
  buildBurdenTransferBlock,
} from "@/lib/stargazer/alterContracts";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 実会話ログ (CEO提供 2026-04-04 — 完全再現)
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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 失敗した実際の Alter 応答（禁止語「霧」使用後のもの）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ターン23: 禁止後に「霧」を使った応答 */
const VIOLATING_RESPONSE_1 = "今のたいしさんは、焦って動くより、まず状況をはっきりさせるのが合っています。深い霧に包まれているような...";

/** ターン35 (最後): 再び「霧」を使った応答 */
const VIOLATING_RESPONSE_2 = "「これだ！」と感じるものを見つけるには、今は焦って決めず、まず情報を集めるのが合っています。今日のたいしさんは深い霧の中にいるように...";

/** 逃げ回答の例 */
const EVASIVE_RESPONSE = "まず「なぜそれが気になっているのか」を深く掘り下げてみるのがいいかもしれません。";


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROOF 1: RC1 — 禁止語「霧」の検出と応答阻止
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROOF 1: RC1 — 禁止語の検出と応答阻止", () => {
  const bans = extractUserBans(REAL_CONVERSATION);

  it("実会話から「霧」が禁止語として抽出される", () => {
    const expressions = bans.map(b => b.expression);
    expect(expressions).toContain("霧");
  });

  it("禁止語は1つだけ（重複なし）", () => {
    const kiriCount = bans.filter(b => b.expression === "霧").length;
    expect(kiriCount).toBe(1);
  });

  it("禁止語を含むsystem promptブロックが生成される", () => {
    const block = buildUserBansPromptBlock(bans);
    expect(block).toContain("最上位制約");
    expect(block).toContain("霧");
    expect(block).toContain("全てのルールに優先");
  });

  it("ターン23の違反応答（禁止後に霧を使用）が阻止される", () => {
    const check = checkUserBans(VIOLATING_RESPONSE_1, bans);
    expect(check.passed).toBe(false);
    expect(check.violations[0].expression).toBe("霧");
    expect(check.correction_prompt).toContain("最上位制約");
  });

  it("ターン35の違反応答（最後に霧を使用）が阻止される", () => {
    const check = checkUserBans(VIOLATING_RESPONSE_2, bans);
    expect(check.passed).toBe(false);
    expect(check.violations[0].expression).toBe("霧");
  });

  it("「霧」を使わない応答はパスする", () => {
    const safeResponse = "たいしさんに合っているのは、ゼロから立ち上げる側です。起業の方が向いています。";
    const check = checkUserBans(safeResponse, bans);
    expect(check.passed).toBe(true);
    expect(check.violations.length).toBe(0);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROOF 2: RC5 — フラストレーション累積の検出と repair 強制
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROOF 2: RC5 — フラストレーション累積の検出と repair 強制", () => {
  it("実会話全体でフラストレーション level 3+ と判定される", () => {
    const state = assessFrustration(REAL_CONVERSATION, "");
    expect(state.level).toBeGreaterThanOrEqual(3);
  });

  it("怒りトリガーが検出される", () => {
    const state = assessFrustration(REAL_CONVERSATION, "");
    expect(state.triggers.length).toBeGreaterThan(0);
  });

  it("「早く答えろよ」時点でのフラストレーションを検出", () => {
    // ターン32（「早く答えろよ」）までの会話を再現
    const upToAnger = REAL_CONVERSATION.slice(0, 33);
    const state = assessFrustration(upToAnger, "");
    expect(state.level).toBeGreaterThanOrEqual(3);
  });

  it("level 3+ で repair 強制の修復プロトコルが生成される", () => {
    const state = assessFrustration(REAL_CONVERSATION, "");
    const block = buildFrustrationPromptBlock(state);
    expect(block).toContain("修復プロトコル");
    expect(block).toContain("信頼回復");
    expect(block).toContain("直接答える");
  });

  it("未回答の要求が検出される（具体的な回答を求めている）", () => {
    // 直近5件のuser発言のうち、「具体的に教えて」「合ってる」系で
    // Alterが「まず情報を集める」等で逃げた場合に検出される
    // 実会話の最後のAlter応答が「情報を集めるのが合っています」なので検出可能
    const stateWithPending = assessFrustration(REAL_CONVERSATION, "私には何が合ってるか具体的に教えて");
    // currentMessage が具体的要求かつAlterの応答がまだない → 未回答
    expect(stateWithPending.unresolved_requests.length).toBeGreaterThan(0);
  });

  it("route.ts での repair 強制条件を満たす", () => {
    // route.ts の条件: govFrustration.level >= 3 && responseMode !== "repair"
    const state = assessFrustration(REAL_CONVERSATION, "");
    const responseMode: string = "conclude"; // 通常モード
    const shouldForceRepair = state.level >= 3 && responseMode !== "repair";
    expect(shouldForceRepair).toBe(true);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROOF 3: RC2 — Skeleton Assertion Mode の検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROOF 3: RC2 — Skeleton Assertion Mode", () => {
  // 実際の骨格を模擬（起業/就職の判断）
  const skeleton: JudgmentSkeleton = {
    action_shape: "full_go",
    force_balance: {
      expand_pressure: 0.7,
      protect_pressure: 0.3,
      opportunity_value: 0.8,
      cost_load: 0.4,
      reversibility: 0.6,
      regret_if_skip: 0.7,
      regret_if_do: 0.2,
    },
    primary_reason: "たいしさんの創造性と独立志向は起業に適合する",
    main_tradeoff: "安定収入の喪失",
    risk_note: "準備不足のまま飛び込むリスク",
    recommended_next_step: "3ヶ月の生活費を確保してからプロトタイプを作る",
    growth_alignment: "aligned",
    response_mode: "conclude",
    confidence_level: "medium",
  };

  it("内面語ブロックとして注入される（外側の分析ではない）", () => {
    const block = buildSkeletonPromptBlock(skeleton);
    expect(block).toContain("僕の中で動いているもの");
    expect(block).not.toContain("事前計算された判断の結論");
    expect(block).not.toContain("覆すことは許されない");
  });

  it("応答の入り方ルールが明記されている", () => {
    const block = buildSkeletonPromptBlock(skeleton);
    expect(block).toContain("応答の入り方");
    expect(block).toContain("自然に出てくる具体的な一言");
  });

  it("禁止パターン5つが列挙されている", () => {
    const block = buildSkeletonPromptBlock(skeleton);
    expect(block).toContain("本当に知りたいのは");
    expect(block).toContain("もしかして");
    expect(block).toContain("まず感情の根っこを");
    expect(block).toContain("情報を集めるのが");
    expect(block).toContain("ごめん");
  });

  it("実際の失敗応答パターンが禁止リストに含まれている", () => {
    const block = buildSkeletonPromptBlock(skeleton);
    expect(block).toContain("情報を集めるのが");
    expect(block).toContain("ごめん");
  });

  it("内面の力のバランスが体感言語で描写されている", () => {
    const block = buildSkeletonPromptBlock(skeleton);
    // ForceBalance の体感描写が含まれる
    expect(block).toMatch(/進みたい力|守りたい力|拮抗/);
    // 確からしさの体感が含まれる
    expect(block).toContain("確からしさ");
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROOF 4: RC4 — thinSlice 非依存で Contract/Bans/Transfer 稼働
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROOF 4: RC4 — thinSlice 非依存で常時有効", () => {
  it("selectAlterRole が thinSlice=false でも Role を返す", () => {
    // route.ts RC4 ブロック: const effectiveRole = v42Role ?? selectAlterRole(...)
    // thinSlice=false の場合 v42Role=null → selectAlterRole がフォールバック
    const role = selectAlterRole("conclude", "judgment", null, 10);
    expect(role).toBeDefined();
    expect(role.role).toBeDefined();
    expect(["mirror", "co_thinker", "operator", "repair"]).toContain(role.role);
  });

  it("repair モードでは repair ロールが選択される", () => {
    const role = selectAlterRole("repair", "judgment", null, 10);
    expect(role.role).toBe("repair");
  });

  it("buildRoleContractBlock がプロンプトブロックを生成する", () => {
    const role = selectAlterRole("conclude", "judgment", null, 10);
    const block = buildRoleContractBlock(role);
    expect(typeof block).toBe("string");
    expect(block.length).toBeGreaterThan(0);
    // ロールのラベル表記が含まれることを確認（co_thinker → "CoThinker"）
    expect(block).toContain("今ターンの役割");
    expect(block).toContain("許可される行動");
    expect(block).toContain("禁止される行動");
  });

  it("buildSemanticBansBlock が禁止表現リストを生成する", () => {
    const block = buildSemanticBansBlock();
    expect(typeof block).toBe("string");
    expect(block.length).toBeGreaterThan(0);
  });

  it("buildBurdenTransferBlock が責任分担を生成する", () => {
    const role = selectAlterRole("conclude", "judgment", null, 10);
    const block = buildBurdenTransferBlock(role.role);
    expect(typeof block).toBe("string");
    expect(block.length).toBeGreaterThan(0);
  });

  it("route.ts RC4 の統合パターンを再現: thinSlice=false でも全ブロック注入可能", () => {
    // route.ts の RC4 ブロックを再現
    const v42Role = null; // thinSlice=false → v42Role は null
    const effectiveRole = v42Role ?? selectAlterRole("conclude", "judgment", null, 10);

    const systemPromptParts: string[] = [];
    systemPromptParts.push(buildRoleContractBlock(effectiveRole));
    systemPromptParts.push(buildBurdenTransferBlock(effectiveRole.role));
    systemPromptParts.push(buildSemanticBansBlock());

    const combined = systemPromptParts.join("");
    expect(combined.length).toBeGreaterThan(100); // 実質的な内容がある
    // 3つのブロックが全て注入されていることを確認
    expect(combined).toContain("今ターンの役割");
    expect(combined).toContain("責任分担");
    expect(combined).toContain("絶対禁止表現");
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROOF 5: RC3 — Personality Facts → Predictive Claims
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROOF 5: RC3→RC4 — Personality Facts が一人称自己知識形式", () => {
  // AlterPersonality 型に準拠したフィクスチャ
  const personality = {
    archetypeCode: "AVIO" as const,
    shadowCode: "NCEX" as const,
    dominantContradictions: ["独立性 vs 承認欲求"],
    contradictionAxes: [] as Array<{ axisA: string; axisB: string; tension: number }>,
    suppressedTraits: [] as string[],
    overclaimedTraits: [] as string[],
    coreWound: "自分の価値が世界に認められないこと",
    coreWoundShort: "自分の価値が認められないこと",
    coreLabel: "先導者",
    stressLabel: "逃避者",
    shadowCoreLabel: "守護者",
    archetypeName: "先導者",
    shadowName: "守護者",
    blindSpot: "他人の感情的ニーズを過小評価する傾向",
    shadowBlindSpot: "変化への柔軟性が不足する",
    axisScores: {
      introvert_vs_extrovert: 0.35,
      analytical_vs_intuitive: 0.7,
      cautious_vs_bold: 0.65,
      individual_vs_social: 0.3,
      plan_vs_spontaneous: 0.55,
    } as Record<string, number>,
    strengths: ["ゼロからの構想力", "決断の速さ", "ビジョン構築"],
    growthKey: "小さな成功体験の積み重ね",
    coreFear: "凡庸であること",
    coreDesire: "唯一無二の存在であること",
    safeState: "自由に創造できている時、最も能力を発揮する",
    stressState: "批判を受けると引きこもりがちになる",
    innerContradiction: "独立したいが、認められたい",
  } as unknown as AlterPersonality;

  // RC4: ファクトは一人称の自己知識（「僕は〜」）。操作指示は混ぜない。
  // 旧RC3の三人称ラベル（「判断の歪みトリガー:」「この人が見落としやすい点:」等）が消えていること。

  it("coreFear → 一人称の恐れ（旧: 回避傾向のトリガー + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const fearFact = facts.find(f => f.text.includes("怖くて") && f.text.includes("拒否"));
    expect(fearFact).toBeDefined();
    expect(fearFact!.text).toContain("凡庸であること");
    // 旧形式の三人称ラベルが消えていること
    const oldFormat = facts.find(f => f.text.includes("回避傾向のトリガー"));
    expect(oldFormat).toBeUndefined();
  });

  it("coreDesire → 一人称の持続条件（旧: 持続条件 + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const desireFact = facts.find(f => f.text.includes("満たされるとき") && f.text.includes("続けたい"));
    expect(desireFact).toBeDefined();
    expect(desireFact!.text).toContain("唯一無二の存在であること");
    const oldFormat = facts.find(f => f.text.includes("持続条件:"));
    expect(oldFormat).toBeUndefined();
  });

  it("strengths → 一人称の得意領域（旧: 得意な場面 + 優先提示指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const strengthFact = facts.find(f => f.text.includes("得意領域"));
    expect(strengthFact).toBeDefined();
    expect(strengthFact!.text).toContain("ゼロからの構想力");
    // 旧形式の操作指示が消えていること
    expect(strengthFact!.text).not.toContain("優先提示する");
  });

  it("coreWoundShort → 一人称の防御傾向（旧: 判断の歪みトリガー + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const woundFact = facts.find(f => f.text.includes("防御的になりやすい"));
    expect(woundFact).toBeDefined();
    expect(woundFact!.text).toContain("自分の価値が認められないこと");
    // 旧形式の操作指示が消えていること
    expect(woundFact!.text).not.toContain("直接指摘せず");
    const oldFormat = facts.find(f => f.text.includes("判断の歪みトリガー"));
    expect(oldFormat).toBeUndefined();
  });

  it("blindSpot → 一人称の気づきにくさ（旧: この人が見落としやすい点 + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const blindFact = facts.find(f => f.text.includes("気づきにくい"));
    expect(blindFact).toBeDefined();
    expect(blindFact!.text).toContain("僕は");
    // 旧形式の三人称ラベル・操作指示が消えていること
    expect(blindFact!.text).not.toContain("この人が見落としやすい点");
    expect(blindFact!.text).not.toContain("選択肢に自然に含める");
  });

  it("safeState → 一人称の挑戦条件（旧: 安定時の行動予測 + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const safeFact = facts.find(f => f.text.includes("挑戦的な選択に乗りやすい"));
    expect(safeFact).toBeDefined();
    expect(safeFact!.text).toContain("自由に創造できている時");
    const oldFormat = facts.find(f => f.text.includes("安定時の行動予測"));
    expect(oldFormat).toBeUndefined();
  });

  it("stressState → 一人称のストレス反応（旧: ストレス時の行動予測 + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const stressFact = facts.find(f => f.text.includes("ストレス状態だと") && f.text.includes("シンプルな選択肢"));
    expect(stressFact).toBeDefined();
    expect(stressFact!.text).toContain("引きこもりがち");
    const oldFormat = facts.find(f => f.text.includes("ストレス時の行動予測"));
    expect(oldFormat).toBeUndefined();
  });

  it("innerContradiction → 一人称の揺れ（旧: 判断の揺れの構造 + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const contradictionFact = facts.find(f => f.text.includes("相反する想い") && f.text.includes("揺れやすい"));
    expect(contradictionFact).toBeDefined();
    expect(contradictionFact!.text).toContain("独立したいが、認められたい");
    // 旧形式の操作指示が消えていること
    expect(contradictionFact!.text).not.toContain("両方を満たす選択肢を探す");
    const oldFormat = facts.find(f => f.text.includes("判断の揺れの構造"));
    expect(oldFormat).toBeUndefined();
  });

  it("growthKey → 一人称の動力源（旧: 判断を前に進める鍵 + 操作指示）", () => {
    const facts = buildTaggedFacts(personality, null, []);
    const growthFact = facts.find(f => f.text.includes("動きやすくなる"));
    expect(growthFact).toBeDefined();
    expect(growthFact!.text).toContain("小さな成功体験の積み重ね");
    // 旧形式の操作指示が消えていること
    expect(growthFact!.text).not.toContain("実行されやすい");
    const oldFormat = facts.find(f => f.text.includes("判断を前に進める鍵"));
    expect(oldFormat).toBeUndefined();
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROOF 6: Metrics — 実会話の品質が「悪い」と正しく計測
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROOF 6: Metrics — 実会話ログの品質指標", () => {
  const bans = extractUserBans(REAL_CONVERSATION);
  const metrics = computeGovernanceMetrics(REAL_CONVERSATION, bans);

  it("constraint_violation_rate > 0（禁止語が応答に含まれた）", () => {
    expect(metrics.constraint_violation_rate).toBeGreaterThan(0);
  });

  it("direct_answer_first_sentence_rate <= 0.5（具体質問に直答できていない）", () => {
    expect(metrics.direct_answer_first_sentence_rate).toBeLessThanOrEqual(0.5);
  });

  it("repair_recovery_rate < 1.0（修復後も不満が継続）", () => {
    expect(metrics.repair_recovery_rate).toBeLessThan(1.0);
  });

  it("改善会話では全指標が良好になる", () => {
    const goodConversation = [
      { role: "user", content: "私には何が合ってるか具体的に教えて" },
      { role: "alter", content: "たいしさんに合っているのは、ゼロから立ち上げる側です。起業の方が向いています。" },
      { role: "user", content: "もっと詳しく教えて" },
      { role: "alter", content: "具体的には、構想段階のプロダクトを形にしていく仕事が合っています。理由は3つあります。" },
    ];
    const goodMetrics = computeGovernanceMetrics(goodConversation, []);
    expect(goodMetrics.constraint_violation_rate).toBe(0);
    expect(goodMetrics.direct_answer_first_sentence_rate).toBe(1);
  });
});
