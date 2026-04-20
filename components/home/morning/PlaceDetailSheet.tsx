"use client";

/**
 * PlaceDetailSheet — 場所タップ時の bottom sheet
 *
 * CEO方針 2026-04-17:
 *   プランの場所をタップすると Home ページの下から出てくるシート。
 *   地図（引いた状態で表示）+ 住所 + 性質情報（activity 別）を表示する。
 *   リコメンドの有無に限らず、性質情報は必ず表示する。
 *
 *   親要素の transform に閉じ込められないよう React Portal で body に直接描画する。
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, Star } from "lucide-react";
import type { MainLocation, PlacePropertyHints } from "@/lib/alter-morning/types";
import { HINT_LABELS, formatHintValue } from "@/lib/alter-morning/propertyHints";

interface PlaceDetailSheetProps {
  open: boolean;
  location: MainLocation | null;
  /** リコメンド理由（Alter 提案時に表示） */
  recommendReason?: string;
  onClose: () => void;
}

/** Google Maps URL（新規タブで開く用） */
function mapLink(loc: MainLocation): string {
  if (loc.lat !== undefined && loc.lng !== undefined) {
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  }
  const q = encodeURIComponent([loc.resolvedName ?? loc.label, loc.address].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * Google Maps embed iframe URL。
 *
 * CEO方針: ある程度引いた状態でマップ自体を表示。
 * - lat/lng があれば z=14 で広域を見せる（z=15 は狭すぎた）
 * - 無くても resolvedName / label / address でクエリ検索 → 自動ズーム
 *
 * 常に embed を返す（場所が特定できなくても地図は出す）。
 */
function mapEmbedSrc(loc: MainLocation): string {
  if (loc.lat !== undefined && loc.lng !== undefined) {
    // z=14 で周辺が見える程度に引いた表示
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}&z=14&output=embed`;
  }
  if (loc.placeId) {
    return `https://www.google.com/maps?q=place_id:${loc.placeId}&z=14&output=embed`;
  }
  // フォールバック: 名前+住所でクエリ検索（API キー不要、ズームは Google 自動決定）
  const q = encodeURIComponent(
    [loc.resolvedName ?? loc.label, loc.address].filter(Boolean).join(" "),
  );
  return `https://maps.google.com/maps?q=${q}&z=14&output=embed`;
}

export function PlaceDetailSheet({ open, location, recommendReason, onClose }: PlaceDetailSheetProps) {
  // Portal mount guard（SSR で document が無い環境でもエラーにならないように）
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!mounted) return null;

  const sheet = (
    <AnimatePresence>
      {open && location && (
        <>
          {/* backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          {/* sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* header */}
            <div className="flex items-start justify-between px-5 pt-2 pb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-gray-800">
                  <MapPin size={16} className="text-purple-500 flex-shrink-0" />
                  <span className="text-[15px] font-medium truncate">
                    {location.resolvedName ?? location.label}
                  </span>
                </div>
                {location.address && (
                  <div className="text-[11px] text-gray-500 mt-0.5 ml-5 truncate">
                    {location.address}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-1 -mr-1"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            {/* recommend reason（Alter 提案時のみ） */}
            {recommendReason && (
              <div className="mx-5 mb-3 p-3 rounded-xl bg-purple-50/60 border border-purple-200/40">
                <div className="flex items-start gap-1.5">
                  <Star size={12} className="text-purple-500 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-purple-700 leading-relaxed">
                    {recommendReason}
                  </div>
                </div>
              </div>
            )}

            {/* 地図 — 引いた状態で常に表示 */}
            <div className="mx-5 mb-3 rounded-xl overflow-hidden border border-gray-200/60 bg-gray-100">
              <iframe
                src={mapEmbedSrc(location)}
                className="w-full h-56 border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`${location.label} の地図`}
              />
            </div>

            {/* 性質情報 */}
            {location.propertyHints && <PropertyHintsList hints={location.propertyHints} />}

            {/* アクションリンク */}
            <div className="px-5 pb-6 pt-2">
              <a
                href={mapLink(location)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-[12px] py-2.5 rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-colors"
              >
                Google マップで開く
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(sheet, document.body);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PropertyHintsList — 性質情報の表示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PropertyHintsList({ hints }: { hints: PlacePropertyHints }) {
  // 表示順序: 真偽系を先、テキスト系を後
  const booleanSlots: (keyof PlacePropertyHints)[] = [
    "outlets", "wifi", "quietness", "private", "longStayOk", "indoor",
    "parking", "reservationRecommended",
  ];
  const textSlots: (keyof PlacePropertyHints)[] = ["atmosphere", "budget"];

  const entries: Array<{ key: keyof PlacePropertyHints; label: string; value: string; kind: "bool" | "text" }> = [];
  for (const k of booleanSlots) {
    const v = hints[k];
    if (v === undefined) continue;
    entries.push({ key: k, label: HINT_LABELS[k], value: formatHintValue(v as string), kind: "bool" });
  }
  for (const k of textSlots) {
    const v = hints[k];
    if (v === undefined) continue;
    entries.push({ key: k, label: HINT_LABELS[k], value: String(v), kind: "text" });
  }

  if (entries.length === 0) return null;

  return (
    <div className="mx-5 mb-3">
      <div className="text-[10px] text-gray-400 mb-1.5 ml-0.5">この場所の特徴</div>
      <div className="rounded-xl bg-gray-50/70 border border-gray-200/50 divide-y divide-gray-200/50">
        {entries.map((e) => (
          <div key={e.key} className="flex justify-between items-center px-3 py-2">
            <span className="text-[11px] text-gray-600">{e.label}</span>
            <span
              className={`text-[11px] ${
                e.value === "あり" ? "text-green-600 font-medium"
                : e.value === "なし" ? "text-gray-400"
                : e.value === "不明" ? "text-gray-400"
                : "text-gray-700"
              }`}
            >
              {e.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
