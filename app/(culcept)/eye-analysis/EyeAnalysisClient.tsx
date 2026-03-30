"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import {
  LightBackground,
  GlassCard,
  GlassButton,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";

/* ───────────────── constants ───────────────── */

type Step = "guide" | "capture" | "compare_shape" | "compare_color" | "done";

const EYE_TYPES = [
  { key: "armond", label: "アーモンド型", desc: "横幅と縦幅のバランスが良く、両端が軽く尖った目" },
  { key: "kirenaga", label: "切れ長", desc: "横に長く、縦幅が狭めの涼しげな目" },
  { key: "tsurime", label: "つり目", desc: "目尻が目頭より高い位置にある目" },
  { key: "tareme", label: "たれ目", desc: "目尻が目頭より低い位置にある穏やかな目" },
  { key: "marume", label: "丸目", desc: "縦幅が大きく、丸みのある可愛らしい目" },
  { key: "yanagiba", label: "柳葉型", desc: "細く長く、柳の葉のような優美な目" },
] as const;

const EYE_COLORS = [
  { key: "dark_brown", label: "ダークブラウン", hex: "#3B2314", desc: "深い焦げ茶" },
  { key: "brown", label: "ブラウン", hex: "#6B4226", desc: "スタンダードな茶色" },
  { key: "light_brown", label: "ライトブラウン", hex: "#A0682D", desc: "明るい茶色" },
  { key: "hazel", label: "ヘーゼル", hex: "#8E7547", desc: "緑みを帯びた茶" },
  { key: "gray_brown", label: "グレーブラウン", hex: "#7A7062", desc: "灰みのある茶" },
  { key: "amber", label: "アンバー", hex: "#C88A36", desc: "琥珀色" },
] as const;

const EYE_TEMPLATE_SRC: Record<string, string> = {
  armond: "/samples/genome/eye/almond.png",
  kirenaga: "/samples/genome/eye/kirenaga.png",
  tsurime: "/samples/genome/eye/tsurime.png",
  tareme: "/samples/genome/eye/tare.png",
  marume: "/samples/genome/eye/marume.png",
  yanagiba: "/samples/genome/eye/yanagi.png",
};

// Camera/crop configuration
const CAM_W = 1920;
const CAM_H = 1080;
const EYE_MARKER = { x: 117, y: 173, w: 58, h: 35 }; // SVG座標 (viewBox 290×390)
const CROP_MARGIN = 1.04;
const MIN_OUTPUT_PX = 480;

/* ───────────────── SVG Guide Overlay ───────────────── */

function FaceEyeGuideOverlay({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 290 390"
      className={className}
      style={{ pointerEvents: "none" }}
    >
      {/* 顔の輪郭 */}
      <ellipse
        cx="145"
        cy="180"
        rx="66"
        ry="94"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      {/* 目のマーカー */}
      <rect
        x={EYE_MARKER.x}
        y={EYE_MARKER.y}
        width={EYE_MARKER.w}
        height={EYE_MARKER.h}
        rx="12"
        fill="rgba(255,200,100,0.12)"
        stroke="rgba(255,200,100,0.6)"
        strokeWidth="1.5"
        strokeDasharray="5 3"
      />
      <text
        x={EYE_MARKER.x + EYE_MARKER.w / 2}
        y={EYE_MARKER.y - 8}
        textAnchor="middle"
        fill="rgba(255,200,100,0.8)"
        fontSize="10"
      >
        左目をここに合わせる
      </text>
    </svg>
  );
}

/* ───────────────── StepIndicator ───────────────── */

