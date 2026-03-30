"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GenomeCardData } from "@/lib/genome/cardTypes";
import { getCardTheme, getArchetypeDef } from "@/lib/genome/archetypeThemes";

/* ── カラーパレット（Home統一） ── */
const C = {
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

/* ── パーソナルカラー季節ごとのグラデーション ── */
const SEASON_GRADIENTS: Record<string, { bg: string[]; accent: string }> = {
  spring: { bg: ["#FDF6E3", "#FDEBD0", "#FFF5E1", "#FFF8E7"], accent: "#D4A017" },
  summer: { bg: ["#F0EEF6", "#E8E3F0", "#DDD8EC", "#F5F2FA"], accent: "#8B7CB8" },
  autumn: { bg: ["#FBF0E4", "#F5E0C4", "#EDD5B3", "#FFF2E3"], accent: "#C67B30" },
  winter: { bg: ["#E8EFF8", "#DCE8F5", "#D0E0F0", "#EBF2FA"], accent: "#4B7BB5" },
};

/* ── 8タイプ印象ラベル ── */
const IMPRESSION_LABELS: Record<string, string> = {
  lumiere: "Lumiere -- 光のような透明感",
  bloom: "Bloom -- 咲き誇る華やかさ",
  ember: "Ember -- 内に秘めた熱",
  frost: "Frost -- 研ぎ澄まされた静謐",
  velvet: "Velvet -- 柔らかな深み",
  prism: "Prism -- 多面的な輝き",
  terra: "Terra -- 地に根ざした安定感",
  aurora: "Aurora -- 揺らめく神秘",
};

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

/* ── 季節キー正規化 ── */
function normalizeSeason(season: string | null | undefined): string {
  if (!season) return "spring";
  const s = season.toLowerCase();
  if (s.includes("spring") || s.includes("スプリング") || s.includes("春")) return "spring";
  if (s.includes("summer") || s.includes("サマー") || s.includes("夏")) return "summer";
  if (s.includes("autumn") || s.includes("fall") || s.includes("オータム") || s.includes("秋")) return "autumn";
  if (s.includes("winter") || s.includes("ウィンター") || s.includes("冬")) return "winter";
  return "spring";
}

/* ══════════════════════════════════════════════
   GenomeCardShare — シェアカード生成コンポーネント
   ══════════════════════════════════════════════ */

interface Props {
  card: GenomeCardData;
  compact?: boolean;
  /** 印象タイプ（lumiere/bloom/etc） */
  impressionType?: string | null;
}

export default function GenomeCardShare({ card, compact, impressionType }: Props) {
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = getCardTheme(card.archetypeLabel);
  const def = getArchetypeDef(card.archetypeLabel);
  const season = normalizeSeason(card.pcSeason);
  const seasonPalette = SEASON_GRADIENTS[season] ?? SEASON_GRADIENTS.spring;
  const topTraits = card.topTraits?.slice(0, 3) ?? [];
  const styleDna = card.topStyleLanes?.slice(0, 3) ?? [];
  const impressionLabel = impressionType
    ? IMPRESSION_LABELS[impressionType] ?? impressionType
    : null;

  /* ── シェアURL取得 ── */
  const fetchShareUrl = useCallback(async () => {
    try {
      const res = await fetch(`/api/genome-card/share?userId=${card.userId}`);
      const data = await res.json();
      if (data.ok && data.shareUrl) {
        setShareUrl(data.shareUrl);
        return data.shareUrl as string;
      }
    } catch (e) {
      console.warn("[GenomeCardShare] share URL fetch failed:", e);
    }
    return null;
  }, [card.userId]);

  /* ── Canvas画像生成（1080x1920 Instagram Stories サイズ） ── */
  const generateImage = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = compact ? 540 : 1080;
    const h = compact ? 960 : 1920;
    const scale = w / 1080;
    canvas.width = w;
    canvas.height = h;

    // 背景: 季節グラデーション
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, seasonPalette.bg[0]);
    bgGrad.addColorStop(0.35, seasonPalette.bg[1]);
    bgGrad.addColorStop(0.65, seasonPalette.bg[2]);
    bgGrad.addColorStop(1, seasonPalette.bg[3]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 装飾: 大きなソフトグロー
    const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, w * 0.5);
    glowGrad.addColorStop(0, `${seasonPalette.accent}20`);
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // 上部ブランドロゴ
    ctx.textAlign = "center";
    ctx.fillStyle = `${seasonPalette.accent}60`;
    ctx.font = `${14 * scale}px monospace`;
    ctx.fillText("Aneurasync", w / 2, 80 * scale);

    // コンステレーション名（大きく）
    ctx.fillStyle = C.t1;
    ctx.font = `700 ${36 * scale}px sans-serif`;
    ctx.fillText(`${theme.symbol} ${theme.name}`, w / 2, 200 * scale);

    // 英名
    ctx.fillStyle = `${C.t3}90`;
    ctx.font = `400 ${18 * scale}px monospace`;
    ctx.fillText(theme.english, w / 2, 250 * scale);

    // パーソナルカラー季節バッジ
    if (card.pcSeason) {
      const badgeY = 320 * scale;
      const badgeText = card.pcSeason;
      const bw = ctx.measureText(badgeText).width + 40 * scale;
      ctx.fillStyle = `${seasonPalette.accent}15`;
      ctx.beginPath();
      ctx.roundRect(w / 2 - bw / 2, badgeY - 16 * scale, bw, 32 * scale, 16 * scale);
      ctx.fill();
      ctx.strokeStyle = `${seasonPalette.accent}40`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = seasonPalette.accent;
      ctx.font = `500 ${14 * scale}px sans-serif`;
      ctx.fillText(badgeText, w / 2, badgeY + 5 * scale);
    }

    // 中央: 性格特性 Top 3
    const traitsStartY = 420 * scale;
    ctx.fillStyle = `${C.t4}80`;
    ctx.font = `500 ${12 * scale}px monospace`;
    ctx.fillText("PERSONALITY TRAITS", w / 2, traitsStartY);

    topTraits.forEach((trait, i) => {
      const ty = traitsStartY + 50 * scale + i * 70 * scale;
      // バー背景
      const barW = 500 * scale;
      const barH = 8 * scale;
      const barX = (w - barW) / 2;
      ctx.fillStyle = `${C.t4}30`;
      ctx.beginPath();
      ctx.roundRect(barX, ty + 20 * scale, barW, barH, 4 * scale);
      ctx.fill();
      // バー実体
      ctx.fillStyle = seasonPalette.accent;
      ctx.beginPath();
      ctx.roundRect(barX, ty + 20 * scale, barW * (trait.score / 100), barH, 4 * scale);
      ctx.fill();
      // ラベル
      ctx.fillStyle = C.t1;
      ctx.font = `600 ${16 * scale}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(trait.label, barX, ty + 10 * scale);
      ctx.textAlign = "right";
      ctx.fillStyle = C.t3;
      ctx.font = `500 ${14 * scale}px monospace`;
      ctx.fillText(`${Math.round(trait.score)}`, barX + barW, ty + 10 * scale);
      ctx.textAlign = "center";
    });

    // スタイルDNA
    const styleY = traitsStartY + 50 * scale + topTraits.length * 70 * scale + 60 * scale;
    if (styleDna.length > 0) {
      ctx.fillStyle = `${C.t4}80`;
      ctx.font = `500 ${12 * scale}px monospace`;
      ctx.fillText("STYLE DNA", w / 2, styleY);

      const laneStr = styleDna.join("  /  ");
      ctx.fillStyle = C.t2;
      ctx.font = `500 ${18 * scale}px sans-serif`;
      ctx.fillText(laneStr, w / 2, styleY + 40 * scale);
    }

    // 印象タイプ
    const impY = styleY + (styleDna.length > 0 ? 100 * scale : 0);
    if (impressionLabel) {
      ctx.fillStyle = `${C.t4}80`;
      ctx.font = `500 ${12 * scale}px monospace`;
      ctx.fillText("IMPRESSION TYPE", w / 2, impY);
      ctx.fillStyle = seasonPalette.accent;
      ctx.font = `500 ${20 * scale}px sans-serif`;
      ctx.fillText(impressionLabel, w / 2, impY + 40 * scale);
    }

    // サマリーライン
    if (card.summaryLine) {
      const sumY = h * 0.72;
      ctx.fillStyle = `${C.t2}dd`;
      ctx.font = `300 ${20 * scale}px sans-serif`;
      const lines = wrapText(ctx, card.summaryLine, w - 160 * scale);
      lines.forEach((line, i) => {
        ctx.fillText(line, w / 2, sumY + i * 34 * scale);
      });
    }

    // 名前
    if (card.displayName) {
      ctx.fillStyle = `${C.t1}cc`;
      ctx.font = `500 ${22 * scale}px sans-serif`;
      ctx.fillText(card.displayName, w / 2, h * 0.85);
    }

    // CTA
    ctx.fillStyle = `${seasonPalette.accent}90`;
    ctx.font = `500 ${16 * scale}px sans-serif`;
    ctx.fillText("あなたの分身を見る", w / 2, h * 0.91);

    // ウォーターマーク
    ctx.fillStyle = `${C.t4}50`;
    ctx.font = `${12 * scale}px monospace`;
    ctx.fillText("Aneurasync -- Genome Card", w / 2, h - 40 * scale);

    return canvas.toDataURL("image/png");
  }, [card, theme, compact, seasonPalette, topTraits, styleDna, impressionLabel]);

  /* ── シェアアクション ── */
  const handleShare = useCallback(async () => {
    setGenerating(true);
    try {
      const dataUrl = generateImage();
      if (!dataUrl) return;

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "genome-card.png", { type: "image/png" });

      if (navigator.share) {
        const url = shareUrl ?? await fetchShareUrl();
        await navigator.share({
          title: `${card.displayName ?? ""}のGenome Card`,
          text: `${theme.name} -- ${theme.english}\nAneurasyncで自分の分身を見てみよう`,
          files: [file],
          url: url ?? undefined,
        });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "genome-card.png";
        a.click();
      }
    } catch {
      // User cancelled
    } finally {
      setGenerating(false);
    }
  }, [generateImage, card.displayName, theme, shareUrl, fetchShareUrl]);

  /* ── LINE シェア ── */
  const handleLineShare = useCallback(async () => {
    const url = shareUrl ?? await fetchShareUrl();
    const text = `${card.displayName ?? "私"}のGenome Card\n${theme.symbol} ${theme.name} -- ${theme.english}\n\n${url ?? window.location.origin + "/genome-card/connect/" + card.userId}`;
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
  }, [card, theme, shareUrl, fetchShareUrl]);

  /* ── X(Twitter) シェア ── */
  const handleXShare = useCallback(async () => {
    const url = shareUrl ?? await fetchShareUrl();
    const text = `${theme.symbol} ${theme.name}\n${card.summaryLine ?? ""}\n\n#Aneurasync #GenomeCard`;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url ?? "")}`;
    window.open(xUrl, "_blank");
  }, [card, theme, shareUrl, fetchShareUrl]);

  /* ── リンクコピー ── */
  const [copied, setCopied] = useState(false);
  const handleCopyLink = useCallback(async () => {
    const url = shareUrl ?? await fetchShareUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl, fetchShareUrl]);

  /* ══ インラインプレビュー ══ */
  return (
    <>
      {/* シェアボタン */}
      <button
        onClick={() => setShareModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${seasonPalette.accent}15, ${seasonPalette.accent}08)`,
          color: seasonPalette.accent,
          border: `1px solid ${seasonPalette.accent}30`,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        カードをシェア
      </button>

      {/* シェアモーダル */}
      <AnimatePresence>
        {shareModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}
              onClick={() => setShareModalOpen(false)}
            />
            <motion.div
              className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              style={{ background: C.s1, border: `1px solid ${C.s2}`, boxShadow: "0 -8px 40px rgba(0,0,0,0.1)" }}
            >
              <div className="p-6 space-y-5">
                {/* ヘッダー */}
                <div className="text-center">
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>Genome Cardをシェア</h3>
                  <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
                    あなたの分身を友達に見せよう
                  </p>
                </div>

                {/* プレビュー（小さいカード） */}
                <div
                  className="rounded-xl overflow-hidden mx-auto"
                  style={{
                    width: 200,
                    height: 356,
                    background: `linear-gradient(135deg, ${seasonPalette.bg[0]}, ${seasonPalette.bg[2]})`,
                    border: `1px solid ${seasonPalette.accent}20`,
                    padding: 12,
                  }}
                >
                  <div className="text-center space-y-2">
                    <p style={{ fontSize: 7, color: `${seasonPalette.accent}80`, fontFamily: "monospace" }}>Aneurasync</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{theme.symbol} {theme.name}</p>
                    <p style={{ fontSize: 8, color: C.t3, fontFamily: "monospace" }}>{theme.english}</p>
                    {card.pcSeason && (
                      <span style={{
                        display: "inline-block", fontSize: 8, padding: "2px 8px", borderRadius: 10,
                        background: `${seasonPalette.accent}15`, color: seasonPalette.accent,
                        border: `1px solid ${seasonPalette.accent}30`,
                      }}>{card.pcSeason}</span>
                    )}
                    <div className="space-y-1 mt-2">
                      {topTraits.map((t) => (
                        <div key={t.id} className="flex items-center gap-1">
                          <span style={{ fontSize: 7, color: C.t2, width: 50, textAlign: "right", flexShrink: 0 }}>{t.label}</span>
                          <div style={{ flex: 1, height: 3, borderRadius: 2, background: `${C.t4}30`, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${t.score}%`, borderRadius: 2, background: seasonPalette.accent, opacity: 0.7 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {styleDna.length > 0 && (
                      <p style={{ fontSize: 7, color: C.t3, marginTop: 6 }}>{styleDna.join(" / ")}</p>
                    )}
                    <p style={{ fontSize: 7, color: `${seasonPalette.accent}80`, marginTop: "auto", paddingTop: 8 }}>
                      あなたの分身を見る
                    </p>
                  </div>
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

                  {/* 画像シェア / ダウンロード */}
                  <button
                    onClick={handleShare}
                    disabled={generating}
                    className="w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-opacity"
                    style={{
                      background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
                      color: "white",
                      opacity: generating ? 0.6 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    {generating ? "生成中..." : "カード画像をシェア"}
                  </button>

                  {/* リンクコピー */}
                  <button
                    onClick={handleCopyLink}
                    className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                    style={{ background: C.s2, color: C.t1 }}
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
                  onClick={() => setShareModalOpen(false)}
                  className="w-full py-3 rounded-xl text-sm font-medium"
                  style={{ color: C.t3 }}
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
    </>
  );
}
