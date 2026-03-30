"use client";

/**
 * Rendezvous Talk — トーク画面
 * Primary: 人間同士のアクティブな会話リスト
 * Secondary: 分身の会話ログ / 成功ストーリー
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RV_CATEGORY_LABELS,
  RvCard,
  RvButton,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import SuccessStoriesCarousel from "@/components/rendezvous/SuccessStoriesCarousel";

// =============================================================================
// Types
// =============================================================================

type Conversation = {
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  isAvatarOnly?: boolean; // true if only avatar-to-avatar, no human chat yet
};

type TalkTab = "chats" | "avatar" | "stories";

// =============================================================================
// Component
// =============================================================================

export default function TalkPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TalkTab>("chats");

  useEffect(() => {
    fetch("/api/rendezvous/conversations", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.conversations) {
          setConversations(d.conversations);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const humanChats = conversations.filter((c) => !c.isAvatarOnly);
  const avatarLogs = conversations.filter((c) => c.isAvatarOnly);

  const TABS: { key: TalkTab; label: string; count?: number }[] = [
    {
      key: "chats",
      label: "チャット",
      count: humanChats.reduce((sum, c) => sum + c.unreadCount, 0),
    },
    { key: "avatar", label: "分身ログ", count: avatarLogs.length },
    { key: "stories", label: "ストーリー" },
  ];

  return (
    <div
      className="min-h-screen pb-28"
      style={{ background: RV_COLORS.base }}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-2">
        <h1
          className="text-lg font-bold"
          style={{ color: RV_COLORS.text }}
        >
          トーク
        </h1>
      </div>

      {/* Tab bar */}
      <div className="px-5 pb-3">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: RV_COLORS.surfaceMuted }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative flex-1 py-2 rounded-lg text-xs font-bold border-none cursor-pointer transition-all"
                style={{
                  backgroundColor: isActive ? RV_COLORS.surface : "transparent",
                  color: isActive ? RV_COLORS.text : RV_COLORS.textMuted,
                  boxShadow: isActive ? `0 1px 4px ${RV_COLORS.shadow}` : "none",
                }}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[9px] font-bold text-white"
                    style={{
                      background: tab.key === "chats" ? RV_COLORS.primary : RV_COLORS.textMuted,
                    }}
                  >
                    {tab.count > 99 ? "99+" : tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="px-5">
        {activeTab === "chats" && (
          <ChatList conversations={humanChats} loading={loading} />
        )}
        {activeTab === "avatar" && (
          <AvatarLogList conversations={avatarLogs} loading={loading} />
        )}
        {activeTab === "stories" && <StoriesSection />}
      </div>
    </div>
  );
}

// =============================================================================
// ChatList — 人間同士の会話（Primary）
// =============================================================================

function ChatList({
  conversations,
  loading,
}: {
  conversations: Conversation[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl animate-pulse"
            style={{ background: RV_COLORS.surfaceMuted }}
          />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <FadeInView>
        <div
          className="text-center py-12 rounded-2xl"
          style={{
            background: RV_COLORS.surfaceMuted,
            border: `1px solid ${RV_COLORS.border}`,
          }}
        >
          <span className="text-3xl block mb-3">&#x1F4AC;</span>
          <p
            className="text-sm font-bold"
            style={{ color: RV_COLORS.text }}
          >
            まだチャットはありません
          </p>
          <p
            className="text-xs mt-2 leading-relaxed"
            style={{ color: RV_COLORS.textMuted }}
          >
            分身同士の会話が成立すると
            <br />
            ここにチャットが表示されます
          </p>
          <div className="mt-4">
            <Link href="/rendezvous/explore" className="no-underline">
              <RvButton variant="primary">出会いを探す</RvButton>
            </Link>
          </div>
        </div>
      </FadeInView>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {conversations.map((chat) => (
        <ConversationRow key={chat.candidateId} conversation={chat} />
      ))}
    </div>
  );
}

// =============================================================================
// AvatarLogList — 分身同士の会話ログ（Secondary）
// =============================================================================

function AvatarLogList({
  conversations,
  loading,
}: {
  conversations: Conversation[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl animate-pulse"
            style={{ background: RV_COLORS.surfaceMuted }}
          />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <FadeInView>
        <div
          className="text-center py-12 rounded-2xl"
          style={{
            background: RV_COLORS.surfaceMuted,
            border: `1px solid ${RV_COLORS.border}`,
          }}
        >
          <span className="text-3xl block mb-3">&#x1F47B;</span>
          <p
            className="text-sm font-bold"
            style={{ color: RV_COLORS.text }}
          >
            分身の会話ログ
          </p>
          <p
            className="text-xs mt-2 leading-relaxed"
            style={{ color: RV_COLORS.textMuted }}
          >
            分身が他のアバターと会話した記録が
            <br />
            ここに表示されます
          </p>
        </div>
      </FadeInView>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p
        className="text-[10px] mb-2 px-1"
        style={{ color: RV_COLORS.textMuted }}
      >
        分身同士の会話です。相互成立するとチャットに移行します。
      </p>
      {conversations.map((chat) => (
        <ConversationRow
          key={chat.candidateId}
          conversation={chat}
          isAvatarLog
        />
      ))}
    </div>
  );
}

// =============================================================================
// ConversationRow — LINE風の会話行
// =============================================================================

function ConversationRow({
  conversation: chat,
  isAvatarLog = false,
}: {
  conversation: Conversation;
  isAvatarLog?: boolean;
}) {
  const catColor = RV_CATEGORY_COLORS[chat.category];

  return (
    <Link
      href={
        isAvatarLog
          ? `/rendezvous/${chat.candidateId}?tab=avatar`
          : `/rendezvous/${chat.candidateId}`
      }
      className="no-underline"
    >
      <motion.div
        className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
        style={{
          background:
            chat.unreadCount > 0 ? RV_COLORS.surfaceMuted : "transparent",
        }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Avatar */}
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
                  {isAvatarLog ? "\u{1F47B}" : "\u{1F464}"}
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
          {/* Category dot */}
          <div
            className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full"
            style={{
              background: catColor,
              border: `2px solid ${RV_COLORS.surface}`,
            }}
          />
        </div>

        {/* Content */}
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
            {isAvatarLog && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  background: RV_COLORS.secondarySoft,
                  color: RV_COLORS.secondary,
                }}
              >
                分身
              </span>
            )}
            <span
              className="text-[10px] shrink-0 ml-auto"
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
}

