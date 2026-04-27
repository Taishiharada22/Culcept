"use client";

/**
 * UrgentLayer (L1-i)
 *
 * 正本: UI spec §8.5 緊急介入視覚層 / §8.6 memory surface との優先順位
 *       runtime contract §1.5 critical signal
 *
 * 緊急介入視覚層本体。critical signal を投入して urgent layer を起動し、
 * 3 形態 (overlay banner / dominant card / inline cue) を切替表示する。
 *
 * §8.5.2 視覚形態 + §8.6 memory surface 後退 (demote / compact) を
 * 構造的に表現する。
 *
 * §8.5.2 禁止:
 *   - 全画面 modal (操作完全ブロック禁止)
 *   - 音声 alert / 強振動ハプティクス
 *   - 赤色 / 警告アイコン
 *
 * §8.6.3 同時出現禁止組み合わせを列挙して構造的 enforce の根拠を提示。
 */

import { useState } from "react";
import {
  URGENT_SCENARIOS,
  URGENT_FORBIDDEN_COMBINATIONS,
  type UrgentScenario,
  CATEGORY_LABELS,
} from "../../mock/urgentScenarios";
import UrgentMessageCard from "./UrgentMessageCard";
import UrgentRelease from "./UrgentRelease";

export default function UrgentLayer() {
  const [active, setActive] = useState<UrgentScenario | null>(null);
  const [released, setReleased] = useState<
    "intervention_complete" | "user_dismiss" | "timeout" | "upper_priority_swap" | null
  >(null);

  const trigger = (s: UrgentScenario) => {
    setActive(s);
    setReleased(null);
  };

  const release = (
    key: "intervention_complete" | "user_dismiss" | "timeout" | "upper_priority_swap",
  ) => {
    setReleased(key);
    setActive(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        critical signal を投入して urgent layer を起動 (§8.5.2)。memory surface
        は §8.6.2 に従い demote / compact のいずれかに後退する。
      </div>

      {/* signal 投入 trigger */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, color: "#4a4a68" }}>
          critical signal 投入 (mock):
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {URGENT_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => trigger(s)}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                background: active?.id === s.id ? "#6366F1" : "#ffffff",
                color: active?.id === s.id ? "#ffffff" : "#1a1a2e",
                border: "1px solid #c8c8dc",
                borderRadius: 6,
                cursor: "pointer",
              }}
              title={s.trigger}
            >
              {CATEGORY_LABELS[s.category]} ({s.form})
            </button>
          ))}
        </div>
      </div>

      {/* active urgent display: 形態に応じて切替 */}
      {active && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {active.form === "overlay_banner" && (
            <div
              style={{
                position: "relative",
                padding: "8px 12px",
                background: "#eef2ff",
                border: "1px solid #6366F1",
                borderRadius: 6,
                fontSize: 12,
                color: "#1e1b4b",
                animation: "urgentBannerFadeIn 0.4s ease-out 1",
              }}
              role="alert"
              aria-label="overlay banner (§8.5.2 既定形態)"
            >
              <span style={{ fontWeight: 600 }}>● </span>
              {active.messageSummary}
              <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>
                (overlay banner / memory: {active.memoryFallback})
              </span>
            </div>
          )}

          {active.form === "dominant_card" && (
            <UrgentMessageCard scenario={active} />
          )}

          {active.form === "inline_cue" && (
            <div
              style={{
                padding: "10px 12px",
                background: "#ffffff",
                border: "2px solid",
                borderImage: "linear-gradient(90deg, #c7d2fe, #a5b4fc) 1",
                borderRadius: 6,
                fontSize: 12,
                color: "#4a4a68",
              }}
              aria-label="inline cue (§8.5.2 弱キュー、閾値接近時の予兆)"
            >
              <div style={{ fontStyle: "italic", marginBottom: 4 }}>
                inline cue (枠線の彩度のみ、まだ切替前)
              </div>
              <div>{active.messageSummary}</div>
            </div>
          )}

          {/* §8.6 memory surface 後退表示 */}
          <div
            style={{
              padding: "6px 10px",
              background: "#f5f6fa",
              border: "1px dashed #c8c8dc",
              borderRadius: 6,
              fontSize: 11,
              color: "#4a4a68",
            }}
            aria-label="memory surface 後退状態 (§8.6.2)"
          >
            memory surface →{" "}
            {active.memoryFallback === "demote" ? (
              <span>降格 (demote、背景化、位置はそのまま)</span>
            ) : (
              <span>縮退 (compact、panel → badge 化、件数のみ)</span>
            )}
            {" / "}
            <span style={{ fontStyle: "italic" }}>
              {active.memoryFallback === "demote"
                ? "短時間 urgent (< 10s) 想定"
                : "長時間 urgent (≥ 10s) 想定"}
            </span>
          </div>

          {/* 解除 UI */}
          <UrgentRelease onRelease={release} released={null} />
        </div>
      )}

      {released && (
        <div
          style={{
            padding: "6px 10px",
            background: "#f5f6fa",
            borderRadius: 6,
            fontSize: 11,
            color: "#4a4a68",
            fontStyle: "italic",
          }}
        >
          直前の解除契機: {released} (§8.5.4)。
          {/* §8.5.4 禁止: dismiss 後の追加挽留・timeout 後の沈黙ペナルティを出さない */}
        </div>
      )}

      {/* §8.6.3 同時出現禁止組み合わせ列挙 */}
      <details style={{ fontSize: 11, color: "#4a4a68" }}>
        <summary style={{ cursor: "pointer", padding: "4px 0" }}>
          §8.6.3 同時出現禁止組み合わせ ({URGENT_FORBIDDEN_COMBINATIONS.length} 件)
        </summary>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {URGENT_FORBIDDEN_COMBINATIONS.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "6px 8px",
                background: "#f5f6fa",
                border: "1px dashed #c8c8dc",
                borderRadius: 4,
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.combination}</div>
              <div style={{ marginTop: 2 }}>{c.reason}</div>
            </div>
          ))}
        </div>
      </details>

      <style>{`
        @keyframes urgentBannerFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
