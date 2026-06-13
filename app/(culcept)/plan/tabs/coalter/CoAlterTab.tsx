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
import {
  CalendarMiniIcon,
  ChatRoundIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudSunIcon,
  DotsIcon,
  SparkleIcon,
  SunIcon,
} from "./coalterIcons";
import { PlanIntelligencePanel } from "./PlanIntelligencePanel";
import { CoAlterChatPanel } from "./CoAlterChatPanel";

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

// ── split（UI 専権・local state） ──
const PLAN_PCT_DEFAULT = 58;
/** これ未満で指を離すとプランは完全に畳まれる */
const PLAN_COLLAPSE_AT = 14;
/** チャットは畳めない: 最低でもこの px 幅を確保（入力欄の常時固定） */
const CHAT_MIN_PX = 168;
const DIVIDER_PX = 12;
/** ペイン share がこの % を下回ると高さも縮み始める（下隅へ縮んでいく表現） */
const SHRINK_BELOW_PCT = 38;

/** share(%) → ペイン高さ(%)。下限 56%。 */
function shrinkHeightPct(sharePct: number): number {
  if (sharePct >= SHRINK_BELOW_PCT) return 100;
  return Math.max(56, Math.round(100 - (SHRINK_BELOW_PCT - sharePct) * 1.7));
}

export interface CoAlterTabProps {
  /**
   * C-1: 認証 self の userId（server＝PlanPage の auth.getUser 由来）。
   * **client 推論しない**ための self 正本。未指定なら relation binding は self を解決できず unbound。
   * 表示には使わない（raw userId を UI に出さない）。
   */
  readonly viewerUserId?: string;
}

