"use client";
// TEMP 検証専用ページ（auth 不要の /stargazer プレフィックス公開ルート）。検証後に削除する。
import * as React from "react";
import TravelDayDetail from "../(culcept)/calendar/_components/travel/TravelDayDetail";
import { getSampleTripDay } from "../(culcept)/calendar/_lib/travel/sampleTrip";

export default function TravelPreviewPage() {
  const { trip, day } = getSampleTripDay("2026-06-24");
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ minHeight: "100vh", background: "#f5efe6" }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ margin: 20, padding: "10px 16px" }}>
          旅の詳細を開く
        </button>
      )}
      {open && <TravelDayDetail trip={trip} day={day} onClose={() => setOpen(false)} />}
    </div>
  );
}
