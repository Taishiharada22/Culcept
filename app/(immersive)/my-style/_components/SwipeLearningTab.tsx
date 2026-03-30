// app/my-style/_components/SwipeLearningTab.tsx
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glassmorphism-design";
import {
  AXIS_DEFINITIONS,
  PHASE_LABELS,
  getAxesForPhase,
  type LearningPhase,
  type AxisDefinition,
  type AxisState,
  type SwipeLearningState,
} from "../_lib/swipeLearningAxes";
import {
  loadLearningState,
  saveLearningState,
  processSwipe,
  getPhaseProgress,
  getTopStyleLanes,
  syncToSavedState,
} from "../_lib/swipeLearningEngine";
import type { SavedState } from "../_lib/types";
import { detectContradictions, type Contradiction } from "../_lib/contradictionDetector";

// ── スタイルレーンのラベル辞書 ──────────────
const LANE_LABELS: Record<string, string> = {
  minimal: "ミニマル",
  street: "ストリート",
  vintage: "ヴィンテージ",
  sporty: "スポーティ",
  luxury: "ラグジュアリー",
  daily: "デイリー",
  elegant: "エレガント",
  workwear: "ワークウェア",
  outdoor: "アウトドア",
  office_casual: "オフィスカジュアル",
  conservative: "コンサバ",
  feminine: "フェミニン",
  clean_casual: "綺麗めカジュアル",
  mannish: "マニッシュ",
  amekaji: "アメカジ",
  korean_fashion: "韓国ファッション",
  trad: "トラッド",
  pale_tone: "淡色系",
  west_coast: "西海岸系",
  french_casual: "フレンチカジュアル",
  preppy: "プレッピー",
  rock: "ロック",
};

// ── カード型 ────────────────────────────
type SwipeCard = {
  card_id: string;
  image_url: string;
  tags?: string[] | null;
};

// ── card_id からタグを推測する ─────────────
// UUID形式のcard_idにはタグ情報がないが、
// "black_denim_only_2" のような名前付きIDからはキーワードが抽出できる
const TAG_KEYWORDS = new Set([
  "black", "white", "gray", "grey", "navy", "blue", "red", "pink", "beige", "cream",
  "brown", "camel", "khaki", "olive", "green", "yellow", "orange", "purple", "lavender",
  "casual", "formal", "street", "minimal", "vintage", "sporty", "elegant", "luxury",
  "military", "bohemian", "preppy", "grunge", "punk", "rock", "gothic", "romantic",
  "feminine", "mannish", "korean", "french", "normcore", "techwear", "workwear",
  "oversized", "slim", "skinny", "fitted", "wide", "cropped", "flare", "tapered",
  "leather", "suede", "denim", "cotton", "linen", "silk", "satin", "wool", "cashmere",
  "knit", "fleece", "nylon", "mesh", "sheer", "velvet", "corduroy", "tweed",
  "stripe", "check", "plaid", "floral", "print", "graphic", "solid", "plain",
  "lace", "ruffle", "pleats", "embroidery",
  "jacket", "blazer", "coat", "trench", "parka", "hoodie", "sweater", "cardigan",
  "shirt", "tshirt", "blouse", "dress", "skirt", "pants", "jeans", "shorts",
  "sneakers", "boots", "heels", "sandals", "loafers",
  "summer", "spring", "autumn", "winter", "layered",
  "clean", "edgy", "chic", "cute", "cool", "simple", "basic", "trendy", "classic", "modern",
  "down", "fur", "hood", "collar", "turtleneck", "logo",
]);

function inferTagsFromCardId(cardId: string): string[] {
  // UUID形式 (e.g. "c300422a_1cea_4afe_823c_efc272c13c5e_2") はスキップ
  if (/^[0-9a-f]{8}[_-][0-9a-f]{4}[_-]/.test(cardId)) return [];
  // "_2" suffix を除去してトークン化
  const cleaned = cardId.replace(/_2(_2)?$/, "");
  const tokens = cleaned.split(/[_\-\s]+/).map((t) => t.toLowerCase());
  return tokens.filter((t) => TAG_KEYWORDS.has(t));
}

