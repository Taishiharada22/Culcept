"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

/**
 * ④-A: ベースライン収集 UI
 *
 * 4 ステップ:
 * 1. 生年月日（ライフステージ導出用）
 * 2. 性別（4択 + prefer_not_to_say）
 * 3. 居住地（都道府県 + 市区町村）
 * 4. 確認
 *
 * 設計原則:
 * - 全項目「答えない」を選択可能
 * - 収集理由を各ステップで説明（透明性）
 * - Aneurasync ライトテーマ — Home と統一された白系 glassmorphism
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GENDER_OPTIONS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "non_binary", label: "その他" },
  { value: "prefer_not_to_say", label: "答えない" },
] as const;

const REGION_GROUPS: { label: string; prefectures: string[] }[] = [
  { label: "北海道・東北", prefectures: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { label: "関東", prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { label: "中部", prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { label: "近畿", prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { label: "中国・四国", prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"] },
  { label: "九州・沖縄", prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
];

type Step = "dob" | "gender" | "location" | "confirm";
const STEPS: Step[] = ["dob", "gender", "location", "confirm"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  userName: string | null;
}

export default function BaselineCollectionClient({ userName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("dob");
  const [saving, setSaving] = useState(false);

  // Form state
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthDay, setBirthDay] = useState<number | null>(null);
  const [skipDob, setSkipDob] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [prefecture, setPrefecture] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [skipLocation, setSkipLocation] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 13; y >= currentYear - 100; y--) years.push(y);
    return years;
  }, [currentYear]);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  const dobValid = skipDob || (birthYear !== null && birthMonth !== null && birthDay !== null);
  const genderValid = gender !== null;
  const locationValid = skipLocation || prefecture !== null;

  const stepIndex = STEPS.indexOf(step);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (!skipDob && birthYear && birthMonth && birthDay) {
        const m = String(birthMonth).padStart(2, "0");
        const d = String(birthDay).padStart(2, "0");
        payload.dateOfBirth = `${birthYear}-${m}-${d}`;
      }
      if (gender && gender !== "skip") payload.gender = gender;
      if (!skipLocation && prefecture) {
        payload.prefecture = prefecture;
        if (city.trim()) payload.city = city.trim();
      }

      const res = await fetch("/api/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "must_be_13_or_older") {
          alert("13歳以上である必要があります");
          setSaving(false);
          return;
        }
        console.error("[baseline] submit error:", data);
        setSaving(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("[baseline] submit error:", err);
      setSaving(false);
    }
  }, [skipDob, birthYear, birthMonth, birthDay, gender, skipLocation, prefecture, city, router]);

  const goNext = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  }, [step]);

  const goBack = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  }, [step]);

  const greeting = userName ? `${userName}さん、` : "";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-6">
      {/* ── Aneurasync ライト背景 ── */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50" />

      {/* グラデーション オーブ */}
      <motion.div
        className="fixed -right-32 -top-32 h-[400px] w-[400px] rounded-full opacity-60"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(168,85,247,0.08) 50%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="fixed -left-20 top-1/3 h-[350px] w-[350px] rounded-full opacity-50"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(59,130,246,0.06) 50%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, 15, 0], y: [0, 20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="fixed bottom-20 right-1/4 h-[300px] w-[300px] rounded-full opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(251,191,36,0.1) 0%, rgba(249,115,22,0.06) 50%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, -10, 0], y: [0, -15, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── ステップインジケーター ── */}
      <div className="relative z-10 mb-8 flex gap-2">
        {STEPS.map((s, i) => (
          <motion.div
            key={s}
            className="h-1.5 rounded-full"
            style={{
              width: step === s ? 24 : 8,
              background:
                i < stepIndex ? "rgba(139,92,246,0.5)"
                : step === s ? "linear-gradient(90deg, #8b5cf6, #06b6d4)"
                : "rgba(0,0,0,0.1)",
            }}
            layout
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      {/* ── コンテンツエリア ── */}
      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* ──────────── Step 1: 生年月日 ──────────── */}
          {step === "dob" && (
            <StepContainer key="dob">
              <GlassPanel>
                <StepTitle>{greeting}あなたのことを少し教えてください</StepTitle>
                <StepDescription>
                  Alter があなたの判断を支えるために、ライフステージを理解する必要があります。
                  年齢が分かれば、キャリア・人間関係・健康の文脈がより正確になります。
                </StepDescription>

                {!skipDob ? (
                  <div className="mt-6">
                    <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">生年月日</label>
                    <div className="mt-2 flex gap-2">
                      <GlassSelect
                        value={birthYear}
                        onChange={(v) => setBirthYear(v ? Number(v) : null)}
                        placeholder="年"
                        options={yearOptions.map((y) => ({ value: y, label: `${y}年` }))}
                        className="flex-[1.2]"
                      />
                      <GlassSelect
                        value={birthMonth}
                        onChange={(v) => setBirthMonth(v ? Number(v) : null)}
                        placeholder="月"
                        options={monthOptions.map((m) => ({ value: m, label: `${m}月` }))}
                        className="flex-[0.9]"
                      />
                      <GlassSelect
                        value={birthDay}
                        onChange={(v) => setBirthDay(v ? Number(v) : null)}
                        placeholder="日"
                        options={dayOptions.map((d) => ({ value: d, label: `${d}日` }))}
                        className="flex-[0.9]"
                      />
                    </div>
                  </div>
                ) : (
                  <SkippedBadge />
                )}

                <SkipToggle active={skipDob} onToggle={() => {
                  setSkipDob(!skipDob);
                  if (!skipDob) { setBirthYear(null); setBirthMonth(null); setBirthDay(null); }
                }} />

                <PrimaryButton disabled={!dobValid} onClick={goNext}>次へ</PrimaryButton>
              </GlassPanel>
            </StepContainer>
          )}

          {/* ──────────── Step 2: 性別 ──────────── */}
          {step === "gender" && (
            <StepContainer key="gender">
              <GlassPanel>
                <StepTitle>性別を教えてください</StepTitle>
                <StepDescription>
                  対人関係のアドバイスや健康に関する文脈で参考にします。
                  「答えない」を選んでも、Alter は性格データだけで判断できます。
                </StepDescription>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGender(opt.value)}
                      className={`
                        rounded-xl border px-4 py-3.5 text-sm font-bold transition-all duration-200
                        ${gender === opt.value
                          ? "border-violet-300 bg-gradient-to-br from-violet-50 to-cyan-50 text-violet-700 shadow-md shadow-violet-100"
                          : "border-slate-200 bg-white/60 text-slate-500 hover:border-violet-200 hover:bg-white/80"
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex gap-2">
                  <SecondaryButton onClick={goBack}>戻る</SecondaryButton>
                  <PrimaryButton disabled={!genderValid} onClick={goNext} className="flex-1">次へ</PrimaryButton>
                </div>
              </GlassPanel>
            </StepContainer>
          )}

          {/* ──────────── Step 3: 居住地 ──────────── */}
          {step === "location" && (
            <StepContainer key="location">
              <GlassPanel>
                <StepTitle>住んでいる地域を教えてください</StepTitle>
                <StepDescription>
                  生活圏を理解することで、天気連動や地域特性を踏まえた判断ができます。
                </StepDescription>

                {!skipLocation ? (
                  <>
                    {/* 都道府県 */}
                    <div className="mt-5 max-h-[260px] overflow-y-auto rounded-xl bg-slate-50/50 scrollbar-thin">
                      {REGION_GROUPS.map((group) => (
                        <div key={group.label}>
                          <div className="sticky top-0 z-10 bg-slate-50/90 px-4 py-1.5 text-[10px] font-bold tracking-widest text-violet-500/70 uppercase backdrop-blur-sm">
                            {group.label}
                          </div>
                          <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                            {group.prefectures.map((pref) => (
                              <button
                                key={pref}
                                type="button"
                                onClick={() => setPrefecture(pref)}
                                className={`
                                  rounded-lg px-1 py-2 text-xs font-medium transition-all duration-150
                                  ${prefecture === pref
                                    ? "bg-gradient-to-br from-violet-100 to-cyan-50 text-violet-700 font-bold border border-violet-300 shadow-sm"
                                    : "text-slate-400 hover:bg-white hover:text-slate-600 border border-transparent"
                                  }
                                `}
                              >
                                {pref.replace(/[都府県]$/, "")}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 市区町村（都道府県選択後に表示） */}
                    <AnimatePresence>
                      {prefecture && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4">
                            <label className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                              市区町村（任意）
                            </label>
                            <input
                              type="text"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder={`例: ${prefecture === "東京都" ? "渋谷区" : prefecture === "大阪府" ? "大阪市北区" : prefecture === "北海道" ? "札幌市中央区" : "○○市"}`}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 placeholder-slate-300 outline-none backdrop-blur-sm transition-all focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
                            />
                            <p className="mt-1.5 text-[10px] text-slate-400">
                              市区町村まで入力すると、より精密な天気・地域分析が可能になります
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <SkippedBadge />
                )}

                <SkipToggle active={skipLocation} onToggle={() => {
                  setSkipLocation(!skipLocation);
                  if (!skipLocation) { setPrefecture(null); setCity(""); }
                }} />

                <div className="mt-4 flex gap-2">
                  <SecondaryButton onClick={goBack}>戻る</SecondaryButton>
                  <PrimaryButton disabled={!locationValid} onClick={goNext} className="flex-1">次へ</PrimaryButton>
                </div>
              </GlassPanel>
            </StepContainer>
          )}

          {/* ──────────── Step 4: 確認 ──────────── */}
          {step === "confirm" && (
            <StepContainer key="confirm">
              <GlassPanel>
                <StepTitle>確認</StepTitle>
                <StepDescription>
                  以下の情報を Alter の文脈理解に使います。あとから設定で変更できます。
                </StepDescription>

                <div className="mt-6 flex flex-col gap-3">
                  <SummaryRow label="生年月日" value={
                    skipDob ? "未入力" : (birthYear && birthMonth && birthDay)
                      ? `${birthYear}年${birthMonth}月${birthDay}日`
                      : "未入力"
                  } />
                  <SummaryRow label="性別" value={
                    gender ? GENDER_OPTIONS.find((g) => g.value === gender)?.label ?? "未入力" : "未入力"
                  } />
                  <SummaryRow label="居住地" value={
                    skipLocation ? "未入力" : (
                      prefecture
                        ? city.trim() ? `${prefecture} ${city.trim()}` : prefecture
                        : "未入力"
                    )
                  } />
                </div>

                <div className="mt-8 flex gap-2">
                  <SecondaryButton onClick={goBack}>戻る</SecondaryButton>
                  <PrimaryButton
                    disabled={saving}
                    onClick={handleSubmit}
                    className="flex-1"
                  >
                    {saving ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span
                          className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        />
                        保存中...
                      </span>
                    ) : "はじめる"}
                  </PrimaryButton>
                </div>
              </GlassPanel>
            </StepContainer>
          )}
        </AnimatePresence>
      </div>

      {/* ── Aneurasync ロゴ ── */}
      <div className="relative z-10 mt-8 text-[10px] font-medium tracking-[0.2em] text-slate-300">
        ANEURASYNC
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Glass Subcomponents — Light Theme
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-2xl">
      {children}
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-extrabold leading-snug text-slate-800">
      {children}
    </h2>
  );
}

function StepDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
      {children}
    </p>
  );
}

function GlassSelect({
  value,
  onChange,
  placeholder,
  options,
  className = "",
}: {
  value: number | null;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: number; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={`
        appearance-none rounded-xl border border-slate-200 bg-white/70 px-3 py-3 text-sm font-semibold
        outline-none backdrop-blur-sm transition-all
        focus:border-violet-300 focus:ring-2 focus:ring-violet-100
        ${value ? "text-slate-700" : "text-slate-300"}
        ${className}
      `}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const isEmpty = value === "未入力";
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <span className={`text-sm font-bold ${isEmpty ? "text-slate-300" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        mt-4 rounded-xl px-6 py-3.5 text-sm font-extrabold text-white
        transition-all duration-200
        ${disabled
          ? "cursor-not-allowed bg-slate-200 text-slate-400"
          : "bg-gradient-to-r from-violet-500 to-cyan-500 shadow-lg shadow-violet-200 hover:shadow-violet-300 active:scale-[0.97]"
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 rounded-xl border border-slate-200 bg-white/60 px-5 py-3.5 text-xs font-bold text-slate-400 transition-all hover:bg-white hover:text-slate-600"
    >
      {children}
    </button>
  );
}

function SkipToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-3 block w-full py-2 text-center text-[11px] font-semibold text-slate-300 transition-colors hover:text-slate-500"
    >
      {active ? "やっぱり入力する" : "答えない"}
    </button>
  );
}

function SkippedBadge() {
  return (
    <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/50 py-4 text-center">
      <span className="text-xs text-slate-300">スキップしました</span>
    </div>
  );
}
