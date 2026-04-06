"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

/**
 * ④-A: ベースライン収集 UI
 *
 * 3 ステップ:
 * 1. 生年月日（ライフステージ導出用）
 * 2. 性別（4択 + prefer_not_to_say）
 * 3. 居住都道府県（47 + 「答えない」）
 *
 * 設計原則:
 * - 全項目「答えない」を選択可能
 * - 収集理由を各ステップで説明（透明性）
 * - Stargazer の世界観に合わせた immersive UI
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

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

const REGION_GROUPS: { label: string; prefectures: string[] }[] = [
  { label: "北海道・東北", prefectures: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { label: "関東", prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { label: "中部", prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { label: "近畿", prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { label: "中国・四国", prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"] },
  { label: "九州・沖縄", prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
];

type Step = "dob" | "gender" | "prefecture" | "confirm";

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
  const [skipPrefecture, setSkipPrefecture] = useState(false);

  // Year options (13歳〜100歳)
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 13; y >= currentYear - 100; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  const dobValid = skipDob || (birthYear !== null && birthMonth !== null && birthDay !== null);
  const genderValid = gender !== null;
  const prefectureValid = skipPrefecture || prefecture !== null;

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (!skipDob && birthYear && birthMonth && birthDay) {
        const m = String(birthMonth).padStart(2, "0");
        const d = String(birthDay).padStart(2, "0");
        payload.dateOfBirth = `${birthYear}-${m}-${d}`;
      }
      if (gender && gender !== "skip") {
        payload.gender = gender;
      }
      if (!skipPrefecture && prefecture) {
        payload.prefecture = prefecture;
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
      }

      // Home へ遷移
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("[baseline] submit error:", err);
      setSaving(false);
    }
  }, [skipDob, birthYear, birthMonth, birthDay, gender, skipPrefecture, prefecture, router]);

  const goNext = useCallback(() => {
    if (step === "dob") setStep("gender");
    else if (step === "gender") setStep("prefecture");
    else if (step === "prefecture") setStep("confirm");
  }, [step]);

  const goBack = useCallback(() => {
    if (step === "gender") setStep("dob");
    else if (step === "prefecture") setStep("gender");
    else if (step === "confirm") setStep("prefecture");
  }, [step]);

  const greeting = userName ? `${userName}さん、` : "";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #0a0a1a 0%, #111128 50%, #0f0f2e 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background stars */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 30%, rgba(139,92,246,0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {/* Step dots */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32, position: "relative", zIndex: 1 }}>
        {(["dob", "gender", "prefecture", "confirm"] as const).map((s, i) => (
          <div
            key={s}
            style={{
              width: step === s ? 20 : 8,
              height: 8,
              borderRadius: 4,
              background:
                (["dob", "gender", "prefecture", "confirm"] as const).indexOf(step) > i
                  ? "rgba(139,92,246,0.8)"
                  : step === s
                    ? "linear-gradient(90deg, #8b5cf6, #06b6d4)"
                    : "rgba(255,255,255,0.15)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Content area */}
      <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 1 }}>
        <AnimatePresence mode="wait">
          {step === "dob" && (
            <StepContainer key="dob">
              <StepTitle>{greeting}あなたのことを少し教えてください</StepTitle>
              <StepDescription>
                Alter があなたの判断を支えるために、ライフステージを理解する必要があります。
                年齢が分かれば、キャリア・人間関係・健康の文脈がより正確になります。
              </StepDescription>

              {!skipDob ? (
                <div style={{ marginTop: 24 }}>
                  <label style={labelStyle}>生年月日</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <SelectField
                      value={birthYear}
                      onChange={(v) => setBirthYear(v ? Number(v) : null)}
                      placeholder="年"
                      options={yearOptions.map((y) => ({ value: y, label: `${y}年` }))}
                      flex={1.2}
                    />
                    <SelectField
                      value={birthMonth}
                      onChange={(v) => setBirthMonth(v ? Number(v) : null)}
                      placeholder="月"
                      options={monthOptions.map((m) => ({ value: m, label: `${m}月` }))}
                      flex={0.9}
                    />
                    <SelectField
                      value={birthDay}
                      onChange={(v) => setBirthDay(v ? Number(v) : null)}
                      placeholder="日"
                      options={dayOptions.map((d) => ({ value: d, label: `${d}日` }))}
                      flex={0.9}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 24, padding: 16, background: "rgba(255,255,255,0.05)", borderRadius: 12, textAlign: "center" }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>スキップしました</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSkipDob(!skipDob);
                  if (!skipDob) { setBirthYear(null); setBirthMonth(null); setBirthDay(null); }
                }}
                style={skipBtnStyle}
              >
                {skipDob ? "やっぱり入力する" : "答えない"}
              </button>

              <NextButton disabled={!dobValid} onClick={goNext} />
            </StepContainer>
          )}

          {step === "gender" && (
            <StepContainer key="gender">
              <StepTitle>性別を教えてください</StepTitle>
              <StepDescription>
                対人関係のアドバイスや健康に関する文脈で参考にします。
                「答えない」を選んでも、Alter は性格データだけで判断できます。
              </StepDescription>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 24 }}>
                {GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGender(opt.value)}
                    style={{
                      ...choiceBtnStyle,
                      background: gender === opt.value
                        ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(6,182,212,0.15))"
                        : "rgba(255,255,255,0.05)",
                      borderColor: gender === opt.value
                        ? "rgba(139,92,246,0.5)"
                        : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                <BackButton onClick={goBack} />
                <NextButton disabled={!genderValid} onClick={goNext} />
              </div>
            </StepContainer>
          )}

          {step === "prefecture" && (
            <StepContainer key="prefecture">
              <StepTitle>住んでいる地域を教えてください</StepTitle>
              <StepDescription>
                生活圏を理解することで、天気連動や地域特性を踏まえた判断ができます。
              </StepDescription>

              {!skipPrefecture ? (
                <div style={{ marginTop: 24, maxHeight: 320, overflowY: "auto", borderRadius: 12, background: "rgba(255,255,255,0.03)", padding: "8px 0" }}>
                  {REGION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "rgba(139,92,246,0.7)", letterSpacing: "0.1em" }}>
                        {group.label}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: "0 8px 8px" }}>
                        {group.prefectures.map((pref) => (
                          <button
                            key={pref}
                            type="button"
                            onClick={() => setPrefecture(pref)}
                            style={{
                              padding: "8px 4px",
                              fontSize: 12,
                              fontWeight: prefecture === pref ? 700 : 500,
                              color: prefecture === pref ? "#fff" : "rgba(255,255,255,0.6)",
                              background: prefecture === pref
                                ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.2))"
                                : "transparent",
                              border: prefecture === pref
                                ? "1px solid rgba(139,92,246,0.4)"
                                : "1px solid transparent",
                              borderRadius: 8,
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                            }}
                          >
                            {pref.replace(/[都府県]$/, "")}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 24, padding: 16, background: "rgba(255,255,255,0.05)", borderRadius: 12, textAlign: "center" }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>スキップしました</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSkipPrefecture(!skipPrefecture);
                  if (!skipPrefecture) setPrefecture(null);
                }}
                style={skipBtnStyle}
              >
                {skipPrefecture ? "やっぱり入力する" : "答えない"}
              </button>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <BackButton onClick={goBack} />
                <NextButton disabled={!prefectureValid} onClick={goNext} />
              </div>
            </StepContainer>
          )}

          {step === "confirm" && (
            <StepContainer key="confirm">
              <StepTitle>確認</StepTitle>
              <StepDescription>
                以下の情報を Alter の文脈理解に使います。あとから設定で変更できます。
              </StepDescription>

              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <SummaryRow label="生年月日" value={
                  skipDob ? "未入力" : (birthYear && birthMonth && birthDay)
                    ? `${birthYear}年${birthMonth}月${birthDay}日`
                    : "未入力"
                } />
                <SummaryRow label="性別" value={
                  gender ? GENDER_OPTIONS.find((g) => g.value === gender)?.label ?? "未入力" : "未入力"
                } />
                <SummaryRow label="居住地" value={
                  skipPrefecture ? "未入力" : (prefecture ?? "未入力")
                } />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 32 }}>
                <BackButton onClick={goBack} />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  style={{
                    ...nextBtnStyle,
                    flex: 1,
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? "保存中..." : "はじめる"}
                </button>
              </div>
            </StepContainer>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Subcomponents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.4, margin: 0 }}>
      {children}
    </h2>
  );
}

