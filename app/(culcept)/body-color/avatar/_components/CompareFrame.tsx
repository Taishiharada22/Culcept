"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, type PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";

interface CompareFrameProps {
    baseUrl: string;
    overlayUrl?: string | null;
    overlayNode?: ReactNode;
    aspect: string;
    opacity: number;
    scale: number;
    dx: number;
    dy: number;
    className?: string;
    onOverlayPositionChange?: (next: { dx: number; dy: number }) => void;
    onSwipe?: (direction: 1 | -1) => void;
}

export default function CompareFrame({
    baseUrl,
    overlayUrl,
    overlayNode,
    aspect,
    opacity,
    scale,
    dx,
    dy,
    className,
    onOverlayPositionChange,
    onSwipe,
}: CompareFrameProps) {
    const prevOverlayRef = useRef(overlayUrl);
    const [overlayFailed, setOverlayFailed] = useState(false);

    if (prevOverlayRef.current !== overlayUrl) {
        prevOverlayRef.current = overlayUrl;
        if (overlayFailed) setOverlayFailed(false);
    }

    const handlePanEnd = (_: PointerEvent, info: PanInfo) => {
        if (!onSwipe) return;
        if (Math.abs(info.offset.x) < 60 || Math.abs(info.offset.x) < Math.abs(info.offset.y)) return;
        onSwipe(info.offset.x > 0 ? -1 : 1);
    };

    return (
        <motion.div
            onPanEnd={handlePanEnd}
            className={cn("relative w-full overflow-hidden rounded-3xl bg-slate-950/90", className)}
            style={{ aspectRatio: aspect }}
        >
            <img
                src={baseUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-contain select-none"
                draggable={false}
            />

            <motion.div
                drag
                dragMomentum={false}
                onDrag={(_, info) =>
                    onOverlayPositionChange?.({
                        dx: dx + info.delta.x,
                        dy: dy + info.delta.y,
                    })
                }
                className="absolute inset-0 flex cursor-grab items-center justify-center active:cursor-grabbing"
                style={{
                    x: dx,
                    y: dy,
                    scale,
                    opacity,
                    transformOrigin: "center",
                }}
            >
                {overlayUrl && !overlayFailed ? (
                    <img
                        src={overlayUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
                        draggable={false}
                        onError={() => setOverlayFailed(true)}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {overlayNode}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
