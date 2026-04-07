/**
 * P2-1 Narrative Lens Tests
 *
 * 検証対象:
 * 1. Valence classification — 感情極性の分類
 * 2. Agency classification — 主体性の分類
 * 3. Interpretation shift detection — 解釈変化の検出
 * 4. Narrative freezing — 固着の検出
 * 5. Revision entry building — 書き換え履歴の生成
 * 6. Content similarity — bigram 類似度
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyValence,
  classifyAgency,
  detectInterpretationShift,
  computeContentSimilarity,
  detectNarrativeFreezing,
  buildRevisionEntry,
  buildNarrativeShiftPromptBlock,
  buildNarrativeLensAnalytics,
  NARRATIVE_DISCLOSURE_BAN,
  type NarrativeWithHistory,
} from "@/lib/stargazer/narrativeLens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Valence Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyValence()", () => {
  it("ネガティブキーワード → negative", () => {
    expect(classifyValence("人前で話すのが苦手")).toBe("negative");
    expect(classifyValence("自信がない")).toBe("negative");
    expect(classifyValence("一人は怖い")).toBe("negative");
  });

  it("ポジティブキーワード → positive", () => {
    expect(classifyValence("料理が得意")).toBe("positive");
    expect(classifyValence("人と話すのが好き")).toBe("positive");
    expect(classifyValence("自信がある")).toBe("positive");
  });

  it("両方 → ambivalent", () => {
    expect(classifyValence("好きだけど苦手")).toBe("ambivalent");
    expect(classifyValence("得意だけど怖い")).toBe("ambivalent");
  });

  it("対立語 → ambivalent", () => {
    expect(classifyValence("ときもあるけど反面そうでもない")).toBe("ambivalent");
  });

  it("どれにも該当しない → neutral", () => {
    expect(classifyValence("通勤に1時間かかる")).toBe("neutral");
    expect(classifyValence("毎朝コーヒーを飲む")).toBe("neutral");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Agency Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyAgency()", () => {
  it("能動的行動 → actor", () => {
    expect(classifyAgency("自分で決めて動いた")).toBe("actor");
    expect(classifyAgency("私は変えようと思った")).toBe("actor");
  });

  it("受動的表現 → receiver", () => {
    expect(classifyAgency("いつも振り回される")).toBe("receiver");
    expect(classifyAgency("上司に言われたからやった")).toBe("receiver");
  });

  it("俯瞰・観察 → observer", () => {
    expect(classifyAgency("そういう傾向がある")).toBe("observer");
    expect(classifyAgency("いつの間にかそうなってた")).toBe("observer");
  });

  it("どれにも該当しない → unknown", () => {
    expect(classifyAgency("毎朝コーヒー飲む")).toBe("unknown");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Interpretation Shift Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectInterpretationShift()", () => {
  it("ネガティブ → ポジティブ → valence_flip", () => {
    expect(detectInterpretationShift(
      "人前で話すのが苦手",
      "人前で話すのが好きになってきた",
    )).toBe("valence_flip");
  });

  it("受動 → 能動 → agency_shift", () => {
    expect(detectInterpretationShift(
      "いつも振り回される",
      "自分で選んで動くようにした",
    )).toBe("agency_shift");
  });

  it("断定 → 留保 → softening", () => {
    expect(detectInterpretationShift(
      "私は人見知りだ",
      "私は人見知りなのかもしれない",
    )).toBe("softening");
  });

  it("留保 → 断定 → intensification", () => {
    expect(detectInterpretationShift(
      "自分はリーダーに向いてる気がする",
      "自分はリーダーに向いてる",
    )).toBe("intensification");
  });

  it("全く違う内容 → reframe", () => {
    expect(detectInterpretationShift(
      "自分に魅力がないから振られた",
      "相性が合わなかっただけだと思う",
    )).toBe("reframe");
  });

  it("ほぼ同じ → minor_variation", () => {
    expect(detectInterpretationShift(
      "人見知りなところがある",
      "人見知りなところがあると思う",
    )).toBe("minor_variation");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Content Similarity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeContentSimilarity()", () => {
  it("同一文字列 → 1.0", () => {
    expect(computeContentSimilarity("テスト", "テスト")).toBe(1);
  });

  it("全く違う → 0 に近い", () => {
    expect(computeContentSimilarity("あいうえお", "かきくけこ")).toBeLessThan(0.2);
  });

  it("部分一致 → 0 より大きい", () => {
    const sim = computeContentSimilarity("人見知りなところがある", "人見知りかもしれない");
    expect(sim).toBeGreaterThan(0.1);
    expect(sim).toBeLessThan(0.8);
  });

  it("短すぎる文字列 → 0", () => {
    expect(computeContentSimilarity("a", "b")).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Narrative Freezing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectNarrativeFreezing()", () => {
  const baseNarrative: NarrativeWithHistory = {
    id: "test-1",
    theme: "自己認識: 人見知り",
    content: "人見知りなところがある",
    domain: "self",
    mention_count: 5,
    first_mentioned: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    last_mentioned: new Date().toISOString(),
    interpretation_history: [],
    current_valence: "negative",
    current_agency: "observer",
    revision_count: 0,
    frozen_since: null,
  };

  it("revision=0 + mention>=4 + 14日以上 → frozen", () => {
    const result = detectNarrativeFreezing([baseNarrative]);
    expect(result.isFrozen).toBe(true);
    expect(result.frozenThemes).toContain("自己認識: 人見知り");
    expect(result.shouldTriggerShake).toBe(true);
    expect(result.innerSense).not.toBeNull();
  });

  it("revision > 0 → not frozen", () => {
    const result = detectNarrativeFreezing([
      { ...baseNarrative, revision_count: 1 },
    ]);
    expect(result.isFrozen).toBe(false);
  });

  it("mention < 4 → not frozen（データ不足）", () => {
    const result = detectNarrativeFreezing([
      { ...baseNarrative, mention_count: 2 },
    ]);
    expect(result.isFrozen).toBe(false);
  });

  it("14日未満 → not frozen（期間不足）", () => {
    const result = detectNarrativeFreezing([
      { ...baseNarrative, first_mentioned: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    ]);
    expect(result.isFrozen).toBe(false);
  });

  it("空配列 → not frozen", () => {
    const result = detectNarrativeFreezing([]);
    expect(result.isFrozen).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Revision Entry Building
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRevisionEntry()", () => {
  it("valence flip → isRevision=true + revision 情報", () => {
    const result = buildRevisionEntry("苦手だ", "好きになった");
    expect(result.isRevision).toBe(true);
    expect(result.revision).not.toBeNull();
    expect(result.revision!.shiftType).toBe("valence_flip");
    expect(result.revision!.from.valence).toBe("negative");
    expect(result.revision!.to.valence).toBe("positive");
  });

  it("minor_variation → isRevision=false", () => {
    const result = buildRevisionEntry(
      "人見知りなところがある",
      "人見知りなところがあると思う",
    );
    expect(result.isRevision).toBe(false);
    expect(result.revision).toBeNull();
  });

  it("newInterpretation は常に返される", () => {
    const result = buildRevisionEntry("テスト", "テスト");
    expect(result.newInterpretation).toBeDefined();
    expect(result.newInterpretation.content).toBe("テスト");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildNarrativeShiftPromptBlock()", () => {
  it("valence_flip → 内部感覚ブロックを返す", () => {
    const block = buildNarrativeShiftPromptBlock({
      from: { content: "苦手だ", valence: "negative", agency: "unknown", at: "2026-01-01" },
      to: { content: "好きになった", valence: "positive", agency: "unknown", at: "2026-04-07" },
      shiftType: "valence_flip",
    });
    expect(block).toContain("物語の書き換え");
    expect(block).toContain("指摘」しない");
    expect(block).toContain("内側から感じている");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildNarrativeLensAnalytics()", () => {
  it("revision あり → shift_type 記録", () => {
    const analytics = buildNarrativeLensAnalytics(
      {
        from: { content: "苦手", valence: "negative", agency: "unknown", at: "" },
        to: { content: "好き", valence: "positive", agency: "unknown", at: "" },
        shiftType: "valence_flip",
      },
      { isFrozen: false, frozenThemes: [], frozenDays: 0, shouldTriggerShake: false, innerSense: null },
    );
    expect(analytics.narrative_revision_detected).toBe(true);
    expect(analytics.narrative_shift_type).toBe("valence_flip");
  });

  it("freezing あり → frozen_themes 記録", () => {
    const analytics = buildNarrativeLensAnalytics(
      null,
      { isFrozen: true, frozenThemes: ["自己認識: 人見知り"], frozenDays: 30, shouldTriggerShake: true, innerSense: "..." },
    );
    expect(analytics.narrative_freezing_detected).toBe(true);
    expect(analytics.narrative_frozen_themes).toEqual(["自己認識: 人見知り"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. Condition 1 — 表出禁止ルール回帰テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Condition 1: NARRATIVE_DISCLOSURE_BAN enforcement", () => {
  it("NARRATIVE_DISCLOSURE_BAN に禁止表現5つを含む", () => {
    expect(NARRATIVE_DISCLOSURE_BAN).toContain("前はこう言っていたよね");
    expect(NARRATIVE_DISCLOSURE_BAN).toContain("直接引用しないこと");
    expect(NARRATIVE_DISCLOSURE_BAN).toContain("前は〜だったのに");
    expect(NARRATIVE_DISCLOSURE_BAN).toContain("内的感覚のみ");
    expect(NARRATIVE_DISCLOSURE_BAN).toContain("静かに肯定すること");
  });

  it("shift prompt block に表出禁止ルールが含まれる", () => {
    const block = buildNarrativeShiftPromptBlock({
      from: { content: "苦手", valence: "negative", agency: "unknown", at: "" },
      to: { content: "好き", valence: "positive", agency: "unknown", at: "" },
      shiftType: "valence_flip",
    });
    expect(block).toContain("表出禁止ルール");
    expect(block).toContain("前はこう言っていたよね");
    expect(block).toContain("内的感覚のみ");
  });

  it("freezing inner sense に表出禁止ルールが含まれる", () => {
    const result = detectNarrativeFreezing([{
      id: "ban-test",
      theme: "テスト固着",
      content: "ずっと同じ",
      domain: "self",
      mention_count: 5,
      first_mentioned: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_mentioned: new Date().toISOString(),
      interpretation_history: [],
      current_valence: "negative",
      current_agency: "observer",
      revision_count: 0,
      frozen_since: null,
    }]);
    expect(result.innerSense).not.toBeNull();
    expect(result.innerSense).toContain("表出禁止ルール");
    expect(result.innerSense).toContain("前はこう言っていたよね");
    expect(result.innerSense).toContain("内的感覚のみ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. Condition 2 — 保守的 shift 検出 回帰テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Condition 2: conservative shift detection", () => {
  it("類似度 0.3-0.5 の中間域 → reframe ではなく minor_variation（保守的）", () => {
    // sim=0.333: 旧閾値(0.4)ではreframeだったが、新閾値(0.3)ではminor_variation
    const result = detectInterpretationShift(
      "朝起きるのが辛くて困る",
      "朝起きるのが大変で辛い",
    );
    expect(result).toBe("minor_variation");
  });

  it("freezing の innerSense が「兆候」という表現を使う（断定しない）", () => {
    const result = detectNarrativeFreezing([{
      id: "conservative-test",
      theme: "自己認識: 完璧主義",
      content: "完璧にやらないと気が済まない",
      domain: "self",
      mention_count: 6,
      first_mentioned: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      last_mentioned: new Date().toISOString(),
      interpretation_history: [],
      current_valence: "negative",
      current_agency: "observer",
      revision_count: 0,
      frozen_since: null,
    }]);
    expect(result.isFrozen).toBe(true);
    expect(result.innerSense).toContain("兆候");
    expect(result.innerSense).toContain("断定はしない");
  });

  it("buildRevisionEntry: 中間域の変化は revision として扱わない", () => {
    // sim=0.364: 旧閾値(0.4)ではreframeだったが、新閾値(0.3)ではminor_variation
    const result = buildRevisionEntry(
      "考えすぎて動けない",
      "考えすぎて疲れる",
    );
    expect(result.isRevision).toBe(false);
  });
});
