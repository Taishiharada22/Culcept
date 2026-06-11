"use client";

/**
 * HumanBatteryFigure — 人体バッテリー（v4: asset-driven。B2 static clone）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / CEO 指示（B2-static-clone・人体は高品質アセット + 動的レイヤー）
 *
 * レイヤー構造:
 *  1. glow      … processed/glow.png（ラベンダー星雲・背面）
 *  2. base body … processed/body.png（実透過化済みアセット）
 *  3. body 液体 … body.png の alpha を CSS mask に流用し、首下ゾーンを bodyFill で満たす
 *  4. brain 液体 … 同 mask ∩ 頭部ゾーン
 *  5. heart     … processed/heart.png の alpha mask にローズグラデーションを流す + SVG ハート/軌道リング
 *
 * 規律: % / 目盛り / 数値なし。visualFill（vm.battery 由来）のみから描画。
 *       unknown ゾーンは液体なし。全 unknown（コールドスタート）はゴースト表示。
 */

import { motion } from "framer-motion";
import bodyImg from "./assets/processed/body.png";
import glowImg from "./assets/processed/glow.png";
import heartImg from "./assets/processed/heart.png";

export interface HumanBatteryFigureProps {
  brainFill: number; // 0-1 描画専用
  heartFill: number;
  bodyFill: number;
  brainUnknown: boolean;
  heartUnknown: boolean;
  bodyUnknown: boolean;
  pulseZone?: "brain" | "heart" | "body" | null;
  className?: string;
}

// body.png 内のゾーン境界（alpha 行幅の実測値: 頭 1-12% / 首くびれ 12% / 肩開始 18%）
const HEAD_TOP_PCT = 1;
const NECK_PCT = 12; // 頭部容器の下端（顎）
const BODY_TOP_PCT = 16; // 体ゾーンの上端（肩の手前）
const HEART_CENTER = { xPct: 50, yPct: 26 }; // 胸の中心
const FEET_PCT = 99;

const bodyMaskStyle: React.CSSProperties = {
  WebkitMaskImage: `url(${bodyImg.src})`,
  maskImage: `url(${bodyImg.src})`,
  WebkitMaskSize: "100% 100%",
  maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
};

const heartMaskStyle: React.CSSProperties = {
  WebkitMaskImage: `url(${heartImg.src})`,
  maskImage: `url(${heartImg.src})`,
  WebkitMaskSize: "100% 100%",
  maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
};

