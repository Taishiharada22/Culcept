// app/(culcept)/welcome/WelcomeScreen.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
} from "@/components/ui/glassmorphism-design";

export default function WelcomeScreen() {
    return (
        <LightBackground>
            <div className="min-h-screen flex items-center justify-center px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="w-full max-w-md"
                >
                    <GlassCard className="p-8 text-center space-y-8">
                        {/* Brand */}
                        <div className="space-y-3">
                            <h1
                                className="text-3xl font-light tracking-wide text-gray-800"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                Aneurasync
                            </h1>
                            <p className="text-sm text-gray-500">
                                あなたの内面を、深く観測する
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="space-y-4">
                            <Link href="/stargazer" className="block">
                                <GlassButton className="w-full py-4 text-base">
                                    はじめての方
                                </GlassButton>
                            </Link>

                            <Link href="/login" className="block">
                                <GlassButton
                                    variant="secondary"
                                    className="w-full py-4 text-base"
                                >
                                    ログイン
                                </GlassButton>
                            </Link>
                        </div>

                        <p className="text-xs text-gray-400">
                            アカウントをお持ちの方は「ログイン」からどうぞ
                        </p>
                    </GlassCard>
                </motion.div>
            </div>
        </LightBackground>
    );
}
