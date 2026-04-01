"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { safeLSSet } from "@/lib/safeLocalStorage";
import { markTourSeen } from "@/lib/tour/tourState";
import {
  loadLifeProfileStore,
  saveLifeProfileStore,
  addEntry,
  newEntryId,
} from "@/lib/origin/lifeProfile/store";
import type { LifeProfileEntry } from "@/lib/origin/lifeProfile/types";

/* ═══════════════════════════════════════════════════════════════════
   InitialOnboardingOverlay（旧 ValuesOnboardingOverlay）
   ─────────────────────────────────────────────────────────────────
   HomeTour 完了直後に表示。
   Rendezvous マッチングに必要な最重要データを選択式で素早く取得。

   5ステップ:
     1. 価値観・信念 (values)      → originFit 直結
     2. 情熱・好きなこと (passions) → originFit 直結
     3. 仕事・キャリア (career)     → パイプライン抽出
     4. ライフスタイル + 都道府県   → profileBoost
     5. 恋愛・パートナー (romantic)  → dealbreaker判定

   結果保存先:
     - values / passions / career → Life Profile store (localStorage)
     - lifestyle / prefecture / romantic → localStorage + API sync
   ═══════════════════════════════════════════════════════════════════ */

const DONE_KEY = "aneurasync_values_onboarding_done_v1";
const DEALBREAKER_KEY = "aneurasync_dealbreaker_profile_v1";

// ── Step 1: 価値観 ──
const VALUES_OPTIONS = [
  "誠実さ",
  "自由",
  "家族",
  "挑戦",
  "安定",
  "成長",
  "創造性",
  "思いやり",
  "独立",
  "正義",
  "信頼",
  "楽しさ",
  "感謝",
  "尊重",
  "努力",
  "好奇心",
  "責任感",
  "調和",
  "情熱",
  "優しさ",
  "勇気",
  "忍耐",
  "つながり",
  "美意識",
  "健康",
  "学び",
  "平和",
  "多様性",
  "自己表現",
  "貢献",
  "ユーモア",
  "素直さ",
];

// ── Step 2: 情熱・好きなこと ──
const PASSIONS_OPTIONS = [
  "音楽",
  "映画・ドラマ",
  "読書",
  "旅行",
  "料理",
  "ゲーム",
  "スポーツ",
  "アート・デザイン",
  "写真・カメラ",
  "ファッション",
  "テクノロジー",
  "アウトドア・キャンプ",
  "カフェ巡り",
  "ヨガ・フィットネス",
  "ペット・動物",
  "アニメ・漫画",
  "ダンス",
  "DIY・ものづくり",
  "ガーデニング",
  "サウナ・温泉",
  "お酒・ワイン",
  "ボードゲーム",
  "ドライブ",
  "釣り",
  "登山・ハイキング",
  "ランニング・マラソン",
  "筋トレ",
  "美容・スキンケア",
  "推し活・アイドル",
  "語学・留学",
  "投資・資産運用",
  "ボランティア",
  "インテリア",
  "食べ歩き・グルメ",
  "サーフィン・マリンスポーツ",
  "スノーボード・スキー",
  "瞑想・マインドフルネス",
  "ポッドキャスト",
  "プログラミング",
  "歴史・文化",
];

// ── Step 3: 仕事 ──
const CAREER_OPTIONS = [
  "会社員（事務・管理）",
  "会社員（技術・専門）",
  "公務員",
  "自営業・フリーランス",
  "経営者・役員",
  "エンジニア・IT",
  "クリエイター・デザイナー",
  "医療・看護",
  "福祉・介護",
  "教育・講師",
  "接客・サービス",
  "営業",
  "マーケティング・広報",
  "コンサルタント",
  "金融・保険",
  "不動産",
  "法律・士業",
  "建築・土木",
  "製造・メーカー",
  "物流・運輸",
  "飲食",
  "美容・ファッション",
  "メディア・出版",
  "エンタメ・芸能",
  "農業・漁業",
  "研究・アカデミア",
  "NPO・NGO",
  "学生（大学・大学院）",
  "学生（高校・専門）",
  "主婦・主夫",
  "求職中・休職中",
];

