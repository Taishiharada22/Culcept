"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GenomeCardData, VisibilityLevel } from "@/lib/genome/cardTypes";
import GenomeCardLiving from "./GenomeCardLiving";
import FocusTrap from "./FocusTrap";

const C = { s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

const DEPTH_OPTIONS: {
  level: VisibilityLevel;
  name: string;
  description: string;
  detail: string;
  emoji: string;
}[] = [
  {
    level: 1,
    name: "名刺",
    description: "はじめましての距離感",
    detail: "タイプ名とモットーだけ",
    emoji: "🤝",
  },
  {
    level: 2,
    name: "会話",
    description: "もう少し知りたい",
    detail: "性格レーダー・強み・名言も見せる",
    emoji: "💬",
  },
  {
    level: 3,
    name: "信頼",
    description: "この人には見せていい",
    detail: "恋愛パターン・深夜の独白・すべて",
    emoji: "🔓",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
  myCard?: GenomeCardData | null;
}

function Particles() {
  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const distance = 60 + Math.random() * 40;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, size: 2 + Math.random() * 3, delay: Math.random() * 0.3 };
  });
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {particles.map((p, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: i % 2 === 0 ? C.neural : C.pulse }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
          transition={{ duration: 0.8, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

type Phase = "input" | "depth" | "confirming" | "flying" | "success";

export default function SendRequestModal({ isOpen, onClose, onSent, myCard }: Props) {
  const [targetId, setTargetId] = useState("");
  const [selectedDepth, setSelectedDepth] = useState<VisibilityLevel>(2); // デフォルト「会話」
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("input");

  const handleNext = () => {
    if (!targetId.trim()) return;
    setPhase("depth");
  };

  const handleSend = async () => {
    setPhase("confirming");
    await new Promise((r) => setTimeout(r, 300));
    setPhase("flying");
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/genome-connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: targetId.trim(), visibility: selectedDepth }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error || "送信に失敗しました"); setPhase("depth"); return; }
      await new Promise((r) => setTimeout(r, 600));
      setPhase("success"); onSent?.();
      setTimeout(() => { handleClose(); }, 2500);
    } catch { setError("ネットワークエラー"); setPhase("depth"); } finally { setSending(false); }
  };

  const handleClose = () => {
    if (phase === "flying") return;
    onClose(); setPhase("input"); setTargetId(""); setError(null); setSelectedDepth(2);
  };

  const depthOption = DEPTH_OPTIONS.find((d) => d.level === selectedDepth)!;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }} onClick={handleClose} />
          <motion.div className="relative w-full max-w-sm rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            style={{ background: C.s1, border: `1px solid ${C.s2}`, boxShadow: "0 25px 60px rgba(0,0,0,0.12)" }}>
            <FocusTrap onClose={handleClose} ariaLabel="カード交換リクエスト">
            <div className="p-6 space-y-5">

              {/* ── ヘッダーアイコン + テキスト ── */}
              <div className="text-center space-y-2">
                <motion.div
                  animate={
                    phase === "flying" ? { scale: [1, 0.8, 0.4, 0.1], y: [0, -20, -60, -100], rotateY: [0, 180, 360, 540], opacity: [1, 0.8, 0.4, 0] }
                    : phase === "success" ? { scale: [0, 1.2, 1], opacity: [0, 1, 1] } : {}
                  }
                  transition={{ duration: 0.8 }}
                  style={{ fontSize: 36 }}
                >
                  {phase === "success" ? "✓" : phase === "depth" ? depthOption.emoji : "✦"}
                </motion.div>
                {phase === "success" && <Particles />}
                <AnimatePresence mode="wait">
                  {phase === "input" && (
                    <motion.div key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>カード交換</h3>
                      <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>相手のユーザーIDを入力</p>
                    </motion.div>
                  )}
                  {phase === "depth" && (
                    <motion.div key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>どこまで見せる？</h3>
                      <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
                        あとからいつでも変更できます
                      </p>
                    </motion.div>
                  )}
                  {(phase === "confirming" || phase === "flying") && (
                    <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <p style={{ fontSize: 14, color: C.neural }}>「{depthOption.name}」で送信中...</p>
                    </motion.div>
                  )}
                  {phase === "success" && (
                    <motion.div key="s" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgb(16,185,129)" }}>リクエスト送信完了</h3>
                      <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
                        「{depthOption.name}」レベルでカードが届きます
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Step 1: ユーザーID入力 ── */}
              {phase === "input" && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <input type="text" placeholder="ユーザーID" value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && targetId.trim()) handleNext(); }}
                    aria-label="交換相手のユーザーID" aria-invalid={!!error}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ background: C.s2, border: `1px solid ${error ? "#ef444460" : C.s2}`, color: C.t1 }}
                  />
                  {error && <p style={{ fontSize: 11, color: "#ef4444" }}>{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleClose} className="flex-1 py-3 rounded-xl text-sm font-medium min-h-[44px]"
                      style={{ background: C.s2, color: C.t3 }}>キャンセル</button>
                    <button onClick={handleNext} disabled={!targetId.trim()}
                      className="flex-1 py-3 rounded-xl text-sm font-medium min-h-[44px]"
                      style={{
                        background: targetId.trim() ? `linear-gradient(135deg, ${C.neural}, ${C.pulse})` : C.s2,
                        color: targetId.trim() ? "white" : C.t4,
                      }}>次へ</button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: 関係の深さ選択 ── */}
              {phase === "depth" && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                  {DEPTH_OPTIONS.map((opt) => {
                    const isSelected = selectedDepth === opt.level;
                    return (
                      <button
                        key={opt.level}
                        onClick={() => setSelectedDepth(opt.level)}
                        className="w-full text-left rounded-xl p-4 transition-all"
                        style={{
                          background: isSelected ? `${C.neural}08` : C.s2,
                          border: isSelected ? `2px solid ${C.neural}40` : `2px solid transparent`,
                          boxShadow: isSelected ? `0 0 0 1px ${C.neural}15` : "none",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: 14, fontWeight: 600, color: isSelected ? C.t1 : C.t2 }}>
                                {opt.name}
                              </span>
                              <span style={{ fontSize: 9, color: C.t4, letterSpacing: "0.08em" }}>
                                Lv.{opt.level}
                              </span>
                            </div>
                            <p style={{ fontSize: 11, color: isSelected ? C.t2 : C.t3, marginTop: 2 }}>
                              {opt.description}
                            </p>
                            <p style={{ fontSize: 9, color: C.t4, marginTop: 2 }}>
                              {opt.detail}
                            </p>
                          </div>
                          {isSelected && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})` }}>
                              <span style={{ fontSize: 10, color: "white" }}>✓</span>
                            </motion.div>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {error && <p style={{ fontSize: 11, color: "#ef4444" }}>{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setPhase("input")}
                      className="flex-1 py-3 rounded-xl text-sm font-medium min-h-[44px]"
                      style={{ background: C.s2, color: C.t3 }}>戻る</button>
                    <button onClick={handleSend} disabled={sending}
                      className="flex-1 py-3 rounded-xl text-sm font-medium min-h-[44px]"
                      style={{
                        background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
                        color: "white", opacity: sending ? 0.5 : 1,
                      }}>
                      「{depthOption.name}」で送る
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
            </FocusTrap>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
