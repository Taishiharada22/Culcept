"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvButton,
  RvCard,
  RvGlowCard,
  RV_COLORS,
  RvBadge,
  type RvCategory,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// SessionRoomClient — 5分匿名セッション
// =============================================================================

type SessionMessage = {
  id: string;
  sender: "me" | "partner";
  content: string;
  createdAt: string;
};

type SessionState = {
  id: string;
  category: string;
  mode: string;
  state: "queued" | "matched" | "active" | "ended";
  startedAt: string | null;
  endsAt: string | null;
  remainingMs: number;
  myDecision: string | null;
  partnerDecided: boolean;
  mutualResult: boolean | null;
};

export default function SessionRoomClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [phase, setPhase] = useState<"chat" | "decision" | "result">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // セッション状態ポーリング
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/rendezvous/session/${sessionId}`);
      const data = await res.json();
      if (data.ok) {
        setSession(data.session);
        setMessages(data.messages);

        if (data.session.state === "ended") {
          setPhase("result");
        } else if (data.session.remainingMs <= 0 && data.session.state !== "queued") {
          setPhase("decision");
        }
      }
    } catch {
      // ignore
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
    // 3秒ごとにポーリング（Supabase Realtimeに将来移行）
    pollRef.current = setInterval(fetchSession, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchSession]);

  // タイマー
  useEffect(() => {
    if (!session?.endsAt) return;

    const update = () => {
      const ms = new Date(session.endsAt!).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0) {
        setPhase("decision");
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session?.endsAt]);

  // スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    const text = inputText.trim();
    setInputText("");

    // 楽観的UI更新
    const tempMsg: SessionMessage = {
      id: `temp-${Date.now()}`,
      sender: "me",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await fetch(`/api/rendezvous/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const submitDecision = async (decision: "again" | "pass") => {
    try {
      const res = await fetch(`/api/rendezvous/session/${sessionId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.isMutual !== null) {
          setSession((s) => s ? { ...s, mutualResult: data.isMutual, myDecision: decision } : s);
          setPhase("result");
        } else {
          setSession((s) => s ? { ...s, myDecision: decision } : s);
          // 相手の判定待ち
        }
      }
    } catch {
      // ignore
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ─── 待機中 ───
  if (!session || session.state === "queued") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-5xl mb-6"
        >
          🎭
        </motion.div>
        <p className="text-sm font-bold mb-2" style={{ color: RV_COLORS.text }}>
          相手を探しています...
        </p>
        <p className="text-xs" style={{ color: RV_COLORS.textMuted }}>
          同じカテゴリの誰かがマッチするのを待っています
        </p>
      </div>
    );
  }

  // ─── 結果画面 ───
  if (phase === "result") {
    const isMutual = session.mutualResult;
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <AnimatePresence>
          {isMutual === true ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: 3, duration: 0.5 }}
                className="text-6xl mb-4"
              >
                ✨
              </motion.div>
              <p className="text-lg font-bold mb-2" style={{ color: RV_COLORS.primary }}>
                接続成立！
              </p>
              <p className="text-sm mb-6" style={{ color: RV_COLORS.textSub }}>
                お互い「もう一度話したい」と思いました
              </p>
              <RvButton variant="glow" onClick={() => router.push("/rendezvous")}>
                ホームに戻る
              </RvButton>
            </motion.div>
          ) : isMutual === false ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <div className="text-4xl mb-4">🌊</div>
              <p className="text-sm font-bold mb-2" style={{ color: RV_COLORS.text }}>
                今回は接続になりませんでした
              </p>
              <p className="text-xs mb-6" style={{ color: RV_COLORS.textMuted }}>
                また明日、新しい出会いがあります
              </p>
              <RvButton variant="secondary" onClick={() => router.push("/rendezvous")}>
                ホームに戻る
              </RvButton>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-4xl mb-4"
              >
                ⏳
              </motion.div>
              <p className="text-sm font-bold mb-2" style={{ color: RV_COLORS.text }}>
                相手の判定を待っています...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── 判定画面 ───
  if (phase === "decision" && !session.myDecision) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center w-full max-w-sm"
        >
          <div className="text-4xl mb-4">🎭</div>
          <p className="text-lg font-bold mb-2" style={{ color: RV_COLORS.text }}>
            5分間が終わりました
          </p>
          <p className="text-sm mb-8" style={{ color: RV_COLORS.textSub }}>
            この人ともう一度話したいですか？
          </p>
          <div className="flex flex-col gap-3">
            <RvButton variant="glow" onClick={() => submitDecision("again")} className="w-full">
              もう一度話したい
            </RvButton>
            <RvButton variant="ghost" onClick={() => submitDecision("pass")} className="w-full">
              今回はパス
            </RvButton>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── チャット画面 ───
  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* ヘッダー: タイマー + カテゴリ */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${RV_COLORS.border}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎭</span>
          <span className="text-xs font-bold" style={{ color: RV_COLORS.textSub }}>
            匿名セッション
          </span>
          <RvBadge category={session.category as RvCategory} />
        </div>
        {remainingSeconds !== null && remainingSeconds > 0 && (
          <motion.div
            className="flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{
              backgroundColor: remainingSeconds < 60 ? `${RV_COLORS.primary}12` : RV_COLORS.surfaceMuted,
              color: remainingSeconds < 60 ? RV_COLORS.primary : RV_COLORS.text,
            }}
            animate={remainingSeconds < 30 ? { scale: [1, 1.05, 1] } : undefined}
            transition={remainingSeconds < 30 ? { repeat: Infinity, duration: 1 } : undefined}
          >
            <span className="text-xs font-bold">{formatTime(remainingSeconds)}</span>
          </motion.div>
        )}
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-xs" style={{ color: RV_COLORS.textMuted }}>
              最初のメッセージを送ってみましょう
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm"
              style={
                msg.sender === "me"
                  ? {
                      background: RV_COLORS.gradient,
                      color: "#FFFFFF",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      backgroundColor: RV_COLORS.surfaceMuted,
                      color: RV_COLORS.text,
                      borderBottomLeftRadius: 4,
                    }
              }
            >
              {msg.content}
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
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
