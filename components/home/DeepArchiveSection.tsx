"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const YourSelfSection = dynamic(() => import("./YourSelfSection"), { ssr: false });
const BehavioralPatternCard = dynamic(() => import("./BehavioralPatternCard"), { ssr: false });
const GhostResonanceCard = dynamic(() => import("./GhostResonanceCard"), { ssr: false });
const PsycheSignatureDisplay = dynamic(() => import("./PsycheSignatureDisplay"), { ssr: false });
const FeatureUnlockTeaser = dynamic(() => import("./FeatureUnlockTeaser"), { ssr: false });

type Props = {
  sgData: any;
  identityLive: any;
  ptData: any;
  identityElements: any[];
  genomeCompleteness: number;
  journeyMapProps: any;
  ghostData: any;
  psycheSignature: any;
  homeStateDepth: string;
  observationCount: number;
};

export default function DeepArchiveSection({
  sgData,
  identityLive,
  ptData,
  identityElements,
  genomeCompleteness,
  journeyMapProps,
  ghostData,
  psycheSignature,
  homeStateDepth,
  observationCount,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="px-4 pb-6">
      {/* Section header + toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-3"
      >
        <span className="text-[9px] font-mono tracking-wider text-text4">DEEP DIVE</span>
        <div className="flex-1 h-px bg-black/[0.04]" />
        <span className="text-[9px] text-text4">
          {expanded ? "閉じる" : "自己の深層を見る"}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-[10px] text-text4"
        >
          ▾
        </motion.span>
      </button>

      {/* Preview when collapsed */}
      {!expanded && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {identityElements.slice(0, 4).map((el: any) => (
            <div
              key={el.key}
              className="flex-shrink-0 rounded-xl px-3 py-2 min-w-[100px]"
              style={{
                background: `${el.color}08`,
                border: `1px solid ${el.color}12`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">{el.emoji}</span>
                <span className="text-[9px] font-semibold text-text2">{el.label}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: `${el.color}10` }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${el.pct}%`,
                    background: `${el.color}50`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-2">
              {/* Feature unlock teaser */}
              {homeStateDepth !== "master" && (
                <FeatureUnlockTeaser currentObservations={observationCount} />
              )}

              {/* Your Self / Identity */}
              <YourSelfSection
                sgData={sgData}
                identityLive={identityLive}
                ptData={ptData}
                identityElements={identityElements}
                genomeCompleteness={genomeCompleteness}
                journeyMapProps={journeyMapProps}
              />

              {/* Behavioral Pattern */}
              <BehavioralPatternCard />

              {/* Ghost Resonance */}
              {ghostData && <GhostResonanceCard ghost={ghostData} />}

              {/* Psyche Signature */}
              {psycheSignature && <PsycheSignatureDisplay signature={psycheSignature} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
