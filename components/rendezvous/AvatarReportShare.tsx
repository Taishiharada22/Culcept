"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── カラーパレット ── */
const C = {
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
  rendezvous: "#D946EF", // Rendezvous ゾーンカラー
};

/* ── 印象タイプ定義 ── */
interface ImpressionType {
  id: string;
  label: string;
  description: string;
  color: string;
}

const IMPRESSION_TYPES: ImpressionType[] = [
  { id: "lumiere", label: "Lumiere", description: "光のような透明感", color: "#F0D9FF" },
  { id: "bloom", label: "Bloom", description: "咲き誇る華やかさ", color: "#FFD9E8" },
  { id: "ember", label: "Ember", description: "内に秘めた熱", color: "#FFE0C4" },
  { id: "frost", label: "Frost", description: "研ぎ澄まされた静謐", color: "#D9ECFF" },
  { id: "velvet", label: "Velvet", description: "柔らかな深み", color: "#E0D4F5" },
  { id: "prism", label: "Prism", description: "多面的な輝き", color: "#D4F5E0" },
  { id: "terra", label: "Terra", description: "地に根ざした安定感", color: "#E8DCC8" },
  { id: "aurora", label: "Aurora", description: "揺らめく神秘", color: "#D4E8F5" },
];

/* ── Canvas テキスト折り返し ── */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = text.split("");
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ══════════════════════════════════════════════
   AvatarReportShare
   あなたの分身の発見レポートをシェア
   ══════════════════════════════════════════════ */

interface Props {
  /** 分身が惹かれる印象タイプ Top 3 (id配列) */
  attractedImpressions: string[];
  /** 分身が大切にしている価値 */
  coreValues: string[];
  /** ユーザー表示名 */
  displayName?: string | null;
  /** アーキタイプラベル */
  archetypeLabel?: string | null;
}

