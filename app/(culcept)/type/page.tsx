// app/(culcept)/type/page.tsx — 24 Archetypes Index (Premium Design)
import Link from "next/link";
import type { Metadata } from "next";
import {
  ARCHETYPE_DEFS,
  COLOR_GROUPS,
  type ColorGroupKey,
  type ArchetypeDef,
  type ColorFamily,
} from "@/lib/stargazer/archetypeTypes";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "24の原型 | Aneurasync",
  description:
    "Aneurasyncの24の原型。認知・感情・社交・実行の4軸から導かれる、あなたの深層タイプを探る。",
};

/* ━━━ Color hex values per group ━━━ */
const GROUP_HEX: Record<ColorFamily, string> = {
  navy: "#3B82F6",
  magenta: "#D946EF",
  indigo: "#6366F1",
  orange: "#F59E0B",
  emerald: "#10B981",
  gold: "#EAB308",
};

/* ━━━ Group taglines (exact copy) ━━━ */
const GROUP_TAGLINES: Record<ColorGroupKey, string> = {
  A_C: "静寂の中で、世界の設計図を引く者たち",
  A_V: "論理の刃に、情熱の炎を纏わせる者たち",
  N_C: "言葉より先に、真実が見える者たち",
  N_V: "触れたものすべてを、変容させる者たち",
  S_C: "手のひらで世界の重さを量る者たち",
  S_V: "全身で生きて、全身で壊す者たち",
};

/* ━━━ Group quotes — 偉人の名言 ━━━ */
const GROUP_QUOTES: Record<ColorGroupKey, { text: string; author: string }> = {
  A_C: { text: "神は細部に宿る", author: "ミース・ファン・デル・ローエ" },
  A_V: { text: "夢なき者に理想なし、理想なき者に計画なし", author: "吉田松陰" },
  N_C: { text: "秘すれば花", author: "世阿弥" },
  N_V: { text: "おもしろきこともなき世をおもしろく", author: "高杉晋作" },
  S_C: { text: "千日の稽古を鍛とし、万日の稽古を練とす", author: "宮本武蔵" },
  S_V: { text: "考えるな、感じろ", author: "ブルース・リー" },
};

/* ━━━ Tailwind color classes per group ━━━ */
const GROUP_COLORS: Record<
  ColorFamily,
  {
    accent: string;
    badgeBg: string;
    badgeText: string;
    glowHex: string;
    gradientFrom: string;
    gradientTo: string;
  }
> = {
  navy: {
    accent: "text-blue-400",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-300",
    glowHex: "#3B82F6",
    gradientFrom: "#3B82F6",
    gradientTo: "#1D4ED8",
  },
  magenta: {
    accent: "text-fuchsia-400",
    badgeBg: "bg-fuchsia-500/15",
    badgeText: "text-fuchsia-300",
    glowHex: "#D946EF",
    gradientFrom: "#D946EF",
    gradientTo: "#A21CAF",
  },
  indigo: {
    accent: "text-indigo-400",
    badgeBg: "bg-indigo-500/15",
    badgeText: "text-indigo-300",
    glowHex: "#6366F1",
    gradientFrom: "#6366F1",
    gradientTo: "#4338CA",
  },
  orange: {
    accent: "text-amber-400",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-300",
    glowHex: "#F59E0B",
    gradientFrom: "#F59E0B",
    gradientTo: "#D97706",
  },
  emerald: {
    accent: "text-emerald-400",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-300",
    glowHex: "#10B981",
    gradientFrom: "#10B981",
    gradientTo: "#059669",
  },
  gold: {
    accent: "text-yellow-400",
    badgeBg: "bg-yellow-500/15",
    badgeText: "text-yellow-300",
    glowHex: "#EAB308",
    gradientFrom: "#EAB308",
    gradientTo: "#CA8A04",
  },
};

/* ━━━ Group order ━━━ */
const GROUP_ORDER: ColorGroupKey[] = [
  "A_C",
  "A_V",
  "N_C",
  "N_V",
  "S_C",
  "S_V",
];

/* ━━━ Group types by ColorGroupKey ━━━ */
function groupTypes(): { key: ColorGroupKey; types: ArchetypeDef[] }[] {
  return GROUP_ORDER.map((key) => {
    const [cognition, emotion] = key.split("_");
    const types = ARCHETYPE_DEFS.filter(
      (d) => d.cognition === cognition && d.emotion === emotion,
    );
    return { key, types };
  });
}

