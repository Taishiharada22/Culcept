"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
    LightBackground,
    GlassNavbar,
    GlassButton,
} from "@/components/ui/glassmorphism-design";
import RealFaceCaptureInput from "@/components/body/RealFaceCaptureInput";
import RealFacePersonalColorDiagnosis from "@/components/body/RealFacePersonalColorDiagnosis";
import {
    analyzePhotoPersonalColor,
    type PhotoColorAnalysisResult,
} from "@/lib/personalColorPhotoAnalysis";
import { readRealFaceMeta } from "@/lib/realFaceStorage";
import type { RealFaceDiagnosisResult } from "@/lib/realFacePersonalColor";
import { resolveShoeWidthCodeClient } from "@/lib/shoeWidthClient";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { BODY_COLOR_AVATAR_INTRO } from "@/lib/ui/featureIntroConfigs";
import type { UserBodyAvatarProfile } from "@/types/body-color";
import { BODY_AXIS_DEFS, BODY_FIELD_DEFS } from "@/lib/my-style/diagnosisEngine";
import { useIsAnonymous } from "@/hooks/useIsAnonymous";
import { useRequireBaseline } from "@/hooks/useRequireBaseline";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

// Shared modules
import type {
    ViewId,
    AvatarFaceSubTab,
    AvatarProfileRecord,
    EyeProfileRecord,
    FacePhenotypeRecord,
    SeasonChoice,
    UndertoneChoice,
    ColorPaletteInputs,
    FusedColorResult,
    FusionHistoryEntry,
} from "./_components/shared/types";
import {
    DEFAULT_COLOR_PALETTE,
    SEASON_VISUAL,
    SEASON_SUBTYPE_OPTIONS,
    EYE_TYPE_LABELS,
    EYE_COLOR_LABELS,
    FACE_COMPLETION_LABELS,
    SEASON_AXIS_PRESETS,
} from "./_components/shared/constants";
import {
    toNum,
    toStr,
    asNonEmptyString,
    clamp01,
    clampNumber,
    normalizeSeasonChoice,
    normalizeUndertoneChoice,
    seasonLabelJa,
    undertoneLabelJa,
    formatPercent,
    findSubtypeOption,
    deriveSeasonFromSignals,
    deriveSeason12,
    deriveSeason16,
    buildPaletteInputs,
    mergeCpvWithPhotoAnalysis,
    buildFusionResult,
    createFusionHistoryEntry,
    normalizeAvatarProfile,
} from "./_components/shared/colorUtils";
import { CinematicEntry, ScrollProgress, CelebrationBurst, DNAHelixLoader } from "./_components/shared/visuals";

// View components
import DashboardView from "./_components/DashboardView";
import FaceDetailView from "./_components/FaceDetailView";
import BodyDetailView from "./_components/BodyDetailView";
import ColorDetailView from "./_components/ColorDetailView";

// Old tab URL compatibility
function resolveView(searchParams: URLSearchParams): ViewId {
    const view = searchParams.get("view") as ViewId | null;
    if (view && ["dashboard", "face", "body", "color"].includes(view)) return view;

    // Backward compat for old ?tab= URLs
    const tab = searchParams.get("tab");
    if (tab) {
        switch (tab) {
            case "face": return "face";
            case "body": return "body";
            case "color":
            case "color_fusion": return "color";
            default: return "dashboard";
        }
    }
    return "dashboard";
}

