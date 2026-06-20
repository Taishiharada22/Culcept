"use client";
// 開発確認用 preview（削除せず保持）。isTravelDayDetailEnabled() で gate し、
// production / flag OFF では notFound()（404 相当）＝閲覧不可。dev / flag ON のみ表示。
import * as React from "react";
import { notFound } from "next/navigation";
import TravelDayDetail from "../(culcept)/calendar/_components/travel/TravelDayDetail";
import { getSampleTripDay } from "../(culcept)/calendar/_lib/travel/sampleTrip";
import { isTravelDayDetailEnabled } from "../(culcept)/calendar/_lib/travel/flags";

export default function TravelPreviewPage() {
  // production または flag OFF では公開しない（P0 freeze blocker 解消）。
  // 値は build/env で確定する定数（NODE_ENV + flag）のため、環境ごとに分岐は不変＝hooks 規則に抵触しない。
  if (!isTravelDayDetailEnabled()) {
    notFound();
  }

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
