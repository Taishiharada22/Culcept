"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassInput,
    GlassBadge,
} from "@/components/ui/glassmorphism-design";

const MEASURE_POINTS = [
    { key: "stature", label: "縦の長さ", unit: "cm", top: "6%", left: "60%" },
    { key: "shoulder_breadth", label: "肩幅", unit: "cm", top: "18%", left: "62%" },
    { key: "chest_circ", label: "胸囲", unit: "cm", top: "28%", left: "64%" },
    { key: "waist_circ", label: "胴囲", unit: "cm", top: "40%", left: "64%" },
    { key: "hip_circ", label: "ヒップ", unit: "cm", top: "52%", left: "64%" },
    { key: "inseam", label: "股下", unit: "cm", top: "70%", left: "60%" },
];

const CFV_POINTS = [
    { key: "vertical_line", label: "縦の長さ感", top: "10%", left: "16%" },
    { key: "shoulder_width", label: "肩幅感", top: "20%", left: "16%" },
    { key: "torso_depth", label: "胸郭の厚み", top: "30%", left: "16%" },
    { key: "pelvis_width", label: "骨盤幅", top: "52%", left: "16%" },
    { key: "posture_round_shoulders", label: "巻き肩傾向", top: "24%", left: "40%" },
];

const SCALE = [
    { value: "0", label: "低" },
    { value: "1", label: "中" },
    { value: "2", label: "高" },
];

