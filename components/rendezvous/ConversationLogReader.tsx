"use client";

// components/rendezvous/ConversationLogReader.tsx
// Commute touchpoint: Interactive avatar conversation reader

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  ConversationLog,
  ConversationMessage,
  CandidateInfo,
  ReactionEmoji,
  REACTION_EMOJIS,
  CATEGORY_LABELS,
  CATEGORY_BG_COLORS,
  CATEGORY_TEXT_COLORS,
} from "./AvatarStoryTypes";

// ---------------------------------------------------------------------------
// Inline reaction popover
// ---------------------------------------------------------------------------

function InlineReactionRow({
  visible,
  onReact,
}: {
  visible: boolean;
  onReact: (emoji: ReactionEmoji) => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="flex gap-1 mt-1"
          initial={{ opacity: 0, scale: 0.8, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className="text-base p-1 rounded-full hover:bg-slate-100 active:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg,
  onReact,
}: {
  msg: ConversationMessage;
  onReact: (msgId: string, emoji: ReactionEmoji) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);

  if (msg.sender === "system_insight") {
    return (
      <motion.div
        className="mx-auto max-w-[90%] px-4 py-2.5 rounded-2xl bg-indigo-50 border border-indigo-100 my-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-indigo-700 text-sm italic leading-relaxed">
          \uD83D\uDCA1 {msg.text}
        </p>
      </motion.div>
    );
  }

  const isMyAvatar = msg.sender === "my_avatar";

  return (
    <motion.div
      className={`flex flex-col ${isMyAvatar ? "items-end" : "items-start"} my-1`}
      initial={{ opacity: 0, x: isMyAvatar ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button
        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed text-left ${
          isMyAvatar
            ? "bg-indigo-500 text-white rounded-br-md"
            : "bg-white/80 border border-slate-200 text-slate-800 rounded-bl-md"
        }`}
        onClick={() => setShowReactions((v) => !v)}
      >
        {msg.text}
      </button>

      {/* Existing reactions */}
      {msg.reactions && msg.reactions.length > 0 && (
        <div className={`flex gap-0.5 mt-0.5 ${isMyAvatar ? "mr-2" : "ml-2"}`}>
          {msg.reactions.map((r, i) => (
            <span key={i} className="text-xs">{r}</span>
          ))}
        </div>
      )}

      <InlineReactionRow
        visible={showReactions}
        onReact={(emoji) => {
          onReact(msg.id, emoji);
          setShowReactions(false);
        }}
      />

      <span
        className={`text-[10px] text-slate-400 mt-0.5 ${
          isMyAvatar ? "mr-2" : "ml-2"
        }`}
      >
        {msg.timestamp}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ConversationLogReaderProps {
  conversation: ConversationLog;
  candidateInfo: CandidateInfo;
  onWantToTalk?: () => void;
  onDelegateMore?: () => void;
  onArchive?: () => void;
  onReactToMessage?: (msgId: string, emoji: ReactionEmoji) => void;
}

export default function ConversationLogReader({
  conversation,
  candidateInfo,
  onWantToTalk,
  onDelegateMore,
  onArchive,
  onReactToMessage,
}: ConversationLogReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.messages.length]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <FadeInView>
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-md">
              {candidateInfo.photo ? (
                <img
                  src={candidateInfo.photo}
                  alt={candidateInfo.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white font-bold">
                  {candidateInfo.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">
                {candidateInfo.name}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {candidateInfo.corePhrase}
              </p>
            </div>
            <GlassBadge
              size="sm"
              className={`${CATEGORY_BG_COLORS[candidateInfo.category]} ${CATEGORY_TEXT_COLORS[candidateInfo.category]} border`}
            >
              {CATEGORY_LABELS[candidateInfo.category]}
            </GlassBadge>
          </div>
        </div>
      </FadeInView>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {conversation.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onReact={(msgId, emoji) => onReactToMessage?.(msgId, emoji)}
          />
        ))}
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/50 px-4 py-4 space-y-2">
        <GlassButton
          variant="gradient"
          fullWidth
          onClick={onWantToTalk}
          size="md"
        >
          \u2728 \u3053\u306E\u4EBA\u3068\u8A71\u3057\u3066\u307F\u305F\u3044
        </GlassButton>

        <div className="flex gap-2">
          <GlassButton
            variant="secondary"
            fullWidth
            onClick={onDelegateMore}
            size="sm"
          >
            \uD83E\uDD16 \u3082\u3046\u5C11\u3057\u30A2\u30D0\u30BF\u30FC\u306B\u4EFB\u305B\u308B
          </GlassButton>

          <GlassButton
            variant="ghost"
            onClick={onArchive}
            size="sm"
            className="text-slate-400 shrink-0"
          >
            \uD83D\uDD07 \u30A2\u30FC\u30AB\u30A4\u30D6
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
