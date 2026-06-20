// app/(culcept)/calendar/_components/travel/PhotoSlot.tsx
// 写真スロット。3状態：実写真(<img>) / 未取得デモ(abstract placeholder・捏造しない) / 未設定(「＋写真を追加」blank)。
// CEO 指定「自動下書き・最終はユーザー」を構造化：source 表示＋差し替え/追加 affordance。
"use client";

import * as React from "react";
import type { TravelPhoto, PhotoTone } from "../../_lib/travel/types";
import { Plus, Camera, Pencil } from "./concierge/icons";
import { T, SkeletonBlock } from "./concierge/primitives";

// 4-stop の対角グラデ（光→陰）で photographic な深みを出す（捏造しない abstract タイル）。
const TONE_GRADIENT: Record<PhotoTone, string> = {
  sunset: "linear-gradient(150deg, #f0d2a4 0%, #d2a268 48%, #9a7444 82%, #6f5232 100%)",
  temple: "linear-gradient(150deg, #ddc79c 0%, #b89a68 52%, #8a6f47 100%)",
  garden: "linear-gradient(150deg, #cdd6a6 0%, #97a36a 52%, #6b7748 100%)",
  food: "linear-gradient(150deg, #eed7ab 0%, #c79c6a 52%, #97703f 100%)",
  street: "linear-gradient(150deg, #e2d6bd 0%, #ad9d80 52%, #7d6f56 100%)",
  stay: "linear-gradient(150deg, #ddccae 0%, #a08c6e 52%, #74634a 100%)",
  neutral: "linear-gradient(150deg, #e6dbc6 0%, #b6a888 52%, #877a5e 100%)",
};

// 上部の柔らかいハイライト＋右下の陰で光源を示唆。
const SHEEN: React.CSSProperties = {
  background:
    "radial-gradient(120% 80% at 26% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 44%)," +
    "radial-gradient(120% 120% at 82% 112%, rgba(40,28,14,0.24) 0%, rgba(40,28,14,0) 56%)",
};

// 縁の収まり（内側 1px ハイライト＋下端の vignette）。
const VIGNETTE: React.CSSProperties = {
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 -30px 44px -30px rgba(40,28,14,0.32)",
};

const TEXTURE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.12) 0.5px, transparent 0.5px), radial-gradient(rgba(40,28,14,0.05) 0.5px, transparent 0.5px)",
  backgroundSize: "9px 9px, 15px 15px",
  backgroundPosition: "0 0, 4px 7px",
};

export function PhotoSlot({
  photo,
  className = "",
  rounded = "rounded-2xl",
  showLabel = false,
  editable = false,
  loading = false,
  onChange,
  onAdd,
  ariaLabel,
}: {
  photo: TravelPhoto | null;
  className?: string;
  rounded?: string;
  showLabel?: boolean;
  editable?: boolean;
  loading?: boolean;
  onChange?: () => void;
  onAdd?: () => void;
  ariaLabel?: string;
}) {
  // 読み込み中（main 接続後の非同期取得）→ shimmer
  if (loading) {
    return <SkeletonBlock className={className} rounded={rounded} />;
  }

  // 未設定 → blank「＋写真を追加」
  if (!photo) {
    return (
      <button
        type="button"
        onClick={onAdd}
        aria-label="写真を追加"
        className={`flex flex-col items-center justify-center gap-1 border border-dashed ${rounded} ${className}`}
        style={{ borderColor: T.goldSoft, background: T.cardAlt, color: T.ink3 }}
      >
        <Plus size={18} />
        <span className="text-[10px] font-medium leading-none">写真を追加</span>
      </button>
    );
  }

  // 実写真
  if (photo.url) {
    return (
      <div className={`relative overflow-hidden ${rounded} ${className}`} style={{ background: T.cardSunk }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 旅程写真（将来 user/auto 由来）・next/image domain 設定回避 */}
        <img src={photo.url} alt={ariaLabel ?? photo.caption ?? ""} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        {editable && <EditDot onClick={onChange} />}
      </div>
    );
  }

  // placeholder（abstract タイル・実写真でないことを小マーカーで明示）
  const tone = photo.tone ?? "neutral";
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ background: TONE_GRADIENT[tone], ...VIGNETTE }}
      aria-label={ariaLabel ?? photo.label ?? "写真（サンプル）"}
    >
      <div className="absolute inset-0" style={TEXTURE} aria-hidden />
      <div className="absolute inset-0" style={SHEEN} aria-hidden />
      {/* 実写真でない印（honesty） */}
      <span
        className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[8px] font-medium"
        style={{ background: "rgba(255,255,255,0.5)", color: T.ink2, backdropFilter: "blur(2px)" }}
      >
        <Camera size={9} /> サンプル
      </span>
      {showLabel && photo.label && (
        <span
          className="absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "rgba(255,255,255,0.62)", color: T.ink, backdropFilter: "blur(2px)" }}
        >
          {photo.label}
        </span>
      )}
      {editable && <EditDot onClick={onChange} />}
    </div>
  );
}

function EditDot({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label="写真を差し替え"
      className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full"
      style={{ background: "rgba(255,255,255,0.85)", color: T.ink2, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
    >
      <Pencil size={12} />
    </button>
  );
}
