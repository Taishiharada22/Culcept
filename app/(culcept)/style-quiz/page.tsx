// app/style-quiz/page.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    LightBackground,
    GlassCard,
    GlassButton,
} from "@/components/ui/glassmorphism-design";

interface Question {
    id: string;
    question: string;
    subtitle?: string;
    type: "image" | "text" | "slider";
    options?: {
        id: string;
        label: string;
        image?: string;
        emoji?: string;
        value?: string;
    }[];
    min?: number;
    max?: number;
    minLabel?: string;
    maxLabel?: string;
}

const QUESTIONS: Question[] = [
    {
        id: "occasion",
        question: "主にどんなシーンで服を着ますか？",
        subtitle: "一番多いシーンを選んでください",
        type: "text",
        options: [
            { id: "casual", label: "カジュアル・普段着", emoji: "👕" },
            { id: "office", label: "オフィス・仕事", emoji: "💼" },
            { id: "date", label: "デート・おでかけ", emoji: "💕" },
            { id: "party", label: "パーティ・イベント", emoji: "🎉" },
        ],
    },
    {
        id: "style",
        question: "どんなスタイルが好き？",
        subtitle: "直感で選んでください",
        type: "text",
        options: [
            { id: "minimal", label: "ミニマル・シンプル", emoji: "⬜" },
            { id: "street", label: "ストリート・カジュアル", emoji: "🧢" },
            { id: "elegant", label: "エレガント・きれいめ", emoji: "✨" },
            { id: "vintage", label: "ヴィンテージ・クラシック", emoji: "🎸" },
        ],
    },
    {
        id: "color",
        question: "好きな色のトーンは？",
        subtitle: "普段選びがちな色を選んでください",
        type: "text",
        options: [
            { id: "mono", label: "モノトーン", emoji: "⬛" },
            { id: "earth", label: "アースカラー", emoji: "🤎" },
            { id: "pastel", label: "パステルカラー", emoji: "🩷" },
            { id: "vivid", label: "ビビッドカラー", emoji: "🔴" },
        ],
    },
    {
        id: "silhouette",
        question: "好みのシルエットは？",
        subtitle: "服のフィット感について",
        type: "text",
        options: [
            { id: "tight", label: "タイトフィット", emoji: "📏" },
            { id: "regular", label: "レギュラーフィット", emoji: "👔" },
            { id: "relaxed", label: "リラックスフィット", emoji: "🧘" },
            { id: "oversized", label: "オーバーサイズ", emoji: "🎽" },
        ],
    },
    {
        id: "budget",
        question: "1着あたりの予算は？",
        subtitle: "トップス1着を買う場合",
        type: "text",
        options: [
            { id: "budget", label: "〜5,000円", emoji: "💰" },
            { id: "mid", label: "5,000〜15,000円", emoji: "💵" },
            { id: "high", label: "15,000〜30,000円", emoji: "💳" },
            { id: "luxury", label: "30,000円〜", emoji: "💎" },
        ],
    },
];

const RESULTS: Record<string, { style: string; icon: string; description: string; colors: string[]; gradient: string }> = {
    minimal: {
        style: "Minimal",
        icon: "⬜",
        description: "シンプルで洗練されたスタイルが似合います。上質な素材と無駄のないデザインがあなたの魅力を引き立てます。",
        colors: ["#1a1a1a", "#ffffff", "#6b7280", "#f5f5f5"],
        gradient: "from-gray-400 to-gray-600",
    },
    street: {
        style: "Street",
        icon: "🧢",
        description: "トレンドを取り入れた自由なスタイルが得意。オーバーサイズやスニーカーでこなれ感を出しましょう。",
        colors: ["#f97316", "#1a1a1a", "#ffffff", "#6366f1"],
        gradient: "from-orange-400 to-indigo-500",
    },
    elegant: {
        style: "Elegant",
        icon: "✨",
        description: "上品で洗練されたスタイルがお似合い。ジャストサイズのアイテムで清潔感のある着こなしを。",
        colors: ["#1e3a5f", "#ffffff", "#d4c4b0", "#1a1a1a"],
        gradient: "from-violet-400 to-indigo-600",
    },
    vintage: {
        style: "Vintage",
        icon: "🎸",
        description: "クラシックな雰囲気が魅力的。レトロなアイテムを現代風にミックスするのが得意。",
        colors: ["#8b4513", "#d4c4b0", "#2d5a27", "#c41e3a"],
        gradient: "from-amber-500 to-rose-600",
    },
};

