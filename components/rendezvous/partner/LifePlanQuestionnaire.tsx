"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RvCard,
  RvButton,
  RvStoryProgressBar,
  RvProgressRing,
  RvAnimaText,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import {
  deriveLifePlanProfile,
  PROFILE_CATEGORY_LABELS,
} from "@/lib/rendezvous/partner/lifePlanProfile";

const PARTNER_COLOR = RV_CATEGORY_COLORS.partner;

type Question = {
  id: string;
  questionText: string;
  leftLabel: string;
  rightLabel: string;
  scale: number;
  category: string;
};

type AnswerMap = Record<string, { value: number; saved: boolean }>;

type AxisCoverage = Record<string, { total: number; answered: number }>;

const CATEGORY_LABELS: Record<string, string> = {
  financial: "金銭感覚",
  career: "仕事と家庭",
  family: "家族計画",
  kinship: "親族との距離",
  lifestyle: "生活水準",
  intimacy: "親密さ",
  health: "健康・習慣",
  culture: "文化・価値観",
};

const CATEGORY_ICONS: Record<string, string> = {
  financial: "\uD83D\uDCB0",
  career: "\uD83D\uDCBC",
  family: "\uD83D\uDC76",
  kinship: "\uD83C\uDFE0",
  lifestyle: "\u2728",
  intimacy: "\uD83E\uDD1D",
  health: "\uD83C\uDF3F",
  culture: "\uD83C\uDFA8",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  financial: "お金との向き合い方について",
  career: "仕事と家庭のバランスについて",
  family: "家族をどう築くかについて",
  kinship: "親族との距離感について",
  lifestyle: "暮らしの水準と価値観について",
  intimacy: "パートナーとの親密さについて",
  health: "健康と生活習慣について",
  culture: "文化や価値観の共有について",
};

const CATEGORY_ORDER = [
  "financial",
  "career",
  "family",
  "kinship",
  "lifestyle",
  "intimacy",
  "health",
  "culture",
];

type Phase = "questions" | "complete";

/**
 * Life Plan 質問画面 — 1問1画面のイマーシブ体験
 * 35問をカード形式で1問ずつ表示。スワイプ/ボタンで進む。
 * 回答はリアルタイムで /api/rendezvous/partner/life-plan に POST。
 */
