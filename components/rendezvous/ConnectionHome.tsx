"use client";

/**
 * ConnectionHome — つながり枠ホーム
 * friendship / community / business(cocreation) をサブモード切替で表示。
 * アバター先行型UIを維持。
 *
 * Visual Identity: Intellectual, mysterious, avatar-first, gradual, philosophical
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RvSectionTitle,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import {
  trackListView,
  trackCandidateOpen,
  trackSubModeSwitch,
  type ConnectionSubMode as TrackSubMode,
} from "@/lib/rendezvous/trackRendezvous";

// =============================================================================
// サブモード定義
// =============================================================================

type ConnectionSubMode = "friendship" | "community" | "business";

type SubModeConfig = {
  id: ConnectionSubMode;
  /** DB上の category */
  dbCategory: "friendship" | "community" | "cocreation";
  label: string;
  icon: string;
  color: string;
  description: string;
};

const SUB_MODES: SubModeConfig[] = [
  {
    id: "friendship",
    dbCategory: "friendship",
    label: "友達",
    icon: "👋",
    color: RV_CATEGORY_COLORS.friendship,
    description: "気軽に話せる相手と出会う",
  },
  {
    id: "community",
    dbCategory: "community",
    label: "コミュニティ",
    icon: "🌍",
    color: RV_CATEGORY_COLORS.community,
    description: "共通の関心でつながる仲間",
  },
  {
    id: "business",
    dbCategory: "cocreation",
    label: "ビジネス",
    icon: "🤝",
    color: RV_CATEGORY_COLORS.cocreation,
    description: "共創できるパートナーを見つける",
  },
];

const CONNECTION_COLOR = RV_CATEGORY_COLORS.friendship; // primary accent for this lane

// =============================================================================
// Types
// =============================================================================

type CandidatePreview = {
  candidateId: string;
  displayName: string;
  avatarUrl: string | null;
  corePhrase: string;
  syncPercent: number;
  reasons: string[];
  category: string;
  state: string;
};

type ActiveChat = {
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  category: string;
};

// =============================================================================
// Atmospheric SubMode Pills
// =============================================================================

function SubModePills({
  active,
  onChange,
}: {
  active: ConnectionSubMode;
  onChange: (mode: ConnectionSubMode) => void;
}) {
  return (
    <div className="flex gap-2.5 justify-center">
      {SUB_MODES.map((mode) => {
        const isActive = active === mode.id;
        return (
          <motion.button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            whileTap={{ scale: 0.95 }}
            className="relative px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all border-none cursor-pointer"
            style={{
              backgroundColor: isActive ? `${mode.color}14` : "transparent",
              color: isActive ? mode.color : RV_COLORS.textMuted,
              border: isActive
                ? `1.5px solid ${mode.color}30`
                : `1px solid ${RV_COLORS.border}`,
            }}
          >
            <span className="mr-1.5">{mode.icon}</span>
            {mode.label}
          </motion.button>
        );
      })}
    </div>
  );
}

// =============================================================================
// CandidateCard — アバター先行型カード
// =============================================================================

