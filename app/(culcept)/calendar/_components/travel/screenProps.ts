// app/(culcept)/calendar/_components/travel/screenProps.ts
import type { Trip, TripDay, TravelScreen, LatLng } from "../../_lib/travel/types";

export interface MapFocus {
  title?: string;
  focusOrder?: number; // route stop の order でフォーカス
  point?: LatLng; // 単一地点にフォーカス（予約「地図で見る」など）
}

/** 全 travel 画面共通の props。 */
export interface TravelScreenProps {
  trip: Trip;
  day: TripDay;
  onNavigate: (screen: TravelScreen) => void;
  onClose: () => void;
  onOpenMap: (focus?: MapFocus) => void;
}
