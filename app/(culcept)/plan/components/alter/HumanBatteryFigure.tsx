"use client";

/**
 * HumanBatteryFigure — 半透明の人体シルエット + 3 系統の液体バッテリー（SVG プレースホルダー実装）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / 設計書 §9
 * 規律:
 *  - 3 系統が独立した液体・光として巡る: 脳=パープル（頭部）/ 心臓=ローズの柔らかい光（胸）/ 体=ブルー〜ミント（胴体→脚）
 *  - ゲージ目盛り・数値・段階線を描かない（visualFill は 0-1 連続の描画専用値）
 *  - unknown の系統: 液体なし・薄い破線輪郭（偽推定で埋めない）
 *  - 医療スキャン風・赤色警告にしない（柔らかい発光する水のイメージ)
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
  /** 補正シート選択直後の柔らかいパルス対象（mock では視覚フィードバックのみ） */
  pulseZone?: "brain" | "heart" | "body" | null;
  className?: string;
}

// シルエット形状（性別ニュートラル・柔らかい輪郭）
const HEAD = { cx: 110, cy: 54, r: 34 };
// 体ゾーン（首から下）の縦範囲: y 96（肩）〜 400（足元）
const BODY_TOP = 96;
const BODY_BOTTOM = 400;
// 頭ゾーンの縦範囲
const HEAD_TOP = HEAD.cy - HEAD.r;
const HEAD_BOTTOM = HEAD.cy + HEAD.r;

function BodyShapes({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <g className={className} style={style}>
      {/* 首 */}
      <rect x={98} y={84} width={24} height={16} rx={7} />
      {/* 胴体（肩〜腰） */}
      <rect x={66} y={96} width={88} height={134} rx={32} />
      {/* 腕 */}
      <rect x={42} y={106} width={21} height={112} rx={10} />
      <rect x={157} y={106} width={21} height={112} rx={10} />
      {/* 腰 */}
      <rect x={72} y={218} width={76} height={44} rx={20} />
      {/* 脚 */}
      <rect x={74} y={252} width={29} height={148} rx={14} />
      <rect x={117} y={252} width={29} height={148} rx={14} />
    </g>
  );
}

