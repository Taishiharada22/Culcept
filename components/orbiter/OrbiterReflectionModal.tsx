"use client";

/**
 * OrbiterReflectionModal
 * 対話後のリフレクション収集モーダル
 *
 * 表示タイミング:
 * - mutual_like成立後（chat_phase）
 * - チャット5+メッセージ後（chat_phase）
 * - 実際に会った後（post_meeting） ← 将来対応
 *
 * 質問は6項目、5段階 or テキスト
 * 回答は `/api/orbiter/reflection` に POST
 */

import { useState } from "react";
import type { ReflectionQuestion, ReflectionType } from "@/lib/orbiter/types";

interface ReflectionItem {
  key: ReflectionQuestion;
  label: string;
  type: "scale" | "boolean" | "text";
  scaleLabels?: [string, string]; // [low, high]
}

const CHAT_PHASE_QUESTIONS: ReflectionItem[] = [
  {
    key: "naturalness",
    label: "会話は自然体でいられた？",
    type: "scale",
    scaleLabels: ["気を遣った", "自然体だった"],
  },
  {
    key: "energy_after",
    label: "やり取りの後のエネルギーは？",
    type: "scale",
    scaleLabels: ["消耗した", "元気になった"],
  },
  {
    key: "want_to_meet_again",
    label: "また話したい？",
    type: "boolean",
  },
  {
    key: "felt_like_self",
    label: "自分らしくいられた？",
    type: "scale",
    scaleLabels: ["演じていた", "自分らしかった"],
  },
  {
    key: "surprise",
    label: "意外な発見はあった？",
    type: "text",
  },
  {
    key: "tension_source",
    label: "もし緊張したとしたら、何が原因だった？",
    type: "text",
  },
];

type Props = {
  candidateId: string;
  reflectionType: ReflectionType;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function OrbiterReflectionModal({
  candidateId,
  reflectionType,
  onClose,
  onSubmitted,
}: Props) {
  const questions = CHAT_PHASE_QUESTIONS; // future: switch by reflectionType
  const [answers, setAnswers] = useState<
    Record<string, string | number | boolean>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleScaleChange = (key: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleBooleanChange = (key: string, value: boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleTextChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/orbiter/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          reflectionType,
          answers,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitted(true);
        setTimeout(() => {
          onSubmitted?.();
          onClose();
        }, 1500);
      }
    } catch {
      // silent fail
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 20,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: "40px 24px",
            maxWidth: 360,
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "rgba(30, 30, 60, 0.8)",
              margin: "0 0 8px",
            }}
          >
            ありがとう！
          </p>
          <p
            style={{
              fontSize: 12,
              color: "rgba(30, 30, 60, 0.5)",
              margin: 0,
            }}
          >
            あなたの振り返りが、より良いアドバイスに繋がります
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "20px 20px 0 0",
          padding: "24px 20px 40px",
          maxWidth: 500,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "rgba(30, 30, 60, 0.8)",
                margin: "0 0 4px",
              }}
            >
              ちょっと振り返り
            </h3>
            <p
              style={{
                fontSize: 11,
                color: "rgba(30, 30, 60, 0.4)",
                margin: 0,
              }}
            >
              正解はありません。感じたままに答えてください
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(30, 30, 60, 0.05)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              fontSize: 14,
              color: "rgba(30, 30, 60, 0.4)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Questions */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {questions.map((q) => (
            <div key={q.key}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(30, 30, 60, 0.7)",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                {q.label}
              </label>

              {q.type === "scale" && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        onClick={() => handleScaleChange(q.key, val)}
                        style={{
                          flex: 1,
                          height: 36,
                          borderRadius: 8,
                          border:
                            answers[q.key] === val
                              ? "2px solid #6366F1"
                              : "1px solid rgba(30, 30, 60, 0.1)",
                          background:
                            answers[q.key] === val
                              ? "rgba(99, 102, 241, 0.08)"
                              : "rgba(255, 255, 255, 0.8)",
                          color:
                            answers[q.key] === val
                              ? "#6366F1"
                              : "rgba(30, 30, 60, 0.5)",
                          fontSize: 13,
                          fontWeight: answers[q.key] === val ? 700 : 400,
                          cursor: "pointer",
                        }}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  {q.scaleLabels && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          color: "rgba(30, 30, 60, 0.35)",
                        }}
                      >
                        {q.scaleLabels[0]}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: "rgba(30, 30, 60, 0.35)",
                        }}
                      >
                        {q.scaleLabels[1]}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {q.type === "boolean" && (
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { val: true, label: "はい" },
                    { val: false, label: "いいえ" },
                  ].map(({ val, label }) => (
                    <button
                      key={String(val)}
                      onClick={() => handleBooleanChange(q.key, val)}
                      style={{
                        flex: 1,
                        height: 36,
                        borderRadius: 8,
                        border:
                          answers[q.key] === val
                            ? "2px solid #6366F1"
                            : "1px solid rgba(30, 30, 60, 0.1)",
                        background:
                          answers[q.key] === val
                            ? "rgba(99, 102, 241, 0.08)"
                            : "rgba(255, 255, 255, 0.8)",
                        color:
                          answers[q.key] === val
                            ? "#6366F1"
                            : "rgba(30, 30, 60, 0.5)",
                        fontSize: 13,
                        fontWeight:
                          answers[q.key] === val ? 700 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {q.type === "text" && (
                <textarea
                  value={(answers[q.key] as string) ?? ""}
                  onChange={(e) =>
                    handleTextChange(q.key, e.target.value)
                  }
                  placeholder="自由に書いてください（任意）"
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(30, 30, 60, 0.1)",
                    background: "rgba(255, 255, 255, 0.8)",
                    fontSize: 12,
                    color: "rgba(30, 30, 60, 0.7)",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            width: "100%",
            marginTop: 24,
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: isSubmitting
              ? "rgba(99, 102, 241, 0.3)"
              : "linear-gradient(135deg, #6366F1, #8B5CF6)",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: isSubmitting ? "default" : "pointer",
          }}
        >
          {isSubmitting ? "送信中…" : "振り返りを送信"}
        </button>

        {/* Skip */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px",
            border: "none",
            background: "transparent",
            color: "rgba(30, 30, 60, 0.35)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          今はスキップ
        </button>
      </div>
    </div>
  );
}
