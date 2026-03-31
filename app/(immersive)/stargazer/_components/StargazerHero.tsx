// app/stargazer/_components/StargazerHero.tsx
// Stargazer Hero — 宇宙と地球の境界に立つ観測者
// 上部は宇宙の静けさ、地球の大気圏をグラデーションで表現
"use client";

import { useRef, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { CoreStar, ArchetypeInfo } from "@/types/stargazer";
import ScoreRing from "./ScoreRing";

interface Props {
  coreStar: CoreStar | null;
  archetypeInfo: ArchetypeInfo | null;
  observationCount: number;
  phase: "core" | "stage1" | "stage1_done" | "stage2" | "initial" | "daily" | "completed" | null;
  totalSessions?: number;
}

export default function StargazerHero({
  coreStar,
  archetypeInfo,
  observationCount,
  phase,
  totalSessions = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // スクロールに連動する視差効果
  const earthY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const starsOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.2]);
  const titleY = useTransform(scrollYProgress, [0, 1], [0, 30]);

  // 星座コンステレーションのキャンバス描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h * 0.4;

    // 中心星座の星点
    interface StarPoint {
      x: number;
      y: number;
      r: number;
      alpha: number;
      speed: number;
      phase: number;
    }

    const constellationStars: StarPoint[] = [];
    // 中心の星
    constellationStars.push({
      x: cx,
      y: cy,
      r: 3,
      alpha: 0.9,
      speed: 0.005,
      phase: 0,
    });
    // 内環の星（5つ）
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const dist = 35;
      constellationStars.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: 1.5 + Math.random() * 0.8,
        alpha: 0.5 + Math.random() * 0.3,
        speed: 0.003 + Math.random() * 0.002,
        phase: Math.random() * Math.PI * 2,
      });
    }
    // 外環の星（7つ）
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.5;
      const dist = 60 + Math.random() * 15;
      constellationStars.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: 0.8 + Math.random() * 1,
        alpha: 0.2 + Math.random() * 0.3,
        speed: 0.002 + Math.random() * 0.003,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // 星座の接続線
    const connections: [number, number][] = [];
    for (let i = 1; i <= 5; i++) connections.push([0, i]);
    for (let i = 1; i < 5; i++) connections.push([i, i + 1]);
    connections.push([5, 1]);

    // 背景星
    const bgStars = Array.from({ length: 40 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h * 0.7,
      r: Math.random() * 0.6 + 0.15,
      alpha: Math.random() * 0.15 + 0.02,
      twinkleSpeed: Math.random() * 0.008 + 0.002,
      twinklePhase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;

      // 背景星
      for (const s of bgStars) {
        const twinkle =
          Math.sin(frame * s.twinkleSpeed + s.twinklePhase) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,170,200,${s.alpha * (0.4 + twinkle * 0.6)})`;
        ctx.fill();
      }

      // 星座の接続線 — 繊細で透明
      const lineAlpha = Math.sin(frame * 0.004) * 0.02 + 0.04;
      for (const [a, b] of connections) {
        if (a >= constellationStars.length || b >= constellationStars.length)
          continue;
        const sa = constellationStars[a];
        const sb = constellationStars[b];
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.strokeStyle = `rgba(160,170,200,${lineAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // 星座の星点
      for (const s of constellationStars) {
        const flicker = Math.sin(frame * s.speed + s.phase) * 0.12 + 0.88;
        const alpha = s.alpha * flicker;

        // 外側グロー
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        g.addColorStop(0, `rgba(160,150,120,${alpha * 0.3})`);
        g.addColorStop(0.5, `rgba(160,150,120,${alpha * 0.08})`);
        g.addColorStop(1, "rgba(160,150,120,0)");
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // コア
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140,145,165,${alpha})`;
        ctx.fill();

        // ホワイトセンター
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120,125,150,${alpha * 0.6})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  const hasCoreStar = !!coreStar;
  const confidence = coreStar?.confidenceScore ?? 0;

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* ── 背景レイヤー ── */}
      {/* 深い宇宙の背景 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(250,251,254,1) 0%, rgba(245,246,250,1) 60%, rgba(240,242,248,1) 100%)",
        }}
      />

      {/* 地球の大気圏グロー — 下部に薄い青白い光 */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ y: earthY, height: "40%" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 120% 80% at 50% 100%, rgba(160,170,200,0.12) 0%, rgba(180,190,210,0.06) 40%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 40%, rgba(160,170,200,0.04) 70%, rgba(160,170,200,0.08) 100%)",
          }}
        />
      </motion.div>

      {/* 軌道リング — 精密で静かな装飾 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className="absolute rounded-full border"
          style={{
            width: 280,
            height: 280,
            borderColor: "rgba(160,170,200,0.1)",
            borderWidth: 1,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute rounded-full border"
          style={{
            width: 400,
            height: 400,
            borderColor: "rgba(160,170,200,0.06)",
            borderWidth: 1,
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 180, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* ── コンテンツ ── */}
      <motion.div
        className="relative z-10 flex flex-col items-center justify-center px-4 pt-4 pb-3"
        style={{ opacity: starsOpacity }}
      >
        {/* 星座キャンバス */}
        <div
          className="relative mb-2"
          style={{ width: 100, height: 100 }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: "none" }}
          />
          {/* 中央の精度リング */}
          {hasCoreStar && (
            <div className="absolute inset-0 flex items-center justify-center">
              <ScoreRing
                value={Math.round(confidence * 100)}
                size={140}
                strokeWidth={2}
                color="rgba(160,150,120,0.5)"
                trackColor="rgba(160,170,200,0.08)"
                subLabel="観測精度"
                delay={0.5}
                variant="light"
              />
            </div>
          )}
        </div>

        {/* タイトル */}
        <motion.div
          className="text-center"
          style={{ y: titleY }}
        >
          {hasCoreStar ? (
            <>
              {/* タイプエモジ */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 120, delay: 0.3 }}
                className="mb-4"
              >
                <span
                  className="text-4xl inline-block"
                  style={{
                    filter: "drop-shadow(0 0 20px rgba(160,150,120,0.15))",
                  }}
                >
                  {archetypeInfo?.emoji || "⭐"}
                </span>
              </motion.div>

              {/* タイプ名 */}
              <motion.h1
                className="font-display text-4xl sm:text-5xl font-semibold mb-2"
                style={{
                  color: "rgba(30,35,55,0.88)",
                  textShadow: "0 0 40px rgba(160,150,120,0.08)",
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                {coreStar.archetypeLabel || "観測中..."}
              </motion.h1>

              {/* コード */}
              <motion.p
                className="font-mono-sg text-xs tracking-[0.2em] uppercase mb-6"
                style={{ color: "rgba(120,125,140,0.5)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.25 }}
              >
                {coreStar.archetypeCode}
              </motion.p>

              {/* 説明 */}
              {archetypeInfo?.description && (
                <motion.p
                  className="font-display text-lg sm:text-xl italic max-w-md mx-auto leading-relaxed"
                  style={{ color: "rgba(100,105,130,0.65)" }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7, duration: 0.4 }}
                >
                  {archetypeInfo.description}
                </motion.p>
              )}

              {/* 観測件数 */}
              <motion.div
                className="mt-8 flex items-center justify-center gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.25 }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "rgba(160,150,120,0.5)",
                      animation: "sg-glow-pulse 3s ease-in-out infinite",
                    }}
                  />
                  <span className="font-body text-xs" style={{ color: "rgba(120,125,140,0.5)" }}>
                    {observationCount}件の観測
                  </span>
                </div>
                {archetypeInfo?.keywords && (
                  <div className="flex gap-1.5">
                    {archetypeInfo.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="font-body text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(160,170,200,0.06)",
                          border: "1px solid rgba(160,170,200,0.12)",
                          color: "rgba(120,125,140,0.6)",
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
          ) : (
            <>
              {/* 未観測状態 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1 }}
                className="text-center"
              >
                <div className="mb-6">
                  <span
                    className="text-5xl inline-block"
                    style={{
                      filter: "drop-shadow(0 0 30px rgba(160,150,120,0.1))",
                      animation: "sg-float 6s ease-in-out infinite",
                    }}
                  >
                    🔭
                  </span>
                </div>
                <h1
                  className="font-display text-3xl sm:text-4xl font-semibold mb-3"
                  style={{ color: "rgba(30,35,55,0.85)" }}
                >
                  {totalSessions === 0
                    ? "あなたを知る旅が、ここから始まる。"
                    : totalSessions <= 2
                    ? "まだ見えていない自分がある"
                    : "今日のあなたを記録する"}
                </h1>
                <p
                  className="font-body text-base max-w-sm mx-auto leading-relaxed"
                  style={{ color: "rgba(100,105,130,0.55)" }}
                >
                  {phase === "core" || phase === "initial"
                    ? "いくつかの質問を通じて、あなたの性格や判断の傾向を読み解きます"
                    : totalSessions > 2
                    ? "前回からの変化と、今の気分を観測します"
                    : "質問に答えるほど、あなたの輪郭がはっきりしていきます"}
                </p>
              </motion.div>
            </>
          )}
        </motion.div>

        {/* 下方向への視線誘導 */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className="w-5 h-8 rounded-full border"
            style={{ borderColor: "rgba(160,170,200,0.2)" }}
          >
            <motion.div
              className="w-1 h-2 rounded-full mx-auto mt-1.5"
              style={{ background: "rgba(160,170,200,0.35)" }}
              animate={{ opacity: [0.3, 0.8, 0.3], y: [0, 4, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </motion.div>

      {/* ── 下部への接続グラデーション ── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(250,251,254,0.95) 100%)",
        }}
      />
    </div>
  );
}
