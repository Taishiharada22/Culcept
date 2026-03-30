"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  onComplete: (base64: string) => void;
}

export default function FacePhotoUpload({ onComplete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("JPEG / PNG / WebP のみ対応しています");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("10MB 以下の画像を選択してください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  return (
    <div className="text-center space-y-6 px-4">
      <h2 className="text-xl font-bold text-slate-800">顔画像をアップロード</h2>

      <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
        正面に近い顔画像を選んでください。
        髪型や前髪も見えると判定しやすくなります。
      </p>

      {/* Upload area */}
      <motion.div
        className={`relative mx-auto max-w-[300px] aspect-[3/4] rounded-2xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden ${
          dragging
            ? "border-amber-400 bg-amber-500/10"
            : "border-slate-300 bg-slate-50/50 hover:border-slate-400"
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />

        {preview ? (
          <img
            src={preview}
            alt="プレビュー"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-5xl">{dragging ? "📥" : "📷"}</span>
            <div className="text-sm text-slate-600 font-medium">
              タップして画像を選択
            </div>
            <div className="text-xs text-slate-400">
              ドラッグ&ドロップも可
            </div>
          </div>
        )}
      </motion.div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Tips */}
      <GlassCard className="p-4 mx-auto max-w-xs text-left">
        <p className="text-xs font-semibold text-slate-700 mb-2">推奨条件</p>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>・ 正面に近い角度</li>
          <li>・ 顔全体が見える</li>
          <li>・ 明るすぎず暗すぎない</li>
          <li>・ できれば無加工</li>
        </ul>
      </GlassCard>

      {/* Proceed */}
      <GlassButton
        onClick={() => preview && onComplete(preview)}
        disabled={!preview}
        className="mx-auto"
      >
        この画像で判定を始める
      </GlassButton>

      {/* Re-select */}
      {preview && (
        <button
          onClick={() => {
            setPreview(null);
            fileRef.current?.click();
          }}
          className="text-xs text-slate-400 underline"
        >
          別の画像を選び直す
        </button>
      )}
    </div>
  );
}
