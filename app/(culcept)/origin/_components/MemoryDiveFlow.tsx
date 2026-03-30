"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  MemoryDivePhase,
  DiveSceneData,
  DiveSensesData,
  DiveEventsData,
  DiveInnerData,
  DiveRippleData,
  MemoryDiveDraft,
  MemoryGem,
} from "@/lib/origin/v7/types";
import { DIVE_PHASE_ORDER } from "@/lib/origin/v7/types";
import { needsAICompletion, type AICompletionResult } from "@/lib/origin/v7/memoryDiveAI";
import {
  SEASON_CARDS,
  TIME_OF_DAY_CARDS,
  ATMOSPHERE_CARDS,
  PLACE_CARDS,
  PEOPLE_CARDS,
  SIGHT_CARDS,
  SOUND_CARDS,
  SMELL_CARDS,
  TEMPERATURE_CARDS,
  TOUCH_CARDS,
  EVENT_TYPE_CARDS,
  EMOTION_CARDS,
  IMPACT_TYPE_CARDS,
  DIVE_PHASE_META,
  type DiveCard,
} from "@/lib/origin/v7/memoryDiveData";
import { createMemoryGem } from "@/lib/origin/v7/memoryDiveEngine";

/* ─── Props ─── */

type Props = {
  initialYear?: number;
  initialMonth?: number;
  birthYear?: number;
  onComplete: (gem: MemoryGem) => void;
  onCancel: () => void;
};

/* ─── Background palette per phase ─── */

const PHASE_BG: Record<MemoryDivePhase, string> = {
  scene: "bg-[#f5f0e8]",
  senses: "bg-[#ece5d6]",
  events: "bg-[#ddd3be]",
  inner: "bg-[#3a2e20]",
  ripple: "bg-[#f0ebe0]",
};

const PHASE_TEXT: Record<MemoryDivePhase, string> = {
  scene: "text-gray-800",
  senses: "text-gray-800",
  events: "text-gray-800",
  inner: "text-amber-50",
  ripple: "text-gray-800",
};

/* ─── Initial data helpers ─── */

function emptyScene(year?: number, month?: number): DiveSceneData {
  return {
    year: year ?? null,
    month: month ?? null,
    season: null,
    place: "",
    placeCard: null,
    people: [],
    timeOfDay: null,
    atmosphere: null,
  };
}

const emptySenses: DiveSensesData = {
  sight: [], sightText: "",
  sound: [], soundText: "",
  smell: [], smellText: "",
  temperature: null,
  touch: [], touchText: "",
};

const emptyEvents: DiveEventsData = {
  narrative: "",
  eventType: null,
  intensity: 0,
  pivotalMoment: "",
};

const emptyInner: DiveInnerData = {
  emotions: [],
  thoughts: "",
  unsaid: "",
  unsaidTarget: null,
};

const emptyRipple: DiveRippleData = {
  impact: "",
  impactType: null,
  counterfactual: "",
  patternStarted: "",
};

/* ─── Card selector sub-components ─── */

