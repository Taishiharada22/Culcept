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

// body.png 内のゾーン境界（v6 clean mask の alpha 行幅実測: 頭 2-8% / 肩 9% / 胴下〜）
const HEAD_TOP_PCT = 2;
const NECK_PCT = 9; // 頭部容器の下端（肩の手前）
const BODY_TOP_PCT = 9; // 体ゾーンの上端
const HEART_CENTER = { xPct: 45, yPct: 15 }; // 胸の左上（CEO 指示）
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
      {/* 1. 背面プレート（薄いラベンダー〜ブルーグレー = コントラスト確保。霧の glow ではなく面） */}
      {!allUnknown && (
        <>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[104%] w-[185%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse 50% 47% at 50% 45%, rgba(176,188,230,0.62), rgba(186,196,234,0.4) 58%, rgba(203,213,245,0) 80%)",
            }}
          />
          <motion.img
            src={glowImg.src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[106%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
            animate={{ opacity: [0.3, 0.45, 0.3] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      {/* 2. base human body（器。連続輪郭の clean シルエット・均一フィル。1 回描画で solid に） */}
      <img
        src={bodyImg.src}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full select-none drop-shadow-[0_2px_6px_rgba(99,102,241,0.18)] ${allUnknown ? "opacity-40 saturate-0" : ""}`}
        draggable={false}
      />
      {!allUnknown && (
        /* ガラス光沢（上左からの薄いシーン。blur なし） */
        <div
          className="absolute inset-0"
          style={{
            ...bodyMaskStyle,
            background:
              "linear-gradient(118deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 13%, rgba(255,255,255,0) 24%)",
          }}
        />
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
                {/* 液体本体: 上淡（シアン）→ 下濃（青）。発光でなく液体（blur なし） */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(125,211,252,0.88) 0%, rgba(56,189,248,0.92) 22%, rgba(37,99,235,0.95) 70%, rgba(29,78,216,0.97) 100%)",
                  }}
                />
                {/* 水面: 白いライン + 直下の明るい帯（水面近くのハイライト） */}
                <div
                  className="absolute -top-px left-[6%] h-[2.5px] w-[88%] rounded-full"
                  style={{ background: "linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.95) 28%, rgba(255,255,255,0.95) 72%, rgba(255,255,255,0))" }}
                />
                <div
                  className="absolute left-0 top-[2px] h-[7px] w-full"
                  style={{ background: "linear-gradient(to bottom, rgba(186,230,253,0.75), rgba(186,230,253,0))" }}
                />
                <SurfaceWave />
                {/* 内部ハイライト（小さめ・控えめ。霧化させない） */}
                <div className="absolute left-[30%] top-[16%] h-7 w-5 rounded-full bg-white/20 blur-[3px]" />
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
                {/* 液体本体: 上淡（ラベンダー紫）→ 下濃（青紫）。blur なしの液体グラデ */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(167,139,250,0.92) 0%, rgba(124,58,237,0.96) 38%, rgba(91,33,182,0.98) 100%)",
                  }}
                />
                {/* 水面: 白いライン + 直下の明るいラベンダー帯（光の縁） */}
                <div
                  className="absolute -top-px left-[8%] h-[2.5px] w-[84%] rounded-full"
                  style={{ background: "linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,1) 30%, rgba(255,255,255,1) 70%, rgba(255,255,255,0))" }}
                />
                <div
                  className="absolute left-0 top-[2px] h-[6px] w-full"
                  style={{ background: "linear-gradient(to bottom, rgba(221,214,254,0.8), rgba(221,214,254,0))" }}
                />
                <SurfaceWave light />
                {/* 水面近くの内側グロー（器との差を出す） */}
                <div className="absolute left-[34%] top-[12%] h-3 w-[32%] rounded-full bg-violet-200/45 blur-[2px]" />
              </div>
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
                  background: "radial-gradient(circle, rgba(244,114,182,1), rgba(251,113,133,0.65) 60%, rgba(253,164,175,0.3))",
                  opacity: 0.6 + 0.4 * heart,
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
