"use client";

/**
 * CoAlterHome — CoAlter タブの **入口ホーム画面**（会話一覧 + おすすめ + 最近のご提案）
 *
 * 参考: app/(culcept)/components/coalter/home.png（CEO 提供）。
 * /plan の CoAlter タブは **このホームで始まり**、会話を選ぶと Talk 画面に入る（CEO 2026-06-21）。
 *
 * presentation only・fixture data（`coalterHomeFixture`）。send/write/brain/persistence なし。
 */

import {
  COALTER_HOME_FIXTURE,
  type CoAlterAvatarTone,
  type CoAlterHomeConversation,
  type CoAlterHomeRecommendation,
} from "./coalterHomeFixture";
import { COALTER_PLAN_SESSION_FIXTURES } from "./coalterPlanSessionFixture";
import { RoutePreviewMap } from "./RoutePreviewMap";
import {
  CalendarMiniIcon,
  ChevronRightIcon,
  SparkleIcon,
  WalkIcon,
} from "./coalterIcons";

// 柔らかいトーン（home.png のアバターは写真。資産無しのため淡いグラデで近づける）。
const AVATAR_TONE: Record<CoAlterAvatarTone, string> = {
  sky: "from-sky-300 to-indigo-300",
  rose: "from-rose-200 to-pink-300",
  violet: "from-violet-300 to-fuchsia-300",
  emerald: "from-emerald-200 to-teal-300",
  amber: "from-amber-200 to-orange-300",
};

// おすすめカードのサムネイル用ルート（既存 daily fixture を流用＝mini-map が描ける）。
const DAILY = COALTER_PLAN_SESSION_FIXTURES.daily;

export interface CoAlterHomeProps {
  readonly onOpenConversation: (conversation: CoAlterHomeConversation) => void;
}

export function CoAlterHome({ onOpenConversation }: CoAlterHomeProps) {
  const { conversations, recommendations, recent } = COALTER_HOME_FIXTURE;
  const c = recent.candidate;

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-3 pb-6 pt-1 sm:px-5">
      {/* ── ヘッダ（home.png 準拠: ホーム + 設定/メンバー/招待） ── */}
      <header className="flex items-center justify-between pt-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-slate-800 shadow-sm ring-1 ring-slate-200/70">
          <HomeGlyph />
          ホーム
        </span>
        <div className="flex items-center gap-2">
          <HeaderIconButton label="設定">
            <GearGlyph />
          </HeaderIconButton>
          <HeaderIconButton label="プロフィール">
            <PersonGlyph />
          </HeaderIconButton>
          <HeaderIconButton label="メンバーを招待">
            <PersonAddGlyph />
          </HeaderIconButton>
        </div>
      </header>

      {/* ── 会話一覧 ── */}
      <section aria-label="会話一覧" className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <ul className="divide-y divide-slate-100">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <button
                type="button"
                onClick={() => onOpenConversation(conv)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm ${AVATAR_TONE[conv.tone]}`}
                >
                  {conv.initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-800">{conv.name}</span>
                    {conv.subLabel && (
                      <span className="shrink-0 text-[10px] text-slate-400">{conv.subLabel}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{conv.lastMessage}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-slate-400">{conv.time}</span>
                  {conv.unread ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white">
                      {conv.unread}
                    </span>
                  ) : (
                    <ChevronRightIcon size={12} className="text-slate-300" />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── おすすめ ── */}
      <section aria-label="おすすめ">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-700">おすすめ</h2>
          <button type="button" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-violet-500">
            すべて見る <ChevronRightIcon size={11} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
            >
              <div className="h-14 overflow-hidden">
                <RecThumbnail icon={rec.icon} />
              </div>
              <div className="flex flex-col gap-0.5 p-2.5 pt-2">
                <span className="text-[11px] font-bold leading-tight text-slate-800">{rec.label}</span>
                <span className="text-[10px] leading-snug text-slate-400">{rec.caption}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 最近のご提案 ── */}
      <section aria-label="最近のご提案">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-700">最近のご提案</h2>
          <button type="button" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-violet-500">
            すべて見る <ChevronRightIcon size={11} />
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <span className="h-16 w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200/60">
            <RoutePreviewMap nodes={c.route.nodes} variant="mini" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-500">
              <SparkleIcon size={10} /> {c.tags[0]} ・ {c.tags[1]}
            </span>
            <span className="mt-0.5 block truncate text-sm font-bold text-slate-800">{c.title}</span>
            <span className="mt-1 flex items-center gap-2.5 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-0.5">
                <WalkIcon size={10} className="text-emerald-500" /> {c.stats.walkKm}km
              </span>
              <span className="inline-flex items-center gap-0.5">
                <CalendarMiniIcon size={10} className="text-slate-400" /> {c.stats.returnEta}
              </span>
              <span className="text-slate-400">{recent.participantsLabel}</span>
            </span>
          </span>
          <ChevronRightIcon size={14} className="shrink-0 text-slate-300" />
        </div>
      </section>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function HomeGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-violet-500" aria-hidden>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9h14v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderIconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200/70 transition-colors hover:text-slate-700"
    >
      {children}
    </button>
  );
}

function GearGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function PersonGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function PersonAddGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M3 20a6.2 6.2 0 0 1 12 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}

/** おすすめカードのサムネイル（map / map / calendar）。home.png の小プレビュー相当。 */
function RecThumbnail({ icon }: { icon: CoAlterHomeRecommendation["icon"] }) {
  if (icon === "confirm") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <CalendarGridGlyph />
      </div>
    );
  }
  const nodes =
    icon === "create" ? DAILY.candidates[0].route.nodes : DAILY.candidates[2].route.nodes;
  return <RoutePreviewMap nodes={nodes} variant="mini" />;
}

function CalendarGridGlyph() {
  return (
    <svg width={52} height={40} viewBox="0 0 52 40" fill="none" aria-hidden>
      <rect x="6" y="6" width="40" height="30" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.4" />
      <path d="M6 14 H46" stroke="#cbd5e1" strokeWidth="1.4" />
      <path d="M16 4 V9 M36 4 V9" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
      <g fill="#cdd6e3">
        <rect x="11" y="18" width="6" height="4" rx="1" />
        <rect x="23" y="18" width="6" height="4" rx="1" />
        <rect x="35" y="18" width="6" height="4" rx="1" />
        <rect x="11" y="26" width="6" height="4" rx="1" />
        <rect x="23" y="26" width="6" height="4" rx="1" fill="#34d399" />
        <rect x="35" y="26" width="6" height="4" rx="1" />
      </g>
    </svg>
  );
}
