// app/stargazer/_components/OnboardingFlowV5.tsx
// V5 オンボーディングフロー — CEO方針: "脳死で進める構造"
// Segment A (Q1-Q6): 価値質問 — 温かみのあるエディトリアルデザイン、3択
// Segment B (Q7-Q18): 性格プローブ — クールで精密なデザイン、4択
// Q10, Q15: フィードバック表示
// Q6後: 劇的トランジション（すでに作り始めている演出）
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useClickSound } from "@/hooks/useClickSound";
import { useHaptics } from "@/hooks/useHaptics";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  classifyAndPredict,
  type OnboardingAnswers,
  type ClusterResult,
} from "@/lib/stargazer/behavioralPredictionEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingAnswer {
  questionId: string;
  value: string;
  numericValue: number; // -1 to +1 scale
  responseTimeMs: number;
  axes: Partial<Record<TraitAxisKey, number>>;
}

interface OnboardingOption {
  label: string;
  value: string;
  axes: Partial<Record<TraitAxisKey, number>>;
  numericValue: number;
}

interface OnboardingQuestion {
  id: string;
  segment: "A" | "B";
  /** 質問テキスト — **bold** マーカー対応 */
  prompt: string;
  /** プレフィックス（例: "例えば"） */
  prefix?: string;
  options: OnboardingOption[];
  showTransitionAfter?: boolean;
  showFeedbackAfter?: boolean;
}

interface Props {
  onComplete: (
    answers: OnboardingAnswer[],
    clusterResult: ClusterResult,
    axisScores: Partial<Record<TraitAxisKey, number>>,
  ) => void;
  ensureSession?: () => Promise<void>;
  /** サーバーから復元した途中回答（resume用）*/
  initialAnswers?: OnboardingAnswer[];
  /** 再開インデックス（0-based, 指定がなければ0）*/
  initialIndex?: number;
}

// ---------------------------------------------------------------------------
// Rich text renderer — **bold** markers → <span class="font-semibold text-lg">
// ---------------------------------------------------------------------------

