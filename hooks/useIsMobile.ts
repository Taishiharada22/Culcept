"use client";

import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 767; // md breakpoint - 1

/**
 * モバイル判定フック（768px 未満）。
 * matchMedia を使い、リサイズにもリアクティブに追従する。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
