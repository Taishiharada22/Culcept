"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 第1章：心を観る — SVG脳 + 神経接続アニメーション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BrainVisual() {
  return (
    <div style={{ position: "relative", maxWidth: 220, width: "100%", aspectRatio: "1", margin: "0 auto" }}>
      <svg viewBox="0 0 220 220" role="img" aria-label="脳の神経接続" style={{ width: "100%", height: "100%" }}>
        {/* 脳の輪郭 */}
        <ellipse cx="110" cy="105" rx="75" ry="65" fill="none" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5">
          <animate attributeName="stroke-opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="100" cy="100" rx="50" ry="45" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="1" />

        {/* 神経接続ライン */}
        {[
          { x1: 60, y1: 80, x2: 95, y2: 110, d: "0s" },
          { x1: 95, y1: 110, x2: 140, y2: 90, d: "0.5s" },
          { x1: 140, y1: 90, x2: 160, y2: 120, d: "1s" },
          { x1: 80, y1: 130, x2: 120, y2: 105, d: "1.5s" },
          { x1: 120, y1: 105, x2: 150, y2: 130, d: "2s" },
          { x1: 70, y1: 100, x2: 110, y2: 80, d: "0.8s" },
          { x1: 110, y1: 80, x2: 130, y2: 110, d: "1.3s" },
          { x1: 90, y1: 70, x2: 130, y2: 75, d: "1.8s" },
        ].map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" opacity="0">
            <animate attributeName="opacity" values="0;0.8;0.3" dur="2.5s" begin={l.d} repeatCount="indefinite" />
          </line>
        ))}

        {/* シナプスノード */}
        {[
          { cx: 60, cy: 80, d: "0s" }, { cx: 95, cy: 110, d: "0.3s" },
          { cx: 140, cy: 90, d: "0.6s" }, { cx: 160, cy: 120, d: "0.9s" },
          { cx: 80, cy: 130, d: "1.2s" }, { cx: 120, cy: 105, d: "1.5s" },
          { cx: 150, cy: 130, d: "1.8s" }, { cx: 70, cy: 100, d: "0.4s" },
          { cx: 110, cy: 80, d: "0.7s" }, { cx: 130, cy: 75, d: "1.1s" },
          { cx: 90, cy: 70, d: "1.4s" }, { cx: 130, cy: 110, d: "1.7s" },
        ].map((n, i) => (
          <circle key={i} cx={n.cx} cy={n.cy} r="3" fill="#A78BFA" opacity="0">
            <animate attributeName="opacity" values="0;1;0.4" dur="2s" begin={n.d} repeatCount="indefinite" />
            <animate attributeName="r" values="2;4;2" dur="2s" begin={n.d} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* グロー */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 120, height: 120, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)",
        filter: "blur(20px)", animation: "pulseGlow 3s ease-in-out infinite",
      }} />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 第2章：体を知る — シルエット + カラーフィル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BodyVisual() {
  return (
    <div style={{ position: "relative", maxWidth: 180, width: "100%", aspectRatio: "180/260", margin: "0 auto" }}>
      <svg viewBox="0 0 180 260" role="img" aria-label="体のシルエット" style={{ width: "100%", height: "100%" }}>
        <defs>
          {/* カラーフィルアニメーション — 下から上に色が満ちる */}
          <linearGradient id="bodyFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#EC4899" stopOpacity="0.6">
              <animate attributeName="offset" values="0;1;1" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="0%" stopColor="transparent" stopOpacity="0">
              <animate attributeName="offset" values="0;1;1" dur="4s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <clipPath id="bodyClip">
            {/* 人体シルエット */}
            <ellipse cx="90" cy="42" rx="22" ry="26" />
            <rect x="72" y="68" width="36" height="6" rx="3" />
            <path d="M60,74 Q55,85 48,120 Q45,130 52,132 L65,128 Q68,100 72,85 L72,74 Z" />
            <path d="M108,74 Q115,85 122,120 Q125,130 118,132 L105,128 Q102,100 98,85 L98,74 Z" />
            <rect x="68" y="74" width="44" height="60" rx="8" />
            <path d="M72,132 Q70,165 68,200 Q67,210 74,212 L82,210 Q84,180 86,150 L86,132 Z" />
            <path d="M98,132 Q100,165 102,200 Q103,210 96,212 L88,210 Q86,180 84,150 L84,132 Z" />
          </clipPath>
        </defs>

        {/* シルエット輪郭 */}
        <ellipse cx="90" cy="42" rx="22" ry="26" fill="none" stroke="rgba(236,72,153,0.3)" strokeWidth="1" />
        <rect x="68" y="74" width="44" height="60" rx="8" fill="none" stroke="rgba(236,72,153,0.2)" strokeWidth="1" />
        <path d="M60,74 Q55,85 48,120 Q45,130 52,132 L65,128 Q68,100 72,85 L72,74 Z" fill="none" stroke="rgba(236,72,153,0.2)" strokeWidth="1" />
        <path d="M108,74 Q115,85 122,120 Q125,130 118,132 L105,128 Q102,100 98,85 L98,74 Z" fill="none" stroke="rgba(236,72,153,0.2)" strokeWidth="1" />
        <path d="M72,132 Q70,165 68,200 Q67,210 74,212 L82,210 Q84,180 86,150 L86,132 Z" fill="none" stroke="rgba(236,72,153,0.2)" strokeWidth="1" />
        <path d="M98,132 Q100,165 102,200 Q103,210 96,212 L88,210 Q86,180 84,150 L84,132 Z" fill="none" stroke="rgba(236,72,153,0.2)" strokeWidth="1" />

        {/* カラーフィル */}
        <rect x="0" y="0" width="180" height="260" fill="url(#bodyFill)" clipPath="url(#bodyClip)" />
      </svg>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 第3章：根を辿る — 根が伸びる + 地図線
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function RootsVisual() {
  return (
    <div style={{ position: "relative", maxWidth: 240, width: "100%", aspectRatio: "1", margin: "0 auto" }}>
      <svg viewBox="0 0 240 240" role="img" aria-label="根と地図" style={{ width: "100%", height: "100%" }}>
        {/* 幹 */}
        <line x1="120" y1="80" x2="120" y2="130" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" opacity="0.6">
          <animate attributeName="opacity" values="0;0.6" dur="1s" fill="freeze" />
        </line>

        {/* 根 — 下に広がる */}
        {[
          { d: "M120,130 Q100,160 70,190", delay: "0.5s" },
          { d: "M120,130 Q130,155 150,185", delay: "0.8s" },
          { d: "M120,130 Q110,150 85,175", delay: "1.1s" },
          { d: "M120,130 Q135,150 155,170", delay: "1.4s" },
          { d: "M120,130 Q115,165 100,200", delay: "1.7s" },
          { d: "M120,130 Q125,160 140,195", delay: "2.0s" },
          { d: "M70,190 Q55,205 45,220", delay: "2.3s" },
          { d: "M150,185 Q165,200 175,215", delay: "2.5s" },
        ].map((root, i) => (
          <path key={i} d={root.d} fill="none" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="80" strokeDashoffset="80">
            <animate attributeName="stroke-dashoffset" from="80" to="0" dur="2s" begin={root.delay} fill="freeze" />
            <animate attributeName="opacity" values="0;0.5" dur="0.5s" begin={root.delay} fill="freeze" />
          </path>
        ))}

        {/* 葉/芽 — 上部 */}
        <circle cx="120" cy="72" r="12" fill="none" stroke="#14B8A6" strokeWidth="1" opacity="0.4">
          <animate attributeName="r" values="10;14;10" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.6;0.3" dur="3s" repeatCount="indefinite" />
        </circle>

        {/* 地図のピンポイント */}
        {[
          { cx: 70, cy: 190, d: "2.5s" },
          { cx: 150, cy: 185, d: "2.8s" },
          { cx: 100, cy: 200, d: "3.1s" },
          { cx: 140, cy: 195, d: "3.4s" },
        ].map((pin, i) => (
          <g key={i}>
            <circle cx={pin.cx} cy={pin.cy} r="3" fill="#14B8A6" opacity="0">
              <animate attributeName="opacity" values="0;0.8" dur="0.5s" begin={pin.d} fill="freeze" />
            </circle>
            <circle cx={pin.cx} cy={pin.cy} r="6" fill="none" stroke="#14B8A6" strokeWidth="0.5" opacity="0">
              <animate attributeName="opacity" values="0;0.4;0" dur="2s" begin={pin.d} repeatCount="indefinite" />
              <animate attributeName="r" values="4;10;4" dur="2s" begin={pin.d} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 覚醒シーン — 光バースト + Genome Cardモック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AwakeningVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div ref={ref} style={{ position: "relative", maxWidth: 220, width: "100%", aspectRatio: "220/280", margin: "0 auto" }}>
      {/* 光バースト */}
      {inView && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 0.8, 0.3] }}
          transition={{ duration: 2, ease: "easeOut" }}
          style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 300, height: 300, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(167,139,250,0.4), rgba(99,102,241,0.1) 40%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
      )}

      {/* Genome Cardモック */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
        animate={inView ? { opacity: 1, scale: 1, rotateY: 0 } : {}}
        transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
        style={{
          position: "relative", maxWidth: 180, width: "100%", aspectRatio: "180/240", margin: "20px auto",
          borderRadius: 20, overflow: "hidden",
          background: "linear-gradient(145deg, rgba(139,92,246,0.15), rgba(99,102,241,0.08))",
          border: "1px solid rgba(139,92,246,0.25)",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: 20,
          boxShadow: "0 8px 40px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(167,139,250,0.6)", marginBottom: 12 }}>GENOME CARD</div>
        <div style={{ width: 50, height: 50, borderRadius: "50%", background: "linear-gradient(135deg, #8B5CF6, #EC4899)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 20 }}>🧬</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>Your Name</div>
        <div style={{ fontSize: 11, color: "#A78BFA" }}>Commander ⚔️</div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {["🧠", "🫀", "🌱"].map((e, i) => (
            <motion.div
              key={e}
              initial={{ scale: 0 }}
              animate={inView ? { scale: 1 } : {}}
              transition={{ delay: 1.5 + i * 0.12, type: "spring" }}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}
            >
              {e}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 第4章：自分を映す — ユーザー背中 + 分身ミラー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MirrorVisual() {
  const [gesture, setGesture] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setGesture((g) => (g + 1) % 3), 3000);
    return () => clearInterval(id);
  }, []);

  // ジェスチャー: 0=立ってる, 1=手を上げる, 2=首をかしげる
  const gestures = [
    { userArm: "M30,55 L30,80", avatarArm: "M170,55 L170,80", label: "" },
    { userArm: "M30,55 L20,35", avatarArm: "M170,55 L180,35", label: "やっぱりそうする？" },
    { userArm: "M30,55 L30,80", avatarArm: "M170,55 L170,80", label: "迷ってるね" },
  ];
  const g = gestures[gesture];

  return (
    <div style={{ position: "relative", maxWidth: 260, width: "100%", aspectRatio: "260/200", margin: "0 auto" }}>
      <svg viewBox="0 0 260 200" role="img" aria-label="ユーザーと分身の対面" style={{ width: "100%", height: "100%" }}>
        {/* 中央の鏡面ライン */}
        <line x1="130" y1="20" x2="130" y2="180" stroke="rgba(139,92,246,0.15)" strokeWidth="1" strokeDasharray="4 4" />

        {/* ユーザー（左・背中向き） */}
        <g opacity="0.5">
          <circle cx="30" cy="40" r="12" fill="rgba(255,255,255,0.2)" />
          <line x1="30" y1="52" x2="30" y2="90" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
          <path d={g.userArm} stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" fill="none">
            <animate attributeName="d" dur="0.5s" fill="freeze" />
          </path>
          <line x1="30" y1="90" x2="22" y2="120" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
          <line x1="30" y1="90" x2="38" y2="120" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* 分身（右・こちら向き） */}
        <g>
          <circle cx="170" cy="40" r="12" fill="rgba(139,92,246,0.4)" stroke="#A78BFA" strokeWidth="1">
            <animate attributeName="fill-opacity" values="0.3;0.5;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
          {/* 目 */}
          <circle cx="166" cy="38" r="1.5" fill="#A78BFA" />
          <circle cx="174" cy="38" r="1.5" fill="#A78BFA" />
          {/* 口 — 微笑み */}
          <path d="M166,44 Q170,47 174,44" fill="none" stroke="#A78BFA" strokeWidth="1" strokeLinecap="round" />
          <line x1="170" y1="52" x2="170" y2="90" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <path d={g.avatarArm} stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
          <line x1="170" y1="90" x2="162" y2="120" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <line x1="170" y1="90" x2="178" y2="120" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

          {/* グロー */}
          <circle cx="170" cy="70" r="30" fill="radial-gradient(circle, rgba(139,92,246,0.1), transparent)" opacity="0.3">
            <animate attributeName="r" values="25;35;25" dur="3s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>

      {/* 吹き出し */}
      <AnimatePresence mode="wait">
        {g.label && (
          <motion.div
            key={gesture}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              position: "absolute", right: 20, top: 140,
              padding: "6px 12px", borderRadius: 10,
              background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)",
              fontSize: 11, color: "#A78BFA", whiteSpace: "nowrap",
            }}
          >
            {g.label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 第5章：最初の旅 — CSS街並み + すれ違い
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TownVisual() {
  return (
    <div style={{ position: "relative", maxWidth: 300, width: "100%", aspectRatio: "300/200", margin: "0 auto", overflow: "hidden" }}>
      <svg viewBox="0 0 300 200" role="img" aria-label="街並みを歩く分身" style={{ width: "100%", height: "100%" }}>
        {/* 空 */}
        <rect width="300" height="200" fill="url(#skyGrad)" />
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c0a24" />
            <stop offset="100%" stopColor="#1a1040" />
          </linearGradient>
        </defs>

        {/* 建物シルエット */}
        <rect x="10" y="100" width="30" height="60" fill="rgba(139,92,246,0.08)" rx="2" />
        <rect x="15" y="105" width="8" height="8" fill="rgba(255,220,100,0.2)" rx="1" />
        <rect x="27" y="105" width="8" height="8" fill="rgba(255,220,100,0.15)" rx="1" />
        <rect x="15" y="118" width="8" height="8" fill="rgba(255,220,100,0.1)" rx="1" />

        <rect x="50" y="80" width="40" height="80" fill="rgba(139,92,246,0.06)" rx="2" />
        <rect x="55" y="85" width="6" height="6" fill="rgba(255,220,100,0.2)" rx="1" />
        <rect x="65" y="85" width="6" height="6" fill="rgba(255,220,100,0.15)" rx="1" />
        <rect x="75" y="85" width="6" height="6" fill="rgba(255,220,100,0.1)" rx="1" />
        <rect x="55" y="96" width="6" height="6" fill="rgba(255,220,100,0.12)" rx="1" />
        <rect x="65" y="96" width="6" height="6" fill="rgba(255,220,100,0.18)" rx="1" />

        <rect x="100" y="110" width="35" height="50" fill="rgba(139,92,246,0.07)" rx="2" />
        <rect x="105" y="115" width="10" height="12" fill="rgba(255,220,100,0.15)" rx="1" />

        <rect x="145" y="90" width="25" height="70" fill="rgba(139,92,246,0.05)" rx="2" />
        <rect x="180" y="105" width="45" height="55" fill="rgba(139,92,246,0.08)" rx="2" />
        <rect x="185" y="110" width="6" height="6" fill="rgba(255,220,100,0.2)" rx="1" />
        <rect x="195" y="110" width="6" height="6" fill="rgba(255,220,100,0.12)" rx="1" />
        <rect x="185" y="120" width="6" height="6" fill="rgba(255,220,100,0.08)" rx="1" />

        <rect x="235" y="95" width="30" height="65" fill="rgba(139,92,246,0.06)" rx="2" />
        <rect x="270" y="115" width="30" height="45" fill="rgba(139,92,246,0.04)" rx="2" />

        {/* 道路 */}
        <rect x="0" y="160" width="300" height="40" fill="rgba(255,255,255,0.02)" />
        <line x1="0" y1="180" x2="300" y2="180" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="8 6" />

        {/* 分身が歩く */}
        <g>
          <circle cx="0" cy="170" r="5" fill="#A78BFA" opacity="0.7">
            <animateTransform attributeName="transform" type="translate" values="60,0;240,0" dur="8s" repeatCount="indefinite" />
          </circle>
          <line x1="0" y1="175" x2="0" y2="188" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
            <animateTransform attributeName="transform" type="translate" values="60,0;240,0" dur="8s" repeatCount="indefinite" />
          </line>
        </g>

        {/* 別の分身とすれ違う */}
        <g>
          <circle cx="0" cy="172" r="4" fill="#EC4899" opacity="0.5">
            <animateTransform attributeName="transform" type="translate" values="260,0;40,0" dur="8s" repeatCount="indefinite" />
          </circle>
          <line x1="0" y1="176" x2="0" y2="186" stroke="#EC4899" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
            <animateTransform attributeName="transform" type="translate" values="260,0;40,0" dur="8s" repeatCount="indefinite" />
          </line>
        </g>

        {/* すれ違いの瞬間 — 光のパルス */}
        <circle cx="170" cy="172" r="0" fill="rgba(236,72,153,0.3)">
          <animate attributeName="r" values="0;0;0;20;0" dur="6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0;0;0.4;0" dur="6s" repeatCount="indefinite" />
        </circle>

        {/* 星 */}
        {[40, 90, 150, 200, 260].map((x, i) => (
          <circle key={i} cx={x} cy={15 + i * 12} r="1" fill="white" opacity="0.3">
            <animate attributeName="opacity" values="0.1;0.4;0.1" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* すれ違いテキスト */}
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        fontSize: 10, color: "rgba(236,72,153,0.5)", whiteSpace: "nowrap",
        animation: "fadeInOut 6s infinite",
      }}>
        この人、合うかもしれない
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 第6章：さらなる旅へ — ソユーズ + 地球
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SpaceVisual() {
  return (
    <div style={{ position: "relative", width: "100%", height: 300, overflow: "hidden", background: "transparent" }}>
      {/* 星々 — 背景 */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          top: `${2 + (i * 13) % 55}%`,
          left: `${3 + (i * 19) % 94}%`,
          width: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1,
          height: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1,
          borderRadius: "50%",
          background: i % 7 === 0 ? "#A78BFA" : i % 5 === 0 ? "#38BDF8" : "white",
          opacity: 0.2 + (i % 4) * 0.15,
          animation: `twinkle ${2 + (i % 3)}s ease-in-out infinite ${i * 0.15}s`,
          zIndex: 1,
        }} />
      ))}

      {/* 地球 — 大気の光輪（外側） */}
      <div style={{
        position: "absolute",
        bottom: -120,
        left: "50%",
        transform: "translateX(-50%)",
        width: 320,
        height: 320,
        borderRadius: "50%",
        background: "transparent",
        boxShadow: "0 0 80px rgba(120,200,255,0.3), 0 0 160px rgba(80,160,255,0.12), 0 0 240px rgba(60,140,255,0.06)",
        zIndex: 1,
        pointerEvents: "none",
        animation: "earthPulse 6s ease-in-out infinite",
      }} />

      {/* 地球本体 */}
      <div style={{
        position: "absolute",
        bottom: -120,
        left: "50%",
        transform: "translateX(-50%)",
        width: 320,
        height: 320,
        borderRadius: "50%",
        background: "radial-gradient(circle at 35% 30%, #2a6cb8 0%, #1a5098 12%, #124080 25%, #0d3068 40%, #082050 55%, #051535 72%, #030c1e 100%)",
        zIndex: 2,
        overflow: "hidden",
      }}>
        {/* 太陽光ハイライト — 左上 */}
        <div style={{
          position: "absolute", top: "-10%", left: "-10%",
          width: "65%", height: "65%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(140,210,255,0.25) 0%, rgba(100,180,255,0.1) 40%, transparent 70%)",
          filter: "blur(15px)",
        }} />

        {/* 海の深い青 — メイン */}
        <div style={{
          position: "absolute", top: "10%", left: "15%",
          width: "50%", height: "40%",
          borderRadius: "45%",
          background: "radial-gradient(ellipse, rgba(30,100,180,0.4) 0%, rgba(20,70,140,0.2) 50%, transparent 80%)",
          filter: "blur(12px)",
          transform: "rotate(-15deg)",
        }} />

        {/* 大陸 — ユーラシア風 */}
        <div style={{
          position: "absolute", top: "18%", left: "28%",
          width: "35%", height: "22%",
          borderRadius: "25% 55% 35% 60%",
          background: "linear-gradient(135deg, rgba(60,110,70,0.35), rgba(45,85,55,0.25))",
          filter: "blur(5px)",
          transform: "rotate(-8deg)",
        }} />
        {/* 大陸 — アフリカ風 */}
        <div style={{
          position: "absolute", top: "42%", left: "22%",
          width: "16%", height: "25%",
          borderRadius: "40% 45% 55% 35%",
          background: "rgba(55,100,60,0.3)",
          filter: "blur(4px)",
          transform: "rotate(5deg)",
        }} />

        {/* 雲 — 帯状に3本 */}
        <div style={{
          position: "absolute", top: "15%", left: "5%",
          width: "70%", height: "4%",
          background: "rgba(255,255,255,0.1)",
          borderRadius: "50%",
          filter: "blur(4px)",
          transform: "rotate(-10deg)",
          animation: "cloudDrift 20s linear infinite",
        }} />
        <div style={{
          position: "absolute", top: "38%", left: "20%",
          width: "55%", height: "3.5%",
          background: "rgba(255,255,255,0.07)",
          borderRadius: "50%",
          filter: "blur(5px)",
          transform: "rotate(5deg)",
          animation: "cloudDrift 25s linear infinite reverse",
        }} />
        <div style={{
          position: "absolute", top: "58%", left: "10%",
          width: "45%", height: "3%",
          background: "rgba(255,255,255,0.06)",
          borderRadius: "50%",
          filter: "blur(4px)",
          transform: "rotate(-3deg)",
          animation: "cloudDrift 22s linear infinite",
        }} />

        {/* ターミネーター（明暗境界）— 右側が暗い */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(105deg, transparent 0%, transparent 45%, rgba(0,0,10,0.3) 60%, rgba(0,0,8,0.55) 75%, rgba(0,0,5,0.7) 100%)",
          borderRadius: "50%",
        }} />

        {/* 大気のリムライト — 縁の薄い青 */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          boxShadow: "inset -3px -2px 20px rgba(80,170,255,0.15), inset 4px 3px 30px rgba(120,200,255,0.1)",
          pointerEvents: "none",
        }} />
      </div>

      {/* ソユーズ — 実画像 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/haikei/soyu-zu.png"
        alt="ソユーズ"
        style={{
          position: "absolute",
          width: 56,
          height: 38,
          objectFit: "contain",
          filter: "brightness(1.6) drop-shadow(0 0 15px rgba(74,200,255,0.8)) drop-shadow(0 0 30px rgba(139,92,246,0.5))",
          animation: "soyuzOrbit 12s ease-in-out infinite",
          zIndex: 4,
        }}
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ChapterBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ChapterProps {
  chapter: string;
  actLabel: string;
  title: string;
  subtitle: string;
  visual: React.ReactNode;
  accent: string;
  isAwakening?: boolean;
}

function ChapterBlock({ chapter, actLabel, title, subtitle, visual, accent, isAwakening }: ChapterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4 }}
      style={{
        padding: isAwakening ? "60px 24px" : "48px 24px",
        display: "flex", flexDirection: "column", alignItems: "center",
        position: "relative",
      }}
    >
      {isAwakening && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.08), transparent 60%)",
          pointerEvents: "none",
        }} />
      )}

      <div style={{ fontSize: 10, letterSpacing: 4, color: `${accent}90`, marginBottom: 6, position: "relative", zIndex: 1 }}>{actLabel}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 16, position: "relative", zIndex: 1 }}>{chapter}</div>

      {/* ビジュアル */}
      <div style={{ marginBottom: 24, position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>{visual}</div>

      <h3 style={{
        fontSize: isAwakening ? "clamp(20px, 5vw, 28px)" : "clamp(16px, 4.5vw, 22px)",
        fontWeight: 900, textAlign: "center", marginBottom: 10, lineHeight: 1.5,
        color: isAwakening ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.85)",
        position: "relative", zIndex: 1,
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center",
        lineHeight: 1.8, maxWidth: "min(340px, 100%)", position: "relative", zIndex: 1,
      }}>
        {subtitle}
      </p>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ActDivider — 幕間
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ActDivider({ label }: { label: string }) {
  return (
    <div style={{ padding: "32px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.2), transparent)" }} />
      <span style={{ fontSize: 11, letterSpacing: 4, color: "rgba(139,92,246,0.5)", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.2), transparent)" }} />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function JourneyStory() {
  return (
    <section style={{
      background: "linear-gradient(180deg, #08061a, #0c0920, #0e0a28, #0c0920, #08061a)",
      color: "white", position: "relative",
    }}>
      {/* セクションヘッダー */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        style={{ textAlign: "center", padding: "60px 24px 0" }}
      >
        <p style={{ fontSize: 11, letterSpacing: 4, color: "rgba(139,92,246,0.5)", marginBottom: 12 }}>YOUR JOURNEY</p>
        <h2 style={{ fontSize: "clamp(22px, 5.5vw, 32px)", fontWeight: 900, lineHeight: 1.5, marginBottom: 8 }}>
          <span style={{ background: "linear-gradient(135deg, #A78BFA, #818CF8)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>あなたの旅</span>
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.8 }}>
          心と体と記憶が重なるとき、もうひとりの自分が目を開ける
        </p>
      </motion.div>

      <ActDivider label="第一幕 — 分身が生まれる" />

      <ChapterBlock
        chapter="第1章"
        actLabel="STARGAZER"
        title="心を観る"
        subtitle="質問に答えるたび、脳の中で神経が繋がっていく。思考のクセ、判断の偏り、隠してる本音——全てが分身の記憶になる"
        visual={<BrainVisual />}
        accent="#8B5CF6"
      />

      <ChapterBlock
        chapter="第2章"
        actLabel="PHENOTYPE"
        title="体を知る"
        subtitle="パーソナルカラー、骨格、顔の印象——透明だった体に、あなたの色が入っていく"
        visual={<BodyVisual />}
        accent="#EC4899"
      />

      <ChapterBlock
        chapter="第3章"
        actLabel="ORIGIN"
        title="根を辿る"
        subtitle="どこで生まれて、何を見て育ったか。足元から伸びる根が、あなたの価値観の地図を描く"
        visual={<RootsVisual />}
        accent="#14B8A6"
      />

      {/* 覚醒 */}
      <ActDivider label="覚醒" />

      <ChapterBlock
        chapter=""
        actLabel="GENOME CARD"
        title="分身が、目を開ける"
        subtitle="脳と体と精神が統合された瞬間——もうひとりの自分が誕生する。あなたの知らなかったあなたを、全て覚えている存在"
        visual={<AwakeningVisual />}
        accent="#A78BFA"
        isAwakening
      />

      <ActDivider label="第二幕 — 旅に出る" />

      <ChapterBlock
        chapter="第4章"
        actLabel="DAILY OBSERVATION"
        title="自分を映す"
        subtitle="分身はあなたの動きを映し続ける。迷えば一緒に迷い、選べば「やっぱりそっち選ぶと思った」と微笑む"
        visual={<MirrorVisual />}
        accent="#8B5CF6"
      />

      <ChapterBlock
        chapter="第5章"
        actLabel="RENDEZVOUS"
        title="最初の旅"
        subtitle="あなたが寝ている間にも分身は動く。商店街で、駅で、カフェで——誰かの分身とすれ違い、立ち止まる。「この人、合うかもしれない」。目を覚ましたとき、分身が連れてきた相手に驚く。なんでわかったの？ 自分でも気づいてなかった相性を、分身は最初から見えていた。"
        visual={<TownVisual />}
        accent="#EC4899"
      />

      <ChapterBlock
        chapter="第6章"
        actLabel="FURTHER BEYOND"
        title="さらなる旅へ"
        subtitle="あなたの最大の理解者が、あなたをもっとあなたらしくする。自分でも知らなかった自分に出会い続ける旅は、ここから始まる。"
        visual={<SpaceVisual />}
        accent="#38BDF8"
      />

      {/* グローバルCSS */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes fadeInOut {
          0%, 30% { opacity: 0; }
          40%, 60% { opacity: 1; }
          70%, 100% { opacity: 0; }
        }
        @keyframes soyuzOrbit {
          0%   { left: 15%; top: 50%; transform: rotate(20deg); }
          20%  { left: 35%; top: 15%; transform: rotate(30deg); }
          40%  { left: 55%; top: 8%;  transform: rotate(35deg); }
          60%  { left: 72%; top: 18%; transform: rotate(40deg); }
          80%  { left: 78%; top: 40%; transform: rotate(45deg); }
          100% { left: 15%; top: 50%; transform: rotate(20deg); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.5; }
        }
        @keyframes earthPulse {
          0%, 100% { box-shadow: 0 0 80px rgba(120,200,255,0.3), 0 0 160px rgba(80,160,255,0.12); }
          50% { box-shadow: 0 0 100px rgba(120,200,255,0.4), 0 0 200px rgba(80,160,255,0.18); }
        }
        @keyframes cloudDrift {
          0% { transform: translateX(0) rotate(-10deg); }
          100% { transform: translateX(30px) rotate(-10deg); }
        }
      `}</style>
    </section>
  );
}
