"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

/**
 * ① DealbreakersStep — Rendezvous オンボーディング内の B baseline 収集
 *
 * romantic/partner カテゴリ選択時のみ表示。
 * 共通: 結婚意欲 + 子どもの希望 + 価値観(values) + 情熱(passions)
 * partner追加: ライフスタイル + 喫煙
 *
 * ※ values/passions は旧 ValuesOnboardingOverlay から移設。
 *   Home ツアー後ではなく、恋愛オンボーディング時に収集する。
 */

export interface DealbreakersData {
  marriageIntent: string;
  childrenPreference: string;
  values?: string[];
  passions?: string[];
  lifestyleMorningNight?: number;
  smokingStatus?: string;
  smokingTolerance?: string;
}

interface Props {
  enabledCategories: RendezvousCategory[];
  onComplete: (data: DealbreakersData) => void;
  saving?: boolean;
}

// ━━━━ Options ━━━━

const MARRIAGE_OPTIONS = [
  { value: "すぐにでも", label: "すぐにでも", icon: "💍" },
  { value: "2-3年以内", label: "2〜3年以内", icon: "📅" },
  { value: "いい人がいれば", label: "いい人がいれば", icon: "🌸" },
  { value: "考えていない", label: "今は考えていない", icon: "🌿" },
] as const;

const CHILDREN_OPTIONS = [
  { value: "ほしい", label: "ほしい", icon: "👶" },
  { value: "いらない", label: "いらない", icon: "🙅" },
  { value: "どちらでも", label: "どちらでも", icon: "🤔" },
] as const;

// ── B baseline: 価値観・情熱（恋愛オンボーディングで収集） ──
const VALUES_OPTIONS = [
  "誠実さ", "自由", "家族", "挑戦", "安定", "成長", "創造性", "思いやり",
  "独立", "正義", "信頼", "楽しさ", "感謝", "尊重", "努力", "好奇心",
  "責任感", "調和", "情熱", "優しさ", "勇気", "忍耐", "つながり", "美意識",
  "健康", "学び", "平和", "多様性", "自己表現", "貢献", "ユーモア", "素直さ",
];

const PASSIONS_OPTIONS = [
  "音楽", "映画・ドラマ", "読書", "旅行", "料理", "ゲーム", "スポーツ",
  "アート・デザイン", "写真・カメラ", "ファッション", "テクノロジー",
  "アウトドア・キャンプ", "カフェ巡り", "ヨガ・フィットネス", "ペット・動物",
  "アニメ・漫画", "ダンス", "DIY・ものづくり", "ガーデニング", "サウナ・温泉",
  "お酒・ワイン", "ボードゲーム", "ドライブ", "釣り", "登山・ハイキング",
  "ランニング・マラソン", "筋トレ", "美容・スキンケア", "推し活・アイドル",
  "語学・留学", "投資・資産運用", "ボランティア", "インテリア",
  "食べ歩き・グルメ", "サーフィン・マリンスポーツ", "スノーボード・スキー",
  "瞑想・マインドフルネス", "ポッドキャスト", "プログラミング", "歴史・文化",
];

const SMOKING_STATUS_OPTIONS = [
  { value: "non_smoker", label: "吸わない" },
  { value: "sometimes", label: "たまに吸う" },
  { value: "smoker", label: "吸う" },
] as const;

const SMOKING_TOLERANCE_OPTIONS = [
  { value: "no", label: "吸う人はNG" },
  { value: "sometimes_ok", label: "たまになら OK" },
  { value: "ok", label: "気にしない" },
] as const;

