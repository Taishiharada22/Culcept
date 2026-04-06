"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 機能名（例: "日記", "コーデ"） */
  featureName?: string;
}

export default function RegistrationPrompt({ isOpen, onClose, featureName }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Icon */}
            <div className="mb-3 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
                <span className="text-xl">✦</span>
              </div>
            </div>

            {/* Title */}
            <h2 className="mb-2 text-center text-base font-bold text-[#121830]">
              {featureName
                ? `「${featureName}」を使うには新規登録が必要です`
                : "全機能を使うには新規登録が必要です"}
            </h2>

            {/* Description */}
            <p className="mb-5 text-center text-xs leading-relaxed text-[rgba(18,24,44,0.55)]">
              無料アカウントを作成すると、
              <br />
              全ての機能と観測結果にアクセスできます。
              <br />
              <span className="text-[rgba(18,24,44,0.35)]">
                ここまでのデータは自動で引き継がれます。
              </span>
            </p>

            {/* CTA */}
            <a
              href="/login?mode=signup&next=/"
              className="mb-3 flex w-full items-center justify-center rounded-full bg-[#121830] px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
            >
              無料で新規登録する
            </a>

            {/* Dismiss */}
            <button
              onClick={onClose}
              className="w-full text-center text-xs text-[rgba(18,24,44,0.35)] transition-colors hover:text-[rgba(18,24,44,0.5)]"
            >
              あとで
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