export function CoAlterTab({ viewerUserId }: CoAlterTabProps = {}) {
  // モード未選択（null）の間も daily の内容を仮表示する（reference の「モードを選ぶ」状態）
  const [modeChoice, setModeChoice] = useState<CoAlterPlanMode | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const mode: CoAlterPlanMode = modeChoice ?? "daily";
  const session = COALTER_PLAN_SESSION_FIXTURES[mode];

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
  const bodySessionMessages = [
    ...buildSessionMessagesFromFixture(session),
    ...ui.sentMessages.map((m) => toSessionMessageFromFixture(m, session.id)),
  ];
  // 本文は fixture session ＝ local echo 可（legacy live read-only の "none" 経路は撤去済み）。
  const canLocalEcho = true;

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // split 領域: 1画面フィット + ピンチ縮小 + divider ドラッグ + プラン折りたたみ
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const splitRef = useRef<HTMLDivElement | null>(null);
  const [planPct, setPlanPct] = useState(PLAN_PCT_DEFAULT);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  /** ピンチ/ドラッグ中は width/height transition を切る */
  const [interacting, setInteracting] = useState(false);

  // 1画面フィット: split 領域の高さ = viewport 残り（ページスクロールを出さない）
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const el = splitRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // 28 = タブ root pb-2(8) + /plan main py-4 の下 padding(16) + 余裕(4)。ページスクロールを出さない。
      setFillHeight(Math.max(400, Math.round(window.innerHeight - top - 28)));
    };
    update();
    // モバイルはチャット読みやすさ優先の初期 split（チャット側を広めに）
    if (window.innerWidth < 640) setPlanPct(46);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /** チャット下限を反映した plan share の上限（%） */
  const maxPlanPct = useCallback(() => {
    const w = splitRef.current?.getBoundingClientRect().width ?? 1200;
    return Math.min(84, 100 - ((CHAT_MIN_PX + DIVIDER_PX) / w) * 100);
  }, []);

  const clampPlanPct = useCallback(
    (pct: number) => Math.min(maxPlanPct(), Math.max(0, pct)),
    [maxPlanPct],
  );

  /** ジェスチャ終了時: 小さすぎたら完全折りたたみへ（復帰幅はチャット下限を尊重） */
  const settlePlanPct = useCallback(
    (pct: number) => {
      if (pct < PLAN_COLLAPSE_AT) {
        setPlanCollapsed(true);
        setPlanPct(clampPlanPct(PLAN_PCT_DEFAULT));
      }
    },
    [clampPlanPct],
  );

  // ── ピンチ（2 ポインタ）: プラン上で縮小→プランが左下へ / チャット上で縮小→チャットが右下へ ──
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    startDist: number;
    startPlanPct: number;
    target: "plan" | "chat";
  } | null>(null);
  const planPctRef = useRef(planPct);
  planPctRef.current = planPct;

  const pinchDistance = () => {
    const pts = [...pointersRef.current.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const handleSplitPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && !planCollapsed) {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pts = [...pointersRef.current.values()];
      const midX = (pts[0].x + pts[1].x) / 2;
      const dividerX = rect.left + (rect.width * planPctRef.current) / 100;
      pinchRef.current = {
        startDist: pinchDistance(),
        startPlanPct: planPctRef.current,
        target: midX < dividerX ? "plan" : "chat",
      };
      setInteracting(true);
    }
  };

  const handleSplitPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (!pinch || pointersRef.current.size < 2) return;
    e.preventDefault();
    const ratio = pinchDistance() / pinch.startDist;
    // ピンチイン（ratio<1）で対象ペインが縮む
    const next =
      pinch.target === "plan"
        ? pinch.startPlanPct * ratio
        : 100 - (100 - pinch.startPlanPct) * ratio;
    setPlanPct(clampPlanPct(next));
  };

  const releasePointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null;
      setInteracting(false);
      settlePlanPct(planPctRef.current);
    }
  };

  // ── divider ドラッグ（マウス/1本指の代替操作） ──
  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // ピンチ系へ流さない
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setInteracting(true);
    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setPlanPct(clampPlanPct(pct));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setInteracting(false);
      settlePlanPct(planPctRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // 派生 share / 高さ（縮むほど下隅アンカーで小さくなる）
  const chatPct = planCollapsed ? 100 : 100 - planPct;
  const planHeightPct = shrinkHeightPct(planPct);
  const chatHeightPct = planCollapsed ? 100 : shrinkHeightPct(chatPct);
  const paneTransition = interacting
    ? ""
    : " transition-[width,height] duration-200 ease-out";

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col px-3 pb-2 sm:px-5">
      {/* ── タブ内ヘッダ: モード選択 / 日付 / 天気 / ペアアバター / メニュー ── */}
      <header className="flex flex-wrap items-center gap-2 py-2.5">
        {/* モード選択（白系デザイン・CEO 必須指定） */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setModeMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-violet-400">
              <span className="h-1 w-1 rounded-full bg-violet-500" />
            </span>
            {modeChoice === null ? "モードを選ぶ" : COALTER_MODE_LABELS[modeChoice]}
            <ChevronDownIcon size={12} className="text-slate-400" />
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

        {/* 日付（fixture 由来・モードで窓幅が変わる） */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
          <CalendarMiniIcon size={13} className="text-slate-400" />
          {session.header.dateLabel}
        </span>

        {/* 天気（fixture 由来） */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
          {session.header.weather.icon === "sun" ? (
            <SunIcon size={13} className="text-amber-400" />
          ) : (
            <CloudSunIcon size={13} className="text-sky-400" />
          )}
          <span className="font-bold">{session.header.weather.high}℃</span>
          <span className="text-slate-400">{session.header.weather.low}℃</span>
        </span>

        {/* 右側: ペアアバター / メニュー */}
        <div className="ml-auto flex items-center gap-2.5">
          <div className="flex items-start gap-1.5">
            {headerParticipants.map((participant) => (
              <span key={participant.id} className="flex flex-col items-center gap-0.5">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white shadow-sm ring-2 ring-white ${AVATAR_TONE[participant.tone]}`}
                >
                  {participant.initial}
                </span>
                <span className="text-[9px] font-medium leading-none text-slate-500">
                  {participant.name}
                </span>
              </span>
            ))}
          </div>
          <div className="relative self-start">
            <button
              type="button"
              onClick={() => setInfoOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={infoOpen}
              aria-label="セッション情報"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-700"
            >
              <DotsIcon size={14} />
            </button>
            {infoOpen && (
              <>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={() => setInfoOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                  tabIndex={-1}
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500 shadow-lg">
                  <p className="inline-flex items-center gap-1 font-bold text-slate-700">
                    <SparkleIcon size={11} className="text-violet-400" />
                    CoAlter プランナー（プロトタイプ）
                  </p>
                  <p className="mt-1">
                    fixture data で描画中。バックエンド・ペア read には未接続です。
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── 本体: 左 Plan Intelligence / divider / 右チャット（常に横並び・1画面フィット） ──
        * ピンチ: 対象ペインの share を縮め、share が小さいほど高さも縮む（items-end ＝
        * プランは左下・チャットは右下へ「どんどん縮小していく」）。
        * touch-action: pan-y ＝ ペイン内 1 本指スクロールは生かしつつ native pinch-zoom を抑止。
        */}
      <div
        ref={splitRef}
        className={`relative flex flex-row items-end [touch-action:pan-y]${interacting ? " select-none" : ""}`}
        style={{ height: fillHeight ?? undefined }}
        onPointerDown={handleSplitPointerDown}
        onPointerMove={handleSplitPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      >
        {!planCollapsed && (
          <>
            <div
              className={`min-w-0 self-end${paneTransition}`}
              style={{
                width: `calc(${planPct}% - ${DIVIDER_PX}px)`,
                height: `${planHeightPct}%`,
              }}
            >
              <PlanIntelligencePanel
                session={session}
                selectedCandidateId={ui.selectedCandidateId}
                onSelectCandidate={handleSelectCandidate}
                appliedAdjustmentIds={appliedSet}
                onToggleAdjustment={handleToggleAdjustment}
                confirmedCandidateId={ui.confirmedCandidateId}
                onCollapse={() => setPlanCollapsed(true)}
                onExpand={() => setPlanPct(clampPlanPct(PLAN_PCT_DEFAULT))}
              />
            </div>
            {/* divider（全幅で表示・ドラッグで比率調整＝ピンチの代替操作） */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="パネル幅の調整"
              onPointerDown={handleDividerPointerDown}
              className="group flex h-full w-3 shrink-0 cursor-col-resize touch-none items-center justify-center"
            >
              <span className="h-12 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-violet-400" />
            </div>
          </>
        )}
        <div
          className={`min-w-0 flex-1 self-end${paneTransition}`}
          style={{ height: `${chatHeightPct}%` }}
        >
          <CoAlterChatPanel
            session={session}
            participants={fixtureSessionParticipants}
            sessionMessages={bodySessionMessages}
            sendMode="local_echo"
            onSend={handleSend}
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

        {/* プラン復帰チップ（完全折りたたみ時・左下） */}
        {planCollapsed && (
          <button
            type="button"
            onClick={() => setPlanCollapsed(false)}
            className="absolute bottom-2 left-1 z-10 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-2 text-[11px] font-bold text-violet-700 shadow-md transition-colors hover:bg-violet-50"
          >
            <ChatRoundIcon size={12} className="text-violet-400" />
            プランを開く
            <ChevronRightIcon size={11} className="text-violet-400" />
          </button>
        )}
      </div>
    </div>
  );
}
