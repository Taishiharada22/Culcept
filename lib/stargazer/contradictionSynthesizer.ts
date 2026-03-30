// lib/stargazer/contradictionSynthesizer.ts
// ═══════════════════════════════════════════════════════════════
// Contradiction Synthesizer — 横断矛盾統合器
// Stargazer × Origin × Presence × Style × Rendezvous を横断して
// 「自分って、そういう人間だったのか」の瞬間を生む矛盾を検出する
// ═══════════════════════════════════════════════════════════════

/**
 * Academic References & Theoretical Foundation:
 *
 * Cross-system contradiction detection is grounded in the insight that the
 * human self is not a unitary construct but a collection of subsystems that
 * can hold conflicting representations simultaneously. When these subsystems
 * are measured independently (e.g., self-report in Stargazer vs. behavioral
 * traces in Style vs. autobiographical memory in Origin), the contradictions
 * that emerge reveal the gap between explicit self-concept and implicit
 * behavioral patterns — which is where the deepest self-understanding lies.
 *
 * Core Theoretical Frameworks:
 *
 * - Festinger, L. (1957). A Theory of Cognitive Dissonance. Stanford
 *   University Press.
 *   When a person holds contradictory cognitions (e.g., "I am bold" but
 *   their behavioral history shows risk-avoidance), they experience
 *   dissonance that motivates either attitude change or rationalization.
 *   Cross-system contradictions surface these dissonances that the person
 *   has been rationalizing away, enabling conscious engagement with the gap.
 *
 * - Epstein, S. (1994). "Integration of the cognitive and the psychodynamic
 *   unconscious." American Psychologist, 49(8), 709-724.
 *   Cognitive-Experiential Self-Theory (CEST) posits two parallel processing
 *   systems: a rational (explicit, verbal, deliberative) system and an
 *   experiential (implicit, automatic, emotionally-driven) system. These
 *   systems can reach different conclusions about the same situation,
 *   producing systematic self-contradictions. Our cross-system detection
 *   maps to this dual-process architecture: Stargazer self-report taps the
 *   rational system, while Style behavioral patterns and Origin emotional
 *   memories tap the experiential system.
 *
 * - Kuhl, J. (2000). "A functional-design approach to motivation and
 *   self-regulation: The dynamics of personality systems interactions."
 *   In M. Boekaerts, P. R. Pintrich, & M. Zeidner (Eds.), Handbook of
 *   Self-Regulation (pp. 111-169). Academic Press.
 *   Personality Systems Interactions (PSI) theory describes four cognitive
 *   macro-systems (intention memory, extension memory, intuitive behavior
 *   control, object recognition) that can operate in conflict. Cross-system
 *   contradictions in our architecture parallel PSI's insight that different
 *   personality subsystems may pull a person in different directions,
 *   especially under stress or self-threat conditions.
 *
 * - Wilson, T. D. (2002). Strangers to Ourselves: Discovering the Adaptive
 *   Unconscious. Harvard University Press.
 *   Argued that there is an "adaptive unconscious" that operates by rules
 *   different from the conscious self-narrative. Cross-system comparisons
 *   (especially Origin memory vs. Stargazer self-report) can reveal these
 *   unconscious self-theories that the person cannot directly introspect upon.
 *
 * Detection Categories and Their Theoretical Basis:
 *   - self_vs_memory: Relates to narrative identity theory (McAdams, 2001) —
 *     how people reconstruct their past to fit their current self-concept.
 *   - self_vs_others: Relates to the "blind spot" in the Johari Window
 *     (Luft & Ingham, 1955) — traits others see but the self does not.
 *   - self_vs_behavior: The core Nisbett & Wilson (1977) finding — people
 *     often cannot accurately report what drives their behavior.
 *   - stated_vs_chosen: Dual-process dissociation (Kahneman, 2011) — the
 *     deliberative "stating" system vs. the intuitive "choosing" system.
 *   - context_shift: Personality coherence debate (Mischel & Shoda, 1995) —
 *     situational variability as a stable individual signature.
 *   - temporal_drift: Identity development (Erikson, 1968) — change over
 *     time that may be unconscious to the person experiencing it.
 */

import type { TraitAxisKey } from "./traitAxes";
import type { MemoryChapter, ChapterLayers } from "@/lib/origin/v7/types";
import type { EchoTrajectory } from "@/lib/origin/v7/echoTimeline";
import type { MatchingVector } from "@/lib/rendezvous/types";
import { convertToMatchingVector } from "./crossSystemBridge";

