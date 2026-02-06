"use client";

import * as React from "react";
import Link from "next/link";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassInput,
    GlassBadge,
} from "@/components/ui/glassmorphism-design";

type Product = {
    id: string;
    title: string;
    cover_image_url: string | null;
    price: number | null;
    status: string | null;
};

type FitProfile = {
    product_id: string;
    category?: string | null;
    intended_fit?: string | null;
    pattern?: Record<string, number>;
    fabric?: Record<string, number>;
};

type ColorProfile = {
    product_id: string;
    dominant_colors?: any[];
};

type ColorRow = {
    rgb: string;
    L: string;
    a: string;
    b: string;
    C: string;
    h: string;
    coverage: string;
};

const PATTERN_FIELDS = [
    { key: "shoulder_cm", label: "肩幅", unit: "cm" },
    { key: "chest_cm", label: "胸幅", unit: "cm" },
    { key: "waist_cm", label: "胴幅", unit: "cm" },
    { key: "hip_cm", label: "ヒップ", unit: "cm" },
    { key: "length_cm", label: "着丈", unit: "cm" },
    { key: "sleeve_cm", label: "袖丈", unit: "cm" },
    { key: "armhole", label: "袖ぐり", unit: "0..2" },
    { key: "rise_cm", label: "股上", unit: "cm" },
    { key: "inseam_cm", label: "股下", unit: "cm" },
    { key: "thigh_cm", label: "太もも", unit: "cm" },
];

const FABRIC_FIELDS = [
    { key: "stretch", label: "伸縮性" },
    { key: "rigidity", label: "硬さ" },
    { key: "drape", label: "落ち感" },
];

const FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"];

const SCALE = [
    { value: "0", label: "低" },
    { value: "1", label: "中" },
    { value: "2", label: "高" },
];

function toStr(v: any) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string") return v;
    return "";
}

