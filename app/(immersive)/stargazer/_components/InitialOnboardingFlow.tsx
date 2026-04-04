// app/stargazer/_components/InitialOnboardingFlow.tsx
// 初回導入フロー V4 — "3問の魔法" 映画的自己発見オンボーディング
// Phase: 暗転→問いかけ→マイクロ観測(3問・適応的)→初見リーディング→深度説明→Alter予告→CTA
//       → (従来のコア35問 + ランデブーV2質問) → 最終結果
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QuestionFlow from "./QuestionFlow";
import ObservationReportCard from "./engagement/ObservationReportCard";
import MicroRevealCard from "./engagement/MicroRevealCard";
import MirrorQuestionCard from "./engagement/MirrorQuestionCard";
import VisualChoiceCard from "./engagement/VisualChoiceCard";
import DeepBreathTransition from "./engagement/DeepBreathTransition";
import DepthMeter, { calculateDepth } from "./engagement/DepthMeter";
import {
  generateReveal,
  generateMirrorProfile,
  getObservationTag,
} from "./engagement/revealGenerator";
import CognitiveQuestionCard from "./engagement/CognitiveQuestionCard";
import {
  getCfQuestionsByPhase,
  selectBranchTargets,
  getBranchQuestion,
  CF_RV_INSERTION_POINTS,
  type CfAnswer,
  type CognitiveQuestion,
} from "@/lib/stargazer/cognitiveFitQuestions";
import { computeCognitiveFitScores } from "@/lib/stargazer/cognitiveFitScoring";
import SemanticDifferentialCard from "./SemanticDifferentialCard";
import { useSignalCollector } from "@/hooks/useSignalCollector";
import { useStargazerSounds } from "@/hooks/useStargazerSounds";
import { useHaptics } from "@/hooks/useHaptics";
import BehavioralInsightPopup from "./BehavioralInsightPopup";
import CelebrationOverlay from "./CelebrationOverlay";
import ResultsSequence from "./ResultsSequence";
import type { QuestionInsight } from "@/lib/stargazer/behavioralSignalCollector";
import { STREAK_LEVELS, type StreakLevelInfo } from "@/lib/stargazer/streakIntelligence";
import {
  RENDEZVOUS_QUESTIONS_V2,
  RENDEZVOUS_CHAPTERS_V2,
  CONTEXT_DISPLAY,
  type RendezvousQuestionV2,
  type RendezvousChapterKeyV2,
} from "@/lib/stargazer/rendezvousInitialQuestions";
import {
  type ResolvedResult,
  type QuestionAnswer,
  calculateAxisScores,
} from "@/lib/stargazer/typeResolver";
import {
  initializeFromOnboarding,
  updateFromMicroAxes,
  updateFromRvAnswers,
  beliefsToScores,
  createEmptyBeliefSet,
  type RvAnswerInput,
  type BeliefSet,
} from "@/lib/stargazer/bayesianAxisUpdater";
import { resolveReactionType, getReactionType } from "@/lib/stargazer/reactionTypes";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode, LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS } from "@/lib/stargazer/archetypeTypes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  ENERGY_OPTIONS,
  EMOTION_OPTIONS,
  SOCIAL_OPTIONS,
  type EnergyLevel,
  type EmotionalTone,
  type SocialContext,
} from "@/lib/stargazer/fluctuationEngine";
import { generateZeroSecondMirror, generateServerMirror, recordMirrorReaction, type ZeroMirrorResult } from "@/lib/onboarding/zeroSecondMirror";
import { ensureAnonymousSession } from "@/lib/auth/anonymousAuth";
import { generateImpossibleAccuracy, type ImpossibleAccuracyInsight, type MicroObservationData } from "@/lib/onboarding/impossibleAccuracy";
import { QUESTIONS } from "@/lib/stargazer/questions";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Initial observation resume (localStorage-based)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SG_INITIAL_PROGRESS_KEY = "culcept_sg_initial_progress_v1";

interface InitialProgress {
  currentIndex: number;
  answers: QuestionAnswer[];
  savedAt: number; // Date.now()
}

function saveInitialProgress(data: InitialProgress): void {
  try { localStorage.setItem(SG_INITIAL_PROGRESS_KEY, JSON.stringify(data)); } catch { /* */ }
}

