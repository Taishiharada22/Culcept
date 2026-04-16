"use client";

/**
 * CoAlter 同意カード
 *
 * 相手がCoAlterの有効化をリクエストした時に表示。
 * チャット内のシステムメッセージとして挿入される。
 */

import { motion } from "framer-motion";
import AneurasyncLogo from "@/components/ui/AneurasyncLogo";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
};

interface Props {
  /** リクエストを送った相手の表示名 */
  requesterName: string;
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
}

export default function CoAlterConsent({
  requesterName,
  onAccept,
  onDecline,
  loading,
}: Props) {
  return (
    <motion.div
      className="mx-auto max-w-sm rounded-2xl overflow-hidden"
      style={{
        background: C.s1,
        border: `1px solid ${C.coalter}20`,
        boxShadow: `0 2px 12px ${C.coalter}08`,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* ヘッダー */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{
          background: `linear-gradient(135deg, ${C.coalter}08, ${C.pulse}06)`,
          borderBottom: `1px solid ${C.coalter}10`,
        }}
      >
        <AneurasyncLogo size={18} color={C.coalter} />
        <span
          style={{ fontSize: 12, color: C.coalter, fontWeight: 600 }}
        >
          CoAlter
        </span>
      </div>

      {/* 本文 */}
      <div className="px-4 py-3">
        <p style={{ fontSize: 13, color: C.t1, lineHeight: 1.6 }}>
          <strong>{requesterName}</strong> さんが CoAlter を使いたいみたい。
        </p>
        <p
          style={{
            fontSize: 11,
            color: C.t3,
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          CoAlter は二人の共同意思決定を手伝う存在です。映画や食事、予定を一緒に決める時に候補を出してくれます。いつでもオフにできます。
        </p>
      </div>

      {/* ボタン */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={onDecline}
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-sm transition-all min-h-[40px]"
          style={{ background: C.s2, color: C.t3 }}
        >
          今はいいや
        </button>
        <button
          onClick={onAccept}
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-sm transition-all min-h-[40px]"
          style={{
            background: `linear-gradient(135deg, ${C.coalter}, ${C.pulse})`,
            color: "white",
            fontWeight: 500,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "使ってみる"}
        </button>
      </div>
    </motion.div>
  );
}
