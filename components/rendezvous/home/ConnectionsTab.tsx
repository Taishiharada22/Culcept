"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RvCard,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import AvatarStoryViewer from "@/components/rendezvous/AvatarStoryViewer";
import type { AvatarStory } from "@/components/rendezvous/AvatarStoryTypes";

// =============================================================================
// Types
// =============================================================================

type ActiveChat = {
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
};

type ActiveRelationship = {
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  stage: "spark" | "kindling" | "flame" | "glow" | "constellation";
  lastActivityRecent: boolean;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  unreadCount?: number;
};

type Story = {
  id: string;
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  summary: string;
  read: boolean;
  createdAt: string;
};

type CandidatePreview = {
  candidateId: string;
  displayName: string;
  photoUrl: string | null;
  age: number | null;
  area: string | null;
  corePhrase: string;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
};

type Props = {
  activeChats: ActiveChat[];
  activeRelationships: ActiveRelationship[];
  stories: Story[];
  todayCandidates: CandidatePreview[];
  avatarStories: AvatarStory[];
};

const SUB_TABS = [
  { id: "all", label: "全て" },
  { id: "chatting", label: "チャット中" },
  { id: "candidates", label: "候補" },
  { id: "saved", label: "保存済み" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["id"];

const STAGE_LABELS: Record<string, string> = {
  spark: "スパーク",
  kindling: "キンドリング",
  flame: "フレイム",
  glow: "グロウ",
  constellation: "コンステレーション",
};

function formatTimeAgo(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "今";
    if (mins < 60) return `${mins}分前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
  } catch {
    return "";
  }
}

// =============================================================================
// ConnectionsTab: つながり -- All connections list
// =============================================================================

export default function ConnectionsTab({
  activeChats,
  activeRelationships,
  stories,
  todayCandidates,
  avatarStories,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>("all");
  const [showStoryViewer, setShowStoryViewer] = useState(false);

  const showChats = subTab === "all" || subTab === "chatting";
  const showCandidates = subTab === "all" || subTab === "candidates";
  const showSaved = subTab === "saved";

  return (
    <div className="flex flex-col">
      {/* Sub-tabs */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className="shrink-0 px-4 py-2 rounded-full text-xs font-bold border-none cursor-pointer transition-all"
              style={{
                background:
                  subTab === tab.id
                    ? RV_COLORS.gradient
                    : RV_COLORS.surfaceMuted,
                color:
                  subTab === tab.id ? "#FFFFFF" : RV_COLORS.textSub,
                boxShadow:
                  subTab === tab.id
                    ? `0 2px 12px ${RV_COLORS.primaryGlow}`
                    : "none",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Story rings */}
      {(subTab === "all" || subTab === "chatting") && (stories.length > 0 || avatarStories.length > 0) && (
        <FadeInView delay={0}>
          <div className="px-5 pt-2 pb-2">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {avatarStories.length > 0 && (
                <button
                  onClick={() => setShowStoryViewer(true)}
                  className="flex flex-col items-center gap-1.5 shrink-0 bg-transparent border-none cursor-pointer p-0"
                >
                  <div
                    className="w-[60px] h-[60px] rounded-full p-[2px]"
                    style={{
                      background: `linear-gradient(135deg, ${RV_COLORS.primary}, ${RV_COLORS.accent})`,
                    }}
                  >
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center"
                      style={{ backgroundColor: RV_COLORS.surface }}
                    >
                      <span className="text-lg">&#x1F47B;</span>
                    </div>
                  </div>
                  <span
                    className="text-[10px] truncate max-w-[60px]"
                    style={{ color: RV_COLORS.primary, fontWeight: 600 }}
                  >
                    分身
                  </span>
                </button>
              )}
              {stories.map((story) => {
                const color = RV_CATEGORY_COLORS[story.category];
                return (
                  <Link
                    key={`story-${story.id}`}
                    href={`/rendezvous/stories?id=${story.id}`}
                    className="flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <div
                      className="w-[60px] h-[60px] rounded-full p-[2px]"
                      style={{
                        background: story.read
                          ? RV_COLORS.surfaceMuted
                          : `linear-gradient(135deg, ${color}, ${color}88)`,
                      }}
                    >
                      <div
                        className="w-full h-full rounded-full flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: RV_COLORS.surface }}
                      >
                        {story.avatarUrl ? (
                          <img
                            src={story.avatarUrl}
                            alt={story.name}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          <span className="text-base" style={{ color: RV_COLORS.textMuted }}>
                            &#x1F464;
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className="text-[10px] truncate max-w-[60px]"
                      style={{ color: RV_COLORS.textSub }}
                    >
                      {story.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </FadeInView>
      )}

      {/* Chat list */}
      {showChats && (
        <FadeInView delay={0.05}>
          <div className="px-5 mt-2">
            {activeChats.length === 0 && activeRelationships.length === 0 ? (
              <div
                className="text-center py-8 rounded-2xl"
                style={{
                  background: RV_COLORS.surfaceMuted,
                  border: `1px solid ${RV_COLORS.border}`,
                }}
              >
                <p className="text-sm" style={{ color: RV_COLORS.textSub }}>
                  まだトークはありません
                </p>
                <p className="text-xs mt-1" style={{ color: RV_COLORS.textMuted }}>
                  分身が接続を見つけたらお知らせします
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {activeChats.map((chat) => {
                  const catColor = RV_CATEGORY_COLORS[chat.category];
                  return (
                    <Link
                      key={chat.candidateId}
                      href={`/rendezvous/conversations/${chat.candidateId}`}
                      className="no-underline"
                    >
                      <motion.div
                        className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                        style={{
                          background:
                            chat.unreadCount > 0
                              ? RV_COLORS.surfaceMuted
                              : "transparent",
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="relative shrink-0">
                          <div
                            className="w-12 h-12 rounded-full overflow-hidden"
                            style={{ border: `2px solid ${catColor}30` }}
                          >
                            {chat.avatarUrl ? (
                              <img
                                src={chat.avatarUrl}
                                alt={chat.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center"
                                style={{ background: `${catColor}15` }}
                              >
                                <span style={{ color: `${catColor}60` }}>
                                  &#x1F464;
                                </span>
                              </div>
                            )}
                          </div>
                          {chat.unreadCount > 0 && (
                            <div
                              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center"
                              style={{
                                background: RV_COLORS.primary,
                                border: `2px solid ${RV_COLORS.surface}`,
                              }}
                            >
                              <span className="text-[9px] font-bold text-white leading-none">
                                {chat.unreadCount > 9 ? "9+" : chat.unreadCount}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className="text-sm truncate"
                              style={{
                                color: RV_COLORS.text,
                                fontWeight: chat.unreadCount > 0 ? 700 : 500,
                              }}
                            >
                              {chat.name}
                            </p>
                            <span
                              className="text-[10px] shrink-0"
                              style={{ color: RV_COLORS.textMuted }}
                            >
                              {formatTimeAgo(chat.lastMessageAt)}
                            </span>
                          </div>
                          <p
                            className="text-xs mt-0.5 truncate"
                            style={{
                              color:
                                chat.unreadCount > 0
                                  ? RV_COLORS.textSub
                                  : RV_COLORS.textMuted,
                            }}
                          >
                            {chat.lastMessage}
                          </p>
                        </div>
                      </motion.div>
                    </Link>
                  );
                })}

                {/* Fallback: activeRelationships */}
                {activeChats.length === 0 &&
                  activeRelationships.map((rel) => {
                    const catColor = RV_CATEGORY_COLORS[rel.category];
                    return (
                      <Link
                        key={rel.candidateId}
                        href={`/rendezvous/${rel.candidateId}`}
                        className="no-underline"
                      >
                        <motion.div
                          className="flex items-center gap-3 px-3 py-3 rounded-xl"
                          style={{
                            background:
                              rel.unreadCount && rel.unreadCount > 0
                                ? RV_COLORS.surfaceMuted
                                : "transparent",
                          }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="relative shrink-0">
                            <div
                              className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
                              style={{
                                background: `linear-gradient(135deg, ${catColor}20, ${RV_COLORS.surface})`,
                                border: `2px solid ${catColor}30`,
                              }}
                            >
                              {rel.avatarUrl ? (
                                <img
                                  src={rel.avatarUrl}
                                  alt={rel.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span style={{ color: `${catColor}60` }}>
                                  &#x1F464;
                                </span>
                              )}
                            </div>
                            {rel.lastActivityRecent && (
                              <motion.div
                                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
                                style={{
                                  background: RV_COLORS.success,
                                  border: `2px solid ${RV_COLORS.surface}`,
                                }}
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm font-bold truncate"
                              style={{ color: RV_COLORS.text }}
                            >
                              {rel.name}
                            </p>
                            <p
                              className="text-[10px] mt-0.5"
                              style={{ color: `${catColor}AA` }}
                            >
                              {STAGE_LABELS[rel.stage]}
                            </p>
                          </div>
                        </motion.div>
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        </FadeInView>
      )}

      {/* Candidates */}
      {showCandidates && !showChats && (
        <FadeInView delay={0.05}>
          <div className="px-5 mt-2">
            {todayCandidates.length === 0 ? (
              <div
                className="text-center py-8 rounded-2xl"
                style={{
                  background: RV_COLORS.surfaceMuted,
                  border: `1px solid ${RV_COLORS.border}`,
                }}
              >
                <p className="text-sm" style={{ color: RV_COLORS.textSub }}>
                  現在の候補はありません
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {todayCandidates.map((c) => {
                  const catColor = RV_CATEGORY_COLORS[c.category];
                  return (
                    <Link
                      key={c.candidateId}
                      href="/rendezvous/explore"
                      className="no-underline"
                    >
                      <motion.div
                        className="relative rounded-2xl overflow-hidden"
                        style={{
                          background: RV_COLORS.surface,
                          border: `1px solid ${RV_COLORS.border}`,
                        }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <div className="w-full h-[120px] overflow-hidden">
                          {c.photoUrl ? (
                            <img
                              src={c.photoUrl}
                              alt={c.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{
                                background: `linear-gradient(135deg, ${catColor}20, ${RV_COLORS.surfaceMuted})`,
                              }}
                            >
                              <span className="text-3xl" style={{ color: `${catColor}40` }}>
                                &#x1F464;
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-xs font-bold truncate" style={{ color: RV_COLORS.text }}>
                            {c.displayName}
                            {c.age ? (
                              <span className="font-normal ml-1" style={{ color: RV_COLORS.textMuted }}>
                                {c.age}
                              </span>
                            ) : null}
                          </p>
                          <p
                            className="text-[10px] mt-1 line-clamp-2 leading-snug"
                            style={{ color: RV_COLORS.primary }}
                          >
                            {c.corePhrase}
                          </p>
                        </div>
                        <div
                          className="absolute top-2 right-2 w-2 h-2 rounded-full"
                          style={{
                            background: catColor,
                            boxShadow: `0 0 6px ${catColor}60`,
                          }}
                        />
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </FadeInView>
      )}

      {/* Saved tab placeholder */}
      {showSaved && (
        <FadeInView delay={0.05}>
          <div className="px-5 mt-2">
            <div
              className="text-center py-8 rounded-2xl"
              style={{
                background: RV_COLORS.surfaceMuted,
                border: `1px solid ${RV_COLORS.border}`,
              }}
            >
              <span className="text-2xl mb-2 block">&#x1F516;</span>
              <p className="text-sm" style={{ color: RV_COLORS.textSub }}>
                保存済みの接続
              </p>
              <p className="text-xs mt-1" style={{ color: RV_COLORS.textMuted }}>
                気になった候補を保存するとここに表示されます
              </p>
            </div>
          </div>
        </FadeInView>
      )}

      {/* Story viewer */}
      {showStoryViewer && avatarStories.length > 0 && (
        <AvatarStoryViewer
          stories={avatarStories}
          onClose={() => setShowStoryViewer(false)}
          onReact={(storyId, emoji) => {
            fetch("/api/rendezvous/avatar-stories/react", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storyId, emoji }),
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
