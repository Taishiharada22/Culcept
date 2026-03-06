"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import FloatingOrbs from "@/components/animation/FloatingOrbs";

const CHARS = "　　ファッションを　　もっと自由におもしろく".split("");

const charVariants = {
    hidden: { opacity: 0, y: 40, rotateX: -40 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        rotateX: 0,
        transition: {
            delay: 0.6 + i * 0.04,
            duration: 0.6,
            ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
        },
    }),
};

export default function CinematicHero({
    userName,
    isLoggedIn,
}: {
    userName?: string | null;
    isLoggedIn: boolean;
}) {
    const sectionRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start start", "end start"],
    });

    const y = useSpring(useTransform(scrollYProgress, [0, 1], [0, -120]), {
        stiffness: 80,
        damping: 20,
    });
    const hueFilter = useTransform(scrollYProgress, [0, 1], ["hue-rotate(0deg)", "hue-rotate(120deg)"]);
    const opacityOut = useTransform(scrollYProgress, [0, 0.7, 1], [1, 1, 0]);

    return (
        <section
            ref={sectionRef}
            className="relative flex min-h-[100vh] items-center justify-center overflow-hidden"
        >
            {/* Ambient Orbs */}
            <FloatingOrbs />

            {/* Subtle grid overlay */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)",
                    backgroundSize: "60px 60px",
                }}
            />

            {/* Center content */}
            <motion.div
                className="relative z-10 px-6 text-center"
                style={{ y, opacity: opacityOut }}
            >
                {/* Greeting */}
                {isLoggedIn && userName && (
                    <motion.p
                        className="mb-4 text-sm font-medium tracking-[0.15em] text-slate-400"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                    >
                        おかえり、{userName}
                    </motion.p>
                )}

                {!isLoggedIn && (
                    <motion.p
                        className="mb-4 text-sm font-medium tracking-[0.15em] text-slate-400"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                    >
                        AI-Powered Fashion Platform
                    </motion.p>
                )}

                {/* Giant gradient text with scroll hue shift */}
                <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.1] tracking-tight">
                    <motion.span
                        className="inline-block"
                        style={{ filter: hueFilter }}
                    >
                        {CHARS.map((char, i) => (
                            <motion.span
                                key={i}
                                className="inline-block bg-gradient-to-r from-violet-600 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent"
                                variants={charVariants}
                                initial="hidden"
                                animate="visible"
                                custom={i}
                                style={{ perspective: 400 }}
                            >
                                {char === "、" ? <>,<br className="sm:hidden" /></> : char}
                            </motion.span>
                        ))}
                    </motion.span>
                </h1>

                <motion.p
                    className="mx-auto mt-6 max-w-lg text-base sm:text-lg text-slate-500 leading-relaxed"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.8 }}
                >
                    AIがあなたの好みを学習し、最適なスタイルを提案。
                    <br className="hidden sm:block" />
                    バーチャル試着やスタイルマッチングで新体験を。
                </motion.p>

                {/* Scroll indicator */}
                <motion.div
                    className="mt-12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2, duration: 1 }}
                >
                    <div className="culcept-bounce-down mx-auto flex flex-col items-center gap-1 text-slate-400">
                        <span className="text-[11px] font-medium tracking-widest uppercase">
                            Scroll
                        </span>
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M7 13l5 5 5-5" />
                            <path d="M7 7l5 5 5-5" opacity="0.4" />
                        </svg>
                    </div>
                </motion.div>
            </motion.div>

            {/* Bottom fade */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-50 to-transparent" />
        </section>
    );
}
