// app/(culcept)/calendar/_components/travel/locationNotes/LocationNotesScreen.tsx
// Location Notes（ロケーションノート）画面。下部ナビ「Location Notes」タブの中身。
// 上部に Concept 7 形式タブ（都道府県/Match/旅行/スポット/王道/穴場/テーマ/検索/＋）。
// 保存(heart=session内) / 旅程に追加(ItineraryContext で Schedule/Dashboard に実反映) / 追加フォーム / 詳細シート
// を機能させる（main 未接続。toast は画面共通 onToast を使用）。
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type { LocationItem, LocationNotesData } from "../../../_lib/travel/types";
// E-1: fixture/localStorage 直呼びをやめ、repository 境界経由（既定は fixture/localStorage・挙動不変）。
import { EMPTY_LOCATION_NOTES_DATA } from "../../../_lib/travel/locationNotesData";
import { getLocationNotesRepository, getTravelPersonalStore } from "../../../_lib/travel/repository";
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
  const [prefecture, setPrefecture] = React.useState(EMPTY_LOCATION_NOTES_DATA.defaultPrefecture);
  const [tab, setTab] = React.useState<LocationTab>("match");
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const [userItems, setUserItems] = React.useState<LocationItem[]>([]);
  const [detailItem, setDetailItem] = React.useState<LocationItem | null>(null);
  // E-1: 都道府県別データは repository から async ロード（既定 fixture は即解決）。
  //   初期は空メタ（都道府県ピッカーは出るが内容は空）→ ロード後に内容が入る。
  const [baseData, setBaseData] = React.useState<LocationNotesData>(EMPTY_LOCATION_NOTES_DATA);

  // 個人データ（保存/投稿ノート）を store から復元（client-only・mount 後 effect で hydration mismatch 回避）。
  React.useEffect(() => {
    let cancelled = false;
    const store = getTravelPersonalStore();
    void Promise.all([store.readSavedIds(), store.readUserNotes()])
      .then(([ids, notes]) => {
        if (cancelled) return;
        if (ids.length) setSavedIds(new Set(ids));
        if (notes.length) setUserItems(notes);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 都道府県別データを repository から取得（prefecture 変更で再取得・stale は cancelled guard で破棄）。
  React.useEffect(() => {
    let cancelled = false;
    void getLocationNotesRepository()
      .getLocationNotes(prefecture)
      .then((d) => { if (!cancelled) setBaseData(d); })
      .catch(() => { if (!cancelled) setBaseData(EMPTY_LOCATION_NOTES_DATA); });
    return () => { cancelled = true; };
  }, [prefecture]);

  // 変更時 persist（初回 mount の空状態で既存データを上書きしないよう skip-first）。fire-and-forget。
  const savedFirst = React.useRef(true);
  React.useEffect(() => {
    if (savedFirst.current) { savedFirst.current = false; return; }
    void getTravelPersonalStore().writeSavedIds([...savedIds]).catch(() => {});
  }, [savedIds]);
  const notesFirst = React.useRef(true);
  React.useEffect(() => {
    if (notesFirst.current) { notesFirst.current = false; return; }
    void getTravelPersonalStore().writeUserNotes(userItems).catch(() => {});
  }, [userItems]);

  const { addToItinerary: addItin, hasAdded } = useTravelItinerary();

  // baseData（repository）＋ユーザー追加分マージ。
  // E-6A: id で dedup。repo ON では getLocationNotes（RLS）が own private/self_memo も返すため、
  //   readUserNotes 由来の userItems と id が重複し React duplicate-key になる。mine を優先して base から除外。
  //   fixture/localStorage 経路は overlap が無いので挙動不変。
  const data: LocationNotesData = React.useMemo(() => {
    const mine = userItems.filter((it) => it.prefecture === prefecture);
    const mineIds = new Set(mine.map((m) => m.id));
    const base = baseData.items.filter((it) => !mineIds.has(it.id));
    return { ...baseData, items: [...mine, ...base] };
  }, [baseData, userItems, prefecture]);

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
