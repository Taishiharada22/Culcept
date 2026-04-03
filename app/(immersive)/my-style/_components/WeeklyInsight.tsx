"use client";

import { useMemo } from "react";
import {
    MOOD_COLORS,
    getWeeklyMoodDots,
    getMoodPatterns,
    getMoodHistory,
} from "../_lib/todaysMirror";

/**
 * 週間ムード概観コンポーネント
 *
 * getWeeklyMoodDots() で7日分のドットを表示し、
 * getMoodPatterns() でパターン検出結果があれば1行表示する。
 *
 * TodaysMirror.tsx 内のインライン dots から抽出。
 */
export default function WeeklyInsight() {
    const weeklyDots = useMemo(() => getWeeklyMoodDots(), []);
    const patterns = useMemo(() => {
        const entries = getMoodHistory();
        return getMoodPatterns(entries);
    }, []);

    if (weeklyDots.length === 0) return null;

    const topPattern = patterns[0];

    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
                {weeklyDots.map((dot) => (
                    <div
                        key={dot.date}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: dot.mood ? MOOD_COLORS[dot.mood] ?? "#94a3b8" : "#e2e8f0" }}
                    />
                ))}
            </div>
            {topPattern && (
                <p className="text-[10px] text-slate-400 truncate">{topPattern.label}</p>
            )}
        </div>
    );
}
