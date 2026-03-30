"use client";

/**
 * RendezvousListView
 * 文脈タブ（友達/恋愛/Orbiter/共創）が主役、状態サブタブがその中に。
 * 各文脈ごとに独立した送り出し/一時停止制御、
 * 文脈ごとの背景色変化、非操作時の自動待機保護を含む。
 *
 * 既存機能を維持:
 * - タブ切り替え (状態タブ → サブタブに格下げ)
 * - API fetch
 * - カード表示
 * - 空状態表示
 * - RendezvousSyncRing, StateBadge, ContextBadge, EmptyState
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type {
  RendezvousCardDTO,
  RendezvousListTab,
  RendezvousCategory,
} from "@/lib/rendezvous/types";
import RendezvousSyncRing from "./RendezvousSyncRing";
import RendezvousStateBadge from "./RendezvousStateBadge";
import RendezvousEmptyState from "./RendezvousEmptyState";
import RendezvousContextBadge from "./RendezvousContextBadge";
import RendezvousContextTabs from "./RendezvousContextTabs";
import RendezvousContextStatusBar from "./RendezvousContextStatusBar";
import RendezvousBackgroundLayers from "./RendezvousBackgroundLayers";
import RendezvousStateSubTabs from "./RendezvousStateSubTabs";
import RendezvousSwipeStack from "./RendezvousSwipeStack";
import RendezvousDailyFlow from "./RendezvousDailyFlow";
import { useRendezvousStandby } from "@/hooks/useRendezvousStandby";
import {
  CONTEXT_COLORS,
  DEFAULT_CONTEXT_STATES,
} from "@/lib/rendezvous/questions/types";
import type {
  ContextType,
  ContextStatesMap,
  ContextExplorationState,
} from "@/lib/rendezvous/questions/types";
import {
  AVATAR_JUDGMENT_LABELS,
  AVATAR_JUDGMENT_COLORS,
} from "@/lib/rendezvous/questions/constants";

const CATEGORY_LABEL: Record<RendezvousCategory, string> = {
  romantic: "恋愛",
  friendship: "友人",
  cocreation: "共創",
  community: "コミュニティ",
  partner: "パートナー",
};

const CATEGORY_COLOR: Record<RendezvousCategory, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
  partner: "#D4776B",
};

function getInitials(name: string): string {
  return name.slice(0, 2);
}

export default function RendezvousListView() {
  // --- Context & Tab state ---
  const [activeContext, setActiveContext] = useState<ContextType>("friend");
  const [activeTab, setActiveTab] = useState<RendezvousListTab>("new");

  // --- Context exploration states (per-context active/paused/inactive) ---
  const [contextStates, setContextStates] =
    useState<ContextStatesMap>(DEFAULT_CONTEXT_STATES);

  // --- Auto-standby ---
  const [autoStandbyThresholdHours, setAutoStandbyThresholdHours] =
    useState(4);
  const { standbyActive, resumeStandby } = useRendezvousStandby({
    thresholdHours: autoStandbyThresholdHours,
  });

  // --- View mode (swipe vs list) ---
  const [viewMode, setViewMode] = useState<"swipe" | "list">("swipe");

  // --- List data ---
  const [items, setItems] = useState<RendezvousCardDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // --- Fetch settings on mount ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rendezvous/settings", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.contextStates) {
            setContextStates(data.contextStates);
          }
          if (typeof data.autoStandbyThresholdHours === "number") {
            setAutoStandbyThresholdHours(data.autoStandbyThresholdHours);
          }
        }
      } catch {
        // ignore
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  // --- Fetch list when context or tab changes ---
  const fetchList = useCallback(
    async (ctx: ContextType, tab: RendezvousListTab) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/rendezvous/list?context=${ctx}&tab=${tab}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = await res.json();
          setItems(Array.isArray(data?.items) ? data.items : []);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchList(activeContext, activeTab);
  }, [activeContext, activeTab, fetchList]);

  // --- Context state change handler (optimistic + server sync) ---
  const handleContextStateChange = useCallback(
    async (newState: ContextExplorationState) => {
      const updated: ContextStatesMap = {
        ...contextStates,
        [activeContext]: newState,
      };
      // Optimistic update
      setContextStates(updated);

      // Server sync
      try {
        await fetch("/api/rendezvous/settings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextStates: updated }),
        });
      } catch {
        // Revert on failure
        setContextStates(contextStates);
      }
    },
    [contextStates, activeContext],
  );

  // --- Swipe action handler ---
  const handleSwipeAction = useCallback(
    async (candidateId: string, action: "like" | "pass" | "save") => {
      try {
        const endpoint = `/api/rendezvous/${candidateId}/${action}`;
        await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // silent — optimistic removal already happened
      }
    },
    [],
  );

  // --- Derived values ---
  const contextColor = CONTEXT_COLORS[activeContext];
  const currentContextState = contextStates[activeContext];
  const showSwipeView = viewMode === "swipe" && activeTab === "new";

  return (
    <div
      className="min-h-screen"
      style={{ position: "relative", overflow: "hidden" }}
    >
      {/* Background gradient layers (crossfade by context) */}
      <RendezvousBackgroundLayers activeContext={activeContext} />

      {/* Content (relative for z-index above background) */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div
          className="px-5 pt-6 pb-2"
          style={{ maxWidth: 780, margin: "0 auto" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1
                className="text-lg font-extrabold"
                style={{ color: "#1E1E3C", letterSpacing: 0.5 }}
              >
                Rendezvous
              </h1>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgba(30,30,60,0.4)" }}
              >
                分身が見つけた交差の記録
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle (only on "new" tab) */}
              {activeTab === "new" && (
                <button
                  onClick={() => setViewMode((v) => (v === "swipe" ? "list" : "swipe"))}
                  className="text-xs no-underline px-3 py-1.5 rounded-lg transition-colors"
                  style={{
                    color: "rgba(30,30,60,0.5)",
                    background: "rgba(99,102,241,0.06)",
                    border: "1px solid rgba(99,102,241,0.08)",
                  }}
                >
                  {viewMode === "swipe" ? "リスト" : "スワイプ"}
                </button>
              )}
              <Link
                href="/rendezvous/settings"
                className="text-xs no-underline px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: "rgba(30,30,60,0.5)",
                  background: "rgba(99,102,241,0.06)",
                  border: "1px solid rgba(99,102,241,0.08)",
                }}
              >
                探索方針
              </Link>
            </div>
          </div>

          {/* Primary: Context tabs */}
          <RendezvousContextTabs
            activeContext={activeContext}
            onChange={(ctx) => {
              setActiveContext(ctx);
              setActiveTab("new"); // reset sub-tab on context switch
            }}
          />

          {/* Context status bar (per-context active/paused/inactive + standby) */}
          <div className="mt-3">
            <RendezvousContextStatusBar
              context={activeContext}
              state={currentContextState}
              standbyActive={standbyActive}
              onChangeState={handleContextStateChange}
              onResumeStandby={resumeStandby}
            />
          </div>

          {/* Secondary: State sub-tabs */}
          <div className="mt-3">
            <RendezvousStateSubTabs
              activeTab={activeTab}
              onChange={setActiveTab}
              contextColor={contextColor}
            />
          </div>
        </div>

        {/* Content area */}
        <div
          className="px-5 pb-24"
          style={{ maxWidth: 780, margin: "0 auto" }}
        >
          {/* Daily Flow — 今日のRendezvous */}
          {!loading && activeTab === "new" && (
            <RendezvousDailyFlow />
          )}

          {/* Loading */}
          {loading && (
            <div
              className="flex items-center justify-center py-16"
              style={{ color: "rgba(30,30,60,0.35)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: contextColor,
                    opacity: 0.5,
                    animation: "rv-load-pulse 1.5s ease-in-out infinite",
                  }}
                />
                <span
                  className="text-xs"
                  style={{
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  }}
                >
                  観測データ読み込み中...
                </span>
              </div>
            </div>
          )}

          {/* Empty */}
          {!loading && items.length === 0 && (
            <div className="mt-4">
              <RendezvousEmptyState context={activeTab} />
            </div>
          )}

          {/* Swipe Stack View */}
          {!loading && items.length > 0 && showSwipeView && (
            <div className="mt-3" style={{ maxWidth: 400, margin: "12px auto 0" }}>
              <RendezvousSwipeStack
                items={items}
                onAction={handleSwipeAction}
                onEmpty={() => fetchList(activeContext, activeTab)}
              />
            </div>
          )}

          {/* List View */}
          {!loading && items.length > 0 && !showSwipeView && (
            <div className="flex flex-col gap-2 mt-3">
              {items.map((card) => {
                const catColor =
                  CATEGORY_COLOR[card.category] ?? "#6366F1";
                const hasLens = !!card.contextLens;
                const bestCtx = card.contextLens?.bestContext;
                const bestCtxColor = bestCtx
                  ? CONTEXT_COLORS[bestCtx]
                  : catColor;
                const judgment = card.contextLens?.avatarJudgment;

                return (
                  <Link
                    key={card.candidateId}
                    href={`/rendezvous/${card.candidateId}`}
                    className="no-underline"
                    style={{ color: "inherit" }}
                  >
                    <div
                      className="flex items-center gap-3 p-3.5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.75)",
                        border: "1px solid rgba(99,102,241,0.06)",
                        backdropFilter: "blur(4px)",
                        boxShadow: "0 1px 3px rgba(99,102,241,0.04)",
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 44,
                          height: 44,
                          background: card.counterpart.avatarUrl
                            ? `url(${card.counterpart.avatarUrl}) center/cover`
                            : `linear-gradient(135deg, ${bestCtxColor}20, ${bestCtxColor}08)`,
                          border: `2px solid ${bestCtxColor}30`,
                          fontSize: 14,
                          fontWeight: 700,
                          color: bestCtxColor,
                        }}
                      >
                        {!card.counterpart.avatarUrl &&
                          getInitials(card.counterpart.displayName)}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-sm font-bold truncate"
                            style={{ color: "#1E1E3C" }}
                          >
                            {card.counterpart.displayName}
                          </span>
                          <RendezvousStateBadge state={card.state} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 既存カテゴリ */}
                          <span
                            className="text-xs font-semibold"
                            style={{
                              color: catColor,
                              padding: "0 4px",
                              borderRadius: 3,
                              background: `${catColor}10`,
                              fontSize: 9,
                            }}
                          >
                            {CATEGORY_LABEL[card.category]}
                          </span>
                          {/* 追加レンズ: 文脈バッジ */}
                          {hasLens && bestCtx && (
                            <RendezvousContextBadge context={bestCtx} />
                          )}
                          {/* アバター判断 */}
                          {judgment && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: AVATAR_JUDGMENT_COLORS[judgment],
                                padding: "1px 5px",
                                borderRadius: 3,
                                background: `${AVATAR_JUDGMENT_COLORS[judgment]}12`,
                              }}
                            >
                              {AVATAR_JUDGMENT_LABELS[judgment]}
                            </span>
                          )}
                          <span
                            className="text-xs truncate"
                            style={{ color: "rgba(30,30,60,0.35)" }}
                          >
                            {card.label}
                          </span>
                        </div>
                        {/* 交差の理由 or アバター判断テキスト */}
                        {card.contextLens?.avatarJudgmentText ? (
                          <p
                            className="text-xs mt-1 truncate"
                            style={{ color: "rgba(30,30,60,0.55)" }}
                          >
                            {card.contextLens.avatarJudgmentText}
                          </p>
                        ) : card.reasons[0] ? (
                          <p
                            className="text-xs mt-1 truncate"
                            style={{ color: "rgba(30,30,60,0.55)" }}
                          >
                            {card.reasons[0]}
                          </p>
                        ) : null}
                      </div>

                      {/* Sync ring */}
                      <RendezvousSyncRing
                        percent={card.syncPercent}
                        size={36}
                        strokeWidth={2.5}
                        color={bestCtxColor}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes rv-load-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.3); }
        }
        @keyframes rv-glow-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
