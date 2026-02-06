// components/ui/GlassCard.tsx
"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    gradient?: "purple" | "pink" | "blue" | "orange" | "green" | "none";
    hover?: boolean;
    glow?: boolean;
    blur?: "sm" | "md" | "lg";
    onClick?: () => void;
}

const gradientMap = {
    purple: "from-purple-500/20 via-pink-500/10 to-transparent",
    pink: "from-pink-500/20 via-rose-500/10 to-transparent",
    blue: "from-blue-500/20 via-cyan-500/10 to-transparent",
    orange: "from-orange-500/20 via-amber-500/10 to-transparent",
    green: "from-emerald-500/20 via-teal-500/10 to-transparent",
    none: "",
};

const glowMap = {
    purple: "shadow-purple-500/20",
    pink: "shadow-pink-500/20",
    blue: "shadow-blue-500/20",
    orange: "shadow-orange-500/20",
    green: "shadow-emerald-500/20",
    none: "",
};

const blurMap = {
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
};

export default function GlassCard({
    children,
    className = "",
    gradient = "purple",
    hover = true,
    glow = false,
    blur = "md",
    onClick,
}: GlassCardProps) {
    return (
        <motion.div
            whileHover={hover ? { scale: 1.02, y: -4 } : undefined}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={onClick}
            className={`
                relative overflow-hidden rounded-3xl
                bg-white/70 dark:bg-slate-900/70
                ${blurMap[blur]}
                border border-white/50 dark:border-slate-700/50
                ${glow ? `shadow-2xl ${glowMap[gradient]}` : "shadow-lg shadow-slate-200/50"}
                ${onClick ? "cursor-pointer" : ""}
                ${className}
            `}
        >
            {/* Gradient overlay */}
            {gradient !== "none" && (
                <div
                    className={`absolute inset-0 bg-gradient-to-br ${gradientMap[gradient]} pointer-events-none`}
                />
            )}

            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />

            {/* Content */}
            <div className="relative z-10">{children}</div>
        </motion.div>
    );
}