function RichPrompt({
  text,
  baseClass,
  emphasisClass,
}: {
  text: string;
  baseClass: string;
  emphasisClass: string;
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <span key={i} className={emphasisClass}>
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={i} className={baseClass}>
            {part}
          </span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------

const QUESTIONS: OnboardingQuestion[] = [
  // ━━━ Segment A: 価値質問 (Q1-Q6) — 3択 ━━━
  {
    id: "v1_self_awareness",
    segment: "A",
    prompt: "自分のことを、\n**本当に理解できている**と思う？",
    options: [
      { label: "かなり", value: "high", numericValue: -0.8, axes: { locus_of_control: -0.3 } },
      { label: "たぶん", value: "mid", numericValue: 0, axes: {} },
      { label: "正直わからない", value: "low", numericValue: 0.5, axes: { growth_mindset: 0.3 } },
    ],
  },
  {
    id: "v2_unexplainable_self",
    segment: "A",
    prompt: "本当は違うと言いたかったのに、\n笑って流した。\n——なぜあのとき、そうしたのか\n**説明できる**？",
    options: [
      { label: "できる", value: "can", numericValue: -0.6, axes: { rumination_tendency: -0.2 } },
      { label: "なんとなく", value: "vague", numericValue: 0.3, axes: {} },
      { label: "考えたことない", value: "never", numericValue: 0.6, axes: { rumination_tendency: 0.3 } },
    ],
  },
  {
    id: "v3_alter",
    segment: "A",
    prefix: "例えば",
    prompt: "あなたが\n**言葉にする前の気持ち**まで、\n先にわかってしまう。\nあなた自身であり、\n**最大の理解者**であり、\nずっとそばにいて、導いてくれる。\n——**そんな存在**がいるとしたら。",
    options: [
      { label: "会ってみたい", value: "want", numericValue: 0.8, axes: { reassurance_need: 0.3 } },
      { label: "少し怖い", value: "scared", numericValue: 0.2, axes: { cautious_vs_bold: -0.3 } },
      { label: "想像できない", value: "unimaginable", numericValue: -0.5, axes: {} },
    ],
  },
  {
    id: "v4_connection",
    segment: "A",
    prefix: "例えば",
    prompt: "本当に気の合う**友達**。\n深く理解し合える**恋人**。\n価値観が合う\n**ビジネスパートナー**。\n**人生を共にする相手**。\n——それぞれで、\n**最も合う人**を\n見つけ出してくれる存在がいたら。",
    options: [
      { label: "全部欲しい", value: "all", numericValue: 0.8, axes: { social_initiative: 0.3, change_embrace_vs_resist: 0.3 } },
      { label: "一部なら", value: "partial", numericValue: 0.2, axes: { boundary_awareness: 0.3 } },
      { label: "気になる", value: "curious", numericValue: 0.5, axes: {} },
    ],
  },
  {
    id: "v5_relationship_bridge",
    segment: "A",
    prefix: "例えば",
    prompt: "しかも、相手のことも\n**同じ深さ**で理解していて。\nあなたと相手の間に立って、\n関係を深めるための\n**的確な言葉**をくれるとしたら。",
    options: [
      { label: "最高だと思う", value: "great", numericValue: 0.8, axes: { analytical_vs_intuitive: 0.3 } },
      { label: "そこまでは", value: "maybe", numericValue: -0.3, axes: { independence_vs_harmony: -0.3 } },
      { label: "それは欲しい", value: "want", numericValue: 0.6, axes: { reassurance_need: 0.2 } },
    ],
  },
  {
    id: "v6_coordinator",
    segment: "A",
    prefix: "例えば",
    prompt: "あなたの\n**体質、雰囲気、美意識**まで\n読んだうえで。\n毎日の**ベストなコーデ**を\n組んでくれる。\nしかも、会う相手の好みにまで\n合わせて提案してくれる、\n**あなただけのコーディネーター**が\nいたとしたら。",
    options: [
      { label: "任せたい", value: "delegate", numericValue: 0.8, axes: { function_vs_expression: 0.3 } },
      { label: "自分で選びたい", value: "diy", numericValue: -0.4, axes: { independence_vs_harmony: -0.3 } },
      { label: "試してみたい", value: "try", numericValue: 0.4, axes: {} },
    ],
    showTransitionAfter: true,
  },

  // ━━━ Segment B: オンボーディング質問 (Q7-Q18) — 4択 ━━━
  {
    id: "ob7_plan_vs_spontaneous",
    segment: "B",
    prompt: "日曜の夜。明日から仕事。\nベッドの中で最初に浮かぶのは——",
    options: [
      { label: "明日の段取り", value: "plan", numericValue: -0.8, axes: { plan_vs_spontaneous: -0.7, control_tendency: 0.4 } },
      { label: "漠然とした不安", value: "anxiety", numericValue: -0.3, axes: { rumination_tendency: 0.4, emotional_variability: 0.3 } },
      { label: "何も考えない", value: "nothing", numericValue: 0.5, axes: { plan_vs_spontaneous: 0.5, emotional_regulation: 0.3 } },
      { label: "週末の余韻", value: "afterglow", numericValue: 0.3, axes: { plan_vs_spontaneous: 0.3 } },
    ],
  },
  {
    id: "ob8_interpersonal",
    segment: "B",
    prompt: "親しい友人が明らかに間違った選択をしようとしている。\nあなたは——",
    options: [
      { label: "はっきり言う", value: "direct", numericValue: 0.7, axes: { direct_vs_diplomatic: -0.6, independence_vs_harmony: -0.4 } },
      { label: "遠回しに伝える", value: "indirect", numericValue: -0.2, axes: { direct_vs_diplomatic: 0.4 } },
      { label: "見守る", value: "watch", numericValue: -0.5, axes: { independence_vs_harmony: 0.3, boundary_awareness: 0.3 } },
      { label: "聞かれたら答える", value: "ifasked", numericValue: 0, axes: { boundary_awareness: 0.4, stress_isolation_vs_social: -0.2 } },
    ],
  },
  {
    id: "ob9_flexibility",
    segment: "B",
    prompt: "旅先で予定が全て崩れた。\n最初にすることは——",
    options: [
      { label: "代替案をすぐ調べる", value: "research", numericValue: -0.6, axes: { analytical_vs_intuitive: -0.5, plan_vs_spontaneous: -0.4 } },
      { label: "とりあえず歩いてみる", value: "walk", numericValue: 0.5, axes: { plan_vs_spontaneous: 0.5, change_embrace_vs_resist: 0.4 } },
      { label: "誰かに聞く", value: "ask", numericValue: 0.2, axes: { individual_vs_social: 0.4 } },
      { label: "少し立ち止まる", value: "pause", numericValue: 0, axes: { emotional_regulation: 0.4, rumination_tendency: 0.3 } },
    ],
  },
  {
    id: "ob10_social_style",
    segment: "B",
    prompt: "初対面の人が多い場。\n30分後のあなたは——",
    options: [
      { label: "数人と深く話してる", value: "deep", numericValue: 0.3, axes: { introvert_vs_extrovert: 0.2, intimacy_pace: 0.4 } },
      { label: "広く浅く回ってる", value: "broad", numericValue: 0.8, axes: { introvert_vs_extrovert: 0.6, social_initiative: 0.5 } },
      { label: "隅で一人を見つけてる", value: "corner", numericValue: -0.3, axes: { introvert_vs_extrovert: -0.3, boundary_awareness: 0.3 } },
      { label: "もう帰りたい", value: "leave", numericValue: -0.8, axes: { introvert_vs_extrovert: -0.6, stress_isolation_vs_social: -0.5 } },
    ],
    showFeedbackAfter: true,
  },
  {
    id: "ob11_conflict",
    segment: "B",
    prompt: "大切な人と意見が真っ向から割れた。\nあなたの心の中は——",
    options: [
      { label: "正しさを伝えたい", value: "assert", numericValue: 0.7, axes: { direct_vs_diplomatic: -0.6, independence_vs_harmony: -0.4 } },
      { label: "関係を壊したくない", value: "preserve", numericValue: -0.3, axes: { independence_vs_harmony: 0.5, public_private_gap: 0.3 } },
      { label: "両方あって苦しい", value: "torn", numericValue: 0, axes: { emotional_variability: 0.5, rumination_tendency: 0.3 } },
      { label: "距離を置きたい", value: "withdraw", numericValue: -0.5, axes: { emotional_regulation: 0.4, stress_isolation_vs_social: -0.4 } },
    ],
  },
  {
    id: "ob12_stress",
    segment: "B",
    prompt: "締切が3日後。進捗は30%。\n今の気持ちは——",
    options: [
      { label: "まだいける", value: "confident", numericValue: 0.5, axes: { cautious_vs_bold: 0.4, plan_vs_spontaneous: 0.3 } },
      { label: "かなり焦る", value: "panic", numericValue: -0.5, axes: { emotional_variability: 0.4, rumination_tendency: 0.3 } },
      { label: "締切を延ばせないか考える", value: "negotiate", numericValue: -0.2, axes: { analytical_vs_intuitive: -0.3, control_tendency: 0.3 } },
      { label: "なんとかなる", value: "whatever", numericValue: 0.7, axes: { change_embrace_vs_resist: 0.3, plan_vs_spontaneous: 0.5 } },
    ],
  },
  {
    id: "ob13_decision",
    segment: "B",
    prompt: "友人の相談。データを見せれば一発で分かる話。\nでも友人は感情的になっている。あなたは——",
    options: [
      { label: "まずデータを見せる", value: "data", numericValue: -0.8, axes: { analytical_vs_intuitive: -0.6, rational_vs_emotional_decision: -0.6 } },
      { label: "まず気持ちを聞く", value: "feelings", numericValue: 0.8, axes: { analytical_vs_intuitive: 0.3, rational_vs_emotional_decision: 0.6 } },
      { label: "両方バランスよく", value: "balance", numericValue: 0, axes: { rational_vs_emotional_decision: 0 } },
      { label: "相手が落ち着くまで待つ", value: "wait", numericValue: 0.3, axes: { emotional_regulation: 0.4, boundary_awareness: 0.3 } },
    ],
  },
  {
    id: "ob14_efficiency",
    segment: "B",
    prompt: "同じゴールに着ける道が2つ。\n1つは最短だけど味気ない。\nもう1つは遠回りだけど面白い。あなたは——",
    options: [
      { label: "迷わず最短", value: "shortest", numericValue: -0.8, axes: { efficiency_vs_process: -0.6, plan_vs_spontaneous: -0.4 } },
      { label: "遠回りを選ぶ", value: "detour", numericValue: 0.8, axes: { efficiency_vs_process: 0.6, change_embrace_vs_resist: 0.3 } },
      { label: "時間次第で決める", value: "depends", numericValue: -0.2, axes: { analytical_vs_intuitive: -0.3 } },
      { label: "面白い方に惹かれるけど最短を選ぶ", value: "conflicted", numericValue: -0.4, axes: { efficiency_vs_process: -0.3, public_private_gap: 0.3 } },
    ],
  },
  {
    id: "ob15_self_evaluation",
    segment: "B",
    prompt: "誰かに褒められた。\nでもそれは自分では大したことじゃない。\nあなたは——",
    options: [
      { label: "素直に受け取る", value: "accept", numericValue: 0.5, axes: { locus_of_control: -0.3, growth_mindset: 0.3 } },
      { label: "謙遜する", value: "humble", numericValue: -0.3, axes: { public_private_gap: 0.4, independence_vs_harmony: 0.3 } },
      { label: "少し居心地が悪い", value: "uncomfortable", numericValue: -0.5, axes: { shame_vs_guilt: 0.3, public_private_gap: 0.4 } },
      { label: "相手の意図を考える", value: "analyze", numericValue: 0, axes: { analytical_vs_intuitive: -0.4, boundary_awareness: 0.3 } },
    ],
    showFeedbackAfter: true,
  },
  {
    id: "ob16_solitude",
    segment: "B",
    prompt: "ひとりで過ごす休日。夕方4時。\nあなたは——",
    options: [
      { label: "充実している", value: "fulfilled", numericValue: -0.7, axes: { introvert_vs_extrovert: -0.5, stress_isolation_vs_social: -0.4 } },
      { label: "そろそろ誰かに会いたい", value: "social", numericValue: 0.5, axes: { introvert_vs_extrovert: 0.5, social_initiative: 0.3 } },
      { label: "まだ足りない", value: "more", numericValue: -0.8, axes: { introvert_vs_extrovert: -0.6, stress_isolation_vs_social: -0.5 } },
      { label: "少し罪悪感がある", value: "guilty", numericValue: 0.2, axes: { shame_vs_guilt: 0.3, public_private_gap: 0.3 } },
    ],
  },
  {
    id: "ob17_metacognition",
    segment: "B",
    prompt: "3年前の自分と今の自分。\n一番変わったと思うのは——",
    options: [
      { label: "考え方", value: "thinking", numericValue: 0.3, axes: { growth_mindset: 0.4, analytical_vs_intuitive: -0.2 } },
      { label: "人との距離感", value: "distance", numericValue: -0.2, axes: { boundary_awareness: 0.4, intimacy_pace: -0.3 } },
      { label: "自分への評価", value: "self_eval", numericValue: -0.4, axes: { locus_of_control: 0.3, rumination_tendency: 0.3 } },
      { label: "あまり変わっていない", value: "unchanged", numericValue: 0, axes: { change_embrace_vs_resist: -0.3 } },
    ],
  },
  {
    id: "ob18_adaptation",
    segment: "B",
    prompt: "全く新しい環境に放り込まれた。\n最初にすることは——",
    options: [
      { label: "全体の仕組みを把握する", value: "structure", numericValue: -0.6, axes: { abstract_structuring: 0.5, analytical_vs_intuitive: -0.4 } },
      { label: "まず人に話しかける", value: "social", numericValue: 0.5, axes: { introvert_vs_extrovert: 0.5, social_initiative: 0.4 } },
      { label: "静かに観察する", value: "observe", numericValue: -0.3, axes: { introvert_vs_extrovert: -0.3, analytical_vs_intuitive: -0.3 } },
      { label: "とりあえず動いてみる", value: "act", numericValue: 0.4, axes: { plan_vs_spontaneous: 0.4, cautious_vs_bold: 0.3 } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Feedback messages (Q10, Q15) — 固定テキスト
// ---------------------------------------------------------------------------

function getFeedbackMessage(
  questionId: string,
  _answers: OnboardingAnswer[],
): { text: string } | null {
  if (questionId === "ob10_social_style") {
    return { text: "面白い傾向が見えてきた。" };
  }
  if (questionId === "ob15_self_evaluation") {
    return { text: "あなたの本質が、少し掴めてきた。" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingFlowV5({ onComplete, ensureSession, initialAnswers, initialIndex }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);
  const [answers, setAnswers] = useState<OnboardingAnswer[]>(initialAnswers ?? []);
  const [showTransition, setShowTransition] = useState(false);
  const [transitionStage, setTransitionStage] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{ text: string } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const questionShownAt = useRef(Date.now());
  const clickSound = useClickSound();
  const haptics = useHaptics();

  useEffect(() => {
    ensureSession?.();
  }, [ensureSession]);

  const currentQuestion = QUESTIONS[currentIndex];
  const isSegmentA = currentQuestion?.segment === "A";
  const progress = ((currentIndex) / QUESTIONS.length) * 100;

  // 軸スコアの累積計算
  const cumulativeAxisScores = useMemo(() => {
    const scores: Partial<Record<TraitAxisKey, number>> = {};
    const counts: Partial<Record<TraitAxisKey, number>> = {};
    for (const ans of answers) {
      for (const [axis, val] of Object.entries(ans.axes)) {
        const key = axis as TraitAxisKey;
        scores[key] = (scores[key] ?? 0) + val;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    for (const key of Object.keys(scores) as TraitAxisKey[]) {
      scores[key] = scores[key]! / counts[key]!;
    }
    return scores;
  }, [answers]);

  const handleAnswer = useCallback(
    (option: OnboardingOption) => {
      if (isAnimating) return;
      clickSound.play();

      const responseTimeMs = Date.now() - questionShownAt.current;
      const answer: OnboardingAnswer = {
        questionId: currentQuestion.id,
        value: option.value,
        numericValue: option.numericValue,
        responseTimeMs,
        axes: option.axes,
      };

      const newAnswers = [...answers, answer];
      setAnswers(newAnswers);
      setIsAnimating(true);

      // サーバーに進捗を保存（fire-and-forget。失敗しても続行）
      const nextIndex = currentIndex + 1;
      fetch("/api/stargazer/onboarding-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: newAnswers, nextIndex }),
      }).catch(() => { /* non-fatal */ });

      if (currentQuestion.showFeedbackAfter) {
        const fb = getFeedbackMessage(currentQuestion.id, newAnswers);
        if (fb) {
          setFeedbackData(fb);
          setShowFeedback(true);
          setTimeout(() => {
            setShowFeedback(false);
            advanceToNext(newAnswers);
          }, 2000);
          return;
        }
      }

      if (currentQuestion.showTransitionAfter) {
        setShowTransition(true);
        setTransitionStage(0);
        // 段階的リビール: 5秒
        setTimeout(() => setTransitionStage(1), 600);
        setTimeout(() => setTransitionStage(2), 2200);
        setTimeout(() => setTransitionStage(3), 3800);
        setTimeout(() => {
          setShowTransition(false);
          setTransitionStage(0);
          advanceToNext(newAnswers);
        }, 5000);
        return;
      }

      setTimeout(() => advanceToNext(newAnswers), 150);
    },
    [currentIndex, currentQuestion, answers, isAnimating, clickSound],
  );

  const advanceToNext = useCallback(
    (currentAnswers: OnboardingAnswer[]) => {
      const nextIndex = currentIndex + 1;

      if (nextIndex >= QUESTIONS.length) {
        const onboardingInput: OnboardingAnswers = {
          q10_social_style: currentAnswers.find((a) => a.questionId === "ob10_social_style")?.numericValue ?? 0,
          q11_conflict_style: currentAnswers.find((a) => a.questionId === "ob11_conflict")?.numericValue ?? 0,
          q13_decision_style: currentAnswers.find((a) => a.questionId === "ob13_decision")?.numericValue ?? 0,
          q7_plan_vs_spontaneous: currentAnswers.find((a) => a.questionId === "ob7_plan_vs_spontaneous")?.numericValue,
          q9_curiosity_direction: currentAnswers.find((a) => a.questionId === "ob9_flexibility")?.numericValue,
          q14_deadline_style: currentAnswers.find((a) => a.questionId === "ob14_efficiency")?.numericValue,
          q16_crowd_behavior: currentAnswers.find((a) => a.questionId === "ob16_solitude")?.numericValue,
          q18_info_processing: currentAnswers.find((a) => a.questionId === "ob18_adaptation")?.numericValue,
        };

        const clusterResult = classifyAndPredict(onboardingInput);

        const finalScores: Partial<Record<TraitAxisKey, number>> = {};
        const counts: Partial<Record<TraitAxisKey, number>> = {};
        for (const ans of currentAnswers) {
          for (const [axis, val] of Object.entries(ans.axes)) {
            const key = axis as TraitAxisKey;
            finalScores[key] = (finalScores[key] ?? 0) + val;
            counts[key] = (counts[key] ?? 0) + 1;
          }
        }
        for (const key of Object.keys(finalScores) as TraitAxisKey[]) {
          finalScores[key] = finalScores[key]! / counts[key]!;
        }

        // 完了時にサーバーの進捗を削除（クリーンアップ）
        fetch("/api/stargazer/onboarding-progress", { method: "DELETE" }).catch(() => { });
        onComplete(currentAnswers, clusterResult, finalScores);
        return;
      }

      setCurrentIndex(nextIndex);
      questionShownAt.current = Date.now();
      setIsAnimating(false);
    },
    [currentIndex, onComplete],
  );

  const handleGoBack = useCallback(() => {
    if (currentIndex === 0 || isAnimating) return;
    haptics.light();
    setAnswers((prev) => prev.slice(0, -1));
    setCurrentIndex((prev) => prev - 1);
    questionShownAt.current = Date.now();
  }, [currentIndex, isAnimating, haptics]);

  // ---------------------------------------------------------------------------
  // Render: Q6 トランジション — 劇的な段階的リビール
  // ---------------------------------------------------------------------------
  if (showTransition) {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ backgroundColor: "#f9f6f1" }}
        animate={{
          backgroundColor: transitionStage >= 2 ? "#121830" : "#f9f6f1",
        }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      >
        {/* 放射状のグラデーション（Stage 2以降） */}
        <AnimatePresence>
          {transitionStage >= 2 && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "radial-gradient(ellipse at center, rgba(176,144,80,0.15) 0%, transparent 70%)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
            />
          )}
        </AnimatePresence>

        <div className="max-w-md px-8 text-center">
          {/* Stage 0: あなたが欲しいもの、ここで全て叶えられる。 */}
          <motion.p
            className="font-['Cormorant_Garamond',serif] text-3xl font-light leading-relaxed tracking-wide"
            initial={{ opacity: 0, y: 20, color: "#121830" }}
            animate={{
              opacity: 1,
              y: 0,
              color: transitionStage >= 2 ? "#ffffff" : "#121830",
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            あなたが欲しいもの
            <br />
            ここで全て叶えられる。
          </motion.p>

          {/* 金のアンダーライン */}
          <motion.div
            className="mx-auto mt-5 h-px bg-gradient-to-r from-transparent via-[#b09050] to-transparent"
            initial={{ width: 0 }}
            animate={{ width: transitionStage >= 1 ? 240 : 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />

          {/* Stage 1: あなたはすでに、もう1人の自分を作り始めている。 */}
          <AnimatePresence>
            {transitionStage >= 1 && (
              <motion.div
                className="mt-8"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <motion.p
                  className="text-sm text-[rgba(18,24,44,0.4)]"
                  animate={{
                    color: transitionStage >= 2 ? "rgba(255,255,255,0.4)" : "rgba(18,24,44,0.4)",
                  }}
                  transition={{ duration: 1.2 }}
                >
                  あなたはすでに、
                </motion.p>
                <motion.p
                  className="mt-1 text-xl font-medium text-[#121830]"
                  animate={{
                    color: transitionStage >= 2 ? "#ffffff" : "#121830",
                  }}
                  transition={{ duration: 1.2 }}
                >
                  もう1人の自分を作り始めている。
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stage 2: さらに深くいきましょう */}
          <AnimatePresence>
            {transitionStage >= 2 && (
              <motion.p
                className="mt-10 font-['Cormorant_Garamond',serif] text-lg tracking-widest text-[#b09050]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: [0, 1, 0.8, 1], y: 0 }}
                transition={{ duration: 1.2 }}
              >
                さらに深くいきましょう
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Feedback overlay
  // ---------------------------------------------------------------------------
  if (showFeedback && feedbackData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f5f7fa]">
        <motion.div
          className="max-w-sm px-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-base font-medium text-[#121830]">
            {feedbackData.text}
          </p>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Question — Segment A vs B テーマ分離
  // ---------------------------------------------------------------------------
  if (!currentQuestion) return null;

  // テーマ: Segment A = warm ivory editorial / Segment B = cool precision
  const bgClass = isSegmentA
    ? "bg-gradient-to-b from-[#faf7f2] to-[#f5f1ea]"
    : "bg-[#f5f7fa]";

  const progressColor = isSegmentA ? "bg-[#b09050]" : "bg-[#7b8fa8]";

  return (
    <div className={`fixed inset-0 z-50 flex flex-col transition-colors duration-500 ${bgClass}`}>
      {/* Progress bar */}
      <div className="relative h-0.5 w-full bg-[rgba(18,24,44,0.04)]">
        <motion.div
          className={`absolute left-0 top-0 h-full ${progressColor}`}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        />
      </div>

      {/* Back button */}
      {currentIndex > 0 && (
        <button
          onClick={handleGoBack}
          className="absolute left-4 top-4 z-10 flex items-center gap-1 text-xs text-[rgba(18,24,44,0.3)] transition-colors hover:text-[rgba(18,24,44,0.6)]"
        >
          <span className="text-base">&#8249;</span>
          <span>戻る</span>
        </button>
      )}

      {/* Question counter — Segment B のみ表示 */}
      {!isSegmentA && (
        <div className="absolute right-4 top-4 text-[10px] tabular-nums text-[rgba(18,24,44,0.25)]">
          {currentIndex + 1} / {QUESTIONS.length}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            className="flex w-full max-w-md flex-col items-center"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ━━━ Segment A: エディトリアル ━━━ */}
            {isSegmentA && (
              <>
                {/* 例えば prefix */}
                {currentQuestion.prefix && (
                  <motion.span
                    className="mb-5 text-[10px] font-medium uppercase tracking-[0.35em] text-[#b09050]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.05 }}
                  >
                    {currentQuestion.prefix}
                  </motion.span>
                )}

                {/* Question text — small base, large emphasis */}
                <motion.h2
                  className="mb-2 text-center leading-loose whitespace-pre-line"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                >
                  <RichPrompt
                    text={currentQuestion.prompt}
                    baseClass="font-['Cormorant_Garamond',serif] text-base font-light text-[rgba(18,24,44,0.55)]"
                    emphasisClass="font-['Cormorant_Garamond',serif] text-xl font-normal text-[#121830]"
                  />
                </motion.h2>

                {/* Options — glass cards */}
                <div className="mt-8 flex w-full flex-col gap-3">
                  {currentQuestion.options.map((option, i) => (
                    <motion.button
                      key={option.value}
                      onClick={() => handleAnswer(option)}
                      disabled={isAnimating}
                      className="w-full rounded-2xl border border-[rgba(176,144,80,0.08)] bg-white/50 px-5 py-4 text-left text-sm text-[#121830] shadow-[0_1px_4px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all hover:border-[rgba(176,144,80,0.2)] hover:bg-white/80 hover:shadow-[0_2px_12px_rgba(176,144,80,0.08)] disabled:opacity-50"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + i * 0.06, duration: 0.2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </>
            )}

            {/* ━━━ Segment B: 精密 ━━━ */}
            {!isSegmentA && (
              <>
                {/* Segment badge (Q7のみ) */}
                {currentIndex === 6 && (
                  <motion.span
                    className="mb-5 text-[10px] font-medium uppercase tracking-[0.25em] text-[rgba(18,24,44,0.3)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    あなたの行動パターン
                  </motion.span>
                )}

                {/* Left accent line + question */}
                <motion.div
                  className="w-full border-l-2 border-[rgba(123,143,168,0.2)] pl-5"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                >
                  <h2 className="whitespace-pre-line text-lg font-normal leading-relaxed text-[#121830]">
                    {currentQuestion.prompt}
                  </h2>
                </motion.div>

                {/* Options — flat, precise */}
                <div className="mt-7 flex w-full flex-col gap-2.5">
                  {currentQuestion.options.map((option, i) => (
                    <motion.button
                      key={option.value}
                      onClick={() => handleAnswer(option)}
                      disabled={isAnimating}
                      className="w-full rounded-xl border border-[rgba(18,24,44,0.06)] bg-white/60 px-5 py-3.5 text-left text-sm text-[#121830] transition-all hover:border-[rgba(18,24,44,0.12)] hover:bg-white/90 disabled:opacity-50"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.04, duration: 0.15 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
