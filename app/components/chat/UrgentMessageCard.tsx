"use client";

/**
 * Stage 4 L4-h — UrgentMessageCard (本番化、preview L1-i 移植)
 *
 * 正本: layout plan v0.3 §7.8 / UI spec §8.5.3 トーンと視覚言語 / §8.5.5 §6.8 非判定性継承
 *
 * §8.5.3 視覚言語:
 *   - トーン: urgent (calm より濃いが威圧しない)
 *   - 彩度を高めず、透明度を下げる
 *   - アニメ: 1 回 fade-in + 最小 pulse、継続 loop 禁止
 *
 * §8.5.5 §6.8 非判定性 (継承):
 *   - 警告色 (赤・オレンジ) 禁止 → indigo 系
 *   - 叱責アイコン (cross / exclamation / warning sign) 禁止
 *   - 「〇〇しましたね」式追跡口調禁止 → 文字数上限を構造的に設定
 */

import type { UrgentCategory } from "@/lib/coalter/presence/urgentTrigger";

const MESSAGE_CHAR_LIMIT = 40;

const CATEGORY_LABEL: Record<UrgentCategory, string> = {
  rupture_detected: "関係保護",
  dignity_violation: "尊厳保護",
  safety_concern: "安全に関わる介入",
  heat_escalation: "ヒートアップ介入",
  asymmetric_overload: "片側過負荷",
};

export interface UrgentMessageCardProps {
  category: UrgentCategory;
  /** 緊急発話 (LLM 合成、L4-i で生成、本 phase は props 透過) */
  message: string;
}

export default function UrgentMessageCard({
  category,
  message,
}: UrgentMessageCardProps) {
  // §8.5.5 文字数上限 (追跡口調を構造的に排除)
  const truncated = message.length > MESSAGE_CHAR_LIMIT;
  const display = truncated ? message.slice(0, MESSAGE_CHAR_LIMIT) + "…" : message;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="coalter-urgent-message-card"
      data-category={category}
      style={{
        padding: "12px 14px",
        background: "#1e1b4b",
        color: "#ffffff",
        borderRadius: 8,
        border: "1px solid #312e81",
        animation: "coalterUrgentFadeIn 0.5s ease-out 1, coalterUrgentPulse 0.6s ease-out 1",
        opacity: 0.95,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
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
          {CATEGORY_LABEL[category]}
        </span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, fontWeight: 500 }}>
        {display}
      </div>
      <style>{`
        @keyframes coalterUrgentFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 0.95; transform: translateY(0); }
        }
        @keyframes coalterUrgentPulse {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>
    </div>
  );
}