/* ━━━ Page ━━━ */
export default function TypeIndexPage() {
  const groups = groupTypes();

  return (
    <div className="relative min-h-screen text-white" style={{ background: "#0a0f1e" }}>
      {/* ── Hover glow style ── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .type-card {
              transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease;
            }
            .type-card:hover {
              transform: scale(1.03);
              border-color: rgba(255,255,255,0.15);
              background: rgba(255,255,255,0.05);
              box-shadow: 0 8px 32px color-mix(in srgb, var(--glow-color) 20%, transparent);
            }
          `,
        }}
      />

      {/* ── Star particles (CSS-only) ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 25% 35%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 40% 8%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 55% 42%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 70% 18%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 85% 55%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 15% 70%, rgba(255,255,255,0.45) 0%, transparent 100%),
            radial-gradient(1px 1px at 90% 30%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 35% 85%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 65%, rgba(255,255,255,0.25) 0%, transparent 100%),
            radial-gradient(1px 1px at 78% 78%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 48% 25%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 92% 12%, rgba(255,255,255,0.45) 0%, transparent 100%),
            radial-gradient(1px 1px at 20% 92%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 65% 5%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 3% 38%, rgba(255,255,255,0.55) 0%, transparent 100%),
            radial-gradient(1px 1px at 82% 90%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 45% 55%, rgba(255,255,255,0.2) 0%, transparent 100%),
            radial-gradient(1px 1px at 72% 45%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 58% 88%, rgba(255,255,255,0.25) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 95% 68%, rgba(255,255,255,0.4) 0%, transparent 100%)
          `,
        }}
      />

      {/* ── Hero Section ── */}
      <header className="relative z-10 overflow-hidden px-4 pb-16 pt-20 text-center sm:pb-20 sm:pt-28">
        {/* Ambient glow orbs */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 600,
            height: 600,
            background:
              "radial-gradient(circle, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.02) 40%, transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/4 top-1/2"
          style={{
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-1/4 top-1/3"
          style={{
            width: 350,
            height: 350,
            background:
              "radial-gradient(circle, rgba(217,70,239,0.05) 0%, transparent 60%)",
          }}
        />

        {/* Title */}
        <h1 className="relative text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          24の原型
        </h1>

        {/* Subtitle */}
        <p className="relative mt-5 text-base italic text-white/60 sm:text-lg">
          あなたの内側には、まだ名前のついていない自分がいる
        </p>

        {/* 4 Axes */}
        <div className="relative mt-8 flex items-center justify-center gap-3 text-sm tracking-widest text-white/40 sm:text-base">
          <span>認知</span>
          <span className="text-white/20">&#xb7;</span>
          <span>感情</span>
          <span className="text-white/20">&#xb7;</span>
          <span>社交</span>
          <span className="text-white/20">&#xb7;</span>
          <span>実行</span>
        </div>

        {/* Decorative line */}
        <div className="relative mx-auto mt-10 h-px w-32 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </header>

      {/* ── Groups ── */}
      <main className="relative z-10 mx-auto max-w-6xl space-y-20 px-4 pb-32 sm:px-6">
        {groups.map(({ key, types }) => {
          const group = COLOR_GROUPS[key];
          const palette = GROUP_COLORS[group.family];
          const hex = GROUP_HEX[group.family];
          const tagline = GROUP_TAGLINES[key];
          const quote = GROUP_QUOTES[key];

          return (
            <section key={key}>
              {/* Group header */}
              <div className="mb-8">
                {/* Group name + quote — side by side */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-6">
                  <h2
                    className="shrink-0 text-3xl font-bold tracking-wide sm:text-4xl"
                    style={{
                      background: `linear-gradient(135deg, ${palette.gradientFrom}, ${palette.gradientTo})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {group.label}
                  </h2>
                  <p className="text-sm italic leading-relaxed text-white/40 sm:text-base">
                    「{quote.text}」
                    <span className="ml-2 text-xs not-italic text-white/25">── {quote.author}</span>
                  </p>
                </div>
                <p className="mt-1 text-xs tracking-widest text-white/30 uppercase">
                  {group.englishLabel}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  {tagline}
                </p>
                {/* Decorative underline */}
                <div
                  className="mt-4 h-px w-16"
                  style={{
                    background: `linear-gradient(90deg, ${hex}40, transparent)`,
                  }}
                />
              </div>

              {/* Type cards grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {types.map((def) => (
                  <TypeCard
                    key={def.code}
                    def={def}
                    palette={palette}
                    hex={hex}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {/* ── CTA Section (not sticky) ── */}
      <section className="relative z-10 border-t border-white/[0.06]">
        <div
          className="px-4 py-20 text-center sm:py-24"
          style={{
            background:
              "linear-gradient(180deg, rgba(99,102,241,0.06) 0%, rgba(10,15,30,0) 100%)",
          }}
        >
          {/* Ambient glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: 500,
              height: 300,
              background:
                "radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)",
            }}
          />

          <Link
            href="/onboarding"
            className="group relative inline-flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-105 sm:text-lg"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.2) 50%, rgba(217,70,239,0.15) 100%)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow:
                "0 0 30px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            あなたはどの原型か、観測する
            <span
              className="transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              &rarr;
            </span>
          </Link>

          <p className="mt-5 text-sm text-white/35">
            10問で、あなたの深層が見え始める
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 pb-12 pt-4 text-center">
        <p className="text-[11px] tracking-[0.2em] text-white/15">
          Aneurasync &mdash; 深層自己観測
        </p>
      </footer>
    </div>
  );
}

/* ━━━ Type Card ━━━ */
function TypeCard({
  def,
  palette,
  hex,
}: {
  def: ArchetypeDef;
  palette: (typeof GROUP_COLORS)[ColorFamily];
  hex: string;
}) {
  return (
    <Link
      href={`/type/${def.code}`}
      className="type-card group relative flex flex-col items-start gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5"
      style={{ "--glow-color": hex } as React.CSSProperties}
    >

      {/* Emoji */}
      <span className="text-4xl leading-none">{def.emoji}</span>

      {/* Names + badge row */}
      <div className="mt-1 w-full">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold leading-snug text-white/90">
            {def.name}
          </p>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-wider ${palette.badgeBg} ${palette.badgeText}`}
          >
            {def.code}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] tracking-wide text-white/35">
          {def.englishName}
        </p>
      </div>

      {/* Tagline */}
      <p className="line-clamp-2 text-xs leading-relaxed text-white/50">
        {def.tagline}
      </p>

      {/* Core fear teaser */}
      {def.coreFear && (
        <p className="line-clamp-1 text-[10px] text-red-400/50">
          恐れ: {def.coreFear}
        </p>
      )}

      {/* Hover arrow indicator */}
      <span
        className="absolute right-3 top-3 text-sm text-white/0 transition-all duration-300 group-hover:text-white/25"
        aria-hidden="true"
      >
        &rarr;
      </span>
    </Link>
  );
}
