"use client";

// app/aneurasync/RobotAvatar.tsx
// たまごっち的な愛くるしいロボットアバター
// 丸い体 + 大きな目 + キラキラ瞳 + 表情豊かな口 + バウンスアニメーション
// SVG + CSS アニメーション。AIイラスト不要。

import { useEffect, useId, useRef, useState } from "react";
import type { RobotExpression, RelationshipStage } from "@/lib/aneurasync/relationshipStage";

/* ═══════════════════════════════════════════════
   Expression Configs — 各表情のパラメータ
   ═══════════════════════════════════════════════ */

interface ExpressionParams {
  eyeScale: number;          // 目の大きさ (1 = 通常)
  eyeSquish: number;         // 目の縦つぶれ (1 = 丸, 0.3 = 細い)
  pupilSize: number;         // 瞳の大きさ
  pupilOffsetY: number;      // 瞳の上下位置
  highlightSize: number;     // キラキラの大きさ
  mouthType: "smile" | "grin" | "small" | "open" | "pout" | "flat" | "wave";
  mouthScale: number;        // 口の大きさ
  blushOpacity: number;      // 頬の赤み (0-1)
  headTilt: number;          // 首の傾き (度)
  bodyBounce: number;        // 体のバウンス量 (0-1)
  armPose: "rest" | "wave" | "think" | "excited" | "shy";
  glowColor: string;         // 感情の色
  glowIntensity: number;     // 光の強さ
  bodyLean: number;          // 前傾 (-1=後ろ, 0=中立, 1=前)
}

const EXPRESSIONS: Record<RobotExpression, ExpressionParams> = {
  neutral: {
    eyeScale: 1, eyeSquish: 1, pupilSize: 1, pupilOffsetY: 0,
    highlightSize: 1, mouthType: "smile", mouthScale: 1,
    blushOpacity: 0.15, headTilt: 0, bodyBounce: 0.3,
    armPose: "rest", glowColor: "#4AEAFF", glowIntensity: 0.15, bodyLean: 0,
  },
  curious: {
    eyeScale: 1.15, eyeSquish: 1.1, pupilSize: 1.15, pupilOffsetY: -0.5,
    highlightSize: 1.2, mouthType: "small", mouthScale: 0.8,
    blushOpacity: 0.1, headTilt: 5, bodyBounce: 0.5,
    armPose: "rest", glowColor: "#4AEAFF", glowIntensity: 0.25, bodyLean: 0.3,
  },
  concerned: {
    eyeScale: 1.05, eyeSquish: 0.85, pupilSize: 1.05, pupilOffsetY: 1,
    highlightSize: 0.8, mouthType: "wave", mouthScale: 0.9,
    blushOpacity: 0.05, headTilt: -3, bodyBounce: 0.15,
    armPose: "shy", glowColor: "#FF6B9D", glowIntensity: 0.15, bodyLean: 0.2,
  },
  warm: {
    eyeScale: 0.95, eyeSquish: 0.7, pupilSize: 1, pupilOffsetY: 0.5,
    highlightSize: 1.1, mouthType: "grin", mouthScale: 1.2,
    blushOpacity: 0.4, headTilt: 3, bodyBounce: 0.4,
    armPose: "rest", glowColor: "#FBBF24", glowIntensity: 0.25, bodyLean: 0,
  },
  thinking: {
    eyeScale: 1, eyeSquish: 0.9, pupilSize: 0.9, pupilOffsetY: -1,
    highlightSize: 0.7, mouthType: "flat", mouthScale: 0.7,
    blushOpacity: 0.05, headTilt: -6, bodyBounce: 0.1,
    armPose: "think", glowColor: "#8B5CF6", glowIntensity: 0.2, bodyLean: -0.1,
  },
  surprised: {
    eyeScale: 1.3, eyeSquish: 1.2, pupilSize: 0.8, pupilOffsetY: -1,
    highlightSize: 1.3, mouthType: "open", mouthScale: 1,
    blushOpacity: 0.2, headTilt: 0, bodyBounce: 0.7,
    armPose: "excited", glowColor: "#4AEAFF", glowIntensity: 0.35, bodyLean: -0.2,
  },
  skeptical: {
    eyeScale: 0.95, eyeSquish: 0.75, pupilSize: 0.95, pupilOffsetY: 0.5,
    highlightSize: 0.6, mouthType: "pout", mouthScale: 0.8,
    blushOpacity: 0, headTilt: 6, bodyBounce: 0.1,
    armPose: "rest", glowColor: "#8B5CF6", glowIntensity: 0.15, bodyLean: 0,
  },
  listening: {
    eyeScale: 1.1, eyeSquish: 1, pupilSize: 1.1, pupilOffsetY: 0,
    highlightSize: 1.1, mouthType: "small", mouthScale: 0.9,
    blushOpacity: 0.15, headTilt: 4, bodyBounce: 0.35,
    armPose: "rest", glowColor: "#4AEAFF", glowIntensity: 0.2, bodyLean: 0.4,
  },
  knowing: {
    eyeScale: 0.9, eyeSquish: 0.65, pupilSize: 0.9, pupilOffsetY: 0.5,
    highlightSize: 0.9, mouthType: "grin", mouthScale: 0.9,
    blushOpacity: 0.25, headTilt: -3, bodyBounce: 0.2,
    armPose: "rest", glowColor: "#34D399", glowIntensity: 0.2, bodyLean: 0,
  },
  quiet: {
    eyeScale: 0.85, eyeSquish: 0.55, pupilSize: 0.85, pupilOffsetY: 1,
    highlightSize: 0.5, mouthType: "flat", mouthScale: 0.6,
    blushOpacity: 0.1, headTilt: -5, bodyBounce: 0.05,
    armPose: "shy", glowColor: "#8B5CF6", glowIntensity: 0.1, bodyLean: -0.1,
  },
};

