"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SlotId = "atmosphere" | "face" | "best" | "current";

interface PhotoSlot {
  id: SlotId;
  label: string;
  sublabel: string;
  description: string;
  required: boolean;
  icon: string;
  example: string;
}

const PHOTO_SLOTS: PhotoSlot[] = [
  {
    id: "atmosphere",
    label: "雰囲気",
    sublabel: "あなたらしさが伝わる1枚",
    description:
      "カフェ、旅先、趣味の風景など。顔がはっきり見えなくてもOK。あなたのVibeが伝わる写真を選んでください。",
    required: true,
    icon: "✨",
    example: "例: カフェで本を読んでいる横顔、旅先での後ろ姿",
  },
  {
    id: "face",
    label: "顔写真",
    sublabel: "あなたの顔がわかる1枚",
    description:
      "正面または斜め前からの写真。自然な表情がベスト。この写真は相手との会話が深まった後に公開されます。",
    required: true,
    icon: "😊",
    example: "例: 自然光の下での自撮り、友達に撮ってもらった写真",
  },
  {
    id: "best",
    label: "とっておき",
    sublabel: "一番自信のある1枚",
    description:
      "あなたが一番良く撮れたと思う写真。イベント、お出かけ、特別な瞬間など。",
    required: false,
    icon: "💎",
    example: "例: ドレスアップした写真、趣味を楽しんでいる瞬間",
  },
  {
    id: "current",
    label: "今の自分",
    sublabel: "最近撮った確認用の1枚",
    description:
      "本人確認のための写真です。1週間以内に撮影したもの。加工なしでお願いします。",
    required: true,
    icon: "📸",
    example: "例: 今日の自分をそのまま撮影",
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PhotoRegistrationProps {
  category: string;
  onComplete: (photos: Record<string, string>) => void;
  onSkip?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhotoRegistration({
  category,
  onComplete,
  onSkip,
}: PhotoRegistrationProps) {
  const needsVerification =
    category === "romantic" || category === "partner";

  // Uploaded photo URLs keyed by slot id
  const [photos, setPhotos] = useState<Record<string, string>>({});
  // Upload progress per slot (0-100, -1 = error)
  const [progress, setProgress] = useState<Record<string, number>>({});
  // ID document
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [idDocProgress, setIdDocProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const idDocInputRef = useRef<HTMLInputElement | null>(null);

  // Determine which slots are required based on category
  const getSlots = useCallback(() => {
    return PHOTO_SLOTS.map((s) => ({
      ...s,
      // "current" is required only for romantic/partner
      required:
        s.id === "current" ? needsVerification : s.required,
    }));
  }, [needsVerification]);

  const slots = getSlots();

  const requiredSlots = slots.filter((s) => s.required);
  const allRequiredUploaded = requiredSlots.every(
    (s) => photos[s.id],
  );
  const canComplete =
    allRequiredUploaded &&
    (!needsVerification || idDocUrl);

  // -----------------------------------------------------------------------
  // Upload handler
  // -----------------------------------------------------------------------

  const uploadPhoto = async (slotId: SlotId, file: File) => {
    setError(null);
    setProgress((p) => ({ ...p, [slotId]: 5 }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("slotType", slotId);

    try {
      // Simulate incremental progress
      const progressTimer = setInterval(() => {
        setProgress((p) => {
          const cur = p[slotId] ?? 5;
          if (cur >= 90) {
            clearInterval(progressTimer);
            return p;
          }
          return { ...p, [slotId]: cur + 10 };
        });
      }, 200);

      const res = await fetch("/api/rendezvous/photos", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressTimer);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "アップロードに失敗しました");
      }

      const data = await res.json();
      const url = data.photo?.url ?? "";

      setPhotos((prev) => ({ ...prev, [slotId]: url }));
      setProgress((p) => ({ ...p, [slotId]: 100 }));

      // Also update verification record
      if (needsVerification) {
        fetch("/api/rendezvous/verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [`photo_${slotId}`]: data.photo?.url }),
          credentials: "include",
        }).catch(() => {});
      }
    } catch (err: unknown) {
      setProgress((p) => ({ ...p, [slotId]: -1 }));
      setError(
        err instanceof Error ? err.message : "アップロードに失敗しました",
      );
    }
  };

  const uploadIdDocument = async (file: File) => {
    setError(null);
    setIdDocProgress(5);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("slotType", "id_document");

    try {
      const progressTimer = setInterval(() => {
        setIdDocProgress((p) => {
          if (p >= 90) {
            clearInterval(progressTimer);
            return p;
          }
          return p + 10;
        });
      }, 200);

      const res = await fetch("/api/rendezvous/photos", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressTimer);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "アップロードに失敗しました");
      }

      const data = await res.json();
      const url = data.photo?.url ?? "";

      setIdDocUrl(url);
      setIdDocProgress(100);

      // Update verification record
      fetch("/api/rendezvous/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_document: url }),
        credentials: "include",
      }).catch(() => {});
    } catch (err: unknown) {
      setIdDocProgress(-1);
      setError(
        err instanceof Error ? err.message : "アップロードに失敗しました",
      );
    }
  };

  // -----------------------------------------------------------------------
  // File input handler
  // -----------------------------------------------------------------------

  const handleFileChange = (slotId: SlotId, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadPhoto(slotId, file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const handleIdDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadIdDocument(file);
    e.target.value = "";
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="px-4 pt-14 pb-8">
      {/* Header */}
      <div className="text-center mb-5">
        <h2 className="text-xl font-extrabold text-slate-900 mb-1">
          写真を登録
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          あなたの写真を登録してください。
          {needsVerification
            ? "恋愛カテゴリでは本人確認書類も必要です。"
            : "任意の写真はスキップできます。"}
        </p>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 p-2.5 rounded-xl text-xs text-red-700 leading-relaxed"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2x2 photo grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {slots.map((slot, i) => {
          const uploaded = !!photos[slot.id];
          const prog = progress[slot.id] ?? 0;
          const isError = prog === -1;
          const isUploading = prog > 0 && prog < 100 && !isError;

          return (
            <motion.div
              key={slot.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            >
              <GlassCard
                padding="none"
                className="relative overflow-hidden"
                hoverEffect={false}
              >
                {/* Hidden file input */}
                <input
                  ref={(el) => { fileInputRefs.current[slot.id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileChange(slot.id, e)}
                />

                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => fileInputRefs.current[slot.id]?.click()}
                  disabled={isUploading}
                >
                  {/* Photo preview or placeholder */}
                  <div className="relative aspect-square w-full">
                    {uploaded ? (
                      <img
                        src={photos[slot.id]}
                        alt={slot.label}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex flex-col items-center justify-center gap-1"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(236,72,153,0.05) 100%)",
                        }}
                      >
                        <span className="text-2xl">{slot.icon}</span>
                        <span className="text-[10px] text-slate-400">
                          タップして選択
                        </span>
                      </div>
                    )}

                    {/* Upload progress overlay */}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      </div>
                    )}

                    {/* Checkmark overlay */}
                    {uploaded && !isUploading && (
                      <div className="absolute top-1.5 right-1.5">
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Error overlay */}
                    {isError && (
                      <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                        <span className="text-xs text-red-600 font-medium">
                          再試行
                        </span>
                      </div>
                    )}

                    {/* Required badge */}
                    {slot.required && !uploaded && (
                      <div className="absolute top-1.5 left-1.5">
                        <GlassBadge variant="warning" size="sm">
                          必須
                        </GlassBadge>
                      </div>
                    )}
                  </div>

                  {/* Label area */}
                  <div className="p-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm">{slot.icon}</span>
                      <span className="text-xs font-bold text-slate-800">
                        {slot.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">
                      {slot.sublabel}
                    </p>
                  </div>
                </button>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* ID Document section (romantic/partner only) */}
      {needsVerification && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="mb-5"
        >
          <GlassCard padding="sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🪪</span>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  本人確認書類
                </h3>
                <p className="text-[10px] text-slate-500">
                  運転免許証・パスポート・マイナンバーカード等
                </p>
              </div>
              {!idDocUrl && (
                <GlassBadge variant="warning" size="sm" className="ml-auto">
                  必須
                </GlassBadge>
              )}
              {idDocUrl && (
                <div className="ml-auto w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={idDocInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleIdDocChange}
            />

            {idDocUrl ? (
              <div className="relative rounded-xl overflow-hidden h-24">
                <img
                  src={idDocUrl}
                  alt="本人確認書類"
                  className="w-full h-full object-cover blur-md"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="text-xs text-white font-medium">
                    アップロード済み
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-6 flex flex-col items-center gap-1 hover:border-violet-300 transition-colors"
                onClick={() => idDocInputRef.current?.click()}
                disabled={idDocProgress > 0 && idDocProgress < 100}
              >
                {idDocProgress > 0 && idDocProgress < 100 ? (
                  <div className="w-8 h-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
                ) : (
                  <>
                    <svg
                      className="w-6 h-6 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-[10px] text-slate-400">
                      タップして書類を撮影
                    </span>
                  </>
                )}
              </button>
            )}

            <p className="text-[10px] text-violet-600 mt-2 leading-relaxed">
              CEOが確認します。通常24時間以内に完了します。書類の情報は本人確認のみに使用し、他のユーザーには一切公開されません。
            </p>
          </GlassCard>
        </motion.div>
      )}

      {/* Completion buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col gap-2"
      >
        <GlassButton
          variant="primary"
          size="md"
          fullWidth
          disabled={!canComplete}
          onClick={() => onComplete(photos)}
        >
          {canComplete ? "次へ進む" : "必須の写真をアップロードしてください"}
        </GlassButton>

        {onSkip && !needsVerification && (
          <GlassButton
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onSkip}
          >
            あとで登録する
          </GlassButton>
        )}
      </motion.div>
    </div>
  );
}
