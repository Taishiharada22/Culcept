"use client";

/**
 * PhotoCarousel
 * 水平スワイプ写真カルーセル（詳細ページ用）
 * レイジーロード + ブラープレースホルダー
 * revealLevel: 段階写真開示（ブラープログレッション）
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase/client";

type Photo = {
  id: string;
  url: string;
  displayOrder: number;
};

export type RevealLevel = "heavy" | "medium" | "clear";

type Props = {
  userId: string;
  /** フォールバック: 写真がない場合のアバターURL */
  fallbackAvatarUrl?: string | null;
  /** フォールバック: イニシャル表示用の名前 */
  fallbackName?: string;
  height?: number;
  /** 段階開示レベル: heavy=blur(20px), medium=blur(8px), clear=なし */
  revealLevel?: RevealLevel;
};

const BLUR_CONFIG: Record<RevealLevel, { filter: string; message: string | null }> = {
  heavy: { filter: "blur(20px)", message: "軌道がつながると写真が見えます" },
  medium: { filter: "blur(8px)", message: "もう少しで鮮明に..." },
  clear: { filter: "none", message: null },
};

export default function PhotoCarousel({
  userId,
  fallbackAvatarUrl,
  fallbackName,
  height = 280,
  revealLevel = "clear",
}: Props) {
  const supabase = supabaseBrowser();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const blur = BLUR_CONFIG[revealLevel];

  // Load photos for target user
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("rendezvous_photos")
          .select("id, storage_path, display_order")
          .eq("user_id", userId)
          .order("display_order");

        if (data && data.length > 0) {
          const items: Photo[] = data.map((row: { id: string; storage_path: string; display_order: number }) => {
            const { data: urlData } = supabase.storage
              .from("rendezvous-photos")
              .getPublicUrl(row.storage_path);
            return {
              id: row.id,
              url: urlData?.publicUrl ?? "",
              displayOrder: row.display_order,
            };
          });
          setPhotos(items);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, supabase]);

  // Handle scroll to update active index
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIdx(idx);
  }, []);

  // No photos: show fallback
  if (!loading && photos.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: fallbackAvatarUrl
            ? `url(${fallbackAvatarUrl}) center/cover`
            : `linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.04) 100%)`,
          borderRadius: 16,
          overflow: "hidden",
          filter: revealLevel !== "clear" ? blur.filter : "none",
        }}
      >
        {!fallbackAvatarUrl && fallbackName && (
          <span
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "rgba(99,102,241,0.3)",
            }}
          >
            {fallbackName.slice(0, 2)}
          </span>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(99,102,241,0.03)",
          borderRadius: 16,
        }}
      >
        <span style={{ fontSize: 12, color: "rgba(30,30,60,0.25)" }}>...</span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Scrollable container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          overflowX: revealLevel === "clear" ? "auto" : "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {photos.map((photo) => (
          <motion.div
            key={photo.id}
            animate={{ filter: blur.filter }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              flexShrink: 0,
              width: "100%",
              height,
              scrollSnapAlign: "start",
              background: `url(${photo.url}) center/cover`,
              backgroundRepeat: "no-repeat",
            }}
          />
        ))}
      </div>

      {/* Blur overlay message */}
      <AnimatePresence>
        {blur.message && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(30,30,60,0.08)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(8px)",
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(30,30,60,0.6)",
                boxShadow: "0 2px 12px rgba(99,102,241,0.1)",
              }}
            >
              {revealLevel === "heavy" ? "🔒" : "✨"} {blur.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dot indicators */}
      {photos.length > 1 && revealLevel === "clear" && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 5,
          }}
        >
          {photos.map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: i === activeIdx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
