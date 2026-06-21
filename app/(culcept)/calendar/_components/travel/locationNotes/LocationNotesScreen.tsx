// app/(culcept)/calendar/_components/travel/locationNotes/LocationNotesScreen.tsx
// Location Notes（ロケーションノート）画面。下部ナビ「Location Notes」タブの中身。
// 上部に Concept 7 形式タブ（都道府県/Match/旅行/スポット/王道/穴場/テーマ/検索/＋）。
// 保存(heart=session内) / 旅程に追加(ItineraryContext で Schedule/Dashboard に実反映) / 追加フォーム / 詳細シート
// を機能させる（main 未接続。toast は画面共通 onToast を使用）。
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type { LocationItem, LocationNotesData } from "../../../_lib/travel/types";
import { getLocationNotes } from "../../../_lib/travel/locationNotesData";
import { readSavedIds, writeSavedIds, readUserNotes, writeUserNotes } from "../../../_lib/travel/travelLocalStore";
import { ConciergeHeader } from "../concierge/primitives";
import { Bell } from "../concierge/icons";
import { useTravelItinerary } from "../state/ItineraryContext";
import { TopTabBar, type LocationTab } from "./TopTabBar";
import { MatchView } from "./views/MatchView";
import { TravelView } from "./views/TravelView";
import { SpotView } from "./views/SpotView";
import { ClassicsView } from "./views/ClassicsView";
import { HiddenView } from "./views/HiddenView";
import { ThemesView } from "./views/ThemesView";
import { SearchView } from "./views/SearchView";
import { AddView } from "./views/AddView";
import { LocationDetailSheet } from "./LocationDetailSheet";
import type { LocationViewProps } from "./viewTypes";

export default function LocationNotesScreen({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const base = getLocationNotes("京都府"); // 都道府県候補等の不変メタ参照
  const [prefecture, setPrefecture] = React.useState(base.defaultPrefecture);
  const [tab, setTab] = React.useState<LocationTab>("match");
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const [userItems, setUserItems] = React.useState<LocationItem[]>([]);
  const [detailItem, setDetailItem] = React.useState<LocationItem | null>(null);

  // savedIds / userItems を localStorage から lazy init（mount 後 hydrate＝SSR mismatch 回避）。flag OFF 時は本画面が mount されない。
  React.useEffect(() => {
    const ids = readSavedIds();
    if (ids.length > 0) setSavedIds(new Set(ids));
  }, []);
  React.useEffect(() => {
    const items = readUserNotes();
    if (items.length > 0) setUserItems(items);
  }, []);

  // 変更時 persist（hydrate 直後の初回 skip で上書きレース防止）。
  const savedReady = React.useRef(false);
  React.useEffect(() => {
    if (!savedReady.current) {
      savedReady.current = true;
      return;
    }
    writeSavedIds([...savedIds]);
  }, [savedIds]);
  const notesReady = React.useRef(false);
  React.useEffect(() => {
    if (!notesReady.current) {
      notesReady.current = true;
      return;
    }
    writeUserNotes(userItems);
  }, [userItems]);

  const { addToItinerary: addItin, hasAdded } = useTravelItinerary();

  // prefecture 絞り込み＋ユーザー追加分マージ
  const data: LocationNotesData = React.useMemo(() => {
    const d = getLocationNotes(prefecture);
    const mine = userItems.filter((it) => it.prefecture === prefecture);
    return { ...d, items: [...mine, ...d.items] };
  }, [prefecture, userItems]);

  const toggleSave = React.useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        onToast("保存しました");
      }
      return next;
    });
  }, [onToast]);

  const addToItinerary = React.useCallback((item: LocationItem) => {
    const ok = addItin(item);
    onToast(ok ? `「${item.title}」を旅程に追加しました` : "すでに旅程に追加済みです");
  }, [addItin, onToast]);

  const viewProps: LocationViewProps = {
    data,
    prefecture,
    savedIds,
    isAdded: hasAdded,
    onToggleSave: toggleSave,
    onAddToItinerary: addToItinerary,
    onOpenDetail: setDetailItem,
    onOpenTab: setTab,
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
            onToast={onToast}
            onAddItem={(item) => {
              setUserItems((prev) => [item, ...prev]);
              onToast(`「${item.title}」を追加しました`);
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
        right={
          <button
            onClick={() => onToast("通知はまだありません")}
            aria-label="通知"
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-90"
            style={{ color: "#6a6051" }}
          >
            <Bell size={19} />
          </button>
        }
      />
      <TopTabBar
        active={tab}
        onSelect={setTab}
        prefecture={prefecture}
        prefectures={data.prefectures}
        onPrefectureChange={setPrefecture}
      />

      <div className="px-4 pb-8 pt-3">
        <motion.div
          key={tab + prefecture}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {renderView()}
        </motion.div>
      </div>

      <LocationDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        saved={detailItem ? savedIds.has(detailItem.id) : false}
        added={detailItem ? hasAdded(detailItem.id) : false}
        onToggleSave={() => detailItem && toggleSave(detailItem.id)}
        onAddToItinerary={() => detailItem && addToItinerary(detailItem)}
      />
    </div>
  );
}
