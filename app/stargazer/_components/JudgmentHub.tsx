// app/stargazer/_components/JudgmentHub.tsx
// Phase 7B-2: Stargazer — シミュレーションカード（恋愛 + 友人 + メッセージ）
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import JudgmentResultCard from "@/components/stargazer/JudgmentResultCard";
import type {
  JudgmentUseCase,
  JudgmentResult,
  RomanceMatchingJudgment,
  FriendMatchingJudgment,
  ConversationMessageJudgment,
  ConversationContext,
} from "@/types/stargazer";

// ─── Types ───

interface JudgmentHubProps {
  visible: boolean;
  observationCount?: number;
}

type PanelKey = "romance" | "friend" | "friends" | "conversation";

// ─── Simulation Card Definitions ───

const SIMULATIONS = [
  {
    id: "romance" as PanelKey,
    icon: "💕",
    title: "恋愛",
    subtitle: "シミュレーション",
    hook: "いま気になる人がいたら、\nあなたはどう動く？",
    detail: "アプローチ傾向を再現",
    accentColor: "#f472b6",
    accentBg: "rgba(244, 114, 182, 0.06)",
    accentBorder: "rgba(244, 114, 182, 0.15)",
  },
  {
    id: "friends" as PanelKey,
    icon: "🧩",
    title: "友人",
    subtitle: "シミュレーション",
    hook: "この人とは合う？\nその理由は？",
    detail: "相性のメカニズムを解析",
    accentColor: "#fbbf24",
    accentBg: "rgba(251, 191, 36, 0.06)",
    accentBorder: "rgba(251, 191, 36, 0.15)",
  },
  {
    id: "conversation" as PanelKey,
    icon: "💬",
    title: "メッセージ",
    subtitle: "シミュレーション",
    hook: "既読スルー？ 即レス？\nあなたの\"間\"の正体",
    detail: "タイミングと距離感を可視化",
    accentColor: "#60a5fa",
    accentBg: "rgba(96, 165, 250, 0.06)",
    accentBorder: "rgba(96, 165, 250, 0.15)",
  },
];

// ─── Option Definitions ───

const ROMANCE_STAGES = [
  { value: "new", label: "新しい出会い" },
  { value: "developing", label: "関係構築中" },
  { value: "established", label: "安定した関係" },
  { value: "considering", label: "考え中" },
] as const;

const FRIEND_STYLES = [
  { value: "active", label: "アクティブ" },
  { value: "chill", label: "まったり" },
  { value: "deep_talk", label: "深い話" },
  { value: "activity_based", label: "一緒に何かする" },
] as const;

const CONVERSATION_CONTEXTS: { value: ConversationContext; label: string }[] = [
  { value: "romance", label: "恋愛" },
  { value: "friend", label: "友達" },
  { value: "work", label: "仕事" },
  { value: "community", label: "コミュニティ" },
  { value: "casual", label: "カジュアル" },
];

const URGENCY_OPTIONS = [
  { value: "none", label: "急ぎでない" },
  { value: "moderate", label: "まあまあ急ぎ" },
  { value: "high", label: "急ぎ" },
] as const;

const EMOTIONAL_WEIGHT_OPTIONS = [
  { value: "light", label: "軽い" },
  { value: "moderate", label: "普通" },
  { value: "heavy", label: "重い" },
] as const;

// ─── Main Component ───

