"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RvCard,
  RvButton,
  RV_COLORS,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// DeepeningMissionBanner — チャット画面内の深化ミッションカード
// =============================================================================

type MissionData = {
  id: string;
  dayNumber: number;
  type: string;
  title: string;
  description: string;
  prompt?: string;
  suggestion?: string;
  myCompleted: boolean;
  partnerCompleted: boolean;
};

const TYPE_ICONS: Record<string, string> = {
  open_question: "💭",
  guess: "🔮",
  voice: "🎤",
  shared_experience: "🌅",
  deep_question: "🔑",
  meetup: "☕",
};

export function DeepeningMissionBanner({
  candidateId,
}: {
  candidateId: string;
}) {
  const [mission, setMission] = useState<MissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchMission = useCallback(async () => {
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/deepening`);
      const data = await res.json();
      if (data.ok && data.mission) {
        setMission(data.mission);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchMission();
  }, [fetchMission]);

  const handleComplete = async () => {
    if (!mission || completing) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/deepening/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId: mission.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setMission((m) => m ? { ...m, myCompleted: true } : m);
      }
    } finally {
      setCompleting(false);
    }
  };

  if (loading || !mission || dismissed) return null;

  const icon = TYPE_ICONS[mission.type] ?? "✨";
  const bothDone = mission.myCompleted && mission.partnerCompleted;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        className="mx-4 mb-3"
      >
        <RvCard
          accentBorder={`${RV_COLORS.accent}40`}
          className="relative"
        >
          {/* 閉じるボタン */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
            style={{ color: RV_COLORS.textMuted, backgroundColor: RV_COLORS.surfaceMuted }}
          >
            ×
          </button>

          {/* ヘッダー */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{icon}</span>
            <div>
              <p className="text-[10px] font-bold tracking-wider" style={{ color: RV_COLORS.accent }}>
                DAY {mission.dayNumber} ミッション
              </p>
              <p className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
                {mission.title}
              </p>
            </div>
          </div>

          {/* 説明 */}
          <p className="text-xs leading-relaxed mb-2" style={{ color: RV_COLORS.textSub }}>
            {mission.description}
          </p>

          {/* お題プロンプト */}
          {mission.prompt && (
            <div
              className="rounded-xl px-3 py-2 mb-3 text-xs"
              style={{
                backgroundColor: `${RV_COLORS.accent}08`,
                border: `1px solid ${RV_COLORS.accent}15`,
                color: RV_COLORS.text,
                fontStyle: "italic",
              }}
            >
              「{mission.prompt}」
            </div>
          )}

          {/* ステータス + アクション */}
          {bothDone ? (
            <div className="flex items-center gap-2">
              <span className="text-xs">✅</span>
              <span className="text-xs font-bold" style={{ color: RV_COLORS.success }}>
                お互いクリア！
              </span>
            </div>
          ) : mission.myCompleted ? (
            <div className="flex items-center gap-2">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-xs"
              >
                ⏳
              </motion.span>
              <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>
                相手の完了を待っています
              </span>
            </div>
          ) : (
            <RvButton
              variant="secondary"
              onClick={handleComplete}
              disabled={completing}
              className="text-xs !px-4 !py-1.5"
            >
              {completing ? "記録中..." : "ミッション完了"}
            </RvButton>
          )}
        </RvCard>
      </motion.div>
    </AnimatePresence>
  );
}