/** 液面のゆらぎ（横に流れる楕円波。framer-motion の連続アニメーション） */
function LiquidWave({ y, fillUrl, width = 220 }: { y: number; fillUrl: string; width?: number }) {
  return (
    <motion.ellipse
      cx={width / 2}
      cy={y}
      rx={width * 0.62}
      ry={5}
      fill={fillUrl}
      animate={{ cx: [width / 2 - 8, width / 2 + 8, width / 2 - 8] }}
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
  // 液面の y 座標（下から fill 比率で満ちる）
  const headLevelY = HEAD_BOTTOM - (HEAD_BOTTOM - HEAD_TOP) * Math.min(Math.max(brainFill, 0), 1);
  const bodyLevelY = BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * Math.min(Math.max(bodyFill, 0), 1);
  const heart = Math.min(Math.max(heartFill, 0), 1);

  return (
    <svg
      viewBox="0 0 220 412"
      className={className}
      role="img"
      aria-label="あなたのバッテリー（3 系統の見立て）"
    >
      <defs>
        <linearGradient id="hb-brain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ZONE_STYLE.brain.liquidFrom} stopOpacity={0.85} />
          <stop offset="100%" stopColor={ZONE_STYLE.brain.liquidTo} stopOpacity={0.9} />
        </linearGradient>
        <linearGradient id="hb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ZONE_STYLE.body.liquidFrom} stopOpacity={0.75} />
          <stop offset="100%" stopColor={ZONE_STYLE.body.liquidTo} stopOpacity={0.85} />
        </linearGradient>
        <radialGradient id="hb-heart" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ZONE_STYLE.heart.liquidTo} stopOpacity={0.8} />
          <stop offset="60%" stopColor={ZONE_STYLE.heart.liquidFrom} stopOpacity={0.45} />
          <stop offset="100%" stopColor={ZONE_STYLE.heart.liquidFrom} stopOpacity={0} />
        </radialGradient>
        <clipPath id="hb-clip-head">
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r - 2} />
        </clipPath>
        <clipPath id="hb-clip-body">
          <rect x={98} y={84} width={24} height={16} rx={7} />
          <rect x={66} y={96} width={88} height={134} rx={32} />
          <rect x={42} y={106} width={21} height={112} rx={10} />
          <rect x={157} y={106} width={21} height={112} rx={10} />
          <rect x={72} y={218} width={76} height={44} rx={20} />
          <rect x={74} y={252} width={29} height={148} rx={14} />
          <rect x={117} y={252} width={29} height={148} rx={14} />
        </clipPath>
      </defs>

      {/* ベースシルエット（半透明の器） */}
      <circle
        cx={HEAD.cx}
        cy={HEAD.cy}
        r={HEAD.r}
        fill="rgba(255,255,255,0.45)"
        stroke={brainUnknown ? "#cbd5e1" : "#c7d2fe"}
        strokeWidth={2}
        strokeDasharray={brainUnknown ? "5 5" : undefined}
        opacity={brainUnknown ? 0.6 : 1}
      />
      <BodyShapes
        className="fill-[rgba(255,255,255,0.45)]"
        style={{
          stroke: bodyUnknown ? "#cbd5e1" : "#bae6fd",
          strokeWidth: 2,
          strokeDasharray: bodyUnknown ? "5 5" : undefined,
          opacity: bodyUnknown ? 0.6 : 1,
        }}
      />

      {/* 体バッテリー液体（胴体→腕・脚へ巡る。下から満ちる） */}
      {!bodyUnknown && bodyFill > 0 && (
        <motion.g
          clipPath="url(#hb-clip-body)"
          animate={pulseZone === "body" ? { opacity: [1, 0.65, 1] } : undefined}
          transition={{ duration: 0.9 }}
        >
          <rect x={30} y={bodyLevelY} width={160} height={BODY_BOTTOM - bodyLevelY + 4} fill="url(#hb-body)" />
          <LiquidWave y={bodyLevelY} fillUrl="url(#hb-body)" />
        </motion.g>
      )}

      {/* 脳バッテリー液体（頭部） */}
      {!brainUnknown && brainFill > 0 && (
        <motion.g
          clipPath="url(#hb-clip-head)"
          animate={pulseZone === "brain" ? { opacity: [1, 0.65, 1] } : undefined}
          transition={{ duration: 0.9 }}
        >
          <rect x={HEAD.cx - HEAD.r} y={headLevelY} width={HEAD.r * 2} height={HEAD_BOTTOM - headLevelY + 2} fill="url(#hb-brain)" />
          <LiquidWave y={headLevelY} fillUrl="url(#hb-brain)" width={HEAD.r * 2 + 40} />
        </motion.g>
      )}

      {/* 心臓バッテリー（怖くない・柔らかい光。輝度と広がりが余力に追従） */}
      {!heartUnknown && heart > 0 && (
        <motion.g
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "110px 142px" }}
        >
          <circle cx={110} cy={142} r={18 + 16 * heart} fill="url(#hb-heart)" opacity={0.35 + 0.5 * heart} />
          <path
            d="M110 152 c-7 -10 -22 -4 -16 8 c4 8 16 14 16 14 c0 0 12 -6 16 -14 c6 -12 -9 -18 -16 -8 z"
            fill={ZONE_STYLE.heart.liquidTo}
            opacity={0.35 + 0.45 * heart}
          />
        </motion.g>
      )}
      {heartUnknown && (
        <path
          d="M110 152 c-7 -10 -22 -4 -16 8 c4 8 16 14 16 14 c0 0 12 -6 16 -14 c6 -12 -9 -18 -16 -8 z"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      )}
    </svg>
  );
}