// ─── Types ───

export type ContradictionSource =
  | "stargazer"      // Stargazer軸内の矛盾
  | "origin"         // Origin記憶との矛盾
  | "presence"       // Presence他者評価との矛盾
  | "style"          // Style行動パターンとの矛盾
  | "rendezvous"     // Rendezvous回答との矛盾
  | "cross_system";  // 複数システム横断

export type ContradictionSeverity = "whisper" | "notable" | "profound";

export interface CrossSystemContradiction {
  id: string;
  /** 矛盾の核心を一文で */
  headline: string;
  /** 詳細な説明 */
  description: string;
  /** 関与するシステム */
  sources: ContradictionSource[];
  /** 関連するStargazer軸 */
  relatedAxes: TraitAxisKey[];
  /** 矛盾の深さ (0-1) */
  severity: ContradictionSeverity;
  severityScore: number;
  /** 自己発見のための問いかけ */
  reflectionPrompt: string;
  /** 検出カテゴリ */
  category: ContradictionCategory;
}

export type ContradictionCategory =
  | "self_vs_memory"       // 今の自分 vs 過去の記憶
  | "self_vs_others"       // 自己認識 vs 他者評価
  | "self_vs_behavior"     // 自己申告 vs 行動パターン
  | "stated_vs_chosen"     // 言葉 vs 選択
  | "context_shift"        // 文脈による人格変動
  | "temporal_drift";      // 時間経過による変化

// ─── Input data from each system ───

export interface SynthesizerInput {
  /** Stargazer 45軸スコア (-1 ~ +1) */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** Origin の記憶チャプター */
  originChapters?: MemoryChapter[];
  /** Origin のエコー軌跡 */
  originEchoes?: EchoTrajectory[];
  /** Presence の他者評価データ (軸名 → 他者から見たスコア) */
  presenceScores?: Partial<Record<TraitAxisKey, number>>;
  /** Style の行動ログサマリー */
  styleActions?: {
    likeCategories: string[];   // 「いいね」した服のカテゴリ
    dislikeCategories: string[];
    dominantStyle: string;      // "minimal" | "maximal" | etc.
    actionCount: number;
  };
  /** Rendezvous の MatchingVector (回答ベース) */
  rendezvousVector?: MatchingVector;
  /** 観測セッション数 */
  totalObservations: number;
}

// ─── Origin echo → axis mapping ───

const ECHO_AXIS_MAP: Record<string, { axis: TraitAxisKey; direction: number }[]> = {
  // 行動系エコー
  "単身で行動": [{ axis: "cautious_vs_bold", direction: 1 }, { axis: "independence_vs_harmony", direction: -1 }],
  "起業": [{ axis: "cautious_vs_bold", direction: 1 }, { axis: "social_initiative", direction: 1 }],
  "冒険": [{ axis: "cautious_vs_bold", direction: 1 }, { axis: "change_embrace_vs_resist", direction: -1 }],
  "挑戦": [{ axis: "cautious_vs_bold", direction: 1 }],
  "転職": [{ axis: "change_embrace_vs_resist", direction: -1 }, { axis: "cautious_vs_bold", direction: 0.5 }],
  "海外": [{ axis: "change_embrace_vs_resist", direction: -1 }, { axis: "tradition_vs_novelty", direction: 1 }],
  "独立": [{ axis: "independence_vs_harmony", direction: -1 }],
  // 対人系エコー
  "孤独": [{ axis: "introvert_vs_extrovert", direction: -1 }, { axis: "stress_isolation_vs_social", direction: -1 }],
  "信頼": [{ axis: "boundary_awareness", direction: -0.5 }, { axis: "intimacy_pace", direction: 0.5 }],
  "裏切り": [{ axis: "boundary_awareness", direction: 1 }, { axis: "intimacy_pace", direction: -1 }],
  "友情": [{ axis: "individual_vs_social", direction: 1 }, { axis: "friend_mode_fit", direction: 0.5 }],
  "対立": [{ axis: "direct_vs_diplomatic", direction: -0.5 }],
  "和解": [{ axis: "direct_vs_diplomatic", direction: 0.5 }, { axis: "emotional_regulation", direction: 0.5 }],
  // 感情系エコー
  "怒り": [{ axis: "emotional_regulation", direction: -0.5 }, { axis: "emotional_variability", direction: 0.5 }],
  "不安": [{ axis: "reassurance_need", direction: 0.5 }, { axis: "emotional_variability", direction: 0.5 }],
  "安心": [{ axis: "reassurance_need", direction: -0.5 }, { axis: "emotional_regulation", direction: 0.5 }],
  "我慢": [{ axis: "public_private_gap", direction: 0.5 }, { axis: "independence_vs_harmony", direction: 0.5 }],
  "自由": [{ axis: "independence_vs_harmony", direction: -1 }, { axis: "plan_vs_spontaneous", direction: 0.5 }],
  // 思考系エコー
  "完璧主義": [{ axis: "perfectionist_vs_pragmatic", direction: -1 }],
  "効率": [{ axis: "function_vs_expression", direction: -0.5 }, { axis: "analytical_vs_intuitive", direction: -0.5 }],
  "直感": [{ axis: "analytical_vs_intuitive", direction: 0.5 }],
  "分析": [{ axis: "analytical_vs_intuitive", direction: -0.5 }],
  "慎重": [{ axis: "cautious_vs_bold", direction: -1 }],
  "計画": [{ axis: "plan_vs_spontaneous", direction: -0.5 }],
};

