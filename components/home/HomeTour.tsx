"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { safeLSSet } from "@/lib/safeLocalStorage";

/* ═══════════════════════════════════════════════════════════════════
   HomeTour — Home 画面のレイヤー（セクション）を順に説明するツアー
   ─────────────────────────────────────────────────────────────────
   暗い overlay + スポットライトで対象セクションを切り抜き、
   説明カードをセクションの近くに配置。矢印でどこを説明しているか明示。
   ═══════════════════════════════════════════════════════════════════ */

interface TourStep {
  selector: string;
  icon: string;
  label: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="orbit-dock"]',
    icon: "⭐️",
    label: "クイックアクセス",
    title: "ここが毎日のメインフィールド",
    description:
      "Stargazer（思考）、Origin（記憶）、Phenotype（身体）、Style（好み）の4つを使うことで、AIがあなたの全部を学んでいくよ。毎日少しずつ教えてあげてね。",
  },
  {
    selector: '[data-tour="alter-oneliner"]',
    icon: "✦",
    label: "Alterの一言",
    title: "今日のあなたの状態を、Alterが一言で",
    description:
      "観測データから今のあなたの傾向を読み取って、もうひとりのあなた（Alter）が毎日一言で伝えてくれるよ。",
  },
  {
    selector: '[data-tour="ask-hero"]',
    icon: "💬",
    label: "Alter に聞く",
    title: "何でも聞いてみて。あなた専用の判断AIだよ",
    description:
      "仕事・恋愛・服装…何でもOK。あなたの性格や判断傾向を踏まえて、もうひとりのあなたが答えるよ。1日3回まで、気軽に使ってみてね。",
  },
  {
    selector: '[data-tour="rendezvous"]',
    icon: "∞",
    label: "つながる",
    title: "あなたの分身が、相性のいい人を探してくれるよ",
    description:
      "あなたのAI分身が自動的に相性のいい人を見つけてくれる、新しいマッチングの仕組みだよ。恋愛・友達・ビジネスなど、いろんな出会いに対応してるよ。",
  },
  {
    selector: '[data-tour="deep-identity"]',
    icon: "🧬",
    label: "Deep Identity",
    title: "ここに、まだ知らない自分が現れるよ",
    description:
      "性格・外見・価値観をまとめたGenome Card。Stargazer、Origin、Styleなどの情報が反映されるよ。情報を入れるほど、自分でも驚くような発見があるよ。",
  },
];

const STORAGE_KEY = "aneurasync_home_tour_done_v2";
const SPOTLIGHT_PAD = 12;

interface Props {
  active: boolean;
  onComplete: () => void;
}

