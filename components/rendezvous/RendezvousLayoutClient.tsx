"use client";

import { ReactNode, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import RendezvousTabBar, { deriveActiveTab, type RendezvousTab } from "./RendezvousTabBar";
import AtmosphericBackground from "./AtmosphericBackground";
import { SoundProvider } from "./SoundProvider";
import AgeVerificationGate from "./AgeVerificationGate";

// =============================================================================
// RendezvousLayoutClient — ライトウォームラッパー
// =============================================================================

type Props = {
  children: ReactNode;
  activeTab?: RendezvousTab;
};

export default function RendezvousLayoutClient({ children, activeTab }: Props) {
  const pathname = usePathname();
  const resolvedTab = activeTab ?? deriveActiveTab(pathname);

  // 年齢確認状態をチェック（18+確認が法的に必要）
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/rendezvous/age-verify", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAgeVerified(d?.verified ?? false))
      .catch(() => setAgeVerified(false));
  }, []);

  return (
    <SoundProvider>
      <AtmosphericBackground>
        <div
          className="relative min-h-screen"
          style={{
            color: "#1A1025",
            fontFamily: "'Noto Sans JP', -apple-system, sans-serif",
            paddingTop: "env(safe-area-inset-top, 0px)",
            background: "transparent",
          }}
        >
          {ageVerified !== null && (
            <AgeVerificationGate isVerified={ageVerified}>
              <main className="relative z-0">
                {children}
              </main>

              <RendezvousTabBar activeTab={resolvedTab} />
            </AgeVerificationGate>
          )}
        </div>
      </AtmosphericBackground>
    </SoundProvider>
  );
}
