"use client";

/**
 * RendezvousSettingsForm
 * Settings → "探索方針" (詳細調整)
 * Light-mode cosmic aesthetic: 透明感のある宇宙 / 探索の方向を整える場所
 *
 * Home = 現在の運用操作 (active/pause per context)
 * Settings = 詳細調整 (openness, notification, summaries, auto-standby)
 *
 * 既存機能を維持:
 * - displayName
 * - enabledCategories
 * - notification settings
 * - publicMoodSummary / publicStyleSummary
 * - 文脈ごとの開放度スライダー (4文脈: friend/romance/orbiter/cocreation)
 *
 * 変更点:
 * - isEnabled / isPaused トグル → ホーム画面の文脈別制御に移動（ここからは削除）
 * - 自動待機閾値ピッカー追加 (オフ/1h/2h/4h推奨/8h)
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSoundContext } from "@/components/rendezvous/SoundProvider";
import type { RendezvousCategory } from "@/lib/rendezvous/types";
import {
  ALL_CONTEXTS,
  CONTEXT_LABELS,
  CONTEXT_COLORS,
} from "@/lib/rendezvous/questions/types";
import type { ContextType } from "@/lib/rendezvous/questions/types";
import { FACE_TYPES, type FaceTypeId } from "@/lib/rendezvous/faceTypes";

const OCCUPATION_CATEGORIES = [
  { key: "it_engineer", label: "IT / エンジニア" },
  { key: "creative", label: "クリエイティブ / デザイン" },
  { key: "medical", label: "医療 / 福祉" },
  { key: "finance", label: "金融 / 会計" },
  { key: "education", label: "教育 / 研究" },
  { key: "sales", label: "営業 / マーケティング" },
  { key: "service", label: "サービス / 接客" },
  { key: "manufacturing", label: "製造 / 技術" },
  { key: "government", label: "公務員 / 行政" },
  { key: "freelance", label: "フリーランス / 自営業" },
  { key: "student", label: "学生" },
  { key: "other", label: "その他" },
];

const EDUCATION_LEVELS = [
  { key: "high_school", label: "高校卒" },
  { key: "vocational", label: "専門学校卒" },
  { key: "university", label: "大学卒" },
  { key: "graduate", label: "大学院卒" },
];

type SettingsData = {
  displayName: string;
  enabledCategories: RendezvousCategory[];
  notificationEnabled: boolean;
  notificationDelayMode: string;
  publicMoodSummary: string;
  publicStyleSummary: string;
  /** 文脈ごとの開放度 0-100 */
  contextOpenness?: Record<ContextType, number>;
  /** 自動待機の閾値（時間）。0 = オフ */
  autoStandbyThresholdHours: number;
  /** おやすみ時間: 開始 (e.g. "22:00") */
  quietHoursStart: string;
  /** おやすみ時間: 終了 (e.g. "07:00") */
  quietHoursEnd: string;
  /** おやすみ時間: 有効かどうか */
  quietHoursEnabled: boolean;
  // プロフィール
  gender: string | null;
  dateOfBirth: string | null;
  smoking: string | null;
  drinking: string | null;
  occupationCategory: string | null;
  educationLevel: string | null;
  prefecture: string | null;
  languages: string[];
};

const CATEGORIES: { key: RendezvousCategory; label: string; desc: string }[] = [
  { key: "romantic", label: "恋愛", desc: "恋愛的な交差を探す" },
  { key: "partner", label: "パートナー", desc: "人生のパートナーを探す" },
  { key: "friendship", label: "友達", desc: "友人としての交差を探す" },
  { key: "cocreation", label: "ビジネス / 共創", desc: "ビジネス・創作パートナーを探す" },
  { key: "community", label: "コミュニティ", desc: "グループ的な接続を探す" },
];

const CATEGORY_COLOR: Record<string, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
};

const DELAY_MODES = [
  { value: "standard", label: "標準", desc: "3〜6時間の余韻" },
  { value: "slow", label: "ゆっくり", desc: "6〜24時間、静かに届く" },
  { value: "fast", label: "早め", desc: "1〜3時間で届く" },
];

const QUIET_HOUR_OPTIONS = [
  "00:00", "00:30", "01:00", "01:30", "02:00", "02:30",
  "03:00", "03:30", "04:00", "04:30", "05:00", "05:30",
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30",
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30",
];

const STANDBY_OPTIONS = [
  { value: 0, label: "オフ", desc: "自動待機しない" },
  { value: 1, label: "1時間", desc: "1時間操作がなければ待機" },
  { value: 2, label: "2時間", desc: "2時間操作がなければ待機" },
  { value: 4, label: "4時間", desc: "4時間操作がなければ待機（推奨）", recommended: true },
  { value: 8, label: "8時間", desc: "8時間操作がなければ待機" },
];

const DEFAULT_SETTINGS: SettingsData = {
  displayName: "",
  enabledCategories: [],
  notificationEnabled: true,
  notificationDelayMode: "standard",
  publicMoodSummary: "",
  publicStyleSummary: "",
  contextOpenness: { friend: 50, romance: 50, orbiter: 50, cocreation: 50 },
  autoStandbyThresholdHours: 4,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  quietHoursEnabled: false,
  gender: null,
  dateOfBirth: null,
  smoking: null,
  drinking: null,
  occupationCategory: null,
  educationLevel: null,
  prefecture: null,
  languages: [],
};

const FACE_TYPE_ORDER: FaceTypeId[] = [
  "lumiere", "bloom", "prism", "silhouette",
  "terre", "aurora", "ember", "monolith",
];
const FACE_TYPE_EMOJI: Record<FaceTypeId, string> = {
  lumiere: "☀️", bloom: "🌸", terre: "🌍", aurora: "🌌",
  prism: "💎", silhouette: "✨", ember: "🔥", monolith: "🗿",
};

const HOBBY_TAGS = [
  { key: "music", label: "音楽", icon: "🎵" },
  { key: "movies", label: "映画", icon: "🎬" },
  { key: "anime_manga", label: "アニメ・漫画", icon: "📚" },
  { key: "gaming", label: "ゲーム", icon: "🎮" },
  { key: "travel", label: "旅行", icon: "✈️" },
  { key: "cooking", label: "料理", icon: "🍳" },
  { key: "sports", label: "スポーツ", icon: "⚽" },
  { key: "fitness", label: "筋トレ・ヨガ", icon: "💪" },
  { key: "reading", label: "読書", icon: "📖" },
  { key: "art", label: "アート・創作", icon: "🎨" },
  { key: "photography", label: "写真", icon: "📷" },
  { key: "nature", label: "自然・アウトドア", icon: "🌿" },
  { key: "cafe", label: "カフェ巡り", icon: "☕" },
  { key: "fashion", label: "ファッション", icon: "👗" },
  { key: "tech", label: "テクノロジー", icon: "💻" },
  { key: "animals", label: "動物", icon: "🐾" },
  { key: "meditation", label: "瞑想・マインドフルネス", icon: "🧘" },
  { key: "learning", label: "勉強・学び", icon: "🎓" },
  { key: "drinking", label: "お酒・バー", icon: "🍷" },
  { key: "dance", label: "ダンス", icon: "💃" },
];

