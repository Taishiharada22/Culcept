"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Particle = {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
    delay: number;
};

const SPARKLE_COLORS = [
    "#fbbf24", "#f59e0b", "#d97706",
    "#f472b6", "#a78bfa", "#60a5fa",
    "#34d399", "#fb923c",
];

let particleIdCounter = 0;

function createParticles(count: number): Particle[] {
    return Array.from({ length: count }, () => {
        particleIdCounter += 1;
        return {
            id: particleIdCounter,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 4 + Math.random() * 8,
            color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
            delay: Math.random() * 0.3,
        };
    });
}

type Props = {
    trigger: boolean;
    onComplete?: () => void;
    particleCount?: number;
};

export default function SparkleEffect({ trigger, onComplete, particleCount = 12 }: Props) {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        if (trigger) {
            setParticles(createParticles(particleCount));
            const timer = setTimeout(() => {
                setParticles([]);
                onComplete?.();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [trigger, particleCount, onComplete]);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <AnimatePresence>
                {particles.map((p) => (
                    <motion.div
                        key={p.id}
                        initial={{
                            opacity: 1,
                            scale: 0,
                            x: `${p.x}%`,
                            y: `${p.y}%`,
                        }}
                        animate={{
                            opacity: [1, 1, 0],
                            scale: [0, 1.2, 0.5],
                            y: `${p.y - 20 - Math.random() * 30}%`,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                            duration: 0.6,
                            delay: p.delay,
                            ease: "easeOut",
                        }}
                        className="absolute"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    >
                        <svg width={p.size} height={p.size} viewBox="0 0 24 24">
                            <path
                                d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41Z"
                                fill={p.color}
                            />
                        </svg>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

/** Convenience hook for triggering sparkle */
export function useSparkle() {
    const [sparkling, setSparkling] = useState(false);
    const sparkle = useCallback(() => setSparkling(true), []);
    const onComplete = useCallback(() => setSparkling(false), []);
    return { sparkling, sparkle, onComplete };
}
