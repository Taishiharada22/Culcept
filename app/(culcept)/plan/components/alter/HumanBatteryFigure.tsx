"use client";

/**
 * HumanBatteryFigure — 半透明の人体シルエット + 3 系統の液体バッテリー（v2: 有機シルエット）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / 設計書 §9
 * v2 技法（参照画像の質感に寄せる）:
 *  - 人体パーツを <mask> で合成 → 1 枚の均一な半透明ボディ（継ぎ目なし）+ わずかな blur で柔らかい輪郭
 *  - 背面に拡大シルエットのラベンダー aura（柔らかい発光輪郭）
 *  - 液体はぼかしたグラデーション + 液面の波 + 内部ハイライトで「発光する水」
 *  - 脳 = 頭部の紫液体 + 脳形の淡い発光 / 心臓 = ローズの柔らかい光 + 鼓動
 * 規律: ゲージ目盛り・数値・段階線なし。unknown は液体なし・破線輪郭。赤色・医療スキャン風にしない。
 */

import { motion } from "framer-motion";
import { ZONE_STYLE } from "./bandDisplay";

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

// 体ゾーン（首下〜足元）の縦範囲
const BODY_TOP = 96;
const BODY_BOTTOM = 420;
// 頭部
const HEAD = { cx: 120, cy: 52, rx: 31, ry: 34 };

/** 人体パーツ（mask / 破線輪郭の両方で使う） */
function BodyParts({ asOutline = false }: { asOutline?: boolean }) {
  const common = asOutline
    ? { fill: "none", stroke: "#cbd5e1", strokeWidth: 1.6, strokeDasharray: "5 5" }
    : { fill: "#fff" };
  return (
    <g {...common}>
      {/* 頭 */}
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
      {/* 首 */}
      <path d="M106,76 C107,88 105,94 100,100 L140,100 C135,94 133,88 134,76 Z" />
      {/* 胴体（肩→ウエスト→腰） */}
      <path d="M120,94 C134,94 147,98 155,105 C167,113 173,125 174,141 C175,159 170,177 166,193 C163,207 162,219 163,231 C164,245 157,255 145,259 L95,259 C83,255 76,245 77,231 C78,219 77,207 74,193 C70,177 65,159 66,141 C67,125 73,113 85,105 C93,98 106,94 120,94 Z" />
      {/* 左腕（緩やかなテーパー） */}
      <path d="M70,124 C58,132 51,145 49,160 C47,176 47,193 49,208 C50,220 54,228 60,230 C65,231 68,226 68,218 C68,204 67,188 68,172 C69,156 70,140 73,128 Z" />
      {/* 右腕 */}
      <path d="M170,124 C182,132 189,145 191,160 C193,176 193,193 191,208 C190,220 186,228 180,230 C175,231 172,226 172,218 C172,204 173,188 172,172 C171,156 170,140 167,128 Z" />
      {/* 左脚 */}
      <path d="M95,258 C91,282 89,306 90,330 C91,354 93,378 96,399 C98,413 103,421 110,421 C116,421 119,414 119,403 C119,379 119,355 118,331 C117,307 117,281 117,259 Z" />
      {/* 右脚 */}
      <path d="M145,258 C149,282 151,306 150,330 C149,354 147,378 144,399 C142,413 137,421 130,421 C124,421 121,414 121,403 C121,379 121,355 122,331 C123,307 123,281 123,259 Z" />
    </g>
  );
}

