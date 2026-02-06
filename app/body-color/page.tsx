"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassInput,
    GlassTabs,
    GlassBadge,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

const CFV_FIELDS = [
    { key: "vertical_line", label: "縦の長さ感", note: "全身の縦伸び感" },
    { key: "shoulder_width", label: "肩幅", note: "肩峰間の横幅感" },
    { key: "shoulder_slope", label: "なで肩/いかり肩", note: "肩線の角度" },
    { key: "ribcage_width", label: "胸郭の横幅", note: "肋骨弓の張り" },
    { key: "torso_depth", label: "胸郭の厚み", note: "前後の厚み" },
    { key: "pelvis_width", label: "骨盤幅", note: "腸骨稜の横幅" },
    { key: "joint_size", label: "関節の主張", note: "手首/肘/膝" },
    { key: "bone_sharpness", label: "骨の角", note: "丸み ↔ 角張り" },
    { key: "leg_ratio", label: "脚長比率", note: "股下/身長" },
    { key: "arm_ratio", label: "腕長比率", note: "裄丈/身長" },
    { key: "waist_position", label: "ウエスト位置", note: "高 ↔ 低" },
    { key: "posture_round_shoulders", label: "巻き肩傾向", note: "前傾/内巻き" },
    { key: "pelvic_tilt", label: "骨盤前傾", note: "前傾/後傾" },
    { key: "mobility_upper", label: "上半身可動", note: "肩甲骨の動き" },
];

const MEASURE_FIELDS = [
    { key: "stature", label: "身長", unit: "cm" },
    { key: "shoulder_breadth", label: "肩幅", unit: "cm" },
    { key: "chest_circ", label: "胸囲", unit: "cm" },
    { key: "waist_circ", label: "胴囲", unit: "cm" },
    { key: "hip_circ", label: "ヒップ", unit: "cm" },
    { key: "sleeve_length", label: "袖丈", unit: "cm" },
    { key: "inseam", label: "股下", unit: "cm" },
    { key: "rise", label: "股上", unit: "cm" },
    { key: "thigh_circ", label: "太もも", unit: "cm" },
    { key: "calf_circ", label: "ふくらはぎ", unit: "cm" },
    { key: "armhole_depth", label: "袖ぐり深さ", unit: "cm" },
    { key: "torso_depth", label: "胸郭厚み", unit: "cm" },
];

const CPV_FIELDS = [
    { key: "undertone", label: "undertone", note: "-1 cool / +1 warm" },
    { key: "value_L", label: "value(L*)", note: "0..100 明度" },
    { key: "chroma_C", label: "chroma(C*)", note: "彩度" },
    { key: "clarity", label: "clarity", note: "0..1 クリア度" },
    { key: "depth", label: "depth", note: "0..1 深み" },
    { key: "contrast", label: "contrast", note: "0..1 コントラスト" },
    { key: "skin_redness_a", label: "skin a*", note: "赤み指標" },
    { key: "skin_yellowness_b", label: "skin b*", note: "黄み指標" },
    { key: "temperature_stability", label: "temp stability", note: "0..1" },
    { key: "confidence", label: "confidence", note: "0..1" },
];

const SCIENCE_LANDMARKS = [
    { title: "肩峰（Acromion）", desc: "肩線・肩幅の基準点" },
    { title: "鎖骨（Clavicle）", desc: "首回り/襟の当たり" },
    { title: "肩甲骨（Scapula）", desc: "背中の可動域・突っ張り" },
    { title: "胸骨（Sternum）", desc: "胸の厚み/前面ボリューム" },
    { title: "肋骨弓（Rib cage）", desc: "胸郭の横幅/厚み" },
    { title: "腸骨稜（Iliac crest）", desc: "ウエスト位置・股上" },
    { title: "ASIS", desc: "ベルト干渉/股上の基準点" },
    { title: "大転子（Greater trochanter）", desc: "ヒップ外側の張り" },
    { title: "大腿骨軸（Femur axis）", desc: "脚ライン・テーパード適性" },
];

