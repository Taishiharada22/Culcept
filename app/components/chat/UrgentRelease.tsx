"use client";

/**
 * Stage 4 L4-h — UrgentRelease (本番化、preview L1-i 移植)
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
      aria-label="緊急介入を閉じる"
      style={{
        padding: "4px 10px",
        fontSize: 11,
        background: "transparent",
        border: "1px solid rgba(255, 255, 255, 0.4)",
        color: "rgba(255, 255, 255, 0.85)",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      閉じる
    </button>
  );
}
