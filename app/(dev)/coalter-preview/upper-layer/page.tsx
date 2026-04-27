"use client";

/**
 * CoAlter Stage 1 上部レイヤー preview — page (state picker UI)
 *
 * 正本: layout plan v0.2 §4.1 (Phase L1-a)
 *
 * 本ページは Stage 1 上部レイヤー preview のトップページ。
 * state picker UI (S0-S8 切替 / Pattern variant picker / mode picker) を
 * scaffold として提供する。各 state / pattern / mode の component は
 * L1-b 〜 L1-j で順次実装され、本ページから mount される。
 *
 * 本 phase (L1-a) は scaffold のみ。下記 enum / state hook は確定し、
 * L1-b 以降の Phase で各 state component が import されて mount される。
 *
 * URL: /coalter-preview/upper-layer
 *   (route group `(dev)` は URL に含まれない / Next.js App Router 規約)
 *
 * 不可触対象:
 *   - 本番 ChatClient
 *   - lib/coalter/**
 *   - 既存 (dev)/coalter-preview/page.tsx (legacy preview)
 */

import { useState } from "react";
import S0Observing from "./components/states/S0Observing";
import S1Approaching from "./components/states/S1Approaching";
import S2Opening from "./components/states/S2Opening";
import S3Awaiting from "./components/states/S3Awaiting";
import S4Understanding from "./components/states/S4Understanding";
import S5Bridging from "./components/states/S5Bridging";
import S6ReadyForProposal from "./components/states/S6ReadyForProposal";
import S7ProposalShown from "./components/states/S7ProposalShown";
import S8Cooldown from "./components/states/S8Cooldown";

// ─────────────────────────────────────────────
// state picker enum (L1-a で確定、L1-b 以降で消費される)
// ─────────────────────────────────────────────

/** Presence 状態 S0-S8 (Core UX v1.1 §8.1 / UI spec §5.3-5.11) */
const PRESENCE_STATES = [
  "S0", // 見守り (Observing)
  "S1", // 介入気配 (Approaching)
  "S2", // 入口発話 (Opening)
  "S3", // 返答待ち (Awaiting)
  "S4", // 理解更新中 (Understanding)
  "S5", // 橋渡し中 (Bridging)
  "S6", // 提案可能 (ReadyForProposal)
  "S7", // 提案表示 (ProposalShown)
  "S8", // クールダウン (Cooldown)
] as const;
type PresenceState = (typeof PRESENCE_STATES)[number];

/** Pattern variant (統合契約 §4.2 / UI spec §7) */
const PATTERN_VARIANTS = [
  "A",   // ノーマル介入気配
  "B",   // mood 共有
  "C",   // 軽い同調
  "D",   // 質問返し
  "E",   // 関係への配慮
  "F-1", // 関係提案
  "F-2", // 生活提案
] as const;
type PatternVariant = (typeof PATTERN_VARIANTS)[number];

/** Presence Mode (Core UX v1.1 §2 / UI spec §6) */
const MODES = ["normal", "daily", "travel"] as const;
type Mode = (typeof MODES)[number];

// ─────────────────────────────────────────────
// state labels (state picker UI 表示用)
// ─────────────────────────────────────────────

const STATE_LABELS: Record<PresenceState, string> = {
  S0: "S0 見守り",
  S1: "S1 介入気配",
  S2: "S2 入口発話",
  S3: "S3 返答待ち",
  S4: "S4 理解更新中",
  S5: "S5 橋渡し中",
  S6: "S6 提案可能",
  S7: "S7 提案表示",
  S8: "S8 クールダウン",
};

const MODE_LABELS: Record<Mode, string> = {
  normal: "通常モード",
  daily: "Daily Mode",
  travel: "Travel Mode",
};

// ─────────────────────────────────────────────
// page component
// ─────────────────────────────────────────────

