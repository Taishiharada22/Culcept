"use client";

/**
 * ConnectionUniverse
 * Canvas 2D力学グラフ -- 接続の全体像を星座として可視化
 * requestAnimationFrameループ / ピンチズーム / タップでノード選択
 */

import { useRef, useEffect, useState, useCallback } from "react";
import {
  type UniverseNode,
  type UniverseEdge,
  initializeLayout,
  simulateStep,
  getNodeRadius,
  getCategoryColor,
  hitTestNode,
} from "@/lib/rendezvous/universeLayout";

export type ConnectionNode = {
  id: string;
  name: string;
  avatarUrl: string | null;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  state: string;
  syncPercent: number;
  messageCount: number;
  isActive: boolean;
};

type Props = {
  connections: ConnectionNode[];
  onNodeTap: (id: string) => void;
};

export default function ConnectionUniverse({ connections, onNodeTap }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<UniverseNode[]>([]);
  const edgesRef = useRef<UniverseEdge[]>([]);
  const frameRef = useRef(0);
  const zoomRef = useRef(1);
  const runningRef = useRef(true);
  const [size] = useState(() => {
    if (typeof window === "undefined") return { w: 360, h: 400 };
    return {
      w: Math.min(window.innerWidth - 16, 420),
      h: Math.min(window.innerHeight * 0.55, 480),
    };
  });

  // Initialize layout
  useEffect(() => {
    const { w, h } = size;

    const rawNodes = connections.map((c) => ({
      id: c.id,
      displayName: c.name,
      avatarUrl: c.avatarUrl,
      category: c.category,
      syncPercent: c.syncPercent,
      state: c.state,
      messageCount: c.messageCount,
      isActive: c.isActive,
    }));

    nodesRef.current = initializeLayout(rawNodes, w, h);

    edgesRef.current = connections.map((c) => ({
      source: "self",
      target: c.id,
      strength: c.syncPercent / 100,
      category: c.category,
    }));
  }, [connections]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.scale(dpr, dpr);

    runningRef.current = true;
    frameRef.current = 0;
    const cx = size.w / 2;
    const cy = size.h / 2;

    const draw = () => {
      if (!runningRef.current) return;
      frameRef.current++;

      const zoom = zoomRef.current;

      // Simulate
      simulateStep(nodesRef.current, edgesRef.current, cx, cy);

      // Clear
      ctx.clearRect(0, 0, size.w, size.h);

      ctx.save();
      // Apply zoom from center
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);

      // Draw edges
      for (const edge of edgesRef.current) {
        const target = nodesRef.current.find((n) => n.id === edge.target);
        if (!target) continue;

        const thickness = edge.strength * 4; // syncPercent / 25 => 1-4px
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(target.x, target.y);
        const edgeColor = getCategoryColor(edge.category);
        ctx.strokeStyle = `${edgeColor}${Math.round(edge.strength * 80 + 20)
          .toString(16)
          .padStart(2, "0")}`;
        ctx.lineWidth = Math.max(0.5, thickness);
        ctx.stroke();
      }

      // Draw self (center) -- larger node with white glow
      const selfGlowR = 18 + Math.sin(frameRef.current * 0.02) * 2;
      // Outer glow
      const selfGlow = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        selfGlowR + 8,
      );
      selfGlow.addColorStop(0, "rgba(255,255,255,0.5)");
      selfGlow.addColorStop(0.6, "rgba(255,255,255,0.15)");
      selfGlow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, selfGlowR + 8, 0, Math.PI * 2);
      ctx.fillStyle = selfGlow;
      ctx.fill();

      // Self node
      ctx.beginPath();
      ctx.arc(cx, cy, selfGlowR, 0, Math.PI * 2);
      const selfGrad = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        selfGlowR,
      );
      selfGrad.addColorStop(0, "rgba(99,102,241,0.9)");
      selfGrad.addColorStop(1, "rgba(99,102,241,0.4)");
      ctx.fillStyle = selfGrad;
      ctx.fill();

      // Self core dot
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      // Self label
      ctx.fillStyle = "rgba(30,30,60,0.5)";
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ME", cx, cy + selfGlowR + 14);

      // Draw connection nodes
      for (const node of nodesRef.current) {
        const r = getNodeRadius(node.messageCount);
        const color = getCategoryColor(node.category);

        // Active breathing: opacity cycles 0.6 -> 1 -> 0.6
        let breatheR = r;
        let alphaHex = "CC"; // ~0.8
        if (node.isActive) {
          const phase = Math.sin(frameRef.current * 0.04 + node.x * 0.1);
          breatheR = r + phase * 1.5;
          const alpha = 0.6 + (phase + 1) * 0.2; // 0.6 -> 1.0
          alphaHex = Math.round(alpha * 255)
            .toString(16)
            .padStart(2, "0");
        }

        // Glow for active nodes
        if (node.isActive) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, breatheR + 8, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(
            node.x,
            node.y,
            breatheR,
            node.x,
            node.y,
            breatheR + 8,
          );
          glow.addColorStop(0, `${color}30`);
          glow.addColorStop(1, `${color}00`);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, breatheR, 0, Math.PI * 2);
        ctx.fillStyle = `${color}${alphaHex}`;
        ctx.fill();

        // Label inside node (first 2 chars)
        const label = node.displayName.slice(0, 2);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(9, Math.round(breatheR * 0.7))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, node.x, node.y);
      }

      ctx.restore();

      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);

    return () => {
      runningRef.current = false;
    };
  }, [size]);

  // Wheel zoom (pinch on trackpad)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.001;
      zoomRef.current = Math.max(0.5, Math.min(2.5, zoomRef.current + delta));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Tap handling
  const handleTap = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Account for zoom
      const zoom = zoomRef.current;
      const cx = size.w / 2;
      const cy = size.h / 2;
      const rawX = clientX - rect.left;
      const rawY = clientY - rect.top;
      const tapX = (rawX - cx) / zoom + cx;
      const tapY = (rawY - cy) / zoom + cy;

      const hit = hitTestNode(nodesRef.current, tapX, tapY);
      if (hit) {
        onNodeTap(hit.id);
      }
    },
    [onNodeTap, size],
  );

  return (
    <canvas
      ref={canvasRef}
      onClick={handleTap}
      onTouchStart={handleTap}
      style={{
        width: size.w,
        height: size.h,
        display: "block",
        cursor: "pointer",
      }}
    />
  );
}
