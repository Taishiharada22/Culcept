// app/stargazer/dreams/DreamsClient.tsx
// 夢日記 & ユング象徴解釈クライアント
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  detectSymbols,
  loadDreams,
  saveDream,
  removeDream,
  ARCHETYPE_LABELS,
  type DreamEntry,
  type JungianArchetype,
} from "@/lib/stargazer/dreamJournal";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMOTION_OPTIONS: {
  value: DreamEntry["emotion"];
  label: string;
  color: string;
}[] = [
  { value: "positive", label: "心地よい", color: "rgba(99,209,150,0.25)" },
  { value: "negative", label: "不安・恐怖", color: "rgba(239,68,68,0.20)" },
  { value: "mixed", label: "入り混じった", color: "rgba(168,85,247,0.22)" },
  { value: "neutral", label: "淡々とした", color: "rgba(148,163,184,0.22)" },
];

const ARCHETYPE_COLORS: Record<JungianArchetype, string> = {
  shadow: "rgba(139,92,246,0.30)",
  anima_animus: "rgba(236,72,153,0.25)",
  self: "rgba(250,204,21,0.28)",
  persona: "rgba(99,102,241,0.25)",
  mother: "rgba(52,211,153,0.25)",
  father: "rgba(59,130,246,0.25)",
  child: "rgba(251,191,36,0.25)",
  trickster: "rgba(239,68,68,0.22)",
  hero: "rgba(249,115,22,0.25)",
  wise_old: "rgba(209,213,219,0.30)",
};

