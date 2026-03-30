"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import type {
  MemoryChapter,
  LifePeriod,
  ExplorationAxis,
  ExplorationResult,
  DeepExplorationPhase,
  ChapterLayers,
  CorrectionLevel,
} from "@/lib/origin/v7/types";
import { extractLayers } from "@/lib/origin/v7/layerExtraction";
import { LEARNED_PATTERN_OPTIONS, getAxisQuestions, type PatternRating } from "@/lib/origin/v7/deepFlowQuestions";
import MemoryHandleStep from "./MemoryHandleStep";
import DailyStructureStep from "./DailyStructureStep";
import FactGatheringStep from "./FactGatheringStep";
import InnerStateStep from "./InnerStateStep";
import LearnedPatternStep from "./LearnedPatternStep";
import PresentConnectionStep from "./PresentConnectionStep";
import HypothesisCorrectionStep from "./HypothesisCorrectionStep";

type Props = {
  targetChapter?: MemoryChapter;
  initialPeriod?: LifePeriod;
  explorationAxis?: ExplorationAxis;
  onComplete: (result: ExplorationResult) => void;
  onCancel: () => void;
};

/** 全フェーズの回答を蓄積する内部状態 */
type FlowState = {
  handles: string[];
  dailyStructure: Record<string, string>;
  facts: Record<string, string>;
  innerState: Record<string, string | string[]>;
  learnedPatterns: Record<string, PatternRating>;
  presentConnection: Record<string, string>;
};

const INITIAL_FLOW_STATE: FlowState = {
  handles: [],
  dailyStructure: {},
  facts: {},
  innerState: {},
  learnedPatterns: {},
  presentConnection: {},
};

/** フェーズ進行順（Phase 1: target_selection はスキップ — 外部で解決済み） */
const PHASE_ORDER: DeepExplorationPhase[] = [
  "memory_handles",
  "daily_structure",
  "fact_gathering",
  "inner_state",
  "learned_patterns",
  "present_connection",
  "hypothesis_correction",
];

