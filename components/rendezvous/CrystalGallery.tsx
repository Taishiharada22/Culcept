"use client";

import { useState, useCallback, useRef, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Crystal } from "@/lib/rendezvous/memoryCrystal";
import CrystalVisualizer from "@/components/rendezvous/CrystalVisualizer";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";

type Props = {
  crystals: Crystal[];
  candidateId: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  const weeks = Math.floor(days / 7);
  return `${weeks}週間前`;
}

/** Popover that flips below the crystal when it would overflow the top of the viewport */
function PopoverContent({ crystal }: { crystal: Crystal }) {
  const ref = useRef<HTMLDivElement>(null);
  const [placeBelow, setPlaceBelow] = useState(false);

  useLayoutEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      if (rect.top < 0) {
        setPlaceBelow(true);
      }
    }
  }, []);

  const positionStyle: React.CSSProperties = placeBelow
    ? { position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)" }
    : { position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)" };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: placeBelow ? -4 : 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: placeBelow ? -4 : 4, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      style={{
        ...positionStyle,
        minWidth: 130,
        padding: "8px 12px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(99,102,241,0.08)",
        boxShadow: "0 4px 16px rgba(30,30,60,0.08)",
        zIndex: 10,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: crystal.colorHex,
          marginBottom: 2,
        }}
      >
        {crystal.name}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "rgba(30,30,60,0.35)",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
        }}
      >
        {relativeTime(crystal.messageRange.start)}
      </div>
    </motion.div>
  );
}

export default function CrystalGallery({ crystals, candidateId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleTap = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  if (crystals.length === 0) {
    return (
      <GlassCard padding="md" hoverEffect={false}>
        <div
          style={{
            textAlign: "center",
            padding: "24px 16px",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(99,102,241,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 10px",
            }}
          >
            <svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <path
                d="M9 2L11 7L16 7.5L12.5 11L13.5 16L9 13.5L4.5 16L5.5 11L2 7.5L7 7L9 2Z"
                stroke="rgba(99,102,241,0.3)"
                strokeWidth={1}
                fill="none"
              />
            </svg>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "rgba(30,30,60,0.35)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            まだ記憶の結晶はありません
          </p>
          <p
            style={{
              fontSize: 10,
              color: "rgba(30,30,60,0.2)",
              margin: "4px 0 0",
            }}
          >
            会話を重ねると、特別な瞬間が結晶になります
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {crystals.map((crystal, i) => (
          <FadeInView key={crystal.id} delay={i * 0.08}>
            <div
              onClick={() => handleTap(crystal.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                position: "relative",
                padding: "12px 4px",
                borderRadius: 14,
                background:
                  selectedId === crystal.id
                    ? "rgba(99,102,241,0.06)"
                    : "transparent",
                transition: "background 0.2s",
              }}
            >
              <CrystalVisualizer crystal={crystal} size="sm" />
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(30,30,60,0.45)",
                  fontWeight: 600,
                  textAlign: "center",
                  lineHeight: 1.3,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {crystal.name}
              </span>

              {/* Popover */}
              <AnimatePresence>
                {selectedId === crystal.id && (
                  <PopoverContent crystal={crystal} />
                )}
              </AnimatePresence>
            </div>
          </FadeInView>
        ))}
      </div>
    </div>
  );
}
