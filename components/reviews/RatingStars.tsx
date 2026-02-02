// components/reviews/RatingStars.tsx
"use client";

import * as React from "react";

type Props = {
    rating: number;
    maxRating?: number;
    size?: "sm" | "md" | "lg";
    interactive?: boolean;
    onChange?: (rating: number) => void;
};

const sizeClasses = {
    sm: "text-sm",
    md: "text-xl",
    lg: "text-3xl",
};

export default function RatingStars({
    rating,
    maxRating = 5,
    size = "md",
    interactive = false,
    onChange,
}: Props) {
    const [hoverRating, setHoverRating] = React.useState(0);

    const displayRating = interactive && hoverRating > 0 ? hoverRating : rating;

    return (
        <div
            className="flex items-center gap-1"
            onMouseLeave={() => interactive && setHoverRating(0)}
        >
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => {
                const isFilled = star <= displayRating;
                const isHalf = !isFilled && star - 0.5 <= displayRating;

                return (
                    <button
                        key={star}
                        type="button"
                        disabled={!interactive}
                        onClick={() => interactive && onChange?.(star)}
                        onMouseEnter={() => interactive && setHoverRating(star)}
                        className={`
                            ${sizeClasses[size]}
                            ${interactive ? "cursor-pointer transition-all hover:scale-110" : "cursor-default"}
                            ${isFilled ? "text-orange-500" : isHalf ? "text-orange-300" : "text-slate-300"}
                        `}
                    >
                        {isHalf ? "⯨" : "★"}
                    </button>
                );
            })}
        </div>
    );
}
