"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import AppearancePreferences from "@/components/rendezvous/onboarding/AppearancePreferences";

export default function AppearancePreferencesPage() {
  const router = useRouter();

  return (
    <div
      className="min-h-[100dvh] pb-16"
      style={{
        background:
          "linear-gradient(180deg, #F8F7FF 0%, #FFF0F5 50%, #E8FFFE 100%)",
      }}
    >
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-white/60 border-b border-white/80">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-lg border border-slate-200/60 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-slate-800">
            外見の好み
          </h1>
        </div>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-6 max-w-lg mx-auto"
      >
        <p className="text-xs text-slate-400 text-center mb-6">
          マッチングに使われる外見の好みを設定します。いつでも変更できます。
        </p>
        <AppearancePreferences standalone category="romantic" />
      </motion.div>
    </div>
  );
}
