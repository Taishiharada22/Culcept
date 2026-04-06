// app/(culcept)/type/[code]/page.tsx
// アーキタイプ公開ページ — SNSシェア時のランディングページ
import type { Metadata } from "next";
import Link from "next/link";
import {
  ARCHETYPE_DEFS,
  getArchetypeByCode,
  getColorGroup,
  ARCHETYPE_CODES,
  type ArchetypeCode,
} from "@/lib/stargazer/archetypeTypes";

// ---------------------------------------------------------------------------
// Static generation
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return ARCHETYPE_CODES.map((code) => ({ code }));
}

// ---------------------------------------------------------------------------
// OG Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const def = getArchetypeByCode(code as ArchetypeCode);
  if (!def) return { title: "Aneurasync" };

  const title = `${def.emoji} ${def.englishName} — ${def.name} | Aneurasync`;
  const description = def.tagline;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/api/og-image?type=archetype&code=${code}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og-image?type=archetype&code=${code}`],
    },
  };
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const FAMILY_COLORS: Record<string, {
  gradient: string; accent: string; accentLight: string;
  badge: string; glow: string; ring: string;
}> = {
  navy: {
    gradient: "from-blue-800/30 via-slate-600/20 to-blue-900/30",
    accent: "#1E3A5F",
    accentLight: "rgb(30 58 95 / 0.15)",
    badge: "bg-blue-500/20 text-blue-200 border-blue-400/30",
    glow: "shadow-blue-500/20",
    ring: "ring-blue-500/30",
  },
  magenta: {
    gradient: "from-pink-600/30 via-rose-500/20 to-fuchsia-600/30",
    accent: "#D946EF",
    accentLight: "rgb(217 70 239 / 0.15)",
    badge: "bg-pink-500/20 text-pink-200 border-pink-400/30",
    glow: "shadow-pink-500/20",
    ring: "ring-pink-500/30",
  },
  indigo: {
    gradient: "from-indigo-600/30 via-violet-500/20 to-indigo-700/30",
    accent: "#6366F1",
    accentLight: "rgb(99 102 241 / 0.15)",
    badge: "bg-indigo-500/20 text-indigo-200 border-indigo-400/30",
    glow: "shadow-indigo-500/20",
    ring: "ring-indigo-500/30",
  },
  orange: {
    gradient: "from-orange-600/30 via-amber-500/20 to-yellow-600/30",
    accent: "#F59E0B",
    accentLight: "rgb(245 158 11 / 0.15)",
    badge: "bg-orange-500/20 text-orange-200 border-orange-400/30",
    glow: "shadow-orange-500/20",
    ring: "ring-orange-500/30",
  },
  emerald: {
    gradient: "from-emerald-600/30 via-teal-500/20 to-green-600/30",
    accent: "#10B981",
    accentLight: "rgb(16 185 129 / 0.15)",
    badge: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
    glow: "shadow-emerald-500/20",
    ring: "ring-emerald-500/30",
  },
  gold: {
    gradient: "from-yellow-600/30 via-amber-400/20 to-orange-500/30",
    accent: "#EAB308",
    accentLight: "rgb(234 179 8 / 0.15)",
    badge: "bg-yellow-500/20 text-yellow-200 border-yellow-400/30",
    glow: "shadow-yellow-500/20",
    ring: "ring-yellow-500/30",
  },
} as const;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default async function ArchetypePublicPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const def = getArchetypeByCode(code as ArchetypeCode);

  if (!def) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <p className="text-white/60 text-lg">タイプが見つかりません</p>
      </div>
    );
  }

  const colorGroup = getColorGroup(def.code);
  const colors = FAMILY_COLORS[colorGroup.family];
  const shadow = getArchetypeByCode(def.shadowCode);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white relative overflow-hidden">
      {/* Star particles background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.4) 50%, transparent 50%),
            radial-gradient(1px 1px at 25% 35%, rgba(255,255,255,0.3) 50%, transparent 50%),
            radial-gradient(1px 1px at 40% 8%, rgba(255,255,255,0.25) 50%, transparent 50%),
            radial-gradient(1px 1px at 55% 52%, rgba(255,255,255,0.35) 50%, transparent 50%),
            radial-gradient(1px 1px at 70% 22%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 85% 45%, rgba(255,255,255,0.3) 50%, transparent 50%),
            radial-gradient(1px 1px at 15% 65%, rgba(255,255,255,0.15) 50%, transparent 50%),
            radial-gradient(1px 1px at 30% 80%, rgba(255,255,255,0.25) 50%, transparent 50%),
            radial-gradient(1px 1px at 50% 90%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 65% 72%, rgba(255,255,255,0.3) 50%, transparent 50%),
            radial-gradient(1px 1px at 80% 60%, rgba(255,255,255,0.15) 50%, transparent 50%),
            radial-gradient(1px 1px at 92% 85%, rgba(255,255,255,0.25) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 5% 42%, rgba(255,255,255,0.5) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 48% 28%, rgba(255,255,255,0.4) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 75% 95%, rgba(255,255,255,0.35) 50%, transparent 50%),
            radial-gradient(1px 1px at 18% 92%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 38% 55%, rgba(255,255,255,0.15) 50%, transparent 50%),
            radial-gradient(1px 1px at 62% 12%, rgba(255,255,255,0.3) 50%, transparent 50%),
            radial-gradient(1px 1px at 88% 38%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 95% 18%, rgba(255,255,255,0.25) 50%, transparent 50%)
          `,
        }}
      />

      {/* Background gradient glow */}
      <div
        className={`fixed inset-0 bg-gradient-to-br ${colors.gradient} opacity-40 pointer-events-none`}
      />

      {/* Accent orb */}
      <div
        className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{ backgroundColor: colors.accent }}
      />

      <main className="relative z-10 max-w-2xl mx-auto px-5 py-12 space-y-8">
        {/* ── Hero ── */}
        <section className="text-center space-y-5 pt-10">
          <div className="text-8xl">{def.emoji}</div>
          <h1 className="text-3xl font-bold tracking-tight">
            {def.englishName}
          </h1>
          <div className="flex items-center justify-center gap-2">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-mono border ${colors.badge}`}
            >
              {def.code}
            </span>
            <span className="text-white/60 text-sm">{def.name}</span>
          </div>
          <p className="text-white/70 text-base leading-relaxed max-w-md mx-auto italic">
            {def.tagline}
          </p>
          {def.motto && (
            <p className="text-white/40 text-sm tracking-wide max-w-sm mx-auto">
              &mdash; {def.motto}
            </p>
          )}
        </section>

        {/* ── Decorative divider ── */}
        <div
          className="h-px mx-auto max-w-xs"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.accent}88, transparent)`,
          }}
        />

        {/* ── Strengths ── */}
        <section className="flex flex-wrap justify-center gap-2">
          {def.strengths.map((s) => (
            <span
              key={s}
              className={`px-4 py-1.5 rounded-full text-sm border backdrop-blur-sm ${colors.badge}`}
            >
              {s}
            </span>
          ))}
        </section>

        {/* ── 三面鏡: DualView ── */}
        {def.dualView && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white/50 tracking-widest uppercase text-center">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: colors.accent }} />
              三面鏡
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className="rounded-2xl border border-white/10 backdrop-blur-md p-7 space-y-2"
                style={{ backgroundColor: "rgb(255 255 255 / 0.04)" }}
              >
                <p className="text-xs text-white/40 font-semibold">自画像</p>
                <p className="text-white/90 text-sm leading-relaxed">
                  {def.dualView.selfView}
                </p>
              </div>
              <div
                className="rounded-2xl border border-white/10 backdrop-blur-md p-7 space-y-2"
                style={{ backgroundColor: "rgb(255 255 255 / 0.04)" }}
              >
                <p className="text-xs text-white/40 font-semibold">観測像</p>
                <p className="text-white/90 text-sm leading-relaxed">
                  {def.dualView.observedView}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── 最深部 ── */}
        {(def.coreFear || def.coreDesire) && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-white/50 tracking-widest uppercase text-center">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: colors.accent }} />
              最深部
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {def.coreFear && (
                <div
                  className={`rounded-2xl border border-red-500/20 backdrop-blur-md p-7 space-y-3 ${colors.ring} ring-1 ring-red-500/10`}
                  style={{ backgroundColor: "rgb(220 38 38 / 0.06)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">&#x1F573;&#xFE0F;</span>
                    <p className="text-xs text-red-400/80 font-bold tracking-wider uppercase">最も恐れること</p>
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed font-medium">{def.coreFear}</p>
                </div>
              )}
              {def.coreDesire && (
                <div
                  className={`rounded-2xl border border-amber-500/20 backdrop-blur-md p-7 space-y-3 ${colors.ring} ring-1 ring-amber-500/10`}
                  style={{ backgroundColor: "rgb(245 158 11 / 0.06)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">&#x2726;</span>
                    <p className="text-xs text-amber-400/80 font-bold tracking-wider uppercase">最も求めること</p>
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed font-medium">{def.coreDesire}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── 解剖 ── */}
        <section
          className="rounded-2xl border border-white/10 backdrop-blur-md p-7 space-y-6"
          style={{ backgroundColor: "rgb(255 255 255 / 0.03)" }}
        >
          <h2 className="text-sm font-semibold text-white/50 tracking-widest uppercase">
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: colors.accent }} />
            解剖
          </h2>
          {def.innerContradiction && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#x26A1;</span>
                <p className="text-xs text-white/45 font-bold tracking-wider">この人の矛盾</p>
              </div>
              <p className="text-white/80 text-sm leading-relaxed pl-6">{def.innerContradiction}</p>
            </div>
          )}
          {def.midnightThought && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#x1F319;</span>
                <p className="text-xs text-white/45 font-bold tracking-wider">午前3時の独り言</p>
              </div>
              <p className="text-white/70 text-sm leading-relaxed pl-6 italic">{def.midnightThought}</p>
            </div>
          )}
          {def.forbiddenPhrase && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#x1F52A;</span>
                <p className="text-xs text-white/45 font-bold tracking-wider">絶対に言ってはいけない一言</p>
              </div>
              <p className="text-white/80 text-sm leading-relaxed pl-6">&ldquo;{def.forbiddenPhrase}&rdquo;</p>
            </div>
          )}
          {def.secretDesire && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#x1F92B;</span>
                <p className="text-xs text-white/45 font-bold tracking-wider">誰にも言えない本音</p>
              </div>
              <p className="text-white/70 text-sm leading-relaxed pl-6 italic">{def.secretDesire}</p>
            </div>
          )}
          {def.lovePattern && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#x1F494;</span>
                <p className="text-xs text-white/45 font-bold tracking-wider">恋に落ちるとき</p>
              </div>
              <p className="text-white/80 text-sm leading-relaxed pl-6">{def.lovePattern}</p>
            </div>
          )}
          {def.childhoodScene && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">&#x1F476;</span>
                <p className="text-xs text-white/45 font-bold tracking-wider">この人の原点</p>
              </div>
              <p className="text-white/70 text-sm leading-relaxed pl-6 italic">{def.childhoodScene}</p>
            </div>
          )}
        </section>

        {/* ── 運命の相手 ── */}
        {def.romanticMatch && (() => {
          const partner = getArchetypeByCode(def.romanticMatch.code);
          if (!partner) return null;
          return (
            <section
              className="rounded-2xl border border-white/10 backdrop-blur-md p-7 space-y-5"
              style={{ backgroundColor: "rgb(255 255 255 / 0.05)" }}
            >
              <h2 className="text-sm font-semibold text-white/50 tracking-widest uppercase">
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: colors.accent }} />
                運命の相手
              </h2>
              <Link
                href={`/type/${def.romanticMatch.code}`}
                className="flex items-center gap-4 group"
              >
                <span className="text-4xl">{partner.emoji}</span>
                <div>
                  <p className="text-white/90 font-semibold group-hover:underline">
                    {partner.englishName}
                    <span className="ml-2 text-white/40 text-xs font-mono">
                      {partner.code}
                    </span>
                  </p>
                  <p className="text-white/50 text-sm">{partner.name}</p>
                </div>
              </Link>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">&#x1F498;</span>
                    <p className="text-xs text-white/45 font-bold tracking-wider">惹かれる理由</p>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed pl-6">{def.romanticMatch.attraction}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">&#x1F504;</span>
                    <p className="text-xs text-white/45 font-bold tracking-wider">関係のダイナミクス</p>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed pl-6">{def.romanticMatch.dynamic}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">&#x26A0;&#xFE0F;</span>
                    <p className="text-xs text-white/45 font-bold tracking-wider">注意点</p>
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed pl-6 italic">{def.romanticMatch.warning}</p>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── もうひとりの自分 ── */}
        {shadow && (
          <section
            className="rounded-2xl border border-white/10 backdrop-blur-md p-7 space-y-4"
            style={{ backgroundColor: "rgb(255 255 255 / 0.04)" }}
          >
            <h2 className="text-sm font-semibold text-white/50 tracking-widest uppercase">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: colors.accent }} />
              もうひとりの自分
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{shadow.emoji}</span>
              <div>
                <p className="text-white/90 font-semibold">
                  {shadow.englishName}
                  <span className="ml-2 text-white/40 text-xs font-mono">
                    {shadow.code}
                  </span>
                </p>
                <p className="text-white/50 text-sm">{shadow.name}</p>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed italic">
              {def.shadowTension}
            </p>
          </section>
        )}

        {/* ── Quote ── */}
        {def.quote && (
          <section
            className={`rounded-2xl border backdrop-blur-md p-7 text-center space-y-4 ${colors.ring} ring-1`}
            style={{ backgroundColor: "rgb(255 255 255 / 0.03)" }}
          >
            <p className="text-white/80 text-lg leading-relaxed">
              &ldquo;{def.quote.text}&rdquo;
            </p>
            <p className="text-white/40 text-xs tracking-wide">
              &mdash;&mdash; {def.quote.author}
            </p>
          </section>
        )}

        {/* ── CTA ── */}
        <section className="text-center pt-4">
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-sm transition-all hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}88)`,
              color: "#fff",
              boxShadow: `0 0 32px ${colors.accent}44`,
            }}
          >
            あなたの型を観測する
          </Link>
        </section>

        {/* ── 他のタイプ ── */}
        <section className="text-center pt-8">
          <Link
            href="/type"
            className="inline-block text-white/40 text-sm tracking-wide hover:text-white/70 transition-colors"
          >
            24の原型をすべて見る &rarr;
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer className="text-center pt-8 pb-12">
          <p className="text-white/30 text-xs tracking-widest">
            Aneurasync &mdash; 深層自己観測
          </p>
        </footer>
      </main>
    </div>
  );
}
