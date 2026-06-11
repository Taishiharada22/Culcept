"use client";

/**
 * AlterChatPreview — 会話エリア（コンパクト・主役にしない）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.6
 *  - Alter の短い見立てメッセージ（1-2 行・観測トーン・断定なし）
 *  - 直近 1-2 往復のみ表示（フルログは既存 Alter 面へ。実チャット接続は Stage 1 — useAlterChat）
 */

export interface AlterChatTurn {
  role: "user" | "alter";
  text: string;
}

export interface AlterChatPreviewProps {
  alterMessage: string;
  /** 直近 1-2 往復（mock。実接続は Stage 1） */
  recentExchange?: AlterChatTurn[];
}

function AlterAvatar() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-[13px] text-white shadow-sm">
      ✦
    </span>
  );
}

export function AlterChatPreview({ alterMessage, recentExchange = [] }: AlterChatPreviewProps) {
  const turns = recentExchange.slice(-4); // 最大 2 往復

  return (
    <section aria-label="Alter との会話" className="space-y-2">
      <div className="flex items-start gap-2">
        <AlterAvatar />
        <div className="max-w-[80%] rounded-2xl rounded-tl-md border border-white/90 bg-white/85 px-3 py-2 text-[13px] leading-relaxed text-slate-700 shadow-sm backdrop-blur-sm">
          {alterMessage}
        </div>
      </div>
      {turns.map((turn, i) =>
        turn.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-indigo-50/90 px-3 py-2 text-[13px] leading-relaxed text-slate-700 shadow-sm">
              {turn.text}
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2">
            <AlterAvatar />
            <div className="max-w-[80%] rounded-2xl rounded-tl-md border border-white/90 bg-white/85 px-3 py-2 text-[13px] leading-relaxed text-slate-700 shadow-sm backdrop-blur-sm">
              {turn.text}
            </div>
          </div>
        ),
      )}
    </section>
  );
}
