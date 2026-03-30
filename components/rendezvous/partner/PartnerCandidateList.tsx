"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RV_COLORS, RV_CATEGORY_COLORS, RvCard } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";

const PARTNER_COLOR = RV_CATEGORY_COLORS.partner;

type PartnerCandidate = {
  candidateId: string;
  displayName: string;
  avatarUrl: string | null;
  overallScore: number;
  layer1Score: number;
  layer15Score: number;
  layer2Score: number;
  reasonTexts: string[];
  cautionTexts: string[];
  partnerReasonTexts: string[];
  partnerCautionTexts: string[];
  guardPassed: boolean;
  guardFailures: string[];
  state: string;
  matchedAt: string | null;
};

/**
 * Partner 候補一覧
 * 3層スコアの要約を表示。romance とは視覚的に完全分離。
 */
export default function PartnerCandidateList() {
  const [candidates, setCandidates] = useState<PartnerCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/rendezvous/home");
        if (!res.ok) return;
        const data = await res.json();

        // Filter partner candidates
        const partnerItems = (data.items ?? [])
          .filter((item: any) => item.category === "partner")
          .map((item: any) => ({
            candidateId: item.candidateId,
            displayName: item.counterpart?.displayName ?? "匿名",
            avatarUrl: item.counterpart?.avatarUrl ?? null,
            overallScore: item.syncPercent ?? 0,
            layer1Score: 0,
            layer15Score: 0,
            layer2Score: 0,
            reasonTexts: item.reasons ?? [],
            cautionTexts: item.caution ? [item.caution] : [],
            partnerReasonTexts: [],
            partnerCautionTexts: [],
            guardPassed: true,
            guardFailures: [],
            state: item.state ?? "unseen",
            matchedAt: item.deliveredAt ?? null,
          }));

        setCandidates(partnerItems);
      } catch (err) {
        console.error("[PartnerList] error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "60px 16px", textAlign: "center", color: RV_COLORS.textMuted }}>
        候補を読み込み中...
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
      }}>
        <div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 12,
            background: `${PARTNER_COLOR}18`,
            color: PARTNER_COLOR,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            marginBottom: 6,
          }}>
            ♦ PARTNER
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: RV_COLORS.text }}>
            パートナー候補
          </h1>
        </div>
        <Link
          href="/rendezvous/partner"
          style={{
            fontSize: 12,
            color: PARTNER_COLOR,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          準備設定
        </Link>
      </div>

      {candidates.length === 0 ? (
        <FadeInView>
          <RvCard>
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 40,
                marginBottom: 16,
              }}>
                ♦
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: RV_COLORS.text, marginBottom: 8 }}>
                まだ候補がいません
              </h3>
              <p style={{ fontSize: 13, color: RV_COLORS.textSub, lineHeight: 1.7, marginBottom: 20 }}>
                人生設計の観測と絶対条件の設定を完了すると、<br />
                あなたに合うパートナー候補が表示されます。
              </p>
              <Link
                href="/rendezvous/partner"
                style={{
                  display: "inline-block",
                  padding: "10px 24px",
                  borderRadius: 8,
                  background: PARTNER_COLOR,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                準備を進める
              </Link>
            </div>
          </RvCard>
        </FadeInView>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {candidates.map((c, idx) => (
            <FadeInView key={c.candidateId} delay={idx * 0.08}>
              <PartnerCandidateCard candidate={c} />
            </FadeInView>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PartnerCandidateCard ──

function PartnerCandidateCard({ candidate }: { candidate: PartnerCandidate }) {
  const c = candidate;

  return (
    <Link
      href={`/rendezvous/${c.candidateId}`}
      style={{ textDecoration: "none" }}
    >
      <RvCard elevated accentBorder={PARTNER_COLOR}>
        <div style={{ padding: "16px 20px" }}>
          {/* Top row: avatar + name + score */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            {/* Avatar */}
            <div style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: `${PARTNER_COLOR}20`,
              border: `2px solid ${PARTNER_COLOR}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              overflow: "hidden",
              flexShrink: 0,
            }}>
              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                "♦"
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: RV_COLORS.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {c.displayName}
                </span>
                {c.state === "unseen" && (
                  <span style={{
                    padding: "2px 6px",
                    borderRadius: 8,
                    background: `${PARTNER_COLOR}20`,
                    color: PARTNER_COLOR,
                    fontSize: 9,
                    fontWeight: 700,
                  }}>
                    NEW
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: RV_COLORS.textMuted }}>
                パートナー候補
              </div>
            </div>

            {/* Overall score ring */}
            <div style={{ position: "relative", width: 48, height: 48 }}>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <circle cx={24} cy={24} r={20} fill="none" stroke={RV_COLORS.surfaceMuted} strokeWidth={3} />
                <circle
                  cx={24}
                  cy={24}
                  r={20}
                  fill="none"
                  stroke={PARTNER_COLOR}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={`${(c.overallScore / 100) * 125.6} 125.6`}
                  transform="rotate(-90 24 24)"
                />
              </svg>
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: PARTNER_COLOR,
              }}>
                {c.overallScore}
              </div>
            </div>
          </div>

          {/* 3-layer score bars */}
          <ThreeLayerBars
            layer1={c.layer1Score || c.overallScore * 0.4}
            layer15={c.layer15Score || c.overallScore * 0.3}
            layer2={c.layer2Score || c.overallScore * 0.3}
          />

          {/* Reasons */}
          {c.reasonTexts.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {c.reasonTexts.slice(0, 3).map((r, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 10,
                    background: `${PARTNER_COLOR}10`,
                    color: PARTNER_COLOR,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          {/* Cautions */}
          {c.cautionTexts.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {c.cautionTexts.slice(0, 2).map((ct, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 10,
                    background: "rgba(255,152,0,0.08)",
                    color: "#E65100",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  ⚠ {ct}
                </span>
              ))}
            </div>
          )}
        </div>
      </RvCard>
    </Link>
  );
}

// ── 3-Layer Score Bars ──

function ThreeLayerBars({
  layer1,
  layer15,
  layer2,
}: {
  layer1: number;
  layer15: number;
  layer2: number;
}) {
  const layers = [
    { label: "性格・行動", score: layer1, color: "#7B61FF" },
    { label: "関係プロセス", score: layer15, color: PARTNER_COLOR },
    { label: "人生設計", score: layer2, color: "#00897B" },
  ];

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {layers.map((l) => (
        <div key={l.label} style={{ flex: 1 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 3,
          }}>
            <span style={{ fontSize: 9, color: RV_COLORS.textMuted }}>{l.label}</span>
            <span style={{ fontSize: 9, color: l.color, fontWeight: 700 }}>
              {Math.round(l.score)}
            </span>
          </div>
          <div style={{
            height: 4,
            borderRadius: 2,
            background: RV_COLORS.surfaceMuted,
            overflow: "hidden",
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(l.score, 100)}%` }}
              transition={{ duration: 0.6, delay: 0.2 }}
              style={{
                height: "100%",
                borderRadius: 2,
                background: l.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
