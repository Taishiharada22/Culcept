"use client";

/**
 * PhotoPreview
 * Phase 0-1 の写真カルーセル + Phase 2 ロック済みスロット
 *
 * - Phase 0: atmosphere photo (明確に表示)
 * - Phase 1: style / best photo (disclosure >= 1 で表示)
 * - Phase 2: 顔写真スロット — フロストガラス + ロックアイコン
 *
 * framer-motion drag でスワイプ可能。
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PhotoSlot = {
  url: string;
  slotType: "atmosphere" | "face" | "best" | "current";
  disclosurePhase: number;
};

export interface PhotoPreviewProps {
  photos: PhotoSlot[];
  currentDisclosureLevel: number;
  partnerRevealRequested: boolean;
  onRequestReveal: () => void;
}

// ---------------------------------------------------------------------------
// Lock overlay for Phase 2 slot
// ---------------------------------------------------------------------------

function LockedPhotoSlot({
  partnerRequested,
  onRequestReveal,
}: {
  partnerRequested: boolean;
  onRequestReveal: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background:
          "linear-gradient(135deg, rgba(194,24,91,0.04) 0%, rgba(255,109,0,0.04) 100%)",
      }}
    >
      {/* Frosted glass overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(20px) saturate(0.5)",
          WebkitBackdropFilter: "blur(20px) saturate(0.5)",
          background: "rgba(255,255,255,0.6)",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Lock icon */}
        <motion.div
          animate={
            partnerRequested
              ? {
                  scale: [1, 1.1, 1],
                  rotate: [0, -5, 5, 0],
                }
              : {}
          }
          transition={{
            duration: 2,
            repeat: partnerRequested ? Infinity : 0,
            ease: "easeInOut",
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: partnerRequested
              ? `linear-gradient(135deg, ${RV_COLORS.primaryLight}15, ${RV_COLORS.accent}15)`
              : "rgba(30,30,60,0.04)",
            border: partnerRequested
              ? `2px solid ${RV_COLORS.primaryLight}30`
              : "2px solid rgba(30,30,60,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          {partnerRequested ? "\u{1F4AB}" : "\u{1F512}"}
        </motion.div>

        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: partnerRequested ? RV_COLORS.primary : RV_COLORS.textMuted,
            textAlign: "center",
            maxWidth: 200,
            lineHeight: 1.5,
          }}
        >
          {partnerRequested
            ? "相手がリクエスト中"
            : "会話が深まると解放されます"}
        </p>

        {partnerRequested && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={onRequestReveal}
            style={{
              marginTop: 4,
              padding: "8px 20px",
              borderRadius: 12,
              background: RV_COLORS.gradient,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              boxShadow: `0 4px 16px ${RV_COLORS.primaryGlow}`,
            }}
          >
            交換する
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhotoPreview main
// ---------------------------------------------------------------------------

export default function PhotoPreview({
  photos,
  currentDisclosureLevel,
  partnerRevealRequested,
  onRequestReveal,
}: PhotoPreviewProps) {
  // Build visible slides: visible photos + Phase 2 locked slot
  const visiblePhotos = photos.filter(
    (p) => p.disclosurePhase <= currentDisclosureLevel,
  );

  // Always add the face slot as the last slide
  const hasFacePhoto = photos.some(
    (p) => p.slotType === "face" && p.disclosurePhase <= currentDisclosureLevel,
  );

  const totalSlides = visiblePhotos.length + (hasFacePhoto ? 0 : 1);
  const [activeIdx, setActiveIdx] = useState(0);
  const constraintsRef = useRef<HTMLDivElement>(null);

  const HEIGHT = 320;

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 50;
      if (info.offset.x < -threshold && activeIdx < totalSlides - 1) {
        setActiveIdx((prev) => prev + 1);
      } else if (info.offset.x > threshold && activeIdx > 0) {
        setActiveIdx((prev) => prev - 1);
      }
    },
    [activeIdx, totalSlides],
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: HEIGHT,
        borderRadius: 20,
        overflow: "hidden",
        background: RV_COLORS.surfaceMuted,
      }}
    >
      {/* Slides container */}
      <div
        ref={constraintsRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <motion.div
          drag="x"
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          animate={{ x: `-${activeIdx * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            display: "flex",
            width: `${totalSlides * 100}%`,
            height: "100%",
            cursor: totalSlides > 1 ? "grab" : "default",
          }}
        >
          {/* Visible photos */}
          {visiblePhotos.map((photo, idx) => (
            <div
              key={`photo-${idx}`}
              style={{
                flex: `0 0 ${100 / totalSlides}%`,
                height: "100%",
                backgroundImage: `url(${photo.url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
          ))}

          {/* Locked face slot */}
          {!hasFacePhoto && (
            <div
              style={{
                flex: `0 0 ${100 / totalSlides}%`,
                height: "100%",
              }}
            >
              <LockedPhotoSlot
                partnerRequested={partnerRevealRequested}
                onRequestReveal={onRequestReveal}
              />
            </div>
          )}
        </motion.div>
      </div>

      {/* Dot indicators */}
      {totalSlides > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            zIndex: 5,
          }}
        >
          {Array.from({ length: totalSlides }, (_, i) => {
            const isLocked = !hasFacePhoto && i === totalSlides - 1;
            return (
              <motion.div
                key={i}
                animate={{
                  scale: i === activeIdx ? 1.2 : 1,
                  opacity: i === activeIdx ? 1 : 0.5,
                }}
                transition={{ duration: 0.2 }}
                onClick={() => setActiveIdx(i)}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isLocked
                    ? RV_COLORS.primaryLight
                    : "rgba(255,255,255,0.9)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  cursor: "pointer",
                  border: isLocked
                    ? `1px solid ${RV_COLORS.primary}40`
                    : "none",
                }}
              />
            );
          })}
        </div>
      )}

      {/* Phase label badge */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 5,
        }}
      >
        <div
          style={{
            padding: "3px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            fontSize: 10,
            fontWeight: 700,
            color: RV_COLORS.textSub,
            letterSpacing: 0.5,
          }}
        >
          {activeIdx < visiblePhotos.length
            ? visiblePhotos[activeIdx]?.slotType === "atmosphere"
              ? "雰囲気"
              : visiblePhotos[activeIdx]?.slotType === "best"
                ? "スタイル"
                : visiblePhotos[activeIdx]?.slotType === "current"
                  ? "最近"
                  : "写真"
            : "顔写真"}
        </div>
      </div>
    </div>
  );
}
