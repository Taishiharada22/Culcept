"use client";

/**
 * CoAlterThreadContextSection — 「これまでの会話」文脈セクション（read-only・session 本文と分離）
 *
 * TalkBridge-A。**session chat body（吹き出しリスト）とは別の card**として描画する:
 *   - header「これまでの会話」+ 読み取り専用バッジ。
 *   - compact 行（話者頭文字 + 名前 + 本文）。**session 吹き出しと視覚的に別物**（muted・小さめ）。
 *   - 入力欄なし。
 *   - 末尾に「過去の会話の文脈です（現在のプランの会話とは別）」注記。
 *
 * 不変条件:
 *   - **session 本文の bubble list に混ぜない**（独立 section）。
 *   - 話者は匿名/表示専用（**session 参加者にしない**）。**raw userId を表示しない**
 *     （speaker 名にフォールバック。未知 author は中立ラベル）。
 *   - 「thread」「スレッド」をユーザー向けコピーに出さない。
 *   - state!=="ready"（messages 0）→ 何も描画しない（fail-closed で no-context）。
 */

import type { CoAlterChatMessage, CoAlterChatParticipant } from "./coalterChatAdapter";

const SPEAKER_TONE: Record<"sky" | "rose", string> = {
  sky: "from-sky-300 to-indigo-300",
  rose: "from-rose-300 to-pink-300",
};

export interface CoAlterThreadContextSectionProps {
  readonly messages: readonly CoAlterChatMessage[];
  readonly speakers: readonly CoAlterChatParticipant[];
}

export function CoAlterThreadContextSection({
  messages,
  speakers,
}: CoAlterThreadContextSectionProps) {
  // fail-closed: 文脈が無ければセクション自体を出さない。
  if (messages.length === 0) return null;

  const speakerById = new Map(speakers.map((s) => [s.id, s]));

  return (
    <section
      aria-label="これまでの会話（過去の会話コンテキスト・読み取り専用）"
      className="mb-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-slate-600">これまでの会話</p>
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
          読み取り専用
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {messages.map((m) => {
          const speaker = speakerById.get(m.author);
          // raw userId は出さない。未知 author は中立ラベルにフォールバック。
          const name = speaker?.name ?? "メンバー";
          const initial = speaker?.initial ?? "・";
          const tone = speaker?.tone ?? "sky";
          return (
            <div key={m.id} className="flex items-start gap-1.5">
              <span
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[8px] font-bold text-white ${SPEAKER_TONE[tone]}`}
              >
                {initial}
              </span>
              <p className="min-w-0 text-[11px] leading-snug text-slate-500">
                <span className="font-semibold text-slate-600">{name}</span>
                <span className="ml-1 text-slate-400">{m.time}</span>
                <span className="ml-1.5 text-slate-500">{m.text}</span>
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        過去の会話の文脈です（現在のプランの会話とは別）
      </p>
    </section>
  );
}
