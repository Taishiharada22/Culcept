"use client";

/**
 * CoAlterPlanOverlay — Talk 画面に浮かぶ **プランのフローティング overlay**（CEO 2026-06-21）
 *
 * 参考: app/(culcept)/components/coalter/talk.png。
 *   - チャット全画面の上に**フロスト（半透過）カード**として浮かぶ。チャットが隙間/フロスト越しに見え隠れ。
 *   - **ドラッグで移動・リサイズ可能**（footer の注記どおり）。閉じる✕で消える。
 *   - 中身は `PlanIntelligencePanel`（surface="floating"）= 各情報カードが面に浮かぶ。
 *
 * presentation only・親要素（relative）内に absolute 配置。drag/resize は親 bounds にクランプ。
 */

import { useRef, useState } from "react";

import { CloseIcon } from "./coalterIcons";

const MIN_W = 260;
const MIN_H = 220;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

export interface CoAlterPlanOverlayProps {
  readonly title?: string;
  readonly caption?: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}

export function CoAlterPlanOverlay({
  title = "プランインテリジェンス",
  caption = "厳選な一日プランを提案中",
  onClose,
  children,
}: CoAlterPlanOverlayProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 14, y: 56 });
  const [size, setSize] = useState({ w: 340, h: 468 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const parentRect = () => ref.current?.parentElement?.getBoundingClientRect() ?? null;

  // ── ドラッグ（ヘッダ） ──
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-overlay-close]")) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, x: posRef.current.x, y: posRef.current.y };
    const onMove = (ev: PointerEvent) => {
      const rect = parentRect();
      const maxX = rect ? rect.width - sizeRef.current.w : 4000;
      const maxY = rect ? rect.height - sizeRef.current.h : 4000;
      setPos({
        x: clamp(start.x + (ev.clientX - start.px), 0, maxX),
        y: clamp(start.y + (ev.clientY - start.py), 0, maxY),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── リサイズ（右下ハンドル） ──
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { px: e.clientX, py: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
    const onMove = (ev: PointerEvent) => {
      const rect = parentRect();
      const maxW = rect ? rect.width - posRef.current.x : 4000;
      const maxH = rect ? rect.height - posRef.current.y : 4000;
      setSize({
        w: clamp(start.w + (ev.clientX - start.px), MIN_W, maxW),
        h: clamp(start.h + (ev.clientY - start.py), MIN_H, maxH),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="プランインテリジェンス"
      className="absolute z-20 flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/55 shadow-2xl shadow-slate-900/20 backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {/* ── ドラッグヘッダ ── */}
      <div
        onPointerDown={startDrag}
        className="flex shrink-0 cursor-grab touch-none items-center justify-between gap-2 px-4 pb-2 pt-3 active:cursor-grabbing"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-[12px] text-white shadow-sm">
            ✈
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold text-slate-900">{title}</span>
            <span className="block truncate text-[10px] text-slate-500">{caption}</span>
          </span>
        </span>
        <button
          type="button"
          data-overlay-close
          onClick={onClose}
          aria-label="プランを閉じる"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-500 shadow-sm ring-1 ring-slate-200/70 transition-colors hover:text-slate-700"
        >
          <CloseIcon size={11} />
        </button>
      </div>

      {/* ── 中身（PlanIntelligencePanel・各カードが浮かぶ） ── */}
      <div className="min-h-0 flex-1">{children}</div>

      {/* ── 注記 ── */}
      <div className="shrink-0 px-4 pb-2 pt-0.5">
        <span className="text-[10px] text-slate-400">ドラッグして移動・リサイズできます</span>
      </div>

      {/* ── リサイズハンドル（右下） ── */}
      <div
        onPointerDown={startResize}
        role="separator"
        aria-label="サイズ変更"
        className="absolute bottom-1 right-1 flex h-6 w-6 cursor-se-resize touch-none items-end justify-end p-1"
      >
        <span className="block h-3 w-3 rounded-br-md border-b-2 border-r-2 border-slate-400/70" />
      </div>
    </div>
  );
}
