"use client";

import { resolveChapterIcon } from "@/lib/life-map/resolveChapterIcon";

export type NodeIconItem = {
  id: string;
  chapterId: string;
  nodeType?: string;
  x: number;
  y: number;
  isUnlocked: boolean;
  isCurrent: boolean;
};

type NodeIconLayerProps = {
  nodes: NodeIconItem[];
};

export default function NodeIconLayer({ nodes }: NodeIconLayerProps) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {nodes
        .filter((node) => node.isUnlocked || node.isCurrent)
        .map((node) => {
          const icon = resolveChapterIcon(node.nodeType ?? node.chapterId);
          const size = node.isCurrent ? 56 : 46;
          return (
            <image
              key={node.id}
              href={icon}
              x={node.x - size / 2}
              y={node.y - size / 2}
              width={size}
              height={size}
              opacity={node.isCurrent ? 0.98 : 0.86}
              preserveAspectRatio="xMidYMid meet"
            />
          );
        })}
    </g>
  );
}

