"use client";

/**
 * Stage 4 L4-h → B-2.4 — UrgentRelease (本番化、preview L1-i 移植)
 *
 * 正本: layout plan v0.3 §7.8 / UI spec §8.5.4 解除条件
 *
 * 4 解除契機 (§8.5.4):
 *   - intervention_complete (発話成立 → 応答取得)
 *   - user_dismiss (dismiss tap)
 *   - timeout (具体値 §9 保留)
 *   - upper_priority_swap (さらに強い urgent 発生)
 *
 * 本 component は user_dismiss button のみ表示。他 3 経路は親 component 側 logic。
 *
 * §8.5.4 不可侵: dismiss 後の追加挽留 / 沈黙ペナルティ 禁止 (§6.8 継承)。
 *
 * B-2.4 (2026-04-30): style を white 背景前提に変更。
 *   - 修正前: background=transparent + 半透明白 border / text (UrgentMessageCard
 *     の dark indigo 内に置く前提だった preview 移植時の style)
 *   - 修正後: white 背景 + indigo border + dark indigo text
 *   - 理由: UrgentLayer dominant_card で UrgentRelease は UrgentMessageCard の
 *     **外側** (chat area white 背景上) に配置されるため、半透明白では完全に
 *     invisible (CEO 視覚で「閉じるボタン無し」と認識される blocking bug)
 *   - aria-label を「緊急表示を閉じる」に統一 (CEO 確定 2026-04-30、3 variant 共通)
 */

export interface UrgentReleaseProps {
  /** dismiss tap で発火 (urgentReleaseLogic.decideRelease({userDismiss:true})) */
  onDismiss: () => void;
}

export default function UrgentRelease({ onDismiss }: UrgentReleaseProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      data-testid="coalter-urgent-release-dismiss"
      aria-label="緊急表示を閉じる"
      style={{
        padding: "4px 10px",
        fontSize: 11,
        background: "#ffffff",
        border: "1px solid #6366F1",
        color: "#1e1b4b",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      閉じる
    </button>
  );
}
