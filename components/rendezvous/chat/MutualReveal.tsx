"use client";

/**
 * MutualReveal
 * Phase 2 顔写真の相互同時公開 — Rendezvous のクライマックス体験
 *
 * 5 states:
 *   idle             — チャットツールバーに「顔写真を交換する」ボタン
 *   requesting       — リクエスト送信済み、相手の同意待ち
 *   partner_requested — 相手がリクエスト済み、こちらが承認するか選択
 *   countdown        — 両者合意、3-2-1 カウントダウン
 *   revealed         — 写真公開 + お祝いアニメーション
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RvCard, RvButton, RV_COLORS } from "@/components/ui/rendezvous-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RevealState =
  | "idle"
  | "requesting"
  | "partner_requested"
  | "countdown"
  | "revealed";

export interface MutualRevealProps {
  candidateId: string;
  myPhotoUrl: string;
  partnerPhotoUrl: string;
  partnerName: string;
  initialState: "idle" | "requesting" | "partner_requested" | "revealed";
  onRevealComplete: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Sparkle particle for celebration
// ---------------------------------------------------------------------------

function Sparkle({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, x: `${x}vw`, y: `${y}vh` }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0, 1, 1.2, 0],
        y: [`${y}vh`, `${y - 15}vh`],
      }}
      transition={{
        duration: 2.4,
        delay,
        ease: "easeOut",
        repeat: Infinity,
        repeatDelay: Math.random() * 2,
      }}
      style={{
        position: "absolute",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${RV_COLORS.accent} 0%, ${RV_COLORS.primary} 100%)`,
        boxShadow: `0 0 8px ${RV_COLORS.primaryGlow}`,
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Countdown digit
// ---------------------------------------------------------------------------

function CountdownDigit({ digit }: { digit: number }) {
  return (
    <motion.div
      key={digit}
      initial={{ scale: 0.3, opacity: 0, filter: "blur(12px)" }}
      animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
      exit={{ scale: 2.5, opacity: 0, filter: "blur(8px)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{
        fontSize: 120,
        fontWeight: 900,
        background: RV_COLORS.gradient,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        textShadow: "none",
        lineHeight: 1,
      }}
    >
      {digit}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Photo reveal card with blur-to-clear animation
// ---------------------------------------------------------------------------

function RevealPhoto({
  url,
  label,
  delay = 0,
}: {
  url: string;
  label: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ filter: "blur(40px) saturate(0)", opacity: 0 }}
      animate={{ filter: "blur(0px) saturate(1)", opacity: 1 }}
      transition={{ duration: 2, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: 24,
          overflow: "hidden",
          border: `3px solid rgba(255,255,255,0.6)`,
          boxShadow: `0 8px 32px ${RV_COLORS.shadowDeep}, 0 0 24px ${RV_COLORS.primaryGlow}`,
        }}
      >
        <motion.img
          src={url}
          alt={label}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.5, delay, ease: "easeOut" }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
      <motion.span
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: delay + 1.2 }}
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: 1,
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MutualReveal({
  candidateId,
  myPhotoUrl,
  partnerPhotoUrl,
  partnerName,
  initialState,
  onRevealComplete,
  onClose,
}: MutualRevealProps) {
  const [state, setState] = useState<RevealState>(initialState);
  const [countdown, setCountdown] = useState(3);
  const [pollTimer, setPollTimer] = useState<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // -----------------------------------------------------------------------
  // API: request reveal
  // -----------------------------------------------------------------------
  const requestReveal = useCallback(async () => {
    setState("requesting");
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_reveal" }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.status === "revealed") {
        setState("countdown");
      }
      // else stays in requesting, start polling
    } catch {
      // on error, revert to idle
      setState("idle");
    }
  }, [candidateId]);

  // -----------------------------------------------------------------------
  // API: accept reveal (partner requested first)
  // -----------------------------------------------------------------------
  const acceptReveal = useCallback(async () => {
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_reveal" }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.status === "revealed") {
        setState("countdown");
      }
    } catch {
      // ignore
    }
  }, [candidateId]);

  // -----------------------------------------------------------------------
  // API: cancel reveal request
  // -----------------------------------------------------------------------
  const cancelReveal = useCallback(async () => {
    try {
      await fetch(`/api/rendezvous/${candidateId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_reveal" }),
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setState("idle");
  }, [candidateId]);

  // -----------------------------------------------------------------------
  // Polling: check if partner accepted (when in requesting state)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (state !== "requesting") {
      if (pollTimer) clearInterval(pollTimer);
      return;
    }

    const timer = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(
          `/api/rendezvous/${candidateId}/photos?check=1`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (data.status === "revealed" || data.status === "both_ready") {
          setState("countdown");
        }
      } catch {
        // ignore
      }
    }, 3000);

    setPollTimer(timer);
    return () => clearInterval(timer);
  }, [state, candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Countdown timer
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (state !== "countdown") return;
    setCountdown(3);

    const t1 = setTimeout(() => mountedRef.current && setCountdown(2), 1000);
    const t2 = setTimeout(() => mountedRef.current && setCountdown(1), 2000);
    const t3 = setTimeout(() => {
      if (mountedRef.current) {
        setState("revealed");
        onRevealComplete();
      }
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [state, onRevealComplete]);

  // -----------------------------------------------------------------------
  // Sparkle positions for celebration
  // -----------------------------------------------------------------------
  const sparkles = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 90 + 5,
      y: Math.random() * 70 + 15,
      delay: Math.random() * 1.5,
    })),
  );

  // -----------------------------------------------------------------------
  // Render: idle state — compact button in chat area
  // -----------------------------------------------------------------------
  if (state === "idle") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "16px 0",
        }}
      >
        <RvButton variant="secondary" onClick={requestReveal}>
          <span style={{ fontSize: 16 }}>&#x1F4AB;</span>
          顔写真を交換する
        </RvButton>
        <span
          style={{
            fontSize: 11,
            color: RV_COLORS.textMuted,
            textAlign: "center",
          }}
        >
          相手も同意した場合のみ、同時に公開されます
        </span>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: requesting — waiting for partner
  // -----------------------------------------------------------------------
  if (state === "requesting") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "20px 0",
        }}
      >
        <RvCard className="w-full">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "8px 0",
            }}
          >
            {/* Pulsing indicator */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: RV_COLORS.gradientSubtle,
                border: `2px solid ${RV_COLORS.primaryLight}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              &#x2728;
            </motion.div>

            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: RV_COLORS.text,
                  marginBottom: 4,
                }}
              >
                リクエスト送信済み
              </p>
              <p style={{ fontSize: 12, color: RV_COLORS.textMuted }}>
                相手が同意するまでお待ちください...
              </p>
            </div>

            <RvButton variant="ghost" onClick={cancelReveal}>
              キャンセル
            </RvButton>
          </div>
        </RvCard>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: partner_requested — accept/decline banner
  // -----------------------------------------------------------------------
  if (state === "partner_requested") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ padding: "12px 0" }}
      >
        <motion.div
          animate={{
            boxShadow: [
              `0 0 0px ${RV_COLORS.primaryGlow}`,
              `0 0 20px ${RV_COLORS.primaryGlow}`,
              `0 0 0px ${RV_COLORS.primaryGlow}`,
            ],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            padding: "20px",
            borderRadius: 20,
            background: RV_COLORS.surface,
            border: `2px solid ${RV_COLORS.primaryLight}30`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ fontSize: 28 }}
            >
              &#x1F4AB;
            </motion.div>

            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: RV_COLORS.text,
                textAlign: "center",
              }}
            >
              相手が顔写真の交換をリクエストしています
            </p>

            <div
              style={{
                display: "flex",
                gap: 12,
                width: "100%",
              }}
            >
              <RvButton
                variant="glow"
                className="flex-1"
                onClick={acceptReveal}
              >
                &#x1F4AB; 交換する
              </RvButton>
              <RvButton
                variant="ghost"
                className="flex-1"
                onClick={() => setState("idle")}
              >
                今はまだ
              </RvButton>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Full-screen overlay for countdown & revealed
  // -----------------------------------------------------------------------
  return (
    <AnimatePresence mode="wait">
      {/* Backdrop */}
      <motion.div
        key="mutual-reveal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse at center, rgba(26,16,37,0.92) 0%, rgba(10,6,20,0.98) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Ambient glow orbs */}
        <motion.div
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: "10%",
            left: "20%",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${RV_COLORS.primaryGlow} 0%, transparent 70%)`,
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />
        <motion.div
          animate={{
            opacity: [0.2, 0.5, 0.2],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
          style={{
            position: "absolute",
            bottom: "15%",
            right: "15%",
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${RV_COLORS.accentGlow} 0%, transparent 70%)`,
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        {/* Countdown state */}
        {state === "countdown" && (
          <AnimatePresence mode="wait">
            <CountdownDigit key={countdown} digit={countdown} />
          </AnimatePresence>
        )}

        {/* Revealed state */}
        {state === "revealed" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 32,
              width: "100%",
              maxWidth: 400,
              padding: "0 24px",
            }}
          >
            {/* Photos side by side */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 24,
                width: "100%",
              }}
            >
              <RevealPhoto
                url={partnerPhotoUrl}
                label={partnerName}
                delay={0}
              />
              <RevealPhoto url={myPhotoUrl} label="あなた" delay={0.3} />
            </div>

            {/* Greeting */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.8 }}
              style={{
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  background: RV_COLORS.gradient,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  marginBottom: 8,
                  letterSpacing: 2,
                }}
              >
                はじめまして
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: 1,
                }}
              >
                お互いの顔が見えるようになりました
              </p>
            </motion.div>

            {/* Continue button */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 2.8 }}
            >
              <RvButton variant="primary" onClick={onClose}>
                会話を続ける
              </RvButton>
            </motion.div>

            {/* Sparkle particles */}
            {sparkles.current.map((s) => (
              <Sparkle key={s.id} delay={s.delay} x={s.x} y={s.y} />
            ))}
          </motion.div>
        )}

        {/* Close button (top-right) — only during countdown */}
        {state === "countdown" && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            whileHover={{ opacity: 1 }}
            onClick={onClose}
            style={{
              position: "absolute",
              top: "max(16px, env(safe-area-inset-top))",
              right: 16,
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.6)",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            x
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
