"use client";

import { motion } from "framer-motion";
import type { RealFaceCheckResult } from "@/lib/realFaceStorage";

interface Props {
    fit: RealFaceCheckResult;
    brightness: RealFaceCheckResult;
    pose: RealFaceCheckResult;
    size?: number;
}

type Status = "ok" | "unstable" | "ng";

const STATUS_COLORS: Record<Status, string> = {
    ok: "#10b981",      // emerald-500
    unstable: "#f59e0b", // amber-500
    ng: "#ef4444",       // red-500
};

const STATUS_BG: Record<Status, string> = {
    ok: "rgba(16,185,129,0.12)",
    unstable: "rgba(245,158,11,0.12)",
    ng: "rgba(239,68,68,0.12)",
};

function statusScore(status: Status): number {
    return status === "ok" ? 1 : status === "unstable" ? 0.75 : 0.15;
}

export default function QualityProgressRing({ fit, brightness, pose, size = 160 }: Props) {
    const allOk = fit.status === "ok" && brightness.status === "ok" && pose.status === "ok";
    const score = Math.round(
        (statusScore(fit.status) * 40 + statusScore(brightness.status) * 35 + statusScore(pose.status) * 25),
    );

    const center = size / 2;
    const strokeWidth = size * 0.06;
    const gap = strokeWidth * 0.8;

    const rings = [
        { label: "構図", status: fit.status, radius: center - strokeWidth * 1.5 },
        { label: "明るさ", status: brightness.status, radius: center - strokeWidth * 1.5 - gap - strokeWidth },
        { label: "姿勢", status: pose.status, radius: center - strokeWidth * 1.5 - (gap + strokeWidth) * 2 },
    ] as const;

    return (
        <div className="flex flex-col items-center gap-2" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="撮影品質">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {rings.map((ring, i) => {
                        const circumference = 2 * Math.PI * ring.radius;
                        const progress = statusScore(ring.status);
                        const dashOffset = circumference * (1 - progress);
                        const color = STATUS_COLORS[ring.status];
                        const bgColor = STATUS_BG[ring.status];

                        return (
                            <g key={i}>
                                {/* 背景リング */}
                                <circle
                                    cx={center}
                                    cy={center}
                                    r={ring.radius}
                                    fill="none"
                                    stroke={bgColor}
                                    strokeWidth={strokeWidth}
                                />
                                {/* プログレスリング */}
                                <motion.circle
                                    cx={center}
                                    cy={center}
                                    r={ring.radius}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={strokeWidth}
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    initial={{ strokeDashoffset: circumference }}
                                    animate={{ strokeDashoffset: dashOffset }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                    transform={`rotate(-90 ${center} ${center})`}
                                />
                            </g>
                        );
                    })}
                </svg>

                {/* 中央スコア */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                        className="text-2xl font-bold"
                        style={{ color: allOk ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444" }}
                        key={score}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        {score}
                    </motion.span>
                    <span className="text-[10px] text-slate-400">/ 100</span>
                </div>

                {/* 全チェック通過アニメーション */}
                {allOk && (
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-emerald-400"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1.05, opacity: [0, 0.6, 0] }}
                        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2 }}
                    />
                )}
            </div>

            {/* ラベル行 */}
            <div className="flex gap-3 text-xs">
                {rings.map((ring, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: STATUS_COLORS[ring.status] }}
                        />
                        <span className="text-slate-500">{ring.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
