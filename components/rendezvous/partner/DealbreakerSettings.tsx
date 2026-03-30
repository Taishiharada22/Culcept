"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RV_COLORS, RV_CATEGORY_COLORS, RvCard } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";

const PARTNER_COLOR = RV_CATEGORY_COLORS.partner;

type DealbreakerForm = {
  marriageIntent: string;
  childrenPreference: string;
  lifestyleMorningNight: number;
  smokingStatus: string;
  smokingTolerance: string;
  preferredPrefectures: string[];
  religion: string;
  religionImportance: string;
};

const INITIAL: DealbreakerForm = {
  marriageIntent: "",
  childrenPreference: "",
  lifestyleMorningNight: 50,
  smokingStatus: "",
  smokingTolerance: "",
  preferredPrefectures: [],
  religion: "",
  religionImportance: "",
};

const MARRIAGE_OPTIONS = [
  { value: "すぐにでも", label: "すぐにでも" },
  { value: "2-3年以内", label: "2〜3年以内" },
  { value: "いい人がいれば", label: "いい人がいれば" },
  { value: "考えていない", label: "まだ考えていない" },
];

const CHILDREN_OPTIONS = [
  { value: "欲しい", label: "欲しい" },
  { value: "いらない", label: "いらない" },
  { value: "相手に合わせる", label: "相手に合わせる" },
  { value: "未定", label: "まだ決めていない" },
];

const SMOKING_STATUS_OPTIONS = [
  { value: "吸わない", label: "吸わない" },
  { value: "たまに吸う", label: "たまに吸う" },
  { value: "毎日吸う", label: "毎日吸う" },
];

const SMOKING_TOLERANCE_OPTIONS = [
  { value: "絶対NG", label: "絶対NG" },
  { value: "たまにならOK", label: "たまにならOK" },
  { value: "気にしない", label: "気にしない" },
];

const RELIGION_OPTIONS = [
  { value: "なし", label: "なし" },
  { value: "仏教", label: "仏教" },
  { value: "キリスト教", label: "キリスト教" },
  { value: "イスラム教", label: "イスラム教" },
  { value: "神道", label: "神道" },
  { value: "その他", label: "その他" },
];

const RELIGION_IMPORTANCE_OPTIONS = [
  { value: "必須一致", label: "必須一致" },
  { value: "理解があればOK", label: "理解があればOK" },
  { value: "気にしない", label: "気にしない" },
];

const PREFECTURES = [
  "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島",
  "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野",
  "岐阜", "静岡", "愛知", "三重",
  "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山",
  "鳥取", "島根", "岡山", "広島", "山口",
  "徳島", "香川", "愛媛", "高知",
  "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄",
];

/**
 * Dealbreaker 設定画面（Partner 枠用 6項目）
 */
