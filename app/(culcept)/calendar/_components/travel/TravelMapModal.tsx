// app/(culcept)/calendar/_components/travel/TravelMapModal.tsx
// 「地図を開く / 地図で見る」押下時のみ mount され、ここで初めて実 Google 地図を lazy 描画＝コスト抑制。
// flag OFF / key 未設定 / 未 ready / 座標なし → 静的 RouteMapPreview に fail-open（捏造しない）。
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  useGoogleMapsScript,
  type GmapsMap,
  type GmapsMarker,
  type GmapsPolyline,
} from "@/lib/shared/googleMapsLoader";
import type { RouteStop } from "../../_lib/travel/types";
import type { MapFocus } from "./screenProps";
import { isTravelMapLiveEnabled } from "../../_lib/travel/flags";
import { RouteMapPreview } from "./RouteMapPreview";
import { T } from "./concierge/primitives";
import { ChevronLeft, Map as MapGlyph } from "./concierge/icons";

function externalMapUrl(stops: RouteStop[], focus?: MapFocus): string {
  if (focus?.point) {
    return `https://www.google.com/maps/search/?api=1&query=${focus.point.lat},${focus.point.lng}`;
  }
  const pts = stops.filter((s) => s.coords).map((s) => s.coords!);
  if (pts.length === 0) return "https://www.google.com/maps";
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${pts[0].lat},${pts[0].lng}`;
  const origin = pts[0];
  const dest = pts[pts.length - 1];
  const waypoints = pts.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");
  const wp = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "";
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}${wp}`;
}

export function TravelMapModal({
  stops,
  focus,
  onClose,
}: {
  stops: RouteStop[];
  focus?: MapFocus;
  onClose: () => void;
}) {
  const { ready, keyAvailable } = useGoogleMapsScript();
  const elRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GmapsMap | null>(null);
  const markersRef = React.useRef<GmapsMarker[]>([]);
  const lineRef = React.useRef<GmapsPolyline | null>(null);

  const coordStops = React.useMemo(() => stops.filter((s) => s.coords), [stops]);
  const live = isTravelMapLiveEnabled() && keyAvailable && coordStops.length > 0;

  React.useEffect(() => {
    if (!live || !ready || !elRef.current || !window.google?.maps) return;
    const g = window.google.maps;
    const pts = coordStops.map((s) => s.coords!);

    const map = new g.Map(elRef.current, {
      center: focus?.point ?? pts[0],
      zoom: 14,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
    });
    mapRef.current = map;

    const bounds = new g.LatLngBounds();
    markersRef.current = coordStops.map((s) => {
      bounds.extend(s.coords!);
      return new g.Marker({
        position: s.coords!,
        map,
        title: s.name,
        label: { text: String(s.order), color: "#fdf8ee", fontSize: "12px", fontWeight: "700" },
      });
    });
    lineRef.current = new g.Polyline({
      path: pts,
      map,
      strokeColor: "#a98a55",
      strokeOpacity: 0.9,
      strokeWeight: 3,
      geodesic: true,
    });

    if (focus?.point) {
      map.setCenter(focus.point);
      map.setZoom(16);
    } else if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
    }

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      lineRef.current?.setMap(null);
      lineRef.current = null;
      mapRef.current = null;
    };
  }, [live, ready, coordStops, focus]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: T.bg }}
    >
      <div
        className="flex items-center px-2 py-3"
        style={{ background: `${T.bg}f5`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <button onClick={onClose} aria-label="閉じる" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: T.ink2 }}>
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 text-center font-serif text-[17px]" style={{ color: T.ink, fontWeight: 600 }}>
          {focus?.title ?? "ルートマップ"}
        </div>
        <div className="w-9" />
      </div>

      <div className="relative flex-1">
        {live ? (
          <>
            <div ref={elRef} className="h-full w-full" aria-label="ルート地図" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: T.bgWarm, color: T.ink3 }}>
                <span className="text-[13px]">地図を読み込み中…</span>
              </div>
            )}
            <span className="absolute bottom-1 right-2 text-[9.5px]" style={{ color: T.ink3 }}>Powered by Google</span>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <RouteMapPreview stops={stops} showTransportIcons height={260} className="w-full max-w-md" />
            <p className="text-center text-[12px]" style={{ color: T.ink3 }}>
              簡易プレビュー表示です。詳しい地図は外部マップでご確認ください。
            </p>
          </div>
        )}
      </div>

      <div className="px-4 py-3" style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.card }}>
        <a
          href={externalMapUrl(stops, focus)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-medium"
          style={{ background: T.cardAlt, border: `1px solid ${T.border}`, color: T.ink2 }}
        >
          <MapGlyph size={16} /> Google マップで開く
        </a>
      </div>
    </motion.div>
  );
}
