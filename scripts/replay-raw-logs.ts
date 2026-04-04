/**
 * Replay 生ログ — 要約なし、全フィールドを展開出力
 *
 * 実行: npx tsx scripts/replay-raw-logs.ts
 */

import {
  runProactiveEngine,
  DEFAULT_GATES,
  extractCurrentTopics,
  canAssumeContinuity,
  selectRelevantCausalLinks,
  computeStanceVector,
  buildEmbeddedSensor,
  buildProactivePromptBlock,
  getExpressionRules,
  type ProactiveEngineGates,
  type CausalLink,
  type CurrentTopicContext,
} from "../lib/stargazer/proactiveUnderstanding";
import {
  detectImplicitSignals,
  accumulateImplicitSignals,
  promoteToMicroInsight,
  type ImplicitSignal,
} from "../lib/stargazer/miConvergenceEngine";
import {
  analyzeQueryContext,
  extractRelationalLens,
  selectResponseModeWithReason,
  extractInputUnderstanding,
  buildJudgmentSkeleton,
  buildSkeletonPromptBlock,
  buildJudgmentFramework,
} from "../lib/stargazer/alterHomeAdapter";
import type { TraitAxisKey } from "../lib/stargazer/traitAxes";

const J = (v: unknown) => JSON.stringify(v, null, 2);
const SEP = "═".repeat(80);
const SUB = "─".repeat(80);

const CAUSAL_LINKS: CausalLink[] = [
  {
    id: "link-1", user_id: "u1",
    source_fact: "判断テンポが遅い", target_axis: "cautious_vs_bold" as TraitAxisKey,
    confidence: 0.75, origin: "observed", evidence_count: 3, contradiction_count: 0,
    last_confirmed_at: "2026-04-01", created_at: "2026-03-01", updated_at: "2026-04-01",
  },
  {
    id: "link-2", user_id: "u1",
    source_fact: "感情的になりやすい", target_axis: "emotional_regulation" as TraitAxisKey,
    confidence: 0.4, origin: "observed", evidence_count: 1, contradiction_count: 1,
    last_confirmed_at: "2026-04-01", created_at: "2026-03-15", updated_at: "2026-04-01",
  },
  {
    id: "link-3", user_id: "u1",
    source_fact: "親密さに慎重", target_axis: "intimacy_pace" as TraitAxisKey,
    confidence: 0.65, origin: "archetype_prior" as const, evidence_count: 0, contradiction_count: 0,
    last_confirmed_at: "2026-04-01", created_at: "2026-03-01", updated_at: "2026-04-01",
  },
];

const PERSONALITY = {
  archetypeName: "慎重な探索者",
  archetypeDescription: "石橋を叩いて渡る",
  coreWoundShort: "見捨てられ不安",
  axisScores: {
    cautious_vs_bold: 0.3,
    analytical_vs_intuitive: 0.6,
    intimacy_pace: 0.2,
    emotional_regulation: 0.4,
    decision_tempo: 0.3,
    social_initiative: 0.7,
    rumination_tendency: 0.7,
  },
} as any;

const BASE_ENGINE = {
  sessions_completed: 5,
  continuous_trust: 3,
  axisScores: PERSONALITY.axisScores as Partial<Record<TraitAxisKey, number>>,
  lifeContextEntries: [],
  trustEvents: [],
  contextualAccess: [],
  consent: [],
  causalLinks: CAUSAL_LINKS,
  probesThisSession: 0,
  lastProbeTimestamp: null,
  currentSessionIndex: 5,
  sessionOfLastConsent: 0,
  frustrationLevel: 0,
  personality: { boldScore: 0.3, socialScore: 0.5 },
  mood: "neutral" as const,
};

// ================================================================
// A. continuity 採用 / 拒否 — 生ログ
// ================================================================
console.log(SEP);
console.log("A. continuity 採用 / 拒否 — 全リンク × 全条件の判定結果");
console.log(SEP);

const CONTINUITY_SCENARIOS = [
  {
    label: "キャリア相談（ドメイン一致・連続発話）",
    message: "転職するか迷ってる。キャリアが不安",
    recentUser: ["仕事がつらい", "上司と合わない"],
    domain: "career" as const,
  },
  {
    label: "恋愛転換（ドメイン不一致）",
    message: "彼女と最近うまくいかない",
    recentUser: ["仕事がつらい", "上司と合わない"],
    domain: "relationship" as const,
  },
  {
    label: "曖昧（ドメイン検出不能）",
    message: "なんかモヤモヤする",
    recentUser: [],
    domain: null,
  },
];

