"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import HairAnalysisPanel from "@/components/genome/HairAnalysisPanel";
import type { HairRecipe } from "@/lib/hair/hairOptions";
import { HAIR_CATEGORY_LABELS, HAIR_CATEGORY_ORDER } from "@/lib/hair/hairOptions";
import type { AvatarProfileRecord } from "./shared/types";

interface HairInlineSectionProps {
    avatarProfile: AvatarProfileRecord | null;
    onHairSaved?: () => void;
}

export default function HairInlineSection({ avatarProfile, onHairSaved }: HairInlineSectionProps) {
    const [expanded, setExpanded] = useState(false);
    // Track locally saved recipe for immediate summary display
    const [savedRecipe, setSavedRecipe] = useState<HairRecipe | null>(null);

    const tags = avatarProfile?.hair_impression?.summary_tags ?? [];
    const hasDbData = tags.length > 0 || Boolean(avatarProfile?.hair_profile);
    const hasData = hasDbData || (savedRecipe && Object.keys(savedRecipe).length > 0);

    // Build display tags: prefer savedRecipe (just-saved) over DB data
    const displayTags = savedRecipe
        ? HAIR_CATEGORY_ORDER
            .filter((cat) => savedRecipe[cat])
            .map((cat) => savedRecipe[cat]!.label)
        : tags;

    const handleSaved = (recipe: HairRecipe) => {
        setSavedRecipe(recipe);
        onHairSaved?.();
    };

    return (
        <GlassCard className="overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center text-lg">
                        💇
                    </div>
                    <div>
                        <div className="text-sm font-black text-slate-900">髪質</div>
                        <div className="text-xs text-slate-500">
                            {hasData ? displayTags.slice(0, 2).join(" / ") || "設定済み" : "タップして設定"}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasData && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            完了
                        </span>
                    )}
                    {displayTags.slice(0, 3).map((tag: string) => (
                        <GlassBadge key={tag} variant="default">{tag}</GlassBadge>
                    ))}
                    <motion.svg
                        width="16" height="16" viewBox="0 0 16 16"
                        className="text-slate-400"
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                    </motion.svg>
                </div>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden border-t border-slate-100"
                    >
                        <div className="p-4">
                            <HairAnalysisPanel onSaved={handleSaved} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </GlassCard>
    );
}
