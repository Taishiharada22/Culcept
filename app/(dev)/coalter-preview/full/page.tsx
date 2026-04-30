"use client";

/**
 * Stage 3 L3-a — Full Preview Top Page
 *
 * 正本: layout plan v0.3 §6 / §6.1
 *
 * Stage 1 上部レイヤー preview と Stage 2 executor 骨格を結合し、preview 内で
 * 通常モード 1 サイクル S0 → S8 が完結動作することを示す preview hub。
 *
 * 本ページは E2E ハーネス。各シナリオ tab を持ち、動作確認用 mock 発火を提供。
 *
 * URL: /coalter-preview/full
 */

import { useState } from "react";
import { usePresenceExecutor } from "./hooks/usePresenceExecutor";
import MockConversation, { type MockMessage } from "./components/MockConversation";
import PresenceDebugPanel from "./components/PresenceDebugPanel";
import ScenarioRunner from "./components/ScenarioRunner";
import TwoClientView from "./components/TwoClientView";
import { NORMAL_CYCLE_SCENARIOS } from "./scenarios/normalCycle";
import { DAILY_MODE_SCENARIOS } from "./scenarios/dailyMode";
import { TRAVEL_MODE_SCENARIOS } from "./scenarios/travelMode";
import { MODE_TRANSITION_SCENARIOS } from "./scenarios/modeTransitions";
import { MEMORY_SURFACE_SCENARIOS } from "./scenarios/memorySurface";
import { URGENT_LAYER_SCENARIOS } from "./scenarios/urgentLayer";
import { REJECTION_FLOW_SCENARIOS } from "./scenarios/rejectionFlows";

export default function FullPreviewPage() {
  const exec = usePresenceExecutor();
  const [messages, setMessages] = useState<MockMessage[]>([]);

  const handleSend = (speaker: "user_a" | "user_b", text: string) => {
    const msg: MockMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      speaker,
      text,
      at: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);

    // 暗黙 signal mock: 発言量から softScore を導出 (会話継続性として扱う)
    // signal 強度は executor watcher 担当 (本 preview は heuristic で代替)
    const softScore = Math.min(0.6, 0.1 + messages.length * 0.05);
    exec.fire.implicit(softScore);
  };

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "32px 20px",
        display: "grid",
        gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)",
        gap: 20,
      }}
    >
      <div style={{ gridColumn: "1 / span 2" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            color: "#1a1a2e",
          }}
        >
          CoAlter Stage 3 Full Preview
        </h1>
        <p style={{ fontSize: 13, color: "#4a4a68", margin: "6px 0 0" }}>
          Stage 1 UI × Stage 2 executor 結合 (layout plan v0.3 §6) — `app/(dev)/coalter-preview/full/`
        </p>
      </div>

      {/* 左: mock 会話 + signal/event 投入 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MockConversation messages={messages} onSend={handleSend} />

        <SignalInjectorPanel exec={exec} />

        <EventDispatcherPanel exec={exec} />
      </section>

      {/* 右: state 表示 + debug */}
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PresenceDebugPanel state={exec.state} computed={exec.computed} />

        <SpeechCardPreview exec={exec} />

        <ScenarioRunner exec={exec} scenarios={NORMAL_CYCLE_SCENARIOS} />

        <ScenarioRunner exec={exec} scenarios={DAILY_MODE_SCENARIOS} />

        <ScenarioRunner exec={exec} scenarios={TRAVEL_MODE_SCENARIOS} />

        <ScenarioRunner exec={exec} scenarios={MODE_TRANSITION_SCENARIOS} />

        <ScenarioRunner exec={exec} scenarios={MEMORY_SURFACE_SCENARIOS} />

        <ScenarioRunner exec={exec} scenarios={URGENT_LAYER_SCENARIOS} />

        <ScenarioRunner exec={exec} scenarios={REJECTION_FLOW_SCENARIOS} />
      </section>

      {/* 全幅: 2 client view (L3-c) */}
      <section style={{ gridColumn: "1 / span 2" }}>
        <TwoClientView />
      </section>
    </main>
  );
}

/**
 * 各種 signal を手動投入する preview パネル。
 */