for (const sc of CONTINUITY_SCENARIOS) {
  console.log(`\n${SUB}`);
  console.log(`シナリオ: ${sc.label}`);
  console.log(`message: "${sc.message}"`);
  console.log(`recentUser: ${J(sc.recentUser)}`);

  const ctx = extractCurrentTopics(sc.message, sc.recentUser, BASE_ENGINE.axisScores);
  console.log(`\nextractCurrentTopics 結果:`);
  console.log(`  topics: ${J(ctx.topics)}`);
  console.log(`  active_domains: ${J(ctx.active_domains)}`);
  console.log(`  active_axes: ${J(ctx.active_axes)}`);
  console.log(`  extraction_confidence: ${ctx.extraction_confidence}`);

  console.log(`\nリンク別 canAssumeContinuity 判定:`);
  for (const link of CAUSAL_LINKS) {
    const result = canAssumeContinuity(link, [], ctx);
    console.log(`  link="${link.source_fact}" axis=${link.target_axis} conf=${link.confidence} origin=${link.origin}`);
    console.log(`    → ${result ? "✓ ADOPTED" : "✗ REJECTED"}`);
    if (!result) {
      // 条件別判定
      const reasons: string[] = [];
      if (ctx.extraction_confidence < 0.3) reasons.push("extraction_confidence < 0.3");
      if (link.confidence < 0.6) reasons.push(`link.confidence ${link.confidence} < 0.6`);
      if (link.origin === "archetype_prior" && link.confidence < 0.8) reasons.push(`archetype_prior かつ confidence ${link.confidence} < 0.8`);
      // contextual relevance は関数内部なので外から近似
      const { active_axes, active_domains } = ctx;
      const domainAxes: Record<string, string[]> = {
        career: ["analytical_vs_intuitive", "perfectionist_vs_pragmatic", "plan_vs_spontaneous", "locus_of_control"],
        relationship: ["intimacy_pace", "boundary_awareness", "attachment_style", "relationship_mode_split", "conflict_style"],
      };
      let relevant = active_axes.includes(link.target_axis as TraitAxisKey);
      if (!relevant) {
        for (const d of active_domains) {
          if (domainAxes[d]?.includes(link.target_axis)) { relevant = true; break; }
        }
      }
      if (!relevant) reasons.push(`contextually_irrelevant (target=${link.target_axis} not in axes/domains)`);
      console.log(`    拒否理由: [${reasons.join(", ")}]`);
    }
  }

  const withFilter = selectRelevantCausalLinks(CAUSAL_LINKS, ["judgment"], sc.domain, 5, { consent: [], context: ctx });
  const noFilter = selectRelevantCausalLinks(CAUSAL_LINKS, ["judgment"], sc.domain, 5);
  console.log(`\nselectRelevantCausalLinks:`);
  console.log(`  フィルタなし: ${noFilter.length}本 [${noFilter.map(l => l.target_axis).join(", ")}]`);
  console.log(`  フィルタあり: ${withFilter.length}本 [${withFilter.map(l => l.target_axis).join(", ")}]`);
}

// ================================================================
// B. EmbeddedSensor 注入 / 抑制 — 生ログ
// ================================================================
console.log(`\n\n${SEP}`);
console.log("B. EmbeddedSensor 注入 / 抑制 — 全パラメータ展開");
console.log(SEP);

const SENSOR_SCENARIOS = [
  { label: "通常相談", emotional: 0.3, direct: false, axes: ["cautious_vs_bold" as TraitAxisKey] },
  { label: "感情高負荷", emotional: 0.85, direct: false, axes: ["cautious_vs_bold" as TraitAxisKey] },
  { label: "直答要求", emotional: 0.2, direct: true, axes: ["cautious_vs_bold" as TraitAxisKey] },
  { label: "文脈外軸", emotional: 0.3, direct: false, axes: ["intimacy_pace" as TraitAxisKey] },
  { label: "probe なし", emotional: 0.3, direct: false, axes: ["cautious_vs_bold" as TraitAxisKey], noProbe: true },
];

const STANCE = computeStanceVector(1, { boldScore: 0.3, socialScore: 0.5 }, 0.5, "neutral");
console.log(`\nStanceVector (phase=1, bold=0.3, social=0.5, domainTrust=0.5, mood=neutral):`);
console.log(`  ${J(STANCE)}`);

