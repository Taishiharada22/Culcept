// lib/stargazer/insightTemplateEngine.ts
// 構造的にユニークなインサイトを生成するテンプレートエンジン
// スロットフィリングではなく、複数データポイントの交差から物語を紡ぐ

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import type { DetectedPattern } from "./patternDetectionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface InsightData {
  axisScores: Record<string, number>;
  patterns: DetectedPattern[];
  archetypeCode: string;
  sessionNumber: number;
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0=Sun
  previousInsightIds: string[];
}

export interface GeneratedInsight {
  id: string;
  text: string;
  category: InsightCategory;
  surpriseScore: number;
  requiredDataPoints: string[];
  templateId: string;
}

export type InsightCategory =
  | "time_pattern"
  | "contradiction"
  | "growth_trajectory"
  | "decision_pattern"
  | "emotional_cycle"
  | "self_image_gap"
  | "stress_response"
  | "social_behavior"
  | "value_hierarchy"
  | "unconscious_preference";

export interface InsightTemplate {
  id: string;
  requiredDataPoints: string[];
  category: InsightCategory;
  generate: (data: InsightData) => string | null;
  minSurpriseScore: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_NAMES = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];

const TIME_LABELS: Record<string, string> = {
  morning: "朝",
  afternoon: "昼",
  evening: "夕方",
  late_night: "深夜",
};

function axisLabel(axisId: string): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  return def ? `${def.labelLeft}↔${def.labelRight}` : axisId;
}

function axisSideLabel(axisId: string, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  return score < 0 ? def.labelLeft : def.labelRight;
}

function findPatterns(
  patterns: DetectedPattern[],
  type: string,
): DetectedPattern[] {
  return patterns.filter((p) => p.patternType === type);
}

function findPatternsForAxis(
  patterns: DetectedPattern[],
  axisId: string,
): DetectedPattern[] {
  return patterns.filter((p) => p.axisId === axisId);
}

function highConfidencePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  return patterns.filter((p) => p.confidence >= 0.6);
}

/** 2つの軸スコアが逆方向か */
function areOppositeDirections(scoreA: number, scoreB: number): boolean {
  return (scoreA > 0.2 && scoreB < -0.2) || (scoreA < -0.2 && scoreB > 0.2);
}