// ─── Style → axis mapping ───

const STYLE_AXIS_MAP: Record<string, { axis: TraitAxisKey; direction: number }[]> = {
  minimal: [{ axis: "minimal_vs_maximal", direction: -1 }, { axis: "function_vs_expression", direction: -0.5 }],
  maximal: [{ axis: "minimal_vs_maximal", direction: 1 }, { axis: "function_vs_expression", direction: 0.5 }],
  classic: [{ axis: "classic_vs_trendy", direction: -1 }, { axis: "tradition_vs_novelty", direction: -0.5 }],
  trendy: [{ axis: "classic_vs_trendy", direction: 1 }, { axis: "tradition_vs_novelty", direction: 0.5 }],
  natural: [{ axis: "function_vs_expression", direction: -0.3 }],
  street: [{ axis: "cautious_vs_bold", direction: 0.3 }, { axis: "tradition_vs_novelty", direction: 0.5 }],
};

// ─── Rendezvous vector → axis reverse mapping ───

const RV_AXIS_MAP: {
  vectorKey: keyof MatchingVector;
  axes: { key: TraitAxisKey; weight: number; invert?: boolean }[];
}[] = [
  {
    vectorKey: "conversation_temperature",
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.5 },
      { key: "stress_isolation_vs_social", weight: 0.3 },
    ],
  },
  {
    vectorKey: "distance_need",
    axes: [
      { key: "intimacy_pace", weight: 0.4, invert: true },
      { key: "boundary_awareness", weight: 0.3 },
    ],
  },
  {
    vectorKey: "stability_need",
    axes: [
      { key: "change_embrace_vs_resist", weight: 0.4 },
      { key: "emotional_variability", weight: 0.3, invert: true },
    ],
  },
  {
    vectorKey: "emotional_openness",
    axes: [
      { key: "public_private_gap", weight: 0.4, invert: true },
      { key: "emotional_variability", weight: 0.2 },
    ],
  },
  {
    vectorKey: "conflict_directness",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.5, invert: true },
      { key: "independence_vs_harmony", weight: 0.3, invert: true },
    ],
  },
  {
    vectorKey: "social_energy",
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.4 },
      { key: "individual_vs_social", weight: 0.3 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// Core: synthesize()
// ═══════════════════════════════════════════════════════════════

export function synthesize(input: SynthesizerInput): CrossSystemContradiction[] {
  const contradictions: CrossSystemContradiction[] = [];
  let idCounter = 0;
  const nextId = () => `cs_${++idCounter}`;

  // ── 1. Origin記憶 × Stargazer軸 ──
  if (input.originChapters && input.originChapters.length > 0) {
    contradictions.push(...detectOriginContradictions(input, nextId));
  }

  // ── 2. Presence他者評価 × Stargazer自己認識 ──
  if (input.presenceScores && Object.keys(input.presenceScores).length > 0) {
    contradictions.push(...detectPresenceContradictions(input, nextId));
  }

  // ── 3. Style行動 × Stargazer自己申告 ──
  if (input.styleActions && input.styleActions.actionCount > 5) {
    contradictions.push(...detectStyleContradictions(input, nextId));
  }

  // ── 4. Rendezvous回答 × Stargazer軸 ──
  if (input.rendezvousVector) {
    contradictions.push(...detectRendezvousContradictions(input, nextId));
  }

  // ── 5. Origin エコー軌跡の変容パターン ──
  if (input.originEchoes && input.originEchoes.length > 0) {
    contradictions.push(...detectEchoTemporalDrift(input, nextId));
  }

  // severity順にソート
  return contradictions.sort((a, b) => b.severityScore - a.severityScore);
}

// ═══════════════════════════════════════════════════════════════
// Detector 1: Origin記憶 × Stargazer軸
// ═══════════════════════════════════════════════════════════════

function detectOriginContradictions(
  input: SynthesizerInput,
  nextId: () => string
): CrossSystemContradiction[] {
  const results: CrossSystemContradiction[] = [];
  const { axisScores, originChapters = [] } = input;

  // エコーからOriginが示唆する軸スコアを集計
  const originImpliedScores: Partial<Record<TraitAxisKey, { sum: number; count: number }>> = {};

  for (const chapter of originChapters) {
    for (const echo of chapter.echoes) {
      const echoLower = echo.toLowerCase();
      for (const [keyword, mappings] of Object.entries(ECHO_AXIS_MAP)) {
        if (echoLower.includes(keyword)) {
          for (const { axis, direction } of mappings) {
            if (!originImpliedScores[axis]) {
              originImpliedScores[axis] = { sum: 0, count: 0 };
            }
            originImpliedScores[axis]!.sum += direction;
            originImpliedScores[axis]!.count += 1;
          }
        }
      }
    }

    // ChapterLayersからも推定
    if (chapter.layers?.learnedPatterns) {
      const text = chapter.layers.learnedPatterns.toLowerCase();
      for (const [keyword, mappings] of Object.entries(ECHO_AXIS_MAP)) {
        if (text.includes(keyword)) {
          for (const { axis, direction } of mappings) {
            if (!originImpliedScores[axis]) {
              originImpliedScores[axis] = { sum: 0, count: 0 };
            }
            originImpliedScores[axis]!.sum += direction * 0.7; // layerは弱めの信号
            originImpliedScores[axis]!.count += 1;
          }
        }
      }
    }
  }

  // Stargazer軸との乖離を検出
  for (const [axisKey, implied] of Object.entries(originImpliedScores) as [TraitAxisKey, { sum: number; count: number }][]) {
    const stargazerScore = axisScores[axisKey];
    if (stargazerScore === undefined || implied.count < 2) continue;

    const originDirection = Math.sign(implied.sum / implied.count);
    const stargazerDirection = Math.sign(stargazerScore);

    // 方向が逆で、かつ両方ともある程度の強さがある場合
    if (originDirection !== 0 && stargazerDirection !== 0 && originDirection !== stargazerDirection) {
      const gap = Math.abs(stargazerScore - (implied.sum / implied.count));
      if (gap < 0.5) continue;

      const severityScore = Math.min(gap / 2, 1);
      const { headline, description, prompt } = generateOriginNarrative(
        axisKey, stargazerScore, implied.sum / implied.count, originChapters
      );

      results.push({
        id: nextId(),
        headline,
        description,
        sources: ["stargazer", "origin"],
        relatedAxes: [axisKey],
        severity: severityScore > 0.7 ? "profound" : severityScore > 0.4 ? "notable" : "whisper",
        severityScore,
        reflectionPrompt: prompt,
        category: "self_vs_memory",
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Detector 2: Presence他者評価 × Stargazer自己認識
// ═══════════════════════════════════════════════════════════════

function detectPresenceContradictions(
  input: SynthesizerInput,
  nextId: () => string
): CrossSystemContradiction[] {
  const results: CrossSystemContradiction[] = [];
  const { axisScores, presenceScores = {} } = input;

  const AXIS_LABELS: Partial<Record<TraitAxisKey, { low: string; high: string }>> = {
    introvert_vs_extrovert: { low: "内向的", high: "外向的" },
    cautious_vs_bold: { low: "慎重", high: "大胆" },
    emotional_regulation: { low: "感情的", high: "冷静" },
    direct_vs_diplomatic: { low: "率直", high: "外交的" },
    independence_vs_harmony: { low: "独立的", high: "調和的" },
    public_private_gap: { low: "表裏一致", high: "外と中が違う" },
    social_initiative: { low: "受動的", high: "主導的" },
  };

  for (const [axis, selfScore] of Object.entries(axisScores) as [TraitAxisKey, number][]) {
    const othersScore = presenceScores[axis];
    if (othersScore === undefined) continue;

    const gap = Math.abs(selfScore - othersScore);
    if (gap < 0.4) continue;

    const labels = AXIS_LABELS[axis];
    if (!labels) continue;

    const selfLabel = selfScore > 0 ? labels.high : labels.low;
    const othersLabel = othersScore > 0 ? labels.high : labels.low;

    if (selfLabel === othersLabel) continue;

    const severityScore = Math.min(gap / 2, 1);

    results.push({
      id: nextId(),
      headline: `自分は「${selfLabel}」と思っているが、他者は「${othersLabel}」と見ている`,
      description: `Stargazerの自己観測では${selfLabel}寄りだが、Presenceの他者評価では${othersLabel}と評価されている。この差は、あなたが無意識に見せている自分と、内面で感じている自分のギャップを示している。`,
      sources: ["stargazer", "presence"],
      relatedAxes: [axis],
      severity: severityScore > 0.7 ? "profound" : severityScore > 0.4 ? "notable" : "whisper",
      severityScore,
      reflectionPrompt: `あなたは自分を「${selfLabel}」だと感じているのに、周りの人は「${othersLabel}」だと思っている。どちらが本当のあなた？ それとも、場面によって違う自分が出ている？`,
      category: "self_vs_others",
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Detector 3: Style行動 × Stargazer自己申告
// ═══════════════════════════════════════════════════════════════

function detectStyleContradictions(
  input: SynthesizerInput,
  nextId: () => string
): CrossSystemContradiction[] {
  const results: CrossSystemContradiction[] = [];
  const { axisScores, styleActions } = input;
  if (!styleActions) return results;

  const styleMappings = STYLE_AXIS_MAP[styleActions.dominantStyle];
  if (!styleMappings) return results;

  for (const { axis, direction } of styleMappings) {
    const score = axisScores[axis];
    if (score === undefined) continue;

    // スタイル行動が示唆する方向と、Stargazerの自己申告が逆の場合
    if (Math.sign(direction) !== Math.sign(score) && Math.abs(score) > 0.3) {
      const gap = Math.abs(score - direction);
      if (gap < 0.6) continue;

      const severityScore = Math.min(gap / 2.5, 1);
      const styleLabel = styleActions.dominantStyle;

      results.push({
        id: nextId(),
        headline: `${styleLabel}スタイルを選ぶのに、内面は別の志向`,
        description: `ファッションでは${styleLabel}系を好んで選んでいるが、Stargazerの性格観測ではその方向と矛盾する傾向が出ている。服は「なりたい自分」の表れかもしれない。`,
        sources: ["stargazer", "style"],
        relatedAxes: [axis],
        severity: severityScore > 0.6 ? "notable" : "whisper",
        severityScore,
        reflectionPrompt: `あなたが${styleLabel}系を選ぶ理由は何？ 本当の好みなのか、それとも「こう見られたい」という願望なのか。`,
        category: "self_vs_behavior",
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Detector 4: Rendezvous回答 × Stargazer軸
// ═══════════════════════════════════════════════════════════════

function detectRendezvousContradictions(
  input: SynthesizerInput,
  nextId: () => string
): CrossSystemContradiction[] {
  const results: CrossSystemContradiction[] = [];
  const { axisScores, rendezvousVector } = input;
  if (!rendezvousVector) return results;

  // Stargazerから算出されるべきMatchingVectorと、実際のRendezvous回答ベースのVectorを比較
  const expectedVector = convertToMatchingVector(axisScores);

  const VECTOR_LABELS: Record<keyof MatchingVector, { label: string; low: string; high: string }> = {
    conversation_temperature: { label: "会話の温度感", low: "静かな会話", high: "活発な会話" },
    distance_need: { label: "距離のニーズ", low: "近い距離", high: "距離が必要" },
    depth_speed: { label: "深さの速度", low: "ゆっくり深める", high: "すぐ深くなる" },
    stability_need: { label: "安定ニーズ", low: "変化歓迎", high: "安定重視" },
    stimulation_need: { label: "刺激ニーズ", low: "穏やか志向", high: "刺激志向" },
    initiative: { label: "主導性", low: "受容的", high: "主導的" },
    emotional_openness: { label: "感情オープンさ", low: "感情を閉じる", high: "感情をオープン" },
    conflict_directness: { label: "対立の率直さ", low: "回避的", high: "率直" },
    social_energy: { label: "社交エネルギー", low: "一人が好き", high: "人が好き" },
    structure_preference: { label: "構造志向", low: "自由志向", high: "構造志向" },
  };

  for (const [key, meta] of Object.entries(VECTOR_LABELS) as [keyof MatchingVector, typeof VECTOR_LABELS.conversation_temperature][]) {
    const expected = expectedVector[key];
    const actual = rendezvousVector[key];
    const gap = Math.abs(expected - actual);

    if (gap < 0.25) continue;

    const severityScore = Math.min(gap, 1);
    const expectedLabel = expected > 0.5 ? meta.high : meta.low;
    const actualLabel = actual > 0.5 ? meta.high : meta.low;

    if (expectedLabel === actualLabel) continue;

    results.push({
      id: nextId(),
      headline: `性格診断では「${expectedLabel}」だが、対人場面では「${actualLabel}」を選ぶ`,
      description: `Stargazerの自己観測から予測される${meta.label}は「${expectedLabel}」寄りだが、Rendezvousでの実際の回答は「${actualLabel}」寄り。対人関係では普段と違う自分が出ているかもしれない。`,
      sources: ["stargazer", "rendezvous"],
      relatedAxes: RV_AXIS_MAP.find(m => m.vectorKey === key)?.axes.map(a => a.key) ?? [],
      severity: severityScore > 0.5 ? "notable" : "whisper",
      severityScore,
      reflectionPrompt: `一人で考えると「${expectedLabel}」なのに、人と向き合うと「${actualLabel}」になる。どちらが本当の自分？`,
      category: "stated_vs_chosen",
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Detector 5: Echoの時間的変容（temporal drift）
// ═══════════════════════════════════════════════════════════════

function detectEchoTemporalDrift(
  input: SynthesizerInput,
  nextId: () => string
): CrossSystemContradiction[] {
  const results: CrossSystemContradiction[] = [];
  const { axisScores, originEchoes = [] } = input;

  for (const trajectory of originEchoes) {
    // "suppressed" — 過去にあったエコーが今は消えている
    const suppressedTransforms = trajectory.transformations.filter(t => t.transformationType === "suppressed");
    if (suppressedTransforms.length > 0 && trajectory.status === "lost") {
      // このエコーに関連する軸を探す
      const echoLower = trajectory.echo.toLowerCase();
      const relatedAxes: TraitAxisKey[] = [];
      for (const [keyword, mappings] of Object.entries(ECHO_AXIS_MAP)) {
        if (echoLower.includes(keyword)) {
          relatedAxes.push(...mappings.map(m => m.axis));
        }
      }

      if (relatedAxes.length > 0) {
        results.push({
          id: nextId(),
          headline: `「${trajectory.echo}」は過去のあなたにあったが、今は消えている`,
          description: `${trajectory.firstPeriod}の頃に「${trajectory.echo}」という傾向があったが、${trajectory.lastPeriod}以降は見られなくなった。意識的に変えたのか、環境が変えたのか。`,
          sources: ["origin", "stargazer"],
          relatedAxes: [...new Set(relatedAxes)],
          severity: "notable",
          severityScore: 0.6,
          reflectionPrompt: `「${trajectory.echo}」を失ったのは、成長？ それとも、本当の自分を抑えている？`,
          category: "temporal_drift",
        });
      }
    }

    // "amplified" — エコーが強化されている
    const amplifiedTransforms = trajectory.transformations.filter(t => t.transformationType === "amplified");
    if (amplifiedTransforms.length > 0 && trajectory.status === "persistent") {
      const echoLower = trajectory.echo.toLowerCase();
      for (const [keyword, mappings] of Object.entries(ECHO_AXIS_MAP)) {
        if (echoLower.includes(keyword)) {
          for (const { axis, direction } of mappings) {
            const score = axisScores[axis];
            if (score !== undefined && Math.sign(score) !== Math.sign(direction)) {
              results.push({
                id: nextId(),
                headline: `過去の「${trajectory.echo}」が強化されているのに、今の自分は逆方向`,
                description: `記憶の中で「${trajectory.echo}」は時間とともに強くなっているが、現在のStargazer観測ではその反対の傾向が出ている。過去の自分と今の自分の間に乖離がある。`,
                sources: ["origin", "stargazer"],
                relatedAxes: [axis],
                severity: "profound",
                severityScore: 0.8,
                reflectionPrompt: `「${trajectory.echo}」は過去のあなたの重要な一部だった。今それと逆の方向にいるのはなぜ？`,
                category: "temporal_drift",
              });
            }
          }
        }
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Narrative generation helpers
// ═══════════════════════════════════════════════════════════════

function generateOriginNarrative(
  axis: TraitAxisKey,
  stargazerScore: number,
  originImplied: number,
  chapters: MemoryChapter[]
): { headline: string; description: string; prompt: string } {
  const AXIS_NARRATIVES: Partial<Record<TraitAxisKey, { pos: string; neg: string }>> = {
    cautious_vs_bold: { pos: "大胆", neg: "慎重" },
    introvert_vs_extrovert: { pos: "外向的", neg: "内向的" },
    independence_vs_harmony: { pos: "調和的", neg: "独立的" },
    emotional_regulation: { pos: "感情安定", neg: "感情的" },
    intimacy_pace: { pos: "距離を早く縮める", neg: "距離を慎重に詰める" },
    boundary_awareness: { pos: "境界が明確", neg: "境界が柔軟" },
    change_embrace_vs_resist: { pos: "変化に抵抗", neg: "変化を歓迎" },
    public_private_gap: { pos: "表裏にギャップ", neg: "表裏一致" },
    reassurance_need: { pos: "安心を求める", neg: "自己完結" },
    stress_isolation_vs_social: { pos: "ストレス時に人と", neg: "ストレス時に一人" },
  };

  const labels = AXIS_NARRATIVES[axis];
  const stargazerLabel = labels
    ? (stargazerScore > 0 ? labels.pos : labels.neg)
    : "ある傾向";
  const originLabel = labels
    ? (originImplied > 0 ? labels.pos : labels.neg)
    : "別の傾向";

  const relatedChapter = chapters.find(ch =>
    ch.echoes.some(e => {
      const eLower = e.toLowerCase();
      return Object.keys(ECHO_AXIS_MAP).some(k => eLower.includes(k));
    })
  );
  const periodHint = relatedChapter ? `（「${relatedChapter.title}」の頃）` : "";

  return {
    headline: `今は「${stargazerLabel}」だが、過去の記憶は「${originLabel}」を示している`,
    description: `Stargazerの現在の観測では「${stargazerLabel}」寄りだが、Originの記憶${periodHint}は「${originLabel}」な行動パターンを示唆している。過去の経験が今の性格をどう形成したのか — あるいは、過去の自分を否定して今の自分を作ったのか。`,
    prompt: `過去の自分は「${originLabel}」だったのに、今は「${stargazerLabel}」。何がきっかけで変わった？ それとも、本当は今でも「${originLabel}」な部分が残っている？`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Reverse feedback: Origin → Stargazer axis adjustments
// ═══════════════════════════════════════════════════════════════

export interface OriginAxisFeedback {
  axis: TraitAxisKey;
  /** 調整量 (-0.1 ~ +0.1) — 小さな補正 */
  adjustment: number;
  /** 信頼度 (0-1) */
  confidence: number;
  /** 根拠となるエコー */
  sourceEchoes: string[];
  /** 根拠となるチャプター数 */
  chapterCount: number;
}

/**
 * Origin記憶からStargazer軸への逆方向フィードバックを算出
 * エコーの出現頻度と一貫性から、軸スコアの補正値を導出する
 */
export function computeOriginToStargazerFeedback(
  chapters: MemoryChapter[],
  echoes: EchoTrajectory[]
): OriginAxisFeedback[] {
  const axisAccumulator: Record<string, { sum: number; count: number; echoes: Set<string>; chapters: Set<string> }> = {};

  // チャプターのエコーから軸調整値を集計
  for (const chapter of chapters) {
    for (const echo of chapter.echoes) {
      const echoLower = echo.toLowerCase();
      for (const [keyword, mappings] of Object.entries(ECHO_AXIS_MAP)) {
        if (echoLower.includes(keyword)) {
          for (const { axis, direction } of mappings) {
            if (!axisAccumulator[axis]) {
              axisAccumulator[axis] = { sum: 0, count: 0, echoes: new Set(), chapters: new Set() };
            }
            axisAccumulator[axis].sum += direction;
            axisAccumulator[axis].count += 1;
            axisAccumulator[axis].echoes.add(echo);
            axisAccumulator[axis].chapters.add(chapter.id);
          }
        }
      }
    }
  }

  // エコー軌跡の変容も考慮
  for (const trajectory of echoes) {
    if (trajectory.status === "persistent" && trajectory.appearances.length >= 3) {
      const echoLower = trajectory.echo.toLowerCase();
      for (const [keyword, mappings] of Object.entries(ECHO_AXIS_MAP)) {
        if (echoLower.includes(keyword)) {
          for (const { axis, direction } of mappings) {
            if (!axisAccumulator[axis]) {
              axisAccumulator[axis] = { sum: 0, count: 0, echoes: new Set(), chapters: new Set() };
            }
            // persistentなエコーは強い信号
            axisAccumulator[axis].sum += direction * 1.5;
            axisAccumulator[axis].count += 2;
            axisAccumulator[axis].echoes.add(trajectory.echo);
          }
        }
      }
    }
  }

  // 調整値を算出
  const feedbacks: OriginAxisFeedback[] = [];
  for (const [axis, data] of Object.entries(axisAccumulator)) {
    if (data.count < 2) continue; // 最低2回以上の信号が必要

    const avgDirection = data.sum / data.count;
    // 最大 ±0.1 の補正（Originは補助情報なので控えめ）
    const adjustment = Math.max(-0.1, Math.min(0.1, avgDirection * 0.1));
    // 信頼度は出現回数とチャプター数に基づく
    const confidence = Math.min(data.count / 10, 1) * Math.min(data.chapters.size / 3, 1);

    if (Math.abs(adjustment) > 0.01) {
      feedbacks.push({
        axis: axis as TraitAxisKey,
        adjustment,
        confidence,
        sourceEchoes: [...data.echoes],
        chapterCount: data.chapters.size,
      });
    }
  }

  return feedbacks.sort((a, b) => b.confidence - a.confidence);
}

// ═══════════════════════════════════════════════════════════════
// Reverse feedback: Rendezvous → Stargazer axis adjustments
// ═══════════════════════════════════════════════════════════════

export interface RendezvousAxisFeedback {
  axis: TraitAxisKey;
  /** 調整量 (-0.15 ~ +0.15) */
  adjustment: number;
  /** 信頼度 (0-1) */
  confidence: number;
  /** 根拠となるRendezvous次元 */
  sourceVectorKey: keyof MatchingVector;
}

/**
 * Rendezvous MatchingVectorからStargazer軸への逆方向フィードバックを算出
 * Rendezvousでの対人行動が、Stargazerの自己認識と異なる場合に補正する
 */
export function computeRendezvousToStargazerFeedback(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  rendezvousVector: MatchingVector,
  rendezvousAnswerCount: number
): RendezvousAxisFeedback[] {
  if (rendezvousAnswerCount < 10) return []; // 十分な回答がないと信頼できない

  const expectedVector = convertToMatchingVector(axisScores);
  const feedbacks: RendezvousAxisFeedback[] = [];

  for (const mapping of RV_AXIS_MAP) {
    const expected = expectedVector[mapping.vectorKey];
    const actual = rendezvousVector[mapping.vectorKey];
    const gap = actual - expected; // positive = Rendezvousがより高い

    if (Math.abs(gap) < 0.15) continue;

    for (const { key, weight, invert } of mapping.axes) {
      const currentScore = axisScores[key];
      if (currentScore === undefined) continue;

      // Rendezvousの方がより正確な対人行動を反映していると仮定
      // ただし最大 ±0.15 の補正に留める
      const rawAdjustment = gap * weight * (invert ? -1 : 1);
      const adjustment = Math.max(-0.15, Math.min(0.15, rawAdjustment));
      const confidence = Math.min(rendezvousAnswerCount / 30, 1) * 0.8;

      if (Math.abs(adjustment) > 0.02) {
        feedbacks.push({
          axis: key,
          adjustment,
          confidence,
          sourceVectorKey: mapping.vectorKey,
        });
      }
    }
  }

  return feedbacks.sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));
}
