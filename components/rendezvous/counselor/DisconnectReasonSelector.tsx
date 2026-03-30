"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { DisconnectReasonCode } from "@/lib/rendezvous/counselor/types";
import { DISCONNECT_REASON_LABELS } from "@/lib/rendezvous/counselor/types";

interface DisconnectReasonSelectorProps {
  candidateId: string;
  onSubmit: (reasonCode: DisconnectReasonCode, detail?: string) => void;
  onCancel: () => void;
}

const REASON_CODES = Object.keys(DISCONNECT_REASON_LABELS) as DisconnectReasonCode[];

export default function DisconnectReasonSelector({
  candidateId,
  onSubmit,
  onCancel,
}: DisconnectReasonSelectorProps) {
  const [selected, setSelected] = useState<DisconnectReasonCode | null>(null);
  const [detail, setDetail] = useState("");

  const handleSubmit = () => {
    if (!selected) return;
    onSubmit(selected, detail.trim() || undefined);
  };

  return (
    <FadeInView direction="up">
      <div className="space-y-5">
        {/* ヘッダー */}
        <div className="text-center space-y-1.5">
          <h3 className="text-lg font-semibold text-slate-800">
            この接続について教えてください
          </h3>
          <p className="text-sm text-slate-500">
            あなたの気持ちを整理するために使います
          </p>
        </div>

        {/* 理由グリッド */}
        <div className="grid grid-cols-2 gap-2.5">
          {REASON_CODES.map((code, i) => {
            const isSelected = selected === code;
            return (
              <motion.div
                key={code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <GlassCard
                  padding="sm"
                  hoverEffect={false}
                  onClick={() => setSelected(code)}
                  className={
                    isSelected
                      ? "!border-indigo-300 !bg-indigo-50/60 ring-1 ring-indigo-200/60"
                      : ""
                  }
                >
                  <p
                    className={`text-sm text-center leading-snug ${
                      isSelected
                        ? "text-indigo-700 font-semibold"
                        : "text-slate-600"
                    }`}
                  >
                    {DISCONNECT_REASON_LABELS[code]}
                  </p>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* 詳細入力 */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="もう少し詳しく教えてもらえますか？（任意）"
                rows={2}
                className="w-full rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-300 transition-colors duration-150 px-4 py-3 text-sm resize-none"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* アクション */}
        <div className="flex gap-3">
          <GlassButton
            variant="ghost"
            onClick={onCancel}
            className="flex-1"
          >
            やめる
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={handleSubmit}
            disabled={!selected}
            className="flex-1"
          >
            送信
          </GlassButton>
        </div>
      </div>
    </FadeInView>
  );
}
