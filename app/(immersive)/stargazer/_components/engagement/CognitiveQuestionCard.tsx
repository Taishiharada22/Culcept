"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CognitiveQuestion, CfAnswer } from "@/lib/stargazer/cognitiveFitQuestions";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CognitiveQuestionCard — Cognitive Fit 質問の表示カード
//
// 3つのUI形式を1コンポーネントで処理:
// 1. 通常選択（micro_performance, case_judgment, branch）→ 1択クリック即送信
// 2. dual select（forced_choice with dualSelect）→ 「最も近い」→「最も遠い」の2段階
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  question: CognitiveQuestion;
  onAnswer: (answer: CfAnswer) => void;
  onGoBack?: () => void;
  canGoBack?: boolean;
}

export default function CognitiveQuestionCard({
  question,
  onAnswer,
  onGoBack,
  canGoBack,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [furthestId, setFurthestId] = useState<string | null>(null);
  const [dualPhase, setDualPhase] = useState<"closest" | "furthest">("closest");
  const [selectionChanges, setSelectionChanges] = useState(0);
  const startTimeRef = useRef(performance.now());

  const isDual = question.dualSelect === true;

  const handleSelect = useCallback(
    (optionId: string) => {
      if (isDual) {
        if (dualPhase === "closest") {
          if (selectedId && selectedId !== optionId) setSelectionChanges((c) => c + 1);
          setSelectedId(optionId);
          // 0.4秒後に次のフェーズへ
          setTimeout(() => setDualPhase("furthest"), 400);
        } else {
          // furthest フェーズ — 同じ選択肢は選べない
          if (optionId === selectedId) return;
          setFurthestId(optionId);
          // 0.4秒後に送信
          setTimeout(() => {
            onAnswer({
              questionId: question.id,
              selectedOptionId: selectedId!,
              furthestOptionId: optionId,
              responseTimeMs: Math.round(performance.now() - startTimeRef.current),
              selectionChanges,
            });
          }, 400);
        }
      } else {
        // 通常選択 — クリック即送信
        if (selectedId && selectedId !== optionId) setSelectionChanges((c) => c + 1);
        setSelectedId(optionId);
        setTimeout(() => {
          onAnswer({
            questionId: question.id,
            selectedOptionId: optionId,
            responseTimeMs: Math.round(performance.now() - startTimeRef.current),
            selectionChanges: selectionChanges + (selectedId && selectedId !== optionId ? 1 : 0),
          });
        }, 500);
      }
    },
    [isDual, dualPhase, selectedId, selectionChanges, question.id, onAnswer]
  );

  const dualPrompt = dualPhase === "closest"
    ? "最も自分に近いものを選んでください"
    : "最も自分から遠いものを選んでください";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.22 }}
      className="space-y-5"
    >
      {/* ヘッダーヒント */}
      {question.headerHint && (
        <motion.p
          className="text-center text-xs tracking-wider"
          style={{ color: "rgba(130,140,180,0.6)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {question.headerHint}
        </motion.p>
      )}

      {/* カテゴリバッジ */}
      <div className="flex justify-center">
        <span
          className="text-[10px] tracking-[0.2em] uppercase px-3 py-1 rounded-full"
          style={{
            background: "rgba(100,180,255,0.08)",
            color: "rgba(100,180,255,0.7)",
            border: "1px solid rgba(100,180,255,0.15)",
          }}
        >
          🧠 認知フィット
        </span>
      </div>

      {/* 問題文 */}
      <h3
        className="text-base font-medium leading-relaxed text-center px-2"
        style={{ color: "rgba(30,35,55,0.88)" }}
      >
        {question.prompt}
      </h3>

      {/* コンテキスト（前提情報） */}
      {question.context && (
        <div
          className="text-sm leading-relaxed rounded-xl px-4 py-3 mx-2"
          style={{
            background: "rgba(100,120,180,0.04)",
            color: "rgba(50,55,75,0.72)",
            border: "1px solid rgba(100,120,180,0.08)",
            whiteSpace: "pre-line",
          }}
        >
          {question.context}
        </div>
      )}

      {/* dual select の指示文 */}
      {isDual && (
        <motion.p
          key={dualPhase}
          className="text-center text-sm font-medium"
          style={{
            color: dualPhase === "closest"
              ? "rgba(80,140,220,0.8)"
              : "rgba(220,120,80,0.8)",
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {dualPrompt}
        </motion.p>
      )}

      {/* 選択肢 */}
      <div className="space-y-2.5 px-2">
        <AnimatePresence>
          {question.options.map((option, i) => {
            const isSelected = selectedId === option.id;
            const isFurthest = furthestId === option.id;
            const isDisabledInFurthest = isDual && dualPhase === "furthest" && selectedId === option.id;

            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{
                  opacity: isDisabledInFurthest ? 0.3 : 1,
                  x: 0,
                }}
                transition={{ delay: i * 0.06 }}
                onClick={() => !isDisabledInFurthest && handleSelect(option.id)}
                disabled={isDisabledInFurthest}
                className="w-full text-left rounded-xl px-4 py-3.5 text-sm transition-all duration-200"
                style={{
                  background: isSelected
                    ? "rgba(80,140,220,0.12)"
                    : isFurthest
                    ? "rgba(220,120,80,0.10)"
                    : "rgba(255,255,255,0.6)",
                  border: isSelected
                    ? "1.5px solid rgba(80,140,220,0.35)"
                    : isFurthest
                    ? "1.5px solid rgba(220,120,80,0.30)"
                    : "1px solid rgba(150,160,190,0.12)",
                  color: isDisabledInFurthest
                    ? "rgba(120,125,145,0.4)"
                    : "rgba(40,45,65,0.82)",
                  cursor: isDisabledInFurthest ? "not-allowed" : "pointer",
                }}
              >
                <span className="flex items-start gap-2.5">
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] mt-0.5"
                    style={{
                      background: isSelected
                        ? "rgba(80,140,220,0.25)"
                        : isFurthest
                        ? "rgba(220,120,80,0.20)"
                        : "rgba(150,160,190,0.10)",
                      color: isSelected
                        ? "rgba(80,140,220,0.9)"
                        : isFurthest
                        ? "rgba(220,120,80,0.85)"
                        : "rgba(120,125,145,0.6)",
                    }}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="leading-relaxed">{option.text}</span>
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 戻るボタン */}
      {canGoBack && onGoBack && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onGoBack}
            className="text-xs px-4 py-2 rounded-lg transition-colors"
            style={{
              color: "rgba(120,125,145,0.6)",
              background: "rgba(120,125,145,0.06)",
            }}
          >
            ← 前の質問に戻る
          </button>
        </div>
      )}
    </motion.div>
  );
}
