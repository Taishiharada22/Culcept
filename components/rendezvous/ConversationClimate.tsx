"use client";

/**
 * ConversationClimate
 * チャット上部に配置する 3px グラデーションゲージ
 * メッセージパターンから会話の「温度」を算出し warm / cool / vibrant を可視化
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  summarizeMessages as libSummarize,
  computeClimate as libComputeClimate,
  type ClimateState as LibClimateState,
} from "@/lib/rendezvous/conversationClimate";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  messages: Array<{
    senderId: string;
    text: string;
    createdAt: string;
  }>;
  myUserId: string;
};

type ClimateState = "warm" | "cool" | "vibrant";

/* ------------------------------------------------------------------ */
/*  Climate computation                                                */
/* ------------------------------------------------------------------ */

function computeClimate(
  messages: Props["messages"],
  myUserId: string,
): { state: ClimateState; temperature: number } {
  if (messages.length < 2) {
    return { state: "cool", temperature: 0.3 };
  }

  // Delegate to lib/rendezvous/conversationClimate for robust analysis
  const libMessages = messages.map((m) => ({
    sender_id: m.senderId,
    content: m.text,
    created_at: m.createdAt,
  }));
  const summary = libSummarize(libMessages, myUserId);
  const libResult = libComputeClimate(summary);

  return {
    state: libResult.state as ClimateState,
    temperature: libResult.temperature,
  };
}

/* ------------------------------------------------------------------ */
/*  Style maps                                                         */
/* ------------------------------------------------------------------ */

const GRADIENT: Record<ClimateState, string> = {
  warm: "linear-gradient(90deg, #FBBF24, #FB7185)",
  cool: "linear-gradient(90deg, #60A5FA, #94A3B8)",
  vibrant: "linear-gradient(90deg, #A78BFA, #F472B6)",
};

const LABEL: Record<ClimateState, string> = {
  warm: "warm",
  cool: "穏やか",
  vibrant: "活発",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConversationClimate({ messages, myUserId }: Props) {
  const { state, temperature } = useMemo(
    () => computeClimate(messages, myUserId),
    [messages, myUserId],
  );

  const pct = Math.round(temperature * 100);

  return (
    <div className="w-full">
      {/* 3px gradient gauge */}
      <div className="relative h-[3px] rounded-full bg-slate-200/40 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: GRADIENT[state] }}
        />

        {/* Subtle pulse for vibrant state */}
        {state === "vibrant" && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: GRADIENT.vibrant }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>

      {/* Tiny label */}
      <p
        className="mt-1 text-slate-400 font-medium"
        style={{ fontSize: 9, opacity: 0.4 }}
      >
        {LABEL[state]}
      </p>
    </div>
  );
}
