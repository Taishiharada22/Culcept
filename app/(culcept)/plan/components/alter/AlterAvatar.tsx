"use client";

/**
 * AlterAvatar — Alter キャラクターアバター（紫のブロブ + 目）
 *
 * W1 衛生: 旧 AlterChatPreview.tsx（B13 のチャット往復廃止で superseded）から
 * 唯一の現用 export だった本コンポーネントを独立ファイルへ移設。
 */

export function AlterAvatar({ size = 34 }: { size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-[38%] bg-gradient-to-br from-indigo-400 via-violet-500 to-purple-600 shadow-[0_4px_10px_rgba(124,58,237,0.35)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute flex gap-[18%]" style={{ top: "38%" }}>
        <span className="block rounded-full bg-white/95" style={{ width: size * 0.13, height: size * 0.2 }} />
        <span className="block rounded-full bg-white/95" style={{ width: size * 0.13, height: size * 0.2 }} />
      </span>
    </span>
  );
}
