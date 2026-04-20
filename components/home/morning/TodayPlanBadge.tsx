"use client";

/**
 * TodayPlanBadge — 当日プラン＆コーデの常駐アイコン
 *
 * CEO方針 2026-04-18:
 *   「当日分のプランとコーデに関しては、alter入力欄の右上にカードとして置く。
 *    プランのアイコンを作って、配置。そこに当日のプランとコーデを格納し、
 *    クリックしたら開けるようにする。」
 *
 * 成果物は Alter 画面に常設しない。見たい時にここから確認する。
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

// ── Storage keys（PlanOutfitViewer / OutfitCalendarEntry と共通） ──

const PLAN_SESSION_KEY = "aneurasync_morning_session_v1";
const COMMITTED_PREFIX = "culcept_outfit_committed_";
const DRAFT_PREFIX = "culcept_outfit_draft_";

// ── JST today ──

function getJSTToday(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// ── 状態チェック ──

function hasTodayPlan(): boolean {
  try {
    const raw = localStorage.getItem(PLAN_SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    const today = getJSTToday();
    return session?.plan?.date === today && Array.isArray(session?.plan?.items) && session.plan.items.length > 0;
  } catch {
    return false;
  }
}

function hasTodayOutfit(): boolean {
  try {
    const today = getJSTToday();
    return !!localStorage.getItem(`${COMMITTED_PREFIX}${today}`) ||
           !!localStorage.getItem(`${DRAFT_PREFIX}${today}`);
  } catch {
    return false;
  }
}

// ── コンポーネント ──

interface TodayPlanBadgeProps {
  onOpen: () => void;
}

export default function TodayPlanBadge({ onOpen }: TodayPlanBadgeProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const hasPlan = mounted ? hasTodayPlan() : false;
  const hasOutfit = mounted ? hasTodayOutfit() : false;
  const hasAnything = hasPlan || hasOutfit;

  if (!hasAnything) return null;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      onClick={onOpen}
      className="flex items-center gap-1 px-2 py-1 rounded-full transition-all active:scale-95"
      style={{
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.15)",
      }}
      aria-label="今日のプラン"
    >
      <span className="text-[11px]">📋</span>
      <span
        className="text-[10px] font-medium"
        style={{ color: "#6366F1" }}
      >
        今日
      </span>
      {/* 状態ドット */}
      <div className="flex items-center gap-[2px]">
        {hasPlan && (
          <div className="w-[4px] h-[4px] rounded-full bg-blue-400" />
        )}
        {hasOutfit && (
          <div className="w-[4px] h-[4px] rounded-full bg-emerald-400" />
        )}
      </div>
    </motion.button>
  );
}
