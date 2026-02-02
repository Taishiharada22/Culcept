// components/follows/FollowButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
    shopSlug: string;
    initialFollowing: boolean;
    followerCount: number;
    size?: "sm" | "md" | "lg";
    showCount?: boolean;
};

const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
};

export default function FollowButton({
    shopSlug,
    initialFollowing,
    followerCount,
    size = "md",
    showCount = true,
}: Props) {
    const router = useRouter();
    const [isFollowing, setIsFollowing] = React.useState(initialFollowing);
    const [count, setCount] = React.useState(followerCount);
    const [pending, setPending] = React.useState(false);

    const handleClick = async () => {
        setPending(true);

        try {
            const res = await fetch("/api/follows", {
                method: isFollowing ? "DELETE" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ shop_slug: shopSlug }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to update follow status");
            }

            setIsFollowing(!isFollowing);
            setCount((prev) => (isFollowing ? prev - 1 : prev + 1));
            router.refresh();
        } catch (err: any) {
            console.error("Follow error:", err);
            alert(err.message || "Failed to update follow status");
        } finally {
            setPending(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={pending}
            className={`
                ${sizeClasses[size]}
                rounded-xl font-black transition-all
                ${isFollowing
                    ? "bg-white border-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                    : "bg-gradient-to-r from-purple-500 to-purple-600 border-2 border-purple-400 text-white shadow-lg hover:shadow-xl hover:scale-105"
                }
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
            `}
        >
            {pending ? (
                "..."
            ) : (
                <>
                    {isFollowing ? "✓ Following" : "+ Follow"}
                    {showCount && <span className="ml-1.5">({count})</span>}
                </>
            )}
        </button>
    );
}
