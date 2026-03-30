"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * モーダル内のフォーカスを閉じ込めるラッパー
 * - マウント時に最初のフォーカス可能要素にフォーカス
 * - Tab/Shift+Tab でフォーカスがモーダル外に出ない
 * - Escape キーで onClose 発火
 */
export default function FocusTrap({
  children,
  onClose,
  ariaLabel,
}: {
  children: ReactNode;
  onClose: () => void;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // 現在のフォーカスを保存
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // 最初のフォーカス可能要素にフォーカス
    const container = containerRef.current;
    if (container) {
      const first = getFocusableElements(container)[0];
      if (first) (first as HTMLElement).focus();
    }

    return () => {
      // アンマウント時に元のフォーカスを復元
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key !== "Tab") return;

    const container = containerRef.current;
    if (!container) return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

function getFocusableElements(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
}
