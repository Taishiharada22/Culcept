// app/stargazer/events/EventsClient.tsx
// 人生の出来事トラッカー — 出来事の記録と性格変化への洞察
"use client";

import { useState, useEffect, useId } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
  LightBackground,
} from "@/components/ui/glassmorphism-design";
import LifeEventTimeline from "@/app/stargazer/_components/LifeEventTimeline";
import {
  loadEvents,
  saveEvent,
  removeEvent,
  correlateWithAxisShifts,
  EVENT_CATEGORY_LABELS,
  type LifeEvent,
  type EventCategory,
  type EventAxisCorrelation,
} from "@/lib/stargazer/lifeEvents";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const CATEGORIES = Object.entries(EVENT_CATEGORY_LABELS) as Array<
  [EventCategory, { label: string; icon: string }]
>;

const CATEGORY_ACTIVE: Record<EventCategory, string> = {
  relationship: "rgba(236,72,153,0.15)",
  career: "rgba(59,130,246,0.15)",
  health: "rgba(16,185,129,0.15)",
  life: "rgba(245,158,11,0.15)",
  internal: "rgba(139,92,246,0.15)",
};

const CATEGORY_BORDER_ACTIVE: Record<EventCategory, string> = {
  relationship: "rgba(236,72,153,0.5)",
  career: "rgba(59,130,246,0.5)",
  health: "rgba(16,185,129,0.5)",
  life: "rgba(245,158,11,0.5)",
  internal: "rgba(139,92,246,0.5)",
};

// Today's date in YYYY-MM-DD
function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface FormState {
  date: string;
  category: EventCategory;
  title: string;
  description: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  isPositive: boolean;
}

const DEFAULT_FORM: FormState = {
  date: todayString(),
  category: "life",
  title: "",
  description: "",
  intensity: 3,
  isPositive: true,
};

// ---------------------------------------------------------------------------
// Section: category count summary
// ---------------------------------------------------------------------------

