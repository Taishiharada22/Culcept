"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvCard,
  RvButton,
  RV_COLORS,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// ConstellationClient — 星座グループチャット (24時間限定)
// =============================================================================

type GroupMessage = {
  id: string;
  senderLabel: string;
  isMe: boolean;
  content: string;
  createdAt: string;
};

const STAR_COLORS = ["#E91E63", "#7B61FF", "#FF6D00", "#00C853", "#D4776B"];

export default function ConstellationClient({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [mission, setMission] = useState<{ title: string; description: string; icon: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: 星座状態取得API（現在はプレースホルダー）
    setMission({ title: "星座ミッション", description: "メンバーが集まるのを待っています...", icon: "🌌" });
    setMemberCount(1);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    const text = inputText.trim();
    setInputText("");

    try {
      const res = await fetch(`/api/rendezvous/constellation/${groupId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* ヘッダー */}
      <div
        className="sticky top-0 z-10 px-4 py-3"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${RV_COLORS.border}`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌌</span>
            <span className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
              星座チャット
            </span>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: memberCount }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: STAR_COLORS[i % STAR_COLORS.length] }}
              />
            ))}
            <span className="text-[10px] ml-1" style={{ color: RV_COLORS.textMuted }}>
              {memberCount}人
            </span>
          </div>
        </div>

        {/* ミッション */}
        {mission && (
          <div
            className="mt-2 rounded-xl px-3 py-2 text-xs"
            style={{
              backgroundColor: `${RV_COLORS.secondary}08`,
              border: `1px solid ${RV_COLORS.secondary}15`,
            }}
          >
            <span>{mission.icon} </span>
            <span className="font-bold" style={{ color: RV_COLORS.text }}>
              {mission.title}
            </span>
            <span style={{ color: RV_COLORS.textSub }}> — {mission.description}</span>
          </div>
        )}
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="text-4xl mb-4"
            >
              ✦
            </motion.div>
            <p className="text-xs" style={{ color: RV_COLORS.textMuted }}>
              星座が形成されました。最初のメッセージを送りましょう。
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[75%]">
              {!msg.isMe && (
                <span
                  className="text-[10px] font-bold ml-1 mb-0.5 block"
                  style={{
                    color: STAR_COLORS[
                      msg.senderLabel.charCodeAt(msg.senderLabel.length - 1) % STAR_COLORS.length
                    ],
                  }}
                >
                  {msg.senderLabel}
                </span>
              )}
              <div
                className="rounded-2xl px-4 py-2.5 text-sm"
                style={
                  msg.isMe
                    ? { background: RV_COLORS.gradient, color: "#FFFFFF", borderBottomRightRadius: 4 }
                    : { backgroundColor: RV_COLORS.surfaceMuted, color: RV_COLORS.text, borderBottomLeftRadius: 4 }
                }
              >
                {msg.content}
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力 */}
      <div
        className="sticky bottom-0 px-4 py-3 flex items-center gap-2"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${RV_COLORS.border}`,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="メッセージを入力..."
          className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
          style={{
            backgroundColor: RV_COLORS.surfaceMuted,
            border: `1px solid ${RV_COLORS.border}`,
            color: RV_COLORS.text,
          }}
        />
        <RvButton
          variant="primary"
          disabled={!inputText.trim() || sending}
          onClick={sendMessage}
          className="!px-4 !py-2.5 !rounded-xl"
        >
          送信
        </RvButton>
      </div>
    </div>
  );
}
