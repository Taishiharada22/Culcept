"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { safeLSSet } from "@/lib/safeLocalStorage";
import { motion, AnimatePresence } from "framer-motion";
import type {
  LifeProfileStore,
  LifeProfileEntry,
  LifeProfileCategory,
  DepthResponse,
  CategoryDepth,
} from "@/lib/origin/lifeProfile/types";
import { CATEGORY_META } from "@/lib/origin/lifeProfile/types";
import {
  loadLifeProfileStore,
  saveLifeProfileStore,
  newEntryId,
  addEntry,
  removeEntry,
  addDepthResponse,
  getEntriesByCategory,
  getCategoryDepths,
  getOverallDepth,
  getNextDepthQuestion,
  setRendezvousConsent,
} from "@/lib/origin/lifeProfile/store";
import {
  generateRendezvousSignals,
  summarizeSignals,
} from "@/lib/origin/lifeProfile/rendezvousPipeline";
import {
  generateDailyInsight,
  type DailyInsight,
} from "@/lib/origin/lifeProfile/insightEngine";
import {
  recordEvent,
  startSession,
  endSession,
} from "@/lib/origin/lifeProfile/passiveObserver";
import { compressImage } from "@/lib/origin/lifeProfile/imageUtils";
import { useSaveToast } from "@/components/ui/SaveToastProvider";
import {
  startVoiceCapture,
  isSpeechRecognitionSupported,
  isMediaRecorderSupported,
} from "@/lib/origin/lifeProfile/voiceCapture";
import {
  captureLocation,
  isGeolocationSupported,
  type LocationSnapshot,
} from "@/lib/origin/lifeProfile/geolocation";
import {
  syncToSupabase,
  upsertEntryToSupabase,
  deleteEntryFromSupabase,
  syncConsentToSupabase,
} from "@/lib/origin/lifeProfile/sync";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #4 Onboarding — 対話型の初回体験
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ONBOARDING_PROMPTS: {
  category: LifeProfileCategory;
  question: string;
  placeholder: string;
}[] = [
  {
    category: "passions",
    question: "今、一番時間を忘れて夢中になれることは？",
    placeholder: "例: 料理、登山、ゲーム...",
  },
  {
    category: "values",
    question: "人生で絶対に譲れないことを一つだけ。",
    placeholder: "例: 誠実さ、自由、家族...",
  },
  {
    category: "career",
    question: "今の仕事（やっていること）を一言で。",
    placeholder: "例: Webエンジニア、学生、フリーランスデザイナー...",
  },
];

