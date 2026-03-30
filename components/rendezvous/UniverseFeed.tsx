"use client";

// components/rendezvous/UniverseFeed.tsx
// Evening touchpoint: 4-category activity feed

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  FeedItem,
  FeedItemType,
  RendezvousCategory,
  CATEGORY_LABELS,
  CATEGORY_TEXT_COLORS,
  CATEGORY_BG_COLORS,
} from "./AvatarStoryTypes";

// ---------------------------------------------------------------------------
// Category tabs
// ---------------------------------------------------------------------------

type TabKey = "all" | RendezvousCategory;

const TABS: { key: TabKey; label: string; color: string }[] = [
  { key: "all", label: "\u3059\u3079\u3066", color: "border-slate-600" },
  { key: "romantic", label: "\uD83D\uDC95\u604B\u611B", color: "border-pink-500" },
  { key: "friendship", label: "\uD83D\uDC65\u53CB\u9054", color: "border-sky-500" },
  { key: "cocreation", label: "\uD83D\uDCA1\u5171\u5275", color: "border-amber-500" },
  { key: "community", label: "\uD83C\uDF0D\u30B3\u30DF\u30E5\u30CB\u30C6\u30A3", color: "border-emerald-500" },
  { key: "partner", label: "\uD83E\uDD1D\u30D1\u30FC\u30C8\u30CA\u30FC", color: "border-orange-500" },
];

function CategoryTabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto hide-scrollbar px-4 pb-2">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors rounded-full ${
              isActive ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab.label}
            {isActive && (
              <motion.div
                layoutId="feedTab"
                className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${tab.color} bg-current`}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed type -> icon & description
// ---------------------------------------------------------------------------

const FEED_TYPE_META: Record<FeedItemType, { icon: string; template: string }> = {
  new_encounter: {
    icon: "\u2728",
    template: "\u30A2\u30D0\u30BF\u30FC\u304C\u65B0\u3057\u3044\u4EBA\u3068\u51FA\u4F1A\u3044\u307E\u3057\u305F",
  },
  relationship_update: {
    icon: "\uD83D\uDCC8",
    template: "\u5171\u9CF4\u5EA6\u304C\u4E0A\u6607\u4E2D",
  },
  group_activity: {
    icon: "\uD83C\uDF89",
    template: "\u30B0\u30EB\u30FC\u30D7\u3067\u76DB\u308A\u4E0A\u304C\u3063\u305F",
  },
  cocreation_match: {
    icon: "\uD83D\uDCA1",
    template: "\u3042\u306A\u305F\u306E\u30A2\u30A4\u30C7\u30A2\u306B\u53CD\u5FDC\u304C\u3042\u308A\u307E\u3057\u305F",
  },
  baton_ready: {
    icon: "\uD83C\uDFC3",
    template: "\u30D0\u30C8\u30F3\u30BF\u30C3\u30C1\u306E\u6E96\u5099\u304C\u3067\u304D\u307E\u3057\u305F",
  },
  milestone: {
    icon: "\uD83C\uDF1F",
    template: "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u9054\u6210",
  },
};

// ---------------------------------------------------------------------------
// Feed card
// ---------------------------------------------------------------------------

function FeedCard({ item }: { item: FeedItem }) {
  const router = useRouter();
  const meta = FEED_TYPE_META[item.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <GlassCard
        padding="sm"
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => item.actionUrl && router.push(item.actionUrl)}
      >
        {/* Avatar / icon */}
        {item.candidateInfo ? (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center overflow-hidden shrink-0">
            {item.candidateInfo.photo ? (
              <img
                src={item.candidateInfo.photo}
                alt={item.candidateInfo.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white font-bold text-sm">
                {item.candidateInfo.name.charAt(0)}
              </span>
            )}
          </div>
        ) : (
          <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-xl shrink-0">
            {item.groupIcon || meta.icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900 text-sm truncate">
              {item.title}
            </p>
            {item.category !== "all" && (
              <GlassBadge
                size="sm"
                className={`${CATEGORY_BG_COLORS[item.category as RendezvousCategory]} ${CATEGORY_TEXT_COLORS[item.category as RendezvousCategory]} border shrink-0`}
              >
                {CATEGORY_LABELS[item.category as RendezvousCategory]}
              </GlassBadge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
            {item.subtitle}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">{item.timestamp}</p>
        </div>

        {/* Chevron */}
        {item.actionUrl && (
          <svg className="w-4 h-4 text-slate-300 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EMPTY_MESSAGES: Record<TabKey, string> = {
  all: "\u307E\u3060\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u30A2\u30D0\u30BF\u30FC\u304C\u52D5\u304D\u51FA\u3059\u306E\u3092\u5F85\u3061\u307E\u3057\u3087\u3046\uFF01",
  romantic: "\u604B\u611B\u30AB\u30C6\u30B4\u30EA\u306E\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
  friendship: "\u53CB\u9054\u30AB\u30C6\u30B4\u30EA\u306E\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
  cocreation: "\u5171\u5275\u30AB\u30C6\u30B4\u30EA\u306E\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
  community: "\u30B3\u30DF\u30E5\u30CB\u30C6\u30A3\u306E\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
  partner: "\u30D1\u30FC\u30C8\u30CA\u30FC\u30AB\u30C6\u30B4\u30EA\u306E\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UniverseFeedProps {
  feedItems: FeedItem[];
  onRefresh?: () => Promise<void>;
}

export default function UniverseFeed({
  feedItems,
  onRefresh,
}: UniverseFeedProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [refreshing, setRefreshing] = useState(false);

  const filtered =
    activeTab === "all"
      ? feedItems
      : feedItems.filter((item) => item.category === activeTab);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  return (
    <div className="flex flex-col">
      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl pt-2 border-b border-slate-200/50">
        <CategoryTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Pull to refresh button */}
      {onRefresh && (
        <div className="px-4 pt-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            {refreshing ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block"
              >
                \u21BB
              </motion.span>
            ) : (
              "\u2193 \u5F15\u3044\u3066\u66F4\u65B0"
            )}
          </button>
        </div>
      )}

      {/* Feed */}
      <div className="px-4 py-3 space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length > 0 ? (
            filtered.map((item) => <FeedCard key={item.id} item={item} />)
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <p className="text-3xl mb-3">\uD83C\uDF1F</p>
              <p className="text-sm text-slate-400">
                {EMPTY_MESSAGES[activeTab]}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
