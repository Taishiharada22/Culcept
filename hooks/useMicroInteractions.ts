"use client";

import { useCallback } from "react";
import { executeInteraction, type InteractionEvent } from "@/lib/ui/semanticMicroInteractions";

/**
 * Hook that bridges Aneurasync events to semantic micro-interactions.
 * Provides haptic feedback + visual callbacks for key moments.
 */
export function useMicroInteractions() {
  const trigger = useCallback((event: InteractionEvent) => {
    executeInteraction(event, {
      onVisual: (effect) => {
        // Dispatch custom event for any visual overlay to consume
        window.dispatchEvent(
          new CustomEvent("aneurasync:micro-interaction", {
            detail: { event, effect },
          }),
        );
      },
      onSound: (sound) => {
        // Sound is handled by proceduralAudio system
        window.dispatchEvent(
          new CustomEvent("aneurasync:play-sound", {
            detail: { sound },
          }),
        );
      },
    });
  }, []);

  return { trigger };
}
