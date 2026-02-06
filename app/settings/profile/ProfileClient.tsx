// app/settings/profile/ProfileClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassInput,
    GlassBadge,
    FadeInView,
    ProgressRing,
} from "@/components/ui/glassmorphism-design";
import { updateProfileAction, type ProfileActionState } from "./actions";

type ProfileDefaults = {
    displayName: string;
    avatarUrl: string;
    bio: string;
    location: string;
    website: string;
    email: string | null;
    userId: string;
    createdAt: string | null;
};

type Props = {
    isLoggedIn: boolean;
    defaults?: ProfileDefaults;
};

const MAX_BIO = 160;

export default function ProfileClient({ isLoggedIn, defaults }: Props) {
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    const initial: ProfileActionState = { ok: true, error: null, message: null, fieldErrors: {} };
    const [state, formAction, pending] = (React as any).useActionState(updateProfileAction, initial);

    const [form, setForm] = React.useState(() => ({
        displayName: defaults?.displayName ?? "",
        avatarUrl: defaults?.avatarUrl ?? "",
        bio: defaults?.bio ?? "",
        location: defaults?.location ?? "",
        website: defaults?.website ?? "",
    }));
    const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);

    const fieldErr = (key: "display_name" | "avatar_url" | "bio" | "location" | "website") =>
        state?.fieldErrors?.[key];

    const completion = React.useMemo(() => {
        const fields = [
            form.displayName,
            form.avatarUrl,
            form.bio,
            form.location,
            form.website,
        ];
        const filled = fields.filter((v) => v.trim().length > 0).length;
        return Math.round((filled / fields.length) * 100);
    }, [form]);

    const effectiveAvatar = avatarPreview || form.avatarUrl;

    React.useEffect(() => {
        if (!avatarPreview) return;
        return () => {
            URL.revokeObjectURL(avatarPreview);
        };
    }, [avatarPreview]);

    if (!isLoggedIn) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4 py-12">
                    <GlassCard className="max-w-md w-full text-center p-10">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-3xl text-white shadow-lg shadow-violet-500/30"
                        >
                            👤
                        </motion.div>
                        <h1 className="text-2xl font-bold text-gray-800 mb-2" style={headingStyle}>
                            プロフィール編集
                        </h1>
                        <p className="text-gray-500 mb-8">ログインしてください。</p>
                        <GlassButton href="/login?next=/settings/profile" variant="gradient" size="lg" className="w-full justify-center">
                            ログイン
                        </GlassButton>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800" style={headingStyle}>
                                プロフィール編集
                            </h1>
                            <p className="text-xs text-gray-400">あなたらしさを整える</p>
                        </div>
                    </div>
                    <GlassButton href="/my" variant="secondary" size="sm">
                        マイページへ
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <form
                action={formAction}
                encType="multipart/form-data"
                className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32"
            >
                <div className="space-y-6">
                    {state?.error && (
                        <GlassCard className="p-4 border border-red-200/60 text-red-600">
                            {state.error}
                        </GlassCard>
                    )}
                    {state?.message && (
                        <GlassCard className="p-4 border border-emerald-200/60 text-emerald-700">
                            {state.message}
                        </GlassCard>
                    )}
                </div>

                <div className="mt-6 grid lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <FadeInView>
                            <GlassCard className="p-6">
                                <div className="flex items-center justify-between gap-4 mb-6">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-800" style={headingStyle}>
                                            基本情報
                                        </h2>
                                        <p className="text-sm text-gray-500">表示名とプロフィールを設定</p>
                                    </div>
                                    <GlassBadge variant="gradient">必須ではありません</GlassBadge>
                                </div>

                                <div className="grid gap-5">
                                    <div>
                                        <label className="text-sm font-semibold text-gray-600">表示名</label>
                                        <div className="mt-2">
                                            <GlassInput
                                                name="display_name"
                                                placeholder="例）Yuki Tanaka"
                                                value={form.displayName}
                                                onChange={(value) => setForm((prev) => ({ ...prev, displayName: value }))}
                                            />
                                            {fieldErr("display_name") && (
                                                <p className="mt-2 text-xs text-red-500">{fieldErr("display_name")}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-gray-600">アバターURL</label>
                                        <div className="mt-2">
                                            <GlassInput
                                                name="avatar_url"
                                                placeholder="https://..."
                                                value={form.avatarUrl}
                                                onChange={(value) => setForm((prev) => ({ ...prev, avatarUrl: value }))}
                                            />
                                            {fieldErr("avatar_url") && (
                                                <p className="mt-2 text-xs text-red-500">{fieldErr("avatar_url")}</p>
                                            )}
                                            <p className="mt-2 text-xs text-gray-400">
                                                画像をアップロードする場合は下のファイル選択を使ってください。
                                            </p>
                                            <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white/70 p-4">
                                                <label className="block text-xs font-semibold text-slate-500 mb-2">
                                                    画像アップロード（最大5MB / jpg, png, webp）
                                                </label>
                                                <input
                                                    type="file"
                                                    name="avatar_file"
                                                    accept="image/png,image/jpeg,image/webp"
                                                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                                                    onChange={(e) => {
                                                        const file = e.currentTarget.files?.[0];
                                                        if (!file) {
                                                            setAvatarPreview(null);
                                                            return;
                                                        }
                                                        const previewUrl = URL.createObjectURL(file);
                                                        setAvatarPreview(previewUrl);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-gray-600">自己紹介</label>
                                        <div className="mt-2">
                                            <textarea
                                                name="bio"
                                                value={form.bio}
                                                onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
                                                maxLength={MAX_BIO}
                                                placeholder="あなたのスタイルや好きなブランドを書いてみよう"
                                                className="w-full min-h-[120px] rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-400 focus:bg-white transition-all duration-300"
                                            />
                                            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                                <span>{fieldErr("bio") ?? " "}</span>
                                                <span>{form.bio.length}/{MAX_BIO}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        <FadeInView delay={0.05}>
                            <GlassCard className="p-6">
                                <div className="mb-6">
                                    <h2 className="text-lg font-bold text-gray-800" style={headingStyle}>
                                        追加情報
                                    </h2>
                                    <p className="text-sm text-gray-500">公開プロフィールに表示される情報</p>
                                </div>

                                <div className="grid sm:grid-cols-2 gap-5">
                                    <div>
                                        <label className="text-sm font-semibold text-gray-600">ロケーション</label>
                                        <div className="mt-2">
                                            <GlassInput
                                                name="location"
                                                placeholder="例）Tokyo"
                                                value={form.location}
                                                onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
                                            />
                                            {fieldErr("location") && (
                                                <p className="mt-2 text-xs text-red-500">{fieldErr("location")}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-gray-600">ウェブサイト</label>
                                        <div className="mt-2">
                                            <GlassInput
                                                name="website"
                                                placeholder="https://"
                                                value={form.website}
                                                onChange={(value) => setForm((prev) => ({ ...prev, website: value }))}
                                            />
                                            {fieldErr("website") && (
                                                <p className="mt-2 text-xs text-red-500">{fieldErr("website")}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>
                    </div>

                    <div className="space-y-6">
                        <FadeInView>
                            <GlassCard className="p-6 text-center">
                                <div className="mb-4">
                                    <ProgressRing progress={completion} size={120}>
                                        <span className="text-xl font-bold text-slate-900">{completion}%</span>
                                    </ProgressRing>
                                </div>
                                <h3 className="text-lg font-bold text-gray-800" style={headingStyle}>
                                    プロフィール完成度
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    情報を埋めるほど信頼度が上がります
                                </p>
                            </GlassCard>
                        </FadeInView>

                        <FadeInView delay={0.05}>
                            <GlassCard className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-2xl text-white shadow-lg shadow-violet-500/30 overflow-hidden">
                                        {effectiveAvatar ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={effectiveAvatar} alt="avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span>👤</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-400">プレビュー</p>
                                        <p className="text-lg font-bold text-gray-800 truncate">
                                            {form.displayName || "ユーザー"}
                                        </p>
                                        <p className="text-sm text-gray-500 truncate">
                                            {form.location || "Culcept へようこそ"}
                                        </p>
                                    </div>
                                </div>
                                {form.bio && (
                                    <p className="text-sm text-gray-500 mt-4 line-clamp-3">
                                        {form.bio}
                                    </p>
                                )}
                            </GlassCard>
                        </FadeInView>

                        <FadeInView delay={0.1}>
                            <GlassCard className="p-6">
                                <h3 className="text-sm font-semibold text-gray-500 mb-4">アカウント情報</h3>
                                <div className="space-y-3 text-sm text-gray-600">
                                    <div>
                                        <p className="text-xs text-gray-400">Email</p>
                                        <p className="font-medium text-gray-800">{defaults?.email ?? "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">User ID</p>
                                        <p className="font-mono text-xs text-gray-500 break-all">
                                            {defaults?.userId ?? "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">登録日</p>
                                        <p className="text-gray-700">
                                            {defaults?.createdAt ? new Date(defaults.createdAt).toLocaleDateString("ja-JP") : "—"}
                                        </p>
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>
                    </div>
                </div>
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6">
                        <GlassButton
                            type="submit"
                            disabled={pending}
                            loading={pending}
                            variant="gradient"
                            size="lg"
                            className="w-full justify-center"
                        >
                            保存する
                        </GlassButton>
                    </div>
                </div>
            </form>
        </LightBackground>
    );
}
