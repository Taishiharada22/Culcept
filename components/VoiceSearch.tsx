// components/VoiceSearch.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface VoiceSearchProps {
    onClose: () => void;
}

export default function VoiceSearch({ onClose }: VoiceSearchProps) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [supported, setSupported] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Web Speech API対応チェック
        if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
            setSupported(false);
            setError("お使いのブラウザは音声認識に対応していません");
        }
    }, []);

    const startListening = useCallback(() => {
        if (!supported) return;

        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        const recognition = new SpeechRecognition();
        recognition.lang = "ja-JP";
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
        };

        recognition.onresult = (event: any) => {
            const current = event.resultIndex;
            const result = event.results[current][0].transcript;
            setTranscript(result);

            if (event.results[current].isFinal) {
                // 検索を実行
                setTimeout(() => {
                    router.push(`/search?q=${encodeURIComponent(result)}`);
                    onClose();
                }, 500);
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error:", event.error);
            setIsListening(false);
            if (event.error === "not-allowed") {
                setError("マイクの使用を許可してください");
            } else if (event.error === "no-speech") {
                setError("音声が検出されませんでした");
            } else {
                setError("エラーが発生しました");
            }
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    }, [supported, router, onClose]);

    const suggestions = [
        "黒のジャケット",
        "カジュアルなシャツ",
        "春のコーデ",
        "ストリート系",
    ];

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* 閉じるボタン */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
                >
                    ✕
                </button>

                <div className="text-center">
                    {/* マイクアイコン */}
                    <button
                        onClick={startListening}
                        disabled={!supported || isListening}
                        className={`w-32 h-32 rounded-full mx-auto mb-6 flex items-center justify-center transition-all ${
                            isListening
                                ? "bg-red-500 scale-110 animate-pulse"
                                : "bg-gradient-to-br from-purple-500 to-pink-500 hover:scale-105"
                        }`}
                    >
                        <svg
                            className="w-16 h-16 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                    </button>

                    {/* ステータス */}
                    <div className="text-white mb-4">
                        {isListening ? (
                            <div className="flex items-center justify-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                <span>聞いています...</span>
                            </div>
                        ) : error ? (
                            <span className="text-red-400">{error}</span>
                        ) : (
                            <span className="text-white/70">
                                タップして話しかけてください
                            </span>
                        )}
                    </div>

                    {/* 認識結果 */}
                    {transcript && (
                        <div className="bg-white/10 rounded-2xl p-4 mb-6">
                            <p className="text-white text-xl font-medium">"{transcript}"</p>
                        </div>
                    )}

                    {/* サジェスチョン */}
                    {!isListening && !transcript && (
                        <div className="mt-8">
                            <p className="text-white/60 text-sm mb-3">こんな風に話しかけてみてください:</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {suggestions.map((suggestion, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            router.push(`/search?q=${encodeURIComponent(suggestion)}`);
                                            onClose();
                                        }}
                                        className="px-4 py-2 bg-white/10 rounded-full text-white text-sm hover:bg-white/20 transition-colors"
                                    >
                                        "{suggestion}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 波形アニメーション */}
                    {isListening && (
                        <div className="flex justify-center items-end gap-1 h-12 mt-4">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-2 bg-purple-500 rounded-full animate-sound-wave"
                                    style={{
                                        animationDelay: `${i * 0.1}s`,
                                        height: `${20 + Math.random() * 30}px`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes sound-wave {
                    0%, 100% {
                        height: 10px;
                    }
                    50% {
                        height: 40px;
                    }
                }
                .animate-sound-wave {
                    animation: sound-wave 0.5s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
