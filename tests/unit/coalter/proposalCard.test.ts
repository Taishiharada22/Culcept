/**
 * CoAlter ProposalCard — Phase 1 表示条件テスト
 *
 * 確認:
 * - 固定テンプレート5ブロックが揃う
 * - 候補は2〜3
 * - 退出シグナルが必ずある
 * - 強い断定文（禁止表現）が入らない
 */

import { describe, it, expect, vi } from "vitest";

// server-only は Next.js の RSC 検出用。Node 環境では空モジュールに差し替える
vi.mock("server-only", () => ({}));

import type {
  ProposalCard,
  ConversationAnalysis,
  CoAlterPersonProfile,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import { buildUserPrompt } from "@/lib/coalter/proposalGenerator";

// ── テスト対象の型バリデーション関数 ──

/** ProposalCard が Phase 1 テンプレートに準拠しているか検証 */
function validateProposalCard(card: ProposalCard): string[] {
  const errors: string[] = [];

  // ① summary 必須
  if (!card.summary || card.summary.trim().length === 0) {
    errors.push("① summary が空");
  }

  // ② priorities 必須
  if (!card.priorities.userA || card.priorities.userA.trim().length === 0) {
    errors.push("② priorities.userA が空");
  }
  if (!card.priorities.userB || card.priorities.userB.trim().length === 0) {
    errors.push("② priorities.userB が空");
  }

  // ③ candidates 2〜3
  if (card.candidates.length < 1) {
    errors.push("③ candidates が0件");
  }
  if (card.candidates.length > 3) {
    errors.push(`③ candidates が${card.candidates.length}件（3以下にすべき）`);
  }
  for (const c of card.candidates) {
    if (!c.title || c.title.trim().length === 0) {
      errors.push(`③ candidate rank=${c.rank} の title が空`);
    }
  }

  // ④ reasoning 必須
  if (!card.reasoning || card.reasoning.trim().length === 0) {
    errors.push("④ reasoning が空");
  }

  // ⑤ closing（退出シグナル）必須
  if (!card.closing || card.closing.trim().length === 0) {
    errors.push("⑤ closing（退出シグナル）が空");
  }

  return errors;
}

/** 禁止表現チェック */
function checkForbiddenPatterns(card: ProposalCard): string[] {
  const violations: string[] = [];
  const allText = [
    card.summary,
    card.priorities.userA,
    card.priorities.userB,
    card.priorities.common ?? "",
    ...card.candidates.map((c) => `${c.title} ${c.oneLiner}`),
    card.reasoning,
    card.closing,
  ].join(" ");

  const forbidden: [RegExp, string][] = [
    [/すべきです/, "「すべきです」（指示的）"],
    [/しなければ/, "「しなければ」（強制的）"],
    [/最適な選択は/, "「最適な選択は」（断定的）"],
    [/正しい(選択|答え|判断)は/, "「正しい選択は」（断定的）"],
    [/本当は.{0,10}思って/, "「本当は〜思って」（本音暴露）"],
    [/マッチング度|一致度|適合率/, "機械的数値表現"],
    [/\d{2,3}%/, "パーセンテージ表示"],
    [/タイプです|タイプだから/, "性格ラベリング"],
    [/に合わせるべき/, "「合わせるべき」（一方への指示）"],
  ];

  for (const [pattern, label] of forbidden) {
    if (pattern.test(allText)) {
      violations.push(`禁止表現検出: ${label}`);
    }
  }

  return violations;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ProposalCard バリデーション", () => {
  // ── 正常なカード ──
  const VALID_CARD: ProposalCard = {
    summary:
      "映画を決めたいけど、ジャンルの好みで少し迷ってるみたいだね。",
    priorities: {
      userA: "たいし: 新しい作品を試したい",
      userB: "あいさん: ハズレを避けたい",
      common: "二人ともアクション好き",
    },
    candidates: [
      {
        rank: 1,
        title: "ミッション: インポッシブル 8",
        oneLiner: "安定のアクション",
        practicalInfo: "上映中 / 2h12m",
        url: null,
      },
      {
        rank: 2,
        title: "ブレードランナー 2099",
        oneLiner: "SF好きなら冒険する価値あり",
        practicalInfo: "上映中 / 1h58m",
        url: null,
      },
    ],
    reasoning:
      "二人とも外したくない傾向があるから、評価安定型を中心に選んだよ。",
    closing: "気になるのがあったら二人で話してみてね！",
  };

  it("正常なカードは全バリデーションを通過する", () => {
    const errors = validateProposalCard(VALID_CARD);
    expect(errors).toEqual([]);
  });

  it("正常なカードは禁止表現を含まない", () => {
    const violations = checkForbiddenPatterns(VALID_CARD);
    expect(violations).toEqual([]);
  });

  // ── 5ブロック必須チェック ──

  it("summary が空なら検出", () => {
    const card = { ...VALID_CARD, summary: "" };
    const errors = validateProposalCard(card);
    expect(errors).toContain("① summary が空");
  });

  it("priorities.userA が空なら検出", () => {
    const card = {
      ...VALID_CARD,
      priorities: { ...VALID_CARD.priorities, userA: "" },
    };
    const errors = validateProposalCard(card);
    expect(errors).toContain("② priorities.userA が空");
  });

  it("closing が空なら検出（退出シグナル必須）", () => {
    const card = { ...VALID_CARD, closing: "" };
    const errors = validateProposalCard(card);
    expect(errors).toContain("⑤ closing（退出シグナル）が空");
  });

  // ── 候補数チェック ──

  it("候補0件は検出", () => {
    const card = { ...VALID_CARD, candidates: [] };
    const errors = validateProposalCard(card);
    expect(errors).toContain("③ candidates が0件");
  });

  it("候補4件以上は検出", () => {
    const card = {
      ...VALID_CARD,
      candidates: [
        ...VALID_CARD.candidates,
        { rank: 3, title: "C", oneLiner: "c", practicalInfo: null, url: null },
        { rank: 4, title: "D", oneLiner: "d", practicalInfo: null, url: null },
      ],
    };
    const errors = validateProposalCard(card);
    expect(errors.some((e) => e.includes("3以下"))).toBe(true);
  });

  it("候補2件はOK", () => {
    const errors = validateProposalCard(VALID_CARD);
    expect(errors.filter((e) => e.includes("candidates"))).toEqual([]);
  });

  it("候補3件はOK", () => {
    const card = {
      ...VALID_CARD,
      candidates: [
        ...VALID_CARD.candidates,
        { rank: 3, title: "怪物の木こり", oneLiner: "邦画", practicalInfo: null, url: null },
      ],
    };
    const errors = validateProposalCard(card);
    expect(errors.filter((e) => e.includes("candidates"))).toEqual([]);
  });

  // ── 禁止表現チェック ──

  it("「すべきです」を検出", () => {
    const card = {
      ...VALID_CARD,
      reasoning: "この映画にすべきです",
    };
    const v = checkForbiddenPatterns(card);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toContain("すべきです");
  });

  it("「本当はこう思っている」を検出", () => {
    const card = {
      ...VALID_CARD,
      summary: "Aさんは本当はアクションが見たいと思っている",
    };
    const v = checkForbiddenPatterns(card);
    expect(v.length).toBeGreaterThan(0);
  });

  it("パーセンテージ表示を検出", () => {
    const card = {
      ...VALID_CARD,
      reasoning: "マッチング度は85%です",
    };
    const v = checkForbiddenPatterns(card);
    expect(v.length).toBeGreaterThan(0);
  });

  it("性格ラベリングを検出", () => {
    const card = {
      ...VALID_CARD,
      priorities: {
        ...VALID_CARD.priorities,
        userA: "あなたは慎重タイプだから",
      },
    };
    const v = checkForbiddenPatterns(card);
    expect(v.length).toBeGreaterThan(0);
  });

  it("「合わせるべき」を検出", () => {
    const card = {
      ...VALID_CARD,
      reasoning: "Bさんに合わせるべきです",
    };
    const v = checkForbiddenPatterns(card);
    expect(v.length).toBeGreaterThan(0);
  });

  // ── common は nullable ──

  it("common が null でもバリデーション通過", () => {
    const card = {
      ...VALID_CARD,
      priorities: { ...VALID_CARD.priorities, common: null },
    };
    const errors = validateProposalCard(card);
    expect(errors).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1.5: buildUserPrompt — pendingDeltas / avoidKeys
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildUserPrompt (Phase 1.5)", () => {
  const profileA: CoAlterPersonProfile = {
    userId: "a",
    displayName: "たいし",
    communicationStyle: {
      directVsDiplomatic: null,
      conflictStyle: null,
      attachmentStyle: null,
      reassuranceNeed: null,
      emotionalVariability: null,
    },
    decisionStyle: {
      noveltyPreference: null,
      decisionSpeed: null,
      riskTolerance: null,
    },
    interests: [],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
  const profileB: CoAlterPersonProfile = {
    ...profileA,
    userId: "b",
    displayName: "あいさん",
  };
  const analysis: ConversationAnalysis = {
    theme: "food",
    stalemate: null,
    recentMessages: [],
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
    },
    constraintScore: 0.5,
  };
  const relationship: RelationshipContext = {
    commonGround: [],
    frictionPoints: [],
    fairnessLedger: [],
    pastSessionCount: 0,
  };
  const searchCandidates: SearchCandidate[] = [];

  it("pendingDeltas なしなら調整セクションが出ない", () => {
    const prompt = buildUserPrompt(
      profileA,
      profileB,
      analysis,
      searchCandidates,
      relationship,
      null,
    );
    expect(prompt).not.toContain("前回からの調整方向");
  });

  it("pendingDeltas ありなら調整セクションと軸名が入る", () => {
    const prompt = buildUserPrompt(
      profileA,
      profileB,
      analysis,
      searchCandidates,
      relationship,
      null,
      { pendingDeltas: { quietness: 1, novelty: -1 } },
    );
    expect(prompt).toContain("前回からの調整方向");
    expect(prompt).toContain("静かさ");
    expect(prompt).toContain("新しさ");
    expect(prompt).toContain("上げる");
    expect(prompt).toContain("下げる");
  });

  it("avoidKeys ありなら既出候補セクションにキーが入る", () => {
    const prompt = buildUserPrompt(
      profileA,
      profileB,
      analysis,
      searchCandidates,
      relationship,
      null,
      { avoidKeys: ["url:eiga.com/movie/123", "title:abc"] },
    );
    expect(prompt).toContain("避けるべき既出候補");
    expect(prompt).toContain("url:eiga.com/movie/123");
    expect(prompt).toContain("title:abc");
  });

  it("avoidKeys なしなら既出候補セクションが出ない", () => {
    const prompt = buildUserPrompt(
      profileA,
      profileB,
      analysis,
      searchCandidates,
      relationship,
      null,
    );
    expect(prompt).not.toContain("避けるべき既出候補");
  });

  it("avoidKeys は最大20件に制限", () => {
    const keys = Array.from({ length: 30 }, (_, i) => `title:k${i}`);
    const prompt = buildUserPrompt(
      profileA,
      profileB,
      analysis,
      searchCandidates,
      relationship,
      null,
      { avoidKeys: keys },
    );
    expect(prompt).toContain("title:k0");
    expect(prompt).toContain("title:k19");
    expect(prompt).not.toContain("title:k20");
    expect(prompt).not.toContain("title:k29");
  });
});