const SCIENCE_COLOR = [
    { title: "CIELAB / CIELCh", desc: "L*(明度)・a*(赤)・b*(黄)と、LChで色相/彩度を説明" },
    { title: "ΔE", desc: "色差の尺度。ΔEが小さいほど似合う色に近い" },
    { title: "coverage", desc: "面積比で重み付けして主色/差し色を評価" },
];

const CFV_SCALE = [
    { label: "低 (0)", value: "0", desc: "華奢/小さめ" },
    { label: "中 (1)", value: "1", desc: "標準" },
    { label: "高 (2)", value: "2", desc: "しっかり/大きめ" },
];

function toNum(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function toStr(value: any) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string") return value;
    return "";
}

export default function BodyColorPage() {
    const [activeTab, setActiveTab] = useState<"body" | "color" | "science">("body");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [bodyLabels, setBodyLabels] = useState({ jp_3type: "", jp_7type: "" });
    const [bodyConfidence, setBodyConfidence] = useState("");
    const [cfv, setCfv] = useState<Record<string, string>>({});
    const [measurements, setMeasurements] = useState<Record<string, string>>({});
    const [measuredAt, setMeasuredAt] = useState<string | null>(null);

    const [colorLabels, setColorLabels] = useState({ season4: "", season12: "", season16: "" });
    const [cpv, setCpv] = useState<Record<string, string>>({});
    const [palettePreferred, setPalettePreferred] = useState("");
    const [paletteAvoid, setPaletteAvoid] = useState("");

    const headingStyle = useMemo(() => ({ fontFamily: "'Cormorant Garamond', serif" }), []);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/body-color/profile", { cache: "no-store" });
                if (res.status === 401) {
                    setError("ログインが必要です");
                    return;
                }
                const data = await res.json();
                if (data?.body_profile) {
                    setBodyLabels({
                        jp_3type: toStr(data.body_profile.display_labels?.jp_3type),
                        jp_7type: toStr(data.body_profile.display_labels?.jp_7type),
                    });
                    setBodyConfidence(toStr(data.body_profile.confidence?.overall));
                    const nextCfv: Record<string, string> = {};
                    CFV_FIELDS.forEach((f) => {
                        nextCfv[f.key] = toStr(data.body_profile.cfv?.[f.key]);
                    });
                    setCfv(nextCfv);
                }

                if (data?.measurement) {
                    const nextM: Record<string, string> = {};
                    MEASURE_FIELDS.forEach((f) => {
                        nextM[f.key] = toStr(data.measurement?.[f.key]);
                    });
                    setMeasurements(nextM);
                    setMeasuredAt(data.measured_at ?? null);
                }

                if (data?.color_profile) {
                    setColorLabels({
                        season4: toStr(data.color_profile.labels?.season4),
                        season12: toStr(data.color_profile.labels?.season12),
                        season16: toStr(data.color_profile.labels?.season16),
                    });
                    const nextCpv: Record<string, string> = {};
                    CPV_FIELDS.forEach((f) => {
                        nextCpv[f.key] = toStr(data.color_profile.cpv?.[f.key]);
                    });
                    setCpv(nextCpv);
                    if (Array.isArray(data.color_profile.palette?.preferred_lab_centroids)) {
                        setPalettePreferred(JSON.stringify(data.color_profile.palette.preferred_lab_centroids, null, 2));
                    }
                    if (Array.isArray(data.color_profile.palette?.avoid_lab_centroids)) {
                        setPaletteAvoid(JSON.stringify(data.color_profile.palette.avoid_lab_centroids, null, 2));
                    }
                }
            } catch (e: any) {
                setError(String(e?.message ?? e));
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    const setCfvValue = (key: string, value: string) => {
        setCfv((prev) => ({ ...prev, [key]: value }));
        setMessage(null);
        setError(null);
    };

    const setCpvValue = (key: string, value: string) => {
        setCpv((prev) => ({ ...prev, [key]: value }));
        setMessage(null);
        setError(null);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        setError(null);

        const cfvPayload: Record<string, number> = {};
        CFV_FIELDS.forEach((f) => {
            const v = toNum(cfv[f.key] ?? "");
            if (v !== undefined) cfvPayload[f.key] = v;
        });

        const measurementPayload: Record<string, number> = {};
        MEASURE_FIELDS.forEach((f) => {
            const v = toNum(measurements[f.key] ?? "");
            if (v !== undefined) measurementPayload[f.key] = v;
        });

        const cpvPayload: Record<string, number> = {};
        CPV_FIELDS.forEach((f) => {
            const v = toNum(cpv[f.key] ?? "");
            if (v !== undefined) cpvPayload[f.key] = v;
        });

        let preferredLab: any = undefined;
        let avoidLab: any = undefined;
        let jsonError = false;
        try {
            if (palettePreferred.trim()) preferredLab = JSON.parse(palettePreferred);
        } catch {
            jsonError = true;
            setError("preferred_lab_centroids のJSONが不正です");
        }
        try {
            if (paletteAvoid.trim()) avoidLab = JSON.parse(paletteAvoid);
        } catch {
            jsonError = true;
            setError("avoid_lab_centroids のJSONが不正です");
        }

        if (jsonError) {
            setSaving(false);
            return;
        }

        try {
            const res = await fetch("/api/body-color/profile", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    body_profile: {
                        cfv: cfvPayload,
                        display_labels: {
                            jp_3type: bodyLabels.jp_3type || undefined,
                            jp_7type: bodyLabels.jp_7type || undefined,
                        },
                        confidence: {
                            overall: toNum(bodyConfidence),
                        },
                    },
                    color_profile: {
                        cpv: cpvPayload,
                        labels: {
                            season4: colorLabels.season4 || undefined,
                            season12: colorLabels.season12 || undefined,
                            season16: colorLabels.season16 || undefined,
                        },
                        palette: {
                            preferred_lab_centroids: preferredLab,
                            avoid_lab_centroids: avoidLab,
                        },
                    },
                    measurements: measurementPayload,
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
                            href="/ai-hub"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900" style={headingStyle}>
                                Body & Color Lab
                            </h1>
                            <p className="text-xs text-slate-400">CFV / CPV を保存してスコア化</p>
                        </div>
                    </div>
                    <GlassButton href="/style-profile" variant="secondary" size="sm">
                        Style DNAへ
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32 space-y-6">
                <FadeInView>
                    <GlassCard className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-slate-400">Scientific Profiles</div>
                                <div className="text-xl font-bold text-slate-900">骨格 × パーソナルカラー</div>
                                <p className="text-sm text-slate-500">
                                    CFV/CPVを保存すると、Fit/Colorスコアが商品に反映されます。
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <GlassBadge variant="gradient">Culcept Skeleton Spec v1</GlassBadge>
                                <GlassBadge variant="secondary">CIELAB / ΔE</GlassBadge>
                                <GlassButton href="/body-color/avatar" size="sm" variant="secondary">
                                    アバター入力へ
                                </GlassButton>
                            </div>
                        </div>
                    </GlassCard>
                </FadeInView>

                {error === "ログインが必要です" && (
                    <GlassCard className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-lg font-bold text-slate-900">ログインが必要です</div>
                                <div className="text-sm text-slate-500">
                                    Body/Colorプロファイルを保存するにはログインしてください。
                                </div>
                            </div>
                            <GlassButton href="/login?next=/body-color" variant="gradient">
                                ログイン
                            </GlassButton>
                        </div>
                    </GlassCard>
                )}

                <GlassTabs
                    tabs={[
                        { id: "body", label: "Body Profile", icon: "🧬" },
                        { id: "color", label: "Color Profile", icon: "🎨" },
                        { id: "science", label: "Science", icon: "🔬" },
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as typeof activeTab)}
                />

                {loading && (
                    <GlassCard className="p-6">
                        <div className="animate-pulse text-slate-400">loading...</div>
                    </GlassCard>
                )}

                {!loading && activeTab === "body" && (
                    <div className="space-y-6">
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">骨格ラベル</h2>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">jp_3type</label>
                                    <GlassInput
                                        value={bodyLabels.jp_3type}
                                        onChange={(value) => setBodyLabels((prev) => ({ ...prev, jp_3type: value }))}
                                        placeholder="例: Straight"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">jp_7type</label>
                                    <GlassInput
                                        value={bodyLabels.jp_7type}
                                        onChange={(value) => setBodyLabels((prev) => ({ ...prev, jp_7type: value }))}
                                        placeholder="例: Soft straight"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">confidence</label>
                                    <GlassInput
                                        value={bodyConfidence}
                                        onChange={setBodyConfidence}
                                        placeholder="0..1"
                                    />
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">CFV 14軸（0..2）</h2>
                                    <p className="text-xs text-slate-500">
                                        0=低 / 1=中 / 2=高。迷ったら「中(1)」でOK。
                                    </p>
                                </div>
                                <GlassBadge variant="secondary">Culcept Frame Vector</GlassBadge>
                            </div>
                            <div className="grid md:grid-cols-2 gap-5">
                                {CFV_FIELDS.map((field) => (
                                    <div key={field.key} className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <div className="text-sm font-semibold text-slate-700">{field.label}</div>
                                            <div className="text-xs text-slate-400">{field.note}</div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center gap-1">
                                                {CFV_SCALE.map((opt) => (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => setCfvValue(field.key, opt.value)}
                                                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                                            cfv[field.key] === opt.value
                                                                ? "bg-slate-900 text-white border-slate-900"
                                                                : "bg-white/70 text-slate-600 border-slate-200 hover:border-slate-400"
                                                        }`}
                                                        title={opt.desc}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => setCfvValue(field.key, "")}
                                                    className="px-2 py-1 rounded-full text-[11px] font-semibold text-slate-500 border border-slate-200 bg-white/60 hover:border-slate-300"
                                                >
                                                    クリア
                                                </button>
                                            </div>
                                            <div className="w-28">
                                                <GlassInput
                                                    value={cfv[field.key] ?? ""}
                                                    onChange={(value) => setCfvValue(field.key, value)}
                                                    placeholder="0..2"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h2 className="text-lg font-bold text-slate-900">人体計測（ISO 8559-1）</h2>
                                {measuredAt && (
                                    <span className="text-xs text-slate-400">
                                        最終更新: {new Date(measuredAt).toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500 mb-3">
                                単位はすべてcm。小数点もOK。
                            </div>
                            <div className="grid md:grid-cols-3 gap-4">
                                {MEASURE_FIELDS.map((field) => (
                                    <div key={field.key}>
                                        <label className="text-sm font-semibold text-slate-600">
                                            {field.label}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <GlassInput
                                                    value={measurements[field.key] ?? ""}
                                                    onChange={(value) => setMeasurements((prev) => ({ ...prev, [field.key]: value }))}
                                                    placeholder="例: 40"
                                                />
                                            </div>
                                            <span className="text-xs text-slate-400 w-8">{field.unit}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </div>
                )}

                {!loading && activeTab === "color" && (
                    <div className="space-y-6">
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">ラベル（season）</h2>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">season4</label>
                                    <GlassInput
                                        value={colorLabels.season4}
                                        onChange={(value) => setColorLabels((prev) => ({ ...prev, season4: value }))}
                                        placeholder="spring/summer/autumn/winter"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">season12</label>
                                    <GlassInput
                                        value={colorLabels.season12}
                                        onChange={(value) => setColorLabels((prev) => ({ ...prev, season12: value }))}
                                        placeholder="light_spring など"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">season16</label>
                                    <GlassInput
                                        value={colorLabels.season16}
                                        onChange={(value) => setColorLabels((prev) => ({ ...prev, season16: value }))}
                                        placeholder="warm_autumn など"
                                    />
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">CPV 10軸</h2>
                                    <p className="text-xs text-slate-500">
                                        undertone: -1(cool)〜+1(warm)、contrast/clarityは0..1。
                                    </p>
                                </div>
                                <GlassBadge variant="secondary">Culcept Color Profile</GlassBadge>
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                {CPV_FIELDS.map((field) => (
                                    <div key={field.key} className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <div className="text-sm font-semibold text-slate-700">{field.label}</div>
                                            <div className="text-xs text-slate-400">{field.note}</div>
                                        </div>
                                        <div className="w-32">
                                            <GlassInput
                                                value={cpv[field.key] ?? ""}
                                                onChange={(value) => setCpvValue(field.key, value)}
                                                placeholder="数値"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                                <span className="px-2 py-1 rounded-full bg-slate-50">undertone: -1 cool / 0 neutral / +1 warm</span>
                                <span className="px-2 py-1 rounded-full bg-slate-50">value_L: 0..100</span>
                                <span className="px-2 py-1 rounded-full bg-slate-50">chroma_C: 0..200</span>
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">パレット（LAB中心）</h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">preferred_lab_centroids</label>
                                    <div className="text-xs text-slate-400 mt-1">
                                        例: [{"{"}"L{"\""}:65,"a{"\""}:10,"b{"\""}:18{"}"}]
                                    </div>
                                    <textarea
                                        value={palettePreferred}
                                        onChange={(e) => setPalettePreferred(e.target.value)}
                                        className="mt-2 w-full min-h-[140px] rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
                                        placeholder='[{"L":65,"a":10,"b":18}]'
                                    />
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            onClick={() => setPalettePreferred('[{"L":65,"a":10,"b":18},{"L":72,"a":6,"b":24}]')}
                                            className="text-xs text-slate-500 underline hover:text-slate-700"
                                        >
                                            サンプルを入れる
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">avoid_lab_centroids</label>
                                    <div className="text-xs text-slate-400 mt-1">
                                        例: [{"{"}"L{"\""}:30,"a{"\""}:-2,"b{"\""}:-12{"}"}]
                                    </div>
                                    <textarea
                                        value={paletteAvoid}
                                        onChange={(e) => setPaletteAvoid(e.target.value)}
                                        className="mt-2 w-full min-h-[140px] rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
                                        placeholder='[{"L":30,"a":-2,"b":-12}]'
                                    />
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            onClick={() => setPaletteAvoid('[{"L":28,"a":-4,"b":-14}]')}
                                            className="text-xs text-slate-500 underline hover:text-slate-700"
                                        >
                                            サンプルを入れる
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    </div>
                )}

                {!loading && activeTab === "science" && (
                    <div className="space-y-6">
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">骨ランドマーク辞書</h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                {SCIENCE_LANDMARKS.map((item) => (
                                    <div key={item.title} className="rounded-2xl bg-white/70 border border-white/60 p-4">
                                        <div className="font-semibold text-slate-800">{item.title}</div>
                                        <div className="text-sm text-slate-500">{item.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">色科学</h2>
                            <div className="space-y-3">
                                {SCIENCE_COLOR.map((item) => (
                                    <div key={item.title} className="rounded-2xl bg-white/70 border border-white/60 p-4">
                                        <div className="font-semibold text-slate-800">{item.title}</div>
                                        <div className="text-sm text-slate-500">{item.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-2">科学メモ</h2>
                            <p className="text-sm text-slate-600">
                                成人骨格は軸骨格80＋付属骨格126（計206）という区分が一般的です。
                                ISO 8559-1:2017 に基づく計測値と骨ランドマークを組み合わせることで、
                                “似合う/入る”の差を説明可能にします。
                            </p>
                        </GlassCard>
                    </div>
                )}

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
