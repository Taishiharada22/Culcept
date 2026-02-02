// components/activities/ActivityFeed.tsx
import Link from "next/link";
import type { Activity } from "@/types/activities";

type Props = {
    activities: Activity[];
    maxItems?: number;
};

function getActivityIcon(type: string): string {
    switch (type) {
        case "new_product": return "✨";
        case "review": return "⭐";
        case "purchase": return "🛍️";
        case "follow": return "👥";
        case "price_drop": return "📉";
        default: return "📌";
    }
}

function getActivityText(activity: Activity): string {
    const userName = activity.user_name || "Someone";
    const shopName = activity.shop_name || activity.shop_slug || "a store";
    const productTitle = activity.product_title || "a product";

    switch (activity.activity_type) {
        case "new_product":
            return `${shopName} listed a new product`;
        case "review":
            return `${userName} reviewed ${productTitle}`;
        case "purchase":
            return `${userName} purchased ${productTitle}`;
        case "follow":
            return `${userName} followed ${shopName}`;
        case "price_drop":
            return `Price dropped on ${productTitle}`;
        default:
            return "New activity";
    }
}

function getActivityUrl(activity: Activity): string {
    if (activity.product_id) {
        return `/drops/${activity.product_id}`;
    }
    if (activity.shop_slug) {
        return `/shops/${activity.shop_slug}`;
    }
    return "#";
}

function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

export default function ActivityFeed({ activities, maxItems = 50 }: Props) {
    const items = activities.slice(0, maxItems);

    if (items.length === 0) {
        return (
            <div className="rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-16 text-center">
                <div className="text-7xl mb-4 opacity-20">📰</div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">
                    No Recent Activity
                </h3>
                <p className="text-base font-semibold text-slate-600">
                    Follow stores to see their latest updates here
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {items.map((activity) => {
                const icon = getActivityIcon(activity.activity_type);
                const text = getActivityText(activity);
                const url = getActivityUrl(activity);
                const timeAgo = formatTimeAgo(activity.created_at);

                return (
                    <Link
                        key={activity.id}
                        href={url}
                        className="block rounded-xl border border-slate-200 bg-white p-4 transition-all hover:shadow-md hover:border-slate-300 no-underline"
                    >
                        <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-purple-200 border border-purple-300 text-lg">
                                {icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 mb-1">
                                    {text}
                                </p>

                                {activity.product_image && (
                                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={activity.product_image}
                                            alt={activity.product_title || "Product"}
                                            className="h-32 w-full object-cover"
                                        />
                                    </div>
                                )}

                                <time className="text-xs font-semibold text-slate-500">
                                    {timeAgo}
                                </time>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