function StepDescription({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.55)", marginTop: 8, marginBottom: 0 }}>
      {children}
    </p>
  );
}

function SelectField({
  value,
  onChange,
  placeholder,
  options,
  flex = 1,
}: {
  value: number | null;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: number; label: string }[];
  flex?: number;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        flex,
        padding: "12px 8px",
        fontSize: 14,
        fontWeight: 600,
        color: value ? "#fff" : "rgba(255,255,255,0.35)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        appearance: "none",
        WebkitAppearance: "none",
        cursor: "pointer",
        outline: "none",
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ color: "#000" }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function NextButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...nextBtnStyle, flex: 1, marginTop: 16 }}
    >
      次へ
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "12px 20px",
        fontSize: 13,
        fontWeight: 700,
        color: "rgba(255,255,255,0.5)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        cursor: "pointer",
      }}
    >
      戻る
    </button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Styles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.5)",
  letterSpacing: "0.05em",
};

const choiceBtnStyle: React.CSSProperties = {
  padding: "14px 12px",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const skipBtnStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "8px 0",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.35)",
  background: "none",
  border: "none",
  cursor: "pointer",
  display: "block",
  width: "100%",
  textAlign: "center",
};

const nextBtnStyle: React.CSSProperties = {
  padding: "14px 24px",
  fontSize: 14,
  fontWeight: 800,
  color: "#fff",
  background: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  boxShadow: "0 4px 15px rgba(139,92,246,0.3)",
};
