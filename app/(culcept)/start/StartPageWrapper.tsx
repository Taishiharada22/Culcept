// app/start/StartPageWrapper.tsx
"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import {
    LightBackground,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";

interface StartPageWrapperProps {
    children: ReactNode;
}

export default function StartPageWrapper({ children }: StartPageWrapperProps) {
    return (
        <LightBackground>
            {/* メインコンテンツ */}
            <motion.main
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="max-w-4xl mx-auto px-4 sm:px-6 pb-40 pt-6"
            >
                {children}
            </motion.main>

            {/* ヒント & フローティングナビ */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3"
            >
                {/* ヒント */}
                <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-500/10 to-cyan-500/10 backdrop-blur-xl border border-white/60 text-xs text-gray-600 shadow-lg"
                >
                    <span className="mr-1">👆</span> スワイプするほど精度が上がります
                </motion.div>

                {/* ナビ */}
                <FloatingNavLight items={MAIN_NAV} activeHref="/start" />
            </motion.div>
        </LightBackground>
    );
}
