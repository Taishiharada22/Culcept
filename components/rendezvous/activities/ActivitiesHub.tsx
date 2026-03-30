"use client";

/**
 * ActivitiesHub
 * 共鳴アクティビティのメインクライアントラッパー
 * - APIからアクティビティ一覧を取得
 * - 利用可能なアクティビティタイプをカードで表示
 * - 完了済みアクティビティの結果表示
 * - タップで各アクティビティコンポーネントを展開
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import ParallelQuestion from "@/components/rendezvous/activities/ParallelQuestion";
import StyleDuet from "@/components/rendezvous/activities/StyleDuet";
import FutureScene from "@/components/rendezvous/activities/FutureScene";
import type { ActivityType, StyleDuetRound } from "@/lib/rendezvous/activityEngine";

// ── Types ──

type ActivityDTO = {
  id: string;
  candidateId: string;
  activityType: ActivityType;
  payload: Record<string, unknown>;
  myAnswer: Record<string, unknown> | null;
  theirAnswer: Record<string, unknown> | null;
  revealed: boolean;
  insightText: string | null;
  createdAt: string;
};

type AvailableSuggestion = {
  type: ActivityType;
  label: string;
  description: string;
  available: boolean;
};

// ── Constants ──

const TYPE_META: Record<
  ActivityType,
  { icon: string; color: string; label: string }
> = {
  parallel_question: {
    icon: "\u2753",
    color: "#6366F1",
    label: "並行クエスチョン",
  },
  style_duet: {
    icon: "\uD83C\uDFB5",
    color: "#F59E0B",
    label: "スタイルデュエット",
  },
  future_scene: {
    icon: "\uD83D\uDD2E",
    color: "#EC4899",
    label: "フューチャーシーン",
  },
};

// ── Component ──

export default function ActivitiesHub({
  candidateId,
}: {
  candidateId: string;
}) {
  const [activities, setActivities] = useState<ActivityDTO[]>([]);
  const [available, setAvailable] = useState<AvailableSuggestion[]>([]);
  const [iAmA, setIAmA] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ──

  const fetchActivities = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/rendezvous/${candidateId}/activities`);
      const data = await res.json();
      if (data.ok) {
        setActivities(data.activities);
        setAvailable(data.available);
        setIAmA(data.iAmA);
      } else {
        setError(data.error ?? "データの取得に失敗しました");
      }
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // ── Actions ──

  async function createActivity(type: ActivityType) {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", activityType: type }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "作成に失敗しました");
      }
      await fetchActivities();
    } catch {
      setError("作成中にエラーが発生しました");
    } finally {
      setCreating(false);
    }
  }

  async function submitAnswer(activityId: string, answer: unknown) {
    try {
      await fetch(`/api/rendezvous/${candidateId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", activityId, answer }),
      });
      await fetchActivities();
    } catch {
      setError("送信中にエラーが発生しました");
    }
  }

  async function revealActivity(activityId: string) {
    try {
      await fetch(`/api/rendezvous/${candidateId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", activityId }),
      });
      await fetchActivities();
    } catch {
      setError("開示中にエラーが発生しました");
    }
  }

  // ── Grouping ──

  const activeActivities = activities.filter((a) => !a.revealed);
  const completedActivities = activities.filter((a) => a.revealed);

  return (
    <div
      className="min-h-dvh pb-10"
      style={{
        background: "linear-gradient(180deg, #FDFAF6, #F8F5F0)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800 m-0">
            共鳴アクティビティ
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            二人だけの体験を共有する
          </p>
        </div>
        <Link
          href={`/rendezvous/${candidateId}`}
          className="text-[11px] font-semibold no-underline"
          style={{ color: "#6366F1" }}
        >
          戻る
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 px-4 py-2 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {/* Available Activities */}
      {!loading && (
        <FadeInView>
          <div className="px-4 pb-4">
            <div className="text-[11px] font-bold text-slate-400/70 mb-2 tracking-wider">
              新しいアクティビティ
            </div>
            <div className="flex gap-2">
              {available
                .filter((a) => a.available)
                .map((a) => {
                  const meta = TYPE_META[a.type];
                  return (
                    <motion.button
                      key={a.type}
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => createActivity(a.type)}
                      disabled={creating}
                      className="flex-1 py-3.5 px-2.5 rounded-2xl border text-center backdrop-blur-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
                      style={{
                        borderColor: `${meta.color}15`,
                        background: "rgba(255,255,255,0.8)",
                      }}
                    >
                      <div className="text-xl mb-1">{meta.icon}</div>
                      <div
                        className="text-[11px] font-bold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </div>
                      <div className="text-[9px] text-slate-400/70 mt-0.5">
                        {a.description}
                      </div>
                    </motion.button>
                  );
                })}
            </div>
            {available.filter((a) => a.available).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">
                全てのアクティビティタイプが完了しています
              </p>
            )}
          </div>
        </FadeInView>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-10 text-center">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="text-2xl inline-block mb-2"
          >
            &#x2728;
          </motion.div>
          <p className="text-xs text-slate-300">読み込み中...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && activities.length === 0 && (
        <div className="py-10 text-center">
          <div className="text-3xl mb-2">&#x2728;</div>
          <p className="text-sm font-semibold text-slate-400">
            まだアクティビティがありません
          </p>
          <p className="text-[11px] text-slate-300 mt-1">
            上のボタンから始めましょう
          </p>
        </div>
      )}

      {/* Active Activities */}
      {activeActivities.length > 0 && (
        <div className="px-4 mb-4">
          <div className="text-[11px] font-bold text-slate-400/70 mb-2 tracking-wider">
            進行中
          </div>
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {activeActivities.map((activity) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <ActivityRenderer
                    activity={activity}
                    iAmA={iAmA}
                    onSubmitAnswer={(answer) =>
                      submitAnswer(activity.id, answer)
                    }
                    onReveal={() => revealActivity(activity.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed Activities */}
      {completedActivities.length > 0 && (
        <div className="px-4">
          <div className="text-[11px] font-bold text-slate-400/70 mb-2 tracking-wider">
            完了済み
          </div>
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {completedActivities.map((activity) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <ActivityRenderer
                    activity={activity}
                    iAmA={iAmA}
                    onSubmitAnswer={(answer) =>
                      submitAnswer(activity.id, answer)
                    }
                    onReveal={() => revealActivity(activity.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Activity Renderer ──

function ActivityRenderer({
  activity,
  iAmA,
  onSubmitAnswer,
  onReveal,
}: {
  activity: ActivityDTO;
  iAmA: boolean;
  onSubmitAnswer: (answer: unknown) => void;
  onReveal: () => void;
}) {
  const payload = activity.payload;

  if (activity.activityType === "parallel_question") {
    return (
      <ParallelQuestion
        activityId={activity.id}
        question={(payload.questionText as string) ?? ""}
        myAnswer={
          (activity.myAnswer as { text?: string } | null)?.text ?? null
        }
        theirAnswer={
          (activity.theirAnswer as { text?: string } | null)?.text ?? null
        }
        revealed={activity.revealed}
        insightText={activity.insightText}
        onSubmit={(text) => onSubmitAnswer({ text })}
        onReveal={onReveal}
        iAmA={iAmA}
      />
    );
  }

  if (activity.activityType === "style_duet") {
    const rounds = (payload.rounds as StyleDuetRound[]) ?? [];
    const overlapResult = payload.overlapResult as
      | { overlapPercent: number }
      | undefined;

    return (
      <StyleDuet
        activityId={activity.id}
        rounds={rounds}
        myChoices={
          (activity.myAnswer as { choices?: string[] } | null)?.choices ?? null
        }
        theirChoices={
          (activity.theirAnswer as { choices?: string[] } | null)?.choices ??
          null
        }
        revealed={activity.revealed}
        overlapPercent={overlapResult?.overlapPercent ?? null}
        insightText={activity.insightText}
        onSubmit={(choices) => onSubmitAnswer({ choices })}
        onReveal={onReveal}
      />
    );
  }

  if (activity.activityType === "future_scene") {
    const panels =
      (payload.panels as [string, string, string]) ?? null;
    const mood =
      (payload.mood as
        | "warm"
        | "playful"
        | "reflective"
        | "adventurous") ?? null;

    return (
      <FutureScene
        activityId={activity.id}
        scenario={(payload.scenario as string) ?? ""}
        panels={panels}
        mood={mood}
        myReaction={
          (activity.myAnswer as { reaction?: string } | null)?.reaction ?? null
        }
        theirReaction={
          (activity.theirAnswer as { reaction?: string } | null)?.reaction ??
          null
        }
        revealed={activity.revealed}
        onSubmitReaction={(reaction) => onSubmitAnswer({ reaction })}
        onReveal={onReveal}
      />
    );
  }

  return null;
}
