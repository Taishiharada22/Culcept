"use client";

/**
 * TribePoolIndicator
 * Tribe内でRendezvous参加中のメンバー数を表示するバッジ
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

type Props = {
  tribeId: string;
};

export default function TribePoolIndicator({ tribeId }: Props) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/rendezvous/tribe-pool?tribeId=${encodeURIComponent(tribeId)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setCount(res.count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tribeId]);

  if (loading || count === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        borderRadius: 20,
        background: "rgba(99,102,241,0.06)",
        border: "1px solid rgba(99,102,241,0.1)",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#6366F1",
          animation: "pulse 2s infinite",
        }}
      />
      <span style={{ fontSize: 10, fontWeight: 600, color: "#6366F1" }}>
        {count}人がRendezvous中
      </span>
    </motion.div>
  );
}
