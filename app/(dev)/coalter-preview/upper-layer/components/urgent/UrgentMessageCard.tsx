"use client";

/**
 * UrgentMessageCard (L1-i)
 *
 * 正本: UI spec §8.5.3 トーンと視覚言語 / §8.5.5 §6.8 非判定性継承
 *
 * §8.5.3 視覚言語:
 *   - トーン: urgent (calm より濃いが威圧しない)
 *   - 彩度を高めず、透明度を下げる (強く主張するが威圧しない)
 *   - アニメ: 1 回 fade-in + 最小 pulse、継続 loop 禁止
 *
 * §8.5.5 §6.8 非判定性 (継承):
 *   - 警告色 (赤・オレンジ) 禁止 → indigo / 落ち着いた青系で表現
 *   - 叱責アイコン (✗ / ！ / ⚠️) 禁止
 *   - 介入回数カウンタ可視化禁止
 *   - cooldown カウントダウン可視化禁止
 *   - 「〇〇しましたね」式の追跡口調禁止 → 文字数上限を構造的に設定
 */

import type { UrgentScenario } from "../../mock/urgentScenarios";
import { CATEGORY_LABELS } from "../../mock/urgentScenarios";

/** §8.5.5 文字数上限を構造的に設定 (追跡口調を防ぐ) */
const MESSAGE_CHAR_LIMIT = 40;

export default function UrgentMessageCard({
  scenario,
}: {
  scenario: UrgentScenario;
}) {
  const message = scenario.messageSummary.slice(0, MESSAGE_CHAR_LIMIT);
  const truncated = scenario.messageSummary.length > MESSAGE_CHAR_LIMIT;

  return (
    <div
      style={{
        // §8.5.3 彩度高めず透明度下げる: 落ち着いた indigo
        padding: "12px 14px",
        background: "#1e1b4b",
        color: "#ffffff",
        borderRadius: 8,
        border: "1px solid #312e81",
        animation: "urgentFadeIn 0.5s ease-out 1, urgentPulse 0.6s ease-out 1",
        opacity: 0.95,
      }}
      role="alert"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            fontSize: 10,
            background: "rgba(255, 255, 255, 0.18)",
            color: "#ffffff",
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          ● urgent
        </span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          category: {CATEGORY_LABELS[scenario.category]}
        </span>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.6, fontWeight: 500 }}>
        {message}
        {truncated && "…"}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          opacity: 0.75,
          fontStyle: "italic",
        }}
      >
        {/* §8.5.5: 「〇〇しましたね」式禁止、文字数上限 (本文 ≤ {MESSAGE_CHAR_LIMIT}) を表示型として明示 */}
        本文 ≤ {MESSAGE_CHAR_LIMIT} 文字 (追跡口調を構造的に排除、§8.5.5)
      </div>

      <style>{`
        @keyframes urgentFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 0.95; transform: translateY(0); }
        }
        @keyframes urgentPulse {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>
    </div>
  );
}
