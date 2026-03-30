"use client";

import { motion } from "framer-motion";
import { PresenceCard, PresenceChip } from "./Primitives";
import { PRESENCE_SCREENSHOT } from "../_lib/presenceDefaults";
import { L } from "../_lib/presenceI18n";

interface StyleDna {
    body_type?: string;
    body_subtype?: string;
    pc_season?: string;
    pc_base?: string;
    style_score?: number;
    top_lanes?: string[];
}

interface PresenceHeroProps {
    styleDna?: StyleDna | null;
}

export default function PresenceHero({ styleDna }: PresenceHeroProps) {
    const content = PRESENCE_SCREENSHOT.hero;

    // Dynamic chips from API data, with static fallback
    const chips = styleDna
        ? [
              styleDna.body_type || content.chips[0],
              styleDna.pc_season || content.chips[1],
              `${L.hero.styleScore} ${styleDna.style_score ?? content.chips[2]?.replace(/[^0-9%]/g, "")}`,
          ]
        : content.chips.map((chip, i) =>
              i === content.chips.length - 1 && chip.includes("%")
                  ? `${L.hero.styleScore} ${chip}`
                  : chip
          );

    return (
        <PresenceCard padding="lg" data-testid="presence-hero">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.28),transparent_36%),radial-gradient(circle_at_top_right,rgba(196,181,253,0.3),transparent_42%),radial-gradient(circle_at_bottom,rgba(251,207,232,0.26),transparent_42%)] dark:opacity-30" />

            <div className="relative flex flex-col items-center text-center">
                {/* Aura badge */}
                <motion.div
                    animate={{
                        boxShadow: [
                            "0 18px 45px rgba(168,85,247,0.18)",
                            "0 18px 60px rgba(168,85,247,0.28)",
                            "0 18px 45px rgba(168,85,247,0.18)",
                        ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="inline-flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-sky-200 via-violet-300 to-pink-200 p-[1.5px]"
                >
                    <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95">
                        <span className="text-2xl font-bold tracking-[-0.04em] text-slate-900 sm:text-3xl dark:text-white">
                            {content.archetype}
                        </span>
                        <span className="text-xs font-bold tracking-[0.32em] text-violet-500">
                            {content.group}
                        </span>
                    </div>
                </motion.div>

                <h2 className="mt-6 max-w-2xl text-2xl font-bold leading-[1.35] tracking-[-0.03em] text-slate-950 sm:text-3xl dark:text-white">
                    {content.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-8 text-slate-600 dark:text-slate-400">
                    {content.description}
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {chips.map((chip) => (
                        <PresenceChip key={chip}>{chip}</PresenceChip>
                    ))}
                </div>

                {/* Scroll guidance */}
                <motion.div
                    className="mt-6 flex flex-col items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.6 }}
                >
                    <span className="text-xs font-bold text-violet-400 dark:text-violet-500">
                        {L.hero.scrollHint}
                    </span>
                    <motion.span
                        className="text-violet-400"
                        animate={{ y: [0, 4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                        ↓
                    </motion.span>
                </motion.div>
            </div>
        </PresenceCard>
    );
}