export default function HomeTour({ active, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const rafRef = useRef(0);

  const focusElement = useCallback((stepIndex: number) => {
    setCardReady(false);
    const target = TOUR_STEPS[stepIndex];
    if (!target) return;

    const el = document.querySelector(target.selector);
    if (!el) {
      if (stepIndex < TOUR_STEPS.length - 1) {
        setStep(stepIndex + 1);
      } else {
        finish();
      }
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect(r);
      setCardReady(true);
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 位置追従
  useEffect(() => {
    if (!active || !cardReady) return;
    const update = () => {
      const target = TOUR_STEPS[step];
      if (!target) return;
      const el = document.querySelector(target.selector);
      if (el) setRect(el.getBoundingClientRect());
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, cardReady, step]);

  useEffect(() => {
    if (active) {
      setStep(0);
      focusElement(0);
    }
  }, [active, focusElement]);

  const finish = useCallback(() => {
    safeLSSet(STORAGE_KEY, "1");
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    const next = step + 1;
    if (next >= TOUR_STEPS.length) {
      finish();
    } else {
      setStep(next);
      focusElement(next);
    }
  }, [step, focusElement, finish]);

  if (!active) return null;

  const currentStep = TOUR_STEPS[step];
  if (!currentStep) return null;

  // スポットライト切り抜き
  const clipPath = rect
    ? `polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
        ${rect.left - SPOTLIGHT_PAD}px ${rect.top - SPOTLIGHT_PAD}px,
        ${rect.left - SPOTLIGHT_PAD}px ${rect.bottom + SPOTLIGHT_PAD}px,
        ${rect.right + SPOTLIGHT_PAD}px ${rect.bottom + SPOTLIGHT_PAD}px,
        ${rect.right + SPOTLIGHT_PAD}px ${rect.top - SPOTLIGHT_PAD}px,
        ${rect.left - SPOTLIGHT_PAD}px ${rect.top - SPOTLIGHT_PAD}px
      )`
    : undefined;

  // カード位置: スポットライトの下か上に配置（画面内に収まるよう調整）
  const viewH = typeof window !== "undefined" ? window.innerHeight : 800;
  const spotlightBottom = rect ? rect.bottom + SPOTLIGHT_PAD : viewH / 2;
  const spotlightTop = rect ? rect.top - SPOTLIGHT_PAD : viewH / 2;
  const spaceBelow = viewH - spotlightBottom;
  const spaceAbove = spotlightTop;
  const cardHeight = 240; // 推定カード高さ
  const placeBelow = spaceBelow > cardHeight + 20; // 下に十分なスペースがあるか
  const placeAbove = !placeBelow && spaceAbove > cardHeight + 20;
  const cardTop = placeBelow
    ? Math.min(spotlightBottom + 16, viewH - cardHeight - 16)
    : placeAbove
      ? Math.max(16, spotlightTop - cardHeight - 16)
      : Math.max(16, (viewH - cardHeight) / 2); // どちらにも収まらない場合は画面中央

  return (
    <>
      {/* Dark overlay with spotlight hole */}
      <motion.div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          background: "rgba(0,0,0,0.7)",
          clipPath,
          pointerEvents: "auto",
          transition: "clip-path 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleNext}
      />

      {/* Glow border around spotlight */}
      {rect && (
        <motion.div
          style={{
            position: "fixed",
            left: rect.left - SPOTLIGHT_PAD - 2,
            top: rect.top - SPOTLIGHT_PAD - 2,
            width: rect.width + SPOTLIGHT_PAD * 2 + 4,
            height: rect.height + SPOTLIGHT_PAD * 2 + 4,
            borderRadius: 16,
            border: "2px solid rgba(139,92,246,0.5)",
            zIndex: 71,
            pointerEvents: "none",
            transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          animate={{
            boxShadow: [
              "0 0 24px rgba(139,92,246,0.3), inset 0 0 16px rgba(139,92,246,0.08)",
              "0 0 40px rgba(139,92,246,0.5), inset 0 0 24px rgba(139,92,246,0.12)",
              "0 0 24px rgba(139,92,246,0.3), inset 0 0 16px rgba(139,92,246,0.08)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* 矢印コネクタ: カードからスポットライトへ（中央配置時は非表示） */}
      {rect && cardReady && (placeBelow || placeAbove) && (
        <div
          style={{
            position: "fixed",
            left: rect.left + rect.width / 2 - 1,
            top: placeBelow ? spotlightBottom + 2 : cardTop + cardHeight,
            width: 2,
            height: 14,
            background: "linear-gradient(180deg, rgba(139,92,246,0.6), rgba(139,92,246,0.1))",
            zIndex: 72,
            pointerEvents: "none",
            transition: "all 0.5s ease",
            transform: placeBelow ? "none" : "rotate(180deg)",
          }}
        />
      )}

      {/* Explanation card */}
      <AnimatePresence mode="wait">
        {cardReady && (
          <motion.div
            key={step}
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              top: cardTop,
              zIndex: 72,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
            }}
            initial={{ opacity: 0, y: placeBelow ? 16 : -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: placeBelow ? -8 : 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              style={{
                width: 320,
                maxWidth: "100%",
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(20px) saturate(1.3)",
                  WebkitBackdropFilter: "blur(20px) saturate(1.3)",
                  borderRadius: 20,
                  padding: "22px 22px 18px",
                  boxShadow:
                    "0 20px 60px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
                  border: "1px solid rgba(255,255,255,0.6)",
                }}
              >
                {/* Label badge — 「今ここを説明している」を明示 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background:
                        "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(6,182,212,0.08))",
                      borderRadius: 8,
                      padding: "4px 10px",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{currentStep.icon}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#6366f1",
                      }}
                    >
                      {currentStep.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#94a3b8",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {step + 1}/{TOUR_STEPS.length}
                  </span>
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#0f172a",
                    lineHeight: 1.4,
                    margin: "0 0 6px",
                  }}
                >
                  {currentStep.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "#475569",
                    margin: "0 0 16px",
                  }}
                >
                  {currentStep.description}
                </p>

                {/* Step dots */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 14,
                  }}
                >
                  {TOUR_STEPS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i === step ? 18 : 6,
                        height: 5,
                        borderRadius: 3,
                        background:
                          i < step
                            ? "#8b5cf6"
                            : i === step
                              ? "linear-gradient(90deg, #8b5cf6, #06b6d4)"
                              : "#e2e8f0",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>

                {/* Buttons */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      finish();
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#94a3b8",
                      padding: "6px 0",
                    }}
                  >
                    スキップ
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNext();
                    }}
                    style={{
                      background:
                        "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 24px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 4px 15px rgba(139,92,246,0.3)",
                    }}
                  >
                    {step < TOUR_STEPS.length - 1 ? "次へ" : "はじめる"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
