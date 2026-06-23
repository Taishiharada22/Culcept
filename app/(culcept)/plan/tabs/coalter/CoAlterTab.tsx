"use client";

/**
 * CoAlterTab — /plan 内の CoAlter タブ（UI プロトタイプ・local only）
 *
 * 製品方針（CEO 指示 2026-06-12 + 同日レビュー②③反映）:
 *   - CoAlter はチャットサービスの形を維持しつつ、/plan 内では2人専属プランナーになる
 *   - 左 = Plan Intelligence パネル / 右 = 2人 + CoAlter のチャット（同一 session の2射影）
 *   - **モバイル主用途**: 全幅で左右並び（縦積みにしない）。スクロールなしで1画面に収める
 *     （split 領域 = viewport 残り高さ・各ペインは内部スクロール）
 *   - **ピンチ縮小**: どちらかのペインをピンチで縮めると、プランは左下へ・チャットは右下へ
 *     縮んでいく（幅 + 高さを bottom 基準で縮小）。divider ドラッグ / たたむボタンは
 *     アクセシブルな代替操作
 *   - **プラン側は完全に畳める**（左下の「プランを開く」チップで復帰）。
 *     **チャット側は畳めない**: 入力欄は常時固定表示・チャット幅には下限を設ける
 *   - モードセレクターは白系デザイン（CEO 必須指定）
 *
 * 厳格スコープ: fixture data のみ / fetch・DB・route・server action・backend 接続なし。
 * /talk 機能の移設は docs/coalter-plan-tab-talk-migration-design.md（T1 以降・CEO GO 待ち）。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

import {
  COALTER_MODE_LABELS,
  COALTER_PLAN_SESSION_FIXTURES,
  type ChatMessageFixture,
  type CoAlterPlanMode,
  type CoAlterPlanSessionFixture,
} from "./coalterPlanSessionFixture";
// C-1: relation metadata binding（read-only・既存 GET /api/genome-connections のみ・flag OFF 既定）。
import { useCoAlterRelationBinding } from "./useCoAlterRelationBinding";
// TalkBridge-A: 「これまでの会話」文脈セクション（read-only・別セクション・flag OFF 既定）。
import { useCoAlterThreadContext } from "./useCoAlterThreadContext";
import { CoAlterThreadContextSection } from "./CoAlterThreadContextSection";
// B: 本文を session message 契約から描画（fixture→契約 pure mapper・永続化なし）。
import {
  buildSessionMessagesFromFixture,
  toSessionMessageFromFixture,
} from "./coalterSessionMessageContract";
import { buildSessionParticipantsFromFixture } from "./coalterPlanSessionContract";
// local-only live wiring（runtime に隔離＝UI tab folder は /api/coalter を直接持たない）。
import { useCoAlterLiveSession } from "@/app/(culcept)/plan/coalter-runtime/useCoAlterLiveSession";
import {
  buildLiveParticipants,
  selectCoAlterBody,
} from "@/app/(culcept)/plan/coalter-runtime/coalterLiveSessionClient";
import {
  CalendarMiniIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "./coalterIcons";
import { PlanIntelligencePanel } from "./PlanIntelligencePanel";
import { CoAlterChatPanel } from "./CoAlterChatPanel";
// CoAlter タブの入口ホーム（会話一覧）。タブは Home で始まり、会話を選ぶと Talk へ（CEO 2026-06-21）。
import { CoAlterHome } from "./CoAlterHome";
// プランは Talk 上に浮かぶフローティング overlay（ドラッグ/リサイズ・透過）（CEO 2026-06-21）。
import { CoAlterPlanOverlay } from "./CoAlterPlanOverlay";
// Home/Talk の Apple 風背景（プラン overlay は不変・CEO 2026-06-21）。
import { CoAlterBackdrop } from "./CoAlterBackdrop";
// C5-E: CoAlter 非永続 preview（server 生成・DB 保存なし・flag OFF 既定）。
import { useCoAlterPreview } from "@/app/(culcept)/plan/coalter-runtime/useCoAlterPreview";
import { CoAlterPreviewBlock } from "./CoAlterPreviewBlock";
// C6-A-1: CoAlter proposal engine live（flag ON 時のみ・engine 駆動の合意形成知性・flag OFF 既定）。
import { useCoAlterPlanIntelligence } from "@/app/(culcept)/plan/coalter-runtime/useCoAlterPlanIntelligence";
import { PlanIntelligenceLivePanel } from "./PlanIntelligenceLivePanel";
import type { RealityOsSurfaceDisplayV0 } from "@/lib/plan/realityPipeline/realityOsSurfacePresenter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** session ごとの UI local state（モード切替で互いを失わない） */
interface SessionUiState {
  selectedCandidateId: string;
  appliedAdjustmentIds: readonly string[];
  confirmedCandidateId: string | null;
  sentMessages: readonly ChatMessageFixture[];
}

