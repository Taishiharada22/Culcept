"use client";

import type { FootprintSignal } from "./footprintCollector";

export interface BehavioralSignalRow {
  signal_type: string;
  value: number;
  context: string | null;
  question_id: string | null;
  original_choice: number | null;
  final_choice: number | null;
  session_date: string;
}

/**
 * Convert FootprintSignals from localStorage to DB rows
 */
export function footprintsToSignalRows(signals: FootprintSignal[]): BehavioralSignalRow[] {
  return signals.map(s => ({
    signal_type: s.type,
    value: s.value,
    context: s.context ?? null,
    question_id: s.context ?? null,
    original_choice: null,
    final_choice: null,
    session_date: s.timestamp?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  }));
}

/**
 * Create a revision signal (answer changed before confirm)
 */
export function createRevisionSignal(
  questionId: string,
  originalChoice: number,
  finalChoice: number,
  responseTimeMs: number,
  sessionDate: string,
): BehavioralSignalRow {
  return {
    signal_type: "answer_revision",
    value: responseTimeMs,
    context: `original:${originalChoice},final:${finalChoice}`,
    question_id: questionId,
    original_choice: originalChoice,
    final_choice: finalChoice,
    session_date: sessionDate,
  };
}

/**
 * Create a session duration signal
 */
export function createSessionDurationSignal(
  durationSeconds: number,
  totalQuestions: number,
  sessionDate: string,
): BehavioralSignalRow {
  return {
    signal_type: "session_duration",
    value: durationSeconds,
    context: `questions:${totalQuestions}`,
    question_id: null,
    original_choice: null,
    final_choice: null,
    session_date: sessionDate,
  };
}

/**
 * Create a time-of-day signal
 */
export function createTimeOfDaySignal(
  hour: number,
  sessionDate: string,
): BehavioralSignalRow {
  return {
    signal_type: "time_of_day",
    value: hour,
    context: hour < 6 ? "late_night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening",
    question_id: null,
    original_choice: null,
    final_choice: null,
    session_date: sessionDate,
  };
}

/**
 * Batch sync signals to Supabase via API
 */
export async function syncBehavioralSignals(signals: BehavioralSignalRow[]): Promise<{ ok: boolean; synced: number }> {
  if (signals.length === 0) return { ok: true, synced: 0 };
  try {
    const res = await fetch("/api/stargazer/behavioral-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals }),
    });
    if (!res.ok) return { ok: false, synced: 0 };
    const data = await res.json();
    return { ok: true, synced: data.synced ?? signals.length };
  } catch {
    return { ok: false, synced: 0 };
  }
}
