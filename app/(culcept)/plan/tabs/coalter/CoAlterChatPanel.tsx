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
  type CoAlterPlanSessionFixture,
} from "./coalterPlanSessionFixture";
import type { CoAlterChatSendMode } from "./coalterChatAdapter";
// B: 本文は **session message 契約**から描画する（fixture / thread payload への直接依存を持たない）。
import {
  isCoAlterSessionAuthor,
  type CoAlterSessionMessage,
  type CoAlterSessionMessageAuthor,
} from "./coalterSessionMessageContract";
import type { SessionParticipant } from "./coalterPlanSessionContract";
import { ConditionChip } from "./PlanIntelligencePanel";
import {
  CheckIcon,
  ClockIcon,
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

/** session message author の group key（"coalter" or 人間 userId）。 */
function sessionAuthorKey(author: CoAlterSessionMessageAuthor): string {
  return author.kind === "coalter" ? "coalter" : author.userId;
}

interface MessageGroup {
  authorKey: string;
  isCoAlter: boolean;
  items: CoAlterSessionMessage[];
}

function groupConsecutive(messages: readonly CoAlterSessionMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const key = sessionAuthorKey(message.author);
    const last = groups[groups.length - 1];
    if (last && last.authorKey === key) {
      last.items.push(message);
    } else {
      groups.push({
        authorKey: key,
        isCoAlter: isCoAlterSessionAuthor(message.author),
        items: [message],
      });
    }
  }
  return groups;
}

export interface CoAlterChatPanelProps {
  readonly session: CoAlterPlanSessionFixture;
  /** 本文 author 解決用の **resolved session participants**（匿名なし・B）。 */
  readonly participants: readonly SessionParticipant[];
  /** **session message** 本文（fixture session + ローカル送信分・親で管理）。 */
  readonly sessionMessages: readonly CoAlterSessionMessage[];
  /** 本文の送信モード（本文は fixture session ＝常に "local_echo"。legacy "none"/"live" は本文に来ない） */
  readonly sendMode: CoAlterChatSendMode;
  readonly onSend: (text: string) => void;
  readonly selectedCandidateIndex: number;
  readonly appliedAdjustmentIds: ReadonlySet<string>;
  readonly onToggleAdjustment: (adjustmentId: string) => void;
  readonly isConfirmed: boolean;
  readonly onConfirm: () => void;
  /**
   * TalkBridge-A: 「これまでの会話」文脈セクション（read-only・別 card）。
   * **session message の bubble list には混ぜず**、スクロール領域の最上部に独立配置する。
   * 文脈が無いとき（state!=="ready"）は中身が null になり何も出ない。
   */
  readonly threadContextSlot?: React.ReactNode;
}

/**
 * チャット側は畳めない（CEO ③）: collapse 系の props/UI を持たない。
 * 入力欄は flex 構造の最下段に常時固定（メッセージ列のみ内部スクロール）。
 */
export function CoAlterChatPanel({
  session,
  participants,
  sessionMessages,
  onSend,
  selectedCandidateIndex,
  appliedAdjustmentIds,
  onToggleAdjustment,
  isConfirmed,
  onConfirm,
  sendMode,
  threadContextSlot,
}: CoAlterChatPanelProps) {
  const [draft, setDraft] = useState("");
  const canSend = sendMode === "local_echo"; // 本文は fixture session ＝local echo 可
  const groups = groupConsecutive(sessionMessages);
  const sharedConditions = session.conditions.filter((c) => c.visibility === "shared");
  const quickAdjustments = session.quickActionAdjustmentIds
    .map((id) => session.adjustments.find((a) => a.id === id))
    .filter((a): a is AdjustmentSuggestionFixture => a !== undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return; // T1b: read-only（送信経路自体を遮断）
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <section
      aria-label="ふたりと CoAlter のチャット"
      className="@container relative flex h-full min-h-0 flex-col rounded-3xl border border-slate-200/70 bg-white p-3 shadow-sm @md:p-4"
    >
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
        {/* TalkBridge-A: 「これまでの会話」文脈（**bubble list の外・最上部の独立 card**・read-only）。
            ★旧 T1b の本文 readState バッジ（ライブ閲覧中/読み込み中/利用不可）は撤去した。
            本文は session message（live でない）・read-only 状態は文脈セクションが自前のバッジで持つ。 */}
        {threadContextSlot}
        {groups.map((group) => (
          <MessageGroupView key={group.items[0].id} group={group} participants={participants} />
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
          <div className="mt-2 grid grid-cols-1 gap-2 @sm:grid-cols-3">
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

      {/* ── 入力欄（常時固定・チャットは完全には閉じない＝CEO 必須指定） ── */}
      <form onSubmit={handleSubmit} className="mt-2.5 flex shrink-0 items-center gap-2 border-t border-slate-100 pt-2.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSend}
          placeholder={
            canSend ? "CoAlter にメッセージを送る" : "閲覧のみ（送信は次の段階で有効になります）"
          }
          aria-label="CoAlter にメッセージを送る"
          className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend || draft.trim().length === 0}
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
  participants,
}: {
  group: MessageGroup;
  participants: readonly SessionParticipant[];
}) {
  const isCoAlter = group.isCoAlter;
  // 人間 author は **resolved participant** を userId で解決（raw userId は表示に出さない）。
  const participant = isCoAlter
    ? undefined
    : participants.find((p) => p.userId === group.authorKey);
  const name = isCoAlter ? "CoAlter" : participant?.displayName ?? "メンバー";

  // 狭い container（ピンチで縮めた時・モバイル既定）では avatar を名前行に内包して
  // 吹き出しをペイン全幅で使う（縦書き化する事故の防止）。@md 以上で参照画像の段組へ。
  return (
    <div className="flex flex-col gap-1 @md:flex-row @md:gap-2.5">
      <div className="flex items-center gap-1.5 @md:block">
        {isCoAlter ? (
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-sm @md:mt-0.5 @md:h-7 @md:w-7">
            <SparkleIcon size={11} />
          </span>
        ) : (
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-white shadow-sm @md:mt-0.5 @md:h-7 @md:w-7 @md:text-[11px] ${
              PARTICIPANT_AVATAR_TONE[participant?.tone ?? "sky"]
            }`}
          >
            {participant?.initial ?? name.charAt(0)}
          </span>
        )}
        {/* 狭幅: 名前+時刻を avatar の隣に出す */}
        <p className="min-w-0 truncate text-[10px] text-slate-500 @md:hidden">
          <span className="font-bold text-slate-700">{name}</span>
          <span className="ml-1 text-slate-400">{group.items[0].createdAt}</span>
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="hidden text-[11px] text-slate-500 @md:block">
          <span className="font-bold text-slate-700">{name}</span>
          <span className="ml-1.5 text-slate-400">{group.items[0].createdAt}</span>
        </p>
        <div className="space-y-1.5 @md:mt-1">
          {group.items.map((message) => (
            <div key={message.id}>
              <div
                className={`inline-block max-w-full rounded-2xl rounded-tl-sm px-3 py-2 text-[12px] leading-relaxed text-slate-800 @md:max-w-[92%] @md:px-3.5 @md:text-[13px] ${
                  isCoAlter
                    ? "border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50/60"
                    : "bg-slate-100"
                }`}
              >
                {message.body}
              </div>
              {message.reactions?.map((reaction, i) => (
                <div key={i} className="-mt-1.5 ml-2">
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 shadow-sm">
                    {reaction.emoji} {reaction.count}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