export default function JudgmentHub({ visible, observationCount }: JudgmentHubProps) {
  const [expandedPanel, setExpandedPanel] = React.useState<PanelKey | null>(null);

  if (!visible) return null;

  return (
    <div className="mt-12">
      {/* セクション見出し */}
      <div className="text-center mb-8">
        <h2 className="font-display text-xl font-semibold text-white/85">
          観測データで、試してみる
        </h2>
        <p className="font-body text-sm text-white/35 mt-1.5">
          {observationCount ? `${observationCount}件` : "あなた"}の観測から、場面をシミュレート
        </p>
      </div>

      {/* シミュレーションカードグリッド */}
      {!expandedPanel && (
        <div className="sm:grid sm:grid-cols-3 sm:gap-4 flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {SIMULATIONS.map((sim) => (
            <div key={sim.id} className="flex-shrink-0 w-[75vw] sm:w-auto snap-center">
              <SimulationCard
                {...sim}
                onClick={() => setExpandedPanel(sim.id === "friends" ? "friend" : sim.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* 展開パネル */}
      <AnimatePresence>
        {expandedPanel && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3 }}
          >
            <button
              onClick={() => setExpandedPanel(null)}
              className="mb-4 font-body text-sm text-white/40 hover:text-white/60 transition-colors flex items-center gap-1"
            >
              ← 戻る
            </button>
            {expandedPanel === "romance" && <RomancePanel />}
            {expandedPanel === "friend" && <FriendPanel />}
            {expandedPanel === "conversation" && <ConversationPanel />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Simulation Card ───

function SimulationCard({
  icon,
  title,
  subtitle,
  hook,
  detail,
  accentColor,
  accentBg,
  accentBorder,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  hook: string;
  detail: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center text-center rounded-2xl p-8 pb-6 overflow-hidden transition-all duration-300 hover:translate-y-[-3px] hover:shadow-xl hover:shadow-black/20 w-full"
      style={{
        background: accentBg,
        border: `1px solid ${accentBorder}`,
      }}
    >
      {/* 背景グロー（ホバー時に強まる） */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[150px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accentColor}20, transparent)` }}
      />

      {/* アイコン */}
      <span className="text-4xl mb-5 relative z-10 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </span>

      {/* タイトル */}
      <div className="relative z-10 mb-4">
        <h3 className="font-display text-lg font-semibold text-white/90">{title}</h3>
        <span
          className="text-[10px] font-body font-semibold tracking-[0.2em] uppercase"
          style={{ color: `${accentColor}99` }}
        >
          {subtitle}
        </span>
      </div>

      {/* フック */}
      <p className="relative z-10 font-body text-sm font-medium text-white/60 leading-relaxed whitespace-pre-line mb-4">
        {hook}
      </p>

      {/* 詳細ラベル */}
      <span className="relative z-10 font-body text-xs text-white/30 group-hover:text-white/50 transition-colors">
        {detail}
      </span>

      {/* 下部のアクセントライン */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] opacity-40 group-hover:opacity-80 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />
    </button>
  );
}

// ─── Shared API Hook ───

function useJudgmentApi<J extends JudgmentResult>(
  useCase: JudgmentUseCase,
): {
  judgment: J | null;
  loading: boolean;
  error: string | null;
  execute: (situation: Record<string, unknown>) => void;
} {
  const [judgment, setJudgment] = React.useState<J | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const execute = React.useCallback(
    async (situation: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      setJudgment(null);
      try {
        const res = await fetch("/api/stargazer/judgment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useCase, situation }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "シミュレーションを実行できませんでした");
          setLoading(false);
          return;
        }
        setJudgment(json.judgment as J);
      } catch {
        setError("通信エラーが発生しました");
      }
      setLoading(false);
    },
    [useCase],
  );

  return { judgment, loading, error, execute };
}

// ─── Context-colored Select ───

function ContextSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  accentColor,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  accentColor: string;
}) {
  return (
    <div className="space-y-3">
      <p className="font-body text-sm font-medium text-white/50">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all border"
              style={
                isSelected
                  ? {
                      background: `${accentColor}15`,
                      borderColor: `${accentColor}30`,
                      color: accentColor,
                    }
                  : {
                      background: "rgba(255,255,255,0.03)",
                      borderColor: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.5)",
                    }
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Execute Button (context-colored) ───

function ExecuteButton({
  loading,
  onClick,
  accentColor,
}: {
  loading: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full mt-4 py-3.5 rounded-xl font-body text-sm font-semibold disabled:opacity-50 transition-all duration-200"
      style={{
        background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
        border: `1px solid ${accentColor}20`,
        color: accentColor,
      }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
    >
      {loading ? "シミュレート中..." : "シミュレートする"}
    </motion.button>
  );
}

// ─── Error Display ───

function ErrorMsg({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      className="mt-2 text-xs text-center rounded-lg px-3 py-1.5"
      style={{ color: "rgba(248,113,113,0.8)", background: "rgba(248,113,113,0.06)" }}
    >
      {error}
    </p>
  );
}

// ─── Romance Panel ───

function RomancePanel() {
  const accentColor = "#f472b6";
  const [stage, setStage] = React.useState<
    "new" | "developing" | "established" | "considering"
  >("new");

  const { judgment, loading, error, execute } =
    useJudgmentApi<RomanceMatchingJudgment>("romance_matching");

  const handleExecute = React.useCallback(() => {
    execute({
      relationshipStage: stage,
      currentMood: "neutral",
    });
  }, [stage, execute]);

  return (
    <div className="card-instrument space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">💕</span>
        <h3 className="font-display text-lg font-semibold text-white/90">恋愛シミュレーション</h3>
      </div>

      <ContextSelect
        label="いまの状況は？"
        value={stage}
        options={ROMANCE_STAGES}
        onChange={setStage}
        accentColor={accentColor}
      />
      <ExecuteButton loading={loading} onClick={handleExecute} accentColor={accentColor} />
      <ErrorMsg error={error} />

      {judgment && (
        <div className="mt-4">
          <JudgmentResultCard
            title="恋愛マッチング"
            icon="💕"
            judgment={judgment}
            variant="dark"
          >
            <div className="space-y-3 mb-2">
              {judgment.attractionPoints.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-white/40 block mb-1.5">惹かれポイント</span>
                  <div className="flex flex-wrap gap-1.5">
                    {judgment.attractionPoints.map((p) => (
                      <span
                        key={p}
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium"
                        style={{ background: "rgba(244,114,182,0.08)", color: "rgba(244,114,182,0.7)", border: "1px solid rgba(244,114,182,0.1)" }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {judgment.misalignmentRisks.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-white/40 block mb-1.5">ズレやすい点</span>
                  <div className="flex flex-wrap gap-1.5">
                    {judgment.misalignmentRisks.map((r) => (
                      <span
                        key={r}
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium"
                        style={{ background: "rgba(251,191,36,0.08)", color: "rgba(251,191,36,0.7)", border: "1px solid rgba(251,191,36,0.1)" }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="rounded-lg border px-3 py-2"
                style={{ background: "rgba(244,114,182,0.04)", borderColor: "rgba(244,114,182,0.08)" }}
              >
                <span className="text-xs font-semibold text-white/40 block mb-0.5">進め方</span>
                <p className="text-sm text-white/50 leading-relaxed">{judgment.approachSuggestion}</p>
              </div>

              <div
                className="rounded-lg border px-3 py-2"
                style={{ background: "rgba(244,114,182,0.04)", borderColor: "rgba(244,114,182,0.08)" }}
              >
                <span className="text-xs font-semibold text-white/40 block mb-0.5">テンポ</span>
                <p className="text-sm text-white/50 leading-relaxed">{judgment.tempoAdvice}</p>
              </div>
            </div>
          </JudgmentResultCard>
        </div>
      )}
    </div>
  );
}

// ─── Friend Panel ───

function FriendPanel() {
  const accentColor = "#fbbf24";
  const [style, setStyle] = React.useState<
    "active" | "chill" | "deep_talk" | "activity_based"
  >("chill");

  const { judgment, loading, error, execute } =
    useJudgmentApi<FriendMatchingJudgment>("friend_matching");

  const handleExecute = React.useCallback(() => {
    execute({
      interactionStyle: style,
      currentMood: "neutral",
    });
  }, [style, execute]);

  return (
    <div className="card-instrument space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">🧩</span>
        <h3 className="font-display text-lg font-semibold text-white/90">友人シミュレーション</h3>
      </div>

      <ContextSelect
        label="遊び方タイプ"
        value={style}
        options={FRIEND_STYLES}
        onChange={setStyle}
        accentColor={accentColor}
      />
      <ExecuteButton loading={loading} onClick={handleExecute} accentColor={accentColor} />
      <ErrorMsg error={error} />

      {judgment && (
        <div className="mt-4">
          <JudgmentResultCard
            title="友人マッチング"
            icon="🧩"
            judgment={judgment}
            variant="dark"
          >
            <div className="space-y-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/40">仲良くなりやすさ</span>
                <span
                  className="text-sm font-semibold rounded-full px-3 py-0.5 border"
                  style={{ color: "rgba(251,191,36,0.8)", background: "rgba(251,191,36,0.06)", borderColor: "rgba(251,191,36,0.12)" }}
                >
                  {judgment.closenessLikelihood}
                </span>
              </div>

              <div
                className="rounded-lg border px-3 py-2"
                style={{ background: "rgba(251,191,36,0.04)", borderColor: "rgba(251,191,36,0.08)" }}
              >
                <span className="text-xs font-semibold text-white/40 block mb-0.5">関係スタイル</span>
                <p className="text-sm text-white/50 leading-relaxed">{judgment.relationshipStyle}</p>
              </div>

              {judgment.strengthPoints.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-white/40 block mb-1.5">噛み合うポイント</span>
                  <div className="flex flex-wrap gap-1.5">
                    {judgment.strengthPoints.map((p) => (
                      <span
                        key={p}
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium"
                        style={{ background: "rgba(251,191,36,0.08)", color: "rgba(251,191,36,0.7)", border: "1px solid rgba(251,191,36,0.1)" }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="rounded-lg border px-3 py-2"
                style={{ background: "rgba(251,191,36,0.04)", borderColor: "rgba(251,191,36,0.08)" }}
              >
                <span className="text-xs font-semibold text-white/40 block mb-0.5">距離の詰め方</span>
                <p className="text-sm text-white/50 leading-relaxed">{judgment.approachAdvice}</p>
              </div>
            </div>
          </JudgmentResultCard>
        </div>
      )}
    </div>
  );
}

// ─── Conversation Panel ───

function ConversationPanel() {
  const accentColor = "#60a5fa";
  const [context, setContext] = React.useState<ConversationContext>("casual");
  const [urgency, setUrgency] = React.useState<"none" | "moderate" | "high">("none");
  const [weight, setWeight] = React.useState<"light" | "moderate" | "heavy">("light");

  const { judgment, loading, error, execute } =
    useJudgmentApi<ConversationMessageJudgment>("conversation_message");

  const handleExecute = React.useCallback(() => {
    execute({
      conversationContext: context,
      urgency,
      emotionalWeight: weight,
      relationshipDepth: "developing",
    });
  }, [context, urgency, weight, execute]);

  const SEND_BADGE_STYLES: Record<string, { text: string; style: React.CSSProperties }> = {
    send_now: {
      text: "今すぐ送る",
      style: { color: "rgba(52,211,153,0.9)", background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.15)" },
    },
    wait: {
      text: "少し待つ",
      style: { color: "rgba(251,191,36,0.9)", background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.15)" },
    },
    send_later: {
      text: "後で送る",
      style: { color: "rgba(96,165,250,0.9)", background: "rgba(96,165,250,0.08)", borderColor: "rgba(96,165,250,0.15)" },
    },
  };

  return (
    <div className="card-instrument space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">💬</span>
        <h3 className="font-display text-lg font-semibold text-white/90">メッセージシミュレーション</h3>
      </div>

      <ContextSelect
        label="会話の場面"
        value={context}
        options={CONVERSATION_CONTEXTS}
        onChange={setContext}
        accentColor={accentColor}
      />
      <ContextSelect
        label="緊急度"
        value={urgency}
        options={URGENCY_OPTIONS}
        onChange={setUrgency}
        accentColor={accentColor}
      />
      <ContextSelect
        label="感情の重さ"
        value={weight}
        options={EMOTIONAL_WEIGHT_OPTIONS}
        onChange={setWeight}
        accentColor={accentColor}
      />
      <ExecuteButton loading={loading} onClick={handleExecute} accentColor={accentColor} />
      <ErrorMsg error={error} />

      {judgment && (
        <div className="mt-4">
          <JudgmentResultCard
            title="メッセージシミュレーション"
            icon="💬"
            judgment={judgment}
            variant="dark"
          >
            <div className="space-y-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/40">判定</span>
                <span
                  className="text-sm font-semibold rounded-full px-3 py-0.5 border"
                  style={SEND_BADGE_STYLES[judgment.sendOrWait]?.style ?? SEND_BADGE_STYLES.wait.style}
                >
                  {SEND_BADGE_STYLES[judgment.sendOrWait]?.text ?? judgment.sendOrWait}
                </span>
              </div>

              <p className="text-sm text-white/40 leading-relaxed">
                {judgment.sendOrWaitReason}
              </p>

              <div
                className="rounded-lg border px-3 py-2"
                style={{ background: "rgba(96,165,250,0.04)", borderColor: "rgba(96,165,250,0.08)" }}
              >
                <span className="text-xs font-semibold text-white/40 block mb-0.5">トーン</span>
                <p className="text-sm text-white/50 leading-relaxed">{judgment.toneDirection}</p>
              </div>

              <div
                className="rounded-lg border px-3 py-2"
                style={{ background: "rgba(96,165,250,0.04)", borderColor: "rgba(96,165,250,0.08)" }}
              >
                <span className="text-xs font-semibold text-white/40 block mb-0.5">返信方針</span>
                <p className="text-sm text-white/50 leading-relaxed">{judgment.replyPolicy}</p>
              </div>
            </div>
          </JudgmentResultCard>
        </div>
      )}
    </div>
  );
}
