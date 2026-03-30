"use client";

import * as React from "react";
import Image, { type ImageLoader } from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { OutfitProposal } from "../_lib/types";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import { SYNC_BAND_COLORS } from "../_lib/constants";
import { recordABChoice, inferPreferencesFromComparison } from "../_lib/bidirectionalFeedback";

const passthroughLoader: ImageLoader = ({ src }) => src;

interface ABComparisonCardProps {
  date: string;
  proposalA: OutfitProposal;
  proposalB: OutfitProposal;
  onChoice: (chosen: "A" | "B") => void;
}

export default function ABComparisonCard({ date, proposalA, proposalB, onChoice }: ABComparisonCardProps) {
  const [chosen, setChosen] = React.useState<"A" | "B" | null>(null);
  const [showFeedback, setShowFeedback] = React.useState(false);

  const handleChoice = (choice: "A" | "B") => {
    setChosen(choice);
    const chosenP = choice === "A" ? proposalA : proposalB;
    const rejectedP = choice === "A" ? proposalB : proposalA;

    const prefs = inferPreferencesFromComparison(chosenP.items, rejectedP.items);

    recordABChoice({
      date,
      chosenProposalId: chosenP.id,
      rejectedProposalId: rejectedP.id,
      chosenItems: chosenP.items.map(i => i.id),
      rejectedItems: rejectedP.items.map(i => i.id),
      inferredPreferences: prefs,
      timestamp: Date.now(),
    });

    setShowFeedback(true);
    setTimeout(() => {
      setShowFeedback(false);
      onChoice(choice);
    }, 1200);
  };

  if (chosen && showFeedback) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-50/60 to-green-50/40 border border-emerald-200/40 p-4 text-center"
      >
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 10 }}
          className="text-3xl block mb-2"
        >
          🧠
        </motion.span>
        <p className="text-xs font-bold text-emerald-600">好みを学習しました</p>
        <p className="text-[9px] text-emerald-500 mt-1">次の提案に反映されます</p>
      </motion.div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/30 backdrop-blur-xl border border-white/40 p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">⚡</span>
        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Quick Choice</span>
        <span className="text-[8px] text-gray-300 ml-auto">タップで好みを学習</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ProposalOption
          label="A"
          proposal={proposalA}
          isChosen={chosen === "A"}
          onSelect={() => handleChoice("A")}
        />
        <ProposalOption
          label="B"
          proposal={proposalB}
          isChosen={chosen === "B"}
          onSelect={() => handleChoice("B")}
        />
      </div>
    </div>
  );
}

function ProposalOption({
  label,
  proposal,
  isChosen,
  onSelect,
}: {
  label: string;
  proposal: OutfitProposal;
  isChosen: boolean;
  onSelect: () => void;
}) {
  const colors = SYNC_BAND_COLORS[proposal.sync.band];

  return (
    <motion.button
      onClick={onSelect}
      className={`rounded-xl border p-2.5 text-left transition-all ${
        isChosen
          ? "bg-violet-50/60 border-violet-300/50 ring-2 ring-violet-400/30"
          : "bg-white/40 border-white/50 hover:bg-white/60"
      }`}
      whileTap={{ scale: 0.95 }}
    >
      {/* ラベル + SYNC */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black text-gray-500">{label}</span>
        <span className={`text-[9px] font-bold ${colors.text}`}>
          SYNC {proposal.sync.total}
        </span>
      </div>

      {/* アイテムサムネイル */}
      <div className="flex gap-1 mb-1.5">
        {proposal.items.slice(0, 3).map((item, i) => (
          <div key={i} className="w-10 h-10 rounded-lg bg-white/60 border border-white/50 overflow-hidden flex items-center justify-center">
            {item.imageUrl ? (
              <Image src={item.imageUrl} alt="" width={40} height={40} className="w-full h-full object-contain p-0.5" loader={passthroughLoader} unoptimized />
            ) : (
              <span className="text-[10px] text-gray-300">
                {item.category === "tops" ? "👕" : item.category === "bottoms" ? "👖" : "👟"}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ムードタグ */}
      <span className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 ${colors.bg} ${colors.text}`}>
        {proposal.moodTag}
      </span>
    </motion.button>
  );
}
