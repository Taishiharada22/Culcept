"use client";

// components/rendezvous/LiveConversationView.tsx
// Afternoon touchpoint: Real-time avatar conversation viewer

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  LiveConversation,
  ConversationMessage,
  CandidateInfo,
  ReactionEmoji,
  REACTION_EMOJIS,
  CATEGORY_LABELS,
  CATEGORY_TEXT_COLORS,
} from "./AvatarStoryTypes";
import { useObservatory } from "@/lib/rendezvous/observatoryCollector";

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl rounded-bl-md w-fit">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-slate-400"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline reactions (compact)
// ---------------------------------------------------------------------------

function QuickReactionRow({
  onReact,
}: {
  onReact: (emoji: ReactionEmoji) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        +
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-6 left-0 flex gap-1 bg-white/90 backdrop-blur-lg border border-slate-200 rounded-full px-2 py-1 shadow-lg z-10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(emoji);
                  setOpen(false);
                }}
                className="text-sm hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live message bubble
// ---------------------------------------------------------------------------

function LiveBubble({
  msg,
  onReact,
}: {
  msg: ConversationMessage;
  onReact: (emoji: ReactionEmoji) => void;
}) {
  if (msg.sender === "system_insight") {
    return (
      <motion.div
        className="mx-auto max-w-[90%] px-4 py-2 rounded-2xl bg-indigo-50 border border-indigo-100 my-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-indigo-700 text-sm italic">\uD83D\uDCA1 {msg.text}</p>
      </motion.div>
    );
  }

  const isMyAvatar = msg.sender === "my_avatar";

  return (
    <motion.div
      className={`flex ${isMyAvatar ? "justify-end" : "justify-start"} my-1`}
      initial={{ opacity: 0, x: isMyAvatar ? 30 : -30, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="flex flex-col gap-0.5">
        <div
          className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isMyAvatar
              ? "bg-indigo-500 text-white rounded-br-md"
              : "bg-white/80 border border-slate-200 text-slate-800 rounded-bl-md"
          }`}
        >
          {msg.text}
        </div>
        <div className={`flex items-center gap-2 ${isMyAvatar ? "justify-end pr-1" : "pl-1"}`}>
          <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
          <QuickReactionRow onReact={onReact} />
          {msg.reactions && msg.reactions.length > 0 && (
            <div className="flex gap-0.5">
              {msg.reactions.map((r, i) => (
                <span key={i} className="text-xs">{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LiveConversationViewProps {
  conversation: LiveConversation;
  candidateInfo: CandidateInfo;
  onReact?: (msgId: string, emoji: ReactionEmoji) => void;
  onBatonChange?: () => void;
}

export default function LiveConversationView({
  conversation,
  candidateInfo,
  onReact,
  onBatonChange,
}: LiveConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLive = conversation.state === "streaming";
  const { track } = useObservatory();

  // Track conversation view duration
  useEffect(() => {
    const startTime = Date.now();
    track("conversation_view_start", {
      candidateId: candidateInfo.id,
      messageCount: conversation.messages.length,
    });
    return () => {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      track("conversation_view_duration", {
        candidateId: candidateInfo.id,
        duration_seconds: durationSeconds,
      });
    };
  }, [candidateInfo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [conversation.messages.length, conversation.isTyping]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Header with LIVE badge */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* LIVE indicator */}
          {isLive && (
            <motion.div
              className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-full px-2.5 py-1"
              animate={{ borderColor: ["rgba(252,165,165,0.6)", "rgba(252,165,165,1)", "rgba(252,165,165,0.6)"] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <motion.div
                className="w-2 h-2 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-red-600 text-xs font-bold">LIVE</span>
            </motion.div>
          )}

          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-md">
            {candidateInfo.photo ? (
              <img
                src={candidateInfo.photo}
                alt={candidateInfo.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white font-bold text-sm">
                {candidateInfo.name.charAt(0)}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">
              {candidateInfo.name}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {candidateInfo.corePhrase}
            </p>
          </div>
        </div>
      </div>

      {/* Hint banner */}
      <FadeInView>
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-indigo-50/80 border border-indigo-100">
          <p className="text-xs text-indigo-600 text-center leading-relaxed">
            \u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u3067\u53CD\u5FDC\u3059\u308B\u3068\u3001\u30A2\u30D0\u30BF\u30FC\u306E\u6B21\u306E\u767A\u8A00\u306B\u5F71\u97FF\u3057\u307E\u3059
          </p>
        </div>
      </FadeInView>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {conversation.messages.map((msg) => (
          <LiveBubble
            key={msg.id}
            msg={msg}
            onReact={(emoji) => onReact?.(msg.id, emoji)}
          />
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {conversation.isTyping && (
            <motion.div
              className="flex items-end"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <TypingIndicator />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Baton change button */}
      <motion.div
        className="sticky bottom-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/50 px-4 py-4"
        animate={
          isLive
            ? { borderTopColor: ["rgba(226,232,240,0.5)", "rgba(129,140,248,0.5)", "rgba(226,232,240,0.5)"] }
            : {}
        }
        transition={{ duration: 3, repeat: Infinity }}
      >
        <GlassButton
          variant="primary"
          fullWidth
          size="lg"
          onClick={onBatonChange}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
        >
          \u2728 \u3053\u3053\u3067\u81EA\u5206\u304C\u5165\u308B\uFF01
        </GlassButton>
      </motion.div>
    </div>
  );
}
