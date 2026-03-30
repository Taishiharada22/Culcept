// app/stargazer/simulation/SimulationClient.tsx
// 変容シミュレーション — 「もし自分が変わったら」を体験する
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  generateSimulations,
  saveSimulationInterest,
  loadSimulationInterest,
  type SimulationScenario,
} from "@/lib/stargazer/transformSimulation";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage keys
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const AXIS_SCORES_KEY = "stargazer_axis_scores_v1";
const ARCHETYPE_KEY = "stargazer_archetype_v1";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type TabKey = "situation" | "current" | "transformed" | "cost";

const TABS: { key: TabKey; label: string }[] = [
  { key: "situation", label: "状況" },
  { key: "current", label: "今の自分" },
  { key: "transformed", label: "変容後" },
  { key: "cost", label: "代価" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Simulation Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SimulationCard({
  scenario,
  index,
}: {
  scenario: SimulationScenario;
  index: number;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("situation");

  const tabContent: Record<TabKey, React.ReactNode> = {
    situation: (
      <motion.div
        key="situation"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
        <p
          className="font-body text-sm leading-relaxed"
          style={{ color: "rgba(50,55,80,0.82)" }}
        >
          {scenario.situation}
        </p>
      </motion.div>
    ),
    current: (
      <motion.div
        key="current"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(100,110,160,0.06)",
            border: "1px solid rgba(100,110,160,0.12)",
          }}
        >
          <p
            className="font-body text-sm leading-relaxed"
            style={{ color: "rgba(50,55,80,0.78)" }}
          >
            {scenario.currentResponse}
          </p>
        </div>
      </motion.div>
    ),
    transformed: (
      <motion.div
        key="transformed"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
        <div
          className="rounded-xl p-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(176,144,80,0.08) 0%, rgba(201,184,138,0.06) 100%)",
            border: "1px solid rgba(176,144,80,0.2)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="font-mono-sg text-xs tracking-[0.18em] uppercase font-medium"
              style={{ color: "rgba(176,144,80,0.7)" }}
            >
              変容後の世界
            </span>
            <div
              className="h-px flex-1"
              style={{
                background:
                  "linear-gradient(to right, rgba(176,144,80,0.3), transparent)",
              }}
            />
          </div>
          <p
            className="font-body text-sm leading-relaxed"
            style={{ color: "rgba(50,45,30,0.82)" }}
          >
            {scenario.transformedResponse}
          </p>
        </div>
      </motion.div>
    ),
    cost: (
      <motion.div
        key="cost"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
        className="space-y-3"
      >
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(180,100,100,0.05)",
            border: "1px solid rgba(180,100,100,0.12)",
          }}
        >
          <p
            className="font-mono-sg text-xs uppercase tracking-[0.15em] mb-2"
            style={{ color: "rgba(180,100,100,0.6)" }}
          >
            失うもの
          </p>
          <p
            className="font-body text-sm leading-relaxed"
            style={{ color: "rgba(50,55,80,0.78)" }}
          >
            {scenario.cost}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(100,160,140,0.05)",
            border: "1px solid rgba(100,160,140,0.12)",
          }}
        >
          <p
            className="font-mono-sg text-xs uppercase tracking-[0.15em] mb-2"
            style={{ color: "rgba(80,150,130,0.6)" }}
          >
            感じること
          </p>
          <p
            className="font-body text-sm leading-relaxed"
            style={{ color: "rgba(50,55,80,0.78)" }}
          >
            {scenario.emotionalImpact}
          </p>
        </div>
      </motion.div>
    ),
  };

  return (
    <FadeInView delay={index * 0.12}>
      <GlassCard className="w-full">
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <h3
              className="font-display text-lg font-semibold"
              style={{ color: "rgba(30,35,55,0.9)" }}
            >
              {scenario.title}
            </h3>
            <GlassBadge variant="default">
              <span className="font-mono-sg text-xs">
                {scenario.direction === "right" ? "拡張" : "深化"}
              </span>
            </GlassBadge>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{
              background: "rgba(100,110,160,0.06)",
              border: "1px solid rgba(100,110,160,0.1)",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 rounded-lg py-1.5 px-2 text-center transition-all duration-200"
                style={{
                  background:
                    activeTab === tab.key
                      ? "rgba(255,255,255,0.75)"
                      : "transparent",
                  boxShadow:
                    activeTab === tab.key
                      ? "0 1px 4px rgba(0,0,0,0.08)"
                      : "none",
                  color:
                    activeTab === tab.key
                      ? "rgba(30,35,55,0.88)"
                      : "rgba(100,110,140,0.6)",
                }}
              >
                <span className="font-body text-xs font-medium">
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-[100px]">
            <AnimatePresence mode="wait">
              {tabContent[activeTab]}
            </AnimatePresence>
          </div>

          {/* Axis indicator */}
          <div
            className="flex items-center gap-2 pt-1"
            style={{ borderTop: "1px solid rgba(100,110,160,0.08)" }}
          >
            <span
              className="font-mono-sg text-xs"
              style={{ color: "rgba(120,130,160,0.5)" }}
            >
              変化軸:
            </span>
            <span
              className="font-mono-sg text-xs"
              style={{ color: "rgba(120,130,160,0.7)" }}
            >
              {scenario.changedAxis.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Client
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SimulationClient() {
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    setMounted(true);

    // Load axis scores from localStorage
    let axisScores: Partial<Record<TraitAxisKey, number>> = {};
    let archetype: string | undefined;

    try {
      const rawScores = localStorage.getItem(AXIS_SCORES_KEY);
      if (rawScores) {
        axisScores = JSON.parse(rawScores) as Partial<Record<TraitAxisKey, number>>;
      }
    } catch {
      // ignore
    }

    try {
      const rawArchetype = localStorage.getItem(ARCHETYPE_KEY);
      if (rawArchetype) {
        archetype = rawArchetype;
      }
    } catch {
      // ignore
    }

    const generated = generateSimulations(axisScores, archetype);
    setScenarios(generated);

    // Restore previously saved interest
    const savedInterest = loadSimulationInterest();
    if (savedInterest) {
      setSelectedInterest(savedInterest.simulationId);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function handleSelectInterest(scenario: SimulationScenario) {
    setSelectedInterest(scenario.id);
    saveSimulationInterest(scenario);
  }

  if (!mounted) return null;

  const hasData = scenarios.length > 0;

  return (
    <div
      className="relative min-h-screen"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Back nav */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-2">
        <Link href="/stargazer">
          <motion.div
            className="inline-flex items-center gap-2 font-body text-xs"
            style={{ color: "rgba(100,110,150,0.55)" }}
            whileHover={{ x: -2 }}
            transition={{ duration: 0.18 }}
          >
            <span>←</span>
            <span>深層観測</span>
          </motion.div>
        </Link>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-24 space-y-8">
        {/* ── Hero ── */}
        <FadeInView>
          <div className="pt-6 pb-2 space-y-4">
            {/* Eyebrow */}
            <div className="flex items-center gap-3">
              <div
                className="h-px flex-1"
                style={{
                  background:
                    "linear-gradient(to right, rgba(176,144,80,0.3), transparent)",
                }}
              />
              <span
                className="font-mono-sg text-xs tracking-[0.3em] uppercase"
                style={{ color: "rgba(176,144,80,0.6)" }}
              >
                変容シミュレーション
              </span>
              <div
                className="h-px flex-1"
                style={{
                  background:
                    "linear-gradient(to left, rgba(176,144,80,0.3), transparent)",
                }}
              />
            </div>

            {/* Title */}
            <h1
              className="font-display text-4xl font-semibold leading-snug"
              style={{ color: "rgba(30,35,55,0.9)" }}
            >
              変容シミュレーション
            </h1>

            {/* Subtitle */}
            <p
              className="font-body text-sm leading-relaxed"
              style={{ color: "rgba(100,105,140,0.7)" }}
            >
              もし自分が変わったら、何が起きるか
            </p>

            {/* Description */}
            <p
              className="font-body text-sm leading-relaxed"
              style={{ color: "rgba(80,85,120,0.6)" }}
            >
              観測されたあなたの傾向をもとに、「もし違う自分だったら」をシミュレートします。
              これは正解を示すものではなく、可能性の地図です。
            </p>
          </div>
        </FadeInView>

        {/* ── Main content ── */}
        {!hasData ? (
          /* Empty state */
          <FadeInView delay={0.2}>
            <GlassCard>
              <div className="p-8 text-center space-y-4">
                <motion.div
                  className="text-4xl"
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  🔭
                </motion.div>
                <p
                  className="font-body text-sm leading-relaxed"
                  style={{ color: "rgba(100,105,140,0.65)" }}
                >
                  観測データが十分に蓄積されると、あなた専用の変容シミュレーションが生成されます。
                </p>
                <p
                  className="font-body text-xs"
                  style={{ color: "rgba(130,135,160,0.5)" }}
                >
                  まずは深層観測で観測を続けてください。
                </p>
                <div className="pt-2">
                  <Link href="/stargazer">
                    <GlassButton variant="primary" size="sm">
                      観測を始める
                    </GlassButton>
                  </Link>
                </div>
              </div>
            </GlassCard>
          </FadeInView>
        ) : (
          /* Simulation cards */
          <div className="space-y-5">
            {scenarios.map((scenario, i) => (
              <SimulationCard key={scenario.id} scenario={scenario} index={i} />
            ))}
          </div>
        )}

        {/* ── Reflection section ── */}
        {hasData && (
          <FadeInView delay={0.3}>
            <div className="space-y-4">
              {/* Section header */}
              <div className="flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(to right, rgba(160,170,200,0.15), transparent)",
                  }}
                />
                <span
                  className="font-mono-sg text-xs tracking-[0.22em] uppercase font-medium"
                  style={{ color: "rgba(100,105,130,0.45)" }}
                >
                  内省
                </span>
                <div
                  className="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(to left, rgba(160,170,200,0.15), transparent)",
                  }}
                />
              </div>

              <GlassCard>
                <div className="p-5 space-y-4">
                  <p
                    className="font-body text-sm leading-relaxed"
                    style={{ color: "rgba(50,55,80,0.75)" }}
                  >
                    この中で、最も興味を引かれた変容はどれですか？
                  </p>
                  <p
                    className="font-body text-xs"
                    style={{ color: "rgba(120,125,150,0.5)" }}
                  >
                    選択はあなたの変容意図として記録され、以降の観測に活用されます。
                  </p>

                  <div className="space-y-2 pt-1">
                    {scenarios.map((scenario) => {
                      const isSelected = selectedInterest === scenario.id;
                      return (
                        <motion.button
                          key={scenario.id}
                          onClick={() => handleSelectInterest(scenario)}
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.99 }}
                          className="w-full text-left rounded-xl px-4 py-3 transition-all duration-200"
                          style={{
                            background: isSelected
                              ? "linear-gradient(135deg, rgba(176,144,80,0.12) 0%, rgba(201,184,138,0.08) 100%)"
                              : "rgba(100,110,160,0.04)",
                            border: isSelected
                              ? "1px solid rgba(176,144,80,0.25)"
                              : "1px solid rgba(100,110,160,0.1)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className="font-body text-sm"
                              style={{
                                color: isSelected
                                  ? "rgba(140,108,50,0.9)"
                                  : "rgba(70,75,110,0.7)",
                              }}
                            >
                              {scenario.title}
                            </span>
                            <AnimatePresence>
                              {isSelected && (
                                <motion.span
                                  key="check"
                                  initial={{ opacity: 0, scale: 0.6 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.6 }}
                                  transition={{ duration: 0.2 }}
                                  className="font-mono-sg text-xs flex-shrink-0"
                                  style={{ color: "rgba(176,144,80,0.7)" }}
                                >
                                  選択中
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </GlassCard>
            </div>
          </FadeInView>
        )}

        {/* ── Footer note ── */}
        <FadeInView delay={0.4}>
          <p
            className="text-center font-body text-xs leading-relaxed"
            style={{ color: "rgba(140,145,170,0.45)" }}
          >
            シミュレーションは現在の観測データを基に生成されます。
            <br />
            観測が深まるほど、精度が上がります。
          </p>
        </FadeInView>
      </div>
    </div>
  );
}