/* ═══════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════ */

interface RobotAvatarProps {
  expression: RobotExpression;
  stage: RelationshipStage;
  size?: number;
  isBlinking?: boolean;
  breathingSpeed?: number;
  className?: string;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const clamped = Math.max(0, Math.min(1, alpha));
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

/* ═══════════════════════════════════════════════
   Mouth SVG Paths
   ═══════════════════════════════════════════════ */

function MouthShape({
  type,
  scale,
  cx,
  cy,
  stroke = "rgba(88,102,138,0.82)",
  fill = "rgba(255,145,176,0.24)",
}: {
  type: ExpressionParams["mouthType"];
  scale: number;
  cx: number;
  cy: number;
  stroke?: string;
  fill?: string;
}) {
  const w = 6 * scale;
  const h = 3 * scale;
  const t = "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";

  switch (type) {
    case "smile":
      return (
        <path
          d={`M ${cx - w} ${cy} Q ${cx} ${cy + h * 1.8} ${cx + w} ${cy}`}
          fill="none" stroke={stroke} strokeWidth={1.2} strokeLinecap="round"
          style={{ transition: t }}
        />
      );
    case "grin":
      return (
        <g style={{ transition: t }}>
          <path
            d={`M ${cx - w} ${cy - 0.5} Q ${cx} ${cy + h * 2.2} ${cx + w} ${cy - 0.5}`}
            fill={fill} stroke={stroke} strokeWidth={1.2} strokeLinecap="round"
          />
        </g>
      );
    case "open":
      return (
        <ellipse
          cx={cx} cy={cy + 1} rx={w * 0.5} ry={h * 0.9}
          fill="rgba(34,30,54,0.66)" stroke={stroke} strokeWidth={0.8}
          style={{ transition: t }}
        />
      );
    case "pout":
      return (
        <path
          d={`M ${cx - w * 0.6} ${cy + 1} Q ${cx} ${cy - h * 0.8} ${cx + w * 0.6} ${cy + 1}`}
          fill="none" stroke={stroke} strokeWidth={1.2} strokeLinecap="round"
          style={{ transition: t }}
        />
      );
    case "flat":
      return (
        <line
          x1={cx - w * 0.6} y1={cy} x2={cx + w * 0.6} y2={cy}
          stroke={stroke} strokeWidth={1} strokeLinecap="round"
          style={{ transition: t }}
        />
      );
    case "wave":
      return (
        <path
          d={`M ${cx - w * 0.7} ${cy} Q ${cx - w * 0.2} ${cy - h * 0.6} ${cx} ${cy} Q ${cx + w * 0.2} ${cy + h * 0.6} ${cx + w * 0.7} ${cy}`}
          fill="none" stroke={stroke} strokeWidth={1} strokeLinecap="round"
          style={{ transition: t }}
        />
      );
    case "small":
    default:
      return (
        <path
          d={`M ${cx - w * 0.5} ${cy} Q ${cx} ${cy + h} ${cx + w * 0.5} ${cy}`}
          fill="none" stroke={stroke} strokeWidth={1} strokeLinecap="round"
          style={{ transition: t }}
        />
      );
  }
}

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */

export default function RobotAvatar({
  expression,
  stage,
  size = 80,
  breathingSpeed = 1,
  className,
}: RobotAvatarProps) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [idleShift, setIdleShift] = useState(0); // -1 to 1, idle sway
  const blinkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const uniqueId = useId().replace(/:/g, "");

