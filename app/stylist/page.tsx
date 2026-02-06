// app/stylist/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
    GlassTabs,
    GlassInput,
} from "@/components/ui/glassmorphism-design";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    cards?: CardSuggestion[];
    timestamp: Date;
    context?: {
        scene?: string;
        weather?: string;
        budget?: { min: number; max: number };
    };
}

interface CardSuggestion {
    card_id: string;
    image_url: string;
    tags: string[];
    reason: string;
    price?: number;
    category?: string;
}

const STYLE_PRESETS = [
    { label: "カジュアル", emoji: "👕", prompt: "カジュアルなコーデを提案して", color: "from-blue-500 to-cyan-500" },
    { label: "フォーマル", emoji: "👔", prompt: "フォーマルなコーデを提案して", color: "from-slate-500 to-gray-600" },
    { label: "ストリート", emoji: "🧢", prompt: "ストリート系のコーデを提案して", color: "from-orange-500 to-red-500" },
    { label: "ミニマル", emoji: "⬜", prompt: "ミニマルなコーデを提案して", color: "from-gray-400 to-slate-500" },
    { label: "ヴィンテージ", emoji: "🎸", prompt: "ヴィンテージ風のコーデを提案して", color: "from-amber-600 to-orange-700" },
];

const SCENE_PRESETS = [
    { label: "デート", emoji: "💕", prompt: "デートにぴったりのコーデを提案して", color: "from-pink-500 to-rose-500" },
    { label: "仕事", emoji: "💼", prompt: "仕事用のオフィスカジュアルを提案して", color: "from-indigo-500 to-blue-600" },
    { label: "カフェ", emoji: "☕", prompt: "カフェに行くときのおしゃれなコーデ", color: "from-amber-500 to-orange-500" },
    { label: "飲み会", emoji: "🍻", prompt: "飲み会にぴったりのコーデを提案して", color: "from-yellow-500 to-amber-500" },
    { label: "旅行", emoji: "✈️", prompt: "旅行で使えるコーデを提案して", color: "from-cyan-500 to-teal-500" },
];

const QUICK_FILTERS = [
    { label: "予算1万円以内", emoji: "💰", color: "emerald" },
    { label: "雨の日", emoji: "🌧️", color: "blue" },
    { label: "暑い日", emoji: "☀️", color: "orange" },
    { label: "寒い日", emoji: "❄️", color: "cyan" },
];