export default function StyleQuizPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [showResult, setShowResult] = useState(false);
    const [resultStyle, setResultStyle] = useState<keyof typeof RESULTS>("minimal");

    const currentQuestion = QUESTIONS[currentStep];
    const progress = ((currentStep + 1) / QUESTIONS.length) * 100;

    const handleAnswer = (optionId: string) => {
        setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionId }));

        if (currentStep < QUESTIONS.length - 1) {
            setTimeout(() => setCurrentStep((prev) => prev + 1), 300);
        } else {
            setTimeout(() => {
                const style = answers.style || optionId;
                setResultStyle(style as keyof typeof RESULTS);
                setShowResult(true);
            }, 300);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const result = RESULTS[resultStyle] || RESULTS.minimal;

    return (
        <LightBackground>
            <div className="min-h-screen flex flex-col">
                {/* Header */}
                <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-white/60 shadow-sm p-4">
                    <div className="max-w-2xl mx-auto flex items-center justify-between">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0 || showResult}
                            className="w-10 h-10 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all disabled:opacity-30 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>

                        {!showResult && (
                            <div className="flex-1 mx-4">
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                                <p className="text-center text-xs text-gray-500 mt-2">
                                    {currentStep + 1} / {QUESTIONS.length}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={() => router.push("/style-profile")}
                            className="w-10 h-10 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 flex items-center justify-center p-4 pb-16">
                    <AnimatePresence mode="wait">
                        {!showResult ? (
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                className="w-full max-w-2xl"
                            >
                                {/* Question */}
                                <div className="text-center mb-8">
                                    <motion.h2
                                        className="text-2xl md:text-3xl font-black text-gray-800 mb-2"
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        {currentQuestion.question}
                                    </motion.h2>
                                    {currentQuestion.subtitle && (
                                        <motion.p
                                            className="text-gray-500"
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            {currentQuestion.subtitle}
                                        </motion.p>
                                    )}
                                </div>

                                {/* Options */}
                                <div className="grid grid-cols-2 gap-4">
                                    {currentQuestion.options?.map((option, index) => (
                                        <motion.button
                                            key={option.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 * index }}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleAnswer(option.id)}
                                            className={`relative p-6 rounded-2xl overflow-hidden group transition-all bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg hover:shadow-xl ${
                                                answers[currentQuestion.id] === option.id
                                                    ? "ring-2 ring-violet-500 bg-violet-50/50"
                                                    : ""
                                            }`}
                                        >
                                            {/* Hover gradient */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 to-pink-500/0 group-hover:from-violet-500/5 group-hover:to-pink-500/5 transition-all" />

                                            {/* Content */}
                                            <div className="relative text-center">
                                                <span className="text-4xl mb-3 block">{option.emoji}</span>
                                                <span className="font-bold text-gray-700">{option.label}</span>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="w-full max-w-2xl"
                            >
                                <GlassCard variant="gradient" padding="none" className="overflow-hidden">
                                    <div className="relative p-8 sm:p-12 text-center">
                                        {/* 背景グラデーション */}
                                        <div className={`absolute inset-0 bg-gradient-to-br ${result.gradient} opacity-10`} />

                                        {/* Celebration */}
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: "spring", delay: 0.2 }}
                                            className="relative text-8xl mb-6"
                                        >
                                            {result.icon}
                                        </motion.div>

                                        <motion.h2
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="text-2xl md:text-3xl font-bold text-gray-500 mb-2"
                                        >
                                            Your Style is
                                        </motion.h2>

                                        <motion.h1
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className={`text-4xl md:text-6xl font-black bg-gradient-to-r ${result.gradient} bg-clip-text text-transparent mb-6`}
                                        >
                                            {result.style}
                                        </motion.h1>

                                        <motion.p
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.5 }}
                                            className="text-gray-600 text-lg mb-8 max-w-md mx-auto"
                                        >
                                            {result.description}
                                        </motion.p>

                                        {/* Color palette */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.6 }}
                                            className="flex justify-center gap-3 mb-8"
                                        >
                                            {result.colors.map((color, i) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ delay: 0.7 + i * 0.1 }}
                                                    className="w-12 h-12 rounded-xl shadow-lg border border-white/60"
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </motion.div>

                                        {/* CTA buttons */}
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            transition={{ delay: 0.8 }}
                                            className="flex flex-col sm:flex-row gap-4 justify-center"
                                        >
                                            <GlassButton
                                                onClick={() => router.push("/style-profile")}
                                                variant="gradient"
                                                size="lg"
                                            >
                                                🧬 Style分析を見る
                                            </GlassButton>

                                            <GlassButton
                                                onClick={() => router.push("/start")}
                                                variant="secondary"
                                                size="lg"
                                            >
                                                👆 スワイプで学習させる
                                            </GlassButton>
                                        </motion.div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </LightBackground>
    );
}
