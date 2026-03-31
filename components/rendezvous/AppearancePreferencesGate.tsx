"use client";

/**
 * AppearancePreferencesGate
 *
 * 外見の好みのゲートコンポーネント（children ラッパー型）。
 * - 未設定 → AppearancePreferences 入力画面を表示
 * - 設定済み → children をそのまま描画（自動スキップ）
 *
 * 恋愛レーン・パートナーレーンの入口に置く。
 * 保存先は共通（APPEARANCE_SHARED_CATEGORY）。
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import AppearancePreferences from "@/components/rendezvous/onboarding/AppearancePreferences";
import type { AppearancePreferencesData } from "@/components/rendezvous/onboarding/AppearancePreferences";
import { APPEARANCE_SHARED_CATEGORY, isAppearanceComplete } from "@/lib/rendezvous/appearanceShared";
import type { FaceTypeId } from "@/lib/rendezvous/faceTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  children: ReactNode;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AppearancePreferencesGate({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [passed, setPassed] = useState(false);

  // Check if appearance preferences are already set
  useEffect(() => {
    fetch(`/api/rendezvous/appearance-preferences`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.preferences) {
          const complete = isAppearanceComplete({
            appearancePriorityOrder: d.preferences.appearancePriorityOrder,
            preferredBodyTypes: d.preferences.preferredBodyTypes,
          });
          setPassed(complete);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Handle input completion
  const handleComplete = useCallback((data: AppearancePreferencesData) => {
    // Save to shared category
    fetch("/api/rendezvous/appearance-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        matchingPriority: data.matchingPriority,
        preferredBodyTypes: data.preferredBodyTypes,
        preferredPersonalColorSeasons: data.preferredPersonalColorSeasons,
        preferredHairFeatures: data.preferredHairFeatures,
        appearancePriorityOrder: data.preferredFaceTypes,
      }),
    }).catch(() => {});

    setPassed(true);
  }, []);

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full"
        />
      </div>
    );
  }

  // --- Already set → render children (auto-skip) ---
  if (passed) {
    return <>{children}</>;
  }

  // --- Not set → show input ---
  return (
    <div
      className="min-h-[100dvh]"
      style={{
        background:
          "linear-gradient(180deg, #F8F7FF 0%, #FFF0F5 50%, #E8FFFE 100%)",
      }}
    >
      <div className="px-5 pt-14 pb-8">
        <div className="text-center mb-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">
            理想の相手の外見
          </h2>
          <p className="text-sm text-slate-500">
            あなたの好みを教えてください。後から変更もできます。
          </p>
        </div>
        <AppearancePreferences onComplete={handleComplete} />
      </div>
    </div>
  );
}