function SignalInjectorPanel({
  exec,
}: {
  exec: ReturnType<typeof usePresenceExecutor>;
}) {
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
        Signal Injector (手動 trigger、5 分類)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <BtnSm onClick={() => exec.fire.explicit("free_text")}>explicit (free_text)</BtnSm>
        <BtnSm onClick={() => exec.fire.explicit("mention")}>explicit (mention)</BtnSm>
        <BtnSm onClick={() => exec.fire.explicit("chip_tap")}>explicit (chip_tap)</BtnSm>
        <BtnSm onClick={() => exec.fire.implicit(0.5)}>implicit soft</BtnSm>
        <BtnSm onClick={() => exec.fire.critical("heat_escalation")}>critical (heat)</BtnSm>
        <BtnSm onClick={() => exec.fire.critical("rupture_detected")}>critical (rupture)</BtnSm>
        <BtnSm onClick={() => exec.fire.modePromotion("daily", "mode_tap")}>
          mode_promotion (daily)
        </BtnSm>
        <BtnSm onClick={() => exec.fire.modePromotion("travel", "mode_tap")}>
          mode_promotion (travel)
        </BtnSm>
        <BtnSm onClick={() => exec.fire.manualRestart("button_tap")}>manual_restart</BtnSm>
      </div>
    </div>
  );
}

/**
 * Presence event を手動 dispatch する preview パネル。
 */
function EventDispatcherPanel({
  exec,
}: {
  exec: ReturnType<typeof usePresenceExecutor>;
}) {
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
        Event Dispatcher (state 進行 trigger)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })}>
          S1→S2
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S2_ACCEPTED" })}>
          S2→S3
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S3_RESPONSE" })}>
          S3→S4
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S4_DONE" })}>
          S4→S5
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S5_DONE" })}>
          S5→S6
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S6_PROPOSE" })}>
          S6→S7 (聞く)
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S6_REWORK" })}>
          S6→S5 (整理)
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S7_DONE" })}>
          S7→S8
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "EXIT" })}>
          任意→S8
        </BtnSm>
        <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "RESTART" })}>
          S8→S0
        </BtnSm>
      </div>

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid #e8e8ec",
        }}
      >
        <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 6 }}>
          Mode 切替 / 復帰
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <BtnSm
            onClick={() =>
              exec.dispatch.modeEvent({ type: "MANUAL_SWITCH", target: "normal" })
            }
          >
            通常
          </BtnSm>
          <BtnSm
            onClick={() =>
              exec.dispatch.modeEvent({ type: "MANUAL_SWITCH", target: "daily" })
            }
          >
            Daily
          </BtnSm>
          <BtnSm
            onClick={() =>
              exec.dispatch.modeEvent({ type: "MANUAL_SWITCH", target: "travel" })
            }
          >
            Travel
          </BtnSm>
          <BtnSm onClick={() => exec.dispatch.modeEvent({ type: "PLAN_COMPLETE" })}>
            自然退出
          </BtnSm>
          <BtnSm onClick={() => exec.dispatch.modeEvent({ type: "MANUAL_RETURN" })}>
            手動復帰
          </BtnSm>
        </div>
      </div>
    </div>
  );
}

/**
 * 現在選択された pattern の文面 mock 表示 (本 phase は文面 mock のみ、L2-m
 * speechBuilder は Stage 4 で実装)。
 */
function SpeechCardPreview({
  exec,
}: {
  exec: ReturnType<typeof usePresenceExecutor>;
}) {
  const { primaryPattern, secondaryPattern } = exec.computed;
  const { presence, mode } = exec.state;

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
        Speech Card Preview ({presence.state} / {mode})
      </div>
      {primaryPattern ? (
        <div style={{ fontSize: 12, color: "#1a1a2e", lineHeight: 1.6 }}>
          <div>
            <strong>primary:</strong> Pattern {primaryPattern} —{" "}
            <em style={{ color: "#6366F1" }}>(文面は Stage 4 LLM で生成)</em>
          </div>
          {secondaryPattern && (
            <div style={{ marginTop: 4 }}>
              <strong>secondary (§7.10 副次同伴):</strong> Pattern {secondaryPattern}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#8888a0", fontStyle: "italic" }}>
          (現在の state では発話パターンなし)
        </div>
      )}
    </div>
  );
}

function BtnSm({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        background: "#ffffff",
        border: "1px solid #c8c8dc",
        borderRadius: 4,
        color: "#1a1a2e",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
