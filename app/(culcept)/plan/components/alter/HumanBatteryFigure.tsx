"use client";

/**
 * HumanBatteryFigure — 人体バッテリー（v3: asset-driven 構造 + 組み込み高品質フォールバック）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / 設計書 §9 / CEO 指示（B1 = visual shell reconstruction）
 *
 * レイヤー構造（CEO 指定のアセット分離。各レイヤーは独立して差し替え可能）:
 *   1. ambient glow layer … ラベンダーの星雲発光（背面）
 *   2. base human body  … 人体ベース（現在: 組み込みベクター + リムライト filter。
 *                          ★アセット差し替えスロット: `./assets/human-body-base.png`（実透過 PNG）が
 *                          提供されたら BaseBody を画像 + CSS mask 化する — 構造変更なしで交換可）
 *   3. body layer       … 胴体〜脚の青緑液体（mask で人体形状にクリップ・visualFill で水位）
 *   4. brain layer      … 頭部の紫液体 + 発光
 *   5. heart layer      … 胸のローズ発光 + 軌道リング（アセット 2 の意匠）
 *
 * 規律: %・目盛り・数値なし / unknown は液体なし・破線輪郭 / 赤色・医療スキャン風にしない /
 *       visualFill は vm.battery.*.visualFill のみから描画（ViewModel 接続維持）。
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

// 体ゾーン（首下〜足）の縦範囲
const BODY_TOP = 92;
const BODY_BOTTOM = 444;
// 頭部ゾーン
const HEAD_TOP = 16;
const HEAD_BOTTOM = 80;

/**
 * 人体パーツ（v3 解剖学プロポーション）。
 * fill を opaque にして <g opacity> で均一半透明化（パーツ重なりの継ぎ目を出さない）。
 */
function BodyParts({ asOutline = false }: { asOutline?: boolean }) {
  const common = asOutline
    ? { fill: "none", stroke: "#cbd5e1", strokeWidth: 1.6, strokeDasharray: "5 5" }
    : { fill: "#ffffff" };
  return (
    <g {...common}>
      {/* 頭（顎へすぼまる楕円） */}
      <path d="M120,16 C137,16 147,29 147,45 C147,60 138,74 120,80 C102,74 93,60 93,45 C93,29 103,16 120,16 Z" />
      {/* 首（細→僧帽筋へ広がる） */}
      <path d="M111,74 C111,85 109,91 104,96 L136,96 C131,91 129,85 129,74 Z" />
      {/* 胴体（肩→胸→ウエスト→腰） */}
      <path d="M120,92 C134,92 147,95 156,102 C166,109 171,119 171,130 C171,142 167,152 163,163 C159,173 157,183 158,195 C160,211 163,225 162,239 C161,253 154,262 142,265 L98,265 C86,262 79,253 78,239 C77,225 80,211 82,195 C83,183 81,173 77,163 C73,152 69,142 69,130 C69,119 74,109 84,102 C93,95 106,92 120,92 Z" />
      {/* 左腕（肘・手首テーパー + 手） */}
      <path d="M70,116 C61,123 55,134 53,147 C51,162 50,178 50,194 C50,208 51,222 53,234 C54,244 57,251 62,253 C66,255 70,251 70,244 C70,236 69,224 69,212 C69,196 70,178 71,162 C72,148 74,132 77,122 Z" />
      <path d="M53,252 C49,258 48,266 50,272 C52,277 58,278 62,274 C65,270 66,263 64,257 C62,252 57,249 53,252 Z" />
      {/* 右腕 + 手 */}
      <path d="M170,116 C179,123 185,134 187,147 C189,162 190,178 190,194 C190,208 189,222 187,234 C186,244 183,251 178,253 C174,255 170,251 170,244 C170,236 171,224 171,212 C171,196 170,178 169,162 C168,148 166,132 163,122 Z" />
      <path d="M187,252 C191,258 192,266 190,272 C188,277 182,278 178,274 C175,270 174,263 176,257 C178,252 183,249 187,252 Z" />
      {/* 左脚（腿→膝→ふくらはぎ→足首） + 足 */}
      <path d="M98,263 C94,285 92,309 93,331 C94,353 96,375 98,395 C99,409 101,421 105,429 C108,435 114,435 116,429 C118,423 118,411 118,399 C118,375 117,349 116,325 C115,301 116,279 117,263 Z" />
      <path d="M101,428 C96,432 93,437 95,441 C97,444 104,445 110,443 C115,441 117,436 116,432 C115,429 110,427 106,427 Z" />
      {/* 右脚 + 足 */}
      <path d="M142,263 C146,285 148,309 147,331 C146,353 144,375 142,395 C141,409 139,421 135,429 C132,435 126,435 124,429 C122,423 122,411 122,399 C122,375 123,349 124,325 C125,301 124,279 123,263 Z" />
      <path d="M139,428 C144,432 147,437 145,441 C143,444 136,445 130,443 C125,441 123,436 124,432 C125,429 130,427 134,427 Z" />
    </g>
  );
}

