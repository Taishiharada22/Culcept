// components/price-alerts/PriceAlertButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
    productId: string;
    currentPrice: number;
    hasAlert: boolean;
    alertPrice?: number;
};

export default function PriceAlertButton({
    productId,
    currentPrice,
    hasAlert: initialHasAlert,
    alertPrice: initialAlertPrice,
}: Props) {
    const router = useRouter();
    const [showForm, setShowForm] = React.useState(false);
    const [hasAlert, setHasAlert] = React.useState(initialHasAlert);
    const [targetPrice, setTargetPrice] = React.useState(
        initialAlertPrice ? String(initialAlertPrice) : String(Math.floor(currentPrice * 0.9))
    );
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const price = Number(targetPrice);
        if (!Number.isFinite(price) || price <= 0) {
            setError("Invalid price");
            return;
        }

        if (price >= currentPrice) {
            setError("Target price must be lower than current price");
            return;
        }

        setPending(true);

        try {
            const res = await fetch("/api/price-alerts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    product_id: productId,
                    target_price: price,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to set alert");
            }

            setHasAlert(true);
            setShowForm(false);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPending(false);
        }
    };

    const handleRemove = async () => {
        setPending(true);

        try {
            const res = await fetch("/api/price-alerts", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ product_id: productId }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to remove alert");
            }

            setHasAlert(false);
            setShowForm(false);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setPending(false);
        }
    };

    return (
        <div>
            {!showForm ? (
                <button
                    onClick={() => setShowForm(true)}
                    className={`
                        rounded-xl px-4 py-2 text-sm font-black transition-all
                        ${hasAlert
                            ? "bg-teal-100 border-2 border-teal-300 text-teal-700 hover:bg-teal-200"
                            : "bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                        }
                    `}
                >
                    {hasAlert ? "🔔 Alert Set" : "🔔 Set Price Alert"}
                </button>
            ) : (
                <div className="rounded-xl border-2 border-teal-200 bg-gradient-to-br from-teal-50/50 to-white p-4">
                    <form onSubmit={handleSubmit} className="space-y-3">
                        {error && (
                            <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs font-bold text-red-700">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-black text-slate-900 mb-1">
                                Notify me when price drops to:
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-700">¥</span>
                                <input
                                    type="number"
                                    value={targetPrice}
                                    onChange={(e) => setTargetPrice(e.target.value)}
                                    min="1"
                                    max={currentPrice - 1}
                                    className="flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-semibold focus:border-teal-400 focus:outline-none"
                                />
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                                Current: ¥{currentPrice.toLocaleString()}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="submit"
                                disabled={pending}
                                className="flex-1 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-black text-white transition-all hover:shadow-md disabled:opacity-50"
                            >
                                {pending ? "..." : "Set Alert"}
                            </button>

                            {hasAlert && (
                                <button
                                    type="button"
                                    onClick={handleRemove}
                                    disabled={pending}
                                    className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Remove
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                disabled={pending}
                                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
