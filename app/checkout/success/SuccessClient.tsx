"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export default function SuccessClient() {
    const router = useRouter();
    const sp = useSearchParams();

    // 既存ロジックに合わせてキーを変えてOK
    const sessionId = sp.get("session_id");

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-2xl font-bold">Checkout Success</h1>

            <div className="mt-4 rounded border p-4">
                <p className="text-sm opacity-80">session_id</p>
                <p className="font-mono break-all">{sessionId ?? "(none)"}</p>
            </div>

            <div className="mt-6 flex gap-3">
                <button
                    className="rounded border px-4 py-2"
                    onClick={() => router.push("/")}
                >
                    Home
                </button>
                <button
                    className="rounded border px-4 py-2"
                    onClick={() => router.push("/orders")}
                >
                    Orders
                </button>
            </div>
        </main>
    );
}
