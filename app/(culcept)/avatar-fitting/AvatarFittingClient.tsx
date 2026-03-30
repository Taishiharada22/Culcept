"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, FadeInView } from "@/components/ui/glassmorphism-design";
import ImageUploader from "./_components/ImageUploader";
import FittingResultCard from "./_components/FittingResultCard";
import AvatarCommentBubble from "./_components/AvatarCommentBubble";
import FittingHistory from "./_components/FittingHistory";
import type { AvatarFittingResult, HistoryItem } from "@/lib/avatar-fitting/types";

type Props = {
  initialHistory: HistoryItem[];
  userName?: string;
};

type ViewState = "upload" | "analyzing" | "result";

export default function AvatarFittingClient({ initialHistory, userName }: Props) {
  const [view, setView] = useState<ViewState>("upload");
  const [result, setResult] = useState<(AvatarFittingResult & { evaluationId?: string }) | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleUpload = useCallback(async (base64: string, mimeType: "image/jpeg" | "image/png" | "image/webp") => {
    setView("analyzing");
    setError(null);
    setImagePreview(`data:${mimeType};base64,${base64}`);

    try {
      const res = await fetch("/api/avatar-fitting/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      setView("result");

      setHistory(prev => [{
        id: data.evaluationId ?? crypto.randomUUID(),
        imageUrl: null,
        overallMatch: data.overallMatch,
        band: data.band,
        sizeScore: data.sizeScore?.adjustedScore ?? 0,
        visualScore: data.visualScore?.adjustedScore ?? 0,
        colorScore: data.colorScore?.adjustedScore ?? 0,
        preferenceScore: data.preferenceScore?.adjustedScore ?? 0,
        avatarComment: data.avatarComment ?? "",
        extractedCategory: data.extractedAttributes?.category ?? "unknown",
        createdAt: new Date().toISOString(),
      }, ...prev]);
    } catch (err) {
      console.error("[AvatarFitting] Error:", err);
      setError(err instanceof Error ? err.message : "分析に失敗しました");
      setView("upload");
    }
  }, []);

  const handleFeedback = useCallback(async (feedback: {
    userRating: number;
    sizeSatisfaction: number;
    visualSatisfaction: number;
    purchased: boolean;
  }) => {
    if (!result?.evaluationId) return;
    try {
      await fetch("/api/avatar-fitting/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationId: result.evaluationId, ...feedback }),
      });
    } catch (err) {
      console.error("[AvatarFitting] Feedback error:", err);
    }
  }, [result]);

  const handleReset = useCallback(() => {
    setView("upload");
    setResult(null);
    setImagePreview(null);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 px-4 py-6 pb-24">
      <div className="mx-auto max-w-lg space-y-6">
        <FadeInView>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">フィッティング診断</h1>
            <p className="mt-1 text-sm text-white/60">分身が服の相性を判定します</p>
          </div>
        </FadeInView>

        <AnimatePresence mode="wait">
          {view === "upload" && (
            <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <ImageUploader onUpload={handleUpload} />
              {error && (
                <GlassCard className="mt-4 border-red-500/30 bg-red-500/10">
                  <p className="text-sm text-red-300">{error}</p>
                </GlassCard>
              )}
            </motion.div>
          )}

          {view === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <GlassCard className="flex flex-col items-center gap-4 py-12">
                {imagePreview && (
                  <img src={imagePreview} alt="分析中" className="h-32 w-32 rounded-xl object-cover opacity-60" />
                )}
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="text-white/70">分身が相性を判定中...</span>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {view === "result" && result && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <AvatarCommentBubble comment={result.avatarComment} band={result.band} userName={userName} />
              <FittingResultCard result={result} imagePreview={imagePreview} onFeedback={handleFeedback} evaluationId={result.evaluationId} />
              <div className="flex justify-center">
                <GlassButton onClick={handleReset}>別のアイテムを診断</GlassButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {history.length > 0 && (
          <FadeInView delay={0.3}>
            <FittingHistory items={history} />
          </FadeInView>
        )}
      </div>
    </div>
  );
}