export default function AvatarReportShare({
  attractedImpressions,
  coreValues,
  displayName,
  archetypeLabel,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const topImpressions = attractedImpressions
    .map((id) => IMPRESSION_TYPES.find((t) => t.id === id))
    .filter(Boolean) as ImpressionType[];

  const topValues = coreValues.slice(0, 4);

  /* ── Canvas画像生成（1080x1920） ── */
  const generateImage = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = 1080, h = 1920;
    canvas.width = w;
    canvas.height = h;

    // 背景: ダーク + Rendezvousテーマ
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, "#0D0618");
    bgGrad.addColorStop(0.3, "#140A28");
    bgGrad.addColorStop(0.6, "#0F0820");
    bgGrad.addColorStop(1, "#080412");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // グロー
    const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, 450);
    glowGrad.addColorStop(0, `${C.rendezvous}18`);
    glowGrad.addColorStop(0.5, `${C.neural}08`);
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // 抽象的な装飾（3つの大きな円 = アバターの存在を示唆）
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.3 + i * 0.2);
      const cy = h * 0.32;
      const r = 80 + i * 20;
      const circGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      circGrad.addColorStop(0, `${C.rendezvous}15`);
      circGrad.addColorStop(1, "transparent");
      ctx.fillStyle = circGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = "center";

    // ブランド
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "14px monospace";
    ctx.fillText("Aneurasync Rendezvous", w / 2, 100);

    // メインタイトル
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "300 28px sans-serif";
    ctx.fillText("あなたの分身はこんな人に惹かれます", w / 2, 500);

    // 印象タイプ（ぼかし円 + テキスト）
    topImpressions.forEach((imp, i) => {
      const ty = 600 + i * 140;
      // ぼかし風の色付き円
      const impGrad = ctx.createRadialGradient(w / 2 - 200, ty, 0, w / 2 - 200, ty, 40);
      impGrad.addColorStop(0, `${imp.color}60`);
      impGrad.addColorStop(1, "transparent");
      ctx.fillStyle = impGrad;
      ctx.beginPath();
      ctx.arc(w / 2 - 200, ty, 40, 0, Math.PI * 2);
      ctx.fill();

      // ラベル
      ctx.textAlign = "left";
      ctx.fillStyle = `${imp.color}cc`;
      ctx.font = "600 32px sans-serif";
      ctx.fillText(imp.label, w / 2 - 140, ty + 5);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "400 20px sans-serif";
      ctx.fillText(imp.description, w / 2 - 140, ty + 35);
      ctx.textAlign = "center";
    });

    // 大切にしている価値
    const valuesY = 600 + topImpressions.length * 140 + 80;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "300 24px sans-serif";
    ctx.fillText("あなたの分身が大切にしていること", w / 2, valuesY);

    topValues.forEach((val, i) => {
      const vy = valuesY + 50 + i * 55;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "400 22px sans-serif";
      ctx.fillText(val, w / 2, vy);
    });

    // アーキタイプ（あれば）
    if (archetypeLabel) {
      ctx.fillStyle = `${C.rendezvous}50`;
      ctx.font = "400 18px monospace";
      ctx.fillText(archetypeLabel, w / 2, h * 0.84);
    }

    // CTA
    ctx.fillStyle = `${C.rendezvous}80`;
    ctx.font = "500 18px sans-serif";
    ctx.fillText("あなたの分身を見る", w / 2, h * 0.90);

    // ウォーターマーク
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = "12px monospace";
    ctx.fillText("Aneurasync -- Your Second Self", w / 2, h - 50);

    return canvas.toDataURL("image/png");
  }, [topImpressions, topValues, archetypeLabel]);

  /* ── シェアアクション ── */
  const handleShare = useCallback(async () => {
    setGenerating(true);
    try {
      const dataUrl = generateImage();
      if (!dataUrl) return;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "avatar-report.png", { type: "image/png" });

      if (navigator.share) {
        await navigator.share({
          title: `${displayName ?? ""}の分身レポート`,
          text: "Aneurasyncで自分の分身を見てみよう",
          files: [file],
        });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "avatar-report.png";
        a.click();
      }
    } catch {
      // User cancelled
    } finally {
      setGenerating(false);
    }
  }, [generateImage, displayName]);

  /* ── LINE シェア ── */
  const handleLineShare = useCallback(() => {
    const text = `${displayName ?? "私"}の分身はこんな人に惹かれるらしい！\n${topImpressions.map((t) => t.label).join(", ")}\n\nAneurasyncで自分の分身を見てみよう\nhttps://aneurasync.com`;
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
  }, [displayName, topImpressions]);

  /* ── X(Twitter) シェア ── */
  const handleXShare = useCallback(() => {
    const text = `私の分身はこんな人に惹かれるらしい\n${topImpressions.map((t) => `${t.label} -- ${t.description}`).join("\n")}\n\n#Aneurasync #分身レポート`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  }, [topImpressions]);

  /* ── リンクコピー ── */
  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  /* ══ レポートカード（インライン表示） ══ */
  return (
    <div className="space-y-4">
      {/* メインレポート */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: `linear-gradient(135deg, #0D0618, #140A28, #0F0820)`,
        border: `1px solid ${C.rendezvous}20`,
        padding: 24,
      }}>
        {/* タイトル */}
        <p style={{
          fontSize: 10, color: `${C.rendezvous}60`, letterSpacing: "0.1em",
          fontFamily: "monospace", textAlign: "center", marginBottom: 20,
        }}>
          AVATAR DISCOVERY REPORT
        </p>

        {/* 惹かれるタイプ */}
        <div className="space-y-4 mb-8">
          <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
            あなたの分身はこんな人に惹かれます
          </p>
          <div className="space-y-3">
            {topImpressions.map((imp, i) => (
              <motion.div
                key={imp.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: `${imp.color}10`, border: `1px solid ${imp.color}20` }}
              >
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0"
                  style={{
                    background: `radial-gradient(circle, ${imp.color}60, ${imp.color}20)`,
                    filter: "blur(1px)",
                  }}
                />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: imp.color }}>{imp.label}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{imp.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 大切にしていること */}
        {topValues.length > 0 && (
          <div className="space-y-3 mb-6">
            <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
              あなたの分身が大切にしていること
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {topValues.map((val, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  style={{
                    fontSize: 12, padding: "5px 14px", borderRadius: 16,
                    background: `${C.rendezvous}12`, color: `${C.rendezvous}cc`,
                    border: `1px solid ${C.rendezvous}20`,
                  }}
                >
                  {val}
                </motion.span>
              ))}
            </div>
          </div>
        )}

        {/* 注意書き */}
        <p style={{
          fontSize: 9, color: "rgba(255,255,255,0.2)", textAlign: "center",
          marginTop: 16,
        }}>
          * 具体的なマッチング相手の情報は含まれていません
        </p>
      </div>

      {/* シェアボタン */}
      <button
        onClick={() => setModalOpen(true)}
        className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${C.rendezvous}15, ${C.rendezvous}08)`,
          color: C.rendezvous,
          border: `1px solid ${C.rendezvous}25`,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        分身レポートをシェア
      </button>

      {/* シェアモーダル */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}
              onClick={() => setModalOpen(false)}
            />
            <motion.div
              className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              style={{
                background: "#0D0618",
                border: `1px solid ${C.rendezvous}20`,
                boxShadow: `0 -8px 40px ${C.rendezvous}10`,
              }}
            >
              <div className="p-6 space-y-5">
                {/* ヘッダー */}
                <div className="text-center">
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                    分身レポートをシェア
                  </h3>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    友達にも分身を作ってもらおう
                  </p>
                </div>

                {/* シェアボタン群 */}
                <div className="space-y-2">
                  {/* LINE */}
                  <button
                    onClick={handleLineShare}
                    className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                    style={{ background: "#06C755", color: "white" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                    LINEで送る
                  </button>

                  {/* X (Twitter) */}
                  <button
                    onClick={handleXShare}
                    className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                    style={{ background: "#000000", color: "white" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Xでシェア
                  </button>

                  {/* 画像シェア */}
                  <button
                    onClick={handleShare}
                    disabled={generating}
                    className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-opacity"
                    style={{
                      background: `linear-gradient(135deg, ${C.rendezvous}, ${C.pulse})`,
                      color: "white",
                      opacity: generating ? 0.6 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    {generating ? "生成中..." : "画像をシェア"}
                  </button>

                  {/* リンクコピー */}
                  <button
                    onClick={handleCopyLink}
                    className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                    {copied ? "コピーしました！" : "リンクをコピー"}
                  </button>
                </div>

                {/* 閉じる */}
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-full py-3 rounded-xl text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  閉じる
                </button>
              </div>

              {/* Hidden canvas */}
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