function AvatarCandidateCard({
  candidate,
  color,
  delay,
}: {
  candidate: CandidatePreview;
  color: string;
  delay: number;
}) {
  const router = useRouter();

  return (
    <FadeInView delay={delay}>
      <motion.button
        whileTap={{ scale: 0.98 }}
        whileHover={{ y: -2 }}
        onClick={() => {
          trackCandidateOpen("connection", candidate.candidateId, candidate.category as TrackSubMode);
          router.push(`/rendezvous/${candidate.candidateId}`);
        }}
        className="w-full text-left rounded-2xl overflow-hidden border-none cursor-pointer"
        style={{
          background: RV_COLORS.surface,
          border: `1px solid ${RV_COLORS.border}`,
          boxShadow: `0 2px 16px ${RV_COLORS.shadow}`,
          padding: 0,
        }}
      >
        <div className="px-5 py-5 flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: candidate.avatarUrl
                ? undefined
                : `linear-gradient(135deg, ${color}15 0%, ${RV_COLORS.surfaceMuted} 100%)`,
              overflow: "hidden",
            }}
          >
            {candidate.avatarUrl ? (
              <img
                src={candidate.avatarUrl}
                alt={candidate.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-light" style={{ color: `${color}60` }}>
                {candidate.displayName.charAt(0)}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-bold" style={{ color: RV_COLORS.text }}>
                {candidate.displayName}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: `${color}12`, color }}
              >
                {candidate.syncPercent}%
              </span>
            </div>
            <p
              className="text-xs leading-relaxed line-clamp-2 mb-2"
              style={{ color: RV_COLORS.textSub, fontFamily: '"Noto Serif JP", serif' }}
            >
              &ldquo;{candidate.corePhrase}&rdquo;
            </p>
            {candidate.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {candidate.reasons.slice(0, 2).map((r, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: `${color}08`, color: RV_COLORS.textMuted }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0 mt-3">
            <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>→</span>
          </div>
        </div>
      </motion.button>
    </FadeInView>
  );
}

// =============================================================================
// ChatItem
// =============================================================================

function ChatItem({ chat, color }: { chat: ActiveChat; color: string }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/rendezvous/${chat.candidateId}`)}
      className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border-none cursor-pointer"
      style={{
        background: chat.unreadCount > 0 ? `${color}04` : "transparent",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}12` }}
      >
        {chat.avatarUrl ? (
          <img src={chat.avatarUrl} alt={chat.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <span className="text-sm font-bold" style={{ color }}>{chat.name.charAt(0)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: RV_COLORS.text }}>
            {chat.name}
          </span>
          <span className="text-[10px]" style={{ color: RV_COLORS.textMuted }}>
            {new Date(chat.lastMessageAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: RV_COLORS.textSub }}>
          {chat.lastMessage}
        </p>
      </div>
      {chat.unreadCount > 0 && (
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: color }}
        >
          {chat.unreadCount}
        </div>
      )}
    </button>
  );
}

// =============================================================================
// ConnectionHome
// =============================================================================

