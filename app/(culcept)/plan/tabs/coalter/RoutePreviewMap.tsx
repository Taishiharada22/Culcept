"use client";

/**
 * RoutePreviewMap — CoAlter タブの地図プレビュー（純 SVG・外部 API なし）
 *
 * 理想画像（over.png）は reference overlay としてのみ使用。画像の貼付・トレースは行わず、
 * 「淡い街区＋川＋番号つきノード＋グラデーション経路」という構図をコードで再構築する。
 *
 * - 背景の街区/道路/川/緑地は **decorative な固定ジオメトリ**（実地図ではない）
 * - 経路は props の正規化ノード（0-100 × 0-64）から描画。セグメントごとに
 *   両端ノードの tone を結ぶ userSpaceOnUse gradient を張る
 * - variant "hero": エリア名ラベル + 大きめノード / "mini": 候補カード用の縮小版
 */

import { useId } from "react";

import type { RouteNodeFixture } from "./coalterPlanSessionFixture";

const NODE_TONE_HEX: Record<RouteNodeFixture["tone"], string> = {
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  fuchsia: "#d946ef",
  blue: "#3b82f6",
  emerald: "#10b981",
};

export interface RoutePreviewMapProps {
  readonly nodes: readonly RouteNodeFixture[];
  readonly variant: "hero" | "mini";
  readonly areaLabels?: readonly { readonly x: number; readonly y: number; readonly text: string }[];
  readonly className?: string;
}

export function RoutePreviewMap({ nodes, variant, areaLabels, className }: RoutePreviewMapProps) {
  const uid = useId();
  const isHero = variant === "hero";
  const nodeR = isHero ? 3.6 : 4.6;
  const fontSize = isHero ? 3.4 : 4.2;
  const strokeW = isHero ? 1.5 : 1.9;

  return (
    <svg
      viewBox="0 0 100 64"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="ルートプレビュー"
      className={className ? `block h-full w-full ${className}` : "block h-full w-full"}
    >
      {/* ── decorative base（実地図ではない・固定ジオメトリ） ── */}
      <rect x="0" y="0" width="100" height="64" fill="#e8edf4" />
      {/* 緑地 */}
      <rect x="8" y="6" width="16" height="11" rx="3" fill="#dcebdb" />
      <rect x="58" y="6" width="13" height="9" rx="3" fill="#e0eddf" />
      <rect x="30" y="44" width="14" height="10" rx="3" fill="#dfecde" />
      {/* 街区 */}
      <rect x="30" y="8" width="12" height="9" rx="1.5" fill="#dde4ee" />
      <rect x="46" y="10" width="9" height="12" rx="1.5" fill="#e1e7f0" />
      <rect x="14" y="22" width="11" height="10" rx="1.5" fill="#dde4ee" />
      <rect x="64" y="26" width="12" height="8" rx="1.5" fill="#e1e7f0" />
      <rect x="80" y="8" width="11" height="13" rx="1.5" fill="#dde4ee" />
      {/* 川（柔らかい帯） */}
      <path
        d="M -4 50 C 14 42, 30 56, 48 50 C 64 44.5, 74 40, 88 44 C 95 46, 100 50, 106 52 L 106 70 L -4 70 Z"
        fill="#c9def2"
      />
      <path
        d="M -4 50 C 14 42, 30 56, 48 50 C 64 44.5, 74 40, 88 44 C 95 46, 100 50, 106 52"
        fill="none"
        stroke="#bcd5ee"
        strokeWidth="1.1"
      />
      {/* 道路 */}
      <g stroke="#f7fafc" strokeWidth="1.7" strokeLinecap="round">
        <path d="M 0 20 H 100" />
        <path d="M 0 36 H 100" />
        <path d="M 27 0 V 64" />
        <path d="M 60 0 V 48" />
        <path d="M 78 0 V 44" />
      </g>
      <g stroke="#eef2f7" strokeWidth="0.8" strokeLinecap="round">
        <path d="M 0 10 H 100" />
        <path d="M 0 28 H 78" />
        <path d="M 44 0 V 52" />
        <path d="M 90 0 V 40" />
      </g>

      {/* ── エリア名（hero のみ・faint） ── */}
      {isHero &&
        areaLabels?.map((label) => (
          <text
            key={`${label.x}-${label.y}`}
            x={label.x}
            y={label.y}
            fontSize="3"
            fill="#94a3b8"
            opacity="0.85"
          >
            {label.text}
          </text>
        ))}

      {/* ── 経路（セグメントごとの tone gradient） ── */}
      <defs>
        {nodes.slice(0, -1).map((from, i) => {
          const to = nodes[i + 1];
          return (
            <linearGradient
              key={from.order}
              id={`${uid}-seg-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            >
              <stop offset="0%" stopColor={NODE_TONE_HEX[from.tone]} />
              <stop offset="100%" stopColor={NODE_TONE_HEX[to.tone]} />
            </linearGradient>
          );
        })}
      </defs>
      {/* 経路の白縁取り（地図上で浮かせる） */}
      <polyline
        points={nodes.map((n) => `${n.x},${n.y}`).join(" ")}
        fill="none"
        stroke="#ffffff"
        strokeWidth={strokeW + 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {nodes.slice(0, -1).map((from, i) => {
        const to = nodes[i + 1];
        return (
          <line
            key={from.order}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={`url(#${uid}-seg-${i})`}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        );
      })}

      {/* ── 番号つきノード ── */}
      {nodes.map((node) => (
        <g key={node.order}>
          <circle
            cx={node.x}
            cy={node.y}
            r={nodeR}
            fill={NODE_TONE_HEX[node.tone]}
            stroke="#ffffff"
            strokeWidth={isHero ? 1.1 : 1.3}
          />
          <text
            x={node.x}
            y={node.y + fontSize * 0.36}
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight="700"
            fill="#ffffff"
          >
            {node.order}
          </text>
        </g>
      ))}
    </svg>
  );
}