export default function DeepExplorationFlow({
  targetChapter,
  initialPeriod,
  explorationAxis,
  onComplete,
  onCancel,
}: Props) {
  const period = targetChapter?.fact.period ?? initialPeriod ?? "elementary";
  const existingLayers = targetChapter ? extractLayers(targetChapter) : null;

  // Get axis-specific questions (defaults to daily_flow if no axis)
  const axisQs = getAxisQuestions(explorationAxis ?? "daily_flow");

  const [phaseIdx, setPhaseIdx] = useState(0);
  const phase = PHASE_ORDER[phaseIdx];

  const [flowState, setFlowState] = useState<FlowState>(INITIAL_FLOW_STATE);

  // 仮説生成
  const [hypothesis, setHypothesis] = useState<string | null>(null);
  const [isTemplate, setIsTemplate] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasFetched = useRef(false);

  const advancePhase = useCallback(() => {
    setPhaseIdx((p) => p + 1);
  }, []);

  // Phase 2: Memory handles
  const handleHandlesComplete = useCallback(
    (handles: string[]) => {
      setFlowState((s) => ({ ...s, handles }));
      advancePhase();
    },
    [advancePhase],
  );

  // Phase 3: Daily structure
  const handleDailyComplete = useCallback(
    (answers: Record<string, string>) => {
      setFlowState((s) => ({ ...s, dailyStructure: answers }));
      advancePhase();
    },
    [advancePhase],
  );

  // Phase 4: Fact gathering
  const handleFactsComplete = useCallback(
    (answers: Record<string, string>) => {
      setFlowState((s) => ({ ...s, facts: answers }));
      advancePhase();
    },
    [advancePhase],
  );

  // Phase 5: Inner state
  const handleInnerComplete = useCallback(
    (answers: Record<string, string | string[]>) => {
      setFlowState((s) => ({ ...s, innerState: answers }));
      advancePhase();
    },
    [advancePhase],
  );

  // Phase 6: Learned patterns
  const handlePatternsComplete = useCallback(
    (ratings: Record<string, PatternRating>) => {
      setFlowState((s) => ({ ...s, learnedPatterns: ratings }));
      advancePhase();
    },
    [advancePhase],
  );

  // Phase 7: Present connection → then generate hypothesis
  const handleConnectionComplete = useCallback(
    async (answers: Record<string, string>) => {
      setFlowState((s) => ({ ...s, presentConnection: answers }));
      // Generate hypothesis before advancing to Phase 8
      await generateHypothesis({ ...flowState, presentConnection: answers });
      advancePhase();
    },
    [advancePhase, flowState],
  );

  // 仮説生成（AI or テンプレート）
  const generateHypothesis = useCallback(
    async (state: FlowState) => {
      if (hasFetched.current) return;
      hasFetched.current = true;
      setLoading(true);

      try {
        const res = await fetch("/api/origin/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            period,
            atmosphere: state.dailyStructure.morning_feeling ?? "",
            perspective: state.dailyStructure.first_awareness ?? "",
            comparison: state.dailyStructure.after_feeling ?? "",
            triggers: Object.values(state.facts).filter(Boolean),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setHypothesis(data.narrative);
          setIsTemplate(data.source === "template");
        } else {
          // Fallback: build local hypothesis
          setHypothesis(buildLocalHypothesis(state, period));
          setIsTemplate(true);
        }
      } catch {
        setHypothesis(buildLocalHypothesis(state, period));
        setIsTemplate(true);
      } finally {
        setLoading(false);
      }
    },
    [period],
  );

  // Phase 8: Hypothesis correction → complete
  const handleCorrectionComplete = useCallback(
    (result: {
      correctionLevel: CorrectionLevel;
      editedText: string | null;
      selectedOption: string;
    }) => {
      // Build layers from all answers
      const layers = buildLayersFromAnswers(flowState, existingLayers);

      const explorationResult: ExplorationResult = {
        updatedLayers: layers,
        newEchoes: extractEchoes(flowState),
        hypothesis: result.editedText ?? hypothesis ?? "",
        correctionLevel: result.correctionLevel,
      };

      onComplete(explorationResult);
    },
    [flowState, existingLayers, hypothesis, onComplete],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 戻るボタン */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={phaseIdx > 0 ? () => setPhaseIdx((p) => p - 1) : onCancel}
          className="text-xs text-gray-400 hover:text-gray-500"
        >
          ← {phaseIdx > 0 ? "戻る" : "キャンセル"}
        </button>
        <span className="text-[10px] text-gray-300">
          {phaseIdx + 1} / {PHASE_ORDER.length}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === "memory_handles" && (
          <MemoryHandleStep
            key="handles"
            period={period}
            initialSelected={flowState.handles.length > 0 ? flowState.handles : undefined}
            onComplete={handleHandlesComplete}
          />
        )}
        {phase === "daily_structure" && (
          <DailyStructureStep
            key="daily"
            initialAnswers={Object.keys(flowState.dailyStructure).length > 0 ? flowState.dailyStructure : undefined}
            onComplete={handleDailyComplete}
            questions={axisQs.dailyStructure}
          />
        )}
        {phase === "fact_gathering" && (
          <FactGatheringStep
            key="facts"
            initialAnswers={Object.keys(flowState.facts).length > 0 ? flowState.facts : undefined}
            onComplete={handleFactsComplete}
            questions={axisQs.factGathering}
          />
        )}
        {phase === "inner_state" && (
          <InnerStateStep
            key="inner"
            initialAnswers={Object.keys(flowState.innerState).length > 0 ? flowState.innerState : undefined}
            onComplete={handleInnerComplete}
            questions={axisQs.innerState}
          />
        )}
        {phase === "learned_patterns" && (
          <LearnedPatternStep
            key="patterns"
            initialRatings={Object.keys(flowState.learnedPatterns).length > 0 ? flowState.learnedPatterns : undefined}
            onComplete={handlePatternsComplete}
          />
        )}
        {phase === "present_connection" && (
          <PresentConnectionStep
            key="connection"
            initialAnswers={Object.keys(flowState.presentConnection).length > 0 ? flowState.presentConnection : undefined}
            onComplete={handleConnectionComplete}
          />
        )}
        {phase === "hypothesis_correction" && hypothesis && !loading && (
          <HypothesisCorrectionStep
            key="hypothesis"
            hypothesis={hypothesis}
            isTemplate={isTemplate}
            onComplete={handleCorrectionComplete}
          />
        )}
        {phase === "hypothesis_correction" && loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 py-12"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="h-4 w-4 rounded-full bg-amber-400/70"
            />
            <p className="text-sm text-gray-400 italic">
              仮説を組み立てています...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── ユーティリティ ─── */

/** 全回答から ChapterLayers を構築 */
function buildLayersFromAnswers(
  state: FlowState,
  existing: ChapterLayers | null,
): ChapterLayers {
  const layers: ChapterLayers = { ...(existing ?? {}) };

  // events: facts から
  const factParts = Object.values(state.facts).filter(Boolean);
  if (factParts.length > 0) {
    layers.events = factParts.join("。");
  }

  // innerState: inner_state answers から統合テキスト生成
  const innerParts: string[] = [];
  const avoided = state.innerState.most_avoided;
  if (typeof avoided === "string") {
    const AVOID_LABELS: Record<string, string> = {
      scolded: "怒られること",
      stand_out: "浮くこと",
      recognized: "認められないこと",
      behind: "遅れること",
      bother: "迷惑をかけること",
      alone: "一人になること",
    };
    innerParts.push(`${AVOID_LABELS[avoided] ?? avoided}を避けようとしていた`);
  }
  const unsaid = state.innerState.unsaid_things;
  if (unsaid === "yes_often") innerParts.push("言いたいことを飲み込むことが多かった");
  else if (unsaid === "sometimes") innerParts.push("たまに言葉を飲み込んでいた");
  if (innerParts.length > 0) {
    layers.innerState = innerParts.join("。");
  }

  // learnedPatterns: close/somewhat のパターンを統合
  const closePatterns = Object.entries(state.learnedPatterns)
    .filter(([, r]) => r === "close" || r === "somewhat")
    .map(([id]) => LEARNED_PATTERN_OPTIONS.find((p) => p.id === id)?.label)
    .filter(Boolean);
  if (closePatterns.length > 0) {
    layers.learnedPatterns = closePatterns.join("、");
  }

  // presentImpact: present connection answers から
  const whatRemains = state.presentConnection.what_remains;
  if (whatRemains) {
    layers.presentImpact = whatRemains;
  }

  const reaction = state.presentConnection.similar_reaction;
  const helpful = state.presentConnection.helpful_or_heavy;
  if (reaction || helpful) {
    const parts: string[] = [];
    if (reaction === "yes_often") parts.push("今もよく同じ反応が出る");
    else if (reaction === "sometimes") parts.push("今もたまに似た反応がある");
    else if (reaction === "changed") parts.push("形を変えて今も続いている");
    if (helpful === "useful") parts.push("今も役立っている");
    else if (helpful === "heavy") parts.push("少し重くなっている");
    else if (helpful === "both") parts.push("役立つ面と重い面の両方がある");
    if (parts.length > 0 && !layers.nextConnection) {
      layers.nextConnection = parts.join("。");
    }
  }

  return layers;
}

/** flowState から今に残るもの (echoes) を抽出 */
function extractEchoes(state: FlowState): string[] {
  const echoes: string[] = [];
  // close 評価のパターンを echoes として抽出
  Object.entries(state.learnedPatterns)
    .filter(([, r]) => r === "close")
    .slice(0, 3)
    .forEach(([id]) => {
      const label = LEARNED_PATTERN_OPTIONS.find((p) => p.id === id)?.label;
      if (label) echoes.push(label);
    });
  return echoes;
}

/** ローカル仮説テンプレート（AI不使用時） */
function buildLocalHypothesis(state: FlowState, period: string): string {
  const parts: string[] = [];

  const avoided = state.innerState.most_avoided;
  if (typeof avoided === "string") {
    const AVOID_MAP: Record<string, string> = {
      scolded: "怒られないように",
      stand_out: "浮かないように",
      recognized: "認められるように",
      behind: "遅れないように",
      bother: "迷惑をかけないように",
      alone: "一人にならないように",
    };
    parts.push(
      `この頃、あなたは「${AVOID_MAP[avoided] ?? "何かを避ける"}」ようとしていた可能性があります。`,
    );
  }

  const closePatterns = Object.entries(state.learnedPatterns)
    .filter(([, r]) => r === "close")
    .map(([id]) => LEARNED_PATTERN_OPTIONS.find((p) => p.id === id)?.label)
    .filter(Boolean)
    .slice(0, 2);
  if (closePatterns.length > 0) {
    parts.push(
      `その中で「${closePatterns.join("」「")}」ことを覚え、それが今の自分に繋がっているかもしれません。`,
    );
  }

  if (parts.length === 0) {
    parts.push("この時期の経験が、今のあなたの動き方に影響を与えている可能性があります。");
  }

  return parts.join("\n");
}
