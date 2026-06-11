"use client";

/**
 * HumanBatteryFigure — 人体バッテリー（v4: asset-driven。B2 static clone）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / CEO 指示（B2-static-clone・人体は高品質アセット + 動的レイヤー）
 *
 * レイヤー構造（B10 棚卸し後 — 1 目的 = 1 レイヤー。器・液体以外の装飾レイヤー禁止）:
 *  1. 背面プレート … CSS radial（人体と背景の分離。画像なし）
 *  2. base body  … processed/body.png（CEO 透過アセット・1 枚のみ）+ ガラス光沢（mask 内 CSS）
 *  3. body 液体  … body.png の alpha を CSS mask に流用し、肩下ゾーンを bodyFill で満たす
 *  4. brain 液体 … 同 mask ∩ 頭部ゾーン（顎 14% から下→上へ）
 *  5. heart      … processed/heart.png の alpha mask にローズを流す（1 レイヤーのみ）
 *
 * 規律: % / 目盛り / 数値なし。visualFill（vm.battery 由来）のみから描画。
 *       unknown ゾーンは液体なし。全 unknown（コールドスタート）はゴースト表示。
 */

import { motion } from "framer-motion";
import bodyImg from "./assets/processed/body.png";
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

// body.png 内のゾーン境界 — _processAssets.mjs が crop 後フレームで機械算出した値を転記する
//（手動目測の禁止。再生成時はパイプライン出力 "ZONES(crop後・転記用)" と同期させること）
const HEAD_TOP_PCT = 0.5;
const NECK_PCT = 14; // 頭部容器の下端 = 顎の直下（診断画像 _chin.png で顎=13% を視覚確定。機械値 12.2 は口元）
const BODY_TOP_PCT = 17.5; // 肩（体ゾーンの上端）
const HEART_CENTER = { xPct: 46, yPct: 24 }; // 胸（CEO 指示: 右上=ビューア左上へ補正）
const FEET_PCT = 99.4;

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
      {/* 1. 背面プレート（薄いラベンダー〜ブルーグレー = 人体を背景から分離。CEO 指示 D で強化） */}
      {!allUnknown && (
        <>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[106%] w-[178%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse 48% 48% at 50% 46%, rgba(166,180,228,0.78), rgba(180,192,232,0.5) 56%, rgba(203,213,245,0) 78%)",
            }}
          />
          {/* 星雲 glow.png は削除（B10）: alpha に不定形ブロブ + 市松残滓が残っており、
              頭の背後で「頭だけの画像の重なり」に見えていた正体（増幅可視化 _a_glow.png で確定）。
              紫ヘイロー（B9 削除）と同じく、器・液体以外の装飾レイヤーは置かない。 */}
        </>
      )}

      {/* 2. base human body（器。芯のある半透明 — blur なし・色は液体レイヤーのみが持つ） */}
      <img
        src={bodyImg.src}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full select-none ${allUnknown ? "opacity-35 saturate-0" : ""}`}
        draggable={false}
      />
      {!allUnknown && (
        <>
          {/* 重複 body img は削除（B10）: CEO アセットの内部 alpha は 255 solid のため
              二重描画は不要（レイヤー棚卸しで「1 目的 = 1 レイヤー」に統合） */}
          {/* ガラス光沢（上左からの薄いシーン。blur なし） */}
          <div
            className="absolute inset-0"
            style={{
              ...bodyMaskStyle,
              background:
                "linear-gradient(112deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.12) 14%, rgba(255,255,255,0) 26%)",
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

          {/* 5. heart — 心臓は 1 レイヤーのみ（B10）: CEO 透過 heart-mask の alpha にローズを流す。
              SVG ハート path は削除 — アセットのハートと二重に見えていた正体。 */}
          {!heartUnknown && heart > 0 && (
            <motion.div
              className="pointer-events-none absolute"
              style={{
                left: `${HEART_CENTER.xPct}%`,
                top: `${HEART_CENTER.yPct}%`,
                width: `${34 + 16 * heart}%`,
                aspectRatio: `${heartImg.width} / ${heartImg.height}`,
                transform: "translate(-50%, -50%)",
              }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div
                className="absolute inset-0"
                style={{
                  ...heartMaskStyle,
                  background:
                    "radial-gradient(circle at 50% 42%, rgba(244,114,182,1), rgba(244,114,182,0.8) 45%, rgba(251,113,133,0.55) 70%, rgba(253,164,175,0.3))",
                  opacity: 0.6 + 0.4 * heart,
                }}
              />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