const AVATAR_ASSET_UPLOADS = [
    { kind: "person", label: "person_rgba.png", accept: "image/png,image/jpeg,image/webp" },
    { kind: "clothes", label: "clothes_rgba.png", accept: "image/png,image/jpeg,image/webp" },
    { kind: "mask", label: "mask_clothes.png", accept: "image/png,image/jpeg,image/webp" },
    { kind: "turntable", label: "preview_turntable.gif", accept: "image/gif" },
    { kind: "mesh", label: "mesh.glb", accept: ".glb,model/gltf-binary" },
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

export default function BodyColorAvatarPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [measurements, setMeasurements] = useState<Record<string, string>>({});
    const [cfv, setCfv] = useState<Record<string, string>>({});
    const [cpv, setCpv] = useState<Record<string, string>>({});
    const [avatarViews, setAvatarViews] = useState<Record<string, string>>({});
    const [avatarAssets, setAvatarAssets] = useState<Record<string, string>>({});
    const [useTurntable, setUseTurntable] = useState(false);
    const [uploadingView, setUploadingView] = useState<string | null>(null);
    const [rotation, setRotation] = useState(0);
    const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [pipelineEnable3d, setPipelineEnable3d] = useState(false);
    const [pipelineNotice, setPipelineNotice] = useState<string | null>(null);
    const [pipelineAsync, setPipelineAsync] = useState(true);
    const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
    const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

    const dragState = useRef<{ x: number; rotating: boolean }>({ x: 0, rotating: false });

    const headingStyle = useMemo(() => ({ fontFamily: "'Cormorant Garamond', serif" }), []);

    const applyPipelineUrls = useCallback((urls: Record<string, any>) => {
        setAvatarAssets((prev) => ({
            ...prev,
            person_cutout_url: urls.person ?? prev.person_cutout_url,
            clothes_cutout_url: urls.clothes ?? prev.clothes_cutout_url,
            mask_clothes_url: urls.mask ?? prev.mask_clothes_url,
            turntable_gif_url: urls.turntable ?? prev.turntable_gif_url,
            mesh_glb_url: urls.mesh ?? prev.mesh_glb_url,
        }));
        if (urls.person) {
            setAvatarViews((prev) => ({ ...prev, front: prev.front ?? urls.person }));
        }
        if (urls.turntable) setUseTurntable(true);
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/body-color/profile", { cache: "no-store" });
                if (res.status === 401) {
                    setError("ログインが必要です");
                    return;
                }
                const data = await res.json();
                if (data?.measurement) {
                    const nextM: Record<string, string> = {};
                    MEASURE_POINTS.forEach((f) => {
                        nextM[f.key] = toStr(data.measurement?.[f.key]);
                    });
                    setMeasurements(nextM);
                }
                if (data?.body_profile?.cfv) {
                    const nextC: Record<string, string> = {};
                    CFV_POINTS.forEach((f) => {
                        nextC[f.key] = toStr(data.body_profile.cfv?.[f.key]);
                    });
                    setCfv(nextC);
                }
                if (data?.color_profile?.cpv) {
                    setCpv({
                        undertone: toStr(data.color_profile.cpv?.undertone),
                        value_L: toStr(data.color_profile.cpv?.value_L),
                        chroma_C: toStr(data.color_profile.cpv?.chroma_C),
                        contrast: toStr(data.color_profile.cpv?.contrast),
                    });
                }
                if (data?.avatar_profile?.views) {
                    setAvatarViews(data.avatar_profile.views);
                }
                if (data?.avatar_profile) {
                    setAvatarAssets({
                        person_cutout_url: toStr(data.avatar_profile.person_cutout_url),
                        clothes_cutout_url: toStr(data.avatar_profile.clothes_cutout_url),
                        mask_clothes_url: toStr(data.avatar_profile.mask_clothes_url),
                        turntable_gif_url: toStr(data.avatar_profile.turntable_gif_url),
                        mesh_glb_url: toStr(data.avatar_profile.mesh_glb_url),
                    });
                    setUseTurntable(!!data.avatar_profile.turntable_gif_url);
                }
            } catch (e: any) {
                setError(String(e?.message ?? e));
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    useEffect(() => {
        if (!pipelineJobId) return;
        let active = true;

        const poll = async () => {
            if (!active) return;
            try {
                const res = await fetch(`/api/body-color/pipeline?jobId=${pipelineJobId}`, {
                    cache: "no-store",
                });
                const data = await res.json();
                if (!data?.ok) {
                    setPipelineNotice(data?.error ?? "ジョブの取得に失敗しました");
                    if (res.status === 401 || res.status === 404) {
                        setPipelineJobId(null);
                        return;
                    }
                } else {
                    const job = data?.job;
                    if (!job) return;
                    setPipelineStatus(job.status);

                    if (job.status === "done") {
                        const urls = job.result_urls ?? {};
                        applyPipelineUrls(urls);
                        if (job.warning) setPipelineNotice(`3D生成: ${job.warning}`);
                        setMessage("自動生成が完了しました。");
                        setPipelineJobId(null);
                        return;
                    }

                    if (job.status === "error") {
                        setError(job.error ?? "自動生成に失敗しました");
                        setPipelineJobId(null);
                        return;
                    }
                }
            } catch (e: any) {
                setPipelineNotice(String(e?.message ?? e));
            }

            if (active) {
                setTimeout(poll, 4000);
            }
        };

        poll();

        return () => {
            active = false;
        };
    }, [pipelineJobId, applyPipelineUrls]);

    useEffect(() => {
        return () => {
            Object.values(avatarViews).forEach((url) => {
                if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
            });
        };
    }, [avatarViews]);

    const handleUpload = (view: string, file: File | null) => {
        if (!file) return;
        const localUrl = URL.createObjectURL(file);
        setAvatarViews((prev) => ({ ...prev, [view]: localUrl }));
        setUploadingView(view);
        setMessage(null);
        setError(null);

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const imageData = String(reader.result || "");
                const res = await fetch("/api/body-color/avatar", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ view, imageData }),
                });
                const data = await res.json();
                if (!data?.ok) {
                    setError(data?.error ?? "アップロードに失敗しました");
                    return;
                }
                if (data?.url) {
                    setAvatarViews((prev) => ({ ...prev, [view]: data.url }));
                }
            } catch (e: any) {
                setError(String(e?.message ?? e));
            } finally {
                setUploadingView(null);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleAssetUpload = async (kind: string, file: File | null) => {
        if (!file) return;
        setUploadingAsset(kind);
        setMessage(null);
        setError(null);
        try {
            const form = new FormData();
            form.append("kind", kind);
            form.append("file", file);
            const res = await fetch("/api/body-color/avatar-assets", {
                method: "POST",
                body: form,
            });
            const data = await res.json();
            if (!data?.ok) {
                setError(data?.error ?? "アップロードに失敗しました");
                return;
            }
            const url = data?.url as string;
            if (url) {
                const map: Record<string, keyof typeof avatarAssets> = {
                    person: "person_cutout_url",
                    clothes: "clothes_cutout_url",
                    mask: "mask_clothes_url",
                    turntable: "turntable_gif_url",
                    mesh: "mesh_glb_url",
                };
                const key = map[kind];
                if (key) {
                    setAvatarAssets((prev) => ({ ...prev, [key]: url }));
                    if (key === "turntable_gif_url") setUseTurntable(true);
                }
            }
        } catch (e: any) {
            setError(String(e?.message ?? e));
        } finally {
            setUploadingAsset(null);
        }
    };

    const handlePipeline = async (file: File | null) => {
        if (!file) return;
        setPipelineRunning(true);
        setPipelineNotice(null);
        setMessage(null);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("enable3d", pipelineEnable3d ? "1" : "0");
            form.append("async", pipelineAsync ? "1" : "0");
            const endpoint = pipelineAsync ? "/api/body-color/pipeline?async=1" : "/api/body-color/pipeline";
            const res = await fetch(endpoint, {
                method: "POST",
                body: form,
            });
            const data = await res.json();
            if (!data?.ok) {
                setError(data?.error ?? "生成に失敗しました");
                return;
            }
            if (data?.mode === "queued") {
                setPipelineJobId(data?.job?.id ?? null);
                setPipelineStatus(data?.job?.status ?? "queued");
                setPipelineNotice("キューに追加しました。完了まで数十秒お待ちください。");
                return;
            }

            const urls = data?.urls ?? {};
            applyPipelineUrls(urls);
            setPipelineJobId(null);
            setPipelineStatus(null);
            if (data?.mesh_warning) {
                setPipelineNotice(`3D生成: ${data.mesh_warning}`);
            } else if (pipelineEnable3d && !urls.mesh) {
                setPipelineNotice("3D生成はスキップされました");
            }
        } catch (e: any) {
            setError(String(e?.message ?? e));
        } finally {
            setPipelineRunning(false);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const next = (rotation + e.deltaY * 0.2) % 360;
        setRotation(next < 0 ? next + 360 : next);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        dragState.current = { x: e.clientX, rotating: true };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragState.current.rotating) return;
        const delta = e.clientX - dragState.current.x;
        dragState.current.x = e.clientX;
        setRotation((prev) => (prev + delta * 0.6) % 360);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        dragState.current.rotating = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const setCfvValue = (key: string, value: string) => {
        setCfv((prev) => ({ ...prev, [key]: value }));
        setMessage(null);
        setError(null);
    };

    const setMeasureValue = (key: string, value: string) => {
        setMeasurements((prev) => ({ ...prev, [key]: value }));
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

        const measurementPayload: Record<string, number> = {};
        MEASURE_POINTS.forEach((f) => {
            const v = toNum(measurements[f.key] ?? "");
            if (v !== undefined) measurementPayload[f.key] = v;
        });

        const cfvPayload: Record<string, number> = {};
        CFV_POINTS.forEach((f) => {
            const v = toNum(cfv[f.key] ?? "");
            if (v !== undefined) cfvPayload[f.key] = v;
        });

        const cpvPayload: Record<string, number> = {};
        ["undertone", "value_L", "chroma_C", "contrast"].forEach((key) => {
            const v = toNum(cpv[key] ?? "");
            if (v !== undefined) cpvPayload[key] = v;
        });

        const avatarAssetsPayload: Record<string, string> = {};
        Object.entries(avatarAssets).forEach(([key, value]) => {
            if (value) avatarAssetsPayload[key] = value;
        });

        try {
            const res = await fetch("/api/body-color/profile", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    body_profile: {
                        cfv: cfvPayload,
                    },
                    measurements: measurementPayload,
                    color_profile: {
                        cpv: cpvPayload,
                    },
                    avatar_assets: avatarAssetsPayload,
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

    const viewOrder = ["front", "right", "back", "left"];
    const activeViewIndex = Math.round((((rotation % 360) + 360) % 360) / 90) % viewOrder.length;
    const activeView = viewOrder[activeViewIndex];
    const activeImage =
        avatarViews[activeView] ||
        avatarViews.front ||
        avatarViews.right ||
        avatarViews.left ||
        avatarViews.back ||
        avatarAssets.person_cutout_url ||
        avatarAssets.clothes_cutout_url ||
        null;

    return (
        <LightBackground>
            {avatarAssets.mesh_glb_url && (
                <Script
                    type="module"
                    src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
                />
            )}
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/body-color"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900" style={headingStyle}>
                                アバター入力
                            </h1>
                            <p className="text-xs text-slate-400">全身に沿ってデータを追加</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <GlassBadge variant="secondary">360°スクロール</GlassBadge>
                        <GlassButton href="/body-color" size="sm" variant="secondary">
                            テキスト入力へ
                        </GlassButton>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-32 space-y-6">
                {error === "ログインが必要です" && (
                    <GlassCard className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-lg font-bold text-slate-900">ログインが必要です</div>
                                <div className="text-sm text-slate-500">
                                    アバター入力はログイン後に利用できます。
                                </div>
                            </div>
                            <GlassButton href="/login?next=/body-color/avatar" variant="gradient">
                                ログイン
                            </GlassButton>
                        </div>
                    </GlassCard>
                )}

                <GlassCard className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-700">1枚写真から自動生成</div>
                            <div className="text-xs text-slate-400">
                                person_rgba / clothes_rgba / mask / turntable を自動作成します。
                            </div>
                        </div>
                        <GlassBadge variant="secondary">無料パイプライン</GlassBadge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            id="pipeline-upload"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handlePipeline(e.target.files?.[0] ?? null)}
                        />
                        <GlassButton
                            size="sm"
                            variant="gradient"
                            onClick={() => (document.getElementById("pipeline-upload") as HTMLInputElement | null)?.click()}
                            loading={pipelineRunning}
                        >
                            写真を選んで生成
                        </GlassButton>
                        <label className="flex items-center gap-2 text-xs text-slate-500">
                            <input
                                type="checkbox"
                                checked={pipelineAsync}
                                onChange={(e) => setPipelineAsync(e.target.checked)}
                            />
                            キューで実行（推奨）
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-500">
                            <input
                                type="checkbox"
                                checked={pipelineEnable3d}
                                onChange={(e) => setPipelineEnable3d(e.target.checked)}
                            />
                            3D(mesh.glb)も生成する
                        </label>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-2 space-y-1">
                        <div>Python環境が必要です。遅い場合は3DをOFFにしてください。キュー実行時は完了まで待たずに移動できます。</div>
                        <div>3D生成は `TRIPOSR_CMD` または `tripo_sr` の導入が必要です。</div>
                        <div>キュー実行は `CRON_SECRET` を設定したcronで回します。</div>
                    </div>
                    {pipelineJobId && (
                        <div className="mt-2 text-xs text-slate-500">
                            ジョブ: {pipelineJobId.slice(0, 8)}… / 状態: {pipelineStatus ?? "queued"}
                        </div>
                    )}
                    {pipelineNotice && <div className="mt-2 text-xs text-amber-600">{pipelineNotice}</div>}
                </GlassCard>

                <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
                    <GlassCard className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <div className="text-sm font-semibold text-slate-700">全身アバター</div>
                                <div className="text-xs text-slate-400">
                                    スクロール/ドラッグで回転。数値はその場で入力できます。
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    id="avatar-upload-front"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => handleUpload("front", e.target.files?.[0] ?? null)}
                                />
                                <GlassButton
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => (document.getElementById("avatar-upload-front") as HTMLInputElement | null)?.click()}
                                >
                                    正面を追加
                                </GlassButton>
                                <GlassButton
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                        setAvatarViews((prev) => ({
                                            ...prev,
                                            left: prev.front || prev.left,
                                            right: prev.front || prev.right,
                                            back: prev.front || prev.back,
                                        }))
                                    }
                                >
                                    正面を全方向にコピー
                                </GlassButton>
                                <input
                                    id="avatar-upload-left"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => handleUpload("left", e.target.files?.[0] ?? null)}
                                />
                                <GlassButton
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => (document.getElementById("avatar-upload-left") as HTMLInputElement | null)?.click()}
                                >
                                    左側面
                                </GlassButton>
                                <input
                                    id="avatar-upload-right"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => handleUpload("right", e.target.files?.[0] ?? null)}
                                />
                                <GlassButton
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => (document.getElementById("avatar-upload-right") as HTMLInputElement | null)?.click()}
                                >
                                    右側面
                                </GlassButton>
                                <input
                                    id="avatar-upload-back"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => handleUpload("back", e.target.files?.[0] ?? null)}
                                />
                                <GlassButton
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => (document.getElementById("avatar-upload-back") as HTMLInputElement | null)?.click()}
                                >
                                    背面
                                </GlassButton>
                                <GlassButton size="sm" variant="secondary" onClick={() => setRotation(0)}>
                                    回転リセット
                                </GlassButton>
                                {avatarAssets.turntable_gif_url && (
                                    <GlassButton
                                        size="sm"
                                        variant={useTurntable ? "gradient" : "secondary"}
                                        onClick={() => setUseTurntable((v) => !v)}
                                    >
                                        {useTurntable ? "Turntable On" : "Turntable"}
                                    </GlassButton>
                                )}
                            </div>
                        </div>
                        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>正面/側面/背面を入れるほど“擬似3D”の回転が自然になります。</span>
                            <span>背景透過PNGだと切り抜き表示が綺麗です。</span>
                            {uploadingView && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                    {uploadingView} をアップロード中…
                                </span>
                            )}
                        </div>

                        <div className="relative rounded-3xl border border-white/60 bg-white/60 p-6 overflow-hidden">
                            <div
                                className="relative mx-auto aspect-[3/5] max-w-md rounded-3xl bg-gradient-to-b from-white to-slate-100 border border-white/70 shadow-inner"
                                onWheel={handleWheel}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                style={{ touchAction: "none" }}
                            >
                                <div
                                    className="absolute inset-6 rounded-3xl overflow-hidden flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200"
                                    style={{
                                        transform: useTurntable ? undefined : `perspective(1200px) rotateY(${rotation}deg)`,
                                        transition: dragState.current.rotating ? "none" : "transform 0.15s ease-out",
                                    }}
                                >
                                    {(useTurntable && avatarAssets.turntable_gif_url) || activeImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={useTurntable && avatarAssets.turntable_gif_url ? avatarAssets.turntable_gif_url : activeImage!}
                                            alt="avatar"
                                            className="h-full w-full object-cover"
                                            style={{ filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.12))" }}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <div className="text-5xl">🧍</div>
                                            <div className="text-xs mt-2">画像をアップロード</div>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                    View: {useTurntable && avatarAssets.turntable_gif_url ? "turntable" : activeView}
                                </div>

                                {MEASURE_POINTS.map((point) => (
                                    <div
                                        key={point.key}
                                        className="absolute"
                                        style={{ top: point.top, left: point.left, transform: "translate(-50%, -50%)" }}
                                    >
                                        <div className="rounded-xl bg-white/90 border border-white/70 shadow-sm px-3 py-2 min-w-[140px]">
                                            <div className="text-[11px] font-semibold text-slate-700">{point.label}</div>
                                            <div className="mt-1 flex items-center gap-2">
                                                <input
                                                    value={measurements[point.key] ?? ""}
                                                    onChange={(e) => setMeasureValue(point.key, e.target.value)}
                                                    placeholder="例: 40"
                                                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
                                                />
                                                <span className="text-[10px] text-slate-400">{point.unit}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {CFV_POINTS.map((point) => (
                                    <div
                                        key={point.key}
                                        className="absolute"
                                        style={{ top: point.top, left: point.left, transform: "translate(-50%, -50%)" }}
                                    >
                                        <div className="rounded-xl bg-white/90 border border-white/70 shadow-sm px-3 py-2">
                                            <div className="text-[11px] font-semibold text-slate-700">{point.label}</div>
                                            <div className="mt-1 flex items-center gap-1">
                                                {SCALE.map((opt) => (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => setCfvValue(point.key, opt.value)}
                                                        className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${cfv[point.key] === opt.value
                                                            ? "bg-slate-900 text-white border-slate-900"
                                                            : "bg-white text-slate-600 border-slate-200"
                                                            }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </GlassCard>

                    <div className="space-y-4">
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-3">入力のコツ</h2>
                            <div className="text-sm text-slate-600 space-y-2">
                                <div>肩幅は「肩峰〜肩峰」を意識</div>
                                <div>胸囲は息を吐いた自然な状態</div>
                                <div>股下は内くるぶしまで</div>
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-3">カラー入力（簡易）</h2>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">undertone</label>
                                    <div className="mt-2 flex items-center gap-2">
                                        {[
                                            { label: "cool", value: "-1" },
                                            { label: "neutral", value: "0" },
                                            { label: "warm", value: "1" },
                                        ].map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setCpvValue("undertone", opt.value)}
                                                className={`px-3 py-1 rounded-full text-xs font-semibold border ${cpv.undertone === opt.value
                                                    ? "bg-slate-900 text-white border-slate-900"
                                                    : "bg-white text-slate-600 border-slate-200"
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">明度 L*</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={cpv.value_L || "50"}
                                            onChange={(e) => setCpvValue("value_L", e.target.value)}
                                            className="flex-1"
                                        />
                                        <span className="text-xs text-slate-500 w-10 text-right">{cpv.value_L || "50"}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">彩度 C*</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={0}
                                            max={200}
                                            value={cpv.chroma_C || "80"}
                                            onChange={(e) => setCpvValue("chroma_C", e.target.value)}
                                            className="flex-1"
                                        />
                                        <span className="text-xs text-slate-500 w-10 text-right">{cpv.chroma_C || "80"}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-600">コントラスト</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={cpv.contrast ? String(Number(cpv.contrast) * 100) : "50"}
                                            onChange={(e) => setCpvValue("contrast", String(Number(e.target.value) / 100))}
                                            className="flex-1"
                                        />
                                        <span className="text-xs text-slate-500 w-10 text-right">
                                            {cpv.contrast ? Math.round(Number(cpv.contrast) * 100) : 50}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-3">生成物URL（パイプライン）</h2>
                            <div className="text-xs text-slate-500 mb-3">
                                `tools/vision-pipeline` の出力を `public/uploads/{"{userId}"}/` に置いてURLを登録します。
                            </div>
                            <div className="grid md:grid-cols-2 gap-3 mb-4">
                                {AVATAR_ASSET_UPLOADS.map((asset) => (
                                    <div key={asset.kind} className="rounded-2xl border border-slate-200 bg-white/70 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs font-semibold text-slate-600">{asset.label}</div>
                                            <input
                                                id={`asset-${asset.kind}`}
                                                type="file"
                                                accept={asset.accept}
                                                className="hidden"
                                                onChange={(e) => handleAssetUpload(asset.kind, e.target.files?.[0] ?? null)}
                                            />
                                            <GlassButton
                                                size="xs"
                                                variant="secondary"
                                                onClick={() => (document.getElementById(`asset-${asset.kind}`) as HTMLInputElement | null)?.click()}
                                            >
                                                追加
                                            </GlassButton>
                                        </div>
                                        {uploadingAsset === asset.kind && (
                                            <div className="mt-2 text-[11px] text-slate-500">アップロード中…</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-slate-500">person_rgba.png</label>
                                    <GlassInput
                                        value={avatarAssets.person_cutout_url ?? ""}
                                        onChange={(value) => setAvatarAssets((prev) => ({ ...prev, person_cutout_url: value }))}
                                        placeholder="/uploads/{id}/person_rgba.png"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">clothes_rgba.png</label>
                                    <GlassInput
                                        value={avatarAssets.clothes_cutout_url ?? ""}
                                        onChange={(value) => setAvatarAssets((prev) => ({ ...prev, clothes_cutout_url: value }))}
                                        placeholder="/uploads/{id}/clothes_rgba.png"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">mask_clothes.png</label>
                                    <GlassInput
                                        value={avatarAssets.mask_clothes_url ?? ""}
                                        onChange={(value) => setAvatarAssets((prev) => ({ ...prev, mask_clothes_url: value }))}
                                        placeholder="/uploads/{id}/mask_clothes.png"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">preview_turntable.gif</label>
                                    <GlassInput
                                        value={avatarAssets.turntable_gif_url ?? ""}
                                        onChange={(value) => {
                                            setAvatarAssets((prev) => ({ ...prev, turntable_gif_url: value }));
                                            if (value) setUseTurntable(true);
                                        }}
                                        placeholder="/uploads/{id}/preview_turntable.gif"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">mesh.glb（任意）</label>
                                    <GlassInput
                                        value={avatarAssets.mesh_glb_url ?? ""}
                                        onChange={(value) => setAvatarAssets((prev) => ({ ...prev, mesh_glb_url: value }))}
                                        placeholder="/uploads/{id}/mesh.glb"
                                    />
                                </div>
                                {avatarAssets.mesh_glb_url && (
                                    <Link
                                        href={avatarAssets.mesh_glb_url}
                                        target="_blank"
                                        className="text-xs text-slate-600 underline hover:text-slate-800"
                                    >
                                        3Dモデルを開く
                                    </Link>
                                )}
                            </div>
                        </GlassCard>

                        {avatarAssets.mesh_glb_url && (
                            <GlassCard className="p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-3">3Dプレビュー</h2>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                                    <model-viewer
                                        src={avatarAssets.mesh_glb_url}
                                        alt="avatar 3d"
                                        auto-rotate
                                        camera-controls
                                        shadow-intensity="0.3"
                                        exposure="0.9"
                                        environment-image="neutral"
                                        style={{ width: "100%", height: "360px", background: "linear-gradient(180deg,#f8fafc,#eef2ff)" }}
                                    />
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    ドラッグで回転、スクロールでズーム。
                                </div>
                            </GlassCard>
                        )}

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-3">保存</h2>
                            <p className="text-sm text-slate-500 mb-4">
                                保存するとFit/Colorスコアに反映されます。
                            </p>
                            <GlassButton onClick={handleSave} loading={saving} variant="gradient">
                                保存する
                            </GlassButton>
                            {message && <div className="mt-3 text-sm text-emerald-600">{message}</div>}
                            {error && error !== "ログインが必要です" && (
                                <div className="mt-3 text-sm text-rose-600">{error}</div>
                            )}
                        </GlassCard>

                        <GlassCard className="p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-3">次にやると良いこと</h2>
                            <div className="flex flex-col gap-2">
                                <Link
                                    href="/body-color"
                                    className="text-sm text-slate-600 underline hover:text-slate-800"
                                >
                                    テキスト入力で詳細なCFV/CPVを補完
                                </Link>
                                <Link
                                    href="/style-profile"
                                    className="text-sm text-slate-600 underline hover:text-slate-800"
                                >
                                    Style DNAで診断結果を見る
                                </Link>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </main>
        </LightBackground>
    );
}
