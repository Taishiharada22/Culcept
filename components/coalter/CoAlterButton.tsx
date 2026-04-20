"use client";

/**
 * CoAlter 起動ボタン
 *
 * 状態に応じて表示を切り替え:
 * - inactive: 「CoAlterを使ってみる」（初回有効化）
 * - pending_consent: 「承認待ち...」
 * - enabled: 「CoAlter」（起動可能）
 * - active/loading: スピナー
 * - disabled: 非表示
 */

import { motion, AnimatePresence } from "framer-motion";
import type { CoAlterPairState, CoAlterSessionState } from "@/lib/coalter/types";
import AneurasyncLogo from "@/components/ui/AneurasyncLogo";

const C = {
  neural: "#8B5CF6",
  pulse: "#EC4899",
  s2: "#f5f6fa",
  t3: "#8888a0",
  t4: "#c8c8dc",
  coalter: "#6366F1", // CoAlter固有色（Indigoベース — Alter紫と近いが区別可能）
};

interface Props {
  pairState: CoAlterPairState;
  sessionState: CoAlterSessionState | null;
  loading: boolean;
  error: string | null;
  onActivate: () => void;
  onInvoke: () => void;
}

export default function CoAlterButton({
  pairState,
  sessionState,
  loading,
  error,
  onActivate,
  onInvoke,
}: Props) {
  // disabled → 再有効化ボタン（常に画面に待機）
  if (pairState === "disabled") {
    return (
      <motion.button
        onClick={onActivate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
        style={{
          background: `${C.coalter}06`,
          border: `1px solid ${C.coalter}15`,
        }}
        whileTap={{ scale: 0.95 }}
      >
        <AneurasyncLogo size={16} color={C.t3} animate={false} />
        <span style={{ fontSize: 11, color: C.t3, fontWeight: 500 }}>
          CoAlterを使ってみる
        </span>
      </motion.button>
    );
  }

  // エラー時 → リトライ可能なボタン
  if (error) {
    return (
      <motion.button
        onClick={onInvoke}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
        style={{
          background: "#FEE2E2",
          border: "1px solid #FECACA",
        }}
        whileTap={{ scale: 0.95 }}
      >
        <span style={{ fontSize: 11, color: "#DC2626" }}>もう一度試す</span>
      </motion.button>
    );
  }

  // active / loading → スピナー
  if (sessionState === "active" || loading) {
    return (
      <motion.div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
        style={{ background: `${C.coalter}15` }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <AneurasyncLogo size={16} color={C.coalter} animate />
        <span style={{ fontSize: 11, color: C.coalter, fontWeight: 500 }}>
          考え中...
        </span>
      </motion.div>
    );
  }

  // pending_consent → activate が即 enabled にするので、ここに来たら activate を再呼び出し
  if (pairState === "pending_consent") {
    return (
      <motion.button
        onClick={onActivate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
        style={{
          background: `${C.coalter}08`,
          border: `1px solid ${C.coalter}20`,
        }}
        whileTap={{ scale: 0.95 }}
      >
        <AneurasyncLogo size={16} color={C.coalter} />
        <span style={{ fontSize: 11, color: C.coalter, fontWeight: 500 }}>
          CoAlterを有効にする
        </span>
      </motion.button>
    );
  }

  // inactive → 初回有効化ボタン
  if (pairState === "inactive") {
    return (
      <motion.button
        onClick={onActivate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
        style={{
          background: `${C.coalter}08`,
          border: `1px solid ${C.coalter}20`,
        }}
        whileTap={{ scale: 0.95 }}
      >
        <AneurasyncLogo size={16} color={C.coalter} />
        <span style={{ fontSize: 11, color: C.coalter, fontWeight: 500 }}>
          CoAlterを使ってみる
        </span>
      </motion.button>
    );
  }

  // enabled → 起動ボタン
  return (
    <motion.button
      onClick={onInvoke}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
      style={{
        background: `linear-gradient(135deg, ${C.coalter}18, ${C.pulse}12)`,
        border: `1px solid ${C.coalter}25`,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.95 }}
    >
      <AneurasyncLogo size={16} color={C.coalter} />
      <span style={{ fontSize: 11, color: C.coalter, fontWeight: 600 }}>
        CoAlter
      </span>
    </motion.button>
  );
}
