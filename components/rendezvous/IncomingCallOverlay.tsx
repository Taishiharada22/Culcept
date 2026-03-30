"use client";

/**
 * IncomingCallOverlay
 * チャット中に着信表示するオーバーレイ
 * Supabase Realtime broadcast で call-request をリッスン
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  candidateId: string;
  myUserId: string;
  counterpartName: string;
};

export default function IncomingCallOverlay({
  candidateId,
  myUserId,
  counterpartName,
}: Props) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [incoming, setIncoming] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel(`video:${candidateId}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "signal" }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (
          payload?.type === "call-request" &&
          payload?.senderId !== myUserId
        ) {
          setIncoming(true);
          // Auto-dismiss after 30s
          setTimeout(() => setIncoming(false), 30000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [candidateId, myUserId, supabase]);

  const handleAccept = () => {
    setIncoming(false);
    router.push(`/rendezvous/${candidateId}/video`);
  };

  const handleReject = () => {
    // Send rejection signal
    supabase
      .channel(`video:${candidateId}`)
      .send({
        type: "broadcast",
        event: "signal",
        payload: { type: "call-rejected", senderId: myUserId },
      })
      .catch(() => {});
    setIncoming(false);
  };

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ type: "spring", damping: 20 }}
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 50,
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(16px)",
            borderRadius: 16,
            padding: "16px 20px",
            boxShadow: "0 8px 32px rgba(30,30,60,0.15)",
            border: "1px solid rgba(99,102,241,0.1)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Pulsing icon */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              animation: "vc-incoming-pulse 1.5s ease-in-out infinite",
            }}
          >
            <span style={{ fontSize: 22 }}>📞</span>
          </div>

          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#1E1E3C",
                margin: 0,
              }}
            >
              {counterpartName}
            </p>
            <p
              style={{
                fontSize: 11,
                color: "rgba(30,30,60,0.4)",
                margin: "2px 0 0",
              }}
            >
              ビデオ通話の着信...
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleReject}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                background: "#EF4444",
                color: "#fff",
                fontSize: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
            <button
              onClick={handleAccept}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                background: "#22C55E",
                color: "#fff",
                fontSize: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✓
            </button>
          </div>

          <style>{`
            @keyframes vc-incoming-pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.08); }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