export default function StylistPage() {
    const searchParams = useSearchParams();
    const initialPrompt = searchParams.get("prompt");

    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "こんにちは！AIスタイリストです 👋\n\nどんなコーディネートをお探しですか？\n\nシーンやスタイル、予算を教えてください。例えば：\n• 「デートにぴったりのコーデ」\n• 「予算1万円以内でカジュアルに」\n• 「雨の日のオフィスコーデ」",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [activePresetTab, setActivePresetTab] = useState<"style" | "scene">("scene");
    const [savedCoordinates, setSavedCoordinates] = useState<string[]>([]);
    const [showPresets, setShowPresets] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const hasInitialPromptProcessed = useRef(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ローカルストレージから保存したコーデを読み込み
    useEffect(() => {
        const saved = localStorage.getItem("saved_coordinates");
        if (saved) {
            setSavedCoordinates(JSON.parse(saved));
        }
    }, []);

    // URLパラメータからの初期プロンプト処理
    useEffect(() => {
        if (initialPrompt && !hasInitialPromptProcessed.current) {
            hasInitialPromptProcessed.current = true;
            setTimeout(() => {
                handleSend(initialPrompt);
            }, 500);
        }
    }, [initialPrompt]);

    const handleSend = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        setShowPresets(false);

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: messageText,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            // 会話履歴を送信（文脈理解のため）
            const conversationHistory = messages
                .filter((m) => m.role === "user")
                .slice(-5)
                .map((m) => ({ content: m.content }));

            const response = await fetch("/api/stylist/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: messageText,
                    conversationHistory,
                }),
            });

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.message,
                cards: data.suggestions,
                timestamp: new Date(),
                context: data.context,
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error("Chat error:", error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "すみません、エラーが発生しました。もう一度お試しください。",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickFilter = (filter: string) => {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMessage) {
            handleSend(`${lastUserMessage.content}で${filter}`);
        } else {
            handleSend(`${filter}のコーデを提案して`);
        }
    };

    const handleSaveCoordinate = (cards: CardSuggestion[]) => {
        const coordId = Date.now().toString();
        const newSaved = [...savedCoordinates, coordId];
        setSavedCoordinates(newSaved);
        localStorage.setItem("saved_coordinates", JSON.stringify(newSaved));
        localStorage.setItem(
            `coordinate_${coordId}`,
            JSON.stringify({
                id: coordId,
                cards,
                savedAt: new Date().toISOString(),
            })
        );
    };

    const formatPrice = (price: number) => {
        return `¥${price.toLocaleString()}`;
    };

    const handleReset = () => {
        setMessages([
            {
                id: "welcome",
                role: "assistant",
                content:
                    "会話をリセットしました！\n\n新しいコーデを探しましょう。どんなシーンで使いますか？",
                timestamp: new Date(),
            },
        ]);
        setShowPresets(true);
    };

    const presetTabs = [
        { id: "scene", label: "シーンで選ぶ", icon: <span>📍</span> },
        { id: "style", label: "スタイルで選ぶ", icon: <span>👕</span> },
    ];

    return (
        <LightBackground>
            <div className="min-h-screen flex flex-col">
                <GlassNavbar>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/ai-hub"
                                className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <motion.div
                                className="w-12 h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-purple-500/30"
                                whileHover={{ scale: 1.1, rotate: 5 }}
                            >
                                🤖
                            </motion.div>
                            <div>
                                <h1 className="font-bold text-lg text-slate-900">AI Stylist</h1>
                                <p className="text-xs text-slate-400">シーン・予算・天気に合わせて提案</p>
                            </div>
                        </div>
                        <GlassButton variant="ghost" size="sm" onClick={handleReset}>
                            🔄 リセット
                        </GlassButton>
                    </div>
                </GlassNavbar>

                <div className="h-20" />

                <div className="flex-1 overflow-y-auto px-4">
                    <div className="max-w-4xl mx-auto space-y-4 pb-6">
                        <AnimatePresence>
                            {messages.map((message, index) => (
                                <motion.div
                                    key={message.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-3xl px-5 py-4 ${
                                            message.role === "user"
                                                ? "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20"
                                                : "bg-white/80 backdrop-blur-lg border border-white/60 text-slate-700 shadow-sm"
                                        }`}
                                    >
                                        {message.context && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {message.context.scene && (
                                                    <GlassBadge variant="gradient" size="sm">
                                                        📍 {message.context.scene}
                                                    </GlassBadge>
                                                )}
                                                {message.context.weather && (
                                                    <GlassBadge variant="info" size="sm">
                                                        🌤️ {message.context.weather}
                                                    </GlassBadge>
                                                )}
                                                {message.context.budget && (
                                                    <GlassBadge variant="success" size="sm">
                                                        💰 〜¥{message.context.budget.max?.toLocaleString()}
                                                    </GlassBadge>
                                                )}
                                            </div>
                                        )}

                                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                            {message.content.split("**").map((part, i) =>
                                                i % 2 === 1 ? (
                                                    <strong key={i} className="font-bold">{part}</strong>
                                                ) : (
                                                    <span key={i}>{part}</span>
                                                )
                                            )}
                                        </div>

                                        {message.cards && message.cards.length > 0 && (
                                            <div className="mt-4">
                                                <div className="grid grid-cols-2 gap-3">
                                                    {message.cards.map((card, cardIndex) => (
                                                        <motion.div
                                                            key={card.card_id}
                                                            initial={{ opacity: 0, scale: 0.9 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ delay: cardIndex * 0.08 }}
                                                            className="rounded-2xl bg-white/80 border border-white/60 shadow-sm overflow-hidden group cursor-pointer hover:shadow-md transition-all"
                                                        >
                                                            <div className="relative">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={card.image_url}
                                                                    alt={card.card_id}
                                                                    className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
                                                                />
                                                                {card.category && (
                                                                    <span className="absolute top-2 left-2 text-xs px-2 py-0.5 bg-black/60 text-white rounded-full">
                                                                        {card.category}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="p-3">
                                                                <p className="text-xs text-slate-500 line-clamp-2">
                                                                    {card.reason}
                                                                </p>
                                                                {card.price && (
                                                                    <p className="text-sm font-bold text-purple-600 mt-2">
                                                                        {formatPrice(card.price)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                </div>

                                                <GlassButton
                                                    onClick={() => handleSaveCoordinate(message.cards!)}
                                                    variant="secondary"
                                                    size="sm"
                                                    fullWidth
                                                    className="mt-4"
                                                >
                                                    💾 このコーデを保存
                                                </GlassButton>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex justify-start"
                            >
                                <div className="bg-white/80 backdrop-blur-lg border border-white/60 rounded-3xl px-5 py-4 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1.5">
                                            <motion.span
                                                className="w-2.5 h-2.5 bg-purple-400 rounded-full"
                                                animate={{ y: [0, -8, 0] }}
                                                transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                                            />
                                            <motion.span
                                                className="w-2.5 h-2.5 bg-pink-400 rounded-full"
                                                animate={{ y: [0, -8, 0] }}
                                                transition={{ repeat: Infinity, duration: 0.6, delay: 0.1 }}
                                            />
                                            <motion.span
                                                className="w-2.5 h-2.5 bg-cyan-400 rounded-full"
                                                animate={{ y: [0, -8, 0] }}
                                                transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                                            />
                                        </div>
                                        <span className="text-sm text-slate-500">コーデを考え中...</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {messages.length > 2 && !isLoading && (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="px-4 pb-4"
                    >
                        <div className="max-w-4xl mx-auto">
                            <GlassCard className="p-4">
                                <p className="text-xs text-slate-500 mb-2">条件を追加:</p>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_FILTERS.map((filter) => (
                                        <GlassButton
                                            key={filter.label}
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleQuickFilter(filter.label)}
                                        >
                                            {filter.emoji} {filter.label}
                                        </GlassButton>
                                    ))}
                                </div>
                            </GlassCard>
                        </div>
                    </motion.div>
                )}

                <AnimatePresence>
                    {showPresets && messages.length <= 2 && (
                        <motion.div
                            initial={{ y: 40, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 40, opacity: 0 }}
                            className="px-4 pb-4"
                        >
                            <div className="max-w-4xl mx-auto">
                                <GlassCard className="p-4">
                                    <GlassTabs
                                        tabs={presetTabs}
                                        activeTab={activePresetTab}
                                        onChange={(id) =>
                                            setActivePresetTab(id === "style" ? "style" : "scene")
                                        }
                                    />
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {(activePresetTab === "scene" ? SCENE_PRESETS : STYLE_PRESETS).map(
                                            (preset, index) => (
                                                <motion.button
                                                    key={preset.label}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.05 }}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleSend(preset.prompt)}
                                                    className={`px-4 py-2.5 bg-gradient-to-r ${preset.color} rounded-full text-sm font-medium text-white transition-all shadow-lg hover:shadow-xl`}
                                                >
                                                    {preset.emoji} {preset.label}
                                                </motion.button>
                                            )
                                        )}
                                    </div>
                                </GlassCard>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="sticky bottom-0 z-20 px-4 pb-6"
                >
                    <div className="max-w-4xl mx-auto">
                        <GlassCard className="p-3">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSend();
                                }}
                                className="flex flex-col sm:flex-row gap-3 items-stretch"
                            >
                                <GlassInput
                                    className="flex-1"
                                    placeholder="シーン、スタイル、予算などを入力..."
                                    value={input}
                                    onChange={(value) => setInput(value)}
                                    disabled={isLoading}
                                />
                                <GlassButton
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    variant="gradient"
                                    size="md"
                                >
                                    送信
                                </GlassButton>
                            </form>
                            <p className="text-xs text-slate-400 text-center mt-2">
                                💡 例: 「デートで使える1万円以内のコーデ」「雨の日のオフィスカジュアル」
                            </p>
                        </GlassCard>
                    </div>
                </motion.div>
            </div>
        </LightBackground>
    );
}
