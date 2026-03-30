"use client";
import { ALL_CONTEXTS, CONTEXT_LABELS, CONTEXT_COLORS } from "@/lib/rendezvous/questions/types";
import type { ContextType } from "@/lib/rendezvous/questions/types";

type Props = {
  activeContext: ContextType;
  onChange: (ctx: ContextType) => void;
};

export default function RendezvousContextTabs({ activeContext, onChange }: Props) {
  return (
    <div style={{
      display: "flex",
      gap: 0,
      background: "rgba(255,255,255,0.6)",
      borderRadius: 14,
      padding: 3,
      border: "1px solid rgba(30,30,60,0.05)",
      backdropFilter: "blur(8px)",
    }}>
      {ALL_CONTEXTS.map((ctx) => {
        const active = ctx === activeContext;
        const color = CONTEXT_COLORS[ctx];
        return (
          <button
            key={ctx}
            onClick={() => onChange(ctx)}
            style={{
              flex: 1,
              padding: "10px 4px 8px",
              background: active ? "rgba(255,255,255,0.9)" : "transparent",
              border: "none",
              borderRadius: 11,
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.3s ease",
              boxShadow: active ? `0 1px 6px ${color}18` : "none",
            }}
          >
            <div style={{
              fontSize: 12,
              fontWeight: active ? 800 : 500,
              color: active ? color : "rgba(30,30,60,0.4)",
              transition: "all 0.3s ease",
            }}>
              {CONTEXT_LABELS[ctx]}
            </div>
            {/* Active indicator dot */}
            <div style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: color,
              margin: "4px auto 0",
              opacity: active ? 1 : 0,
              transform: active ? "scale(1)" : "scale(0)",
              transition: "all 0.3s ease",
            }} />
          </button>
        );
      })}
    </div>
  );
}
