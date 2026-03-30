"use client";
import { CONTEXT_COLORS, CONTEXT_LABELS } from "@/lib/rendezvous/questions/types";
import type { ContextType, ContextExplorationState } from "@/lib/rendezvous/questions/types";

type Props = {
  context: ContextType;
  state: ContextExplorationState;
  standbyActive: boolean;
  onChangeState: (newState: ContextExplorationState) => void;
  onResumeStandby: () => void;
};

export default function RendezvousContextStatusBar({
  context, state, standbyActive, onChangeState, onResumeStandby,
}: Props) {
  const color = CONTEXT_COLORS[context];

  // Standby banner takes priority
  if (standbyActive) {
    return (
      <div style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#F59E0B",
            animation: "rv-glow-pulse 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 11, color: "rgba(30,30,60,0.6)", fontWeight: 600 }}>
            観測を一時休止しています
          </span>
        </div>
        <button
          onClick={onResumeStandby}
          style={{
            fontSize: 10, fontWeight: 700,
            color: "#F59E0B",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 6, padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          再開
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "8px 14px",
      borderRadius: 10,
      background: "rgba(255,255,255,0.5)",
      border: `1px solid ${color}10`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {state === "active" && (
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#22C55E",
            boxShadow: "0 0 4px rgba(34,197,94,0.4)",
          }} />
        )}
        {state === "paused" && (
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#F59E0B",
          }} />
        )}
        {state === "inactive" && (
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "rgba(30,30,60,0.15)",
          }} />
        )}
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: state === "active" ? "rgba(30,30,60,0.6)" :
                 state === "paused" ? "#D97706" :
                 "rgba(30,30,60,0.4)",
        }}>
          {state === "active" ? `${CONTEXT_LABELS[context]}を探索中` :
           state === "paused" ? "一時停止中" :
           "分身はまだ出発していません"}
        </span>
      </div>

      {state === "active" && (
        <button
          onClick={() => onChangeState("paused")}
          style={{
            fontSize: 10, fontWeight: 700,
            color: "rgba(30,30,60,0.5)",
            background: "rgba(30,30,60,0.04)",
            border: "1px solid rgba(30,30,60,0.08)",
            borderRadius: 6, padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          一時停止
        </button>
      )}
      {state === "paused" && (
        <button
          onClick={() => onChangeState("active")}
          style={{
            fontSize: 10, fontWeight: 700,
            color,
            background: `${color}08`,
            border: `1px solid ${color}18`,
            borderRadius: 6, padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          再開
        </button>
      )}
      {state === "inactive" && (
        <button
          onClick={() => onChangeState("active")}
          style={{
            fontSize: 10, fontWeight: 700,
            color: "#fff",
            background: `linear-gradient(135deg, ${color}, ${color}cc)`,
            border: "none",
            borderRadius: 6, padding: "5px 12px",
            cursor: "pointer",
            boxShadow: `0 1px 6px ${color}25`,
          }}
        >
          送り出す
        </button>
      )}
    </div>
  );
}
