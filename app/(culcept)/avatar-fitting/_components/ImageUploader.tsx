"use client";

import { useState, useRef, useCallback } from "react";
import { GlassCard } from "@/components/ui/glassmorphism-design";

type Props = {
  onUpload: (base64: string, mimeType: "image/jpeg" | "image/png" | "image/webp") => void;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AcceptedMime = typeof ACCEPTED_TYPES[number];

function isAcceptedMime(type: string): type is AcceptedMime {
  return (ACCEPTED_TYPES as readonly string[]).includes(type);
}

export default function ImageUploader({ onUpload }: Props) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!isAcceptedMime(file.type)) {
      alert("JPEG, PNG, WebP画像のみ対応しています");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB以下の画像を選択してください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      onUpload(base64, file.type as AcceptedMime);
    };
    reader.readAsDataURL(file);
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <GlassCard
      className={`cursor-pointer transition-all ${dragging ? "border-cyan-400/60 bg-cyan-500/10 scale-[1.02]" : "border-white/10 hover:border-white/20"}`}
      onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="text-5xl">{dragging ? "📥" : "👗"}</div>
        <div className="text-center">
          <p className="text-lg font-medium text-white">服の画像をアップロード</p>
          <p className="mt-1 text-sm text-white/50">ドラッグ&ドロップ または タップして選択</p>
          <p className="mt-1 text-xs text-white/30">JPEG / PNG / WebP（10MBまで）</p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />
    </GlassCard>
  );
}