const BLOCKED_PROBE = {
  prediction: "慎重寄り",
  prediction_basis: "cautious_vs_bold: 0.30",
  probe: "大きな決断ではどうしてる？",
  probe_type: "prediction_led" as const,
  scope: "utterance_local" as const,
  target_category: "judgment" as const,
  target_domain: "daily",
  target_subdomain: "identity/values" as const,
  causal_connection: "cautious_vs_bold → judgment",
  trust_cost: 1.0,
  requires_consent: false,
  skip_safe: false,
};

for (const sc of SENSOR_SCENARIOS) {
  console.log(`\n${SUB}`);
  console.log(`シナリオ: ${sc.label}`);
  console.log(`  emotionalTemperature: ${sc.emotional}`);
  console.log(`  isDirectAnswerContext: ${sc.direct}`);
  console.log(`  activeAxes: ${J(sc.axes)}`);
  console.log(`  blockedProbe: ${(sc as any).noProbe ? "null" : BLOCKED_PROBE.causal_connection}`);

  const sensor = buildEmbeddedSensor({
    stance: STANCE,
    blockedProbe: (sc as any).noProbe ? null : BLOCKED_PROBE,
    phase: 1,
    activeAxes: sc.axes,
    emotionalTemperature: sc.emotional,
    isDirectAnswerContext: sc.direct,
  });

  console.log(`\n  結果: ${sensor ? J(sensor) : "null"}`);
  if (!sensor) {
    if ((sc as any).noProbe) console.log(`  理由: blockedProbe が null（候補なし）`);
    else if (sc.emotional > 0.7) console.log(`  理由: emotionalTemperature ${sc.emotional} > 0.7 → 感情高負荷抑制`);
    else if (sc.direct) console.log(`  理由: isDirectAnswerContext = true → 直答要求抑制`);
    else if (!sc.axes.includes("cautious_vs_bold" as TraitAxisKey)) console.log(`  理由: target_axis "cautious_vs_bold" が activeAxes ${J(sc.axes)} に含まれない → 文脈外抑制`);
    else console.log(`  理由: 不明`);
  }
}

// sensor 注入時の prompt block 生出力
console.log(`\n${SUB}`);
console.log("EmbeddedSensor 注入時の prompt block（生テキスト）:");
const sensorForPrompt = buildEmbeddedSensor({
  stance: STANCE,
  blockedProbe: BLOCKED_PROBE,
  phase: 1,
  activeAxes: ["cautious_vs_bold" as TraitAxisKey],
  emotionalTemperature: 0.3,
  isDirectAnswerContext: false,
});
if (sensorForPrompt) {
  const promptBlock = buildProactivePromptBlock({
    phase: 1,
    gap: { weakest_category: "judgment", weakest_confidence: 0.3, weakest_quality_axis: "user_stated_ratio", second_weakest_category: null, second_weakest_confidence: null },
    probe: null,
    relevantLinks: [],
    expressionRules: getExpressionRules(1),
    gates: { ...DEFAULT_GATES, embedded_sensor_enabled: true },
    currentMessage: "リスクが怖くて転職を踏み出せない",
    consent: [],
    embeddedSensor: sensorForPrompt,
  });
  console.log(promptBlock);
}

// ================================================================
// C. ImplicitSignal 昇格 — 生ログ
// ================================================================
console.log(`\n\n${SEP}`);
console.log("C. ImplicitSignal 検出→蓄積→昇格 — 全ターン展開");
console.log(SEP);

const TURNS = [
  { msg: "うーん…どうだろうなぁ", prev: "キャリアの方向性はどう？", conflict: 0.8, emotional: 0.3, avgLen: 30 },
  { msg: "いや、そういうわけじゃないんだけど…", prev: "転職に前向きなの？", conflict: 0.75, emotional: 0.4, avgLen: 30 },
  { msg: "分からない…考えたくない", prev: "リスクについてどう感じてる？", conflict: 0.9, emotional: 0.6, avgLen: 30 },
  { msg: "そういえば最近料理にハマってるんだよね", prev: "判断の傾向について聞いてもいい？", conflict: 0.2, emotional: 0.1, avgLen: 30 },
  { msg: "やっぱり怖いんだよね。変わるのが。ずっとそう。小さい頃からそうだった。何かを選ぶってことは何かを捨てるってことで、捨てた先に何もなかったらどうしようって、いつも思う。それが嫌で動けない。", prev: "何が一番引っかかってる？", conflict: 0.5, emotional: 0.7, avgLen: 30 },
];

let accumulated: ImplicitSignal[] = [];