function initialUiState(session: CoAlterPlanSessionFixture): SessionUiState {
  return {
    selectedCandidateId: session.selectedCandidateId ?? session.candidates[0].id,
    appliedAdjustmentIds: [],
    confirmedCandidateId: null,
    sentMessages: [],
  };
}

const AVATAR_TONE: Record<"sky" | "rose", string> = {
  sky: "from-sky-400 to-indigo-400",
  rose: "from-rose-300 to-pink-400",
};

// ── Talk overlay（旧 split のピンチ/divider は overlay 化で廃止） ──

export interface CoAlterTabProps {
  /**
   * C-1: 認証 self の userId（server＝PlanPage の auth.getUser 由来）。
   * **client 推論しない**ための self 正本。未指定なら relation binding は self を解決できず unbound。
   * 表示には使わない（raw userId を UI に出さない）。
   */
  readonly viewerUserId?: string;
  /**
   * P3-9-wire: Reality OS dormant seam（optional・fixture-backed redacted 表示VM）。
   * server flag OFF 既定では未指定→ PlanIntelligenceLivePanel で完全非描画。
   */
  readonly realityOsSurface?: RealityOsSurfaceDisplayV0;
}

export function CoAlterTab({ viewerUserId, realityOsSurface }: CoAlterTabProps = {}) {
  // 画面: Home（会話一覧・入口） ⇄ Talk（チャット＋プラン）。タブは Home で始まる。
  const [view, setView] = useState<"home" | "talk">("home");
  // プラン overlay の開閉（Talk 上に浮かぶ）。既定 open（talk.png 準拠）・✕で閉じ・「予定を確認」で再表示。
  const [planOpen, setPlanOpen] = useState(true);
  // モード未選択（null）の間も daily の内容を仮表示する（reference の「モードを選ぶ」状態）
  const [modeChoice, setModeChoice] = useState<CoAlterPlanMode | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  const mode: CoAlterPlanMode = modeChoice ?? "daily";
  const session = COALTER_PLAN_SESSION_FIXTURES[mode];

  // ヘッダ日付の compact 表記（talk.png = "5/18" 形式）。
  const planWindow = session.window;
  const windowIso = "date" in planWindow ? planWindow.date : planWindow.start;
  const compactDate = (() => {
    const [, mm, dd] = windowIso.split("-");
    return `${Number(mm)}/${Number(dd)}`;
  })();

  const [uiBySession, setUiBySession] = useState<Record<string, SessionUiState>>({});
  const ui = uiBySession[session.id] ?? initialUiState(session);
  const patchUi = useCallback(
    (sessionId: string, base: SessionUiState, patch: Partial<SessionUiState>) => {
      setUiBySession((prev) => ({
        ...prev,
        [sessionId]: { ...(prev[sessionId] ?? base), ...patch },
      }));
    },
    [],
  );

  const appliedSet = new Set(ui.appliedAdjustmentIds);
  const selectedIndex = Math.max(
    0,
    session.candidates.findIndex((c) => c.id === ui.selectedCandidateId),
  );

  // ── legacy T1b retire: 本文は B で session message 化済み。旧 `useCoAlterChatAdapter`
  //   （thread-as-body の live-read・readState バッジ・wasted fetch）は **本文から撤去**した。
  //   本文は常に fixture session ＝ local echo 可。thread 内容は TalkBridge-A の文脈セクションのみ。
  const fixtureSessionParticipants = buildSessionParticipantsFromFixture(session);

  // ── C-1: relation metadata binding（read-only・flag OFF / 前提欠落 = fixture = fetch 0） ──
  //   bound 時は header の「セッション参加者」を解決済み identity（culcept_relation + self）で表示。
  //   失敗/未解決/未認証/対象未注入 → fixture のまま（fail-closed）。chat 本文は触らない（messages は別 slice）。
  const relationBinding = useCoAlterRelationBinding({
    enabled: PLAN_FLAGS.coalterRelationLive,
    viewerUserId: viewerUserId ?? null,
    targetCounterpartUserIds: PLAN_FLAGS.coalterDevCounterpartUserId
      ? [PLAN_FLAGS.coalterDevCounterpartUserId]
      : [],
  });
  // header 用の正規化（{id,name,initial,tone}）。bound なら解決済み participants、それ以外は fixture。
  const headerParticipants =
    relationBinding.state === "bound" && relationBinding.participants
      ? relationBinding.participants.map((p) => ({
          id: p.userId,
          name: p.displayName,
          initial: p.initial,
          tone: p.tone,
        }))
      : fixtureSessionParticipants.map((p) => ({
          id: p.userId,
          name: p.displayName,
          initial: p.initial,
          tone: p.tone,
        }));

  // ── TalkBridge-A: 「これまでの会話」文脈（read-only・別セクション・flag OFF / threadId 無 = 非表示）──
  //   threadId は C-1 relation の attachedThreadRef（= genome-connections.threadId）由来＝relation→thread のみ。
  //   本文（session bubble list）は触らない。fail-closed で文脈非表示。
  const threadContext = useCoAlterThreadContext({
    enabled: PLAN_FLAGS.coalterThreadContext,
    threadId: relationBinding.attachedThreadRef?.threadId ?? null,
  });

  // ── B: 本文は **session message 契約**から描画（fixture session 由来・author は resolved のみ）──
  //   本文 = fixture session message + ローカル送信分。**thread messages は本文に入れない**
  //   （thread 内容は TalkBridge-A の文脈セクションへ）。これにより本文 author は匿名にならない。
  const fixtureBodyMessages = [
    ...buildSessionMessagesFromFixture(session),
    ...ui.sentMessages.map((m) => toSessionMessageFromFixture(m, session.id)),
  ];
  // 本文は fixture session ＝ local echo 可（legacy live read-only の "none" 経路は撤去済み）。
  const canLocalEcho = true;

  // ── local-only live 本文 **read**（UX-5a-1: read flag で gate・send とは独立）。
  //   flag OFF / sessionId 無 / 未認証 / 失敗 → fixture へ fail-closed。
  //   server read gate（PLAN_COALTER_READ_LOCAL ∨ SEND_LOCAL）と AND で初めて 200。raw userId は UI に出さない。
  const liveSession = useCoAlterLiveSession({
    enabled: PLAN_FLAGS.coalterReadMessages,
    sessionId: PLAN_FLAGS.coalterDevSessionId || null,
  });
  const liveParticipants = buildLiveParticipants(
    viewerUserId ?? null,
    relationBinding.state === "bound" ? relationBinding.participants : null,
  );
  const bodySelection = selectCoAlterBody({
    liveState: liveSession.state,
    liveMessages: liveSession.messages,
    liveParticipants,
    fixtureMessages: fixtureBodyMessages,
    fixtureParticipants: fixtureSessionParticipants,
  });

  // ── C5-E: CoAlter 非永続 preview（flag OFF 既定・on-demand 生成・DB 保存なし・既存 read/send 不干渉） ──
  const coalterPreview = useCoAlterPreview({
    // ★ client gate は NEXT_PUBLIC 版（server-only coalterBrainPreview は client で常に false）。
    enabled: PLAN_FLAGS.coalterBrainPreviewClient,
    sessionId: PLAN_FLAGS.coalterDevSessionId || null,
  });

  // ── C6-A-1: CoAlter proposal engine live（flag ON 時のみ・engine 駆動の合意形成知性） ──
  //   flag OFF / fetch 前 / 失敗 → vm=null → 従来 fixture パネルのまま（fail-closed・fetch 0）。
  const planIntelligence = useCoAlterPlanIntelligence(mode);

  // ── handlers（すべて local state のみ） ──
  const handleSelectCandidate = (candidateId: string) =>
    patchUi(session.id, ui, { selectedCandidateId: candidateId });

  const handleToggleAdjustment = (adjustmentId: string) => {
    const next = new Set(ui.appliedAdjustmentIds);
    if (next.has(adjustmentId)) next.delete(adjustmentId);
    else next.add(adjustmentId);
    patchUi(session.id, ui, { appliedAdjustmentIds: [...next] });
  };

  const handleConfirm = () =>
    patchUi(session.id, ui, {
      confirmedCandidateId:
        ui.confirmedCandidateId === ui.selectedCandidateId ? null : ui.selectedCandidateId,
    });

  const handleSend = (text: string) => {
    if (!canLocalEcho) return;
    // local echo の送信者 = fixture session の先頭参加者（旧 chatAdapter.getViewer() を撤去）。
    const sender = session.participants[0];
    if (!sender) return; // 参加者なし（solo 将来）の時は送らない
    const message: ChatMessageFixture = {
      id: `local-${session.id}-${ui.sentMessages.length + 1}`,
      author: sender.id,
      time: new Date().toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      text,
    };
    patchUi(session.id, ui, { sentMessages: [...ui.sentMessages, message] });
  };

  // 送信ルーティング（UX-5a-1: send flag で gate）: **live read 中 ∧ send flag ON** のときだけ実 send route
  //   （POST→refetch）。それ以外（send flag OFF / 非 live）は従来 local echo＝write を開かない。
  //   client は author/userId/source を送らない（送信主体は server stamp・hook が body+clientMessageId のみ送る）。
  const handleSendUnified = (text: string) => {
    if (bodySelection.isLive && PLAN_FLAGS.coalterSendMessages) {
      void liveSession.send(text);
    } else {
      handleSend(text);
    }
  };

  // ── Talk: 1画面フィット（コンテナ高さ = viewport 残り・ページスクロールを出さない） ──
  const talkRef = useRef<HTMLDivElement | null>(null);
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  useEffect(() => {
    if (view !== "talk") return;
    const update = () => {
      const el = talkRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // 28 = タブ root pb-2(8) + /plan main py-4 の下 padding(16) + 余裕(4)。
      setFillHeight(Math.max(420, Math.round(window.innerHeight - top - 28)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [view]);

  // ── 入口は Home（会話一覧）。会話を選ぶと Talk へ。全 hooks の後に分岐（hooks 規則順守） ──
  if (view === "home") {
    return <CoAlterHome onOpenConversation={() => setView("talk")} />;
  }

  // 会話相手（talk.png のヘッダ person selector）= ペアの相手側を表示。
  const partner = headerParticipants[1] ?? headerParticipants[0];

  return (
    <div className="relative min-h-screen">
      <CoAlterBackdrop />
      <div className="mx-auto flex max-w-[1480px] flex-col px-3 pb-2 sm:px-5">
      {/* ── タブ内ヘッダ（talk.png 準拠・1行）: 戻る / 会話相手 / モード / 日付 ── */}
      <header className="flex items-center gap-2 py-2">
        {/* Home（会話一覧）へ戻る */}
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label="ホームに戻る"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200/70 transition-colors hover:text-slate-700"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </button>

        {/* 会話相手（person selector・静的） */}
        {partner && (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-sm ring-1 ring-slate-200/70">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ${AVATAR_TONE[partner.tone]}`}
            >
              {partner.initial}
            </span>
            <span className="truncate text-xs font-bold text-slate-800">{partner.name}</span>
            <ChevronDownIcon size={11} className="shrink-0 text-slate-400" />
          </span>
        )}

        {/* モード選択（白系デザイン・CEO 必須指定） */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setModeMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm ring-1 ring-slate-200/70 transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-violet-400">
              <span className="h-1 w-1 rounded-full bg-violet-500" />
            </span>
            <span className="truncate">
              {modeChoice === null ? "モードを選ぶ" : COALTER_MODE_LABELS[modeChoice]}
            </span>
            <ChevronDownIcon size={11} className="text-slate-400" />
          </button>
          {modeMenuOpen && (
            <>
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setModeMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
                tabIndex={-1}
              />
              <div
                role="menu"
                className="absolute left-0 top-full z-20 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg"
              >
                {(Object.keys(COALTER_PLAN_SESSION_FIXTURES) as CoAlterPlanMode[]).map((m) => {
                  const isActive = mode === m && modeChoice !== null;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setModeChoice(m);
                        setModeMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                        isActive ? "bg-violet-50 text-violet-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>
                        <span className="block font-bold">{COALTER_MODE_LABELS[m]}</span>
                        <span className="block text-[10px] text-slate-400">
                          {m === "daily" ? "日帰りの一日を組み立てる" : "泊まりの行程を組み立てる"}
                        </span>
                      </span>
                      {isActive && <CheckIcon size={12} className="text-violet-500" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 日付（compact M/D・右寄せ） */}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200/70">
          <CalendarMiniIcon size={13} className="text-slate-400" />
          {compactDate}
        </span>
      </header>

      {/* ── 本体: チャット全画面（背景・スタイルは現状のまま） + プランのフローティング overlay ──
        * overlay は talk.png 準拠でチャットの上に浮かぶ（ドラッグ/リサイズ・透過でチャット見え隠れ）。
        * 閉じている時は「予定を確認」で再表示（CoAlter が決定事項を出す判断時も同じ setPlanOpen(true)）。
        */}
      <div ref={talkRef} className="relative" style={{ height: fillHeight ?? undefined }}>
        {/* チャットは全画面固定 */}
        <div className="h-full">
          <CoAlterChatPanel
            session={session}
            participants={bodySelection.participants}
            sessionMessages={bodySelection.messages}
            sendMode="local_echo"
            onSend={handleSendUnified}
            selectedCandidateIndex={selectedIndex}
            appliedAdjustmentIds={appliedSet}
            onToggleAdjustment={handleToggleAdjustment}
            isConfirmed={ui.confirmedCandidateId === ui.selectedCandidateId}
            onConfirm={handleConfirm}
            threadContextSlot={
              // 別セクション。session bubble list には混ぜない（state!=="ready" は自動で null）。
              <CoAlterThreadContextSection
                messages={threadContext.messages}
                speakers={threadContext.speakers}
              />
            }
          />
        </div>

        {/* プランのフローティング overlay（各カードが面に浮かぶ・チャット見え隠れ） */}
        {planOpen && (
          <CoAlterPlanOverlay onClose={() => setPlanOpen(false)}>
            {/* C6-A-1: flag ON ∧ live VM あり → engine 駆動の合意形成知性パネル。
              * それ以外（flag OFF / fetch 前 / 失敗）→ 従来 fixture パネル（不変・fail-closed）。 */}
            {PLAN_FLAGS.coalterEngineLive && planIntelligence.vm ? (
              <PlanIntelligenceLivePanel vm={planIntelligence.vm} realityOsSurface={realityOsSurface} />
            ) : (
              <PlanIntelligencePanel
                session={session}
                selectedCandidateId={ui.selectedCandidateId}
                onSelectCandidate={handleSelectCandidate}
                appliedAdjustmentIds={appliedSet}
                onToggleAdjustment={handleToggleAdjustment}
                confirmedCandidateId={ui.confirmedCandidateId}
                onCollapse={() => setPlanOpen(false)}
                onExpand={() => {}}
                surface="floating"
                showHeader={false}
              />
            )}
          </CoAlterPlanOverlay>
        )}

        {/* 「予定を確認」: overlay を閉じている時の再表示トリガ */}
        {!planOpen && (
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            className="absolute bottom-20 right-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg ring-2 ring-white/60 transition-transform hover:scale-105"
          >
            <CalendarMiniIcon size={13} />
            予定を確認
          </button>
        )}

        {/* C5-E: CoAlter 非永続 preview（client flag OFF 既定 → 非表示・absolute・split layout 非干渉・DB 保存なし） */}
        <CoAlterPreviewBlock
          enabled={PLAN_FLAGS.coalterBrainPreviewClient}
          state={coalterPreview.state}
          preview={coalterPreview.preview}
          onGenerate={coalterPreview.generate}
        />
      </div>
      </div>
    </div>
  );
}
