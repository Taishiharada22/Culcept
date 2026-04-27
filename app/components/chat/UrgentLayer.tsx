"use client";

/**
 * Stage 4 L4-h — UrgentLayer 本体 (本番化、preview L1-i 移植)
 *
 * 正本: layout plan v0.3 §7.8 / UI spec §8.5 / §8.6
 *
 * 緊急介入視覚層本体。urgentTrigger.detectUrgent の判定結果を渡されて表示。
 * §8.6.3 同時出現禁止 (urgent + S7 同居等) は呼び出し側 (UpperLayerMount) で
 * checkCoexistence を通す前提。
 *
 * §8.5.2 視覚形態:
 *   - overlay_banner (薄いバンド)
 *   - dominant_card (中央上部の展開カード)
 *   - inline_cue (枠線彩度のみの弱キュー)
 */

import UrgentMessageCard from "./UrgentMessageCard";
import UrgentRelease from "./UrgentRelease";
import type {
  UrgentDecision,
  UrgentForm,
} from "@/lib/coalter/presence/urgentTrigger";

export interface UrgentLayerProps {
  /** detectUrgent 判定結果。null なら本 component は何も表示しない */
  decision: UrgentDecision | null;
  /** 緊急発話 (LLM 合成、L4-i で生成) */
  message: string;
  /** ユーザー dismiss tap (urgentReleaseLogic 経由) */
  onDismiss: () => void;
}

export default function UrgentLayer({
  decision,
  message,
  onDismiss,
}: UrgentLayerProps) {
  if (decision === null) return null;

  switch (decision.form) {
    case "dominant_card":
      return (
        <div
          data-testid="coalter-urgent-layer-dominant"
          data-form="dominant_card"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <UrgentMessageCard category={decision.category} message={message} />
          <div style={{ alignSelf: "flex-end" }}>
            <UrgentRelease onDismiss={onDismiss} />
          </div>
        </div>
      );

    case "overlay_banner":
      return (
        <div
          role="alert"
          aria-live="polite"
          data-testid="coalter-urgent-layer-banner"
          data-form="overlay_banner"
          style={{
            position: "relative",
            padding: "8px 12px",
            background: "#eef2ff",
            border: "1px solid #6366F1",
            borderRadius: 6,
            fontSize: 12,
            color: "#1e1b4b",
            animation: "coalterUrgentBannerFadeIn 0.4s ease-out 1",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            <span style={{ fontWeight: 600 }}>● </span>
            {message}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            data-testid="coalter-urgent-banner-dismiss"
            aria-label="緊急介入を閉じる"
            style={{
              padding: "2px 8px",
              fontSize: 11,
              background: "transparent",
              border: "1px solid #6366F1",
              color: "#6366F1",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
          <style>{`
            @keyframes coalterUrgentBannerFadeIn {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      );

    case "inline_cue":
      return (
        <div
          data-testid="coalter-urgent-layer-inline"
          data-form="inline_cue"
          style={{
            padding: "10px 12px",
            background: "#ffffff",
            border: "2px solid",
            borderImage: "linear-gradient(90deg, #c7d2fe, #a5b4fc) 1",
            borderRadius: 6,
            fontSize: 12,
            color: "#4a4a68",
          }}
        >
          <div style={{ fontStyle: "italic", marginBottom: 4 }}>
            inline cue
          </div>
          <div>{message}</div>
        </div>
      );

    default: {
      const _exhaustive: never = decision.form;
      return _exhaustive;
    }
  }
}

// 型 export
export type { UrgentForm };
