"use client";

// EvidenceCards — 証拠カード + 問いかけ + 仮説検証ループ UI
// 種→芽→証拠カードの成長 + 仮説→観測→検証の完全ループ

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import {
  generateEvidenceCards,
  generateInquiry,
  recordInquiryResponse,
  loadPendingHypotheses,
  loadVerifiedHypotheses,
  evaluateHypothesis,
  confirmVerification,
  type EvidenceCard,
  type InquiryCard,
  type CardGrowth,
  type Hypothesis,
  type VerificationProposal,
  type HypothesisVerification,
} from "@/lib/origin/evidenceCardEngine";
import type { DailyOrbitStore } from "@/lib/origin/dailyOrbit/types";
import type { EntryRecord } from "@/lib/origin/entryContract";
import { loadOrbitStore } from "@/lib/origin/dailyOrbit/store";
import { fetchStargazerContext } from "@/lib/origin/stargazerPipeline";
import { trackOriginEvent } from "@/lib/origin/tracking";

// ---------------------------------------------------------------------------
// Entry records loader
// ---------------------------------------------------------------------------

function loadEntryRecords(): EntryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("origin_entry_records_v1") ?? "[]");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Growth visuals
// ---------------------------------------------------------------------------

const GROWTH_META: Record<CardGrowth, { emoji: string; label: string; bgClass: string }> = {
  seed: { emoji: "🌱", label: "種", bgClass: "border-green-100/60 bg-green-50/30" },
  sprout: { emoji: "🌿", label: "芽", bgClass: "border-emerald-100/60 bg-emerald-50/30" },
  evidence: { emoji: "🌳", label: "証拠", bgClass: "border-teal-200/60 bg-teal-50/40" },
};

