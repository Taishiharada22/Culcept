// app/messages/MessagesPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Conversation, Message } from "@/types/messages";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

type Props = {
    conversations: Conversation[];
    userId: string;
};

export default function MessagesPageClient({ conversations, userId }: Props) {
    const [selectedConversation, setSelectedConversation] = React.useState<string | null>(null);
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [messageText, setMessageText] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const selectedConv = conversations.find((c) => c.id === selectedConversation);

    // Load messages when conversation is selected
    React.useEffect(() => {
        if (!selectedConversation) return;

        setLoading(true);
        fetch(`/api/messages?conversation_id=${selectedConversation}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.ok) {
                    setMessages(data.messages || []);
                }
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, [selectedConversation]);

    // Scroll to bottom when messages change
    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageText.trim() || !selectedConversation) return;

        setSending(true);

        try {
            const res = await fetch("/api/messages", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    conversation_id: selectedConversation,
                    content: messageText.trim(),
                }),
            });

            const data = await res.json();

            if (data.ok && data.message) {
                setMessages((prev) => [...prev, data.message]);
                setMessageText("");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-gray-800">Messages</h1>
                        <p className="text-xs text-gray-400">取引メッセージ</p>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            {/* メインコンテンツ */}
            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
                <FadeInView>
                    <GlassCard className="overflow-hidden">
                        <div className="flex h-[calc(100vh-160px)]">
                            {/* Conversations List */}
                            <div className="w-80 border-r border-gray-200/50 overflow-y-auto">
                                <div className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-200/50 p-4">
                                    <h2 className="text-sm font-semibold text-gray-500">会話一覧</h2>
                                </div>

                                {conversations.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <motion.div
                                            animate={{ y: [0, -5, 0] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="text-4xl mb-4 opacity-30"
                                        >
                                            💬
                                        </motion.div>
                                        <p className="text-sm text-gray-400">メッセージはありません</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {conversations.map((conv, index) => (
                                            <motion.button
                                                key={conv.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                onClick={() => setSelectedConversation(conv.id)}
                                                className={`w-full p-4 text-left transition-all duration-300 hover:bg-gray-50 ${
                                                    selectedConversation === conv.id
                                                        ? "bg-gradient-to-r from-violet-50 to-transparent border-l-2 border-violet-500"
                                                        : ""
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {conv.other_user_avatar ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={conv.other_user_avatar}
                                                            alt={conv.other_user_name || "User"}
                                                            className="h-12 w-12 rounded-xl border border-gray-200 object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-medium text-white">
                                                            {(conv.other_user_name || "?")[0].toUpperCase()}
                                                        </div>
                                                    )}

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                                            <span className="text-sm font-medium text-gray-800 truncate">
                                                                {conv.other_user_name || "User"}
                                                            </span>
                                                            {(conv.unread_count || 0) > 0 && (
                                                                <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-xs font-medium text-white shadow-lg shadow-violet-500/30">
                                                                    {conv.unread_count}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {conv.product_title && (
                                                            <div className="text-xs text-gray-400 truncate">
                                                                {conv.product_title}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Messages View */}
                            <div className="flex-1 flex flex-col bg-gray-50/50">
                                {!selectedConv ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="text-center">
                                            <motion.div
                                                animate={{ scale: [1, 1.1, 1] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="text-6xl mb-4 opacity-20"
                                            >
                                                💬
                                            </motion.div>
                                            <p className="text-gray-400">会話を選択してください</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Header */}
                                        <div className="border-b border-gray-200/50 bg-white/80 backdrop-blur-sm p-4">
                                            <div className="flex items-center gap-4">
                                                {selectedConv.other_user_avatar ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={selectedConv.other_user_avatar}
                                                        alt={selectedConv.other_user_name || "User"}
                                                        className="h-12 w-12 rounded-xl border border-gray-200 object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-medium text-white">
                                                        {(selectedConv.other_user_name || "?")[0].toUpperCase()}
                                                    </div>
                                                )}

                                                <div className="flex-1">
                                                    <div className="font-semibold text-gray-800">
                                                        {selectedConv.other_user_name || "User"}
                                                    </div>
                                                    {selectedConv.product_title && (
                                                        <div className="text-sm text-gray-400">
                                                            {selectedConv.product_title}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Messages */}
                                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                            {loading ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <div className="flex items-center gap-3 text-gray-400">
                                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                        </svg>
                                                        読み込み中...
                                                    </div>
                                                </div>
                                            ) : messages.length === 0 ? (
                                                <div className="text-center py-8 text-sm text-gray-400">
                                                    メッセージを送信して会話を始めましょう
                                                </div>
                                            ) : (
                                                <AnimatePresence>
                                                    {messages.map((msg, index) => {
                                                        const isMine = msg.sender_id === userId;

                                                        return (
                                                            <motion.div
                                                                key={msg.id}
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ delay: index * 0.02 }}
                                                                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                                                            >
                                                                <div
                                                                    className={`max-w-[70%] rounded-2xl px-5 py-3 ${
                                                                        isMine
                                                                            ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/20"
                                                                            : "bg-white text-gray-800 shadow-md"
                                                                    }`}
                                                                >
                                                                    <p className="text-sm break-words leading-relaxed">
                                                                        {msg.content}
                                                                    </p>
                                                                    <time className={`block mt-1 text-[10px] ${isMine ? "text-white/60" : "text-gray-400"}`}>
                                                                        {new Date(msg.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                                                    </time>
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </AnimatePresence>
                                            )}
                                            <div ref={messagesEndRef} />
                                        </div>

                                        {/* Input */}
                                        <form onSubmit={handleSend} className="border-t border-gray-200/50 bg-white/80 backdrop-blur-sm p-4">
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={messageText}
                                                    onChange={(e) => setMessageText(e.target.value)}
                                                    placeholder="メッセージを入力..."
                                                    disabled={sending}
                                                    className="flex-1 rounded-xl bg-gray-100 border border-gray-200 px-5 py-3.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 disabled:opacity-50 transition-all"
                                                />
                                                <motion.button
                                                    type="submit"
                                                    disabled={!messageText.trim() || sending}
                                                    className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3.5 text-sm font-semibold text-white hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25"
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                >
                                                    {sending ? (
                                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                        </svg>
                                                    ) : (
                                                        "送信"
                                                    )}
                                                </motion.button>
                                            </div>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    </GlassCard>
                </FadeInView>
            </main>
        </LightBackground>
    );
}
