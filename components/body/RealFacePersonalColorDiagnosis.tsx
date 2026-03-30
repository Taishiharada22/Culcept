/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    GlassBadge,
    GlassButton,
    GlassCard,
    GlassModal,
} from "@/components/ui/glassmorphism-design";
import {
    buildRealFaceDiagnosis,
    getRealFacePairCount,
    REAL_FACE_PC_QUESTIONS,
    type RealFaceDiagnosisResult,
    type RealFaceQuestion,
    type RealFaceSide,
} from "@/lib/realFacePersonalColor";
import type { PhotoColorAnalysisResult } from "@/lib/personalColorPhotoAnalysis";
import { readRealFaceMeta } from "@/lib/realFaceStorage";
import type { UserBodyAvatarProfile } from "@/types/body-color";

type Props = {
    avatarProfile?: UserBodyAvatarProfile | null;
    onSaved?: (avatarProfile: UserBodyAvatarProfile | null) => void;
    onOpenCapture?: () => void;
    flowMode?: boolean;
    autoStartWhenReady?: boolean;
    photoAnalysisPending?: boolean;
    photoAnalysisReady?: boolean;
    photoAnalysis?: PhotoColorAnalysisResult | null;
    resultNotBefore?: number | null;
};

type StoredRealFaceDiagnosisResult = RealFaceDiagnosisResult & {
    capture_image_ref?: string | null;
    created_at?: string | null;
};

/** Renders children via portal to document.body to escape stacking contexts */
function BodyPortal({ children }: { children: ReactNode }) {
    if (typeof document === "undefined") return null;
    return createPortal(children, document.body);
}

function hexToRgb(hex: string) {
    const value = hex.replace("#", "");
    const normalized = value.length === 3
        ? value.split("").map((char) => `${char}${char}`).join("")
        : value;
    const numeric = Number.parseInt(normalized, 16);
    return {
        r: (numeric >> 16) & 255,
        g: (numeric >> 8) & 255,
        b: numeric & 255,
    };
}

function rgbToHex(r: number, g: number, b: number) {
    return `#${[r, g, b]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
        .join("")}`;
}

function boostSaturationHex(hex: string, factor: number) {
    const { r, g, b } = hexToRgb(hex);
    const avg = (r + g + b) / 3;
    return rgbToHex(
        avg + (r - avg) * factor,
        avg + (g - avg) * factor,
        avg + (b - avg) * factor
    );
}

