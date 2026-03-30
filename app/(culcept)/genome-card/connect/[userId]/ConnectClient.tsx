"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingNavLight } from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";

const C = { bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)", s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

type Phase = "loading" | "confirm" | "sending" | "success" | "already" | "error";

export default function ConnectClient({ targetUserId }: { targetUserId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);

  // 相手のプロフィールを取得して確認画面を表示
  useEffect(() => {
    (async () => {
      try {
        // 既存の接続を確認
        const connRes = await fetch("/api/genome-connections");
        const connData = await connRes.json();
        if (connData.ok) {
          const existing = connData.connections?.find(
            (c: { counterpart: { userId: string }; status: string }) =>
              c.counterpart.userId === targetUserId && c.status !== "declined"
          );
          if (existing) {
            setPhase("already");
            setTargetName(existing.counterpart.displayName);
            return;
          }
        }
        setPhase("confirm");
      } catch {
        setPhase("confirm");
      }
    })();
  }, [targetUserId]);

  const handleSend = async () => {
    setPhase("sending");
    try {
      const res = await fetch("/api/genome-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: targetUserId, visibility: 2 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes("existing") || data.error?.includes("already")) {
          setPhase("already");
        } else {
          setError(data.error || "送信に失敗しました");
          setPhase("error");
        }
        return;
      }
      setPhase("success");
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([50, 30, 100]);
      }
    } catch {
      setError("ネットワークエラー");
      setPhase("error");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <main className="max-w-lg mx-auto px-4 pt-16 pb-32 flex items-center justify-center min-h-[80vh]">
        <motion.div
          className="w-full rounded-2xl text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "40px 24px" }}
        >
          {phase === "loading" && (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-2xl mx-auto animate-pulse" style={{ background: C.s2 }} />
              <p style={{ fontSize: 13, color: C.t3 }}>確認中...</p>
            </div>
          )}

          {phase === "confirm" && (
            <div className="space-y-6">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ fontSize: 48 }}>
                ✦
              </motion.div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: C.t1 }}>
                  カード交換リクエスト
                </h2>
                <p style={{ fontSize: 13, color: C.t3, marginTop: 8, lineHeight: 1.8 }}>
                  相手にあなたのGenome Cardが送られます。<br />
                  相手が承認するとお互いのカードを見ることができます。
                </p>
              </div>
              <div className="space-y-2">
                <button onClick={handleSend}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold"
                  style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                  カード交換をリクエストする
                </button>
                <Link href="/genome-card"
                  className="block w-full py-3 rounded-xl text-sm font-medium text-center"
                  style={{ color: C.t3 }}>
                  キャンセル
                </Link>
              </div>
            </div>
          )}

          {phase === "sending" && (
            <div className="space-y-4">
              <motion.div
                animate={{ scale: [1, 0.8, 0.4], y: [0, -20, -60], rotateY: [0, 180, 360], opacity: [1, 0.8, 0.4] }}
                transition={{ duration: 1.2 }}
                style={{ fontSize: 48 }}>
                ✦
              </motion.div>
              <p style={{ fontSize: 14, color: C.neural }}>カードを送信中...</p>
            </div>
          )}

          {phase === "success" && (
            <div className="space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5 }}
                style={{ fontSize: 48, color: "rgb(16,185,129)" }}>
                ✓
              </motion.div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "rgb(16,185,129)" }}>
                  リクエスト送信完了
                </h2>
                <p style={{ fontSize: 13, color: C.t3, marginTop: 8 }}>
                  相手が承認するとカードが交換されます
                </p>
              </div>
              <Link href="/genome-card"
                className="inline-block px-8 py-3 rounded-xl text-sm font-medium"
                style={{ background: C.s2, color: C.t1 }}>
                Genome Card に戻る
              </Link>
            </div>
          )}

          {phase === "already" && (
            <div className="space-y-6">
              <div style={{ fontSize: 48 }}>∞</div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>
                  {targetName ? `${targetName}さんとは` : "この相手とは"}すでに接続済みです
                </h2>
                <p style={{ fontSize: 13, color: C.t3, marginTop: 8 }}>
                  カード一覧から相手のカードを確認できます
                </p>
              </div>
              <Link href="/genome-card"
                className="inline-block px-8 py-3 rounded-xl text-sm font-medium"
                style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                カードを見る
              </Link>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-6">
              <div style={{ fontSize: 48, color: C.t4 }}>⚠</div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>送信できませんでした</h2>
                <p style={{ fontSize: 13, color: "#ef4444", marginTop: 8 }}>{error}</p>
              </div>
              <div className="space-y-2">
                <button onClick={() => setPhase("confirm")}
                  className="w-full py-3 rounded-xl text-sm font-medium"
                  style={{ background: C.s2, color: C.t1 }}>
                  もう一度試す
                </button>
                <Link href="/genome-card"
                  className="block w-full py-3 rounded-xl text-sm font-medium text-center"
                  style={{ color: C.t3 }}>
                  戻る
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </main>
      <FloatingNavLight items={MAIN_NAV} activeHref="/genome-card" />
    </div>
  );
}
