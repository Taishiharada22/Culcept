"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

/**
 * ① DealbreakersStep — Rendezvous オンボーディング内の dealbreaker 収集
 *
 * romantic/partner カテゴリ選択時のみ表示。
 * romantic: 結婚意欲 + 子どもの希望（必須）
 * partner: 結婚意欲 + 子どもの希望 + ライフスタイル + 喫煙（全必須）
 */

export interface DealbreakersData {
  marriageIntent: string;
  childrenPreference: string;
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
  const [lifestyle, setLifestyle] = useState<number>(50); // 0=朝型, 100=夜型
  const [smokingStatus, setSmokingStatus] = useState<string | null>(null);
  const [smokingTolerance, setSmokingTolerance] = useState<string | null>(null);

  const canSubmit = (() => {
    if (!marriageIntent || !childrenPref) return false;
    if (isPartner && (!smokingStatus || !smokingTolerance)) return false;
    return true;
  })();

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !marriageIntent || !childrenPref) return;
    const data: DealbreakersData = {
      marriageIntent,
      childrenPreference: childrenPref,
    };
    if (isPartner) {
      data.lifestyleMorningNight = lifestyle;
      data.smokingStatus = smokingStatus ?? undefined;
      data.smokingTolerance = smokingTolerance ?? undefined;
    }
    onComplete(data);
  }, [canSubmit, marriageIntent, childrenPref, isPartner, lifestyle, smokingStatus, smokingTolerance, onComplete]);

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