const ARCHETYPE_GLOW: Record<JungianArchetype, string> = {
  shadow: "rgba(139,92,246,0.50)",
  anima_animus: "rgba(236,72,153,0.45)",
  self: "rgba(250,204,21,0.50)",
  persona: "rgba(99,102,241,0.45)",
  mother: "rgba(52,211,153,0.45)",
  father: "rgba(59,130,246,0.45)",
  child: "rgba(251,191,36,0.45)",
  trickster: "rgba(239,68,68,0.40)",
  hero: "rgba(249,115,22,0.45)",
  wise_old: "rgba(209,213,219,0.50)",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function vividnessDots(v: number): string {
  return "●".repeat(v) + "○".repeat(5 - v);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SymbolCard({ symbol, index }: { symbol: DreamEntry["symbols"][0]; index: number }) {
  const archDef = ARCHETYPE_LABELS[symbol.archetype];
  const bgColor = ARCHETYPE_COLORS[symbol.archetype];
  const glowColor = ARCHETYPE_GLOW[symbol.archetype];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.22 }}
    >
      <GlassCard
        className="p-4"
        style={{
          background: bgColor,
          borderColor: glowColor.replace("0.50", "0.22").replace("0.45", "0.18"),
        }}
      >
        <div className="flex items-start gap-3">
          {/* Archetype glow orb */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-display font-bold"
            style={{
              background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
              border: `1px solid ${glowColor.replace("0.50", "0.30")}`,
              color: "rgba(240,235,220,0.92)",
              fontFamily: "var(--font-display)",
            }}
          >
            {archDef.label[0]}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {/* Trigger keyword */}
              <span
                className="text-xs font-mono-sg px-2 py-0.5 rounded"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  color: "rgba(200,190,160,0.90)",
                  border: "1px solid rgba(200,190,160,0.20)",
                }}
              >
                「{symbol.keyword}」
              </span>
              {/* Archetype badge */}
              <span style={{ background: glowColor.replace("0.50", "0.15"), borderRadius: "9999px", display: "inline-block" }}>
                <GlassBadge className="text-xs">
                  {archDef.label}
                </GlassBadge>
              </span>
            </div>

            {/* Archetype description */}
            <p
              className="text-xs mb-2 leading-relaxed"
              style={{ color: "rgba(200,190,160,0.75)" }}
            >
              {archDef.description}
            </p>

            {/* Personal meaning */}
            <p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(240,235,220,0.88)" }}
            >
              {symbol.personalMeaning}
            </p>

            {/* Related axes */}
            {symbol.relatedAxes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {symbol.relatedAxes.map((axis) => (
                  <span
                    key={axis}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(180,175,155,0.70)",
                      border: "1px solid rgba(180,175,155,0.12)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {axis}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function DreamHistoryItem({ entry, onDelete }: { entry: DreamEntry; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const emotionOption = EMOTION_OPTIONS.find((e) => e.value === entry.emotion);

  return (
    <GlassCard
      className="p-4"
      style={{ transition: "background 0.3s" }}
    >
      {/* Clickable header area — using div instead of button to avoid nested button issue */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setExpanded((v) => !v);
          }
        }}
        className="w-full text-left cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Date + emotion */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className="text-xs"
                style={{
                  color: "rgba(180,175,155,0.70)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatDate(entry.date)}
              </span>
              {emotionOption && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: emotionOption.color,
                    color: "rgba(240,235,220,0.88)",
                    border: `1px solid ${emotionOption.color.replace("0.25", "0.40").replace("0.20", "0.35").replace("0.22", "0.38").replace("0.28", "0.42")}`,
                  }}
                >
                  {emotionOption.label}
                </span>
              )}
              {/* Vividness */}
              <span
                className="text-xs tracking-wider"
                style={{ color: "rgba(180,175,155,0.55)", fontFamily: "var(--font-mono)" }}
              >
                {vividnessDots(entry.vividness)}
              </span>
            </div>

            {/* Content preview */}
            <p
              className="text-sm leading-relaxed"
              style={{
                color: "rgba(240,235,220,0.82)",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: expanded ? undefined : 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {entry.content}
            </p>

            {/* Symbol count */}
            {entry.symbols.length > 0 && (
              <p
                className="text-xs mt-1"
                style={{ color: "rgba(180,175,155,0.65)" }}
              >
                {entry.symbols.length}個のシンボルを検出
              </p>
            )}
          </div>

          <span
            className="text-xs flex-shrink-0 mt-0.5"
            style={{ color: "rgba(180,175,155,0.50)" }}
          >
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
              {entry.symbols.length > 0 ? (
                <div className="space-y-2">
                  <p
                    className="text-xs mb-2"
                    style={{ color: "rgba(180,175,155,0.70)" }}
                  >
                    検出されたシンボル
                  </p>
                  {entry.symbols.map((sym, i) => (
                    <SymbolCard key={i} symbol={sym} index={i} />
                  ))}
                </div>
              ) : (
                <p
                  className="text-xs"
                  style={{ color: "rgba(180,175,155,0.60)" }}
                >
                  この夢にはシンボルが検出されませんでした。
                </p>
              )}

              {/* Delete */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    color: "rgba(239,68,68,0.70)",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.18)",
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DreamsClient() {
  // Form state
  const [content, setContent] = useState("");
  const [emotion, setEmotion] = useState<DreamEntry["emotion"]>("neutral");
  const [vividness, setVividness] = useState<DreamEntry["vividness"]>(3);

  // Result state
  const [submitted, setSubmitted] = useState(false);
  const [lastEntry, setLastEntry] = useState<DreamEntry | null>(null);

  // History
  const [dreams, setDreams] = useState<DreamEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage
    setDreams(loadDreams());
  }, []);

  const handleSubmit = useCallback(() => {
    if (content.trim().length < 5) return;

    const symbols = detectSymbols(content);
    const entry: DreamEntry = {
      id: `dream_${Date.now()}`,
      date: new Date().toISOString(),
      content: content.trim(),
      emotion,
      vividness,
      symbols,
    };

    saveDream(entry);
    setLastEntry(entry);
    setDreams(loadDreams());
    setSubmitted(true);
    setContent("");
    setEmotion("neutral");
    setVividness(3);
  }, [content, emotion, vividness]);

  const handleDelete = useCallback((id: string) => {
    removeDream(id);
    setDreams(loadDreams());
  }, []);

  const handleNewEntry = useCallback(() => {
    setSubmitted(false);
    setLastEntry(null);
  }, []);

  // ── Styles ──
  const panelBg = "rgba(15,18,35,0.75)";
  const borderColor = "rgba(120,110,170,0.22)";
  const textPrimary = "rgba(240,235,220,0.92)";
  const textSecondary = "rgba(180,175,155,0.72)";
  const accentIndigo = "rgba(139,92,246,0.30)";

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(ellipse 130% 60% at 50% 0%, rgba(60,30,100,0.35) 0%, transparent 60%), " +
          "linear-gradient(180deg, #080b18 0%, #0d1025 40%, #080b18 100%)",
      }}
    >
      {/* Dream-like ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          className="absolute rounded-full"
          style={{
            top: "-10%",
            right: "-15%",
            width: "55vw",
            height: "45vh",
            background:
              "radial-gradient(circle, rgba(88,28,220,0.14) 0%, rgba(120,60,200,0.06) 50%, transparent 75%)",
            filter: "blur(60px)",
          }}
          animate={{ x: [0, 20, 0], y: [0, 15, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            bottom: "5%",
            left: "-10%",
            width: "50vw",
            height: "40vh",
            background:
              "radial-gradient(circle, rgba(60,20,120,0.12) 0%, rgba(100,40,180,0.05) 50%, transparent 75%)",
            filter: "blur(55px)",
          }}
          animate={{ x: [0, -15, 0], y: [0, -20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-12">
        {/* ── Header ── */}
        <FadeInView>
          <div className="mb-10 text-center">
            <Link
              href="/stargazer"
              className="inline-flex items-center gap-1.5 text-xs mb-6"
              style={{ color: textSecondary, fontFamily: "var(--font-mono)" }}
            >
              ← 深層観測
            </Link>
            <h1
              className="text-4xl mb-2 font-display"
              style={{ color: textPrimary, fontFamily: "var(--font-display)" }}
            >
              夢日記
            </h1>
            <p
              className="text-sm"
              style={{ color: textSecondary }}
            >
              夢のシンボルを読み解く
            </p>
            <p
              className="text-xs mt-2 max-w-sm mx-auto leading-relaxed"
              style={{ color: "rgba(160,155,135,0.65)" }}
            >
              夢に現れるシンボルは、無意識からのメッセージ。ユング心理学の視点から、あなたの夢を読み解く。
            </p>
          </div>
        </FadeInView>

        {/* ── Input Section ── */}
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.22 }}
            >
              <FadeInView>
                <GlassCard
                  className="p-6 mb-6"
                  style={{ background: panelBg, borderColor }}
                >
                  <h2
                    className="text-sm font-semibold mb-4"
                    style={{ color: textPrimary, fontFamily: "var(--font-display)" }}
                  >
                    今夜/昨夜の夢を記録する
                  </h2>

                  {/* Textarea */}
                  <div className="mb-5">
                    <label
                      className="block text-xs mb-2"
                      style={{ color: textSecondary }}
                    >
                      夢の内容（できるだけ詳しく）
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="誰かに追いかけられていた。知らない建物の中を走っていて…"
                      rows={5}
                      className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(120,110,170,0.25)",
                        color: textPrimary,
                        caretColor: "rgba(139,92,246,0.90)",
                        fontFamily: "var(--font-body)",
                        lineHeight: 1.75,
                      }}
                    />
                  </div>

                  {/* Emotion selector */}
                  <div className="mb-5">
                    <label
                      className="block text-xs mb-2"
                      style={{ color: textSecondary }}
                    >
                      夢の中の感情
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {EMOTION_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setEmotion(opt.value)}
                          className="px-3 py-1.5 rounded-full text-xs transition-all"
                          style={{
                            background:
                              emotion === opt.value
                                ? opt.color
                                : "rgba(255,255,255,0.06)",
                            border:
                              emotion === opt.value
                                ? `1px solid ${opt.color.replace("0.25", "0.55").replace("0.20", "0.45").replace("0.22", "0.50")}`
                                : "1px solid rgba(120,110,170,0.18)",
                            color:
                              emotion === opt.value
                                ? textPrimary
                                : textSecondary,
                            transform: emotion === opt.value ? "scale(1.05)" : "scale(1)",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vividness slider */}
                  <div className="mb-6">
                    <label
                      className="block text-xs mb-2"
                      style={{ color: textSecondary }}
                    >
                      夢の鮮明さ
                      <span
                        className="ml-2 font-mono-sg"
                        style={{ color: "rgba(139,92,246,0.90)" }}
                      >
                        {vividnessDots(vividness)}
                      </span>
                    </label>
                    <div className="flex gap-2">
                      {([1, 2, 3, 4, 5] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setVividness(v)}
                          className="flex-1 py-2 rounded-lg text-xs transition-all"
                          style={{
                            background:
                              vividness === v
                                ? "rgba(139,92,246,0.28)"
                                : "rgba(255,255,255,0.05)",
                            border:
                              vividness === v
                                ? "1px solid rgba(139,92,246,0.50)"
                                : "1px solid rgba(120,110,170,0.15)",
                            color:
                              vividness === v
                                ? "rgba(200,180,255,0.95)"
                                : textSecondary,
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: "rgba(140,135,115,0.55)" }}>
                        ぼんやり
                      </span>
                      <span className="text-xs" style={{ color: "rgba(140,135,115,0.55)" }}>
                        鮮明
                      </span>
                    </div>
                  </div>

                  {/* Submit */}
                  <GlassButton
                    onClick={handleSubmit}
                    disabled={content.trim().length < 5}
                    className="w-full py-3"
                    style={{
                      background:
                        content.trim().length >= 5
                          ? "rgba(139,92,246,0.30)"
                          : "rgba(255,255,255,0.06)",
                      border:
                        content.trim().length >= 5
                          ? "1px solid rgba(139,92,246,0.55)"
                          : "1px solid rgba(120,110,170,0.15)",
                      color:
                        content.trim().length >= 5
                          ? "rgba(200,180,255,0.95)"
                          : textSecondary,
                    }}
                  >
                    シンボルを解析する
                  </GlassButton>
                </GlassCard>
              </FadeInView>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.22 }}
            >
              {/* Symbol Analysis Section */}
              <FadeInView>
                <GlassCard
                  className="p-6 mb-6"
                  style={{ background: panelBg, borderColor: accentIndigo }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2
                      className="text-sm font-semibold"
                      style={{
                        color: textPrimary,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      シンボル解析
                    </h2>
                    <button
                      onClick={handleNewEntry}
                      className="text-xs px-3 py-1 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.07)",
                        color: textSecondary,
                        border: "1px solid rgba(120,110,170,0.20)",
                      }}
                    >
                      新しい夢を記録
                    </button>
                  </div>

                  {lastEntry && lastEntry.symbols.length > 0 ? (
                    <div className="space-y-3">
                      <p
                        className="text-xs mb-3"
                        style={{ color: textSecondary }}
                      >
                        {lastEntry.symbols.length}個のシンボルを検出しました。あなたの夢は無意識からのメッセージを含んでいます。
                      </p>
                      {lastEntry.symbols.map((sym, i) => (
                        <SymbolCard key={i} symbol={sym} index={i} />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="py-6 text-center"
                      style={{ color: textSecondary }}
                    >
                      <p className="text-sm mb-2">
                        この夢にはまだ既知のシンボルが検出されませんでした。
                      </p>
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: "rgba(160,155,135,0.60)" }}
                      >
                        夢の内容が蓄積されると、パターンが浮かび上がります。
                      </p>
                    </div>
                  )}
                </GlassCard>
              </FadeInView>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Dream History ── */}
        {dreams.length > 0 && (
          <FadeInView>
            <div className="mt-8">
              <h2
                className="text-sm mb-4 px-1"
                style={{
                  color: textSecondary,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "0.08em",
                }}
              >
                夢のアーカイブ（{dreams.length}件）
              </h2>
              <div className="space-y-3">
                {dreams.map((dream) => (
                  <DreamHistoryItem
                    key={dream.id}
                    entry={dream}
                    onDelete={() => handleDelete(dream.id)}
                  />
                ))}
              </div>
            </div>
          </FadeInView>
        )}

        {/* ── Footer note ── */}
        <FadeInView>
          <div className="mt-12 pb-8 text-center">
            <p
              className="text-xs leading-relaxed max-w-xs mx-auto"
              style={{ color: "rgba(140,135,115,0.50)" }}
            >
              夢の解釈はユング心理学の元型論に基づくもので、診断や医療的判断ではありません。
            </p>
          </div>
        </FadeInView>
      </div>
    </div>
  );
}
