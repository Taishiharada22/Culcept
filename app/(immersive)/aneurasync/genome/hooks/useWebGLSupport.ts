"use client";

import { useState } from "react";

/**
 * Detect WebGL2 support (or fallback to WebGL1).
 * Returns true if the browser can render Three.js scenes.
 */
export function useWebGLSupport(): boolean | null {
  const [supported] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") || canvas.getContext("webgl");
      return !!gl;
    } catch {
      return false;
    }
  });

  return supported;
}