export default function UpperLayerPreviewPage() {
  const [selectedState, setSelectedState] = useState<PresenceState>("S0");
  const [selectedPattern, setSelectedPattern] = useState<PatternVariant>("A");
  const [selectedMode, setSelectedMode] = useState<Mode>("normal");

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            color: "#1a1a2e",
          }}
        >
          CoAlter 上部レイヤー preview
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#4a4a68",
            margin: "6px 0 0",
          }}
        >
          Stage 1 静的試作 (layout plan v0.2 §4) — `app/(dev)/coalter-preview/upper-layer/**`
        </p>
      </header>

      <section
        aria-label="state picker"
        style={{
          background: "#ffffff",
          border: "1px solid #e8e8ec",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>
          state picker
        </h2>

        {/* Presence state */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#4a4a68",
              marginBottom: 6,
            }}
          >
            Presence 状態 (S0-S8)
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESENCE_STATES.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedState(s)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "1px solid",
                  borderColor: selectedState === s ? "#6366F1" : "#e8e8ec",
                  background: selectedState === s ? "#6366F1" : "#ffffff",
                  color: selectedState === s ? "#ffffff" : "#1a1a2e",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {STATE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Pattern variant */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#4a4a68",
              marginBottom: 6,
            }}
          >
            Pattern variant (A/B/C/D/E/F-1/F-2、統合契約 §4.2)
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PATTERN_VARIANTS.map((v) => (
              <button
                key={v}
                onClick={() => setSelectedPattern(v)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  border: "1px solid",
                  borderColor: selectedPattern === v ? "#6366F1" : "#e8e8ec",
                  background: selectedPattern === v ? "#6366F1" : "#ffffff",
                  color: selectedPattern === v ? "#ffffff" : "#1a1a2e",
                  borderRadius: 6,
                  cursor: "pointer",
                  minWidth: 44,
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#4a4a68",
              marginBottom: 6,
            }}
          >
            Mode (通常/Daily/Travel、Core UX §2)
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMode(m)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  border: "1px solid",
                  borderColor: selectedMode === m ? "#6366F1" : "#e8e8ec",
                  background: selectedMode === m ? "#6366F1" : "#ffffff",
                  color: selectedMode === m ? "#ffffff" : "#1a1a2e",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-label="upper layer preview"
        style={{
          padding: "0",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#8888a0",
            marginBottom: 8,
          }}
        >
          選択中: {STATE_LABELS[selectedState]} × Pattern {selectedPattern} ×{" "}
          {MODE_LABELS[selectedMode]} (L1-b: 通常モード S0-S8 静的再現 / Pattern
          variant 切替は L1-c で接続予定 / Daily/Travel 差分は L1-e/f で接続予定)
        </div>
        <UpperLayerStateRenderer
          state={selectedState}
          modeLabel={MODE_TO_LABEL[selectedMode]}
        />
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────
// state renderer (L1-b: state に応じた component を mount)
// ─────────────────────────────────────────────

const MODE_TO_LABEL: Record<Mode, "通常" | "Daily" | "Travel"> = {
  normal: "通常",
  daily: "Daily",
  travel: "Travel",
};

function UpperLayerStateRenderer({
  state,
  modeLabel,
}: {
  state: PresenceState;
  modeLabel: "通常" | "Daily" | "Travel";
}) {
  switch (state) {
    case "S0":
      return <S0Observing modeLabel={modeLabel} />;
    case "S1":
      return <S1Approaching modeLabel={modeLabel} />;
    case "S2":
      return <S2Opening modeLabel={modeLabel} />;
    case "S3":
      return <S3Awaiting modeLabel={modeLabel} />;
    case "S4":
      return <S4Understanding modeLabel={modeLabel} />;
    case "S5":
      return <S5Bridging modeLabel={modeLabel} />;
    case "S6":
      return <S6ReadyForProposal modeLabel={modeLabel} />;
    case "S7":
      return <S7ProposalShown modeLabel={modeLabel} />;
    case "S8":
      return <S8Cooldown modeLabel={modeLabel} />;
  }
}