function toNum(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function makeEmptyColor(): ColorRow {
    return { rgb: "", L: "", a: "", b: "", C: "", h: "", coverage: "0.5" };
}

export default function FitColorClient({
    product,
    initialFit,
    initialColor,
}: {
    product: Product;
    initialFit: FitProfile | null;
    initialColor: ColorProfile | null;
}) {
    const [category, setCategory] = React.useState(initialFit?.category ?? "");
    const [intendedFit, setIntendedFit] = React.useState(initialFit?.intended_fit ?? "regular");
    const [pattern, setPattern] = React.useState<Record<string, string>>(() => {
        const out: Record<string, string> = {};
        PATTERN_FIELDS.forEach((f) => {
            out[f.key] = toStr(initialFit?.pattern?.[f.key]);
        });
        return out;
    });
    const [fabric, setFabric] = React.useState<Record<string, string>>(() => {
        const out: Record<string, string> = {};
        FABRIC_FIELDS.forEach((f) => {
            out[f.key] = toStr(initialFit?.fabric?.[f.key] ?? "1");
        });
        return out;
    });
    const [colors, setColors] = React.useState<ColorRow[]>(() => {
        const rows = (initialColor?.dominant_colors || []).map((c) => ({
            rgb: c.rgb || "",
            L: toStr(c.lab?.L),
            a: toStr(c.lab?.a),
            b: toStr(c.lab?.b),
            C: toStr(c.lch?.C),
            h: toStr(c.lch?.h),
            coverage: toStr(c.coverage ?? "0.5"),
        }));
        return rows.length > 0 ? rows : [makeEmptyColor()];
    });

    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    const addColorRow = () => {
        setColors((prev) => [...prev, makeEmptyColor()]);
    };

    const removeColorRow = (idx: number) => {
        setColors((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        setError(null);

        const patternPayload: Record<string, number> = {};
        for (const field of PATTERN_FIELDS) {
            const n = toNum(pattern[field.key] ?? "");
            if (n !== undefined) patternPayload[field.key] = n;
        }

        const fabricPayload: Record<string, number> = {};
        for (const field of FABRIC_FIELDS) {
            const n = toNum(fabric[field.key] ?? "");
            if (n !== undefined) fabricPayload[field.key] = n;
        }

        const dominant_colors = colors
            .map((row) => {
                const L = toNum(row.L);
                const a = toNum(row.a);
                const b = toNum(row.b);
                const C = toNum(row.C);
                const h = toNum(row.h);
                const coverage = toNum(row.coverage);
                return {
                    rgb: row.rgb || undefined,
                    lab: L != null && a != null && b != null ? { L, a, b } : undefined,
                    lch: C != null && h != null ? { L: L ?? 0, C, h } : undefined,
                    coverage,
                };
            })
            .filter((c) => c.rgb || c.lab || c.lch);

        try {
            const res = await fetch("/api/garment-profile", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    product_id: product.id,
                    fit_profile: {
                        category,
                        intended_fit: intendedFit,
                        pattern: patternPayload,
                        fabric: fabricPayload,
                    },
                    color_profile: {
                        dominant_colors,
                    },
                }),
            });
            const data = await res.json();
            if (!data?.ok) {
                setError(data?.error ?? "保存に失敗しました");
            } else {
                setMessage("保存しました。Fit/Colorスコアに反映されます。");
            }
        } catch (e: any) {
            setError(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/shops/me/products"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900" style={headingStyle}>
                                Fit / Color Profile
                            </h1>
                            <p className="text-xs text-slate-400">商品に科学的プロファイルを付与</p>
                        </div>
                    </div>
                    <GlassButton href={`/drops/${product.id}`} size="sm" variant="secondary">
                        商品を確認
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32 space-y-6">
                <GlassCard className="p-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                            {product.cover_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={product.cover_image_url} alt={product.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">📦</div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="text-sm text-slate-400">対象商品</div>
                            <div className="text-lg font-bold text-slate-900">{product.title}</div>
                        </div>
                        <GlassBadge variant="secondary">{product.status ?? "draft"}</GlassBadge>
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Fit Profile</h2>
                            <p className="text-xs text-slate-500">パターン寸法と素材特性を登録</p>
                        </div>
                        <GlassBadge variant="secondary">GFP v1</GlassBadge>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-5">
                        <div>
                            <label className="text-sm font-semibold text-slate-600">カテゴリ</label>
                            <GlassInput value={category} onChange={setCategory} placeholder="jacket / pants など" />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-600">意図するフィット</label>
                            <div className="mt-2 flex items-center gap-2">
                                {FIT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setIntendedFit(opt)}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                            intendedFit === opt
                                                ? "bg-slate-900 text-white border-slate-900"
                                                : "bg-white text-slate-600 border-slate-200"
                                        }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        {PATTERN_FIELDS.map((field) => (
                            <div key={field.key}>
                                <label className="text-sm font-semibold text-slate-600">{field.label}</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <GlassInput
                                            value={pattern[field.key] ?? ""}
                                            onChange={(value) => setPattern((prev) => ({ ...prev, [field.key]: value }))}
                                            placeholder="数値"
                                        />
                                    </div>
                                    <span className="text-xs text-slate-400 w-8">{field.unit}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6">
                        <div className="text-sm font-semibold text-slate-600 mb-2">素材特性</div>
                        <div className="grid md:grid-cols-3 gap-3">
                            {FABRIC_FIELDS.map((field) => (
                                <div key={field.key} className="rounded-2xl border border-slate-200 bg-white/70 p-3">
                                    <div className="text-xs text-slate-500 mb-2">{field.label}</div>
                                    <div className="flex items-center gap-2">
                                        {SCALE.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setFabric((prev) => ({ ...prev, [field.key]: opt.value }))}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                                                    fabric[field.key] === opt.value
                                                        ? "bg-slate-900 text-white border-slate-900"
                                                        : "bg-white text-slate-600 border-slate-200"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Color Profile</h2>
                            <p className="text-xs text-slate-500">dominant colors を登録</p>
                        </div>
                        <GlassBadge variant="secondary">CIELAB / LCh</GlassBadge>
                    </div>

                    <div className="space-y-3">
                        {colors.map((row, idx) => (
                            <div key={idx} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="text-sm font-semibold text-slate-700">Color {idx + 1}</div>
                                    {colors.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeColorRow(idx)}
                                            className="text-xs text-rose-500 underline"
                                        >
                                            削除
                                        </button>
                                    )}
                                </div>
                                <div className="grid md:grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-500">RGB(hex)</label>
                                        <GlassInput
                                            value={row.rgb}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, rgb: value } : c)))
                                            }
                                            placeholder="#AABBCC"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500">L*</label>
                                        <GlassInput
                                            value={row.L}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, L: value } : c)))
                                            }
                                            placeholder="0..100"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500">a*</label>
                                        <GlassInput
                                            value={row.a}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, a: value } : c)))
                                            }
                                            placeholder="-128..128"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500">b*</label>
                                        <GlassInput
                                            value={row.b}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, b: value } : c)))
                                            }
                                            placeholder="-128..128"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500">C*</label>
                                        <GlassInput
                                            value={row.C}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, C: value } : c)))
                                            }
                                            placeholder="0..200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500">h</label>
                                        <GlassInput
                                            value={row.h}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, h: value } : c)))
                                            }
                                            placeholder="0..360"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500">coverage</label>
                                        <GlassInput
                                            value={row.coverage}
                                            onChange={(value) =>
                                                setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, coverage: value } : c)))
                                            }
                                            placeholder="0..1"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4">
                        <GlassButton size="sm" variant="secondary" onClick={addColorRow}>
                            + 色を追加
                        </GlassButton>
                    </div>
                </GlassCard>

                <div className="flex flex-wrap items-center gap-3">
                    <GlassButton onClick={handleSave} loading={saving} variant="gradient">
                        保存
                    </GlassButton>
                    {message && <span className="text-sm text-emerald-600">{message}</span>}
                    {error && <span className="text-sm text-rose-600">{error}</span>}
                </div>
            </main>
        </LightBackground>
    );
}
