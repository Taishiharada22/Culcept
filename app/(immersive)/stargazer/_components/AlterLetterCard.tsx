"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import { incrementReaction } from "@/lib/stargazer/engagementScore";
import type { AlterLetterTone } from "@/lib/stargazer/alterLetters";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AlterLetterData {
  id: string;
  userId: string;
  sessionCount: number;
  content: string;
  tone: AlterLetterTone;
  keyInsight: string;
  referencedObservations: string[];
  generatedAt: number;
  readAt: number | null;
}

interface AlterLetterCardProps {
  /** 手紙データ（外部から渡す場合） */
  letter?: AlterLetterData | null;
  /** 自動フェッチするか（letter が渡されない場合） */
  autoFetch?: boolean;
  /** 手紙を閉じたとき */
  onDismiss?: () => void;
  /** 「心に留める」を押したとき */
  onSave?: (letter: AlterLetterData) => void;
  /** 「共有する」を押したとき */
  onShare?: (letter: AlterLetterData) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TONE_CONFIG: Record<
  AlterLetterTone,
  {
    label: string;
    accent: string;
    envelopeGradient: string;
    paperTint: string;
    sealColor: string;
  }
> = {
  gentle: {
    label: "やさしい",
    accent: "text-amber-700",
    envelopeGradient: "from-amber-100 via-orange-50 to-amber-100",
    paperTint: "from-amber-50/40 to-orange-50/20",
    sealColor: "from-amber-400 to-orange-400",
  },
  philosophical: {
    label: "哲学的",
    accent: "text-indigo-700",
    envelopeGradient: "from-indigo-100 via-blue-50 to-indigo-100",
    paperTint: "from-indigo-50/40 to-blue-50/20",
    sealColor: "from-indigo-400 to-blue-500",
  },
  provocative: {
    label: "挑発的",
    accent: "text-rose-700",
    envelopeGradient: "from-rose-100 via-pink-50 to-rose-100",
    paperTint: "from-rose-50/40 to-pink-50/20",
    sealColor: "from-rose-400 to-pink-500",
  },
  playful: {
    label: "遊び心",
    accent: "text-emerald-700",
    envelopeGradient: "from-emerald-100 via-teal-50 to-emerald-100",
    paperTint: "from-emerald-50/40 to-teal-50/20",
    sealColor: "from-emerald-400 to-teal-400",
  },
};

const SAVED_LETTERS_KEY = "culcept_alter_saved_letters_v1";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Typewriter Effect
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useTypewriter(text: string, enabled: boolean, speed = 30) {
  const [displayText, setDisplayText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    setDisplayText("");
    setIsComplete(false);

    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
        setIsComplete(true);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, enabled, speed]);

  const skip = useCallback(() => {
    setDisplayText(text);
    setIsComplete(true);
  }, [text]);

