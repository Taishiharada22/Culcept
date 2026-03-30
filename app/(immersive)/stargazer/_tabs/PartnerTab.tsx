// app/stargazer/_tabs/PartnerTab.tsx
// 相手タブ — 関係性の中の自分を見る + 深層観測テーマ
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type TraitAxisKey, getAxisLabels } from "@/lib/stargazer/traitAxes";
import {
  type PartnerProfile,
  type PartnerCategory,
  PARTNER_LABELS,
  PARTNER_ICONS,
  PARTNER_COLORS,
  analyzeRelationship,
} from "@/lib/stargazer/partnerTypes";
import { aggregateRadarDimensions } from "@/lib/stargazer/radarAggregation";
import {
  type PartnerObservationTheme,
  type PartnerObservationQuestion,
  type PartnerObservationOption,
  PARTNER_THEME_META,
  getAllThemes,
  getQuestionsByTheme,
} from "@/lib/stargazer/partnerObservation";
import {
  analyzeCrossReference,
  generateGapSummary,
  type CrossReferenceResult,
} from "@/lib/stargazer/crossReferenceAnalysis";
import RadarChart from "../_components/RadarChart";
import EmptyState from "../_shared/EmptyState";
import {
  calculateCompatibility,
  getBestMatches,
  getGrowthPartners,
  type CompatibilityResult,
} from "@/lib/stargazer/archetypeCompatibility";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";

interface PartnerTabProps {
  hasData: boolean;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  partners: PartnerProfile[];
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>;
  onRefresh?: () => Promise<void>;
}

// ── 相手カテゴリ一覧（データがなくても表示） ──
const DEFAULT_PARTNER_ENTRIES: { id: string; category: PartnerCategory; nickname: string }[] = [
  { id: "friends", category: "friend", nickname: "友達" },
  { id: "romantic_partner", category: "romantic", nickname: "恋人" },
  { id: "spouse", category: "spouse", nickname: "配偶者" },
  { id: "coworkers", category: "colleague", nickname: "仕事仲間" },
  { id: "family", category: "family", nickname: "家族" },
];

