"use client";

import React from "react";
import { motion } from "framer-motion";
import { vibrateLight } from "../_lib/haptics";
import { springSnappy } from "../_lib/animations";
import { TAB_CONFIG, type TabId, cx } from "../_lib/pageUtils";

/* ─────────────────────── WorkspaceBand ─────────────────────── */

export default function WorkspaceBand({ tab, setTab, tabBarRef }: { tab: TabId; setTab: (tab: TabId) => void; tabBarRef?: React.RefObject<HTMLDivElement | null> }) {
    return (
        <div ref={tabBarRef} className="flex items-center gap-1">
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
                            "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                            active
                                ? "text-white"
                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/60"
                        )}
                    >
                        {active && (
                            <motion.div
                                layoutId="tab-indicator"
                                className="absolute inset-0 rounded-full bg-slate-900"
                                transition={springSnappy}
                            />
                        )}
                        <span className="relative z-10 text-[13px]">{entry.icon}</span>
                        <span className="relative z-10">{entry.label}</span>
                    </motion.button>
                );
            })}
        </div>
    );
}
