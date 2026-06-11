"use client";

/**
 * AlterChatPreview — 会話エリア（v2: 参照画像準拠のバブル・アバター・時刻）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.6
 *  - Alter の短い見立てメッセージ（観測トーン・断定なし）+ 直近 1-2 往復のみ
 *  - 実チャット接続は Stage 1（useAlterChat）。時刻は mock の事実表示（HH:MM は許可）
 */

export interface AlterChatTurn {
  role: "user" | "alter";
  text: string;
  time?: string; // "HH:MM"
}

export interface AlterChatPreviewProps {
  alterMessage: string;
  alterMessageTime?: string;
  recentExchange?: AlterChatTurn[];
}

/** Alter キャラクターアバター（紫のブロブ + 目） */
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

function AlterBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex items-end gap-2">
      <AlterAvatar />
      <div className="max-w-[76%] rounded-2xl rounded-bl-md border border-white bg-white/90 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700 shadow-sm backdrop-blur-sm">
        {text}
      </div>
      {time && <span className="pb-0.5 text-[8.5px] tabular-nums text-slate-300">{time}</span>}
    </div>
  );
}

function UserBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex items-end justify-end gap-2">
      {time && <span className="pb-0.5 text-[8.5px] tabular-nums text-slate-300">{time}</span>}
      <div className="max-w-[76%] rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-100/90 to-violet-100/80 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700 shadow-sm">
        {text}
      </div>
    </div>
  );
}

export function AlterChatPreview({ alterMessage, alterMessageTime, recentExchange = [] }: AlterChatPreviewProps) {
  const turns = recentExchange.slice(-4); // 最大 2 往復
  return (
    <section aria-label="Alter との会話" className="space-y-2">
      <AlterBubble text={alterMessage} time={alterMessageTime} />
      {turns.map((turn, i) =>
        turn.role === "user" ? (
          <UserBubble key={i} text={turn.text} time={turn.time} />
        ) : (
          <AlterBubble key={i} text={turn.text} time={turn.time} />
        ),
      )}
    </section>
  );
}