const VERIFICATION_META: Record<HypothesisVerification["result"], { emoji: string; label: string; color: string }> = {
  supported: { emoji: "✅", label: "支持された", color: "text-green-600" },
  exception: { emoji: "⚡", label: "例外が発生", color: "text-amber-600" },
  inconclusive: { emoji: "🔍", label: "まだ不明", color: "text-slate-500" },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EvidenceCards({ maxCards = 3 }: { maxCards?: number }) {
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [inquiry, setInquiry] = useState<InquiryCard | null>(null);
  const [inquiryPhase, setInquiryPhase] = useState<"question" | "hypothesis" | "proposal" | "done">("question");
  const [selectedHypothesis, setSelectedHypothesis] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");

  // 検証ループ
  const [pendingVerification, setPendingVerification] = useState<{
    hypothesis: Hypothesis;
    proposal: VerificationProposal;
  } | null>(null);
  const [verifiedList, setVerifiedList] = useState<Hypothesis[]>([]);
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);

  useEffect(() => {
    const entries = loadEntryRecords();
    let orbitStore: DailyOrbitStore | null = null;
    try {
      orbitStore = loadOrbitStore();
    } catch { /* */ }

    fetchStargazerContext().then((ctx) => {
      const generatedCards = generateEvidenceCards(orbitStore, entries, ctx);
      setCards(generatedCards);

      const inq = generateInquiry(generatedCards);
      setInquiry(inq);

      // 計測: 証拠カード表示
      if (generatedCards.length > 0) {
        trackOriginEvent("origin_evidence_card_shown", {
          count: generatedCards.length,
          growths: generatedCards.map((c) => c.growth),
        });
      }
      if (inq) {
        trackOriginEvent("origin_inquiry_shown", {
          cardId: inq.evidenceCard.id,
          growth: inq.evidenceCard.growth,
        });
      }

      // 検証待ち仮説をチェック
      const pending = loadPendingHypotheses();
      if (pending.length > 0) {
        const oldest = pending[0];
        const result = evaluateHypothesis(oldest, entries, orbitStore);
        if (result.result !== "insufficient_data") {
          setPendingVerification({ hypothesis: oldest, proposal: result });
          trackOriginEvent("origin_hypothesis_evaluated", {
            hypothesisId: oldest.id,
            result: result.result,
            confidence: result.confidence,
          });
        }
      }

      // 検証済み仮説を取得
      setVerifiedList(loadVerifiedHypotheses());
    });
  }, []);

  const handleSelectHypothesis = useCallback((optionId: string) => {
    setSelectedHypothesis(optionId);
    setInquiryPhase("hypothesis");
  }, []);

  const handleConfirmHypothesis = useCallback(() => {
    if (!inquiry || !selectedHypothesis) return;

    const hypothesis: Hypothesis = {
      id: `hyp_${Date.now()}`,
      cardId: inquiry.evidenceCard.id,
      options: inquiry.hypothesisOptions,
      selectedOption: selectedHypothesis,
      freeText: freeText.trim() || null,
      observationProposal: inquiry.observationProposal,
      verification: null,
      createdAt: new Date().toISOString(),
    };

    recordInquiryResponse(hypothesis);
    trackOriginEvent("origin_hypothesis_created", {
      cardId: inquiry.evidenceCard.id,
      selectedOption: selectedHypothesis,
      hasFreeText: !!freeText.trim(),
    });
    setInquiryPhase("proposal");
  }, [inquiry, selectedHypothesis, freeText]);

  const handleConfirmVerification = useCallback(
    (result: HypothesisVerification["result"]) => {
      if (!pendingVerification) return;
      confirmVerification(
        pendingVerification.hypothesis.id,
        result,
        pendingVerification.proposal.evidence,
      );
      trackOriginEvent("origin_verification_confirmed", {
        hypothesisId: pendingVerification.hypothesis.id,
        cardId: pendingVerification.hypothesis.cardId,
        aiProposal: pendingVerification.proposal.result,
        userResult: result,
        agreed: pendingVerification.proposal.result === result,
        confidence: pendingVerification.proposal.confidence,
      });
      setVerificationConfirmed(true);
      setVerifiedList(loadVerifiedHypotheses());
    },
    [pendingVerification],
  );

  if (cards.length === 0 && !pendingVerification && verifiedList.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* 検証待ち仮説カード（最優先表示） */}
      <AnimatePresence>
        {pendingVerification && !verificationConfirmed && (
          <VerificationCard
            hypothesis={pendingVerification.hypothesis}
            proposal={pendingVerification.proposal}
            onConfirm={handleConfirmVerification}
          />
        )}
      </AnimatePresence>

      {/* 検証完了フィードバック */}
      <AnimatePresence>
        {verificationConfirmed && pendingVerification && (
          <motion.div
            key="verified-feedback"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-green-100/60 bg-green-50/30 backdrop-blur-sm px-4 py-3"
          >
            <p className="text-sm text-green-700/80">
              ✅ 検証結果を記録しました。この発見が証拠カードに反映されます
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 検証済み仮説のサマリ（直近3件） */}
      {verifiedList.length > 0 && (
        <div className="space-y-2">
          {verifiedList.slice(-2).map((h) => (
            <VerifiedHypothesisView key={h.id} hypothesis={h} />
          ))}
        </div>
      )}

      {/* 証拠カードリスト */}
      {cards.slice(0, maxCards).map((card) => (
        <EvidenceCardView key={card.id} card={card} verifiedHypotheses={verifiedList} />
      ))}

      {/* 問いかけカード（例外検出時のみ） */}
      <AnimatePresence>
        {inquiry && inquiryPhase !== "done" && !pendingVerification && (
          <motion.div
            key="inquiry"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <GlassCard variant="gradient" padding="md">
              {inquiryPhase === "question" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔍</span>
                    <span className="text-xs font-medium text-amber-600/80 tracking-wider">
                      パターンの変化を検出
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed mb-4">
                    {inquiry.question}
                  </p>
                  <div className="space-y-2">
                    {inquiry.hypothesisOptions.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectHypothesis(opt.id)}
                        className="w-full text-left px-3 py-2.5 rounded-xl bg-white/60 border border-white/80 hover:bg-white/80 hover:shadow-sm transition-all text-sm text-slate-600"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {inquiryPhase === "hypothesis" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <p className="text-sm text-slate-600 mb-3">
                    {inquiry.hypothesisOptions.find((o) => o.id === selectedHypothesis)?.label}
                    {selectedHypothesis === "other" && (
                      <span className="text-slate-400"> — 詳しく教えてください</span>
                    )}
                  </p>
                  {selectedHypothesis === "other" && (
                    <input
                      type="text"
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      placeholder="あなたの仮説を一言で"
                      className="w-full text-sm px-3 py-2 rounded-xl bg-white/60 border border-slate-200/60 outline-none focus:border-blue-300 transition-colors mb-3"
                      autoFocus
                    />
                  )}
                  <button
                    onClick={handleConfirmHypothesis}
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
                  >
                    この仮説で観測を始める
                  </button>
                </motion.div>
              )}

              {inquiryPhase === "proposal" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔬</span>
                    <span className="text-xs font-medium text-blue-600/80 tracking-wider">
                      観測提案
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed mb-2">
                    {inquiry.observationProposal}
                  </p>
                  <p className="text-xs text-slate-400 italic mb-3">
                    3日後に検証結果をお知らせします
                  </p>
                  <button
                    onClick={() => setInquiryPhase("done")}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    了解しました
                  </button>
                </motion.div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification Card — 検証待ち仮説の確認UI
// ---------------------------------------------------------------------------

function VerificationCard({
  hypothesis,
  proposal,
  onConfirm,
}: {
  hypothesis: Hypothesis;
  proposal: VerificationProposal;
  onConfirm: (result: HypothesisVerification["result"]) => void;
}) {
  const selectedLabel = hypothesis.options.find(
    (o) => o.id === hypothesis.selectedOption,
  )?.label ?? hypothesis.freeText ?? "";

  return (
    <motion.div
      key="verification"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard variant="elevated" padding="md">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🧪</span>
          <span className="text-xs font-medium text-purple-600/80 tracking-wider">
            仮説の検証結果
          </span>
        </div>

        {/* 元の仮説 */}
        <div className="rounded-xl bg-slate-50/60 px-3 py-2 mb-3">
          <p className="text-[10px] text-slate-400 mb-0.5">あなたの仮説</p>
          <p className="text-sm text-slate-600">{selectedLabel}</p>
        </div>

        {/* AI の判定案 */}
        <p className="text-sm text-slate-700 leading-relaxed mb-4">
          {proposal.evidence}
        </p>

        {/* ユーザー確認ボタン */}
        <p className="text-[10px] text-slate-400 mb-2">この判定は合っていますか？</p>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm("supported")}
            className="flex-1 px-3 py-2.5 rounded-xl bg-green-50 border border-green-100/60 text-green-700 text-sm font-medium hover:bg-green-100/80 transition-colors"
          >
            ✅ 合っている
          </button>
          <button
            onClick={() => onConfirm("inconclusive")}
            className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100/60 text-slate-600 text-sm font-medium hover:bg-slate-100/80 transition-colors"
          >
            🔍 まだ不明
          </button>
          <button
            onClick={() => onConfirm("exception")}
            className="flex-1 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100/60 text-amber-700 text-sm font-medium hover:bg-amber-100/80 transition-colors"
          >
            ⚡ 違った
          </button>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Verified hypothesis display
// ---------------------------------------------------------------------------

function VerifiedHypothesisView({ hypothesis }: { hypothesis: Hypothesis }) {
  if (!hypothesis.verification) return null;
  const v = hypothesis.verification;
  const meta = VERIFICATION_META[v.result];
  const selectedLabel = hypothesis.options.find(
    (o) => o.id === hypothesis.selectedOption,
  )?.label ?? hypothesis.freeText ?? "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl border border-slate-100/40 bg-white/40 backdrop-blur-sm px-4 py-2.5"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs">{meta.emoji}</span>
        <span className={`text-[10px] font-medium ${meta.color}`}>{meta.label}</span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{v.evidence}</p>
      <p className="text-[10px] text-slate-400 mt-1">
        仮説: {selectedLabel}
      </p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Individual card view (with verification feedback)
// ---------------------------------------------------------------------------

function EvidenceCardView({
  card,
  verifiedHypotheses,
}: {
  card: EvidenceCard;
  verifiedHypotheses: Hypothesis[];
}) {
  const meta = GROWTH_META[card.growth];

  // このカードに関連する検証済み仮説
  const relatedVerifications = verifiedHypotheses.filter(
    (h) => h.cardId === card.id && h.verification,
  );
  const latestVerification = relatedVerifications.length > 0
    ? relatedVerifications[relatedVerifications.length - 1]
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border backdrop-blur-sm px-4 py-3 ${meta.bgClass}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">{meta.emoji}</span>
        <div className="flex-1">
          <p className="text-sm text-slate-700 leading-relaxed">
            {card.pattern}
          </p>

          {card.frequency && (
            <p className="text-xs text-slate-500 mt-1">
              {card.frequency}
            </p>
          )}

          {card.exception && (
            <motion.div
              className="mt-2 rounded-xl bg-amber-50/50 border border-amber-100/40 px-3 py-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <p className="text-xs text-amber-700/80">
                ⚡ {card.exception.description}
              </p>
            </motion.div>
          )}

          {/* 検証結果のフィードバック */}
          {latestVerification?.verification && (
            <motion.div
              className="mt-2 rounded-xl bg-white/50 border border-slate-100/40 px-3 py-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]">
                  {VERIFICATION_META[latestVerification.verification.result].emoji}
                </span>
                <span className={`text-[10px] font-medium ${VERIFICATION_META[latestVerification.verification.result].color}`}>
                  仮説検証: {VERIFICATION_META[latestVerification.verification.result].label}
                </span>
              </div>
            </motion.div>
          )}

          {card.growth === "seed" && (
            <p className="text-xs text-slate-400 mt-1.5 italic">
              観測を続けると、このカードが育ちます
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
