// app/(immersive)/stargazer/_components/story/StoryOverlay.tsx
// ストーリーオーバーレイ — アーキタイプ結果を物語として提示
// Core 5枚 + Unlock 最大3枚（データ依存で動的追加）
// ARCHETYPE → CORE TRAIT → DUALITY → [FACES] → [MIRROR] → [DRIFT] → UNOBSERVED → NEXT
// タップ進行 + プログレスバー + 最低滞留時間1.5秒
"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StoryData } from "./storyDataBuilder";
import StoryProgress from "./StoryProgress";
import ArchetypeSlide from "./slides/ArchetypeSlide";
import CoreTraitSlide from "./slides/CoreTraitSlide";
import DualitySlide from "./slides/DualitySlide";
import UnobservedSlide from "./slides/UnobservedSlide";
import NextSlide from "./slides/NextSlide";
import FacesSlide from "./slides/FacesSlide";
import MirrorSlide from "./slides/MirrorSlide";
import DriftSlide from "./slides/DriftSlide";

interface StoryOverlayProps {
  data: StoryData;
  onClose: () => void;
  onNavigateToObserve?: () => void;
}

const MIN_DWELL_MS = 1500;

type SlideEntry = {
  key: string;
  render: (onReady: () => void) => ReactNode;
  isLastSlide?: boolean;
};

export default function StoryOverlay({
  data,
  onClose,
  onNavigateToObserve,
}: StoryOverlayProps) {
  // Build dynamic slide list
  const slides = useMemo<SlideEntry[]>(() => {
    const list: SlideEntry[] = [
      {
        key: "archetype",
        render: (onReady) => <ArchetypeSlide data={data.archetype} onReady={onReady} />,
      },
      {
        key: "coreTrait",
        render: (onReady) => <CoreTraitSlide data={data.coreTrait} onReady={onReady} />,
      },
      {
        key: "duality",
        render: (onReady) => <DualitySlide data={data.duality} onReady={onReady} />,
      },
    ];

    // Unlock slides insert between DUALITY and UNOBSERVED
    if (data.faces) {
      list.push({
        key: "faces",
        render: (onReady) => <FacesSlide data={data.faces!} onReady={onReady} />,
      });
    }
    if (data.mirror) {
      list.push({
        key: "mirror",
        render: (onReady) => <MirrorSlide data={data.mirror!} onReady={onReady} />,
      });
    }
    if (data.drift) {
      list.push({
        key: "drift",
        render: (onReady) => <DriftSlide data={data.drift!} onReady={onReady} />,
      });
    }

    list.push({
      key: "unobserved",
      render: (onReady) => <UnobservedSlide data={data.unobserved} onReady={onReady} />,
    });
    list.push({
      key: "next",
      render: () => (
        <NextSlide data={data.next} onClose={onClose} onNavigateToObserve={onNavigateToObserve} />
      ),
      isLastSlide: true,
    });

    return list;
  }, [data, onClose, onNavigateToObserve]);

  const slideCount = slides.length;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideReady, setSlideReady] = useState(false);
  const [direction, setDirection] = useState(1);
  const enteredAt = useRef(Date.now());

  useEffect(() => {
    enteredAt.current = Date.now();
    // Last slide (NEXT) is always ready since it has interactive buttons
    setSlideReady(slides[currentSlide]?.isLastSlide ?? false);
  }, [currentSlide, slides]);

  const handleSlideReady = useCallback(() => {
    setSlideReady(true);
  }, []);

  const canAdvance = useCallback(() => {
    if (!slideReady) return false;
    return Date.now() - enteredAt.current >= MIN_DWELL_MS;
  }, [slideReady]);

  const goNext = useCallback(() => {
    if (currentSlide >= slideCount - 1) return;
    if (!canAdvance()) return;
    setDirection(1);
    setCurrentSlide((s) => s + 1);
  }, [currentSlide, slideCount, canAdvance]);

  const goPrev = useCallback(() => {
    if (currentSlide <= 0) return;
    setDirection(-1);
    setCurrentSlide((s) => s - 1);
  }, [currentSlide]);

  // Tap zones: left 30% = back, right 70% = forward
  const handleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Last slide has interactive buttons — don't intercept taps
      if (slides[currentSlide]?.isLastSlide) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clientX = "touches" in e ? e.changedTouches[0].clientX : e.clientX;
      const relX = (clientX - rect.left) / rect.width;

      if (relX < 0.3) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goNext, goPrev, currentSlide, slides],
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  const currentEntry = slides[currentSlide];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#0a0a1a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-label="観測結果ストーリー"
    >
      {/* Progress bar */}
      <StoryProgress total={slideCount} current={currentSlide} />

      {/* Close button */}
      <button
        className="absolute top-3 right-4 z-10 p-2"
        style={{ color: "rgba(255,255,255,0.5)" }}
        onClick={onClose}
        aria-label="閉じる"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>

      {/* Slide area — tap to advance */}
      <div className="flex-1 relative overflow-hidden" onClick={handleTap}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentEntry?.key}
            className="absolute inset-0"
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {currentEntry?.render(handleSlideReady)}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
