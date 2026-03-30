"use client";

/**
 * RendezvousConversationPrompt
 * Modal/overlay shown when mutual_like occurs.
 * "Connection opened" celebration + action buttons.
 * Light-mode: 淡い光の祝福感、透明感のある接続成立
 *
 * 既存機能を維持:
 * - candidateId, onStartChat, onLater
 * - SVGアニメーション
 * - 接続成立メッセージ
 */

type Props = {
  candidateId: string;
  onStartChat: () => void;
  onLater: () => void;
};

export default function RendezvousConversationPrompt({
  candidateId,
  onStartChat,
  onLater,
}: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(248,247,255,0.92)",
        backdropFilter: "blur(16px)",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: "32px 24px",
          borderRadius: 20,
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(99,102,241,0.12)",
          boxShadow:
            "0 8px 40px rgba(99,102,241,0.12), 0 2px 12px rgba(139,92,246,0.08)",
          textAlign: "center",
        }}
      >
        {/* Orbit animation SVG */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <svg width={80} height={80} viewBox="0 0 80 80" fill="none">
            {/* Orbit rings */}
            <ellipse
              cx={40}
              cy={40}
              rx={30}
              ry={16}
              stroke="#6366F1"
              strokeWidth={0.8}
              opacity={0.25}
              transform="rotate(-15 40 40)"
            />
            <ellipse
              cx={40}
              cy={40}
              rx={30}
              ry={16}
              stroke="#8B5CF6"
              strokeWidth={0.8}
              opacity={0.25}
              transform="rotate(45 40 40)"
            />
            {/* Center glow */}
            <circle cx={40} cy={40} r={8} fill="#6366F1" opacity={0.15}>
              <animate
                attributeName="r"
                values="8;12;8"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.15;0.3;0.15"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx={40} cy={40} r={4} fill="#6366F1" opacity={0.4}>
              <animate
                attributeName="opacity"
                values="0.3;0.6;0.3"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Orbiting dots */}
            <circle r={2.5} fill="#6366F1" opacity={0.7}>
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                path="M40,24 A30,16 -15 1,1 39.9,24 Z"
              />
            </circle>
            <circle r={2.5} fill="#8B5CF6" opacity={0.7}>
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                path="M57,26 A30,16 45 1,1 56.9,26 Z"
              />
            </circle>
          </svg>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#6366F1",
            marginBottom: 8,
            letterSpacing: 1,
          }}
        >
          接続が開きました
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 12,
            color: "rgba(30,30,60,0.55)",
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          分身同士の交差が、現実の会話へ変わりました
        </p>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onStartChat}
            style={{
              width: "100%",
              padding: "14px 0",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              boxShadow: "0 2px 16px rgba(99,102,241,0.25)",
              letterSpacing: 0.5,
            }}
          >
            会話を始める
          </button>
          <button
            onClick={onLater}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 12,
              border: "1px solid rgba(30,30,60,0.08)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(30,30,60,0.4)",
              background: "rgba(255,255,255,0.5)",
            }}
          >
            あとで開く
          </button>
        </div>
      </div>
    </div>
  );
}
