"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  RV_COLORS,
  RvCard,
  RvButton,
  RV_CATEGORY_LABELS,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// Types
// =============================================================================

type LifestyleAxes = {
  morningNight: number; // 0=朝型, 100=夜型
  indoorOutdoor: number; // 0=インドア, 100=アウトドア
  aloneGroup: number; // 0=ひとり時間, 100=みんなで過ごす
};

type ProfileData = {
  displayName: string;
  age: number | null;
  prefecture: string;
  city: string;
  occupationCategory: string;
  occupationFreeText: string;
  meetingPurpose: string[];
  availability: string[];
  hobbies: string[];
  interests: string[];
  lifestyle: LifestyleAxes;
  foodPreferences: string[];
  travelStyle: string;
  pets: string;
  selfIntro: string;
  marriageIntent: string;
  childrenPreference: string;
  partnerValues: string;
};

// =============================================================================
// Constants
// =============================================================================

const PREFECTURES = [
  "北海道",
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県",
  "沖縄県",
];

const OCCUPATION_CATEGORIES = [
  "IT・エンジニア", "デザイン・クリエイティブ", "営業・マーケティング",
  "事務・管理", "医療・福祉", "教育", "金融・保険", "飲食・サービス",
  "建設・不動産", "公務員", "自営業・フリーランス", "学生", "その他",
];

const PURPOSE_OPTIONS = [
  "恋愛", "友達", "ビジネス", "パートナー", "仲間", "まずは話したい",
];

const AVAILABILITY_OPTIONS = [
  "平日夜", "土日", "オンライン中心", "まずはメッセージ中心",
];

const HOBBY_OPTIONS = [
  "読書", "映画鑑賞", "音楽", "料理", "カフェ巡り", "旅行",
  "写真", "アート", "ゲーム", "スポーツ", "ヨガ", "ランニング",
  "キャンプ", "釣り", "ガーデニング", "DIY", "ファッション",
  "ダンス", "ワイン", "サウナ", "登山", "サーフィン",
  "ボードゲーム", "アニメ", "漫画", "ペット",
];

const INTEREST_OPTIONS = [
  "テクノロジー", "ビジネス", "デザイン", "心理学", "哲学",
  "教育", "環境", "健康", "投資", "起業",
  "音楽制作", "映像制作", "執筆", "建築", "宇宙",
  "歴史", "政治", "社会問題", "AI", "Web3",
];

const FOOD_OPTIONS = [
  "和食", "イタリアン", "フレンチ", "中華", "韓国料理",
  "タイ料理", "インド料理", "メキシカン", "ヴィーガン",
  "スイーツ", "コーヒー", "日本酒", "ワイン", "クラフトビール",
];

const TRAVEL_OPTIONS = [
  "国内旅行派", "海外旅行派", "バックパッカー", "リゾート派",
  "都市探索", "自然が好き", "食べ歩き旅", "あまり旅行しない",
];

const MARRIAGE_OPTIONS = ["いつか", "2-3年以内", "すぐにでも"];
const CHILDREN_OPTIONS = ["ほしい", "いらない", "どちらでも"];

const LIFESTYLE_AXES: { key: keyof LifestyleAxes; left: string; right: string }[] = [
  { key: "morningNight", left: "朝型", right: "夜型" },
  { key: "indoorOutdoor", left: "インドア", right: "アウトドア" },
  { key: "aloneGroup", left: "ひとり時間", right: "みんなで過ごす" },
];

const EMPTY_PROFILE: ProfileData = {
  displayName: "",
  age: null,
  prefecture: "",
  city: "",
  occupationCategory: "",
  occupationFreeText: "",
  meetingPurpose: [],
  availability: [],
  hobbies: [],
  interests: [],
  lifestyle: { morningNight: 50, indoorOutdoor: 50, aloneGroup: 50 },
  foodPreferences: [],
  travelStyle: "",
  pets: "",
  selfIntro: "",
  marriageIntent: "",
  childrenPreference: "",
  partnerValues: "",
};

// =============================================================================
// ProfileEditClient
// =============================================================================

