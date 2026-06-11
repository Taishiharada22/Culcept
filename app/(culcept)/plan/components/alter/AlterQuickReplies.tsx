"use client";

/**
 * AlterQuickReplies — クイックチップ列
 *
 * 正本: docs/alter-tab-visual-contract.md §3.6
 *  - チップ: 元気 / 少し疲れた / 眠い / 集中したい / 外出は軽め（VM 経由）
 *  - コールドスタート時は人体直下に昇格（配置は AlterTabBody が決める。本コンポーネントは列のみ）
 *  - タップはモックコールバック（チップ→フィールド書込は Stage 1）
 */

import { useState } from "react";

export interface AlterQuickRepliesProps {
  quickReplies: string[];
  /** コールドスタート昇格時の導入 1 行（観測トーン） */
  lead?: string;
  onSelect?: (chip: string) => void;
}

export function AlterQuickReplies({ quickReplies, lead, onSelect }: AlterQuickRepliesProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      {lead && <p className="mb-2 px-1 text-xs text-slate-500">{lead}</p>}
      <div className="flex flex-wrap gap-2">
        {quickReplies.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setSelected(chip);
              onSelect?.(chip);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-sm transition-colors ${
              selected === chip
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white/85 text-slate-600 hover:bg-white"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
