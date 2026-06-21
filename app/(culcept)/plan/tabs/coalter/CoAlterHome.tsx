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
import { RoutePreviewMap } from "./RoutePreviewMap";
import {
  CalendarMiniIcon,
  CheckIcon,
  ChevronRightIcon,
  DotsIcon,
  SparkleIcon,
  WalkIcon,
} from "./coalterIcons";

const AVATAR_TONE: Record<CoAlterAvatarTone, string> = {
  sky: "from-sky-400 to-indigo-400",
  rose: "from-rose-300 to-pink-400",
  violet: "from-violet-400 to-fuchsia-400",
  emerald: "from-emerald-300 to-teal-400",
  amber: "from-amber-300 to-orange-400",
};

const REC_ACCENT: Record<CoAlterHomeRecommendation["accent"], string> = {
  violet: "from-violet-50 to-indigo-50/60 text-violet-600",
  sky: "from-sky-50 to-cyan-50/60 text-sky-600",
  emerald: "from-emerald-50 to-teal-50/60 text-emerald-600",
};

export interface CoAlterHomeProps {
  readonly onOpenConversation: (conversation: CoAlterHomeConversation) => void;
}

export function CoAlterHome({ onOpenConversation }: CoAlterHomeProps) {
  const { conversations, recommendations, recent } = COALTER_HOME_FIXTURE;
  const c = recent.candidate;

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-3 pb-6 pt-1 sm:px-5">
      {/* ── ヘッダ ── */}
      <header className="flex items-center justify-between pt-1">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-slate-800 shadow-sm ring-1 ring-slate-200/70">
          <HomeGlyph />
          ホーム
        </span>
        <div className="flex items-center gap-2">
          <HeaderIconButton label="設定">
            <DotsIcon size={16} />
          </HeaderIconButton>
          <HeaderIconButton label="メンバー">
            <span className="text-[13px]">👤</span>
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
              className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70"
            >
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${REC_ACCENT[rec.accent]}`}
              >
                <RecIcon icon={rec.icon} />
              </span>
              <span className="text-[11px] font-bold leading-tight text-slate-800">{rec.label}</span>
              <span className="text-[10px] leading-snug text-slate-400">{rec.caption}</span>
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

function RecIcon({ icon }: { icon: CoAlterHomeRecommendation["icon"] }) {
  switch (icon) {
    case "create":
      return <SparkleIcon size={15} />;
    case "candidates":
      return <CalendarMiniIcon size={15} />;
    case "confirm":
      return <CheckIcon size={15} />;
  }
}