export default function LifePlanQuestionnaire() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [axisCoverage, setAxisCoverage] = useState<AxisCoverage>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completionRate, setCompletionRate] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = back, 1 = forward
  const [phase, setPhase] = useState<Phase>("questions");
  const [showCategoryInterstitial, setShowCategoryInterstitial] = useState(false);
  const [interstitialCategory, setInterstitialCategory] = useState("");
  const [justAnswered, setJustAnswered] = useState(false);
  const [showReviewAnswers, setShowReviewAnswers] = useState(false);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ordered questions by category
  const orderedQuestions = CATEGORY_ORDER.flatMap((cat) =>
    questions.filter((q) => q.category === cat)
  );

  const totalQuestions = orderedQuestions.length;
  const currentQuestion = orderedQuestions[currentIndex];

  // Category info for current question
  const currentCategory = currentQuestion?.category ?? "";
  const categoryQuestions = orderedQuestions.filter(
    (q) => q.category === currentCategory
  );
  const indexInCategory =
    categoryQuestions.findIndex((q) => q.id === currentQuestion?.id) + 1;
  const categoryTotal = categoryQuestions.length;

  // Fetch questions and existing answers
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/rendezvous/partner/life-plan");
        if (!res.ok) return;
        const data = await res.json();

        const existingAnswers: AnswerMap = {};
        for (const r of data.responses ?? []) {
          existingAnswers[r.questionId] = { value: r.value, saved: true };
        }
        setAnswers(existingAnswers);
        setCompletionRate(data.progress?.completionRate ?? 0);
        setAxisCoverage(data.progress?.axisCoverage ?? {});

        const qRes = await fetch(
          "/api/rendezvous/partner/life-plan/questions"
        );
        if (qRes.ok) {
          const qData = await qRes.json();
          setQuestions(qData.questions ?? []);
        }
      } catch (err) {
        console.error("[LifePlanQ] load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Find first unanswered question on load
  useEffect(() => {
    if (orderedQuestions.length === 0) return;
    const firstUnanswered = orderedQuestions.findIndex(
      (q) => !answers[q.id]
    );
    if (firstUnanswered > 0) {
      setCurrentIndex(firstUnanswered);
    }
    // Check if all answered
    const allAnswered = orderedQuestions.every((q) => answers[q.id]);
    if (allAnswered && orderedQuestions.length > 0) {
      setPhase("complete");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const navigateTo = useCallback(
    (index: number, dir: number) => {
      if (index < 0 || index >= totalQuestions) return;

      // Check if entering a new category
      const prevCategory = orderedQuestions[currentIndex]?.category;
      const nextCategory = orderedQuestions[index]?.category;

      if (
        prevCategory &&
        nextCategory &&
        prevCategory !== nextCategory &&
        dir > 0
      ) {
        // Show category interstitial
        setInterstitialCategory(nextCategory);
        setShowCategoryInterstitial(true);
        setTimeout(() => {
          setShowCategoryInterstitial(false);
          setDirection(dir);
          setCurrentIndex(index);
        }, 1200);
      } else {
        setDirection(dir);
        setCurrentIndex(index);
      }
    },
    [currentIndex, totalQuestions, orderedQuestions]
  );

  const goNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      navigateTo(currentIndex + 1, 1);
    } else {
      // All questions seen
      setPhase("complete");
    }
  }, [currentIndex, totalQuestions, navigateTo]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      navigateTo(currentIndex - 1, -1);
    }
  }, [currentIndex, navigateTo]);

  const handleAnswer = useCallback(
    async (questionId: string, value: number) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: { value, saved: false },
      }));
      setJustAnswered(true);

      // Auto-save
      setSaving(true);
      try {
        const res = await fetch("/api/rendezvous/partner/life-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responses: [{ questionId, value }] }),
        });
        if (res.ok) {
          const data = await res.json();
          setAnswers((prev) => ({
            ...prev,
            [questionId]: { value, saved: true },
          }));
          setCompletionRate(data.progress?.completionRate ?? 0);
        }
      } catch {
        // Will retry on next interaction
      } finally {
        setSaving(false);
      }

      // Auto-advance after 600ms
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        setJustAnswered(false);
        goNext();
      }, 600);
    },
    [goNext]
  );

  // Swipe handler
  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const threshold = 60;
      if (info.offset.x < -threshold) {
        goNext();
      } else if (info.offset.x > threshold) {
        goBack();
      }
    },
    [goNext, goBack]
  );

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          color: RV_COLORS.textMuted,
          fontSize: 13,
        }}
      >
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          観測を準備しています...
        </motion.div>
      </div>
    );
  }

  if (totalQuestions === 0) {
    return (
      <div
        style={{
          padding: "40px 16px",
          textAlign: "center",
          color: RV_COLORS.textMuted,
          fontSize: 13,
        }}
      >
        質問データを読み込めませんでした
      </div>
    );
  }

  // ── Completion Screen ──
  if (phase === "complete") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          padding: "40px 24px",
          textAlign: "center",
        }}
      >
        <FadeInView delay={0.1}>
          <RvProgressRing
            progress={1}
            size={120}
            strokeWidth={6}
            color={PARTNER_COLOR}
          >
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: PARTNER_COLOR,
              }}
            >
              100%
            </span>
          </RvProgressRing>
        </FadeInView>

        <FadeInView delay={0.3}>
          <p
            style={{
              marginTop: 32,
              fontSize: 18,
              fontWeight: 600,
              color: RV_COLORS.text,
              fontFamily: '"Noto Serif JP", serif',
              lineHeight: 1.6,
            }}
          >
            人生設計の観測が完了しました
          </p>
        </FadeInView>

        <FadeInView delay={0.5}>
          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              color: RV_COLORS.textSub,
              lineHeight: 1.6,
            }}
          >
            あなたの人生設計が形になりました
          </p>
        </FadeInView>

        {/* Life Plan Profile Summary */}
        {(() => {
          const profile = deriveLifePlanProfile(answers, orderedQuestions);
          if (!profile) return null;
          return (
            <FadeInView delay={0.6}>
              <div
                style={{
                  marginTop: 24,
                  marginBottom: 24,
                  padding: "20px 24px",
                  borderRadius: 16,
                  background: RV_COLORS.surface,
                  border: `1px solid ${PARTNER_COLOR}15`,
                  boxShadow: `0 2px 12px ${RV_COLORS.shadow}`,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: PARTNER_COLOR,
                    letterSpacing: "0.1em",
                    marginBottom: 10,
                  }}
                >
                  あなたの人生観プロファイル
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: RV_COLORS.text,
                    fontFamily: '"Noto Serif JP", serif',
                    marginBottom: 8,
                  }}
                >
                  {profile.label}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: RV_COLORS.textSub,
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {profile.description}
                </p>

                {/* Category bar chart */}
                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {Object.entries(profile.categoryScores)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([cat, score]) => (
                      <div
                        key={cat}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: RV_COLORS.textMuted,
                            width: 56,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {PROFILE_CATEGORY_LABELS[cat] || cat}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            background: RV_COLORS.surfaceMuted,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${score * 100}%`,
                              height: "100%",
                              borderRadius: 2,
                              background:
                                cat === profile.strongestCategory
                                  ? PARTNER_COLOR
                                  : `${PARTNER_COLOR}60`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </FadeInView>
          );
        })()}

        {/* Primary action: back to partner settings */}
        <FadeInView delay={0.8}>
          <div style={{ marginTop: 40 }}>
            <RvButton
              onClick={() => {
                router.push("/rendezvous/partner");
              }}
            >
              パートナー設定に戻る
            </RvButton>
          </div>
        </FadeInView>

        {/* Secondary: review answers (expandable) */}
        <FadeInView delay={1.0}>
          <div style={{ marginTop: 24, width: "100%", maxWidth: 400 }}>
            <button
              onClick={() => setShowReviewAnswers((prev) => !prev)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                color: RV_COLORS.textMuted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "8px 0",
                transition: "color 0.2s",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  transform: showReviewAnswers
                    ? "rotate(90deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s",
                  fontSize: 10,
                }}
              >
                {"\u25B6"}
              </span>
              回答を見直す
            </button>

            <AnimatePresence>
              {showReviewAnswers && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {CATEGORY_ORDER.map((cat) => {
                      const catQuestions = orderedQuestions.filter(
                        (q) => q.category === cat
                      );
                      if (catQuestions.length === 0) return null;
                      return (
                        <div
                          key={cat}
                          style={{
                            padding: "12px 16px",
                            borderRadius: 12,
                            background: RV_COLORS.surface,
                            border: `1px solid ${RV_COLORS.border}`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: PARTNER_COLOR,
                              marginBottom: 8,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span>{CATEGORY_ICONS[cat]}</span>
                            {CATEGORY_LABELS[cat]}
                          </div>
                          {catQuestions.map((q) => {
                            const ans = answers[q.id];
                            return (
                              <div
                                key={q.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "6px 0",
                                  borderBottom: `1px solid ${RV_COLORS.border}40`,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: RV_COLORS.textSub,
                                    flex: 1,
                                    lineHeight: 1.5,
                                    paddingRight: 12,
                                  }}
                                >
                                  {q.questionText}
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    flexShrink: 0,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: RV_COLORS.textMuted,
                                    }}
                                  >
                                    {q.leftLabel}
                                  </span>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 2,
                                    }}
                                  >
                                    {Array.from(
                                      { length: q.scale },
                                      (_, i) => (
                                        <div
                                          key={i}
                                          style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: "50%",
                                            background:
                                              ans && ans.value === i + 1
                                                ? PARTNER_COLOR
                                                : RV_COLORS.surfaceMuted,
                                          }}
                                        />
                                      )
                                    )}
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: RV_COLORS.textMuted,
                                    }}
                                  >
                                    {q.rightLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </FadeInView>
      </div>
    );
  }

  // ── Category Interstitial Overlay ──
  if (showCategoryInterstitial) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          padding: "40px 24px",
          textAlign: "center",
        }}
      >
        <AnimatePresence>
          <motion.div
            key={interstitialCategory}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span style={{ fontSize: 48 }}>
              {CATEGORY_ICONS[interstitialCategory]}
            </span>
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: RV_COLORS.text,
                fontFamily: '"Noto Serif JP", serif',
              }}
            >
              {CATEGORY_LABELS[interstitialCategory]}
            </p>
            <p
              style={{
                fontSize: 13,
                color: RV_COLORS.textSub,
                lineHeight: 1.6,
              }}
            >
              {CATEGORY_DESCRIPTIONS[interstitialCategory]}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── Question Card Screen ──
  const slideVariants = {
    enter: (d: number) => ({
      x: d > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (d: number) => ({
      x: d > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "70vh",
        maxWidth: 480,
        margin: "0 auto",
        padding: "0 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Top Bar ── */}
      <div style={{ padding: "16px 0 8px" }}>
        {/* Back button + Category label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            style={{
              background: "none",
              border: "none",
              cursor: currentIndex === 0 ? "default" : "pointer",
              opacity: currentIndex === 0 ? 0.3 : 1,
              fontSize: 13,
              color: RV_COLORS.textSub,
              fontWeight: 500,
              padding: "4px 0",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "opacity 0.2s",
            }}
          >
            <span style={{ fontSize: 16 }}>{"\u2039"}</span> 戻る
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: PARTNER_COLOR,
            }}
          >
            <span>{CATEGORY_ICONS[currentCategory]}</span>
            <span>{CATEGORY_LABELS[currentCategory]}</span>
            <span
              style={{
                color: RV_COLORS.textMuted,
                fontWeight: 400,
              }}
            >
              {indexInCategory}/{categoryTotal}
            </span>
          </div>

          <span
            style={{
              fontSize: 11,
              color: RV_COLORS.textMuted,
              minWidth: 48,
              textAlign: "right",
            }}
          >
            {Math.round(completionRate * 100)}%
          </span>
        </div>

        {/* Story Progress Bar */}
        <RvStoryProgressBar
          total={totalQuestions}
          current={currentIndex}
          progress={answers[currentQuestion?.id] ? 1 : 0}
        />
      </div>

      {/* ── Question Card Area ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 0",
          minHeight: 380,
        }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentQuestion?.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{
              width: "100%",
              touchAction: "pan-y",
            }}
          >
            <RvCard elevated>
              <div style={{ padding: "28px 20px 24px" }}>
                {/* Question number */}
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: RV_COLORS.textMuted,
                    letterSpacing: "0.05em",
                    marginBottom: 16,
                  }}
                >
                  Q.{currentIndex + 1}
                </p>

                {/* Question text */}
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: RV_COLORS.text,
                    lineHeight: 1.8,
                    marginBottom: 32,
                    minHeight: 60,
                  }}
                >
                  {currentQuestion?.questionText}
                </p>

                {/* Semantic labels */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                    padding: "0 4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: PARTNER_COLOR,
                      fontWeight: 600,
                      maxWidth: "38%",
                      lineHeight: 1.5,
                    }}
                  >
                    {currentQuestion?.leftLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: PARTNER_COLOR,
                      fontWeight: 600,
                      maxWidth: "38%",
                      textAlign: "right",
                      lineHeight: 1.5,
                    }}
                  >
                    {currentQuestion?.rightLabel}
                  </span>
                </div>

                {/* ── Scale Track ── */}
                {currentQuestion && (
                  <ScaleTrack
                    scale={currentQuestion.scale}
                    value={answers[currentQuestion.id]?.value ?? null}
                    onSelect={(val) =>
                      handleAnswer(currentQuestion.id, val)
                    }
                  />
                )}

                {/* Answered indicator */}
                <AnimatePresence>
                  {justAnswered && answers[currentQuestion?.id]?.value && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        marginTop: 16,
                        textAlign: "center",
                        fontSize: 11,
                        color: RV_COLORS.textMuted,
                      }}
                    >
                      次の質問へ...
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </RvCard>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom Navigation ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 0 24px",
        }}
      >
        <button
          onClick={goBack}
          disabled={currentIndex === 0}
          style={{
            background: "none",
            border: `1.5px solid ${currentIndex === 0 ? RV_COLORS.border : `${PARTNER_COLOR}40`}`,
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 600,
            color: currentIndex === 0 ? RV_COLORS.textMuted : PARTNER_COLOR,
            cursor: currentIndex === 0 ? "default" : "pointer",
            opacity: currentIndex === 0 ? 0.4 : 1,
            transition: "all 0.2s",
          }}
        >
          {"\u2190"} 前へ
        </button>

        {/* Dot indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {CATEGORY_ORDER.map((cat) => {
            const isCurrentCat = cat === currentCategory;
            const catQs = orderedQuestions.filter(
              (q) => q.category === cat
            );
            const allAnswered =
              catQs.length > 0 && catQs.every((q) => answers[q.id]);
            return (
              <div
                key={cat}
                style={{
                  width: isCurrentCat ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: allAnswered
                    ? "#00C853"
                    : isCurrentCat
                      ? PARTNER_COLOR
                      : RV_COLORS.surfaceMuted,
                  transition: "all 0.3s",
                }}
              />
            );
          })}
        </div>

        <button
          onClick={goNext}
          style={{
            background: answers[currentQuestion?.id]
              ? PARTNER_COLOR
              : "none",
            border: `1.5px solid ${PARTNER_COLOR}${answers[currentQuestion?.id] ? "" : "40"}`,
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 600,
            color: answers[currentQuestion?.id]
              ? "#fff"
              : PARTNER_COLOR,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {currentIndex === totalQuestions - 1 ? "完了" : "次へ"}{" "}
          {"\u2192"}
        </button>
      </div>

      {/* Save indicator */}
      <AnimatePresence>
        {saving && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
              position: "fixed",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "6px 14px",
              borderRadius: 20,
              background: "rgba(26,16,37,0.8)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              zIndex: 50,
              backdropFilter: "blur(8px)",
            }}
          >
            保存中...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Scale Track (discrete slider) ──

function ScaleTrack({
  scale,
  value,
  onSelect,
}: {
  scale: number;
  value: number | null;
  onSelect: (val: number) => void;
}) {
  const points = Array.from({ length: scale }, (_, i) => i + 1);

  return (
    <div
      style={{
        position: "relative",
        padding: "12px 8px",
      }}
    >
      {/* Track line */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 8,
          right: 8,
          height: 2,
          background: RV_COLORS.surfaceMuted,
          borderRadius: 1,
          transform: "translateY(-50%)",
        }}
      />

      {/* Active portion of track */}
      {value !== null && (
        <motion.div
          initial={{ width: 0 }}
          animate={{
            width: `${((value - 1) / (scale - 1)) * 100}%`,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          style={{
            position: "absolute",
            top: "50%",
            left: 8,
            height: 2,
            background: `linear-gradient(90deg, ${PARTNER_COLOR}80, ${PARTNER_COLOR})`,
            borderRadius: 1,
            transform: "translateY(-50%)",
          }}
        />
      )}

      {/* Dots */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {points.map((val) => {
          const isSelected = value === val;
          return (
            <motion.button
              key={val}
              onClick={() => onSelect(val)}
              whileTap={{ scale: 1.3 }}
              animate={
                isSelected
                  ? { scale: 1.2 }
                  : { scale: 1 }
              }
              transition={
                isSelected
                  ? {
                      type: "spring",
                      stiffness: 400,
                      damping: 15,
                    }
                  : { duration: 0.15 }
              }
              style={{
                width: isSelected ? 28 : 16,
                height: isSelected ? 28 : 16,
                borderRadius: "50%",
                border: `2px solid ${isSelected ? PARTNER_COLOR : RV_COLORS.border}`,
                background: isSelected ? PARTNER_COLOR : RV_COLORS.surface,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition:
                  "width 0.25s ease, height 0.25s ease, background 0.2s, border-color 0.2s",
                boxShadow: isSelected
                  ? `0 2px 12px ${PARTNER_COLOR}40`
                  : "none",
                position: "relative",
                zIndex: isSelected ? 2 : 1,
              }}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#fff",
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