export default function PartnerTab({
  hasData,
  axisScores,
  partners,
  contextScores,
  onRefresh,
}: PartnerTabProps) {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null
  );
  const [observeMode, setObserveMode] = useState(false);

  // データがあるパートナーとデフォルト一覧をマージ
  const mergedPartners: PartnerProfile[] = useMemo(() => {
    const existing = new Set(partners.map((p) => p.id));
    const merged = [...partners];
    for (const def of DEFAULT_PARTNER_ENTRIES) {
      if (!existing.has(def.id)) {
        merged.push({
          id: def.id,
          category: def.category,
          nickname: def.nickname,
          observationCount: 0,
        });
      }
    }
    return merged;
  }, [partners]);

  const selectedPartner = mergedPartners.find((p) => p.id === selectedPartnerId);

  return (
    <div className="space-y-8">
      {/* ── Section 1: Partner List ── */}
      <section>
        <SectionLabel label="つながりのある人" sublabel="パートナー一覧" />
        <p className="text-whisper mt-1 mb-4">
          相手ごとに、あなたの違う一面が見えてきます。
        </p>

        {/* Category groups */}
        <div className="space-y-3">
          {(
            Object.entries(
              mergedPartners.reduce(
                (groups, p) => {
                  if (!groups[p.category]) groups[p.category] = [];
                  groups[p.category].push(p);
                  return groups;
                },
                {} as Record<PartnerCategory, PartnerProfile[]>
              )
            ) as [PartnerCategory, PartnerProfile[]][]
          ).map(([category, categoryPartners]) => (
            <div key={category}>
              <span
                className="text-xs font-mono-sg block mb-1.5"
                style={{
                  color: PARTNER_COLORS[category]?.replace(
                    /[\d.]+\)$/,
                    "0.5)"
                  ),
                }}
              >
                {PARTNER_ICONS[category]} {PARTNER_LABELS[category]}
              </span>
              <div className="space-y-2">
                {categoryPartners.map((partner) => {
                  const depth = computeObservationDepth(partner.observationCount);
                  return (
                    <button
                      key={partner.id}
                      onClick={() => {
                        setSelectedPartnerId(
                          selectedPartnerId === partner.id ? null : partner.id
                        );
                        setObserveMode(false);
                      }}
                      className="w-full text-left transition-all"
                    >
                      <motion.div
                        className="card-section flex items-center justify-between"
                        style={{
                          borderLeft:
                            selectedPartnerId === partner.id
                              ? `3px solid ${PARTNER_COLORS[partner.category]}`
                              : "3px solid transparent",
                        }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {PARTNER_ICONS[partner.category]}
                          </span>
                          <div className="flex-1">
                            <span
                              className="font-display text-base font-medium block"
                              style={{
                                color:
                                  selectedPartnerId === partner.id
                                    ? "rgba(30,35,55,0.88)"
                                    : "rgba(30,35,55,0.68)",
                              }}
                            >
                              {partner.nickname}
                            </span>
                            {/* ── 観測深度ステータス ── */}
                            {partner.observationCount > 0 ? (
                              <div className="flex items-center gap-2 mt-0.5">
                                <ObservationDepthDots depth={depth} color={PARTNER_COLORS[partner.category]} />
                                <span className="text-[10px]" style={{ color: "rgba(120,125,140,0.4)" }}>
                                  {depth.label}
                                </span>
                              </div>
                            ) : (
                              <span
                                className="text-xs"
                                style={{ color: "rgba(190,170,110,0.5)" }}
                              >
                                観測を始める
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className="text-sm"
                          style={{ color: "rgba(120,125,140,0.3)" }}
                        >
                          {selectedPartnerId === partner.id ? "▼" : "→"}
                        </span>
                      </motion.div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Archetype Compatibility（アーキタイプ相性）── */}
      {(() => {
        // 自分のアーキタイプを計算
        const hasScores = Object.values(axisScores).some((v) => typeof v === "number" && Math.abs(v) > 0.01);
        if (!hasScores) return null;
        const myArchetype = resolveArchetype(axisScores as Record<string, number>);
        const myDef = getArchetypeByCode(myArchetype.code);
        if (!myDef) return null;

        const bestMatches = getBestMatches(myArchetype.code, 3);
        const growthPartners = getGrowthPartners(myArchetype.code);

        return (
          <section>
            <SectionLabel label="タイプ相性" sublabel="あなたと相手の相性を見る" />
            <p className="text-whisper mt-1 mb-4">
              あなたの内面の型（{myDef.emoji} {myDef.name}）と、相手の型がどう影響し合うか。
            </p>

            {/* Best Matches */}
            <div className="mb-3">
              <span className="text-[10px] font-mono tracking-wider" style={{ color: "rgba(34,197,94,0.6)" }}>
                相性の良いタイプ
              </span>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {bestMatches.map((match) => {
                  const def = getArchetypeByCode(match.code);
                  if (!def) return null;
                  const compat = calculateCompatibility(myArchetype.code, match.code);
                  return (
                    <div
                      key={match.code}
                      className="px-3 py-2 rounded-xl text-xs"
                      style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)" }}
                    >
                      <span className="font-bold">{def.emoji} {def.name}</span>
                      <span className="ml-2 text-[10px]" style={{ color: "rgba(34,197,94,0.7)" }}>
                        {compat.overallScore}%
                      </span>
                      <p className="text-[10px] mt-1" style={{ color: "rgba(56,62,84,0.5)" }}>
                        {compat.relationshipType === "mirror" ? "🪞 鏡像" :
                         compat.relationshipType === "complement" ? "⚡ 補完" :
                         compat.relationshipType === "comrade" ? "🤝 同志" :
                         compat.relationshipType === "teacher" ? "📚 師弟" :
                         compat.relationshipType === "shadow" ? "🌑 影" :
                         compat.relationshipType === "rhythm_gap" ? "🎵 リズム差" :
                         compat.relationshipType === "language_gap" ? "🗣 言語差" :
                         compat.relationshipType === "alien" ? "🌌 異世界" :
                         compat.relationshipType}
                        {compat.strengths[0] ? ` — ${compat.strengths[0]}` : ""}
                      </p>
                      {compat.layerScores.execution && (
                        <p className="text-[9px] mt-0.5" style={{ color: "rgba(56,62,84,0.4)" }}>
                          実行スタイル: {compat.layerScores.execution.dynamic}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Growth Partners */}
            {growthPartners.length > 0 && (
              <div>
                <span className="text-[10px] font-mono tracking-wider" style={{ color: "rgba(139,92,246,0.6)" }}>
                  成長を促すタイプ
                </span>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {growthPartners.slice(0, 3).map((code) => {
                    const def = getArchetypeByCode(code);
                    if (!def) return null;
                    const compat = calculateCompatibility(myArchetype.code, code);
                    return (
                      <div
                        key={code}
                        className="px-3 py-2 rounded-xl text-xs"
                        style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.1)" }}
                      >
                        <span className="font-bold">{def.emoji} {def.name}</span>
                        <p className="text-[10px] mt-1" style={{ color: "rgba(56,62,84,0.5)" }}>
                          {compat.growthOpportunity}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* ── Section 2: Selected Partner ── */}
      <AnimatePresence mode="wait">
        {selectedPartner && !observeMode && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <PartnerDetail
              partner={selectedPartner}
              selfScores={axisScores}
              contextScores={contextScores}
              onStartObservation={() => setObserveMode(true)}
            />
          </motion.div>
        )}

        {/* ── Section 3: Deep Observation Flow ── */}
        {selectedPartner && observeMode && (
          <motion.div
            key="observe"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <DeepObservationFlow
              partner={selectedPartner}
              onBack={() => setObserveMode(false)}
              onRefresh={onRefresh}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <p
        className="text-center text-xs py-4"
        style={{ color: "rgba(120,125,140,0.2)" }}
      >
        記録を重ねるほど、相手との関係がより詳しく見えてきます
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Deep Observation Flow ──
// ═══════════════════════════════════════════════════════════

type ObservePhase = "loading" | "question" | "done";

type ApiQuestion = {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  theme?: string;
  source?: string;
};

interface ObservationAnswer {
  questionId: string;
  optionId: string;
  prompt: string; // 質問テキスト（重複検出用）
  axisMappings: { key: TraitAxisKey; weight: number }[];
}

function DeepObservationFlow({
  partner,
  onBack,
  onRefresh,
}: {
  partner: PartnerProfile;
  onBack: () => void;
  onRefresh?: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<ObservePhase>("loading");
  const [questions, setQuestions] = useState<ApiQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<ObservationAnswer[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showReaction, setShowReaction] = useState(false);
  const fetchedRef = useRef(false);
  const savedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const CATEGORY_TO_CONTEXT: Record<string, string> = {
    friend: "friends", romantic: "romantic_partner",
    spouse: "spouse", family: "family", colleague: "coworkers",
  };
  const context = CATEGORY_TO_CONTEXT[partner.category] ?? "friends";
  const partnerColor = PARTNER_COLORS[partner.category];

  // ── API から動的質問を一括取得（初回のみ、30秒タイムアウト） ──
  useEffect(() => {
    const controller = new AbortController();

    // 既にquestionsがロード済みなら再fetchしない
    if (fetchedRef.current && questions.length > 0) return;
    fetchedRef.current = true;

    setPhase("loading");

    // フロントエンド側タイムアウト: 30秒で強制打ち切り
    const timeout = setTimeout(() => {
      controller.abort();
      setPhase("done"); // タイムアウト時は完了状態にして「質問がありません」表示
    }, 30_000);

    fetch(
      `/api/stargazer/partner-observation?category=${partner.category}&context=${context}&count=8`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((d) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        if (d.ok && d.questions?.length > 0) {
          setQuestions(d.questions);
          setPhase("question");
        } else {
          setQuestions([]);
          setPhase("done");
        }
      })
      .catch((e) => {
        clearTimeout(timeout);
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!controller.signal.aborted) setPhase("done");
      });

    return () => { clearTimeout(timeout); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 回答処理 ──
  const handleAnswer = useCallback((optionId: string) => {
    const q = questions[currentIdx];
    if (!q || showReaction) return; // 連打防止

    setSelectedOptionId(optionId);
    setShowReaction(true);

    const answer: ObservationAnswer = {
      questionId: q.id,
      optionId,
      prompt: q.prompt,
      axisMappings: inferAxisMappingsClient(q.prompt, optionId),
    };
    setAnswers((prev) => [...prev, answer]);

    setTimeout(() => {
      setShowReaction(false);
      setSelectedOptionId(null);
      if (currentIdx < questions.length - 1) {
        setCurrentIdx((i) => i + 1);
      } else {
        setPhase("done");
      }
    }, 800);
  }, [questions, currentIdx, showReaction]);

  // ── done 時にAPI保存 → 親データ再取得（1回のみ） ──
  useEffect(() => {
    if (phase !== "done" || answers.length === 0 || savedRef.current) return;
    savedRef.current = true; // 二重送信防止

    fetch("/api/stargazer/partner-observation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context,
        answers: answers.map((a) => ({
          questionId: a.questionId,
          optionId: a.optionId,
          prompt: a.prompt,
          axisMappings: a.axisMappings,
        })),
      }),
    })
      .then(() => {
        if (onRefresh) onRefresh();
      })
      .catch(() => {});
  // onRefreshを依存配列から除外: 参照変更で再発火するのを防ぐ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const currentQuestion = questions[currentIdx];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel
            label={`${partner.nickname}を観測中`}
            sublabel="観測中"
          />
          {questions.length > 0 && phase === "question" && (
            <p className="text-xs -mt-2" style={{ color: "rgba(120,125,140,0.4)" }}>
              {currentIdx + 1} / {questions.length}
            </p>
          )}
        </div>
        <button
          onClick={onBack}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: "rgba(255,255,255,0.5)",
            color: "rgba(120,125,140,0.5)",
            border: "1px solid rgba(160,170,200,0.12)",
          }}
        >
          戻る
        </button>
      </div>

      {/* Progress bar */}
      {questions.length > 0 && phase === "question" && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(160,170,200,0.1)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: partnerColor }}
              animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── Loading ── */}
        {phase === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center py-16">
            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-2xl mb-3">♢</motion.span>
            <p className="text-sm" style={{ color: "rgba(120,125,140,0.4)" }}>質問を準備しています...</p>
          </motion.div>
        )}

        {/* ── Question ── */}
        {phase === "question" && currentQuestion && (
          <motion.div key={`q-${currentIdx}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.18 }}>
            <div className="card-instrument p-5 mb-4">
              <p className="font-display text-base font-medium leading-relaxed" style={{ color: "rgba(30,35,55,0.85)" }}>
                {currentQuestion.prompt}
              </p>
            </div>
            <div className="space-y-2">
              {currentQuestion.options.map((opt) => (
                <motion.button key={opt.id} onClick={() => handleAnswer(opt.id)}
                  className="w-full text-left p-4 rounded-xl transition-all"
                  style={{
                    background: selectedOptionId === opt.id ? `${partnerColor.replace(/[\d.]+\)$/, "0.12)")}` : "rgba(255,255,255,0.6)",
                    border: `1px solid ${selectedOptionId === opt.id ? partnerColor.replace(/[\d.]+\)$/, "0.3)") : "rgba(160,170,200,0.12)"}`,
                    color: selectedOptionId === opt.id ? partnerColor.replace(/[\d.]+\)$/, "0.9)") : "rgba(30,35,55,0.7)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  disabled={showReaction}
                >
                  <span className="text-sm">{opt.text}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Done ── */}
        {phase === "done" && (
          <motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
            <ObservationMilestone
              partnerNickname={partner.nickname}
              totalCount={partner.observationCount + answers.length}
              justRecorded={answers.length}
              partnerColor={partnerColor}
            />
            <button onClick={onBack}
              className="px-6 py-2.5 rounded-xl text-sm font-display font-medium transition-colors mt-6"
              style={{
                background: partnerColor.replace(/[\d.]+\)$/, "0.12)"),
                color: partnerColor,
                border: `1px solid ${partnerColor.replace(/[\d.]+\)$/, "0.2)")}`,
              }}>
              結果を見る
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Partner Detail View ──
// ═══════════════════════════════════════════════════════════

function PartnerDetail({
  partner,
  selfScores,
  contextScores,
  onStartObservation,
}: {
  partner: PartnerProfile;
  selfScores: Partial<Record<TraitAxisKey, number>>;
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>;
  onStartObservation: () => void;
}) {
  const partnerColor = PARTNER_COLORS[partner.category];

  // Get context scores for this partner category
  // DB保存値と一致させる
  const CATEGORY_TO_CTX: Record<string, string> = {
    romantic: "romantic_partner",
    spouse: "spouse",
    colleague: "coworkers",
    family: "family",
    friend: "friends",
  };
  const contextKey = CATEGORY_TO_CTX[partner.category] ?? "friends";
  const partnerContextScores =
    partner.contextAxisScores || contextScores[contextKey] || {};

  // Analyze relationship
  const analysis = useMemo(
    () =>
      analyzeRelationship(selfScores, partnerContextScores, partner.category),
    [selfScores, partnerContextScores, partner.category]
  );

  // Radar dimensions
  const selfRadar = useMemo(
    () => aggregateRadarDimensions(selfScores),
    [selfScores]
  );
  const partnerRadar = useMemo(
    () => aggregateRadarDimensions(partnerContextScores),
    [partnerContextScores]
  );

  return (
    <div className="space-y-6">
      {/* Relationship Summary */}
      <section className="card-hero-star">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">
            {PARTNER_ICONS[partner.category]}
          </span>
          <div>
            <h3
              className="font-display text-xl font-semibold"
              style={{ color: "rgba(30,35,55,0.88)" }}
            >
              {partner.nickname}との関係
            </h3>
            <span
              className="text-xs font-mono-sg"
              style={{ color: partnerColor }}
            >
              {PARTNER_LABELS[partner.category]} ·{" "}
              {partner.observationCount}回の記録
            </span>
          </div>
        </div>

        {/* Overall Score */}
        <div className="flex items-center gap-3 mt-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: partnerColor.replace(/[\d.]+\)$/, "0.1)"),
              border: `1px solid ${partnerColor.replace(/[\d.]+\)$/, "0.25)")}`,
            }}
          >
            <span
              className="font-mono-sg text-sm font-medium"
              style={{ color: partnerColor }}
            >
              {analysis.overallScore}
            </span>
          </div>
          <div>
            <span
              className="text-xs block"
              style={{ color: "rgba(120,125,140,0.5)" }}
            >
              相性スコア
            </span>
            <span
              className="text-xs"
              style={{ color: "rgba(120,125,140,0.35)" }}
            >
              {analysis.overallScore > 70
                ? "とても相性が良い関係"
                : analysis.overallScore > 40
                  ? "バランスの取れた関係"
                  : "互いに補い合う関係"}
            </span>
          </div>
        </div>
      </section>

      {/* ── Deep Observation CTA ── */}
      <section>
        <motion.button
          onClick={onStartObservation}
          className="w-full p-4 rounded-2xl text-left transition-all"
          style={{
            background: `linear-gradient(135deg, ${partnerColor.replace(/[\d.]+\)$/, "0.06)")}, rgba(201,169,110,0.04))`,
            border: `1px solid ${partnerColor.replace(/[\d.]+\)$/, "0.12)")}`,
          }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="text-xl w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: partnerColor.replace(/[\d.]+\)$/, "0.1)"),
                }}
              >
                🔭
              </span>
              <div>
                <span
                  className="font-display text-base font-medium block"
                  style={{ color: "rgba(30,35,55,0.82)" }}
                >
                  テーマを選んで観測する
                </span>
                <span
                  className="text-sm"
                  style={{ color: "rgba(120,125,140,0.4)" }}
                >
                  10のテーマで関係をもっと知る
                </span>
              </div>
            </div>
            <span
              className="text-lg"
              style={{ color: "rgba(120,125,140,0.3)" }}
            >
              →
            </span>
          </div>
        </motion.button>
      </section>

      {/* ── 一言サマリー（グラフの前に結論を見せる） ── */}
      <RelationshipHeadline
        selfRadar={selfRadar.map(d => ({ label: d.label, value: d.score }))}
        partnerRadar={partnerRadar.map(d => ({ label: d.label, value: d.score }))}
        partnerNickname={partner.nickname}
        partnerColor={partnerColor}
      />

      {/* Comparison Radar Chart */}
      <section>
        <SectionLabel label="ふたりの比較" sublabel="レーダーチャート" />
        <div className="card-mbti">
          <RadarChart
            dimensions={selfRadar}
            size={280}
            color="rgba(201,169,110,0.15)"
            strokeColor="rgba(201,169,110,0.6)"
            overlayDimensions={partnerRadar}
            overlayColor={partnerColor}
            animated
          />
          {/* Legend */}
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-0.5 rounded-full"
                style={{ background: "rgba(201,169,110,0.6)" }}
              />
              <span
                className="text-xs"
                style={{ color: "rgba(120,125,140,0.5)" }}
              >
                あなた
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-0.5 rounded-full"
                style={{
                  background: partnerColor,
                  borderBottom: "1px dashed",
                }}
              />
              <span
                className="text-xs"
                style={{ color: "rgba(120,125,140,0.5)" }}
              >
                {partner.nickname}といる時
              </span>
            </div>
          </div>

          {/* ── 注目ポイントマーカー ── */}
          <RadarHighlight selfRadar={selfRadar.map(d => ({ label: d.label, value: d.score }))} partnerRadar={partnerRadar.map(d => ({ label: d.label, value: d.score }))} partnerColor={partnerColor} />
        </div>
      </section>

      {/* Resonance & Tension */}
      <section>
        <SectionLabel label="相性ポイント" sublabel="ふたりの相性" />
        <div className="grid grid-cols-1 gap-3">
          {/* Resonance */}
          {analysis.resonancePoints.length > 0 && (
            <div className="card-section">
              <span
                className="text-xs font-mono-sg block mb-2"
                style={{ color: "rgba(74,222,128,0.5)" }}
              >
                相性が良いところ
              </span>
              <ul className="space-y-1.5">
                {analysis.resonancePoints.map((point, i) => (
                  <li
                    key={i}
                    className="text-sm flex items-start gap-2"
                    style={{ color: "rgba(100,105,130,0.7)" }}
                  >
                    <span style={{ color: "rgba(74,222,128,0.4)" }}>+</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tension */}
          {analysis.tensionPoints.length > 0 && (
            <div className="card-section">
              <span
                className="text-xs font-mono-sg block mb-2"
                style={{ color: "rgba(170,150,90,0.5)" }}
              >
                ぶつかりやすいところ
              </span>
              <ul className="space-y-1.5">
                {analysis.tensionPoints.map((point, i) => (
                  <li
                    key={i}
                    className="text-sm flex items-start gap-2"
                    style={{ color: "rgba(100,105,130,0.6)" }}
                  >
                    <span style={{ color: "rgba(170,150,90,0.4)" }}>·</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Cross-Reference Gap */}
      <CrossReferenceSection
        selfScores={selfScores}
        partnerContextScores={partnerContextScores}
        category={partner.category}
      />

      {/* Shift Description */}
      <section>
        <SectionLabel
          label="この人といる時のあなた"
          sublabel="あなたの変化"
        />
        <div className="card-instrument">
          <p
            className="text-sm leading-[1.8]"
            style={{ color: "rgba(30,35,55,0.68)" }}
          >
            {analysis.shiftDescription}
          </p>
        </div>
      </section>

      {/* Communication Advice */}
      <section>
        <SectionLabel
          label="コミュニケーションのヒント"
          sublabel="コミュニケーション"
        />
        <div
          className="card-narrative"
          style={{
            borderLeftColor: partnerColor.replace(/[\d.]+\)$/, "0.2)"),
          }}
        >
          <p
            className="text-sm leading-[1.8] italic"
            style={{ color: "rgba(100,105,130,0.65)" }}
          >
            💡 {analysis.communicationAdvice}
          </p>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── Cross-Reference Gap Section ──
// ═══════════════════════════════════════════════════════════

function CrossReferenceSection({
  selfScores,
  partnerContextScores,
  category,
}: {
  selfScores: Partial<Record<TraitAxisKey, number>>;
  partnerContextScores: Partial<Record<TraitAxisKey, number>>;
  category: PartnerCategory;
}) {
  const crossRef = useMemo(
    () => analyzeCrossReference(partnerContextScores, selfScores, category),
    [selfScores, partnerContextScores, category]
  );

  if (crossRef.gaps.length === 0) return null;

  const summary = generateGapSummary(crossRef);

  return (
    <section>
      <SectionLabel
        label="普段と違う自分"
        sublabel="ギャップ分析"
      />
      <div className="space-y-3">
        <div className="card-narrative">
          <p
            className="text-sm leading-[1.8]"
            style={{ color: "rgba(30,35,55,0.68)" }}
          >
            {summary}
          </p>
        </div>

        {crossRef.gaps.map((gap) => {
          const absDelta = Math.abs(gap.delta);
          const barPct = Math.min(100, absDelta * 200);
          return (
            <motion.div
              key={gap.axis}
              className="card-section"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span
                  className="text-xs font-display font-medium"
                  style={{ color: "rgba(30,35,55,0.68)" }}
                >
                  {gap.label}
                </span>
                <span
                  className="font-mono-sg text-xs"
                  style={{
                    color:
                      gap.delta > 0
                        ? "rgba(170,150,90,0.6)"
                        : "rgba(139,92,246,0.6)",
                  }}
                >
                  {gap.delta > 0 ? "△" : "▽"}{" "}
                  {(absDelta * 100).toFixed(0)}%
                </span>
              </div>
              {/* Gap bar */}
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "rgba(160,170,200,0.08)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${barPct}%`,
                    background:
                      gap.delta > 0
                        ? "linear-gradient(90deg, rgba(170,150,90,0.3), rgba(170,150,90,0.5))"
                        : "linear-gradient(90deg, rgba(139,92,246,0.3), rgba(139,92,246,0.5))",
                  }}
                />
              </div>
              <p
                className="text-sm mt-1.5 leading-relaxed"
                style={{ color: "rgba(120,125,140,0.45)" }}
              >
                {gap.narrative}
              </p>
            </motion.div>
          );
        })}

        <p
          className="text-xs text-center pt-1"
          style={{ color: "rgba(120,125,140,0.25)" }}
        >
          普段のあなたと、この人といる時のあなたを比較しています
        </p>
      </div>
    </section>
  );
}

// ── Client-side axis mapping inference (mirrors server logic) ──

const KEYWORD_AXIS_MAP_CLIENT: [RegExp, TraitAxisKey, number][] = [
  [/距離|近い|遠い|パーソナルスペース|親密|近づ/, "intimacy_pace", 0.2],
  [/本音|正直|嘘|建前|率直|素直|正面/, "public_private_gap", 0.2],
  [/怒り|怒る|イライラ|衝突|ぶつか|喧嘩|対立|不満/, "direct_vs_diplomatic", 0.2],
  [/甘え|頼る|頼り|依存|助け|支え|弱さ|弱み/, "independence_vs_harmony", 0.2],
  [/沈黙|黙る|静か|話さない|言わない|無口|一人/, "introvert_vs_extrovert", 0.15],
  [/変化|変わ|成長|進化|変容|違う自分/, "change_embrace_vs_resist", 0.15],
  [/信頼|信じ|裏切|安心|安全|不安|心配/, "emotional_regulation", 0.2],
  [/エネルギー|疲れ|元気|活力|消耗|気力/, "emotional_variability", 0.15],
  [/境界|線引|断る|NO|拒否|限界|嫌/, "boundary_awareness", 0.2],
  [/未来|将来|夢|目標|ビジョン|展望/, "cautious_vs_bold", 0.15],
  [/気を使|空気|察す|配慮|気遣|周り|雰囲気/, "social_initiative", 0.15],
  [/一人|独り|孤独|ソロ|自分だけ|離れ/, "stress_isolation_vs_social", 0.2],
  [/完璧|こだわ|妥協|適当|ちゃんと|きちんと/, "perfectionist_vs_pragmatic", 0.15],
  [/感情|気持ち|泣|悲し|嬉し|喜び|涙/, "emotional_variability", 0.2],
  [/計画|予定|決め|即興|自由|流れ/, "plan_vs_spontaneous", 0.15],
  [/表現|伝え|言葉|コミュニ|話す|語る/, "function_vs_expression", 0.15],
  [/批判|否定|ダメ|評価|ジャッジ|指摘|失敗/, "rejection_response_maturity", 0.2],
  // 追加パターン: AI生成質問でよく出るテーマ
  [/緊張|リラックス|自然体|力が抜|ほっと/, "emotional_regulation", 0.15],
  [/我慢|耐え|抑え|飲み込|堪え/, "direct_vs_diplomatic", 0.15],
  [/合わせ|譲|折れ|妥協|相手優先/, "independence_vs_harmony", 0.15],
  [/見せ|隠|仮面|演じ|キャラ|振る舞/, "public_private_gap", 0.2],
  [/比較|劣等|優越|競|上下|負け/, "rejection_response_maturity", 0.15],
  [/期待|応え|プレッシャー|重荷|責任/, "reassurance_need", 0.2],
  [/時間|ペース|テンポ|急|ゆっくり|待/, "intimacy_pace", 0.15],
  [/価値観|大切|優先|譲れない|こだわり/, "cautious_vs_bold", 0.15],
];

function inferAxisMappingsClient(
  prompt: string,
  optionId: string,
): { key: TraitAxisKey; weight: number }[] {
  if (!prompt) return [];

  const matched: { key: TraitAxisKey; weight: number }[] = [];
  const seenAxes = new Set<string>();

  for (const [pattern, axisKey, baseWeight] of KEYWORD_AXIS_MAP_CLIENT) {
    if (pattern.test(prompt) && !seenAxes.has(axisKey)) {
      seenAxes.add(axisKey);
      const direction = estimateDirectionClient(optionId);
      matched.push({ key: axisKey, weight: baseWeight * direction });
    }
  }

  // 最大3軸まで
  if (matched.length > 0) return matched.slice(0, 3);

  // キーワードに一致しなかった場合のフォールバック:
  // 汎用的な軸にデフォルトマッピングを割り当て（データが全く入らないことを防ぐ）
  const direction = estimateDirectionClient(optionId);
  return [
    { key: "introvert_vs_extrovert" as TraitAxisKey, weight: 0.1 * direction },
  ];
}

function estimateDirectionClient(optionId: string): number {
  // 数値ベースのID (opt_0, opt_1, opt_2, opt_3)
  const numMatch = optionId.match(/(\d+)$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10);
    return (idx - 1.5) * 0.4;
  }
  // 文字ベースのID (a, b, c, d)
  const letterMatch = optionId.match(/([a-d])$/i);
  if (letterMatch) {
    const idx = letterMatch[1].toLowerCase().charCodeAt(0) - 97;
    return (idx - 1.5) * 0.4;
  }
  return 0.1;
}

// ── Helpers ──

function SectionLabel({
  label,
  sublabel,
}: {
  label: string;
  sublabel: string;
}) {
  return (
    <div className="mb-3">
      <span className="text-section-header">{sublabel}</span>
      <h3
        className="font-display text-lg font-medium mt-1"
        style={{ color: "rgba(30,35,55,0.88)" }}
      >
        {label}
      </h3>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── 観測深度システム ──
// ═══════════════════════════════════════════════════════════

interface ObservationDepth {
  level: number; // 0-5
  label: string;
  filled: number; // 0-10 のドット表示
  isComplete: boolean;
}

function computeObservationDepth(observationCount: number): ObservationDepth {
  // 10テーマ × 各テーマ最低3-5問 ≒ 30-50回で「深層観測完了」
  // マイルストーン: 5回, 10回, 20回, 30回, 45回+
  if (observationCount >= 45) {
    return { level: 5, label: "深層観測完了", filled: 10, isComplete: true };
  }
  if (observationCount >= 30) {
    return { level: 4, label: "深い理解", filled: 8, isComplete: false };
  }
  if (observationCount >= 20) {
    return { level: 3, label: "パターン検出中", filled: 6, isComplete: false };
  }
  if (observationCount >= 10) {
    return { level: 2, label: "輪郭が見えてきた", filled: 4, isComplete: false };
  }
  if (observationCount >= 5) {
    return { level: 1, label: "観測中", filled: 2, isComplete: false };
  }
  return { level: 0, label: `${observationCount}回の記録`, filled: Math.min(1, observationCount), isComplete: false };
}

function ObservationDepthDots({ depth, color }: { depth: ObservationDepth; color: string }) {
  const totalDots = 10;
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: totalDots }, (_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: 5,
            height: 5,
            background: i < depth.filled
              ? color.replace(/[\d.]+\)$/, `${0.5 + (i / totalDots) * 0.3})`)
              : "rgba(160,170,200,0.12)",
          }}
        />
      ))}
      {depth.isComplete && (
        <span className="text-[9px] ml-0.5">✓</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── 一言サマリー（グラフの前に結論） ──
// ═══════════════════════════════════════════════════════════

function RelationshipHeadline({
  selfRadar,
  partnerRadar,
  partnerNickname,
  partnerColor,
}: {
  selfRadar: { label: string; value: number }[];
  partnerRadar: { label: string; value: number }[];
  partnerNickname: string;
  partnerColor: string;
}) {
  if (partnerRadar.length === 0 || partnerRadar.every(d => d.value === 0)) return null;

  // 最大差分を見つける
  const diffs = selfRadar.map((self, i) => {
    const partner = partnerRadar[i];
    if (!partner) return { label: self.label, delta: 0, direction: "" as string };
    const delta = partner.value - self.value;
    return {
      label: self.label,
      delta,
      direction: delta > 0 ? "高まる" : "控えめになる",
    };
  });

  const sorted = [...diffs].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const biggest = sorted[0];
  if (!biggest || Math.abs(biggest.delta) < 0.05) return null;

  const headline = `${partnerNickname}といる時、あなたの「${biggest.label}」が最も${biggest.direction}`;

  return (
    <section>
      <motion.div
        className="rounded-2xl p-4"
        style={{
          background: `linear-gradient(135deg, ${partnerColor.replace(/[\d.]+\)$/, "0.06)")}, rgba(201,169,110,0.03))`,
          border: `1px solid ${partnerColor.replace(/[\d.]+\)$/, "0.12)")}`,
        }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="font-display text-base font-medium leading-relaxed" style={{ color: "rgba(30,35,55,0.82)" }}>
          {headline}
        </p>
        {sorted.length >= 2 && Math.abs(sorted[1].delta) > 0.05 && (
          <p className="text-sm mt-1.5" style={{ color: "rgba(120,125,140,0.5)" }}>
            「{sorted[1].label}」も{sorted[1].direction}傾向がある
          </p>
        )}
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// ── レーダーチャート注目ポイントマーカー ──
// ═══════════════════════════════════════════════════════════

function RadarHighlight({
  selfRadar,
  partnerRadar,
  partnerColor,
}: {
  selfRadar: { label: string; value: number }[];
  partnerRadar: { label: string; value: number }[];
  partnerColor: string;
}) {
  if (partnerRadar.length === 0 || partnerRadar.every(d => d.value === 0)) return null;

  // ギャップ Top 2 を抽出
  const diffs = selfRadar.map((self, i) => {
    const partner = partnerRadar[i];
    if (!partner) return { label: self.label, delta: 0 };
    return { label: self.label, delta: partner.value - self.value };
  });

  const notable = [...diffs]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .filter(d => Math.abs(d.delta) > 0.05)
    .slice(0, 2);

  if (notable.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2 justify-center">
      {notable.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: item.delta > 0
              ? partnerColor.replace(/[\d.]+\)$/, "0.08)")
              : "rgba(139,92,246,0.06)",
            border: `1px solid ${item.delta > 0 ? partnerColor.replace(/[\d.]+\)$/, "0.15)") : "rgba(139,92,246,0.12)"}`,
          }}
        >
          <span className="text-[10px]" style={{ color: item.delta > 0 ? partnerColor : "rgba(139,92,246,0.7)" }}>
            {item.delta > 0 ? "▲" : "▼"}
          </span>
          <span className="text-[11px] font-medium" style={{ color: "rgba(30,35,55,0.7)" }}>
            {item.label}
          </span>
          <span className="text-[10px] font-mono-sg" style={{ color: item.delta > 0 ? partnerColor : "rgba(139,92,246,0.6)" }}>
            {item.delta > 0 ? "+" : ""}{(item.delta * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── 観測マイルストーン通知 ──
// ═══════════════════════════════════════════════════════════

function ObservationMilestone({
  partnerNickname,
  totalCount,
  justRecorded,
  partnerColor,
}: {
  partnerNickname: string;
  totalCount: number;
  justRecorded: number;
  partnerColor: string;
}) {
  const prevDepth = computeObservationDepth(totalCount - justRecorded);
  const newDepth = computeObservationDepth(totalCount);
  const leveledUp = newDepth.level > prevDepth.level;

  if (justRecorded === 0) {
    // 全質問回答済み
    return (
      <>
        <span className="text-3xl block mb-3">📡</span>
        <p className="font-display text-base font-medium" style={{ color: "rgba(30,35,55,0.82)" }}>
          すべての質問に回答済みです
        </p>
        <p className="text-sm mt-2" style={{ color: "rgba(120,125,140,0.4)" }}>
          新しい質問が追加されるのをお待ちください
        </p>
      </>
    );
  }

  if (leveledUp) {
    // レベルアップ演出
    return (
      <>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }}
        >
          <span className="text-4xl block mb-2">🎉</span>
        </motion.div>
        <motion.div
          className="inline-block px-4 py-1.5 rounded-full mb-3"
          style={{
            background: partnerColor.replace(/[\d.]+\)$/, "0.1)"),
            border: `1px solid ${partnerColor.replace(/[\d.]+\)$/, "0.2)")}`,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-xs font-display font-medium" style={{ color: partnerColor }}>
            新しい発見が解放されました
          </span>
        </motion.div>
        <motion.p
          className="font-display text-lg font-semibold"
          style={{ color: "rgba(30,35,55,0.88)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          観測深度: {newDepth.label}
        </motion.p>
        <motion.div
          className="mt-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <ObservationDepthDots depth={newDepth} color={partnerColor} />
        </motion.div>
        <motion.p
          className="text-sm mt-3"
          style={{ color: "rgba(120,125,140,0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          {partnerNickname}との関係がより深く見えるようになりました
        </motion.p>
      </>
    );
  }

  // 通常の完了
  return (
    <>
      <span className="text-3xl block mb-3">✨</span>
      <p className="font-display text-base font-medium" style={{ color: "rgba(30,35,55,0.82)" }}>
        観測を記録しました
      </p>
      <div className="mt-3 flex justify-center">
        <ObservationDepthDots depth={newDepth} color={partnerColor} />
      </div>
      <p className="text-sm mt-2" style={{ color: "rgba(120,125,140,0.4)" }}>
        {newDepth.label} · あと{getNextMilestoneDistance(totalCount)}回で次のレベルへ
      </p>
    </>
  );
}

function getNextMilestoneDistance(count: number): number {
  const milestones = [5, 10, 20, 30, 45];
  for (const m of milestones) {
    if (count < m) return m - count;
  }
  return 0;
}
