"use client";

/**
 * RejectionFlows (L1-g)
 *
 * 正本: UI spec §6.6 拒否の 3 分類 / §6.7 再介入条件サマリ / §6.8 非判定性
 *
 * 拒否 3 分類を異なる UI で区別 (§6.6 制約 — 種別の混同禁止):
 *   - §6.6.1 モード昇格の拒否     → 切替 chip 経由、indigo 系で控えめに
 *   - §6.6.2 個別提案の拒否       → S7 閉じる導線 / 時間経過、neutral
 *   - §6.6.3 介入そのものの後退要求 → S8 即時退出、retreat トーン
 *
 * §6.8 非判定性 (UI 禁止項目、本 component で全適用):
 *   - 警告色 (赤・オレンジ) 禁止 → 全カードを soft な indigo / neutral で構成
 *   - 叱責的アイコン (⚠️ / ❌ / 😟 / 🚫) 禁止 → 使用なし
 *   - 拒否カウンタ累積表示禁止 → 数値表示なし
 *   - 「また」系再接触演出禁止 → 文面に「また」を含めない
 *   - cooldown カウントダウン禁止 → 残時間表示なし、定性的説明のみ
 */

import { REJECTION_FLOWS, type RejectionKind } from "../mock/modeTransitions";

const KIND_BADGE: Record<RejectionKind, { bg: string; fg: string; label: string }> = {
  // 警告色禁止 (§6.8) — すべて soft indigo / neutral 系
  mode_escalation: { bg: "#eef2ff", fg: "#4f46e5", label: "§6.6.1" },
  individual_proposal: { bg: "#f5f6fa", fg: "#4a4a68", label: "§6.6.2" },
  intervention_retreat: { bg: "#f0f9ff", fg: "#0369a1", label: "§6.6.3" },
};

export default function RejectionFlows() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        拒否 3 分類 (§6.6)：それぞれ独立の cooldown・信頼影響を持ち、UI も
        分離する。§6.8 非判定性 (警告色・叱責アイコン・カウンタ・カウントダウン
        いずれも UI 上で表示しない)。
      </div>

      {REJECTION_FLOWS.map((flow) => {
        const badge = KIND_BADGE[flow.kind];
        return (
          <div
            key={flow.kind}
            style={{
              padding: "12px 14px",
              border: "1px solid #e8e8ec",
              borderRadius: 8,
              background: "#ffffff",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  background: badge.bg,
                  color: badge.fg,
                  borderRadius: 10,
                  fontWeight: 600,
                }}
              >
                {badge.label}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                {flow.title}
              </span>
            </div>

            <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
              <div>発動: {flow.trigger}</div>
              <div>UI: {flow.uiHint}</div>
              <div>感度影響: {flow.sensitivityImpact}</div>
            </div>

            {/* §6.7 再介入条件 cooldown — 定性表示のみ (カウントダウン禁止) */}
            <div
              style={{
                marginTop: 4,
                padding: "8px 10px",
                background: "#f5f6fa",
                borderRadius: 6,
                fontSize: 11,
                color: "#4a4a68",
                lineHeight: 1.6,
              }}
              aria-label="再介入条件サマリ (§6.7)"
            >
              <div>セッション内: {flow.cooldown.sameSession}</div>
              <div>次セッション以降: {flow.cooldown.nextSession}</div>
              <div>明示呼び出し応答: {flow.cooldown.explicitCall}</div>
            </div>
          </div>
        );
      })}

      <div
        style={{
          padding: "8px 10px",
          fontSize: 11,
          color: "#8888a0",
          lineHeight: 1.6,
          fontStyle: "italic",
        }}
      >
        §6.8: CoAlter は拒否を罰として扱わない。介入感度への影響は閾値調整・
        抑制期間の機械的処理のみ (信頼・人格評価ではない、v1.1 §11.1)。
      </div>
    </div>
  );
}
