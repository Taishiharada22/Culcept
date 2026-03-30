"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";

type Options = {
  storageKey: string;
  minViewportMargin?: number;
};

type DragGesture = {
  pointerId: number;
  startPointerY: number;
  startOffsetY: number;
  startTop: number;
  elementHeight: number;
};

type DragHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
};

type UseVerticalDragPositionResult<T extends HTMLElement> = {
  dragHandlers: DragHandlers;
  isDragging: boolean;
  offsetY: number;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  targetRef: RefObject<T | null>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readStoredOffsetY = (storageKey: string) => {
  try {
    const savedOffsetY = window.localStorage.getItem(storageKey);
    const parsedOffsetY = savedOffsetY == null ? 0 : Number(savedOffsetY);
    return Number.isFinite(parsedOffsetY) ? parsedOffsetY : 0;
  } catch {
    return 0;
  }
};

export function useVerticalDragPosition<T extends HTMLElement>({
  storageKey,
  minViewportMargin = 12,
}: Options): UseVerticalDragPositionResult<T> {
  const targetRef = useRef<T | null>(null);
  const dragGestureRef = useRef<DragGesture | null>(null);
  const suppressClickRef = useRef(false);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const frameId = window.requestAnimationFrame(() => {
      if (isCancelled) return;
      setOffsetY(readStoredOffsetY(storageKey));
      setHasLoaded(true);
    });
    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [storageKey]);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem(storageKey, String(offsetY));
    } catch {
      // Ignore storage write failures.
    }
  }, [hasLoaded, offsetY, storageKey]);

  const finishDrag = (currentTarget?: EventTarget | null, pointerId?: number) => {
    if (
      currentTarget &&
      pointerId != null &&
      "releasePointerCapture" in currentTarget &&
      typeof currentTarget.releasePointerCapture === "function"
    ) {
      try {
        currentTarget.releasePointerCapture(pointerId);
      } catch {
        // Ignore capture release failures.
      }
    }
    dragGestureRef.current = null;
    setIsDragging(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = targetRef.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    dragGestureRef.current = {
      pointerId: event.pointerId,
      startPointerY: event.clientY,
      startOffsetY: offsetY,
      startTop: rect.top,
      elementHeight: rect.height,
    };
    suppressClickRef.current = false;
    setIsDragging(true);

    if ("setPointerCapture" in event.currentTarget && typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures.
      }
    }

    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragGesture = dragGestureRef.current;
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;

    const rawDeltaY = event.clientY - dragGesture.startPointerY;
    const unclampedTop = dragGesture.startTop + rawDeltaY;
    const maxTop = Math.max(minViewportMargin, window.innerHeight - dragGesture.elementHeight - minViewportMargin);
    const nextTop = clamp(unclampedTop, minViewportMargin, maxTop);
    const appliedDeltaY = nextTop - dragGesture.startTop;

    if (Math.abs(appliedDeltaY) > 3) {
      suppressClickRef.current = true;
    }

    setOffsetY(dragGesture.startOffsetY + appliedDeltaY);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const dragGesture = dragGestureRef.current;
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;
    finishDrag(event.currentTarget, event.pointerId);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const dragGesture = dragGestureRef.current;
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;
    finishDrag(event.currentTarget, event.pointerId);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    isDragging,
    offsetY,
    onClickCapture,
    targetRef,
  };
}
