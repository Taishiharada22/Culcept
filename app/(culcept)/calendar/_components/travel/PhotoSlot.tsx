// app/(culcept)/calendar/_components/travel/PhotoSlot.tsx
// 写真スロット。3状態：実写真(<img>) / 未取得デモ(abstract placeholder・捏造しない) / 未設定(「＋写真を追加」blank)。
// CEO 指定「自動下書き・最終はユーザー」を構造化：source 表示＋差し替え/追加 affordance。
"use client";

import * as React from "react";
import type { TravelPhoto, PhotoTone } from "../../_lib/travel/types";
import { Plus, Camera, Pencil } from "./concierge/icons";
import { T } from "./concierge/primitives";

const TONE_GRADIENT: Record<PhotoTone, string> = {
  sunset: "linear-gradient(135deg, #e9c79a 0%, #c89a63 55%, #8f6f4c 100%)",
  temple: "linear-gradient(135deg, #d4bd96 0%, #a98f63 100%)",
  garden: "linear-gradient(135deg, #c2cda0 0%, #8a9663 100%)",
  food: "linear-gradient(135deg, #e7d0a6 0%, #bd9667 100%)",
  street: "linear-gradient(135deg, #dacdb4 0%, #a8997e 100%)",
  stay: "linear-gradient(135deg, #d6c6ab 0%, #9d8b70 100%)",
  neutral: "linear-gradient(135deg, #ded3be 0%, #b4a688 100%)",
};

const TEXTURE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
  backgroundSize: "10px 10px, 16px 16px",
  backgroundPosition: "0 0, 5px 8px",
};

export function PhotoSlot({
  photo,
  className = "",
  rounded = "rounded-2xl",
  showLabel = false,
  editable = false,
  onChange,
  onAdd,
  ariaLabel,
}: {
  photo: TravelPhoto | null;
  className?: string;
  rounded?: string;
  showLabel?: boolean;
  editable?: boolean;
  onChange?: () => void;
  onAdd?: () => void;
  ariaLabel?: string;
}) {
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
      style={{ background: TONE_GRADIENT[tone] }}
      aria-label={ariaLabel ?? photo.label ?? "写真（サンプル）"}
    >
      <div className="absolute inset-0" style={TEXTURE} aria-hidden />
      {/* 実写真でない印（honesty） */}
      <span
        className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-medium"
        style={{ background: "rgba(255,255,255,0.55)", color: T.ink2 }}
      >
        <Camera size={9} /> サンプル
      </span>
      {showLabel && photo.label && (
        <span
          className="absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "rgba(255,255,255,0.6)", color: T.ink }}
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
