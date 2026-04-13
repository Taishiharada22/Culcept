import { describe, it, expect } from "vitest";
import {
  isDailyGuidanceQuery,
  analyzeQueryContext,
  extractDailyGuidanceFrame,
  checkDailyGuidanceClarify,
  buildDailyGuidanceSkeleton,
  buildDailyGuidancePromptBlock,
  validateDailyGuidanceResponse,
  sanitizeTraitInversions,
  type DailyGuidanceFrame,
} from "@/lib/stargazer/alterHomeAdapter";
import type { AlterPersonality } from "@/lib/stargazer/alter";

// ── テスト用 personality ──
const basePersonality = {
  axisScores: {
    introvert_vs_extrovert: 0.4,
    decision_tempo: 0.5,
    decomposition: 0.5,
    growth_mindset: 0.6,
    perfectionist_vs_pragmatic: 0.5,
    change_embrace_vs_resist: 0.6,
    exploration_closure: 0.6,
    social_initiative: 0.4,
    energy_rhythm: 0.4,
  },
} as unknown as AlterPersonality;

const introvertPersonality: AlterPersonality = {
  ...basePersonality,
  axisScores: {
    ...basePersonality.axisScores,
    introvert_vs_extrovert: 0.2,
    social_initiative: 0.2,
  },
};

