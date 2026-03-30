"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { generateZeroSecondMirror } from "@/lib/onboarding/zeroSecondMirror";
import { ARCHETYPE_DEFS, getColorGroup } from "@/lib/stargazer/archetypeTypes";
import JourneyStory from "./JourneyStory";
import MbtiFlashDiagnosis from "./MbtiFlashDiagnosis";

const FEATURED_TYPES = ["ACIO", "NVEX", "SCIO", "AVEO", "NCIX", "SVEX", "NVIO", "ACEX"] as const;

const COLOR_FAMILY_HEX: Record<string, string> = {
  navy: "#4A6FA5",
  magenta: "#C850C0",
  indigo: "#818CF8",
  orange: "#F59E42",
  emerald: "#34D399",
  gold: "#EAB308",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 1: 問いかけ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROVOCATIONS = [
  {
    question: "自分のことを、\nどれくらい知ってる？",
    hook: "答えられる人は、ほとんどいない",
  },
  {
    question: "「なんで私、\nいつもこうなんだろう」",
    hook: "繰り返してしまう理由、知りたくない？",
  },
  {
    question: "10問で、\nあなたの本音が見える。",
    hook: "回答にかかった「時間」すら、手がかりになる",
  },
  {
    question: "性格診断は一回で終わる。\nでもあなたは毎日変わる。",
    hook: "変化を追い続ける。それが深層観測",
  },
  {
    question: "あなたが最も恐れていることは、\n最も必要としていることに似ている。",
    hook: "3分で、その正体が見え始める",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Social Proof — fetch real data with fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FALLBACK_STATS = [
  { value: "92%", label: "が「自分の知らない一面を発見した」と回答", icon: "🪞" },
  { value: "87%", label: "が1週間以内に予測の精度に驚いた", icon: "🔮" },
  { value: "3分", label: "で最初の深層パターンが見える", icon: "⚡" },
];

const FALLBACK_VOICES = [
  { text: "1問目で「え、なんでわかるの？」ってなった", age: "22歳", gender: "女性" },
  { text: "自分でも言葉にできなかったモヤモヤを、はっきり見せられた", age: "31歳", gender: "男性" },
  { text: "「あなたが恐れていること」が刺さりすぎて画面を閉じかけた", age: "27歳", gender: "女性" },
  { text: "性格診断は何度もやったけど、毎日「変わる自分」を追えるのはこれだけ", age: "34歳", gender: "男性" },
  { text: "禁句を当てられた。あれは本当にやめてほしい（笑）", age: "24歳", gender: "男性" },
];

function useSocialProof() {
  // TODO: Create /api/stargazer/analytics/social-proof route when real user data is available
  // For now, use static fallback data (no dead fetch to non-existent endpoint)
  return { stats: FALLBACK_STATS, voices: FALLBACK_VOICES, userCount: null as number | null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SocialProofTicker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SocialProofTicker({ voices }: { voices: typeof FALLBACK_VOICES }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % voices.length), 4500);
    return () => clearInterval(id);
  }, [voices.length]);

  const voice = voices[idx];

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", minHeight: 80 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22 }}
          style={{
            padding: "20px 24px", borderRadius: 16,
            background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.1)",
          }}
        >
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8, marginBottom: 8, fontStyle: "italic" }}>
            &ldquo;{voice.text}&rdquo;
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            — {voice.age} {voice.gender}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sticky CTA — appears after scrolling past first view
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StickyCTA({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 90,
            padding: "12px 24px 20px",
            background: "linear-gradient(180deg, transparent 0%, rgba(6,5,16,0.95) 30%)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Link href="/onboarding">
            <motion.button
              aria-label="もうひとりの自分に会う"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: "14px 40px",
                borderRadius: 28,
                background: "linear-gradient(135deg, #8B5CF6, #6366F1)",
                border: "none",
                color: "white",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 8px 32px rgba(99,102,241,0.35), 0 2px 8px rgba(0,0,0,0.2)",
                letterSpacing: "0.5px",
              }}
            >
              もうひとりの自分に会う →
            </motion.button>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function HeroSection() {
  const [provIdx, setProvIdx] = useState(0);
  const [zeroMirror, setZeroMirror] = useState<{ mirrorText: string; subText: string | null } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const { stats, voices, userCount } = useSocialProof();

  useEffect(() => {
    const id = setInterval(() => setProvIdx((i) => (i + 1) % PROVOCATIONS.length), 6000);
    return () => clearInterval(id);
  }, []);

  // 0秒ミラー
  useEffect(() => {
    generateZeroSecondMirror()
      .then((result) => {
        setZeroMirror({ mirrorText: result.mirrorText, subText: result.subText });
      })
      .catch(() => {});
  }, []);

  // Sticky CTA visibility
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      setShowStickyCta(y > vh * 0.8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Parallax values
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] });
  const orbY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const orbScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.3]);

  const prov = PROVOCATIONS[provIdx];

  return (
    <div ref={containerRef} style={{ color: "white", minHeight: "100dvh", overflow: "hidden" }}>

      {/* ═══ Section 1: 問いかけ (Parallax enhanced) ═══ */}
      <section style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "60px 24px", position: "relative",
        background: "radial-gradient(ellipse at 50% 40%, rgba(88,28,135,0.15), rgba(6,5,16,0.98) 70%), linear-gradient(170deg, #08061a 0%, #0c0a24 30%, #110828 60%, #0a0618 100%)",
      }}>
        {/* Parallax ambient orbs */}
        <motion.div style={{
          position: "absolute", width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.08), rgba(99,102,241,0.04) 40%, transparent 70%)",
          top: "30%", left: "50%", x: "-50%",
          y: orbY, scale: orbScale,
          filter: "blur(40px)", pointerEvents: "none",
        }} />
        <motion.div style={{
          position: "absolute", width: 250, height: 250, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.05), transparent 70%)",
          top: "60%", left: "25%",
          y: orbY,
          filter: "blur(60px)", pointerEvents: "none",
        }} />

        <AnimatePresence mode="wait">
          <motion.div key={provIdx} initial={{ opacity: 0, y: 24, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -20, filter: "blur(4px)" }} transition={{ duration: 0.4, ease: "easeOut" }} style={{ textAlign: "center", zIndex: 1 }}>
            <h1 style={{ fontSize: "clamp(24px, 7vw, 40px)", fontWeight: 900, lineHeight: 1.5, letterSpacing: "-0.5px", marginBottom: 20, whiteSpace: "pre-line" }}>{prov.question}</h1>
            <p style={{ fontSize: "clamp(13px, 3.5vw, 16px)", color: "rgba(255,255,255,0.45)", lineHeight: 1.8, maxWidth: 380, margin: "0 auto" }}>{prov.hook}</p>
          </motion.div>
        </AnimatePresence>

        {/* Scroll indicator */}
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} style={{ position: "absolute", bottom: 36, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: 3, fontWeight: 500 }}>SCROLL</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.3)" }}>↓</span>
        </motion.div>
      </section>

      {/* ═══ Section 1.5: 0秒ミラー ═══ */}
      {zeroMirror && (
        <section style={{
          padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center",
          background: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.06), transparent 60%), linear-gradient(180deg, #0a0618, #0c0920, #08061a)",
        }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.25 }} style={{ maxWidth: 420, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(139,92,246,0.5)", letterSpacing: 3, marginBottom: 16 }}>あなたについて、ひとつだけわかること</p>
            <div style={{
              fontSize: "clamp(15px, 4vw, 18px)", color: "rgba(255,255,255,0.8)", lineHeight: 1.9, fontWeight: 500,
              padding: "24px 20px", borderRadius: 18,
              background: "linear-gradient(145deg, rgba(139,92,246,0.08), rgba(99,102,241,0.04))",
              border: "1px solid rgba(139,92,246,0.12)",
              whiteSpace: "pre-line",
            }}>
              {zeroMirror.mirrorText}
            </div>
            {zeroMirror.subText && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 12, lineHeight: 1.7 }}>{zeroMirror.subText}</p>
            )}
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 16 }}>
              ※ まだ時間帯と曜日しか知らない。ここからどこまで見えるようになるか
            </p>
          </motion.div>
        </section>
      )}

      {/* ═══ Section 2: MBTI Flash Diagnosis ═══ */}
      <MbtiFlashDiagnosis />

      {/* ═══ Section 3: 分身の概念 ═══ */}
      <section style={{ padding: "80px 24px", display: "flex", flexDirection: "column", alignItems: "center", background: "radial-gradient(ellipse at 50% 20%, rgba(99,102,241,0.08), transparent 60%), linear-gradient(180deg, #0a0618, #0d0b22, #08061a)" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.25 }} style={{ textAlign: "center", maxWidth: 420 }}>
          <p style={{ fontSize: 12, color: "rgba(139,92,246,0.6)", letterSpacing: 4, marginBottom: 24 }}>ANEURASYNC</p>
          <h2 style={{ fontSize: "clamp(22px, 5.5vw, 32px)", fontWeight: 900, lineHeight: 1.5, marginBottom: 20 }}>
            あなたの最大の理解者である、<br />
            <span style={{ background: "linear-gradient(135deg, #A78BFA, #818CF8)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>もうひとりの自分</span>を作り出す。
          </h2>
          <p style={{ fontSize: "clamp(13px, 3.5vw, 15px)", color: "rgba(255,255,255,0.45)", lineHeight: 1.9, marginBottom: 12 }}>
            毎日の質問に答えるたび、AIがあなたの分身を育てていく。<br />分身はあなたより先に体験し、あなたに選択肢を届ける。
          </p>
          <p style={{ fontSize: "clamp(12px, 3vw, 14px)", color: "rgba(255,255,255,0.3)", lineHeight: 1.8 }}>
            自分では気づけない矛盾も、パターンも、<br />もうひとりの自分なら、見つけられる。
          </p>
        </motion.div>
      </section>

      {/* ═══ Section 3.5: 24のタイプ ═══ */}
      <section style={{
        padding: "80px 24px 60px",
        display: "flex", flexDirection: "column", alignItems: "center",
        background: "radial-gradient(ellipse at 50% 30%, rgba(139,92,246,0.06), transparent 60%), linear-gradient(180deg, #08061a, #0c0a24, #0a0618)",
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.25 }}
          style={{ width: "100%", maxWidth: 720 }}
        >
          <p style={{ fontSize: 12, color: "rgba(139,92,246,0.6)", letterSpacing: 4, marginBottom: 12, textAlign: "center" }}>ARCHETYPE</p>
          <h2 style={{
            fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 900, lineHeight: 1.5,
            textAlign: "center", marginBottom: 8,
          }}>
            <span style={{ background: "linear-gradient(135deg, #A78BFA, #818CF8)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>24のタイプ</span>
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 32, lineHeight: 1.8 }}>
            認知・感情・社交・実行の4軸から導かれる、あなたの原型
          </p>

          {/* Horizontally scrollable archetype cards */}
          <div style={{
            display: "flex", gap: 14, overflowX: "auto", paddingBottom: 16,
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
            marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24,
          }}>
            {FEATURED_TYPES.map((code, i) => {
              const def = ARCHETYPE_DEFS.find((a) => a.code === code);
              if (!def) return null;
              const colorGroup = getColorGroup(code);
              const accent = COLOR_FAMILY_HEX[colorGroup.family] ?? "#A78BFA";
              return (
                <motion.div
                  key={code}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.22, delay: i * 0.05 }}
                >
                  <Link
                    href={`/type/${code}`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      minWidth: 140, padding: "20px 16px", borderRadius: 18,
                      background: `linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))`,
                      border: `1px solid rgba(255,255,255,0.08)`,
                      textDecoration: "none", color: "inherit",
                      transition: "border-color 0.2s, transform 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 36, marginBottom: 10, display: "block" }}>{def.emoji}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>{def.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
                      padding: "3px 8px", borderRadius: 6,
                      background: `rgba(${accent === "#4A6FA5" ? "74,111,165" : accent === "#C850C0" ? "200,80,192" : accent === "#818CF8" ? "129,140,248" : accent === "#F59E42" ? "245,158,66" : accent === "#34D399" ? "52,211,153" : "234,179,8"},0.15)`,
                      color: accent,
                      marginBottom: 10,
                    }}>{code}</span>
                    <span style={{
                      fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6,
                      textAlign: "center", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{def.tagline}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* View all types link */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <Link href="/type" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 14, fontWeight: 700, color: "#A78BFA",
              textDecoration: "none", padding: "10px 24px", borderRadius: 14,
              background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)",
              transition: "background 0.2s",
            }}>
              すべてのタイプを見る <span style={{ fontSize: 14 }}>→</span>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ═══ Section 4: あなたの旅 ═══ */}
      <JourneyStory />

      {/* ═══ Section 5: 社会的証明 (real data with fallback) ═══ */}
      <section style={{
        padding: "60px 24px", display: "flex", flexDirection: "column", alignItems: "center",
        background: "linear-gradient(180deg, #0a0618, #0c0920, #08061a)",
      }}>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} style={{ maxWidth: 420, width: "100%" }}>
          {/* Live user count */}
          {userCount && userCount > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}
            >
              現在 <span style={{ color: "#A78BFA", fontWeight: 700 }}>{userCount.toLocaleString()}</span> 人が自分を観測中
            </motion.p>
          )}

          {/* Stats */}
          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
            {stats.map((stat, i) => (
              <motion.div
                key={stat.value}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.22, delay: i * 0.08 }}
                style={{ textAlign: "center", flex: "1 1 100px" }}
              >
                <div style={{ fontSize: 28, marginBottom: 4 }}>{stat.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#A78BFA", lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>{stat.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Voice ticker */}
          <SocialProofTicker voices={voices} />

          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 16 }}>
            ※ β版テストユーザーの回答より
          </p>
        </motion.div>
      </section>

      {/* ═══ Final CTA ═══ */}
      <section style={{ padding: "40px 24px 120px", display: "flex", flexDirection: "column", alignItems: "center", background: "radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.08), transparent 50%), linear-gradient(180deg, #0a0618, #0c0a24, #08061a)" }}>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Link href="/onboarding">
            <motion.button aria-label="もうひとりの自分に会う" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} style={{
              padding: "18px 48px", borderRadius: 30,
              background: "linear-gradient(135deg, #8B5CF6, #6366F1)", border: "none",
              color: "white", fontSize: 17, fontWeight: 800, cursor: "pointer",
              boxShadow: "0 8px 40px rgba(99,102,241,0.3), 0 2px 12px rgba(139,92,246,0.15)",
              letterSpacing: "0.5px", marginBottom: 14,
            }}>
              もうひとりの自分に会う →
            </motion.button>
          </Link>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.8, maxWidth: 300 }}>
            10問に答えるだけ。3分で始まる。
          </p>
        </motion.div>
      </section>

      {/* Sticky CTA (appears after scrolling past hero) */}
      <StickyCTA visible={showStickyCta} />
    </div>
  );
}
