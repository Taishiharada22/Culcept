"use client";

// components/origin/v6/JapanLifeMap.tsx
// Japan-map-based life roadmap.
// Main road winds through chapters placed on a Japan silhouette.
// Theme branches radiate from each chapter as meaningful sub-roads.
// Supports pinch-zoom and pan.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import mapLayout from "@/public/life-map/map-layout.json";
import type {
  ThemeType,
  ChapterProgress,
  BranchAnswer,
  RoadmapSave,
  ChapterDef,
} from "@/lib/origin/v6/types";
import { THEMES, THEME_META } from "@/lib/origin/v6/types";
import { DEFAULT_CHAPTERS } from "@/lib/origin/v6/chapters";
import { getNextQuestion } from "@/lib/origin/v6/questions";
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  generateMainRoadPath,
  type RoadNode,
  type BranchLayoutItem,
} from "@/lib/origin/v6/japanMapData";
import {
  loadRoadmapData,
  saveRoadmapData,
  createInitialData,
  getChapterProgress,
  addBranchAnswer,
  recomputeUnlocks,
  countBranchAnswers,
} from "@/lib/origin/v6/store";
import CloudLayer from "@/components/life-map/CloudLayer";
import NodeIconLayer, { type NodeIconItem } from "@/components/life-map/NodeIconLayer";
import BranchThemeBadge, { type BranchThemeBadgeItem } from "@/components/life-map/BranchThemeBadge";
import MapOrnaments from "@/components/life-map/MapOrnaments";
import SeaLayer from "@/components/life-map/SeaLayer";
import ThemeLensLayer from "@/components/life-map/ThemeLensLayer";
import CloudCurtainLayer from "@/components/life-map/CloudCurtainLayer";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const NODE_RADIUS = 34;
const ZOOM_MIN = Number(mapLayout.viewportHints?.minZoom ?? 0.48);
const ZOOM_MAX = Number(mapLayout.viewportHints?.maxZoom ?? 2.2);
const ZOOM_STEP = 0.12;
const FIT_ZOOM_MIN = 0.6;
const FIT_ZOOM_MAX = 1.6;
const INTERACTIVE_SELECTOR = '[data-map-interactive="true"]';
const VIEWPORT_HINT_ZOOM = Number(mapLayout.viewportHints?.initialZoom ?? 0.72);

type LayoutNode = {
  chapter: number;
  type: string;
  x: number;
  y: number;
};

const LAYOUT_WIDTH = Number(mapLayout.canvas?.width ?? MAP_WIDTH);
const LAYOUT_HEIGHT = Number(mapLayout.canvas?.height ?? MAP_HEIGHT);
const LAYOUT_NODES: LayoutNode[] = [...(mapLayout.nodes ?? [])]
  .sort((a, b) => a.chapter - b.chapter)
  .map((n) => ({
    chapter: Number(n.chapter),
    type: String(n.type),
    x: Number(n.x),
    y: Number(n.y),
  }));

