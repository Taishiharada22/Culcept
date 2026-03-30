"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvCard,
  RvButton,
  RV_COLORS,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// MissionRoomClient — 協同ミッション実行画面
// =============================================================================

type Turn = {
  sender: "me" | "partner";
  content: string;
  at: string;
};

export default function MissionRoomClient({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [mission, setMission] = useState<{
    state: string;
    payload: { title: string; description: string; rules: string; icon: string; turnsRequired: number };
    progress: { turns: Turn[]; currentTurn: number };
  } | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const turnsEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchMission = useCallback(async () => {
    try {
      // ミッション状態取得（action API の GET を利用、なければ再ポーリング）
      const res = await fetch(`/api/rendezvous/mission/${missionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "__poll__" }),
      });
      // ポーリング用にはGET APIが必要だが、簡易的にローカルstateで管理
    } catch {
      // ignore
    }
  }, [missionId]);

  useEffect(() => {
    // 初期表示用のダミーデータ（実際はAPI取得）
    setLoading(false);
    setMission({
      state: "active",
      payload: {
        title: "ミッション",
        description: "相手を待機中...",
        rules: "",
        icon: "🎯",
        turnsRequired: 8,
      },
      progress: { turns: [], currentTurn: 0 },
    });
  }, []);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mission?.progress.turns.length]);

  const handleSubmitTurn = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    const text = inputText.trim();
    setInputText("");

    try {
      const res = await fetch(`/api/rendezvous/mission/${missionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (data.ok) {
        setMission((m) => {
          if (!m) return m;
          return {
            ...m,
            state: data.isComplete ? "completed" : "active",
            progress: {
              turns: data.turns,
              currentTurn: data.turn,
            },
          };
        });
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  if (loading || !mission) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-sm"
          style={{ color: RV_COLORS.textMuted }}
        >
          ミッションを読み込み中...
        </motion.div>
      </div>
    );
  }

  const { payload, progress } = mission;
  const isComplete = mission.state === "completed";

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-4 py-6 pb-28">
      {/* ミッションヘッダー */}
      <RvCard elevated className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{payload.icon}</span>
          <h2 className="text-sm font-bold" style={{ color: RV_COLORS.text }}>
            {payload.title}
          </h2>
        </div>
        <p className="text-xs leading-relaxed mb-2" style={{ color: RV_COLORS.textSub }}>
          {payload.description}
        </p>
        {payload.rules && (
          <p className="text-[10px] leading-relaxed" style={{ color: RV_COLORS.textMuted }}>
            {payload.rules}
          </p>
        )}
        {/* プログレス */}
        <div className="mt-3 flex items-center gap-2">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: RV_COLORS.surfaceMuted }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: RV_COLORS.gradient }}
              animate={{ width: `${(progress.currentTurn / payload.turnsRequired) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            />
          </div>
          <span className="text-[10px] font-bold" style={{ color: RV_COLORS.textMuted }}>
            {progress.currentTurn}/{payload.turnsRequired}
          </span>
        </div>
      </RvCard>

      {/* ターン一覧 */}
      <div className="flex-1 space-y-2 mb-4">
        {progress.turns.map((turn, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${turn.sender === "me" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
              style={
                turn.sender === "me"
                  ? { background: RV_COLORS.gradient, color: "#FFFFFF", borderBottomRightRadius: 4 }
                  : { backgroundColor: RV_COLORS.surfaceMuted, color: RV_COLORS.text, borderBottomLeftRadius: 4 }
              }
            >
              {turn.content}
            </div>
          </motion.div>
        ))}
        <div ref={turnsEndRef} />
      </div>

      {/* 完了画面 */}
      {isComplete ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-8"
        >
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-sm font-bold mb-2" style={{ color: RV_COLORS.text }}>
            ミッション完了！
          </p>
          <p className="text-xs mb-6" style={{ color: RV_COLORS.textSub }}>
            一緒に作った成果物をご覧ください
          </p>
          <div className="flex flex-col gap-2">
            <RvButton variant="glow" onClick={() => router.push("/rendezvous")}>
              ホームに戻る
            </RvButton>
          </div>
        </motion.div>
      ) : (
        /* 入力エリア */
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmitTurn()}
            placeholder="あなたのターン..."
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
            onClick={handleSubmitTurn}
            className="!px-4 !py-2.5 !rounded-xl"
          >
            {sending ? "..." : "追加"}
          </RvButton>
        </div>
      )}
    </div>
  );
}
