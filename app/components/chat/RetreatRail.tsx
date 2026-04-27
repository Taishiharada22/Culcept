"use client";

/**
 * Stage 4 L4-g — RetreatRail (本番化、preview L1-h 移植)
 *
 * 正本: layout plan v0.3 §7.7 / UI spec §8.4.2 後退導線
 *
 * 後退導線は常にアクセス可能。隠蔽 / 抑制 / 警告文挿入 禁止 (§6.8 継承)。
 */

export interface RetreatRailProps {
  onMuteAll: () => void;
  onRequestRetreat: () => void;
}

export default function RetreatRail({
  onMuteAll,
  onRequestRetreat,
}: RetreatRailProps) {
  return (
    <div
      role="group"
      aria-label="CoAlter 後退導線"
      data-testid="coalter-retreat-rail"
      style={{
        display: "flex",
        gap: 6,
        padding: "6px 10px",
        background: "#f5f6fa",
        border: "1px dashed #c8c8dc",
        borderRadius: 6,
      }}
    >
      <button
        type="button"
        onClick={onMuteAll}
        data-testid="coalter-retreat-mute-all"
        style={btnStyle}
      >
        全て自分の画面から外す
      </button>
      <button
        type="button"
        onClick={onRequestRetreat}
        data-testid="coalter-retreat-request"
        style={btnStyle}
      >
        しばらく見守るだけにして
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  background: "#ffffff",
  border: "1px solid #c8c8dc",
  color: "#4a4a68",
  borderRadius: 4,
  cursor: "pointer",
};
