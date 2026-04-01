"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Phase 0: 既知ペア検証UI
//
// デザイン: Rendezvous ライトウォーム大気に統合
// AtmosphereProvider のCSS変数（--rv-*）を使用
//
// 4ブロック構成:
//   1. 1文ナラティブ（最上段・核心）
//   2. 共鳴する点（2〜3つ）
//   3. まだ見えていない点（1つ）
//   4. 振り返りフィードバック入力
// ============================================================

type DataUsed = {
  stargazerAxes: { self: number; partner: number };
  attachment: { self: string; partner: string };
  personality: { self: boolean; partner: boolean };
  origin: { self: number; partner: number };
  archetype: { self: string | null; partner: string | null };
  alterJudgments: { self: number; partner: number };
  contradictions: { self: number; partner: number };
  personMap: { self: number; partner: number };
};

type InsightData = {
  narrative: string;
  resonancePoints: Array<{ label: string; description: string }>;
  unobservedPoint: { label: string; description: string } | null;
  confidence: number;
  bestCategory: string | null;
  overallScore: number | null;
  usedLLM: boolean;
  dataUsed?: DataUsed;
  pairKey: string;
  _snapshot: Record<string, unknown>;
};

type FeedbackScores = {
  accuracyScore: number;
  discoveryScore: number;
  actionIntentScore: number;
  nonDestructiveScore: number;
  revisitScore: number;
  narrativeScore: number;
  resonanceScore: number;
  unobservedScore: number;
  freeText: string;
};

// 既知ペアのメールアドレス（Phase 0 固定）
const KNOWN_PAIRS: Record<string, string> = {
  "th6193aish@outlook.com": "zawane0903@gmail.com",
  "th7328aish@outlook.com": "zawane0903@gmail.com",
  "zawane0903@gmail.com": "th7328aish@outlook.com",
};