const extrovertPersonality: AlterPersonality = {
  ...basePersonality,
  axisScores: {
    ...basePersonality.axisScores,
    introvert_vs_extrovert: 0.8,
    social_initiative: 0.7,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isDailyGuidanceQuery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isDailyGuidanceQuery", () => {
  const positives = [
    "今日何したらいい？",
    "今日どうしよう",
    "何すればいい？",
    "暇だなー",
    "やることないんだけど",
    "休みの日何しよう",
    "今日の過ごし方教えて",
    "やる気ないんだけど何したらいい",
    "疲れたけど何しよう",
    "何から始めればいい？",
    "何もしたくない",
    "手がつかない",
    "今日一日どう過ごす？",
    "朝何しよう",
    "午後何しよう",
    // 明日・明後日・未来系（修正B追加分）
    "明日は何する？",
    "明日何すればいい？",
    "明日どうしよう",
    "明日の予定は？",
    "あした何しよう",
    "明後日は何する？",
    "あさって何する？",
    "明後日の予定は？",
    "来週何しよう",
    "週末どう過ごす？",
    "週末何する？",
  ];

  const negatives = [
    "彼女に連絡すべきか迷ってる",
    "飲み会に行った方がいい？",
    "上司に相談すべきかどうか",
    "友達に誘われたけど行くか行かないか",
    "転職した方がいいかな",
    "彼氏と別れるべき？",
    "親に言うべきか迷ってる",
  ];

  it.each(positives)("positive: %s", (msg) => {
    expect(isDailyGuidanceQuery(msg)).toBe(true);
  });

  it.each(negatives)("negative: %s", (msg) => {
    expect(isDailyGuidanceQuery(msg)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// analyzeQueryContext — daily_guidance domain
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("analyzeQueryContext — daily_guidance", () => {
  it("detects daily_guidance domain", () => {
    const ctx = analyzeQueryContext("今日何したらいい？");
    expect(ctx.domain).toBe("daily_guidance");
    expect(ctx.domain_confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("sets target_type to abstract for daily guidance", () => {
    const ctx = analyzeQueryContext("暇だなー");
    expect(ctx.domain).toBe("daily_guidance");
    expect(ctx.hidden_variables.target_type).toBe("abstract");
  });

  it("detects urgency=immediate when 今日 is present", () => {
    const ctx = analyzeQueryContext("今日何しよう");
    expect(ctx.hidden_variables.urgency).toBe("immediate");
  });

  it("falls through to normal domain for judgment questions", () => {
    const ctx = analyzeQueryContext("今日飲み会行った方がいい？");
    expect(ctx.domain).not.toBe("daily_guidance");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractDailyGuidanceFrame
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractDailyGuidanceFrame", () => {
  it("detects depleted energy", () => {
    const frame = extractDailyGuidanceFrame("疲れたけど何しよう", basePersonality);
    expect(frame.energy_level.value).toBe("depleted");
    expect(frame.energy_level.source).toBe("known_from_user");
  });

  it("detects low energy from やる気ない", () => {
    const frame = extractDailyGuidanceFrame("やる気ないけど何する", basePersonality);
    expect(frame.energy_level.value).toBe("low");
  });

  it("detects high energy", () => {
    const frame = extractDailyGuidanceFrame("元気だから何しよう", basePersonality);
    expect(frame.energy_level.value).toBe("high");
  });

  it("detects full_day time budget", () => {
    const frame = extractDailyGuidanceFrame("今日一日フリーなんだけど", basePersonality);
    expect(frame.time_budget.value).toBe("full_day");
  });

  it("detects productive desire", () => {
    const frame = extractDailyGuidanceFrame("タスクを進めたい", basePersonality);
    expect(frame.desire_direction.value).toBe("productive");
  });

  it("detects social desire", () => {
    const frame = extractDailyGuidanceFrame("誰かに会いたい", basePersonality);
    expect(frame.desire_direction.value).toBe("social");
  });

  it("detects relaxing desire", () => {
    const frame = extractDailyGuidanceFrame("のんびりしたい", basePersonality);
    expect(frame.desire_direction.value).toBe("relaxing");
  });

  it("infers energy from personality when not stated", () => {
    const frame = extractDailyGuidanceFrame("今日何しよう", basePersonality);
    // energy_recovery_style=0.4 → low
    expect(frame.energy_level.source).toBe("inferred");
    expect(frame.energy_level.confidence).toBeLessThan(0.5);
  });

  it("infers social_bandwidth from personality", () => {
    const frame = extractDailyGuidanceFrame("今日何しよう", introvertPersonality);
    expect(frame.social_bandwidth.value).toBe("solo_preferred");
    expect(frame.social_bandwidth.source).toBe("inferred");
  });

  it("sets unknown when nothing is detectable", () => {
    const frame = extractDailyGuidanceFrame("何しよう", null);
    expect(frame.time_budget.value).toBe("unknown");
    expect(frame.energy_level.value).toBe("unknown");
    expect(frame.desire_direction.value).toBe("unknown");
  });

  it("detects hard constraints", () => {
    const frame = extractDailyGuidanceFrame("会議があるけど何しよう", basePersonality);
    expect(frame.hard_constraints.value.length).toBeGreaterThan(0);
    expect(frame.hard_constraints.value).toContain("会議あり");
  });

  it("detects solo preference", () => {
    const frame = extractDailyGuidanceFrame("一人で過ごしたいんだけど何しよう", basePersonality);
    expect(frame.social_bandwidth.value).toBe("solo_preferred");
    expect(frame.social_bandwidth.source).toBe("known_from_user");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// checkDailyGuidanceClarify
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("checkDailyGuidanceClarify", () => {
  it("asks when both time and energy are unknown", () => {
    const frame = extractDailyGuidanceFrame("何しよう", null);
    const clarify = checkDailyGuidanceClarify(frame);
    expect(clarify.needs_clarify).toBe(true);
    expect(clarify.question).toBeTruthy();
  });

  it("does not ask when energy is depleted (avoid burdening)", () => {
    const frame = extractDailyGuidanceFrame("疲れた。何しよう", null);
    const clarify = checkDailyGuidanceClarify(frame);
    expect(clarify.needs_clarify).toBe(false);
  });

  it("does not ask when both are known", () => {
    const frame = extractDailyGuidanceFrame("今日一日フリーで元気。何しよう", basePersonality);
    const clarify = checkDailyGuidanceClarify(frame);
    expect(clarify.needs_clarify).toBe(false);
  });

  it("asks when only time is unknown (energy known, not low)", () => {
    const frame = extractDailyGuidanceFrame("元気だけど何しよう", basePersonality);
    const clarify = checkDailyGuidanceClarify(frame);
    expect(clarify.needs_clarify).toBe(true);
    expect(clarify.target_variable).toBe("time_budget");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDailyGuidanceSkeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDailyGuidanceSkeleton", () => {
  it("returns recover mode for depleted energy", () => {
    const frame = extractDailyGuidanceFrame("疲れた。何しよう", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    expect(skeleton.daily_mode).toBe("recover");
    expect(skeleton.recommended_first_step).toBeTruthy();
    expect(skeleton.fallback_step).toBeTruthy();
  });

  it("returns advance mode for productive desire", () => {
    const frame = extractDailyGuidanceFrame("タスクを片付けたい。今日一日ある", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    expect(skeleton.daily_mode).toBe("advance");
  });

  it("returns social mode for social desire", () => {
    const frame = extractDailyGuidanceFrame("誰かに会いたい", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    expect(skeleton.daily_mode).toBe("social");
  });

  it("first step contains concrete action", () => {
    const frame = extractDailyGuidanceFrame("今日何しよう", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    // first step should not be empty
    expect(skeleton.recommended_first_step.length).toBeGreaterThan(5);
  });

  it("includes grounding factors from personality", () => {
    const frame = extractDailyGuidanceFrame("今日何しよう", introvertPersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, introvertPersonality);
    expect(skeleton.grounding_factors.length).toBeGreaterThan(0);
    // introvert should mention solo/一人
    expect(skeleton.grounding_factors.some((f) => /一人|回復/.test(f))).toBe(true);
  });

  it("includes must_do from hard constraints", () => {
    const frame = extractDailyGuidanceFrame("会議があるけど何しよう", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    expect(skeleton.must_do_block.length).toBeGreaterThan(0);
  });

  it("avoid_today is non-empty", () => {
    const frame = extractDailyGuidanceFrame("今日何しよう", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    expect(skeleton.avoid_today.length).toBeGreaterThan(0);
  });

  it("uses personality for mode when desire is unknown", () => {
    // extrovert with high social_initiative → social
    const frame = extractDailyGuidanceFrame("今日何しよう", extrovertPersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, extrovertPersonality);
    expect(["social", "explore"]).toContain(skeleton.daily_mode);
  });

  it("introvert recover → specific solo recovery action", () => {
    const frame = extractDailyGuidanceFrame("疲れた。何しよう", introvertPersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, introvertPersonality);
    expect(skeleton.daily_mode).toBe("recover");
    // should NOT suggest meeting people
    expect(skeleton.recommended_first_step).not.toMatch(/会[いう]|人/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDailyGuidancePromptBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDailyGuidancePromptBlock", () => {
  it("produces structured prompt text", () => {
    const frame = extractDailyGuidanceFrame("今日何しよう", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    const block = buildDailyGuidancePromptBlock(skeleton);

    expect(block).toContain("今日のガイダンス骨格");
    expect(block).toContain("最初の一歩");
    expect(block).toContain("エネルギー切れ時");
    expect(block).toContain("文章化ルール");
    expect(block).toContain("「休む」だけでは不可");
  });

  it("includes must_do section when constraints exist", () => {
    const frame = extractDailyGuidanceFrame("会議があるけど何しよう", basePersonality);
    const skeleton = buildDailyGuidanceSkeleton(frame, basePersonality);
    const block = buildDailyGuidancePromptBlock(skeleton);

    expect(block).toContain("絶対やること");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validateDailyGuidanceResponse
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateDailyGuidanceResponse", () => {
  const recoverSkeleton = buildDailyGuidanceSkeleton(
    extractDailyGuidanceFrame("疲れた。何しよう", basePersonality),
    basePersonality,
  );

  const advanceSkeleton = buildDailyGuidanceSkeleton(
    extractDailyGuidanceFrame("タスクを片付けたい。今日一日ある", basePersonality),
    basePersonality,
  );

  it("passes good recover response", () => {
    const response = "今日はエネルギーを取り戻す日にしよう。まずスマホを別の部屋に置いて、15分だけ横になってみて。目を閉じて呼吸に集中するだけでいい。君は一人の時間で回復するタイプだから、無理に外に出なくていい。午後は好きな飲み物を作って、窓際でぼーっとする時間を30分だけ取ろう。";
    const result = validateDailyGuidanceResponse(response, recoverSkeleton);
    expect(result.pass).toBe(true);
  });

  it("fails on vague 休みましょう without specifics", () => {
    const response = "今日は休みましょう。大切です。自分を大切に。";
    const result = validateDailyGuidanceResponse(response, recoverSkeleton);
    expect(result.pass).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("fails on generic advice", () => {
    const response = "バランスが重要です。無理をしないで。自分を大切にしましょう。心がけましょう。";
    const result = validateDailyGuidanceResponse(response, recoverSkeleton);
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("一般論"))).toBe(true);
  });

  it("fails on recover + 頑張ろう contradiction", () => {
    const response = "疲れているけど頑張ろう！全力で行こう！今日は攻めの日だ。まず朝からジムに行ってトレーニングを始めよう。";
    const result = validateDailyGuidanceResponse(response, recoverSkeleton);
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("recover"))).toBe(true);
  });

  it("fails on advance + 何もしなくていい contradiction", () => {
    const response = "何もしなくていいよ。ゆっくりするだけでいい。今日は一日中布団の中にいよう。";
    const result = validateDailyGuidanceResponse(response, advanceSkeleton);
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("advance"))).toBe(true);
  });

  it("fails on too short response", () => {
    const response = "散歩しよう。";
    const result = validateDailyGuidanceResponse(response, recoverSkeleton);
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("短すぎる"))).toBe(true);
  });

  it("passes good advance response", () => {
    const response = "今日はやるべきことを前に進める日にしよう。最も気になっているタスクを1つ選んで、午前中に完了させる。まずは15分で全体を把握して、一番重要な部分から手をつけて。君は大きな塊で一気にやる方が集中できるタイプだから、途中で別のことに手を出さない方がいい。午後に余力があれば2つ目に取りかかろう。3つ以上のタスクを同時に始めないこと。";
    const result = validateDailyGuidanceResponse(response, advanceSkeleton);
    expect(result.pass).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sanitizeTraitInversions tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const cautiousPersonality: AlterPersonality = {
  ...basePersonality,
  axisScores: { ...basePersonality.axisScores, cautious_vs_bold: 0.2, individual_vs_social: 0.3 },
};

const boldPersonality: AlterPersonality = {
  ...basePersonality,
  axisScores: { ...basePersonality.axisScores, cautious_vs_bold: 0.8, individual_vs_social: 0.8 },
};

describe("sanitizeTraitInversions", () => {
  it("replaces 即断型 for cautious user", () => {
    const text = "あなたは即断型寄りなので、すぐに決めてしまいましょう。";
    const result = sanitizeTraitInversions(text, cautiousPersonality);
    expect(result.text).not.toContain("即断型");
    expect(result.text).toContain("慎重に判断するタイプ");
    expect(result.corrections.length).toBe(1);
  });

  it("replaces 迷わず動ける for cautious user", () => {
    const text = "あなたは迷わず動けるタイプです。";
    const result = sanitizeTraitInversions(text, cautiousPersonality);
    expect(result.text).toContain("じっくり考えてから動く");
    expect(result.corrections.length).toBe(1);
  });

  it("replaces 衝動的に for cautious user", () => {
    const text = "衝動的に決めてもいいかもしれません。";
    const result = sanitizeTraitInversions(text, cautiousPersonality);
    expect(result.text).toContain("慎重に");
    expect(result.corrections.length).toBe(1);
  });

  it("replaces 社交的 for introverted user", () => {
    const text = "あなたは社交的なので、人に相談してみましょう。";
    const result = sanitizeTraitInversions(text, cautiousPersonality);
    expect(result.text).not.toContain("社交的");
    expect(result.corrections.length).toBe(1);
  });

  it("replaces 慎重派 for bold user", () => {
    const text = "慎重派のあなたにとって、この判断は難しいかもしれません。";
    const result = sanitizeTraitInversions(text, boldPersonality);
    expect(result.text).not.toContain("慎重派");
    expect(result.text).toContain("決断が早いタイプ");
    expect(result.corrections.length).toBe(1);
  });

  it("replaces 内向的 for extroverted user", () => {
    const text = "あなたは内向的なタイプなので。";
    const result = sanitizeTraitInversions(text, boldPersonality);
    expect(result.text).not.toContain("内向的");
    expect(result.text).toContain("社交的");
    expect(result.corrections.length).toBe(1);
  });

  it("does not modify text without inversions", () => {
    const text = "この状況では、少し時間をかけて考えてみましょう。";
    const result = sanitizeTraitInversions(text, cautiousPersonality);
    expect(result.text).toBe(text);
    expect(result.corrections.length).toBe(0);
  });

  it("handles multiple inversions in one text", () => {
    const text = "即断型のあなたは迷わず動けるし、社交的だから人に聞けばいい。";
    const result = sanitizeTraitInversions(text, cautiousPersonality);
    expect(result.text).not.toContain("即断型");
    expect(result.text).not.toContain("迷わず動ける");
    expect(result.text).not.toContain("社交的");
    expect(result.corrections.length).toBe(3);
  });

  it("does not modify text for neutral scores", () => {
    const neutralPersonality: AlterPersonality = {
      ...basePersonality,
      axisScores: { ...basePersonality.axisScores, cautious_vs_bold: 0.5, individual_vs_social: 0.5 },
    };
    const text = "即断型のあなたは社交的です。";
    const result = sanitizeTraitInversions(text, neutralPersonality);
    expect(result.text).toBe(text);
    expect(result.corrections.length).toBe(0);
  });
});
