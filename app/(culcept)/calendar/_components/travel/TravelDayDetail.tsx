// app/(culcept)/calendar/_components/travel/TravelDayDetail.tsx
// 旅の1日詳細 full-screen overlay shell。内部で 6画面（＋guide/mypage placeholder）を切替、bottom nav と
// 地図モーダル（lazy 実 Google 地図）を管理。カレンダー日付クリック→「旅の詳細を見る」から開かれる。
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Trip, TripDay, TravelScreen } from "../../_lib/travel/types";
import type { TravelScreenProps, MapFocus } from "./screenProps";
import { T, TravelBottomNav } from "./concierge/primitives";
import { TravelMapModal } from "./TravelMapModal";
import ConciergeDashboard from "./ConciergeDashboard";
import ScheduleDetailScreen from "./ScheduleDetailScreen";
import ReservationsScreen from "./ReservationsScreen";
import MealSuggestionScreen from "./MealSuggestionScreen";
import BudgetSnapshotScreen from "./BudgetSnapshotScreen";
import MoveDetailsScreen from "./MoveDetailsScreen";
import LocationNotesScreen from "./locationNotes/LocationNotesScreen";

const NAV_TABS = new Set<TravelScreen>(["dashboard", "schedule", "reservations", "locationNotes"]);

export default function TravelDayDetail({
  trip,
  day,
  onClose,
}: {
  trip: Trip;
  day: TripDay;
  onClose: () => void;
}) {
  const [screen, setScreen] = React.useState<TravelScreen>("dashboard");
  const [mapFocus, setMapFocus] = React.useState<MapFocus | null>(null);

  // 背景スクロールを抑制
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape：地図 → 閉じる、なければ overlay を閉じる
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mapFocus) setMapFocus(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapFocus, onClose]);

  const screenProps: TravelScreenProps = {
    trip,
    day,
    onNavigate: setScreen,
    // dashboard の戻る＝overlay を閉じる。sub 画面の戻る＝dashboard へ。
    onClose: screen === "dashboard" ? onClose : () => setScreen("dashboard"),
    onOpenMap: (focus?: MapFocus) => setMapFocus(focus ?? {}),
  };

  const renderScreen = () => {
    switch (screen) {
      case "dashboard":
        return <ConciergeDashboard {...screenProps} />;
      case "schedule":
        return <ScheduleDetailScreen {...screenProps} />;
      case "reservations":
        return <ReservationsScreen {...screenProps} />;
      case "meal":
        return <MealSuggestionScreen {...screenProps} />;
      case "budget":
        return <BudgetSnapshotScreen {...screenProps} />;
      case "move":
        return <MoveDetailsScreen {...screenProps} />;
      case "locationNotes":
        return <LocationNotesScreen onClose={screenProps.onClose} />;
    }
  };

  const navActive = NAV_TABS.has(screen) ? screen : "dashboard";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", damping: 32, stiffness: 320 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: T.bg }}
    >
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="min-h-full"
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </div>

      <TravelBottomNav active={navActive} onSelect={(k) => setScreen(k as TravelScreen)} />

      <AnimatePresence>
        {mapFocus && (
          <TravelMapModal stops={day.routeStops} focus={mapFocus} onClose={() => setMapFocus(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