export default function Phase0Client({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "followup" | "idle" | "insight" | "done"
  >("loading");
  const [partnerInput, setPartnerInput] = useState(
    KNOWN_PAIRS[userEmail] ?? "",
  );
  // フォローアップ状態
  const [followup, setFollowup] = useState<{
    feedbackId: string;
    originalNarrative: string | null;
    daysSince: number;
  } | null>(null);
  const [followupAnswers, setFollowupAnswers] = useState({
    changeHappened: null as boolean | null,
    followupText: "",
  });

  // ページ読み込み時にフォローアップが必要か確認
  useEffect(() => {
    async function checkFollowup() {
      try {
        const res = await fetch("/api/rendezvous/phase0/followup");
        const data = await res.json();
        if (data.needsFollowup) {
          setFollowup({
            feedbackId: data.feedbackId,
            originalNarrative: data.originalNarrative,
            daysSince: data.daysSince,
          });
          setPhase("followup");
        } else {
          setPhase("idle");
        }
      } catch {
        setPhase("idle");
      }
    }
    checkFollowup();
  }, []);
  const [scores, setScores] = useState<FeedbackScores>({
    accuracyScore: 0,
    discoveryScore: 0,
    actionIntentScore: 0,
    nonDestructiveScore: 0,
    revisitScore: 0,
    narrativeScore: 0,
    resonanceScore: 0,
    unobservedScore: 0,
    freeText: "",
  });

  const partnerEmail = partnerInput.trim();

  async function submitFollowup() {
    if (!followup) return;
    setLoading(true);
    try {
      await fetch("/api/rendezvous/phase0/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackId: followup.feedbackId,
          changeHappened: followupAnswers.changeHappened,
          followupText: followupAnswers.followupText,
        }),
      });
      setPhase("idle");
    } catch {
      setError("送信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function fetchInsight() {
    if (!partnerEmail) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/rendezvous/phase0/insights?partnerEmail=${encodeURIComponent(partnerEmail)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        const detail =
          data.selfAxisCount !== undefined
            ? `\n(self: ${data.selfAxisCount}軸, partner: ${data.partnerAxisCount}軸)`
            : "";
        setError((data.message ?? data.error ?? "エラーが発生しました") + detail);
        return;
      }
      setInsight(data);
      setPhase("insight");
    } catch {
      setError("接続に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (!insight) return;
    setLoading(true);

    try {
      await fetch("/api/rendezvous/phase0/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairKey: insight.pairKey,
          ...scores,
          insightSnapshot: {
            narrative: insight.narrative,
            resonancePoints: insight.resonancePoints,
            unobservedPoint: insight.unobservedPoint,
            confidence: insight.confidence,
            ...insight._snapshot,
          },
        }),
      });
      setPhase("done");
    } catch {
      setError("送信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="space-y-6">
        {/* ヘッダー */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p
            className="text-[10px] tracking-[3px] uppercase"
            style={{ color: "var(--rv-text-secondary, #A8A0B8)" }}
          >
            Phase 0 — 関係性観測
          </p>
          <h1
            className="mt-2 text-xl font-light"
            style={{ color: "var(--rv-text-primary, #2D2438)" }}
          >
            2人の間に、何が見えるか
          </h1>
        </motion.div>

        {/* Loading */}
        {phase === "loading" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="py-8 text-center">
              <p style={{ color: "var(--rv-text-secondary, #8A829A)" }} className="text-sm">
                読み込み中...
              </p>
            </Card>
          </motion.div>
        )}

        {/* Followup: 2週間後の追跡 */}
        {phase === "followup" && followup && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <SectionLabel>2週間後の振り返り</SectionLabel>
              <p
                className="mt-3 text-sm leading-relaxed"
                style={{ color: "var(--rv-text-primary, #2D2438)" }}
              >
                {followup.daysSince}日前に観測した関係性インサイトについて、その後の変化を教えてください。
              </p>
              {followup.originalNarrative && (
                <div
                  className="mt-3 rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.5)",
                    border: "1px solid var(--rv-card-border, rgba(26,16,37,0.06))",
                  }}
                >
                  <p className="text-xs" style={{ color: "var(--rv-text-secondary, #A8A0B8)" }}>
                    前回の観測結果
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--rv-text-primary, #2D2438)" }}>
                    {followup.originalNarrative}
                  </p>
                </div>
              )}

              <div className="mt-5 space-y-4">
                <div>
                  <p className="mb-2 text-sm" style={{ color: "var(--rv-text-secondary, #8A829A)" }}>
                    この観測の後、相手との関係に何か変化がありましたか？
                  </p>
                  <div className="flex gap-2">
                    {[
                      { value: true, label: "変化があった" },
                      { value: false, label: "特になかった" },
                    ].map((opt) => (
                      <button
                        key={String(opt.value)}
                        onClick={() =>
                          setFollowupAnswers((s) => ({ ...s, changeHappened: opt.value }))
                        }
                        className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all"
                        style={{
                          background:
                            followupAnswers.changeHappened === opt.value
                              ? "var(--rv-accent, #C2185B)"
                              : "rgba(255,255,255,0.6)",
                          color:
                            followupAnswers.changeHappened === opt.value
                              ? "#fff"
                              : "var(--rv-text-secondary, #8A829A)",
                          border:
                            followupAnswers.changeHappened === opt.value
                              ? "1px solid transparent"
                              : "1px solid var(--rv-card-border, rgba(26,16,37,0.08))",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm" style={{ color: "var(--rv-text-secondary, #8A829A)" }}>
                    どんな変化がありましたか？（自由記述）
                  </p>
                  <textarea
                    value={followupAnswers.followupText}
                    onChange={(e) =>
                      setFollowupAnswers((s) => ({ ...s, followupText: e.target.value }))
                    }
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                    style={{
                      borderColor: "var(--rv-card-border, rgba(26,16,37,0.08))",
                      background: "rgba(255,255,255,0.6)",
                      color: "var(--rv-text-primary, #2D2438)",
                    }}
                    placeholder="何でも書いてください..."
                    rows={3}
                  />
                </div>

                <button
                  onClick={submitFollowup}
                  disabled={loading || followupAnswers.changeHappened === null}
                  className="w-full rounded-xl py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  style={{ background: "var(--rv-accent, #C2185B)" }}
                >
                  {loading ? "送信中..." : "送信する"}
                </button>

                <button
                  onClick={() => setPhase("idle")}
                  className="w-full py-2 text-xs"
                  style={{ color: "var(--rv-text-secondary, #A8A0B8)" }}
                >
                  あとで回答する
                </button>
              </div>
              {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}
            </Card>
          </motion.div>
        )}

        {/* Idle: 開始 */}
        {phase === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card>
              <p
                className="mb-4 text-center text-sm"
                style={{ color: "var(--rv-text-secondary, #8A829A)" }}
              >
                既知の相手との間にある関係性を、Stargazerのデータから照らします。
              </p>
              <div className="mb-4">
                <p
                  className="mb-2 text-xs"
                  style={{ color: "var(--rv-text-secondary, #8A829A)" }}
                >
                  相手のメールアドレス
                </p>
                <input
                  type="email"
                  value={partnerInput}
                  onChange={(e) => setPartnerInput(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--rv-accent)]"
                  style={{
                    borderColor: "var(--rv-card-border, rgba(26,16,37,0.08))",
                    background: "rgba(255,255,255,0.6)",
                    color: "var(--rv-text-primary, #2D2438)",
                  }}
                  placeholder="partner@example.com"
                />
              </div>
              <button
                onClick={fetchInsight}
                disabled={loading || !partnerEmail}
                className="w-full rounded-xl py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                style={{ background: "var(--rv-accent, #C2185B)" }}
              >
                {loading ? "観測中..." : "観測を開始する"}
              </button>
              {error && (
                <p className="mt-3 whitespace-pre-line text-center text-sm text-red-500">
                  {error}
                </p>
              )}
            </Card>
          </motion.div>
        )}

        {/* Insight: インサイト表示 */}
        <AnimatePresence>
          {phase === "insight" && insight && (
            <>
              {/* Block 1: 1文ナラティブ */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card>
                  <SectionLabel>2人の間で起きやすいこと</SectionLabel>
                  <p
                    className="mt-3 text-lg font-light leading-relaxed"
                    style={{ color: "var(--rv-text-primary, #2D2438)" }}
                  >
                    {insight.narrative}
                  </p>
                  <div className="mt-5">
                    <ScoreInput
                      label="この観測は当たっていますか？"
                      value={scores.narrativeScore}
                      onChange={(v) =>
                        setScores((s) => ({ ...s, narrativeScore: v }))
                      }
                    />
                  </div>
                </Card>
              </motion.div>

              {/* Block 2: 共鳴する点 */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card>
                  <SectionLabel>共鳴する点</SectionLabel>
                  <div className="mt-3 space-y-3">
                    {insight.resonancePoints.map((point, i) => (
                      <div
                        key={i}
                        className="rounded-xl p-4"
                        style={{
                          background: "rgba(255,255,255,0.5)",
                          border:
                            "1px solid var(--rv-card-border, rgba(26,16,37,0.06))",
                        }}
                      >
                        <p
                          className="text-sm font-medium"
                          style={{
                            color: "var(--rv-text-primary, #2D2438)",
                          }}
                        >
                          {point.label}
                        </p>
                        <p
                          className="mt-1 text-xs leading-relaxed"
                          style={{
                            color: "var(--rv-text-secondary, #8A829A)",
                          }}
                        >
                          {point.description}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5">
                    <ScoreInput
                      label="これらは当たっていますか？"
                      value={scores.resonanceScore}
                      onChange={(v) =>
                        setScores((s) => ({ ...s, resonanceScore: v }))
                      }
                    />
                  </div>
                </Card>
              </motion.div>

              {/* Block 3: まだ見えていない点 */}
              {insight.unobservedPoint && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Card>
                    <SectionLabel>まだ見えていない点</SectionLabel>
                    <div
                      className="mt-3 rounded-xl p-4"
                      style={{
                        background: "rgba(255,255,255,0.5)",
                        border:
                          "1px solid var(--rv-card-border, rgba(26,16,37,0.06))",
                      }}
                    >
                      <p
                        className="text-sm font-medium"
                        style={{
                          color: "var(--rv-text-primary, #2D2438)",
                        }}
                      >
                        {insight.unobservedPoint.label}
                      </p>
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{
                          color: "var(--rv-text-secondary, #8A829A)",
                        }}
                      >
                        {insight.unobservedPoint.description}
                      </p>
                    </div>
                    <div className="mt-5">
                      <ScoreInput
                        label="この指摘は納得できますか？"
                        value={scores.unobservedScore}
                        onChange={(v) =>
                          setScores((s) => ({ ...s, unobservedScore: v }))
                        }
                      />
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Block 4: 振り返り */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                <Card>
                  <SectionLabel>振り返り</SectionLabel>
                  <div className="mt-4 space-y-5">
                    <ScoreInput
                      label="全体として、当たっている感覚がありますか？"
                      value={scores.accuracyScore}
                      onChange={(v) =>
                        setScores((s) => ({ ...s, accuracyScore: v }))
                      }
                    />
                    <ScoreInput
                      label="知らなかった発見がありましたか？"
                      value={scores.discoveryScore}
                      onChange={(v) =>
                        setScores((s) => ({ ...s, discoveryScore: v }))
                      }
                    />
                    <ScoreInput
                      label="この後、相手と何か話したくなりましたか？"
                      value={scores.actionIntentScore}
                      onChange={(v) =>
                        setScores((s) => ({ ...s, actionIntentScore: v }))
                      }
                    />
                    <ScoreInput
                      label="この分析で、関係が硬くなった感じはありますか？"
                      value={scores.nonDestructiveScore}
                      onChange={(v) =>
                        setScores((s) => ({
                          ...s,
                          nonDestructiveScore: v,
                        }))
                      }
                      invert
                    />
                    <ScoreInput
                      label="別の相手でも見てみたいですか？"
                      value={scores.revisitScore}
                      onChange={(v) =>
                        setScores((s) => ({ ...s, revisitScore: v }))
                      }
                    />
                    <div>
                      <p
                        className="mb-2 text-sm"
                        style={{
                          color: "var(--rv-text-secondary, #8A829A)",
                        }}
                      >
                        自由に感じたこと
                      </p>
                      <textarea
                        value={scores.freeText}
                        onChange={(e) =>
                          setScores((s) => ({
                            ...s,
                            freeText: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--rv-accent)]"
                        style={{
                          borderColor:
                            "var(--rv-card-border, rgba(26,16,37,0.08))",
                          background: "rgba(255,255,255,0.6)",
                          color: "var(--rv-text-primary, #2D2438)",
                        }}
                        placeholder="何でも書いてください..."
                        rows={3}
                      />
                    </div>
                  </div>

                  {/* 使用データ一覧 */}
                  {insight.dataUsed && (
                    <div className="mt-5">
                      <p
                        className="mb-2 text-[10px] font-semibold tracking-[2px] uppercase"
                        style={{ color: "var(--rv-text-secondary, #A8A0B8)" }}
                      >
                        使用データ
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <DataBadge label={`Stargazer ${insight.dataUsed.stargazerAxes.self}軸`} active={insight.dataUsed.stargazerAxes.self > 0} />
                        <DataBadge label={`愛着: ${insight.dataUsed.attachment.self}`} active />
                        <DataBadge label="パーソナリティ12軸" active={insight.dataUsed.personality.self} />
                        <DataBadge label={`Origin ${insight.dataUsed.origin.self}件`} active={insight.dataUsed.origin.self > 0} />
                        <DataBadge label={`Alter判断 ${insight.dataUsed.alterJudgments.self}件`} active={insight.dataUsed.alterJudgments.self > 0} />
                        <DataBadge label={`二面性 ${insight.dataUsed.contradictions.self}軸`} active={insight.dataUsed.contradictions.self > 0} />
                        <DataBadge label={`対人関係 ${insight.dataUsed.personMap.self}人`} active={insight.dataUsed.personMap.self > 0} />
                      </div>
                    </div>
                  )}

                  {/* Confidence バッジ */}
                  <div className="mt-5 flex items-center gap-3">
                    <span
                      className="text-xs"
                      style={{
                        color: "var(--rv-text-secondary, #A8A0B8)",
                      }}
                    >
                      データ充足度
                    </span>
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ background: "rgba(26,16,37,0.06)" }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: "var(--rv-accent, #C2185B)",
                          opacity: 0.6,
                        }}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${insight.confidence}%`,
                        }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: "var(--rv-text-primary, #2D2438)",
                      }}
                    >
                      {insight.confidence}%
                    </span>
                  </div>

                  <button
                    onClick={submitFeedback}
                    disabled={loading}
                    className="mt-6 w-full rounded-xl py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                    style={{ background: "var(--rv-accent, #C2185B)" }}
                  >
                    {loading ? "送信中..." : "フィードバックを送信"}
                  </button>
                  {error && (
                    <p className="mt-3 text-center text-sm text-red-500">
                      {error}
                    </p>
                  )}
                </Card>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Done */}
        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="text-center">
              <p
                className="text-lg font-light"
                style={{ color: "var(--rv-text-primary, #2D2438)" }}
              >
                ありがとうございます
              </p>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--rv-text-secondary, #8A829A)" }}
              >
                フィードバックを受け取りました。
                <br />
                2週間後にこのページを開くと、
                <br />
                関係に変化があったかをお聞きします。
              </p>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 共通コンポーネント
// ============================================================

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-6 ${className}`}
      style={{
        background: "var(--rv-card-bg, rgba(255,255,255,0.82))",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--rv-card-border, rgba(26,16,37,0.06))",
        boxShadow: "0 2px 12px rgba(26,16,37,0.04)",
      }}
    >
      {children}
    </div>
  );
}

function DataBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="rounded-lg px-2 py-1 text-[10px]"
      style={{
        background: active ? "rgba(194,24,91,0.08)" : "rgba(26,16,37,0.03)",
        color: active
          ? "var(--rv-accent, #C2185B)"
          : "var(--rv-text-secondary, #C0B8D0)",
        border: active
          ? "1px solid rgba(194,24,91,0.15)"
          : "1px solid rgba(26,16,37,0.04)",
      }}
    >
      {active ? "✓ " : "– "}{label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-semibold tracking-[2px] uppercase"
      style={{ color: "var(--rv-accent, #C2185B)", opacity: 0.7 }}
    >
      {children}
    </p>
  );
}

const SCORE_LABELS_POSITIVE = [
  "",
  "全然違う",
  "あまり",
  "普通",
  "近い",
  "まさに",
];
const SCORE_LABELS_INVERTED = [
  "",
  "全くない",
  "少し",
  "普通",
  "やや感じる",
  "強く感じる",
];

function ScoreInput({
  label,
  value,
  onChange,
  invert = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  invert?: boolean;
}) {
  const labels = invert ? SCORE_LABELS_INVERTED : SCORE_LABELS_POSITIVE;

  return (
    <div>
      <p
        className="mb-2.5 text-sm"
        style={{ color: "var(--rv-text-secondary, #8A829A)" }}
      >
        {label}
      </p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="flex-1 rounded-xl py-2 text-xs font-medium transition-all"
            style={{
              background:
                value === n
                  ? "var(--rv-accent, #C2185B)"
                  : "rgba(255,255,255,0.6)",
              color:
                value === n
                  ? "#fff"
                  : "var(--rv-text-secondary, #8A829A)",
              border:
                value === n
                  ? "1px solid transparent"
                  : "1px solid var(--rv-card-border, rgba(26,16,37,0.08))",
            }}
          >
            {labels[n]}
          </button>
        ))}
      </div>
    </div>
  );
}
