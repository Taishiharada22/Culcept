// app/(culcept)/calendar/_components/travel/TravelDayDetail.tsx
// 旅の1日詳細 full-screen overlay shell。内部で 6画面（＋guide/mypage placeholder）を切替、bottom nav と
// 地図モーダル（lazy 実 Google 地図）を管理。カレンダー日付クリック→「旅の詳細を見る」から開かれる。
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Trip, TripDay, TravelScreen } from "../../_lib/travel/types";
import type { TravelScreenProps, MapFocus } from "./screenProps";
import { T, TravelBottomNav } from "./concierge/primitives";
import { Check } from "./concierge/icons";
import { TravelItineraryProvider } from "./state/ItineraryContext";
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
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
    onToast: showToast,
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
        return <LocationNotesScreen onClose={screenProps.onClose} onToast={showToast} />;
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
      <TravelItineraryProvider currentTripId={trip.id} currentDayId={day.id} currentDate={day.date}>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* 画面切替は keyed remount の fade-in のみ（AnimatePresence mode="wait" は exit が stuck し得るため不使用）。 */}
        <motion.div
          key={screen}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18 }}
          className="min-h-full"
        >
          {renderScreen()}
        </motion.div>
      </div>

      <TravelBottomNav active={navActive} onSelect={(k) => setScreen(k as TravelScreen)} />

      <AnimatePresence>
        {mapFocus && (
          <TravelMapModal stops={day.routeStops} focus={mapFocus} onClose={() => setMapFocus(null)} />
        )}
      </AnimatePresence>

      {/* 画面共通トースト */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-6"
          >
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-medium"
              style={{ background: T.ink, color: "#f7f1e6", boxShadow: "0 8px 28px rgba(60,45,20,0.28)" }}
            >
              {/* 成功系のみ check。情報/エラー系（準備中・対応していません・失敗・済み 等）は中立ドット（偽の成功表示を出さない＝honesty） */}
              {/(まだ|準備中|接続後|対応していません|失敗|済み|承ります)/.test(toast) ? (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.goldSoft }} aria-hidden />
              ) : (
                <Check size={14} style={{ color: T.goldSoft }} />
              )}
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </TravelItineraryProvider>
    </motion.div>
  );
}
