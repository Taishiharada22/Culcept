// app/(culcept)/calendar/_components/travel/locationNotes/LocationNotesScreen.tsx
// Location Notes（ロケーションノート）画面。下部ナビ「Location Notes」タブの中身。
// 上部に Concept 7 形式タブ（都道府県/Match/旅行/スポット/王道/穴場/テーマ/検索/＋）。
// 保存(heart)・旅程に追加(toast)・追加フォーム(in-memory) を session 内で機能させる（main 未接続）。
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LocationItem, LocationNotesData } from "../../../_lib/travel/types";
import { getLocationNotes } from "../../../_lib/travel/locationNotesData";
import { T, ConciergeHeader } from "../concierge/primitives";
import { Bell, Check } from "../concierge/icons";
import { TopTabBar, type LocationTab } from "./TopTabBar";
import { MatchView } from "./views/MatchView";
import { TravelView } from "./views/TravelView";
import { SpotView } from "./views/SpotView";
import { ClassicsView } from "./views/ClassicsView";
import { HiddenView } from "./views/HiddenView";
import { ThemesView } from "./views/ThemesView";
import { SearchView } from "./views/SearchView";
import { AddView } from "./views/AddView";
import type { LocationViewProps } from "./viewTypes";

export default function LocationNotesScreen({ onClose }: { onClose: () => void }) {
  const base = getLocationNotes("京都府"); // 都道府県候補・テーマ等の不変メタ参照用
  const [prefecture, setPrefecture] = React.useState(base.defaultPrefecture);
  const [tab, setTab] = React.useState<LocationTab>("match");
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const [userItems, setUserItems] = React.useState<LocationItem[]>([]);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // prefecture 絞り込み＋ユーザー追加分マージ
  const data: LocationNotesData = React.useMemo(() => {
    const d = getLocationNotes(prefecture);
    const mine = userItems.filter((it) => it.prefecture === prefecture);
    return { ...d, items: [...mine, ...d.items] };
  }, [prefecture, userItems]);

  const toggleSave = React.useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); showToast("保存しました"); }
      return next;
    });
  }, [showToast]);

  const addToItinerary = React.useCallback((item: LocationItem) => {
    showToast(`「${item.title}」を旅程に追加しました`);
  }, [showToast]);

  const viewProps: LocationViewProps = {
    data,
    prefecture,
    savedIds,
    onToggleSave: toggleSave,
    onAddToItinerary: addToItinerary,
    onGoToAdd: () => setTab("add"),
  };

  const renderView = () => {
    switch (tab) {
      case "match": return <MatchView {...viewProps} />;
      case "travel": return <TravelView {...viewProps} />;
      case "spot": return <SpotView {...viewProps} />;
      case "classic": return <ClassicsView {...viewProps} />;
      case "hidden": return <HiddenView {...viewProps} />;
      case "theme": return <ThemesView {...viewProps} />;
      case "search": return <SearchView {...viewProps} />;
      case "add":
        return (
          <AddView
            prefecture={prefecture}
            themes={data.themes}
            onAddItem={(item) => {
              setUserItems((prev) => [item, ...prev]);
              showToast(`「${item.title}」を追加しました`);
              setTab(item.kind === "trip" ? "travel" : "spot");
            }}
          />
        );
    }
  };

  return (
    <div className="min-h-full">
      <ConciergeHeader
        title="Location Notes"
        subLabel="ロケーションノート"
        sansTitle
        onBack={onClose}
        right={<button aria-label="通知" className="flex h-9 w-9 items-center justify-center" style={{ color: T.ink2 }}><Bell size={19} /></button>}
      />
      <TopTabBar
        active={tab}
        onSelect={setTab}
        prefecture={prefecture}
        prefectures={data.prefectures}
        onPrefectureChange={setPrefecture}
      />

      <div className="px-4 pb-8 pt-3">
        {/* タブ切替は keyed remount による fade-in のみ（exit-wait はネスト AnimatePresence で stuck するため不使用）。 */}
        <motion.div
          key={tab + prefecture}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {renderView()}
        </motion.div>
      </div>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-medium shadow-lg" style={{ background: T.ink, color: "#f7f1e6" }}>
              <Check size={14} style={{ color: T.goldSoft }} />
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