// ── Props ────────────────────────────────
type SwipeLearningTabProps = {
  state: SavedState;
  setState: (fn: (prev: SavedState) => SavedState) => void;
  parentState?: SavedState;
};

export default function SwipeLearningTab({ state, setState, parentState }: SwipeLearningTabProps) {
  const [learning, setLearning] = useState<SwipeLearningState>(loadLearningState);
  const [cards, setCards] = useState<SwipeCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exitDir, setExitDir] = useState<"left" | "right" | "up" | null>(null);
  const fetchingRef = useRef(false);
  const [activeContext, setActiveContext] = useState<"default" | "romance" | "friend" | "cocreation">("default");
  const [showContradictions, setShowContradictions] = useState(false);
  const contradictions = useMemo(() => {
    if (!parentState || !learning) return [];
    return detectContradictions(learning, parentState);
  }, [parentState, learning]);

  // カードの取得
  const fetchCards = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/swipe/cards?limit=30");
      const json = await res.json();
      if (json.ok && Array.isArray(json.cards)) {
        setCards((prev) => [...prev, ...json.cards]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // 残りカードが少なくなったら追加取得
  useEffect(() => {
    const remaining = cards.length - cardIndex;
    if (remaining < 5 && !fetchingRef.current) {
      fetchCards();
    }
  }, [cardIndex, cards.length, fetchCards]);

  // スワイプ処理
  const handleSwipe = useCallback(
    (direction: "left" | "right" | "up") => {
      const card = cards[cardIndex];
      if (!card) return;

      setExitDir(direction);

      let tags = Array.isArray(card.tags) ? card.tags.filter(Boolean) : [];
      // タグが空の場合、card_id からキーワードを推測
      if (tags.length === 0) {
        tags = inferTagsFromCardId(card.card_id);
      }
      const newLearning = processSwipe(learning, card.card_id, tags, direction);
      setLearning(newLearning);
      saveLearningState(newLearning);

      // SavedStateへ同期
      const syncData = syncToSavedState(newLearning);
      setState((prev) => ({ ...prev, ...syncData }));

      setTimeout(() => {
        setCardIndex((prev) => prev + 1);
        setExitDir(null);
      }, 280);
    },
    [cards, cardIndex, learning, setState]
  );

  // 現在フェーズの進捗
  const phaseProgress = getPhaseProgress(learning.currentPhase, learning.axes);
  const phaseInfo = PHASE_LABELS[learning.currentPhase];
  const currentPhaseAxes = getAxesForPhase(learning.currentPhase);
  const topLanes = getTopStyleLanes(learning.styleLaneScores, 3);

  // 現在のカードと次のカード
  const visibleCards = cards.slice(cardIndex, cardIndex + 3);
  const hasCards = visibleCards.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Phase Indicator ──────────────── */}
      <PhaseIndicator
        phase={learning.currentPhase}
        phaseInfo={phaseInfo}
        progress={phaseProgress}
        totalSwipes={learning.totalSwipes}
      />

      {/* ── Learning Axes Panel ──────────── */}
      <LearningAxesPanel
        axes={learning.axes}
        definitions={currentPhaseAxes}
        phase={learning.currentPhase}
      />

      {/* ── Context Selector ─────────────── */}
      <div className="mb-3 flex gap-1.5">
        {(["default", "romance", "friend", "cocreation"] as const).map((ctx) => (
          <button
            key={ctx}
            onClick={() => setActiveContext(ctx)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
              activeContext === ctx
                ? "bg-slate-900 text-white"
                : "bg-white/60 text-slate-500 hover:bg-white/80"
            }`}
          >
            {ctx === "default" ? "デフォルト" : ctx === "romance" ? "💕 ロマンス" : ctx === "friend" ? "🤝 フレンド" : "✨ 共創"}
          </button>
        ))}
      </div>

      {/* ── Card Stack ───────────────────── */}
      <GlassCard variant="gradient" className="overflow-hidden p-0">
        <div className="relative px-4 pt-4 pb-20">
          {loading ? (
            <div className="flex aspect-[3/4] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-violet-500" />
            </div>
          ) : hasCards ? (
            <div className="relative w-full aspect-[3/4]">
              <AnimatePresence>
                {visibleCards.map((card, index) => (
                  <SwipeCardView
                    key={`${card.card_id}_${cardIndex + index}`}
                    card={card}
                    index={index}
                    isTop={index === 0}
                    exitDirection={index === 0 ? exitDir : null}
                    onSwipe={handleSwipe}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex aspect-[3/4] flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-6xl mb-4"
              >
                ✨
              </motion.div>
              <p className="text-slate-600 font-bold">すべてスワイプ完了!</p>
              <p className="mt-1 text-sm text-slate-400">新しいカードを読み込み中...</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSwipe("left")}
              disabled={!hasCards}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-xl border-2 border-rose-200 disabled:opacity-40"
            >
              <span className="text-2xl text-rose-500">✕</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSwipe("up")}
              disabled={!hasCards}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 shadow-xl disabled:opacity-40"
            >
              <span className="text-xl text-white">⭐</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSwipe("right")}
              disabled={!hasCards}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-rose-500 shadow-xl disabled:opacity-40"
            >
              <span className="text-2xl text-white">❤️</span>
            </motion.button>
          </div>
        </div>
      </GlassCard>

      {/* ── Learning Results Summary ─────── */}
      {learning.totalSwipes >= 5 && (
        <LearningResultsSummary
          topLanes={topLanes}
          axes={learning.axes}
          totalSwipes={learning.totalSwipes}
        />
      )}

      {/* ── Contradiction Alert ───────────── */}
      {contradictions.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowContradictions(!showContradictions)}
            className="flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-50/50 px-3 py-2 text-xs font-bold text-amber-700 w-full"
          >
            <span>⚡</span>
            <span>{contradictions.length}件の矛盾を検出</span>
            <span className="ml-auto text-amber-400">{showContradictions ? "▲" : "▼"}</span>
          </button>
          {showContradictions && (
            <div className="mt-2 space-y-2">
              {contradictions.slice(0, 3).map((c, i) => (
                <div key={i} className="rounded-lg border border-amber-100 bg-white/80 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      c.severity === "strong" ? "bg-red-400" : c.severity === "notable" ? "bg-amber-400" : "bg-yellow-300"
                    }`} />
                    <span className="text-[11px] font-bold text-slate-700">{c.axisLabel}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{c.insight}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PhaseIndicator ─────────────────────────

function PhaseIndicator({
  phase,
  phaseInfo,
  progress,
  totalSwipes,
}: {
  phase: LearningPhase;
  phaseInfo: { label: string; desc: string };
  progress: { ready: number; total: number; ratio: number };
  totalSwipes: number;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((p) => (
              <div
                key={p}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  p < phase
                    ? "bg-violet-500"
                    : p === phase
                    ? "bg-gradient-to-r from-violet-500 to-pink-500"
                    : "bg-slate-200"
                }`}
              />
            ))}
          </div>
          <div>
            <div className="text-sm font-black text-slate-800">{phaseInfo.label}</div>
            <div className="text-[11px] text-slate-400">{phaseInfo.desc}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-slate-800">{totalSwipes}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">swipes</div>
        </div>
      </div>

      {/* Phase progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span>軸の学習進捗</span>
          <span>{progress.ready}/{progress.total} 軸</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(progress.ratio * 100)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
    </GlassCard>
  );
}

// ── LearningAxesPanel ──────────────────────

function LearningAxesPanel({
  axes,
  definitions,
  phase,
}: {
  axes: Record<string, AxisState>;
  definitions: AxisDefinition[];
  phase: LearningPhase;
}) {
  return (
    <GlassCard className="p-4">
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Learning Axes
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          Phase {phase} で学習中の軸
        </div>
      </div>
      <div className="space-y-2.5">
        {definitions.map((def) => {
          const axisState = axes[def.key] ?? { value: 0, confidence: 0, sampleCount: 0 };
          return (
            <AxisBar key={def.key} definition={def} state={axisState} />
          );
        })}
      </div>
    </GlassCard>
  );
}

function AxisBar({ definition, state }: { definition: AxisDefinition; state: AxisState }) {
  const { value, confidence } = state;
  // バーの位置 (0-100, 50が中心)
  const barPosition = ((value + 1) / 2) * 100;
  const isLearned = confidence > 0.1;

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className={`font-bold ${value < -0.1 && isLearned ? "text-violet-600" : "text-slate-400"}`}>
          {definition.poleALabel}
        </span>
        <span className={`font-bold ${value > 0.1 && isLearned ? "text-pink-600" : "text-slate-400"}`}>
          {definition.poleBLabel}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
        {/* Center marker */}
        <div className="absolute top-0 left-1/2 -translate-x-px h-full w-px bg-slate-300" />

        {/* Value indicator */}
        {isLearned && (
          <motion.div
            className="absolute top-0 h-full rounded-full"
            style={{
              opacity: 0.3 + confidence * 0.7,
            }}
            initial={{ left: "50%", width: 0 }}
            animate={{
              left: value < 0 ? `${barPosition}%` : "50%",
              width: `${Math.abs(value) * 50}%`,
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div
              className={`h-full w-full rounded-full ${
                value < 0
                  ? "bg-gradient-to-r from-violet-500 to-violet-400"
                  : "bg-gradient-to-r from-pink-400 to-pink-500"
              }`}
            />
          </motion.div>
        )}

        {/* Dot indicator */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white shadow-md"
          style={{
            background: isLearned
              ? value < 0
                ? "#8b5cf6"
                : "#ec4899"
              : "#cbd5e1",
          }}
          initial={{ left: "50%" }}
          animate={{ left: `${barPosition}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ── SwipeCardView ──────────────────────────

function SwipeCardView({
  card,
  index,
  isTop,
  exitDirection,
  onSwipe,
}: {
  card: SwipeCard;
  index: number;
  isTop: boolean;
  exitDirection: "left" | "right" | "up" | null;
  onSwipe: (direction: "left" | "right" | "up") => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const superLikeOpacity = useTransform(y, [-100, 0], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 100;
    const velocity = 500;
    if (info.offset.x > threshold || info.velocity.x > velocity) {
      onSwipe("right");
    } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      onSwipe("left");
    } else if (info.offset.y < -threshold || info.velocity.y < -velocity) {
      onSwipe("up");
    }
  };

  const getExitAnimation = () => {
    switch (exitDirection) {
      case "left":
        return { x: -500, rotate: -30, opacity: 0 };
      case "right":
        return { x: 500, rotate: 30, opacity: 0 };
      case "up":
        return { y: -500, opacity: 0 };
      default:
        return {};
    }
  };

  const tags = Array.isArray(card.tags) ? card.tags : [];

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : 0,
        rotate: isTop ? rotate : 0,
        scale: 1 - index * 0.05,
        zIndex: 10 - index,
      }}
      initial={{ scale: 0.95, y: index * 10 }}
      animate={{
        scale: 1 - index * 0.05,
        y: index * 10,
        ...getExitAnimation(),
      }}
      exit={{
        ...getExitAnimation(),
        transition: { duration: 0.28 },
      }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={1}
      onDragEnd={handleDragEnd}
    >
      <div className="w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-white">
        <div className="relative w-full h-full">
          <img
            src={card.image_url}
            alt={card.card_id}
            className="w-full h-full object-cover"
            draggable={false}
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Like indicator */}
          {isTop && (
            <motion.div
              className="absolute top-8 right-8 px-5 py-1.5 border-4 border-green-500 rounded-xl"
              style={{ opacity: likeOpacity, rotate: 12 }}
            >
              <span className="text-green-500 font-black text-2xl">LIKE</span>
            </motion.div>
          )}

          {/* Nope indicator */}
          {isTop && (
            <motion.div
              className="absolute top-8 left-8 px-5 py-1.5 border-4 border-red-500 rounded-xl"
              style={{ opacity: nopeOpacity, rotate: -12 }}
            >
              <span className="text-red-500 font-black text-2xl">NOPE</span>
            </motion.div>
          )}

          {/* Super like indicator */}
          {isTop && (
            <motion.div
              className="absolute top-1/3 left-1/2 -translate-x-1/2"
              style={{ opacity: superLikeOpacity }}
            >
              <span className="text-cyan-400 text-7xl">⭐</span>
            </motion.div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[11px] font-medium text-white"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── LearningResultsSummary ─────────────────

function LearningResultsSummary({
  topLanes,
  axes,
  totalSwipes,
}: {
  topLanes: { id: string; score: number }[];
  axes: Record<string, AxisState>;
  totalSwipes: number;
}) {
  // 軸から特徴を導出
  const traits: string[] = [];
  const a = axes;

  if ((a.casual_mode?.confidence ?? 0) > 0.3) {
    traits.push(a.casual_mode.value < -0.2 ? "カジュアル寄り" : a.casual_mode.value > 0.2 ? "モード寄り" : "カジュアル ⟷ モード均衡");
  }
  if ((a.kirei_street?.confidence ?? 0) > 0.3) {
    traits.push(a.kirei_street.value < -0.2 ? "きれいめ傾向" : a.kirei_street.value > 0.2 ? "ストリート傾向" : "きれいめ ⟷ ストリート均衡");
  }
  if ((a.warm_cool?.confidence ?? 0) > 0.3) {
    traits.push(a.warm_cool.value < -0.2 ? "暖色系が好み" : a.warm_cool.value > 0.2 ? "寒色系が好み" : "色温度ニュートラル");
  }
  if ((a.tight_oversized?.confidence ?? 0) > 0.3) {
    traits.push(a.tight_oversized.value < -0.2 ? "タイト寄り" : a.tight_oversized.value > 0.2 ? "オーバーサイズ寄り" : "サイズ感ニュートラル");
  }

  return (
    <GlassCard className="p-5">
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Learning Summary
        </div>
        <div className="mt-0.5 text-sm font-bold text-slate-700">
          {totalSwipes}回のスワイプから学習した傾向
        </div>
      </div>

      {/* Top Style Lanes */}
      {topLanes.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-slate-500 mb-2">適合スタイルレーン</div>
          <div className="space-y-2">
            {topLanes.map((lane) => (
              <div key={lane.id} className="flex items-center gap-3">
                <div className="min-w-[80px] text-xs font-bold text-slate-700">
                  {LANE_LABELS[lane.id] ?? lane.id}
                </div>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${lane.score}%` }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 min-w-[32px] text-right">
                  {lane.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Derived Traits */}
      {traits.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-500 mb-2">学習された傾向</div>
          <div className="flex flex-wrap gap-1.5">
            {traits.map((trait) => (
              <GlassBadge key={trait} size="sm" className="border-violet-200 bg-violet-50 text-violet-700">
                {trait}
              </GlassBadge>
            ))}
          </div>
        </div>
      )}

      {topLanes.length === 0 && traits.length === 0 && (
        <p className="text-sm text-slate-400">もう少しスワイプを続けると傾向が見えてきます</p>
      )}
    </GlassCard>
  );
}