const STEP_LABELS = ["ガイド", "撮影", "形を比較", "色を比較", "完了"];
const STEP_KEYS: Step[] = ["guide", "capture", "compare_shape", "compare_color", "done"];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEP_KEYS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1 mb-4">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              i <= idx
                ? "bg-amber-500/80 text-white"
                : "bg-white/20 text-white/40"
            }`}
          >
            {i + 1}
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div
              className={`w-4 h-[2px] ${
                i < idx ? "bg-amber-500/60" : "bg-white/15"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────────────── GuideStep ───────────────── */

function GuideStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center space-y-6 px-4">
      <h2 className="text-xl font-bold text-white/90">目の形 + 色を分析</h2>
      <div className="mx-auto w-48 h-48 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
        <FaceEyeGuideOverlay className="w-32 h-44 opacity-70" />
      </div>
      <div className="space-y-2 text-white/60 text-sm leading-relaxed max-w-xs mx-auto">
        <p>カメラで左目を撮影し、6種類のテンプレートと比較します。</p>
        <p>その後、目の色も分析します。</p>
        <p className="text-amber-400/70 text-xs mt-3">
          顔全体が映る距離 (30〜40cm) がベストです
        </p>
      </div>
      <GlassButton onClick={onStart} className="mx-auto">
        撮影をはじめる
      </GlassButton>
    </div>
  );
}

/* ───────────────── CaptureStep ───────────────── */

function CaptureStep({
  onCapture,
}: {
  onCapture: (img: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [isFlipped, setIsFlipped] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: CAM_W }, height: { ideal: CAM_H }, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e) {
        console.error("Camera error:", e);
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // SVG viewBox → container pixel mapping
    const svgW = 290;
    const svgH = 390;
    const containerAspect = cw / ch;
    const svgAspect = svgW / svgH;
    let scale: number, offsetX: number, offsetY: number;
    if (containerAspect > svgAspect) {
      scale = ch / svgH;
      offsetX = (cw - svgW * scale) / 2;
      offsetY = 0;
    } else {
      scale = cw / svgW;
      offsetX = 0;
      offsetY = (ch - svgH * scale) / 2;
    }

    // Eye marker center in container pixels
    const markerCxContainer = offsetX + (EYE_MARKER.x + EYE_MARKER.w / 2) * scale;
    const markerCyContainer = offsetY + (EYE_MARKER.y + EYE_MARKER.h / 2) * scale;
    const markerWContainer = EYE_MARKER.w * scale;
    const markerHContainer = EYE_MARKER.h * scale;

    // Container → video pixel mapping (object-cover)
    const videoAspect = vw / vh;
    let vScale: number, vOffX: number, vOffY: number;
    if (containerAspect > videoAspect) {
      vScale = cw / vw;
      vOffX = 0;
      vOffY = (ch - vh * vScale) / 2;
    } else {
      vScale = ch / vh;
      vOffX = (cw - vw * vScale) / 2;
      vOffY = 0;
    }

    let srcCx = (markerCxContainer - vOffX) / vScale;
    let srcCy = (markerCyContainer - vOffY) / vScale;
    if (isFlipped) srcCx = vw - srcCx;

    const srcW = (markerWContainer / vScale) * CROP_MARGIN;
    const srcH = (markerHContainer / vScale) * CROP_MARGIN;
    const sx = Math.max(0, Math.min(srcCx - srcW / 2, vw - srcW));
    const sy = Math.max(0, Math.min(srcCy - srcH / 2, vh - srcH));
    const outW = Math.max(MIN_OUTPUT_PX, Math.round(srcW));
    const outH = Math.max(MIN_OUTPUT_PX, Math.round(srcH * (MIN_OUTPUT_PX / srcW)));

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, sx, sy, srcW, srcH, 0, 0, outW, outH);
    onCapture(canvas.toDataURL("image/jpeg", 0.95));
  }, [isFlipped, onCapture]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 mb-1">
        <p className="text-white/60 text-xs">左目をガイドに合わせてください</p>
        <button
          onClick={() => setIsFlipped((f) => !f)}
          className="text-xs text-amber-400/70 underline"
        >
          {isFlipped ? "反転あり" : "反転なし"}
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative mx-auto w-full max-w-[320px] rounded-2xl overflow-hidden bg-black"
        style={{ aspectRatio: "3/4" }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isFlipped ? "scaleX(-1)" : "none" }}
        />
        <FaceEyeGuideOverlay className="absolute inset-0 w-full h-full" />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <GlassButton
        onClick={capture}
        disabled={!ready}
        className="w-full"
      >
        {ready ? "この位置で撮影する" : "カメラ起動中…"}
      </GlassButton>
    </div>
  );
}

