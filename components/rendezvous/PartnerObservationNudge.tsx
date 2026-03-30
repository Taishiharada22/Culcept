"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { RvGlowCard, RvButton, RV_COLORS } from "@/components/ui/rendezvous-design";
import { safeLSSet } from "@/lib/safeLocalStorage";

// =============================================================================
// PartnerObservationNudge — ランデブー初回/未完了時の相手観測誘導
// =============================================================================

const STORAGE_KEY = "culcept_partner_obs_dismissed_v1";

export function PartnerObservationNudge() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 既に閉じた or 完了済みなら非表示
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    // 相手観測データがあるか確認
    fetch("/api/stargazer/partner-observation?category=friend&count=1")
      .then((r) => r.json())
      .then((d) => {
        // 質問が返ってくる = まだ回答していない質問がある = 表示する
        if (d.ok && d.questions?.length > 0) {
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDismiss = () => {
    setShow(false);
    safeLSSet(STORAGE_KEY, new Date().toISOString());
  };

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 pt-4 pb-2"
    >
      <RvGlowCard gradient={`linear-gradient(135deg, ${RV_COLORS.secondary} 0%, ${RV_COLORS.primaryLight} 100%)`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">♢</span>
          <div className="flex-1">
            <p className="text-sm font-bold mb-1" style={{ color: RV_COLORS.text }}>
              相手との関係を観測しませんか？
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: RV_COLORS.textSub }}>
              友達・恋人・仕事仲間…相手によって変わる「自分」を観測すると、マッチング精度が大きく向上します。
            </p>
            <div className="flex items-center gap-2">
              <RvButton
                variant="primary"
                onClick={() => router.push("/stargazer?tab=partner")}
                className="text-xs !px-4 !py-2"
              >
                相手を観測する
              </RvButton>
              <RvButton
                variant="ghost"
                onClick={handleDismiss}
                className="text-xs !px-3 !py-2"
              >
                あとで
              </RvButton>
            </div>
          </div>
        </div>
      </RvGlowCard>
    </motion.div>
  );
}
