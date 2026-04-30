"use client";

/**
 * Stage 3 L3-b — Scenario Runner
 *
 * 正本: layout plan v0.3 §6.2
 *
 * 7 シナリオ + Daily/Travel/Mode/Memory/Urgent/Rejection 拡張シナリオ (L3-d 〜 L3-i)
 * を 1 click で順次実行する preview component。
 *
 * 各シナリオは ScenarioDefinition (events 列) を順次 dispatch し、最終 state を
 * 期待値と照合する (visual 検証)。
 */

import { useState } from "react";
import type { usePresenceExecutor } from "../hooks/usePresenceExecutor";
import type { ScenarioDefinition, ScenarioStep } from "../scenarios/normalCycle";

interface ScenarioLogEntry {
  step: number;
  description: string;
  stateAfter: string;
}

export default function ScenarioRunner({
  exec,
  scenarios,
}: {
  exec: ReturnType<typeof usePresenceExecutor>;
  scenarios: ReadonlyArray<ScenarioDefinition>;
}) {
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [log, setLog] = useState<ScenarioLogEntry[]>([]);
  const [finalState, setFinalState] = useState<string | null>(null);
  const [matched, setMatched] = useState<boolean | null>(null);

  const runScenario = async (scenario: ScenarioDefinition) => {
    setActiveScenarioId(scenario.id);
    setLog([]);
    setFinalState(null);
    setMatched(null);

    // 各 step 間に少し待機を入れて preview に state 変化を見せる
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      executeStep(exec, step);
      // React の state 更新を反映させるため microtask 経由で待機
      await new Promise((r) => setTimeout(r, 250));
      setLog((prev) => [
        ...prev,
        {
          step: i + 1,
          description: step.description,
          stateAfter: exec.state.presence.state,
        },
      ]);
    }
    // 最終 state は同期取得 (state 更新は async なので少し待つ)
    await new Promise((r) => setTimeout(r, 50));
    const final = exec.state.presence.state;
    setFinalState(final);
    setMatched(final === scenario.expectedFinalState);
  };

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #c8c8dc",
        borderRadius: 8,
        background: "#ffffff",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#4a4a68" }}>
        Scenario Runner ({scenarios.length} シナリオ)
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {scenarios.map((sc) => (
          <div
            key={sc.id}
            style={{
              padding: "6px 10px",
              border: "1px solid",
              borderColor: activeScenarioId === sc.id ? "#6366F1" : "#e8e8ec",
              background: activeScenarioId === sc.id ? "#eef2ff" : "#ffffff",
              borderRadius: 6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#1a1a2e" }}>{sc.name}</span>
              <button
                type="button"
                onClick={() => runScenario(sc)}
                style={{
                  padding: "2px 10px",
                  fontSize: 11,
                  background: "#6366F1",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                run
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#4a4a68" }}>{sc.description}</div>
            <div style={{ fontSize: 10, color: "#8888a0" }}>
              expected final: <code>{sc.expectedFinalState}</code>
            </div>
          </div>
        ))}
      </div>

      {activeScenarioId && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "#f5f6fa",
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            実行ログ ({activeScenarioId})
          </div>
          {log.map((l) => (
            <div key={l.step} style={{ color: "#4a4a68" }}>
              {l.step}. {l.description} → state={l.stateAfter}
            </div>
          ))}
          {finalState && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid #c8c8dc",
                color: matched ? "#16a34a" : "#dc2626",
                fontWeight: 600,
              }}
            >
              final: {finalState} {matched ? "✓ expected" : "✗ unexpected"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * シナリオ step を executor に dispatch する。
 */
export function executeStep(
  exec: ReturnType<typeof usePresenceExecutor>,
  step: ScenarioStep,
): void {
  switch (step.kind) {
    case "signal_explicit":
      exec.fire.explicit((step.payload.source as "free_text" | "mention" | "chip_tap" | "button_tap") ?? "free_text");
      break;
    case "signal_implicit":
      exec.fire.implicit((step.payload.softScore as number) ?? 0.5);
      break;
    case "signal_critical":
      exec.fire.critical((step.payload.trigger as string) ?? "heat_escalation");
      break;
    case "signal_mode_promotion":
      exec.fire.modePromotion(
        (step.payload.target as "daily" | "travel") ?? "daily",
        (step.payload.source as "free_text" | "mode_tap" | "auto_escalation") ?? "mode_tap",
      );
      break;
    case "signal_manual_restart":
      exec.fire.manualRestart((step.payload.source as "mention" | "button_tap") ?? "button_tap");
      break;
    case "presence_event":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exec.dispatch.presenceEvent(step.payload as any);
      break;
    case "mode_manual":
      exec.dispatch.modeEvent({
        type: "MANUAL_SWITCH",
        target: (step.payload.target as "normal" | "daily" | "travel") ?? "normal",
      });
      break;
    case "mode_natural_exit":
      exec.dispatch.modeEvent({ type: "PLAN_COMPLETE" });
      break;
    case "rejection":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exec.dispatch.rejection(step.payload as any);
      break;
  }
}
