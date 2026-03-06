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
        <div className="flex h-[600px] rounded-2xl border-2 border-slate-200 bg-white overflow-hidden shadow-lg">
            {/* Conversations List */}
            <div className="w-80 border-r-2 border-slate-200 bg-slate-50 overflow-y-auto">
                <div className="sticky top-0 bg-slate-50 border-b-2 border-slate-200 p-4">
                    <h2 className="text-lg font-black text-slate-900">
                        Messages
                    </h2>
                </div>

                {conversations.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-2 opacity-20">💬</div>
                        <p className="text-sm font-semibold text-slate-600">
                            No messages yet
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200">
                        {conversations.map((conv) => (
                            <button
                                key={conv.id}
                                onClick={() => setSelectedConversation(conv.id)}
                                className={`w-full p-4 text-left transition-all hover:bg-slate-100 ${selectedConversation === conv.id
                                        ? "bg-white border-l-4 border-purple-500"
                                        : ""
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    {conv.other_user_avatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={conv.other_user_avatar}
                                            alt={conv.other_user_name || "User"}
                                            className="h-12 w-12 rounded-full border-2 border-slate-200 object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-200 bg-gradient-to-br from-purple-100 to-purple-200 text-lg font-black text-purple-600">
                                            {(conv.other_user_name || "?")[0].toUpperCase()}
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-sm font-black text-slate-900 truncate">
                                                {conv.other_user_name || "User"}
                                            </span>
                                            {(conv.unread_count || 0) > 0 && (
                                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-xs font-black text-white">
                                                    {conv.unread_count}
                                                </span>
                                            )}
                                        </div>

                                        {conv.product_title && (
                                            <div className="text-xs font-semibold text-slate-500 truncate mb-1">
                                                Re: {conv.product_title}
                                            </div>
                                        )}

                                        {conv.last_message && (
                                            <div className="text-xs font-semibold text-slate-600 truncate">
                                                {conv.last_message}
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
            <div className="flex-1 flex flex-col">
                {!selectedConv ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-6xl mb-4 opacity-20">💬</div>
                            <p className="text-base font-semibold text-slate-600">
                                Select a conversation to view messages
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="border-b-2 border-slate-200 bg-white p-4">
                            <div className="flex items-center gap-3">
                                {selectedConv.other_user_avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={selectedConv.other_user_avatar}
                                        alt={selectedConv.other_user_name || "User"}
                                        className="h-10 w-10 rounded-full border-2 border-slate-200 object-cover"
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 bg-gradient-to-br from-purple-100 to-purple-200 text-base font-black text-purple-600">
                                        {(selectedConv.other_user_name || "?")[0].toUpperCase()}
                                    </div>
                                )}

                                <div className="flex-1">
                                    <div className="text-base font-black text-slate-900">
                                        {selectedConv.other_user_name || "User"}
                                    </div>
                                    {selectedConv.product_title && (
                                        <div className="text-xs font-semibold text-slate-500">
                                            Re: {selectedConv.product_title}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                            {loading ? (
                                <div className="text-center text-sm font-semibold text-slate-600">
                                    Loading...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center text-sm font-semibold text-slate-600">
                                    No messages yet. Start the conversation!
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
                                                className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMine
                                                        ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white"
                                                        : "bg-white border-2 border-slate-200 text-slate-900"
                                                    }`}
                                            >
                                                <p className="text-sm font-semibold break-words">
                                                    {msg.content}
                                                </p>
                                                <time className={`mt-1 text-xs font-semibold ${isMine ? "text-purple-100" : "text-slate-500"}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString()}
                                                </time>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Input */}
                        <form onSubmit={handleSend} className="border-t-2 border-slate-200 bg-white p-4">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    placeholder="Type a message..."
                                    disabled={sending}
                                    className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-semibold focus:border-purple-400 focus:outline-none disabled:opacity-50"
                                />
                                <button
                                    type="submit"
                                    disabled={!messageText.trim() || sending}
                                    className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-3 text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50"
                                >
                                    {sending ? "..." : "Send"}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