export default function DealbreakerSettings() {
  const [form, setForm] = useState<DealbreakerForm>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/rendezvous/settings");
        if (!res.ok) return;
        const data = await res.json();
        const pd = data?.profile?.profile_details ?? {};
        setForm({
          marriageIntent: pd.marriageIntent ?? "",
          childrenPreference: pd.childrenPreference ?? "",
          lifestyleMorningNight: pd.lifestyleMorningNight ?? 50,
          smokingStatus: pd.smokingStatus ?? "",
          smokingTolerance: pd.smokingTolerance ?? "",
          preferredPrefectures: pd.preferredPrefectures ?? [],
          religion: pd.religion ?? "",
          religionImportance: pd.religionImportance ?? "",
        });
      } catch (err) {
        console.error("[Dealbreaker] load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/rendezvous/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_details: {
            marriageIntent: form.marriageIntent,
            childrenPreference: form.childrenPreference,
            lifestyleMorningNight: form.lifestyleMorningNight,
            smokingStatus: form.smokingStatus,
            smokingTolerance: form.smokingTolerance,
            preferredPrefectures: form.preferredPrefectures,
            religion: form.religion,
            religionImportance: form.religionImportance,
          },
        }),
      });
      if (res.ok) setSaved(true);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const filledCount = [
    form.marriageIntent,
    form.childrenPreference,
    form.smokingStatus,
    form.smokingTolerance,
    form.religionImportance,
    form.preferredPrefectures.length > 0 ? "set" : "",
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: RV_COLORS.textMuted }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 160px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "16px 0", marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: RV_COLORS.text, marginBottom: 4 }}>
          絶対条件の設定
        </h2>
        <p style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.6 }}>
          ここで設定した条件に合わない相手は、候補に表示されません。
          慎重に設定してください。
        </p>
        <div style={{ marginTop: 8, fontSize: 11, color: PARTNER_COLOR, fontWeight: 600 }}>
          {filledCount} / 6 項目設定済み
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 1. 結婚意向 */}
        <FadeInView delay={0.05}>
          <OptionGroup
            label="結婚への意向"
            sublabel="お相手も同じ温度感の方をお探しです"
            value={form.marriageIntent}
            options={MARRIAGE_OPTIONS}
            onChange={(v) => setForm({ ...form, marriageIntent: v })}
          />
        </FadeInView>

        {/* 2. 子ども */}
        <FadeInView delay={0.1}>
          <OptionGroup
            label="子どもについて"
            sublabel="この設問は妥協が難しいため、正直にお答えください"
            value={form.childrenPreference}
            options={CHILDREN_OPTIONS}
            onChange={(v) => setForm({ ...form, childrenPreference: v })}
          />
        </FadeInView>

        {/* 3. 喫煙 */}
        <FadeInView delay={0.15}>
          <OptionGroup
            label="あなたの喫煙状況"
            value={form.smokingStatus}
            options={SMOKING_STATUS_OPTIONS}
            onChange={(v) => setForm({ ...form, smokingStatus: v })}
          />
        </FadeInView>

        {/* 4. 喫煙許容度 */}
        <FadeInView delay={0.2}>
          <OptionGroup
            label="お相手の喫煙について"
            value={form.smokingTolerance}
            options={SMOKING_TOLERANCE_OPTIONS}
            onChange={(v) => setForm({ ...form, smokingTolerance: v })}
          />
        </FadeInView>

        {/* 5. 居住地域 */}
        <FadeInView delay={0.25}>
          <RvCard>
            <div style={{ padding: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: RV_COLORS.text, marginBottom: 4 }}>
                希望エリア
              </h4>
              <p style={{ fontSize: 11, color: RV_COLORS.textSub, marginBottom: 12 }}>
                お住まいの地域に近い方が表示されやすくなります（複数選択可）
              </p>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxHeight: 160,
                overflowY: "auto",
              }}>
                {PREFECTURES.map((pref) => {
                  const selected = form.preferredPrefectures.includes(pref);
                  return (
                    <button
                      key={pref}
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          preferredPrefectures: selected
                            ? prev.preferredPrefectures.filter((p) => p !== pref)
                            : [...prev.preferredPrefectures, pref],
                        }));
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 12,
                        border: `1px solid ${selected ? PARTNER_COLOR : RV_COLORS.border}`,
                        background: selected ? `${PARTNER_COLOR}15` : "transparent",
                        color: selected ? PARTNER_COLOR : RV_COLORS.textSub,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {pref}
                    </button>
                  );
                })}
              </div>
              {form.preferredPrefectures.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: PARTNER_COLOR }}>
                  選択中: {form.preferredPrefectures.join("・")}
                </div>
              )}
            </div>
          </RvCard>
        </FadeInView>

        {/* 6. 宗教 */}
        <FadeInView delay={0.3}>
          <OptionGroup
            label="宗教・信条"
            value={form.religion}
            options={RELIGION_OPTIONS}
            onChange={(v) => setForm({ ...form, religion: v })}
          />
        </FadeInView>

        {/* 6b. 宗教の重要度 */}
        <FadeInView delay={0.35}>
          <OptionGroup
            label="宗教の一致について"
            sublabel="「必須一致」の場合、異なる宗教の方は候補に表示されません"
            value={form.religionImportance}
            options={RELIGION_IMPORTANCE_OPTIONS}
            onChange={(v) => setForm({ ...form, religionImportance: v })}
          />
        </FadeInView>
      </div>

      {/* Save button — above BottomNav (z-80, h-60px) */}
      <div style={{
        position: "fixed",
        bottom: "calc(60px + env(safe-area-inset-bottom))",
        left: 0,
        right: 0,
        padding: "12px 16px",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        borderTop: `1px solid ${RV_COLORS.border}`,
        zIndex: 81,
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%",
              padding: "14px 0",
              borderRadius: 12,
              border: "none",
              background: PARTNER_COLOR,
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "保存中..." : saved ? "✓ 保存しました" : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OptionGroup ──

function OptionGroup({
  label,
  sublabel,
  value,
  options,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <RvCard>
      <div style={{ padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: RV_COLORS.text, marginBottom: sublabel ? 2 : 12 }}>
          {label}
        </h4>
        {sublabel && (
          <p style={{ fontSize: 11, color: RV_COLORS.textSub, marginBottom: 12, lineHeight: 1.5 }}>
            {sublabel}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map((opt) => {
            const selected = value === opt.value;
            return (
              <motion.button
                key={opt.value}
                whileTap={{ scale: 0.95 }}
                onClick={() => onChange(opt.value)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  border: `1.5px solid ${selected ? PARTNER_COLOR : RV_COLORS.border}`,
                  background: selected ? `${PARTNER_COLOR}12` : "transparent",
                  color: selected ? PARTNER_COLOR : RV_COLORS.textSub,
                  fontSize: 13,
                  fontWeight: selected ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {opt.label}
              </motion.button>
            );
          })}
        </div>
      </div>
    </RvCard>
  );
}
