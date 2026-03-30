"use client";

import { motion } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";
import EmbeddedFaceHub from "@/app/(culcept)/body-color/avatar/_components/EmbeddedFaceHub";
import type { ViewId, AvatarFaceSubTab, FacePhenotypeRecord, EyeProfileRecord } from "./shared/types";
import type { FacePhenotypeData } from "@/types/face-phenotype";
import { ScrollReveal } from "./shared/visuals";

interface FaceDetailViewProps {
    heroRealFaceImage: string | null;
    heroAvatarImage: string | null;
    facePhenotype: FacePhenotypeRecord;
    eyeProfile: EyeProfileRecord;
    requestedFaceSubTab: AvatarFaceSubTab;
    faceCompletedCategories: string[];
    onPersisted: (phenotype: FacePhenotypeData, cats: string[]) => void;
    onEyePersisted: (eyeType: string, eyeColor: string | null) => void;
    onLandmarksDetected: (landmarks: Array<{ x: number; y: number; z: number }>) => void;
    onNavigateBack: () => void;
}

export default function FaceDetailView({
    heroRealFaceImage,
    heroAvatarImage,
    facePhenotype,
    eyeProfile,
    requestedFaceSubTab,
    faceCompletedCategories,
    onPersisted,
    onEyePersisted,
    onLandmarksDetected,
    onNavigateBack,
}: FaceDetailViewProps) {
    return (
        <motion.div
            key="face-detail"
            className="max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-32 space-y-6"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Back button */}
            <button
                type="button"
                onClick={onNavigateBack}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                ダッシュボードに戻る
            </button>

            {/* Visual header */}
            <ScrollReveal>
                <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-fuchsia-50 via-violet-50 to-white p-6 border border-fuchsia-100/50">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-fuchsia-200/30 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="relative flex items-center gap-4">
                        <motion.div
                            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-500 flex items-center justify-center text-2xl shadow-lg shadow-fuchsia-500/20"
                            animate={{ rotate: [0, -5, 5, 0] }}
                            transition={{ duration: 4, repeat: Infinity }}
                        >🧑</motion.div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-400">Face Phenotype</div>
                            <div className="text-lg font-black text-slate-900">顔の特徴マッピング</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                                {faceCompletedCategories.length > 0
                                    ? `${faceCompletedCategories.length}/5 カテゴリ完了 — ${faceCompletedCategories.join("・")}`
                                    : "目・輪郭・眉・鼻・口の5カテゴリを入力"}
                            </div>
                        </div>
                    </div>
                    {/* Mini progress */}
                    <div className="mt-4 flex gap-1">
                        {["eye", "face", "brow", "nose", "mouth"].map((cat) => (
                            <motion.div
                                key={cat}
                                className={`h-1.5 flex-1 rounded-full ${faceCompletedCategories.includes(cat) ? "bg-gradient-to-r from-fuchsia-400 to-violet-400" : "bg-slate-200"}`}
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ duration: 0.5 }}
                                style={{ transformOrigin: "left" }}
                            />
                        ))}
                    </div>
                </div>
            </ScrollReveal>

            <EmbeddedFaceHub
                defaultImage={heroRealFaceImage}
                avatarImage={heroAvatarImage}
                initialPhenotype={facePhenotype?.phenotype ?? null}
                initialEyeType={eyeProfile?.eye_type ?? null}
                initialEyeColor={eyeProfile?.eye_color ?? null}
                initialFeature={requestedFaceSubTab}
                onPersisted={onPersisted}
                onEyePersisted={onEyePersisted}
                onLandmarksDetected={onLandmarksDetected}
            />
        </motion.div>
    );
}