/** 液面（ぼかした波 2 枚をゆっくり横流し） */
function LiquidSurface({ y, fillUrl }: { y: number; fillUrl: string }) {
  return (
    <>
      <motion.ellipse
        cx={120}
        cy={y}
        rx={120}
        ry={6}
        fill={fillUrl}
        opacity={0.9}
        animate={{ cx: [112, 128, 112] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.ellipse
        cx={120}
        cy={y + 2}
        rx={110}
        ry={5}
        fill="#ffffff"
        opacity={0.25}
        animate={{ cx: [130, 110, 130] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
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
  const bodyLevelY = BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * clamp(bodyFill);
  const headTop = HEAD.cy - HEAD.ry;
  const headBottom = HEAD.cy + HEAD.ry;
  const headLevelY = headBottom - (headBottom - headTop) * clamp(brainFill);
  const heart = clamp(heartFill);
  const allUnknown = brainUnknown && heartUnknown && bodyUnknown;

  return (
    <svg viewBox="0 0 240 440" className={className} role="img" aria-label="あなたのバッテリー（3 系統の見立て）">
      <defs>
        <linearGradient id="hb-brain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ZONE_STYLE.brain.liquidFrom} stopOpacity={0.9} />
          <stop offset="100%" stopColor={ZONE_STYLE.brain.liquidTo} stopOpacity={0.95} />
        </linearGradient>
        <linearGradient id="hb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.85} />
          <stop offset="55%" stopColor={ZONE_STYLE.body.liquidFrom} stopOpacity={0.8} />
          <stop offset="100%" stopColor={ZONE_STYLE.body.liquidTo} stopOpacity={0.9} />
        </linearGradient>
        <radialGradient id="hb-heart-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ZONE_STYLE.heart.liquidTo} stopOpacity={0.75} />
          <stop offset="55%" stopColor={ZONE_STYLE.heart.liquidFrom} stopOpacity={0.4} />
          <stop offset="100%" stopColor={ZONE_STYLE.heart.liquidFrom} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="hb-brain-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity={0} />
        </radialGradient>
        <filter id="hb-soften" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <filter id="hb-liquid-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id="hb-aura-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <mask id="hb-body-mask">
          <g filter="url(#hb-soften)">
            <BodyParts />
          </g>
        </mask>
        <clipPath id="hb-head-clip">
          <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx - 1.5} ry={HEAD.ry - 1.5} />
        </clipPath>
      </defs>

      {allUnknown ? (
        /* コールドスタート: 破線の静かな輪郭のみ（偽推定で埋めない） */
        <g opacity={0.8}>
          <BodyParts asOutline />
          <path
            d="M120 158 c-8 -11 -24 -4 -17 9 c4 8 17 14 17 14 c0 0 13 -6 17 -14 c7 -13 -9 -20 -17 -9 z"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.4}
            strokeDasharray="4 4"
          />
        </g>
      ) : (
        <>
          {/* aura（拡大シルエットの柔らかい発光輪郭） */}
          <g transform="translate(120,220) scale(1.05) translate(-120,-220)" filter="url(#hb-aura-blur)">
            <rect x={0} y={0} width={240} height={440} fill="#c7d2fe" opacity={0.4} mask="url(#hb-body-mask)" />
          </g>

          {/* リム輪郭（わずかに拡大した mask シルエット = 継ぎ目のない連続輪郭線） */}
          <g transform="translate(120,220) scale(1.016) translate(-120,-220)">
            <rect x={0} y={0} width={240} height={440} fill="#c7d2fe" opacity={0.85} mask="url(#hb-body-mask)" />
          </g>

          {/* ボディ本体（均一な半透明・継ぎ目なし） */}
          <rect x={0} y={0} width={240} height={440} fill="#ffffff" opacity={0.78} mask="url(#hb-body-mask)" />

          {/* 体バッテリー液体（足元から満ちる） */}
          {!bodyUnknown && bodyFill > 0 && (
            <motion.g
              mask="url(#hb-body-mask)"
              animate={pulseZone === "body" ? { opacity: [1, 0.6, 1] } : undefined}
              transition={{ duration: 0.9 }}
            >
              <g filter="url(#hb-liquid-soft)">
                <rect x={20} y={bodyLevelY} width={200} height={BODY_BOTTOM - bodyLevelY + 24} fill="url(#hb-body)" />
              </g>
              <LiquidSurface y={bodyLevelY} fillUrl="url(#hb-body)" />
              {/* 内部ハイライト（水の体積感） */}
              <ellipse cx={100} cy={bodyLevelY + 46} rx={26} ry={14} fill="#ffffff" opacity={0.22} filter="url(#hb-liquid-soft)" />
              <ellipse cx={142} cy={bodyLevelY + 90} rx={18} ry={10} fill="#ffffff" opacity={0.16} filter="url(#hb-liquid-soft)" />
            </motion.g>
          )}
          {bodyUnknown && (
            <g opacity={0.65}>
              <path d="M95,258 C91,282 89,306 90,330 C91,354 93,378 96,399 C98,413 103,421 110,421 C116,421 119,414 119,403 C119,379 119,355 118,331 C117,307 117,281 117,259 Z" fill="none" stroke="#cbd5e1" strokeWidth={1.4} strokeDasharray="5 5" />
              <path d="M145,258 C149,282 151,306 150,330 C149,354 147,378 144,399 C142,413 137,421 130,421 C124,421 121,414 121,403 C121,379 121,355 122,331 C123,307 123,281 123,259 Z" fill="none" stroke="#cbd5e1" strokeWidth={1.4} strokeDasharray="5 5" />
            </g>
          )}

          {/* 脳バッテリー（頭部の紫液体 + 脳形の淡い発光） */}
          {!brainUnknown && brainFill > 0 && (
            <motion.g
              clipPath="url(#hb-head-clip)"
              animate={pulseZone === "brain" ? { opacity: [1, 0.6, 1] } : undefined}
              transition={{ duration: 0.9 }}
            >
              <g filter="url(#hb-liquid-soft)">
                <rect x={HEAD.cx - HEAD.rx} y={headLevelY} width={HEAD.rx * 2} height={headBottom - headLevelY + 8} fill="url(#hb-brain)" />
              </g>
              <LiquidSurface y={headLevelY} fillUrl="url(#hb-brain)" />
              {/* 脳の発光（柔らかい光・目盛りなし） */}
              <ellipse cx={120} cy={44} rx={24} ry={16} fill="url(#hb-brain-glow)" opacity={0.35 + 0.45 * clamp(brainFill)} />
            </motion.g>
          )}
          {brainUnknown && (
            <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx - 2} ry={HEAD.ry - 2} fill="none" stroke="#cbd5e1" strokeWidth={1.4} strokeDasharray="5 5" opacity={0.7} />
          )}

          {/* 心臓バッテリー（怖くない柔らかい光・鼓動） */}
          {!heartUnknown && heart > 0 ? (
            <motion.g
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "120px 162px" }}
            >
              <circle cx={120} cy={160} r={22 + 18 * heart} fill="url(#hb-heart-glow)" opacity={0.4 + 0.5 * heart} />
              <path
                d="M120 174 c-9 -12 -26 -5 -18 10 c5 9 18 15 18 15 c0 0 13 -6 18 -15 c8 -15 -9 -22 -18 -10 z"
                fill={ZONE_STYLE.heart.liquidTo}
                opacity={0.4 + 0.45 * heart}
                filter="url(#hb-liquid-soft)"
              />
              <path
                d="M120 172 c-7 -10 -21 -4 -15 8 c4 7 15 12 15 12 c0 0 11 -5 15 -12 c6 -12 -8 -18 -15 -8 z"
                fill={ZONE_STYLE.heart.liquidTo}
                opacity={0.5 + 0.4 * heart}
              />
            </motion.g>
          ) : heartUnknown ? (
            <path
              d="M120 172 c-7 -10 -21 -4 -15 8 c4 7 15 12 15 12 c0 0 11 -5 15 -12 c6 -12 -8 -18 -15 -8 z"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1.4}
              strokeDasharray="4 4"
              opacity={0.7}
            />
          ) : null}
        </>
      )}
    </svg>
  );
}
