"use client";

/**
 * AlterInputBar — ミニ Composer（v2: アバター + マイク + 送信。見た目のみ）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.6 / handoff HARD-6
 * 送信・音声はモック（実接続は Stage 1: 既存 `/api/stargazer/alter` source:"plan"）。
 */

import { useState } from "react";
import { AlterAvatar } from "./AlterChatPreview";
import { MicIcon, SendIcon } from "./alterIcons";

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
    <div className="flex items-center gap-2">
      <AlterAvatar size={36} />
      <form
        className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-white bg-white/90 py-1.5 pl-4 pr-1.5 shadow-sm backdrop-blur-sm"
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
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-slate-700 outline-none placeholder:text-slate-400"
          aria-label="Alterに話しかける"
        />
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100"
          aria-label="音声入力（準備中）"
        >
          <MicIcon size={14} />
        </button>
        <button
          type="submit"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-sm transition-opacity hover:opacity-90"
          aria-label="送信"
        >
          <SendIcon size={13} />
        </button>
      </form>
    </div>
  );
}
