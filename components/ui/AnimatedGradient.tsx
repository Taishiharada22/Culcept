// components/ui/AnimatedGradient.tsx
"use client";

import { motion } from "framer-motion";

interface AnimatedGradientProps {
    className?: string;
    colors?: string[];
    speed?: "slow" | "medium" | "fast";
    blur?: boolean;
}

const speedMap = {
    slow: 20,
    medium: 10,
    fast: 5,
};

export default function AnimatedGradient({
    className = "",
    colors = ["#8B5CF6", "#EC4899", "#F97316", "#8B5CF6"],
    speed = "medium",
    blur = true,
}: AnimatedGradientProps) {
    return (
        <div className={`absolute inset-0 overflow-hidden ${className}`}>
            <motion.div
                className={`absolute -inset-[100%] ${blur ? "blur-3xl" : ""}`}
                animate={{
                    background: [
                        `radial-gradient(circle at 0% 0%, ${colors[0]} 0%, transparent 50%)`,
                        `radial-gradient(circle at 100% 0%, ${colors[1]} 0%, transparent 50%)`,
                        `radial-gradient(circle at 100% 100%, ${colors[2]} 0%, transparent 50%)`,
                        `radial-gradient(circle at 0% 100%, ${colors[3] || colors[0]} 0%, transparent 50%)`,
                        `radial-gradient(circle at 0% 0%, ${colors[0]} 0%, transparent 50%)`,
                    ],
                }}
                transition={{
                    duration: speedMap[speed],
                    repeat: Infinity,
                    ease: "linear",
                }}
                style={{ opacity: 0.4 }}
            />

            {/* Secondary floating orbs */}
            <motion.div
                className="absolute w-96 h-96 rounded-full blur-3xl"
                style={{ background: colors[0], opacity: 0.2 }}
                animate={{
                    x: ["-25%", "75%", "-25%"],
                    y: ["-25%", "50%", "-25%"],
                }}
                transition={{
                    duration: speedMap[speed] * 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            <motion.div
                className="absolute w-64 h-64 rounded-full blur-3xl"
                style={{ background: colors[1], opacity: 0.15 }}
                animate={{
                    x: ["75%", "-25%", "75%"],
                    y: ["75%", "25%", "75%"],
                }}
                transition={{
                    duration: speedMap[speed] * 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
        </div>
    );
}
