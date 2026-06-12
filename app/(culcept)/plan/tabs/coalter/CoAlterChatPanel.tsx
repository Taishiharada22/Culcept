"use client";

/**
 * CoAlterChatPanel — CoAlter タブ右側のチャット面
 *
 * 契約 §2「One session, two projections」の **チャット側射影**。
 *   - 2人のユーザー + CoAlter のメッセージ列（リアクション=同意シグナルの表示のみ）
 *   - 共有コンディション要約（M5: shared のみ表示 + 「個別条件は要約して共有」注記）
 *   - クイックアクション = 左パネルの調整と **同一操作の別ビュー**（契約 §1-6）
 *   - 入力欄（local state のみ。送信はローカル append・実 CoAlter 応答なし）
 *
 * fixture data のみ。fetch / DB / backend 接続なし。
 */

import { useState } from "react";

import {
  candidateLetter,
  type AdjustmentSuggestionFixture,
  type ChatMessageFixture,
  type CoAlterPlanSessionFixture,
} from "./coalterPlanSessionFixture";
import { ConditionChip } from "./PlanIntelligencePanel";
import {
  CheckIcon,
  ClockIcon,
  CloseIcon,
  InfoIcon,
  LeafIcon,
  SendIcon,
  SparkleIcon,
  YenIcon,
} from "./coalterIcons";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PARTICIPANT_AVATAR_TONE: Record<"sky" | "rose", string> = {
  sky: "from-sky-400 to-indigo-400",
  rose: "from-rose-300 to-pink-400",
};

interface MessageGroup {
  author: string;
  items: ChatMessageFixture[];
}

function groupConsecutive(messages: readonly ChatMessageFixture[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    if (last && last.author === message.author) {
      last.items.push(message);
    } else {
      groups.push({ author: message.author, items: [message] });
    }
  }
  return groups;
}

export interface CoAlterChatPanelProps {
  readonly session: CoAlterPlanSessionFixture;
  /** fixture messages + ローカル送信分（親で管理） */
  readonly messages: readonly ChatMessageFixture[];
  readonly onSend: (text: string) => void;
  readonly selectedCandidateIndex: number;
  readonly appliedAdjustmentIds: ReadonlySet<string>;
  readonly onToggleAdjustment: (adjustmentId: string) => void;
  readonly isConfirmed: boolean;
  readonly onConfirm: () => void;
  readonly onCollapse: () => void;
}

export function CoAlterChatPanel({
  session,
  messages,
  onSend,
  selectedCandidateIndex,
  appliedAdjustmentIds,
  onToggleAdjustment,
  isConfirmed,
  onConfirm,
  onCollapse,
}: CoAlterChatPanelProps) {
  const [draft, setDraft] = useState("");
  const groups = groupConsecutive(messages);
  const sharedConditions = session.conditions.filter((c) => c.visibility === "shared");
  const quickAdjustments = session.quickActionAdjustmentIds
    .map((id) => session.adjustments.find((a) => a.id === id))
    .filter((a): a is AdjustmentSuggestionFixture => a !== undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <section
      aria-label="ふたりと CoAlter のチャット"
      className="relative flex h-full min-h-[480px] flex-col rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm"
    >
      {/* 折りたたみ（プラン面を広く使う） */}
      <button
        type="button"
        onClick={onCollapse}
        aria-label="チャットをたたむ"
        className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-600"
      >
        <CloseIcon size={12} />
      </button>
      {/* 装飾スパークル（pointer-events なし） */}
      <SparkleIcon
        size={20}
        className="pointer-events-none absolute right-5 top-1/3 text-sky-300/80"
      />
      <SparkleIcon
        size={12}
        className="pointer-events-none absolute right-10 top-[38%] text-violet-300/70"
      />

      {/* ── メッセージ列 ── */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pt-1">
        {groups.map((group) => (
          <MessageGroupView key={group.items[0].id} group={group} session={session} />
        ))}

        {/* ── 共有コンディション（要約） — M5: shared のみ + 注記 ── */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700">
            共有コンディション（要約）
            <InfoIcon size={11} className="text-slate-400" />
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sharedConditions.map((condition) => (
              <ConditionChip key={condition.id} condition={condition} size="sm" />
            ))}
          </div>
          <p className="mt-2 inline-flex rounded-full bg-slate-200/60 px-2 py-0.5 text-[10px] text-slate-500">
            個別条件は要約して共有
          </p>
        </div>

        {/* ── クイックアクション（左パネルの調整と同一操作の別ビュー） ── */}
        <div>
          <p className="text-[11px] font-bold text-slate-500">クイックアクション</p>
          <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            {quickAdjustments.map((adjustment) => {
              const isApplied = appliedAdjustmentIds.has(adjustment.id);
              return (
                <button
                  key={adjustment.id}
                  type="button"
                  onClick={() => onToggleAdjustment(adjustment.id)}
                  aria-pressed={isApplied}
                  className={`rounded-xl border p-2.5 text-left transition-colors ${
                    isApplied
                      ? "border-violet-200 bg-violet-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800">
                    <QuickActionIcon icon={adjustment.icon} />
                    {adjustment.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                    {isApplied ? "適用済み（もう一度押すと戻せます）" : adjustment.detail}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={onConfirm}
              aria-pressed={isConfirmed}
              className={`rounded-xl border p-2.5 text-left transition-colors ${
                isConfirmed
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white hover:border-emerald-200"
              }`}
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800">
                <CheckIcon size={12} className="text-emerald-500" />
                この案で進める
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                {isConfirmed
                  ? `案${candidateLetter(selectedCandidateIndex)}で進行中`
                  : `案${candidateLetter(selectedCandidateIndex)}をベースに確定`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 入力欄 ── */}
      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="CoAlter にメッセージを送る"
          aria-label="CoAlter にメッセージを送る"
          className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          aria-label="送信"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-sm transition-opacity disabled:opacity-40"
        >
          <SendIcon size={14} />
        </button>
      </form>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function QuickActionIcon({ icon }: { icon: AdjustmentSuggestionFixture["icon"] }) {
  switch (icon) {
    case "route":
      return <LeafIcon size={12} className="text-emerald-500" />;
    case "time":
      return <ClockIcon size={12} className="text-teal-500" />;
    case "budget":
      return <YenIcon size={12} className="text-amber-500" />;
  }
}

function MessageGroupView({
  group,
  session,
}: {
  group: MessageGroup;
  session: CoAlterPlanSessionFixture;
}) {
  const isCoAlter = group.author === "coalter";
  const participant = session.participants.find((p) => p.id === group.author);
  const name = isCoAlter ? "CoAlter" : participant?.name ?? group.author;

  return (
    <div className="flex gap-2.5">
      {/* avatar */}
      {isCoAlter ? (
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-sm">
          <SparkleIcon size={13} />
        </span>
      ) : (
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white shadow-sm ${
            PARTICIPANT_AVATAR_TONE[participant?.tone ?? "sky"]
          }`}
        >
          {participant?.initial ?? name.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-500">
          <span className="font-bold text-slate-700">{name}</span>
          <span className="ml-1.5 text-slate-400">{group.items[0].time}</span>
        </p>
        <div className="mt-1 space-y-1.5">
          {group.items.map((message) => (
            <div key={message.id}>
              <div
                className={`inline-block max-w-[92%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-[13px] leading-relaxed text-slate-800 ${
                  isCoAlter
                    ? "border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50/60"
                    : "bg-slate-100"
                }`}
              >
                {message.text}
              </div>
              {message.reaction && (
                <div className="-mt-1.5 ml-2">
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 shadow-sm">
                    {message.reaction.emoji} {message.reaction.count}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
