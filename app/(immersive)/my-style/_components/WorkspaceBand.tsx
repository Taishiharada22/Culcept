"use client";

import React from "react";
import { motion } from "framer-motion";
import { vibrateLight } from "../_lib/haptics";
import { springSnappy } from "../_lib/animations";
import { TAB_CONFIG, type TabId, cx } from "../_lib/pageUtils";

/* ─────────────────────── WorkspaceBand ─────────────────────── */

export default function WorkspaceBand({ tab, setTab, tabBarRef }: { tab: TabId; setTab: (tab: TabId) => void; tabBarRef?: React.RefObject<HTMLDivElement | null> }) {
    return (
        <section className="rounded-[24px] border border-white/70 bg-white/82 px-2 py-2 shadow-sm backdrop-blur-xl">
            <div ref={tabBarRef} className="relative flex items-center gap-2 overflow-x-auto scrollbar-hide">
                {TAB_CONFIG.map((entry) => {
                    const active = entry.id === tab;
                    return (
                        <motion.button
                            key={entry.id}
                            type="button"
                            onClick={() => { vibrateLight(); setTab(entry.id); }}
                            whileTap={{ scale: 0.97 }}
                            transition={springSnappy}
                            className={cx(
                                "relative flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left transition-colors",
                                active
                                    ? "border-transparent text-white"
                                    : "border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white"
                            )}
                        >
                            {/* Animated background indicator that slides between tabs */}
                            {active ? (
                                <motion.div
                                    layoutId="tab-indicator"
                                    className="absolute inset-0 rounded-full bg-slate-900 shadow-sm will-change-transform"
                                    style={{ boxShadow: "0 0 12px 2px rgba(99,102,241,0.12)" }}
                                    transition={springSnappy}
                                />
                            ) : null}
                            <span className="relative z-10 text-sm">{entry.icon}</span>
                            <span className="relative z-10 text-[12px] font-bold">{entry.label}</span>
                            <span
                                className={cx(
                                    "relative z-10 hidden rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] sm:inline-block",
                                    active ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-400"
                                )}
                            >
                                {entry.personality}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </section>
    );
}
