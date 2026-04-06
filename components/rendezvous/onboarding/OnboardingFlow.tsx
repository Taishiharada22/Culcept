"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ResonanceCards from "./ResonanceCards";
import AvatarBirth from "./AvatarBirth";
import FirstMission from "./FirstMission";
import AvatarBirthCeremony from "./AvatarBirthCeremony";
import DealbreakersStep, { type DealbreakersData } from "./DealbreakersStep";
import type { ResonanceResult } from "@/lib/rendezvous/instantResonance";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

type Props = { userId: string };

// ① 共通オンボーディング + romantic/partner 限定 dealbreakers ステップ
// ResonanceCards → AvatarBirth → FirstMission → (Dealbreakers if romantic/partner)
type Step = "resonance" | "resonance_burst" | "birth" | "birth_ceremony" | "mission" | "dealbreakers";

const DISPLAY_STEPS: string[] = ["resonance", "birth", "mission"];

// =============================================================================
// Transition overlays between steps
// =============================================================================

/** Particle burst after category selection */
function ParticleBurstTransition({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "linear-gradient(180deg, #F8F7FF 0%, #FFF0F5 50%, #E8FFFE 100%)",
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => {
        setTimeout(onComplete, 1200);
      }}
    >
      {/* Center burst */}
      <motion.div
        className="w-4 h-4 rounded-full"
        style={{ background: "rgba(139,92,246,0.8)" }}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 3, 0], opacity: [1, 0.6, 0] }}
        transition={{ duration: 0.6 }}
      />

      {/* Particles flying outward */}
      {[...Array(16)].map((_, i) => {
        const angle = (i * 22.5 * Math.PI) / 180;
        const distance = 150 + Math.random() * 100;
        return (
          <motion.div
            key={`burst-${i}`}
            className="absolute w-2 h-2 rounded-full"
            style={{
              background:
                i % 3 === 0
                  ? "#EC4899"
                  : i % 3 === 1
                  ? "#8B5CF6"
                  : "#06B6D4",
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: 0,
              opacity: 0,
            }}
            transition={{
              duration: 0.8,
              delay: Math.random() * 0.2,
              ease: "easeOut",
            }}
          />
        );
      })}

      {/* Text */}
      <motion.p
        className="absolute text-sm font-bold text-violet-600"
        style={{ top: "55%" }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: [0, 1, 0], y: [20, 0, -10] }}
        transition={{ duration: 1.2, delay: 0.3 }}
      >
        共鳴の種が見つかりました
      </motion.p>
    </motion.div>
  );
}


// =============================================================================
// OnboardingFlow (enhanced with dramatic transitions)
// =============================================================================

