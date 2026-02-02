// app/stylist/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    cards?: CardSuggestion[];
    timestamp: Date;
}

interface CardSuggestion {
    card_id: string;
    image_url: string;
    tags: string[];
    reason: string;
}

const STYLE_PRESETS = [
    { label: "カジュアル", emoji: "👕", prompt: "カジュアルなコーデを提案して" },
    { label: "フォーマル", emoji: "👔", prompt: "フォーマルなコーデを提案して" },
    { label: "ストリート", emoji: "🧢", prompt: "ストリート系のコーデを提案して" },
    { label: "ミニマル", emoji: "⬜", prompt: "ミニマルなコーデを提案して" },
    { label: "ヴィンテージ", emoji: "🎸", prompt: "ヴィンテージ風のコーデを提案して" },
];

export default function StylistPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "こんにちは！AIスタイリストです 👋\n\nどんなコーディネートをお探しですか？シーンやお好みを教えてください。",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

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
            const response = await fetch("/api/stylist/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: messageText }),
            });

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.message,
                cards: data.suggestions,
                timestamp: new Date(),
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

    return (
        <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex flex-col">
            {/* ヘッダー */}
            <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xl">
                        🤖
                    </div>
                    <div>
                        <h1 className="font-bold">AIスタイリスト</h1>
                        <p className="text-xs text-gray-500">あなたの好みを学習してコーデ提案</p>
                    </div>
                </div>
            </div>

            {/* メッセージエリア */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-2xl mx-auto space-y-4">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex ${
                                message.role === "user" ? "justify-end" : "justify-start"
                            }`}
                        >
                            <div
                                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                    message.role === "user"
                                        ? "bg-purple-500 text-white"
                                        : "bg-white shadow-sm"
                                }`}
                            >
                                <p className="whitespace-pre-wrap">{message.content}</p>

                                {/* カード提案 */}
                                {message.cards && message.cards.length > 0 && (
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        {message.cards.map((card) => (
                                            <div
                                                key={card.card_id}
                                                className="bg-gray-50 rounded-xl overflow-hidden"
                                            >
                                                <img
                                                    src={card.image_url}
                                                    alt={card.card_id}
                                                    className="w-full aspect-square object-cover"
                                                />
                                                <div className="p-2">
                                                    <p className="text-xs text-gray-600">
                                                        {card.reason}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white shadow-sm rounded-2xl px-4 py-3">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                    <span
                                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                        style={{ animationDelay: "0.1s" }}
                                    />
                                    <span
                                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                        style={{ animationDelay: "0.2s" }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* スタイルプリセット */}
            {messages.length <= 2 && (
                <div className="px-4 py-3 bg-white border-t">
                    <div className="max-w-2xl mx-auto">
                        <p className="text-sm text-gray-500 mb-2">クイックスタート:</p>
                        <div className="flex flex-wrap gap-2">
                            {STYLE_PRESETS.map((preset) => (
                                <button
                                    key={preset.label}
                                    onClick={() => handleSend(preset.prompt)}
                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition-colors"
                                >
                                    {preset.emoji} {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 入力エリア */}
            <div className="bg-white border-t px-4 py-4 sticky bottom-0">
                <div className="max-w-2xl mx-auto">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="flex gap-2"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="どんなコーデが欲しい？"
                            className="flex-1 px-4 py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="px-6 py-3 bg-purple-500 text-white rounded-full font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            送信
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
