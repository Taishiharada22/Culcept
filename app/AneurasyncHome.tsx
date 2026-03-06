"use client";

import { useState, useEffect, useRef } from "react";

const C = {
  bg: "#060510",
  s1: "rgba(255,255,255,0.02)",
  s2: "rgba(255,255,255,0.045)",
  s3: "rgba(255,255,255,0.07)",
  s4: "rgba(255,255,255,0.11)",
  sync: "#4AEAFF",
  neural: "#8B5CF6",
  pulse: "#FF6B9D",
  amber: "#FFB347",
  gold: "#FFD700",
  t1: "#fff",
  t2: "rgba(255,255,255,0.58)",
  t3: "rgba(255,255,255,0.32)",
  t4: "rgba(255,255,255,0.16)",
};
const mono = "'JetBrains Mono','SF Mono',monospace";

/* ═══ STARFIELD ═══ */
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let w: number, h: number;
    const resize = () => {
      w = cv.offsetWidth;
      h = cv.offsetHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1 + 0.15,
      sp: Math.random() * 0.003 + 0.0008,
      ph: Math.random() * Math.PI * 2,
      hu: 210 + Math.random() * 30,
    }));
    let t = 0,
      fr: number;
    const draw = () => {
      t++;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = 0.08 + 0.42 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hu},55%,80%,${a})`;
        ctx.fill();
      }
      fr = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(fr);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

/* ═══ THE ORB ═══ */
function PresenceOrb({ size = 140, hovered = false }: { size?: number; hovered?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hovRef = useRef(hovered);
  hovRef.current = hovered;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr;
    cv.height = size * dpr;
    ctx.scale(dpr, dpr);
    const cx = size / 2,
      cy = size / 2;
    let t = 0,
      fr: number;
    const draw = () => {
      t += 0.01;
      ctx.clearRect(0, 0, size, size);
      const h = hovRef.current;
      const bs = h ? 1.06 : 1,
        bsp = h ? 1.3 : 1;
      const r0 = (58 + 5 * Math.sin(t * bsp)) * bs;
      const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0);
      g0.addColorStop(0, `rgba(74,234,255,${h ? 0.08 : 0.04})`);
      g0.addColorStop(0.4, `rgba(139,92,246,${h ? 0.04 : 0.02})`);
      g0.addColorStop(1, "transparent");
      ctx.fillStyle = g0;
      ctx.beginPath();
      ctx.arc(cx, cy, r0, 0, Math.PI * 2);
      ctx.fill();
      const r1 = (40 + 3 * Math.sin(t * 1.2 * bsp + 0.8)) * bs;
      const g1 = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, r1);
      g1.addColorStop(0, `rgba(74,234,255,${h ? 0.22 : 0.16})`);
      g1.addColorStop(0.5, `rgba(139,92,246,${h ? 0.12 : 0.08})`);
      g1.addColorStop(1, "transparent");
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.fill();
      const r2 = (26 + 2 * Math.sin(t * 1.6 * bsp + 1.5)) * bs;
      const g2 = ctx.createRadialGradient(cx - 5, cy - 5, 0, cx, cy, r2);
      g2.addColorStop(0, `rgba(255,255,255,${h ? 0.65 : 0.48})`);
      g2.addColorStop(0.2, `rgba(74,234,255,${h ? 0.7 : 0.55})`);
      g2.addColorStop(0.55, `rgba(139,92,246,${h ? 0.45 : 0.35})`);
      g2.addColorStop(1, "rgba(139,92,246,0.05)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, r2, 0, Math.PI * 2);
      ctx.fill();
      const r3 = 8 + 1.5 * Math.sin(t * 2.2 + 3);
      const g3 = ctx.createRadialGradient(cx - 6, cy - 6, 0, cx - 3, cy - 3, r3);
      g3.addColorStop(0, "rgba(255,255,255,0.4)");
      g3.addColorStop(1, "transparent");
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 3, r3, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const angle = t * (0.35 + i * 0.12) + i * 1.6;
        const oR = 33 + i * 7;
        const px = cx + oR * Math.cos(angle);
        const py = cy + oR * Math.sin(angle) * (0.5 + i * 0.05);
        const pa = 0.15 + 0.45 * Math.sin(t * 1.5 + i * 1.2);
        ctx.beginPath();
        ctx.arc(px, py, 1.2 - i * 0.1, 0, Math.PI * 2);
        ctx.fillStyle =
          i % 2 === 0 ? `rgba(74,234,255,${pa})` : `rgba(139,92,246,${pa * 0.8})`;
        ctx.fill();
      }
      fr = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(fr);
  }, [size]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

/* ═══ ROBOT ═══ */
function Robot({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <line x1="50" y1="16" x2="50" y2="7" stroke={C.sync} strokeWidth="1.5" opacity="0.5" />
      <circle cx="50" cy="5" r="2.2" fill={C.sync} opacity="0.7">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <rect x="31" y="16" width="38" height="30" rx="11" fill="url(#rh6)" stroke="rgba(74,234,255,0.15)" strokeWidth="0.6" />
      <circle cx="42" cy="31" r="4.2" fill={C.sync} opacity="0.85">
        <animate attributeName="r" values="4.2;4.8;4.2" dur="3.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="58" cy="31" r="4.2" fill={C.sync} opacity="0.85">
        <animate attributeName="r" values="4.2;4.8;4.2" dur="3.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="42" cy="30.5" r="1.6" fill="#fff" opacity="0.85" />
      <circle cx="58" cy="30.5" r="1.6" fill="#fff" opacity="0.85" />
      <rect x="35" y="48" width="30" height="22" rx="7" fill="url(#rb6)" stroke="rgba(74,234,255,0.1)" strokeWidth="0.5" />
      <circle cx="50" cy="57" r="2.5" fill={C.neural} opacity="0.5">
        <animate attributeName="opacity" values="0.2;0.7;0.2" dur="4s" repeatCount="indefinite" />
      </circle>
      <rect x="23" y="50" width="10" height="5" rx="2.5" fill="url(#ra6)" opacity="0.7" />
      <rect x="67" y="50" width="10" height="5" rx="2.5" fill="url(#ra6)" opacity="0.7" />
      <rect x="39" y="70" width="7" height="11" rx="3.5" fill="url(#rb6)" opacity="0.6" />
      <rect x="54" y="70" width="7" height="11" rx="3.5" fill="url(#rb6)" opacity="0.6" />
      <ellipse cx="42.5" cy="83" rx="5" ry="2.5" fill="rgba(74,234,255,0.1)" />
      <ellipse cx="57.5" cy="83" rx="5" ry="2.5" fill="rgba(74,234,255,0.1)" />
      <defs>
        <linearGradient id="rh6" x1="31" y1="16" x2="69" y2="46">
          <stop stopColor="#3a3a5c" />
          <stop offset="1" stopColor="#22223a" />
        </linearGradient>
        <linearGradient id="rb6" x1="35" y1="48" x2="65" y2="70">
          <stop stopColor="#2c2c48" />
          <stop offset="1" stopColor="#1a1a30" />
        </linearGradient>
        <linearGradient id="ra6">
          <stop stopColor="#2c2c48" />
          <stop offset="1" stopColor="#3a3a5c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ═══ NEURAL WHISPER ═══ */
const whispers = [
  "過去2週間で暖色系アイテムの選択率が34%→61%に上昇。感情安定期に入った可能性が高いです。",
  "あなたの骨格タイプと今季のシルエット分析の結果、オーバーサイズのドロップショルダーが最もバランス良く映ります。",
  "先週の選択パターンに0.3σの逸脱を検出しました。新しいスタイル領域への探索行動が始まっています。",
  "雨天時のあなたのカラー傾向は平均明度が22%低下します。今日はあえて明度を上げたコーデを提案しています。",
];

function NeuralWhisper() {
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  const [ci, setCi] = useState(0);
  const text = whispers[idx];
  useEffect(() => {
    if (ci < text.length) {
      const t = setTimeout(() => setCi((c) => c + 1), 28);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setVis(false);
        setTimeout(() => {
          setIdx((i) => (i + 1) % whispers.length);
          setCi(0);
          setVis(true);
        }, 700);
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [ci, text.length]);
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRadius: 12,
        background: `linear-gradient(135deg,${C.s1},${C.neural}04)`,
        border: `1px solid ${C.neural}10`,
        minHeight: 40,
        opacity: vis ? 1 : 0,
        transition: "opacity 0.6s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: C.neural,
            boxShadow: `0 0 6px ${C.neural}55`,
            animation: "ndot 2.5s ease-in-out infinite",
          }}
        />
        <span style={{ fontSize: 8, color: `${C.neural}cc`, letterSpacing: 2, fontFamily: mono, fontWeight: 700 }}>
          NEURAL WHISPER
        </span>
      </div>
      <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.7, fontWeight: 400 }}>
        {text.slice(0, ci)}
        <span style={{ opacity: ci < text.length ? 1 : 0, color: C.sync, transition: "opacity 0.3s" }}>|</span>
      </p>
    </div>
  );
}

/* ═══ AVATAR ACTIVITY ═══ */
function AvatarActivity() {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 12, background: C.s1, border: `1px solid ${C.s2}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: C.sync,
            boxShadow: `0 0 4px ${C.sync}44`,
            animation: "ndot 3s ease-in-out infinite",
          }}
        />
        <span style={{ fontSize: 8, color: `${C.sync}aa`, letterSpacing: 2, fontFamily: mono, fontWeight: 700 }}>
          AVATAR ACTIVITY
        </span>
        <span style={{ fontSize: 8, color: C.t4, marginLeft: "auto" }}>あなたの分身の動き</span>
      </div>
      {[
        { icon: "👔", text: "3つのコーデを試着 → 雨天向け1件を最適解と判定", time: "2時間前" },
        { icon: "🔍", text: "新スタイル領域を探索 → 候補4件をレコメンドに反映", time: "5時間前" },
        { icon: "✦", text: "Originデータに経験ノード3件を統合", time: "昨日" },
      ].map((a, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0",
            borderTop: i > 0 ? `1px solid ${C.s2}` : "none",
          }}
        >
          <span style={{ fontSize: 12 }}>{a.icon}</span>
          <span style={{ fontSize: 10, color: C.t2, flex: 1 }}>{a.text}</span>
          <span style={{ fontSize: 8, color: C.t4, fontFamily: mono }}>{a.time}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ SMALL ═══ */
function Tag({ children, color, glow }: { children: React.ReactNode; color: string; glow?: boolean }) {
  return (
    <span
      style={{
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: "#fff",
        background: color,
        boxShadow: glow ? `0 0 10px ${color}44` : "none",
      }}
    >
      {children}
    </span>
  );
}

/* ═══ DATA ═══ */
const weather = { temp: 18, icon: "🌧", hi: 20, lo: 10, hum: 36, tip: "撥水素材 & 暗色が安心" };
const week = [
  { d: "金", n: 6, i: "🌧", hi: 10, lo: 7, now: true, s: 3 },
  { d: "土", n: 7, i: "⛅", hi: 12, lo: 7, s: 2 },
  { d: "日", n: 8, i: "☀️", hi: 16, lo: 14, s: 3 },
  { d: "月", n: 9, i: "⛅", hi: 8, lo: 3, s: 3 },
  { d: "火", n: 10, i: "⛅", hi: 12, lo: 10, s: 2 },
  { d: "水", n: 11, i: "❄️", hi: 12, lo: 11, s: 2 },
  { d: "木", n: 12, i: "☀️", hi: 8, lo: 8, s: 3 },
];
const outfitSlots = [
  { cat: "OUTER", name: "撥水マウンテンパーカー", my: true, emoji: "🧥" },
  { cat: "TOP", name: "ボーダーカットソー", my: true, emoji: "👕" },
  { cat: "BOTTOM", name: "テーパードパンツ", my: true, emoji: "👖" },
  { cat: "SHOES", name: "防水ブーツ", my: true, emoji: "👢" },
  { cat: "ACC", name: "折りたたみ傘", my: false, price: "¥3,800", emoji: "☂️" },
];
const picks = [
  { name: "オーバーサイズ MA-1", brand: "URBAN CRAFT", price: "¥14,800", tag: "TREND", score: 94, why: "好みとの一致率 94%" },
  { name: "ワイドカーゴパンツ", brand: "NOID", price: "¥9,800", tag: "HOT", score: 91, why: "体型フィットスコア 91" },
  { name: "シアーニットベスト", brand: "LAYERED", price: "¥7,200", tag: "NEW", score: 88, why: "スタイルレーン一致 88%" },
  { name: "プラットフォームローファー", brand: "SOLE THEORY", price: "¥18,500", tag: "PICK", score: 86, why: "トレンドスコア上位 86" },
];
const tagC: Record<string, string> = { TREND: C.pulse, HOT: C.amber, NEW: C.sync, PICK: C.neural };

const identity: Record<string, { label: string; sub: string; emoji: string; color: string; pct: number; insight: string }> = {
  origin: { label: "Origin", sub: "背景・経験", emoji: "✦", color: C.gold, pct: 72, insight: "3つの経験ノードが新たに統合されました" },
  genome: { label: "Genome", sub: "思考・認知", emoji: "🧬", color: C.neural, pct: 45, insight: "意思決定パターンに0.3σの変化を検出" },
  phenotype: { label: "Phenotype", sub: "顔・体型・色", emoji: "❋", color: C.pulse, pct: 60, insight: "骨格・カラー分析の精度が安定しています" },
  presence: { label: "Presence", sub: "印象・雰囲気", emoji: "◎", color: C.sync, pct: 33, insight: "印象データの蓄積が必要です。観測を続けましょう" },
  style: { label: "Style", sub: "好み・表現", emoji: "◆", color: C.amber, pct: 55, insight: "直近2週間で嗜好ベクトルが15°回転しています" },
};

/* ═══ MAIN ═══ */
export default function AneurasyncHome() {
  const [loaded, setLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeDay, setActiveDay] = useState(0);
  const [hoverPick, setHoverPick] = useState<number | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [orbHover, setOrbHover] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setLoaded(true);
    const h = new Date().getHours();
    setGreeting(h < 6 ? "深夜の観測" : h < 11 ? "おはよう" : h < 14 ? "こんにちは" : h < 18 ? "Good Afternoon" : "こんばんは");
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fn = () => setScrollY(el.scrollTop);
    el.addEventListener("scroll", fn, { passive: true });
    return () => el.removeEventListener("scroll", fn);
  }, []);

  const ha = Math.min(scrollY / 150, 1);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: C.bg,
        color: "#fff",
        overflow: "hidden",
        fontFamily: "'Noto Sans JP',-apple-system,sans-serif",
        zIndex: 50,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.05);border-radius:3px}
        @keyframes heroIn{from{opacity:0;transform:translateY(20px) scale(0.97)}to{opacity:1;transform:none}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes ndot{0%,100%{opacity:0.35;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
        @keyframes twinkle{0%,100%{opacity:0.2}50%{opacity:0.8}}
        .hov{transition:all 0.3s cubic-bezier(.25,.46,.45,.94);cursor:pointer}.hov:hover{transform:translateY(-2px)}.hov:active{transform:translateY(0) scale(0.99)}
        .gb{border:1px solid rgba(255,255,255,0.035);transition:border-color 0.3s,box-shadow 0.3s}.gb:hover{border-color:rgba(74,234,255,0.1);box-shadow:0 6px 28px rgba(0,0,0,0.25)}
        .idn{transition:all 0.4s ease;cursor:pointer}.idn:hover{transform:scale(1.06);filter:brightness(1.12)}
      `}</style>

      {/* HEADER */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: ha > 0 ? `rgba(6,5,16,${ha * 0.92})` : "transparent",
          backdropFilter: ha > 0.1 ? `blur(${ha * 24}px)` : "none",
          borderBottom: `1px solid rgba(255,255,255,${ha * 0.04})`,
          transition: "all 0.3s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: `linear-gradient(135deg,${C.sync},${C.neural})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 900,
              fontFamily: mono,
            }}
          >
            An
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.5 }}>Aneurasync</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              background: C.s1,
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: 11,
              color: C.t3,
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            ⌘ 検索
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: C.s2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            👤
          </div>
        </div>
      </header>

      <div ref={scrollRef} style={{ height: "100vh", overflowY: "auto", position: "relative", zIndex: 1 }}>
        {/* ═══ 1. HERO ═══ */}
        <section className="relative w-full overflow-hidden" style={{ height: "100vh", minHeight: "600px" }}>
          {/* Layer 1: 星空背景 */}
          <div className="absolute inset-0">
            <img src="/hero_bg.png" alt="" className="w-full h-full object-cover object-center"
              style={{ filter: "brightness(0.7) saturate(1.1)" }} />
          </div>
          {/* Layer 2a: 上端ビネット */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(8,5,25,0.5) 0%, transparent 30%)" }} />
          {/* Layer 2b: 下端フェード */}
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
            style={{
              height: "40%",
              background: "linear-gradient(180deg, transparent 0%, rgba(6,5,16,0.3) 30%, rgba(6,5,16,0.7) 65%, rgba(6,5,16,0.95) 100%)",
            }} />
          {/* Layer 2c: 左右ビネット */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 80% 100% at 50% 45%, transparent 40%, rgba(8,5,25,0.5) 100%)" }} />
          {/* Layer 3a: メイン光源 */}
          <div className="absolute pointer-events-none"
            style={{
              top: "25%", left: "28%", width: "300px", height: "300px",
              background: "radial-gradient(circle, rgba(100,180,255,0.15) 0%, rgba(60,120,255,0.05) 40%, transparent 70%)",
              filter: "blur(30px)",
            }} />
          {/* Layer 3b: サブ光源 */}
          <div className="absolute pointer-events-none"
            style={{
              top: "40%", right: "15%", width: "200px", height: "200px",
              background: "radial-gradient(circle, rgba(180,140,255,0.10) 0%, transparent 60%)",
              filter: "blur(25px)",
            }} />
          {/* Layer 3c: パーティクル */}
          {[...Array(5)].map((_, i) => (
            <div key={i} className="absolute rounded-full pointer-events-none"
              style={{
                width: `${2 + i * 0.5}px`,
                height: `${2 + i * 0.5}px`,
                background: "#FFFFFF",
                top: `${15 + i * 10}%`,
                left: `${10 + i * 18}%`,
                animation: `twinkle ${3 + i * 0.8}s ease-in-out infinite`,
                animationDelay: `${i * 1.1}s`,
              }} />
          ))}
          {/* Layer 4: ロボ＋望遠鏡 */}
          <div className="absolute bottom-0 left-0 pointer-events-none"
            style={{ width: "50%", maxWidth: "700px", height: "110%" }}>
            <img src="/hero_robot.png" alt="" className="w-full h-full object-contain object-bottom"
              style={{
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.4)) drop-shadow(0 5px 15px rgba(60,100,255,0.15))",
                maskImage: "linear-gradient(180deg, black 70%, transparent 98%)",
                WebkitMaskImage: "linear-gradient(180deg, black 70%, transparent 98%)",
              }} />
          </div>
          {/* Layer 5: UI（右寄せ配置） */}
          <div className="absolute inset-0 flex items-center justify-end" style={{ padding: "0 8% 0 0" }}>
            <div className="text-right" style={{ maxWidth: "450px" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.16)", letterSpacing: 4, fontFamily: mono, marginBottom: 16 }}>
                OBSERVATION — 015
              </div>
              <h1 style={{
                fontSize: "2.8rem", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em",
                lineHeight: 1.3, textShadow: "0 4px 20px rgba(0,0,0,0.5)", marginBottom: 8,
              }}>
                あなたの本質を、<br />観測しつづける。
              </h1>
              <p style={{
                fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8,
                textShadow: "0 2px 10px rgba(0,0,0,0.4)", marginBottom: 20,
              }}>
                あなたの&quot;第二の自分&quot;は確実な力。観測力を使っていこう。
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="hov" style={{
                  padding: "10px 24px", borderRadius: 24, border: "none", cursor: "pointer",
                  background: `linear-gradient(135deg, ${C.sync}44, ${C.neural}44)`,
                  color: C.sync, fontSize: 13, fontWeight: 700,
                  backdropFilter: "blur(10px)",
                }}>観測を始める</button>
                <button className="hov" style={{
                  padding: "10px 24px", borderRadius: 24, cursor: "pointer",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600,
                  backdropFilter: "blur(10px)",
                }}>前回の続き</button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PRESENCE BRIDGE (PresenceOrb + NeuralWhisper + AvatarActivity) ═══ */}
        <section style={{ padding: "32px 20px 20px", maxWidth: 780, margin: "0 auto" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            opacity: loaded ? 1 : 0, transform: loaded ? "none" : "translateY(20px)",
            transition: "all 1s cubic-bezier(.25,.46,.45,.94)",
          }}>
            <div
              onMouseEnter={() => setOrbHover(true)}
              onMouseLeave={() => setOrbHover(false)}
              style={{
                animation: "heroIn 1s ease 0.25s both",
                marginBottom: 14,
                transition: "filter 0.6s",
                filter: orbHover ? `drop-shadow(0 0 28px ${C.sync}1a)` : "none",
              }}
            >
              <PresenceOrb size={140} hovered={orbHover} />
            </div>
            <div style={{ marginBottom: 16, animation: "fadeUp 0.8s ease 0.35s both", display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1.5 }}>
                38<span style={{ fontSize: 14, opacity: 0.45 }}>%</span>
              </span>
              <span style={{ fontSize: 7, color: `${C.sync}99`, letterSpacing: 3, fontFamily: mono }}>SYNC</span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1.5, textAlign: "center", animation: "fadeUp 0.8s ease 0.45s both", marginBottom: 8 }}>
              {greeting}
            </h2>
            <div style={{ width: "100%", maxWidth: 460, marginTop: 12, animation: "fadeUp 0.8s ease 0.7s both" }}>
              <NeuralWhisper />
            </div>
            <div style={{ width: "100%", maxWidth: 460, marginTop: 10, animation: "fadeUp 0.8s ease 0.82s both" }}>
              <AvatarActivity />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap", justifyContent: "center", animation: "fadeUp 0.8s ease 0.95s both" }}>
              {[
                { icon: "🔭", label: "観測する", primary: true },
                { icon: "👔", label: "今日のコーデを見る" },
                { icon: "🧠", label: "AIスタイリストに相談" },
              ].map((a, i) => (
                <button
                  key={i}
                  className="hov"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: a.primary ? "8px 18px" : "7px 13px",
                    borderRadius: 20,
                    cursor: "pointer",
                    border: a.primary ? "none" : "1px solid rgba(255,255,255,0.06)",
                    background: a.primary ? `linear-gradient(135deg,${C.sync}44,${C.neural}44)` : C.s1,
                    color: a.primary ? C.sync : C.t2,
                    fontSize: 11,
                    fontWeight: 600,
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <span style={{ fontSize: 12 }}>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 2. IDENTITY CORE ═══ */}
        <section style={{ padding: "28px 20px 12px", maxWidth: 780, margin: "0 auto", position: "relative" }}>
          {/* Hero→Identity フェード接続 */}
          <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{
            height: "180px",
            background: "linear-gradient(180deg, rgba(6,5,16,0.95) 0%, rgba(6,5,16,0.5) 40%, transparent 100%)",
            zIndex: 5,
          }} />
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 9, color: C.t4, letterSpacing: 5, fontFamily: mono }}>IDENTITY CORE</span>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>あなたという存在の観測データ</div>
          </div>
          <div style={{ position: "relative", width: "100%", maxWidth: 500, margin: "0 auto", height: 290 }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox="0 0 500 290">
              <line x1="250" y1="50" x2="80" y2="210" stroke={C.gold} strokeWidth="0.5" opacity="0.15">
                <animate attributeName="opacity" values="0.08;0.25;0.08" dur="5s" repeatCount="indefinite" />
              </line>
              <line x1="250" y1="50" x2="420" y2="210" stroke={C.gold} strokeWidth="0.5" opacity="0.15">
                <animate attributeName="opacity" values="0.08;0.25;0.08" dur="5s" repeatCount="indefinite" begin="0.7s" />
              </line>
              <line x1="80" y1="210" x2="420" y2="210" stroke={C.gold} strokeWidth="0.5" opacity="0.15">
                <animate attributeName="opacity" values="0.08;0.25;0.08" dur="5s" repeatCount="indefinite" begin="1.4s" />
              </line>
              <circle cx="250" cy="155" r="35" fill="url(#cg6)" opacity="0.12">
                <animate attributeName="opacity" values="0.06;0.16;0.06" dur="7s" repeatCount="indefinite" />
              </circle>
              <circle r="1.5" fill={C.gold} opacity="0.5">
                <animateMotion dur="6s" repeatCount="indefinite" path="M250,50 L80,210" />
                <animate attributeName="opacity" values="0;0.6;0" dur="6s" repeatCount="indefinite" />
              </circle>
              <circle r="1.5" fill={C.neural} opacity="0.5">
                <animateMotion dur="7s" repeatCount="indefinite" path="M80,210 L420,210" />
                <animate attributeName="opacity" values="0;0.6;0" dur="7s" repeatCount="indefinite" />
              </circle>
              <circle r="1.5" fill={C.pulse} opacity="0.5">
                <animateMotion dur="5.5s" repeatCount="indefinite" path="M420,210 L250,50" />
                <animate attributeName="opacity" values="0;0.6;0" dur="5.5s" repeatCount="indefinite" />
              </circle>
              <defs>
                <radialGradient id="cg6">
                  <stop offset="0%" stopColor={C.gold} />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
            </svg>
            {(
              [
                { id: "origin", left: "50%", top: 0, tx: "-50%" },
                { id: "genome", left: "6%", bottom: 20, tx: "0" },
                { id: "phenotype", right: "6%", bottom: 20, tx: "0" },
              ] as const
            ).map((pos) => {
              const nd = identity[pos.id];
              return (
                <div
                  key={pos.id}
                  className="idn"
                  onMouseEnter={() => setHoverNode(pos.id)}
                  onMouseLeave={() => setHoverNode(null)}
                  style={{
                    position: "absolute",
                    ...("left" in pos && pos.left ? { left: pos.left } : {}),
                    ...("right" in pos && pos.right ? { right: pos.right } : {}),
                    ...("top" in pos && pos.top !== undefined ? { top: pos.top } : {}),
                    ...("bottom" in pos && pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
                    transform: `translateX(${pos.tx})`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <div
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `radial-gradient(circle at 38% 32%,${nd.color}2a,${nd.color}0a)`,
                      border: `1px solid ${nd.color}28`,
                      boxShadow: hoverNode === pos.id ? `0 0 28px ${nd.color}20,inset 0 0 20px ${nd.color}08` : "none",
                      transition: "box-shadow 0.5s",
                    }}
                  >
                    <span style={{ fontSize: 26 }}>{nd.emoji}</span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{nd.label}</div>
                    <div style={{ fontSize: 9, color: C.t3 }}>{nd.sub}</div>
                    <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: nd.color, fontFamily: mono }}>{nd.pct}%</div>
                  </div>
                  {hoverNode === pos.id && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(6,5,16,0.92)",
                        border: `1px solid ${nd.color}22`,
                        backdropFilter: "blur(12px)",
                        fontSize: 9,
                        color: C.t2,
                        whiteSpace: "nowrap",
                        zIndex: 10,
                        animation: "fadeUp 0.2s ease both",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                      }}
                    >
                      {nd.insight}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 auto 14px", maxWidth: 380 }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,transparent,${C.t4},transparent)` }} />
            <span style={{ fontSize: 8, color: C.t4, letterSpacing: 5, fontFamily: mono }}>DERIVED</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,transparent,${C.t4},transparent)` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 48 }}>
            {(["presence", "style"] as const).map((key) => {
              const nd = identity[key];
              return (
                <div
                  key={key}
                  className="idn"
                  onMouseEnter={() => setHoverNode(key)}
                  onMouseLeave={() => setHoverNode(null)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, position: "relative" }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `radial-gradient(circle at 38% 32%,${nd.color}1a,${nd.color}08)`,
                      border: `1px solid ${nd.color}1a`,
                      boxShadow: hoverNode === key ? `0 0 22px ${nd.color}18` : "none",
                      transition: "box-shadow 0.5s",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{nd.emoji}</span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{nd.label}</div>
                    <div style={{ fontSize: 9, color: C.t3 }}>{nd.sub}</div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: nd.color, fontFamily: mono }}>{nd.pct}%</div>
                  </div>
                  {hoverNode === key && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(6,5,16,0.92)",
                        border: `1px solid ${nd.color}22`,
                        backdropFilter: "blur(12px)",
                        fontSize: 9,
                        color: C.t2,
                        whiteSpace: "nowrap",
                        zIndex: 10,
                        animation: "fadeUp 0.2s ease both",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                      }}
                    >
                      {nd.insight}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══ 3. PRE-EXPERIENCE ═══ */}
        <section style={{ padding: "20px 20px 10px", maxWidth: 780, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="hov gb" style={{ borderRadius: 18, padding: 16, position: "relative", overflow: "hidden", background: `linear-gradient(160deg,${C.s1},${C.neural}05)` }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 110, height: 110, borderRadius: "50%", background: `radial-gradient(circle,${C.neural}0a,transparent)` }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <div style={{ width: 2.5, height: 14, borderRadius: 2, background: C.neural }} />
                  <span style={{ fontSize: 12, fontWeight: 800 }}>Stargazer</span>
                  <Tag color={`${C.neural}55`}>観測待ち</Tag>
                </div>
                <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.5, marginBottom: 6 }}>明けの明星</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: C.s3 }}>
                    <div style={{ width: "38%", height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${C.amber},${C.pulse})`, boxShadow: `0 0 6px ${C.amber}33` }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, fontFamily: mono }}>精度 38%</span>
                </div>
                <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.6, marginBottom: 12 }}>15回観測 · 精度70%でプロファイル解放</div>
                <button className="hov" style={{ padding: "7px 16px", borderRadius: 10, border: `1px solid ${C.neural}28`, background: `${C.neural}0e`, color: C.neural, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🔭 観測する →
                </button>
              </div>
              <div style={{ animation: "float 6s ease-in-out infinite", marginLeft: 4, flexShrink: 0 }}>
                <Robot size={70} />
              </div>
            </div>
          </div>
          <div className="hov gb" style={{ borderRadius: 18, background: C.s1, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 2.5, height: 14, borderRadius: 2, background: C.sync }} />
                <span style={{ fontSize: 12, fontWeight: 800 }}>コーデカレンダー</span>
              </div>
              <span style={{ fontSize: 10, color: C.sync, cursor: "pointer" }}>全カレンダー →</span>
            </div>
            <div style={{ fontSize: 10, color: C.t3, marginBottom: 8 }}>3月 — 天気連動AI提案</div>
            <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
              {week.map((d, i) => (
                <div
                  key={i}
                  onClick={() => setActiveDay(i)}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "5px 1px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: activeDay === i ? C.s3 : "transparent",
                    border: d.now ? `1px solid ${C.sync}44` : "1px solid transparent",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontSize: 8, color: d.now ? C.sync : C.t4, fontWeight: 700, marginBottom: 1 }}>{d.d}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{d.n}</div>
                  <div style={{ fontSize: 11, margin: "2px 0" }}>{d.i}</div>
                  <div style={{ fontSize: 8, color: C.t3 }}>{d.hi}°/{d.lo}°</div>
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 2 }}>
                    {Array.from({ length: d.s }).map((_, j) => (
                      <div key={j} style={{ width: 3, height: 3, borderRadius: "50%", background: [C.sync, C.neural, C.pulse][j] }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 10px", borderRadius: 10, background: C.s2, border: `1px solid ${C.sync}0c`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>
                  今日のおすすめ <span style={{ fontWeight: 400, color: C.t3 }}>リラックスデー</span>
                </div>
                <div style={{ fontSize: 9, color: C.sync, marginTop: 1 }}>💡 {weather.tip}</div>
              </div>
              <button className="hov" style={{ padding: "5px 12px", borderRadius: 8, border: "none", flexShrink: 0, background: `linear-gradient(135deg,${C.sync},${C.neural})`, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                詳細 →
              </button>
            </div>
          </div>
        </section>

        {/* Today's outfit */}
        <section style={{ padding: "8px 20px", maxWidth: 780, margin: "0 auto" }}>
          <div className="gb" style={{ borderRadius: 18, background: C.s1, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.s2}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{weather.icon}</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{weather.temp}°</span>
                <span style={{ fontSize: 10, color: C.t3 }}>{weather.hi}°/{weather.lo}° 湿度{weather.hum}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: C.t3 }}>アバターが先に試着済み</span>
                <Tag color={`${C.sync}22`}>AI×天気</Tag>
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, padding: "10px 14px" }}>
              {outfitSlots.map((item, i) => (
                <div
                  key={i}
                  className="hov"
                  style={{
                    flex: "1 0 0",
                    minWidth: 84,
                    padding: "8px 10px",
                    borderRadius: 12,
                    background: item.my ? C.s2 : `${C.sync}06`,
                    border: item.my ? `1px solid ${C.s3}` : `1px solid ${C.sync}1a`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: C.t4, letterSpacing: 1, fontFamily: mono }}>{item.cat}</span>
                    {item.my ? (
                      <span style={{ fontSize: 7, color: `${C.sync}55`, fontWeight: 700 }}>MY</span>
                    ) : (
                      <span style={{ fontSize: 9, color: C.amber, fontWeight: 700 }}>{item.price}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 16, textAlign: "center", margin: "4px 0" }}>{item.emoji}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3 }}>{item.name}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "6px 14px 8px", display: "flex", justifyContent: "center", gap: 4 }}>
              {["気に入った", "違う気分", "もっと見る"].map((l, i) => (
                <button
                  key={i}
                  className="hov"
                  style={{
                    fontSize: 9,
                    color: i === 0 ? C.sync : C.t3,
                    background: "none",
                    border: `1px solid ${i === 0 ? C.sync + "33" : C.t4}`,
                    borderRadius: 12,
                    padding: "3px 10px",
                    cursor: "pointer",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 4. PROPOSAL ═══ */}
        <section style={{ padding: "18px 20px 8px", maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 2.5, height: 14, borderRadius: 2, background: C.pulse }} />
              <span style={{ fontSize: 13, fontWeight: 800 }}>あなたへのレコメンド</span>
              <Tag color={`${C.pulse}55`} glow>AI厳選</Tag>
            </div>
            <span style={{ fontSize: 10, color: C.t3, cursor: "pointer" }}>すべて見る →</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {picks.map((item, i) => (
              <div
                key={i}
                className="hov gb"
                onMouseEnter={() => setHoverPick(i)}
                onMouseLeave={() => setHoverPick(null)}
                style={{ borderRadius: 14, background: C.s1, overflow: "hidden" }}
              >
                <div style={{ height: 88, background: `linear-gradient(135deg,${C.s2},${C.s3})`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <span style={{ fontSize: 28, opacity: 0.22, transition: "all 0.3s", transform: hoverPick === i ? "scale(1.15)" : "scale(1)" }}>👕</span>
                  <div style={{ position: "absolute", top: 5, left: 5 }}>
                    <Tag color={tagC[item.tag]} glow>{item.tag}</Tag>
                  </div>
                  <div style={{ position: "absolute", bottom: 5, right: 5, fontSize: 9, fontFamily: mono, color: C.sync, background: "rgba(0,0,0,0.55)", padding: "1px 5px", borderRadius: 4 }}>
                    {item.score}
                  </div>
                </div>
                <div style={{ padding: "7px 9px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 1, lineHeight: 1.3 }}>{item.name}</div>
                  <div style={{ fontSize: 8, color: C.t3, marginBottom: 3 }}>{item.brand}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 7, color: `${C.sync}cc`, background: `${C.sync}0c`, padding: "1px 5px", borderRadius: 3 }}>{item.why}</span>
                    <span style={{ fontSize: 10, fontWeight: 800 }}>{item.price}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ 5. EXPLORATION ═══ */}
        <section style={{ padding: "16px 20px", maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{ width: 2.5, height: 14, borderRadius: 2, background: C.amber }} />
            <span style={{ fontSize: 13, fontWeight: 800 }}>探索する</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { icon: "✨", name: "AIマッチ", desc: "スタイルが合う人を発見", tag: "MATCH", tc: C.pulse },
              { icon: "👗", name: "バーチャル試着", desc: "アバターが先に試す", tag: "NEW", tc: C.sync },
              { icon: "⚔️", name: "コーデバトル", desc: "スタイリング対決", tag: "HOT", tc: C.amber },
              { icon: "🔥", name: "Pulse+", desc: "トレンドを追う", tag: "TREND", tc: C.pulse },
              { icon: "🛍", name: "ショップ&古着", desc: "横断発見", tag: "SHOP", tc: C.sync },
              { icon: "💬", name: "コミュニティ", desc: "みんなで話そう", tag: "NEW", tc: C.neural },
            ].map((c, i) => (
              <div key={i} className="hov gb" style={{ borderRadius: 14, background: C.s1, padding: "11px 13px", minHeight: 88, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <Tag color={c.tc}>{c.tag}</Tag>
                </div>
                <div style={{ marginTop: 6, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 9, color: C.t3, marginTop: 1 }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DOCK */}
        <section style={{ padding: "14px 20px 26px", maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 2, padding: "8px 12px", borderRadius: 16, background: C.s1, border: "1px solid rgba(255,255,255,0.025)" }}>
            {[
              { icon: "◉", label: "ホーム", active: true },
              { icon: "🛍", label: "ショップ" },
              { icon: "📊", label: "ランキング" },
              { icon: "🧭", label: "探索" },
              { icon: "◎", label: "マイページ" },
            ].map((item, i) => (
              <button
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "5px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: item.active ? C.s3 : "transparent",
                  color: item.active ? C.sync : C.t4,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ fontSize: 8, fontWeight: item.active ? 700 : 400 }}>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
        <div style={{ height: 6 }} />
      </div>
    </div>
  );
}
