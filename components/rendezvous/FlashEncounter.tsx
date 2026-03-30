"use client";

// components/rendezvous/FlashEncounter.tsx
// Lunch touchpoint: Time-limited flash encounter event

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import { FlashEvent, FlashParticipant } from "./AvatarStoryTypes";

// ---------------------------------------------------------------------------
// Countdown digits
// ---------------------------------------------------------------------------

function AnimatedDigit({ value }: { value: string }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="inline-block"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function FlashCountdown({ endsAt }: { endsAt: Date }) {
  const [remaining, setRemaining] = useState({ m: "00", s: "00" });

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, endsAt.getTime() - Date.now());
      const m = String(Math.floor(diff / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setRemaining({ m, s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <div className="flex items-center justify-center gap-1 text-5xl font-bold text-slate-900 tracking-tight font-mono">
      <AnimatedDigit value={remaining.m[0]} />
      <AnimatedDigit value={remaining.m[1]} />
      <motion.span
        className="text-orange-400"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        :
      </motion.span>
      <AnimatedDigit value={remaining.s[0]} />
      <AnimatedDigit value={remaining.s[1]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini candidate card
// ---------------------------------------------------------------------------

function MiniCandidateCard({ participant }: { participant: FlashParticipant }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <GlassCard padding="sm" className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center overflow-hidden shrink-0">
          {participant.photo ? (
            <img
              src={participant.photo}
              alt={participant.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-sm font-bold">
              {participant.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">
            {participant.name}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {participant.corePhrase}
          </p>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
            {participant.snippet}
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FlashEncounterProps {
  event: FlashEvent;
  onJoin?: () => void;
  onPass?: () => void;
  onSelectCandidate?: (participantId: string) => void;
}

export default function FlashEncounter({
  event,
  onJoin,
  onPass,
  onSelectCandidate,
}: FlashEncounterProps) {
  const [joined, setJoined] = useState(false);
  const [expired, setExpired] = useState(event.status === "expired");
  const [results, setResults] = useState<FlashParticipant[]>([]);

  // Check expiry
  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => {
      if (Date.now() >= event.endsAt.getTime()) {
        setExpired(true);
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [event.endsAt, expired]);

  // Simulate results arriving after joining
  useEffect(() => {
    if (!joined || expired) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    event.participantsPreview.forEach((p, i) => {
      timeouts.push(
        setTimeout(() => {
          setResults((prev) => [...prev, p]);
        }, 2000 + i * 3000)
      );
    });
    return () => timeouts.forEach(clearTimeout);
  }, [joined, expired, event.participantsPreview]);

  const handleJoin = useCallback(() => {
    setJoined(true);
    onJoin?.();
  }, [onJoin]);

  // Expired state
  if (expired) {
    return (
      <FadeInView>
        <GlassCard className="text-center" padding="lg">
          <p className="text-4xl mb-3">\u231B</p>
          <p className="text-slate-600 font-medium">
            \u30D5\u30E9\u30C3\u30B7\u30E5\u306F\u7D42\u4E86\u3057\u307E\u3057\u305F
          </p>
          <p className="text-sm text-slate-400 mt-2">
            \u6B21\u306E\u30D5\u30E9\u30C3\u30B7\u30E5\u306F\u660E\u65E5\u306E\u30E9\u30F3\u30C1\u30BF\u30A4\u30E0
          </p>
          <motion.div
            className="mt-4 w-12 h-1 bg-gradient-to-r from-orange-300 to-pink-300 rounded-full mx-auto"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </GlassCard>
      </FadeInView>
    );
  }

  return (
    <FadeInView>
      <GlassCard padding="lg" variant="gradient">
        {/* Header */}
        <div className="text-center mb-6">
          <motion.p
            className="text-3xl mb-2"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            \uD83D\uDD25
          </motion.p>
          <h2 className="text-xl font-bold text-slate-900">
            \u30E9\u30F3\u30C1\u30BF\u30A4\u30E0\u30FB\u30D5\u30E9\u30C3\u30B7\u30E5
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            \u4ECA\u30AA\u30F3\u30E9\u30A4\u30F3\u306E\u9AD8\u5171\u9CF4\u306A\u4EBA\u3068\u0033\u0030\u5206\u9650\u5B9A\u3067\u51FA\u4F1A\u3048\u308B
          </p>
        </div>

        {/* Countdown */}
        <div className="mb-6">
          <FlashCountdown endsAt={event.endsAt} />
          <p className="text-center text-xs text-slate-400 mt-2">
            \u6B8B\u308A\u6642\u9593
          </p>
        </div>

        {/* Action or results */}
        {!joined ? (
          <div className="flex gap-3">
            <GlassButton variant="gradient" fullWidth onClick={handleJoin}>
              \u53C2\u52A0\u3059\u308B
            </GlassButton>
            <GlassButton variant="ghost" onClick={onPass}>
              \u4ECA\u56DE\u306F\u30D1\u30B9
            </GlassButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-orange-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <p className="text-sm text-slate-600 font-medium">
                \u30DE\u30C3\u30C1\u7D50\u679C\u304C\u5C4A\u3044\u3066\u3044\u307E\u3059\u2026
              </p>
            </div>
            <AnimatePresence>
              {results.map((p) => (
                <div key={p.id} onClick={() => onSelectCandidate?.(p.id)}>
                  <MiniCandidateCard participant={p} />
                </div>
              ))}
            </AnimatePresence>
            {results.length === 0 && (
              <div className="flex justify-center py-6">
                <motion.div
                  className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </FadeInView>
  );
}
