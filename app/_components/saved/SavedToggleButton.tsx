// app/_components/saved/SavedToggleButton.tsx
"use client";

import * as React from "react";

type ToggleRes = { ok: boolean; saved: boolean; error?: string };

export default function SavedToggleButton({
    kind,
    id,
    initialSaved,
    toggleAction,
    size = "md",
}: {
    kind: "drop" | "shop";
    id: string;
    initialSaved: boolean;
    toggleAction: (id: string) => Promise<ToggleRes>;
    size?: "sm" | "md" | "lg";
}) {
    const [saved, setSaved] = React.useState(initialSaved);
    const [pending, startTransition] = React.useTransition();
    const [error, setError] = React.useState<string | null>(null);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const sizeClasses = {
        sm: "h-9 w-9 text-base",
        md: "h-11 w-11 text-lg",
        lg: "h-14 w-14 text-2xl",
    };

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setError(null);
        startTransition(async () => {
            try {
                const res = await toggleAction(id);
                if (!res?.ok) {
                    setError(res?.error ?? "Failed");
                    return;
                }
                setSaved(!!res.saved);

                // Success animation
                if (res.saved) {
                    setShowSuccess(true);
                    setTimeout(() => setShowSuccess(false), 1000);
                }
            } catch (err: any) {
                setError(String(err?.message ?? "Error"));
            }
        });
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={handleClick}
                disabled={pending}
                className={`
                    ${sizeClasses[size]}
                    relative rounded-full
                    transition-all duration-300
                    ${saved
                        ? "bg-gradient-to-br from-red-500 via-pink-500 to-red-600 text-white shadow-lg scale-100"
                        : "bg-white/90 backdrop-blur text-slate-600 border-2 border-slate-200 hover:border-red-400 hover:text-red-500"
                    }
                    ${pending ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center
                    shadow-md hover:shadow-xl
                `}
                aria-label={saved ? `Unsave this ${kind}` : `Save this ${kind}`}
                style={{
                    transform: showSuccess ? "scale(1.2)" : undefined,
                }}
            >
                {/* Heart Icon */}
                <span
                    className="transition-transform duration-200"
                    style={{
                        animation: showSuccess ? "heartBeat 0.6s ease-in-out" : undefined,
                    }}
                >
                    {saved ? "❤️" : "🤍"}
                </span>

                {/* Success Ripple */}
                {showSuccess && (
                    <span
                        className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"
                        style={{ animationDuration: "0.6s" }}
                    />
                )}
            </button>

            {/* Error Tooltip */}
            {error && (
                <div
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 whitespace-nowrap rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-xl"
                    style={{
                        animation: "fadeIn 0.2s ease-out",
                    }}
                >
                    {error}
                </div>
            )}

            <style jsx>{`
                @keyframes heartBeat {
                    0%, 100% { transform: scale(1); }
                    25% { transform: scale(1.3); }
                    50% { transform: scale(1.1); }
                    75% { transform: scale(1.2); }
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
