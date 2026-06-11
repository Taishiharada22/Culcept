"use client";

/**
 * AlterInputBar — 状態入力スリット（B13・CEO 判断でチャット欄から再設計）
 *
 *  - チャット欄ではない: 吹き出し履歴を持たず、このタブ内で会話を展開しない
 *  - 「いまの状態をひとことで伝える」小さな入力口（Stage 1.5 センサー化の入口）
 *  - 送信はモックコールバック + 親側の短い ack のみ。実接続（既存 Alter route source:"plan"
 *    → DayStateRecord 構造抽出）は Stage 1.5
 *  - 操縦席を邪魔しない: 小さく・軽く（アバター/マイクなし・薄い枠）
 */

import { useState } from "react";
import { SendIcon } from "./alterIcons";

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
      className="flex items-center gap-1 rounded-full border border-indigo-100/80 bg-white/75 py-1 pl-3.5 pr-1 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="いまの状態をひとことで…"
        className="min-w-0 flex-1 bg-transparent text-[11.5px] text-slate-700 outline-none placeholder:text-slate-400"
        aria-label="いまの状態をひとことで伝える"
      />
      <button
        type="submit"
        className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 p-1.5 text-white shadow-sm transition-opacity hover:opacity-90"
        aria-label="送信"
      >
        <SendIcon size={11} />
      </button>
    </form>
  );
}
