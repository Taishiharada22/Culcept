// components/reviews/ReviewForm.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import RatingStars from "./RatingStars";

type Props = {
    productId: string;
    productTitle: string;
    onSuccess?: () => void;
    onCancel?: () => void;
};

export default function ReviewForm({ productId, productTitle, onSuccess, onCancel }: Props) {
    const router = useRouter();
    const [rating, setRating] = React.useState(5);
    const [title, setTitle] = React.useState("");
    const [content, setContent] = React.useState("");
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (rating < 1 || rating > 5) {
            setError("Please select a rating");
            return;
        }

        setPending(true);

        try {
            const res = await fetch("/api/reviews", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    product_id: productId,
                    rating,
                    title: title.trim() || null,
                    content: content.trim() || null,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to submit review");
            }

            // Success
            setRating(5);
            setTitle("");
            setContent("");
            router.refresh();
            onSuccess?.();
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setPending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/50 to-white p-6 shadow-sm">
            {error && (
                <div className="mb-4 rounded-xl bg-red-50 border-2 border-red-200 p-4 text-sm font-bold text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-5">
                {/* Product Info */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                    <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">
                        Reviewing
                    </div>
                    <div className="text-base font-bold text-slate-900">
                        {productTitle}
                    </div>
                </div>

                {/* Rating */}
                <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">
                        Rating *
                    </label>
                    <RatingStars
                        rating={rating}
                        size="lg"
                        interactive
                        onChange={setRating}
                    />
                    <div className="mt-2 text-xs font-semibold text-slate-600">
                        {rating === 5 && "Excellent! 🎉"}
                        {rating === 4 && "Great! 👍"}
                        {rating === 3 && "Good 👌"}
                        {rating === 2 && "Not bad 🤔"}
                        {rating === 1 && "Could be better 😕"}
                    </div>
                </div>

                {/* Title */}
                <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">
                        Title (optional)
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Sum up your review in one line"
                        maxLength={100}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition-all focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                </div>

                {/* Content */}
                <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">
                        Review (optional)
                    </label>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Share your experience with this product..."
                        rows={6}
                        maxLength={2000}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition-all focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100 resize-none"
                    />
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                        {content.length} / 2000 characters
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={pending || rating < 1}
                        className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 border-2 border-orange-400 px-6 py-3 text-sm font-black text-white shadow-lg transition-all hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {pending ? "Submitting..." : "Submit Review"}
                    </button>

                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={pending}
                            className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </form>
    );
}
