"use client";

import * as React from "react";

const REASONS: Array<{ key: string; label: string }> = [
    { key: "spam", label: "Spam / 宣伝" },
    { key: "scam", label: "詐欺っぽい" },
    { key: "counterfeit", label: "偽物/コピー疑い" },
    { key: "abusive", label: "不快・差別的" },
    { key: "other", label: "その他" },
];

export default function ReportButton({ dropId }: { dropId: string }) {
    const [open, setOpen] = React.useState(false);
    const [reason, setReason] = React.useState("spam");
    const [details, setDetails] = React.useState("");
    const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

    const submit = async () => {
        setStatus("sending");
        try {
            const res = await fetch("/api/report", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ targetType: "drop", targetId: dropId, reason, details }),
            });
            if (!res.ok) throw new Error("bad response");
            setStatus("sent");
            setTimeout(() => {
                setOpen(false);
                setStatus("idle");
                setDetails("");
                setReason("spam");
            }, 800);
        } catch {
            setStatus("error");
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50"
            >
                Report
            </button>

            {open ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
                            <div className="text-sm font-black text-zinc-900">Report this drop</div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-3 p-4">
                            <div className="grid gap-2">
                                <div className="text-xs font-extrabold text-zinc-700">Reason</div>
                                <select
                                    value={reason}
                                    onChange={(e) => setReason(e.currentTarget.value)}
                                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold"
                                >
                                    {REASONS.map((r) => (
                                        <option key={r.key} value={r.key}>
                                            {r.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <div className="text-xs font-extrabold text-zinc-700">Details (optional)</div>
                                <textarea
                                    value={details}
                                    onChange={(e) => setDetails(e.currentTarget.value)}
                                    className="min-h-[110px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                                    placeholder="補足があれば（例：URLが怪しい/偽物っぽい特徴など）"
                                />
                            </div>

                            {status === "error" ? (
                                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                                    送信に失敗。もう一度試して。
                                </div>
                            ) : null}

                            {status === "sent" ? (
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                                    送信した。
                                </div>
                            ) : null}

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={submit}
                                    disabled={status === "sending"}
                                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                                >
                                    {status === "sending" ? "Sending..." : "Send"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
