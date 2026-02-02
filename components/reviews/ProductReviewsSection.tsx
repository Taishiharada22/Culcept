// components/reviews/ProductReviewsSection.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import RatingStars from "./RatingStars";
import ReviewForm from "./ReviewForm";
import type { Review, ReviewStats } from "@/types/reviews";

type Props = {
    productId: string;
    productTitle: string;
    reviews: Review[];
    stats: ReviewStats;
    userReview: Review | null;
    isAuthenticated: boolean;
    canReview: boolean; // false if user is owner or hasn't purchased
};

export default function ProductReviewsSection({
    productId,
    productTitle,
    reviews,
    stats,
    userReview,
    isAuthenticated,
    canReview,
}: Props) {
    const [showForm, setShowForm] = React.useState(false);
    const [sortBy, setSortBy] = React.useState<"recent" | "helpful" | "rating_high" | "rating_low">("recent");

    const sortedReviews = React.useMemo(() => {
        const sorted = [...reviews];

        switch (sortBy) {
            case "helpful":
                return sorted.sort((a, b) => b.helpful_count - a.helpful_count);
            case "rating_high":
                return sorted.sort((a, b) => b.rating - a.rating);
            case "rating_low":
                return sorted.sort((a, b) => a.rating - b.rating);
            case "recent":
            default:
                return sorted.sort((a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
        }
    }, [reviews, sortBy]);

    const handleReviewSuccess = () => {
        setShowForm(false);
    };

    return (
        <section className="rounded-2xl border-2 border-slate-200 bg-white p-8 shadow-sm">
            {/* Header with Stats */}
            <div className="flex items-start justify-between gap-6 mb-8 pb-6 border-b-2 border-slate-100">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 mb-3">
                        Customer Reviews
                    </h2>

                    {/* Overall Rating */}
                    <div className="flex items-center gap-4">
                        <div className="text-5xl font-black text-slate-900">
                            {stats.average_rating.toFixed(1)}
                        </div>
                        <div>
                            <RatingStars rating={stats.average_rating} size="lg" />
                            <div className="mt-1 text-sm font-bold text-slate-600">
                                Based on {stats.total_reviews} {stats.total_reviews === 1 ? "review" : "reviews"}
                            </div>
                        </div>
                    </div>

                    {/* Rating Distribution */}
                    <div className="mt-6 space-y-2">
                        {[5, 4, 3, 2, 1].map((star) => {
                            const count = stats.rating_distribution[star as keyof typeof stats.rating_distribution] || 0;
                            const percentage = stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0;

                            return (
                                <div key={star} className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 w-16">
                                        <span className="text-sm font-bold text-slate-700">{star}</span>
                                        <span className="text-orange-500">★</span>
                                    </div>
                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <div className="w-12 text-xs font-bold text-slate-600 text-right">
                                        {count}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Write Review Button */}
                {isAuthenticated && canReview && !userReview && (
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="shrink-0 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 border-2 border-orange-400 px-6 py-3 text-sm font-black text-white shadow-lg transition-all hover:shadow-xl hover:scale-105"
                    >
                        {showForm ? "✕ Cancel" : "✍️ Write Review"}
                    </button>
                )}

                {!isAuthenticated && (
                    <Link
                        href={`/login?next=/drops/${productId}`}
                        className="shrink-0 rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 no-underline"
                    >
                        Login to Review
                    </Link>
                )}
            </div>

            {/* Review Form */}
            {showForm && (
                <div className="mb-8">
                    <ReviewForm
                        productId={productId}
                        productTitle={productTitle}
                        onSuccess={handleReviewSuccess}
                        onCancel={() => setShowForm(false)}
                    />
                </div>
            )}

            {/* User's Review */}
            {userReview && (
                <div className="mb-8 rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50/50 to-white p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="rounded-full bg-purple-100 border-2 border-purple-300 px-3 py-1 text-xs font-black text-purple-700 uppercase tracking-wide">
                            Your Review
                        </span>
                        <RatingStars rating={userReview.rating} size="md" />
                    </div>

                    {userReview.title && (
                        <h3 className="text-lg font-black text-slate-900 mb-2">
                            {userReview.title}
                        </h3>
                    )}

                    {userReview.content && (
                        <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                            {userReview.content}
                        </p>
                    )}

                    <div className="mt-4 text-xs font-semibold text-slate-500">
                        Posted {new Date(userReview.created_at).toLocaleDateString()}
                    </div>
                </div>
            )}

            {/* Reviews List */}
            {reviews.length > 0 && (
                <>
                    {/* Sort Controls */}
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-sm font-black text-slate-700">
                            Sort by:
                        </span>
                        <div className="flex gap-2">
                            {[
                                { value: "recent", label: "Most Recent" },
                                { value: "helpful", label: "Most Helpful" },
                                { value: "rating_high", label: "Highest Rating" },
                                { value: "rating_low", label: "Lowest Rating" },
                            ].map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setSortBy(option.value as typeof sortBy)}
                                    className={`
                                        rounded-lg px-3 py-1.5 text-xs font-bold transition-all
                                        ${sortBy === option.value
                                            ? "bg-slate-900 text-white"
                                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                        }
                                    `}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reviews */}
                    <div className="space-y-4">
                        {sortedReviews.map((review) => (
                            <article
                                key={review.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-all hover:shadow-md"
                            >
                                <div className="flex items-start gap-4">
                                    {/* User Avatar */}
                                    {review.user_avatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={review.user_avatar}
                                            alt={review.user_name || "User"}
                                            className="h-12 w-12 rounded-full border-2 border-slate-200 object-cover"
                                        />
                                    ) : (
                                        <div className="h-12 w-12 rounded-full border-2 border-slate-200 bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center text-lg font-black text-purple-600">
                                            {(review.user_name || "?")[0].toUpperCase()}
                                        </div>
                                    )}

                                    {/* Review Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-base font-black text-slate-900">
                                                        {review.user_name || "Anonymous"}
                                                    </span>
                                                    {review.verified_purchase && (
                                                        <span className="rounded-full bg-teal-100 border border-teal-300 px-2 py-0.5 text-xs font-black text-teal-700">
                                                            ✓ Verified
                                                        </span>
                                                    )}
                                                </div>
                                                <RatingStars rating={review.rating} size="sm" />
                                            </div>

                                            <time className="text-xs font-semibold text-slate-500">
                                                {new Date(review.created_at).toLocaleDateString()}
                                            </time>
                                        </div>

                                        {review.title && (
                                            <h3 className="text-base font-black text-slate-900 mb-2">
                                                {review.title}
                                            </h3>
                                        )}

                                        {review.content && (
                                            <p className="text-sm font-semibold text-slate-700 leading-relaxed mb-3">
                                                {review.content}
                                            </p>
                                        )}

                                        {/* Helpful Button */}
                                        <div className="flex items-center gap-3">
                                            <button className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50">
                                                <span>👍</span>
                                                <span>Helpful</span>
                                                {review.helpful_count > 0 && (
                                                    <span className="text-slate-500">({review.helpful_count})</span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}

            {/* Empty State */}
            {reviews.length === 0 && (
                <div className="rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-16 text-center">
                    <div className="text-7xl mb-4 opacity-20">⭐</div>
                    <h3 className="text-2xl font-black text-slate-900 mb-2">
                        No Reviews Yet
                    </h3>
                    <p className="text-base font-semibold text-slate-600">
                        Be the first to share your experience!
                    </p>
                </div>
            )}
        </section>
    );
}