// ── Step 4: ライフスタイル ──
const LIFESTYLE_CHOICES = {
  morningNight: {
    label: "生活リズム",
    options: [
      { label: "朝型", value: 20 },
      { label: "どちらでもない", value: 50 },
      { label: "夜型", value: 80 },
    ],
  },
  indoorOutdoor: {
    label: "休日の過ごし方",
    options: [
      { label: "インドア派", value: 20 },
      { label: "どちらも", value: 50 },
      { label: "アウトドア派", value: 80 },
    ],
  },
  soloSocial: {
    label: "人との関わり",
    options: [
      { label: "ひとり好き", value: 20 },
      { label: "バランス", value: 50 },
      { label: "みんな好き", value: 80 },
    ],
  },
};

const PREFECTURES = [
  "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島",
  "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野",
  "岐阜", "静岡", "愛知", "三重",
  "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山",
  "鳥取", "島根", "岡山", "広島", "山口",
  "徳島", "香川", "愛媛", "高知",
  "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄",
  "海外",
];

// ── Step 5: 恋愛 ──
const MARRIAGE_OPTIONS = [
  "すぐにでも",
  "2-3年以内",
  "いい人がいれば",
  "考えていない",
];

const CHILDREN_OPTIONS = [
  "欲しい",
  "いらない",
  "相手に合わせる",
  "未定",
];

// ═══ Step definitions ═══

type StepDef = {
  key: string;
  icon: string;
  title: string;
  sub: string;
  type: "multi-select" | "lifestyle" | "single-select-pair";
  required?: boolean;
  maxSelect?: number;
};

const STEPS: StepDef[] = [
  {
    key: "values",
    icon: "🌟",
    title: "人生で大切にしていることは？",
    sub: "あなたの芯にあるもの。1〜5つ選んでね。選んだ順が優先順位になるよ。",
    type: "multi-select",
    required: true,
    maxSelect: 5,
  },
  {
    key: "passions",
    icon: "🔥",
    title: "時間を忘れて夢中になれるものは？",
    sub: "好きなこと、ハマっていること。いくつでもOK。",
    type: "multi-select",
  },
  {
    key: "career",
    icon: "💼",
    title: "今やっていることは？",
    sub: "仕事や活動を教えて。",
    type: "multi-select",
  },
  {
    key: "lifestyle",
    icon: "🌏",
    title: "あなたのライフスタイルは？",
    sub: "生活リズムや好みを選ぶだけ。",
    type: "lifestyle",
    required: true,
  },
  {
    key: "romantic",
    icon: "💫",
    title: "恋愛・パートナーについて",
    sub: "今のあなたの気持ちに近いものを。",
    type: "single-select-pair",
    required: true,
  },
];

// ═══ Types ═══

type OnboardingData = {
  values: string[];
  valuesCustom: string;
  passions: string[];
  passionsCustom: string;
  career: string[];
  careerCustom: string;
  lifestyleMorningNight: number | null;
  lifestyleIndoorOutdoor: number | null;
  lifestyleSoloSocial: number | null;
  prefecture: string | null;
  marriageIntent: string | null;
  childrenPreference: string | null;
};

const INITIAL_DATA: OnboardingData = {
  values: [],
  valuesCustom: "",
  passions: [],
  passionsCustom: "",
  career: [],
  careerCustom: "",
  lifestyleMorningNight: null,
  lifestyleIndoorOutdoor: null,
  lifestyleSoloSocial: null,
  prefecture: null,
  marriageIntent: null,
  childrenPreference: null,
};

interface Props {
  active: boolean;
  onComplete: () => void;
}

