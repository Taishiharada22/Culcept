"use client";

/**
 * MemoryCrystalList — 記憶の結晶ギャラリー
 * チャットメッセージから結晶を検出し、グリッド表示する
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { detectCrystals, type MemoryCrystal, type ChatMessage } from "@/lib/rendezvous/memoryCrystals";
import MemoryCrystalCard from "@/components/rendezvous/MemoryCrystalCard";

type Props = {
  candidateId: string;
  onClose?: () => void;
};

export default function MemoryCrystalList({ candidateId, onClose }: Props) {
  const [crystals, setCrystals] = useState<MemoryCrystal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAndDetect = useCallback(async () => {
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/chat`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const messages: ChatMessage[] = (data.messages ?? []).map(
        (m: { id: string; sender_id: string; body?: string; content?: string; created_at: string }) => ({
          id: m.id,
          sender_id: m.sender_id,
          content: m.body ?? m.content ?? "",
          created_at: m.created_at,
        }),
      );
      const detected = detectCrystals(messages);
      setCrystals(detected);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchAndDetect();
  }, [fetchAndDetect]);

  // Show nothing if no crystals and not loading
  if (!loading && crystals.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
          }}
        />

        {/* Content panel — slides up from bottom */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          style={{
            position: "relative",
            marginTop: "auto",
            maxHeight: "70vh",
            borderRadius: "20px 20px 0 0",
            background: "rgba(20,18,40,0.92)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            padding: "20px 20px 32px",
            overflowY: "auto",
          }}
        >
          {/* Handle bar */}
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.2)",
              margin: "0 auto 16px",
            }}
          />

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.9)",
                  margin: 0,
                }}
              >
                記憶の結晶
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(99,102,241,0.2)",
                  color: "#a78bfa",
                  padding: "2px 8px",
                  borderRadius: 8,
                }}
              >
                💎 {crystals.length}
              </span>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div
              style={{
                textAlign: "center",
                padding: "32px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
              }}
            >
              結晶を探しています...
            </div>
          )}

          {/* Crystal grid */}
          {!loading && crystals.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 10,
              }}
            >
              {crystals.map((crystal, i) => (
                <motion.div
                  key={crystal.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                >
                  <MemoryCrystalCard crystal={crystal} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
