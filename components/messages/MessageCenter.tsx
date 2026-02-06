// components/messages/MessageCenter.tsx
"use client";

import * as React from "react";
import type { Conversation, Message } from "@/types/messages";

type Props = {
    conversations: Conversation[];
    userId: string;
};

export default function MessageCenter({ conversations, userId }: Props) {
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
        <div className="flex h-[calc(100vh-140px)] rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {/* Conversations List */}
            <div className="w-80 border-r border-white/[0.06] bg-white/[0.02] overflow-y-auto">
                <div className="sticky top-0 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/[0.06] p-4">
                    <h2 className="text-sm font-semibold text-white/80">
                        会話一覧
                    </h2>
                </div>

                {conversations.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-3 opacity-30">💬</div>
                        <p className="text-sm text-white/40">
                            メッセージはありません
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.04]">
                        {conversations.map((conv) => (
                            <button
                                key={conv.id}
                                onClick={() => setSelectedConversation(conv.id)}
                                className={`w-full p-4 text-left transition-all hover:bg-white/[0.04] ${
                                    selectedConversation === conv.id
                                        ? "bg-white/[0.06] border-l-2 border-white/30"
                                        : ""
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    {conv.other_user_avatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={conv.other_user_avatar}
                                            alt={conv.other_user_name || "User"}
                                            className="h-10 w-10 rounded-full border border-white/10 object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-sm font-medium text-white/60">
                                            {(conv.other_user_name || "?")[0].toUpperCase()}
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <span className="text-sm font-medium text-white/90 truncate">
                                                {conv.other_user_name || "User"}
                                            </span>
                                            {(conv.unread_count || 0) > 0 && (
                                                <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-white text-xs font-medium text-black">
                                                    {conv.unread_count}
                                                </span>
                                            )}
                                        </div>

                                        {conv.product_title && (
                                            <div className="text-xs text-white/40 truncate">
                                                {conv.product_title}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Messages View */}
            <div className="flex-1 flex flex-col bg-[#0a0a0f]">
                {!selectedConv ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-5xl mb-4 opacity-20">💬</div>
                            <p className="text-sm text-white/40">
                                会話を選択してください
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="border-b border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="flex items-center gap-3">
                                {selectedConv.other_user_avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={selectedConv.other_user_avatar}
                                        alt={selectedConv.other_user_name || "User"}
                                        className="h-10 w-10 rounded-full border border-white/10 object-cover"
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-sm font-medium text-white/60">
                                        {(selectedConv.other_user_name || "?")[0].toUpperCase()}
                                    </div>
                                )}

                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white/90">
                                        {selectedConv.other_user_name || "User"}
                                    </div>
                                    {selectedConv.product_title && (
                                        <div className="text-xs text-white/40">
                                            {selectedConv.product_title}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="flex items-center gap-2 text-sm text-white/40">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        読み込み中...
                                    </div>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-8 text-sm text-white/40">
                                    メッセージを送信して会話を始めましょう
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const isMine = msg.sender_id === userId;

                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                                                    isMine
                                                        ? "bg-white text-black"
                                                        : "bg-white/[0.08] text-white/90"
                                                }`}
                                            >
                                                <p className="text-sm break-words">
                                                    {msg.content}
                                                </p>
                                                <time className={`block mt-1 text-[10px] ${isMine ? "text-black/40" : "text-white/30"}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                                </time>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <form onSubmit={handleSend} className="border-t border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    placeholder="メッセージを入力..."
                                    disabled={sending}
                                    className="flex-1 rounded-xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 disabled:opacity-50 transition-all"
                                />
                                <button
                                    type="submit"
                                    disabled={!messageText.trim() || sending}
                                    className="rounded-xl bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {sending ? (
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    ) : (
                                        "送信"
                                    )}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
