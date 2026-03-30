"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { safeLSSet } from "@/lib/safeLocalStorage";
import GenomeBackground from "@/components/genome/GenomeBackground";
import GenomeLoadingSkeleton from "./_components/GenomeLoadingSkeleton";
import OverviewTab from "./_components/OverviewTab";
import DnaTab from "./_components/DnaTab";
import Dna3dTab from "./_components/Dna3dTab";
import TensionTab from "./_components/TensionTab";
import MirrorTab from "./_components/MirrorTab";
import GrowthTab from "./_components/GrowthTab";

import type {
  PersonaGenome,
  GenomeVisualizationData,
  MirrorModeResult,
  EvolutionTimeline,
} from "@/lib/aneurasync/personaGenome";

/* ─── Types ─── */

type GenomeTabKey = "overview" | "dna3d" | "dna" | "tension" | "mirror" | "growth";
type LoadState = "loading" | "loaded" | "error";

interface GenomeApiResponse {
  ok: boolean;
  genome: PersonaGenome;
  visualization: GenomeVisualizationData;
  mirror: MirrorModeResult;
  evolution: EvolutionTimeline;
}

/* ─── Constants ─── */

const TITLE_STYLE = { fontFamily: "'Cormorant Garamond', serif" };

const TABS: Array<{ key: GenomeTabKey; label: string; icon: string; desc: string }> = [
  { key: "overview", label: "概要", icon: "🧬", desc: "全体像" },
  { key: "dna3d", label: "3D DNA", icon: "🌐", desc: "立体可視化" },
  { key: "tension", label: "テンション", icon: "⚡", desc: "矛盾と調和" },
  { key: "mirror", label: "ミラー", icon: "🪞", desc: "自他比較" },
  { key: "growth", label: "進化", icon: "🌀", desc: "変化の軌跡" },
];

/* ─── Hooks ─── */

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/* ─── Main Component ─── */

function GenomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = String(searchParams.get("tab") ?? "").trim() as GenomeTabKey;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab : "overview";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<GenomeApiResponse | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const reducedMotion = useReducedMotion();
  const touchStartX = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Check sessionStorage cache first
    const cached = sessionStorage.getItem("genome_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { data: GenomeApiResponse; ts: number };
        if (Date.now() - parsed.ts < 5 * 60 * 1000) {
          setData(parsed.data);
          setLoadState("loaded");
          return;
        }
      } catch {
        // ignore parse errors
      }
    }

    fetch("/api/aneurasync/genome", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: GenomeApiResponse) => {
        if (d.ok) {
          setData(d);
          setLoadState("loaded");
          sessionStorage.setItem("genome_cache", JSON.stringify({ data: d, ts: Date.now() }));
        } else {
          setLoadState("error");
        }
      })
      .catch(() => {
        // Fallback: use preview data so UI is visible without auth
        setData(PREVIEW_DATA);
        setLoadState("loaded");
      });
  }, []);

  // Check first visit for welcome hero
  useEffect(() => {
    if (!localStorage.getItem("genome_visited")) {
      setShowWelcome(true);
    }
  }, []);

  const dismissWelcome = () => {
    safeLSSet("genome_visited", "1");
    setShowWelcome(false);
  };

  // Swipe gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const threshold = 60;
      if (Math.abs(deltaX) < threshold) return;
      const currentIdx = TABS.findIndex((t) => t.key === tab);
      if (deltaX < 0 && currentIdx < TABS.length - 1) {
        setTab(TABS[currentIdx + 1].key);
      } else if (deltaX > 0 && currentIdx > 0) {
        setTab(TABS[currentIdx - 1].key);
      }
      touchStartX.current = null;
    },
    [tab],
  );

  // Keyboard navigation for tabs
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      let nextIdx: number | null = null;
      if (e.key === "ArrowRight") {
        nextIdx = idx < TABS.length - 1 ? idx + 1 : 0;
      } else if (e.key === "ArrowLeft") {
        nextIdx = idx > 0 ? idx - 1 : TABS.length - 1;
      }
      if (nextIdx !== null) {
        e.preventDefault();
        setTab(TABS[nextIdx].key);
        tabRefs.current[nextIdx]?.focus();
      }
    },
    [],
  );

  const setTab = (next: GenomeTabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbfcff] text-slate-900">
      <GenomeBackground />

      {/* Header */}
      <header className="!block sticky top-0 z-30 border-b border-white/80 bg-white/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/aneurasync" className="flex items-center gap-3 no-underline">
            <div className="grid h-11 w-11 place-items-center rounded-[18px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-500 text-sm font-bold text-white shadow-[0_10px_24px_rgba(139,92,246,0.3)]">
              An
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#5543d8]" style={TITLE_STYLE}>
                Aneurasync
              </div>
              <div className="text-[11px] text-slate-400">Persona Genome</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {loadState === "loaded" && data && (
              <span className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-1 text-xs font-black text-white shadow-[0_8px_20px_rgba(168,85,247,0.25)]">
                {data.genome.completeness}%
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-2xl lg:max-w-4xl px-6 pb-32 pt-10 sm:px-8 lg:px-10">
        {/* Page title */}
        <motion.div
          className="flex items-center justify-center gap-3 text-center"
          initial={reducedMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
        >
          <Link
            href="/aneurasync"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-400 no-underline transition hover:bg-white/70 hover:text-slate-700"
          >
            ←
          </Link>
          <h1
            className="text-[2rem] font-semibold tracking-tight text-slate-900 sm:text-[2.4rem]"
            style={TITLE_STYLE}
          >
            Persona Genome
          </h1>
        </motion.div>

        {/* Welcome hero (first visit only) */}
        {showWelcome && data && (
          <motion.div
            className="mt-6 rounded-[28px] border border-violet-200/50 bg-gradient-to-br from-violet-50/80 via-white/90 to-fuchsia-50/60 px-7 py-8 text-center shadow-[0_16px_40px_rgba(139,92,246,0.12)] backdrop-blur-xl"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
          >
            <div className="text-4xl">🧬</div>
            <h2
              className="mt-3 text-xl font-semibold text-slate-900 sm:text-2xl"
              style={TITLE_STYLE}
            >
              あなたのゲノムへようこそ
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {data.visualization.overallLabel} — 完成度 {data.genome.completeness}%
            </p>
            <button
              type="button"
              onClick={dismissWelcome}
              className="mt-5 rounded-[18px] bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(139,92,246,0.25)] transition hover:shadow-[0_16px_40px_rgba(139,92,246,0.35)]"
            >
              探索を始める
            </button>
          </motion.div>
        )}

        {/* Tab bar with animated indicator */}
        <div className="mt-8 grid grid-cols-5 gap-2" role="tablist">
          {TABS.map((item, idx) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                ref={(el) => { tabRefs.current[idx] = el; }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(item.key)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`relative rounded-[22px] border px-3 py-3.5 text-center transition-all focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:outline-none ${
                  !active ? "hover:bg-white/50" : ""
                }`}
                style={{
                  borderColor: active ? "rgba(148,163,184,0.2)" : "transparent",
                  backgroundColor: active ? "rgba(255,255,255,0.85)" : "transparent",
                  boxShadow: active
                    ? "0 14px 34px rgba(148,163,184,0.16)"
                    : "none",
                }}
              >
                {active && (
                  <motion.div
                    layoutId="genome-tab-indicator"
                    className="absolute inset-0 rounded-[22px] border border-slate-200/40 bg-white shadow-[0_14px_34px_rgba(148,163,184,0.16)]"
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 350, damping: 30 }
                    }
                    style={{ zIndex: -1 }}
                  />
                )}
                <div className="text-lg">{item.icon}</div>
                <div
                  className={`mt-1.5 text-xs font-semibold ${
                    active ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </div>
                <div
                  className={`mt-0.5 text-[10px] ${
                    active ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {item.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="mt-8"
          role="tabpanel"
          aria-label={TABS.find((t) => t.key === tab)?.label}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {loadState === "loading" && <GenomeLoadingSkeleton />}

          {loadState === "error" && (
            <div className="rounded-[32px] border border-white/85 bg-white/76 px-7 py-16 text-center shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl">
              <div className="text-4xl">⚠️</div>
              <div
                className="mt-4 text-xl font-semibold text-slate-800"
                style={TITLE_STYLE}
              >
                データの読み込みに失敗しました
              </div>
              <p className="mt-2 text-sm text-slate-500">
                ログインが必要か、ネットワークエラーが発生しました
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-5 rounded-[18px] bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
              >
                再読み込み
              </button>
            </div>
          )}

          {loadState === "loaded" && data && (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
              >
                {tab === "overview" && (
                  <OverviewTab
                    genome={data.genome}
                    visualization={data.visualization}
                  />
                )}
                {tab === "dna3d" && (
                  <Dna3dTab
                    visualization={data.visualization}
                    completeness={data.genome.completeness}
                  />
                )}
                {tab === "dna" && (
                  <DnaTab visualization={data.visualization} />
                )}
                {tab === "tension" && (
                  <TensionTab visualization={data.visualization} />
                )}
                {tab === "mirror" && (
                  <MirrorTab mirror={data.mirror} />
                )}
                {tab === "growth" && (
                  <GrowthTab evolution={data.evolution} />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  );
}

export default function GenomePageClient() {
  return (
    <Suspense>
      <GenomePageInner />
    </Suspense>
  );
}

/* ─── Preview fallback data (used when API is unavailable) ─── */

const PREVIEW_DATA: GenomeApiResponse = {
  ok: true,
  genome: {
    userId: "preview",
    assembledAt: new Date().toISOString(),
    physical: {
      bodyBase: "natural", bodySubtype: "soft_natural", bodyAxes: { vertical_line: 0.6, shoulder_width: 0.5, ribcage_width: 0.4 },
      bodyConfidence: 0.75, cfv: null, pcSeason4: "autumn", pcSeason16: null, pcAxes: null, pcConfidence: 0.7,
      faceShape: "oval", eyeShape: "almond", browShape: "arch", noseImpression: null, mouthImpression: null, faceImpression: null,
      hasFace: true, hasBody: true, hasPosture: true, hasPC: true,
    },
    personality: {
      dimensions: [
        { dimension: "cautious_vs_bold", category: "decision", score: 0.4, confidence: 0.85, evidenceCount: 12 },
        { dimension: "introvert_vs_extrovert", category: "social", score: -0.3, confidence: 0.78, evidenceCount: 9 },
        { dimension: "analytical_vs_intuitive", category: "cognition", score: 0.2, confidence: 0.72, evidenceCount: 7 },
        { dimension: "quality_vs_quantity", category: "values", score: -0.6, confidence: 0.9, evidenceCount: 15 },
        { dimension: "minimal_vs_maximal", category: "style", score: -0.4, confidence: 0.65, evidenceCount: 5 },
      ],
      insights: [], syncLevel: null, archetypeCode: "PEA", archetypeLabel: "指揮官",
      typeKey: "PEA_cautious_vs_bold", confidence: 0.78,
      topDimensions: [
        { id: "quality_vs_quantity", label: "品質重視↔コスパ重視", score: -0.6, confidence: 0.9 },
        { id: "cautious_vs_bold", label: "慎重↔大胆", score: 0.4, confidence: 0.85 },
        { id: "introvert_vs_extrovert", label: "内向的↔外向的", score: -0.3, confidence: 0.78 },
      ],
      observationCount: 43, hasPersonality: true, hasDimensions: true, hasArchetype: true,
    },
    behavioral: {
      taste7d: { laneTop3: ["minimal", "classic", "natural"], colorAxis: "low_sat", silhouetteAxis: "relaxed" },
      taste30d: { laneTop3: ["minimal", "natural", "casual"], colorAxis: "neutral", silhouetteAxis: "neutral" },
      taste180d: null, topStyleTags: ["minimal", "classic"],
      silhouettePreference: { relaxed: 0.6, neutral: 0.3 }, materialPreference: { cotton: 0.5, linen: 0.3 },
      dominantColorAxis: "low_sat", dominantSilhouetteAxis: "relaxed",
      totalSwipeCount: 87, likeRate: 0.42, saveRate: 0.18, purchaseIntentRate: 0.05,
      hasTaste: true, hasSwipeHistory: true,
    },
    social: { avgPeopleFitScore: 72, matchCount: 5, feedbackSaveRate: 0.35, feedbackSkipRate: 0.45, hasSocial: true },
    completeness: 71,
    layerCompleteness: { physical: 100, personality: 100, behavioral: 50, social: 33 },
  },
  visualization: {
    strands: [
      {
        id: "physical", label: "フィジカル", color: "#6366f1",
        basePairs: [
          { id: "phys.vertical_line", label: "直線的↔曲線的", category: "身体", value: 0.6, confidence: 0.75, leftLabel: "直線的", rightLabel: "曲線的" },
          { id: "phys.shoulder_width", label: "肩幅", category: "身体", value: 0.5, confidence: 0.75, leftLabel: "狭い", rightLabel: "広い" },
          { id: "phys.face_shape", label: "輪郭", category: "フェイス", value: 0.65, confidence: 0.8, leftLabel: "丸い", rightLabel: "シャープ" },
          { id: "phys.eye_shape", label: "目の形状", category: "フェイス", value: 0.72, confidence: 0.85, leftLabel: "丸い", rightLabel: "切れ長" },
          { id: "phys.pc_warm", label: "カラー暖かさ", category: "カラー", value: 0.7, confidence: 0.7, leftLabel: "クール", rightLabel: "ウォーム" },
        ],
      },
      {
        id: "personality", label: "パーソナリティ", color: "#8b5cf6",
        basePairs: [
          { id: "pers.quality_vs_quantity", label: "品質重視↔コスパ重視", category: "次元", value: 0.2, confidence: 0.9, leftLabel: "品質重視", rightLabel: "コスパ重視" },
          { id: "pers.cautious_vs_bold", label: "慎重↔大胆", category: "次元", value: 0.7, confidence: 0.85, leftLabel: "慎重", rightLabel: "大胆" },
          { id: "pers.introvert_vs_extrovert", label: "内向的↔外向的", category: "次元", value: 0.35, confidence: 0.78, leftLabel: "内向的", rightLabel: "外向的" },
          { id: "pers.analytical_vs_intuitive", label: "分析的↔直感的", category: "次元", value: 0.6, confidence: 0.72, leftLabel: "分析的", rightLabel: "直感的" },
          { id: "pers.minimal_vs_maximal", label: "シンプル↔華やか", category: "次元", value: 0.3, confidence: 0.65, leftLabel: "シンプル", rightLabel: "華やか" },
          { id: "pers.function_vs_expression", label: "機能重視↔表現重視", category: "次元", value: 0.55, confidence: 0.7, leftLabel: "機能重視", rightLabel: "表現重視" },
        ],
      },
      {
        id: "behavioral", label: "ビヘイビア", color: "#ec4899",
        basePairs: [
          { id: "beh.color_axis", label: "カラー傾向", category: "テイスト", value: 0.4, confidence: 0.6, leftLabel: "ダーク", rightLabel: "ライト" },
          { id: "beh.silhouette", label: "シルエット", category: "テイスト", value: 0.6, confidence: 0.6, leftLabel: "タイト", rightLabel: "オーバーサイズ" },
          { id: "beh.like_rate", label: "いいね率", category: "行動", value: 0.42, confidence: 0.7, leftLabel: "低い", rightLabel: "高い" },
          { id: "beh.save_rate", label: "保存率", category: "行動", value: 0.18, confidence: 0.7, leftLabel: "低い", rightLabel: "高い" },
        ],
      },
      {
        id: "social", label: "ソーシャル", color: "#14b8a6",
        basePairs: [
          { id: "soc.fit_score", label: "フィットスコア", category: "マッチ", value: 0.72, confidence: 0.5, leftLabel: "低い", rightLabel: "高い" },
          { id: "soc.save_rate", label: "他者からの保存率", category: "フィードバック", value: 0.35, confidence: 0.4, leftLabel: "低い", rightLabel: "高い" },
          { id: "soc.match_volume", label: "マッチ量", category: "マッチ", value: 0.33, confidence: 0.3, leftLabel: "少ない", rightLabel: "多い" },
        ],
      },
    ],
    dominantTraits: [
      { id: "phys.eye_shape", label: "目の形状", category: "フェイス", value: 0.72, confidence: 0.85, leftLabel: "丸い", rightLabel: "切れ長" },
      { id: "pers.quality_vs_quantity", label: "品質重視", category: "次元", value: 0.8, confidence: 0.9, leftLabel: "品質重視", rightLabel: "コスパ重視" },
      { id: "pers.cautious_vs_bold", label: "大胆さ", category: "次元", value: 0.7, confidence: 0.85, leftLabel: "慎重", rightLabel: "大胆" },
      { id: "soc.fit_score", label: "フィットスコア", category: "マッチ", value: 0.72, confidence: 0.5, leftLabel: "低い", rightLabel: "高い" },
      { id: "phys.pc_warm", label: "カラー暖かさ", category: "カラー", value: 0.7, confidence: 0.7, leftLabel: "クール", rightLabel: "ウォーム" },
    ],
    weakTraits: [
      { id: "beh.save_rate", label: "保存率", category: "行動", value: 0.18, confidence: 0.7, leftLabel: "低い", rightLabel: "高い" },
      { id: "soc.match_volume", label: "マッチ量", category: "マッチ", value: 0.33, confidence: 0.3, leftLabel: "少ない", rightLabel: "多い" },
    ],
    overallLabel: "指揮官 Drive",
    overallDescription: "autumnシーズン / natural体型 / 指揮官 ⚔️",
  },
  mirror: {
    selfPerception: { expressiveness: 0.55, boldness: 0.65, socialOrientation: 0.35, aestheticIntensity: 0.6, warmth: 0.5, practicality: 0.7, consistency: 0.75 },
    othersPerception: { expressiveness: 0.4, boldness: 0.5, socialOrientation: 0.55, aestheticIntensity: 0.7, warmth: 0.65, practicality: 0.45, consistency: 0.6 },
    gaps: [
      { dimension: "practicality", dimensionLabel: "実用性", selfScore: 0.7, othersScore: 0.45, gap: -0.25, gapLabel: "自分が思うより実用的に見えていない", significance: "medium" },
      { dimension: "socialOrientation", dimensionLabel: "社交性", selfScore: 0.35, othersScore: 0.55, gap: 0.2, gapLabel: "思ったより社交的に見えている", significance: "medium" },
      { dimension: "boldness", dimensionLabel: "大胆さ", selfScore: 0.65, othersScore: 0.5, gap: -0.15, gapLabel: "自分が思うより控えめに映っている", significance: "medium" },
      { dimension: "consistency", dimensionLabel: "一貫性", selfScore: 0.75, othersScore: 0.6, gap: -0.15, gapLabel: "一貫性がやや低く見えている", significance: "low" },
    ],
    summary: "最大のギャップは「実用性」— 自分が思うより実用的に見えていません",
    gapScore: 72,
    hasEnoughData: true,
  },
  evolution: {
    snapshots: [
      { capturedAt: "2026-01-13T00:00:00Z", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: { cautious_vs_bold: 0.3, introvert_vs_extrovert: -0.4 }, driftIndex: 0 },
      { capturedAt: "2026-01-20T00:00:00Z", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: { cautious_vs_bold: 0.35, introvert_vs_extrovert: -0.35 }, driftIndex: 0.8 },
      { capturedAt: "2026-01-27T00:00:00Z", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: { cautious_vs_bold: 0.4, introvert_vs_extrovert: -0.3 }, driftIndex: 0.7 },
      { capturedAt: "2026-02-03T00:00:00Z", archetypeCode: "BSA", archetypeLabel: "提言者", traits: { cautious_vs_bold: 0.5, introvert_vs_extrovert: -0.25 }, driftIndex: 2.1 },
      { capturedAt: "2026-02-10T00:00:00Z", archetypeCode: "BSA", archetypeLabel: "提言者", traits: { cautious_vs_bold: 0.45, introvert_vs_extrovert: -0.2 }, driftIndex: 0.9 },
      { capturedAt: "2026-02-17T00:00:00Z", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: { cautious_vs_bold: 0.4, introvert_vs_extrovert: -0.3 }, driftIndex: 1.8 },
      { capturedAt: "2026-02-24T00:00:00Z", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: { cautious_vs_bold: 0.42, introvert_vs_extrovert: -0.28 }, driftIndex: 0.4 },
      { capturedAt: "2026-03-03T00:00:00Z", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: { cautious_vs_bold: 0.4, introvert_vs_extrovert: -0.3 }, driftIndex: 0.3 },
    ],
    cards: [
      { period: "2026-01-W3", periodLabel: "1月第3週", fromSnapshot: { capturedAt: "2026-01-13", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: {}, driftIndex: 0 }, toSnapshot: { capturedAt: "2026-01-20", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: {}, driftIndex: 0.8 }, driftIndex: 0.8, changedDimensions: [{ dimension: "cautious_vs_bold", label: "大胆さ", direction: "increased", delta: 0.05 }], archetypeChanged: false, typeChanged: false, summary: "大胆さがわずかに上昇" },
      { period: "2026-02-W1", periodLabel: "2月第1週", fromSnapshot: { capturedAt: "2026-01-27", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: {}, driftIndex: 0.7 }, toSnapshot: { capturedAt: "2026-02-03", archetypeCode: "BSA", archetypeLabel: "提言者", traits: {}, driftIndex: 2.1 }, driftIndex: 2.1, changedDimensions: [{ dimension: "cautious_vs_bold", label: "大胆さ", direction: "increased", delta: 0.1 }, { dimension: "introvert_vs_extrovert", label: "外向性", direction: "increased", delta: 0.05 }], archetypeChanged: true, typeChanged: true, summary: "タイプがコマンダー → キャプテンに移動" },
      { period: "2026-02-W3", periodLabel: "2月第3週", fromSnapshot: { capturedAt: "2026-02-10", archetypeCode: "BSA", archetypeLabel: "提言者", traits: {}, driftIndex: 0.9 }, toSnapshot: { capturedAt: "2026-02-17", archetypeCode: "PEA", archetypeLabel: "指揮官", traits: {}, driftIndex: 1.8 }, driftIndex: 1.8, changedDimensions: [{ dimension: "cautious_vs_bold", label: "大胆さ", direction: "decreased", delta: -0.05 }], archetypeChanged: true, typeChanged: true, summary: "タイプがキャプテン → コマンダーに回帰" },
    ],
    overallDrift: 7.0,
    stability: 0.65,
    currentStreak: 3,
  },
};
