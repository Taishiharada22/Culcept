"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import type { Contradiction } from "@/lib/origin/v7/behavioralLaws";
import type {
  ContradictionResolution,
  DomainResolution,
  LifeDomain,
} from "@/lib/origin/v7/types";
import { DOMAIN_LABELS } from "@/lib/origin/v7/types";

type Props = {
  contradictions: Contradiction[];
  resolutions: ContradictionResolution[];
  onSaveResolution: (resolution: ContradictionResolution) => void;
};

const ALL_DOMAINS: LifeDomain[] = ["work", "romance", "friendship", "family", "solitude"];

const DOMAIN_ICONS: Record<LifeDomain, string> = {
  work: "💼",
  romance: "💕",
  friendship: "🤝",
  family: "🏠",
  solitude: "🌙",
};

type WinningSide = "A" | "B" | "both" | "neither";

export default function ContradictionExplorer({
  contradictions,
  resolutions,
  onSaveResolution,
}: Props) {
  if (contradictions.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-3 space-y-2"
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <span className="text-sm">⚖️</span>
        内的矛盾の文脈
      </h3>
      <p className="text-[10px] text-gray-400">
        どの場面でどちらが強いか、文脈ごとに確認できます
      </p>

      {contradictions.map((c) => (
        <TensionCard
          key={c.id}
          contradiction={c}
          resolution={resolutions.find((r) => r.contradictionId === c.id)}
          onSave={onSaveResolution}
        />
      ))}
    </motion.section>
  );
}

/* ━━━ TensionCard ━━━ */

function TensionCard({
  contradiction,
  resolution,
  onSave,
}: {
  contradiction: Contradiction;
  resolution?: ContradictionResolution;
  onSave: (resolution: ContradictionResolution) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [annotation, setAnnotation] = useState(resolution?.userAnnotation ?? "");

  // ドメインごとの解決状態
  const [domainWinners, setDomainWinners] = useState<Record<LifeDomain, WinningSide>>(() => {
    const initial: Record<LifeDomain, WinningSide> = {
      work: "both",
      romance: "both",
      friendship: "both",
      family: "both",
      solitude: "both",
    };
    if (resolution) {
      for (const r of resolution.resolutions) {
        initial[r.domain] = r.winningSide;
      }
    }
    return initial;
  });

  const handleDomainToggle = useCallback(
    (domain: LifeDomain) => {
      setDomainWinners((prev) => {
        const current = prev[domain];
        const cycle: WinningSide[] = ["A", "B", "both", "neither"];
        const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
        const next = { ...prev, [domain]: cycle[nextIdx] };

        // 自動保存
        const resolutions: DomainResolution[] = ALL_DOMAINS.map((d) => ({
          domain: d,
          winningSide: next[d],
          intensity: next[d] === "both" || next[d] === "neither" ? 0.5 : 0.8,
          evidence: null,
        }));
        onSave({
          contradictionId: contradiction.id,
          sideA: contradiction.sideA,
          sideB: contradiction.sideB,
          resolutions,
          userAnnotation: annotation || null,
          resolvedAt: new Date().toISOString(),
        });

        return next;
      });
    },
    [contradiction, annotation, onSave],
  );

  const handleAnnotationBlur = useCallback(() => {
    const resolutions: DomainResolution[] = ALL_DOMAINS.map((d) => ({
      domain: d,
      winningSide: domainWinners[d],
      intensity: domainWinners[d] === "both" || domainWinners[d] === "neither" ? 0.5 : 0.8,
      evidence: null,
    }));
    onSave({
      contradictionId: contradiction.id,
      sideA: contradiction.sideA,
      sideB: contradiction.sideB,
      resolutions,
      userAnnotation: annotation || null,
      resolvedAt: new Date().toISOString(),
    });
  }, [contradiction, domainWinners, annotation, onSave]);

  // 解決済みドメイン数
  const resolvedCount = ALL_DOMAINS.filter(
    (d) => domainWinners[d] !== "both",
  ).length;

  return (
    <motion.div
      layout
      className="overflow-hidden rounded-xl border border-rose-100/50 bg-rose-50/15 px-3 py-2.5"
    >
      {/* Tension bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="shrink-0 text-[11px] font-semibold text-rose-400">
          {contradiction.sideA}
        </span>
        <div className="relative flex-1">
          <div className="h-px w-full bg-rose-200/40" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 text-[9px] text-gray-400">
            ↔
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-blue-400">
          {contradiction.sideB}
        </span>
        {resolvedCount > 0 && (
          <span className="ml-1 shrink-0 rounded-full bg-amber-100/60 px-1.5 py-0.5 text-[8px] text-amber-600">
            {resolvedCount}/5
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2"
          >
            {/* Source info */}
            <p className="text-[9px] text-gray-400">
              {contradiction.sourceA} / {contradiction.sourceB}
              {contradiction.tension === "high" && (
                <span className="ml-1 text-rose-400">（強い張力）</span>
              )}
            </p>

            {/* Domain resolution grid */}
            <div className="space-y-1">
              {ALL_DOMAINS.map((domain) => {
                const winner = domainWinners[domain];
                return (
                  <motion.button
                    key={domain}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleDomainToggle(domain)}
                    className="flex w-full items-center gap-2 rounded-lg border border-gray-100/40 bg-white/30 px-2.5 py-1.5 text-left"
                  >
                    <span className="text-[10px]">{DOMAIN_ICONS[domain]}</span>
                    <span className="min-w-0 flex-1 text-[10px] text-gray-500">
                      {DOMAIN_LABELS[domain]}
                    </span>
                    <WinnerIndicator
                      winner={winner}
                      sideA={contradiction.sideA}
                      sideB={contradiction.sideB}
                    />
                  </motion.button>
                );
              })}
            </div>

            {/* Annotation */}
            <input
              type="text"
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              onBlur={handleAnnotationBlur}
              placeholder="自分なりの解釈メモ（任意）"
              className="w-full rounded-lg border border-gray-100/50 bg-white/40 px-2.5 py-1.5 text-[10px] text-gray-600 placeholder:text-gray-300 outline-none focus:border-amber-200/50"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ━━━ WinnerIndicator ━━━ */

function WinnerIndicator({
  winner,
  sideA,
  sideB,
}: {
  winner: WinningSide;
  sideA: string;
  sideB: string;
}) {
  if (winner === "A") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-medium text-rose-500">
        {sideA}
      </span>
    );
  }
  if (winner === "B") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-medium text-blue-500">
        {sideB}
      </span>
    );
  }
  if (winner === "neither") {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] text-gray-400">
        どちらでもない
      </span>
    );
  }
  return (
    <span className="text-[9px] text-gray-300">タップで選択</span>
  );
}