/* ───────────────── CompareShapeStep ───────────────── */

function CompareShapeStep({
  eyeImage,
  onSelect,
}: {
  eyeImage: string;
  onSelect: (key: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [opacity, setOpacity] = useState(0.5);
  const current = EYE_TYPES[idx];

  const next = () => setIdx((i) => (i + 1) % EYE_TYPES.length);
  const prev = () => setIdx((i) => (i - 1 + EYE_TYPES.length) % EYE_TYPES.length);

  const handleDrag = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 60) {
      info.offset.x > 0 ? prev() : next();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg font-bold text-white/90">
        目の形を比較
      </h3>

      {/* Side-by-side comparison */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-black/30"
        style={{ aspectRatio: "16/9" }}
      >
        {/* User's eye image (base layer) */}
        <img
          src={eyeImage}
          alt="あなたの目"
          className="absolute inset-0 w-full h-full object-contain"
        />
        {/* Template overlay */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            style={{ mixBlendMode: "multiply", opacity }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDrag}
          >
            <img
              src={EYE_TEMPLATE_SRC[current.key] ?? ""}
              alt={current.label}
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </motion.div>
        </AnimatePresence>
        {/* Type label */}
        <div className="absolute top-2 left-2">
          <GlassBadge variant="info">{current.label}</GlassBadge>
        </div>
      </div>

      {/* Opacity slider */}
      <div className="flex items-center gap-3 px-2">
        <span className="text-xs text-white/40">薄</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="flex-1 accent-amber-500"
        />
        <span className="text-xs text-white/40">濃</span>
      </div>

      {/* Description */}
      <p className="text-center text-sm text-white/60 px-4">{current.desc}</p>

      {/* Dot navigation */}
      <div className="flex justify-center gap-2">
        {EYE_TYPES.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setIdx(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === idx ? "bg-amber-500" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Swipe hint */}
      <p className="text-center text-[11px] text-white/30">
        左右スワイプで切り替え
      </p>

      <GlassButton onClick={() => onSelect(current.key)} className="w-full">
        「{current.label}」が一番近い
      </GlassButton>
    </div>
  );
}

/* ───────────────── CompareColorStep ───────────────── */

function CompareColorStep({
  eyeImage,
  onSelect,
}: {
  eyeImage: string;
  onSelect: (key: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const current = EYE_COLORS[idx];

  const next = () => setIdx((i) => (i + 1) % EYE_COLORS.length);
  const prev = () => setIdx((i) => (i - 1 + EYE_COLORS.length) % EYE_COLORS.length);

  const handleDrag = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 60) {
      info.offset.x > 0 ? prev() : next();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg font-bold text-white/90">
        目の色を比較
      </h3>

      {/* Side-by-side comparison */}
      <div className="flex gap-3 px-2">
        {/* Left: user's eye */}
        <div className="flex-1 rounded-xl overflow-hidden bg-black/30" style={{ aspectRatio: "1" }}>
          <img
            src={eyeImage}
            alt="あなたの目"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Right: iris color swatch */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="flex-1 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ aspectRatio: "1", background: "#1a1a1a" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDrag}
          >
            <div
              className="w-3/4 h-3/4 rounded-full border-2 border-white/10"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${current.hex}88, ${current.hex} 50%, ${current.hex}cc 80%, #111 100%)`,
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Color label + description */}
      <div className="text-center">
        <GlassBadge variant="info">{current.label}</GlassBadge>
        <p className="text-sm text-white/50 mt-1">{current.desc}</p>
      </div>

      {/* Dot navigation */}
      <div className="flex justify-center gap-2">
        {EYE_COLORS.map((c, i) => (
          <button
            key={c.key}
            onClick={() => setIdx(i)}
            className="w-3 h-3 rounded-full border border-white/20 transition-all"
            style={{
              background: c.hex,
              transform: i === idx ? "scale(1.4)" : "scale(1)",
              borderColor: i === idx ? "rgba(255,200,100,0.8)" : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>

      <p className="text-center text-[11px] text-white/30">
        左右スワイプで切り替え
      </p>

      <GlassButton onClick={() => onSelect(current.key)} className="w-full">
        「{current.label}」が一番近い
      </GlassButton>
    </div>
  );
}

/* ───────────────── DoneStep ───────────────── */

function DoneStep({
  selectedShape,
  selectedColor,
}: {
  selectedShape: string;
  selectedColor: string;
}) {
  const shape = EYE_TYPES.find((t) => t.key === selectedShape);
  const color = EYE_COLORS.find((c) => c.key === selectedColor);

  return (
    <div className="text-center space-y-6">
      <div className="text-4xl">✨</div>
      <h3 className="text-xl font-bold text-white/90">分析完了</h3>

      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/50 text-sm">目の形</span>
          <GlassBadge variant="info">{shape?.label ?? selectedShape}</GlassBadge>
        </div>
        <p className="text-xs text-white/40">{shape?.desc}</p>
        <div className="border-t border-white/10" />
        <div className="flex items-center justify-between">
          <span className="text-white/50 text-sm">目の色</span>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-white/20"
              style={{ background: color?.hex }}
            />
            <GlassBadge variant="info">{color?.label ?? selectedColor}</GlassBadge>
          </div>
        </div>
        <p className="text-xs text-white/40">{color?.desc}</p>
      </GlassCard>

      <Link href="/body-color/avatar?tab=face&sub=eye">
        <GlassButton className="w-full">アバターに戻る</GlassButton>
      </Link>
    </div>
  );
}

/* ───────────────── Main Component ───────────────── */

export default function EyeAnalysisClient() {
  const [step, setStep] = useState<Step>("guide");
  const [eyeImage, setEyeImage] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCapture = useCallback((img: string) => {
    setEyeImage(img);
    setStep("compare_shape");
  }, []);

  const handleShapeSelect = useCallback((key: string) => {
    setSelectedShape(key);
    setStep("compare_color");
  }, []);

  const handleColorSelect = useCallback(
    async (colorKey: string) => {
      setSelectedColor(colorKey);
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch("/api/eye-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eyeType: selectedShape,
            eyeColor: colorKey,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "保存に失敗しました");
        }
        setStep("done");
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
      } finally {
        setSaving(false);
      }
    },
    [selectedShape],
  );

  return (
    <LightBackground>
      <div className="min-h-dvh px-4 py-6 max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/body-color/avatar?tab=face&sub=eye"
            className="text-white/50 text-sm"
          >
            ← 戻る
          </Link>
          <h1 className="text-sm font-semibold text-white/70">
            目の分析
          </h1>
          <div className="w-10" />
        </div>

        <StepIndicator current={step} />

        {/* Save error */}
        {saveError && (
          <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-center">
            {saveError}
          </div>
        )}

        {/* Saving overlay */}
        {saving && (
          <div className="mb-3 text-center text-amber-400/70 text-sm animate-pulse">
            保存中…
          </div>
        )}

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >
            {step === "guide" && (
              <GuideStep onStart={() => setStep("capture")} />
            )}
            {step === "capture" && (
              <CaptureStep onCapture={handleCapture} />
            )}
            {step === "compare_shape" && eyeImage && (
              <CompareShapeStep
                eyeImage={eyeImage}
                onSelect={handleShapeSelect}
              />
            )}
            {step === "compare_color" && eyeImage && (
              <CompareColorStep
                eyeImage={eyeImage}
                onSelect={handleColorSelect}
              />
            )}
            {step === "done" && selectedShape && selectedColor && (
              <DoneStep
                selectedShape={selectedShape}
                selectedColor={selectedColor}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </LightBackground>
  );
}
