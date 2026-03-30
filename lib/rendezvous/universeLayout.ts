/**
 * Universe Layout Engine
 * 力学シミュレーションで接続ノードの配置を計算
 * d3不要、カスタムスプリング物理
 */

export type UniverseNode = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  syncPercent: number;
  state: string;
  messageCount: number;
  isActive: boolean;
  // Layout state
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type UniverseEdge = {
  source: string;
  target: string;
  strength: number; // 0..1 (syncPercent / 100)
  category: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
  partner: "#D4776B",
};

/**
 * 初期配置: 中央付近にノードを配置（スプレッドアニメーション用）
 */
export function initializeLayout(
  nodes: Omit<UniverseNode, "x" | "y" | "vx" | "vy">[],
  width: number,
  height: number,
): UniverseNode[] {
  const cx = width / 2;
  const cy = height / 2;

  return nodes.map((node, i) => {
    // Start near center for spread-out animation
    const angle = (i / nodes.length) * Math.PI * 2;
    const radius = 10 + Math.random() * 15;
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });
}

/**
 * 1フレームの力学シミュレーション
 * - ノード間斥力: F = 500 / dist^2
 * - 中心への引力: F = 0.01 * dist
 * - エッジ引力: F = 0.005 * (dist - idealDist)
 * - 速度減衰: 0.92
 */
export function simulateStep(
  nodes: UniverseNode[],
  edges: UniverseEdge[],
  centerX: number,
  centerY: number,
): void {
  const REPULSION = 500;
  const CENTER_PULL = 0.01;
  const EDGE_ATTRACTION = 0.005;
  const DAMPING = 0.92;

  // Reset forces
  const forces = nodes.map(() => ({ fx: 0, fy: 0 }));

  // Node-node repulsion: F = 500 / dist^2
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces[i].fx -= fx;
      forces[i].fy -= fy;
      forces[j].fx += fx;
      forces[j].fy += fy;
    }
  }

  // Edge attraction: F = 0.005 * (dist - idealDist)
  for (const edge of edges) {
    const ti = nodes.findIndex((n) => n.id === edge.target);
    if (ti < 0) continue;

    const dx = centerX - nodes[ti].x;
    const dy = centerY - nodes[ti].y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const idealDist = 100 + (1 - edge.strength) * 60;
    const force = EDGE_ATTRACTION * (dist - idealDist);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    forces[ti].fx += fx;
    forces[ti].fy += fy;
  }

  // Center pull + velocity update: F = 0.01 * dist
  for (let i = 0; i < nodes.length; i++) {
    const dx = centerX - nodes[i].x;
    const dy = centerY - nodes[i].y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    forces[i].fx += dx * CENTER_PULL;
    forces[i].fy += dy * CENTER_PULL;

    nodes[i].vx = (nodes[i].vx + forces[i].fx) * DAMPING;
    nodes[i].vy = (nodes[i].vy + forces[i].fy) * DAMPING;
    nodes[i].x += nodes[i].vx;
    nodes[i].y += nodes[i].vy;
  }
}

/**
 * ノードサイズを計算
 * 16 + min(messageCount / 5, 16) pixels
 */
export function getNodeRadius(messageCount: number): number {
  return 16 + Math.min(messageCount / 5, 16);
}

/**
 * カテゴリ色を取得
 */
export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#6366F1";
}

/**
 * タップヒットテスト
 */
export function hitTestNode(
  nodes: UniverseNode[],
  tapX: number,
  tapY: number,
): UniverseNode | null {
  // Check in reverse so top-rendered nodes are hit first
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const r = getNodeRadius(node.messageCount);
    const dx = tapX - node.x;
    const dy = tapY - node.y;
    if (dx * dx + dy * dy <= (r + 8) * (r + 8)) {
      return node;
    }
  }
  return null;
}
