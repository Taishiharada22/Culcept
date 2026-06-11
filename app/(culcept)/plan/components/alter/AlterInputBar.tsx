"use client";

/**
 * AlterInputBar — ミニ Composer（見た目のみ）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.6 / handoff HARD-6
 *  - 送信はモックコールバック。既存 `/api/stargazer/alter`（source:"plan"）への実接続は Stage 1
 *  - プレースホルダー: 「Alterに話しかける…」
 */

import { useState } from "react";

export interface AlterInputBarProps {
  onSend?: (message: string) => void;
}

export function AlterInputBar({ onSend }: AlterInputBarProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const message = value.trim();
    if (message.length === 0) return;
    onSend?.(message);
    setValue("");
  };

  return (
    <form
      className="flex items-center gap-2 rounded-full border border-white/90 bg-white/85 py-1.5 pl-4 pr-1.5 shadow-sm backdrop-blur-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Alterに話しかける…"
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        aria-label="Alterに話しかける"
      />
      <button
        type="submit"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-sm transition-opacity hover:opacity-90"
        aria-label="送信"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 L11 13" />
          <path d="M22 2 L15 22 L11 13 L2 9 Z" />
        </svg>
      </button>
    </form>
  );
}