export default function ProfileEditClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  const loadProfile = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetch("/api/rendezvous/profile", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.profile) {
          setProfile((prev) => ({
            ...prev,
            ...d.profile,
            lifestyle: {
              ...prev.lifestyle,
              ...(d.profile.lifestyle ?? {}),
            },
          }));
        }
      })
      .catch(() => {
        setLoadError("プロフィールの読み込みに失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/rendezvous/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profile }),
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
  }, [profile]);

  const toggleArrayItem = (
    field: keyof ProfileData,
    item: string,
    max?: number,
  ) => {
    setProfile((prev) => {
      const arr = prev[field] as string[];
      if (arr.includes(item)) {
        return { ...prev, [field]: arr.filter((x) => x !== item) };
      }
      if (max && arr.length >= max) return prev;
      return { ...prev, [field]: [...arr, item] };
    });
  };

  const showPartnerFields = profile.meetingPurpose.includes("パートナー");

  if (loading) {
    return (
      <div className="px-5 py-8 pb-28">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-2xl animate-pulse mb-4"
            style={{ background: RV_COLORS.surfaceMuted }}
          />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-5 py-8 pb-28 flex flex-col items-center justify-center gap-4">
        <p className="text-sm" style={{ color: RV_COLORS.primary }}>
          {loadError}
        </p>
        <RvButton variant="secondary" onClick={loadProfile}>
          再試行
        </RvButton>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-28"
      style={{ background: RV_COLORS.base }}
    >
      {/* ── Sticky Header ── */}
      <div
        className="px-5 pt-4 pb-2 flex items-center justify-between sticky top-0 z-20"
        style={{
          background: "rgba(250,250,248,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <button
          onClick={() => router.back()}
          className="text-sm font-medium bg-transparent border-none cursor-pointer"
          style={{ color: RV_COLORS.primary }}
        >
          ← 戻る
        </button>
        <h1
          className="text-base font-bold"
          style={{ color: RV_COLORS.text }}
        >
          プロフィール編集
        </h1>
        <motion.button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-bold bg-transparent border-none cursor-pointer"
          style={{
            color: saved ? RV_COLORS.success : RV_COLORS.primary,
          }}
          whileTap={{ scale: 0.95 }}
        >
          {saving ? "保存中..." : saved ? "保存済み" : "保存"}
        </motion.button>
      </div>

      <div className="px-5 mt-4 flex flex-col gap-5">
        {/* ================================================================ */}
        {/* Step 1: Required fields                                         */}
        {/* ================================================================ */}
        <RvCard>
          <SectionTitle>基本情報</SectionTitle>
          <p
            className="text-xs mt-1 mb-4"
            style={{ color: RV_COLORS.textMuted }}
          >
            必須項目です
          </p>
          <div className="flex flex-col gap-4">
            <InputField
              label="表示名"
              value={profile.displayName}
              onChange={(v) =>
                setProfile((p) => ({ ...p, displayName: v }))
              }
              placeholder="あなたの名前"
            />
            <InputField
              label="年齢"
              value={profile.age?.toString() ?? ""}
              onChange={(v) =>
                setProfile((p) => ({
                  ...p,
                  age: v ? parseInt(v, 10) || null : null,
                }))
              }
              placeholder="25"
              type="number"
            />

            {/* Prefecture + City */}
            <div>
              <label
                className="text-xs font-semibold block mb-1"
                style={{ color: RV_COLORS.textSub }}
              >
                エリア
              </label>
              <div className="flex gap-2">
                <select
                  value={profile.prefecture}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, prefecture: e.target.value }))
                  }
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                  style={{
                    background: RV_COLORS.surfaceMuted,
                    border: `1px solid ${RV_COLORS.border}`,
                    color: profile.prefecture
                      ? RV_COLORS.text
                      : RV_COLORS.textMuted,
                  }}
                >
                  <option value="">都道府県</option>
                  {PREFECTURES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={profile.city}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, city: e.target.value }))
                  }
                  placeholder="市区町村（任意）"
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: RV_COLORS.surfaceMuted,
                    border: `1px solid ${RV_COLORS.border}`,
                    color: RV_COLORS.text,
                  }}
                />
              </div>
            </div>

            {/* Occupation */}
            <div>
              <label
                className="text-xs font-semibold block mb-1"
                style={{ color: RV_COLORS.textSub }}
              >
                職業
              </label>
              <select
                value={profile.occupationCategory}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    occupationCategory: e.target.value,
                  }))
                }
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                style={{
                  background: RV_COLORS.surfaceMuted,
                  border: `1px solid ${RV_COLORS.border}`,
                  color: profile.occupationCategory
                    ? RV_COLORS.text
                    : RV_COLORS.textMuted,
                }}
              >
                <option value="">カテゴリを選択</option>
                {OCCUPATION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={profile.occupationFreeText}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    occupationFreeText: e.target.value,
                  }))
                }
                placeholder="詳細（任意）"
                className="w-full mt-2 px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: RV_COLORS.surfaceMuted,
                  border: `1px solid ${RV_COLORS.border}`,
                  color: RV_COLORS.text,
                }}
              />
            </div>

            {/* Meeting Purpose */}
            <div>
              <label
                className="text-xs font-semibold block mb-2"
                style={{ color: RV_COLORS.textSub }}
              >
                出会いの目的
              </label>
              <ChipGrid
                options={PURPOSE_OPTIONS}
                selected={profile.meetingPurpose}
                onToggle={(item) => toggleArrayItem("meetingPurpose", item)}
              />
            </div>

            {/* Availability */}
            <div>
              <label
                className="text-xs font-semibold block mb-2"
                style={{ color: RV_COLORS.textSub }}
              >
                会いやすさ
              </label>
              <ChipGrid
                options={AVAILABILITY_OPTIONS}
                selected={profile.availability}
                onToggle={(item) => toggleArrayItem("availability", item)}
              />
            </div>
          </div>
        </RvCard>

        {/* ================================================================ */}
        {/* Step 2: Recommended fields                                      */}
        {/* ================================================================ */}
        <RvCard>
          <SectionTitle>もっと教える</SectionTitle>
          <p
            className="text-xs mt-1 mb-4"
            style={{ color: RV_COLORS.textMuted }}
          >
            マッチングの精度が上がります
          </p>

          <div className="flex flex-col gap-5">
            {/* Hobbies */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-xs font-semibold"
                  style={{ color: RV_COLORS.textSub }}
                >
                  趣味
                </label>
                <CountBadge current={profile.hobbies.length} max={5} />
              </div>
              <ChipGrid
                options={HOBBY_OPTIONS}
                selected={profile.hobbies}
                onToggle={(item) => toggleArrayItem("hobbies", item, 5)}
              />
            </div>

            {/* Interests */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-xs font-semibold"
                  style={{ color: RV_COLORS.textSub }}
                >
                  興味・関心
                </label>
                <CountBadge current={profile.interests.length} max={5} />
              </div>
              <ChipGrid
                options={INTEREST_OPTIONS}
                selected={profile.interests}
                onToggle={(item) => toggleArrayItem("interests", item, 5)}
              />
            </div>

            {/* Lifestyle Sliders */}
            <div>
              <label
                className="text-xs font-semibold block mb-3"
                style={{ color: RV_COLORS.textSub }}
              >
                ライフスタイル
              </label>
              <div className="flex flex-col gap-5">
                {LIFESTYLE_AXES.map((axis) => (
                  <LifestyleSlider
                    key={axis.key}
                    leftLabel={axis.left}
                    rightLabel={axis.right}
                    value={profile.lifestyle[axis.key]}
                    onChange={(v) =>
                      setProfile((p) => ({
                        ...p,
                        lifestyle: { ...p.lifestyle, [axis.key]: v },
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </RvCard>

        {/* ================================================================ */}
        {/* Step 3: Optional fields (collapsed by default)                  */}
        {/* ================================================================ */}
        <AnimatePresence initial={false}>
          {!optionalExpanded ? (
            <motion.div
              key="expand-btn"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <RvButton
                variant="secondary"
                onClick={() => setOptionalExpanded(true)}
                className="w-full"
              >
                さらに詳しく
              </RvButton>
            </motion.div>
          ) : (
            <motion.div
              key="optional-fields"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col gap-5"
            >
              <RvCard>
                <SectionTitle>さらに詳しく</SectionTitle>
                <p
                  className="text-xs mt-1 mb-4"
                  style={{ color: RV_COLORS.textMuted }}
                >
                  任意の項目です
                </p>
                <div className="flex flex-col gap-5">
                  {/* Food */}
                  <div>
                    <label
                      className="text-xs font-semibold block mb-2"
                      style={{ color: RV_COLORS.textSub }}
                    >
                      食の好み
                    </label>
                    <ChipGrid
                      options={FOOD_OPTIONS}
                      selected={profile.foodPreferences}
                      onToggle={(item) =>
                        toggleArrayItem("foodPreferences", item)
                      }
                    />
                  </div>

                  {/* Travel Style */}
                  <div>
                    <label
                      className="text-xs font-semibold block mb-2"
                      style={{ color: RV_COLORS.textSub }}
                    >
                      旅行スタイル
                    </label>
                    <SingleSelectChips
                      options={TRAVEL_OPTIONS}
                      selected={profile.travelStyle}
                      onSelect={(v) =>
                        setProfile((p) => ({
                          ...p,
                          travelStyle: p.travelStyle === v ? "" : v,
                        }))
                      }
                    />
                  </div>

                  {/* Pets */}
                  <InputField
                    label="ペット"
                    value={profile.pets}
                    onChange={(v) =>
                      setProfile((p) => ({ ...p, pets: v }))
                    }
                    placeholder="犬を飼っています、猫好きなど"
                  />

                  {/* Self Intro */}
                  <div>
                    <label
                      className="text-xs font-semibold block mb-1"
                      style={{ color: RV_COLORS.textSub }}
                    >
                      自己紹介
                    </label>
                    <textarea
                      value={profile.selfIntro}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          selfIntro: e.target.value,
                        }))
                      }
                      placeholder="あなたのことを自由に書いてください"
                      rows={4}
                      className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm resize-none outline-none"
                      style={{
                        background: RV_COLORS.surfaceMuted,
                        border: `1px solid ${RV_COLORS.border}`,
                        color: RV_COLORS.text,
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Partner-only fields */}
                  <AnimatePresence>
                    {showPartnerFields && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex flex-col gap-5"
                      >
                        <div
                          className="h-px w-full"
                          style={{ background: RV_COLORS.border }}
                        />
                        <p
                          className="text-xs font-bold"
                          style={{ color: RV_COLORS.primary }}
                        >
                          パートナー向けの項目
                        </p>

                        {/* Marriage Intent */}
                        <div>
                          <label
                            className="text-xs font-semibold block mb-2"
                            style={{ color: RV_COLORS.textSub }}
                          >
                            結婚への意欲
                          </label>
                          <SingleSelectChips
                            options={MARRIAGE_OPTIONS}
                            selected={profile.marriageIntent}
                            onSelect={(v) =>
                              setProfile((p) => ({
                                ...p,
                                marriageIntent:
                                  p.marriageIntent === v ? "" : v,
                              }))
                            }
                          />
                        </div>

                        {/* Children */}
                        <div>
                          <label
                            className="text-xs font-semibold block mb-2"
                            style={{ color: RV_COLORS.textSub }}
                          >
                            子どもについて
                          </label>
                          <SingleSelectChips
                            options={CHILDREN_OPTIONS}
                            selected={profile.childrenPreference}
                            onSelect={(v) =>
                              setProfile((p) => ({
                                ...p,
                                childrenPreference:
                                  p.childrenPreference === v ? "" : v,
                              }))
                            }
                          />
                        </div>

                        {/* Partner Values */}
                        <InputField
                          label="大切にしている価値観"
                          value={profile.partnerValues}
                          onChange={(v) =>
                            setProfile((p) => ({
                              ...p,
                              partnerValues: v,
                            }))
                          }
                          placeholder="例: 信頼、対話、自立した関係"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </RvCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Save button */}
        <div className="mt-2">
          <RvButton
            variant="primary"
            onClick={handleSave}
            className="w-full"
          >
            {saving
              ? "保存中..."
              : saved
                ? "保存しました"
                : "プロフィールを保存"}
          </RvButton>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-sm font-bold"
      style={{ color: RV_COLORS.text }}
    >
      {children}
    </h3>
  );
}

function CountBadge({ current, max }: { current: number; max: number }) {
  const isFull = current >= max;
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: isFull
          ? `${RV_COLORS.primary}12`
          : RV_COLORS.surfaceMuted,
        color: isFull ? RV_COLORS.primary : RV_COLORS.textMuted,
      }}
    >
      {current}/{max}
    </span>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      {label && (
        <label
          className="text-xs font-semibold block mb-1"
          style={{ color: RV_COLORS.textSub }}
        >
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
        style={{
          background: RV_COLORS.surfaceMuted,
          border: `1px solid ${RV_COLORS.border}`,
          color: RV_COLORS.text,
        }}
      />
    </div>
  );
}

function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt);
        return (
          <motion.button
            key={opt}
            onClick={() => onToggle(opt)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer transition-all"
            style={{
              backgroundColor: isSelected
                ? `${RV_COLORS.primary}12`
                : RV_COLORS.surfaceMuted,
              color: isSelected
                ? RV_COLORS.primary
                : RV_COLORS.textSub,
              boxShadow: isSelected
                ? `0 1px 6px ${RV_COLORS.primaryGlow}`
                : "none",
            }}
            whileTap={{ scale: 0.93 }}
          >
            {opt}
          </motion.button>
        );
      })}
    </div>
  );
}