export default function DealbreakersStep({ enabledCategories, onComplete, saving }: Props) {
  const isPartner = enabledCategories.includes("partner");
  // romantic は結婚+子ども, partner はさらに喫煙+ライフスタイル

  const [marriageIntent, setMarriageIntent] = useState<string | null>(null);
  const [childrenPref, setChildrenPref] = useState<string | null>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [selectedPassions, setSelectedPassions] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<number>(50); // 0=朝型, 100=夜型
  const [smokingStatus, setSmokingStatus] = useState<string | null>(null);
  const [smokingTolerance, setSmokingTolerance] = useState<string | null>(null);

  const toggleValue = useCallback((v: string) => {
    setSelectedValues(prev =>
      prev.includes(v) ? prev.filter(x => x !== v)
        : prev.length >= 5 ? prev : [...prev, v]
    );
  }, []);

  const togglePassion = useCallback((v: string) => {
    setSelectedPassions(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  }, []);

  const canSubmit = (() => {
    if (!marriageIntent || !childrenPref) return false;
    if (selectedValues.length === 0) return false;
    if (isPartner && (!smokingStatus || !smokingTolerance)) return false;
    return true;
  })();

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !marriageIntent || !childrenPref) return;
    const data: DealbreakersData = {
      marriageIntent,
      childrenPreference: childrenPref,
      values: selectedValues.length > 0 ? selectedValues : undefined,
      passions: selectedPassions.length > 0 ? selectedPassions : undefined,
    };
    if (isPartner) {
      data.lifestyleMorningNight = lifestyle;
      data.smokingStatus = smokingStatus ?? undefined;
      data.smokingTolerance = smokingTolerance ?? undefined;
    }
    onComplete(data);
  }, [canSubmit, marriageIntent, childrenPref, selectedValues, selectedPassions, isPartner, lifestyle, smokingStatus, smokingTolerance, onComplete]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center px-4 pt-16 pb-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xl font-extrabold text-slate-800 mb-1">
            大切な条件を教えてください
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-8">
            {isPartner
              ? "パートナー探しで譲れない条件を設定します。マッチングの精度に直結します。"
              : "恋愛で大切にしている条件を教えてください。相性判定に使います。"}
          </p>
        </motion.div>

        {/* Marriage Intent */}
        <Section title="結婚への意向" delay={0.15}>
          <div className="grid grid-cols-2 gap-2">
            {MARRIAGE_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={marriageIntent === opt.value}
                onClick={() => setMarriageIntent(opt.value)}
                icon={opt.icon}
                label={opt.label}
              />
            ))}
          </div>
        </Section>

        {/* Children */}
        <Section title="子どもについて" delay={0.2}>
          <div className="grid grid-cols-3 gap-2">
            {CHILDREN_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={childrenPref === opt.value}
                onClick={() => setChildrenPref(opt.value)}
                icon={opt.icon}
                label={opt.label}
              />
            ))}
          </div>
        </Section>

        {/* Values — 恋愛で大切にしている価値観（B baseline） */}
        <Section title="人生で大切にしていること" delay={0.25}>
          <p className="text-[11px] text-slate-400 mb-2">
            1〜5つ選んでね（{selectedValues.length}/5）
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">
            {VALUES_OPTIONS.map((v) => {
              const sel = selectedValues.includes(v);
              const disabled = !sel && selectedValues.length >= 5;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => !disabled && toggleValue(v)}
                  className="py-1.5 px-3 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: sel
                      ? "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))"
                      : disabled ? "rgba(241,245,249,0.5)" : "rgba(241,245,249,0.8)",
                    border: sel
                      ? "1.5px solid rgba(139,92,246,0.4)"
                      : "1.5px solid rgba(226,232,240,0.6)",
                    color: sel ? "#6d28d9" : disabled ? "#cbd5e1" : "#64748b",
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? "default" : "pointer",
                  }}
                >
                  {sel && <span className="mr-0.5 text-[10px]">✓</span>}
                  {v}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Passions — 好きなこと（B baseline） */}
        <Section title="時間を忘れて夢中になれるもの" delay={0.3}>
          <p className="text-[11px] text-slate-400 mb-2">
            いくつでもOK（任意）
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">
            {PASSIONS_OPTIONS.map((p) => {
              const sel = selectedPassions.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePassion(p)}
                  className="py-1.5 px-3 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: sel
                      ? "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))"
                      : "rgba(241,245,249,0.8)",
                    border: sel
                      ? "1.5px solid rgba(139,92,246,0.4)"
                      : "1.5px solid rgba(226,232,240,0.6)",
                    color: sel ? "#6d28d9" : "#64748b",
                  }}
                >
                  {sel && <span className="mr-0.5 text-[10px]">✓</span>}
                  {p}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Partner-only fields */}
        {isPartner && (
          <>
            {/* Lifestyle */}
            <Section title="ライフスタイル" delay={0.25}>
              <div className="px-2">
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>朝型</span>
                  <span>夜型</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={lifestyle}
                  onChange={(e) => setLifestyle(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>
            </Section>

            {/* Smoking */}
            <Section title="喫煙" delay={0.3}>
              <p className="text-xs text-slate-400 mb-2">あなたの喫煙状況</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {SMOKING_STATUS_OPTIONS.map((opt) => (
                  <ChoiceButton
                    key={opt.value}
                    selected={smokingStatus === opt.value}
                    onClick={() => setSmokingStatus(opt.value)}
                    label={opt.label}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-400 mb-2">相手の喫煙について</p>
              <div className="grid grid-cols-3 gap-2">
                {SMOKING_TOLERANCE_OPTIONS.map((opt) => (
                  <ChoiceButton
                    key={opt.value}
                    selected={smokingTolerance === opt.value}
                    onClick={() => setSmokingTolerance(opt.value)}
                    label={opt.label}
                  />
                ))}
              </div>
            </Section>
          </>
        )}

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <button
            type="button"
            disabled={!canSubmit || saving}
            onClick={handleSubmit}
            className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm transition-all"
            style={{
              background: canSubmit
                ? "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)"
                : "rgba(148,163,184,0.3)",
              opacity: saving ? 0.5 : 1,
              boxShadow: canSubmit ? "0 4px 15px rgba(139,92,246,0.3)" : "none",
            }}
          >
            {saving ? "保存中..." : "完了"}
          </button>
        </motion.div>
      </div>
    </div>
  );
}

// ━━━━ Subcomponents ━━━━

function Section({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="mb-6"
    >
      <h3 className="text-sm font-bold text-slate-700 mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="py-3 px-3 rounded-xl text-sm font-bold transition-all"
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))"
          : "rgba(241,245,249,0.8)",
        border: selected
          ? "1.5px solid rgba(139,92,246,0.4)"
          : "1.5px solid rgba(226,232,240,0.6)",
        color: selected ? "#6d28d9" : "#64748b",
      }}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {label}
    </button>
  );
}