function CardGrid({
  cards,
  selected,
  onToggle,
  multi = false,
  dark = false,
}: {
  cards: DiveCard[];
  selected: string[];
  onToggle: (id: string) => void;
  multi?: boolean;
  dark?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card) => {
        const isSelected = selected.includes(card.id);
        const base = dark
          ? isSelected
            ? "bg-amber-500/30 border-amber-400 text-amber-100"
            : "bg-white/10 border-white/20 text-amber-100"
          : isSelected
            ? "bg-amber-100 border-amber-400 text-amber-800"
            : "bg-white/60 border-gray-200/60 text-gray-600";
        return (
          <motion.button
            key={card.id}
            type="button"
            onClick={() => onToggle(card.id)}
            whileTap={{ scale: 0.95 }}
            className={`rounded-xl px-3 py-2.5 text-sm border transition-colors ${base}`}
          >
            <span className="text-lg">{card.icon}</span>
            <span className="ml-1.5">{card.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function SectionLabel({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={`text-sm font-semibold mb-2 ${dark ? "text-amber-200/80" : "text-amber-700/80"}`}
    >
      {children}
    </p>
  );
}

function InputField({
  value,
  onChange,
  placeholder,
  rows,
  dark = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  dark?: boolean;
}) {
  const cls = dark
    ? "bg-white/10 border-white/20 text-amber-50 placeholder-amber-300/40 focus:border-amber-400"
    : "bg-white/70 border-amber-200/50 text-gray-800 placeholder-gray-400 focus:border-amber-400";

  if (rows && rows > 1) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full rounded-xl px-4 py-3 text-sm border backdrop-blur-sm focus:outline-none transition-colors resize-none ${cls}`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl px-4 py-3 text-sm border backdrop-blur-sm focus:outline-none transition-colors ${cls}`}
    />
  );
}

/* ─── AI Reflection field ─── */

function ReflectionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-amber-200/70 mb-1">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-xl px-4 py-3 text-sm bg-white/10 border border-white/20 text-amber-50 placeholder-amber-300/40 focus:border-amber-400 focus:outline-none transition-colors resize-none"
      />
    </div>
  );
}

/* ─── Intensity selector ─── */

function IntensityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 mr-1">強さ</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-7 h-7 rounded-full border-2 transition-colors ${
            n <= value
              ? "bg-amber-400 border-amber-500"
              : "bg-white/50 border-gray-300/60"
          }`}
        />
      ))}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                              MAIN COMPONENT                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function MemoryDiveFlow({
  initialYear,
  initialMonth,
  birthYear,
  onComplete,
  onCancel,
}: Props) {
  /* ─ phase state ─ */
  const [currentPhase, setCurrentPhase] = useState<MemoryDivePhase>("scene");
  const [error, setError] = useState<string | null>(null);

  /* ─ draft data ─ */
  const [scene, setScene] = useState<DiveSceneData>(
    emptyScene(initialYear, initialMonth),
  );
  const [senses, setSenses] = useState<DiveSensesData>(emptySenses);
  const [events, setEvents] = useState<DiveEventsData>(emptyEvents);
  const [inner, setInner] = useState<DiveInnerData>(emptyInner);
  const [ripple, setRipple] = useState<DiveRippleData>(emptyRipple);

  /* ─ AI reflection state ─ */
  const [showReflection, setShowReflection] = useState(false);
  const [aiCompletion, setAiCompletion] = useState<AICompletionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  // Editable copies of AI-generated text (user can modify before crystallization)
  const [editedCompletion, setEditedCompletion] = useState<AICompletionResult | null>(null);
  const fetchedRef = useRef(false);

  /* ─ derived ─ */
  const phaseIdx = DIVE_PHASE_ORDER.indexOf(currentPhase);
  const meta = DIVE_PHASE_META[phaseIdx];
  const isDark = currentPhase === "inner" || showReflection;
  const isLastPhase = phaseIdx === DIVE_PHASE_ORDER.length - 1;

  /* ─ helpers ─ */
  const toggleSingle = useCallback(
    <T extends Record<string, unknown>>(
      setter: React.Dispatch<React.SetStateAction<T>>,
      key: keyof T,
    ) =>
      (id: string) => {
        setter((prev) => ({
          ...prev,
          [key]: prev[key] === id ? null : id,
        }));
      },
    [],
  );

  const toggleMulti = useCallback(
    <T extends Record<string, unknown>>(
      setter: React.Dispatch<React.SetStateAction<T>>,
      key: keyof T,
    ) =>
      (id: string) => {
        setter((prev) => {
          const arr = (prev[key] as string[]) ?? [];
          return {
            ...prev,
            [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
          };
        });
      },
    [],
  );

  /* ─ phase validation (card-centric: cards are sufficient, text is optional) ─ */
  const canProceed = useMemo(() => {
    switch (currentPhase) {
      case "scene":
        // Place card OR place text is sufficient
        return scene.placeCard !== null || scene.place.trim().length > 0;
      case "senses":
        return (
          senses.sight.length > 0 ||
          senses.sound.length > 0 ||
          senses.smell.length > 0 ||
          senses.temperature !== null ||
          senses.touch.length > 0
        );
      case "events":
        // eventType card is sufficient (narrative is optional)
        return events.eventType !== null;
      case "inner":
        return inner.emotions.length > 0;
      case "ripple":
        // impactType card is sufficient (impact text is optional)
        return ripple.impactType !== null;
      default:
        return false;
    }
  }, [currentPhase, scene, senses, events, inner, ripple]);

  /* ─ AI completion fetch ─ */
  const fetchAICompletion = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setAiLoading(true);
    setAiError(false);
    try {
      const res = await fetch("/api/origin/memory-dive-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, senses, events, inner, ripple }),
      });
      if (!res.ok) throw new Error("AI completion failed");
      const data = await res.json();
      if (data.ok && data.completion) {
        setAiCompletion(data.completion);
        setEditedCompletion(data.completion);
      } else {
        setAiError(true);
      }
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  }, [scene, senses, events, inner, ripple]);

  /* ─ crystallize (with optional AI completion merge) ─ */
  const crystallize = useCallback((completion?: AICompletionResult | null) => {
    // Merge AI completion into draft data
    const finalEvents = { ...events };
    const finalInner = { ...inner };
    const finalRipple = { ...ripple };

    if (completion) {
      if (!finalEvents.narrative.trim()) finalEvents.narrative = completion.narrative;
      if (!finalEvents.pivotalMoment.trim()) finalEvents.pivotalMoment = completion.pivotalMoment;
      if (!finalInner.thoughts.trim()) finalInner.thoughts = completion.thoughts;
      if (!finalInner.unsaid.trim()) finalInner.unsaid = completion.unsaid;
      if (!finalRipple.impact.trim()) finalRipple.impact = completion.impact;
      if (!finalRipple.counterfactual.trim()) finalRipple.counterfactual = completion.counterfactual;
      if (!finalRipple.patternStarted.trim()) finalRipple.patternStarted = completion.patternStarted;
    }

    const draft: MemoryDiveDraft = {
      id: crypto.randomUUID(),
      scene,
      senses,
      events: finalEvents,
      inner: finalInner,
      ripple: finalRipple,
      currentPhase: "ripple",
      startedAt: new Date().toISOString(),
    };
    const gem = createMemoryGem(draft, birthYear);
    if (!gem) {
      setError("記憶の結晶化に失敗しました");
      return;
    }
    onComplete(gem);
  }, [scene, senses, events, inner, ripple, birthYear, onComplete]);

  /* ─ navigation ─ */
  const goNext = useCallback(() => {
    if (showReflection) {
      // Crystallize with edited AI completion
      crystallize(editedCompletion);
      return;
    }

    if (isLastPhase) {
      // Check if AI completion is needed
      if (needsAICompletion(events, inner, ripple)) {
        setShowReflection(true);
        fetchedRef.current = false;
        fetchAICompletion();
        return;
      }
      // All text fields filled — crystallize directly
      crystallize();
      return;
    }
    setCurrentPhase(DIVE_PHASE_ORDER[phaseIdx + 1]);
  }, [isLastPhase, showReflection, phaseIdx, events, inner, ripple, editedCompletion, crystallize, fetchAICompletion]);

  const goBack = useCallback(() => {
    if (showReflection) {
      setShowReflection(false);
      return;
    }
    if (phaseIdx === 0) {
      onCancel();
      return;
    }
    setCurrentPhase(DIVE_PHASE_ORDER[phaseIdx - 1]);
  }, [showReflection, phaseIdx, onCancel]);

  /* ─ months for select ─ */
  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  /* ─ phase count for indicator (5 base + 1 if reflection) ─ */
  const totalDots = showReflection ? DIVE_PHASE_ORDER.length + 1 : DIVE_PHASE_ORDER.length;
  const currentDot = showReflection ? DIVE_PHASE_ORDER.length : phaseIdx;

  /* ━━━ RENDER ━━━ */
  return (
    <motion.div
      className={`min-h-screen ${showReflection ? "bg-[#1a1520]" : PHASE_BG[currentPhase]} ${showReflection ? "text-amber-50" : PHASE_TEXT[currentPhase]} transition-colors duration-700`}
    >
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* ─ Phase indicator ─ */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {Array.from({ length: totalDots }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <motion.div
                className={`w-3 h-3 rounded-full transition-colors duration-500 ${
                  i === currentDot
                    ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                    : i < currentDot
                      ? isDark
                        ? "bg-amber-600/60"
                        : "bg-amber-300"
                      : isDark
                        ? "bg-white/20"
                        : "bg-gray-300/60"
                }`}
                animate={
                  i === currentDot ? { scale: [1, 1.3, 1] } : { scale: 1 }
                }
                transition={{
                  duration: 1.5,
                  repeat: i === currentDot ? Infinity : 0,
                  ease: "easeInOut",
                }}
              />
              {i < totalDots - 1 && (
                <div
                  className={`w-6 h-px ${
                    i < currentDot
                      ? isDark
                        ? "bg-amber-600/40"
                        : "bg-amber-300/60"
                      : isDark
                        ? "bg-white/10"
                        : "bg-gray-300/40"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* ─ Phase header ─ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={showReflection ? "reflection" : currentPhase}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4 }}
            className="mb-6 text-center"
          >
            {showReflection ? (
              <>
                <span className="text-2xl">🪞</span>
                <h2 className="text-xl font-bold mt-1 text-amber-100">
                  振り返り
                </h2>
                <p className="text-sm mt-1 text-amber-200/60">
                  カード選択から記憶を言語化しました
                </p>
              </>
            ) : (
              <>
                <span className="text-2xl">{meta.icon}</span>
                <h2
                  className={`text-xl font-bold mt-1 ${isDark ? "text-amber-100" : "text-amber-900"}`}
                >
                  {meta.label}
                </h2>
                <p
                  className={`text-sm mt-1 ${isDark ? "text-amber-200/60" : "text-amber-700/60"}`}
                >
                  {meta.hint}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ─ Phase content ─ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={showReflection ? "reflection" : currentPhase}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35 }}
            className="space-y-5"
          >
            {/* ─── SCENE ─── */}
            {currentPhase === "scene" && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <SectionLabel>年</SectionLabel>
                    <input
                      type="number"
                      value={scene.year ?? ""}
                      onChange={(e) =>
                        setScene((p) => ({
                          ...p,
                          year: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      placeholder="例: 2005"
                      className="w-full rounded-xl px-4 py-3 text-sm bg-white/70 border border-amber-200/50 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                  <div className="w-28">
                    <SectionLabel>月</SectionLabel>
                    <select
                      value={scene.month ?? ""}
                      onChange={(e) =>
                        setScene((p) => ({
                          ...p,
                          month: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      className="w-full rounded-xl px-3 py-3 text-sm bg-white/70 border border-amber-200/50 text-gray-800 focus:outline-none focus:border-amber-400 transition-colors"
                    >
                      <option value="">--</option>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}月
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <SectionLabel>季節</SectionLabel>
                  <CardGrid
                    cards={SEASON_CARDS}
                    selected={scene.season ? [scene.season] : []}
                    onToggle={toggleSingle(setScene, "season")}
                  />
                </div>

                <div>
                  <SectionLabel>場所</SectionLabel>
                  <CardGrid
                    cards={PLACE_CARDS}
                    selected={scene.placeCard ? [scene.placeCard] : []}
                    onToggle={toggleSingle(setScene, "placeCard")}
                  />
                  <div className="mt-2">
                    <InputField
                      value={scene.place}
                      onChange={(v) => setScene((p) => ({ ...p, place: v }))}
                      placeholder="具体的な場所の名前があれば...（任意）"
                    />
                  </div>
                </div>

                <div>
                  <SectionLabel>誰がいたか</SectionLabel>
                  <CardGrid
                    cards={PEOPLE_CARDS}
                    selected={scene.people}
                    onToggle={toggleMulti(setScene, "people")}
                    multi
                  />
                </div>

                <div>
                  <SectionLabel>時間帯</SectionLabel>
                  <CardGrid
                    cards={TIME_OF_DAY_CARDS}
                    selected={scene.timeOfDay ? [scene.timeOfDay] : []}
                    onToggle={toggleSingle(setScene, "timeOfDay")}
                  />
                </div>

                <div>
                  <SectionLabel>天気・空気</SectionLabel>
                  <CardGrid
                    cards={ATMOSPHERE_CARDS}
                    selected={scene.atmosphere ? [scene.atmosphere] : []}
                    onToggle={toggleSingle(setScene, "atmosphere")}
                  />
                </div>
              </>
            )}

            {/* ─── SENSES ─── */}
            {currentPhase === "senses" && (
              <>
                <div>
                  <SectionLabel>
                    <span className="mr-1">{"👁\uFE0F"}</span>視覚
                  </SectionLabel>
                  <CardGrid
                    cards={SIGHT_CARDS}
                    selected={senses.sight}
                    onToggle={toggleMulti(setSenses, "sight")}
                    multi
                  />
                  <InputField
                    value={senses.sightText}
                    onChange={(v) => setSenses((p) => ({ ...p, sightText: v }))}
                    placeholder="目に浮かぶ映像があれば..."
                  />
                </div>

                <div>
                  <SectionLabel>
                    <span className="mr-1">{"👂"}</span>聴覚
                  </SectionLabel>
                  <CardGrid
                    cards={SOUND_CARDS}
                    selected={senses.sound}
                    onToggle={toggleMulti(setSenses, "sound")}
                    multi
                  />
                  <InputField
                    value={senses.soundText}
                    onChange={(v) => setSenses((p) => ({ ...p, soundText: v }))}
                    placeholder="聞こえていた音があれば..."
                  />
                </div>

                <div>
                  <SectionLabel>
                    <span className="mr-1">{"👃"}</span>嗅覚
                  </SectionLabel>
                  <CardGrid
                    cards={SMELL_CARDS}
                    selected={senses.smell}
                    onToggle={toggleMulti(setSenses, "smell")}
                    multi
                  />
                  <InputField
                    value={senses.smellText}
                    onChange={(v) => setSenses((p) => ({ ...p, smellText: v }))}
                    placeholder="匂いの記憶があれば..."
                  />
                </div>

                <div>
                  <SectionLabel>
                    <span className="mr-1">{"\uD83C\uDF21\uFE0F"}</span>温度
                  </SectionLabel>
                  <CardGrid
                    cards={TEMPERATURE_CARDS}
                    selected={senses.temperature ? [senses.temperature] : []}
                    onToggle={toggleSingle(setSenses, "temperature")}
                  />
                </div>

                <div>
                  <SectionLabel>
                    <span className="mr-1">{"\u270B"}</span>触覚
                  </SectionLabel>
                  <CardGrid
                    cards={TOUCH_CARDS}
                    selected={senses.touch}
                    onToggle={toggleMulti(setSenses, "touch")}
                    multi
                  />
                  <InputField
                    value={senses.touchText}
                    onChange={(v) => setSenses((p) => ({ ...p, touchText: v }))}
                    placeholder="触れた感触があれば..."
                  />
                </div>
              </>
            )}

            {/* ─── EVENTS ─── */}
            {currentPhase === "events" && (
              <>
                <div>
                  <SectionLabel>何が起きたか</SectionLabel>
                  <InputField
                    value={events.narrative}
                    onChange={(v) =>
                      setEvents((p) => ({ ...p, narrative: v }))
                    }
                    placeholder="そのとき何が起きていたか..."
                    rows={4}
                  />
                </div>

                <div>
                  <SectionLabel>出来事のタイプ</SectionLabel>
                  <CardGrid
                    cards={EVENT_TYPE_CARDS}
                    selected={events.eventType ? [events.eventType] : []}
                    onToggle={toggleSingle(setEvents, "eventType")}
                  />
                </div>

                <div>
                  <IntensityPicker
                    value={events.intensity}
                    onChange={(v) =>
                      setEvents((p) => ({ ...p, intensity: v }))
                    }
                  />
                </div>

                <div>
                  <SectionLabel>最も重要な瞬間</SectionLabel>
                  <InputField
                    value={events.pivotalMoment}
                    onChange={(v) =>
                      setEvents((p) => ({ ...p, pivotalMoment: v }))
                    }
                    placeholder="決定的だった瞬間..."
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* ─── INNER (dark phase) ─── */}
            {currentPhase === "inner" && (
              <>
                <div>
                  <SectionLabel dark>感情</SectionLabel>
                  <CardGrid
                    cards={EMOTION_CARDS}
                    selected={inner.emotions}
                    onToggle={toggleMulti(setInner, "emotions")}
                    multi
                    dark
                  />
                </div>

                <div>
                  <SectionLabel dark>何を考えていたか</SectionLabel>
                  <InputField
                    value={inner.thoughts}
                    onChange={(v) =>
                      setInner((p) => ({ ...p, thoughts: v }))
                    }
                    placeholder="頭の中を巡っていたこと..."
                    rows={3}
                    dark
                  />
                </div>

                <div>
                  <SectionLabel dark>言えなかったこと</SectionLabel>
                  <InputField
                    value={inner.unsaid}
                    onChange={(v) =>
                      setInner((p) => ({ ...p, unsaid: v }))
                    }
                    placeholder="本当は言いたかったこと..."
                    rows={3}
                    dark
                  />
                </div>

                <div>
                  <SectionLabel dark>誰に言えなかったか</SectionLabel>
                  <InputField
                    value={inner.unsaidTarget ?? ""}
                    onChange={(v) =>
                      setInner((p) => ({
                        ...p,
                        unsaidTarget: v || null,
                      }))
                    }
                    placeholder="その相手..."
                    dark
                  />
                </div>
              </>
            )}

            {/* ─── RIPPLE ─── */}
            {currentPhase === "ripple" && (
              <>
                <div>
                  <SectionLabel>
                    この出来事は、あなたをどう変えた？
                  </SectionLabel>
                  <InputField
                    value={ripple.impact}
                    onChange={(v) =>
                      setRipple((p) => ({ ...p, impact: v }))
                    }
                    placeholder="あなたの中で何が変わったか..."
                    rows={3}
                  />
                </div>

                <div>
                  <SectionLabel>影響の種類</SectionLabel>
                  <CardGrid
                    cards={IMPACT_TYPE_CARDS}
                    selected={ripple.impactType ? [ripple.impactType] : []}
                    onToggle={toggleSingle(setRipple, "impactType")}
                  />
                </div>

                <div>
                  <SectionLabel>もしこれがなかったら？</SectionLabel>
                  <InputField
                    value={ripple.counterfactual}
                    onChange={(v) =>
                      setRipple((p) => ({ ...p, counterfactual: v }))
                    }
                    placeholder="この出来事がなければ..."
                    rows={3}
                  />
                </div>

                <div>
                  <SectionLabel>ここから始まったパターンは？</SectionLabel>
                  <InputField
                    value={ripple.patternStarted}
                    onChange={(v) =>
                      setRipple((p) => ({ ...p, patternStarted: v }))
                    }
                    placeholder="繰り返すようになったこと..."
                    rows={3}
                  />
                </div>
              </>
            )}

            {/* ─── AI REFLECTION ─── */}
            {showReflection && (
              <>
                {aiLoading && (
                  <div className="text-center py-8">
                    <motion.div
                      className="inline-block w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <p className="text-sm mt-3 text-amber-200/60">
                      記憶を言語化しています...
                    </p>
                  </div>
                )}

                {aiError && (
                  <div className="text-center py-8">
                    <p className="text-sm text-amber-200/60 mb-3">
                      言語化に失敗しました。テキストを手動で追加するか、このまま結晶化できます。
                    </p>
                    <button
                      type="button"
                      onClick={() => crystallize()}
                      className="px-4 py-2 rounded-xl text-sm bg-amber-400 text-amber-950 font-medium"
                    >
                      このまま結晶化する
                    </button>
                  </div>
                )}

                {editedCompletion && !aiLoading && !aiError && (
                  <div className="space-y-4">
                    <p className="text-xs text-amber-200/50 text-center mb-2">
                      AIが補完した内容を確認・編集できます
                    </p>

                    <ReflectionField
                      label="何が起きていたか"
                      value={editedCompletion.narrative}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, narrative: v } : p)}
                    />
                    <ReflectionField
                      label="決定的だった瞬間"
                      value={editedCompletion.pivotalMoment}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, pivotalMoment: v } : p)}
                    />
                    <ReflectionField
                      label="頭の中にあったこと"
                      value={editedCompletion.thoughts}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, thoughts: v } : p)}
                    />
                    <ReflectionField
                      label="言えなかったこと"
                      value={editedCompletion.unsaid}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, unsaid: v } : p)}
                    />
                    <ReflectionField
                      label="自分をどう変えたか"
                      value={editedCompletion.impact}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, impact: v } : p)}
                    />
                    <ReflectionField
                      label="もしこれがなかったら"
                      value={editedCompletion.counterfactual}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, counterfactual: v } : p)}
                    />
                    <ReflectionField
                      label="ここから始まったパターン"
                      value={editedCompletion.patternStarted}
                      onChange={(v) => setEditedCompletion((p) => p ? { ...p, patternStarted: v } : p)}
                    />
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ─ Error ─ */}
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-400 text-sm text-center mt-4"
          >
            {error}
          </motion.p>
        )}

        {/* ─ Navigation ─ */}
        <div className="flex items-center justify-between mt-8 gap-3">
          <motion.button
            type="button"
            onClick={goBack}
            whileTap={{ scale: 0.96 }}
            className={`px-5 py-2.5 rounded-2xl text-sm font-medium transition-colors ${
              isDark
                ? "bg-white/10 text-amber-200 border border-white/20 hover:bg-white/15"
                : "bg-white/60 text-amber-800 border border-amber-200/50 hover:bg-white/80"
            }`}
          >
            {phaseIdx === 0 && !showReflection ? "やめる" : "戻る"}
          </motion.button>

          <motion.button
            type="button"
            onClick={goNext}
            disabled={showReflection ? (aiLoading || (aiError && false)) : !canProceed}
            whileTap={(showReflection ? !aiLoading : canProceed) ? { scale: 0.96 } : {}}
            className={`px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
              (showReflection ? !aiLoading : canProceed)
                ? isDark
                  ? "bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30 hover:bg-amber-300"
                  : "bg-amber-500 text-white shadow-lg shadow-amber-500/30 hover:bg-amber-400"
                : isDark
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : "bg-gray-200/60 text-gray-400 cursor-not-allowed"
            }`}
          >
            {showReflection ? "記憶を結晶化する" : isLastPhase ? "次へ" : "次へ"}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