/** 軸スコアの強度を日本語で表現 */
function intensityWord(score: number): string {
  const abs = Math.abs(score);
  if (abs > 0.7) return "強く";
  if (abs > 0.4) return "やや";
  return "わずかに";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 20 Insight Templates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const INSIGHT_TEMPLATES: InsightTemplate[] = [
  // ── 1. 曜日別の判断パターン ──
  {
    id: "weekday_judgment_shift",
    requiredDataPoints: ["weekday_pattern", "axis_scores"],
    category: "time_pattern",
    minSurpriseScore: 0.4,
    generate(data) {
      const weekday = findPatterns(data.patterns, "weekday");
      if (weekday.length === 0) return null;

      const strongest = weekday.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      const dayName =
        (strongest.metadata.dayName as string) ?? "この曜日";
      const deviation = strongest.metadata.deviation as number;
      if (!strongest.axisId) return null;

      const axisName = axisLabel(strongest.axisId);
      const direction = deviation > 0 ? "右側" : "左側";
      const absDev = Math.abs(Math.round(deviation * 100));

      return `${dayName}、あなたの「${axisName}」は他の曜日より${absDev}%${direction}に振れる。一週間のうちこの曜日だけ、判断の重心が移動している。本人はおそらく気づいていない。`;
    },
  },

  // ── 2. 深夜の別人格 ──
  {
    id: "late_night_alter",
    requiredDataPoints: ["time_of_day_pattern", "axis_scores"],
    category: "time_pattern",
    minSurpriseScore: 0.5,
    generate(data) {
      const tod = findPatterns(data.patterns, "time_of_day");
      const lateNight = tod.filter(
        (p) => (p.metadata.timePeriod as string) === "late_night",
      );
      if (lateNight.length === 0) return null;

      const strongest = lateNight.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      if (!strongest.axisId) return null;

      const ratio = strongest.metadata.ratio as number | undefined;
      const deviation = strongest.metadata.deviation as number;
      const axisName = axisLabel(strongest.axisId);
      const shift = deviation > 0 ? "右" : "左";

      if (ratio && ratio > 1.3) {
        return `深夜のあなたは、回答に${Math.round(ratio * 100)}%長い時間をかける。そして「${axisName}」が${shift}に振れる。22時を過ぎると、昼間のあなたとは別の基準で世界を見ている。`;
      }

      return `深夜帯、「${axisName}」のスコアが${shift}に偏る。日中の自分が選ばないような判断を、夜のあなたは自然にしている。`;
    },
  },

  // ── 3. 矛盾する自己像 ──
  {
    id: "contradiction_self_image",
    requiredDataPoints: ["contradiction_pattern", "axis_scores"],
    category: "contradiction",
    minSurpriseScore: 0.6,
    generate(data) {
      const contradictions = findPatterns(data.patterns, "contradiction");
      if (contradictions.length === 0) return null;

      const strongest = contradictions.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      if (!strongest.axisId) return null;

      const rate = (strongest.metadata.contradictionRate as number) ?? 0;
      const label = axisLabel(strongest.axisId);
      const percent = Math.round(rate * 100);

      return `「${label}」で直感と最終回答が${percent}%の確率で矛盾している。最初に感じたことと、「こうあるべき」と思って選んだことが、別の方向を向いている。データが語っている——あなたの中に2人いる。`;
    },
  },

  // ── 4. 回避と向き合い ──
  {
    id: "avoidance_confrontation",
    requiredDataPoints: ["avoidance_pattern"],
    category: "unconscious_preference",
    minSurpriseScore: 0.5,
    generate(data) {
      const avoidance = findPatterns(data.patterns, "avoidance");
      if (avoidance.length === 0) return null;

      const strongest = avoidance.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      const category = (strongest.metadata.category as string) ?? "特定の領域";
      const type = strongest.metadata.type as string;

      if (type === "dismissive") {
        return `「${category}」に関する質問に対して、回答速度が異常に速い。考えるまでもなく答えを決めている。それは確信ではなく、向き合わないための速度だとデータは示している。`;
      }
      return `「${category}」に関する質問を、あなたは一貫して避けている。自分では意識していないが、この領域にはあなたがまだ言語化できていない何かがある。`;
    },
  },

  // ── 5. 躊躇の地図 ──
  {
    id: "hesitation_map",
    requiredDataPoints: ["hesitation_pattern"],
    category: "decision_pattern",
    minSurpriseScore: 0.4,
    generate(data) {
      const hesitations = findPatterns(data.patterns, "hesitation");
      if (hesitations.length === 0) return null;

      const top = hesitations
        .filter((h) => h.axisId)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 2);

      if (top.length === 0) return null;

      if (top.length >= 2) {
        const labelA = axisLabel(top[0].axisId!);
        const labelB = axisLabel(top[1].axisId!);
        const ratioA = Math.round((top[0].metadata.ratio as number) ?? 2);
        const ratioB = Math.round((top[1].metadata.ratio as number) ?? 2);
        return `「${labelA}」と「${labelB}」——この2つの質問で、あなたは他の何倍も長く悩む。${ratioA}倍と${ratioB}倍。ここにあなたの未決着の内面がある。`;
      }

      const label = axisLabel(top[0].axisId!);
      const ratio = Math.round((top[0].metadata.ratio as number) ?? 2);
      return `「${label}」の質問で、回答時間が平均の${ratio}倍。ここだけ、判断の歯車が止まる。あなたにとってこの領域は「答えがない問い」に近い。`;
    },
  },

  // ── 6. 周期的な自己変動 ──
  {
    id: "emotional_cycle_discovery",
    requiredDataPoints: ["cycle_pattern", "axis_scores"],
    category: "emotional_cycle",
    minSurpriseScore: 0.5,
    generate(data) {
      const cycles = findPatterns(data.patterns, "cycle");
      if (cycles.length === 0) return null;

      const strongest = cycles.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      if (!strongest.axisId) return null;

      const days = (strongest.metadata.cycleDays as number) ?? 7;
      const ac = (strongest.metadata.autocorrelation as number) ?? 0.5;
      const label = axisLabel(strongest.axisId);
      const reliability = Math.round(ac * 100);

      return `「${label}」が約${days}日周期で波打っている。${reliability}%の再現性で、あなたの内面はこのリズムを刻んでいる。自分では「気分のムラ」と片付けていることに、実は法則がある。`;
    },
  },

  // ── 7. 慎重さと大胆さの使い分け ──
  {
    id: "cautious_bold_split",
    requiredDataPoints: ["axis_scores", "time_of_day_pattern"],
    category: "decision_pattern",
    minSurpriseScore: 0.4,
    generate(data) {
      const cautiousScore = data.axisScores["cautious_vs_bold"];
      if (cautiousScore === undefined) return null;

      const tod = findPatterns(data.patterns, "time_of_day").filter(
        (p) => p.axisId === "cautious_vs_bold",
      );
      if (tod.length === 0) return null;

      const deviation = tod[0].metadata.deviation as number;
      const period = TIME_LABELS[(tod[0].metadata.timePeriod as string)] ?? "ある時間帯";
      const baseDirection = cautiousScore < 0 ? "慎重" : "大胆";
      const shiftDirection = deviation > 0 ? "大胆" : "慎重";

      if (baseDirection !== shiftDirection) {
        return `普段は${baseDirection}な判断をする人。だが${period}になると${shiftDirection}に振れる。このスイッチは無意識に起きている。あなたの判断基準は、時計の針に影響されている。`;
      }
      return null;
    },
  },

  // ── 8. 内向/外向の隠れた層 ──
  {
    id: "introvert_extrovert_hidden_layer",
    requiredDataPoints: ["axis_scores", "behavioral_blind_pattern"],
    category: "self_image_gap",
    minSurpriseScore: 0.5,
    generate(data) {
      const ieScore = data.axisScores["introvert_vs_extrovert"];
      if (ieScore === undefined) return null;

      const blinds = findPatterns(data.patterns, "behavioral_blind").filter(
        (p) => p.axisId === "introvert_vs_extrovert",
      );
      if (blinds.length === 0) return null;

      const selfLabel = ieScore < 0 ? "内向的" : "外向的";
      const hiddenLabel = ieScore < 0 ? "外向的" : "内向的";

      return `自分を「${selfLabel}」だと認識している。だが行動データには${hiddenLabel}な痕跡がある。回答に時間をかけながら一貫して${selfLabel}寄りを選ぶのは、「${selfLabel}でありたい」という意志が混ざっている可能性がある。`;
    },
  },

  // ── 9. ストレス下の変容 ──
  {
    id: "stress_transformation",
    requiredDataPoints: ["axis_scores"],
    category: "stress_response",
    minSurpriseScore: 0.4,
    generate(data) {
      const stressAxis = data.axisScores["stress_isolation_vs_social"];
      const emotionalReg = data.axisScores["emotional_regulation"];
      if (stressAxis === undefined || emotionalReg === undefined) return null;

      // Only interesting if these diverge
      if (!areOppositeDirections(stressAxis, emotionalReg)) return null;

      const stressStyle =
        stressAxis < 0 ? "一人で整理したい" : "人と一緒にいたい";
      const regStyle =
        emotionalReg < 0
          ? "感情の調整が難しいと感じている"
          : "感情をうまく調整できる";

      return `ストレス時に「${stressStyle}」タイプなのに、${regStyle}。この組み合わせは独特だ。一見矛盾しているが、あなたなりの生存戦略が隠れている。`;
    },
  },

  // ── 10. 価値観の優先順位マップ ──
  {
    id: "value_hierarchy_map",
    requiredDataPoints: ["axis_scores"],
    category: "value_hierarchy",
    minSurpriseScore: 0.3,
    generate(data) {
      // Find the 3 most extreme axis scores
      const entries = Object.entries(data.axisScores)
        .filter(([, v]) => Math.abs(v) > 0.3)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

      if (entries.length < 3) return null;

      const top3 = entries.slice(0, 3).map(([id, score]) => ({
        label: axisSideLabel(id, score),
        intensity: intensityWord(score),
      }));

      return `あなたの判断原理の優先順位が見えてきた。最も${top3[0].intensity}反応するのは「${top3[0].label}」、次に「${top3[1].label}」、そして「${top3[2].label}」。この3つが、あなたの意思決定の骨格を形成している。`;
    },
  },

  // ── 11. 計画性と即興性の葛藤 ──
  {
    id: "plan_spontaneous_conflict",
    requiredDataPoints: ["axis_scores", "contradiction_pattern"],
    category: "contradiction",
    minSurpriseScore: 0.5,
    generate(data) {
      const planScore = data.axisScores["plan_vs_spontaneous"];
      if (planScore === undefined) return null;

      const contradictions = findPatterns(data.patterns, "contradiction").filter(
        (p) => p.axisId === "plan_vs_spontaneous",
      );
      if (contradictions.length === 0) return null;

      const selfLabel = planScore < 0 ? "計画的" : "即興的";
      const hiddenLabel = planScore < 0 ? "即興的" : "計画的";

      return `「${selfLabel}な人間だ」と自分を定義している。しかし直感の回答はたびたび${hiddenLabel}な方向を指す。表の自分と、最初に反応する自分。どちらが本当の判断者なのか、データはまだ決着をつけていない。`;
    },
  },

  // ── 12. 関係性における距離感の法則 ──
  {
    id: "relational_distance_law",
    requiredDataPoints: ["axis_scores"],
    category: "social_behavior",
    minSurpriseScore: 0.4,
    generate(data) {
      const intimacy = data.axisScores["intimacy_pace"];
      const socialInit = data.axisScores["social_initiative"];
      const boundary = data.axisScores["boundary_awareness"];

      if (
        intimacy === undefined ||
        socialInit === undefined ||
        boundary === undefined
      )
        return null;

      // Interesting: fast intimacy but passive initiative
      if (intimacy > 0.2 && socialInit < -0.2) {
        return `距離を縮めるのは早い。でも自分からは動かない。相手が来てくれるのを待ちながら、来たら一気に距離を詰める。この非対称な接近パターンに、あなたの関係性の核がある。`;
      }

      // Interesting: slow intimacy but high initiative
      if (intimacy < -0.2 && socialInit > 0.2) {
        return `自分から積極的に関わりにいくのに、距離はゆっくり縮める。アクセルとブレーキを同時に踏んでいるように見えるが、これはあなたの「安全に冒険する」戦略だ。`;
      }

      // Strong boundary + high reassurance need
      if (boundary > 0.3 && (data.axisScores["reassurance_need"] ?? 0) > 0.3) {
        return `境界線をしっかり引く人なのに、安心確認を必要としている。「近づきすぎないで。でもそこにいて」——この矛盾した要求こそ、あなたの関係性の本音。`;
      }

      return null;
    },
  },

  // ── 13. 週中の判断疲れ ──
  {
    id: "midweek_judgment_fatigue",
    requiredDataPoints: ["weekday_pattern", "hesitation_pattern"],
    category: "time_pattern",
    minSurpriseScore: 0.4,
    generate(data) {
      const weekday = findPatterns(data.patterns, "weekday");
      const hesitation = findPatterns(data.patterns, "hesitation");

      // Look for Wednesday/Thursday patterns
      const midweek = weekday.filter((p) => {
        const dow = p.metadata.dayOfWeek as number;
        return dow === 3 || dow === 4; // Wed, Thu
      });

      if (midweek.length === 0 || hesitation.length === 0) return null;

      const dayName = (midweek[0].metadata.dayName as string) ?? "週の真ん中";

      return `${dayName}に判断のブレが大きくなる。同時に応答時間も長くなる傾向がある。一週間の判断エネルギーが、この日に底をつくパターンが見える。本人は「集中力の問題」と思っているかもしれないが、もっと深いリズムの問題だ。`;
    },
  },

  // ── 14. 表と裏のギャップ ──
  {
    id: "public_private_divergence",
    requiredDataPoints: ["axis_scores"],
    category: "self_image_gap",
    minSurpriseScore: 0.5,
    generate(data) {
      const gap = data.axisScores["public_private_gap"];
      const directDiplomatic = data.axisScores["direct_vs_diplomatic"];

      if (gap === undefined || directDiplomatic === undefined) return null;

      // High gap + diplomatic = interesting pattern
      if (gap > 0.3 && directDiplomatic > 0.3) {
        return `表と裏にギャップがあり、かつ外交的。周囲には穏やかな印象を与えているが、内面には表に出していない判断基準がある。「本当はこう思っている」を隠すのが上手すぎて、自分でもどちらが本音か分からなくなることがある。`;
      }

      // High gap + direct = different interesting pattern
      if (gap > 0.3 && directDiplomatic < -0.3) {
        return `率直に見えて、実は表裏がある。言いたいことを言っているように見せながら、核心は隠している。「本音を言う人」というペルソナの裏に、もう1つの顔がある。`;
      }

      return null;
    },
  },

  // ── 15. 感情の変動性と安定志向の矛盾 ──
  {
    id: "emotional_stability_paradox",
    requiredDataPoints: ["axis_scores", "cycle_pattern"],
    category: "emotional_cycle",
    minSurpriseScore: 0.5,
    generate(data) {
      const emotVar = data.axisScores["emotional_variability"];
      const changeScore = data.axisScores["change_embrace_vs_resist"];
      const cycles = findPatterns(data.patterns, "cycle");

      if (emotVar === undefined || changeScore === undefined) return null;

      // Emotionally variable but resists change
      if (emotVar > 0.3 && changeScore > 0.3) {
        const hasCycle = cycles.length > 0;
        const cycleInfo = hasCycle
          ? `実際、約${(cycles[0].metadata.cycleDays as number) ?? 7}日周期の感情変動が検出されている。`
          : "";

        return `感情は状況で変わりやすいのに、安定を求めている。${cycleInfo}嵐のような内面を持ちながら、港を探し続けている——それがあなたの基本パターンだ。`;
      }

      // Emotionally stable but embraces change
      if (emotVar < -0.3 && changeScore < -0.3) {
        return `感情は安定しているのに、変化を積極的に受け入れる。周囲が不安になるような変化の中でも、あなたの内面は凪いでいる。これは稀有な組み合わせだ。`;
      }

      return null;
    },
  },

  // ── 16. 完璧主義の代償 ──
  {
    id: "perfectionism_cost",
    requiredDataPoints: ["axis_scores", "hesitation_pattern"],
    category: "decision_pattern",
    minSurpriseScore: 0.4,
    generate(data) {
      const perfScore = data.axisScores["perfectionist_vs_pragmatic"];
      if (perfScore === undefined || perfScore > -0.3) return null; // Only for perfectionists

      const hesitations = highConfidencePatterns(
        findPatterns(data.patterns, "hesitation"),
      );
      if (hesitations.length === 0) return null;

      const avgRatio =
        hesitations.reduce(
          (sum, h) => sum + ((h.metadata.ratio as number) ?? 2),
          0,
        ) / hesitations.length;

      return `完成度重視の傾向がある。それに呼応するように、判断に平均の${Math.round(avgRatio)}倍の時間をかける領域がある。完璧を目指すことの代償が、回答速度に刻まれている。妥協できないのではなく、「正解」を探し続けている。`;
    },
  },

  // ── 17. 独立と調和の使い分け ──
  {
    id: "independence_harmony_context",
    requiredDataPoints: ["axis_scores", "time_of_day_pattern"],
    category: "social_behavior",
    minSurpriseScore: 0.4,
    generate(data) {
      const indHarmony = data.axisScores["independence_vs_harmony"];
      if (indHarmony === undefined) return null;

      const tod = findPatterns(data.patterns, "time_of_day").filter(
        (p) => p.axisId === "independence_vs_harmony",
      );
      if (tod.length === 0) return null;

      const period = TIME_LABELS[(tod[0].metadata.timePeriod as string)] ?? "ある時間帯";
      const deviation = tod[0].metadata.deviation as number;
      const baseLabel = indHarmony < 0 ? "独立志向" : "調和志向";
      const shiftLabel = deviation > 0 ? "調和" : "独立";

      return `基本的に${baseLabel}。だが${period}になると${shiftLabel}の方向に揺れる。社会的なエネルギーの残量が、あなたの「独立↔調和」のバランスを動かしている。`;
    },
  },

  // ── 18. 質 vs 量の無意識な選択 ──
  {
    id: "quality_quantity_unconscious",
    requiredDataPoints: ["axis_scores", "avoidance_pattern"],
    category: "unconscious_preference",
    minSurpriseScore: 0.4,
    generate(data) {
      const qqScore = data.axisScores["quality_vs_quantity"];
      if (qqScore === undefined) return null;

      const avoidance = findPatterns(data.patterns, "avoidance");
      if (avoidance.length === 0) return null;

      const selfLabel = qqScore < 0 ? "質を深く追求する" : "広がりを求める";

      return `「${selfLabel}」タイプでありながら、特定の領域を回避している。深く追求するはずの人が避けている場所——そこにこそ、まだ掘り下げていない自分がいる可能性がある。`;
    },
  },

  // ── 19. セッション進行による変化 ──
  {
    id: "session_progression_shift",
    requiredDataPoints: ["axis_scores"],
    category: "growth_trajectory",
    minSurpriseScore: 0.3,
    generate(data) {
      if (data.sessionNumber < 3) return null;

      // Find axes with high extremity
      const extreme = Object.entries(data.axisScores)
        .filter(([, v]) => Math.abs(v) > 0.6)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

      if (extreme.length === 0) return null;

      const [topId, topScore] = extreme[0];
      const label = axisSideLabel(topId, topScore);
      const sessions = data.sessionNumber;

      return `${sessions}回のセッションを通じて、「${label}」への確信が特に強い。他の軸は揺れているのに、ここだけは動かない。あなたのアイデンティティの錨がここにある。`;
    },
  },

  // ── 20. 行動的盲点の発見 ──
  {
    id: "behavioral_blind_spot_discovery",
    requiredDataPoints: ["behavioral_blind_pattern", "axis_scores"],
    category: "self_image_gap",
    minSurpriseScore: 0.6,
    generate(data) {
      const blinds = highConfidencePatterns(
        findPatterns(data.patterns, "behavioral_blind"),
      );
      if (blinds.length === 0) return null;

      const strongest = blinds.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
      if (!strongest.axisId) return null;

      const label = axisLabel(strongest.axisId);
      const score = data.axisScores[strongest.axisId as TraitAxisKey];
      if (score === undefined) return null;

      const selfLabel = axisSideLabel(strongest.axisId, score);
      const responseMs = (strongest.metadata.meanResponseTimeMs as number) ?? 0;
      const overallMs = (strongest.metadata.overallMeanMs as number) ?? 1;
      const ratio = responseMs > 0 && overallMs > 0
        ? Math.round(responseMs / overallMs * 10) / 10
        : null;

      const ratioText = ratio ? `回答時間は平均の${ratio}倍。` : "";

      return `「${label}」で「${selfLabel}」を一貫して選んでいる。${ratioText}しかしその確信的な回答の裏に、迷いのシグナルがある。「${selfLabel}でありたい」と「本当の自分」の間に、まだ埋まっていない溝がある。`;
    },
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Templates 21-25: Deep Analysis Module Integration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 21. ストレス応答カスケード
  {
    id: "stress_cascade_first_break",
    requiredDataPoints: ["axis_scores"],
    category: "stress_response" as InsightCategory,
    minSurpriseScore: 0.3,
    generate: (data) => {
      const scores = data.axisScores;
      const emotionalVar = scores["emotional_variability"] ?? 0;
      const regulation = scores["emotional_regulation"] ?? 0;
      if (Math.abs(emotionalVar) < 0.2 && Math.abs(regulation) < 0.2) return null;

      if (regulation < -0.3) {
        return `ストレスが高まると、まず感情の制御が揺らぎ始める。これがあなたの「最初のひび割れ」。ただし、この脆さは繊細さの裏返しでもある——良い環境では、この感受性が最大の武器になる。`;
      }
      if (emotionalVar > 0.3 && regulation > 0.2) {
        return `感情の振幅が大きいのに、調整力も高い。このバランスはストレス下で独特の強さを発揮する——「揺れるけど折れない」タイプ。しかし長期ストレスには注意。調整力にも限界がある。`;
      }
      return null;
    },
  },

  // 22. ユニークな強み
  {
    id: "unique_strength_combination",
    requiredDataPoints: ["axis_scores"],
    category: "unconscious_preference" as InsightCategory,
    minSurpriseScore: 0.3,
    generate: (data) => {
      const scores = data.axisScores;
      const analytical = scores["analytical_vs_intuitive"] ?? 0;
      const bold = scores["cautious_vs_bold"] ?? 0;

      if (analytical < -0.3 && bold > 0.3) {
        return `分析的でありながら大胆——「理性的冒険者」の素質がある。データで裏付けた上で迷わず飛び込める。この組み合わせは稀有で、あなただけの超能力と言える。`;
      }

      const introvert = scores["introvert_vs_extrovert"] ?? 0;
      const socialInit = scores["social_initiative"] ?? 0;
      if (introvert < -0.3 && socialInit > 0.2) {
        return `内向的なのに人を引きつける——「深海の灯台」型。静かな存在感で場を安定させる力がある。カリスマ内向型というレアな組み合わせを持っている。`;
      }
      return null;
    },
  },

  // 23. 対人影響パターン
  {
    id: "relational_first_impression_gap",
    requiredDataPoints: ["axis_scores"],
    category: "social_behavior" as InsightCategory,
    minSurpriseScore: 0.3,
    generate: (data) => {
      const scores = data.axisScores;
      const publicPrivate = scores["public_private_gap"] ?? 0;

      if (Math.abs(publicPrivate) > 0.3) {
        const firstImpression = publicPrivate > 0
          ? "オープンで社交的"
          : "静かで控えめ";
        const deepImpression = publicPrivate > 0
          ? "思慮深さや内面の葛藤"
          : "情熱的な一面やユーモア";
        return `第一印象は「${firstImpression}」。でも深く知ると「${deepImpression}」が見えてくる。この二面性は、関係が深まるほど相手を引きつける力になる。`;
      }
      return null;
    },
  },

  // 24. 暗黙の価値観
  {
    id: "implicit_value_conflict",
    requiredDataPoints: ["axis_scores"],
    category: "value_hierarchy" as InsightCategory,
    minSurpriseScore: 0.3,
    generate: (data) => {
      const scores = data.axisScores;
      const boundary = scores["boundary_awareness"] ?? 0;
      const bold = scores["cautious_vs_bold"] ?? 0;
      const independence = scores["independence_vs_harmony"] ?? 0;

      if (bold > 0.3 && boundary > 0.3) {
        return `あなたの中で「自由」と「安全」が拮抗している。大胆に動きたい衝動と、境界線を守りたい欲求。この緊張は弱さではなく、両方を大切にしている証拠。統合の鍵は「安全な冒険」を設計すること。`;
      }

      if (independence < -0.3 && boundary > 0.2) {
        return `「繋がり」を求めながらも「自律」を手放したくない。この一見矛盾する価値観は、実は「対等な関係を望んでいる」という一貫した原則から来ている。`;
      }
      return null;
    },
  },

  // 25. 変化の軌跡パターン
  {
    id: "evolution_oscillation_signal",
    requiredDataPoints: ["axis_scores"],
    category: "growth_trajectory" as InsightCategory,
    minSurpriseScore: 0.25,
    generate: (data) => {
      if (data.sessionNumber < 5) return null;

      const scores = data.axisScores;
      const axes = Object.entries(scores);
      const extremeAxes = axes.filter(([, s]) => Math.abs(s) > 0.5);
      const neutralAxes = axes.filter(([, s]) => Math.abs(s) < 0.15);

      if (extremeAxes.length >= 3 && neutralAxes.length >= 2) {
        return `${data.sessionNumber}回の観測を経て、はっきり定まった軸と、まだ揺れている軸が見えてきた。定まった部分はあなたの「核」——揺れている部分は「今まさに探索中」の領域。どちらも大切な自分。`;
      }
      return null;
    },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Engine: テンプレートからインサイトを生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全テンプレートを走査し、データ条件を満たすものからインサイトを生成する。
 * surpriseScore が閾値以上かつ、過去に表示していないものだけ返す。
 */
export function generateInsightsFromTemplates(
  data: InsightData,
  maxResults: number = 5,
): GeneratedInsight[] {
  const results: GeneratedInsight[] = [];

  for (const template of INSIGHT_TEMPLATES) {
    // Skip already shown
    if (data.previousInsightIds.includes(template.id)) continue;

    const text = template.generate(data);
    if (!text) continue;

    // Calculate a basic surprise score based on pattern confidence + axis extremity
    const relevantPatterns = data.patterns.filter((p) =>
      template.requiredDataPoints.some(
        (dp) =>
          dp.replace("_pattern", "") === p.patternType ||
          dp === "axis_scores",
      ),
    );

    const patternConfidence =
      relevantPatterns.length > 0
        ? relevantPatterns.reduce((s, p) => s + p.confidence, 0) /
          relevantPatterns.length
        : 0.3;

    const surpriseScore = Math.min(1, patternConfidence * 1.2);

    if (surpriseScore < template.minSurpriseScore) continue;

    results.push({
      id: template.id,
      text,
      category: template.category,
      surpriseScore,
      requiredDataPoints: template.requiredDataPoints,
      templateId: template.id,
    });
  }

  // Sort by surprise score descending
  results.sort((a, b) => b.surpriseScore - a.surpriseScore);

  return results.slice(0, maxResults);
}
