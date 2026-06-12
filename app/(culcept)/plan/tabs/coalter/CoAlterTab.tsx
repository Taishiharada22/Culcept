"use client";

/**
 * CoAlterTab — /plan 内の CoAlter タブ（UI プロトタイプ・local only）
 *
 * 製品方針（CEO 指示 2026-06-12）:
 *   - CoAlter はチャットサービスの形を維持しつつ、/plan 内では2人専属プランナーになる
 *   - 左 = Plan Intelligence パネル / 右 = 2人 + CoAlter のチャット（同一 session の2射影）
 *   - 左上のモード選択で daily / travel を切替（モードはスコープパラメータ・契約 §2）
 *   - 左右比率は UI 専権: ドラッグ divider + local state（バックエンド対応なし）
 *
 * 厳格スコープ: fixture data のみ / fetch・DB・route・server action・backend 接続なし。
 * 理想画像 over.png は reference overlay（構図・密度・余白・階層・質感の参照）。
 * 文言・日付・数値はすべて fixture 由来で、現実の payload に差し替わる前提。
 */

import { useCallback, useRef, useState } from "react";

import {
  COALTER_MODE_LABELS,
  COALTER_PLAN_SESSION_FIXTURES,
  type ChatMessageFixture,
  type CoAlterPlanMode,
  type CoAlterPlanSessionFixture,
} from "./coalterPlanSessionFixture";
import {
  CalendarMiniIcon,
  ChatRoundIcon,
  CheckIcon,
  ChevronDownIcon,
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

// 左右比率（UI 専権・local state）。lg 以上でのみ divider が出る。
const LEFT_PCT_DEFAULT = 64;
const LEFT_PCT_MIN = 48;
const LEFT_PCT_MAX = 76;

export function CoAlterTab() {
  // モード未選択（null）の間も daily の内容を仮表示する（reference の「モードを選ぶ」状態）
  const [modeChoice, setModeChoice] = useState<CoAlterPlanMode | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [leftPct, setLeftPct] = useState(LEFT_PCT_DEFAULT);
  const splitRef = useRef<HTMLDivElement | null>(null);

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
  const messages = [...session.messages, ...ui.sentMessages];

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
    const sender = session.participants[0];
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

  // ── 左右比率ドラッグ（lg 以上のみ・local state） ──
  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(LEFT_PCT_MAX, Math.max(LEFT_PCT_MIN, pct)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-8 sm:px-6">
      {/* ── タブ内ヘッダ: モード選択 / 日付 / 天気 / ペアアバター / メニュー ── */}
      <header className="flex flex-wrap items-center gap-2 py-3">
        {/* モード選択（daily / travel） */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setModeMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white/70">
              <span className="h-1 w-1 rounded-full bg-white" />
            </span>
            {modeChoice === null ? "モードを選ぶ" : COALTER_MODE_LABELS[modeChoice]}
            <ChevronDownIcon size={12} className="text-white/70" />
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
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm">
          <CalendarMiniIcon size={14} className="text-slate-400" />
          {session.header.dateLabel}
        </span>

        {/* 天気（fixture 由来） */}
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm">
          {session.header.weather.icon === "sun" ? (
            <SunIcon size={14} className="text-amber-400" />
          ) : (
            <CloudSunIcon size={14} className="text-sky-400" />
          )}
          <span className="font-bold">{session.header.weather.high}℃</span>
          <span className="text-slate-400">{session.header.weather.low}℃</span>
        </span>

        {/* 右側: （チャット再表示）/ ペアアバター / メニュー */}
        <div className="ml-auto flex items-center gap-3">
          {!chatOpen && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 shadow-sm transition-colors hover:bg-violet-100"
            >
              <ChatRoundIcon size={12} />
              チャットを開く
            </button>
          )}
          <div className="flex items-start gap-2">
            {session.participants.map((participant) => (
              <span key={participant.id} className="flex flex-col items-center gap-0.5">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ring-2 ring-white ${AVATAR_TONE[participant.tone]}`}
                >
                  {participant.initial}
                </span>
                <span className="text-[10px] font-medium text-slate-500">{participant.name}</span>
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-700"
            >
              <DotsIcon size={15} />
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

      {/* ── 本体: 左 Plan Intelligence / divider / 右チャット ── */}
      <div
        ref={splitRef}
        className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-0"
        style={{ ["--coalter-left" as string]: `${leftPct}%` }}
      >
        <div className={chatOpen ? "min-w-0 lg:w-[var(--coalter-left)]" : "min-w-0 lg:flex-1"}>
          <PlanIntelligencePanel
            session={session}
            selectedCandidateId={ui.selectedCandidateId}
            onSelectCandidate={handleSelectCandidate}
            appliedAdjustmentIds={appliedSet}
            onToggleAdjustment={handleToggleAdjustment}
            confirmedCandidateId={ui.confirmedCandidateId}
          />
        </div>
        {chatOpen && (
          <>
            {/* divider（lg 以上のみ・ドラッグで比率調整） */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="パネル幅の調整"
              onPointerDown={handleDividerPointerDown}
              className="group hidden w-4 shrink-0 cursor-col-resize items-center justify-center lg:flex"
            >
              <span className="h-12 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <CoAlterChatPanel
                session={session}
                messages={messages}
                onSend={handleSend}
                selectedCandidateIndex={selectedIndex}
                appliedAdjustmentIds={appliedSet}
                onToggleAdjustment={handleToggleAdjustment}
                isConfirmed={ui.confirmedCandidateId === ui.selectedCandidateId}
                onConfirm={handleConfirm}
                onCollapse={() => setChatOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
