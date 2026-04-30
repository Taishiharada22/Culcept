"use client";

/**
 * Stage 3 L3-a — Presence Debug Panel
 *
 * 正本: layout plan v0.3 §6.1
 *
 * 現在の executor 状態を debug 用に可視化:
 *   - presence state (S0-S8)
 *   - mode (通常 / Daily / Travel)
 *   - availability (5 状態)
 *   - primary / secondary pattern variant
 *   - 直近 signal 強度
 *   - active cooldown 数 / urgent decision
 */

import type { PresenceExecutorState, PresenceExecutorComputed } from "../hooks/usePresenceExecutor";
import { flattenCooldowns } from "@/lib/coalter/presence/rejectionReducer";

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#8888a0",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 2,
};
const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#1a1a2e",
  fontWeight: 600,
};

export default function PresenceDebugPanel({
  state,
  computed,
}: {
  state: PresenceExecutorState;
  computed: PresenceExecutorComputed;
}) {
  const lastSignal = state.recentSignals[state.recentSignals.length - 1];
  const cooldownCount = flattenCooldowns(state.rejectionState).length;

  return (
    <div
      style={{
        padding: 14,
        border: "1px solid #c8c8dc",
        borderRadius: 8,
        background: "#f5f6fa",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "#4a4a68" }}>
        Presence Debug Panel
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        <Field label="state" value={state.presence.state} />
        <Field label="mode" value={state.mode} />
        <Field label="availability" value={state.availability} />
        <Field label="primary pattern" value={computed.primaryPattern ?? "—"} />
        <Field label="secondary" value={computed.secondaryPattern ?? "—"} />
        <Field
          label="last signal"
          value={
            lastSignal
              ? `${lastSignal.kind} (${lastSignal.strength})`
              : "—"
          }
        />
        <Field label="cooldowns" value={`${cooldownCount} active`} />
        <Field
          label="urgent"
          value={
            computed.urgentDecision
              ? `${computed.urgentDecision.category} / ${computed.urgentDecision.form}`
              : "—"
          }
        />
        <Field
          label="utterance queue"
          value={state.utteranceQueue.active ? "1 active" : "empty"}
        />
        <Field label="memory items" value={`${state.memoryStore.length}`} />
      </div>

      {state.recentSignals.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 11, color: "#4a4a68" }}>
          <summary style={{ cursor: "pointer" }}>signal log ({state.recentSignals.length})</summary>
          <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {state.recentSignals.slice(-5).map((s, i) => (
              <li key={i}>
                {s.kind} ({s.strength}) @ {s.detectedAt}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}
