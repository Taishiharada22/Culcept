"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ResonanceCards from "./ResonanceCards";
import AvatarBirth from "./AvatarBirth";
import PhotoRegistration from "./PhotoRegistration";
import AppearancePreferences from "./AppearancePreferences";
import type { AppearancePreferencesData } from "./AppearancePreferences";
import FirstMission from "./FirstMission";
import AvatarBirthCeremony from "./AvatarBirthCeremony";
import type { ResonanceResult } from "@/lib/rendezvous/instantResonance";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

type Props = { userId: string };

type Step = "resonance" | "resonance_burst" | "birth" | "birth_ceremony" | "photos" | "photos_orbit" | "appearance" | "appearance_wash" | "mission";

const DISPLAY_STEPS: string[] = ["resonance", "birth", "photos", "appearance", "mission"];

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

/** Photo orbit transition */
function PhotoOrbitTransition({
  photos,
  onComplete,
}: {
  photos: Record<string, string>;
  onComplete: () => void;
}) {
  const photoUrls = Object.values(photos).slice(0, 4);

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
        setTimeout(onComplete, 1500);
      }}
    >
      {/* Central avatar */}
      <motion.div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: "rgba(139,92,246,0.1)",
          border: "2px solid rgba(139,92,246,0.2)",
        }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <span className="text-3xl">&#x1F47B;</span>
      </motion.div>

      {/* Orbiting photos */}
      {photoUrls.map((url, i) => {
        const startAngle = (i * 90 * Math.PI) / 180;
        return (
          <motion.div
            key={`orbit-photo-${i}`}
            className="absolute w-12 h-12 rounded-full overflow-hidden"
            style={{
              border: "2px solid rgba(139,92,246,0.3)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
            initial={{
              x: 0,
              y: 0,
              opacity: 0,
              scale: 0.5,
            }}
            animate={{
              x: [0, Math.cos(startAngle) * 80, Math.cos(startAngle + Math.PI) * 80, Math.cos(startAngle + Math.PI * 2) * 80],
              y: [0, Math.sin(startAngle) * 80, Math.sin(startAngle + Math.PI) * 80, Math.sin(startAngle + Math.PI * 2) * 80],
              opacity: [0, 1, 1, 0],
              scale: [0.5, 1, 1, 0.5],
            }}
            transition={{
              duration: 1.5,
              delay: i * 0.1,
              ease: "easeInOut",
            }}
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
          </motion.div>
        );
      })}

      {/* No photos fallback */}
      {photoUrls.length === 0 && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`orbit-dot-${i}`}
              className="absolute w-3 h-3 rounded-full"
              style={{
                background: i % 2 === 0 ? "#EC4899" : "#8B5CF6",
              }}
              animate={{
                x: [
                  Math.cos((i * 120 * Math.PI) / 180) * 60,
                  Math.cos(((i * 120 + 360) * Math.PI) / 180) * 60,
                ],
                y: [
                  Math.sin((i * 120 * Math.PI) / 180) * 60,
                  Math.sin(((i * 120 + 360) * Math.PI) / 180) * 60,
                ],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                ease: "linear",
              }}
            />
          ))}
        </>
      )}
    </motion.div>
  );
}

/** Color wash transition after appearance preferences */
function ColorWashTransition({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => {
        setTimeout(onComplete, 1200);
      }}
    >
      {/* Color washes sweeping across the screen */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #FFF0F5, #F0E6FF)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.2, times: [0, 0.2, 0.8, 1] }}
      />
      <motion.div
        className="absolute inset-0"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        style={{
          background: "linear-gradient(90deg, transparent, rgba(233,30,99,0.15), rgba(123,97,255,0.15), transparent)",
        }}
      />
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, delay: 0.3 }}
      >
        <p className="text-sm font-bold text-violet-600">
          あなたの美意識を記録しました
        </p>
      </motion.div>
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
  const [appearanceData, setAppearanceData] = useState<AppearancePreferencesData | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showBirthCeremony, setShowBirthCeremony] = useState(false);

  // Map to display step index for the progress indicator
  const displayStepIndex = (() => {
    switch (step) {
      case "resonance":
      case "resonance_burst":
        return 0;
      case "birth":
      case "birth_ceremony":
        return 1;
      case "photos":
      case "photos_orbit":
        return 2;
      case "appearance":
      case "appearance_wash":
        return 3;
      case "mission":
        return 4;
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
    setStep("photos");
  }, []);

  const handlePhotosComplete = useCallback((photos: Record<string, string>) => {
    setUploadedPhotos(photos);
    // Show orbit transition
    setStep("photos_orbit");
  }, []);

  const handlePhotosSkip = useCallback(() => {
    setStep("appearance");
  }, []);

  const handleAppearanceComplete = useCallback(
    (data: AppearancePreferencesData) => {
      setAppearanceData(data);
      // Save appearance preferences in the background
      fetch("/api/rendezvous/appearance-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "romantic",
          matchingPriority: data.matchingPriority,
          preferredBodyTypes: data.preferredBodyTypes,
          preferredPersonalColorSeasons: data.preferredPersonalColorSeasons,
          preferredHairFeatures: data.preferredHairFeatures,
          appearancePriorityOrder: data.preferredFaceTypes,
        }),
      }).catch(() => {});
      // Show color wash transition
      setStep("appearance_wash");
    },
    [],
  );

  const handleMissionComplete = useCallback(
    async (data: {
      selectedQuestions: string[];
      enabledCategories: RendezvousCategory[];
    }) => {
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
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "保存に失敗しました");
        }

        // 心理学プロファイル自動生成（バックグラウンド）
        fetch("/api/rendezvous/psychological-profile", { method: "POST" }).catch(() => {});

        // 恋愛カテゴリが含まれている場合、本人確認を pending として作成
        const needsVerification = data.enabledCategories.includes("romantic");
        if (needsVerification) {
          fetch("/api/rendezvous/verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
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
        {step === "photos_orbit" && (
          <PhotoOrbitTransition
            photos={uploadedPhotos}
            onComplete={() => setStep("appearance")}
          />
        )}
        {step === "appearance_wash" && (
          <ColorWashTransition
            onComplete={() => setStep("mission")}
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

        {step === "photos" && (
          <motion.div
            key="photos"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <PhotoRegistration
              category={resonanceResult?.discoveredAxes?.[0]?.axis ?? "romantic"}
              onComplete={handlePhotosComplete}
              onSkip={handlePhotosSkip}
            />
          </motion.div>
        )}

        {step === "appearance" && (
          <motion.div
            key="appearance"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="px-5 pt-14 pb-8"
          >
            <div className="text-center mb-6">
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">
                理想の相手の外見
              </h2>
              <p className="text-sm text-slate-500">
                あなたの好みを教えてください。後から変更もできます。
              </p>
            </div>
            <AppearancePreferences onComplete={handleAppearanceComplete} />
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
            {/* 本人確認案内（恋愛カテゴリの場合に表示） */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="mx-5 mt-14 mb-2 p-3 rounded-xl"
              style={{
                background: "rgba(139, 92, 246, 0.08)",
                border: "1px solid rgba(139, 92, 246, 0.15)",
              }}
            >
              <p className="text-xs text-violet-700 leading-relaxed">
                恋愛カテゴリをご利用の場合、本人確認が必要です。写真と身分証の提出後、確認が完了次第ランデブーが解放されます。
              </p>
            </motion.div>
            <FirstMission onComplete={handleMissionComplete} saving={saving} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
