"use client";

/**
 * AppearancePreferences
 * 外見の好みを設定するコンポーネント。
 * OnboardingFlow の一ステップとしても、Settings から独立でも使える。
 *
 * 設定項目:
 * 1. マッチング優先順位（顔/スタイル/性格）
 * 2. 顔タイプの好み（8 タイプから最大 3）
 * 3. 骨格タイプの好み（JP3 から最大 3）
 * 4. パーソナルカラーの好み（4 シーズン）
 * 5. 髪型の好み（長さ、最大 3）
 */

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, GlassBadge } from "@/components/ui/glassmorphism-design";
import { FACE_TYPES, type FaceTypeId } from "@/lib/rendezvous/faceTypes";
import { APPEARANCE_SHARED_CATEGORY } from "@/lib/rendezvous/appearanceShared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppearancePreferencesData = {
  matchingPriority: { priorities: string[] };
  preferredFaceTypes: FaceTypeId[];
  preferredBodyTypes: string[];
  preferredPersonalColorSeasons: string[];
  preferredHairFeatures: { lengths?: string[] };
};

type Props = {
  /** 初期値を外部から注入（Settings 利用時） */
  initialData?: Partial<AppearancePreferencesData>;
  /** 完了時コールバック（onboarding 利用時） */
  onComplete?: (data: AppearancePreferencesData) => void;
  /** 独立保存モード（Settings 利用時） */
  standalone?: boolean;
  /** カテゴリ（Settings での保存用） */
  category?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_ITEMS = [
  {
    key: "face",
    label: "顔の好み",
    desc: "顔立ちや雰囲気を重視",
    gradient: "from-pink-400 to-rose-400",
    bg: "rgba(244,114,182,0.08)",
    color: "#EC4899",
  },
  {
    key: "style",
    label: "スタイルの好み",
    desc: "体型や身長を重視",
    gradient: "from-violet-400 to-indigo-400",
    bg: "rgba(139,92,246,0.08)",
    color: "#8B5CF6",
  },
  {
    key: "personality",
    label: "性格の好み",
    desc: "内面や価値観を重視",
    gradient: "from-cyan-400 to-blue-400",
    bg: "rgba(6,182,212,0.08)",
    color: "#06B6D4",
  },
] as const;

const FACE_TYPE_DISPLAY: {
  id: FaceTypeId;
  nickname: string;
  emoji: string;
  color: string;
}[] = [
  { id: "lumiere", nickname: "透明感タイプ", emoji: "✨", color: "#F59E0B" },
  { id: "bloom", nickname: "清涼タイプ", emoji: "🌿", color: "#10B981" },
  { id: "terre", nickname: "癒し系タイプ", emoji: "🌾", color: "#92400E" },
  { id: "aurora", nickname: "ミステリアスタイプ", emoji: "🌌", color: "#7C3AED" },
  { id: "prism", nickname: "エネルギッシュタイプ", emoji: "🔥", color: "#EF4444" },
  { id: "silhouette", nickname: "クールビューティータイプ", emoji: "🧊", color: "#3B82F6" },
  { id: "ember", nickname: "情熱タイプ", emoji: "🌹", color: "#DC2626" },
  { id: "monolith", nickname: "知的タイプ", emoji: "📖", color: "#1E40AF" },
];

const BODY_TYPES = [
  { key: "straight", label: "ストレート", desc: "メリハリ体型", emoji: "📐" },
  { key: "wave", label: "ウェーブ", desc: "華奢で柔らかい体型", emoji: "🌊" },
  { key: "natural", label: "ナチュラル", desc: "骨格しっかり体型", emoji: "🌿" },
] as const;

const PERSONAL_COLORS = [
  { key: "spring", label: "スプリング", emoji: "🌸", color: "#F59E0B" },
  { key: "summer", label: "サマー", emoji: "🌊", color: "#3B82F6" },
  { key: "autumn", label: "オータム", emoji: "🍂", color: "#D97706" },
  { key: "winter", label: "ウィンター", emoji: "❄️", color: "#6366F1" },
] as const;

const HAIR_LENGTHS = [
  { key: "short", label: "ショート" },
  { key: "bob", label: "ボブ" },
  { key: "medium", label: "ミディアム" },
  { key: "semilong", label: "セミロング" },
  { key: "long", label: "ロング" },
] as const;

const MAX_SELECTIONS = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AppearancePreferences({
  initialData,
  onComplete,
  standalone = false,
  category: _categoryProp,
}: Props) {
  // 外見の好みは恋愛・パートナー共通。常に共通カテゴリを使う
  const category = APPEARANCE_SHARED_CATEGORY;
  // --- State ---
  const [priorities, setPriorities] = useState<string[]>(
    initialData?.matchingPriority?.priorities ?? ["personality", "face", "style"],
  );
  const [faceTypes, setFaceTypes] = useState<FaceTypeId[]>(
    initialData?.preferredFaceTypes ?? [],
  );
  const [bodyTypes, setBodyTypes] = useState<string[]>(
    initialData?.preferredBodyTypes ?? [],
  );
  const [personalColors, setPersonalColors] = useState<string[]>(
    initialData?.preferredPersonalColorSeasons ?? [],
  );
  const [hairLengths, setHairLengths] = useState<string[]>(
    initialData?.preferredHairFeatures?.lengths ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(standalone);

  // --- Load existing data in standalone mode ---
  useEffect(() => {
    if (!standalone) return;
    fetch(`/api/rendezvous/appearance-preferences?category=${category}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.preferences) {
          const p = d.preferences;
          if (p.matchingPriority?.priorities)
            setPriorities(p.matchingPriority.priorities);
          if (Array.isArray(p.preferredBodyTypes))
            setBodyTypes(p.preferredBodyTypes);
          if (Array.isArray(p.preferredPersonalColorSeasons))
            setPersonalColors(p.preferredPersonalColorSeasons);
          if (p.preferredHairFeatures?.lengths)
            setHairLengths(p.preferredHairFeatures.lengths);
          // Face types come from a different field via appearancePriorityOrder
          if (Array.isArray(p.appearancePriorityOrder))
            setFaceTypes(p.appearancePriorityOrder as FaceTypeId[]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [standalone, category]);

  // --- Helpers ---
  const buildData = useCallback((): AppearancePreferencesData => {
    return {
      matchingPriority: { priorities },
      preferredFaceTypes: faceTypes,
      preferredBodyTypes: bodyTypes,
      preferredPersonalColorSeasons: personalColors,
      preferredHairFeatures: { lengths: hairLengths },
    };
  }, [priorities, faceTypes, bodyTypes, personalColors, hairLengths]);

  const handlePriorityTap = useCallback((key: string) => {
    setPriorities((prev) => {
      // If already first, cycle to last. Otherwise move to first.
      if (prev[0] === key) {
        return [...prev.filter((k) => k !== key), key];
      }
      return [key, ...prev.filter((k) => k !== key)];
    });
  }, []);

  const toggleSelection = useCallback(
    <T extends string>(
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      value: T,
      max: number = MAX_SELECTIONS,
    ) => {
      setter((prev) => {
        if (prev.includes(value)) return prev.filter((v) => v !== value);
        if (prev.length >= max) return prev;
        return [...prev, value];
      });
    },
    [],
  );

  // --- Save ---
  const handleSave = useCallback(async () => {
    const data = buildData();
    if (onComplete) {
      onComplete(data);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/rendezvous/appearance-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category,
          matchingPriority: data.matchingPriority,
          preferredBodyTypes: data.preferredBodyTypes,
          preferredPersonalColorSeasons: data.preferredPersonalColorSeasons,
          preferredHairFeatures: data.preferredHairFeatures,
          appearancePriorityOrder: data.preferredFaceTypes,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [buildData, onComplete, category]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto gap-6">
      {/* ━━━ Section 1: Matching Priority ━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        <SectionHeader
          title="マッチング優先順位"
          subtitle="タップして1位に。もう一度タップで順位が下がります"
        />
        <div className="flex flex-col gap-2">
          {priorities.map((key, index) => {
            const item = PRIORITY_ITEMS.find((p) => p.key === key)!;
            return (
              <motion.button
                key={key}
                layout
                onClick={() => handlePriorityTap(key)}
                className="relative w-full rounded-2xl p-4 text-left transition-all duration-200 border"
                style={{
                  background: index === 0 ? item.bg : "rgba(255,255,255,0.7)",
                  borderColor:
                    index === 0 ? item.color + "40" : "rgba(99,102,241,0.08)",
                  backdropFilter: "blur(12px)",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{
                      background:
                        index === 0
                          ? `linear-gradient(135deg, ${item.color}, ${item.color}CC)`
                          : "rgba(30,30,60,0.15)",
                    }}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-bold text-slate-800">
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-400 ml-2">
                      {item.desc}
                    </span>
                  </div>
                  {index === 0 && (
                    <GlassBadge variant="gradient" size="sm">
                      1st
                    </GlassBadge>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ━━━ Section 2: Face Type Preferences ━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full"
      >
        <SectionHeader
          title="顔タイプの好み"
          subtitle={`最大${MAX_SELECTIONS}つ選べます（${faceTypes.length}/${MAX_SELECTIONS}）`}
        />
        <div className="grid grid-cols-2 gap-2">
          {FACE_TYPE_DISPLAY.map((ft, i) => {
            const selected = faceTypes.includes(ft.id);
            const rank = faceTypes.indexOf(ft.id);
            const disabled = !selected && faceTypes.length >= MAX_SELECTIONS;

            return (
              <motion.button
                key={ft.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => toggleSelection(setFaceTypes, ft.id)}
                disabled={disabled}
                className={`
                  relative rounded-2xl p-3 text-left transition-all duration-200
                  ${
                    selected
                      ? "border-2 shadow-lg"
                      : "bg-white/70 backdrop-blur-lg border border-slate-200/60 hover:border-slate-300"
                  }
                  ${disabled ? "opacity-35 cursor-not-allowed" : "cursor-pointer"}
                `}
                style={
                  selected
                    ? {
                        borderColor: ft.color,
                        background: `${ft.color}0A`,
                        boxShadow: `0 4px 14px ${ft.color}15`,
                      }
                    : undefined
                }
                whileTap={disabled ? {} : { scale: 0.96 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{ft.emoji}</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: selected ? ft.color : "#334155" }}
                  >
                    {FACE_TYPES[ft.id].name}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {FACE_TYPES[ft.id].description}
                </p>
                <AnimatePresence>
                  {selected && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[10px] text-slate-400 leading-snug mt-1"
                    >
                      {FACE_TYPES[ft.id].detailedDescription}
                    </motion.p>
                  )}
                </AnimatePresence>
                {selected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: ft.color }}
                  >
                    {rank + 1}
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ━━━ Section 3: Body Type Preferences ━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full"
      >
        <SectionHeader
          title="骨格タイプの好み"
          subtitle="好みのタイプを選んでください"
        />
        <div className="flex gap-2">
          {BODY_TYPES.map((bt) => {
            const selected = bodyTypes.includes(bt.key);
            return (
              <motion.button
                key={bt.key}
                onClick={() => toggleSelection<string>(setBodyTypes, bt.key)}
                className={`
                  flex-1 rounded-2xl p-3 text-center transition-all duration-200
                  ${
                    selected
                      ? "bg-gradient-to-br from-violet-500/10 to-pink-500/10 border-2 border-violet-400 shadow-lg shadow-violet-500/10"
                      : "bg-white/70 backdrop-blur-lg border border-slate-200/60 hover:border-slate-300"
                  }
                `}
                whileTap={{ scale: 0.96 }}
              >
                <span className="text-xl block mb-1">{bt.emoji}</span>
                <span className="text-xs font-bold text-slate-800 block">
                  {bt.label}
                </span>
                <span className="text-[10px] text-slate-400">{bt.desc}</span>
                {selected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="mx-auto mt-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center"
                  >
                    <span className="text-white text-[9px] font-bold">
                      {bodyTypes.indexOf(bt.key) + 1}
                    </span>
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ━━━ Section 4: Personal Color Preferences ━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full"
      >
        <SectionHeader
          title="パーソナルカラーの好み"
          subtitle="好みの季節タイプを選んでください"
        />
        <div className="grid grid-cols-2 gap-2">
          {PERSONAL_COLORS.map((pc) => {
            const selected = personalColors.includes(pc.key);
            return (
              <motion.button
                key={pc.key}
                onClick={() => toggleSelection<string>(setPersonalColors, pc.key)}
                className={`
                  rounded-2xl p-3 text-center transition-all duration-200
                  ${
                    selected
                      ? "border-2 shadow-lg"
                      : "bg-white/70 backdrop-blur-lg border border-slate-200/60 hover:border-slate-300"
                  }
                `}
                style={
                  selected
                    ? {
                        borderColor: pc.color,
                        background: `${pc.color}0A`,
                        boxShadow: `0 4px 14px ${pc.color}15`,
                      }
                    : undefined
                }
                whileTap={{ scale: 0.96 }}
              >
                <span className="text-2xl block mb-1">{pc.emoji}</span>
                <span
                  className="text-sm font-bold"
                  style={{ color: selected ? pc.color : "#334155" }}
                >
                  {pc.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ━━━ Section 5: Hair Length Preferences ━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full"
      >
        <SectionHeader
          title="髪型の好み"
          subtitle={`好みの長さを最大${MAX_SELECTIONS}つ（${hairLengths.length}/${MAX_SELECTIONS}）`}
        />
        <div className="flex flex-wrap gap-2">
          {HAIR_LENGTHS.map((hl) => {
            const selected = hairLengths.includes(hl.key);
            const disabled =
              !selected && hairLengths.length >= MAX_SELECTIONS;
            return (
              <motion.button
                key={hl.key}
                onClick={() => toggleSelection<string>(setHairLengths, hl.key)}
                disabled={disabled}
                className={`
                  px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200
                  ${
                    selected
                      ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/20"
                      : "bg-white/70 backdrop-blur-lg border border-slate-200/60 text-slate-600 hover:border-slate-300"
                  }
                  ${disabled ? "opacity-35 cursor-not-allowed" : "cursor-pointer"}
                `}
                whileTap={disabled ? {} : { scale: 0.96 }}
              >
                {hl.label}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ━━━ Save/Next Button ━━━ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full pt-2 pb-4"
      >
        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs font-semibold text-emerald-600 mb-2"
            >
              保存しました
            </motion.p>
          )}
        </AnimatePresence>
        <GlassButton
          variant="gradient"
          fullWidth
          onClick={handleSave}
          disabled={saving}
          loading={saving}
        >
          {standalone ? "保存する" : "次へ"}
        </GlassButton>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
    </div>
  );
}
