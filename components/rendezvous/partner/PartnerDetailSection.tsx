"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RV_COLORS, RV_CATEGORY_COLORS, RvCard } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";

const PARTNER_COLOR = RV_CATEGORY_COLORS.partner;

type PartnerBriefingData = {
  briefing: {
    compatibilityInsight?: { headline: string; body: string };
    lifePlanInsights?: Array<{ axis: string; label: string; insight: string; alignment: string }>;
    processAdvice?: { headline: string; strengths: string[]; risks: string[] };
    firstDateTopics?: Array<{ topic: string; reason: string }>;
  };
  partnerScore: {
    total: number;
    layer1: number;
    layer15: number;
    layer2: number;
  };
};

/**
 * Partner 候補の詳細セクション
 *
 * 既存の RendezvousDetailClient の中で、category === "partner" の場合に表示する。
 * 3層スコアの詳細、Guard 説明、Counselor Briefing を表示。
 */
export default function PartnerDetailSection({
  candidateId,
}: {
  candidateId: string;
}) {
  const [data, setData] = useState<PartnerBriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/rendezvous/counselor/partner-briefing?candidateId=${candidateId}`);
        if (!res.ok) {
          setError("ブリーフィングを取得できませんでした");
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("通信エラー");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [candidateId]);

  if (loading) {
    return (
      <div style={{ padding: "20px 0" }}>
        <SkeletonCard />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        padding: "20px",
        textAlign: "center",
        fontSize: 13,
        color: RV_COLORS.textMuted,
      }}>
        {error ?? "データなし"}
      </div>
    );
  }

  const { briefing, partnerScore } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 16px" }}>
      {/* Partner badge */}
      <FadeInView>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 12,
          background: `${PARTNER_COLOR}10`,
          border: `1px solid ${PARTNER_COLOR}25`,
        }}>
          <span style={{ fontSize: 14 }}>♦</span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: PARTNER_COLOR,
            letterSpacing: 1,
          }}>
            PARTNER 分析
          </span>
          <span style={{ fontSize: 11, color: RV_COLORS.textMuted, marginLeft: "auto" }}>
            結婚前提の相性評価
          </span>
        </div>
      </FadeInView>

      {/* 3-Layer Score Breakdown */}
      <FadeInView delay={0.1}>
        <RvCard elevated>
          <div style={{ padding: "20px" }}>
            <h3 style={{
              fontSize: 14,
              fontWeight: 700,
              color: RV_COLORS.text,
              marginBottom: 16,
            }}>
              3層相性スコア
            </h3>

            {/* Total score */}
            <div style={{
              textAlign: "center",
              marginBottom: 20,
            }}>
              <div style={{
                fontSize: 40,
                fontWeight: 800,
                color: PARTNER_COLOR,
                lineHeight: 1,
              }}>
                {Math.round(partnerScore.total * 100)}
              </div>
              <div style={{ fontSize: 11, color: RV_COLORS.textMuted, marginTop: 4 }}>
                総合スコア
              </div>
            </div>

            {/* Layer breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <LayerBar
                label="Layer 1: 性格・行動の相性"
                sublabel="日常のコミュニケーションスタイル"
                score={partnerScore.layer1}
                weight={40}
                color="#7B61FF"
              />
              <LayerBar
                label="Layer 1.5: 関係プロセスの相性"
                sublabel="対話パターン・葛藤解決・修復力"
                score={partnerScore.layer15}
                weight={30}
                color={PARTNER_COLOR}
              />
              <LayerBar
                label="Layer 2: 人生設計の相性"
                sublabel="金銭感覚・家族計画・キャリア観"
                score={partnerScore.layer2}
                weight={30}
                color="#00897B"
              />
            </div>
          </div>
        </RvCard>
      </FadeInView>

      {/* Compatibility Insight */}
      {briefing.compatibilityInsight && (
        <FadeInView delay={0.2}>
          <RvCard>
            <div style={{ padding: "20px" }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 700,
                color: RV_COLORS.text,
                marginBottom: 8,
              }}>
                {briefing.compatibilityInsight.headline}
              </h3>
              <p style={{
                fontSize: 13,
                color: RV_COLORS.textSub,
                lineHeight: 1.8,
              }}>
                {briefing.compatibilityInsight.body}
              </p>
            </div>
          </RvCard>
        </FadeInView>
      )}

      {/* Life Plan Insights */}
      {briefing.lifePlanInsights && briefing.lifePlanInsights.length > 0 && (
        <FadeInView delay={0.3}>
          <RvCard>
            <div style={{ padding: "20px" }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 700,
                color: RV_COLORS.text,
                marginBottom: 14,
              }}>
                人生設計の一致・差異
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {briefing.lifePlanInsights.map((lpi, i) => (
                  <div key={i} style={{
                    padding: "12px",
                    borderRadius: 10,
                    background: lpi.alignment === "aligned"
                      ? "rgba(0,200,83,0.06)"
                      : lpi.alignment === "risk"
                        ? "rgba(255,152,0,0.06)"
                        : RV_COLORS.surfaceMuted,
                    border: `1px solid ${
                      lpi.alignment === "aligned"
                        ? "rgba(0,200,83,0.15)"
                        : lpi.alignment === "risk"
                          ? "rgba(255,152,0,0.15)"
                          : RV_COLORS.border
                    }`,
                  }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: lpi.alignment === "aligned" ? "#00C853"
                        : lpi.alignment === "risk" ? "#E65100"
                          : RV_COLORS.text,
                      marginBottom: 4,
                    }}>
                      {lpi.alignment === "aligned" ? "✓ " : lpi.alignment === "risk" ? "⚠ " : ""}
                      {lpi.label}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: RV_COLORS.textSub,
                      lineHeight: 1.6,
                    }}>
                      {lpi.insight}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </RvCard>
        </FadeInView>
      )}

      {/* Process Advice */}
      {briefing.processAdvice && (
        <FadeInView delay={0.4}>
          <RvCard>
            <div style={{ padding: "20px" }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 700,
                color: RV_COLORS.text,
                marginBottom: 8,
              }}>
                {briefing.processAdvice.headline}
              </h3>

              {briefing.processAdvice.strengths.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#00C853", marginBottom: 4 }}>
                    強み
                  </div>
                  {briefing.processAdvice.strengths.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.7, paddingLeft: 10 }}>
                      ✓ {s}
                    </div>
                  ))}
                </div>
              )}

              {briefing.processAdvice.risks.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#E65100", marginBottom: 4 }}>
                    注意ポイント
                  </div>
                  {briefing.processAdvice.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.7, paddingLeft: 10 }}>
                      ⚠ {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </RvCard>
        </FadeInView>
      )}

      {/* First Date Topics */}
      {briefing.firstDateTopics && briefing.firstDateTopics.length > 0 && (
        <FadeInView delay={0.5}>
          <RvCard>
            <div style={{ padding: "20px" }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 700,
                color: RV_COLORS.text,
                marginBottom: 12,
              }}>
                初回の話題提案
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {briefing.firstDateTopics.map((t, i) => (
                  <div key={i} style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: `${PARTNER_COLOR}08`,
                    border: `1px solid ${PARTNER_COLOR}15`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: RV_COLORS.text, marginBottom: 2 }}>
                      💬 {t.topic}
                    </div>
                    <div style={{ fontSize: 11, color: RV_COLORS.textMuted }}>
                      {t.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </RvCard>
        </FadeInView>
      )}
    </div>
  );
}

// ── LayerBar ──

function LayerBar({
  label,
  sublabel,
  score,
  weight,
  color,
}: {
  label: string;
  sublabel: string;
  score: number;
  weight: number;
  color: string;
}) {
  const percent = Math.round(score * 100);

  return (
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 4,
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: RV_COLORS.text }}>
            {label}
          </span>
          <span style={{ fontSize: 10, color: RV_COLORS.textMuted, marginLeft: 6 }}>
            (重み {weight}%)
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>
          {percent}
        </span>
      </div>
      <div style={{ fontSize: 10, color: RV_COLORS.textMuted, marginBottom: 6 }}>
        {sublabel}
      </div>
      <div style={{
        height: 6,
        borderRadius: 3,
        background: RV_COLORS.surfaceMuted,
        overflow: "hidden",
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            height: "100%",
            borderRadius: 3,
            background: `linear-gradient(90deg, ${color}, ${color}CC)`,
          }}
        />
      </div>
    </div>
  );
}

// ── Skeleton ──

function SkeletonCard() {
  return (
    <RvCard>
      <div style={{ padding: 20 }}>
        <div style={{ height: 16, width: "60%", borderRadius: 4, background: RV_COLORS.surfaceMuted, marginBottom: 12 }} />
        <div style={{ height: 12, width: "100%", borderRadius: 4, background: RV_COLORS.surfaceMuted, marginBottom: 8 }} />
        <div style={{ height: 12, width: "80%", borderRadius: 4, background: RV_COLORS.surfaceMuted }} />
      </div>
    </RvCard>
  );
}