  return { displayText, isComplete, skip };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Envelope Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function EnvelopeSeal({
  tone,
  onClick,
}: {
  tone: AlterLetterTone;
  onClick: () => void;
}) {
  const config = TONE_CONFIG[tone];

  return (
    <motion.div
      className="flex flex-col items-center gap-4 cursor-pointer"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Envelope body */}
      <div
        className={`
          relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden
          bg-gradient-to-br ${config.envelopeGradient}
          border border-white/60 shadow-lg shadow-black/8
          px-8 py-10
        `}
      >
        {/* Paper texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.4' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Envelope flap */}
        <div className="absolute top-0 left-0 right-0 h-16 overflow-hidden">
          <div
            className={`
              absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-32
              bg-gradient-to-b ${config.envelopeGradient}
              border-b border-white/40
              origin-top
            `}
            style={{
              clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
              opacity: 0.5,
            }}
          />
        </div>

        {/* Wax seal */}
        <div className="flex justify-center mt-2">
          <motion.div
            className={`
              w-16 h-16 rounded-full
              bg-gradient-to-br ${config.sealColor}
              shadow-lg shadow-black/15
              flex items-center justify-center
              border-2 border-white/30
            `}
            animate={{
              boxShadow: [
                "0 4px 12px rgba(0,0,0,0.15)",
                "0 6px 20px rgba(0,0,0,0.2)",
                "0 4px 12px rgba(0,0,0,0.15)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            {/* Alter eye icon */}
            <svg
              className="w-7 h-7 text-white/90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </motion.div>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4 font-medium">
          もうひとりの自分からの手紙
        </p>
        <p className="text-center text-xs text-slate-600 mt-1">
          タップして開封する
        </p>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Letter Content Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LETTER_REACTIONS = [
  { key: "resonated", label: "響いた", icon: "✦" },
  { key: "thought_provoking", label: "考えさせられた", icon: "◈" },
  { key: "off_target", label: "ピンとこない", icon: "―" },
] as const;

type LetterReaction = typeof LETTER_REACTIONS[number]["key"];

function LetterContent({
  letter,
  onDismiss,
  onSave,
  onShare,
}: {
  letter: AlterLetterData;
  onDismiss?: () => void;
  onSave?: (letter: AlterLetterData) => void;
  onShare?: (letter: AlterLetterData) => void;
}) {
  const config = TONE_CONFIG[letter.tone];
  const { displayText, isComplete, skip } = useTypewriter(
    letter.content,
    true,
    25,
  );
  const [saved, setSaved] = useState(false);
  const [reaction, setReaction] = useState<LetterReaction | null>(null);

  // 既読マークを送信
  useEffect(() => {
    if (letter.readAt) return;
    fetch("/api/stargazer/alter-letter", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letterId: letter.id }),
    }).catch(() => {
      // Non-fatal
    });
  }, [letter.id, letter.readAt]);

  const handleSave = () => {
    setSaved(true);
    // Save to localStorage
    try {
      const raw = localStorage.getItem(SAVED_LETTERS_KEY);
      const existing: string[] = raw ? JSON.parse(raw) : [];
      if (!existing.includes(letter.id)) {
        existing.push(letter.id);
        localStorage.setItem(SAVED_LETTERS_KEY, JSON.stringify(existing));
      }
    } catch {
      // Non-fatal
    }
    onSave?.(letter);
  };

  const handleShare = () => {
    // Try Web Share API
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({
          title: "もうひとりの自分からの手紙",
          text: letter.keyInsight,
        })
        .catch(() => {
          // User cancelled or share failed
        });
    }
    onShare?.(letter);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotateX: -10 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard variant="gradient" padding="none" hoverEffect={false}>
        {/* Paper texture background */}
        <div
          className={`
            relative p-6 sm:p-8
            bg-gradient-to-br ${config.paperTint}
          `}
        >
          {/* Subtle paper grain */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 3h1v1H1V3zm2-2h1v1H3V1z' fill='%23000000' fill-opacity='0.4'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Header */}
          <div className="relative flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div
                className={`
                  w-8 h-8 rounded-full
                  bg-gradient-to-br ${config.sealColor}
                  flex items-center justify-center
                `}
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  もうひとりの自分からの手紙
                </p>
                <p className="text-[11px] text-slate-500">
                  {letter.sessionCount}回の対話を経て
                </p>
              </div>
            </div>
            <GlassBadge size="sm" variant="default">
              <span className={`text-[11px] ${config.accent}`}>
                {config.label}
              </span>
            </GlassBadge>
          </div>

          {/* Letter body -- handwritten feel */}
          <div
            className="relative cursor-pointer"
            onClick={!isComplete ? skip : undefined}
          >
            <div
              className="text-sm sm:text-base leading-[1.9] text-slate-700 whitespace-pre-line"
              style={{
                fontFamily:
                  "'Cormorant Garamond', 'Noto Serif JP', 'Yu Mincho', serif",
                fontStyle: "italic",
                letterSpacing: "0.02em",
              }}
            >
              {displayText}
              {!isComplete && (
                <motion.span
                  className="inline-block w-0.5 h-4 bg-slate-400 ml-0.5 align-middle"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </div>

            {!isComplete && (
              <p className="text-[11px] text-slate-600 mt-2 text-right">
                タップでスキップ
              </p>
            )}
          </div>

          {/* Key insight highlight */}
          <AnimatePresence>
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.22 }}
                className="mt-5 px-4 py-3 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60"
              >
                <p className="text-[11px] font-semibold text-slate-500 mb-1">
                  核心の気づき
                </p>
                <p className="text-sm text-slate-800 font-medium leading-relaxed">
                  {letter.keyInsight}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reaction buttons — この手紙はどうだった？ */}
          <AnimatePresence>
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.22 }}
                className="relative mt-5"
              >
                {!reaction ? (
                  <div className="mb-4">
                    <p className="text-[11px] text-slate-500 mb-2 font-medium">
                      この手紙はどうだった？
                    </p>
                    <div className="flex items-center gap-2">
                      {LETTER_REACTIONS.map((r) => (
                        <button
                          key={r.key}
                          aria-label={`${r.label}と反応する`}
                          onClick={() => {
                            setReaction(r.key);
                            // XP: リアクション +5pt (max 3)
                            incrementReaction();
                            fetch("/api/stargazer/alter-letter", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                letterId: letter.id,
                                reaction: r.key,
                              }),
                            }).catch(() => {});
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium
                            bg-white/40 border border-slate-200/60 text-slate-600
                            hover:bg-white/70 hover:border-slate-300 transition-all"
                        >
                          <span className="text-[11px]">{r.icon}</span>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-slate-500 mb-4"
                  >
                    ✦ 記録しました — この反応が次の手紙に反映されます
                  </motion.p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GlassButton
                      variant={saved ? "primary" : "secondary"}
                      size="sm"
                      onClick={handleSave}
                      disabled={saved}
                    >
                      {saved ? "心に留めた" : "心に留める"}
                    </GlassButton>
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={handleShare}
                    >
                      共有する
                    </GlassButton>
                  </div>
                  {onDismiss && (
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={onDismiss}
                    >
                      閉じる
                    </GlassButton>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AlterLetterCard({
  letter: externalLetter,
  autoFetch = false,
  onDismiss,
  onSave,
  onShare,
}: AlterLetterCardProps) {
  const [letter, setLetter] = useState<AlterLetterData | null>(
    externalLetter ?? null,
  );
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(autoFetch);

  // Sync external letter prop
  useEffect(() => {
    if (externalLetter !== undefined) {
      setLetter(externalLetter ?? null);
    }
  }, [externalLetter]);

  // Auto-fetch unread letter
  useEffect(() => {
    if (!autoFetch || externalLetter !== undefined) return;

    const fetchLetter = async () => {
      try {
        const res = await fetch("/api/stargazer/alter-letter");
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.letter) {
          setLetter(data.letter);
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    };

    fetchLetter();
  }, [autoFetch, externalLetter]);

  if (loading) return null;
  if (!letter) return null;

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {!opened ? (
          <motion.div
            key="envelope"
            exit={{ opacity: 0, scale: 0.9, rotateX: 20 }}
            transition={{ duration: 0.22 }}
          >
            <EnvelopeSeal
              tone={letter.tone}
              onClick={() => setOpened(true)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="letter"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.22 }}
          >
            <LetterContent
              letter={letter}
              onDismiss={onDismiss}
              onSave={onSave}
              onShare={onShare}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
