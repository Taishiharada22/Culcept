"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, GlassBadge, FadeInView } from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import type { Contradiction } from "../_lib/contradictionDetector";
import {
    buildDialogue,
    processAnswer,
    createSession,
    saveSession,
    getCompletedSessions,
    getUnexploredContradictions,
    type ContradictionQuestion,
    type ContradictionSession,
    type ProcessAnswerResult,
} from "../_lib/contradictionDialogue";

/* ── Chat message types ── */

type ChatMessage =
    | { type: "system"; text: string; id: string }
    | { type: "user"; text: string; id: string }
    | { type: "insight"; text: string; id: string };

/* ── Typing indicator ── */

function TypingIndicator() {
    return (
        <div className="flex items-center gap-1 px-4 py-3">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-slate-400"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                    transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: i * 0.15,
                    }}
                />
            ))}
        </div>
    );
}

/* ── Chat bubble ── */

function ChatBubble({ message }: { message: ChatMessage }) {
    if (message.type === "insight") {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mx-2"
            >
                <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-200/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{"\u{1F4A1}"}</span>
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
                            {"\u767A\u898B\u3055\u308C\u305F\u30A4\u30F3\u30B5\u30A4\u30C8"}
                        </span>
                    </div>
                    <p className="text-[13px] font-bold text-slate-800 leading-relaxed">
                        {message.text}
                    </p>
                </div>
            </motion.div>
        );
    }

    const isUser = message.type === "user";

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn("flex", isUser ? "justify-end" : "justify-start")}
        >
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    isUser
                        ? "bg-slate-900 text-white rounded-br-md"
                        : "bg-white/80 backdrop-blur-sm border border-slate-200/60 text-slate-800 rounded-bl-md",
                )}
            >
                <p className="text-[13px] leading-relaxed">{message.text}</p>
            </div>
        </motion.div>
    );
}

/* ── Session history list ── */