function OnboardingFlow({
  onComplete,
}: {
  onComplete: (entries: { category: LifeProfileCategory; title: string }[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<
    { category: LifeProfileCategory; title: string }[]
  >([]);
  const [text, setText] = useState("");
  const prompt = ONBOARDING_PROMPTS[step];

  const handleNext = () => {
    if (!text.trim()) return;
    const next = [...answers, { category: prompt.category, title: text.trim() }];
    setText("");

    if (step < ONBOARDING_PROMPTS.length - 1) {
      setAnswers(next);
      setStep(step + 1);
    } else {
      onComplete(next);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-6"
    >
      <motion.p
        key={`label-${step}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[10px] tracking-[0.2em] text-violet-400/70 uppercase font-medium mb-2"
      >
        {step + 1} / {ONBOARDING_PROMPTS.length}
      </motion.p>

      <motion.p
        key={`q-${step}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-bold text-gray-800 text-center leading-relaxed mb-8"
      >
        {prompt.question}
      </motion.p>

      <motion.div
        key={`input-${step}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="w-full max-w-sm"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
          placeholder={prompt.placeholder}
          autoFocus
          className="w-full rounded-2xl border border-gray-200/50 bg-white/60 backdrop-blur-sm px-5 py-4 text-base text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-200/60 text-center"
        />

        <button
          onClick={handleNext}
          disabled={!text.trim()}
          className="w-full mt-4 rounded-2xl bg-violet-400/80 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-20"
        >
          {step < ONBOARDING_PROMPTS.length - 1 ? "次へ" : "始める"}
        </button>

        {step > 0 && (
          <button
            onClick={() => {
              setStep(step - 1);
              setAnswers(answers.slice(0, -1));
              setText(answers[answers.length - 1]?.title ?? "");
            }}
            className="w-full mt-2 text-xs text-gray-400 hover:text-gray-500"
          >
            戻る
          </button>
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-10 text-[11px] text-gray-400 text-center max-w-xs leading-relaxed"
      >
        まず3つだけ。あなたのプロフィールを描き始めましょう。
        <br />
        残りはいつでも追加できます。
      </motion.p>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #4b Forced Profile Input — タブツアー後にRendezvous必須項目を強制入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FORCED_DONE_KEY = "aneurasync_profile_forced_input_done_v1";

// ── 家族・同居 ──
const FAMILY_OPTIONS = [
  "一人暮らし",
  "実家暮らし（両親と）",
  "実家暮らし（片親と）",
  "兄弟・姉妹と同居",
  "配偶者・パートナーと二人暮らし",
  "配偶者と子どもと同居",
  "子どもと二人暮らし（シングル）",
  "祖父母と同居",
  "友人・知人とシェアハウス",
  "寮・社宅",
];

// ── ペット ──
const PET_OPTIONS = [
  "犬",
  "猫",
  "うさぎ",
  "ハムスター・小動物",
  "鳥",
  "魚・アクアリウム",
  "爬虫類",
  "その他の動物",
  "飼っていないが好き",
  "飼っていない",
];

// ── 住環境 ──
const LIVING_OPTIONS = [
  "都心・繁華街",
  "住宅街",
  "郊外",
  "田舎・地方",
  "海の近く",
  "山の近く",
  "下町・商店街エリア",
  "大学・学生街",
  "新興住宅地",
  "海外在住",
];

type ForcedStep = {
  key: "family" | "pets" | "living";
  icon: string;
  title: string;
  sub: string;
  options: string[];
  category: LifeProfileCategory;
  multiSelect?: boolean;
};

const FORCED_STEPS: ForcedStep[] = [
  {
    key: "family",
    icon: "🏠",
    title: "今の暮らしは？",
    sub: "誰と暮らしているか教えて。",
    options: FAMILY_OPTIONS,
    category: "family",
  },
  {
    key: "pets",
    icon: "🐾",
    title: "ペットや動物は？",
    sub: "一緒にいる動物、または好きな動物を。複数OK。",
    options: PET_OPTIONS,
    category: "pets",
    multiSelect: true,
  },
  {
    key: "living",
    icon: "🌏",
    title: "どんな場所に住んでる？",
    sub: "今の住環境に近いものを選んで。",
    options: LIVING_OPTIONS,
    category: "living",
  },
];

export function isProfileForcedInputDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(FORCED_DONE_KEY) === "1";
}

function ProfileForcedInputOverlay({
  onComplete,
}: {
  onComplete: (entries: { category: LifeProfileCategory; title: string }[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({
    family: [],
    pets: [],
    living: [],
  });
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [shake, setShake] = useState(false);

  const current = FORCED_STEPS[step];
  const isLast = step === FORCED_STEPS.length - 1;
  const selected = selections[current.key];

  const canProceed = selected.length > 0 || customText.trim().length > 0;

  const toggleOption = (opt: string) => {
    setSelections((prev) => {
      const arr = prev[current.key];
      if (current.multiSelect) {
        return {
          ...prev,
          [current.key]: arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt],
        };
      }
      // single select: toggle
      return {
        ...prev,
        [current.key]: arr.includes(opt) ? [] : [opt],
      };
    });
  };

  const handleNext = () => {
    if (!canProceed) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (isLast) {
      // Collect all entries
      const entries: { category: LifeProfileCategory; title: string }[] = [];
      for (const s of FORCED_STEPS) {
        for (const val of selections[s.key]) {
          entries.push({ category: s.category, title: val });
        }
      }
      // Add custom text for current step if any
      if (customText.trim()) {
        entries.push({ category: current.category, title: customText.trim() });
      }
      safeLSSet(FORCED_DONE_KEY, "1");
      onComplete(entries);
      return;
    }
    // Save custom text for current step before moving
    if (customText.trim()) {
      setSelections((prev) => ({
        ...prev,
        [current.key]: [...prev[current.key], customText.trim()],
      }));
    }
    setStep((s) => s + 1);
    setShowCustom(false);
    setCustomText("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          borderRadius: 24,
          padding: "28px 24px 24px",
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
          border: "1px solid rgba(0,0,0,0.04)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {/* Step indicator */}
        <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
          {FORCED_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: i === step ? 2 : 1,
                height: 3,
                borderRadius: 2,
                background:
                  i < step
                    ? "#8b5cf6"
                    : i === step
                      ? "linear-gradient(90deg, #8b5cf6, #06b6d4)"
                      : "#e2e8f0",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Icon + Title */}
        <div style={{ fontSize: 32, marginBottom: 8 }}>{current.icon}</div>
        <motion.h2
          animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          style={{
            fontSize: 19,
            fontWeight: 900,
            color: "#0f172a",
            lineHeight: 1.3,
            margin: "0 0 4px",
          }}
        >
          {current.title}
        </motion.h2>
        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 18px" }}>
          {current.sub}
        </p>

        {/* Chips */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {current.options.map((opt) => {
                const isSelected = selected.includes(opt);
                return (
                  <motion.button
                    key={`${current.key}-${opt}`}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 20,
                      border: isSelected ? "2px solid #8b5cf6" : "2px solid #e2e8f0",
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(6,182,212,0.06))"
                        : "#f8fafc",
                      color: isSelected ? "#6d28d9" : "#475569",
                      fontSize: 13,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {opt}
                  </motion.button>
                );
              })}

              {/* その他 */}
              {!showCustom && (
                <motion.button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: "2px dashed #cbd5e1",
                    background: "transparent",
                    color: "#94a3b8",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  + その他
                </motion.button>
              )}
            </div>

            {showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                style={{ marginTop: 10 }}
              >
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="自由に入力..."
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 14,
                    border: "2px solid #e2e8f0",
                    borderRadius: 12,
                    outline: "none",
                    background: "#f8fafc",
                    color: "#0f172a",
                  }}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#8b5cf6"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#e2e8f0"; }}
                />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 22,
          }}
        >
          <div>
            {step > 0 && (
              <button
                type="button"
                onClick={() => { setStep((s) => s - 1); setShowCustom(false); setCustomText(""); }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#94a3b8",
                  padding: "8px 0",
                }}
              >
                戻る
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNext}
            style={{
              background: !canProceed
                ? "#cbd5e1"
                : "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "12px 28px",
              fontSize: 14,
              fontWeight: 800,
              cursor: !canProceed ? "not-allowed" : "pointer",
              boxShadow: !canProceed ? "none" : "0 4px 15px rgba(139,92,246,0.3)",
              transition: "all 0.2s",
            }}
          >
            {isLast ? "完了" : "次へ"}
          </button>
        </div>

        {step === 0 && (
          <p
            style={{
              fontSize: 11,
              color: "#94a3b8",
              textAlign: "center",
              marginTop: 14,
              lineHeight: 1.5,
            }}
          >
            あなたの分身が相性の良い人を見つけるために必要な情報です
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #2 AI Daily Insight Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INSIGHT_ICON: Record<DailyInsight["type"], string> = {
  cross_connection: "🔗",
  depth_nudge: "🔍",
  pattern: "🎯",
  absence: "👁",
  milestone: "✦",
};

const INSIGHT_GRADIENT: Record<DailyInsight["type"], string> = {
  cross_connection: "from-violet-50/40 to-cyan-50/30",
  depth_nudge: "from-amber-50/40 to-orange-50/30",
  pattern: "from-emerald-50/40 to-teal-50/30",
  absence: "from-slate-50/40 to-gray-50/30",
  milestone: "from-yellow-50/40 to-amber-50/30",
};

function DailyInsightCard({
  insight,
  onDismiss,
}: {
  insight: DailyInsight;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12 }}
      className={`rounded-3xl border border-gray-100/40 bg-gradient-to-br ${INSIGHT_GRADIENT[insight.type]} backdrop-blur-sm p-5`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">{INSIGHT_ICON[insight.type]}</span>
        <div className="flex-1">
          <p className="text-[10px] tracking-[0.12em] text-gray-400 uppercase font-medium mb-1">
            今日の気づき
          </p>
          <p className="text-sm font-bold text-gray-800 mb-1.5">
            {insight.title}
          </p>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            {insight.body}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-300 hover:text-gray-500 transition-all text-xs mt-1"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #1 Quick Capture — 写真ワンタップ or テキスト即入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function QuickCaptureSheet({
  onSubmit,
  onClose,
}: {
  onSubmit: (data: {
    category: LifeProfileCategory;
    title: string;
    thumbnail: string | null;
    audioUrl: string | null;
    voiceTranscript: string | null;
    location: { latitude: number; longitude: number; label: string | null } | null;
  }) => void;
  onClose: () => void;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LifeProfileCategory | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureStartRef = useRef(Date.now());

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const voiceSessionRef = useRef<{ stop: () => Promise<{ transcript: string; durationMs: number; audioUrl: string | null }>; cancel: () => void } | null>(null);

  // Location state
  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    recordEvent({ type: "photo_capture", category: null, timestamp: Date.now() });
    try {
      const data = await compressImage(file);
      setThumbnail(data);
    } catch {
      /* ignore */
    } finally {
      setCompressing(false);
    }
  };

  // #1 Voice recording
  const handleVoiceStart = async () => {
    if (!isMediaRecorderSupported()) return;
    try {
      const session = await startVoiceCapture({
        onInterim: (text) => setInterimText(text),
      });
      voiceSessionRef.current = session;
      setIsRecording(true);
    } catch {
      /* mic denied */
    }
  };

  const handleVoiceStop = async () => {
    if (!voiceSessionRef.current) return;
    setIsRecording(false);
    const result = await voiceSessionRef.current.stop();
    voiceSessionRef.current = null;
    setAudioUrl(result.audioUrl);
    setVoiceTranscript(result.transcript || null);
    setInterimText("");
    // 文字起こし結果をタイトルに自動入力（タイトルが空の場合）
    if (!title.trim() && result.transcript) {
      setTitle(result.transcript.slice(0, 50));
    }
  };

  // #2 Location
  const handleLocation = async () => {
    if (!isGeolocationSupported() || locLoading) return;
    setLocLoading(true);
    try {
      const loc = await captureLocation();
      setLocation(loc);
      // 住環境カテゴリを自動選択
      if (!category) setCategory("living");
      // ラベルをタイトルに
      if (!title.trim() && loc.label) setTitle(loc.label);
    } catch {
      /* permission denied */
    } finally {
      setLocLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!category || !title.trim()) return;
    recordEvent({
      type: "entry_submit",
      category,
      durationMs: Date.now() - captureStartRef.current,
      timestamp: Date.now(),
    });
    onSubmit({
      category,
      title: title.trim(),
      thumbnail,
      audioUrl,
      voiceTranscript,
      location: location
        ? { latitude: location.latitude, longitude: location.longitude, label: location.label }
        : null,
    });
  };

  const categories = Object.keys(CATEGORY_META) as LifeProfileCategory[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-gray-200/40 bg-white/90 backdrop-blur-xl px-5 pt-5 pb-8 shadow-2xl max-h-[85vh] overflow-y-auto"
    >
      {/* Handle bar */}
      <div className="w-10 h-1 rounded-full bg-gray-300/50 mx-auto mb-4" />

      {/* Media capture row: Photo / Voice / Location */}
      <div className="flex gap-2 mb-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />

        {/* Photo */}
        {thumbnail ? (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 relative"
          >
            <img src={thumbnail} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => setThumbnail(null)}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/40 text-white text-[8px] flex items-center justify-center"
            >
              ✕
            </button>
          </motion.div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={compressing}
            className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-200/60 bg-gray-50/50 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all flex-shrink-0"
          >
            {compressing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full"
              />
            ) : (
              <>
                <span className="text-base">📷</span>
                <span className="text-[8px]">写真</span>
              </>
            )}
          </button>
        )}

        {/* Voice */}
        {isMediaRecorderSupported() && (
          <button
            onClick={isRecording ? handleVoiceStop : handleVoiceStart}
            className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all flex-shrink-0 ${
              isRecording
                ? "border-red-300 bg-red-50/80 text-red-500 animate-pulse"
                : audioUrl
                  ? "border-emerald-200 bg-emerald-50/50 text-emerald-500"
                  : "border-dashed border-gray-200/60 bg-gray-50/50 text-gray-400 hover:text-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="text-base">{isRecording ? "⏹" : audioUrl ? "✓" : "🎙"}</span>
            <span className="text-[8px]">{isRecording ? "停止" : audioUrl ? "録音済" : "音声"}</span>
          </button>
        )}

        {/* Location */}
        {isGeolocationSupported() && (
          <button
            onClick={handleLocation}
            disabled={locLoading}
            className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all flex-shrink-0 ${
              location
                ? "border-blue-200 bg-blue-50/50 text-blue-500"
                : "border-dashed border-gray-200/60 bg-gray-50/50 text-gray-400 hover:text-gray-600 hover:border-gray-300"
            }`}
          >
            {locLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full"
              />
            ) : (
              <>
                <span className="text-base">{location ? "📍" : "🌏"}</span>
                <span className="text-[8px]">{location ? "取得済" : "位置"}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Voice interim / transcript display */}
      {(isRecording || voiceTranscript) && (
        <div className="mb-3 rounded-xl bg-gray-50/60 border border-gray-100/50 px-3 py-2">
          {isRecording && interimText && (
            <p className="text-xs text-gray-500 animate-pulse">{interimText}</p>
          )}
          {isRecording && !interimText && (
            <p className="text-xs text-gray-400 animate-pulse">聞いています...</p>
          )}
          {!isRecording && voiceTranscript && (
            <p className="text-xs text-gray-600">🎙 {voiceTranscript}</p>
          )}
        </div>
      )}

      {/* Location label */}
      {location?.label && (
        <div className="mb-3 rounded-xl bg-blue-50/40 border border-blue-100/30 px-3 py-2">
          <p className="text-xs text-blue-600">📍 {location.label}</p>
        </div>
      )}

      {/* Title input */}
      <div className="mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="何を記録する？"
          autoFocus
          className="w-full rounded-xl border border-gray-200/50 bg-white/60 px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-200/50"
        />
        <p className="text-[10px] text-gray-400 mt-1 px-1">
          タイトルだけでOK。深掘りはあとから。
        </p>
      </div>

      {/* Category chips */}
      <p className="text-[10px] text-gray-500 font-medium mb-2">カテゴリ</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isSelected = category === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`
                rounded-full px-3 py-1.5 text-xs font-medium transition-all
                ${
                  isSelected
                    ? "bg-violet-400/80 text-white shadow-sm"
                    : "bg-white/60 border border-gray-200/50 text-gray-500 hover:bg-white/80"
                }
              `}
            >
              {meta.emoji} {meta.label}
            </button>
          );
        })}
      </div>

      {/* Submit */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!category || !title.trim()}
          className="flex-1 rounded-2xl bg-violet-400/80 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-20"
        >
          記録する
        </button>
        <button
          onClick={() => {
            voiceSessionRef.current?.cancel();
            onClose();
          }}
          className="rounded-2xl bg-gray-100/60 px-5 py-3 text-sm text-gray-400 transition-all hover:bg-gray-200/60"
        >
          閉じる
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Overall Depth Indicator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function OverallDepthRing({ depth }: { depth: number }) {
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - depth / 100);

  return (
    <div className="relative w-[80px] h-[80px] flex items-center justify-center">
      <svg width={80} height={80} className="absolute">
        <circle
          cx={40} cy={40} r={r}
          fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={4}
        />
        <motion.circle
          cx={40} cy={40} r={r}
          fill="none" stroke="url(#lifeDepthGrad)" strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          transform="rotate(-90 40 40)"
        />
        <defs>
          <linearGradient id="lifeDepthGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="text-center">
        <span className="text-lg font-bold text-gray-700">{depth}</span>
        <span className="text-[9px] text-gray-400 block -mt-0.5">%</span>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CategoryCard({
  category,
  depth,
  entries,
  onSelect,
}: {
  category: LifeProfileCategory;
  depth: CategoryDepth;
  entries: LifeProfileEntry[];
  onSelect: () => void;
}) {
  const meta = CATEGORY_META[category];
  const barWidth = Math.max(4, depth.completeness);
  // #5 ビジュアル: 最新のサムネイルを表示
  const latestThumb = entries.find((e) => e.thumbnail)?.thumbnail;

  return (
    <motion.button
      onClick={() => {
        recordEvent({ type: "category_view", category, timestamp: Date.now() });
        onSelect();
      }}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left rounded-2xl border border-gray-100/60 bg-white/50 backdrop-blur-sm px-4 py-3.5 transition-all hover:bg-white/70 hover:border-gray-200/60"
    >
      <div className="flex items-center gap-3">
        {latestThumb ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
            <img src={latestThumb} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <span className="text-xl w-10 text-center">{meta.emoji}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700">{meta.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
            {depth.entryCount > 0
              ? `${depth.entryCount}項目 · 深度${depth.completeness}%`
              : meta.description}
          </p>
        </div>
        <span className="text-gray-300 text-sm">›</span>
      </div>
      {depth.entryCount > 0 && (
        <div className="mt-2.5 h-1 rounded-full bg-gray-100/80 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-violet-400/70 to-cyan-400/70"
          />
        </div>
      )}
    </motion.button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Depth Question Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DepthQuestionCard({
  entry,
  question,
  onAnswer,
  onSkip,
}: {
  entry: LifeProfileEntry;
  question: string;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const startRef = useRef(Date.now());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-amber-100/50 bg-gradient-to-r from-amber-50/30 to-orange-50/20 backdrop-blur-sm px-4 py-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">🔍</span>
        <span className="text-[10px] tracking-[0.12em] text-amber-500/70 uppercase font-medium">
          深掘り — {entry.title}
        </span>
      </div>

      <p className="text-sm text-gray-700 font-medium mb-3 leading-relaxed">
        {question}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="思いつくまま..."
        rows={3}
        className="w-full rounded-xl border border-gray-200/40 bg-white/60 px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-200/50 resize-none"
      />

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            if (!text.trim()) return;
            recordEvent({
              type: "depth_answer",
              entryId: entry.id,
              durationMs: Date.now() - startRef.current,
              timestamp: Date.now(),
            });
            onAnswer(text.trim());
          }}
          disabled={!text.trim()}
          className="flex-1 rounded-xl bg-amber-400/80 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-500 disabled:opacity-30"
        >
          記録する
        </button>
        <button
          onClick={() => {
            recordEvent({
              type: "depth_skip",
              entryId: entry.id,
              timestamp: Date.now(),
            });
            onSkip();
          }}
          className="rounded-xl bg-white/60 border border-gray-200/40 px-4 py-2 text-sm text-gray-400 transition-all hover:bg-white/80"
        >
          あとで
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #5 Entry Detail Card (with visual memory)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function EntryDetailCard({
  entry,
  onDelete,
  onDepthAnswer,
}: {
  entry: LifeProfileEntry;
  onDelete: () => void;
  onDepthAnswer: (question: string, answer: string) => void;
}) {
  const [showDepth, setShowDepth] = useState(false);
  const nextQ = getNextDepthQuestion(entry);
  const meta = CATEGORY_META[entry.category];
  const answeredCount = entry.depthResponses.length;
  const totalQ = meta.depthQuestions.length;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="rounded-2xl border border-gray-100/60 bg-white/50 backdrop-blur-sm overflow-hidden"
    >
      {/* #5 Photo header */}
      {entry.thumbnail && (
        <div className="w-full h-32 overflow-hidden">
          <img
            src={entry.thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">{entry.title}</p>
            {entry.note && (
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                {entry.note}
              </p>
            )}
            {/* Voice transcript */}
            {entry.voiceTranscript && (
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                🎙 {entry.voiceTranscript}
              </p>
            )}
            {/* Location */}
            {entry.location?.label && (
              <p className="text-[10px] text-blue-500/70 mt-0.5">
                📍 {entry.location.label}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {entry.since && (
                <span className="text-[10px] text-gray-400">
                  {entry.since}〜
                </span>
              )}
              <span className="text-[10px] text-gray-400">
                影響度 {"★".repeat(entry.impact)}
                {"☆".repeat(5 - entry.impact)}
              </span>
            </div>
          </div>
          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-gray-500 transition-all text-xs px-1 ml-2"
          >
            ✕
          </button>
        </div>

        {/* Depth responses */}
        {entry.depthResponses.length > 0 && (
          <div className="mt-3 space-y-2">
            {entry.depthResponses.map((r, i) => (
              <div
                key={i}
                className="rounded-xl bg-amber-50/30 border border-amber-100/30 px-3 py-2"
              >
                <p className="text-[10px] text-amber-500/70 font-medium mb-0.5">
                  {r.question}
                </p>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  {r.answer}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Depth progress */}
        {nextQ && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-400">
                深掘り {answeredCount}/{totalQ}
              </span>
              <button
                onClick={() => setShowDepth(!showDepth)}
                className="text-[10px] text-violet-500/80 font-medium hover:text-violet-600 transition-colors"
              >
                {showDepth ? "閉じる" : "もっと深く →"}
              </button>
            </div>

            <AnimatePresence>
              {showDepth && (
                <DepthQuestionCard
                  entry={entry}
                  question={nextQ}
                  onAnswer={(answer) => {
                    onDepthAnswer(nextQ, answer);
                    setShowDepth(false);
                  }}
                  onSkip={() => setShowDepth(false)}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {!nextQ && answeredCount > 0 && (
          <p className="mt-2 text-[10px] text-emerald-500/70 font-medium">
            ✦ 深掘り完了
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category Detail View
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CategoryDetailView({
  category,
  store,
  onDelete,
  onDepthAnswer,
  onBack,
  onOpenCapture,
}: {
  category: LifeProfileCategory;
  store: LifeProfileStore;
  onDelete: (id: string) => void;
  onDepthAnswer: (entryId: string, question: string, answer: string) => void;
  onBack: () => void;
  onOpenCapture: () => void;
}) {
  const meta = CATEGORY_META[category];
  const entries = getEntriesByCategory(store, category);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-full bg-white/60 border border-gray-200/40 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all"
        >
          ‹
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.emoji}</span>
            <p className="text-sm font-bold text-gray-800">{meta.label}</p>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{meta.description}</p>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <EntryDetailCard
              key={entry.id}
              entry={entry}
              onDelete={() => onDelete(entry.id)}
              onDepthAnswer={(q, a) => onDepthAnswer(entry.id, q, a)}
            />
          ))}
        </AnimatePresence>
      </div>

      <motion.button
        onClick={onOpenCapture}
        whileTap={{ scale: 0.98 }}
        className="w-full rounded-2xl border-2 border-dashed border-gray-200/60 bg-white/30 py-4 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300/60 transition-all"
      >
        + 追加する
      </motion.button>

      {entries.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">{meta.emoji}</p>
          <p className="text-sm text-gray-400">{meta.description}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            「+ 追加する」から始めましょう
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rendezvous Transparency Panel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function RendezvousTransparencyPanel({
  store,
  onConsent,
}: {
  store: LifeProfileStore;
  onConsent: () => void;
}) {
  const signals = generateRendezvousSignals(store);
  const summary = summarizeSignals(signals);
  const hasConsent = !!store.rendezvousConsentAt;

  if (store.entries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-cyan-100/50 bg-gradient-to-b from-cyan-50/20 to-indigo-50/10 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🪐</span>
        <span className="text-[10px] tracking-[0.15em] text-cyan-500/70 uppercase font-medium">
          分身が知っていること
        </span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-3">
        ここに記録した情報は、あなたの分身が旅に出るときの判断材料になります。
      </p>

      {summary.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {summary.map((line, i) => (
            <p key={i} className="text-[11px] text-gray-600 leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 mb-3">
          まだ情報が少ないため、分身はまだ旅に出られません。
        </p>
      )}

      {!hasConsent && summary.length > 0 && (
        <button
          onClick={onConsent}
          className="w-full rounded-xl bg-cyan-400/80 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-all"
        >
          分身の旅を許可する
        </button>
      )}

      {hasConsent && (
        <p className="text-[10px] text-emerald-500/70 font-medium">
          ✦ 分身が旅に出ています
        </p>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function LifeProfileSection() {
  const { showError } = useSaveToast();
  const [store, setStore] = useState<LifeProfileStore | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<LifeProfileCategory | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [dailyInsight, setDailyInsight] = useState<DailyInsight | null>(null);
  const [insightDismissed, setInsightDismissed] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isForcedInput, setIsForcedInput] = useState(false);

  // #3 受動観測: セッション追跡
  useEffect(() => {
    startSession();
    return () => endSession();
  }, []);

  // 初期化 + Supabase同期
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    const loaded = loadLifeProfileStore();
    setStore(loaded);

    // 初回 → オンボーディング
    if (loaded.entries.length === 0) {
      setIsOnboarding(true);
    } else if (!isProfileForcedInputDone()) {
      // タブツアー後: Rendezvous必須カテゴリが未入力なら強制入力
      const hasFamily = loaded.entries.some((e) => e.category === "family");
      const hasPets = loaded.entries.some((e) => e.category === "pets");
      const hasLiving = loaded.entries.some((e) => e.category === "living");
      if (!hasFamily || !hasPets || !hasLiving) {
        setIsForcedInput(true);
      } else {
        // 既に全部ある場合はマーク
        safeLSSet(FORCED_DONE_KEY, "1");
      }
    }

    // #2 AIが先に語る: まずルールベースで即表示
    if (loaded.entries.length > 0) {
      const localInsight = generateDailyInsight(loaded);
      setDailyInsight(localInsight);

      // #7 LLM連携: バックグラウンドでAPI叩き、成功したら差し替え
      fetch("/api/origin/life-profile/insight", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.insight) setDailyInsight(data.insight);
        })
        .catch(() => {});
    }

    /* eslint-enable react-hooks/set-state-in-effect */
    // #3 Supabase同期（バックグラウンド、非ブロッキング）
    if (loaded.entries.length > 0) {
      syncToSupabase(loaded).catch(() => {
        showError("プロフィール同期に失敗しました");
      });
    }
  }, []);

  const persist = useCallback((updated: LifeProfileStore) => {
    setStore(updated);
    saveLifeProfileStore(updated);
    // インサイト再生成
    const newInsight = generateDailyInsight(updated);
    setDailyInsight(newInsight);
  }, []);

  // ── エントリ操作 ──
  const handleAddEntry = useCallback(
    (data: {
      category: LifeProfileCategory;
      title: string;
      thumbnail: string | null;
      audioUrl?: string | null;
      voiceTranscript?: string | null;
      location?: { latitude: number; longitude: number; label: string | null } | null;
    }) => {
      if (!store) return;
      const now = new Date().toISOString();
      const entry: LifeProfileEntry = {
        id: newEntryId(),
        category: data.category,
        title: data.title,
        note: null,
        thumbnail: data.thumbnail,
        audioUrl: data.audioUrl ?? null,
        voiceTranscript: data.voiceTranscript ?? null,
        location: data.location ?? null,
        depthResponses: [],
        active: true,
        since: null,
        until: null,
        impact: 3,
        createdAt: now,
        updatedAt: now,
      };
      const updated = addEntry(store, entry);
      persist(updated);
      upsertEntryToSupabase(entry).catch(() => {
        showError("エントリ保存に失敗しました");
      });
    },
    [store, persist, showError],
  );

  const handleDeleteEntry = useCallback(
    (id: string) => {
      if (!store) return;
      persist(removeEntry(store, id));
      deleteEntryFromSupabase(id).catch(() => {
        showError("エントリ削除に失敗しました");
      });
    },
    [store, persist, showError],
  );

  const handleDepthAnswer = useCallback(
    (entryId: string, question: string, answer: string) => {
      if (!store) return;
      const response: DepthResponse = {
        question,
        answer,
        answeredAt: new Date().toISOString(),
      };
      const updated = addDepthResponse(store, entryId, response);
      persist(updated);
      const entry = updated.entries.find((e) => e.id === entryId);
      if (entry) upsertEntryToSupabase(entry).catch(() => {
        showError("回答の保存に失敗しました");
      });
    },
    [store, persist, showError],
  );

  const handleRendezvousConsent = useCallback(() => {
    if (!store) return;
    persist(setRendezvousConsent(store));
    syncConsentToSupabase().catch(() => {
      showError("同意の保存に失敗しました");
    });
  }, [store, persist, showError]);

  // #4 Onboarding complete
  const handleOnboardingComplete = useCallback(
    (entries: { category: LifeProfileCategory; title: string }[]) => {
      if (!store) return;
      let updated = store;
      for (const e of entries) {
        const now = new Date().toISOString();
        updated = addEntry(updated, {
          id: newEntryId(),
          category: e.category,
          title: e.title,
          note: null,
          thumbnail: null,
          audioUrl: null,
          voiceTranscript: null,
          location: null,
          depthResponses: [],
          active: true,
          since: null,
          until: null,
          impact: 3,
          createdAt: now,
          updatedAt: now,
        });
      }
      persist(updated);
      setIsOnboarding(false);
    },
    [store, persist],
  );

  // #4b Forced input complete
  const handleForcedInputComplete = useCallback(
    (entries: { category: LifeProfileCategory; title: string }[]) => {
      if (!store) return;
      let updated = store;
      for (const e of entries) {
        const now = new Date().toISOString();
        updated = addEntry(updated, {
          id: newEntryId(),
          category: e.category,
          title: e.title,
          note: null,
          thumbnail: null,
          audioUrl: null,
          voiceTranscript: null,
          location: null,
          depthResponses: [],
          active: true,
          since: null,
          until: null,
          impact: 3,
          createdAt: now,
          updatedAt: now,
        });
      }
      persist(updated);
      setIsForcedInput(false);
    },
    [store, persist],
  );

  // ── Loading ──
  if (!store) return null;

  // ── #4 Onboarding ──
  if (isOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  // ── #4b Forced Profile Input ──
  if (isForcedInput) {
    return <ProfileForcedInputOverlay onComplete={handleForcedInputComplete} />;
  }

  const depths = getCategoryDepths(store);
  const overallDepth = getOverallDepth(store);
  const categories = Object.keys(CATEGORY_META) as LifeProfileCategory[];

  return (
    <div className="h-full overflow-y-auto relative">
      <div className="max-w-lg mx-auto px-4 pb-24 space-y-4 pt-4">
        <AnimatePresence mode="wait">
          {selectedCategory ? (
            <CategoryDetailView
              key={selectedCategory}
              category={selectedCategory}
              store={store}
              onDelete={handleDeleteEntry}
              onDepthAnswer={handleDepthAnswer}
              onBack={() => setSelectedCategory(null)}
              onOpenCapture={() => setShowCapture(true)}
            />
          ) : (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between">
                <div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] tracking-[0.2em] text-gray-400 uppercase font-medium"
                  >
                    人生のプロフィール
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-lg font-bold text-gray-800 mt-0.5"
                  >
                    あなたを形作るもの
                  </motion.p>
                </div>

                {store.entries.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <OverallDepthRing depth={overallDepth} />
                  </motion.div>
                )}
              </div>

              {/* ── #2 Daily Insight ── */}
              <AnimatePresence>
                {dailyInsight && !insightDismissed && (
                  <DailyInsightCard
                    insight={dailyInsight}
                    onDismiss={() => setInsightDismissed(true)}
                  />
                )}
              </AnimatePresence>

              {/* ── Category Grid ── */}
              <div className="space-y-2">
                {categories.map((cat) => {
                  const depth = depths.find((d) => d.category === cat)!;
                  const entries = getEntriesByCategory(store, cat);
                  return (
                    <CategoryCard
                      key={cat}
                      category={cat}
                      depth={depth}
                      entries={entries}
                      onSelect={() => setSelectedCategory(cat)}
                    />
                  );
                })}
              </div>

              {/* ── Rendezvous Transparency ── */}
              <RendezvousTransparencyPanel
                store={store}
                onConsent={handleRendezvousConsent}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── #1 Floating Capture Button ── */}
      {!showCapture && (
        <motion.button
          onClick={() => setShowCapture(true)}
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/30 flex items-center justify-center text-2xl"
        >
          +
        </motion.button>
      )}

      {/* ── #1 Quick Capture Sheet ── */}
      <AnimatePresence>
        {showCapture && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCapture(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            />
            <QuickCaptureSheet
              onSubmit={(data) => {
                handleAddEntry(data);
                setShowCapture(false);
              }}
              onClose={() => setShowCapture(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
