"use client";

import { resolveThemeIcon } from "@/lib/life-map/resolveThemeIcon";

export type BranchThemeBadgeItem = {
  id: string;
  theme: string;
  x: number;
  y: number;
  isSelected: boolean;
  isHovered: boolean;
};

type BranchThemeBadgeProps = {
  items: BranchThemeBadgeItem[];
};

export default function BranchThemeBadge({ items }: BranchThemeBadgeProps) {
  const themeOffset: Record<string, number> = {
    emotion: 12,
    relationship: 14,
    work: 16,
    challenge: 18,
  };

  return (
    <g style={{ pointerEvents: "none" }}>
      {items.map((badge) => {
        const visible = badge.isSelected || badge.isHovered;
        if (!visible) return null;
        const icon = resolveThemeIcon(badge.theme);
        const offset = themeOffset[badge.theme] ?? 13;
        const size = badge.isSelected ? 24 : 20;
        const bx = badge.x + offset;
        const by = badge.y - offset;

        return (
          <g key={badge.id} opacity={badge.isSelected ? 1 : 0.82}>
            <circle
              cx={bx}
              cy={by}
              r={badge.isSelected ? 13 : 11}
              fill="rgba(255,246,224,0.92)"
              stroke="rgba(120,86,50,0.5)"
              strokeWidth={1}
            />
            <image
              href={icon}
              x={bx - size / 2}
              y={by - size / 2}
              width={size}
              height={size}
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        );
      })}
    </g>
  );
}

