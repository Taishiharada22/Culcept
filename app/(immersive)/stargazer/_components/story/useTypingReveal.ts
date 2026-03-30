// app/(immersive)/stargazer/_components/story/useTypingReveal.ts
// タイピング表示フック
"use client";

import { useState, useEffect, useRef } from "react";

/**
 * 文字列を1文字ずつタイピング表示する
 * @param text 表示するテキスト
 * @param intervalMs 1文字あたりの間隔 (ms)
 * @param onComplete 全文字表示完了時のコールバック
 */
export function useTypingReveal(
  text: string,
  intervalMs = 80,
  onComplete?: () => void,
): string {
  const [displayed, setDisplayed] = useState("");
  const completeCalled = useRef(false);

  useEffect(() => {
    completeCalled.current = false;
    setDisplayed("");
    let i = 0;

    const timer = setInterval(() => {
      i++;
      if (i <= text.length) {
        setDisplayed(text.slice(0, i));
      } else {
        clearInterval(timer);
        if (!completeCalled.current) {
          completeCalled.current = true;
          onComplete?.();
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [text, intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return displayed;
}