export default function ConnectionHome() {
  const [subMode, setSubMode] = useState<ConnectionSubMode>("friendship");
  const [candidates, setCandidates] = useState<CandidatePreview[]>([]);
  const [chats, setChats] = useState<ActiveChat[]>([]);
  const [loading, setLoading] = useState(true);

  const currentConfig = SUB_MODES.find((m) => m.id === subMode)!;
  const color = currentConfig.color;

  const handleSubModeChange = useCallback((mode: ConnectionSubMode) => {
    trackSubModeSwitch(mode as TrackSubMode);
    setSubMode(mode);
  }, []);

  useEffect(() => {
    trackListView("connection", subMode as TrackSubMode);
    setLoading(true);
    const category = currentConfig.dbCategory;

    Promise.all([
      fetch(`/api/rendezvous/explore?category=${category}&limit=10`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/rendezvous/conversations?category=${category}`).then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([exploreData, chatData]) => {
        if (exploreData?.ok) {
          setCandidates(
            (exploreData.candidates ?? []).map((c: any) => ({
              candidateId: c.candidateId,
              displayName: c.displayName,
              avatarUrl: c.avatarUrl ?? c.photoUrl ?? null,
              corePhrase: c.corePhrase ?? "",
              syncPercent: Math.round((c.resonanceLevel ?? 0) * 33),
              reasons: c.reasons ?? [],
              category: c.category,
              state: c.state ?? "unseen",
            })),
          );
        } else {
          setCandidates([]);
        }

        if (chatData?.ok) {
          setChats(chatData.conversations ?? []);
        } else {
          setChats([]);
        }
      })
      .catch(() => {
        setCandidates([]);
        setChats([]);
      })
      .finally(() => setLoading(false));
  }, [subMode, currentConfig.dbCategory]);

  return (
    <div
      className="min-h-screen pb-28"
      style={{
        background: `linear-gradient(180deg, ${RV_COLORS.base} 0%, rgba(123,97,255,0.03) 50%, rgba(123,97,255,0.01) 100%)`,
      }}
    >
      {/* ===== Atmospheric Header ===== */}
      <FadeInView delay={0}>
        <div className="px-6 pt-6 pb-2">
          {/* Back link */}
          <a
            href="/rendezvous"
            className="text-sm no-underline inline-block mb-4"
            style={{ color: RV_COLORS.textMuted }}
          >
            ←
          </a>

          {/* Title */}
          <h1
            className="text-2xl font-bold mb-2"
            style={{
              color: CONNECTION_COLOR,
              fontFamily: '"Noto Serif JP", serif',
              letterSpacing: "0.08em",
            }}
          >
            つながり
          </h1>

          {/* Tagline */}
          <p
            className="text-[14px] leading-relaxed mb-6"
            style={{
              color: RV_COLORS.textSub,
              fontFamily: '"Noto Serif JP", serif',
              letterSpacing: "0.02em",
            }}
          >
            外見ではなく内面で、出会いは始まる
          </p>

          {/* Sub-mode pills */}
          <SubModePills active={subMode} onChange={handleSubModeChange} />
        </div>
      </FadeInView>

      {/* Mode description */}
      <FadeInView delay={0.1}>
        <div className="px-6 pt-4 pb-2">
          <p
            className="text-xs leading-relaxed"
            style={{ color: RV_COLORS.textMuted, fontFamily: '"Noto Serif JP", serif' }}
          >
            {currentConfig.description}
          </p>
        </div>
      </FadeInView>

      {/* ===== Content ===== */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <motion.div
            className="w-12 h-12 rounded-full"
            style={{ border: `2px solid ${RV_COLORS.border}`, borderTopColor: color }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
          <p
            className="text-sm"
            style={{ color: RV_COLORS.textSub, fontFamily: '"Noto Serif JP", serif' }}
          >
            分身が探索しています...
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={subMode}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {/* ===== Active Chats ===== */}
            {chats.length > 0 && (
              <div className="px-6 mb-8 mt-4">
                <RvSectionTitle accent={color} className="mb-4">
                  進行中の対話
                </RvSectionTitle>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: RV_COLORS.surface,
                    border: `1px solid ${RV_COLORS.border}`,
                  }}
                >
                  {chats.map((chat) => (
                    <ChatItem key={chat.candidateId} chat={chat} color={color} />
                  ))}
                </div>
              </div>
            )}

            {/* ===== Candidates ===== */}
            <div className="px-6 mt-4">
              <RvSectionTitle accent={color} className="mb-4">
                分身が見つけた候補
              </RvSectionTitle>

              {candidates.length === 0 ? (
                <FadeInView delay={0.15}>
                  <div
                    className="rounded-2xl px-6 py-16 text-center"
                    style={{
                      background: RV_COLORS.surface,
                      border: `1px solid ${RV_COLORS.border}`,
                    }}
                  >
                    <motion.div
                      className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                      style={{ background: `${CONNECTION_COLOR}08` }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <span className="text-2xl">{currentConfig.icon}</span>
                    </motion.div>
                    <p
                      className="text-sm font-medium mb-3 leading-relaxed"
                      style={{
                        color: RV_COLORS.textSub,
                        fontFamily: '"Noto Serif JP", serif',
                      }}
                    >
                      分身が探索しています
                    </p>
                    <p
                      className="text-xs leading-relaxed max-w-[260px] mx-auto"
                      style={{
                        color: RV_COLORS.textMuted,
                        fontFamily: '"Noto Serif JP", serif',
                      }}
                    >
                      あなたの内面と共鳴する人を見つけるまで、少しだけ待ってください。
                    </p>
                  </div>
                </FadeInView>
              ) : (
                <div className="flex flex-col gap-3">
                  {candidates.map((c, i) => (
                    <AvatarCandidateCard
                      key={c.candidateId}
                      candidate={c}
                      color={color}
                      delay={0.08 * i}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Explore more link */}
            <div className="px-6 mt-8 text-center">
              <a
                href={`/rendezvous/explore?category=${currentConfig.dbCategory}`}
                className="text-xs no-underline"
                style={{
                  color,
                  fontFamily: '"Noto Serif JP", serif',
                  borderBottom: `1px solid ${color}30`,
                  paddingBottom: 2,
                }}
              >
                もっと探す
              </a>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
