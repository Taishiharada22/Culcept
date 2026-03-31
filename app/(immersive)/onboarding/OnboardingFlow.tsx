"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { trackInteraction } from "@/lib/stargazer/trackClient";
import {
  generateZeroSecondMirror,
  recordMirrorReaction,
  type ZeroMirrorResult,
} from "@/lib/onboarding/zeroSecondMirror";
import {
  generateImpossibleAccuracy,
  type ImpossibleAccuracyInsight,
  type MicroObservationData,
} from "@/lib/onboarding/impossibleAccuracy";
import {
  STAGE1_QUESTIONS,
  STAGE1_CATEGORIES,
  type Stage1Question,
} from "@/lib/stargazer/stage1Questions";
import { resolveArchetype, type ArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode, type ArchetypeDef } from "@/lib/stargazer/archetypeTypes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { getArchetypeTheme, type ArchetypeTheme } from "@/lib/stargazer/archetypeThemes";
import {
  startDrone,
  playAccent,
  resumeAudioContext,
  isMuted,
  setMuted,
  type DroneHandle,
} from "@/lib/ui/proceduralAudio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "blackout"
  | "zero_mirror"
  | "breathing"
  | "intro"
  | "question"
  | "microInsight"
  | "breathPause"
  | "insight";

interface Answer {
  questionId: string;
  optionId: string;
  responseTimeMs: number;
}

// ---------------------------------------------------------------------------
// Onboarding Questions — 10問を Stage1 から厳選
// ---------------------------------------------------------------------------

const ONBOARDING_QUESTION_IDS = [
  "s1_q01", // 何かを決める時 — analytical, cautious, individual, independence
  "s1_q02", // 新しい環境 — change, cautious, emotional_variability, tradition
  "s1_q03", // 考えを深めたい時 — introvert, individual, analytical, plan
  "s1_q04", // 計画を立てる — plan, perfectionist, change
  "s1_q06", // 返信が遅い時 — reassurance, emotional_variability, regulation
  "s1_q07", // ストレス — stress_isolation, regulation, introvert
  "s1_q10", // 初対面の人 — social_initiative, introvert, cautious
  "s1_q11", // 仲良くなるペース — intimacy_pace, boundary, cautious
  "s1_q15", // 友達に求めるもの — public_private_gap, relationship_mode, direct
  "s1_q17", // 温度差を感じた時 — boundary, intimacy_pace, independence
];

const ONBOARDING_QUESTIONS: Stage1Question[] = ONBOARDING_QUESTION_IDS
  .map((id) => STAGE1_QUESTIONS.find((q) => q.id === id))
  .filter((q): q is Stage1Question => q !== undefined);

const TOTAL_QUESTIONS = ONBOARDING_QUESTIONS.length;

// microInsight を表示する質問インデックス（0-based: Q1後、Q5後）
const MICRO_INSIGHT_AFTER = [0, 2, 4, 6];

// ---------------------------------------------------------------------------
// microInsight テキスト生成（4択対応）
// ---------------------------------------------------------------------------

function generateResponseTimeInsight(
  responseTimeMs: number,
  questionIndex: number,
  answers: Answer[],
): string {
  if (questionIndex === 0) {
    // Q1直後：回答速度に基づくインサイト
    if (responseTimeMs < 2000) {
      return "迷わなかった。自分の判断軸が明確で、選択に迷いがない。\nその明快さは強みだが、別の可能性を見逃していることもある。";
    }
    if (responseTimeMs < 5000) {
      return "少し考えた。選択肢の間に、自分の本音がある。\nどれも「少し違う」と感じたなら、あなたは自分を正確に捉えようとしている。";
    }
    return "時間をかけた。この領域はあなたの中でまだハッキリしてない。\nそれは悪いことじゃない。整理がつかないほど複雑な自分を持っている証拠。";
  }

  if (questionIndex === 2) {
    // Q3直後：回答パターンの一貫性をチェック
    const allSame = answers.every(a => a.responseTimeMs < 3000) || answers.every(a => a.responseTimeMs > 5000);
    if (allSame) {
      return "ここまで迷いなく進んでる。\n自分のことをよく知ってる人か、\nまだ本当の問いに出会ってないか。\n後半で、わかる。";
    }
    return "回答のリズムに揺れがある。\nそれは迷いじゃなく、\n自分の中に複数の答えを持ってる証拠。\n面白い兆候が見え始めてる。";
  }

  // Q5直後（中間地点）：ここまでの回答パターンを分析
  const times = answers.map((a) => a.responseTimeMs);
  const avgTime = times.reduce((s, t) => s + t, 0) / times.length;
  const fastest = Math.min(...times);
  const slowest = Math.max(...times);
  const ratio = slowest / Math.max(fastest, 1);

  if (ratio > 3) {
    return "ある質問には即答し、別の質問には長く迷った。\nこの「速度の差」が、あなたの内面の輪郭を見せてくれる。\n確信がある領域と、まだハッキリしてない領域の境界線。";
  }
  if (avgTime < 3000) {
    return "ここまでの回答は全体的に速い。直感を信じるタイプ。\nただし後半の質問は、少し違う領域に踏み込む。\nそこでの迷いが、本当のあなたを教えてくれる。";
  }

  if (questionIndex === 6) {
    // Q7直後：ここまでの回答から性格の輪郭を予告
    const fastAnswers = answers.filter(a => a.responseTimeMs < 2500).length;
    const slowAnswers = answers.filter(a => a.responseTimeMs > 5000).length;
    if (fastAnswers > slowAnswers * 2) {
      return "直感で決められる領域が広い。\nでも残り3問は、その直感が揺さぶられる領域。\nそこに、まだ出会っていない自分がいる。";
    }
    if (slowAnswers >= 3) {
      return "慎重に答えてくれてる。\n自分を雑に扱わない人だと思う。\nあと3問。最後の問いが、全部を繋げる鍵になる。";
    }
    return "7問答えた。あなたの輪郭がかなり見えてきた。\nでも輪郭の「内側」はまだ真っ白。\n残り3問で、色が入り始める。";
  }

  return "一つひとつ丁寧に考えている。\n自分を正確に表現しようとする誠実さがある。\n後半はさらに深い領域へ。答えにくいほど、データの価値が高い。";
}

