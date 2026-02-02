"use client";

import { useState } from "react";

interface ShareButtonProps {
    title: string;
    description?: string;
    url: string;
    imageUrl?: string;
    className?: string;
}

export function ShareButton({
    title,
    description = "",
    url,
    imageUrl,
    className = "",
}: ShareButtonProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [copied, setCopied] = useState(false);

    const fullUrl = typeof window !== "undefined"
        ? new URL(url, window.location.origin).toString()
        : url;

    const shareText = description ? `${title}\n${description}` : title;

    const shareLinks = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(fullUrl)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`,
        line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(fullUrl)}`,
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title,
                    text: description,
                    url: fullUrl,
                });
            } catch (err) {
                // ユーザーがキャンセルした場合など
            }
        } else {
            setShowMenu(true);
        }
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={handleNativeShare}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-sm"
            >
                <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                </svg>
                シェア
            </button>

            {showMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border z-50 w-64 overflow-hidden">
                        <div className="p-3 border-b">
                            <p className="text-sm font-medium">シェアする</p>
                        </div>

                        <div className="p-2">
                            {/* Twitter */}
                            <a
                                href={shareLinks.twitter}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                                onClick={() => setShowMenu(false)}
                            >
                                <span className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm">
                                    𝕏
                                </span>
                                <span className="text-sm">X (Twitter)</span>
                            </a>

                            {/* Facebook */}
                            <a
                                href={shareLinks.facebook}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                                onClick={() => setShowMenu(false)}
                            >
                                <span className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                    f
                                </span>
                                <span className="text-sm">Facebook</span>
                            </a>

                            {/* LINE */}
                            <a
                                href={shareLinks.line}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                                onClick={() => setShowMenu(false)}
                            >
                                <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                    L
                                </span>
                                <span className="text-sm">LINE</span>
                            </a>

                            {/* リンクをコピー */}
                            <button
                                onClick={handleCopyLink}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors w-full text-left"
                            >
                                <span className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                                    {copied ? "✓" : "🔗"}
                                </span>
                                <span className="text-sm">
                                    {copied ? "コピーしました！" : "リンクをコピー"}
                                </span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default ShareButton;
