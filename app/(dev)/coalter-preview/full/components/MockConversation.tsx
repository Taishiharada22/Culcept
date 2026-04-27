"use client";

/**
 * Stage 3 L3-a — Mock 2 人会話入力
 *
 * 正本: layout plan v0.3 §6.1
 *
 * 2 人 (たいし / みさき) の発言を timeline 形式で入力。
 * 各発言は executor watcher の暗黙 signal source として扱う mock。
 * 実 executor は本 hook に渡された fire 関数経由で signal 投入。
 */

import { useState } from "react";

export interface MockMessage {
  id: string;
  speaker: "user_a" | "user_b";
  text: string;
  at: number;
}

export interface MockConversationProps {
  messages: ReadonlyArray<MockMessage>;
  onSend: (speaker: "user_a" | "user_b", text: string) => void;
}

export default function MockConversation({
  messages,
  onSend,
}: MockConversationProps) {
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");

  const send = (speaker: "user_a" | "user_b", text: string) => {
    if (text.trim().length === 0) return;
    onSend(speaker, text.trim());
    if (speaker === "user_a") setDraftA("");
    else setDraftB("");
  };

  return (
    <div
      style={{
        border: "1px solid #c8c8dc",
        borderRadius: 8,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          background: "#f5f6fa",
          borderBottom: "1px solid #e8e8ec",
          fontSize: 12,
          fontWeight: 600,
          color: "#4a4a68",
        }}
      >
        Mock 2 人会話 (たいし & みさき)
      </div>

      <div
        style={{
          padding: 12,
          maxHeight: 240,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: "#8888a0", fontStyle: "italic" }}>
            (まだ発言なし)
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.speaker === "user_a" ? "flex-start" : "flex-end",
              maxWidth: "75%",
              padding: "6px 10px",
              background: m.speaker === "user_a" ? "#eef2ff" : "#fef3c7",
              border: "1px solid",
              borderColor: m.speaker === "user_a" ? "#c7d2fe" : "#fcd34d",
              borderRadius: 12,
              fontSize: 12,
              color: "#1a1a2e",
            }}
          >
            <div style={{ fontSize: 10, color: "#8888a0", marginBottom: 2 }}>
              {m.speaker === "user_a" ? "たいし" : "みさき"}
            </div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid #e8e8ec",
          padding: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <InputBox
          label="たいし"
          color="#6366F1"
          value={draftA}
          onChange={setDraftA}
          onSend={() => send("user_a", draftA)}
        />
        <InputBox
          label="みさき"
          color="#F59E0B"
          value={draftB}
          onChange={setDraftB}
          onSend={() => send("user_b", draftB)}
        />
      </div>
    </div>
  );
}

function InputBox({
  label,
  color,
  value,
  onChange,
  onSend,
}: {
  label: string;
  color: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          placeholder={`${label}の発言`}
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
          onClick={onSend}
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
    </div>
  );
}