/** 液面のゆらぎ */
function LiquidSurface({ y, fillUrl, width = 240 }: { y: number; fillUrl: string; width?: number }) {
  return (
    <>
      <motion.ellipse
        cx={width / 2}
        cy={y}
        rx={width * 0.55}
        ry={6}
        fill={fillUrl}
        opacity={0.9}
        animate={{ cx: [width / 2 - 9, width / 2 + 9, width / 2 - 9] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.ellipse
        cx={width / 2}
        cy={y + 2.5}
        rx={width * 0.5}
        ry={5}
        fill="#ffffff"
        opacity={0.28}
        animate={{ cx: [width / 2 + 10, width / 2 - 10, width / 2 + 10] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

/** 星雲スパークル（決定論的固定座標 — random 不使用） */
const SPARKLES: Array<[number, number, number, number]> = [
  // [cx, cy, r, opacity]
  [52, 96, 1.6, 0.8], [186, 78, 1.2, 0.6], [200, 180, 1.8, 0.7], [38, 210, 1.3, 0.55],
  [62, 300, 1.5, 0.65], [196, 296, 1.2, 0.5], [88, 56, 1.1, 0.5], [168, 40, 1.4, 0.65],
  [30, 150, 1.0, 0.45], [208, 238, 1.0, 0.5], [48, 372, 1.2, 0.5], [188, 366, 1.5, 0.6],
];

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
  const headLevelY = HEAD_BOTTOM - (HEAD_BOTTOM - HEAD_TOP) * clamp(brainFill);
  const heart = clamp(heartFill);
  const allUnknown = brainUnknown && heartUnknown && bodyUnknown;

  return (
    <svg viewBox="0 0 240 470" className={className} role="img" aria-label="あなたのバッテリー（3 系統の見立て）">
      <defs>
        <linearGradient id="hb-brain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ZONE_STYLE.brain.liquidFrom} stopOpacity={0.92} />
          <stop offset="100%" stopColor={ZONE_STYLE.brain.liquidTo} stopOpacity={0.95} />
        </linearGradient>
        <linearGradient id="hb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.88} />
          <stop offset="55%" stopColor={ZONE_STYLE.body.liquidFrom} stopOpacity={0.82} />
          <stop offset="100%" stopColor={ZONE_STYLE.body.liquidTo} stopOpacity={0.92} />
        </linearGradient>
        <radialGradient id="hb-heart-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ZONE_STYLE.heart.liquidTo} stopOpacity={0.8} />
          <stop offset="55%" stopColor={ZONE_STYLE.heart.liquidFrom} stopOpacity={0.42} />
          <stop offset="100%" stopColor={ZONE_STYLE.heart.liquidFrom} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="hb-brain-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ddd6fe" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="hb-ambient" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#c7d2fe" stopOpacity={0.5} />
          <stop offset="55%" stopColor="#ddd6fe" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#ddd6fe" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="hb-inner-shade" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="78%" stopColor="#c7d2fe" stopOpacity={0.16} />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity={0.34} />
        </radialGradient>
        {/* リムライト（アセットのガラスマネキン質感: 輪郭の内側だけ白く発光） */}
        <filter id="hb-rim" x="-15%" y="-15%" width="130%" height="130%">
          <feMorphology operator="erode" radius="2.6" in="SourceAlpha" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="2.2" result="edgeBlur" />
          <feFlood floodColor="#ffffff" floodOpacity="1" result="white" />
          <feComposite in="white" in2="edgeBlur" operator="in" result="rim" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="rim" />
            <feMergeNode in="rim" />
          </feMerge>
        </filter>
        <filter id="hb-soften" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
        <filter id="hb-liquid-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id="hb-aura-blur" x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <mask id="hb-body-mask">
          <g filter="url(#hb-soften)">
            <BodyParts />
          </g>
        </mask>
        <clipPath id="hb-head-clip">
          <path d="M120,17.5 C136,17.5 145.5,30 145.5,45 C145.5,59.5 137,73 120,78.5 C103,73 94.5,59.5 94.5,45 C94.5,30 104,17.5 120,17.5 Z" />
        </clipPath>
      </defs>

      {/* 1. ambient glow（星雲 — アセット 5 の意匠） */}
      <motion.g
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <ellipse cx={120} cy={210} rx={118} ry={205} fill="url(#hb-ambient)" />
        {!allUnknown &&
          SPARKLES.map(([cx, cy, r, o], i) => (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="#ffffff"
              animate={{ opacity: [o * 0.4, o, o * 0.4] }}
              transition={{ duration: 3.5 + (i % 4), repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
            />
          ))}
      </motion.g>

      {allUnknown ? (
        /* コールドスタート: 破線の静かな輪郭のみ（偽推定で埋めない） */
        <g opacity={0.85}>
          <BodyParts asOutline />
          <path
            d="M120 146 c-8 -11 -24 -4 -17 9 c4 8 17 14 17 14 c0 0 13 -6 17 -14 c7 -13 -9 -20 -17 -9 z"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.4}
            strokeDasharray="4 4"
          />
        </g>
      ) : (
        <>
          {/* aura（拡大シルエットの柔らかい外光） */}
          <g transform="translate(120,230) scale(1.06) translate(-120,-230)" filter="url(#hb-aura-blur)">
            <rect x={0} y={0} width={240} height={470} fill="#c7d2fe" opacity={0.5} mask="url(#hb-body-mask)" />
          </g>

          {/* 2. base human body（組み込みベクター: opaque 白 + group opacity + リムライト） */}
          <g opacity={0.82} filter="url(#hb-rim)">
            <BodyParts />
          </g>
          {/* 内側の奥行きシェーディング */}
          <rect x={0} y={0} width={240} height={470} fill="url(#hb-inner-shade)" mask="url(#hb-body-mask)" />

          {/* 3. body layer（胴体→脚の液体・下から満ちる） */}
          {!bodyUnknown && bodyFill > 0 && (
            <motion.g
              mask="url(#hb-body-mask)"
              animate={pulseZone === "body" ? { opacity: [1, 0.6, 1] } : undefined}
              transition={{ duration: 0.9 }}
            >
              <g filter="url(#hb-liquid-soft)">
                <rect x={20} y={bodyLevelY} width={200} height={BODY_BOTTOM - bodyLevelY + 30} fill="url(#hb-body)" />
              </g>
              <LiquidSurface y={bodyLevelY} fillUrl="url(#hb-body)" />
              <ellipse cx={100} cy={bodyLevelY + 46} rx={26} ry={14} fill="#ffffff" opacity={0.22} filter="url(#hb-liquid-soft)" />
              <ellipse cx={142} cy={bodyLevelY + 92} rx={18} ry={10} fill="#ffffff" opacity={0.16} filter="url(#hb-liquid-soft)" />
            </motion.g>
          )}
          {bodyUnknown && (
            <g opacity={0.6}>
              <path d="M98,263 C94,285 92,309 93,331 C94,353 96,375 98,395 C99,409 101,421 105,429 C108,435 114,435 116,429 C118,423 118,411 118,399 C118,375 117,349 116,325 C115,301 116,279 117,263 Z" fill="none" stroke="#cbd5e1" strokeWidth={1.3} strokeDasharray="5 5" />
              <path d="M142,263 C146,285 148,309 147,331 C146,353 144,375 142,395 C141,409 139,421 135,429 C132,435 126,435 124,429 C122,423 122,411 122,399 C122,375 123,349 124,325 C125,301 124,279 123,263 Z" fill="none" stroke="#cbd5e1" strokeWidth={1.3} strokeDasharray="5 5" />
            </g>
          )}

          {/* 4. brain layer（頭部の紫液体 + 発光） */}
          {!brainUnknown && brainFill > 0 && (
            <motion.g
              clipPath="url(#hb-head-clip)"
              animate={pulseZone === "brain" ? { opacity: [1, 0.6, 1] } : undefined}
              transition={{ duration: 0.9 }}
            >
              <g filter="url(#hb-liquid-soft)">
                <rect x={92} y={headLevelY} width={56} height={HEAD_BOTTOM - headLevelY + 10} fill="url(#hb-brain)" />
              </g>
              <LiquidSurface y={headLevelY} fillUrl="url(#hb-brain)" width={120} />
              <ellipse cx={120} cy={40} rx={21} ry={14} fill="url(#hb-brain-glow)" opacity={0.4 + 0.5 * clamp(brainFill)} />
            </motion.g>
          )}
          {brainUnknown && (
            <path
              d="M120,19 C135,19 144,31 144,45 C144,59 136,71.5 120,77 C104,71.5 96,59 96,45 C96,31 105,19 120,19 Z"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1.4}
              strokeDasharray="5 5"
              opacity={0.7}
            />
          )}

          {/* 5. heart layer（ローズの柔らかい光 + 軌道リング — アセット 2 の意匠） */}
          {!heartUnknown && heart > 0 ? (
            <motion.g
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "120px 150px" }}
            >
              <circle cx={120} cy={148} r={24 + 18 * heart} fill="url(#hb-heart-glow)" opacity={0.45 + 0.45 * heart} />
              {/* 軌道リング + ドット */}
              <g opacity={0.3 + 0.35 * heart}>
                <circle cx={120} cy={148} r={30 + 10 * heart} fill="none" stroke="#ffffff" strokeWidth={0.8} />
                <circle cx={120} cy={148 - (30 + 10 * heart)} r={1.6} fill="#ffffff" />
                <circle cx={120 + (30 + 10 * heart)} cy={148} r={1.3} fill="#ffffff" />
                <circle cx={120 - (30 + 10 * heart) * 0.72} cy={148 + (30 + 10 * heart) * 0.7} r={1.2} fill="#ffffff" />
              </g>
              <path
                d="M120 162 c-9 -12 -26 -5 -18 10 c5 9 18 15 18 15 c0 0 13 -6 18 -15 c8 -15 -9 -22 -18 -10 z"
                fill={ZONE_STYLE.heart.liquidTo}
                opacity={0.42 + 0.45 * heart}
                filter="url(#hb-liquid-soft)"
              />
              <path
                d="M120 160 c-7 -10 -21 -4 -15 8 c4 7 15 12 15 12 c0 0 11 -5 15 -12 c6 -12 -8 -18 -15 -8 z"
                fill={ZONE_STYLE.heart.liquidTo}
                opacity={0.55 + 0.35 * heart}
              />
            </motion.g>
          ) : heartUnknown ? (
            <path
              d="M120 160 c-7 -10 -21 -4 -15 8 c4 7 15 12 15 12 c0 0 11 -5 15 -12 c6 -12 -8 -18 -15 -8 z"
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