for (let i = 0; i < TURNS.length; i++) {
  const t = TURNS[i];
  console.log(`\n${SUB}`);
  console.log(`Turn ${i + 1}:`);
  console.log(`  user: "${t.msg}"`);
  console.log(`  prev: "${t.prev}"`);
  console.log(`  conflictIndicator: ${t.conflict}`);
  console.log(`  emotionalWeight: ${t.emotional}`);
  console.log(`  averageMessageLength: ${t.avgLen}`);
  console.log(`  message.length: ${t.msg.length}`);

  const signals = detectImplicitSignals({
    currentMessage: t.msg,
    previousMessage: t.prev,
    sessionId: `session-${i + 1}`,
    conflictIndicator: t.conflict,
    previousProbeAxis: "cautious_vs_bold" as TraitAxisKey,
    activeAxes: ["cautious_vs_bold" as TraitAxisKey],
    averageMessageLength: t.avgLen,
    emotionalWeight: t.emotional,
    primaryAxis: "cautious_vs_bold" as TraitAxisKey,
  });

  console.log(`\n  検出シグナル (${signals.length}件):`);
  for (const sig of signals) {
    console.log(`    type=${sig.type}, axis=${sig.related_axis}, conf=${sig.confidence.toFixed(2)}, session=${sig.session_id}`);
  }

  accumulated = accumulateImplicitSignals(accumulated, signals);
  console.log(`\n  蓄積合計: ${accumulated.length}件`);

  // type 別集計
  const byType = new Map<string, number>();
  for (const s of accumulated) {
    byType.set(`${s.related_axis}::${s.type}`, (byType.get(`${s.related_axis}::${s.type}`) ?? 0) + 1);
  }
  console.log(`  パターン集計:`);
  for (const [key, count] of byType) {
    console.log(`    ${key}: ${count}回 ${count >= 3 ? "← 昇格候補" : ""}`);
  }

  const promo = promoteToMicroInsight(accumulated);
  if (promo) {
    console.log(`\n  ★ 昇格発生:`);
    console.log(`    insight_text: "${promo.insight_text}"`);
    console.log(`    related_axis: ${promo.related_axis}`);
    console.log(`    signal_type: ${promo.signal_type}`);
    console.log(`    signal_count: ${promo.signal_count}`);
    console.log(`    confidence: ${promo.confidence}`);
    console.log(`    origin: ${promo.origin}`);
  }
}

// ================================================================
// D. direct answer 品質 — 生ログ
// ================================================================
console.log(`\n\n${SEP}`);
console.log("D. direct answer 品質 — mode + skeleton + stance 全展開");
console.log(SEP);

const DIRECT_SCENARIOS = [
  "もう疲れた。何もかも嫌になってきた",
  "端的に教えて。転職すべき？",
  "彼氏が最近冷たい。私のこと嫌いになったのかな",
  "親に本音を言えたことがない。怖い",
  "自分って本当にダメだなって思う。何やっても中途半端",
  "転職するか迷ってる。今の会社は悪くないけど、もやもやする",
  "友達が約束をすぐ忘れる。もう距離を置くべき？",
];

for (const msg of DIRECT_SCENARIOS) {
  console.log(`\n${SUB}`);
  console.log(`input: "${msg}"`);

  const qc = analyzeQueryContext(msg);
  const lens = extractRelationalLens(msg);
  const mode = selectResponseModeWithReason(qc, lens);
  const iu = extractInputUnderstanding(msg, qc, lens);
  const fw = buildJudgmentFramework(PERSONALITY, null, msg);
  const sk = buildJudgmentSkeleton(fw, qc, lens, iu, mode.mode);
  const skBlock = buildSkeletonPromptBlock(sk);
  const stance = computeStanceVector(0, { boldScore: 0.3, socialScore: 0.5 }, 0, "neutral");

  console.log(`\n  queryContext.domain: ${qc.domain}`);
  console.log(`  queryContext.questionType: ${qc.questionType}`);
  console.log(`  lens.involves_other: ${lens.involves_other}`);
  console.log(`  lens.target_role: ${lens.target_role}`);
  console.log(`  mode: ${mode.mode}`);
  console.log(`  modeReason: ${mode.reason}`);
  console.log(`  skeleton.confidence_level: ${sk.confidence_level}`);
  console.log(`  skeleton.action_shape: ${sk.action_shape}`);
  console.log(`  stance: assertion=${stance.assertion_intensity.toFixed(2)}, hedge=${stance.hedge_allowance.toFixed(2)}, boldness=${stance.assumption_boldness.toFixed(2)}`);
  console.log(`\n  skeletonBlock (先頭200文字):`);
  console.log(`  "${skBlock.slice(0, 200)}"`);
}