  const params = EXPRESSIONS[expression];
  const breathDuration = 3.5 / breathingSpeed;

  // ── Blink loop ──
  useEffect(() => {
    function scheduleBlink() {
      const interval = 2000 + Math.random() * (stage >= 3 ? 2500 : 3500);
      blinkTimer.current = setTimeout(() => {
        setIsBlinking(true);
        // Double blink sometimes (cute!)
        const doubleBlink = Math.random() < 0.2;
        setTimeout(() => {
          setIsBlinking(false);
          if (doubleBlink) {
            setTimeout(() => {
              setIsBlinking(true);
              setTimeout(() => {
                setIsBlinking(false);
                scheduleBlink();
              }, 100);
            }, 150);
          } else {
            scheduleBlink();
          }
        }, 100 + Math.random() * 60);
      }, interval);
    }
    scheduleBlink();
    return () => { if (blinkTimer.current) clearTimeout(blinkTimer.current); };
  }, [stage]);

  // ── Idle sway (like breathing but side to side) ──
  useEffect(() => {
    function scheduleIdle() {
      const interval = 2000 + Math.random() * 3000;
      idleTimer.current = setTimeout(() => {
        const shift = (Math.random() - 0.5) * 2;
        setIdleShift(shift);
        setTimeout(() => {
          setIdleShift(0);
          scheduleIdle();
        }, 1500 + Math.random() * 1000);
      }, interval);
    }
    if (stage >= 2) scheduleIdle();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [stage]);

  // ── Layout Constants ──
  const vb = 120; // viewBox
  const cx = vb / 2;

  // Body (lower rounded shape)
  const bodyY = 78;
  const bodyRx = 22;
  const bodyRy = 16;

  // Head (big round head on top — the main feature)
  const headCx = cx;
  const headCy = 48;
  const headR = 28;

  // Eyes
  const eyeSpacing = 10;
  const eyeBaseY = headCy - 2;
  const eyeRx = 6.5 * params.eyeScale;
  const eyeRy = 7 * params.eyeScale * params.eyeSquish;
  const blinkEyeRy = isBlinking ? 1 : eyeRy;

  // Pupil
  const pupilR = 3.5 * params.pupilSize;
  const pupilY = eyeBaseY + params.pupilOffsetY;

  // Highlight
  const hlSize = 1.8 * params.highlightSize;

  // Mouth
  const mouthY = headCy + 10;

  // Cheeks (blush)
  const cheekY = headCy + 4;
  const cheekSpacing = 16;

  // Ears/antenna
  const antennaY = headCy - headR - 4;

  // Arms
  const armY = bodyY - 4;

  // Lean/tilt
  const leanOffset = params.bodyLean * 3;
  const tiltAngle = params.headTilt + idleShift * 2;

  // Stage-based accessories
  const showAntenna = true;
  const showCheekMarks = stage >= 2;
  const showStarAccessory = stage >= 4;

  const id = `ra_${uniqueId}`;
  const glowCore = withAlpha(params.glowColor, 0.18 + params.glowIntensity * 0.35);
  const glowEdge = withAlpha(params.glowColor, 0.08 + params.glowIntensity * 0.2);
  const shellStroke = withAlpha(params.glowColor, stage >= 3 ? 0.28 : 0.22);
  const shellShadow = withAlpha(params.glowColor, 0.16 + params.glowIntensity * 0.24);
  const eyeStroke = withAlpha(params.glowColor, 0.42);
  const eyeHalo = withAlpha(params.glowColor, 0.24);
  const facialLine = "rgba(88,102,138,0.82)";

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: "absolute",
        inset: -14,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${glowCore} 0%, ${glowEdge} 45%, transparent 74%)`,
        filter: "blur(14px)",
        animation: `${id}_glow ${breathDuration}s ease-in-out infinite`,
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        inset: "18% 18% 22%",
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(255,255,255,0.96) 0%, ${withAlpha(params.glowColor, 0.14)} 54%, transparent 78%)`,
        filter: "blur(12px)",
        opacity: 0.92,
        pointerEvents: "none",
      }} />

      <svg
        viewBox={`0 0 ${vb} ${vb + 10}`}
        width={size}
        height={size}
        style={{
          overflow: "visible",
          filter: `drop-shadow(0 10px 18px ${shellShadow})`,
        }}
      >
        <defs>
          {/* Eye gradient */}
          <radialGradient id={`${id}_eyeGrad`} cx="45%" cy="40%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.98} />
            <stop offset="58%" stopColor={withAlpha(params.glowColor, 0.18)} />
            <stop offset="100%" stopColor="rgba(223,241,255,0.96)" />
          </radialGradient>
          {/* Body gradient */}
          <radialGradient id={`${id}_bodyGrad`} cx="50%" cy="30%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
            <stop offset="62%" stopColor="rgba(235,244,255,0.95)" />
            <stop offset="100%" stopColor={withAlpha(params.glowColor, 0.2)} />
          </radialGradient>
          {/* Head gradient */}
          <radialGradient id={`${id}_headGrad`} cx="40%" cy="35%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.99)" />
            <stop offset="64%" stopColor="rgba(244,249,255,0.98)" />
            <stop offset="100%" stopColor={withAlpha(params.glowColor, 0.16)} />
          </radialGradient>
        </defs>

        {/* ── Whole character group: breathing + tilt ── */}
        <g
          style={{
            transformOrigin: `${cx}px ${bodyY}px`,
            animation: `${id}_breathe ${breathDuration}s ease-in-out infinite`,
            transform: `translateY(${leanOffset}px) rotate(${tiltAngle}deg)`,
            transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* ━━━ Shadow ━━━ */}
          <ellipse
            cx={cx} cy={bodyY + bodyRy + 4}
            rx={18} ry={3}
            fill="rgba(114,124,168,0.18)"
            style={{
              animation: `${id}_shadow ${breathDuration}s ease-in-out infinite`,
              transformOrigin: `${cx}px ${bodyY + bodyRy + 4}px`,
            }}
          />

          {/* ━━━ Body (round torso) ━━━ */}
          <ellipse
            cx={cx} cy={bodyY}
            rx={bodyRx} ry={bodyRy}
            fill={`url(#${id}_bodyGrad)`}
            stroke={shellStroke}
            strokeWidth={1.1}
          />

          {/* ━━━ Left arm ━━━ */}
          <g style={{
            transformOrigin: `${cx - bodyRx + 4}px ${armY}px`,
            transform: params.armPose === "wave" ? "rotate(-25deg)"
              : params.armPose === "think" ? "rotate(-10deg)"
              : params.armPose === "excited" ? "rotate(-35deg)"
              : params.armPose === "shy" ? "rotate(5deg)"
              : "rotate(-8deg)",
            transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}>
            <line
              x1={cx - bodyRx + 4} y1={armY}
              x2={cx - bodyRx - 8} y2={armY + 8}
              stroke="rgba(186,209,238,0.95)" strokeWidth={2.5} strokeLinecap="round"
            />
            {/* Hand */}
            <circle
              cx={cx - bodyRx - 8} cy={armY + 8}
              r={2.5}
              fill="rgba(245,250,255,0.96)" stroke={shellStroke} strokeWidth={0.8}
            />
          </g>

          {/* ━━━ Right arm ━━━ */}
          <g style={{
            transformOrigin: `${cx + bodyRx - 4}px ${armY}px`,
            transform: params.armPose === "wave" ? "rotate(30deg)"
              : params.armPose === "think" ? "rotate(15deg)"
              : params.armPose === "excited" ? "rotate(40deg)"
              : params.armPose === "shy" ? "rotate(-5deg)"
              : "rotate(8deg)",
            transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            animation: params.armPose === "wave" ? `${id}_wave 0.6s ease-in-out 3` : undefined,
          }}>
            <line
              x1={cx + bodyRx - 4} y1={armY}
              x2={cx + bodyRx + 8} y2={armY + 8}
              stroke="rgba(186,209,238,0.95)" strokeWidth={2.5} strokeLinecap="round"
            />
            <circle
              cx={cx + bodyRx + 8} cy={armY + 8}
              r={2.5}
              fill="rgba(245,250,255,0.96)" stroke={shellStroke} strokeWidth={0.8}
            />
          </g>

          {/* ━━━ Feet ━━━ */}
          <ellipse cx={cx - 9} cy={bodyY + bodyRy - 1} rx={5} ry={3}
            fill="rgba(239,247,255,0.95)" stroke={shellStroke} strokeWidth={0.7} />
          <ellipse cx={cx + 9} cy={bodyY + bodyRy - 1} rx={5} ry={3}
            fill="rgba(239,247,255,0.95)" stroke={shellStroke} strokeWidth={0.7} />

          {/* ━━━ Head ━━━ */}
          <circle
            cx={headCx} cy={headCy} r={headR}
            fill={`url(#${id}_headGrad)`}
            stroke={shellStroke}
            strokeWidth={1.2}
          />

          {/* ── Head highlight (specular) ── */}
          <ellipse
            cx={headCx - 8} cy={headCy - 14}
            rx={8} ry={4}
            fill="rgba(255,255,255,0.4)"
            style={{ transform: "rotate(-20deg)", transformOrigin: `${headCx - 8}px ${headCy - 14}px` }}
          />

          {/* ━━━ Antenna ━━━ */}
          {showAntenna && (
            <g style={{
              animation: `${id}_antenna ${breathDuration * 1.3}s ease-in-out infinite`,
              transformOrigin: `${headCx}px ${antennaY + 6}px`,
            }}>
              <line
                x1={headCx} y1={antennaY + 6}
                x2={headCx + 2} y2={antennaY - 4}
                stroke="rgba(190,212,242,0.95)" strokeWidth={1.5} strokeLinecap="round"
              />
              <circle
                cx={headCx + 2} cy={antennaY - 6}
                r={2.5}
                fill={params.glowColor}
                opacity={0.6}
                style={{ animation: `${id}_antennaBall ${breathDuration * 0.7}s ease-in-out infinite` }}
              />
            </g>
          )}

          {/* ━━━ Eyes ━━━ */}
          {/* Left eye */}
          <ellipse
            cx={headCx - eyeSpacing} cy={eyeBaseY}
            rx={eyeRx} ry={blinkEyeRy}
            fill={`url(#${id}_eyeGrad)`}
            stroke={eyeStroke}
            strokeWidth={0.9}
            style={{ transition: "all 0.15s ease" }}
          />
          <ellipse
            cx={headCx - eyeSpacing} cy={eyeBaseY}
            rx={eyeRx + 1.2} ry={blinkEyeRy + 1.2}
            fill="none"
            stroke={eyeHalo}
            strokeWidth={0.5}
            opacity={isBlinking ? 0.3 : 0.85}
            style={{ transition: "all 0.15s ease" }}
          />
          {/* Left pupil */}
          {!isBlinking && (
            <circle
              cx={headCx - eyeSpacing} cy={pupilY}
              r={pupilR}
              fill="rgba(24,29,52,0.94)"
              style={{ transition: "all 0.2s ease" }}
            />
          )}
          {/* Left highlight (キラキラ) */}
          {!isBlinking && (
            <>
              <circle
                cx={headCx - eyeSpacing - 1.5} cy={pupilY - 1.8}
                r={hlSize}
                fill="#fff"
                opacity={0.9}
              />
              <circle
                cx={headCx - eyeSpacing + 1.2} cy={pupilY + 1}
                r={hlSize * 0.5}
                fill="#fff"
                opacity={0.5}
              />
            </>
          )}

          {/* Right eye */}
          <ellipse
            cx={headCx + eyeSpacing} cy={eyeBaseY}
            rx={eyeRx} ry={blinkEyeRy}
            fill={`url(#${id}_eyeGrad)`}
            stroke={eyeStroke}
            strokeWidth={0.9}
            style={{ transition: "all 0.15s ease" }}
          />
          <ellipse
            cx={headCx + eyeSpacing} cy={eyeBaseY}
            rx={eyeRx + 1.2} ry={blinkEyeRy + 1.2}
            fill="none"
            stroke={eyeHalo}
            strokeWidth={0.5}
            opacity={isBlinking ? 0.3 : 0.85}
            style={{ transition: "all 0.15s ease" }}
          />
          {/* Right pupil */}
          {!isBlinking && (
            <circle
              cx={headCx + eyeSpacing} cy={pupilY}
              r={pupilR}
              fill="rgba(24,29,52,0.94)"
              style={{ transition: "all 0.2s ease" }}
            />
          )}
          {/* Right highlight (キラキラ) */}
          {!isBlinking && (
            <>
              <circle
                cx={headCx + eyeSpacing - 1.5} cy={pupilY - 1.8}
                r={hlSize}
                fill="#fff"
                opacity={0.9}
              />
              <circle
                cx={headCx + eyeSpacing + 1.2} cy={pupilY + 1}
                r={hlSize * 0.5}
                fill="#fff"
                opacity={0.5}
              />
            </>
          )}

          {/* ━━━ Blush ━━━ */}
          <ellipse
            cx={headCx - cheekSpacing} cy={cheekY}
            rx={4.5} ry={2.5}
            fill="#FF6B9D"
            opacity={params.blushOpacity}
            style={{ transition: "opacity 0.5s ease" }}
          />
          <ellipse
            cx={headCx + cheekSpacing} cy={cheekY}
            rx={4.5} ry={2.5}
            fill="#FF6B9D"
            opacity={params.blushOpacity}
            style={{ transition: "opacity 0.5s ease" }}
          />

          {/* ── Cheek marks (stage 2+) ── */}
          {showCheekMarks && (
            <>
              <line x1={headCx - cheekSpacing - 2} y1={cheekY - 0.5} x2={headCx - cheekSpacing + 2} y2={cheekY - 0.5}
                stroke="#FF6B9D" strokeWidth={0.4} opacity={0.3} strokeLinecap="round" />
              <line x1={headCx - cheekSpacing - 1.5} y1={cheekY + 1} x2={headCx - cheekSpacing + 1.5} y2={cheekY + 1}
                stroke="#FF6B9D" strokeWidth={0.4} opacity={0.2} strokeLinecap="round" />
              <line x1={headCx + cheekSpacing - 2} y1={cheekY - 0.5} x2={headCx + cheekSpacing + 2} y2={cheekY - 0.5}
                stroke="#FF6B9D" strokeWidth={0.4} opacity={0.3} strokeLinecap="round" />
              <line x1={headCx + cheekSpacing - 1.5} y1={cheekY + 1} x2={headCx + cheekSpacing + 1.5} y2={cheekY + 1}
                stroke="#FF6B9D" strokeWidth={0.4} opacity={0.2} strokeLinecap="round" />
            </>
          )}

          {/* ━━━ Mouth ━━━ */}
          <MouthShape
            type={params.mouthType}
            scale={params.mouthScale}
            cx={headCx}
            cy={mouthY}
            stroke={facialLine}
          />

          {/* ── Star accessory (stage 4+) ── */}
          {showStarAccessory && (
            <g style={{
              animation: `${id}_sparkle 2s ease-in-out infinite`,
              transformOrigin: `${headCx + headR - 4}px ${headCy - headR + 6}px`,
            }}>
              <text
                x={headCx + headR - 4} y={headCy - headR + 8}
                fontSize={6} textAnchor="middle"
                fill={params.glowColor} opacity={0.7}
              >✦</text>
            </g>
          )}

          {/* ── Stage rings ── */}
          {stage >= 3 && (
            <circle
              cx={headCx} cy={headCy} r={headR + 4}
              fill="none"
              stroke={withAlpha(params.glowColor, 0.18)}
              strokeWidth={0.55}
              strokeDasharray="2 5"
              style={{ animation: `${id}_ring 8s linear infinite` }}
            />
          )}
          {stage >= 5 && (
            <circle
              cx={headCx} cy={headCy} r={headR + 8}
              fill="none"
              stroke={withAlpha(params.glowColor, 0.12)}
              strokeWidth={0.45}
              strokeDasharray="1.5 7"
              style={{ animation: `${id}_ring 12s linear infinite reverse` }}
            />
          )}
        </g>
      </svg>

      <style>{`
        @keyframes ${id}_breathe {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-2px) scale(1.02); }
        }
        @keyframes ${id}_glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes ${id}_shadow {
          0%, 100% { transform: scaleX(1); opacity: 0.15; }
          50% { transform: scaleX(0.9); opacity: 0.1; }
        }
        @keyframes ${id}_antenna {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(3deg); }
          75% { transform: rotate(-3deg); }
        }
        @keyframes ${id}_antennaBall {
          0%, 100% { opacity: 0.6; r: 2.5; }
          50% { opacity: 0.9; r: 3; }
        }
        @keyframes ${id}_wave {
          0%, 100% { transform: rotate(30deg); }
          50% { transform: rotate(50deg); }
        }
        @keyframes ${id}_sparkle {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes ${id}_ring {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