// ---------------------------------------------------------------------------
// Star Particles
// ---------------------------------------------------------------------------

function StarField({ brightness = 0 }: { brightness: number }) {
  const stars = useMemo(() => {
    return Array.from({ length: 45 }, (_, i) => ({
      id: i,
      left: `${((i * 7 + 13) * 17) % 100}%`,
      top: `${((i * 11 + 3) * 23) % 100}%`,
      size: (i % 3) * 0.6 + 1,
      delay: (i * 0.37) % 5,
      duration: (i % 4) + 2.5,
    }));
  }, []);

  const baseOpacity = 0.15 + brightness * 0.25;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {stars.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: `rgba(200, 210, 255, ${baseOpacity})`,
          }}
          animate={{
            opacity: [baseOpacity * 0.4, baseOpacity, baseOpacity * 0.4],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Constellation (grows with each answer during question phase)
// ---------------------------------------------------------------------------

const CONSTELLATION_AXES = [
  "analytical_vs_intuitive",
  "introvert_vs_extrovert",
  "plan_vs_spontaneous",
  "change_embrace_vs_resist",
  "reassurance_need",
  "boundary_awareness",
] as const;

function LiveConstellation({ axes }: { axes: Record<string, number> }) {
  const positions = useMemo(() => {
    const cx = 50;
    const cy = 50;
    const basePoints = [
      { x: cx, y: cy - 20 },
      { x: cx - 18, y: cy - 4 },
      { x: cx + 18, y: cy - 4 },
      { x: cx - 12, y: cy + 16 },
      { x: cx + 12, y: cy + 16 },
      { x: cx, y: cy + 6 },
    ];
    return basePoints.map((p, i) => {
      const axisKey = CONSTELLATION_AXES[i];
      const val = axes[axisKey] ?? 0;
      // Shift position by axis value (max ±8px in viewBox units)
      return {
        x: p.x + val * 8,
        y: p.y + (val * 4 * (i % 2 === 0 ? 1 : -1)),
      };
    });
  }, [axes]);

  const lines = [
    [0, 1], [0, 2], [1, 5], [2, 5],
    [1, 3], [2, 4], [3, 5], [4, 5],
  ];

  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center" style={{ opacity: 0.12 }}>
      <svg viewBox="0 0 100 100" className="h-64 w-64">
        {lines.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={positions[a].x}
            y1={positions[a].y}
            x2={positions[b].x}
            y2={positions[b].y}
            stroke="rgba(160,180,255,0.4)"
            strokeWidth={0.3}
            animate={{
              x1: positions[a].x,
              y1: positions[a].y,
              x2: positions[b].x,
              y2: positions[b].y,
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        ))}
        {positions.map((p, i) => (
          <motion.circle
            key={i}
            r={3}
            fill="rgba(180,200,255,0.6)"
            animate={{ cx: p.x, cy: p.y }}
            transition={{ duration: 0.8, ease: "easeOut", type: "spring", stiffness: 100 }}
          />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constellation Animation (insight screen background)
// ---------------------------------------------------------------------------

function ConstellationFormation() {
  const nodes = useMemo(() => {
    const cx = 50;
    const cy = 50;
    const points = [
      { x: cx, y: cy - 18 },
      { x: cx - 16, y: cy - 6 },
      { x: cx + 16, y: cy - 6 },
      { x: cx - 10, y: cy + 14 },
      { x: cx + 10, y: cy + 14 },
      { x: cx, y: cy + 4 },
    ];
    return points.map((p, i) => ({
      id: i,
      finalX: p.x,
      finalY: p.y,
      startX: ((i * 37 + 11) * 19) % 100,
      startY: ((i * 53 + 7) * 13) % 100,
    }));
  }, []);

  const lines = [
    [0, 1], [0, 2], [1, 5], [2, 5],
    [1, 3], [2, 4], [3, 5], [4, 5],
  ];

  return (
    <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-12">
      <div className="relative h-64 w-64">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {lines.map(([a, b], i) => (
            <motion.line
              key={i}
              x1={nodes[a].finalX}
              y1={nodes[a].finalY}
              x2={nodes[b].finalX}
              y2={nodes[b].finalY}
              stroke="rgba(160,180,255,0.25)"
              strokeWidth={0.4}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 1.2 + i * 0.15, duration: 0.8 }}
            />
          ))}
        </svg>
        {nodes.map((n) => (
          <motion.div
            key={n.id}
            className="absolute rounded-full"
            style={{
              width: 7,
              height: 7,
              background:
                "radial-gradient(circle, rgba(180,200,255,0.9), rgba(120,140,255,0.3))",
              boxShadow: "0 0 8px rgba(150,170,255,0.5)",
            }}
            initial={{
              left: `${n.startX}%`,
              top: `${n.startY}%`,
              opacity: 0,
              scale: 0,
            }}
            animate={{
              left: `${n.finalX}%`,
              top: `${n.finalY}%`,
              opacity: 1,
              scale: 1,
            }}
            transition={{
              delay: 0.6 + n.id * 0.12,
              duration: 1.2,
              ease: "easeOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OnboardingFlow() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("blackout");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [breathText, setBreathText] = useState("");
  const [showNextSteps, setShowNextSteps] = useState(false);
  const [archetypeDef, setArchetypeDef] = useState<ArchetypeDef | null>(null);
  const [liveAxes, setLiveAxes] = useState<Record<string, number>>({});
  const [archTheme, setArchTheme] = useState<ArchetypeTheme | null>(null);
  // Atmosphere: subtle background shift per category
  const [bgTint, setBgTint] = useState("#060510");
  const [archetypeResult, setArchetypeResult] = useState<ArchetypeResult | null>(null);
  const [mirrorResult, setMirrorResult] = useState<ZeroMirrorResult | null>(null);
  const [impossibleInsight, setImpossibleInsight] = useState<ImpossibleAccuracyInsight | null>(null);
  const [microInsightText, setMicroInsightText] = useState<string>("");

  const questionStartRef = useRef<number>(0);
  const mirrorShownAtRef = useRef<number>(0);
  const droneRef = useRef<DroneHandle | null>(null);
  const [soundMuted, setSoundMuted] = useState(true);

  // Init mute state from localStorage
  useEffect(() => {
    setSoundMuted(isMuted());
  }, []);

  // Star brightness increases with each answer (0 -> 1)
  const starBrightness = answers.length / TOTAL_QUESTIONS;

  // Generate Zero-Second Mirror on mount
  useEffect(() => {
    generateZeroSecondMirror().then(setMirrorResult).catch(() => {});
  }, []);

  // -- Phase: blackout -> zero_mirror --
  useEffect(() => {
    if (phase !== "blackout") return;
    const t = setTimeout(() => {
      setPhase("zero_mirror");
      mirrorShownAtRef.current = Date.now();
      // Start ambient drone
      if (!droneRef.current) {
        droneRef.current = startDrone("warm", 3000);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [phase]);

  // -- Phase: zero_mirror — NO auto-advance (user must tap to acknowledge) --
  // Removed setTimeout auto-advance. User taps "タップして続ける" to proceed.
  // This transforms passive reading into active recognition.

  // -- Phase: breathing sequence --
  useEffect(() => {
    if (phase !== "breathing") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setBreathText("深呼吸してください。"), 400));
    timers.push(setTimeout(() => setBreathText("ゆっくり吐いて。"), 5000));
    timers.push(setTimeout(() => setBreathText("もう一度。"), 8000));
    timers.push(setTimeout(() => setPhase("intro"), 12000));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // -- Track question start time --
  useEffect(() => {
    if (phase === "question") {
      questionStartRef.current = Date.now();
    }
  }, [phase, questionIndex]);

  // -- Resolve archetype when all questions answered --
  useEffect(() => {
    if (answers.length !== TOTAL_QUESTIONS) return;

    const axisByKey: Partial<Record<TraitAxisKey, number>> = {};
    for (const ans of answers) {
      const q = ONBOARDING_QUESTIONS.find((qq) => qq.id === ans.questionId);
      if (!q) continue;
      const opt = q.options.find((o) => o.id === ans.optionId);
      if (!opt) continue;
      for (const m of opt.axisMappings) {
        axisByKey[m.key] = (axisByKey[m.key] ?? 0) + m.weight;
      }
    }

    // Resolve 27-archetype (with fallback)
    let result: ArchetypeResult | null = null;
    try {
      result = resolveArchetype(axisByKey);
      setArchetypeResult(result);
    } catch (err) {
      console.error("[OnboardingFlow] resolveArchetype failed:", err);
    }

    // Set archetype theme
    if (result) {
      try {
        const theme = getArchetypeTheme(result.code);
        setArchTheme(theme);
      } catch { /* fallback */ }
    }
    setBgTint("#060510");

    // Get archetype definition
    const fallbackDef: ArchetypeDef = {
      code: (result?.code ?? "NCIO") as any,
      cognition: (result?.layer1?.code ?? "N") as any,
      emotion: (result?.layer2?.code ?? "C") as any,
      social: (result?.layer3?.code ?? "I") as any,
      execution: "O" as any,
      name: "未知の観測者",
      englishName: "Unknown Observer",
      emoji: "✦",
      tagline: "まだ言葉にならない何かを探している人。",
      description: "",
      strengths: [],
      blindSpots: [],
      safeState: "",
      stressState: "",
      growthKey: "",
      shadowCode: (result?.code ?? "NCIO") as any,
      shadowTension: "",
    };
    const def = (result ? getArchetypeByCode(result.code) : null) ?? fallbackDef;
    setArchetypeDef(def);

    // Generate impossible accuracy insight
    const microData: MicroObservationData = {
      answers: answers.map((ans) => ({
        questionId: ans.questionId,
        selectedValue: ans.optionId,
        responseTimeMs: ans.responseTimeMs,
        hoveredOptions: [],
      })),
      accumulatedAxes: axisByKey as any,
    };
    try {
      setImpossibleInsight(generateImpossibleAccuracy(microData));
    } catch { /* noop */ }

    // Persist to localStorage for Day 1 home
    try {
      localStorage.setItem("aneurasync_onboarding_answers", JSON.stringify(answers));
      localStorage.setItem("aneurasync_first_archetype", JSON.stringify({
        code: result?.code ?? "unknown",
        name: def.name,
        englishName: def.englishName,
        emoji: def.emoji,
        tagline: def.tagline,
        blindSpot: def.blindSpots?.[0] ?? null,
        confidence: result?.confidence ?? 0,
        createdAt: new Date().toISOString(),
      }));
    } catch { /* noop */ }

    // observations は finishOnboarding で await 付きで保存する（遅延依存を排除）

    // Transition to insight
    const t = setTimeout(() => {
      setPhase("insight");
      playAccent("bell");
      droneRef.current?.setPitch(65, 2000);
    }, 900);
    return () => clearTimeout(t);
  }, [answers]);

  // -- Handlers --

  const handleAnswer = useCallback(
    (optionId: string) => {
      const elapsed = Date.now() - questionStartRef.current;
      const q = ONBOARDING_QUESTIONS[questionIndex];

      const newAnswers: Answer[] = [
        ...answers,
        { questionId: q.id, optionId, responseTimeMs: elapsed },
      ];
      setAnswers(newAnswers);
      playAccent("crystal");

      // Update atmosphere tint based on category
      const CAT_TINTS: Record<string, string> = {
        self_core: "#0a0518",
        emotional_pattern: "#060a18",
        social_style: "#0c0810",
        relationship_mode: "#080516",
        boundary_safety: "#060512",
        style_identity: "#0a0614",
      };
      setBgTint(CAT_TINTS[q.category] ?? "#060510");

      // Update live archetype axes
      const opt = q.options.find((o) => o.id === optionId);
      if (opt) {
        const updated = { ...liveAxes };
        for (const m of opt.axisMappings) {
          updated[m.key] = (updated[m.key] ?? 0) + m.weight;
        }
        setLiveAxes(updated);
      }

      if (questionIndex < TOTAL_QUESTIONS - 1) {
        // Show microInsight after specific questions
        if (MICRO_INSIGHT_AFTER.includes(questionIndex)) {
          const insight = generateResponseTimeInsight(elapsed, questionIndex, newAnswers);
          setMicroInsightText(insight);
          setPhase("microInsight");
          setTimeout(() => {
            setQuestionIndex((i) => i + 1);
            setPhase("question");
          }, 3500);
        } else {
          setPhase("breathPause");
          setTimeout(() => {
            setQuestionIndex((i) => i + 1);
            setPhase("question");
          }, 800);
        }
      }
      // Last question → useEffect handles insight transition
    },
    [questionIndex, answers, liveAxes],
  );

  const finishOnboarding = useCallback(
    async (destination: string) => {
      // Stop drone
      droneRef.current?.stop(1500);
      droneRef.current = null;

      try {
        localStorage.setItem("aneurasync_onboarded", "true");
      } catch { /* noop */ }

      // 1. Stargazer 初期観測を即時永続化（await で完了を保証）
      if (archetypeResult) {
        try {
          await fetch("/api/stargazer/observations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "stage1_multichoice",
              answers: answers.map((a) => ({
                questionId: a.questionId,
                selectedOptionId: a.optionId,
                responseTimeMs: a.responseTimeMs,
              })),
              resolvedType: archetypeResult.code,
              axisScores: liveAxes,
              confidence: archetypeResult.confidence,
              topMatches: (archetypeResult.topMatches ?? []).slice(0, 3).map((m) => ({
                code: m.code,
                label: archetypeDef?.name ?? m.code,
                emoji: archetypeDef?.emoji ?? "⭐",
                score: m.score,
              })),
            }),
          });
        } catch (err) {
          console.error("[OnboardingFlow] Failed to save observations:", err);
        }
      }

      // 2. onboarded_at を書き込む（観測保存後）
      try {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch { /* noop */ }

      router.push(destination);
    },
    [router, answers, archetypeResult, archetypeDef, liveAxes],
  );

  // -- Render helpers --

  const currentQuestion =
    phase === "question" ? ONBOARDING_QUESTIONS[questionIndex] : null;

  const currentCategory = currentQuestion
    ? STAGE1_CATEGORIES.find((c) => c.key === currentQuestion.category)
    : null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: bgTint, transition: "background 1.5s ease" }}
    >
      {/* Mute toggle */}
      {phase !== "blackout" && (
        <button
          onClick={() => {
            const next = !soundMuted;
            setSoundMuted(next);
            setMuted(next);
            if (!next) {
              resumeAudioContext();
              if (!droneRef.current) {
                droneRef.current = startDrone("warm", 1000);
              }
            } else {
              droneRef.current?.stop(500);
              droneRef.current = null;
            }
          }}
          className="fixed right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
          aria-label={soundMuted ? "サウンドON" : "サウンドOFF"}
        >
          <span className="text-xs" style={{ opacity: soundMuted ? 0.3 : 0.7 }}>
            {soundMuted ? "🔇" : "🔊"}
          </span>
        </button>
      )}

      {phase !== "blackout" && <StarField brightness={starBrightness} />}
      {(phase === "question" || phase === "microInsight" || phase === "breathPause") && answers.length > 0 && (
        <LiveConstellation axes={liveAxes} />
      )}

      <AnimatePresence mode="wait">
        {/* ================================================================
            BLACKOUT
        ================================================================= */}
        {phase === "blackout" && (
          <motion.div
            key="blackout"
            className="absolute inset-0"
            style={{ background: "#060510" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          />
        )}

        {/* ================================================================
            ZERO-SECOND MIRROR
        ================================================================= */}
        {phase === "zero_mirror" && mirrorResult && (
          <motion.div
            key="zero_mirror"
            className="flex max-w-sm flex-col items-center gap-8 px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            onClick={() => {
              resumeAudioContext();
              recordMirrorReaction({
                ruleId: mirrorResult.signals.join(","),
                dwellTimeMs: Date.now() - mirrorShownAtRef.current,
                wasEngaged: true,
                timestamp: new Date().toISOString(),
              });
              setPhase("breathing");
            }}
          >
            {/* 鳥肌演出: テキストが薄暗い状態で現れ、2.8秒後に明るくなる（認識のピーク） */}
            <motion.p
              className="whitespace-pre-line text-base leading-loose"
              style={{ color: "rgba(200,210,240,0.8)" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: [0, 0.5, 0.5, 1] }}
              transition={{
                duration: 3.2,
                times: [0, 0.15, 0.75, 0.85],
                ease: "easeOut",
              }}
            >
              {mirrorResult.mirrorText}
            </motion.p>

            {/* 認識の瞬間: テキストが明るくなると同時にグローが広がる */}
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 0.4, 0] }}
              transition={{ duration: 4, times: [0, 0.65, 0.75, 1] }}
              style={{
                position: "absolute",
                inset: -40,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)",
                pointerEvents: "none",
              }}
            />

            {mirrorResult.subText && (
              <motion.p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(160,170,210,0.6)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.5, duration: 1.0 }}
              >
                {mirrorResult.subText}
              </motion.p>
            )}

            {/* タップ促し: 脈動するテキスト（ユーザーの能動的承認を要求） */}
            <motion.p
              className="text-xs tracking-wider"
              style={{ color: "rgba(140,150,200,0.35)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 0.35, 0.6, 0.35] }}
              transition={{
                delay: 4.5,
                duration: 2.5,
                repeat: Infinity,
                repeatType: "loop",
              }}
            >
              タップして続ける
            </motion.p>
          </motion.div>
        )}

        {/* ================================================================
            BREATHING
        ================================================================= */}
        {phase === "breathing" && (
          <motion.div
            key="breathing"
            className="flex flex-col items-center gap-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="relative flex items-center justify-center"
              style={{ width: 120, height: 120 }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px solid rgba(140,160,255,0.25)",
                  boxShadow: "0 0 40px rgba(100,120,255,0.08), inset 0 0 40px rgba(100,120,255,0.04)",
                }}
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="h-3 w-3 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(180,200,255,0.9), rgba(100,120,255,0.2))",
                  boxShadow: "0 0 20px rgba(140,160,255,0.4)",
                }}
                animate={{ scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.p
                key={breathText}
                className="text-center text-base tracking-widest"
                style={{ color: "rgba(200,210,240,0.7)" }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.6 }}
              >
                {breathText}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {/* ================================================================
            INTRO
        ================================================================= */}
        {phase === "intro" && (
          <motion.div
            key="intro"
            className="flex max-w-sm flex-col items-center gap-10 px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="flex flex-col gap-6"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              <p
                className="whitespace-pre-line text-base leading-relaxed"
                style={{ color: "rgba(200,210,240,0.8)" }}
              >
                {"10の問いに答えてください。\n正解はありません。\n直感のまま、最初に浮かんだものを選んでください。"}
              </p>
              <p
                className="whitespace-pre-line text-sm leading-relaxed"
                style={{ color: "rgba(160,170,210,0.6)" }}
              >
                {"それだけで、\nあなたの深層プロファイルが形を成し始めます。"}
              </p>
            </motion.div>
            <motion.button
              className="rounded-full px-10 py-3 text-sm font-medium tracking-wider"
              style={{
                background: "linear-gradient(135deg, rgba(100,120,255,0.2), rgba(140,100,255,0.2))",
                border: "1px solid rgba(140,160,255,0.3)",
                color: "rgba(200,210,255,0.9)",
                boxShadow: "0 0 20px rgba(100,120,255,0.1)",
              }}
              whileHover={{ boxShadow: "0 0 30px rgba(100,120,255,0.25)", scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.6 }}
              onClick={() => setPhase("question")}
            >
              始める
            </motion.button>
          </motion.div>
        )}

        {/* ================================================================
            MICRO INSIGHT (after Q1 and Q5)
        ================================================================= */}
        {phase === "microInsight" && (
          <motion.div
            key="microInsight"
            className="flex max-w-sm flex-col items-center gap-6 px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="h-1 w-1 rounded-full"
              style={{
                background: "rgba(180,200,255,0.6)",
                boxShadow: "0 0 12px rgba(140,160,255,0.4)",
              }}
              animate={{ scale: [1, 2, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
            <motion.p
              className="whitespace-pre-line text-sm leading-relaxed"
              style={{ color: "rgba(180,190,230,0.75)" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              {microInsightText}
            </motion.p>
          </motion.div>
        )}

        {/* ================================================================
            BREATH PAUSE (between questions)
        ================================================================= */}
        {phase === "breathPause" && (
          <motion.div
            key="breathPause"
            className="flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="h-2 w-2 rounded-full"
              style={{
                background: "rgba(180,200,255,0.6)",
                boxShadow: "0 0 16px rgba(140,160,255,0.4)",
              }}
              animate={{ scale: [1, 1.8, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </motion.div>
        )}

        {/* ================================================================
            QUESTION (10問 × 3-4択)
        ================================================================= */}
        {phase === "question" && currentQuestion && (
          <motion.div
            key={`question-${questionIndex}`}
            className="flex max-w-sm flex-col items-center gap-8 px-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
          >
            {/* Progress bar — 10 segments */}
            <div className="flex items-center gap-1">
              {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => (
                <motion.div
                  key={i}
                  className="h-1 rounded-full"
                  style={{
                    width: "clamp(14px, 3vw, 24px)",
                    background:
                      i < questionIndex
                        ? "rgba(160,180,255,0.8)"
                        : i === questionIndex
                          ? "rgba(160,180,255,0.6)"
                          : "rgba(100,110,150,0.2)",
                  }}
                  animate={
                    i === questionIndex ? { opacity: [0.5, 1, 0.5] } : undefined
                  }
                  transition={
                    i === questionIndex ? { duration: 2, repeat: Infinity } : undefined
                  }
                />
              ))}
            </div>

            {/* Category label */}
            {currentCategory && (
              <motion.p
                className="text-xs tracking-[0.2em]"
                style={{ color: "rgba(140,160,255,0.5)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
              >
                {currentCategory.emoji} {currentCategory.label}
              </motion.p>
            )}

            {/* Question counter */}
            <p
              className="text-xs tracking-[0.3em]"
              style={{ color: "rgba(140,150,200,0.4)" }}
            >
              Q{questionIndex + 1} / {TOTAL_QUESTIONS}
            </p>

            {/* Question prompt */}
            <motion.p
              className="whitespace-pre-line text-center text-lg leading-relaxed"
              style={{ color: "rgba(220,225,245,0.9)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              {currentQuestion.prompt}
            </motion.p>

            {/* Options (3-4 choices) */}
            <div className="flex w-full flex-col gap-3">
              {currentQuestion.options.map((opt, i) => (
                <motion.button
                  key={opt.id}
                  className="w-full rounded-2xl px-5 py-4 text-center text-sm font-medium"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(140,160,255,0.15)",
                    color: "rgba(210,215,240,0.85)",
                    backdropFilter: "blur(8px)",
                  }}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -16 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                  whileHover={{
                    background: "rgba(100,120,255,0.08)",
                    borderColor: "rgba(140,160,255,0.35)",
                    boxShadow: "0 0 24px rgba(100,120,255,0.1)",
                    scale: 1.01,
                  }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleAnswer(opt.id)}
                >
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ================================================================
            INSIGHT (27-archetype result + impossible accuracy)
        ================================================================= */}
        {phase === "insight" && archetypeDef && (
          <motion.div
            key="insight"
            className="relative flex w-full max-w-sm flex-col items-center px-6 text-center overflow-y-auto"
            style={{ maxHeight: "100vh", paddingBottom: 40 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <ConstellationFormation />
            <div className="h-56" />

            {/* Archetype figure */}
            <motion.div
              className="relative mx-auto"
              style={{ width: 80, height: 80 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, duration: 0.6, type: "spring" }}
            >
              <img
                src={`/samples/figure/${archetypeDef.englishName.toLowerCase()}.png`}
                alt={archetypeDef.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.innerHTML = `<span style="font-size:3rem">${archetypeDef.emoji}</span>`;
                }}
              />
            </motion.div>

            {/* "あなたは" lead-in */}
            <motion.p
              className="mt-3 text-sm tracking-[0.2em]"
              style={{ color: "rgba(160,170,220,0.5)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.6 }}
            >
              あなたは
            </motion.p>

            {/* Archetype name */}
            <motion.h1
              className="mt-3 text-3xl font-light tracking-wider"
              style={{
                color: archTheme ? archTheme.palette.primary : "rgba(210,220,255,0.95)",
                textShadow: archTheme ? `0 0 30px ${archTheme.palette.nebulaColor}40` : "none",
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.2, duration: 0.8 }}
              onAnimationComplete={() => {
                document.getElementById("insight-archetype")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              id="insight-archetype"
            >
              {archetypeDef.name}
            </motion.h1>

            {/* Tagline */}
            <motion.p
              className="mt-4 text-sm leading-relaxed italic"
              style={{ color: "rgba(180,190,230,0.7)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.0, duration: 0.6 }}
            >
              {archetypeDef.tagline}
            </motion.p>

            {/* Blind spot hint */}
            {archetypeDef.blindSpots?.[0] && (
              <motion.div
                className="mt-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.6, duration: 0.6 }}
                onAnimationComplete={() => {
                  document.getElementById("insight-blindspot")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                id="insight-blindspot"
              >
                <p className="mb-1 text-[10px] tracking-[0.25em]" style={{ color: "rgba(255,180,140,0.45)" }}>
                  BLIND SPOT
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(200,180,200,0.7)" }}>
                  {archetypeDef.blindSpots[0]}
                </p>
              </motion.div>
            )}

            {/* ── Impossible Accuracy Layers ── */}
            {impossibleInsight && impossibleInsight.avoidance.confidence >= 0.5 && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 4.2, duration: 0.8 }}
                onAnimationComplete={() => {
                  document.getElementById("insight-avoidance")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                id="insight-avoidance"
              >
                <p className="mb-1.5 text-[10px] tracking-[0.25em]" style={{ color: "rgba(255,140,140,0.45)" }}>つい避けてしまうこと</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(200,180,200,0.75)" }}>{impossibleInsight.avoidance.text}</p>
              </motion.div>
            )}

            {impossibleInsight && impossibleInsight.latentDesire.confidence >= 0.5 && (
              <motion.div
                className="mt-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 5.0, duration: 0.8 }}
                onAnimationComplete={() => {
                  document.getElementById("insight-desire")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                id="insight-desire"
              >
                <p className="mb-1.5 text-[10px] tracking-[0.25em]" style={{ color: "rgba(140,180,255,0.45)" }}>本当はほしいもの</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(180,200,230,0.75)" }}>{impossibleInsight.latentDesire.text}</p>
              </motion.div>
            )}

            {/* Punch Line */}
            {impossibleInsight && (
              <motion.p
                className="mt-8 text-lg font-light leading-relaxed tracking-wide"
                style={{ color: "rgba(230,220,255,0.95)" }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 6.0, duration: 1 }}
                onAnimationComplete={() => {
                  document.getElementById("insight-punch")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                id="insight-punch"
              >
                {impossibleInsight.punchLine}
              </motion.p>
            )}

            {/* ── coreFear / coreDesire ── */}
            {archetypeDef.coreFear && archetypeDef.coreDesire && (
              <motion.div
                className="mt-6 w-full space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 6.5, duration: 0.8 }}
                onAnimationComplete={() => {
                  document.getElementById("insight-roots")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                id="insight-roots"
              >
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,100,100,0.04)",
                    border: "1px solid rgba(255,120,120,0.12)",
                  }}
                >
                  <p className="mb-1 text-[10px] tracking-[0.25em]" style={{ color: "rgba(255,140,140,0.5)" }}>
                    最も恐れること
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(220,200,210,0.8)" }}>
                    {archetypeDef.coreFear}
                  </p>
                </div>
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(100,140,255,0.04)",
                    border: "1px solid rgba(120,150,255,0.12)",
                  }}
                >
                  <p className="mb-1 text-[10px] tracking-[0.25em]" style={{ color: "rgba(140,170,255,0.5)" }}>
                    最も求めること
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(200,210,230,0.8)" }}>
                    {archetypeDef.coreDesire}
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── 完了の区切り線 + 深度メッセージ ── */}
            <motion.div
              className="mt-8 w-full flex flex-col items-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 7.5, duration: 1.0 }}
            >
              {/* 区切り線 */}
              <motion.div
                className="h-px w-16"
                style={{ background: "linear-gradient(90deg, transparent, rgba(160,180,255,0.3), transparent)" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 7.8, duration: 0.6 }}
              />
              {/* 完了メッセージ */}
              <motion.p
                className="text-sm font-light tracking-wider"
                style={{ color: "rgba(200,210,240,0.7)" }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 8.0, duration: 0.8 }}
              >
                あなたの深層観測が始まりました
              </motion.p>
              <motion.p
                className="whitespace-pre-line text-xs leading-loose"
                style={{ color: "rgba(140,150,200,0.45)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 8.5, duration: 0.6 }}
              >
                {"これはまだ輪郭の一部。\n観測を重ねるほど、見えなかった自分が現れます。"}
              </motion.p>
            </motion.div>

            {/* ═══ 即報酬セクション — 「見えた自分」を即座に返す ═══ */}

            {/* Card 1: 初期観測レポート */}
            {archetypeDef && (
              <motion.div
                className="mt-6 w-full rounded-2xl px-5 py-4"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(140,160,255,0.12)",
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 8.5, duration: 0.6 }}
              >
                <p className="text-[10px] tracking-widest uppercase mb-3" style={{ color: "rgba(140,160,255,0.5)" }}>
                  {archetypeDef.emoji} あなたの初期観測レポート
                </p>
                <div className="space-y-2.5">
                  {archetypeDef.strengths?.[0] && (
                    <div className="flex gap-2.5">
                      <span className="text-xs mt-0.5" style={{ color: "rgba(100,200,150,0.7)" }}>強み</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(200,210,240,0.75)" }}>{archetypeDef.strengths[0]}</p>
                    </div>
                  )}
                  {archetypeDef.safeState && (
                    <div className="flex gap-2.5">
                      <span className="text-xs mt-0.5" style={{ color: "rgba(100,180,255,0.7)" }}>安全時</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(200,210,240,0.75)" }}>{archetypeDef.safeState}</p>
                    </div>
                  )}
                  {archetypeDef.growthKey && (
                    <div className="flex gap-2.5">
                      <span className="text-xs mt-0.5" style={{ color: "rgba(255,180,100,0.7)" }}>成長の鍵</span>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(200,210,240,0.75)" }}>{archetypeDef.growthKey}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Card 2: 今日の一手 */}
            {archetypeDef && (
              <motion.div
                className="mt-3 w-full rounded-2xl px-5 py-4"
                style={{
                  background: "linear-gradient(135deg, rgba(100,120,255,0.06), rgba(160,100,255,0.04))",
                  border: "1px solid rgba(140,160,255,0.15)",
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 9.2, duration: 0.6 }}
              >
                <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "rgba(140,160,255,0.5)" }}>
                  ✦ 今日の一手
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(220,225,255,0.9)" }}>
                  {(() => {
                    const key = `${archetypeDef.cognition}${archetypeDef.emotion}`;
                    const actions: Record<string, string> = {
                      AC: "今日の決断で、直感と論理のどちらを先に使ったか1行メモしてみて",
                      AV: "今日一番イラッとした瞬間を思い出して、その裏にあった期待を1行書いてみて",
                      NC: "今日ふと浮かんだ直感を、1つだけメモしてみて。夜に見返すと意味が見える",
                      NV: "今日一番エネルギーが動いた瞬間を、スマホのメモに3語で残してみて",
                      SC: "今すぐ肩を回してみて。軽い？重い？それが今の自分の状態",
                      SV: "今日一番心が動いた瞬間、胸と胃のどちらが反応したか確認してみて",
                    };
                    return actions[key] ?? "今日の自分を3語で表してメモしてみて";
                  })()}
                </p>
              </motion.div>
            )}

            {/* Card 3: 次にやる1アクション */}
            <motion.div
              className="mt-3 w-full space-y-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 9.8, duration: 0.6 }}
            >
              <p className="text-[10px] tracking-widest uppercase mb-2 text-center" style={{ color: "rgba(140,160,255,0.4)" }}>
                次の1歩を選ぶ
              </p>
              {[
                { icon: "🔭", label: "深層観測", time: "3分", reward: `精度が${Math.round((archetypeResult?.confidence ?? 0.3) * 100)}%→${Math.min(99, Math.round((archetypeResult?.confidence ?? 0.3) * 100) + 18)}%に上がる`, href: "/stargazer" },
                { icon: "🧬", label: "外見診断", time: "3分", reward: "Genome Cardの外見が完成する", href: "/body-color/avatar" },
                { icon: "🌍", label: "記憶探索", time: "5分", reward: "性格の「なぜ」が見える", href: "/origin" },
              ].map((item, i) => (
                <motion.button
                  key={item.href}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(140,160,255,0.08)" }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 10.0 + i * 0.2, duration: 0.4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    trackInteraction("onboarding", "next_step_chosen", {
                      choice: item.label,
                      href: item.href,
                      archetype: archetypeResult?.code ?? "unknown",
                    });
                    finishOnboarding(item.href);
                  }}
                >
                  <span className="text-base">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium" style={{ color: "rgba(210,215,240,0.85)" }}>
                      {item.label}
                    </span>
                    <span className="text-[10px] ml-1.5" style={{ color: "rgba(140,160,255,0.4)" }}>
                      {item.time}
                    </span>
                  </div>
                  <span className="text-[10px] text-right" style={{ color: "rgba(140,160,255,0.5)" }}>
                    → {item.reward}
                  </span>
                </motion.button>
              ))}
            </motion.div>

            {/* Primary CTA — Stargazer誘導（強調） */}
            <motion.div
              className="mt-8 w-full flex flex-col items-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 10.5, duration: 0.6 }}
            >
              <motion.p
                className="text-[11px] mb-3 text-center"
                style={{ color: "rgba(180,190,255,0.7)" }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                👇 ここをクリックすれば、深層観測が始まるよ
              </motion.p>
              <motion.button
                className="rounded-full px-8 py-4 text-sm font-medium tracking-wider relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(100,120,255,0.35), rgba(160,100,255,0.3))",
                  border: "2px solid rgba(140,160,255,0.5)",
                  color: "rgba(230,235,255,1)",
                }}
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(100,120,255,0.15), 0 0 60px rgba(120,140,255,0.08)",
                    "0 0 40px rgba(120,140,255,0.3), 0 0 80px rgba(140,160,255,0.15)",
                    "0 0 20px rgba(100,120,255,0.15), 0 0 60px rgba(120,140,255,0.08)",
                  ],
                  scale: [1, 1.02, 1],
                }}
                transition={{
                  boxShadow: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
                  scale: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  trackInteraction("onboarding", "next_step_chosen", { choice: "primary_cta", href: "/stargazer", archetype: archetypeResult?.code ?? "unknown" });
                  finishOnboarding("/stargazer");
                }}
                onAnimationComplete={() => {
                  document.getElementById("insight-cta")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                id="insight-cta"
              >
                ✦ {(() => {
                  if (!archetypeResult) return "深層観測で、本当のあなたを解き明かす";
                  const l1 = archetypeResult.layer1.code;
                  if (l1 === "A") return "あなたの「設計図」の全体像を見る";
                  if (l1 === "N") return "あなたの「直感」がどこから来るか、突き止める";
                  return "あなたの「感覚」が何を捉えているか、言語化する";
                })()}
              </motion.button>
            </motion.div>
            <motion.p
              className="mt-2 text-[10px] leading-relaxed text-center"
              style={{ color: "rgba(140,150,200,0.4)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 11.3, duration: 0.6 }}
            >
              {(() => {
                if (!archetypeResult) return "深層観測で判断特性・矛盾・盲点を精密に観測します";
                const l3 = archetypeResult.layer3.code;
                if (l3 === "I") return "一人でじっくり向き合える形式。あなた向きの観測体験です";
                return "発見を誰かに話したくなる。そんな観測体験がここから始まります";
              })()}
            </motion.p>

            {/* 他のルートで自分を知る */}
            <motion.div
              className="mt-4 w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 11.8, duration: 0.6 }}
            >
              <button
                className="mx-auto flex items-center gap-2 py-2 text-xs tracking-wider"
                style={{ color: "rgba(140,150,200,0.45)" }}
                onClick={() => setShowNextSteps((v) => !v)}
              >
                <span>他のルートで自分を知る</span>
                <motion.span
                  animate={{ rotate: showNextSteps ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ display: "inline-block" }}
                >
                  ▼
                </motion.span>
              </button>

              <AnimatePresence>
                {showNextSteps && (
                  <motion.div
                    className="mt-3 flex flex-col gap-3 overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <button
                      className="w-full rounded-xl px-5 py-4 text-left transition-colors"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(140,160,255,0.1)" }}
                      onClick={() => finishOnboarding("/body-color/avatar")}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-lg" aria-hidden>🧬</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "rgba(210,215,240,0.85)" }}>
                            パーソナルカラー・骨格を診断する
                          </p>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(150,160,200,0.5)" }}>
                            カメラで顔・体型を分析 → Genome Cardの「外見」セクションが完成
                          </p>
                          <p className="mt-1.5 text-xs" style={{ color: "rgba(140,160,255,0.4)" }}>約3分</p>
                        </div>
                      </div>
                    </button>

                    <button
                      className="w-full rounded-xl px-5 py-4 text-left transition-colors"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(140,160,255,0.1)" }}
                      onClick={() => finishOnboarding("/origin")}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-lg" aria-hidden>🌍</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "rgba(210,215,240,0.85)" }}>
                            記憶を掘り起こす
                          </p>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(150,160,200,0.5)" }}>
                            育った環境・子どもの頃の記憶をたどって → 性格の「なぜ」が見える
                          </p>
                          <p className="mt-1.5 text-xs" style={{ color: "rgba(140,160,255,0.4)" }}>約5分</p>
                        </div>
                      </div>
                    </button>

                    <button
                      className="mx-auto py-3 text-xs tracking-wider"
                      style={{ color: "rgba(140,150,200,0.35)" }}
                      onClick={() => finishOnboarding("/")}
                    >
                      ⏭ ホームに戻る（いつでも始められます）
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