const CONTEXT_DESC: Record<ContextType, string> = {
  friend: "安心を軸にした接続",
  romance: "引力と化学反応の交差",
  orbiter: "感性の軌道で交わる存在",
  cocreation: "知性と情熱が交わる共創パートナー",
};

export default function RendezvousSettingsForm() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 印象タイプ・身長の好み
  const [preferredFaceTypes, setPreferredFaceTypes] = useState<Set<string>>(new Set());
  const [heightNoPreference, setHeightNoPreference] = useState(true);
  const [heightMinCm, setHeightMinCm] = useState(155);
  const [heightMaxCm, setHeightMaxCm] = useState(180);

  // P0: カテゴリ別の年齢好み
  type AgePref = { noPreference: boolean; min: number; max: number };
  const [ageByCategory, setAgeByCategory] = useState<Record<string, AgePref>>({});

  // P0: カテゴリ別の性別好み
  type GenderPrefMap = Record<string, Set<string>>;
  const [gendersByCategory, setGendersByCategory] = useState<GenderPrefMap>({});

  // P2: カテゴリ別の類似性好み
  const [similarityByCategory, setSimilarityByCategory] = useState<Record<string, string>>({});

  // P1: 居住地
  const [preferredPrefecture, setPreferredPrefecture] = useState<string>("");

  // P2: 喫煙/飲酒
  const [smokingPref, setSmokingPref] = useState("no_preference");
  const [drinkingPref, setDrinkingPref] = useState("no_preference");

  // 言語
  const [preferredLanguages, setPreferredLanguages] = useState<Set<string>>(new Set());

  // phenotype好み（目/輪郭/口/鼻/髪/体型/PC）
  const [prefAppearance, setPrefAppearance] = useState<Record<string, unknown>>({});

  // 趣味・好きなこと
  const [hobbies, setHobbies] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/rendezvous/settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setSettings({
            displayName: data.displayName ?? "",
            enabledCategories: Array.isArray(data.enabledCategories)
              ? data.enabledCategories
              : [],
            notificationEnabled: data.notificationEnabled ?? true,
            notificationDelayMode: data.notificationDelayMode ?? "standard",
            publicMoodSummary: data.publicMoodSummary ?? "",
            publicStyleSummary: data.publicStyleSummary ?? "",
            contextOpenness: data.contextOpenness ?? {
              friend: 50,
              romance: 50,
              partner: 50,
              business: 50,
              community: 50,
            },
            autoStandbyThresholdHours:
              typeof data.autoStandbyThresholdHours === "number"
                ? data.autoStandbyThresholdHours
                : 4,
            quietHoursStart: data.quietHoursStart ?? "22:00",
            quietHoursEnd: data.quietHoursEnd ?? "07:00",
            quietHoursEnabled: data.quietHoursEnabled ?? false,
            gender: data.gender ?? null,
            dateOfBirth: data.dateOfBirth ?? null,
            smoking: data.smoking ?? null,
            drinking: data.drinking ?? null,
            occupationCategory: data.occupationCategory ?? null,
            educationLevel: data.educationLevel ?? null,
            prefecture: data.prefecture ?? null,
            languages: data.languages ?? [],
          });
          if (Array.isArray(data.hobbies) && data.hobbies.length > 0) {
            setHobbies(new Set(data.hobbies));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // 好みデータをカテゴリ別にロード
    const cats = ["romantic", "partner", "friendship", "cocreation", "community"];
    Promise.all(
      cats.map((cat) =>
        fetch(`/api/stargazer/relationship-desires?category=${cat}`, { credentials: "include" })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => ({ cat, profile: data?.existingProfile ?? null }))
          .catch(() => ({ cat, profile: null })),
      ),
    ).then((results) => {
      const gMap: Record<string, Set<string>> = {};
      const sMap: Record<string, string> = {};
      const aMap: Record<string, AgePref> = {};
      for (const { cat, profile: ep } of results) {
        if (!ep) continue;
        // カテゴリ別性別
        if (Array.isArray(ep.preferred_genders) && ep.preferred_genders.length > 0) {
          gMap[cat] = new Set(ep.preferred_genders);
        }
        // カテゴリ別類似性
        if (ep.similarity_preference) {
          sMap[cat] = ep.similarity_preference;
        }
        // カテゴリ別年齢
        if (ep.preferred_age_min || ep.preferred_age_max) {
          aMap[cat] = { noPreference: false, min: ep.preferred_age_min ?? 18, max: ep.preferred_age_max ?? 60 };
        }
        // 共通項目（最初に見つかったものを使用）
        if (Array.isArray(ep.preferred_face_types) && ep.preferred_face_types.length > 0) {
          setPreferredFaceTypes((prev) => prev.size > 0 ? prev : new Set(ep.preferred_face_types));
        }
        if (ep.preferred_height_min_cm || ep.preferred_height_max_cm) {
          setHeightNoPreference(false);
          setHeightMinCm((prev) => prev !== 155 ? prev : ep.preferred_height_min_cm ?? 155);
          setHeightMaxCm((prev) => prev !== 180 ? prev : ep.preferred_height_max_cm ?? 180);
        }
        if (ep.preferred_prefecture) setPreferredPrefecture((prev) => prev || ep.preferred_prefecture);
        if (ep.smoking_preference) setSmokingPref((prev) => prev !== "no_preference" ? prev : ep.smoking_preference);
        if (ep.drinking_preference) setDrinkingPref((prev) => prev !== "no_preference" ? prev : ep.drinking_preference);
        if (Array.isArray(ep.preferred_languages) && ep.preferred_languages.length > 0) {
          setPreferredLanguages((prev) => prev.size > 0 ? prev : new Set(ep.preferred_languages));
        }
        if (ep.preferred_appearance && Object.keys(ep.preferred_appearance).length > 0) {
          setPrefAppearance((prev) => Object.keys(prev).length > 0 ? prev : ep.preferred_appearance);
        }
      }
      if (Object.keys(gMap).length > 0) setGendersByCategory(gMap);
      if (Object.keys(sMap).length > 0) setSimilarityByCategory(sMap);
      if (Object.keys(aMap).length > 0) setAgeByCategory(aMap);
    });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setFeedback(null);
    try {
      // メイン設定を保存
      const res = await fetch("/api/rendezvous/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, hobbies: Array.from(hobbies) }),
      });

      // 好みデータをカテゴリ別に保存
      const sharedPayload = {
        preferredFaceTypes: Array.from(preferredFaceTypes),
        preferredHeightMinCm: heightNoPreference ? null : heightMinCm,
        preferredHeightMaxCm: heightNoPreference ? null : heightMaxCm,
        preferredPrefecture: preferredPrefecture || null,
        smokingPreference: smokingPref,
        drinkingPreference: drinkingPref,
      };
      const activeCats = settings.enabledCategories.length > 0 ? settings.enabledCategories : ["romantic"];
      const prefPromises = activeCats.map((cat) => {
        const agePref = ageByCategory[cat];
        return fetch("/api/stargazer/relationship-desires", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: cat,
            ...sharedPayload,
            preferredGenders: Array.from(gendersByCategory[cat] ?? []),
            similarityPreference: similarityByCategory[cat] ?? "no_preference",
            preferredAgeMin: agePref?.noPreference !== false ? null : agePref.min,
            preferredAgeMax: agePref?.noPreference !== false ? null : agePref.max,
            preferredLanguages: Array.from(preferredLanguages),
            preferredAppearance: prefAppearance,
          }),
        }).catch(() => null);
      });
      const prefResults = await Promise.all(prefPromises);
      const prefRes = prefResults.every((r) => r?.ok) ? { ok: true } : null;

      if (res.ok && prefRes?.ok) {
        setFeedback("方針を保存しました");
      } else if (res.ok) {
        setFeedback("方針を保存しました（好み設定の一部が保存できませんでした）");
      } else {
        setFeedback("保存に失敗しました");
      }
    } catch {
      setFeedback("通信エラーが発生しました");
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [settings, preferredFaceTypes, heightNoPreference, heightMinCm, heightMaxCm, ageByCategory, gendersByCategory, similarityByCategory, preferredPrefecture, smokingPref, drinkingPref, preferredLanguages, prefAppearance]);

  const toggleCategory = (cat: RendezvousCategory) => {
    setSettings((prev) => ({
      ...prev,
      enabledCategories: prev.enabledCategories.includes(cat)
        ? prev.enabledCategories.filter((c) => c !== cat)
        : [...prev.enabledCategories, cat],
    }));
  };

  const setContextOpenness = (ctx: ContextType, value: number) => {
    setSettings((prev) => ({
      ...prev,
      contextOpenness: {
        ...(prev.contextOpenness ?? {
          friend: 50,
          romance: 50,
          orbiter: 50,
          cocreation: 50,
        }),
        [ctx]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{
          background:
            "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 30%, #F5F0FF 60%, #FFF8F6 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "#6366F1",
              opacity: 0.5,
              animation: "rv-settings-pulse 1.5s ease-in-out infinite",
            }}
          />
          <span
            className="text-xs"
            style={{
              color: "rgba(30,30,60,0.35)",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
            }}
          >
            探索方針を読み込み中...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 30%, #F5F0FF 60%, #FFF8F6 100%)",
        minHeight: "100vh",
      }}
    >
      <div
        className="px-5 pt-6 pb-24"
        style={{ maxWidth: 600, margin: "0 auto" }}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/rendezvous"
              style={{
                color: "rgba(30,30,60,0.4)",
                textDecoration: "none",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ←
            </Link>
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: 2.5,
                  height: 14,
                  borderRadius: 2,
                  background: "#6366F1",
                }}
              />
              <h1
                className="text-lg font-extrabold"
                style={{ color: "#1E1E3C", letterSpacing: 0.5 }}
              >
                探索方針
              </h1>
            </div>
          </div>
          <p
            className="text-xs"
            style={{ color: "rgba(30,30,60,0.4)", paddingLeft: 30 }}
          >
            分身が探しにいく接続の方向を詳細に調整する
          </p>
        </div>

        {/* Display name */}
        <Section>
          <SectionLabel>分身の表示名</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-2"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            交差の相手に表示される名前
          </p>
          <input
            type="text"
            value={settings.displayName}
            onChange={(e) =>
              setSettings((p) => ({ ...p, displayName: e.target.value }))
            }
            placeholder="相手に表示される名前"
            style={inputStyle}
          />
        </Section>

        {/* Categories */}
        <Section>
          <SectionLabel>探すカテゴリ</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-3"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            分身がどの種類の接続を探しに行くか
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const active = settings.enabledCategories.includes(cat.key);
              const c = CATEGORY_COLOR[cat.key] ?? "#6366F1";
              return (
                <button
                  key={cat.key}
                  onClick={() => toggleCategory(cat.key)}
                  className="rounded-xl border-none cursor-pointer transition-all"
                  style={{
                    padding: "10px 16px",
                    background: active
                      ? `${c}14`
                      : "rgba(255,255,255,0.6)",
                    color: active ? c : "rgba(30,30,60,0.35)",
                    border: `1px solid ${active ? `${c}30` : "rgba(30,30,60,0.06)"}`,
                    fontSize: 12,
                    fontWeight: 700,
                    boxShadow: active ? `0 1px 6px ${c}15` : "none",
                  }}
                >
                  <div>{cat.label}</div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 500,
                      marginTop: 2,
                      opacity: 0.7,
                    }}
                  >
                    {cat.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── P0: カテゴリ別 年齢 ── */}
        <Section>
          <SectionLabel>相手の年齢（カテゴリ別）</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            カテゴリごとに希望する年齢範囲を設定
          </p>
          <div className="flex flex-col gap-4">
            {CATEGORIES.map((cat) => {
              const c = CATEGORY_COLOR[cat.key] ?? "#6366F1";
              const agePref = ageByCategory[cat.key] ?? { noPreference: true, min: 20, max: 40 };
              const setAge = (update: Partial<AgePref>) =>
                setAgeByCategory((prev) => ({ ...prev, [cat.key]: { ...agePref, ...update } }));
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1E1E3C" }}>{cat.label}</span>
                    <label className="flex items-center gap-1 ml-auto cursor-pointer">
                      <input type="checkbox" checked={agePref.noPreference} onChange={(e) => setAge({ noPreference: e.target.checked })} style={{ accentColor: c }} />
                      <span style={{ fontSize: 10, color: "rgba(30,30,60,0.4)" }}>不問</span>
                    </label>
                  </div>
                  {!agePref.noPreference && (
                    <div className="ml-4 flex items-center gap-2">
                      <input type="number" min={18} max={60} value={agePref.min} onChange={(e) => setAge({ min: Number(e.target.value) })} style={{ ...inputStyle, width: 60, padding: "4px 8px", fontSize: 12 }} />
                      <span style={{ fontSize: 11, color: "rgba(30,30,60,0.4)" }}>〜</span>
                      <input type="number" min={18} max={60} value={agePref.max} onChange={(e) => setAge({ max: Number(e.target.value) })} style={{ ...inputStyle, width: 60, padding: "4px 8px", fontSize: 12 }} />
                      <span style={{ fontSize: 11, color: "rgba(30,30,60,0.4)" }}>歳</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── P0: カテゴリ別 性別 ── */}
        <Section>
          <SectionLabel>相手の性別（カテゴリ別）</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            各カテゴリで接続したい性別を選択（両方選択OK）
          </p>
          <div className="flex flex-col gap-3">
            {CATEGORIES.map((cat) => {
              const genders = gendersByCategory[cat.key] ?? new Set<string>();
              const c = CATEGORY_COLOR[cat.key] ?? "#6366F1";
              const toggleGender = (g: string) => {
                setGendersByCategory((prev) => {
                  const cur = new Set(prev[cat.key] ?? []);
                  if (cur.has(g)) cur.delete(g); else cur.add(g);
                  return { ...prev, [cat.key]: cur };
                });
              };
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1E1E3C" }}>{cat.label}</span>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {([ { key: "male", label: "男性" }, { key: "female", label: "女性" } ] as const).map(({ key, label }) => {
                      const active = genders.has(key);
                      return (
                        <button key={key} onClick={() => toggleGender(key)} className="rounded-lg border-none cursor-pointer transition-all" style={{
                          padding: "6px 16px", fontSize: 11, fontWeight: 600,
                          background: active ? `${c}14` : "rgba(255,255,255,0.5)",
                          color: active ? c : "rgba(30,30,60,0.4)",
                          border: `1px solid ${active ? `${c}30` : "rgba(30,30,60,0.06)"}`,
                        }}>{label}</button>
                      );
                    })}
                    {genders.size === 0 && <span style={{ fontSize: 10, color: "rgba(30,30,60,0.3)", alignSelf: "center" }}>未選択 = 両方</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── P1: 居住地 ── */}
        <Section>
          <SectionLabel>相手の居住エリア</SectionLabel>
          <p className="text-xs mt-0.5 mb-2" style={{ color: "rgba(30,30,60,0.35)" }}>
            空欄 = こだわらない
          </p>
          <select
            value={preferredPrefecture}
            onChange={(e) => setPreferredPrefecture(e.target.value)}
            style={{ ...inputStyle, appearance: "auto" }}
          >
            <option value="">こだわらない</option>
            {["北海道","青森","岩手","宮城","秋田","山形","福島","茨城","栃木","群馬","埼玉","千葉","東京","神奈川","新潟","富山","石川","福井","山梨","長野","岐阜","静岡","愛知","三重","滋賀","京都","大阪","兵庫","奈良","和歌山","鳥取","島根","岡山","広島","山口","徳島","香川","愛媛","高知","福岡","佐賀","長崎","熊本","大分","宮崎","鹿児島","沖縄"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Section>

        {/* ── P2: 喫煙・飲酒 ── */}
        <Section>
          <SectionLabel>ライフスタイル</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            相手のライフスタイルの好み
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>喫煙</label>
              <div className="flex gap-2">
                {([
                  { key: "no_preference", label: "こだわらない" },
                  { key: "non_smoker", label: "吸わない人" },
                  { key: "smoker_ok", label: "吸ってもOK" },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setSmokingPref(key)} className="rounded-lg border-none cursor-pointer transition-all" style={{
                    padding: "8px 12px", fontSize: 11, fontWeight: 600,
                    background: smokingPref === key ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                    color: smokingPref === key ? "#6366F1" : "rgba(30,30,60,0.45)",
                    border: `1px solid ${smokingPref === key ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>飲酒</label>
              <div className="flex gap-2">
                {([
                  { key: "no_preference", label: "こだわらない" },
                  { key: "non_drinker", label: "飲まない人" },
                  { key: "social", label: "たまに飲む" },
                  { key: "regular", label: "よく飲む" },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setDrinkingPref(key)} className="rounded-lg border-none cursor-pointer transition-all" style={{
                    padding: "8px 12px", fontSize: 11, fontWeight: 600,
                    background: drinkingPref === key ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                    color: drinkingPref === key ? "#6366F1" : "rgba(30,30,60,0.45)",
                    border: `1px solid ${drinkingPref === key ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── P2: カテゴリ別 類似性 vs 補完性 ── */}
        <Section>
          <SectionLabel>どんな出会いを求めていますか？</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            カテゴリごとに、似た人か補い合える人かを選択
          </p>
          <div className="flex flex-col gap-4">
            {CATEGORIES.map((cat) => {
              const c = CATEGORY_COLOR[cat.key] ?? "#6366F1";
              const current = similarityByCategory[cat.key] ?? "no_preference";
              const setSim = (v: string) => setSimilarityByCategory((prev) => ({ ...prev, [cat.key]: v }));
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1E1E3C" }}>{cat.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-4">
                    {([
                      { key: "similar", label: "似た人" },
                      { key: "complementary", label: "違う人" },
                      { key: "mixed", label: "部分的に違う" },
                      { key: "no_preference", label: "おまかせ" },
                    ] as const).map(({ key, label }) => {
                      const active = current === key;
                      return (
                        <button key={key} onClick={() => setSim(key)} className="rounded-lg border-none cursor-pointer transition-all" style={{
                          padding: "6px 12px", fontSize: 10, fontWeight: 600,
                          background: active ? `${c}14` : "rgba(255,255,255,0.5)",
                          color: active ? c : "rgba(30,30,60,0.4)",
                          border: `1px solid ${active ? `${c}30` : "rgba(30,30,60,0.06)"}`,
                        }}>{label}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── 言語 ── */}
        <Section>
          <SectionLabel>言語</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            相手に求める言語（複数選択OK、空 = こだわらない）
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "japanese", label: "日本語" },
              { key: "english", label: "English" },
              { key: "chinese", label: "中文" },
              { key: "korean", label: "한국어" },
              { key: "spanish", label: "Español" },
              { key: "french", label: "Français" },
            ] as const).map(({ key, label }) => {
              const active = preferredLanguages.has(key);
              return (
                <button key={key} onClick={() => setPreferredLanguages((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="rounded-lg border-none cursor-pointer transition-all" style={{
                  padding: "8px 14px", fontSize: 11, fontWeight: 600,
                  background: active ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                  color: active ? "#6366F1" : "rgba(30,30,60,0.45)",
                  border: `1px solid ${active ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                }}>{label}</button>
              );
            })}
          </div>
        </Section>

        {/* ── Phenotype好み拡張（詳細な外見好み） ── */}
        <Section>
          <SectionLabel>外見の詳細な好み</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            もっと詳しく好みを設定したい場合（任意）
          </p>

          {/* 目のタイプ */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>目のタイプ</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {([ { key: "armond", label: "アーモンド" }, { key: "kirenaga", label: "切れ長" }, { key: "tsurime", label: "つり目" }, { key: "tareme", label: "たれ目" }, { key: "marume", label: "丸目" }, { key: "yanagiba", label: "柳葉" } ] as const).map(({ key, label }) => {
              const sel = (prefAppearance.eye_shapes as string[] | undefined) ?? [];
              const active = sel.includes(key);
              return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.eye_shapes as string[] | undefined) ?? []; return { ...p, eye_shapes: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded-lg border-none cursor-pointer transition-all" style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
            })}
          </div>

          {/* 輪郭 */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>輪郭</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {([ { key: "oval", label: "卵型" }, { key: "round", label: "丸型" }, { key: "oblong", label: "面長" }, { key: "square", label: "四角" }, { key: "heart", label: "ハート" }, { key: "inverted_triangle", label: "逆三角" } ] as const).map(({ key, label }) => {
              const sel = (prefAppearance.face_shapes as string[] | undefined) ?? [];
              const active = sel.includes(key);
              return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.face_shapes as string[] | undefined) ?? []; return { ...p, face_shapes: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded-lg border-none cursor-pointer transition-all" style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
            })}
          </div>

          {/* 鼻の印象（スライダー） */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>鼻の印象</label>
          <div className="flex flex-col gap-2 mb-3 ml-2">
            {([ { key: "nose_height", label: "低い ↔ 高い" }, { key: "nose_sharpness", label: "丸い ↔ シャープ" } ] as const).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: "rgba(30,30,60,0.4)", width: 100 }}>{label}</span>
                <input type="range" min={-100} max={100} value={((prefAppearance[key] as number) ?? 0)} onChange={(e) => setPrefAppearance((p) => ({ ...p, [key]: Number(e.target.value) }))} className="flex-1" style={{ accentColor: "#7C3AED" }} />
              </div>
            ))}
          </div>

          {/* 口の印象（スライダー） */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>口の印象</label>
          <div className="flex flex-col gap-2 mb-3 ml-2">
            {([ { key: "mouth_thickness", label: "薄い ↔ 厚い" }, { key: "mouth_softness", label: "引き締め ↔ 柔らか" } ] as const).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: "rgba(30,30,60,0.4)", width: 100 }}>{label}</span>
                <input type="range" min={-100} max={100} value={((prefAppearance[key] as number) ?? 0)} onChange={(e) => setPrefAppearance((p) => ({ ...p, [key]: Number(e.target.value) }))} className="flex-1" style={{ accentColor: "#7C3AED" }} />
              </div>
            ))}
          </div>

          {/* 髪（長さ/質感/シルエット） */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>髪の好み</label>
          <div className="flex flex-col gap-2 mb-3">
            <div>
              <span style={{ fontSize: 10, color: "rgba(30,30,60,0.35)" }}>長さ</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {([ "ベリーショート", "ショート", "ボブ", "ミディアム", "セミロング", "ロング" ] as const).map((label, i) => {
                  const keys = ["veryshort","short","bob","medium","semilong","long"];
                  const key = keys[i];
                  const sel = (prefAppearance.hair_lengths as string[] | undefined) ?? [];
                  const active = sel.includes(key);
                  return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.hair_lengths as string[] | undefined) ?? []; return { ...p, hair_lengths: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded border-none cursor-pointer" style={{ padding: "4px 8px", fontSize: 9, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
                })}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 10, color: "rgba(30,30,60,0.35)" }}>質感</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {([ { key: "tyokumou", label: "直毛" }, { key: "nami", label: "ゆる巻き" }, { key: "yuru", label: "ウェーブ" }, { key: "spiral", label: "カール" } ] as const).map(({ key, label }) => {
                  const sel = (prefAppearance.hair_textures as string[] | undefined) ?? [];
                  const active = sel.includes(key);
                  return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.hair_textures as string[] | undefined) ?? []; return { ...p, hair_textures: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded border-none cursor-pointer" style={{ padding: "4px 8px", fontSize: 9, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
                })}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 10, color: "rgba(30,30,60,0.35)" }}>シルエット</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {([ { key: "straight", label: "ストレート" }, { key: "layer", label: "レイヤー" }, { key: "wolf", label: "ウルフ" }, { key: "volume", label: "ボリューム" } ] as const).map(({ key, label }) => {
                  const sel = (prefAppearance.hair_silhouettes as string[] | undefined) ?? [];
                  const active = sel.includes(key);
                  return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.hair_silhouettes as string[] | undefined) ?? []; return { ...p, hair_silhouettes: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded border-none cursor-pointer" style={{ padding: "4px 8px", fontSize: 9, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
                })}
              </div>
            </div>
          </div>

          {/* 体型印象 */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>体型の好み</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {([ { key: "slim", label: "細身" }, { key: "average", label: "普通" }, { key: "athletic", label: "がっちり" }, { key: "curvy", label: "ふくよか" } ] as const).map(({ key, label }) => {
              const sel = (prefAppearance.body_builds as string[] | undefined) ?? [];
              const active = sel.includes(key);
              return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.body_builds as string[] | undefined) ?? []; return { ...p, body_builds: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded-lg border-none cursor-pointer transition-all" style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
            })}
          </div>

          {/* パーソナルカラー */}
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>パーソナルカラー</label>
          <div className="flex flex-wrap gap-1.5">
            {([ { key: "spring", label: "🌸 Spring" }, { key: "summer", label: "🌊 Summer" }, { key: "autumn", label: "🍂 Autumn" }, { key: "winter", label: "❄️ Winter" } ] as const).map(({ key, label }) => {
              const sel = (prefAppearance.personal_colors as string[] | undefined) ?? [];
              const active = sel.includes(key);
              return <button key={key} onClick={() => setPrefAppearance((p) => { const cur = (p.personal_colors as string[] | undefined) ?? []; return { ...p, personal_colors: active ? cur.filter((x) => x !== key) : [...cur, key] }; })} className="rounded-lg border-none cursor-pointer transition-all" style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#7C3AED" : "rgba(30,30,60,0.4)", border: `1px solid ${active ? "rgba(139,92,246,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
            })}
          </div>
        </Section>

        {/* Context openness */}
        <Section>
          <SectionLabel>接続文脈の開放度</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-4"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            各文脈をどの程度開きたいか — 重みが高いほど優先的にマッチングされます
          </p>
          <div className="flex flex-col gap-4">
            {ALL_CONTEXTS.map((ctx) => {
              const color = CONTEXT_COLORS[ctx];
              const value = settings.contextOpenness?.[ctx] ?? 50;
              return (
                <div key={ctx}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: color,
                          boxShadow: `0 0 6px ${color}44`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#1E1E3C",
                        }}
                      >
                        {CONTEXT_LABELS[ctx]}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: "rgba(30,30,60,0.35)",
                        }}
                      >
                        {CONTEXT_DESC[ctx]}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color,
                        fontFamily: "'JetBrains Mono','SF Mono',monospace",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: 6,
                      borderRadius: 3,
                      background: "rgba(30,30,60,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: "100%",
                        width: `${value}%`,
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${color}66, ${color})`,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) =>
                      setContextOpenness(ctx, Number(e.target.value))
                    }
                    style={{
                      width: "100%",
                      opacity: 0,
                      height: 20,
                      marginTop: -13,
                      cursor: "pointer",
                      position: "relative",
                      zIndex: 1,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Section>

        {/* Auto-standby threshold */}
        <Section>
          <SectionLabel>自動待機</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-3"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            一定時間操作がないとき、観測を一時休止して分身を保護します
          </p>
          <div className="flex flex-col gap-1.5">
            {STANDBY_OPTIONS.map((opt) => {
              const active =
                settings.autoStandbyThresholdHours === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      autoStandbyThresholdHours: opt.value,
                    }))
                  }
                  className="rounded-lg border-none cursor-pointer text-left transition-all"
                  style={{
                    padding: "10px 14px",
                    background: active
                      ? "rgba(251,191,36,0.08)"
                      : "rgba(255,255,255,0.5)",
                    color: active ? "#D97706" : "rgba(30,30,60,0.5)",
                    border: `1px solid ${
                      active
                        ? "rgba(251,191,36,0.18)"
                        : "rgba(30,30,60,0.06)"
                    }`,
                    boxShadow: active
                      ? "0 1px 4px rgba(251,191,36,0.1)"
                      : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {opt.label}
                    {opt.recommended && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: "#D97706",
                          background: "rgba(251,191,36,0.12)",
                          padding: "1px 6px",
                          borderRadius: 4,
                        }}
                      >
                        推奨
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      marginTop: 2,
                      opacity: 0.6,
                      fontWeight: 500,
                    }}
                  >
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Notification */}
        <Section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <SectionLabel>通知</SectionLabel>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgba(30,30,60,0.35)" }}
              >
                交差が見つかったとき、どう届けるか
              </p>
            </div>
            <ToggleSwitch
              checked={settings.notificationEnabled}
              onChange={() =>
                setSettings((p) => ({
                  ...p,
                  notificationEnabled: !p.notificationEnabled,
                }))
              }
              color="#6366F1"
            />
          </div>

          <label
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(30,30,60,0.45)",
              marginBottom: 6,
              marginTop: 8,
              display: "block",
            }}
          >
            余韻のテンポ
          </label>
          <div className="flex flex-col gap-1.5">
            {DELAY_MODES.map((mode) => {
              const active = settings.notificationDelayMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      notificationDelayMode: mode.value,
                    }))
                  }
                  className="rounded-lg border-none cursor-pointer text-left transition-all"
                  style={{
                    padding: "10px 14px",
                    background: active
                      ? "rgba(99,102,241,0.08)"
                      : "rgba(255,255,255,0.5)",
                    color: active ? "#6366F1" : "rgba(30,30,60,0.5)",
                    border: `1px solid ${
                      active
                        ? "rgba(99,102,241,0.18)"
                        : "rgba(30,30,60,0.06)"
                    }`,
                    boxShadow: active
                      ? "0 1px 4px rgba(99,102,241,0.1)"
                      : "none",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {mode.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      marginTop: 2,
                      opacity: 0.6,
                      fontWeight: 500,
                    }}
                  >
                    {mode.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* おやすみ時間 */}
          <div style={{ marginTop: 16 }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(30,30,60,0.45)",
                    display: "block",
                  }}
                >
                  おやすみ時間
                </label>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: "rgba(30,30,60,0.3)" }}
                >
                  通知を送らない時間帯を設定できます
                </p>
              </div>
              <ToggleSwitch
                checked={settings.quietHoursEnabled}
                onChange={() =>
                  setSettings((p) => ({
                    ...p,
                    quietHoursEnabled: !p.quietHoursEnabled,
                  }))
                }
                color="#6366F1"
              />
            </div>

            {settings.quietHoursEnabled && (
              <div
                className="flex items-center gap-3 mt-3 rounded-lg"
                style={{
                  padding: "10px 14px",
                  background: "rgba(99,102,241,0.04)",
                  border: "1px solid rgba(99,102,241,0.08)",
                }}
              >
                <div className="flex-1">
                  <label
                    className="block mb-1"
                    style={{ fontSize: 10, fontWeight: 600, color: "rgba(30,30,60,0.4)" }}
                  >
                    開始
                  </label>
                  <select
                    value={settings.quietHoursStart}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, quietHoursStart: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid rgba(30,30,60,0.08)",
                      background: "rgba(255,255,255,0.8)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#1E1E3C",
                      cursor: "pointer",
                      appearance: "none",
                      WebkitAppearance: "none",
                    }}
                  >
                    {QUIET_HOUR_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(30,30,60,0.25)",
                    marginTop: 16,
                  }}
                >
                  &#x2014;
                </span>
                <div className="flex-1">
                  <label
                    className="block mb-1"
                    style={{ fontSize: 10, fontWeight: 600, color: "rgba(30,30,60,0.4)" }}
                  >
                    終了
                  </label>
                  <select
                    value={settings.quietHoursEnd}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, quietHoursEnd: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid rgba(30,30,60,0.08)",
                      background: "rgba(255,255,255,0.8)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#1E1E3C",
                      cursor: "pointer",
                      appearance: "none",
                      WebkitAppearance: "none",
                    }}
                  >
                    {QUIET_HOUR_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Link to full appearance preferences editor */}
        <Section>
          <Link
            href="/rendezvous/settings/appearance"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(236,72,153,0.06))",
              border: "1px solid rgba(139,92,246,0.1)",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C" }}>
                外見の好みを編集
              </span>
              <span style={{ fontSize: 11, color: "rgba(30,30,60,0.45)", display: "block", marginTop: 2 }}>
                顔タイプ・骨格・パーソナルカラー・髪型
              </span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </Link>
        </Section>

        {/* Appearance preferences: face type + height */}
        <Section>
          <SectionLabel>惹かれる印象タイプ</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-3"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            自然と惹かれる雰囲気は？（相手には見えません）
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FACE_TYPE_ORDER.map((id) => {
              const t = FACE_TYPES[id];
              const active = preferredFaceTypes.has(id);
              return (
                <button
                  key={id}
                  onClick={() => {
                    setPreferredFaceTypes((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  className="rounded-xl border-none cursor-pointer text-left transition-all"
                  style={{
                    padding: "10px 12px",
                    background: active ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.6)",
                    color: active ? "#7C3AED" : "rgba(30,30,60,0.5)",
                    border: `1px solid ${active ? "rgba(139,92,246,0.2)" : "rgba(30,30,60,0.06)"}`,
                    boxShadow: active ? "0 1px 6px rgba(139,92,246,0.12)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{FACE_TYPE_EMOJI[id]}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{t.nameJa}</span>
                  </div>
                  <div style={{ fontSize: 9, marginTop: 3, opacity: 0.6, lineHeight: 1.4 }}>
                    {t.description}
                  </div>
                  {active && (
                    <div style={{ fontSize: 9, marginTop: 2, opacity: 0.45, lineHeight: 1.4 }}>
                      {t.detailedDescription}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {preferredFaceTypes.size > 0 && (
            <p className="text-center text-xs mt-2" style={{ color: "rgba(30,30,60,0.35)" }}>
              {preferredFaceTypes.size}タイプ選択中
            </p>
          )}
        </Section>

        <Section>
          <SectionLabel>身長の好み</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-3"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            こだわらない場合はそのままでOK（相手には見えません）
          </p>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={heightNoPreference}
              onChange={(e) => setHeightNoPreference(e.target.checked)}
              style={{ accentColor: "#6366F1" }}
            />
            <span style={{ fontSize: 12, color: "rgba(30,30,60,0.6)" }}>こだわらない</span>
          </label>
          {!heightNoPreference && (
            <div className="flex flex-col gap-3">
              <div>
                <label style={{ fontSize: 11, color: "rgba(30,30,60,0.45)", fontWeight: 600 }}>
                  最低: {heightMinCm}cm
                </label>
                <input
                  type="range"
                  min={140}
                  max={200}
                  value={heightMinCm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setHeightMinCm(v);
                    if (v > heightMaxCm) setHeightMaxCm(v);
                  }}
                  className="w-full"
                  style={{ accentColor: "#6366F1" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "rgba(30,30,60,0.45)", fontWeight: 600 }}>
                  最大: {heightMaxCm}cm
                </label>
                <input
                  type="range"
                  min={140}
                  max={200}
                  value={heightMaxCm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setHeightMaxCm(v);
                    if (v < heightMinCm) setHeightMinCm(v);
                  }}
                  className="w-full"
                  style={{ accentColor: "#6366F1" }}
                />
              </div>
              <p className="text-center text-sm" style={{ color: "rgba(30,30,60,0.5)", fontWeight: 600 }}>
                {heightMinCm}cm 〜 {heightMaxCm}cm
              </p>
            </div>
          )}
        </Section>

        {/* Public summaries */}
        <Section>
          <SectionLabel>分身の気配</SectionLabel>
          <p
            className="text-xs mt-0.5 mb-3"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            相手の分身が感じ取る、あなたの雰囲気
          </p>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(30,30,60,0.45)",
              marginBottom: 4,
              display: "block",
            }}
          >
            ムード
          </label>
          <input
            type="text"
            value={settings.publicMoodSummary}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                publicMoodSummary: e.target.value,
              }))
            }
            placeholder="例：穏やかに、でも深く"
            style={inputStyle}
          />
          <div style={{ height: 10 }} />
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(30,30,60,0.45)",
              marginBottom: 4,
              display: "block",
            }}
          >
            スタイル
          </label>
          <input
            type="text"
            value={settings.publicStyleSummary}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                publicStyleSummary: e.target.value,
              }))
            }
            placeholder="例：モノトーンと素材感が好き"
            style={inputStyle}
          />
        </Section>

        {/* ── 趣味・好きなこと ── */}
        <Section>
          <SectionLabel>趣味・好きなこと</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            選んだものが近い人とつながりやすくなります
          </p>
          <div className="flex flex-wrap gap-1.5">
            {HOBBY_TAGS.map(({ key, label, icon }) => {
              const active = hobbies.has(key);
              return (
                <button
                  key={key}
                  onClick={() => setHobbies((prev) => {
                    const next = new Set(prev);
                    if (active) next.delete(key); else next.add(key);
                    return next;
                  })}
                  className="rounded-lg border-none cursor-pointer transition-all"
                  style={{
                    padding: "6px 10px", fontSize: 11, fontWeight: 600,
                    background: active ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                    color: active ? "#6366F1" : "rgba(30,30,60,0.4)",
                    border: `1px solid ${active ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                  }}
                >
                  {icon} {label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── あなたのプロフィール（性別/生年月日/職業/学歴/居住地/喫煙/飲酒/言語） ── */}
        <Section>
          <SectionLabel>あなたのプロフィール</SectionLabel>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "rgba(30,30,60,0.35)" }}>
            マッチングに使用されます（相手にどこまで見せるかは今後設定可能に）
          </p>
          <div className="flex flex-col gap-3">
            {/* 性別 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>性別</label>
              <div className="flex gap-2">
                {([ { key: "male", label: "男性" }, { key: "female", label: "女性" } ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setSettings((p) => ({ ...p, gender: p.gender === key ? null : key }))} className="rounded-lg border-none cursor-pointer transition-all" style={{
                    padding: "8px 20px", fontSize: 12, fontWeight: 700,
                    background: settings.gender === key ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                    color: settings.gender === key ? "#6366F1" : "rgba(30,30,60,0.45)",
                    border: `1px solid ${settings.gender === key ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {/* 生年月日 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>生年月日</label>
              <input type="date" value={settings.dateOfBirth ?? ""} onChange={(e) => setSettings((p) => ({ ...p, dateOfBirth: e.target.value || null }))} style={inputStyle} />
            </div>
            {/* 居住地 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>居住地</label>
              <select value={settings.prefecture ?? ""} onChange={(e) => setSettings((p) => ({ ...p, prefecture: e.target.value || null }))} style={{ ...inputStyle, appearance: "auto" }}>
                <option value="">未設定</option>
                {["北海道","青森","岩手","宮城","秋田","山形","福島","茨城","栃木","群馬","埼玉","千葉","東京","神奈川","新潟","富山","石川","福井","山梨","長野","岐阜","静岡","愛知","三重","滋賀","京都","大阪","兵庫","奈良","和歌山","鳥取","島根","岡山","広島","山口","徳島","香川","愛媛","高知","福岡","佐賀","長崎","熊本","大分","宮崎","鹿児島","沖縄"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* 職業 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>職業カテゴリ</label>
              <select value={settings.occupationCategory ?? ""} onChange={(e) => setSettings((p) => ({ ...p, occupationCategory: e.target.value || null }))} style={{ ...inputStyle, appearance: "auto" }}>
                <option value="">未設定</option>
                {OCCUPATION_CATEGORIES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            {/* 学歴 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>最終学歴</label>
              <select value={settings.educationLevel ?? ""} onChange={(e) => setSettings((p) => ({ ...p, educationLevel: e.target.value || null }))} style={{ ...inputStyle, appearance: "auto" }}>
                <option value="">未設定</option>
                {EDUCATION_LEVELS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
            </div>
            {/* 喫煙 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>喫煙</label>
              <div className="flex gap-2">
                {([ { key: "non_smoker", label: "吸わない" }, { key: "sometimes", label: "たまに" }, { key: "smoker", label: "吸う" } ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setSettings((p) => ({ ...p, smoking: p.smoking === key ? null : key }))} className="rounded-lg border-none cursor-pointer" style={{
                    padding: "6px 14px", fontSize: 11, fontWeight: 600,
                    background: settings.smoking === key ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                    color: settings.smoking === key ? "#6366F1" : "rgba(30,30,60,0.45)",
                    border: `1px solid ${settings.smoking === key ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {/* 飲酒 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>飲酒</label>
              <div className="flex gap-2">
                {([ { key: "non_drinker", label: "飲まない" }, { key: "sometimes", label: "たまに" }, { key: "regular", label: "よく飲む" } ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setSettings((p) => ({ ...p, drinking: p.drinking === key ? null : key }))} className="rounded-lg border-none cursor-pointer" style={{
                    padding: "6px 14px", fontSize: 11, fontWeight: 600,
                    background: settings.drinking === key ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)",
                    color: settings.drinking === key ? "#6366F1" : "rgba(30,30,60,0.45)",
                    border: `1px solid ${settings.drinking === key ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {/* 話せる言語 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 4, display: "block" }}>話せる言語</label>
              <div className="flex flex-wrap gap-1.5">
                {([ { key: "japanese", label: "日本語" }, { key: "english", label: "English" }, { key: "chinese", label: "中文" }, { key: "korean", label: "한국어" }, { key: "spanish", label: "Español" }, { key: "french", label: "Français" } ] as const).map(({ key, label }) => {
                  const active = (settings.languages ?? []).includes(key);
                  return <button key={key} onClick={() => setSettings((p) => ({ ...p, languages: active ? (p.languages ?? []).filter((l) => l !== key) : [...p.languages, key] }))} className="rounded-lg border-none cursor-pointer" style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, background: active ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.5)", color: active ? "#6366F1" : "rgba(30,30,60,0.45)", border: `1px solid ${active ? "rgba(99,102,241,0.18)" : "rgba(30,30,60,0.06)"}` }}>{label}</button>;
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* Relationship Qualities — 理想の関係性 */}
        <RelationshipQualitySection
          enabledCategories={settings.enabledCategories}
        />

        {/* Sound settings */}
        <SoundSettingsSection />

        {/* Save button */}
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl border-none cursor-pointer text-sm font-bold transition-all"
          style={{
            padding: "14px 0",
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            color: "#fff",
            boxShadow: "0 2px 16px rgba(99,102,241,0.25)",
            opacity: saving ? 0.5 : 1,
            letterSpacing: 0.5,
          }}
        >
          {saving ? "保存中..." : "方針を保存"}
        </button>

        {/* Feedback */}
        {feedback && (
          <div
            className="text-center text-xs mt-3"
            style={{
              color: "rgba(30,30,60,0.6)",
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(99,102,241,0.06)",
            }}
          >
            {feedback}
          </div>
        )}
      </div>

      <style>{`
        @keyframes rv-settings-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

/* ---- Shared sub-components ---- */

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.65)",
        border: "1px solid rgba(99,102,241,0.06)",
        backdropFilter: "blur(4px)",
        boxShadow: "0 1px 3px rgba(99,102,241,0.04)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#1E1E3C",
      }}
    >
      {children}
    </span>
  );
}

function SoundSettingsSection() {
  const { settings: soundSettings, toggleEnabled, setVolume } = useSoundContext();

  return (
    <Section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <SectionLabel>サウンド</SectionLabel>
          <p
            className="text-xs mt-0.5"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            出会い・マッチの演出音
          </p>
        </div>
        <ToggleSwitch
          checked={soundSettings.enabled}
          onChange={toggleEnabled}
          color="#8B5CF6"
        />
      </div>
      {soundSettings.enabled && (
        <div className="mt-3">
          <label
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(30,30,60,0.45)",
              marginBottom: 8,
              display: "block",
            }}
          >
            音量: {Math.round(soundSettings.volume * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(soundSettings.volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="w-full"
            style={{ accentColor: "#8B5CF6" }}
          />
        </div>
      )}
    </Section>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  color,
}: {
  checked: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onChange}
      className="relative rounded-full cursor-pointer border-none transition-all"
      style={{
        width: 44,
        height: 24,
        background: checked ? color : "rgba(30,30,60,0.1)",
        flexShrink: 0,
      }}
    >
      <div
        className="absolute top-0.5 rounded-full transition-all"
        style={{
          width: 20,
          height: 20,
          background: "#fff",
          left: checked ? 22 : 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(30,30,60,0.08)",
  background: "rgba(255,255,255,0.7)",
  color: "#1E1E3C",
  fontSize: 13,
  outline: "none",
};

// ── 理想の関係性セクション ──

const QUALITY_DEFS = [
  { key: "intimacy", label: "親密さ", desc: "心を開ける近さ", icon: "💞", color: "#EC4899" },
  { key: "excitement", label: "ドキドキ", desc: "予想外の刺激", icon: "⚡", color: "#F59E0B" },
  { key: "independence", label: "自立", desc: "お互いの自由", icon: "🦅", color: "#10B981" },
  { key: "depth", label: "深さ", desc: "深い理解と対話", icon: "🌊", color: "#6366F1" },
  { key: "playfulness", label: "遊び心", desc: "一緒にふざけ合える", icon: "🎭", color: "#F97316" },
  { key: "growth", label: "成長", desc: "一緒に変わっていける", icon: "🌱", color: "#22C55E" },
] as const;

function RelationshipQualitySection({
  enabledCategories,
}: {
  enabledCategories: RendezvousCategory[];
}) {
  const [qualities, setQualities] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<string>("unknown");

  useEffect(() => {
    fetch("/api/stargazer/relationship-desires", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.qualities) {
          setQualities(d.qualities);
          setSource(d.source ?? "saved");
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = useCallback((key: string, value: number) => {
    setQualities((prev) => ({ ...(prev ?? {}), [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!qualities) return;
    setSaving(true);
    try {
      await fetch("/api/stargazer/relationship-desires", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualities,
          categories: enabledCategories.length > 0 ? enabledCategories : ["romantic"],
        }),
      });
      setSource("user");
    } finally {
      setSaving(false);
    }
  }, [qualities, enabledCategories]);

  if (!qualities) return null;

  return (
    <Section>
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <SectionLabel>理想の関係性</SectionLabel>
          {source === "stargazer_derived" && (
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4,
              background: "rgba(139,92,246,0.08)", color: "rgba(139,92,246,0.7)",
            }}>
              Stargazerから推定
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "rgba(30,30,60,0.35)" }}>
          相手との関係で何を大切にしたいか
        </p>
      </div>
      <div className="space-y-3">
        {QUALITY_DEFS.map(({ key, label, desc, icon, color }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(30,30,60,0.7)" }}>
                {icon} {label}
              </span>
              <span style={{ fontSize: 10, color: "rgba(30,30,60,0.35)" }}>
                {desc}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((qualities[key] ?? 0.5) * 100)}
              onChange={(e) => handleChange(key, Number(e.target.value) / 100)}
              className="w-full"
              style={{ accentColor: color }}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 w-full rounded-lg border-none cursor-pointer text-xs font-semibold"
        style={{
          padding: "8px 0",
          background: "rgba(99,102,241,0.08)",
          color: "#6366F1",
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? "保存中..." : "関係性の好みを保存"}
      </button>
    </Section>
  );
}
