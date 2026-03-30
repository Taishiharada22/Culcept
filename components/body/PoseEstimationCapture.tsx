"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton, GlassCard, GlassBadge, GlassModal } from "@/components/ui/glassmorphism-design";
import { detectPoseVideo, drawPoseOverlay, type PoseLandmark } from "@/lib/body/mediapipePoseLandmarks";
import { estimateProportionsFromPose, type PoseProportionResult } from "@/lib/body/poseProportionEstimator";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    heightCm: number;
    onEstimated: (estimates: Record<string, number>) => void;
}

export default function PoseEstimationCapture({ isOpen, onClose, heightCm, onEstimated }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [landmarks, setLandmarks] = useState<PoseLandmark[] | null>(null);
    const [result, setResult] = useState<PoseProportionResult | null>(null);
    const [estimating, setEstimating] = useState(false);

    const startCamera = useCallback(async () => {
        try {
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 960 } },
                audio: false,
            });
            if (!videoRef.current) return;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setStreaming(true);
        } catch {
            setError("カメラを起動できませんでした。カメラの権限を確認してください。");
        }
    }, []);

    const stopCamera = useCallback(() => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setStreaming(false);
    }, []);

    // カメラ開始/停止
    useEffect(() => {
        if (!isOpen) return stopCamera;
        let cancelled = false;
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 960 } },
                    audio: false,
                });
                if (cancelled || !videoRef.current) return;
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                if (!cancelled) setStreaming(true);
            } catch {
                if (!cancelled) setError("カメラを起動できませんでした。カメラの権限を確認してください。");
            }
        })();
        return () => { cancelled = true; stopCamera(); };
    }, [isOpen, stopCamera]);

    // リアルタイムPose検出ループ
    useEffect(() => {
        if (!streaming || !isOpen) return;
        let cancelled = false;

        const loop = async () => {
            if (cancelled || !videoRef.current || !canvasRef.current) return;
            const video = videoRef.current;
            if (video.readyState < 2) {
                requestAnimationFrame(() => void loop());
                return;
            }

            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.drawImage(video, 0, 0);

            const poseResult = await detectPoseVideo(video, performance.now());
            if (poseResult?.landmarks) {
                setLandmarks(poseResult.landmarks);
                drawPoseOverlay(ctx, poseResult.landmarks, canvas.width, canvas.height, {
                    color: "rgba(139, 92, 246, 0.8)",
                    lineWidth: 3,
                    dotRadius: 5,
                });
            }

            if (!cancelled) {
                setTimeout(() => void loop(), 100);
            }
        };

        void loop();
        return () => { cancelled = true; };
    }, [streaming, isOpen]);

    const handleEstimate = useCallback(() => {
        if (!landmarks || landmarks.length < 33) {
            setError("全身のランドマークが検出できません。全身が映るように立ってください。");
            return;
        }

        setEstimating(true);
        const proportion = estimateProportionsFromPose(landmarks, heightCm);
        setResult(proportion);
        setEstimating(false);
    }, [landmarks, heightCm]);

    const handleApply = useCallback(() => {
        if (!result) return;
        const estimates: Record<string, number> = {};
        for (const [key, est] of Object.entries(result.estimates)) {
            estimates[key] = est.value;
            // 重複キーの同期
            if (key === "shoulder_breadth") estimates.shoulder = est.value;
            if (key === "sleeve_length") estimates.sleeve = est.value;
        }
        onEstimated(estimates);
        onClose();
    }, [result, onEstimated, onClose]);

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title="カメラから体型を推定" size="lg">
            <div className="space-y-4">
                {/* ガイダンス */}
                <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-800">
                    全身が映るようにカメラから2mほど離れて、正面を向いて立ってください。
                    肩幅・袖丈・股下・背丈を推定できます。
                </div>

                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {/* カメラ + スケルトンオーバーレイ */}
                <div className="relative mx-auto w-full max-w-[400px] overflow-hidden rounded-2xl bg-slate-900" style={{ aspectRatio: "2/3" }}>
                    <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
                    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
                    {!streaming && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
                            カメラを起動中...
                        </div>
                    )}
                </div>

                {/* 推定ボタン */}
                <div className="flex justify-center gap-3">
                    <GlassButton
                        onClick={handleEstimate}
                        variant="gradient"
                        disabled={!landmarks || estimating}
                        loading={estimating}
                        aria-label="体型を推定する"
                    >
                        推定する
                    </GlassButton>
                    <GlassButton onClick={onClose} variant="secondary" aria-label="閉じる">
                        閉じる
                    </GlassButton>
                </div>

                {/* 推定結果 */}
                <AnimatePresence>
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            <GlassCard className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm font-bold text-slate-700">推定結果</div>
                                    <GlassBadge variant={result.overallQuality > 0.7 ? "success" : "warning"}>
                                        品質: {Math.round(result.overallQuality * 100)}%
                                    </GlassBadge>
                                </div>

                                {Object.entries(result.estimates).length > 0 ? (
                                    <div className="space-y-2">
                                        {Object.entries(result.estimates).map(([key, est]) => (
                                            <div key={key} className="flex items-center justify-between text-sm">
                                                <span className="text-slate-600">
                                                    {key === "shoulder_breadth" ? "肩幅" :
                                                     key === "sleeve_length" ? "袖丈" :
                                                     key === "inseam" ? "股下" :
                                                     key === "rise" ? "股上" :
                                                     key === "back_length" ? "背丈" : key}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-slate-800">{est.value} cm</span>
                                                    <span className={`text-[10px] ${est.confidence > 0.7 ? "text-emerald-600" : "text-amber-600"}`}>
                                                        {Math.round(est.confidence * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))}

                                        <GlassButton
                                            onClick={handleApply}
                                            variant="gradient"
                                            size="sm"
                                            className="mt-3 w-full"
                                            aria-label="推定値を入力に反映する"
                                        >
                                            この推定値を入力に反映
                                        </GlassButton>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500">
                                        推定できるフィールドがありませんでした。全身が映るように調整してください。
                                    </div>
                                )}

                                {Object.keys(result.skipped).length > 0 && (
                                    <div className="mt-3 text-xs text-slate-400">
                                        周囲径（バスト・ウエスト・ヒップなど）はカメラからは推定できません。メジャーで計測してください。
                                    </div>
                                )}
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </GlassModal>
    );
}