export default function OnboardingFlow({ userId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("resonance");
  const [resonanceResult, setResonanceResult] = useState<ResonanceResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [showBirthCeremony, setShowBirthCeremony] = useState(false);
  // ① Dealbreakers: mission で選択されたカテゴリを保持
  const [pendingMissionData, setPendingMissionData] = useState<{
    selectedQuestions: string[];
    enabledCategories: RendezvousCategory[];
  } | null>(null);

  // Map to display step index for the progress indicator
  const displayStepIndex = (() => {
    switch (step) {
      case "resonance":
      case "resonance_burst":
        return 0;
      case "birth":
      case "birth_ceremony":
        return 1;
      case "mission":
        return 2;
      default:
        return 0;
    }
  })();

  const handleResonanceComplete = useCallback((result: ResonanceResult) => {
    setResonanceResult(result);
    // Show particle burst, then go to birth
    setStep("resonance_burst");
  }, []);

  const handleBirthNext = useCallback(() => {
    // Show birth ceremony
    setShowBirthCeremony(true);
  }, []);

  const handleBirthCeremonyComplete = useCallback(() => {
    setShowBirthCeremony(false);
    // 共通オンボーディング: birth ceremony → mission に直行
    setStep("mission");
  }, []);

  // ① mission 完了: romantic/partner が含まれていれば dealbreakers へ、それ以外は直接保存
  const handleMissionComplete = useCallback(
    (data: {
      selectedQuestions: string[];
      enabledCategories: RendezvousCategory[];
    }) => {
      const needsDealbreakers =
        data.enabledCategories.includes("romantic") ||
        data.enabledCategories.includes("partner");

      if (needsDealbreakers) {
        setPendingMissionData(data);
        setStep("dealbreakers");
        return;
      }

      // romantic/partner なし → 直接保存
      void finalizeOnboarding(data);
    },
    [],
  );

  // ① dealbreakers 完了後 + mission データを統合して保存
  const handleDealbreakersComplete = useCallback(
    (dealbreakers: DealbreakersData) => {
      if (!pendingMissionData) return;
      void finalizeOnboarding(pendingMissionData, dealbreakers);
    },
    [pendingMissionData],
  );

  // 最終保存処理（mission + optional dealbreakers）
  const finalizeOnboarding = useCallback(
    async (
      data: { selectedQuestions: string[]; enabledCategories: RendezvousCategory[] },
      dealbreakers?: DealbreakersData,
    ) => {
      setSaving(true);
      try {
        const res = await fetch("/api/rendezvous/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partialVector: resonanceResult?.partialVector ?? {},
            discoveredAxes: resonanceResult?.discoveredAxes ?? [],
            confidence: resonanceResult?.confidence ?? {},
            selectedQuestions: data.selectedQuestions,
            enabledCategories: data.enabledCategories,
            dealbreakers: dealbreakers ?? undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "保存に失敗しました");
        }

        // 心理学プロファイル自動生成（バックグラウンド）
        fetch("/api/rendezvous/psychological-profile", { method: "POST", credentials: "include" }).catch(() => {});

        // 恋愛カテゴリが含まれている場合、本人確認を pending として作成
        const needsVerification = data.enabledCategories.includes("romantic");
        if (needsVerification) {
          fetch("/api/rendezvous/verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            credentials: "include",
          }).catch(() => {});
        }

        router.push("/rendezvous");
      } catch (e: unknown) {
        console.error("Onboarding save failed:", e);
        setSaving(false);
      }
    },
    [resonanceResult, router],
  );

  return (
    <div
      className="min-h-[100dvh]"
      style={{
        background:
          "linear-gradient(180deg, #F8F7FF 0%, #FFF0F5 50%, #E8FFFE 100%)",
      }}
    >
      {/* Step indicator */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
        {DISPLAY_STEPS.map((s, i) => (
          <motion.div
            key={s}
            className="flex items-center gap-3"
          >
            <motion.div
              animate={{
                width: i === displayStepIndex ? 24 : 8,
                height: 8,
                backgroundColor:
                  i <= displayStepIndex
                    ? "rgba(139,92,246,0.8)"
                    : "rgba(139,92,246,0.15)",
                borderRadius: 4,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            />
          </motion.div>
        ))}
      </div>

      {/* ================================================================= */}
      {/* Transition overlays                                                */}
      {/* ================================================================= */}
      <AnimatePresence>
        {step === "resonance_burst" && (
          <ParticleBurstTransition
            onComplete={() => setStep("birth")}
          />
        )}
      </AnimatePresence>

      {/* Avatar birth ceremony */}
      {showBirthCeremony && (
        <AvatarBirthCeremony onComplete={handleBirthCeremonyComplete} />
      )}

      {/* ================================================================= */}
      {/* Step content (unchanged core logic, enhanced transitions)         */}
      {/* ================================================================= */}
      <AnimatePresence mode="wait">
        {step === "resonance" && (
          <motion.div
            key="resonance"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <ResonanceCards onComplete={handleResonanceComplete} />
          </motion.div>
        )}

        {step === "birth" && resonanceResult && (
          <motion.div
            key="birth"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <AvatarBirth result={resonanceResult} onNext={handleBirthNext} />
          </motion.div>
        )}

        {step === "mission" && (
          <motion.div
            key="mission"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <FirstMission onComplete={handleMissionComplete} saving={saving} />
          </motion.div>
        )}

        {/* ① Dealbreakers step: romantic/partner カテ��リ選択時のみ */}
        {step === "dealbreakers" && pendingMissionData && (
          <motion.div
            key="dealbreakers"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <DealbreakersStep
              enabledCategories={pendingMissionData.enabledCategories}
              onComplete={handleDealbreakersComplete}
              saving={saving}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
