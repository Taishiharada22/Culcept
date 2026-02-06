// components/ui/MorphingText.tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MorphingTextProps {
    texts: string[];
    interval?: number;
    className?: string;
    gradient?: boolean;
}

export default function MorphingText({
    texts,
    interval = 3000,
    className = "",
    gradient = true,
}: MorphingTextProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % texts.length);
        }, interval);

        return () => clearInterval(timer);
    }, [texts.length, interval]);

    return (
        <div className={`relative h-[1.2em] overflow-hidden ${className}`}>
            <AnimatePresence mode="wait">
                <motion.span
                    key={currentIndex}
                    initial={{ y: 40, opacity: 0, rotateX: -90 }}
                    animate={{ y: 0, opacity: 1, rotateX: 0 }}
                    exit={{ y: -40, opacity: 0, rotateX: 90 }}
                    transition={{
                        duration: 0.5,
                        ease: [0.32, 0.72, 0, 1],
                    }}
                    className={`absolute inset-0 ${
                        gradient
                            ? "bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent"
                            : ""
                    }`}
                    style={{ transformStyle: "preserve-3d" }}
                >
                    {texts[currentIndex]}
                </motion.span>
            </AnimatePresence>
        </div>
    );
}