async function fetchAvatarProfile() {
    const response = await fetch("/api/body-color/profile", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    return (json?.avatar_profile ?? null) as UserBodyAvatarProfile | null;
}

function DrapePreview({
    faceUrl,
    colorHex,
    label,
}: {
    faceUrl: string;
    colorHex: string;
    label: string;
}) {
    const vividColor = boostSaturationHex(colorHex, 1.52);
    const softColor = boostSaturationHex(colorHex, 1.24);
    const gradientKey = `${label}-${colorHex.replace("#", "")}`.replace(/[^a-zA-Z0-9_-]+/g, "-");

    // ドレープパス: 顎下寄りまで持ち上げて、首元から胸元までしっかり覆う。
    const drapePath =
        "M-80 1010 C70 940 220 900 370 896 C418 922 458 940 500 952 C542 940 582 922 630 896 C780 900 930 940 1080 1010 C1050 1118 1025 1228 1000 1350 L0 1350 C-25 1228 -50 1118 -80 1010 Z";
    const drapeFoldPath =
        "M20 1035 C170 980 330 954 500 954 C670 954 830 980 980 1035 C954 1140 938 1240 926 1350 L74 1350 C62 1240 46 1140 20 1035 Z";
    const collarShadowPath =
        "M322 906 C380 886 442 878 500 878 C558 878 620 886 678 906 C650 942 578 964 500 964 C422 964 350 942 322 906 Z";

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-slate-900/90 shadow-lg">
            <div className="relative w-full" style={{ aspectRatio: "5 / 6" }}>
                <img src={faceUrl} alt={label} className="absolute inset-0 h-full w-full object-cover" />
                <svg viewBox="0 0 1000 1350" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
                    <defs>
                        {/* メイン布: 上部は半透明、下部はしっかり発色 */}
                        <linearGradient id={`${gradientKey}-main`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={softColor} stopOpacity="0.58" />
                            <stop offset="10%" stopColor={softColor} stopOpacity="0.82" />
                            <stop offset="42%" stopColor={vividColor} stopOpacity="0.94" />
                            <stop offset="100%" stopColor={vividColor} stopOpacity="0.99" />
                        </linearGradient>
                        {/* 反射光: 胸元に柔らかいハイライト */}
                        <radialGradient id={`${gradientKey}-reflect`} cx="50%" cy="68%" r="28%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                        </radialGradient>
                        {/* しわ/折り目: 布のテクスチャ感 */}
                        <linearGradient id={`${gradientKey}-fold`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={softColor} stopOpacity="0.3" />
                            <stop offset="40%" stopColor={vividColor} stopOpacity="0.22" />
                            <stop offset="100%" stopColor={softColor} stopOpacity="0.12" />
                        </linearGradient>
                        {/* 襟元の影: 顎下の自然な陰影 */}
                        <linearGradient id={`${gradientKey}-collar`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#000000" stopOpacity="0.12" />
                            <stop offset="100%" stopColor={softColor} stopOpacity="0.2" />
                        </linearGradient>
                    </defs>
                    {/* 襟元の陰影 */}
                    <path d={collarShadowPath} fill={`url(#${gradientKey}-collar)`} />
                    {/* メインの布 */}
                    <path d={drapePath} fill={`url(#${gradientKey}-main)`} />
                    {/* しわ/折り目 */}
                    <path d={drapeFoldPath} fill={`url(#${gradientKey}-fold)`} />
                    {/* 反射ハイライト */}
                    <ellipse cx="500" cy="1200" rx="280" ry="100" fill={`url(#${gradientKey}-reflect)`} />
                </svg>
            </div>
        </div>
    );
}

function renderAxisLabel(attribute: string | null) {
    if (!attribute) return "判定保留";
    switch (attribute) {
        case "warm":
            return "Warm 側";
        case "cool":
            return "Cool 側";
        case "light":
            return "Light 側";
        case "deep":
            return "Deep 側";
        case "clear":
            return "Clear 側";
        case "soft":
            return "Soft 側";
        default:
            return attribute;
    }
}

export default function RealFacePersonalColorDiagnosis({
    avatarProfile,
    onSaved,
    onOpenCapture,
    flowMode = false,
    autoStartWhenReady = false,
    photoAnalysisPending = false,
    photoAnalysisReady = true,
    photoAnalysis = null,
    resultNotBefore = null,
}: Props) {
    const meta = useMemo(() => readRealFaceMeta(avatarProfile?.views), [avatarProfile?.views]);
    const normalizedFaceUrl = meta.normalizedRealFace;
    const storedResult = useMemo(
        () => (meta.diagnosisResult as StoredRealFaceDiagnosisResult | null) ?? null,
        [meta.diagnosisResult]
    );
    const storedResultCaptureRef =
        typeof storedResult?.capture_image_ref === "string" ? storedResult.capture_image_ref : null;
    const storedResultCreatedAt = useMemo(() => {
        if (typeof storedResult?.created_at !== "string") return null;
        const time = Date.parse(storedResult.created_at);
        return Number.isFinite(time) ? time : null;
    }, [storedResult?.created_at]);
    const currentStoredResult = useMemo(() => {
        if (!storedResult) return null;
        if (storedResultCaptureRef && normalizedFaceUrl && storedResultCaptureRef !== normalizedFaceUrl) {
            return null;
        }
        if (resultNotBefore && (!storedResultCreatedAt || storedResultCreatedAt <= resultNotBefore)) {
            return null;
        }
        return storedResult;
    }, [normalizedFaceUrl, resultNotBefore, storedResult, storedResultCaptureRef, storedResultCreatedAt]);
    const [result, setResult] = useState<RealFaceDiagnosisResult | null>(currentStoredResult);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, RealFaceSide>>({});
    const [advancing, setAdvancing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const autoStartedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        setResult(currentStoredResult);
    }, [currentStoredResult]);

    const activeQuestion = REAL_FACE_PC_QUESTIONS[currentIndex] as RealFaceQuestion | undefined;
    const pairCount = getRealFacePairCount();
    const openCapture = () => {
        if (onOpenCapture) {
            onOpenCapture();
            return;
        }
        window.location.href = "/body-color/avatar";
    };

    const beginDiagnosis = () => {
        setNotice(null);
        setError(null);
        setAnswers({});
        setCurrentIndex(0);
        setAdvancing(false);
        setWizardOpen(true);
    };

    const saveDiagnosis = async (nextAnswers: Record<string, RealFaceSide>) => {
        const payload = REAL_FACE_PC_QUESTIONS.map((question) => ({
            questionId: question.id,
            selectedSide: nextAnswers[question.id] ?? "tie",
        }));
        const localResult = buildRealFaceDiagnosis(payload);
        setSaving(true);
        setError(null);
        setResult(localResult);

        try {
            const response = await fetch("/api/personal-color/real-face", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ answers: payload }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !json?.ok) {
                throw new Error(json?.error ?? "診断結果の保存に失敗しました");
            }
            setResult((json?.result ?? localResult) as RealFaceDiagnosisResult);
            setNotice("プロフィールに反映済みです");
            const nextAvatarProfile = (json?.avatar_profile as UserBodyAvatarProfile | null | undefined)
                ?? await fetchAvatarProfile().catch(() => null);
            onSaved?.(nextAvatarProfile);
            setWizardOpen(false);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "診断結果の保存に失敗しました");
        } finally {
            setSaving(false);
        }
    };

    const handleSelect = (selectedSide: RealFaceSide) => {
        if (!activeQuestion || advancing) return;
        const nextAnswers = {
            ...answers,
            [activeQuestion.id]: selectedSide,
        };
        setAnswers(nextAnswers);
        setAdvancing(true);

        window.setTimeout(() => {
            if (currentIndex >= REAL_FACE_PC_QUESTIONS.length - 1) {
                setCurrentIndex(REAL_FACE_PC_QUESTIONS.length);
                void saveDiagnosis(nextAnswers);
            } else {
                setCurrentIndex((value) => value + 1);
            }
            setAdvancing(false);
        }, 420);
    };

    const stepDescription = !normalizedFaceUrl
        ? "先に診断用の実顔写真を保存してください。"
        : photoAnalysisPending
            ? "生写真のAI診断を解析中です。完了し次第、そのままドレープ比較へ進みます。"
            : !photoAnalysisReady
                ? "生写真のAI診断を待っています。写真保存後に自動でドレープ比較を開始します。"
                : result
                    ? "ドレープ診断は完了しています。結果はページ上部の統合結果に反映されます。"
                    : "生写真のAI診断が終わったので、そのままドレープ比較を開始します。";
    const triggerLabel = result ? "ドレープ診断をやり直す" : "ドレープ診断を開始";
    const canStartDiagnosis = Boolean(normalizedFaceUrl) && photoAnalysisReady && !photoAnalysisPending;
    const autoStartKey = normalizedFaceUrl
        ? `${normalizedFaceUrl}::${resultNotBefore ?? "base"}`
        : null;

    useEffect(() => {
        if (!flowMode || !autoStartWhenReady || !canStartDiagnosis || wizardOpen || result || !autoStartKey) {
            return;
        }
        if (autoStartedKeyRef.current === autoStartKey) return;
        autoStartedKeyRef.current = autoStartKey;
        beginDiagnosis();
    }, [autoStartKey, autoStartWhenReady, canStartDiagnosis, flowMode, result, wizardOpen]);

    const [flowDetailOpen, setFlowDetailOpen] = useState(false);

    if (flowMode) {
        return (
            <>
                {normalizedFaceUrl ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 sm:rounded-2xl sm:p-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400 shrink-0">STEP 2</div>
                            <div className="text-xs font-black text-slate-900 truncate">ドレープ比較診断</div>
                            {result && <GlassBadge variant="success" size="sm">完了</GlassBadge>}
                            {photoAnalysisPending && <GlassBadge variant="default" size="sm">AI解析中</GlassBadge>}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {(result || photoAnalysis || notice || error) && (
                                <GlassButton onClick={() => setFlowDetailOpen(true)} variant="default" size="sm">
                                    詳細
                                </GlassButton>
                            )}
                            <GlassButton
                                onClick={canStartDiagnosis ? beginDiagnosis : openCapture}
                                disabled={!normalizedFaceUrl || saving || photoAnalysisPending}
                                variant={canStartDiagnosis ? "gradient" : "secondary"}
                                size="sm"
                            >
                                {photoAnalysisPending ? "解析中..." : triggerLabel}
                            </GlassButton>
                        </div>
                    </div>
                ) : null}

                <BodyPortal>
                    <GlassModal isOpen={flowDetailOpen} onClose={() => setFlowDetailOpen(false)} title="ドレープ比較診断 — 詳細" size="md">
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">{stepDescription}</div>
                            {photoAnalysis ? (
                                <div className="flex flex-wrap gap-1.5">
                                    <GlassBadge variant="default">{photoAnalysis.season ? `Season ${photoAnalysis.season}` : "Season 解析中"}</GlassBadge>
                                    <GlassBadge variant="default">{photoAnalysis.undertone ? `Undertone ${photoAnalysis.undertone}` : "Undertone 解析中"}</GlassBadge>
                                    <GlassBadge variant="default">{Math.round(photoAnalysis.confidence * 100)}%</GlassBadge>
                                </div>
                            ) : null}
                            {result ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                    ドレープ比較が完了しました。統合結果をページ上部に反映しています。
                                </div>
                            ) : null}
                            {(notice || error) && (
                                <div className="space-y-1.5">
                                    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}
                                    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
                                </div>
                            )}
                            <div className="flex justify-end">
                                <GlassButton onClick={() => setFlowDetailOpen(false)} variant="default" size="sm">閉じる</GlassButton>
                            </div>
                        </div>
                    </GlassModal>
                </BodyPortal>

                <BodyPortal>
                    <GlassModal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} title="ドレープ比較診断" size="full">
                    {currentIndex < REAL_FACE_PC_QUESTIONS.length ? (
                        activeQuestion ? (
                            <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-500">{activeQuestion.pairTitle}</div>
                                        <div className="text-xs text-slate-400">{activeQuestion.pairSummary}</div>
                                    </div>
                                    <div className="text-right text-sm text-slate-500">
                                        <div>{currentIndex + 1} / {REAL_FACE_PC_QUESTIONS.length}</div>
                                        <div className="text-xs text-slate-400">
                                            ペア {activeQuestion.pairIndex + 1} / {pairCount} ・ 質問 {activeQuestion.axisIndex + 1} / 4
                                        </div>
                                    </div>
                                </div>

                                {normalizedFaceUrl && (
                                    <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-4">
                                        <div className="min-w-0">
                                            <DrapePreview faceUrl={normalizedFaceUrl} colorHex={activeQuestion.left.hex} label={activeQuestion.left.id} />
                                            <div className="mt-2 text-center text-sm font-semibold text-slate-700">左: {activeQuestion.left.label}</div>
                                        </div>
                                        <div className="min-w-0">
                                            <DrapePreview faceUrl={normalizedFaceUrl} colorHex={activeQuestion.right.hex} label={activeQuestion.right.id} />
                                            <div className="mt-2 text-center text-sm font-semibold text-slate-700">右: {activeQuestion.right.label}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-center sm:px-5">
                                    <div className="text-base font-bold text-slate-900 sm:text-lg">{activeQuestion.question}</div>
                                    <div className="mt-2 text-xs text-slate-500 sm:text-sm">{activeQuestion.helper}</div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                    <GlassButton onClick={() => handleSelect("left")} disabled={advancing} variant="secondary" className="min-h-11 justify-center px-2 text-xs sm:text-sm">
                                        左の方がよい
                                    </GlassButton>
                                    <GlassButton onClick={() => handleSelect("tie")} disabled={advancing} variant="default" className="min-h-11 justify-center px-2 text-xs sm:text-sm">
                                        どちらでもない
                                    </GlassButton>
                                    <GlassButton onClick={() => handleSelect("right")} disabled={advancing} variant="secondary" className="min-h-11 justify-center px-2 text-xs sm:text-sm">
                                        右の方がよい
                                    </GlassButton>
                                </div>
                                <div className="text-center text-xs text-slate-400">迷ったら「どちらでもない」で問題ありません。</div>
                            </div>
                        ) : null
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                                保存しました。生写真のAI診断と統合できます。
                            </div>
                            <GlassButton onClick={() => setWizardOpen(false)} variant="gradient">
                                統合結果を見る
                            </GlassButton>
                        </div>
                    )}
                    {saving && <div className="mt-4 text-sm text-slate-500">結果を保存しています…</div>}
                    </GlassModal>
                </BodyPortal>
            </>
        );
    }

    return (
        <>
            <GlassCard className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="text-lg font-bold text-slate-900">ドレープ比較診断</div>
                            <GlassBadge variant="gradient" size="sm">比較診断</GlassBadge>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                            実顔写真にドレープカラーを重ねて比較し、似合いやすい方向を整理します。
                        </div>
                    </div>
                    {normalizedFaceUrl ? (
                        <GlassButton onClick={beginDiagnosis} variant="gradient">
                            {result ? "再診断する" : "診断を始める"}
                        </GlassButton>
                    ) : (
                        <GlassButton onClick={openCapture} variant="secondary">
                            先に実顔セットアップへ
                        </GlassButton>
                    )}
                </div>

                {!normalizedFaceUrl && (
                    <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
                        先に実顔写真を枠に合わせて設定してください。診断用の顔写真が未確定です。
                    </div>
                )}

                {result && (
                    <div className="mt-5 space-y-4">
                        <div className="rounded-[2rem] border border-white/70 bg-gradient-to-br from-white via-white to-violet-50 p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Drape Result</div>
                                    <div className="mt-2 text-2xl font-black text-slate-900">
                                        {result.season_primary_label_ja}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-500">
                                        次点: {result.season_secondary_label_ja} / confidence {Math.round(result.confidence * 100)}%
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                                    {result.summary}
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-sm">
                                <GlassBadge variant="secondary">Warm/Cool: {result.attributeSummary.temperature}</GlassBadge>
                                <GlassBadge variant="secondary">Light/Deep: {result.attributeSummary.value}</GlassBadge>
                                <GlassBadge variant="secondary">Clear/Soft: {result.attributeSummary.chroma}</GlassBadge>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            {result.axisBreakdown.map((axis) => (
                                <div key={axis.axisType} className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                                    <div className="text-sm font-bold text-slate-900">{axis.label}</div>
                                    <div className="mt-2 text-sm text-slate-600">
                                        {renderAxisLabel(axis.winningAttribute)} がやや有利
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-slate-500">{axis.summary}</div>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                            <div className="text-sm font-bold text-slate-900">おすすめカラー</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {result.recommended_colors.map((color) => (
                                    <GlassBadge key={color} variant="success">{color}</GlassBadge>
                                ))}
                            </div>
                            <div className="mt-4 text-sm font-bold text-slate-900">避けたい傾向</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {result.avoid_tendencies.map((item) => (
                                    <GlassBadge key={item} variant="warning">{item}</GlassBadge>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {(notice || error) && (
                    <div className="mt-4 space-y-2">
                        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
                        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
                    </div>
                )}
            </GlassCard>

            <GlassModal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} title="ドレープ比較診断" size="full">
                {currentIndex < REAL_FACE_PC_QUESTIONS.length ? (
                    activeQuestion ? (
                        <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-500">{activeQuestion.pairTitle}</div>
                                    <div className="text-xs text-slate-400">{activeQuestion.pairSummary}</div>
                                </div>
                                <div className="text-right text-sm text-slate-500">
                                    <div>{currentIndex + 1} / {REAL_FACE_PC_QUESTIONS.length}</div>
                                    <div className="text-xs text-slate-400">
                                        ペア {activeQuestion.pairIndex + 1} / {pairCount} ・ 質問 {activeQuestion.axisIndex + 1} / 4
                                    </div>
                                </div>
                            </div>

                            {normalizedFaceUrl && (
                                <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-4">
                                    <div className="min-w-0">
                                        <DrapePreview faceUrl={normalizedFaceUrl} colorHex={activeQuestion.left.hex} label={activeQuestion.left.id} />
                                        <div className="mt-2 text-center text-sm font-semibold text-slate-700">左: {activeQuestion.left.label}</div>
                                    </div>
                                    <div className="min-w-0">
                                        <DrapePreview faceUrl={normalizedFaceUrl} colorHex={activeQuestion.right.hex} label={activeQuestion.right.id} />
                                        <div className="mt-2 text-center text-sm font-semibold text-slate-700">右: {activeQuestion.right.label}</div>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-center sm:px-5">
                                <div className="text-base font-bold text-slate-900 sm:text-lg">{activeQuestion.question}</div>
                                <div className="mt-2 text-xs text-slate-500 sm:text-sm">{activeQuestion.helper}</div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                <GlassButton onClick={() => handleSelect("left")} disabled={advancing} variant="secondary" className="min-h-11 justify-center px-2 text-xs sm:text-sm">
                                    左の方がよい
                                </GlassButton>
                                <GlassButton onClick={() => handleSelect("tie")} disabled={advancing} variant="default" className="min-h-11 justify-center px-2 text-xs sm:text-sm">
                                    どちらでもない
                                </GlassButton>
                                <GlassButton onClick={() => handleSelect("right")} disabled={advancing} variant="secondary" className="min-h-11 justify-center px-2 text-xs sm:text-sm">
                                    右の方がよい
                                </GlassButton>
                            </div>
                            <div className="text-center text-xs text-slate-400">迷ったら「どちらでもない」で問題ありません。</div>
                        </div>
                    ) : null
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                            保存しました。プロフィールとレコメンドに反映済みです。
                        </div>
                        <GlassButton onClick={() => setWizardOpen(false)} variant="gradient">
                            結果を見る
                        </GlassButton>
                    </div>
                )}
                {saving && <div className="mt-4 text-sm text-slate-500">結果を保存しています…</div>}
            </GlassModal>
        </>
    );
}