function SessionHistory({
    sessions,
    onClose,
}: {
    sessions: ContradictionSession[];
    onClose: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                    {"\u904E\u53BB\u306E\u5BFE\u8A71"}
                </h4>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-slate-500 hover:text-slate-700"
                >
                    {"\u2715 \u9589\u3058\u308B"}
                </button>
            </div>
            {sessions.length === 0 ? (
                <p className="text-[12px] text-slate-400 py-4 text-center">
                    {"\u307E\u3060\u5BFE\u8A71\u306E\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093"}
                </p>
            ) : (
                sessions.map((s) => (
                    <div
                        key={s.id}
                        className="rounded-xl border border-slate-200/50 bg-white/60 p-3"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">
                                {new Date(s.startedAt).toLocaleDateString("ja-JP")}
                            </span>
                            <GlassBadge
                                size="sm"
                                variant={
                                    s.resolution === "understood"
                                        ? "success"
                                        : s.resolution === "accepted"
                                          ? "info"
                                          : "default"
                                }
                            >
                                {s.resolution === "understood"
                                    ? "\u7406\u89E3"
                                    : s.resolution === "accepted"
                                      ? "\u53D7\u5BB9"
                                      : "\u672A\u89E3\u6C7A"}
                            </GlassBadge>
                        </div>
                        {s.discoveredInsight && (
                            <p className="mt-2 text-[12px] text-slate-600 leading-relaxed">
                                {s.discoveredInsight}
                            </p>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}

/* ── Main Component ── */

interface ContradictionDialogueV2Props {
    contradictions: Contradiction[];
    className?: string;
}

export default function ContradictionDialogueV2({
    contradictions,
    className,
}: ContradictionDialogueV2Props) {
    const [showHistory, setShowHistory] = useState(false);
    const [activeContradiction, setActiveContradiction] =
        useState<Contradiction | null>(null);
    const [currentQuestion, setCurrentQuestion] =
        useState<ContradictionQuestion | null>(null);
    const [session, setSession] = useState<ContradictionSession | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [isResolved, setIsResolved] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const completedSessions = getCompletedSessions();
    const unexplored = getUnexploredContradictions(contradictions);

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    const startDialogue = useCallback((contradiction: Contradiction) => {
        setActiveContradiction(contradiction);
        const question = buildDialogue(contradiction);
        setCurrentQuestion(question);
        const newSession = createSession(contradiction.id);
        setSession(newSession);
        setIsResolved(false);

        // Intro message
        const introId = `msg_${Date.now()}_intro`;
        const questionId = `msg_${Date.now()}_q`;

        setMessages([
            {
                type: "system",
                text: "\u77DB\u76FE\u306F\u5F31\u70B9\u3067\u306F\u306A\u304F\u3001\u6DF1\u3055\u306E\u8A3C\u3067\u3059\u3002\u4E00\u7DD2\u306B\u63A2\u3063\u3066\u307F\u307E\u3057\u3087\u3046\u3002",
                id: introId,
            },
        ]);

        // Show typing then question after delay
        setIsTyping(true);
        setTimeout(() => {
            setIsTyping(false);
            setMessages((prev) => [
                ...prev,
                { type: "system", text: question.question, id: questionId },
            ]);
        }, 1200);
    }, []);

    const handleOptionSelect = useCallback(
        (optionId: string, optionLabel: string) => {
            if (!currentQuestion || !session) return;

            // Add user message
            const userMsgId = `msg_${Date.now()}_user`;
            setMessages((prev) => [
                ...prev,
                { type: "user", text: optionLabel, id: userMsgId },
            ]);

            // Update session
            const updatedSession: ContradictionSession = {
                ...session,
                answers: [
                    ...session.answers,
                    {
                        questionId: currentQuestion.id,
                        selectedOptionId: optionId,
                    },
                ],
            };
            setSession(updatedSession);

            // Process answer
            const result = processAnswer(currentQuestion, optionId);

            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);

                if (result.type === "next_question") {
                    const nextMsgId = `msg_${Date.now()}_next`;
                    setMessages((prev) => [
                        ...prev,
                        {
                            type: "system",
                            text: result.question.question,
                            id: nextMsgId,
                        },
                    ]);
                    setCurrentQuestion(result.question);
                } else {
                    // Resolution
                    const insightMsgId = `msg_${Date.now()}_insight`;
                    setMessages((prev) => [
                        ...prev,
                        {
                            type: "insight",
                            text: result.insight,
                            id: insightMsgId,
                        },
                    ]);

                    const finalSession: ContradictionSession = {
                        ...updatedSession,
                        resolution: result.resolution ?? "unresolved",
                        discoveredInsight: result.insight,
                    };
                    setSession(finalSession);
                    saveSession(finalSession);
                    setCurrentQuestion(null);
                    setIsResolved(true);
                }
            }, 1000);
        },
        [currentQuestion, session],
    );

    const resetDialogue = useCallback(() => {
        setActiveContradiction(null);
        setCurrentQuestion(null);
        setSession(null);
        setMessages([]);
        setIsResolved(false);
    }, []);

    // History view
    if (showHistory) {
        return (
            <FadeInView className={className}>
                <GlassCard>
                    <SessionHistory
                        sessions={completedSessions}
                        onClose={() => setShowHistory(false)}
                    />
                </GlassCard>
            </FadeInView>
        );
    }

    // Contradiction selection view
    if (!activeContradiction) {
        return (
            <FadeInView className={className}>
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">
                                {"\u77DB\u76FE\u30C0\u30A4\u30A2\u30ED\u30B0"}
                            </h3>
                            <p className="text-[13px] text-slate-500">
                                {"\u610F\u8B58\u3068\u76F4\u611F\u306E\u30BA\u30EC\u3092\u5BFE\u8A71\u3067\u63A2\u308B"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {completedSessions.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowHistory(true)}
                                    className="text-xs text-slate-500 hover:text-slate-700"
                                >
                                    {"\u5C65\u6B74"}
                                </button>
                            )}
                            {unexplored.length > 0 && (
                                <GlassBadge variant="warning" size="sm">
                                    {unexplored.length}{"\u4EF6\u672A\u63A2\u7D22"}
                                </GlassBadge>
                            )}
                        </div>
                    </div>

                    {contradictions.length === 0 ? (
                        <GlassCard className="text-center py-8">
                            <p className="text-3xl mb-3">{"\u{1F300}"}</p>
                            <p className="text-sm text-slate-500">
                                {"\u77DB\u76FE\u304C\u691C\u51FA\u3055\u308C\u308B\u3068\u3001\u3053\u3053\u3067\u5BFE\u8A71\u3067\u304D\u307E\u3059"}
                            </p>
                            <p className="text-[12px] text-slate-400 mt-1">
                                {"\u30B9\u30EF\u30A4\u30D7\u5B66\u7FD2\u3068\u30A2\u30A4\u30C7\u30F3\u30C6\u30A3\u30C6\u30A3\u8A2D\u5B9A\u3092\u9032\u3081\u307E\u3057\u3087\u3046"}
                            </p>
                        </GlassCard>
                    ) : (
                        <div className="space-y-2">
                            {contradictions.map((c) => {
                                const isExplored = !unexplored.find(
                                    (u) => u.id === c.id,
                                );
                                return (
                                    <motion.button
                                        key={c.id}
                                        type="button"
                                        onClick={() => startDialogue(c)}
                                        className={cn(
                                            "w-full rounded-2xl border p-4 text-left transition-all",
                                            isExplored
                                                ? "border-slate-200/40 bg-white/40 backdrop-blur-sm"
                                                : "border-amber-200/60 bg-amber-50/30 backdrop-blur-sm hover:bg-amber-50/50",
                                        )}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                                                {c.severity === "strong"
                                                    ? "\u5F37\u3044\u77DB\u76FE"
                                                    : c.severity === "notable"
                                                      ? "\u6CE8\u76EE\u3059\u3079\u304D\u30BA\u30EC"
                                                      : "\u5FAE\u7D30\u306A\u30BA\u30EC"}
                                            </span>
                                            {isExplored && (
                                                <GlassBadge
                                                    size="sm"
                                                    variant="success"
                                                >
                                                    {"\u63A2\u7D22\u6E08\u307F"}
                                                </GlassBadge>
                                            )}
                                        </div>
                                        <p className="text-[13px] font-bold text-slate-800">
                                            {c.axisLabel}
                                        </p>
                                        <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
                                            {c.insight}
                                        </p>
                                    </motion.button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </FadeInView>
        );
    }

    // Active dialogue view (chat interface)
    return (
        <FadeInView className={className}>
            <GlassCard padding="none" className="overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/50">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">{"\u{1F300}"}</span>
                        <span className="text-sm font-bold text-slate-800">
                            {"\u77DB\u76FE\u30C0\u30A4\u30A2\u30ED\u30B0"}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={resetDialogue}
                        className="text-xs text-slate-400 hover:text-slate-600"
                    >
                        {"\u2715 \u9589\u3058\u308B"}
                    </button>
                </div>

                {/* Chat area */}
                <div className="max-h-[400px] overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                    {messages.map((msg) => (
                        <ChatBubble key={msg.id} message={msg} />
                    ))}
                    {isTyping && <TypingIndicator />}
                    <div ref={chatEndRef} />
                </div>

                {/* Options / Resolution */}
                <div className="px-4 py-3 border-t border-slate-200/50 bg-white/60">
                    {isResolved ? (
                        <div className="flex items-center gap-2">
                            <GlassButton
                                variant="secondary"
                                size="sm"
                                onClick={resetDialogue}
                                fullWidth
                            >
                                {"\u5225\u306E\u77DB\u76FE\u3092\u63A2\u308B"}
                            </GlassButton>
                        </div>
                    ) : currentQuestion && !isTyping ? (
                        <div className="space-y-2">
                            {currentQuestion.options.map((opt) => (
                                <motion.button
                                    key={opt.id}
                                    type="button"
                                    onClick={() =>
                                        handleOptionSelect(opt.id, opt.label)
                                    }
                                    className="w-full rounded-xl border border-slate-200/60 bg-white/80 p-3 text-left text-[13px] text-slate-700 font-medium transition-all hover:bg-slate-50 hover:border-slate-300/60"
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    {opt.label}
                                </motion.button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-[12px] text-slate-400 py-2">
                            {"\u8003\u3048\u4E2D\u2026"}
                        </p>
                    )}
                </div>
            </GlassCard>
        </FadeInView>
    );
}
