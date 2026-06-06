"use client";

import { useState } from "react";
import Link from "next/link";

const NOTIFICATION_TYPES = [
    { value: "system_announcement", label: "お知らせ", description: "新機能・アップデート等の一般告知", icon: "📢" },
    { value: "policy_update",       label: "規約更新", description: "利用規約・プライバシーポリシーの変更", icon: "📜" },
    { value: "maintenance_notice",  label: "メンテナンス", description: "サービス停止・メンテナンス予告", icon: "🔧" },
    { value: "safety_notice",       label: "安全に関する通知", description: "セキュリティ・安全に関する重要通知", icon: "🛡️" },
    { value: "account_notice",      label: "アカウント", description: "アカウントに関する重要なお知らせ", icon: "👤" },
] as const;

type SendState = "idle" | "confirming" | "sending" | "sent" | "error";
type SendTarget = "all" | "specific";

export default function CeoNotificationsPage() {
    const [type, setType] = useState<(typeof NOTIFICATION_TYPES)[number]["value"]>(NOTIFICATION_TYPES[0].value);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [link, setLink] = useState("");
    const [sendTarget, setSendTarget] = useState<SendTarget>("specific");
    const [userIdsInput, setUserIdsInput] = useState("");
    const [state, setState] = useState<SendState>("idle");
    const [result, setResult] = useState<{ sent: number; total: number; broadcast_id: string; targeted: boolean } | null>(null);
    const [error, setError] = useState("");

    const selectedType = NOTIFICATION_TYPES.find((t) => t.value === type)!;

    const parsedUserIds = userIdsInput
        .split(/[,\n\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const canSend =
        title.trim().length > 0 &&
        (sendTarget === "all" || parsedUserIds.length > 0);

    const handleSend = async () => {
        if (state === "idle" || state === "sent" || state === "error") {
            setState("confirming");
            return;
        }

        if (state === "confirming") {
            setState("sending");
            setError("");
            try {
                const payload: Record<string, unknown> = {
                    type,
                    title: title.trim(),
                    body: body.trim() || undefined,
                    link: link.trim() || undefined,
                };
                if (sendTarget === "specific" && parsedUserIds.length > 0) {
                    payload.user_ids = parsedUserIds;
                }

                const res = await fetch("/api/ceo/broadcast-notification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || "送信に失敗しました");
                    setState("error");
                    return;
                }

                setResult({ sent: data.sent, total: data.total, broadcast_id: data.broadcast_id, targeted: !!data.targeted });
                setState("sent");
                setTitle("");
                setBody("");
                setLink("");
            } catch (e) {
                setError("ネットワークエラー");
                setState("error");
            }
        }
    };

    const handleCancel = () => {
        setState("idle");
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold">運営通知の送信</h1>
                <Link href="/ceo" className="text-sm text-slate-500 hover:text-slate-700">
                    ← ダッシュボード
                </Link>
            </div>

            {/* 通知種別 */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">通知種別</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {NOTIFICATION_TYPES.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => setType(t.value)}
                            className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                                type === t.value
                                    ? "border-indigo-500 bg-indigo-50"
                                    : "border-slate-200 hover:border-slate-300"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span>{t.icon}</span>
                                <span className="font-medium text-sm">{t.label}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{t.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* タイトル */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">タイトル（必須）</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例: サービスメンテナンスのお知らせ"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    maxLength={100}
                />
                <p className="text-xs text-slate-400 mt-1">{title.length}/100</p>
            </div>

            {/* 本文 */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">本文（任意）</label>
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="例: 4月3日 02:00〜05:00 にメンテナンスを実施します。"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={3}
                    maxLength={500}
                />
                <p className="text-xs text-slate-400 mt-1">{body.length}/500</p>
            </div>

            {/* リンク */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">リンク先（任意）</label>
                <input
                    type="text"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="例: /rendezvous"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* 送信対象 */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">送信対象</label>
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={() => setSendTarget("specific")}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            sendTarget === "specific"
                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                    >
                        指定ユーザー
                    </button>
                    <button
                        onClick={() => setSendTarget("all")}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            sendTarget === "all"
                                ? "border-red-500 bg-red-50 text-red-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                    >
                        全ユーザー
                    </button>
                </div>
                {sendTarget === "specific" && (
                    <div>
                        <textarea
                            value={userIdsInput}
                            onChange={(e) => setUserIdsInput(e.target.value)}
                            placeholder="メールアドレス or ユーザーID（カンマ・改行区切り）"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={2}
                        />
                        {parsedUserIds.length > 0 && (
                            <p className="text-xs text-slate-500 mt-1">{parsedUserIds.length}人に送信</p>
                        )}
                    </div>
                )}
                {sendTarget === "all" && (
                    <p className="text-xs text-red-500">オンボーディング済みの全ユーザーに送信されます</p>
                )}
            </div>

            {/* 文面ガイドライン */}
            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 leading-relaxed">
                <p className="font-medium text-slate-600 mb-1">文面ルール</p>
                <ul className="list-disc list-inside space-y-0.5">
                    <li>タイトルは30文字前後まで（一覧で切れないように）</li>
                    <li>本文は1〜3文。先頭で結論を書く</li>
                    <li>リンクがあるなら本文末で「詳細はこちら」等で示唆</li>
                </ul>
            </div>

            {/* プレビュー */}
            {title.trim() && (
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-2">プレビュー</p>
                    <div className="flex gap-3 items-start">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg">{selectedType.icon}</span>
                        </div>
                        <div>
                            <p className="font-medium text-sm text-slate-900">{title.trim()}</p>
                            {body.trim() && <p className="text-sm text-slate-600 mt-0.5">{body.trim()}</p>}
                            <p className="text-xs text-slate-400 mt-1">{selectedType.label} ・ たった今</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 送信ボタン */}
            <div className="flex items-center gap-3">
                {state === "confirming" ? (
                    <>
                        <button
                            onClick={handleSend}
                            className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 transition-colors"
                        >
                            {sendTarget === "all"
                                ? "全ユーザーに送信する"
                                : `${parsedUserIds.length}人に送信する`}
                        </button>
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2.5 text-slate-600 text-sm hover:text-slate-800"
                        >
                            キャンセル
                        </button>
                        <p className="text-sm text-red-600">本当に送信しますか？</p>
                    </>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={!canSend || state === "sending"}
                        className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                            canSend && state !== "sending"
                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                    >
                        {state === "sending" ? "送信中..." : "送信"}
                    </button>
                )}
            </div>

            {/* 結果表示 */}
            {state === "sent" && result && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-emerald-800">
                        {result.targeted ? "指定ユーザー" : "全ユーザー"}: {result.sent}/{result.total}人に送信しました。
                    </p>
                    <div className="bg-white/60 rounded-md p-2.5">
                        <p className="text-xs text-slate-500 mb-1">送信ID（問い合わせ・監査用）</p>
                        <p className="text-xs font-mono text-slate-700 select-all">{result.broadcast_id}</p>
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                        <p>既読率の確認: Supabase SQL Editor で以下を実行</p>
                        <code className="block mt-1 p-2 bg-white/60 rounded text-[11px] font-mono text-slate-600 select-all whitespace-pre-wrap">{`SELECT COUNT(*) AS total,\n  COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read_count\nFROM notifications\nWHERE data->>'broadcast_id' = '${result.broadcast_id}';`}</code>
                    </div>
                </div>
            )}

            {state === "error" && error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                </div>
            )}
        </div>
    );
}
