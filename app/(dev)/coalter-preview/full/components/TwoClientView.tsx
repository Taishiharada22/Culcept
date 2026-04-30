"use client";

/**
 * Stage 3 L3-c — 2-Client View (画面 2 分割で A/B client 同時表示)
 *
 * 正本: layout plan v0.3 §6.3 / runtime contract §2.6 片方先行容認
 *
 * mock SyncAdapter 経由で 2 client が同一 SharedState を共有することを示す。
 * local state (入力 draft) は片側のみで保持、相手に伝播しない (§2.1.2)。
 */

import { useEffect, useState } from "react";

import {
  useMockSyncAdapter,
  type MockSyncAdapterResult,
} from "../hooks/useMockSyncAdapter";
import type { SharedState } from "@/lib/coalter/presence/sharedState";
import type {
  BroadcastEvent,
  ClientOperation,
} from "@/lib/coalter/presence/syncAdapter";

const PAIR_ID = "preview-pair-001";

export default function TwoClientView() {
  const sync = useMockSyncAdapter({ pairId: PAIR_ID, latencyMs: 200 });

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #c8c8dc",
        borderRadius: 8,
        background: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 10,
          color: "#4a4a68",
        }}
      >
        2-Client View (mock SyncAdapter、latency=200ms)
      </div>
      <div style={{ fontSize: 11, color: "#4a4a68", marginBottom: 10 }}>
        2 client が同一 pair (`{PAIR_ID}`) に接続。chip/送信 操作は server を経由して
        両側に broadcast される。入力 draft は client local (相手に伝播しない、§2.1.2)。
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <ClientPanel user="user_a" sync={sync} />
        <ClientPanel user="user_b" sync={sync} />
      </div>

      <div
        style={{
          marginTop: 10,
          padding: "8px 10px",
          background: "#f5f6fa",
          borderRadius: 6,
          fontSize: 11,
          color: "#4a4a68",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <div>shared serverClock: {sync.serverClock}</div>
        <div>
          mode: <strong>{sync.hubState.mode}</strong> / presence:{" "}
          <strong>{sync.hubState.presenceState}</strong> / availability:{" "}
          <strong>{sync.hubState.availability}</strong>
        </div>
        {sync.hubState.lastChipTap && (
          <div>
            last chip tap: {sync.hubState.lastChipTap.chipLabel} (by{" "}
            {sync.hubState.lastChipTap.tapBy})
          </div>
        )}
        {sync.hubState.speechCard && (
          <div>
            last speech: variant={sync.hubState.speechCard.variant} body=
            {sync.hubState.speechCard.body.slice(0, 30)}…
          </div>
        )}
      </div>
    </div>
  );
}

function ClientPanel({
  user,
  sync,
}: {
  user: "user_a" | "user_b";
  sync: MockSyncAdapterResult;
}) {
  const [draft, setDraft] = useState(""); // local state、相手に伝播しない
  const [received, setReceived] = useState<BroadcastEvent[]>([]);
  const [latestShared, setLatestShared] = useState<SharedState>(sync.hubState);

  useEffect(() => {
    const unsub = sync.adapter.subscribe(PAIR_ID, (event) => {
      setReceived((prev) => [...prev.slice(-4), event]);
      setLatestShared(event.patch as SharedState);
    });
    return unsub;
  }, [sync.adapter]);

  // 初期 fetch
  useEffect(() => {
    sync.adapter.fetchSnapshot(PAIR_ID).then(setLatestShared);
  }, [sync.adapter]);

  const send = async () => {
    if (draft.trim().length === 0) return;
    const op: ClientOperation = {
      pairId: PAIR_ID,
      user,
      payload: { kind: "free_text_send", text: draft },
      clientTimestamp: Date.now(),
      idempotencyKey: `${user}-${Date.now()}`,
    };
    await sync.adapter.broadcast(op);
    setDraft(""); // 自分の draft はクリア
  };

  const tapChip = async (label: string) => {
    const op: ClientOperation = {
      pairId: PAIR_ID,
      user,
      payload: { kind: "chip_tap", chipKind: "response", chipLabel: label },
      clientTimestamp: Date.now(),
      idempotencyKey: `${user}-chip-${Date.now()}`,
    };
    await sync.adapter.broadcast(op);
  };

  const color = user === "user_a" ? "#6366F1" : "#F59E0B";
  const label = user === "user_a" ? "たいし (A)" : "みさき (B)";

  return (
    <div
      style={{
        padding: 10,
        border: `1px solid ${color}`,
        borderRadius: 6,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color }}>{label}</div>

      {/* Local state: input draft (相手に見えない) */}
      <div style={{ fontSize: 10, color: "#8888a0" }}>
        input draft (local、§2.1.2):
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`${label} の draft`}
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 12,
            border: "1px solid #c8c8dc",
            borderRadius: 4,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={send}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            background: color,
            color: "#ffffff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          送信
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" onClick={() => tapChip("近い")} style={chipBtnStyle}>
          近い
        </button>
        <button
          type="button"
          onClick={() => tapChip("少し違う")}
          style={chipBtnStyle}
        >
          少し違う
        </button>
        <button
          type="button"
          onClick={() => tapChip("続けて")}
          style={chipBtnStyle}
        >
          続けて
        </button>
      </div>

      {/* Received broadcasts (server 経由で両 client に届く) */}
      <div
        style={{
          fontSize: 10,
          color: "#4a4a68",
          background: "#f5f6fa",
          padding: 6,
          borderRadius: 4,
          fontFamily: "ui-monospace, monospace",
          minHeight: 60,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          received broadcasts ({received.length}):
        </div>
        {received.length === 0 ? (
          <div style={{ fontStyle: "italic", color: "#8888a0" }}>(待機中)</div>
        ) : (
          received.map((e, i) => (
            <div key={i}>
              t={e.serverTimestamp} from={e.origin}
            </div>
          ))
        )}
        <div style={{ marginTop: 4, color: "#6366F1" }}>
          shared mode: {latestShared.mode} / state: {latestShared.presenceState}
        </div>
      </div>
    </div>
  );
}

const chipBtnStyle: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 11,
  background: "#ffffff",
  border: "1px solid #c8c8dc",
  borderRadius: 12,
  cursor: "pointer",
};