export default function ValuesOnboardingOverlay({ active, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({ ...INITIAL_DATA });
  const [shake, setShake] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // ── Toggle chip selection (respects maxSelect) ──
  const toggleChip = useCallback(
    (key: "values" | "passions" | "career", value: string) => {
      const stepDef = STEPS.find((s) => s.key === key);
      const max = stepDef?.maxSelect;
      setData((prev) => {
        const arr = prev[key];
        if (arr.includes(value)) {
          // Deselect
          return { ...prev, [key]: arr.filter((v) => v !== value) };
        }
        // Check max limit
        if (max && arr.length >= max) return prev;
        // Add to end (order = priority)
        return { ...prev, [key]: [...arr, value] };
      });
    },
    [],
  );

  // ── Can proceed? ──
  const canProceed = useCallback(() => {
    const s = STEPS[step];
    if (s.key === "values") return data.values.length > 0 || data.valuesCustom.trim().length > 0;
    if (s.key === "lifestyle") {
      // 3軸 + 都道府県すべて選択必須
      return data.lifestyleMorningNight != null
        && data.lifestyleIndoorOutdoor != null
        && data.lifestyleSoloSocial != null
        && data.prefecture != null;
    }
    if (s.key === "romantic") {
      // 結婚観・子ども観の両方必須
      return data.marriageIntent != null && data.childrenPreference != null;
    }
    return true;
  }, [step, data]);

  // ── Save all ──
  const saveAll = useCallback(async () => {
    // 1. Life Profile store (values, passions, career)
    let store = loadLifeProfileStore();
    const now = new Date().toISOString();

    const makeEntry = (category: "values" | "passions" | "career", title: string): LifeProfileEntry => ({
      id: newEntryId(),
      category,
      title,
      note: null,
      thumbnail: null,
      audioUrl: null,
      voiceTranscript: null,
      location: null,
      depthResponses: [],
      impact: 3,
      since: null,
      until: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    // Values
    for (const v of data.values) {
      store = addEntry(store, makeEntry("values", v));
    }
    if (data.valuesCustom.trim()) {
      store = addEntry(store, makeEntry("values", data.valuesCustom.trim()));
    }

    // Passions
    for (const p of data.passions) {
      store = addEntry(store, makeEntry("passions", p));
    }
    if (data.passionsCustom.trim()) {
      store = addEntry(store, makeEntry("passions", data.passionsCustom.trim()));
    }

    // Career
    for (const c of data.career) {
      store = addEntry(store, makeEntry("career", c));
    }
    if (data.careerCustom.trim()) {
      store = addEntry(store, makeEntry("career", data.careerCustom.trim()));
    }

    saveLifeProfileStore(store);

    // 2. DealbreakerProfile (lifestyle, prefecture, romantic)
    const dealbreaker: Record<string, unknown> = {};
    if (data.lifestyleMorningNight != null) dealbreaker.lifestyleMorningNight = data.lifestyleMorningNight;
    if (data.lifestyleIndoorOutdoor != null) dealbreaker.lifestyleIndoorOutdoor = data.lifestyleIndoorOutdoor;
    if (data.lifestyleSoloSocial != null) dealbreaker.lifestyleSoloSocial = data.lifestyleSoloSocial;
    if (data.prefecture) dealbreaker.prefecture = data.prefecture;
    if (data.marriageIntent) dealbreaker.marriageIntent = data.marriageIntent;
    if (data.childrenPreference) dealbreaker.childrenPreference = data.childrenPreference;

    safeLSSet(DEALBREAKER_KEY, JSON.stringify(dealbreaker));

    // API sync (fire-and-forget)
    fetch("/api/rendezvous/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_details: dealbreaker }),
    }).catch(() => {});

    safeLSSet(DONE_KEY, "1");
    await markTourSeen("home_values");
    onComplete();
  }, [data, onComplete]);

  // ── Validation message ──
  const validationMsg = (() => {
    const s = STEPS[step];
    if (!s.required || canProceed()) return null;
    if (s.key === "values") return "1つ以上選択してください";
    if (s.key === "lifestyle") return "すべての項目とエリアを選択してください";
    if (s.key === "romantic") return "両方の項目を選択してください";
    return "1つ選択してください";
  })();

  // ── Next handler ──
  const handleNext = useCallback(async () => {
    if (!canProceed()) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (isLast) {
      saveAll();
      return;
    }
    setStep((s) => s + 1);
    setShowCustom(false);
  }, [canProceed, isLast, saveAll]);

  if (!active) return null;

  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          style={{ position: "relative", width: 380, maxWidth: "100%" }}
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(24px) saturate(1.4)",
              WebkitBackdropFilter: "blur(24px) saturate(1.4)",
              borderRadius: 24,
              padding: "28px 24px 24px",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
              border: "1px solid rgba(255,255,255,0.6)",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            {/* Step indicator */}
            <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
              {STEPS.map((_, i) => (
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
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {currentStep.icon}
            </div>
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
              {currentStep.title}
            </motion.h2>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 18px" }}>
              {currentStep.sub}
            </p>

            {/* ── Step content ── */}
            {currentStep.type === "multi-select" && (
              <MultiSelectStep
                stepKey={currentStep.key as "values" | "passions" | "career"}
                options={
                  currentStep.key === "values"
                    ? VALUES_OPTIONS
                    : currentStep.key === "passions"
                      ? PASSIONS_OPTIONS
                      : CAREER_OPTIONS
                }
                selected={data[currentStep.key as "values" | "passions" | "career"]}
                onToggle={(v) => toggleChip(currentStep.key as "values" | "passions" | "career", v)}
                customValue={data[`${currentStep.key as "values" | "passions" | "career"}Custom` as keyof OnboardingData] as string}
                onCustomChange={(v) =>
                  setData((prev) => ({ ...prev, [`${currentStep.key}Custom`]: v }))
                }
                showCustom={showCustom}
                onShowCustom={() => setShowCustom(true)}
                maxSelect={currentStep.maxSelect}
              />
            )}

            {currentStep.type === "lifestyle" && (
              <LifestyleStep
                data={data}
                onChange={(updates) => setData((prev) => ({ ...prev, ...updates }))}
              />
            )}

            {currentStep.type === "single-select-pair" && (
              <RomanticStep
                data={data}
                onChange={(updates) => setData((prev) => ({ ...prev, ...updates }))}
              />
            )}

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
                    onClick={() => { setStep((s) => s - 1); setShowCustom(false); }}
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
                  background:
                    currentStep.required && !canProceed()
                      ? "#cbd5e1"
                      : "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor:
                    currentStep.required && !canProceed()
                      ? "not-allowed"
                      : "pointer",
                  boxShadow:
                    currentStep.required && !canProceed()
                      ? "none"
                      : "0 4px 15px rgba(139,92,246,0.3)",
                  transition: "all 0.2s",
                }}
              >
                {isLast ? "始めよう" : "次へ"}
              </button>
            </div>

            {/* Validation error */}
            {validationMsg && (
              <p
                style={{
                  fontSize: 12,
                  color: "#ef4444",
                  textAlign: "center",
                  marginTop: 10,
                  fontWeight: 600,
                }}
              >
                {validationMsg}
              </p>
            )}

            {/* Helper text */}
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
                あなたの回答は、分身が相性の良い人を見つけるための大切な手がかりになります
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function MultiSelectStep({
  stepKey,
  options,
  selected,
  onToggle,
  customValue,
  onCustomChange,
  showCustom,
  onShowCustom,
  maxSelect,
}: {
  stepKey: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  customValue: string;
  onCustomChange: (v: string) => void;
  showCustom: boolean;
  onShowCustom: () => void;
  maxSelect?: number;
}) {
  const atLimit = maxSelect ? selected.length >= maxSelect : false;
  return (
    <div>
      {maxSelect && (
        <p style={{ fontSize: 11, color: atLimit ? "#8b5cf6" : "#94a3b8", marginBottom: 8, fontWeight: 600 }}>
          {selected.length} / {maxSelect} 選択中{atLimit ? "（上限）" : ""}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          const priority = isSelected ? selected.indexOf(opt) + 1 : 0;
          const isDisabled = !isSelected && atLimit;
          return (
            <motion.button
              key={`${stepKey}-${opt}`}
              type="button"
              onClick={() => !isDisabled && onToggle(opt)}
              whileTap={isDisabled ? {} : { scale: 0.95 }}
              style={{
                position: "relative",
                padding: maxSelect && isSelected ? "8px 16px 8px 28px" : "8px 16px",
                borderRadius: 20,
                border: isSelected
                  ? "2px solid #8b5cf6"
                  : isDisabled
                    ? "2px solid #f1f5f9"
                    : "2px solid #e2e8f0",
                background: isSelected
                  ? "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(6,182,212,0.06))"
                  : isDisabled
                    ? "#f8fafc"
                    : "#f8fafc",
                color: isSelected ? "#6d28d9" : isDisabled ? "#cbd5e1" : "#475569",
                fontSize: 13,
                fontWeight: isSelected ? 700 : 500,
                cursor: isDisabled ? "default" : "pointer",
                transition: "all 0.15s",
                opacity: isDisabled ? 0.5 : 1,
              }}
            >
              {maxSelect && isSelected && (
                <span style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#8b5cf6",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {priority}
                </span>
              )}
              {opt}
            </motion.button>
          );
        })}

        {/* "その他" button */}
        {!showCustom && (
          <motion.button
            type="button"
            onClick={onShowCustom}
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

      {/* Custom input */}
      {showCustom && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{ marginTop: 10 }}
        >
          <input
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
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
            onFocus={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#8b5cf6";
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#e2e8f0";
            }}
          />
        </motion.div>
      )}
    </div>
  );
}

function LifestyleStep({
  data,
  onChange,
}: {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 3-axis lifestyle */}
      {Object.entries(LIFESTYLE_CHOICES).map(([key, config]) => {
        const dataKey = key === "morningNight"
          ? "lifestyleMorningNight"
          : key === "indoorOutdoor"
            ? "lifestyleIndoorOutdoor"
            : "lifestyleSoloSocial";
        const current = data[dataKey as keyof OnboardingData] as number | null;

        return (
          <div key={key}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
              {config.label}
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              {config.options.map((opt) => {
                const isSelected = current === opt.value;
                return (
                  <motion.button
                    key={opt.label}
                    type="button"
                    onClick={() => onChange({ [dataKey]: opt.value })}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      flex: 1,
                      padding: "10px 6px",
                      borderRadius: 12,
                      border: isSelected
                        ? "2px solid #8b5cf6"
                        : "2px solid #e2e8f0",
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(6,182,212,0.06))"
                        : "#f8fafc",
                      color: isSelected ? "#6d28d9" : "#475569",
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Prefecture */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
          住んでいるエリア
        </p>
        <select
          value={data.prefecture ?? ""}
          onChange={(e) => onChange({ prefecture: e.target.value || null })}
          style={{
            width: "100%",
            padding: "10px 14px",
            fontSize: 14,
            border: "2px solid #e2e8f0",
            borderRadius: 12,
            outline: "none",
            background: "#f8fafc",
            color: data.prefecture ? "#0f172a" : "#94a3b8",
            appearance: "none",
            WebkitAppearance: "none",
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 14px center",
          }}
        >
          <option value="">選択してください</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function RomanticStep({
  data,
  onChange,
}: {
  data: OnboardingData;
  onChange: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Marriage intent */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
          結婚について
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MARRIAGE_OPTIONS.map((opt) => {
            const isSelected = data.marriageIntent === opt;
            return (
              <motion.button
                key={opt}
                type="button"
                onClick={() => onChange({ marriageIntent: isSelected ? null : opt })}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "9px 16px",
                  borderRadius: 12,
                  border: isSelected
                    ? "2px solid #8b5cf6"
                    : "2px solid #e2e8f0",
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
        </div>
      </div>

      {/* Children preference */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
          子どもについて
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CHILDREN_OPTIONS.map((opt) => {
            const isSelected = data.childrenPreference === opt;
            return (
              <motion.button
                key={opt}
                type="button"
                onClick={() =>
                  onChange({ childrenPreference: isSelected ? null : opt })
                }
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "9px 16px",
                  borderRadius: 12,
                  border: isSelected
                    ? "2px solid #8b5cf6"
                    : "2px solid #e2e8f0",
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
        </div>
      </div>
    </div>
  );
}

/** 初期オンボーディング完了済みか (legacy — AneurasyncHome は isTourSeen を使用) */
export function isValuesOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DONE_KEY) === "1";
}

/** ローカルに保存された DealbreakerProfile を取得 */
export function getLocalDealbreakerProfile(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DEALBREAKER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