// =============================================================================
// StoriesSection — 成功ストーリー（既存機能を維持）
// =============================================================================

function StoriesSection() {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("friendship");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const CATEGORIES = [
    { key: "romantic", label: RV_CATEGORY_LABELS.romantic, color: RV_CATEGORY_COLORS.romantic },
    { key: "friendship", label: RV_CATEGORY_LABELS.friendship, color: RV_CATEGORY_COLORS.friendship },
    { key: "cocreation", label: RV_CATEGORY_LABELS.cocreation, color: RV_CATEGORY_COLORS.cocreation },
    { key: "community", label: RV_CATEGORY_LABELS.community, color: RV_CATEGORY_COLORS.community },
    { key: "partner", label: RV_CATEGORY_LABELS.partner, color: RV_CATEGORY_COLORS.partner },
  ];

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rendezvous/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: body, category, emoji: "✨" }),
      });
      if (res.ok) {
        setSubmitted(true);
        setShowForm(false);
      }
    } catch {}
    setSubmitting(false);
  };

  return (
    <div>
      {/* Header + CTA */}
      <div className="flex items-center justify-between mb-4">
        <p
          className="text-xs"
          style={{ color: RV_COLORS.textMuted }}
        >
          Rendezvousで生まれた繋がりのストーリー
        </p>
        {!showForm && !submitted && (
          <RvButton
            variant="secondary"
            onClick={() => setShowForm(true)}
          >
            書く
          </RvButton>
        )}
      </div>

      {/* Submitted */}
      {submitted && (
        <RvCard>
          <p
            className="text-sm font-bold text-center"
            style={{ color: RV_COLORS.text }}
          >
            ストーリーを投稿しました
          </p>
          <p
            className="text-xs text-center mt-1"
            style={{ color: RV_COLORS.textMuted }}
          >
            承認後に公開されます
          </p>
        </RvCard>
      )}

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-4"
          >
            <RvCard>
              <h3
                className="text-sm font-bold mb-3"
                style={{ color: RV_COLORS.text }}
              >
                あなたのストーリーをシェア
              </h3>

              <div className="flex gap-2 mb-3 flex-wrap">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setCategory(cat.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                    style={{
                      background:
                        category === cat.key
                          ? `${cat.color}12`
                          : RV_COLORS.surfaceMuted,
                      color:
                        category === cat.key
                          ? cat.color
                          : RV_COLORS.textSub,
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="タイトル"
                maxLength={100}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-2"
                style={{
                  background: RV_COLORS.surfaceMuted,
                  border: `1px solid ${RV_COLORS.border}`,
                  color: RV_COLORS.text,
                }}
              />

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="あなたのRendezvous体験を教えてください..."
                maxLength={2000}
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none mb-3"
                style={{
                  background: RV_COLORS.surfaceMuted,
                  border: `1px solid ${RV_COLORS.border}`,
                  color: RV_COLORS.text,
                  fontFamily: "inherit",
                }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: "transparent",
                    border: `1px solid ${RV_COLORS.border}`,
                    color: RV_COLORS.textSub,
                  }}
                >
                  キャンセル
                </button>
                <RvButton
                  variant="primary"
                  onClick={handleSubmit}
                  className="flex-[2]"
                >
                  {submitting ? "投稿中..." : "投稿する"}
                </RvButton>
              </div>
            </RvCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approved stories carousel */}
      <SuccessStoriesCarousel />
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

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
