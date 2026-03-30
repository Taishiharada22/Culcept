"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import CompareRadar from "./CompareRadar";
import FocusTrap from "./FocusTrap";

const C = { s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

type RadarData = { analytical: number; cautious: number; social: number; expressive: number; independent: number };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  counterpart: {
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  myRadar: RadarData | null;
  theirRadar: RadarData | null;
  threadId: string | null;
  theirArchetype: string | null;
}

export default function ConnectionEstablishedModal({
  isOpen, onClose, counterpart, myRadar, theirRadar, threadId, theirArchetype,
}: Props) {
  const canCompare = myRadar && theirRadar;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)" }} onClick={onClose} />
          <motion.div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            style={{ background: C.s1, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>

            <FocusTrap onClose={onClose} ariaLabel="カード交換成立">
            <div className="p-6 space-y-5">
              {/* ヘッダー: 成立祝い */}
              <motion.div className="text-center"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <motion.div
                  className="mx-auto mb-3 flex items-center justify-center"
                  style={{ width: 56, height: 56, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)` }}
                  initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }}
                  transition={{ delay: 0.2, duration: 0.5 }}>
                  <span style={{ fontSize: 28 }}>∞</span>
                </motion.div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>つながりました</h3>
                <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
                  {counterpart.displayName ?? "ユーザー"} とカードを交換しました
                </p>
              </motion.div>

              {/* 相手の情報 */}
              <motion.div className="flex items-center gap-3 rounded-xl p-3"
                style={{ background: C.s2 }}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                {counterpart.avatarUrl ? (
                  <img src={counterpart.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)`, fontSize: 14, color: C.t2 }}>
                    {counterpart.displayName?.[0] ?? "?"}
                  </div>
                )}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>
                    {counterpart.displayName ?? "ユーザー"}
                  </p>
                  {theirArchetype && (
                    <p style={{ fontSize: 10, color: C.neural }}>{theirArchetype}</p>
                  )}
                </div>
              </motion.div>

              {/* CompareRadar */}
              {canCompare && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <p style={{ fontSize: 10, fontWeight: 500, color: C.t3, textAlign: "center", marginBottom: 4, letterSpacing: "0.08em" }}>
                    ふたりの比較
                  </p>
                  <CompareRadar mine={myRadar} theirs={theirRadar}
                    theirName={counterpart.displayName ?? undefined} />
                </motion.div>
              )}

              {/* できること案内 */}
              <motion.div className="space-y-2"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.08em", textAlign: "center" }}>
                  これからできること
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/genome-card/${counterpart.userId}`} onClick={onClose}
                    className="rounded-xl p-3 text-center"
                    style={{ background: `${C.neural}08`, border: `1px solid ${C.neural}15` }}>
                    <span style={{ fontSize: 20 }}>🧬</span>
                    <p style={{ fontSize: 10, fontWeight: 500, color: C.neural, marginTop: 4 }}>カードを見る</p>
                  </Link>
                  {threadId ? (
                    <Link href={`/talk/${threadId}`} onClick={onClose}
                      className="rounded-xl p-3 text-center"
                      style={{ background: `${C.pulse}08`, border: `1px solid ${C.pulse}15` }}>
                      <span style={{ fontSize: 20 }}>💬</span>
                      <p style={{ fontSize: 10, fontWeight: 500, color: C.pulse, marginTop: 4 }}>トークする</p>
                    </Link>
                  ) : (
                    <div className="rounded-xl p-3 text-center"
                      style={{ background: C.s2, border: `1px solid ${C.t4}20` }}>
                      <span style={{ fontSize: 20 }}>🔓</span>
                      <p style={{ fontSize: 10, fontWeight: 500, color: C.t3, marginTop: 4 }}>公開レベル調整</p>
                    </div>
                  )}
                </div>
              </motion.div>

              <button onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                OK
              </button>
            </div>
            </FocusTrap>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