function SingleSelectChips({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected === opt;
        return (
          <motion.button
            key={opt}
            onClick={() => onSelect(opt)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border-none cursor-pointer transition-all"
            style={{
              backgroundColor: isSelected
                ? `${RV_COLORS.primary}12`
                : RV_COLORS.surfaceMuted,
              color: isSelected
                ? RV_COLORS.primary
                : RV_COLORS.textSub,
              boxShadow: isSelected
                ? `0 2px 8px ${RV_COLORS.primaryGlow}`
                : "none",
            }}
            whileTap={{ scale: 0.95 }}
          >
            {opt}
          </motion.button>
        );
      })}
    </div>
  );
}

function LifestyleSlider({
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const thumbColor = RV_COLORS.primary;
  const trackGradient = `linear-gradient(to right, ${RV_COLORS.primary}, ${RV_COLORS.accent})`;
  const fillPercent = value;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-semibold w-20 text-right shrink-0"
          style={{
            color:
              value < 40 ? RV_COLORS.primary : RV_COLORS.textMuted,
          }}
        >
          {leftLabel}
        </span>
        <div className="relative flex-1 h-10 flex items-center">
          <div
            className="absolute left-0 right-0 h-[6px] rounded-full"
            style={{ background: RV_COLORS.surfaceMuted }}
          />
          <div
            className="absolute left-0 h-[6px] rounded-full"
            style={{
              width: `${fillPercent}%`,
              background: trackGradient,
              opacity: 0.5,
            }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="rv-slider absolute left-0 right-0 w-full appearance-none bg-transparent cursor-pointer"
            style={
              {
                "--thumb-color": thumbColor,
                "--thumb-glow": RV_COLORS.primaryGlow,
              } as React.CSSProperties
            }
          />
        </div>
        <span
          className="text-xs font-semibold w-24 shrink-0"
          style={{
            color:
              value > 60 ? RV_COLORS.accent : RV_COLORS.textMuted,
          }}
        >
          {rightLabel}
        </span>
      </div>
      <style jsx>{`
        .rv-slider {
          height: 6px;
          margin: 0;
          z-index: 2;
        }
        .rv-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--thumb-color);
          box-shadow: 0 2px 8px var(--thumb-glow), 0 0 0 3px rgba(255,255,255,0.9);
          cursor: pointer;
          border: none;
          transition: transform 0.15s ease;
        }
        .rv-slider::-webkit-slider-thumb:active {
          transform: scale(1.15);
        }
        .rv-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--thumb-color);
          box-shadow: 0 2px 8px var(--thumb-glow), 0 0 0 3px rgba(255,255,255,0.9);
          cursor: pointer;
          border: none;
        }
        .rv-slider::-webkit-slider-runnable-track {
          height: 6px;
          background: transparent;
          border-radius: 3px;
        }
        .rv-slider::-moz-range-track {
          height: 6px;
          background: transparent;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