function loadInitialProgress(): InitialProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SG_INITIAL_PROGRESS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as InitialProgress;
    // 7日以上前のデータは破棄
    if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SG_INITIAL_PROGRESS_KEY);
      return null;
    }
    if (!data.answers || data.answers.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function clearInitialProgress(): void {
  try { localStorage.removeItem(SG_INITIAL_PROGRESS_KEY); } catch { /* */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type OnboardingPhase =
  | "zero_mirror"          // Zero-Second Mirror: 質問前の0秒ミラー
  | "cinematic_intro"     // 暗転 → タイポグラフィー演出
  | "micro_observations"  // 3問の魔法（適応的マイクロ観測）
  | "first_glimpse"       // 初見リーディング (wow moment) + Impossible Accuracy
  | "depth_explanation"   // NEW: 観測深度の説明
  | "alter_tease"         // NEW: Alter (影) のティーザー
  | "ready_gate"          // NEW: 観測開始ゲート
  | "state_capture"
  | "core_questions"       // Phase 1: 51問（コア35 + 新規16）+ CF8問 + VC5枚
  | "core_report"
  | "results"              // Phase 1 完了 → 全結果表示 + 保存
  | "continue_choice"      // 「さらに続ける」/ 「一旦終了」
  | "rendezvous_transition" // Phase 2（任意）: RV質問への導入
  | "rendezvous_questions"  // Phase 2: RV 66問 + 深掘り
  | "rv_results";           // Phase 2 完了 → RV込み最終結果

interface Props {
  onComplete: (result: ResolvedResult, allAnswers: QuestionAnswer[], cfAnswers?: CfAnswer[]) => void;
  /** Skip to RV flow (for users who already completed Phase 1 and return later) */
  startFromRv?: boolean;
  /** Existing profile data to merge RV results on top of (required when startFromRv=true) */
  existingProfile?: {
    axisScores: Record<TraitAxisKey, number>;
    confidence: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Micro-observation questions (instant insight fuel)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MicroOption {
  label: string;
  value: string;
  insight: string;
  axes: Partial<Record<TraitAxisKey, number>>;
}

interface MicroQuestion {
  id: string;
  prompt: string;
  options: MicroOption[];
  hesitationThreshold: number; // ms — if response takes longer, show hesitation insight
}

interface MicroTiming {
  questionId: string;
  responseTimeMs: number;
  hoveredOptions: string[];
}

// ── Q1: 固定シナリオ（感情的に引き込む）──

const MICRO_Q1: MicroQuestion = {
  id: "magic_1",
  prompt:
    "金曜の夜、友人から突然「今から会わない？」とLINEが来た。あなたの指は——",
  hesitationThreshold: 8000,
  options: [
    {
      label: "「行く！」と即返信",
      value: "instant",
      insight: "あなたが即座に「行く」と打てるのは、社交的だからではない。一人でいる時間が長くなると、自分の輪郭がぼやけていく感覚があるからだ。人と会うことで「自分が存在している」と確認している——その衝動の速さが、孤独への敏感さを物語っている。",
      axes: {
        introvert_vs_extrovert: 0.6,
        individual_vs_social: 0.7,
        social_initiative: 0.6,
        cautious_vs_bold: 0.4,
      },
    },
    {
      label: "「誰が来るの？」と聞く",
      value: "selective",
      insight:
        "「誰が来るの？」という質問の裏にあるのは、慎重さではなく「間違った相手に自分を消費したくない」という強い自己防衛本能。あなたは無意識に、人を「エネルギーをくれる人」と「奪う人」に分類している。その選別眼は、過去に合わない場で消耗した記憶が作ったものだ。",
      axes: {
        boundary_awareness: 0.5,
        relationship_mode_split: 0.6,
        analytical_vs_intuitive: -0.3,
        direct_vs_diplomatic: 0.3,
      },
    },
    {
      label: "既読をつけずに5分迷う",
      value: "hesitate",
      insight:
        "5分間の沈黙の中で、あなたの頭の中では「行ったら楽しいかも」と「でも今の自分には合わない」が高速で衝突している。この迷いは優柔不断ではない。あなたは自分の中に複数の欲求が同時に存在することを正確に感知できてしまう人だ——だから決められない。",
      axes: {
        emotional_variability: 0.6,
        introvert_vs_extrovert: -0.2,
        public_private_gap: 0.5,
        intent_stability: 0.4,
      },
    },
    {
      label: "「ごめん今日は無理」と嘘をつく",
      value: "deflect",
      insight:
        "嘘をついてまで守りたかったのは「予定のない金曜の夜」そのものではない。あなたが本当に守っているのは、「誰にも期待されていない時間にだけ現れる本当の自分」だ。社交の場で演じるコストを、あなたは他の人より正確に計算できてしまう。",
      axes: {
        boundary_awareness: 0.7,
        stress_isolation_vs_social: -0.6,
        introvert_vs_extrovert: -0.5,
        direct_vs_diplomatic: 0.5,
      },
    },
  ],
};

// ── Q2: Q1の回答に適応する質問を返す ──

function getAdaptiveQuestion2(q1Value: string): MicroQuestion {
  switch (q1Value) {
    // 社交的即応 → 期待を裏切られたときを聞く
    case "instant":
      return {
        id: "magic_2",
        prompt:
          "楽しみにしていた集まりに行ったら、想像と全然違った。あなたは——",
        hesitationThreshold: 7000,
        options: [
          {
            label: "それでも楽しもうとする",
            value: "adapt",
            insight:
              "「楽しもうとする」という選択の裏に、あなたは気づいているだろうか——それは適応力ではなく、期待を裏切られた自分の感情を「なかったこと」にする癖だ。あなたは失望を表に出すと人が離れると信じている。その柔軟さの代償は、自分の本音が分からなくなることだ。",
            axes: {
              change_embrace_vs_resist: 0.6,
              emotional_regulation: 0.5,
              independence_vs_harmony: 0.5,
              public_private_gap: 0.4,
            },
          },
          {
            label: "内心がっかりしながら笑顔でいる",
            value: "mask",
            insight:
              "がっかりしている自分を隠しながら笑顔を作れる——その技術は幼少期から磨かれてきたものだ。あなたは「本音を出したら場が壊れる」と学習した過去がある。問題は、その笑顔があまりに自然すぎて、自分でも本音と演技の境界が分からなくなることがあることだ。",
            axes: {
              public_private_gap: 0.7,
              direct_vs_diplomatic: 0.6,
              emotional_regulation: 0.4,
              independence_vs_harmony: 0.6,
            },
          },
          {
            label: "理由をつけて早めに帰る",
            value: "escape",
            insight:
              "「帰る」と決断できるのは冷たさではなく、自分のエネルギー残量を精密にモニタリングしている証拠だ。あなたは無意識に「この場にいるコスト」と「残りの週末の質」を天秤にかけている。この計算能力は、過去に限界を超えて消耗した経験から学んだ生存戦略だ。",
            axes: {
              boundary_awareness: 0.6,
              cautious_vs_bold: -0.3,
              plan_vs_spontaneous: -0.4,
              stress_isolation_vs_social: -0.3,
            },
          },
          {
            label: "「なんか違うね」と正直に言う",
            value: "honest",
            insight:
              "「なんか違うね」と口に出せるあなたは、場の空気より自分の感覚を信じる人だ。しかしその裏には「嘘をついたまま過ごす時間は、自分の一部を売り渡すことだ」という強い信念がある。あなたにとって誠実さは美徳ではなく、自分を守るための最後の砦だ。",
            axes: {
              direct_vs_diplomatic: -0.7,
              public_private_gap: -0.5,
              cautious_vs_bold: 0.4,
              independence_vs_harmony: -0.4,
            },
          },
        ],
      };

    // 選択的 → 本当に心が動く瞬間を聞く
    case "selective":
      return {
        id: "magic_2",
        prompt:
          "普段は冷静なあなたが、気づいたら夢中になっていた——それはどんな瞬間？",
        hesitationThreshold: 10000,
        options: [
          {
            label: "誰かの話に深く共感したとき",
            value: "empathy",
            insight:
              "普段は冷静に人を観察しているあなたが、誰かの言葉に深く共感した瞬間——そのとき起きているのは「この人は自分と同じものを見ている」という稀有な発見だ。あなたのフィルターは強力だからこそ、それを通過した感情は通常の何倍もの衝撃力を持つ。あなたが本当に求めているのは、多くの出会いではなく、一つの深い共鳴だ。",
            axes: {
              intimacy_pace: 0.5,
              individual_vs_social: 0.5,
              emotional_variability: 0.4,
              introvert_vs_extrovert: 0.3,
            },
          },
          {
            label: "新しい知識や発見に出会ったとき",
            value: "discovery",
            insight:
              "新しい知識に夢中になるとき、あなたの脳は「世界の仕組みがもう一段クリアになった」という快感を得ている。これは単なる好奇心ではない——あなたは「理解できないもの」に対して微かな不安を感じる人だ。学ぶことはあなたにとって趣味ではなく、世界を制御可能にするための本能的な行為だ。",
            axes: {
              analytical_vs_intuitive: -0.4,
              tradition_vs_novelty: 0.6,
              function_vs_expression: 0.3,
              perfectionist_vs_pragmatic: -0.3,
            },
          },
          {
            label: "自分の力で何かを成し遂げたとき",
            value: "mastery",
            insight:
              "「自分の力で成し遂げた」という確認が必要なのは、自信があるからではない。あなたの奥底には「他人の助けで得た成果は本物ではない」という厳格な基準がある。この自己証明の衝動は、過去に自分の実力を疑った瞬間に根を持っている。達成感の裏にある孤独に、あなた自身はまだ気づいていないかもしれない。",
            axes: {
              independence_vs_harmony: -0.5,
              cautious_vs_bold: 0.4,
              perfectionist_vs_pragmatic: -0.5,
              reassurance_need: -0.3,
            },
          },
          {
            label: "自然や音楽に包まれたとき",
            value: "sensory",
            insight:
              "自然や音楽に包まれたとき、あなたの中で普段稼働している「判断エンジン」が一時停止する。この瞬間だけ、あなたは何かを選ぶ必要も、誰かを評価する必要もない。あなたが本当に求めているのは感覚的な美しさではなく、「選ばなくていい」という究極の安息だ。",
            axes: {
              analytical_vs_intuitive: 0.6,
              function_vs_expression: 0.5,
              emotional_variability: 0.4,
              stress_isolation_vs_social: -0.3,
            },
          },
        ],
      };

    // 躊躇 → 「本音」との関係を聞く
    case "hesitate":
      return {
        id: "magic_2",
        prompt:
          "「本当はどうしたいの？」と聞かれた。あなたの中で起きることは——",
        hesitationThreshold: 9000,
        options: [
          {
            label: "答えは分かっているけど言えない",
            value: "suppressed",
            insight:
              "答えを知っているのに言えない——この状態は「弱さ」ではなく、あなたが本音を出したときの結果を高精度でシミュレーションできてしまうことの代償だ。あなたは過去に本音を出して場の空気が変わった瞬間を記憶している。その記憶が、今もあなたの口を閉じさせている。",
            axes: {
              public_private_gap: 0.7,
              direct_vs_diplomatic: 0.5,
              emotional_regulation: 0.4,
              boundary_awareness: 0.4,
            },
          },
          {
            label: "そもそも「本当の自分」が分からない",
            value: "lost",
            insight:
              "「本当の自分が分からない」と感じるのは、あなたが嘘つきだからではない。あなたの中には場面ごとに異なる「本気の自分」が複数存在していて、どれも偽物ではないからだ。あなたが苦しいのは、社会が「一貫した自分」を求めるのに、あなたの内面はそれに収まらないからだ。",
            axes: {
              intent_stability: 0.6,
              emotional_variability: 0.6,
              relationship_mode_split: 0.5,
              public_private_gap: 0.5,
            },
          },
          {
            label: "聞かれて初めて考え始める",
            value: "reactive",
            insight:
              "聞かれて初めて考え始める——これは思慮が浅いのではなく、あなたの内省回路が「他者の問いかけ」をトリガーに設計されているということだ。一人で考え込むより、誰かとの対話の中で自分が見えてくる。あなたにとって自己理解は、孤独な作業ではなく関係性の中で起きる現象だ。",
            axes: {
              individual_vs_social: 0.4,
              reassurance_need: 0.4,
              analytical_vs_intuitive: 0.3,
              social_initiative: -0.3,
            },
          },
          {
            label: "即答する——迷いはない",
            value: "clear",
            insight:
              "普段迷うあなたがこの質問にだけ即答した——それは興味深い矛盾だ。「本当はどうしたい？」に迷いがないということは、あなたは自分の欲求を知っている。迷っているのは欲求ではなく、「それを選んでいいのか」という許可の部分だ。あなたに足りないのは答えではなく、自分を許す勇気だ。",
            axes: {
              cautious_vs_bold: 0.5,
              intent_stability: -0.4,
              direct_vs_diplomatic: -0.4,
              independence_vs_harmony: -0.3,
            },
          },
        ],
      };

    // 回避 → 何を守っているかを聞く
    case "deflect":
    default:
      return {
        id: "magic_2",
        prompt:
          "一人の時間で、あなたが最も満たされるのはどんなとき？",
        hesitationThreshold: 8000,
        options: [
          {
            label: "好きなことに没頭しているとき",
            value: "immersion",
            insight:
              "好きなことに没頭している時間——それはあなたにとって「趣味」ではなく、自分が自分であることを確認する儀式だ。他者の目がない空間でだけ現れる集中状態こそが、あなたの最も純粋な姿。あなたが社交を断るのは、この脆くて大切な自分を守るためだ。",
            axes: {
              stress_isolation_vs_social: -0.5,
              function_vs_expression: 0.4,
              introvert_vs_extrovert: -0.4,
              perfectionist_vs_pragmatic: -0.3,
            },
          },
          {
            label: "何も考えずにぼーっとしているとき",
            value: "blank",
            insight:
              "「何もしない」を選べるのは、あなたが自分の限界を正確に知っているからだ。多くの人は消耗に気づかず倒れるが、あなたは壊れる前にシャットダウンできる。ただしその裏には、一度壊れた経験——あるいは壊れかけた記憶がある。空白は贅沢ではなく、あなたにとっての生存戦略だ。",
            axes: {
              emotional_regulation: 0.5,
              stress_isolation_vs_social: -0.6,
              plan_vs_spontaneous: 0.4,
              control_tendency: -0.3,
            },
          },
          {
            label: "自分の考えを整理しているとき",
            value: "organize",
            insight:
              "考えを整理する時間が必要なのは、あなたの頭の中が常に複数の思考を同時に走らせているからだ。整理しないと、どの感情が本物か分からなくなる。あなたにとって内省は「考えること」ではなく「散乱した自分を一つに戻す作業」——それがないと、翌日の自分が不安定になることを身体が知っている。",
            axes: {
              analytical_vs_intuitive: -0.5,
              plan_vs_spontaneous: -0.5,
              control_tendency: 0.4,
              perfectionist_vs_pragmatic: -0.3,
            },
          },
          {
            label: "実は、一人でも寂しいときがある",
            value: "lonely",
            insight:
              "一人を選んだはずなのに寂しい——この矛盾こそがあなたの核心だ。あなたは「条件つきのつながり」を求めている。無条件に人と一緒にいることには耐えられないが、完全な孤独にも耐えられない。あなたが本当に欲しいのは「自分のままでいられる関係」であり、それが見つからないから一人を選んでいる。",
            axes: {
              individual_vs_social: 0.5,
              intimacy_pace: 0.5,
              public_private_gap: 0.6,
              stress_isolation_vs_social: 0.3,
            },
          },
        ],
      };
  }
}

// ── Q3: Q1/Q2の矛盾を仕掛ける質問を返す ──

function getContradictionQuestion3(
  q1Value: string,
  q2Value: string
): MicroQuestion {
  // 内向/回避傾向 → 他者を助ける場面で揺さぶる
  if (q1Value === "hesitate" || q1Value === "deflect") {
    return {
      id: "magic_3",
      prompt:
        "深夜2時、普段あまり話さない同僚から「つらい、話を聞いてほしい」と連絡が来た。",
      hesitationThreshold: 6000,
      options: [
        {
          label: "すぐに電話する",
          value: "respond",
          insight:
            "自分の時間を守ると言いながら、深夜2時に電話をかけた——この矛盾があなたの「本当の優先順位」を暴いている。あなたの境界線は鉄壁に見えて、実は「この人は助ける価値がある」という判断が瞬時に働くと崩れる。あなたの冷たさは表面であり、その下には「見捨てた自分を許せない」という恐れがある。",
          axes: {
            individual_vs_social: 0.6,
            social_initiative: 0.5,
            boundary_awareness: -0.3,
            intimacy_pace: 0.4,
          },
        },
        {
          label: "「明日でもいい？」と聞く",
          value: "delay",
          insight:
            "「明日でもいい？」と返せるのは、冷酷だからではない。あなたは過去に「相手のために自分を犠牲にして、結局両方とも壊れた」経験を持っている可能性がある。自分を守ることが最終的に相手も守ることだと、あなたは身体で学んでいる。この境界線は知恵であり、痛みから生まれた優しさだ。",
          axes: {
            boundary_awareness: 0.6,
            emotional_regulation: 0.5,
            plan_vs_spontaneous: -0.3,
            direct_vs_diplomatic: -0.3,
          },
        },
        {
          label: "短くメッセージを送る",
          value: "text",
          insight:
            "短いメッセージを送る——その一行には「電話はできないけど、あなたのことは気にしている」という精密な距離感が込められている。あなたは相手の感情に巻き込まれると自分が機能しなくなることを知っている。だから最も安全な距離から手を伸ばす。それはあなたなりの、壊れない範囲での誠実さだ。",
          axes: {
            direct_vs_diplomatic: 0.4,
            stress_isolation_vs_social: -0.2,
            boundary_awareness: 0.3,
            emotional_regulation: 0.3,
          },
        },
        {
          label: "既読をつけたまま悩む",
          value: "freeze",
          insight:
            "既読をつけたまま動けない——この凍結状態は、あなたの中で「助けたい自分」と「自分を守りたい自分」が同時に全力で主張しているために起きている。どちらも嘘ではないから決められない。あなたの迷いは無関心の対極にある。これほど真剣に悩めること自体が、あなたの人間としての深さを証明している。",
          axes: {
            emotional_variability: 0.6,
            public_private_gap: 0.5,
            intent_stability: 0.4,
            reassurance_need: 0.3,
          },
        },
      ],
    };
  }

  // 外向/即応傾向 → 一人になりたい場面で揺さぶる
  if (q1Value === "instant") {
    return {
      id: "magic_3",
      prompt:
        "大好きな友人たちとの旅行3日目。楽しいはずなのに、ふと一人になりたい自分がいる。",
      hesitationThreshold: 7000,
      options: [
        {
          label: "その気持ちに気づかないふりをする",
          value: "ignore",
          insight:
            "「一人になりたい」という感情に気づかないふりをする——それは友人への配慮ではなく、「社交的で楽しんでいる自分」というセルフイメージを壊したくないからだ。あなたは自分の中の内向的な部分を「弱さ」だと誤解している可能性がある。認めるのが怖いのは、その部分が思ったより大きいと気づいてしまうからだ。",
          axes: {
            public_private_gap: 0.7,
            emotional_regulation: 0.3,
            independence_vs_harmony: 0.5,
            introvert_vs_extrovert: -0.2,
          },
        },
        {
          label: "「ちょっと散歩してくる」と抜け出す",
          value: "escape_softly",
          insight:
            "「ちょっと散歩してくる」と言えるのは、あなたが自分の社交バッテリーの残量を正確に読める人だからだ。多くの人は枯渇するまで気づかないが、あなたは20%を切った瞬間に感知できる。この自己モニタリング能力は、社交的に見える自分と内向的な本質の間で長年バランスを取ってきた結果だ。",
          axes: {
            boundary_awareness: 0.5,
            stress_isolation_vs_social: -0.4,
            introvert_vs_extrovert: -0.3,
            emotional_regulation: 0.4,
          },
        },
        {
          label: "「疲れちゃった」と正直に言う",
          value: "confess",
          insight:
            "「疲れちゃった」と正直に言える——その一言が出るまでに、あなたの中では「言ったらどう思われるか」の計算が一瞬で走っている。それでも言うと決めたのは、「完璧な社交者」を演じ続けるコストが限界に近づいているサインだ。あなたは弱さを見せることで、実は最も強い形の自己主張をしている。",
          axes: {
            direct_vs_diplomatic: -0.5,
            public_private_gap: -0.5,
            reassurance_need: 0.3,
            intimacy_pace: 0.4,
          },
        },
        {
          label: "もう少し頑張ろう、と自分に言い聞かせる",
          value: "push_through",
          insight:
            "「もう少し頑張ろう」と自分に言い聞かせる——この内なる声は誰のものだろうか。あなたは「楽しむべき場面で楽しめない自分」に罪悪感を感じている。それは周囲への配慮ではなく、「期待に応えられない自分は価値がない」という深層の信念から来ている。あなたの自己要求の高さは、自分への優しさの欠如と表裏一体だ。",
          axes: {
            perfectionist_vs_pragmatic: -0.5,
            control_tendency: 0.4,
            emotional_regulation: 0.3,
            public_private_gap: 0.4,
          },
        },
      ],
    };
  }

  // 選択的傾向 → 制御できない状況で揺さぶる
  return {
    id: "magic_3",
    prompt:
      "予定のない休日の朝。目が覚めて、何の予定もないことに気づいた。最初に感じるのは——",
    hesitationThreshold: 6000,
    options: [
      {
        label: "自由だ、という解放感",
        value: "freedom",
        insight:
          "「自由だ」と感じた瞬間——それは裏を返せば、普段あなたがどれほど「正しい選択をしなければ」というプレッシャーの中にいるかの証拠だ。予定がないことに安堵するのは、あなたの日常が無意識の判断疲労で満ちているから。あなたが本当に求めているのは自由ではなく、「間違えてもいい時間」だ。",
        axes: {
          plan_vs_spontaneous: 0.5,
          control_tendency: -0.4,
          stress_isolation_vs_social: -0.3,
          change_embrace_vs_resist: 0.3,
        },
      },
      {
        label: "少し不安——何をすればいいか分からない",
        value: "anxiety",
        insight:
          "何もない朝に不安を感じる——それは暇が嫌いだからではない。あなたの安心感は「自分が何をすべきか分かっている状態」に依存している。構造がなくなった瞬間、あなたは自分という存在の輪郭が溶けていくような感覚を覚える。判断基準は、あなたにとって地面のようなものだ——なくなると立っていられない。",
        axes: {
          plan_vs_spontaneous: -0.6,
          control_tendency: 0.5,
          reassurance_need: 0.4,
          emotional_variability: 0.3,
        },
      },
      {
        label: "誰かを誘おうか考える",
        value: "seek_company",
        insight:
          "普段は人を選ぶあなたが、予定のない朝には誰かを誘おうとする——この変化が意味するのは、あなたの「選択的な社交」は強さではなく、一人の時間に耐えるための仕組みだったということだ。構造が消えると、あなたの中の「一人は怖い」という本音が顔を出す。あなたが選んでいたのは人ではなく、孤独を避ける方法だ。",
        axes: {
          individual_vs_social: 0.5,
          social_initiative: 0.4,
          introvert_vs_extrovert: 0.3,
          intimacy_pace: 0.3,
        },
      },
      {
        label: "すぐに予定を立て始める",
        value: "plan",
        insight:
          "すぐに予定を立て始める——その衝動の速さが、あなたが「空白の時間」に対して感じる微かな恐怖を物語っている。予定を入れるのは楽しみたいからではなく、「何もしていない自分」に価値を感じられないからだ。あなたにとって生産性は目標ではなく、自己肯定感を維持するための酸素のようなものだ。",
        axes: {
          plan_vs_spontaneous: -0.7,
          control_tendency: 0.6,
          perfectionist_vs_pragmatic: -0.3,
          change_embrace_vs_resist: -0.3,
        },
      },
    ],
  };
}

// 現在の質問を取得するヘルパー（適応的に3問を構成）
function getCurrentMicroQuestion(
  index: number,
  answers: { questionId: string; value: string }[]
): MicroQuestion | null {
  if (index === 0) return MICRO_Q1;
  if (index === 1 && answers.length >= 1) {
    return getAdaptiveQuestion2(answers[0].value);
  }
  if (index === 2 && answers.length >= 2) {
    return getContradictionQuestion3(answers[0].value, answers[1].value);
  }
  return null;
}

const TOTAL_MICRO_QUESTIONS = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// First Glimpse insight generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FirstGlimpseInsight {
  coreNeed: string;
  coreNeedDescription: string;
  convincedBy: string;
  stressResponse: string;
  blindSpotHint: string;
  quoteText: string;
  quoteAuthor: string;
}

function generateFirstGlimpse(microAxes: Partial<Record<TraitAxisKey, number>>): FirstGlimpseInsight {
  try {
    const arch = resolveArchetype(microAxes);
    const def = getArchetypeByCode(arch.code);
    const l1 = LAYER1_DEFS[arch.layer1?.code as keyof typeof LAYER1_DEFS];
    const l2 = LAYER2_DEFS[arch.layer2?.code as keyof typeof LAYER2_DEFS];
    const l3 = LAYER3_DEFS[arch.layer3?.code as keyof typeof LAYER3_DEFS];

    return {
      coreNeed: l1?.label ?? "自己理解",
      coreNeedDescription: l1?.description ?? "あなた自身を知ろうとする力",
      convincedBy: l2?.label ?? "直感",
      stressResponse: l3?.label ?? "内省",
      blindSpotHint: def?.blindSpots?.[0] ?? "まだ見えていない部分がある",
      quoteText: def?.quote?.text ?? "自分自身を知ることは、すべての知恵の始まりである",
      quoteAuthor: def?.quote?.author ?? "アリストテレス",
    };
  } catch (err) {
    console.error("[Stargazer] generateFirstGlimpse failed:", err);
    return {
      coreNeed: "自己理解",
      coreNeedDescription: "あなた自身を知ろうとする力",
      convincedBy: "直感",
      stressResponse: "内省",
      blindSpotHint: "まだ見えていない部分がある",
      quoteText: "自分自身を知ることは、すべての知恵の始まりである",
      quoteAuthor: "アリストテレス",
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Particle Field (cinematic background)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CinematicParticles({ intensity = 1 }: { intensity?: number }) {
  const particles = useMemo(() =>
    Array.from({ length: Math.floor(40 * intensity) }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      duration: 3 + Math.random() * 5,
      delay: Math.random() * 3,
      opacity: 0.15 + Math.random() * 0.35,
    })),
    [intensity]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `rgba(190,175,130,${p.opacity})`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [p.opacity * 0.3, p.opacity, p.opacity * 0.3],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Typewriter text
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TypewriterText({
  text,
  delay = 0,
  speed = 40,
  onComplete,
  className,
  style,
}: {
  text: string;
  delay?: number;
  speed?: number;
  onComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, speed);
    return () => clearTimeout(timer);
  }, [started, displayed, text, speed, onComplete]);

  return (
    <span className={className} style={style}>
      {displayed}
      {started && displayed.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          style={{ color: "rgba(190,170,110,0.6)" }}
        >
          |
        </motion.span>
      )}
    </span>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Breathing Orb
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BreathingOrb({ size = 80, color = "rgba(190,170,110,0.3)" }: { size?: number; color?: string }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: color, filter: "blur(20px)" }}
        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          top: "25%", left: "25%", width: "50%", height: "50%",
          background: color, filter: "blur(6px)",
        }}
        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Step Progress Indicator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ONBOARDING_STEPS = [
  { label: "あなたの傾向", shortLabel: "傾向" },
  { label: "判断パターン", shortLabel: "判断" },
  { label: "タイプ確定", shortLabel: "確定" },
] as const;

function getOnboardingStep(phase: OnboardingPhase): number {
  switch (phase) {
    case "zero_mirror":
    case "cinematic_intro":
    case "micro_observations":
    case "first_glimpse":
    case "depth_explanation":
    case "alter_tease":
    case "ready_gate":
    case "state_capture":
      return 0;
    case "core_questions":
    case "core_report":
    case "results":
    case "continue_choice":
      return 1;
    case "rendezvous_transition":
    case "rendezvous_questions":
    case "rv_results":
      return 2;
    default:
      return 0;
  }
}

function StepProgressIndicator({ phase }: { phase: OnboardingPhase }) {
  const currentStep = getOnboardingStep(phase);

  // Don't show during immersive phases
  if (phase === "zero_mirror" || phase === "cinematic_intro" || phase === "results" || phase === "rv_results") {
    return null;
  }

  return (
    <div className="mb-5">
      {/* Step labels */}
      <div className="flex items-center justify-between mb-2 px-1">
        {ONBOARDING_STEPS.map((step, i) => (
          <span
            key={i}
            className="font-mono-sg text-[10px] tracking-wide"
            style={{
              color: i === currentStep
                ? "rgba(170,150,90,0.85)"
                : i < currentStep
                  ? "rgba(170,150,90,0.45)"
                  : "rgba(120,125,140,0.35)",
            }}
          >
            {i + 1}/{ONBOARDING_STEPS.length} {step.label}
          </span>
        ))}
      </div>
      {/* Segmented progress bar */}
      <div className="flex gap-1.5">
        {ONBOARDING_STEPS.map((_, i) => (
          <div
            key={i}
            className="h-1 rounded-full flex-1 overflow-hidden"
            style={{ background: "rgba(160,170,200,0.1)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: i <= currentStep
                  ? "rgba(170,150,90,0.55)"
                  : "transparent",
              }}
              initial={{ width: 0 }}
              animate={{
                width: i < currentStep ? "100%" : i === currentStep ? "50%" : "0%",
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function InitialOnboardingFlow({ onComplete, startFromRv = false, existingProfile }: Props) {
  // ── 再訪復元チェック ──
  const [resumeData, setResumeData] = useState<InitialProgress | null>(() => {
    if (startFromRv) return null;
    return loadInitialProgress();
  });
  const [phase, setPhase] = useState<OnboardingPhase>(() => {
    if (startFromRv) return "rendezvous_transition";
    // 再訪復元がある場合はプロンプトを表示するためにzero_mirrorから始める（下部で分岐）
    return "zero_mirror";
  });
  const [zeroMirror, setZeroMirror] = useState<ZeroMirrorResult>(() => generateServerMirror());
  const [zeroMirrorStartTime] = useState(() => Date.now());
  const [impossibleInsight, setImpossibleInsight] = useState<ImpossibleAccuracyInsight | null>(null);

  // ── 匿名セッション確立（後ログイン型フロー） ──
  // ページロード時に匿名セッションを作成。Feature flag OFF 時は /login にリダイレクト。
  const [isAnonymousUser, setIsAnonymousUser] = useState(false);
  useEffect(() => {
    ensureAnonymousSession().then((result) => {
      if (!result.ok && result.reason === "anonymous_disabled") {
        // Feature flag OFF → 先ログイン型にフォールバック
        window.location.href = "/login?next=/stargazer";
        return;
      }
      if (result.ok) {
        setIsAnonymousUser(result.isAnonymous ?? false);
      }
      // ok=false かつ reason=sign_in_failed → セッションなしで続行（ローカル保存にフォールバック）
    }).catch(() => {});
  }, []);
  const handleLoginRedirect = useCallback(() => {
    window.location.href = "/login?next=/stargazer";
  }, []);

  // Upgrade to full client-side mirror with all browser signals
  useEffect(() => {
    generateZeroSecondMirror().then(setZeroMirror).catch(() => {});
  }, []);

  // Behavioral signal collection
  const {
    startQuestion: signalStartQuestion,
    onOptionHover: signalOptionHover,
    onOptionHoverEnd: signalOptionHoverEnd,
    recordAnswer: signalRecordAnswer,
    getQuestionInsight,
    saveSession: signalSaveSession,
  } = useSignalCollector();

  // Sound effects
  const { playInsightReveal, playStarBorn, playStreakMilestone } = useStargazerSounds();
  const haptics = useHaptics();

  // Behavioral insight popup state
  const [behavioralInsight, setBehavioralInsight] = useState<QuestionInsight | null>(null);
  const [showBehavioralPopup, setShowBehavioralPopup] = useState(false);

  // Cinematic intro sub-steps
  const [introStep, setIntroStep] = useState(0);

  // Micro observations (3問の魔法)
  const [microIndex, setMicroIndex] = useState(0);
  const [microAnswers, setMicroAnswers] = useState<{ questionId: string; value: string; insight: string; axes: Partial<Record<TraitAxisKey, number>> }[]>([]);
  const [microAxes, setMicroAxes] = useState<Partial<Record<TraitAxisKey, number>>>({});

  // Timing & insight display
  const [microTimings, setMicroTimings] = useState<MicroTiming[]>([]);
  const microQuestionAppeared = useRef<number>(Date.now());
  const [hoveredOptionsDuringQ, setHoveredOptionsDuringQ] = useState<string[]>([]);
  const [showingInsight, setShowingInsight] = useState(false);
  const [currentInsightText, setCurrentInsightText] = useState("");
  const [currentHesitationText, setCurrentHesitationText] = useState<string | null>(null);
  const [selectedOptionValue, setSelectedOptionValue] = useState<string | null>(null);

  // First glimpse
  const [glimpse, setGlimpse] = useState<FirstGlimpseInsight | null>(null);

  // Constellation nodes for the analyzing animation (must be at top level for hooks rules)
  const constellationNodes = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => ({
      id: i,
      cx: 50 + Math.cos((i / 7) * Math.PI * 2) * 30 + ((i * 17 + 3) % 15 - 7),
      cy: 50 + Math.sin((i / 7) * Math.PI * 2) * 30 + ((i * 13 + 5) % 15 - 7),
    })),
  []);

  // State capture
  const [stateEnergy, setStateEnergy] = useState<EnergyLevel | null>(null);
  const [stateEmotion, setStateEmotion] = useState<EmotionalTone | null>(null);
  const [stateSocial, setStateSocial] = useState<SocialContext | null>(null);
  const [stateCaptureStep, setStateCaptureStep] = useState<0 | 1 | 2>(0);

  // Core results — when startFromRv, synthesize from existingProfile
  const [coreResult, setCoreResult] = useState<ResolvedResult | null>(() => {
    if (startFromRv && existingProfile) {
      const reactionType = resolveReactionType(existingProfile.axisScores);
      return {
        reactionType,
        confidence: existingProfile.confidence,
        axisScores: existingProfile.axisScores,
        axisConfidences: Object.fromEntries(
          Object.keys(existingProfile.axisScores).map((k) => [k, 0.4])
        ) as Record<TraitAxisKey, number>,
      };
    }
    return null;
  });
  const [coreAnswers, setCoreAnswers] = useState<QuestionAnswer[]>([]);

  // Rendezvous V2
  const [rvQueue, setRvQueue] = useState<RendezvousQuestionV2[]>([]);
  const [rvQueueIndex, setRvQueueIndex] = useState(0);
  const [rvAnswers, setRvAnswers] = useState<QuestionAnswer[]>([]);
  const [showChapterIntro, setShowChapterIntro] = useState(true);
  const [totalExpectedQuestions, setTotalExpectedQuestions] = useState(
    RENDEZVOUS_QUESTIONS_V2.length
  );
  const rvStartRef = useRef<number>(Date.now());

  // Rendezvous engagement state
  const [rvEngagementPhase, setRvEngagementPhase] = useState<
    "questioning" | "deep_breath" | "chapter_intro" | "micro_reveal" | "mirror_question" | "visual_choice" | "cognitive_fit" | "cognitive_fit_branch"
  >("chapter_intro");
  const [rvObsTag, setRvObsTag] = useState<import("./engagement/revealGenerator").ObservationTag | null>(null);
  const [rvVisualChoiceIdx, setRvVisualChoiceIdx] = useState(0);

  // Cognitive Fit state (RV phase)
  const [rvCfAnswers, setRvCfAnswers] = useState<CfAnswer[]>([]);
  const [rvCfQueue, setRvCfQueue] = useState<CognitiveQuestion[]>([]);
  const [rvCfQueueIdx, setRvCfQueueIdx] = useState(0);
  const rvCfTriggered = useRef<Set<string>>(new Set());

  // Final result
  const [finalResult, setFinalResult] = useState<ResolvedResult | null>(null);

  // Emerging type preview (shown after 5 core questions)
  const [showEmergingType, setShowEmergingType] = useState(false);
  const [emergingTypeName, setEmergingTypeName] = useState("");
  const [emergingTypeEmoji, setEmergingTypeEmoji] = useState("");
  const emergingTypeShown = useRef(false);

  // Auto-dismiss emerging type preview after 3 seconds
  useEffect(() => {
    if (!showEmergingType) return;
    const timer = setTimeout(() => setShowEmergingType(false), 3000);
    return () => clearTimeout(timer);
  }, [showEmergingType]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Hooks for micro_observations phase (must be top-level, not after conditional returns)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Reset question timer when microIndex or phase changes
  useEffect(() => {
    if (phase === "micro_observations" && !showingInsight) {
      microQuestionAppeared.current = Date.now();
      setHoveredOptionsDuringQ([]);
      // Start signal tracking for current micro question
      const q = getCurrentMicroQuestion(microIndex, microAnswers);
      if (q) signalStartQuestion(q.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, microIndex, showingInsight]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Hooks for first_glimpse phase (must be top-level, not after conditional returns)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Sub-phases for the dramatic reveal sequence
  const [glimpseSubPhase, setGlimpseSubPhase] = useState<
    "behavioral_reveal" | "analyzing" | "archetype_reveal" | "impossible_accuracy" | "milestone" | "streak_preview"
  >("behavioral_reveal");
  const [showCelebration, setShowCelebration] = useState(false);

  // Understanding meter counter animation
  const [meterValue, setMeterValue] = useState(0);

  // Constellation forming animation state
  const [constellationProgress, setConstellationProgress] = useState(0);

  useEffect(() => {
    if (phase !== "first_glimpse") return;
    setGlimpseSubPhase("behavioral_reveal");
    setShowCelebration(false);
    setConstellationProgress(0);
    setMeterValue(0);
  }, [phase]);

  // Auto-advance through behavioral_reveal -> analyzing -> archetype_reveal -> milestone -> streak_preview
  useEffect(() => {
    if (phase !== "first_glimpse") return;

    if (glimpseSubPhase === "behavioral_reveal") {
      // Show behavioral data for 5 seconds, then transition to analyzing
      const timer = setTimeout(() => setGlimpseSubPhase("analyzing"), 5500);
      return () => clearTimeout(timer);
    }

    if (glimpseSubPhase === "analyzing") {
      // Constellation forming animation over 3.5s
      const startTime = Date.now();
      const animDuration = 3500;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animDuration, 1);
        setConstellationProgress(progress);
        if (progress >= 1) {
          clearInterval(interval);
          playStarBorn();
          haptics.heavy();
          setGlimpseSubPhase("archetype_reveal");
        }
      }, 50);
      return () => clearInterval(interval);
    }

    if (glimpseSubPhase === "archetype_reveal") {
      // Count up the meter
      const target = 12; // intentionally low — honest
      const counterDuration = 2000;
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / counterDuration, 1);
        setMeterValue(Math.round(progress * target));
        if (progress >= 1) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, glimpseSubPhase]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Resume Prompt（再訪復元プロンプト）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "zero_mirror" && resumeData && resumeData.answers.length > 0) {
    const answeredCount = resumeData.answers.length;
    const totalCount = QUESTIONS.length;
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <motion.div
          className="text-center px-6 max-w-md mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="text-4xl mb-5"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            🔭
          </motion.div>
          <motion.p
            className="font-display text-lg leading-relaxed tracking-wide mb-2"
            style={{ color: "rgba(50,55,75,0.75)" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            {answeredCount}問まで記録済み
          </motion.p>
          <motion.p
            className="font-body text-sm leading-relaxed mb-8"
            style={{ color: "rgba(80,85,105,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            前回の続きから再開できます
          </motion.p>
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
          >
            <button
              onClick={() => setPhase("core_questions")}
              className="w-full font-display text-sm tracking-[0.1em] px-8 py-3.5 rounded-xl transition-all"
              style={{
                background: "rgba(170,150,90,0.08)",
                border: "1px solid rgba(170,150,90,0.15)",
                color: "rgba(150,130,80,0.7)",
              }}
            >
              続きから再開する（{answeredCount}/{totalCount}問）
            </button>
            <button
              onClick={() => {
                clearInitialProgress();
                setResumeData(null);
              }}
              className="w-full font-body text-xs tracking-wide px-6 py-2.5 rounded-lg transition-all"
              style={{
                color: "rgba(100,105,130,0.45)",
              }}
            >
              最初からやり直す
            </button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Zero-Second Mirror（0秒ミラー）
  // 質問前に、すでに分かっていることを見せる
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "zero_mirror") {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <CinematicParticles intensity={0.4} />
        <motion.div
          className="text-center px-6 max-w-md mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
        >
          <motion.p
            className="font-display text-lg leading-relaxed tracking-wide whitespace-pre-line"
            style={{ color: "rgba(50,55,75,0.7)" }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1.2 }}
          >
            {zeroMirror.mirrorText}
          </motion.p>
          {zeroMirror.subText && (
            <motion.p
              className="font-display text-sm leading-relaxed mt-4"
              style={{ color: "rgba(50,55,75,0.4)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2, duration: 1 }}
            >
              {zeroMirror.subText}
            </motion.p>
          )}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3.5, duration: 0.4 }}
          >
            <button
              onClick={() => {
                recordMirrorReaction({
                  ruleId: zeroMirror.signals.join(","),
                  dwellTimeMs: Date.now() - zeroMirrorStartTime,
                  wasEngaged: true,
                  timestamp: new Date().toISOString(),
                });
                setPhase("cinematic_intro");
              }}
              className="mt-8 font-display text-sm tracking-[0.15em] px-8 py-3 rounded-xl transition-all"
              style={{
                background: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(190,170,110,0.15)",
                color: "rgba(150,130,80,0.6)",
                backdropFilter: "blur(12px)",
              }}
            >
              3つの問いで、最初の地図が生まれる
            </button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Cinematic Intro
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "cinematic_intro") {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <CinematicParticles intensity={0.6} />

        <AnimatePresence mode="wait">
          {/* Step 0: Darkness -> single question */}
          {introStep === 0 && (
            <motion.div
              key="intro-0"
              className="text-center px-6 max-w-md mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 1 }}
                className="space-y-8"
              >
                <p
                  className="font-display text-xl leading-relaxed tracking-wide"
                  style={{ color: "rgba(60,65,85,0.65)" }}
                >
                  <TypewriterText
                    text="あなたは、自分のことを本当に知っていますか？"
                    delay={1200}
                    speed={60}
                    onComplete={() => {
                      setTimeout(() => setIntroStep(1), 2000);
                    }}
                  />
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* Step 1: The insight */}
          {introStep === 1 && (
            <motion.div
              key="intro-1"
              className="text-center px-6 max-w-lg mx-auto space-y-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
            >
              <motion.p
                className="font-display text-lg leading-relaxed"
                style={{ color: "rgba(50,55,75,0.6)" }}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                人は誰もが、自分では見えない星を持っている。
              </motion.p>
              <motion.p
                className="font-display text-lg leading-relaxed"
                style={{ color: "rgba(50,55,75,0.5)" }}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.4 }}
              >
                判断の癖。恐れの形。安心の源。
              </motion.p>
              <motion.p
                className="font-display text-lg leading-relaxed"
                style={{ color: "rgba(50,55,75,0.5)" }}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3, duration: 0.4 }}
              >
                Stargazer は、それを観測する。
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 4.5, duration: 0.4 }}
              >
                <button
                  onClick={() => setIntroStep(2)}
                  className="mt-6 font-display text-sm tracking-[0.2em] px-8 py-3 rounded-xl transition-all"
                  style={{
                    background: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(190,170,110,0.2)",
                    color: "rgba(170,150,90,0.7)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  観測を始める
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* Step 2: Scope explanation */}
          {introStep === 2 && (
            <motion.div
              key="intro-2"
              className="text-center px-6 max-w-md mx-auto space-y-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                className="flex justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: "spring", damping: 12 }}
              >
                <BreathingOrb size={60} color="rgba(170,160,210,0.25)" />
              </motion.div>

              <motion.h3
                className="font-display text-xl"
                style={{ color: "rgba(30,35,55,0.85)" }}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                3つの問いで、最初の自分を覗きます
              </motion.h3>
              <motion.p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(60,65,85,0.55)" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                正解はありません。直感のまま、最初に浮かんだものを選んでください。
                <br />
                それだけで、あなたの輪郭が浮かび始めます。
              </motion.p>

              <motion.button
                onClick={() => setPhase("micro_observations")}
                className="font-display text-sm tracking-[0.15em] px-10 py-3.5 rounded-xl transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(170,150,90,0.12), rgba(160,150,200,0.08))",
                  border: "1px solid rgba(190,170,110,0.2)",
                  color: "rgba(100,90,60,0.75)",
                  backdropFilter: "blur(12px)",
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                始める
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Micro Observations (3問の魔法 — adaptive)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "micro_observations") {
    const q = getCurrentMicroQuestion(microIndex, microAnswers);
    if (!q) return null;

    const handleMicroAnswer = (optionValue: string) => {
      try {
      if (showingInsight) return; // prevent double-tap
      haptics.light(); // tactile feedback on option selection

      const selected = q.options.find((o) => o.value === optionValue);
      if (!selected) return;

      // Calculate response time
      const responseTimeMs = Date.now() - microQuestionAppeared.current;

      // Record timing
      const newTiming: MicroTiming = {
        questionId: q.id,
        responseTimeMs,
        hoveredOptions: [...hoveredOptionsDuringQ],
      };
      const updatedTimings = [...microTimings, newTiming];
      setMicroTimings(updatedTimings);

      // Record behavioral signal and get richer insight
      const signal = signalRecordAnswer(q.id, optionValue);
      let popupInsight: QuestionInsight | null = null;
      if (signal) {
        popupInsight = getQuestionInsight(signal);
      }

      // Set selected and show insight
      setSelectedOptionValue(optionValue);
      setCurrentInsightText(selected.insight);

      // Play insight reveal sound + haptic feedback
      playInsightReveal();
      haptics.medium();

      // Hesitation detection — use signal data if available, fallback to manual
      const hasHesitation = responseTimeMs > q.hesitationThreshold;
      if (hasHesitation) {
        const seconds = Math.round(responseTimeMs / 1000);
        setCurrentHesitationText(
          popupInsight?.hesitationMessage ??
          `この質問に${seconds}秒かかりました。ここに迷いがある。`
        );
      } else {
        setCurrentHesitationText(null);
      }

      // Show behavioral insight popup if signal has interesting data
      if (popupInsight) {
        setBehavioralInsight(popupInsight);
        setShowBehavioralPopup(true);
        // Auto-hide popup (BehavioralInsightPopup handles its own dismiss,
        // but reset state after a delay to allow re-triggering)
        setTimeout(() => setShowBehavioralPopup(false), 4000);
      }

      setShowingInsight(true);

      // Store answer data for when we advance
      const newAnswer = {
        questionId: q.id,
        value: optionValue,
        insight: selected.insight,
        axes: selected.axes,
      };
      const updatedAnswers = [...microAnswers, newAnswer];

      // Merge axes
      const mergedAxes = { ...microAxes };
      for (const [key, val] of Object.entries(selected.axes)) {
        const k = key as TraitAxisKey;
        mergedAxes[k] = (mergedAxes[k] ?? 0) + val;
      }

      setMicroAnswers(updatedAnswers);
      setMicroAxes(mergedAxes);

      // Auto-advance after insight display
      const advanceDelay = hasHesitation ? 3500 : 2500;
      setTimeout(() => {
        setShowingInsight(false);
        setSelectedOptionValue(null);
        setCurrentInsightText("");
        setCurrentHesitationText(null);

        if (microIndex + 1 >= TOTAL_MICRO_QUESTIONS) {
          try {
            const glimpseResult = generateFirstGlimpse(mergedAxes);
            setGlimpse(glimpseResult);
            // Generate Impossible Accuracy insights from micro observation data
            try {
              const microData: MicroObservationData = {
                answers: updatedAnswers.map(a => ({
                  questionId: a.questionId,
                  selectedValue: a.value,
                  responseTimeMs: microTimings.find(t => t.questionId === a.questionId)?.responseTimeMs ?? 5000,
                  hoveredOptions: microTimings.find(t => t.questionId === a.questionId)?.hoveredOptions ?? [],
                })),
                accumulatedAxes: mergedAxes,
              };
              setImpossibleInsight(generateImpossibleAccuracy(microData));
            } catch { /* fallback: impossibleInsight stays null */ }
          } catch (err) {
            console.error("[Stargazer] Failed to generate first glimpse:", err);
            // Set a safe fallback glimpse so the flow can continue
            setGlimpse({
              coreNeed: "自己理解",
              coreNeedDescription: "あなた自身を知ろうとする力",
              convincedBy: "直感",
              stressResponse: "内省",
              blindSpotHint: "まだ見えていない部分がある",
              quoteText: "自分自身を知ることは、すべての知恵の始まりである",
              quoteAuthor: "アリストテレス",
            });
          }
          setTimeout(() => setPhase("first_glimpse"), 400);
        } else {
          setMicroIndex(microIndex + 1);
        }
      }, advanceDelay);
      } catch (err) {
        console.error("[Stargazer] handleMicroAnswer failed:", err);
        setShowingInsight(false);
        setSelectedOptionValue(null);
      }
    };

    const handleOptionHover = (value: string) => {
      if (!showingInsight && !hoveredOptionsDuringQ.includes(value)) {
        setHoveredOptionsDuringQ((prev) => [...prev, value]);
      }
      // Signal collector hover tracking
      signalOptionHover(value);
    };

    const handleOptionHoverEnd = (value: string) => {
      signalOptionHoverEnd(value);
    };

    return (
      <div className="relative min-h-[70vh] flex flex-col justify-center px-4">
        <CinematicParticles intensity={0.3} />
        <div className="absolute top-0 left-0 right-0 z-10 px-2">
          <StepProgressIndicator phase={phase} />
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {Array.from({ length: TOTAL_MICRO_QUESTIONS }, (_, i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: i === microIndex ? 24 : 6,
                height: 6,
                background:
                  i < microIndex
                    ? "rgba(190,170,110,0.45)"
                    : i === microIndex
                    ? "rgba(170,150,90,0.5)"
                    : "rgba(160,170,200,0.15)",
                transition: "all 0.4s ease",
                borderRadius: 3,
              }}
              layout
            />
          ))}
          <span
            className="font-mono-sg text-xs ml-3"
            style={{ color: "rgba(100,105,130,0.4)" }}
          >
            {microIndex + 1}/{TOTAL_MICRO_QUESTIONS}
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${q.id}-${microIndex}`}
            className="max-w-md mx-auto w-full space-y-8"
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.22 }}
          >
            {/* Question */}
            <h3
              className="font-display text-xl text-center leading-relaxed"
              style={{ color: "rgba(30,35,55,0.85)" }}
            >
              {q.prompt}
            </h3>

            {/* Options */}
            <div className="space-y-3">
              {q.options.map((opt, i) => (
                <motion.button
                  key={opt.value}
                  onClick={() => handleMicroAnswer(opt.value)}
                  onMouseEnter={() => handleOptionHover(opt.value)}
                  onMouseLeave={() => handleOptionHoverEnd(opt.value)}
                  onTouchStart={() => handleOptionHover(opt.value)}
                  disabled={showingInsight}
                  className="w-full text-left px-5 py-4 rounded-2xl transition-all"
                  style={{
                    background:
                      selectedOptionValue === opt.value
                        ? "rgba(190,170,110,0.15)"
                        : "rgba(255,255,255,0.7)",
                    border:
                      selectedOptionValue === opt.value
                        ? "1px solid rgba(190,170,110,0.35)"
                        : "1px solid rgba(160,170,200,0.15)",
                    backdropFilter: "blur(12px)",
                    color:
                      showingInsight && selectedOptionValue !== opt.value
                        ? "rgba(30,35,55,0.35)"
                        : "rgba(30,35,55,0.8)",
                    opacity:
                      showingInsight && selectedOptionValue !== opt.value
                        ? 0.5
                        : 1,
                  }}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  whileHover={
                    showingInsight
                      ? {}
                      : {
                          background: "rgba(255,255,255,0.9)",
                          borderColor: "rgba(190,170,110,0.3)",
                          scale: 1.01,
                        }
                  }
                  whileTap={showingInsight ? {} : { scale: 0.98 }}
                >
                  <span className="font-display text-[15px]">{opt.label}</span>
                </motion.button>
              ))}
            </div>

            {/* Instant Micro-Insight (slides up after selection) */}
            <AnimatePresence>
              {showingInsight && currentInsightText && (
                <motion.div
                  className="mt-4 p-4 rounded-2xl"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(190,170,110,0.2)",
                    backdropFilter: "blur(12px)",
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, delay: 0.3 }}
                >
                  <TypewriterText
                    text={currentInsightText}
                    speed={30}
                    className="font-display text-sm leading-relaxed block"
                    style={{ color: "rgba(30,35,55,0.8)" }}
                  />
                  {currentHesitationText && (
                    <motion.p
                      className="mt-3 text-xs leading-relaxed"
                      style={{ color: "rgba(170,130,60,0.7)" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 }}
                    >
                      {currentHesitationText}
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        {/* Behavioral insight popup */}
        <BehavioralInsightPopup
          insight={behavioralInsight}
          visible={showBehavioralPopup}
        />
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: First Glimpse (the "wow" moment — dramatic behavioral reveal)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "first_glimpse" && glimpse) {
    // Behavioral data from timing
    const sortedByTime = [...microTimings].sort(
      (a, b) => b.responseTimeMs - a.responseTimeMs
    );
    const mostHesitatedQ = sortedByTime[0];
    const fastestQ = sortedByTime[sortedByTime.length - 1];

    // Map question IDs to axis names for behavioral insight
    const getAxisNameForQuestion = (qId: string): string => {
      if (qId === "magic_1") return "社会的接続の欲求";
      if (qId === "magic_2") return "内面の安定性";
      if (qId === "magic_3") return "矛盾への態度";
      return "深層の判断軸";
    };

    // Format timing for display
    const timingDisplay = microTimings.map((t, i) => ({
      label: `Q${i + 1}`,
      seconds: (t.responseTimeMs / 1000).toFixed(1),
      isMax: t.questionId === mostHesitatedQ?.questionId,
      isMin: t.questionId === fastestQ?.questionId && microTimings.length > 1,
    }));

    // Archetype preview from microAxes
    let previewArch: ReturnType<typeof resolveArchetype> | null = null;
    let previewDef: ReturnType<typeof getArchetypeByCode> | undefined = undefined;
    try {
      previewArch = resolveArchetype(microAxes);
      previewDef = getArchetypeByCode(previewArch.code);
    } catch (err) {
      console.error("[Stargazer] Failed to resolve archetype for preview:", err);
    }

    // ── Sub-phase: Behavioral Reveal ──
    if (glimpseSubPhase === "behavioral_reveal") {
      return (
        <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
          <CinematicParticles intensity={0.5} />

          <motion.div
            className="max-w-md mx-auto w-full space-y-8 text-center relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <motion.p
              className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
              style={{ color: "rgba(170,150,90,0.5)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              行動シグナル検出
            </motion.p>

            <motion.h2
              className="font-display text-xl leading-relaxed"
              style={{ color: "rgba(30,35,55,0.88)" }}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              あなたの「迷い方」を観測しました
            </motion.h2>

            {/* Response time bars */}
            <motion.div
              className="space-y-3 text-left"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              {timingDisplay.map((t, i) => (
                <motion.div
                  key={t.label}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 + i * 0.4 }}
                >
                  <span
                    className="font-mono-sg text-xs w-8 flex-shrink-0"
                    style={{ color: "rgba(120,110,80,0.6)" }}
                  >
                    {t.label}
                  </span>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden relative"
                    style={{ background: "rgba(160,170,200,0.08)" }}
                  >
                    <motion.div
                      className="h-full rounded-lg"
                      style={{
                        background: t.isMax
                          ? "linear-gradient(90deg, rgba(200,160,80,0.3), rgba(200,160,80,0.15))"
                          : t.isMin
                            ? "linear-gradient(90deg, rgba(100,180,160,0.3), rgba(100,180,160,0.15))"
                            : "linear-gradient(90deg, rgba(190,170,110,0.2), rgba(190,170,110,0.1))",
                      }}
                      initial={{ width: "0%" }}
                      animate={{
                        width: `${Math.min(100, (parseFloat(t.seconds) / Math.max(1, ...microTimings.map(m => m.responseTimeMs / 1000))) * 100)}%`,
                      }}
                      transition={{ delay: 1.4 + i * 0.4, duration: 0.4, ease: "easeOut" }}
                    />
                    <span
                      className="absolute right-2 top-1/2 -translate-y-1/2 font-mono-sg text-[11px]"
                      style={{
                        color: t.isMax
                          ? "rgba(180,130,40,0.7)"
                          : "rgba(100,105,130,0.5)",
                      }}
                    >
                      {t.seconds}秒
                    </span>
                  </div>
                  {t.isMax && (
                    <motion.span
                      className="font-mono-sg text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: "rgba(200,160,80,0.1)",
                        color: "rgba(180,130,40,0.7)",
                      }}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 2 + i * 0.4 }}
                    >
                      最も迷った
                    </motion.span>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* The "how does it know?" moment */}
            {mostHesitatedQ && (
              <motion.div
                className="p-5 rounded-2xl text-left"
                style={{
                  background: "rgba(200,160,80,0.06)",
                  border: "1px solid rgba(200,170,100,0.15)",
                  backdropFilter: "blur(8px)",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3, duration: 0.25 }}
              >
                <motion.p
                  className="font-display text-sm leading-relaxed"
                  style={{ color: "rgba(30,35,55,0.8)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 3.3 }}
                >
                  <TypewriterText
                    text={`Q${microTimings.indexOf(mostHesitatedQ) + 1}で最も長く迷った。これは「${getAxisNameForQuestion(mostHesitatedQ.questionId)}」があなたの核心に近いことを示している。`}
                    delay={3400}
                    speed={35}
                  />
                </motion.p>
                {fastestQ && fastestQ.questionId !== mostHesitatedQ.questionId && (
                  <motion.p
                    className="text-xs mt-3 leading-relaxed"
                    style={{ color: "rgba(100,105,130,0.55)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 4.8 }}
                  >
                    一方でQ{microTimings.indexOf(fastestQ) + 1}は即断した。迷わない領域にも、あなたの本質がある。
                  </motion.p>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      );
    }

    // ── Sub-phase: Analyzing (constellation forming) ──
    if (glimpseSubPhase === "analyzing") {
      return (
        <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
          <CinematicParticles intensity={0.3 + constellationProgress * 0.7} />

          <motion.div
            className="max-w-md mx-auto w-full text-center relative z-10 space-y-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            {/* Constellation forming SVG */}
            <motion.div className="flex justify-center">
              <svg width="200" height="200" viewBox="0 0 100 100">
                {/* Connecting lines — fade in as progress increases */}
                {constellationNodes.map((node, i) => {
                  const next = constellationNodes[(i + 1) % constellationNodes.length];
                  const lineProgress = Math.max(0, (constellationProgress - i * 0.1) / 0.15);
                  return (
                    <line
                      key={`line-${i}`}
                      x1={node.cx}
                      y1={node.cy}
                      x2={next.cx}
                      y2={next.cy}
                      stroke="rgba(190,170,110,0.3)"
                      strokeWidth="0.5"
                      opacity={Math.min(1, lineProgress)}
                    />
                  );
                })}
                {/* Cross connections */}
                {constellationProgress > 0.5 && constellationNodes.map((node, i) => {
                  if (i % 2 !== 0) return null;
                  const target = constellationNodes[(i + 3) % constellationNodes.length];
                  const lineProgress = Math.max(0, (constellationProgress - 0.5 - i * 0.05) / 0.2);
                  return (
                    <line
                      key={`cross-${i}`}
                      x1={node.cx}
                      y1={node.cy}
                      x2={target.cx}
                      y2={target.cy}
                      stroke="rgba(160,150,210,0.2)"
                      strokeWidth="0.3"
                      opacity={Math.min(1, lineProgress)}
                      strokeDasharray="2 2"
                    />
                  );
                })}
                {/* Star nodes */}
                {constellationNodes.map((node, i) => {
                  const nodeProgress = Math.max(0, (constellationProgress - i * 0.08) / 0.15);
                  const size = 1.5 + nodeProgress * 1.5;
                  return (
                    <g key={`star-${i}`}>
                      <circle
                        cx={node.cx}
                        cy={node.cy}
                        r={size + 3}
                        fill="rgba(190,170,110,0.06)"
                        opacity={Math.min(1, nodeProgress)}
                      />
                      <circle
                        cx={node.cx}
                        cy={node.cy}
                        r={size}
                        fill={
                          i === 0
                            ? "rgba(190,170,110,0.8)"
                            : i % 2 === 0
                              ? "rgba(160,150,210,0.7)"
                              : "rgba(150,180,200,0.6)"
                        }
                        opacity={Math.min(1, nodeProgress)}
                      />
                    </g>
                  );
                })}
                {/* Center glow */}
                {constellationProgress > 0.7 && (
                  <circle
                    cx="50"
                    cy="50"
                    r={8 + (constellationProgress - 0.7) * 20}
                    fill="rgba(190,170,110,0.04)"
                    opacity={constellationProgress - 0.7}
                  />
                )}
              </svg>
            </motion.div>

            <motion.p
              className="font-display text-lg"
              style={{ color: "rgba(30,35,55,0.7)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              観測データを読み解いています...
            </motion.p>

            <motion.p
              className="font-mono-sg text-xs"
              style={{ color: "rgba(120,110,80,0.4)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {constellationProgress < 0.3
                ? "応答パターンを読み取っています"
                : constellationProgress < 0.6
                  ? "行動特性のパターンを構成しています"
                  : constellationProgress < 0.9
                    ? "仮説アーキタイプを照合しています"
                    : "観測完了"}
            </motion.p>

            {/* Progress bar */}
            <div
              className="mx-auto rounded-full overflow-hidden"
              style={{ width: "60%", height: 3, background: "rgba(160,170,200,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${constellationProgress * 100}%`,
                  background: "linear-gradient(90deg, rgba(190,170,110,0.4), rgba(160,150,210,0.3))",
                }}
              />
            </div>
          </motion.div>
        </div>
      );
    }

    // ── Sub-phase: Archetype Reveal + Milestone + Streak ──
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
        <CinematicParticles intensity={1} />

        {/* Celebration overlay for milestone */}
        <CelebrationOverlay
          visible={showCelebration}
          title="「ぼんやり見えてきた」マイルストーン到達"
          subtitle="Stargazerの観測が始まった"
          theme="gold"
          duration={3000}
          onDismiss={() => setShowCelebration(false)}
          onSoundTrigger={playStarBorn}
        />

        <motion.div
          className="max-w-md mx-auto w-full space-y-7 text-center relative z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          {/* Archetype reveal with suspense */}
          <AnimatePresence mode="wait">
            {glimpseSubPhase === "archetype_reveal" && (
              <motion.div
                key="archetype"
                className="space-y-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <motion.p
                  className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: "rgba(170,150,90,0.5)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  仮説アーキタイプ
                </motion.p>

                {/* Archetype emoji + name with dramatic spring */}
                <motion.div
                  className="space-y-2"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.6, type: "spring", damping: 10 }}
                >
                  <div className="text-4xl">{previewDef?.emoji ?? "---"}</div>
                  <h2
                    className="font-display text-2xl font-semibold"
                    style={{ color: "rgba(30,35,55,0.9)" }}
                  >
                    あなたの仮説像:
                  </h2>
                  <motion.p
                    className="font-display text-xl"
                    style={{ color: "rgba(170,150,90,0.9)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                  >
                    {previewDef?.name ?? previewArch?.code ?? "---"}
                  </motion.p>
                </motion.div>

                {/* Confidence — intentionally low */}
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.5 }}
                >
                  <div className="flex items-baseline justify-center gap-2">
                    <span
                      className="font-mono-sg text-xs tracking-wide"
                      style={{ color: "rgba(120,110,80,0.6)" }}
                    >
                      確信度:
                    </span>
                    <span
                      className="font-display text-3xl tabular-nums"
                      style={{ color: "rgba(170,150,90,0.85)" }}
                    >
                      {meterValue}%
                    </span>
                  </div>
                  <div
                    className="mx-auto rounded-full overflow-hidden"
                    style={{ width: "70%", height: 5, background: "rgba(160,170,200,0.1)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, rgba(190,170,110,0.6), rgba(170,150,90,0.3))",
                      }}
                      initial={{ width: "0%" }}
                      animate={{ width: "12%" }}
                      transition={{ delay: 1.5, duration: 2, ease: "easeOut" }}
                    />
                  </div>
                  <motion.p
                    className="text-xs leading-relaxed"
                    style={{ color: "rgba(100,105,130,0.55)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2.5 }}
                  >
                    まだ88%は未知の領域。ここからが、本当の観測です。
                  </motion.p>
                </motion.div>

                {/* Core insight cards */}
                <motion.div
                  className="space-y-3 text-left"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 3 }}
                >
                  {[
                    {
                      label: "あなたの核",
                      value: glimpse.coreNeed,
                      description: glimpse.coreNeedDescription,
                      accent: "rgba(170,150,90,0.1)",
                      border: "rgba(190,170,110,0.18)",
                    },
                    {
                      label: "確信の源",
                      value: glimpse.convincedBy,
                      description: `何かを決めるとき「${glimpse.convincedBy}」に頼りやすい`,
                      accent: "rgba(160,150,210,0.06)",
                      border: "rgba(170,160,210,0.15)",
                    },
                    {
                      label: "圧がかかると",
                      value: glimpse.stressResponse,
                      description: `追い込まれると「${glimpse.stressResponse}」になりやすい`,
                      accent: "rgba(150,180,200,0.06)",
                      border: "rgba(160,180,210,0.15)",
                    },
                  ].map((card, i) => (
                    <motion.div
                      key={card.label}
                      className="p-3.5 rounded-2xl"
                      style={{
                        background: card.accent,
                        border: `1px solid ${card.border}`,
                        backdropFilter: "blur(8px)",
                      }}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 3.2 + i * 0.3, duration: 0.22 }}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className="font-mono-sg text-[10px] tracking-[0.15em] uppercase"
                          style={{ color: "rgba(120,110,80,0.5)" }}
                        >
                          {card.label}
                        </span>
                        <span
                          className="font-display text-sm"
                          style={{ color: "rgba(30,35,55,0.85)" }}
                        >
                          {card.value}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(60,65,85,0.5)" }}>
                        {card.description}
                      </p>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Blind spot tease */}
                <motion.div
                  className="p-3.5 rounded-2xl text-left"
                  style={{
                    background: "rgba(180,60,60,0.03)",
                    border: "1px solid rgba(200,100,100,0.1)",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 4.2 }}
                >
                  <span
                    className="font-mono-sg text-[10px] tracking-[0.15em] uppercase block mb-1"
                    style={{ color: "rgba(180,100,100,0.45)" }}
                  >
                    自分では気づきにくいところ
                  </span>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(60,50,50,0.55)" }}>
                    {glimpse.blindSpotHint}
                  </p>
                </motion.div>

                {/* Milestone button — triggers celebration + advance */}
                <motion.button
                  onClick={() => {
                    setShowCelebration(true);
                    haptics.heavy();
                    setTimeout(() => setGlimpseSubPhase(impossibleInsight ? "impossible_accuracy" : "milestone"), 3200);
                  }}
                  className="font-display text-sm tracking-[0.1em] px-10 py-3.5 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(170,150,90,0.15), rgba(160,150,200,0.08))",
                    border: "1px solid rgba(190,170,110,0.25)",
                    color: "rgba(100,90,60,0.8)",
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 4.8 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  もっと深く覗いてみる
                </motion.button>
              </motion.div>
            )}

            {/* Impossible Accuracy — 不可能な精度の瞬間 */}
            {glimpseSubPhase === "impossible_accuracy" && impossibleInsight && (
              <motion.div
                key="impossible-accuracy"
                className="space-y-6 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <motion.p
                  className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: "rgba(139,92,246,0.6)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  深層分析完了
                </motion.p>

                {/* パンチライン */}
                <motion.h2
                  className="font-display text-lg leading-relaxed"
                  style={{ color: "rgba(30,35,55,0.9)" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 1 }}
                >
                  {impossibleInsight.punchLine}
                </motion.h2>

                {/* 3つの洞察を段階的に表示 */}
                <div className="space-y-4 text-left">
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 2 }}
                    style={{
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(239,68,68,0.05)",
                      border: "1px solid rgba(239,68,68,0.1)",
                    }}
                  >
                    <div className="font-mono-sg text-[8px] tracking-[0.2em]" style={{ color: "rgba(239,68,68,0.6)", marginBottom: 4 }}>つい避けてしまうこと</div>
                    <div style={{ fontSize: 12, color: "rgba(30,35,55,0.8)", lineHeight: 1.6 }}>
                      {impossibleInsight.avoidance.text}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 3.5 }}
                    style={{
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(99,102,241,0.05)",
                      border: "1px solid rgba(99,102,241,0.1)",
                    }}
                  >
                    <div className="font-mono-sg text-[8px] tracking-[0.2em]" style={{ color: "rgba(99,102,241,0.6)", marginBottom: 4 }}>本当はほしいもの</div>
                    <div style={{ fontSize: 12, color: "rgba(30,35,55,0.8)", lineHeight: 1.6 }}>
                      {impossibleInsight.latentDesire.text}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 5 }}
                    style={{
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(139,92,246,0.05)",
                      border: "1px solid rgba(139,92,246,0.1)",
                    }}
                  >
                    <div className="font-mono-sg text-[8px] tracking-[0.2em]" style={{ color: "rgba(139,92,246,0.6)", marginBottom: 4 }}>自分の中の矛盾</div>
                    <div style={{ fontSize: 12, color: "rgba(30,35,55,0.8)", lineHeight: 1.6 }}>
                      {impossibleInsight.contradictionSeed.text}
                    </div>
                  </motion.div>
                </div>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 7 }}
                  onClick={() => setGlimpseSubPhase("milestone")}
                  className="mt-4 font-display text-sm tracking-[0.15em] px-8 py-3 rounded-xl"
                  style={{
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.2)",
                    color: "rgba(100,70,200,0.8)",
                  }}
                >
                  さらに深く
                </motion.button>
              </motion.div>
            )}

            {/* Milestone + Streak Preview sub-phase */}
            {(glimpseSubPhase === "milestone" || glimpseSubPhase === "streak_preview") && (
              <motion.div
                key="milestone-streak"
                className="space-y-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {/* Streak path preview */}
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.p
                    className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
                    style={{ color: "rgba(170,150,90,0.5)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    観測の旅路
                  </motion.p>

                  <motion.h3
                    className="font-display text-lg"
                    style={{ color: "rgba(30,35,55,0.88)" }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    1日目の観測者
                  </motion.h3>

                  {/* 5 streak levels as path */}
                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                  >
                    {STREAK_LEVELS.map((level: StreakLevelInfo, i: number) => {
                      const isCurrent = i === 0;
                      return (
                        <motion.div
                          key={level.level}
                          className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                          style={{
                            background: isCurrent
                              ? "rgba(190,170,110,0.1)"
                              : "rgba(160,170,200,0.04)",
                            border: isCurrent
                              ? "1px solid rgba(190,170,110,0.2)"
                              : "1px solid rgba(160,170,200,0.08)",
                            opacity: isCurrent ? 1 : 0.5,
                          }}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{
                            opacity: isCurrent ? 1 : 0.4,
                            x: 0,
                          }}
                          transition={{ delay: 1.2 + i * 0.06 }}
                        >
                          {/* Level indicator */}
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isCurrent
                                ? "rgba(190,170,110,0.2)"
                                : "rgba(160,170,200,0.08)",
                              border: isCurrent
                                ? "1.5px solid rgba(190,170,110,0.4)"
                                : "1px solid rgba(160,170,200,0.12)",
                            }}
                          >
                            <span
                              className="font-mono-sg text-[10px]"
                              style={{
                                color: isCurrent
                                  ? "rgba(170,150,90,0.8)"
                                  : "rgba(120,125,140,0.4)",
                              }}
                            >
                              {level.requiredDays}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-display text-sm"
                                style={{
                                  color: isCurrent
                                    ? "rgba(30,35,55,0.85)"
                                    : "rgba(30,35,55,0.4)",
                                }}
                              >
                                {level.nameJa}
                              </span>
                              {isCurrent && (
                                <span
                                  className="font-mono-sg text-[9px] px-1.5 py-0.5 rounded-full"
                                  style={{
                                    background: "rgba(190,170,110,0.15)",
                                    color: "rgba(170,150,90,0.7)",
                                  }}
                                >
                                  now
                                </span>
                              )}
                            </div>
                            <p
                              className="text-[11px] leading-tight mt-0.5 truncate"
                              style={{
                                color: isCurrent
                                  ? "rgba(60,65,85,0.5)"
                                  : "rgba(60,65,85,0.3)",
                              }}
                            >
                              {level.description}
                            </p>
                          </div>

                          {/* Days */}
                          <span
                            className="font-mono-sg text-[10px] flex-shrink-0"
                            style={{
                              color: isCurrent
                                ? "rgba(170,150,90,0.6)"
                                : "rgba(120,125,140,0.3)",
                            }}
                          >
                            {level.requiredDays}日
                          </span>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  <motion.p
                    className="text-xs leading-relaxed text-center"
                    style={{ color: "rgba(100,105,130,0.5)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2.2 }}
                  >
                    3日続けると、見える景色が変わり始めます
                  </motion.p>
                </motion.div>

                {/* Quote */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.5 }}
                >
                  <p
                    className="font-display text-sm italic leading-relaxed"
                    style={{ color: "rgba(60,65,85,0.35)" }}
                  >
                    &ldquo;{glimpse.quoteText}&rdquo;
                  </p>
                  <p
                    className="font-mono-sg text-[10px] mt-1"
                    style={{ color: "rgba(100,105,130,0.3)" }}
                  >
                    --- {glimpse.quoteAuthor}
                  </p>
                </motion.div>

                <motion.button
                  onClick={() => setPhase("depth_explanation")}
                  className="font-display text-sm tracking-[0.1em] px-10 py-3.5 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(170,150,90,0.18), rgba(160,150,200,0.1))",
                    border: "1px solid rgba(190,170,110,0.25)",
                    color: "rgba(100,90,60,0.85)",
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.8 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  観測を続ける
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Depth Explanation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "depth_explanation") {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
        <CinematicParticles intensity={0.4} />

        <motion.div
          className="max-w-md mx-auto w-full space-y-10 relative z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="text-center space-y-3">
            <motion.h3
              className="font-display text-xl"
              style={{ color: "rgba(30,35,55,0.85)" }}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              観測には「深度」がある
            </motion.h3>
            <motion.p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(60,65,85,0.55)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              観測を重ねるほど、あなたの見えない部分が浮かび上がる。
            </motion.p>
          </div>

          {/* Depth visualization */}
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            {[
              {
                depth: "表層",
                label: "性格の傾向",
                description: "外から見える行動パターン",
                width: "30%",
                color: "rgba(190,170,110,0.5)",
                bgColor: "rgba(190,170,110,0.06)",
                achieved: true,
              },
              {
                depth: "中層",
                label: "判断の癖と恐れの形",
                description: "なぜそう動くのか、何を避けているのか",
                width: "60%",
                color: "rgba(160,150,210,0.5)",
                bgColor: "rgba(160,150,210,0.06)",
                achieved: false,
              },
              {
                depth: "深層",
                label: "無自覚な欲求と矛盾",
                description: "自分でも知らない自分の法則",
                width: "90%",
                color: "rgba(120,130,180,0.4)",
                bgColor: "rgba(120,130,180,0.06)",
                achieved: false,
              },
            ].map((level, i) => (
              <motion.div
                key={level.depth}
                className="p-4 rounded-2xl relative overflow-hidden"
                style={{
                  background: level.bgColor,
                  border: `1px solid ${level.color.replace(/[\d.]+\)$/, "0.15)")}`,
                }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 + i * 0.3, duration: 0.22 }}
              >
                {/* Depth bar */}
                <div
                  className="absolute bottom-0 left-0 h-0.5"
                  style={{ width: level.width, background: level.color }}
                />
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-mono-sg text-[10px] tracking-[0.15em] uppercase"
                        style={{ color: level.color }}
                      >
                        {level.depth}
                      </span>
                      {level.achieved && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(190,170,110,0.1)", color: "rgba(170,150,90,0.6)" }}
                        >
                          now
                        </span>
                      )}
                    </div>
                    <p className="font-display text-sm" style={{ color: "rgba(30,35,55,0.8)" }}>
                      {level.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(60,65,85,0.45)" }}>
                      {level.description}
                    </p>
                  </div>
                  {!level.achieved && (
                    <span
                      className="font-mono-sg text-[10px]"
                      style={{ color: "rgba(120,125,140,0.35)" }}
                    >
                      未到達
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.button
            onClick={() => setPhase("alter_tease")}
            className="w-full font-display text-sm tracking-[0.1em] px-8 py-3.5 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(160,170,200,0.2)",
              color: "rgba(30,35,55,0.7)",
              backdropFilter: "blur(12px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            次へ
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Alter Tease (shadow self preview)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "alter_tease") {
    // Generate dynamic Alter message based on Q3 contradiction behavior
    const q1Value = microAnswers[0]?.value ?? "";
    const q3Value = microAnswers[2]?.value ?? "";

    const getAlterContradictionRef = (): string => {
      // Introvert who responded to someone in need
      if ((q1Value === "hesitate" || q1Value === "deflect") && q3Value === "respond") {
        return "自分の時間を守ると言いながら、誰かの痛みには動いたこと、気づいてる？";
      }
      if ((q1Value === "hesitate" || q1Value === "deflect") && q3Value === "freeze") {
        return "また揺れたね。でもその「揺れ」こそ、あなたが冷たくない証拠だと思う。";
      }
      if ((q1Value === "hesitate" || q1Value === "deflect") && q3Value === "delay") {
        return "境界線は完璧。でも本当は、飛び越えたい夜もあるんじゃない？";
      }
      // Extrovert who wanted solitude
      if (q1Value === "instant" && (q3Value === "escape_softly" || q3Value === "confess")) {
        return "人が好きなはずのあなたが、一人になりたいと感じた。その矛盾が面白い。";
      }
      if (q1Value === "instant" && q3Value === "ignore") {
        return "暗い自分に気づかないふりをした。でも私には見えてるよ。";
      }
      if (q1Value === "instant" && q3Value === "push_through") {
        return "「楽しまなきゃ」って自分を追い込むの、疲れない？";
      }
      // Selective who broke their own rules
      if (q1Value === "selective" && q3Value === "seek_company") {
        return "普段は人を選ぶのに、空白の前では誰かを求めた。条件って、案外脆いね。";
      }
      if (q1Value === "selective" && q3Value === "anxiety") {
        return "判断基準がないと不安になる——つまりあなたの安心は「選べること」そのものにある。";
      }
      // Default
      return "3つの答えの中に、あなた自身も気づいていない矛盾がある。";
    };

    const alterRef = getAlterContradictionRef();

    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
        {/* Dark particles for Alter */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 25 }, (_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${(i * 41 + 17) % 100}%`,
                top: `${(i * 59 + 11) % 100}%`,
                width: 1.5 + (i % 3),
                height: 1.5 + (i % 3),
                background: `rgba(100,80,140,${0.15 + (i % 5) * 0.06})`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.1, 0.4, 0.1],
              }}
              transition={{
                duration: 4 + (i % 4),
                delay: (i % 7) * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        <motion.div
          className="max-w-md mx-auto w-full text-center space-y-8 relative z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
        >
          {/* Mirrored orbs */}
          <motion.div
            className="flex justify-center items-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <BreathingOrb size={50} color="rgba(190,170,110,0.25)" />
            <motion.div
              className="w-px h-16"
              style={{ background: "linear-gradient(180deg, transparent, rgba(120,100,160,0.2), transparent)" }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 1, duration: 0.4 }}
            />
            <motion.div
              className="relative"
              style={{ width: 50, height: 50 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 1 }}
            >
              {/* Alter orb -- inverted, dark */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: "rgba(80,60,130,0.2)", filter: "blur(16px)" }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute rounded-full"
                style={{
                  top: "25%", left: "25%", width: "50%", height: "50%",
                  background: "rgba(80,60,130,0.3)", filter: "blur(4px)",
                }}
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>

          <motion.div
            className="space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2, duration: 0.4 }}
          >
            <p
              className="font-mono-sg text-[10px] tracking-[0.3em] uppercase"
              style={{ color: "rgba(120,100,160,0.45)" }}
            >
              Alter --- もうひとりの自分
            </p>

            {/* Alter personality preview */}
            <motion.p
              className="text-xs leading-relaxed text-center max-w-xs mx-auto"
              style={{ color: "rgba(100,90,140,0.5)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.3 }}
            >
              あなたのAlterが形を成し始めました。まだ輪郭だけ。
              <br />
              観測を重ねるほど、Alterはあなたの深層を正確に映していきます。
            </motion.p>

            {/* Alter's first message — dynamic, referencing Q3 contradiction */}
            <div
              className="p-5 rounded-2xl text-left mx-auto max-w-sm"
              style={{
                background: "rgba(80,60,130,0.06)",
                border: "1px solid rgba(120,100,160,0.15)",
                backdropFilter: "blur(8px)",
              }}
            >
              <motion.p
                className="font-display text-sm leading-relaxed"
                style={{ color: "rgba(60,50,80,0.75)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3, duration: 0.25 }}
              >
                {`「はじめまして。あなたの"影"です。`}
              </motion.p>
              <motion.p
                className="font-display text-sm leading-relaxed mt-2"
                style={{ color: "rgba(60,50,80,0.65)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 4, duration: 0.25 }}
              >
                3つの質問だけじゃ、まだあなたのことは分からない。
              </motion.p>
              <motion.p
                className="font-display text-sm leading-relaxed mt-2"
                style={{ color: "rgba(80,60,130,0.8)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 5.5, duration: 0.25 }}
              >
                でも1つだけ——{alterRef}
              </motion.p>
              <motion.p
                className="font-display text-sm leading-relaxed mt-3"
                style={{ color: "rgba(60,50,80,0.6)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 7.5, duration: 0.25 }}
              >
                ——もう少し、話してみる？」
              </motion.p>
            </div>
          </motion.div>

          <motion.button
            onClick={() => setPhase("ready_gate")}
            className="font-display text-sm tracking-[0.1em] px-10 py-3.5 rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(80,60,130,0.12), rgba(120,100,160,0.06))",
              border: "1px solid rgba(120,100,160,0.2)",
              color: "rgba(60,50,80,0.8)",
              backdropFilter: "blur(12px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 8.5 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            Alterとの対話へ
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Ready Gate (commitment point)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "ready_gate") {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
        <CinematicParticles intensity={0.5} />

        <motion.div
          className="max-w-md mx-auto w-full text-center space-y-10 relative z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12 }}
          >
            <BreathingOrb size={50} color="rgba(190,170,110,0.2)" />
          </motion.div>

          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h3
              className="font-display text-xl"
              style={{ color: "rgba(30,35,55,0.88)" }}
            >
              ここから、本格的な深層観測に入ります
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(60,65,85,0.55)" }}
            >
              あなたの深層にある判断原理・反応パターン・
              関係性の傾向を、約100の問いで覗いていきます。
            </p>
          </motion.div>

          <motion.div
            className="space-y-3 text-left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {[
              { icon: "1", text: "今の状態を記録する", sub: "同じ問いでも、状態によって答えは変わる" },
              { icon: "2", text: "35の問いで核を見つける", sub: "あなたの原型(アーキタイプ)を浮かび上がらせる" },
              { icon: "3", text: "関係性を深掘りする", sub: "恋愛・友情・家族・共創の6領域を観測" },
            ].map((item, i) => (
              <motion.div
                key={item.text}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(160,170,200,0.12)",
                  backdropFilter: "blur(8px)",
                }}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.06 }}
              >
                <span
                  className="font-mono-sg text-xs w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5"
                  style={{
                    background: "rgba(190,170,110,0.1)",
                    color: "rgba(170,150,90,0.6)",
                  }}
                >
                  {item.icon}
                </span>
                <div>
                  <span className="font-display text-sm block" style={{ color: "rgba(30,35,55,0.8)" }}>
                    {item.text}
                  </span>
                  <span className="text-xs" style={{ color: "rgba(60,65,85,0.45)" }}>
                    {item.sub}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
          >
            <button
              onClick={() => setPhase("state_capture")}
              className="w-full py-4 rounded-xl font-display text-base tracking-wide transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(170,150,90,0.18), rgba(160,150,200,0.1))",
                border: "1px solid rgba(190,170,110,0.25)",
                color: "rgba(80,70,40,0.85)",
              }}
            >
              深層観測を始める
            </button>
            <p className="text-xs text-center" style={{ color: "rgba(100,105,130,0.4)" }}>
              約20-30分 / いつでも中断・再開できます
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: State Capture (original, refined)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "state_capture") {
    const steps = [
      {
        label: "エネルギー",
        subtext: "今のエネルギーレベルは？",
        options: ENERGY_OPTIONS,
        selected: stateEnergy,
        onSelect: (v: string) => { setStateEnergy(v as EnergyLevel); setStateCaptureStep(1); },
      },
      {
        label: "気分",
        subtext: "今の気持ちに一番近いのは？",
        options: EMOTION_OPTIONS,
        selected: stateEmotion,
        onSelect: (v: string) => { setStateEmotion(v as EmotionalTone); setStateCaptureStep(2); },
      },
      {
        label: "環境",
        subtext: "今の周りの状況は？",
        options: SOCIAL_OPTIONS,
        selected: stateSocial,
        onSelect: (v: string) => setStateSocial(v as SocialContext),
      },
    ];

    const currentStep = steps[stateCaptureStep];

    return (
      <div className="space-y-5">
        <StepProgressIndicator phase={phase} />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <span className="text-section-header">状態記録</span>
          <p className="font-display text-base mt-2" style={{ color: "rgba(30,35,55,0.85)" }}>
            まず、今この瞬間の自分を記録します
          </p>
        </motion.div>

        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i <= stateCaptureStep ? "32px" : "16px",
                  background: i < stateCaptureStep
                    ? "rgba(170,150,90,0.5)"
                    : i === stateCaptureStep
                      ? "rgba(139,92,246,0.5)"
                      : "rgba(160,170,200,0.15)",
                }}
              />
            </div>
          ))}
          <span className="font-mono-sg text-xs ml-auto" style={{ color: "rgba(80,85,105,0.55)" }}>
            {stateCaptureStep + 1}/3
          </span>
        </div>

        {currentStep && (
          <AnimatePresence mode="wait">
            <motion.div
              key={stateCaptureStep}
              className="card-instrument"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-start gap-2 mb-4">
                <h3 className="font-display text-base font-medium" style={{ color: "rgba(30,35,55,0.88)" }}>
                  {currentStep.subtext}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentStep.options.map((opt) => {
                  const isSelected = currentStep.selected === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => currentStep.onSelect(opt.value)}
                      className="px-4 py-2.5 rounded-xl transition-all text-sm"
                      style={{
                        background: isSelected ? "rgba(120,80,230,0.12)" : "rgba(255,255,255,0.95)",
                        border: isSelected ? "1px solid rgba(120,80,230,0.35)" : "1px solid rgba(140,150,180,0.22)",
                        color: isSelected ? "rgba(20,25,45,0.95)" : "rgba(30,35,55,0.78)",
                        boxShadow: isSelected ? "0 1px 6px rgba(120,80,230,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
                      }}
                    >
                      <span className="mr-1.5">{opt.icon}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {stateEnergy && stateEmotion && stateSocial && (
          <motion.button
            onClick={() => setPhase("core_questions")}
            className="btn-primary-sg w-full py-4 text-base tracking-wide"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            この状態で観測に入る
          </motion.button>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Core Questions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "core_questions") {
    return (
      <div className="relative">
        <StepProgressIndicator phase={phase} />
        <div className="mb-4">
          <span className="text-section-header">深層観測 --- 核の検出</span>
          <p className="text-xs mt-1" style={{ color: "rgba(70,75,100,0.6)" }}>
            あなたの核を見つける51の問い
          </p>
        </div>
        <QuestionFlow
          onComplete={(result: ResolvedResult, answers: QuestionAnswer[]) => {
            clearInitialProgress();
            setCoreResult(result);
            setCoreAnswers(answers);
            setResumeData(null);
            setPhase("core_report");
          }}
          onQuestionAnswered={(count, answers) => {
            // localStorage に途中経過を保存（再訪復元用）
            saveInitialProgress({
              currentIndex: count, // 次に答える問のインデックス
              answers,
              savedAt: Date.now(),
            });

            // 15問以上回答 かつ confidence > 0.15 の場合のみ仮説タイプを表示
            // 5問での推定は精度が低すぎてブレの原因になるため廃止
            if (count === 15 && !emergingTypeShown.current) {
              emergingTypeShown.current = true;
              try {
                const partialScores = calculateAxisScores(answers);
                const arch = resolveArchetype(partialScores);
                if (arch.confidence >= 0.15) {
                  const def = getArchetypeByCode(arch.code);
                  if (def) {
                    setEmergingTypeName(def.name);
                    setEmergingTypeEmoji(def.emoji ?? "");
                    setShowEmergingType(true);
                    haptics.light();
                  }
                }
              } catch {
                // silently skip on error
              }
            }
          }}
          resumeFromIndex={resumeData?.currentIndex}
          resumeAnswers={resumeData?.answers}
        />

        {/* Emerging Type Preview overlay */}
        <AnimatePresence>
          {showEmergingType && (
            <motion.div
              className="absolute inset-0 z-50 flex items-center justify-center"
              style={{ background: "rgba(15,18,30,0.75)", backdropFilter: "blur(12px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                className="text-center space-y-4 px-8"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Star particles */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {Array.from({ length: 20 }, (_, i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${(i * 37 + 13) % 100}%`,
                        top: `${(i * 53 + 7) % 100}%`,
                        width: 1.5 + (i % 3),
                        height: 1.5 + (i % 3),
                        background: `rgba(190,170,110,${0.2 + (i % 4) * 0.1})`,
                      }}
                      animate={{
                        y: [0, -20 - (i % 15), 0],
                        opacity: [0.15, 0.6, 0.15],
                      }}
                      transition={{
                        duration: 2 + (i % 3),
                        delay: (i * 0.15) % 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>

                <motion.p
                  className="font-display text-sm tracking-[0.2em]"
                  style={{ color: "rgba(190,170,110,0.7)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  あなたのタイプが見え始めています...
                </motion.p>

                {emergingTypeEmoji && (
                  <motion.div
                    className="text-4xl"
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.5, type: "spring", damping: 10 }}
                  >
                    {emergingTypeEmoji}
                  </motion.div>
                )}

                <motion.p
                  className="font-display text-lg"
                  style={{ color: "rgba(230,225,210,0.9)" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <span style={{ color: "rgba(190,170,110,0.9)" }}>{emergingTypeName}</span>
                  {" "}に近づいています
                </motion.p>

                {/* Progress bar auto-dismiss indicator */}
                <motion.div
                  className="mx-auto mt-4 h-0.5 rounded-full"
                  style={{ background: "rgba(190,170,110,0.15)", width: 120 }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "rgba(190,170,110,0.5)" }}
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3, ease: "linear" }}
                  />
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Rendezvous Transition
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "core_report" && coreResult) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-4"
      >
        <ObservationReportCard
          result={coreResult}
          answeredCount={coreAnswers.length}
          totalQuestions={51}
          onClose={() => {
            // Phase 1 完了 → ベイズ統合して結果表示
            computePhase1Result();
          }}
        />
      </motion.div>
    );
  }

  if (phase === "rendezvous_transition") {
    return (
      <motion.div
        className="space-y-6 py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <StepProgressIndicator phase={phase} />
        <div className="text-center space-y-4">
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" }}
          >
            <BreathingOrb size={50} color="rgba(160,150,210,0.2)" />
          </motion.div>
          <h3 className="font-display text-lg" style={{ color: "rgba(30,35,55,0.88)" }}>
            関係性の深層を観測します
          </h3>
          <p className="text-sm max-w-xs mx-auto" style={{ color: "rgba(60,65,85,0.68)" }}>
            恋愛・友情・共創・家族・結婚相手 --- 6つの領域で、人との関わり方の中に現れる「もう一人の自分」を覗いていきます。
          </p>

          {/* Context badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {(["general", "romantic", "friendship", "cocreation", "family", "spouse"] as const).map((ctx) => {
              const display = CONTEXT_DISPLAY[ctx];
              return (
                <span
                  key={ctx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-display"
                  style={{
                    background: display.color.replace(/[\d.]+\)$/, "0.08)"),
                    border: `1px solid ${display.color.replace(/[\d.]+\)$/, "0.2)")}`,
                    color: display.color,
                  }}
                >
                  {display.emoji} {display.label}
                </span>
              );
            })}
          </div>
        </div>

        <motion.button
          onClick={() => {
            setShowChapterIntro(true);
            const initialQueue = [...RENDEZVOUS_QUESTIONS_V2];
            setRvQueue(initialQueue);
            setRvQueueIndex(0);
            setTotalExpectedQuestions(initialQueue.length);
            rvStartRef.current = Date.now();
            setPhase("rendezvous_questions");
          }}
          className="btn-primary-sg w-full py-4 text-base tracking-wide"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          関係性の観測を始める
        </motion.button>
      </motion.div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Rendezvous V2 Questions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (phase === "rendezvous_questions") {
    const currentQ = rvQueue[rvQueueIndex];
    if (!currentQ) return null;

    const currentChapter = currentQ.chapter;
    const chapterInfo = RENDEZVOUS_CHAPTERS_V2.find((c) => c.key === currentChapter);

    const isFollowUpQuestion = currentQ.id.startsWith("rv_fu_");
    const isFirstInChapter =
      rvQueueIndex === 0 || rvQueue[rvQueueIndex - 1]?.chapter !== currentChapter;

    // ── 深呼吸の間（チャプター境界） ──
    if (rvEngagementPhase === "deep_breath") {
      return (
        <AnimatePresence mode="wait">
          <DeepBreathTransition
            key={`rv_breath_${rvQueueIndex}`}
            message="少し、息を吸って。"
            durationMs={5000}
            onComplete={() => setRvEngagementPhase("chapter_intro")}
          />
        </AnimatePresence>
      );
    }

    // ── マイクロ・リヴィール（5問ごと） ──
    if (rvEngagementPhase === "micro_reveal") {
      const allAnswersForReveal = [...coreAnswers, ...rvAnswers];
      const reveal = generateReveal(allAnswersForReveal, 35 + totalExpectedQuestions);
      return (
        <AnimatePresence mode="wait">
          <MicroRevealCard
            key={`rv_reveal_${rvAnswers.length}`}
            message={reveal.message}
            phase={reveal.phase}
            archetypeHint={reveal.archetypeHint}
            onContinue={() => setRvEngagementPhase("questioning")}
          />
        </AnimatePresence>
      );
    }

    // ── 鏡の問い（15問ごと） ──
    if (rvEngagementPhase === "mirror_question") {
      const allAnswersForMirror = [...coreAnswers, ...rvAnswers];
      const profileText = generateMirrorProfile(allAnswersForMirror);
      return (
        <AnimatePresence mode="wait">
          <MirrorQuestionCard
            key={`rv_mirror_${rvAnswers.length}`}
            profileText={profileText}
            onAnswer={() => setRvEngagementPhase("questioning")}
          />
        </AnimatePresence>
      );
    }

    // ── ビジュアル・チョイス ──
    if (rvEngagementPhase === "visual_choice") {
      // RVフェーズはvc_02〜vc_05（vc_01はcoreフェーズで使用済み）
      const VISUAL_CHOICE_PAIRS_RV = [
        { id: "vc_02", axes: ["introvert_vs_extrovert"], imageA: "/stargazer/visual-choice/vc_02_a.webp", imageB: "/stargazer/visual-choice/vc_02_b.webp", axisWeightA: -0.5, axisWeightB: 0.5 },
        { id: "vc_03", axes: ["analytical_vs_intuitive"], imageA: "/stargazer/visual-choice/vc_03_a.webp", imageB: "/stargazer/visual-choice/vc_03_b.webp", axisWeightA: -0.5, axisWeightB: 0.5 },
        { id: "vc_04", axes: ["individual_vs_social"], imageA: "/stargazer/visual-choice/vc_04_a.webp", imageB: "/stargazer/visual-choice/vc_04_b.webp", axisWeightA: -0.5, axisWeightB: 0.5 },
        { id: "vc_05", axes: ["tradition_vs_novelty"], imageA: "/stargazer/visual-choice/vc_05_a.webp", imageB: "/stargazer/visual-choice/vc_05_b.webp", axisWeightA: -0.5, axisWeightB: 0.5 },
      ];
      const pair = VISUAL_CHOICE_PAIRS_RV[rvVisualChoiceIdx];
      if (!pair) {
        setRvEngagementPhase("questioning");
        return null;
      }
      return (
        <AnimatePresence mode="wait">
          <VisualChoiceCard
            key={`rv_vc_${pair.id}`}
            pair={pair}
            onAnswer={() => {
              setRvVisualChoiceIdx((prev) => prev + 1);
              setRvEngagementPhase("micro_reveal");
            }}
          />
        </AnimatePresence>
      );
    }

    // ── Cognitive Fit 質問（RVフェーズ内） ──
    if (rvEngagementPhase === "cognitive_fit" || rvEngagementPhase === "cognitive_fit_branch") {
      const cfQ = rvCfQueue[rvCfQueueIdx];
      if (!cfQ) {
        setRvEngagementPhase("micro_reveal");
        return null;
      }
      const coreCount = 51;
      const cfDepth = calculateDepth(coreCount + rvQueueIndex, coreCount + totalExpectedQuestions);
      return (
        <div className="space-y-4 py-4 px-4">
          <DepthMeter currentDepth={cfDepth.level} layerProgress={cfDepth.layerProgress} />
          <AnimatePresence mode="wait">
            <CognitiveQuestionCard
              key={cfQ.id}
              question={cfQ}
              onAnswer={(answer: CfAnswer) => {
                setRvCfAnswers((prev) => [...prev, answer]);
                const nextIdx = rvCfQueueIdx + 1;
                if (nextIdx < rvCfQueue.length) {
                  setRvCfQueueIdx(nextIdx);
                } else if (rvEngagementPhase === "cognitive_fit" && !rvCfTriggered.current.has("branch")) {
                  // rv_late完了後 → 分岐2問を生成
                  const allCfAnswers = [...rvCfAnswers, answer];
                  // 暫定スコア計算
                  const interimScores: Partial<Record<import("@/lib/stargazer/cognitiveFitQuestions").CognitiveAxisKey, number>> = {};
                  for (const a of allCfAnswers) {
                    const q = [...getCfQuestionsByPhase("phase1_mid"), ...getCfQuestionsByPhase("phase1_late"), ...getCfQuestionsByPhase("core_early"), ...getCfQuestionsByPhase("core_mid")].find(qq => qq.id === a.questionId);
                    if (q) {
                      const opt = q.options.find(o => o.id === a.selectedOptionId);
                      if (opt) {
                        for (const w of opt.weights) {
                          interimScores[w.axis] = (interimScores[w.axis] ?? 0) + w.weight;
                        }
                      }
                    }
                  }
                  const [target1, target2] = selectBranchTargets(interimScores);
                  const branch1 = getBranchQuestion(target1);
                  const branch2 = getBranchQuestion(target2);
                  const branchQueue = [branch1, branch2].filter(Boolean) as CognitiveQuestion[];
                  if (branchQueue.length > 0) {
                    rvCfTriggered.current.add("branch");
                    setRvCfQueue(branchQueue);
                    setRvCfQueueIdx(0);
                    setRvEngagementPhase("cognitive_fit_branch");
                  } else {
                    setRvEngagementPhase("micro_reveal");
                  }
                } else {
                  // 全CF完了
                  setRvEngagementPhase("micro_reveal");
                }
              }}
              onGoBack={rvCfQueueIdx > 0 ? () => {
                setRvCfAnswers((prev) => prev.slice(0, -1));
                setRvCfQueueIdx(rvCfQueueIdx - 1);
              } : undefined}
              canGoBack={rvCfQueueIdx > 0}
            />
          </AnimatePresence>
        </div>
      );
    }

    // ── チャプター導入画面 ──
    if ((rvEngagementPhase === "chapter_intro" || showChapterIntro) && isFirstInChapter && !isFollowUpQuestion) {
      return (
        <motion.div
          className="space-y-6 py-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-section-header">
            {chapterInfo?.sublabel}
          </span>
          {chapterInfo?.emoji && (
            <motion.div
              className="text-3xl"
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.1 }}
            >
              {chapterInfo.emoji}
            </motion.div>
          )}
          <h3 className="font-display text-lg" style={{ color: "rgba(30,35,55,0.88)" }}>
            {chapterInfo?.label}
          </h3>
          <p className="text-sm max-w-xs mx-auto" style={{ color: "rgba(60,65,85,0.68)" }}>
            {chapterInfo?.description}
          </p>
          <button
            onClick={() => {
              setShowChapterIntro(false);
              setRvEngagementPhase("questioning");
              rvStartRef.current = Date.now();
            }}
            className="btn-secondary-sg px-8 py-3 text-sm mx-auto"
          >
            始める
          </button>
        </motion.div>
      );
    }

    // ── 回答ハンドラ（エンゲージメント判定つき） ──
    const handleRvAnswer = (questionId: string, value: number, responseTimeMs: number) => {
      const newAnswer: QuestionAnswer = { questionId, value, responseTimeMs };
      const updatedAnswers = [...rvAnswers, newAnswer];
      setRvAnswers(updatedAnswers);

      // 観測タグ判定
      const allForTag = [...coreAnswers, ...updatedAnswers];
      const tag = getObservationTag(newAnswer, allForTag);
      if (tag) {
        setRvObsTag(tag);
        setTimeout(() => setRvObsTag(null), 1500);
      }

      const triggered = currentQ.followUps?.find((fu) => fu.triggerValue === value);

      let nextQueue = rvQueue;
      if (triggered) {
        const newQueue = [...rvQueue];
        const insertQuestion: RendezvousQuestionV2 = {
          ...triggered.question,
          followUps: undefined,
        };
        newQueue.splice(rvQueueIndex + 1, 0, insertQuestion);
        setRvQueue(newQueue);
        setTotalExpectedQuestions((prev) => prev + 1);
        nextQueue = newQueue;
      }

      const nextIndex = rvQueueIndex + 1;
      const rvAnsweredCount = updatedAnswers.length;

      if (nextIndex >= nextQueue.length) {
        computeFinalResult(updatedAnswers, nextQueue);
        return;
      }

      const nextQ = nextQueue[nextIndex];
      const chapterChanged = nextQ && nextQ.chapter !== currentChapter && !nextQ.id.startsWith("rv_fu_");

      // エンゲージメントイベント判定

      // NOTE: CF Q5-Q8 と VC は Phase 1（QuestionFlow）で完結するため
      // RV フェーズでは CF・VC の挿入を行わない

      // 鏡の問い（15問ごと）
      if (rvAnsweredCount > 0 && rvAnsweredCount % 15 === 0) {
        setRvQueueIndex(nextIndex);
        if (chapterChanged) setShowChapterIntro(true);
        setRvEngagementPhase("mirror_question");
        return;
      }

      // マイクロ・リヴィール（5問ごと、鏡の問いと被らない場合）
      if (rvAnsweredCount > 0 && rvAnsweredCount % 5 === 0) {
        setRvQueueIndex(nextIndex);
        if (chapterChanged) setShowChapterIntro(true);
        setRvEngagementPhase("micro_reveal");
        return;
      }

      // チャプター境界 → 深呼吸の間
      if (chapterChanged) {
        setRvQueueIndex(nextIndex);
        setShowChapterIntro(true);
        setRvEngagementPhase("deep_breath");
        return;
      }

      // 通常の次の質問
      setRvQueueIndex(nextIndex);
      setRvEngagementPhase("questioning");
      rvStartRef.current = Date.now();
    };

    // ── 戻るボタン ──
    const handleRvGoBack = () => {
      if (rvQueueIndex <= 0) return;
      setRvAnswers((prev) => prev.slice(0, -1));
      setRvQueueIndex(rvQueueIndex - 1);
      setRvEngagementPhase("questioning");
    };

    // ── 深度計算（core35問 + RV進捗） ──
    const coreCount = 35;
    const globalTotal = coreCount + totalExpectedQuestions;
    const globalProgress = coreCount + rvQueueIndex;
    const depth = calculateDepth(globalProgress, globalTotal);

    const contextDisplay = CONTEXT_DISPLAY[currentQ.context];

    // 速答フラッシュ判定（5問ごとのセットの3番目）
    const isFlash = rvQueueIndex % 5 === 2;

    return (
      <div className="space-y-4 py-4 px-4">
        <StepProgressIndicator phase={phase} />
        {/* 深度メーター */}
        <DepthMeter currentDepth={depth.level} layerProgress={depth.layerProgress} />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentQ.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <SemanticDifferentialCard
              question={{
                id: currentQ.id,
                chapter: currentQ.chapter as import("@/lib/stargazer/questions").ChapterKey,
                prompt: currentQ.prompt,
                leftLabel: currentQ.labelLeft,
                rightLabel: currentQ.labelRight,
                scale: 5,
                axes: currentQ.axes,
              }}
              questionIndex={rvQueueIndex}
              totalQuestions={totalExpectedQuestions}
              chapterLabel={chapterInfo?.label ?? ""}
              onAnswer={handleRvAnswer}
              onGoBack={handleRvGoBack}
              canGoBack={rvQueueIndex > 0}
              flashMode={isFlash}
              observationTag={rvObsTag}
              contextBadge={contextDisplay}
              displayQuestionText={currentQ.questionText}
              displayNote={currentQ.note}
              isFollowUp={isFollowUpQuestion}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Results (v4 — Spotify Wrapped Sequential)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Phase 1 Results → Continue Choice
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (phase === "results" && finalResult) {
    return (
      <ResultsSequence
        finalResult={finalResult}
        microAnswers={microAnswers}
        coreAnswers={coreAnswers}
        rvAnswers={[]}
        microAxes={microAxes}
        playStarBorn={playStarBorn}
        playInsightReveal={playInsightReveal}
        playStreakMilestone={playStreakMilestone}
        haptics={haptics}
        isAnonymous={isAnonymousUser}
        onLogin={handleLoginRedirect}
        onSave={() => {
          signalSaveSession();
          // Phase 1 完了として保存（RV なしで初回観測完了）
          onComplete(finalResult, coreAnswers, undefined);
          // 保存後に continue_choice を表示
          setPhase("continue_choice");
        }}
      />
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: Continue Choice — さらに深める or 一旦終了
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (phase === "continue_choice" && finalResult) {
    const arch = resolveArchetype(finalResult.axisScores);
    const ad = getArchetypeByCode(arch.code);
    return (
      <motion.div
        className="space-y-6 py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center space-y-4">
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" }}
          >
            <BreathingOrb size={50} color="rgba(160,150,210,0.2)" />
          </motion.div>
          <h3 className="font-display text-lg" style={{ color: "rgba(30,35,55,0.88)" }}>
            初回観測が完了しました
          </h3>
          {ad && (
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">{ad.emoji}</span>
              <span className="font-display text-lg" style={{ color: "rgba(30,35,55,0.80)" }}>
                {ad.name}
              </span>
            </div>
          )}
          <p className="text-sm max-w-xs mx-auto" style={{ color: "rgba(60,65,85,0.68)" }}>
            さらに深い観測を続けると、人との関係性の中で見える自分が浮かび上がります。
          </p>
        </div>

        {/* Option 1: Continue with RV */}
        <motion.button
          onClick={() => {
            setShowChapterIntro(true);
            const initialQueue = [...RENDEZVOUS_QUESTIONS_V2];
            setRvQueue(initialQueue);
            setRvQueueIndex(0);
            setTotalExpectedQuestions(initialQueue.length);
            rvStartRef.current = Date.now();
            setPhase("rendezvous_transition");
          }}
          className="btn-primary-sg w-full py-4 text-base tracking-wide"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          関係性の観測へ進む（相手別の深掘り）
        </motion.button>

        {/* Option 2: Stop for now */}
        <motion.button
          onClick={() => {
            // 一旦終了 → 日次観測モードへ（onComplete は results フェーズで既に呼ばれている）
            window.location.href = "/stargazer";
          }}
          className="w-full py-3 text-sm tracking-wide rounded-xl"
          style={{
            background: "rgba(200,195,210,0.12)",
            border: "1px solid rgba(160,155,175,0.15)",
            color: "rgba(60,65,85,0.7)",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          一旦終了して毎日の観測へ
        </motion.button>

        <p className="text-center text-xs" style={{ color: "rgba(100,105,125,0.5)" }}>
          関係性の観測は後からいつでも始められます
        </p>

        {/* 匿名ユーザー向けアカウント作成リンク */}
        {isAnonymousUser && (
          <motion.button
            onClick={handleLoginRedirect}
            className="w-full py-3 mt-2 text-sm tracking-wide rounded-xl font-medium"
            style={{
              background: "linear-gradient(135deg, rgba(170,150,90,0.15), rgba(160,150,200,0.08))",
              border: "1px solid rgba(190,170,110,0.25)",
              color: "rgba(70,60,30,0.85)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            アカウントを作成して結果を保存する
          </motion.button>
        )}
      </motion.div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE: RV Results (Phase 2 完了)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (phase === "rv_results" && finalResult) {
    return (
      <ResultsSequence
        finalResult={finalResult}
        microAnswers={microAnswers}
        coreAnswers={coreAnswers}
        rvAnswers={rvAnswers}
        microAxes={microAxes}
        playStarBorn={playStarBorn}
        playInsightReveal={playInsightReveal}
        playStreakMilestone={playStreakMilestone}
        haptics={haptics}
        isAnonymous={isAnonymousUser}
        onLogin={handleLoginRedirect}
        onSave={() => {
          signalSaveSession();
          // Phase 2 込みの結果で上書き保存
          onComplete(finalResult, [...coreAnswers, ...rvAnswers], rvCfAnswers.length > 0 ? rvCfAnswers : undefined);
          // RV完了フラグを永続化
          try { localStorage.setItem("culcept_sg_rv_completed_v1", "true"); } catch {}
        }}
      />
    );
  }

  return null;
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Helpers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1 結果計算（コア51問 + Micro3問 + CF8問）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function computePhase1Result() {
    if (!coreResult) return;

    // Step 1: Core 51問からベイズ信念を初期化
    const bayesianResult = initializeFromOnboarding(coreAnswers);

    // Step 2: Micro 3問の軸スコアを信念に統合
    let beliefs = updateFromMicroAxes(bayesianResult.beliefs, microAxes);

    // Step 3: 信念から軸スコアを抽出
    const mergedScores = beliefsToScores(beliefs);

    const reactionType = resolveReactionType(mergedScores);

    const result: ResolvedResult = {
      ...coreResult,
      axisScores: mergedScores,
      reactionType,
      confidence: coreResult.confidence,
      axisConfidences: coreResult.axisConfidences,
    };

    setFinalResult(result);
    setPhase("results");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2 結果計算（Phase 1 + RV質問を統合）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function computeFinalResult(
    rendezAnswers: QuestionAnswer[],
    queue: RendezvousQuestionV2[]
  ) {
    if (!coreResult) return;

    let beliefs: BeliefSet;

    if (startFromRv && existingProfile && coreAnswers.length === 0) {
      // RV-only mode: reconstruct beliefs from existing profile scores
      beliefs = createEmptyBeliefSet();
      const PHASE1_PRECISION = 8; // approximate precision after 51 core + CF + micro
      for (const [key, score] of Object.entries(existingProfile.axisScores)) {
        const axisKey = key as TraitAxisKey;
        if (beliefs[axisKey]) {
          const precision = PHASE1_PRECISION;
          const stddev = 1 / Math.sqrt(precision);
          beliefs[axisKey] = {
            mu: Math.max(-1, Math.min(1, score)),
            precision,
            confidence: 0.65 * (1 - Math.exp(-precision / 30)),
            credibleInterval: [
              Math.max(-1, score - 1.96 * stddev),
              Math.min(1, score + 1.96 * stddev),
            ] as [number, number],
          };
        }
      }
    } else {
      // Normal flow: Core 51問からベイズ信念を初期化
      const bayesianResult = initializeFromOnboarding(coreAnswers);
      // Micro 3問の軸スコアを信念に統合
      beliefs = updateFromMicroAxes(bayesianResult.beliefs, microAxes);
    }

    // Step 3: RV質問を信念に統合
    const rvInputs: RvAnswerInput[] = rendezAnswers.map((answer) => {
      const question = queue.find((q) => q.id === answer.questionId);
      return {
        questionId: answer.questionId,
        value: answer.value,
        responseTimeMs: answer.responseTimeMs,
        axes: (question?.axes ?? []).map((a) => ({
          key: a.key as TraitAxisKey,
          weight: a.weight,
          invert: a.invert,
        })),
        isFollowUp: answer.questionId.startsWith("rv_fu_"),
      };
    });
    beliefs = updateFromRvAnswers(beliefs, rvInputs);

    // Step 4: Cognitive Fit 6軸を信念に統合
    if (rvCfAnswers.length > 0) {
      const cfResult = computeCognitiveFitScores(rvCfAnswers);
      const cfAxesForBeliefs: Partial<Record<TraitAxisKey, number>> = {};
      for (const s of cfResult.scores) {
        cfAxesForBeliefs[s.axis as TraitAxisKey] = s.rawScore;
      }
      beliefs = updateFromMicroAxes(beliefs, cfAxesForBeliefs);
    }

    // Step 5: 信念から軸スコアを抽出
    const mergedScores = beliefsToScores(beliefs);

    const reactionType = resolveReactionType(mergedScores);

    const result: ResolvedResult = {
      ...coreResult,
      axisScores: mergedScores,
      reactionType,
      confidence: coreResult.confidence,
      axisConfidences: coreResult.axisConfidences,
    };

    setFinalResult(result);
    setPhase("rv_results");
  }
}