export default function BodyColorAvatarPage() {
    const isAnonymous = useIsAnonymous();
    const baselineStatus = useRequireBaseline();
    const searchParams = useSearchParams();
    const router = useRouter();

    if (isAnonymous === true) {
        return <AnonymousRegistrationPage featureName="外見分析" />;
    }
    if (baselineStatus === "loading" || baselineStatus === "redirecting") {
        return null;
    }

    const activeView = useMemo(() => resolveView(searchParams), [searchParams]);
    const requestedFaceSubTab = useMemo<AvatarFaceSubTab>(() => {
        const raw = String(searchParams.get("sub") ?? "")
            .trim()
            .toLowerCase() as AvatarFaceSubTab;
        return ["eye", "face", "brow", "nose", "mouth"].includes(raw) ? raw : "eye";
    }, [searchParams]);

    // Navigation
    const navigateTo = useCallback((view: ViewId) => {
        const url = new URL(window.location.href);
        url.searchParams.delete("tab"); // clean up old param
        if (view === "dashboard") {
            url.searchParams.delete("view");
        } else {
            url.searchParams.set("view", view);
        }
        window.history.pushState({}, "", url.toString());
        router.replace(url.pathname + url.search, { scroll: false });
    }, [router]);

    // === ALL STATE ===
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [hairSaved, setHairSaved] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);
    const [derivedWidthSize, setDerivedWidthSize] = useState<string>("");

    const [measurements, setMeasurements] = useState<Record<string, string>>({});
    const [cfv, setCfv] = useState<Record<string, string>>({});
    const [cpv, setCpv] = useState<Record<string, string>>({});
    const [avatarViews, setAvatarViews] = useState<Record<string, string>>({});
    const [avatarAssets, setAvatarAssets] = useState<Record<string, string>>({});
    const [avatarProfile, setAvatarProfile] = useState<AvatarProfileRecord | null>(null);
    const [colorProfile, setColorProfile] = useState<Record<string, any> | null>(null);
    const [manualSeason, setManualSeason] = useState<SeasonChoice | null>(null);
    const [manualSubtypeId, setManualSubtypeId] = useState<string | null>(null);
    const [manualUndertone, setManualUndertone] = useState<UndertoneChoice | null>(null);
    const [colorPaletteInputs, setColorPaletteInputs] = useState<ColorPaletteInputs>(DEFAULT_COLOR_PALETTE);
    const [paletteDirty, setPaletteDirty] = useState(false);
    const [fusedColorResult, setFusedColorResult] = useState<FusedColorResult | null>(null);
    const [colorFusionHistory, setColorFusionHistory] = useState<FusionHistoryEntry[]>([]);
    const [colorRediagnosisMode, setColorRediagnosisMode] = useState(false);
    const [colorRediagnosisStartedAt, setColorRediagnosisStartedAt] = useState<number | null>(null);
    const [eyeProfile, setEyeProfile] = useState<EyeProfileRecord>(null);
    const [facePhenotype, setFacePhenotype] = useState<FacePhenotypeRecord>(null);
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [pipelineEnable3d, setPipelineEnable3d] = useState(false);
    const [pipelineNotice, setPipelineNotice] = useState<string | null>(null);
    const [pipelineAsync, setPipelineAsync] = useState(true);
    const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
    const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
    const showBodyPipelineCard = false;
    const [heroPreviewMode, setHeroPreviewMode] = useState<"real" | "preset">("real");
    const [photoColorAnalysis, setPhotoColorAnalysis] = useState<PhotoColorAnalysisResult | null>(null);
    const [photoColorAnalysisPending, setPhotoColorAnalysisPending] = useState(false);
    const [detectedLandmarks, setDetectedLandmarks] = useState<Array<{ x: number; y: number; z: number }> | null>(null);
    const photoAnalysisUrlRef = useRef<string | null>(null);

    const headingStyle = useMemo(() => ({ fontFamily: "'Cormorant Garamond', serif" }), []);

    // === DATA FETCHING CALLBACKS ===
    const applyPipelineUrls = useCallback((urls: Record<string, any>) => {
        const personUrl = asNonEmptyString(urls.person);
        const clothesUrl = asNonEmptyString(urls.clothes);
        const maskUrl = asNonEmptyString(urls.mask);
        const turntableUrl = asNonEmptyString(urls.turntable);
        const meshUrl = asNonEmptyString(urls.mesh);

        setAvatarAssets((prev) => ({
            ...prev,
            person_cutout_url: personUrl ?? prev.person_cutout_url,
            clothes_cutout_url: clothesUrl ?? prev.clothes_cutout_url,
            mask_clothes_url: maskUrl ?? prev.mask_clothes_url,
            turntable_gif_url: turntableUrl ?? prev.turntable_gif_url,
            mesh_glb_url: meshUrl ?? prev.mesh_glb_url,
        }));
        if (personUrl) {
            setAvatarViews((prev) => ({ ...prev, front: prev.front ?? personUrl }));
        }
    }, []);

    const applyProfileSnapshot = useCallback((data: any) => {
        // DEBUG: trace what DB returns on reload
        const _debugViews = normalizeAvatarProfile(data?.avatar_profile ?? null)?.views;
        const _debugMeta = readRealFaceMeta(_debugViews);
        console.warn("[COLOR-TRACE] applyProfileSnapshot entry", JSON.stringify({
            dataKeys: data ? Object.keys(data) : null,
            hasColorProfile: !!data?.color_profile,
            labels: data?.color_profile?.labels ?? null,
            cpvUndertone: data?.color_profile?.cpv?.undertone ?? null,
            hasPhotoAnalysis: !!data?.color_profile?.photo_analysis,
            photoAnalysisKeys: data?.color_profile?.photo_analysis ? Object.keys(data.color_profile.photo_analysis) : null,
            photoSeason: data?.color_profile?.photo_analysis?.season ?? null,
            hasAvatarProfile: !!data?.avatar_profile,
            viewKeyCount: _debugViews ? Object.keys(_debugViews).length : 0,
            hasDiagnosis: !!_debugMeta.diagnosisResult,
            faceUrl: _debugMeta.normalizedRealFace ? "YES" : "NO",
        }));
        setColorProfile(data?.color_profile ?? null);

        const nextMeasurements: Record<string, string> = {};
        BODY_FIELD_DEFS.forEach((field) => {
            nextMeasurements[field.key] = toStr(data?.measurement?.[field.key]);
        });
        setMeasurements(nextMeasurements);

        const nextCfv: Record<string, string> = {};
        BODY_AXIS_DEFS.forEach((field) => {
            nextCfv[field.key] = toStr(data?.body_profile?.cfv?.[field.key]);
        });
        setCfv(nextCfv);

        setDerivedWidthSize(toStr(data?.body_profile?.display_labels?.derived_width_size));

        const nextCpv = {
            undertone: toStr(data?.color_profile?.cpv?.undertone),
            value_L: toStr(data?.color_profile?.cpv?.value_L),
            chroma_C: toStr(data?.color_profile?.cpv?.chroma_C),
            contrast: toStr(data?.color_profile?.cpv?.contrast),
            clarity: toStr(data?.color_profile?.cpv?.clarity),
            depth: toStr(data?.color_profile?.cpv?.depth),
            confidence: toStr(data?.color_profile?.cpv?.confidence),
        };
        setCpv(nextCpv);

        // Restore saved season/undertone/subtype from DB labels so they survive reload
        const savedLabels = data?.color_profile?.labels;
        setManualSeason(normalizeSeasonChoice(savedLabels?.season4) ?? null);
        setManualSubtypeId(savedLabels?.season16 ?? null);
        setManualUndertone(
            normalizeUndertoneChoice(data?.color_profile?.cpv?.undertone) ?? null,
        );
        setColorPaletteInputs(buildPaletteInputs(data?.color_profile?.palette ?? null));
        setPaletteDirty(false);

        // Restore saved photo analysis from DB so results survive reload
        if (data?.color_profile?.photo_analysis) {
            console.warn("[COLOR-TRACE] restoring photoColorAnalysis from DB:", {
                season: data.color_profile.photo_analysis.season,
                keys: Object.keys(data.color_profile.photo_analysis),
            });
            setPhotoColorAnalysis(data.color_profile.photo_analysis);
            // Pre-seed the URL ref so the photo-analysis useEffect skips redundant re-analysis
            const restoredViews = normalizeAvatarProfile(data?.avatar_profile ?? null)?.views;
            const restoredUrl = readRealFaceMeta(restoredViews).normalizedRealFace || null;
            if (restoredUrl) {
                photoAnalysisUrlRef.current = restoredUrl;
            }
        }

        const nextAvatarProfile = normalizeAvatarProfile(data?.avatar_profile ?? null);
        setAvatarViews(nextAvatarProfile?.views ?? {});
        if (nextAvatarProfile) {
            setAvatarProfile(nextAvatarProfile);
            setAvatarAssets({
                person_cutout_url: toStr(nextAvatarProfile.person_cutout_url),
                clothes_cutout_url: toStr(nextAvatarProfile.clothes_cutout_url),
                mask_clothes_url: toStr(nextAvatarProfile.mask_clothes_url),
                turntable_gif_url: toStr(nextAvatarProfile.turntable_gif_url),
                mesh_glb_url: toStr(nextAvatarProfile.mesh_glb_url),
            });
        } else {
            setAvatarProfile(null);
            setAvatarAssets({});
        }
    }, []);

    const loadProfile = useCallback(async () => {
        const res = await fetch("/api/body-color/profile", { cache: "no-store" });
        if (res.status === 401) {
            setError("ログインが必要です");
            return null;
        }
        const json = await res.json();
        // apiOk() wraps payload in { ok, data }, so unwrap it
        const data = json?.data ?? json;
        // DEBUG: fetch直後 — clientが読むパスの実値を確認
        console.warn("[COLOR-TRACE] client fetch result:", {
            wasWrapped: !!json?.ok,
            hasColorProfile: !!data?.color_profile,
            colorProfileKeys: data?.color_profile ? Object.keys(data.color_profile) : null,
            hasPhotoAnalysis: !!data?.color_profile?.photo_analysis,
            photoAnalysisKeys: data?.color_profile?.photo_analysis ? Object.keys(data.color_profile.photo_analysis) : null,
        });
        applyProfileSnapshot(data);
        return data;
    }, [applyProfileSnapshot]);

    // === INITIAL DATA LOADING ===
    useEffect(() => {
        const load = async () => {
            try {
                const [, eyeRes, faceRes, hairRes] = await Promise.all([
                    loadProfile(),
                    fetch("/api/eye-profile", { cache: "no-store" }).catch(() => null),
                    fetch("/api/aneurasync/face-phenotype", { cache: "no-store" }).catch(() => null),
                    fetch("/api/aneurasync/hair-phenotype", { cache: "no-store" }).catch(() => null),
                ]);

                if (eyeRes?.ok) {
                    const eyeData = await eyeRes.json().catch(() => null);
                    setEyeProfile(eyeData?.eye_profile ?? null);
                }

                if (faceRes?.ok) {
                    const faceData = await faceRes.json().catch(() => null);
                    setFacePhenotype(faceData?.face_phenotype ?? null);
                }

                if (hairRes?.ok) {
                    const hairData = await hairRes.json().catch(() => null);
                    if (hairData?.ok && hairData?.hair_phenotype) {
                        const hp = hairData.hair_phenotype;
                        // Any category filled or recipe present means hair was saved
                        const hasCategory = hp.length || hp.bangs || hp.silhouette || hp.texture || hp.color;
                        const hasRecipe = hp.recipe && typeof hp.recipe === "object" && Object.keys(hp.recipe).length > 0;
                        if (hasCategory || hasRecipe) {
                            setHairSaved(true);
                        }
                    }
                }
            } catch (e: any) {
                setError(String(e?.message ?? e));
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [loadProfile]);

    // === PIPELINE POLLING ===
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

    // === BLOB URL CLEANUP ===
    useEffect(() => {
        return () => {
            Object.values(avatarViews).forEach((url) => {
                if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
            });
        };
    }, [avatarViews]);

    // === SHOE WIDTH DERIVATION ===
    useEffect(() => {
        const footLength = Number(measurements.foot_length_cm ?? NaN);
        const footGirth = Number(measurements.foot_girth_cm ?? NaN);

        if (!Number.isFinite(footLength) || !Number.isFinite(footGirth)) {
            setDerivedWidthSize("");
            return;
        }

        let cancelled = false;

        void resolveShoeWidthCodeClient({
            footLengthCm: footLength,
            footGirthCm: footGirth,
        })
            .then((result) => {
                if (cancelled) return;
                setDerivedWidthSize(result.widthCode ?? "");
            })
            .catch(() => {
                if (cancelled) return;
                setDerivedWidthSize("manual_required");
            });

        return () => {
            cancelled = true;
        };
    }, [measurements.foot_girth_cm, measurements.foot_length_cm]);

    // === HANDLERS ===
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

    const handleRealFaceSaved = useCallback((nextAvatarProfile: UserBodyAvatarProfile | null) => {
        const normalizedProfile = normalizeAvatarProfile(nextAvatarProfile);
        setAvatarProfile(normalizedProfile);
        setAvatarViews(normalizedProfile?.views ?? {});
        if (normalizedProfile) {
            setAvatarAssets({
                person_cutout_url: toStr(normalizedProfile.person_cutout_url),
                clothes_cutout_url: toStr(normalizedProfile.clothes_cutout_url),
                mask_clothes_url: toStr(normalizedProfile.mask_clothes_url),
                turntable_gif_url: toStr(normalizedProfile.turntable_gif_url),
                mesh_glb_url: toStr(normalizedProfile.mesh_glb_url),
            });
        } else {
            setAvatarAssets({});
        }
    }, []);

    const handleBodyWizardSaved = useCallback((payload: {
        bodyProfile?: {
            cfv?: Record<string, number>;
            display_labels?: Record<string, unknown>;
        } | null;
        measurement?: Record<string, number> | null;
    }) => {
        if (payload.measurement) {
            const nextMeasurements: Record<string, string> = {};
            BODY_FIELD_DEFS.forEach((field) => {
                nextMeasurements[field.key] = toStr(payload.measurement?.[field.key]);
            });
            setMeasurements(nextMeasurements);
        }

        if (payload.bodyProfile?.cfv) {
            const nextCfv: Record<string, string> = {};
            BODY_AXIS_DEFS.forEach((field) => {
                nextCfv[field.key] = toStr(payload.bodyProfile?.cfv?.[field.key]);
            });
            setCfv(nextCfv);
        }

        const nextWidthSize = toStr(payload.bodyProfile?.display_labels?.derived_width_size);
        if (nextWidthSize) setDerivedWidthSize(nextWidthSize);
    }, []);

    // === REAL FACE & DIAGNOSIS MEMOS ===
    const realFaceMeta = useMemo(() => readRealFaceMeta(avatarProfile?.views), [avatarProfile?.views]);
    const normalizedRealFaceUrl = realFaceMeta.normalizedRealFace || null;
    const storedRealFaceDiagnosis = useMemo(
        () => ((realFaceMeta.diagnosisResult as (RealFaceDiagnosisResult & {
            capture_image_ref?: string | null;
            created_at?: string | null;
        }) | null) ?? null),
        [realFaceMeta.diagnosisResult],
    );
    const storedRealFaceDiagnosisCaptureRef =
        typeof storedRealFaceDiagnosis?.capture_image_ref === "string"
            ? storedRealFaceDiagnosis.capture_image_ref
            : null;
    const storedRealFaceDiagnosisCreatedAt = useMemo(() => {
        if (typeof storedRealFaceDiagnosis?.created_at !== "string") return null;
        const parsed = Date.parse(storedRealFaceDiagnosis.created_at);
        return Number.isFinite(parsed) ? parsed : null;
    }, [storedRealFaceDiagnosis?.created_at]);
    const realFaceDiagnosis = useMemo(() => {
        if (!storedRealFaceDiagnosis) return null;
        if (
            storedRealFaceDiagnosisCaptureRef &&
            normalizedRealFaceUrl &&
            storedRealFaceDiagnosisCaptureRef !== normalizedRealFaceUrl
        ) {
            return null;
        }
        if (
            colorRediagnosisMode &&
            colorRediagnosisStartedAt &&
            (!storedRealFaceDiagnosisCreatedAt || storedRealFaceDiagnosisCreatedAt <= colorRediagnosisStartedAt)
        ) {
            return null;
        }
        return storedRealFaceDiagnosis;
    }, [
        colorRediagnosisMode,
        colorRediagnosisStartedAt,
        normalizedRealFaceUrl,
        storedRealFaceDiagnosis,
        storedRealFaceDiagnosisCaptureRef,
        storedRealFaceDiagnosisCreatedAt,
    ]);

    // === PHOTO COLOR ANALYSIS ===
    // 永続データ(photo_analysis)のクリアは useEffect の自動反応で行わない。
    // URL が null でも DB 復元済みのデータは保持する。
    // 新しい URL が来た場合のみ再分析を実行する。
    useEffect(() => {
        // URL がない場合: 何もしない（既存の photoColorAnalysis を保持）
        if (!normalizedRealFaceUrl) return;

        // 同じ URL で既に結果がある場合: スキップ（DB 復元済み含む）
        if (photoAnalysisUrlRef.current === normalizedRealFaceUrl && photoColorAnalysis) {
            return;
        }
        photoAnalysisUrlRef.current = normalizedRealFaceUrl;

        let cancelled = false;
        setPhotoColorAnalysisPending(true);

        void analyzePhotoPersonalColor(normalizedRealFaceUrl, detectedLandmarks ?? undefined)
            .then((result) => {
                if (cancelled) return;
                setPhotoColorAnalysis(result);
                if (result) {
                    fetch("/api/body-color/profile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ photo_color_analysis: result }),
                    }).catch(() => {/* ignore */});
                }
            })
            .finally(() => {
                if (cancelled) return;
                setPhotoColorAnalysisPending(false);
            });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [normalizedRealFaceUrl, detectedLandmarks]);

    // === PALETTE AUTO-UPDATE ===
    useEffect(() => {
        if (!photoColorAnalysis || paletteDirty) return;
        setColorPaletteInputs((prev) => {
            const next = photoColorAnalysis.palette;
            if (
                prev.selectedHex === next.selectedHex &&
                prev.hairHex === next.hairHex &&
                prev.irisHex === next.irisHex
            ) {
                return prev;
            }
            return next;
        });
    }, [paletteDirty, photoColorAnalysis]);

    // === COMPUTED VALUES ===
    const effectiveCpv = useMemo(
        () => mergeCpvWithPhotoAnalysis(cpv, photoColorAnalysis),
        [cpv, photoColorAnalysis],
    );

    const activeSeason = useMemo(
        () =>
            manualSeason ??
            photoColorAnalysis?.season ??
            deriveSeasonFromSignals(
                colorProfile?.labels ?? null,
                effectiveCpv,
                normalizeSeasonChoice(realFaceDiagnosis?.season_primary),
            ),
        [colorProfile?.labels, effectiveCpv, manualSeason, photoColorAnalysis?.season, realFaceDiagnosis?.season_primary],
    );
    const activeUndertone = useMemo(
        () =>
            manualUndertone ??
            photoColorAnalysis?.undertone ??
            normalizeUndertoneChoice(toNum(effectiveCpv.undertone ?? "")) ??
            normalizeUndertoneChoice(realFaceDiagnosis?.attributeSummary.temperature) ??
            null,
        [effectiveCpv.undertone, manualUndertone, photoColorAnalysis?.undertone, realFaceDiagnosis?.attributeSummary.temperature],
    );
    const subtypeOptions = useMemo(
        () => (activeSeason ? SEASON_SUBTYPE_OPTIONS[activeSeason] : []),
        [activeSeason],
    );
    const derivedSeason12 = deriveSeason12(activeSeason, effectiveCpv);
    const derivedSeason16 = deriveSeason16(activeSeason, effectiveCpv);
    const activeSubtype = useMemo(
        () =>
            findSubtypeOption(subtypeOptions, [
                manualSubtypeId,
                derivedSeason16,
                derivedSeason12,
                colorProfile?.labels?.season16,
                colorProfile?.labels?.season12,
            ]) ?? subtypeOptions[0] ?? null,
        [colorProfile?.labels?.season12, colorProfile?.labels?.season16, derivedSeason12, derivedSeason16, manualSubtypeId, subtypeOptions],
    );
    const fusionPreview = useMemo(() => {
        const liveFusion = buildFusionResult({
            season: activeSeason,
            undertone: activeUndertone,
            cpv: effectiveCpv,
            realFaceDiagnosis,
            photoAnalysis: photoColorAnalysis,
        });
        return colorRediagnosisMode ? liveFusion : fusedColorResult ?? liveFusion;
    }, [
        activeSeason,
        activeUndertone,
        colorRediagnosisMode,
        effectiveCpv,
        fusedColorResult,
        photoColorAnalysis,
        realFaceDiagnosis,
    ]);
    const hasUnifiedColorDiagnosis = Boolean(photoColorAnalysis && realFaceDiagnosis && fusionPreview);
    // DEBUG
    console.warn("[COLOR-DEBUG] hasUnified =", hasUnifiedColorDiagnosis, {
        photoColorAnalysis: !!photoColorAnalysis,
        realFaceDiagnosis: !!realFaceDiagnosis,
        fusionPreview: !!fusionPreview,
        activeSeason,
        activeUndertone,
        photoAnalysisPending: photoColorAnalysisPending,
    });
    const colorSeasonLabel =
        activeSubtype?.nameJa ||
        fusionPreview?.season16 ||
        fusedColorResult?.season16 ||
        derivedSeason16 ||
        colorProfile?.labels?.season16 ||
        colorProfile?.labels?.season12 ||
        (activeSeason ? seasonLabelJa(activeSeason) : "未判定");
    const undertoneLabel = undertoneLabelJa(activeUndertone);
    const aiConfidence = clamp01(
        toNum(effectiveCpv.confidence ?? "") ??
            (colorProfile?.labels?.season16 ? 0.95 : colorProfile?.labels?.season12 ? 0.88 : activeSeason ? 0.76 : 0.55),
    );
    const heroRealFaceImage =
        realFaceMeta.normalizedRealFace ||
        realFaceMeta.originalImage ||
        null;
    const activeImage =
        avatarViews.front ||
        avatarViews.right ||
        avatarViews.left ||
        avatarViews.back ||
        avatarAssets.person_cutout_url ||
        avatarAssets.clothes_cutout_url ||
        null;
    const profileOverviewImage =
        activeImage ||
        heroRealFaceImage ||
        null;
    const heroAvatarImage = profileOverviewImage;
    const fusionStatusLabel = fusionPreview
        ? `${seasonLabelJa(fusionPreview.season)} / ${formatPercent(fusionPreview.confidence)}`
        : "未統合";
    const axisMetrics = {
        undertone: clampNumber(
            toNum(effectiveCpv.undertone ?? "") ??
                (activeUndertone === "warm" ? 0.75 : activeUndertone === "cool" ? -0.75 : 0),
            -1,
            1,
        ),
        value_L: clampNumber(toNum(effectiveCpv.value_L ?? "") ?? (activeSeason ? SEASON_AXIS_PRESETS[activeSeason].value_L : 55), 0, 100),
        chroma_C: clampNumber(toNum(effectiveCpv.chroma_C ?? "") ?? (activeSeason ? SEASON_AXIS_PRESETS[activeSeason].chroma_C : 65), 0, 200),
        contrast: clampNumber(toNum(effectiveCpv.contrast ?? "") ?? (activeSeason ? SEASON_AXIS_PRESETS[activeSeason].contrast : 0.5), 0, 1),
    };
    const eyeTypeLabel = eyeProfile?.eye_type ? EYE_TYPE_LABELS[eyeProfile.eye_type] ?? eyeProfile.eye_type : "未入力";
    const eyeColorLabel = eyeProfile?.eye_color ? EYE_COLOR_LABELS[eyeProfile.eye_color] ?? eyeProfile.eye_color : "未入力";
    const faceCompletedCategories = useMemo(() => {
        if (Array.isArray(facePhenotype?.completed_categories)) {
            return facePhenotype.completed_categories.map((key) => FACE_COMPLETION_LABELS[key] ?? key);
        }
        const phenotype = facePhenotype?.phenotype ?? {};
        const completed: string[] = [];
        if (phenotype.eye_shape?.primary) completed.push("目");
        if (phenotype.face_shape?.primary) completed.push("輪郭");
        if (phenotype.brow_shape?.primary) completed.push("眉");
        if (phenotype.nose_impression) completed.push("鼻");
        if (phenotype.mouth_impression) completed.push("口");
        if (phenotype.face_impression) completed.push("印象");
        return completed;
    }, [facePhenotype]);
    const phenotypeSections = [
        { key: "sns", ready: Boolean(activeImage || avatarAssets.turntable_gif_url) },
        { key: "face", ready: Boolean(faceCompletedCategories.length || eyeProfile?.eye_type || eyeProfile?.eye_color) },
        { key: "hair", ready: Boolean(avatarProfile?.hair_profile || avatarProfile?.hair_impression || hairSaved) },
        { key: "body", ready: Boolean(Object.keys(cfv).length || Object.keys(measurements).length) },
        { key: "color", ready: Boolean(colorProfile?.labels?.season4 || effectiveCpv.undertone || photoColorAnalysis || avatarProfile?.views?.__real_face_preview_url) },
    ];
    const phenotypeProgress = Math.round(
        (phenotypeSections.filter((section) => section.ready).length / phenotypeSections.length) * 100
    );
    const canSaveUnifiedColor = !colorRediagnosisMode || hasUnifiedColorDiagnosis;
    const unifiedColorVisibleRef = useRef(hasUnifiedColorDiagnosis);

    // === SAVE HANDLERS ===
    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        setError(null);

        const measurementPayload: Record<string, number> = {};
        BODY_FIELD_DEFS.forEach((field) => {
            const v = toNum(measurements[field.key] ?? "");
            if (v !== undefined) measurementPayload[field.key] = v;
        });

        const cfvPayload: Record<string, number> = {};
        BODY_AXIS_DEFS.forEach((field) => {
            const v = toNum(cfv[field.key] ?? "");
            if (v !== undefined) cfvPayload[field.key] = v;
        });

        const cpvPayload: Record<string, number> = {};
        ["undertone", "value_L", "chroma_C", "contrast", "clarity", "depth", "confidence"].forEach((key) => {
            const v = toNum(effectiveCpv[key] ?? "");
            if (v !== undefined) cpvPayload[key] = v;
        });
        const seasonForSave =
            manualSeason ??
            photoColorAnalysis?.season ??
            deriveSeasonFromSignals(colorProfile?.labels ?? null, effectiveCpv, null);
        const selectedSubtype =
            seasonForSave
                ? findSubtypeOption(SEASON_SUBTYPE_OPTIONS[seasonForSave], [manualSubtypeId])
                : null;
        const season12 = selectedSubtype?.season12Id ?? deriveSeason12(seasonForSave, effectiveCpv);
        const season16 = selectedSubtype?.id ?? deriveSeason16(seasonForSave, effectiveCpv);

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
                        display_labels: {
                            derived_width_size: derivedWidthSize || undefined,
                        },
                    },
                    measurements: measurementPayload,
                    color_profile: {
                        cpv: cpvPayload,
                        labels: {
                            season4: seasonForSave ?? undefined,
                            season12,
                            season16,
                        },
                        palette: {
                            selected_hex: colorPaletteInputs.selectedHex,
                            hair_hex: colorPaletteInputs.hairHex,
                            iris_hex: colorPaletteInputs.irisHex,
                        },
                    },
                    avatar_assets: avatarAssetsPayload,
                }),
            });
            const data = await res.json();
            if (!data?.ok) {
                setError(data?.error ?? "保存に失敗しました");
            } else {
                setMessage("保存しました。Fit/Colorスコアに反映されます。");
                setShowCelebration(true);
                setTimeout(() => setShowCelebration(false), 3000);
                setManualSeason(seasonForSave ?? null);
                setManualSubtypeId(season16 ?? null);
            }
        } catch (e: any) {
            setError(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    };

    const handleColorSave = async () => {
        const nextResult = buildFusionResult({
            season: activeSeason,
            undertone: activeUndertone,
            cpv: effectiveCpv,
            realFaceDiagnosis,
            photoAnalysis: photoColorAnalysis,
        });

        if (!nextResult) {
            await handleSave();
            return;
        }

        setSaving(true);
        setMessage(null);
        setError(null);

        const cpvPayload = {
            undertone: nextResult.axes.undertone,
            value_L: nextResult.axes.value_L,
            chroma_C: nextResult.axes.chroma_C,
            contrast: nextResult.axes.contrast,
            confidence: nextResult.confidence,
            clarity: clampNumber(nextResult.axes.chroma_C / 120, 0, 1),
            depth: clampNumber(1 - nextResult.axes.value_L / 100, 0, 1),
        };
        const selectedSubtype = findSubtypeOption(SEASON_SUBTYPE_OPTIONS[nextResult.season], [
            manualSubtypeId,
            activeSubtype?.id,
            nextResult.season16,
        ]);
        const savedSeason16 = selectedSubtype?.id ?? nextResult.season16 ?? undefined;
        const savedSeason12 =
            selectedSubtype?.season12Id ??
            deriveSeason12(nextResult.season, {
                ...effectiveCpv,
                undertone: String(nextResult.axes.undertone),
                value_L: String(nextResult.axes.value_L),
                chroma_C: String(nextResult.axes.chroma_C),
                contrast: String(nextResult.axes.contrast),
            });
        const persistedResult: FusedColorResult = {
            ...nextResult,
            season16: savedSeason16 ?? null,
        };

        try {
            const res = await fetch("/api/body-color/profile", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    color_profile: {
                        cpv: cpvPayload,
                        labels: {
                            season4: nextResult.season,
                            season12: savedSeason12,
                            season16: savedSeason16,
                        },
                        palette: {
                            selected_hex: colorPaletteInputs.selectedHex,
                            hair_hex: colorPaletteInputs.hairHex,
                            iris_hex: colorPaletteInputs.irisHex,
                            fused_summary: nextResult.summary,
                            fused_sources: nextResult.sources,
                        },
                    },
                }),
            });
            const data = await res.json();
            if (!data?.ok) {
                throw new Error(data?.error ?? "カラー統合の保存に失敗しました");
            }

            setManualSeason(nextResult.season);
            setManualUndertone(nextResult.undertone);
            setManualSubtypeId(savedSeason16 ?? null);
            setCpv((prev) => ({
                ...prev,
                undertone: String(nextResult.axes.undertone),
                value_L: String(nextResult.axes.value_L),
                chroma_C: String(nextResult.axes.chroma_C),
                contrast: String(nextResult.axes.contrast),
                confidence: String(nextResult.confidence),
                clarity: String(cpvPayload.clarity),
                depth: String(cpvPayload.depth),
            }));
            setFusedColorResult(persistedResult);
            setColorProfile((prev: any) => ({
                ...prev,
                cpv: cpvPayload,
                labels: { ...(prev?.labels ?? {}), season4: nextResult.season, season12: savedSeason12, season16: savedSeason16 },
                palette: { ...(prev?.palette ?? {}), selected_hex: colorPaletteInputs.selectedHex, hair_hex: colorPaletteInputs.hairHex, iris_hex: colorPaletteInputs.irisHex, fused_summary: nextResult.summary },
            }));
            setMessage(`カラー統合を保存しました。${seasonLabelJa(nextResult.season)} を反映済みです。`);
            setShowCelebration(true);
            setTimeout(() => setShowCelebration(false), 3000);
        } catch (fusionError) {
            setError(fusionError instanceof Error ? fusionError.message : "カラー統合の保存に失敗しました");
        } finally {
            setSaving(false);
        }
    };

    const beginColorRediagnosis = useCallback(() => {
        if (fusionPreview) {
            const nextEntry = createFusionHistoryEntry(fusionPreview, heroRealFaceImage);
            setColorFusionHistory((prev) => [nextEntry, ...prev]);
        }
        setColorRediagnosisMode(true);
        setColorRediagnosisStartedAt(Date.now());
        setFusedColorResult(null);
        setMessage(null);
        setError(null);
        document.getElementById("real-face-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [fusionPreview, heroRealFaceImage]);

    // === REDIAGNOSIS MODE AUTO-RESET ===
    useEffect(() => {
        if (!colorRediagnosisMode || !hasUnifiedColorDiagnosis) return;
        setColorRediagnosisMode(false);
        setColorRediagnosisStartedAt(null);
        setMessage("生写真のAI診断とドレープ診断を統合しました。必要なら保存してください。");
    }, [colorRediagnosisMode, hasUnifiedColorDiagnosis]);

    // === UNIFIED COLOR SCROLL-INTO-VIEW ===
    useEffect(() => {
        if (activeView !== "color") {
            unifiedColorVisibleRef.current = hasUnifiedColorDiagnosis;
            return;
        }
        if (!unifiedColorVisibleRef.current && hasUnifiedColorDiagnosis) {
            window.requestAnimationFrame(() => {
                document.getElementById("color-unified-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }
        unifiedColorVisibleRef.current = hasUnifiedColorDiagnosis;
    }, [activeView, hasUnifiedColorDiagnosis]);

    // === COLOR SETUP SECTION (shared between views) ===
    const colorSetupSection = (
        <div id="real-face-setup">
            <RealFaceCaptureInput
                avatarProfile={avatarProfile}
                onSaved={handleRealFaceSaved}
                inlineMode
                hideMobileCaptureOption
                footer={
                    normalizedRealFaceUrl ? (
                        <RealFacePersonalColorDiagnosis
                            avatarProfile={avatarProfile}
                            onSaved={handleRealFaceSaved}
                            onOpenCapture={() => document.getElementById("real-face-setup")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            flowMode
                            autoStartWhenReady
                            photoAnalysisPending={photoColorAnalysisPending}
                            photoAnalysisReady={Boolean(photoColorAnalysis)}
                            photoAnalysis={photoColorAnalysis}
                            resultNotBefore={colorRediagnosisStartedAt}
                        />
                    ) : null
                }
            />
        </div>
    );

    // === RENDER ===
    return (
        <CinematicEntry>
            <ScrollProgress />
            <CelebrationBurst active={showCelebration} />
            <LightBackground>
                {/* Navbar */}
                <GlassNavbar>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.back()}
                                className="group w-10 h-10 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/80 flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-900 hover:shadow-lg transition-all duration-300"
                            >
                                <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <div>
                                <h1 className="text-lg font-black tracking-tight text-slate-900" style={headingStyle}>
                                    Phenotype Hub
                                </h1>
                                <p className="text-[11px] font-medium text-slate-400 tracking-wide">あなたの全てを、ひとつに</p>
                            </div>
                        </div>
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/80 flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-900 hover:shadow-lg transition-all duration-300"
                            title="ホームに戻る"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
                            </svg>
                        </Link>
                    </div>
                </GlassNavbar>

                <div className="h-20" />

                {/* Loading */}
                <AnimatePresence mode="wait">
                    {loading && (
                        <motion.div className="max-w-6xl mx-auto px-4 sm:px-6 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="rounded-[2rem] border border-white/80 bg-white/80 backdrop-blur-xl p-6 shadow-xl">
                                <DNAHelixLoader />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* View routing */}
                {!loading && (
                    <AnimatePresence mode="wait">
                        {activeView === "dashboard" && (
                            <DashboardView
                                key="dashboard"
                                profileOverviewImage={profileOverviewImage}
                                activeSeason={activeSeason}
                                activeUndertone={activeUndertone}
                                phenotypeProgress={phenotypeProgress}
                                colorSeasonLabel={colorSeasonLabel}
                                eyeTypeLabel={eyeTypeLabel}
                                faceCompletedCategories={faceCompletedCategories}
                                measurementCount={Object.keys(measurements).filter((k) => measurements[k]).length}
                                derivedWidthSize={derivedWidthSize}
                                fusionPreview={fusionPreview}
                                phenotypeSections={phenotypeSections}
                                avatarProfile={avatarProfile}
                                onNavigate={navigateTo}
                                onHairSaved={() => setHairSaved(true)}
                            />
                        )}
                        {activeView === "face" && (
                            <FaceDetailView
                                key="face"
                                heroRealFaceImage={heroRealFaceImage}
                                heroAvatarImage={heroAvatarImage}
                                facePhenotype={facePhenotype}
                                eyeProfile={eyeProfile}
                                requestedFaceSubTab={requestedFaceSubTab}
                                faceCompletedCategories={faceCompletedCategories}
                                onPersisted={(nextPhenotype, completedCategories) => {
                                    setFacePhenotype((prev) => ({ ...(prev ?? {}), phenotype: nextPhenotype, completed_categories: completedCategories, updated_at: new Date().toISOString() }));
                                }}
                                onEyePersisted={(eyeType, eyeColor) => {
                                    setEyeProfile((prev) => ({ ...(prev ?? {}), eye_type: eyeType, eye_color: eyeColor, updated_at: new Date().toISOString() }));
                                }}
                                onLandmarksDetected={setDetectedLandmarks}
                                onNavigateBack={() => navigateTo("dashboard")}
                            />
                        )}
                        {activeView === "body" && (
                            <BodyDetailView
                                key="body"
                                measurements={measurements}
                                cfv={cfv}
                                derivedWidthSize={derivedWidthSize}
                                avatarAssets={avatarAssets}
                                error={error}
                                message={message}
                                saving={saving}
                                onBodyWizardSaved={handleBodyWizardSaved}
                                onSave={handleSave}
                                onNavigateBack={() => navigateTo("dashboard")}
                            />
                        )}
                        {activeView === "color" && (
                            <ColorDetailView
                                key="color"
                                activeSeason={activeSeason}
                                activeUndertone={activeUndertone}
                                activeSubtype={activeSubtype}
                                subtypeOptions={subtypeOptions}
                                colorSeasonLabel={colorSeasonLabel}
                                fusionPreview={fusionPreview}
                                fusionStatusLabel={fusionStatusLabel}
                                axisMetrics={axisMetrics}
                                aiConfidence={aiConfidence}
                                colorPaletteInputs={colorPaletteInputs}
                                colorFusionHistory={colorFusionHistory}
                                hasUnifiedColorDiagnosis={hasUnifiedColorDiagnosis}
                                colorRediagnosisMode={colorRediagnosisMode}
                                canSaveUnifiedColor={canSaveUnifiedColor}
                                realFaceDiagnosis={realFaceDiagnosis}
                                heroRealFaceImage={heroRealFaceImage}
                                eyeColorLabel={eyeColorLabel}
                                derivedSeason12={derivedSeason12}
                                derivedSeason16={derivedSeason16}
                                onSeasonSelect={(season) => { setManualSeason(season); setManualSubtypeId(null); setFusedColorResult(null); setMessage(null); setError(null); }}
                                onSubtypeSelect={(subtypeId) => { setManualSeason(activeSeason); setManualSubtypeId(subtypeId); setFusedColorResult(null); setMessage(null); setError(null); }}
                                onUndertoneSelect={(tone) => {
                                    setManualUndertone(tone);
                                    setCpv((prev) => ({ ...prev, undertone: String(tone === "warm" ? 0.75 : tone === "cool" ? -0.75 : 0) }));
                                    setFusedColorResult(null); setMessage(null); setError(null);
                                }}
                                onBeginRediagnosis={beginColorRediagnosis}
                                onColorSave={handleColorSave}
                                error={error}
                                message={message}
                                saving={saving}
                                colorSetupSection={colorSetupSection}
                                onNavigateBack={() => navigateTo("dashboard")}
                            />
                        )}
                    </AnimatePresence>
                )}

                {/* Floating Save Bar */}
                <motion.div
                    className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none"
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1, type: "spring", stiffness: 300, damping: 30 }}
                >
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 sm:pb-6">
                        <div className="pointer-events-auto relative rounded-2xl bg-white/92 backdrop-blur-2xl border border-white/80 shadow-2xl shadow-black/12 px-5 py-3 flex items-center justify-between gap-4 overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-100">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${phenotypeProgress}%` }}
                                    transition={{ duration: 1.5, delay: 1.2, ease: "easeOut" }}
                                />
                            </div>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="min-w-0">
                                    {message && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-emerald-600 truncate">{message}</motion.div>}
                                    {error && error !== "ログインが必要です" && <div className="text-xs font-bold text-rose-500 truncate">{error}</div>}
                                    {!message && !error && (
                                        <div className="text-xs font-bold text-slate-500 truncate">
                                            {activeSeason ? `${SEASON_VISUAL[activeSeason].emoji} ${seasonLabelJa(activeSeason)}` : "Phenotype Hub"} — {phenotypeProgress}% 完了
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <GlassButton onClick={handleSave} loading={saving} variant="gradient" size="sm" className="!text-xs !font-black">
                                    保存する
                                </GlassButton>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </LightBackground>
            <FeatureIntroduction
                {...BODY_COLOR_AVATAR_INTRO}
                onComplete={(tab) => {
                    if (tab === "color" || tab === "face" || tab === "body") {
                        navigateTo(tab as ViewId);
                    }
                }}
            />
        </CinematicEntry>
    );
}