function interpolatePolyline(points: Array<{ x: number; y: number }>, t: number) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const clampedT = clamp(t, 0, 1);

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(len);
    total += len;
  }
  if (total <= 0) return points[0];

  const target = clampedT * total;
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const seg = lengths[i];
    if (acc + seg >= target) {
      const localT = seg > 0 ? (target - acc) / seg : 0;
      const a = points[i];
      const b = points[i + 1];
      return {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

function projectChaptersToLayout(chapters: ChapterDef[]): ChapterDef[] {
  if (LAYOUT_NODES.length < 2 || chapters.length === 0) return chapters;

  const scaleX = MAP_WIDTH / LAYOUT_WIDTH;
  const scaleY = MAP_HEIGHT / LAYOUT_HEIGHT;
  const points = LAYOUT_NODES.map((n) => ({ x: n.x * scaleX, y: n.y * scaleY }));

  return chapters.map((chapter, i) => {
    const t = chapters.length > 1 ? i / (chapters.length - 1) : 0;
    const p = interpolatePolyline(points, t);
    return {
      ...chapter,
      mapX: Math.round(p.x),
      mapY: Math.round(p.y),
    };
  });
}

function resolveLayoutNodeType(chapterOrder: number, chapterCount: number): string {
  if (LAYOUT_NODES.length === 0 || chapterCount <= 1) return "";
  const idx = Math.round((chapterOrder / (chapterCount - 1)) * (LAYOUT_NODES.length - 1));
  return LAYOUT_NODES[clamp(idx, 0, LAYOUT_NODES.length - 1)]?.type ?? "";
}

function resolveChapterSpriteId(nodeType: string | undefined, chapterId: string, isCurrent: boolean, isLocked: boolean): string {
  if (isLocked) return "node-locked";
  if (isCurrent) return "node-current";

  const key = `${nodeType ?? chapterId}`.toLowerCase();
  if (key.includes("birth")) return "node-birth";
  if (key.includes("child")) return "node-childhood";
  if (
    key.includes("school") ||
    key.includes("elementary") ||
    key.includes("middle") ||
    key.includes("high")
  ) {
    return "node-school";
  }
  if (key.includes("study") || key.includes("higher") || key.includes("university")) {
    return "node-study";
  }
  if (key.includes("turning") || key.includes("crossroad")) return "node-turning";
  if (key.includes("current") || key.includes("present")) return "node-current";
  if (key.includes("work") || key.includes("career") || key.includes("job")) return "node-work";
  return "node-work";
}

function resolveBranchAssetTheme(theme: ThemeType): "emotion" | "relationship" | "work" | "challenge" {
  if (theme === "emotion") return "emotion";
  if (theme === "relationship") return "relationship";
  if (theme === "work") return "work";
  if (theme === "challenge") return "challenge";
  return "emotion";
}

type ChapterBranchLayer = {
  clusterX: number;
  clusterY: number;
  clusterRadius: number;
  layouts: BranchLayoutItem[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isInteractivePointerTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

function computeChapterBranchLayer(chapter: ChapterDef, chapterIndex: number): ChapterBranchLayer {
  const rhythmSide = chapterIndex % 2 === 0 ? 1 : -1;
  const side =
    chapter.mapX > MAP_WIDTH * 0.74
      ? -1
      : chapter.mapX < MAP_WIDTH * 0.26
        ? 1
        : rhythmSide;
  const verticalOffset =
    chapterIndex % 4 === 0
      ? -98
      : chapterIndex % 4 === 1
        ? -20
        : chapterIndex % 4 === 2
          ? 34
          : 96;
  const clusterX = clamp(chapter.mapX + side * 242, 120, MAP_WIDTH - 120);
  const clusterY = clamp(chapter.mapY + verticalOffset, 104, MAP_HEIGHT - 104);
  const clusterRadius = 92;
  const toNodeAngle = Math.atan2(chapter.mapY - clusterY, chapter.mapX - clusterX);
  const startAngle = toNodeAngle - 1.18;
  const endAngle = toNodeAngle + 1.18;

  const layouts: BranchLayoutItem[] = THEMES.map((theme, i) => {
    const t = THEMES.length > 1 ? i / (THEMES.length - 1) : 0.5;
    const angle = startAngle + (endAngle - startAngle) * t;
    const endX = clusterX + Math.cos(angle) * clusterRadius;
    const endY = clusterY + Math.sin(angle) * clusterRadius;

    const bend = (i - (THEMES.length - 1) / 2) * 5.5;
    const normal = angle + Math.PI / 2;
    const ctrl1X = chapter.mapX + (clusterX - chapter.mapX) * 0.42 + Math.cos(normal) * bend;
    const ctrl1Y = chapter.mapY + (clusterY - chapter.mapY) * 0.42 + Math.sin(normal) * bend;
    const ctrl2X =
      clusterX + Math.cos(angle) * clusterRadius * 0.45 + Math.cos(normal) * (bend * 0.55);
    const ctrl2Y =
      clusterY + Math.sin(angle) * clusterRadius * 0.45 + Math.sin(normal) * (bend * 0.55);

    const path = `M ${chapter.mapX},${chapter.mapY} C ${Math.round(ctrl1X)},${Math.round(ctrl1Y)} ${Math.round(ctrl2X)},${Math.round(ctrl2Y)} ${Math.round(endX)},${Math.round(endY)}`;

    const subNodes = [0, 1].map((depth) => {
      const ratio = depth === 0 ? 0.46 : 0.72;
      const swing = depth === 0 ? bend * 0.26 : bend * 0.14;
      return {
        x: Math.round(chapter.mapX + (endX - chapter.mapX) * ratio + Math.cos(normal) * swing),
        y: Math.round(chapter.mapY + (endY - chapter.mapY) * ratio + Math.sin(normal) * swing),
        depth,
      };
    });

    return {
      theme,
      path,
      endX: Math.round(endX),
      endY: Math.round(endY),
      subNodes,
      angle,
    };
  });

  return { clusterX, clusterY, clusterRadius, layouts };
}

/* ═══════════════════════════════════════════
   SVG DEFS
   ═══════════════════════════════════════════ */

function SvgDefs() {
  return (
    <defs>
      <linearGradient id="paper-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e4d5ba" />
        <stop offset="42%" stopColor="#d4c1a1" />
        <stop offset="100%" stopColor="#c6b08f" />
      </linearGradient>
      <radialGradient id="paper-vignette" cx="50%" cy="44%" r="72%">
        <stop offset="0%" stopColor="rgba(255,250,236,0)" />
        <stop offset="100%" stopColor="rgba(84,58,30,0.3)" />
      </radialGradient>
      <linearGradient id="sea-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(114,152,166,0.34)" />
        <stop offset="45%" stopColor="rgba(87,130,145,0.26)" />
        <stop offset="100%" stopColor="rgba(69,109,126,0.22)" />
      </linearGradient>
      <linearGradient id="land-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#d6be90" />
        <stop offset="48%" stopColor="#b89668" />
        <stop offset="100%" stopColor="#8f6f49" />
      </linearGradient>
      <radialGradient id="land-shade" cx="44%" cy="30%" r="78%">
        <stop offset="0%" stopColor="rgba(255,240,198,0.38)" />
        <stop offset="62%" stopColor="rgba(188,151,98,0.16)" />
        <stop offset="100%" stopColor="rgba(74,52,30,0.18)" />
      </radialGradient>
      <linearGradient id="coast-highlight" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="rgba(254,240,202,0.84)" />
        <stop offset="100%" stopColor="rgba(162,124,74,0.48)" />
      </linearGradient>
      <filter id="paper-noise" x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.88"
          numOctaves={2}
          seed={7}
          stitchTiles="stitch"
          result="noise"
        />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.92 0 0 0 0 0.86 0 0 0 0 0.74 0 0 0 0.14 0"
        />
      </filter>
      <pattern id="paper-fiber" width="64" height="64" patternUnits="userSpaceOnUse">
        <path d="M 0 16 Q 14 11 28 16 T 56 16" fill="none" stroke="rgba(120,92,58,0.08)" strokeWidth="0.8" />
        <path d="M 8 40 Q 24 35 40 40 T 72 40" fill="none" stroke="rgba(112,88,56,0.07)" strokeWidth="0.6" />
      </pattern>
      {/* Road styles */}
      <linearGradient id="main-road-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e8c860" />
        <stop offset="32%" stopColor="#d4a840" />
        <stop offset="68%" stopColor="#c09030" />
        <stop offset="100%" stopColor="#a08020" />
      </linearGradient>
      <linearGradient id="locked-road-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="rgba(120,98,72,0.28)" />
        <stop offset="100%" stopColor="rgba(120,98,72,0.12)" />
      </linearGradient>
      <filter id="road-shadow" x="-10%" y="-5%" width="120%" height="115%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#5a3d1c" floodOpacity="0.46" />
      </filter>

      {/* Medal + inset styles */}
      <radialGradient id="node-medal-fill" cx="35%" cy="25%" r="75%">
        <stop offset="0%" stopColor="#fff9d9" />
        <stop offset="55%" stopColor="#f3de95" />
        <stop offset="100%" stopColor="#c3954d" />
      </radialGradient>
      <linearGradient id="node-medal-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f0d187" />
        <stop offset="100%" stopColor="#9e6f35" />
      </linearGradient>
      <linearGradient id="inset-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(252,244,220,0.78)" />
        <stop offset="100%" stopColor="rgba(232,216,184,0.6)" />
      </linearGradient>
      <filter id="medal-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#4a3214" floodOpacity="0.35" />
      </filter>
      <filter id="inset-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#3f2e1a" floodOpacity="0.24" />
      </filter>

      {/* Fog blur */}
      <filter id="fog-blur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="18" />
      </filter>

      {/* Branch glow */}
      <filter id="branch-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Current location pulse */}
      <radialGradient id="current-pulse" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f8cd62" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#f8cd62" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/* ═══════════════════════════════════════════
   LAND / TERRAIN LAYERS
   ═══════════════════════════════════════════ */

function JapanLand() {
  return (
    <image
      href="/life-map/japan-base-land.png"
      x={0}
      y={0}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      preserveAspectRatio="none"
      opacity={0.98}
    />
  );
}

/* ═══════════════════════════════════════════
   MAIN ROAD — the life's main route
   ═══════════════════════════════════════════ */

function MainRoad({
  path,
  unlockedLength,
  totalLength,
}: {
  path: string;
  unlockedLength: number;
  totalLength: number;
}) {
  // Proportion of unlocked road
  const pct = totalLength > 0 ? unlockedLength / totalLength : 0;
  const clampedPct = Math.max(0, Math.min(1, pct));

  return (
    <g>
      <image
        href="/life-map/main-road-path.png"
        x={0}
        y={0}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        opacity={0.3}
        preserveAspectRatio="none"
      />

      {/* Full corridor (future + explored) */}
      <path
        d={path}
        fill="none"
        stroke="rgba(82,58,32,0.3)"
        strokeWidth={44}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="16 13"
      />

      {/* Locked section */}
      <path
        d={path}
        fill="none"
        stroke="url(#locked-road-grad)"
        strokeWidth={33}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={`${Math.max(0, 1 - clampedPct)} 1`}
        strokeDashoffset={`-${clampedPct}`}
      />

      {/* Unlocked road */}
      <motion.path
        d={path}
        fill="none"
        stroke="rgba(63,41,21,0.5)"
        strokeWidth={46}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        initial={false}
        animate={{ strokeDasharray: `${clampedPct} 1` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ mixBlendMode: "multiply" }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke="url(#main-road-grad)"
        strokeWidth={32}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
        pathLength={1}
        initial={false}
        animate={{ strokeDasharray: `${clampedPct} 1` }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />

      {/* Center line (only unlocked) */}
      <motion.path
        d={path}
        fill="none"
        stroke="rgba(255,247,212,0.88)"
        strokeWidth={4.2}
        strokeDasharray="12 14"
        strokeLinecap="round"
        pathLength={1}
        initial={false}
        animate={{ strokeDasharray: `${clampedPct} 1` }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      <path
        d={path}
        fill="none"
        stroke="rgba(255,231,166,0.52)"
        strokeWidth={6}
        strokeDasharray="10 22"
        strokeLinecap="round"
        opacity={0.55}
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-80"
          dur="15s"
          repeatCount="indefinite"
        />
      </path>
    </g>
  );
}

/* ═══════════════════════════════════════════
   CHAPTER NODE
   ═══════════════════════════════════════════ */

function ChapterNode({
  chapter,
  nodeType,
  progress,
  isCurrentPos,
  isSelected,
  isHovered,
  showLabel,
  onHoverChange,
  onTap,
}: {
  chapter: ChapterDef;
  nodeType: string;
  progress: ChapterProgress;
  isCurrentPos: boolean;
  isSelected: boolean;
  isHovered: boolean;
  showLabel: boolean;
  onHoverChange: (hovered: boolean) => void;
  onTap: () => void;
}) {
  const status = progress.status;
  const answered = countBranchAnswers(progress);
  const isLocked = status === "locked";
  const isComplete = status === "complete";
  const isActive = status === "available" || status === "in_progress";
  const spriteId = resolveChapterSpriteId(nodeType, chapter.id, isCurrentPos, isLocked);
  const emphasized = isCurrentPos || isSelected || isHovered;
  const ringOpacity = emphasized ? (isLocked ? 0.35 : 0.7) : 0.3;
  const plaqueY = chapter.mapY + NODE_RADIUS + 14;

  return (
    <g
      data-map-interactive="true"
      style={{ cursor: isLocked ? "default" : "pointer" }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onClick={
        !isLocked
          ? (e) => {
              e.stopPropagation();
              onTap();
            }
          : undefined
      }
    >
      {!isLocked && (
        <circle
          cx={chapter.mapX}
          cy={chapter.mapY}
          r={NODE_RADIUS + 28}
          fill="rgba(0,0,0,0.001)"
        />
      )}

      {/* Current position beacon */}
      {isCurrentPos && (
        <>
          <circle
            cx={chapter.mapX}
            cy={chapter.mapY}
            r={NODE_RADIUS + 18}
            fill="url(#current-pulse)"
          >
            <animate
              attributeName="r"
              values={`${NODE_RADIUS + 14};${NODE_RADIUS + 24};${NODE_RADIUS + 14}`}
              dur="2.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;0.3;0.8"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </circle>
          {/* "現在地" label */}
          <text
            x={chapter.mapX}
            y={chapter.mapY - NODE_RADIUS - 14}
            textAnchor="middle"
            fontSize="9"
            fontWeight="bold"
            fill="#C08030"
            opacity={0.8}
          >
            現在地
          </text>
        </>
      )}

      {/* Medal ring */}
      <circle
        cx={chapter.mapX}
        cy={chapter.mapY}
        r={NODE_RADIUS + 9}
        fill="rgba(92,64,32,0.2)"
        filter="url(#medal-shadow)"
        opacity={ringOpacity * 0.56}
      />
      <circle
        cx={chapter.mapX}
        cy={chapter.mapY}
        r={NODE_RADIUS + 4}
        fill="url(#node-medal-fill)"
        stroke="url(#node-medal-ring)"
        strokeWidth={4}
        opacity={ringOpacity * 0.85}
      />
      <circle
        cx={chapter.mapX}
        cy={chapter.mapY}
        r={NODE_RADIUS - 8}
        fill={isLocked ? "rgba(244,236,214,0.75)" : "#ffffff"}
        stroke="rgba(124,92,58,0.55)"
        strokeWidth={3}
        opacity={emphasized ? 0.95 : 0.85}
      />

      {/* Active halo */}
      {(emphasized || isCurrentPos) && !isLocked && (
        <circle
          cx={chapter.mapX}
          cy={chapter.mapY}
          r={NODE_RADIUS + 16}
          fill="none"
          stroke="rgba(255,220,132,0.28)"
          strokeWidth={2.2}
        >
          <animate attributeName="r" values={`${NODE_RADIUS + 14};${NODE_RADIUS + 19};${NODE_RADIUS + 14}`} dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.28;0.1;0.28" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Lock veil */}
      {isLocked && (
        <circle
          cx={chapter.mapX}
          cy={chapter.mapY}
          r={NODE_RADIUS + 5}
          fill="rgba(214,204,184,0.58)"
        />
      )}

      <g style={{ pointerEvents: "none" }} opacity={isLocked ? 0.48 : emphasized ? 0.96 : 0.9}>
        <use
          href={`/life-map/chapter-nodes.svg#${spriteId}`}
          xlinkHref={`/life-map/chapter-nodes.svg#${spriteId}`}
          x={chapter.mapX - (NODE_RADIUS + 12)}
          y={chapter.mapY - (NODE_RADIUS + 12)}
          width={(NODE_RADIUS + 12) * 2}
          height={(NODE_RADIUS + 12) * 2}
        />
      </g>

      {/* Node caption plaque */}
      {showLabel && (
        <g opacity={isLocked ? 0.42 : 1}>
          <rect
            x={chapter.mapX - 82}
            y={plaqueY}
            width={164}
            height={40}
            rx={20}
            fill="rgba(248,240,219,0.97)"
            stroke="rgba(148,116,78,0.55)"
            strokeWidth={2}
          />
          <text
            x={chapter.mapX}
            y={plaqueY + 15}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="rgba(72,50,28,0.88)"
          >
            {chapter.label}
          </text>
          <text
            x={chapter.mapX}
            y={plaqueY + 30}
            textAnchor="middle"
            fontSize="10"
            letterSpacing="1.1"
            fill="rgba(114,88,56,0.74)"
          >
            {chapter.ageHint}
          </text>
        </g>
      )}

      {/* Theme progress */}
      {showLabel && !isLocked && (
        <text
          x={chapter.mapX}
          y={plaqueY + 52}
          textAnchor="middle"
          fontSize="10.5"
          fill="rgba(94,72,45,0.7)"
        >
          テーマ {answered}/{THEMES.length}
        </text>
      )}

      {/* Completion badge */}
      {(isComplete && showLabel) && (
        <g>
          <circle
            cx={chapter.mapX + NODE_RADIUS + 6}
            cy={chapter.mapY - NODE_RADIUS - 2}
            r={12}
            fill="#bc8e43"
            stroke="rgba(255,242,208,0.9)"
            strokeWidth={2}
          />
          <text
            x={chapter.mapX + NODE_RADIUS + 6}
            y={chapter.mapY - NODE_RADIUS - 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="12"
            fill="white"
          >
            ✓
          </text>
        </g>
      )}

      {/* Active chapter marker */}
      {showLabel && isActive && !isLocked && (
        <text
          x={chapter.mapX}
          y={chapter.mapY - NODE_RADIUS - 20}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="rgba(188,122,42,0.86)"
          letterSpacing="1.2"
        >
          MAIN
        </text>
      )}

      {/* Lock icon */}
      {showLabel && isLocked && (
        <text
          x={chapter.mapX}
          y={chapter.mapY + NODE_RADIUS + 50}
          textAnchor="middle"
          fontSize="16"
          fill="rgba(118,95,70,0.6)"
        >
          🔒
        </text>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════
   THEME BRANCH
   ═══════════════════════════════════════════ */

function ThemeBranch({
  chapterId,
  originX,
  originY,
  layout,
  zoom,
  strength,
  answered,
  isSelected,
  isActive,
  isHovered,
  showLabel,
  hasFollowUp,
  onHoverChange,
  onTap,
}: {
  chapterId: string;
  originX: number;
  originY: number;
  layout: BranchLayoutItem;
  zoom: number;
  strength: number;
  answered: boolean;
  isSelected: boolean;
  isActive: boolean;
  isHovered: boolean;
  showLabel: boolean;
  hasFollowUp: boolean;
  onHoverChange: (hovered: boolean) => void;
  onTap: () => void;
}) {
  const meta = THEME_META[layout.theme as ThemeType];
  if (!meta) return null;

  const themeAsset = resolveBranchAssetTheme(layout.theme as ThemeType);
  const isTurningPriority =
    themeAsset === "challenge" &&
    (chapterId === "turning_point" || chapterId === "crossroads");
  const shouldThick = zoom >= 1.2 || isActive || isSelected || isTurningPriority;
  const shouldDense =
    isSelected ||
    isTurningPriority ||
    (themeAsset === "relationship" ? strength >= 2 : strength >= 3);
  const weight = shouldThick ? "thick" : "thin";
  const density = shouldDense ? "dense" : "sparse";
  const branchAssetHref = `/life-map/branches/branch-${themeAsset}-${weight}-${density}.svg`;
  const branchLength = Math.max(12, Math.hypot(layout.endX - originX, layout.endY - originY));
  const branchAngle = (Math.atan2(layout.endY - originY, layout.endX - originX) * 180) / Math.PI;
  const branchAssetHeight = shouldThick ? (shouldDense ? 30 : 24) : shouldDense ? 22 : 16;

  const strokeW = answered ? 2.6 + Math.min(strength, 3) * 0.6 : 1.8;
  const labelX = layout.endX + Math.cos(layout.angle) * 16;
  const labelY = layout.endY + Math.sin(layout.angle) * 16 + 4;

  return (
    <g
      data-map-interactive="true"
      style={{ cursor: "pointer" }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
    >
      <path
        d={layout.path}
        fill="none"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={18}
        strokeLinecap="round"
      />
      <circle cx={layout.endX} cy={layout.endY} r={18} fill="rgba(0,0,0,0.001)" />
      <image
        href={branchAssetHref}
        x={originX}
        y={originY - branchAssetHeight / 2}
        width={branchLength}
        height={branchAssetHeight}
        opacity={answered ? 0.88 : 0.58}
        preserveAspectRatio="none"
        transform={`rotate(${branchAngle} ${originX} ${originY})`}
        style={{ pointerEvents: "none" }}
      />

      <path
        d={layout.path}
        fill="none"
        stroke={answered ? meta.color : "rgba(132,108,76,0.35)"}
        strokeWidth={strokeW}
        strokeDasharray={answered ? "none" : "4 4"}
        strokeLinecap="round"
        filter={answered ? "url(#branch-glow)" : undefined}
      />

      {answered &&
        layout.subNodes
          .filter((sn) => sn.depth < strength)
          .map((sn, si) => (
            <circle
              key={si}
              cx={sn.x}
              cy={sn.y}
              r={4}
              fill="rgba(255,251,237,0.9)"
              stroke={meta.color}
              strokeWidth={1.4}
            />
          ))}

      {answered && hasFollowUp && (
        <circle cx={layout.endX} cy={layout.endY} r={5} fill={meta.color} opacity={0.35}>
          <animate
            attributeName="r"
            values="4;8;4"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      <circle
        cx={layout.endX}
        cy={layout.endY}
        r={answered ? 10 : 8}
        fill={answered ? "rgba(255,252,241,0.95)" : "rgba(236,226,205,0.85)"}
        stroke={answered ? meta.color : "rgba(164,142,112,0.65)"}
        strokeWidth={2}
      />

      <text
        x={layout.endX}
        y={layout.endY + 0.8}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={answered ? "10" : "8"}
        fill={answered ? meta.color : "rgba(128,108,82,0.65)"}
      >
        {answered ? meta.icon : "?"}
      </text>

      {answered && strength > 1 && (
        <g>
          <circle
            cx={layout.endX + 9}
            cy={layout.endY - 10}
            r={7}
            fill="rgba(196,143,66,0.9)"
          />
          <text
            x={layout.endX + 9}
            y={layout.endY - 9}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="8.5"
            fontWeight="700"
            fill="white"
          >
            {strength}
          </text>
        </g>
      )}

      {!answered && (
        <circle
          cx={layout.endX}
          cy={layout.endY}
          r={8}
          fill="none"
          stroke="rgba(180,160,130,0.34)"
          strokeWidth={1}
        >
          <animate
            attributeName="r"
            values="8;12;8"
            dur="3s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.3;0;0.3"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {showLabel && (
        <text
          x={labelX}
          y={labelY}
          textAnchor={Math.cos(layout.angle) >= 0 ? "start" : "end"}
          fontSize="11"
          fontWeight="600"
          fill={
            isSelected || isHovered
              ? answered
                ? "rgba(70,52,30,0.86)"
                : "rgba(92,72,50,0.62)"
              : answered
                ? "rgba(70,52,30,0.82)"
                : "rgba(92,72,50,0.55)"
          }
        >
          {meta.label}
        </text>
      )}
    </g>
  );
}

function ThemeInsetFrame({
  chapter,
  layer,
  unlocked,
  emphasized,
  showLabel,
}: {
  chapter: ChapterDef;
  layer: ChapterBranchLayer;
  unlocked: boolean;
  emphasized: boolean;
  showLabel: boolean;
}) {
  const frameOpacity = emphasized ? (unlocked ? 0.58 : 0.28) : 0.05;
  return (
    <g opacity={frameOpacity}>
      <path
        d={`M ${chapter.mapX},${chapter.mapY} Q ${Math.round((chapter.mapX + layer.clusterX) / 2)} ${Math.round((chapter.mapY + layer.clusterY) / 2)} ${layer.clusterX},${layer.clusterY}`}
        fill="none"
        stroke={unlocked ? "rgba(143,112,72,0.6)" : "rgba(130,102,72,0.34)"}
        strokeWidth={unlocked ? 2 : 1.2}
        strokeDasharray={unlocked ? undefined : "4 6"}
      />
      <circle
        cx={layer.clusterX}
        cy={layer.clusterY}
        r={layer.clusterRadius + 20}
        fill={unlocked ? "rgba(244,232,206,0.26)" : "rgba(232,220,194,0.2)"}
      />
      <circle
        cx={layer.clusterX}
        cy={layer.clusterY}
        r={layer.clusterRadius + 12}
        fill="url(#inset-grad)"
        stroke={unlocked ? "rgba(143,112,72,0.5)" : "rgba(140,112,82,0.36)"}
        strokeWidth={unlocked ? 2 : 1.2}
        filter="url(#inset-shadow)"
      />
      {showLabel && emphasized && (
        <text
          x={layer.clusterX}
          y={layer.clusterY - layer.clusterRadius - 16}
          textAnchor="middle"
          fontSize="12"
          letterSpacing="1.2"
          fill={unlocked ? "rgba(92,68,40,0.62)" : "rgba(92,72,52,0.42)"}
        >
          {chapter.label} テーマ
        </text>
      )}
    </g>
  );
}

function BranchBackdropLayer({
  layer,
  progress,
}: {
  layer: ChapterBranchLayer;
  progress: ChapterProgress;
}) {
  const backdropOpacity = progress.status === "locked" ? 0.12 : 0.26;
  return (
    <g opacity={backdropOpacity}>
      {layer.layouts.map((layout) => {
        const theme = layout.theme as ThemeType;
        const meta = THEME_META[theme];
        if (!meta) return null;
        const answers = progress.branches[theme] ?? [];
        const answered = answers.length > 0;
        const hasDepth = answers.length > 1;
        return (
          <g key={`backdrop-${theme}`}>
            <path
              d={layout.path}
              fill="none"
              stroke={answered ? meta.color : "rgba(128,102,70,0.54)"}
              strokeWidth={answered ? 2.2 : 1.4}
              strokeDasharray={answered ? "none" : "4 6"}
              strokeLinecap="round"
              opacity={answered ? 0.56 : 0.28}
            />
            {layout.subNodes.map((sn, idx) => (
              <circle
                key={`${theme}-ghost-${idx}`}
                cx={sn.x}
                cy={sn.y}
                r={hasDepth && idx < answers.length ? 2.8 : 2.2}
                fill={answered ? meta.color : "rgba(150,126,94,0.58)"}
                opacity={hasDepth && idx < answers.length ? 0.44 : 0.2}
              />
            ))}
            <circle
              cx={layout.endX}
              cy={layout.endY}
              r={answered ? 5.2 : 4.6}
              fill={answered ? meta.color : "rgba(154,126,88,0.66)"}
              opacity={answered ? 0.5 : 0.24}
            />
          </g>
        );
      })}
    </g>
  );
}

/* ═══════════════════════════════════════════
   FOG — over locked areas
   ═══════════════════════════════════════════ */

function FogOverlay({ chapter }: { chapter: ChapterDef }) {
  return (
    <g>
      <g>
        <image
          href="/life-map/fog-mask.svg"
          x={chapter.mapX - 118}
          y={chapter.mapY - 124}
          width={236}
          height={236}
          opacity={0.42}
          preserveAspectRatio="xMidYMid meet"
        />
        <animateTransform
          attributeName="transform"
          type="translate"
          values={`0 0; 8 -4; 0 0`}
          dur={`${16 + chapter.order * 0.9}s`}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.22;0.34;0.22"
          dur={`${12 + chapter.order * 0.7}s`}
          repeatCount="indefinite"
        />
      </g>
      <text
        x={chapter.mapX}
        y={chapter.mapY - 8}
        textAnchor="middle"
        fontSize="18"
        fill="rgba(122,96,70,0.48)"
      >
        ???
      </text>
      <text
        x={chapter.mapX}
        y={chapter.mapY + 16}
        textAnchor="middle"
        fontSize="11"
        fill="rgba(140,120,95,0.46)"
      >
        未踏
      </text>
    </g>
  );
}

function FutureFog({ lockedChapters }: { lockedChapters: ChapterDef[] }) {
  if (lockedChapters.length === 0) return null;

  const firstLocked = lockedChapters[0];
  const anchorX = clamp(firstLocked.mapX + 210, 260, MAP_WIDTH - 120);
  const anchorY = clamp(firstLocked.mapY - 180, 90, MAP_HEIGHT - 120);

  return (
    <g>
      <g>
        <ellipse
          cx={anchorX}
          cy={anchorY}
          rx={210}
          ry={118}
          fill="rgba(255,255,255,0.12)"
          filter="url(#fog-blur)"
        />
        <ellipse
          cx={anchorX - 90}
          cy={anchorY + 46}
          rx={160}
          ry={90}
          fill="rgba(255,255,255,0.09)"
          filter="url(#fog-blur)"
        />
        <ellipse
          cx={anchorX + 74}
          cy={anchorY + 30}
          rx={128}
          ry={72}
          fill="rgba(255,255,255,0.08)"
          filter="url(#fog-blur)"
        />
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; -14 10; 0 0"
          dur="28s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.34;0.46;0.34"
          dur="18s"
          repeatCount="indefinite"
        />
      </g>
      <text
        x={anchorX + 26}
        y={anchorY + 4}
        textAnchor="middle"
        fontSize="38"
        fontWeight="700"
        letterSpacing="4"
        fill="rgba(120,95,68,0.38)"
      >
        ???
      </text>
      <text
        x={anchorX + 28}
        y={anchorY + 38}
        textAnchor="middle"
        fontSize="12"
        letterSpacing="2"
        fill="rgba(120,95,68,0.32)"
      >
        まだ続く道
      </text>
    </g>
  );
}

/* ═══════════════════════════════════════════
   ORIGIN BEACON — birthplace marker
   ═══════════════════════════════════════════ */

function OriginBeacon({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={28} fill="rgba(200,160,80,0.08)">
        <animate
          attributeName="r"
          values="24;32;24"
          dur="4s"
          repeatCount="indefinite"
        />
      </circle>
      <text
        x={x}
        y={y + NODE_RADIUS + 38}
        textAnchor="middle"
        fontSize="8"
        fontWeight="bold"
        fill="rgba(160,120,60,0.5)"
        letterSpacing="2"
      >
        はじまり
      </text>
    </g>
  );
}

function AddRecordCallout({
  chapter,
  onTap,
}: {
  chapter: ChapterDef;
  onTap: () => void;
}) {
  const isRight = chapter.mapX > MAP_WIDTH * 0.62;
  const calloutX = clamp(chapter.mapX + (isRight ? -170 : 170), 130, MAP_WIDTH - 130);
  const calloutY = clamp(chapter.mapY - 82, 90, MAP_HEIGHT - 90);
  const textX = calloutX + (isRight ? -6 : 6);

  return (
    <g
      data-map-interactive="true"
      style={{ cursor: "pointer" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
    >
      <path
        d={`M ${chapter.mapX},${chapter.mapY} Q ${Math.round((chapter.mapX + calloutX) / 2)} ${Math.round((chapter.mapY + calloutY) / 2) - 22} ${calloutX},${calloutY}`}
        fill="none"
        stroke="rgba(152,108,58,0.42)"
        strokeWidth={2}
        strokeDasharray="5 6"
      />
      <rect
        x={calloutX - 74}
        y={calloutY - 22}
        width={148}
        height={44}
        rx={22}
        fill="rgba(255,248,232,0.9)"
        stroke="rgba(159,117,68,0.58)"
        strokeWidth={1.4}
      />
      <circle cx={calloutX - 48} cy={calloutY} r={12} fill="rgba(206,151,74,0.9)" />
      <text
        x={calloutX - 48}
        y={calloutY + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="14"
        fontWeight="700"
        fill="white"
      >
        +
      </text>
      <text
        x={textX}
        y={calloutY + 1}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="central"
        fontSize="12"
        fontWeight="700"
        fill="rgba(93,65,35,0.9)"
      >
        記録を追加
      </text>
      <rect
        x={calloutX - 82}
        y={calloutY - 28}
        width={164}
        height={56}
        rx={28}
        fill="rgba(0,0,0,0.001)"
      />
    </g>
  );
}

/* ═══════════════════════════════════════════
   QUESTION SHEET — bottom sheet for answering
   ═══════════════════════════════════════════ */

function QuestionSheet({
  chapterId,
  chapterLabel,
  theme,
  answeredDepths,
  onAnswer,
  onClose,
}: {
  chapterId: string;
  chapterLabel: string;
  theme: ThemeType;
  answeredDepths: number[];
  onAnswer: (answer: BranchAnswer) => void;
  onClose: () => void;
}) {
  const meta = THEME_META[theme];
  const question = getNextQuestion(theme, answeredDepths);

  if (!question) {
    return (
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl p-6 pb-10"
        style={{
          background: "linear-gradient(180deg, #FAF5ED, #F5EDE0)",
          boxShadow: "0 -4px 30px rgba(80,60,40,0.15)",
        }}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-amber-900/20" />
        <div className="text-center">
          <div className="mb-2 text-3xl">{meta.icon}</div>
          <p className="text-lg font-bold" style={{ color: meta.color }}>
            {meta.label} 完了
          </p>
          <p className="mt-1 text-sm text-amber-900/50">
            {chapterLabel}の{meta.label}を記録しました
          </p>
          <button
            onClick={onClose}
            className="mt-5 rounded-xl px-8 py-3 font-semibold text-white"
            style={{ background: meta.color }}
          >
            地図に戻る
          </button>
        </div>
      </motion.div>
    );
  }

  const handleSelect = (optId: string, optLabel: string) => {
    onAnswer({
      questionId: question.id,
      selectedOptionId: optId,
      selectedLabel: optLabel,
      depth: question.depth,
      answeredAt: new Date().toISOString(),
    });
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] rounded-t-3xl p-6 pb-10"
      style={{
        background: "linear-gradient(180deg, #FAF5ED, #F5EDE0)",
        boxShadow: "0 -4px 30px rgba(80,60,40,0.15)",
      }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        if (info.offset.y > 100) onClose();
      }}
    >
      <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-amber-900/20" />

      <div className="mb-1 flex items-center gap-2">
        <span className="text-xl">{meta.icon}</span>
        <span className="text-sm font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="text-xs text-amber-900/40">— {chapterLabel}</span>
      </div>

      {question.depth > 0 && (
        <p className="mb-3 text-xs text-amber-900/40">深掘り質問</p>
      )}

      <p className="mb-5 text-base font-bold text-amber-950/80">{question.text}</p>

      <div className="grid grid-cols-2 gap-3">
        {question.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id, opt.label)}
            className="rounded-2xl border-2 border-amber-900/10 px-4 py-3.5 text-left transition-all active:scale-[0.97]"
            style={{ background: "rgba(255,252,245,0.8)" }}
          >
            {opt.icon && <span className="mr-1.5">{opt.icon}</span>}
            <span className="text-sm font-medium text-amber-950/75">{opt.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-4 w-full text-center text-xs text-amber-900/30"
      >
        あとで答える
      </button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   ZOOM CONTROLS
   ═══════════════════════════════════════════ */

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-20 right-3 z-30 flex flex-col gap-1.5">
      <button
        onClick={onZoomIn}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-md transition-transform active:scale-90"
        style={{ background: "rgba(245,237,224,0.95)", color: "#8B7766" }}
      >
        +
      </button>
      <button
        onClick={onReset}
        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-md transition-transform active:scale-90"
        style={{ background: "rgba(245,237,224,0.95)", color: "#8B7766" }}
      >
        ⟲
      </button>
      <button
        onClick={onZoomOut}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-md transition-transform active:scale-90"
        style={{ background: "rgba(245,237,224,0.95)", color: "#8B7766" }}
      >
        −
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PROGRESS BAR
   ═══════════════════════════════════════════ */

function ProgressBar({
  data,
  chapters,
}: {
  data: RoadmapSave;
  chapters: ChapterDef[];
}) {
  const completed = chapters.filter(
    (ch) => getChapterProgress(data, ch.id).status === "complete",
  ).length;
  const inProgress = chapters.filter((ch) => {
    const s = getChapterProgress(data, ch.id).status;
    return s === "in_progress" || s === "available";
  }).length;
  const pct = ((completed + inProgress * 0.3) / chapters.length) * 100;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-2"
      style={{ background: "rgba(245,237,224,0.95)", backdropFilter: "blur(8px)" }}
    >
      <span className="text-xs font-semibold text-amber-900/50">探索</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-amber-900/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: "linear-gradient(90deg, #D4A76A, #B8975A)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <span className="text-xs font-bold text-amber-900/60">
        {completed}/{chapters.length}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

export default function JapanLifeMap() {
  const [data, setData] = useState<RoadmapSave | null>(null);
  const [activeSheet, setActiveSheet] = useState<{
    chapterId: string;
    theme: ThemeType;
  } | null>(null);
  const [hoveredChapterId, setHoveredChapterId] = useState<string | null>(null);
  const [cloudPhase, setCloudPhase] = useState(0);
  const [hoveredBranch, setHoveredBranch] = useState<{
    chapterId: string;
    theme: ThemeType;
  } | null>(null);

  // Zoom & pan state
  const [zoom, setZoom] = useState(VIEWPORT_HINT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFittedRef = useRef(false);

  // Init
  useEffect(() => {
    let saved = loadRoadmapData();
    if (!saved) {
      saved = createInitialData(DEFAULT_CHAPTERS);
      saveRoadmapData(saved);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage
    setData(saved);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTimeSeconds((t) => t + 0.05);
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setCloudPhase(1), 300);
    const t2 = setTimeout(() => setCloudPhase(2), 800);
    const t3 = setTimeout(() => setCloudPhase(3), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const chapters = useMemo(() => projectChaptersToLayout(DEFAULT_CHAPTERS), []);

  // Compute road nodes
  const roadNodes: RoadNode[] = useMemo(
    () =>
      chapters.map((ch) => ({
        id: ch.id,
        x: ch.mapX,
        y: ch.mapY,
        order: ch.order,
      })),
    [chapters],
  );

  // Main road path
  const mainRoadPath = useMemo(() => generateMainRoadPath(roadNodes), [roadNodes]);

  // Branch inset layouts per chapter
  const branchLayouts = useMemo(() => {
    const sorted = [...chapters].sort((a, b) => a.order - b.order);
    return Object.fromEntries(sorted.map((ch, i) => [ch.id, computeChapterBranchLayer(ch, i)])) as Record<
      string,
      ChapterBranchLayer
    >;
  }, [chapters]);

  const journeyBounds = useMemo(() => {
    if (chapters.length === 0) {
      return { minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT };
    }

    let minX = Math.min(...chapters.map((ch) => ch.mapX));
    let minY = Math.min(...chapters.map((ch) => ch.mapY));
    let maxX = Math.max(...chapters.map((ch) => ch.mapX));
    let maxY = Math.max(...chapters.map((ch) => ch.mapY));

    if (data) {
      const currentId =
        chapters.find((ch) => {
          const p = getChapterProgress(data, ch.id);
          return p.status === "available" || p.status === "in_progress";
        })?.id ?? chapters[chapters.length - 1]?.id;
      const current = chapters.find((ch) => ch.id === currentId);
      if (current) {
        minX = Math.min(minX, current.mapX - 72);
        minY = Math.min(minY, current.mapY - 88);
        maxX = Math.max(maxX, current.mapX + 72);
        maxY = Math.max(maxY, current.mapY + 72);
      }
    }

    const paddingX = 128;
    const paddingY = 148;
    minX = clamp(minX - paddingX, 0, MAP_WIDTH);
    minY = clamp(minY - paddingY, 0, MAP_HEIGHT);
    maxX = clamp(maxX + paddingX, 0, MAP_WIDTH);
    maxY = clamp(maxY + paddingY, 0, MAP_HEIGHT);

    return { minX, minY, maxX, maxY };
  }, [chapters, data]);

  // Find current position (first available/in_progress chapter)
  const currentChapterId = useMemo(() => {
    if (!data) return null;
    for (const ch of chapters) {
      const p = getChapterProgress(data, ch.id);
      if (p.status === "available" || p.status === "in_progress") return ch.id;
    }
    // All complete
    return chapters[chapters.length - 1]?.id ?? null;
  }, [data, chapters]);

  // Unlocked count for road rendering
  const unlockedCount = useMemo(() => {
    if (!data) return 1;
    return chapters.filter((ch) => {
      const s = getChapterProgress(data, ch.id).status;
      return s !== "locked";
    }).length;
  }, [data, chapters]);

  const lockedChapters = useMemo(() => {
    if (!data) return [];
    return chapters.filter((ch) => getChapterProgress(data, ch.id).status === "locked");
  }, [data, chapters]);

  const currentChapter = useMemo(
    () => chapters.find((ch) => ch.id === currentChapterId) ?? null,
    [chapters, currentChapterId],
  );

  const nodeIconItems = useMemo<NodeIconItem[]>(() => {
    if (!data) return [];
    return chapters.map((ch) => {
      const progress = getChapterProgress(data, ch.id);
      return {
        id: `node-icon-${ch.id}`,
        chapterId: ch.id,
        nodeType: resolveLayoutNodeType(ch.order, chapters.length),
        x: ch.mapX,
        y: ch.mapY,
        isUnlocked: progress.status !== "locked",
        isCurrent: ch.id === currentChapterId,
      };
    });
  }, [chapters, data, currentChapterId]);

  const branchBadgeItems = useMemo<BranchThemeBadgeItem[]>(() => {
    if (!data) return [];
    const items: BranchThemeBadgeItem[] = [];
    for (const ch of chapters) {
      const layer = branchLayouts[ch.id];
      if (!layer) continue;
      for (const layout of layer.layouts) {
        const theme = layout.theme as ThemeType;
        const isSelected =
          activeSheet?.chapterId === ch.id &&
          activeSheet.theme === theme;
        const isHovered =
          hoveredBranch?.chapterId === ch.id &&
          hoveredBranch.theme === theme;
        items.push({
          id: `${ch.id}-${theme}-badge`,
          theme,
          x: ch.mapX,
          y: ch.mapY,
          isSelected,
          isHovered,
        });
      }
    }
    return items;
  }, [activeSheet, branchLayouts, chapters, data, hoveredBranch]);

  // Handle answer
  const handleAnswer = useCallback(
    (answer: BranchAnswer) => {
      if (!data || !activeSheet) return;
      const { chapterId, theme } = activeSheet;

      let updated = addBranchAnswer(data, chapterId, theme, answer);
      updated = recomputeUnlocks(
        updated,
        chapters.map((c) => c.id),
      );

      setData(updated);
      saveRoadmapData(updated);

      // Check follow-up
      const progress = updated.chapters[chapterId];
      const answers = progress?.branches[theme] ?? [];
      const depths = answers.map((a) => a.depth);
      const next = getNextQuestion(theme, depths);
      if (!next) {
        setTimeout(() => setActiveSheet(null), 1200);
      }
    },
    [data, activeSheet, chapters],
  );

  const openBranch = useCallback(
    (chapterId: string, theme: ThemeType) => {
      if (!data) return;
      const progress = getChapterProgress(data, chapterId);
      if (progress.status === "locked") return;
      setActiveSheet({ chapterId, theme });
    },
    [data],
  );

  const openChapterQuestion = useCallback(
    (chapterId: string) => {
      if (!data) return;
      const progress = getChapterProgress(data, chapterId);
      if (progress.status === "locked") return;

      const nextTheme = THEMES
        .map((theme) => {
          const answers = progress.branches[theme] ?? [];
          const next = getNextQuestion(theme, answers.map((a) => a.depth));
          return {
            theme,
            answeredCount: answers.length,
            hasNext: next !== null,
          };
        })
        .filter((entry) => entry.hasNext)
        .sort((a, b) => a.answeredCount - b.answeredCount)[0]?.theme;

      setActiveSheet({
        chapterId,
        theme: nextTheme ?? THEMES[0],
      });
    },
    [data],
  );

  const focusChapter = useCallback(
    (chapter: ChapterDef) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const targetX = -(chapter.mapX * zoom - cx);
      const targetY = -(chapter.mapY * zoom - cy);
      setPan({ x: targetX + pan.x * 0.3, y: targetY + pan.y * 0.3 });
    },
    [pan.x, pan.y, zoom],
  );

  const fitJourneyToViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const contentWidth = Math.max(1, journeyBounds.maxX - journeyBounds.minX);
    const contentHeight = Math.max(1, journeyBounds.maxY - journeyBounds.minY);
    const scale = clamp(
      Math.min(rect.width / contentWidth, rect.height / contentHeight),
      Math.max(ZOOM_MIN, FIT_ZOOM_MIN),
      Math.min(ZOOM_MAX, FIT_ZOOM_MAX),
    );
    const centerX = (journeyBounds.minX + journeyBounds.maxX) / 2;
    const centerY = (journeyBounds.minY + journeyBounds.maxY) / 2;

    setZoom(scale);
    setPan({
      x: rect.width / 2 - centerX * scale,
      y: rect.height / 2 - centerY * scale,
    });
  }, [journeyBounds]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  }, []);
  const handleZoomReset = useCallback(() => {
    fitJourneyToViewport();
  }, [fitJourneyToViewport]);

  // Pan handlers (pointer events)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (activeSheet) return;
      if (isInteractivePointerTarget(e.target)) return;
      setIsPanning(true);
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [pan, activeSheet],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({
        x: panStart.current.panX + dx,
        y: panStart.current.panY + dy,
      });
    },
    [isPanning],
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP * 0.5 : ZOOM_STEP * 0.5;
      setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta)));
    },
    [],
  );

  useEffect(() => {
    if (!data || hasFittedRef.current) return;
    fitJourneyToViewport();
    hasFittedRef.current = true;
  }, [data, fitJourneyToViewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (!hasFittedRef.current) return;
      fitJourneyToViewport();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitJourneyToViewport]);

  if (!data) return null;

  return (
    <div className="relative flex h-[100dvh] w-full flex-col" style={{ background: "#e8dfc8" }}>
      <SeaLayer />
      {/* Map canvas */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
        style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="h-full w-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.2s ease-out",
          }}
        >
          <SvgDefs />
          {/* Layer 1-3: base land -> cloud -> main road + branch backdrop */}
          <g pointerEvents="none">
            <JapanLand />
            <CloudLayer
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              panX={pan.x}
              panY={pan.y}
              zoom={zoom}
              timeSeconds={timeSeconds}
            />
            <MainRoad
              path={mainRoadPath}
              unlockedLength={unlockedCount}
              totalLength={chapters.length}
            />
            {chapters.map((ch) => {
              const progress = getChapterProgress(data, ch.id);
              const layer = branchLayouts[ch.id];
              if (!layer) return null;
              return (
                <g key={`inset-${ch.id}`}>
                  <ThemeInsetFrame
                    chapter={ch}
                    layer={layer}
                    unlocked={progress.status !== "locked"}
                    emphasized={
                      ch.id === currentChapterId ||
                      activeSheet?.chapterId === ch.id ||
                      hoveredChapterId === ch.id
                    }
                    showLabel={zoom >= 1}
                  />
                  <BranchBackdropLayer layer={layer} progress={progress} />
                </g>
              );
            })}
            <OriginBeacon x={chapters[0].mapX} y={chapters[0].mapY} />
            <text
              x={chapters[chapters.length - 1].mapX}
              y={chapters[chapters.length - 1].mapY - NODE_RADIUS - 30}
              textAnchor="middle"
              fontSize="10"
              letterSpacing="2"
              fill="rgba(104,82,54,0.52)"
            >
              ...そしてこれからも続く
            </text>
          </g>

          {/* Layer 3: interactive branches */}
          <g>
            {chapters.map((ch) => {
              const progress = getChapterProgress(data, ch.id);
              if (progress.status === "locked") return null;
              const layer = branchLayouts[ch.id];
              if (!layer) return null;

              return (
                <g key={`theme-layer-${ch.id}`}>
                  {layer.layouts.map((bl) => {
                    const answers = progress.branches[bl.theme as ThemeType] ?? [];
                    const answered = answers.length > 0;
                    const strength = answers.length;
                    const depths = answers.map((a) => a.depth);
                    const nextQ = getNextQuestion(bl.theme as ThemeType, depths);
                    const hasFollowUp = answered && nextQ !== null;
                    const isSelected =
                      activeSheet?.chapterId === ch.id &&
                      activeSheet.theme === (bl.theme as ThemeType);
                    const isActive = answered || hasFollowUp;
                    const isHovered =
                      hoveredBranch?.chapterId === ch.id &&
                      hoveredBranch.theme === (bl.theme as ThemeType);
                    const showLabel =
                      zoom >= 1 ||
                      isSelected ||
                      isHovered ||
                      activeSheet?.chapterId === ch.id;

                    return (
                      <ThemeBranch
                        key={`${ch.id}-${bl.theme}`}
                        chapterId={ch.id}
                        originX={ch.mapX}
                        originY={ch.mapY}
                        layout={bl}
                        zoom={zoom}
                        strength={strength}
                        answered={answered}
                        isSelected={isSelected}
                        isActive={isActive}
                        isHovered={isHovered}
                        showLabel={showLabel}
                        hasFollowUp={hasFollowUp}
                        onHoverChange={(hovered) => {
                          setHoveredBranch(
                            hovered ? { chapterId: ch.id, theme: bl.theme as ThemeType } : null,
                          );
                        }}
                        onTap={() => openBranch(ch.id, bl.theme as ThemeType)}
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* Layer 4: fog */}
          <g pointerEvents="none">
            <FutureFog lockedChapters={lockedChapters} />
            {chapters.map((ch) => {
              const progress = getChapterProgress(data, ch.id);
              if (progress.status !== "locked") return null;
              return <FogOverlay key={`fog-${ch.id}`} chapter={ch} />;
            })}
          </g>

          {/* Layer 5-9: chapter nodes -> node icons -> branch badges -> current beacon -> overlay UI */}
          <g>
            {chapters.map((ch) => {
              const progress = getChapterProgress(data, ch.id);
              return (
                <ChapterNode
                  key={ch.id}
                  chapter={ch}
                  nodeType={resolveLayoutNodeType(ch.order, chapters.length)}
                  progress={progress}
                  isCurrentPos={ch.id === currentChapterId}
                  isSelected={activeSheet?.chapterId === ch.id}
                  isHovered={hoveredChapterId === ch.id}
                  showLabel={
                    zoom >= 1 ||
                    ch.id === currentChapterId ||
                    activeSheet?.chapterId === ch.id ||
                    hoveredChapterId === ch.id
                  }
                  onHoverChange={(hovered) => {
                    setHoveredChapterId(hovered ? ch.id : null);
                  }}
                  onTap={() => {
                    if (progress.status === "locked") return;
                    focusChapter(ch);
                    openChapterQuestion(ch.id);
                  }}
                />
              );
            })}

            <NodeIconLayer nodes={nodeIconItems} />
            <BranchThemeBadge items={branchBadgeItems} />

            {currentChapter && (
              <g style={{ pointerEvents: "none" }}>
                <image
                  href="/life-map/current-beacon.svg"
                  x={currentChapter.mapX - 56}
                  y={currentChapter.mapY - 74}
                  width={112}
                  height={112}
                  opacity={0.92}
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
            )}

            {currentChapter && (
              <AddRecordCallout
                chapter={currentChapter}
                onTap={() => {
                  focusChapter(currentChapter);
                  openChapterQuestion(currentChapter.id);
                }}
              />
            )}
          </g>
        </svg>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.2s ease-out",
          }}
        >
          <ThemeLensLayer mapWidth={MAP_WIDTH} mapHeight={MAP_HEIGHT} zoom={zoom} />
        </div>
      </div>
      <CloudCurtainLayer phase={cloudPhase} />
      <MapOrnaments showFrameCorner={true} themeCountLabel={`${THEMES.length} テーマ`} />

      {/* Zoom controls */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleZoomReset}
      />

      {/* Progress bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 px-4">
        <div className="pointer-events-auto mx-auto w-full max-w-[420px]">
        <ProgressBar data={data} chapters={chapters} />
        </div>
      </div>

      {/* Question bottom sheet */}
      <AnimatePresence>
        {activeSheet && (
          <QuestionSheet
            key={`${activeSheet.chapterId}-${activeSheet.theme}`}
            chapterId={activeSheet.chapterId}
            chapterLabel={
              chapters.find((c) => c.id === activeSheet.chapterId)?.label ?? ""
            }
            theme={activeSheet.theme}
            answeredDepths={
              (
                getChapterProgress(data, activeSheet.chapterId).branches[
                  activeSheet.theme
                ] ?? []
              ).map((a) => a.depth)
            }
            onAnswer={handleAnswer}
            onClose={() => setActiveSheet(null)}
          />
        )}
      </AnimatePresence>

      {/* Backdrop */}
      <AnimatePresence>
        {activeSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setActiveSheet(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