function CategorySummary({ events }: { events: LifeEvent[] }) {
  const counts = CATEGORIES.map(([cat, meta]) => ({
    category: cat,
    label: meta.label,
    icon: meta.icon,
    count: events.filter((e) => e.category === cat).length,
  })).filter((c) => c.count > 0);

  if (counts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {counts.map(({ category, label, icon, count }) => (
        <span
          key={category}
          className="inline-flex items-center gap-1 font-medium rounded-full border text-sm px-3 py-1.5"
          style={{
            background: CATEGORY_ACTIVE[category],
            borderColor: CATEGORY_BORDER_ACTIVE[category],
          }}
        >
          {icon} {label} <span className="font-bold ml-1">{count}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intensity slider visual
// ---------------------------------------------------------------------------

function IntensitySelector({
  value,
  onChange,
}: {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const labels: Record<number, string> = {
    1: "ごく小さな変化",
    2: "やや影響あり",
    3: "かなり影響あり",
    4: "大きな転機",
    5: "人生を変えた出来事",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">強度</span>
        <span className="text-xs text-violet-600 font-medium">{labels[value]}</span>
      </div>
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4, 5] as const).map((level) => (
          <motion.button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="flex-1 h-8 rounded-xl transition-all duration-200 font-semibold text-sm"
            style={{
              background:
                level <= value
                  ? `rgba(139,92,246,${0.12 + level * 0.12})`
                  : "rgba(139,92,246,0.06)",
              border:
                level <= value
                  ? `1.5px solid rgba(139,92,246,${0.3 + level * 0.1})`
                  : "1.5px solid rgba(139,92,246,0.15)",
              color: level <= value ? "#7C3AED" : "#94A3B8",
            }}
          >
            {level}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Positive / negative toggle
// ---------------------------------------------------------------------------

function PolarityToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      <motion.button
        type="button"
        onClick={() => onChange(true)}
        whileTap={{ scale: 0.96 }}
        className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200"
        style={{
          background: value ? "rgba(16,185,129,0.15)" : "rgba(0,0,0,0.03)",
          border: value
            ? "1.5px solid rgba(16,185,129,0.45)"
            : "1.5px solid rgba(0,0,0,0.08)",
          color: value ? "#059669" : "#94A3B8",
        }}
      >
        ポジティブ
      </motion.button>
      <motion.button
        type="button"
        onClick={() => onChange(false)}
        whileTap={{ scale: 0.96 }}
        className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200"
        style={{
          background: !value ? "rgba(239,68,68,0.12)" : "rgba(0,0,0,0.03)",
          border: !value
            ? "1.5px solid rgba(239,68,68,0.4)"
            : "1.5px solid rgba(0,0,0,0.08)",
          color: !value ? "#DC2626" : "#94A3B8",
        }}
      >
        ネガティブ
      </motion.button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Event Form
// ---------------------------------------------------------------------------

function AddEventForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitted, setSubmitted] = useState(false);
  const titleId = useId();

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;

    const event: LifeEvent = {
      id: generateId(),
      date: form.date,
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      intensity: form.intensity,
      isPositive: form.isPositive,
    };

    saveEvent(event);
    setSubmitted(true);
    setTimeout(() => {
      setForm({ ...DEFAULT_FORM, date: todayString() });
      setSubmitted(false);
      onAdded();
    }, 900);
  }

  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-bold text-slate-800 mb-5">出来事を記録する</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">日付</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            required
            className="w-full rounded-2xl px-4 py-2.5 text-sm bg-white/70 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700"
          />
        </div>

        {/* Category chips */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">カテゴリ</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(([cat, meta]) => {
              const active = form.category === cat;
              return (
                <motion.button
                  key={cat}
                  type="button"
                  onClick={() => set("category", cat)}
                  whileTap={{ scale: 0.94 }}
                  className="px-3.5 py-2 rounded-2xl text-sm font-medium transition-all duration-200"
                  style={{
                    background: active ? CATEGORY_ACTIVE[cat] : "rgba(0,0,0,0.04)",
                    border: active
                      ? `1.5px solid ${CATEGORY_BORDER_ACTIVE[cat]}`
                      : "1.5px solid rgba(0,0,0,0.07)",
                    color: active ? "#1E293B" : "#64748B",
                  }}
                >
                  {meta.icon} {meta.label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor={titleId} className="block text-xs font-medium text-slate-500 mb-1.5">
            出来事のタイトル <span className="text-rose-400">*</span>
          </label>
          <input
            id={titleId}
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="例: 転職した、親友と喧嘩した、引っ越しをした"
            required
            maxLength={80}
            className="w-full rounded-2xl px-4 py-2.5 text-sm bg-white/70 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700 placeholder:text-slate-300"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            詳細メモ <span className="text-slate-300">（任意）</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="どんな出来事だったか、感じたことなどを自由に"
            rows={3}
            maxLength={400}
            className="w-full rounded-2xl px-4 py-2.5 text-sm bg-white/70 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-slate-700 placeholder:text-slate-300 resize-none"
          />
        </div>

        {/* Intensity */}
        <IntensitySelector
          value={form.intensity}
          onChange={(v) => set("intensity", v)}
        />

        {/* Polarity */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">
            この出来事はどちらですか
          </label>
          <PolarityToggle value={form.isPositive} onChange={(v) => set("isPositive", v)} />
        </div>

        {/* Submit */}
        <GlassButton
          type="submit"
          variant="gradient"
          fullWidth
          disabled={!form.title.trim() || submitted}
          loading={submitted}
        >
          {submitted ? "記録しました" : "出来事を記録する"}
        </GlassButton>
      </form>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Delete button overlay on each event row
// ---------------------------------------------------------------------------

function EventDeleteRow({
  event,
  onDelete,
}: {
  event: LifeEvent;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-1 -mt-2 mb-2">
      <span className="text-xs text-slate-400 truncate max-w-[200px]">{event.title}</span>
      <motion.button
        type="button"
        onClick={() => onDelete(event.id)}
        whileTap={{ scale: 0.9 }}
        className="text-xs text-slate-400 hover:text-rose-500 transition-colors px-2 py-0.5 rounded-lg hover:bg-rose-50"
      >
        削除
      </motion.button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EventsClient() {
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [correlations, setCorrelations] = useState<EventAxisCorrelation[]>([]);
  const [showDeleteControls, setShowDeleteControls] = useState(false);

  function refresh() {
    const evts = loadEvents();
    setEvents(evts);
    // Run correlation analysis with axis snapshots from localStorage
    try {
      const raw = localStorage.getItem("stargazer_axis_history_v1");
      if (raw) {
        const snapshots: Array<{ date: string; scores: Partial<Record<TraitAxisKey, number>> }> = JSON.parse(raw);
        setCorrelations(correlateWithAxisShifts(evts, snapshots));
      }
    } catch { /* ignore parsing errors */ }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage
    refresh();
  }, []);

  function handleDelete(id: string) {
    removeEvent(id);
    refresh();
  }

  const hasEvents = events.length > 0;

  return (
    <LightBackground>
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-24 space-y-8">
        {/* Back navigation */}
        <div className="pt-2">
          <Link href="/stargazer" className="inline-flex items-center gap-1 text-xs transition-colors" style={{ color: "rgba(176,144,80,0.7)" }}>
            ← 深層観測に戻る
          </Link>
        </div>

        {/* Header */}
        <FadeInView>
          <div className="text-center space-y-2 pt-4">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-3"
              style={{
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.3)",
                color: "#7C3AED",
              }}
            >
              深層観測
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">人生の出来事</h1>
            <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
              出来事を記録すると、性格軸の変化との相関が見えてきます。
            </p>
          </div>
        </FadeInView>

        {/* Section 1: Timeline or empty state */}
        <FadeInView delay={0.05}>
          <section>
            {hasEvents ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-600">
                    記録済み（{events.length}件）
                  </h2>
                  <motion.button
                    type="button"
                    onClick={() => setShowDeleteControls((v) => !v)}
                    whileTap={{ scale: 0.95 }}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showDeleteControls ? "完了" : "編集"}
                  </motion.button>
                </div>

                <AnimatePresence>
                  {showDeleteControls && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 space-y-1 overflow-hidden"
                    >
                      <GlassCard className="p-4" padding="none">
                        <p className="text-xs text-slate-400 mb-3 px-4 pt-4">削除する出来事を選択</p>
                        <div className="divide-y divide-slate-100">
                          {events.map((e) => (
                            <div key={e.id} className="px-4 py-2">
                              <EventDeleteRow event={e} onDelete={handleDelete} />
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    </motion.div>
                  )}
                </AnimatePresence>

                <LifeEventTimeline events={events} />
              </>
            ) : (
              <GlassCard className="p-8 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-sm text-slate-500 leading-relaxed">
                  人生の出来事を記録すると、
                  <br />
                  性格変化との相関が見えてきます。
                </p>
              </GlassCard>
            )}
          </section>
        </FadeInView>

        {/* Section 2: Add form */}
        <FadeInView delay={0.1}>
          <AddEventForm onAdded={refresh} />
        </FadeInView>

        {/* Section 3: Insight panel (only if events exist) */}
        <AnimatePresence>
          {hasEvents && (
            <motion.section
              key="insight"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22 }}
            >
              <GlassCard
                className="p-6"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(59,130,246,0.05) 100%)",
                  border: "1px solid rgba(139,92,246,0.2)",
                }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg"
                    style={{ background: "rgba(139,92,246,0.12)" }}
                  >
                    ✨
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-0.5">観測のヒント</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      出来事と観測データが蓄積されると、どの出来事があなたの性格にどう影響したかが見えてきます。
                    </p>
                  </div>
                </div>

                <CategorySummary events={events} />

                {/* Correlation results */}
                {correlations.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-purple-700">出来事と性格変化の相関</p>
                    {correlations.slice(0, 5).map((c) => (
                      <div key={c.event.id} className="rounded-xl p-3" style={{ background: "rgba(139,92,246,0.06)" }}>
                        <p className="text-xs font-medium text-slate-700 mb-1">
                          {EVENT_CATEGORY_LABELS[c.event.category]?.icon} {c.event.title}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {c.axisChanges.slice(0, 3).map((ch) => (
                            <span
                              key={ch.axis}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                              style={{
                                background: ch.shift > 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                                color: ch.shift > 0 ? "#059669" : "#DC2626",
                              }}
                            >
                              {ch.shift > 0 ? "↑" : "↓"} {ch.axisLabel} ({ch.shift > 0 ? "+" : ""}{(ch.shift * 100).toFixed(0)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {correlations.length === 0 && (
                  <div
                    className="mt-4 rounded-2xl p-3 text-xs text-slate-500 leading-relaxed"
                    style={{ background: "rgba(139,92,246,0.06)" }}
                  >
                    記録した出来事は、深層観測が性格軸の変化と照合します。観測を続けることで、あなたの変化のパターンが浮かび上がります。
                  </div>
                )}
              </GlassCard>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </LightBackground>
  );
}