/** 液面のゆらぎ（液体上端の柔らかい波） */
function SurfaceWave({ light = false }: { light?: boolean }) {
  return (
    <motion.div
      className="absolute -top-1.5 left-[-12%] h-3 w-[124%] rounded-[100%]"
      style={{
        background: light
          ? "linear-gradient(to bottom, rgba(255,255,255,0.65), rgba(255,255,255,0))"
          : "linear-gradient(to bottom, rgba(255,255,255,0.5), rgba(255,255,255,0))",
        filter: "blur(1.5px)",
      }}
      animate={{ x: [-5, 5, -5] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function HumanBatteryFigure({
  brainFill,
  heartFill,
  bodyFill,
  brainUnknown,
  heartUnknown,
  bodyUnknown,
  pulseZone = null,
  className,
}: HumanBatteryFigureProps) {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const heart = clamp(heartFill);
  const allUnknown = brainUnknown && heartUnknown && bodyUnknown;

  // 体ゾーン（肩〜足）の液位
  const bodyZoneHeightPct = FEET_PCT - BODY_TOP_PCT;
  const bodyLiquidHeightPct = bodyZoneHeightPct * clamp(bodyFill);
  // 頭ゾーンの液位
  const headZoneHeightPct = NECK_PCT - HEAD_TOP_PCT;
  const brainLiquidHeightPct = headZoneHeightPct * clamp(brainFill);

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ aspectRatio: `${bodyImg.width} / ${bodyImg.height}` }}
      role="img"
      aria-label="あなたのバッテリー（3 系統の見立て）"
    >
      {/* 1. glow（星雲・背面） */}
      {!allUnknown && (
        <motion.img
          src={glowImg.src}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[108%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
          animate={{ opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* 2. base human body（実透過アセット。二重描画 + 淡い縁光で存在感を出す） */}
      <img
        src={bodyImg.src}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full select-none ${allUnknown ? "opacity-35 saturate-0" : ""}`}
        style={allUnknown ? undefined : { filter: "drop-shadow(0 0 7px rgba(165,180,252,0.5))" }}
        draggable={false}
      />
      {!allUnknown && (
        <>
          <img src={bodyImg.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full select-none opacity-80" draggable={false} />
          {/* ガラスの体積感（mask 内側のクールトーン・縁ほど濃い） */}
          <div
            className="absolute inset-0"
            style={{
              ...bodyMaskStyle,
              background:
                "radial-gradient(ellipse 42% 38% at 50% 30%, rgba(255,255,255,0) 30%, rgba(199,210,254,0.4) 72%, rgba(165,180,252,0.62) 100%)",
            }}
          />
        </>
      )}

      {!allUnknown && (
        <>
          {/* 3. body 液体（body.png の alpha でクリップ） */}
          {!bodyUnknown && bodyFill > 0 && (
            <motion.div
              className="absolute inset-0"
              style={bodyMaskStyle}
              animate={pulseZone === "body" ? { opacity: [1, 0.55, 1] } : undefined}
              transition={{ duration: 0.9 }}
            >
              <div
                className="absolute inset-x-0"
                style={{
                  top: `${FEET_PCT - bodyLiquidHeightPct}%`,
                  height: `${bodyLiquidHeightPct + (100 - FEET_PCT)}%`,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(125,211,252,0.78), rgba(56,189,248,0.72) 45%, rgba(45,212,191,0.8))",
                    filter: "blur(0.5px)",
                  }}
                />
                <SurfaceWave />
                {/* 内部ハイライト（体積感） */}
                <div className="absolute left-[28%] top-[14%] h-10 w-9 rounded-full bg-white/25 blur-md" />
                <div className="absolute right-[30%] top-[42%] h-8 w-7 rounded-full bg-white/20 blur-md" />
              </div>
            </motion.div>
          )}

          {/* 4. brain 液体（頭部ゾーン） */}
          {!brainUnknown && brainFill > 0 && (
            <motion.div
              className="absolute inset-0"
              style={bodyMaskStyle}
              animate={pulseZone === "brain" ? { opacity: [1, 0.55, 1] } : undefined}
              transition={{ duration: 0.9 }}
            >
              <div
                className="absolute inset-x-0"
                style={{ top: `${NECK_PCT - brainLiquidHeightPct}%`, height: `${brainLiquidHeightPct}%` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(to bottom, rgba(167,139,250,0.85), rgba(99,102,241,0.9))",
                    filter: "blur(0.5px)",
                  }}
                />
                <SurfaceWave light />
              </div>
              {/* 脳の淡い発光 */}
              <div
                className="absolute rounded-full"
                style={{
                  left: "41%",
                  width: "18%",
                  top: `${HEAD_TOP_PCT + 1}%`,
                  height: `${headZoneHeightPct * 0.42}%`,
                  background: "radial-gradient(circle, rgba(221,214,254,0.9), rgba(196,181,253,0))",
                  opacity: 0.35 + 0.5 * clamp(brainFill),
                }}
              />
            </motion.div>
          )}

          {/* 5. heart（アセットのグローにローズを流す + SVG ハート/軌道リング） */}
          {!heartUnknown && heart > 0 && (
            <motion.div
              className="pointer-events-none absolute"
              style={{
                left: `${HEART_CENTER.xPct}%`,
                top: `${HEART_CENTER.yPct}%`,
                width: `${46 + 26 * heart}%`,
                aspectRatio: `${heartImg.width} / ${heartImg.height}`,
                transform: "translate(-50%, -50%)",
              }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* アセット alpha を mask にしてローズの光を流す */}
              <div
                className="absolute inset-0"
                style={{
                  ...heartMaskStyle,
                  background: "radial-gradient(circle, rgba(244,114,182,0.95), rgba(251,113,133,0.55) 60%, rgba(253,164,175,0.25))",
                  opacity: 0.5 + 0.5 * heart,
                }}
              />
              {/* 精細なハート + 軌道（asset はグロー専用） */}
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <g opacity={0.35 + 0.35 * heart}>
                  <circle cx={50} cy={50} r={34} fill="none" stroke="#ffffff" strokeWidth={0.7} />
                  <circle cx={50} cy={16} r={1.7} fill="#ffffff" />
                  <circle cx={84} cy={50} r={1.4} fill="#ffffff" />
                  <circle cx={26} cy={74} r={1.3} fill="#ffffff" />
                </g>
                <path
                  d="M50 62 c-7 -9 -20 -4 -14 8 c4 7 14 11 14 11 c0 0 10 -4 14 -11 c6 -12 -7 -17 -14 -8 z"
                  fill="#f472b6"
                  opacity={0.55 + 0.35 * heart}
                />
              </svg>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
