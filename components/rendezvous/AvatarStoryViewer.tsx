"use client";

// components/rendezvous/AvatarStoryViewer.tsx
// Morning touchpoint: Instagram Stories-style avatar conversation viewer

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlassBadge } from "@/components/ui/glassmorphism-design";
import {
  AvatarStory,
  ReactionEmoji,
  REACTION_EMOJIS,
  CATEGORY_LABELS,
  CATEGORY_BG_COLORS,
  CATEGORY_TEXT_COLORS,
} from "./AvatarStoryTypes";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({
  total,
  current,
  progress,
}: {
  total: number;
  current: number;
  progress: number;
}) {
  return (
    <div className="flex gap-1 px-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden"
        >
          <motion.div
            className="h-full bg-white rounded-full"
            initial={false}
            animate={{
              width:
                i < current
                  ? "100%"
                  : i === current
                  ? `${progress}%`
                  : "0%",
            }}
            transition={{ ease: "linear", duration: 0.3 }}
          />
        </div>
      ))}
    </div>
  );
}

function RvReactionBar({
  onReact,
  selectedReaction,
}: {
  onReact: (emoji: ReactionEmoji) => void;
  selectedReaction: ReactionEmoji | null;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      {REACTION_EMOJIS.map((emoji) => (
        <motion.button
          key={emoji}
          onClick={() => onReact(emoji)}
          className={`text-2xl p-2 rounded-full transition-colors ${
            selectedReaction === emoji
              ? "bg-white/30 scale-110"
              : "bg-white/10 hover:bg-white/20"
          }`}
          whileTap={{ scale: 1.4 }}
          animate={
            selectedReaction === emoji ? { scale: [1, 1.3, 1.1] } : { scale: 1 }
          }
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
}

function StorySlide({ story }: { story: AvatarStory }) {
  return (
    <motion.div
      className="flex flex-col h-full justify-between py-6 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Candidate info */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center overflow-hidden ring-2 ring-white/40">
          {story.candidatePhoto ? (
            <img
              src={story.candidatePhoto}
              alt={story.candidateName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-lg font-bold">
              {story.candidateName.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-base truncate">
            {story.candidateName}
          </p>
          <p className="text-white/70 text-sm truncate">{story.corePhrase}</p>
        </div>
        <GlassBadge
          size="sm"
          className={`${CATEGORY_BG_COLORS[story.category]} ${CATEGORY_TEXT_COLORS[story.category]} border`}
        >
          {CATEGORY_LABELS[story.category]}
        </GlassBadge>
      </div>

      {/* Conversation highlight bubbles */}
      <div className="flex-1 flex flex-col justify-center gap-3 max-w-sm mx-auto w-full">
        {story.conversationHighlight.map((bubble, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.2, duration: 0.4 }}
            className={`flex ${
              bubble.sender === "my_avatar" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                bubble.sender === "my_avatar"
                  ? "bg-indigo-500/80 text-white rounded-br-md"
                  : "bg-white/20 text-white rounded-bl-md"
              }`}
            >
              {bubble.text}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Avatar summary */}
      <motion.p
        className="text-white/80 text-sm text-center mt-4 italic"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        {story.summary}
      </motion.p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AvatarStoryViewerProps {
  stories: AvatarStory[];
  onClose: () => void;
  onReact?: (storyId: string, emoji: ReactionEmoji) => void;
  onSwipeUp?: (storyId: string) => void;
}

const STORY_DURATION = 15_000; // 15 seconds per story

export default function AvatarStoryViewer({
  stories,
  onClose,
  onReact,
  onSwipeUp,
}: AvatarStoryViewerProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reactions, setReactions] = useState<Record<string, ReactionEmoji>>({});
  const [dragY, setDragY] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  const currentStory = stories[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
      startTimeRef.current = Date.now();
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
      startTimeRef.current = Date.now();
    }
  }, [currentIndex]);

  // Auto-advance timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        goNext();
      }
    }, 50);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, goNext]);

  const handleTap = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width / 2) {
      goNext();
    } else {
      goPrev();
    }
  };

  const handleReaction = (emoji: ReactionEmoji) => {
    if (!currentStory) return;
    setReactions((prev) => ({ ...prev, [currentStory.id]: emoji }));
    onReact?.(currentStory.id, emoji);
  };

  const handleDragEnd = (_: unknown, info: { offset: { y: number } }) => {
    setDragY(0);
    if (info.offset.y < -100 && currentStory) {
      onSwipeUp?.(currentStory.id);
      router.push(`/rendezvous/conversation/${currentStory.id}`);
    }
  };

  if (!currentStory) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-slate-900"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Background gradient per category */}
      <div
        className={`absolute inset-0 bg-gradient-to-b opacity-40 ${
          currentStory.category === "romantic"
            ? "from-pink-600 to-purple-900"
            : currentStory.category === "friendship"
            ? "from-sky-600 to-blue-900"
            : currentStory.category === "cocreation"
            ? "from-amber-600 to-orange-900"
            : "from-emerald-600 to-teal-900"
        }`}
      />

      {/* Content wrapper */}
      <motion.div
        className="relative h-full flex flex-col"
        drag="y"
        dragConstraints={{ top: -60, bottom: 0 }}
        dragElastic={0.2}
        onDrag={(_, info) => setDragY(info.offset.y)}
        onDragEnd={handleDragEnd}
        style={{ y: dragY }}
      >
        {/* Progress bar */}
        <div className="pt-3 pb-2 relative z-20">
          <ProgressBar
            total={stories.length}
            current={currentIndex}
            progress={progress}
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Tap zones + story content */}
        <div className="flex-1 relative" onClick={handleTap}>
          <AnimatePresence mode="wait">
            <StorySlide key={currentStory.id} story={currentStory} />
          </AnimatePresence>
        </div>

        {/* Reaction bar */}
        <div className="pb-8 pt-3 relative z-20">
          <RvReactionBar
            onReact={handleReaction}
            selectedReaction={reactions[currentStory.id] ?? null}
          />
          {/* Swipe-up hint */}
          <motion.p
            className="text-white/40 text-xs text-center mt-3"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            \u2191 \u30B9\u30EF\u30A4\u30D7\u3067\u4F1A\u8A71\u30ED\u30B0\u3078
          </motion.p>
        </div>
      </motion.div>
    </motion.div>
  );
}
