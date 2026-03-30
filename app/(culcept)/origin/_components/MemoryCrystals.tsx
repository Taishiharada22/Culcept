"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { MemoryGem } from "@/lib/origin/v7/types";
import { loadMemoryGems } from "@/lib/origin/v7/store";

// Season emoji mapping
const SEASON_EMOJI: Record<string, string> = {
  spring: "🌸",
  summer: "🌊",
  autumn: "🍂",
  winter: "❄️",
};

// Life period labels
const PERIOD_LABELS: Record<string, string> = {
  childhood: "幼少期",
  elementary: "小学校",
  middle_school: "中学校",
  high_school: "高校",
  university: "大学",
  twenties: "20代",
  thirties: "30代",
  forties: "40代",
  fifties: "50代",
  senior: "シニア",
};

type Props = {
  onStartNewDive?: () => void;
};

export default function MemoryCrystals({ onStartNewDive }: Props) {
  const [gems, setGems] = useState<MemoryGem[]>([]);
  const [selectedGem, setSelectedGem] = useState<MemoryGem | null>(null);

  useEffect(() => {
    const loaded = loadMemoryGems();
    setGems(loaded);
  }, []);

  if (selectedGem) {
    return (
      <div className="mx-auto max-w-lg px-4 py-4">
        <button
          onClick={() => setSelectedGem(null)}
          className="mb-3 text-xs text-gray-400 hover:text-gray-600"
        >
          ← 結晶一覧
        </button>
        <GemDetail gem={selectedGem} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">💎 記憶の結晶</h2>
      <p className="mb-4 text-xs text-gray-400">
        振り返った記憶が結晶になって残ります
      </p>

      {gems.length === 0 ? (
        <div className="rounded-2xl bg-white/50 p-6 text-center">
          <p className="text-2xl">💎</p>
          <p className="mt-2 text-xs text-gray-400">
            まだ結晶がありません。記憶を振り返り、結晶にしてみませんか？
          </p>
          {onStartNewDive && (
            <button
              onClick={onStartNewDive}
              className="mt-3 rounded-xl bg-violet-50 px-4 py-2 text-xs text-violet-600 transition-colors hover:bg-violet-100"
            >
              記憶を結晶化する
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {gems.map((gem, i) => (
              <motion.button
                key={gem.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
                onClick={() => setSelectedGem(gem)}
                className="rounded-2xl bg-white/60 p-3 text-left transition-colors hover:bg-white/80"
              >
                <p className="text-lg">
                  {SEASON_EMOJI[gem.scene?.season ?? ""] ?? "✦"}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-700 line-clamp-2">
                  {gem.title}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {gem.calendarYear}年{gem.calendarMonth ? ` ${gem.calendarMonth}月` : ""}
                </p>
                {gem.lifePeriod && (
                  <span className="mt-1 inline-block rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">
                    {PERIOD_LABELS[gem.lifePeriod] ?? gem.lifePeriod}
                  </span>
                )}
              </motion.button>
            ))}
          </div>

          {onStartNewDive && (
            <button
              onClick={onStartNewDive}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-50/50 py-2.5 text-xs text-violet-500 transition-colors hover:bg-violet-50"
            >
              ＋ 新しい記憶を結晶化
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gem Detail View
// ---------------------------------------------------------------------------

function GemDetail({ gem }: { gem: MemoryGem }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-white/50 p-4">
        <p className="text-lg">
          {SEASON_EMOJI[gem.scene?.season ?? ""] ?? "✦"}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-gray-700">{gem.title}</h3>
        <p className="mt-0.5 text-[11px] text-gray-400">
          {gem.calendarYear}年{gem.calendarMonth ? `${gem.calendarMonth}月` : ""}
          {gem.scene?.place ? ` · ${gem.scene.place}` : ""}
        </p>
      </div>

      {/* Scene */}
      {gem.scene && (
        <DetailSection title="場面" emoji="🎬">
          {gem.scene.atmosphere && (
            <p className="text-xs text-gray-500">{gem.scene.atmosphere}</p>
          )}
          {gem.scene.people && gem.scene.people.length > 0 && (
            <p className="mt-1 text-[11px] text-gray-400">
              一緒にいた人: {gem.scene.people.join(", ")}
            </p>
          )}
        </DetailSection>
      )}

      {/* Senses */}
      {gem.senses && (
        <DetailSection title="五感の記憶" emoji="🌿">
          <div className="space-y-1">
            {gem.senses.sightText && <SenseLine label="視覚" text={gem.senses.sightText} />}
            {gem.senses.soundText && <SenseLine label="聴覚" text={gem.senses.soundText} />}
            {gem.senses.smellText && <SenseLine label="嗅覚" text={gem.senses.smellText} />}
            {gem.senses.temperature && <SenseLine label="温度" text={gem.senses.temperature} />}
            {gem.senses.touchText && <SenseLine label="触覚" text={gem.senses.touchText} />}
          </div>
        </DetailSection>
      )}

      {/* Inner */}
      {gem.inner && (
        <DetailSection title="心の中" emoji="🌙">
          {gem.inner.emotions && gem.inner.emotions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {gem.inner.emotions.map((e) => (
                <span
                  key={e}
                  className="rounded-full bg-violet-100/60 px-2 py-0.5 text-[10px] text-violet-600"
                >
                  {e}
                </span>
              ))}
            </div>
          )}
          {gem.inner.thoughts && (
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{gem.inner.thoughts}</p>
          )}
          {gem.inner.unsaid && (
            <p className="mt-1 text-[11px] italic text-gray-400">
              言えなかったこと: 「{gem.inner.unsaid}」
            </p>
          )}
        </DetailSection>
      )}

      {/* Ripple */}
      {gem.ripple && (
        <DetailSection title="人生への波紋" emoji="💫">
          {gem.ripple.impact && (
            <p className="text-xs leading-relaxed text-gray-500">{gem.ripple.impact}</p>
          )}
          {gem.ripple.counterfactual && (
            <p className="mt-1.5 text-[11px] italic text-gray-400">
              もしこれがなかったら: {gem.ripple.counterfactual}
            </p>
          )}
          {gem.ripple.patternStarted && (
            <p className="mt-1 text-[11px] text-gray-400">
              始まったパターン: {gem.ripple.patternStarted}
            </p>
          )}
        </DetailSection>
      )}

      {/* Dominant emotion */}
      {gem.dominantEmotion && (
        <div className="rounded-2xl bg-gradient-to-r from-violet-50/40 to-indigo-50/30 p-3 text-center">
          <p className="text-[10px] text-gray-400">この記憶を象徴する感情</p>
          <p className="mt-1 text-sm font-medium text-violet-600">{gem.dominantEmotion}</p>
        </div>
      )}
    </div>
  );
}

function DetailSection({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/50 p-4">
      <p className="mb-2 text-[11px] font-medium text-gray-500">
        {emoji} {title}
      </p>
      {children}
    </div>
  );
}

function SenseLine({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[11px] text-gray-500">
      <span className="text-gray-400">{label}:</span> {text}
    </p>
  );
}
