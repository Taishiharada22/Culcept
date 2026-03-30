"use client";

import Link from "next/link";
import RobotCheckinCard from "@/app/(immersive)/aneurasync/RobotCheckinCard";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";

const mono = "'JetBrains Mono','SF Mono',monospace";

type Props = {
  sgObservationCount?: number;
  archetypeName?: string | null;
  syncPercent?: number;
  axisScores?: Partial<Record<string, number>>;
  /** Adept+ users: show compact 1-line CTA instead of full section */
  compact?: boolean;
};

function JourneyNarrative({
  count,
  archetypeName,
  syncPercent,
}: {
  count: number;
  archetypeName?: string | null;
  syncPercent?: number;
}) {
  let narrative: string;
  let milestone: string | null = null;

  if (count === 0) {
    narrative = "まだ始まったばかり。最初の質問に答えるだけで、あなたのことが少しずつ見えてくるよ";
  } else if (count < 10) {
    narrative = `${count}回答えてくれたね。あなたの輪郭が少しずつ見えてきてるよ`;
    milestone = `あと${10 - count}回で、自分でも気づいてない一面が見えてくる`;
  } else if (count < 30) {
    narrative = `自分でも気づいてない一面が、だんだん見えてきてるよ`;
    milestone = `あと${30 - count}回で、AIがあなたの行動を予測できるようになる`;
  } else if (count < 70) {
    narrative = `あなたのことが${syncPercent ?? 0}%わかってきた。まだ知らない自分が残ってるよ`;
    milestone = `あと${70 - count}回で、あなたの全体像が完成する`;
  } else {
    narrative = "あなたのことがかなり正確にわかってきた。もう分身はあなた以上にあなたを知ってるかも";
  }

  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        background: "transparent",
        borderLeft: "2px solid rgba(99,102,241,0.15)",
        marginBottom: 10,
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "#4a4a68",
          fontWeight: 500,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {narrative}
      </p>
      {milestone && (
        <p
          style={{
            fontSize: 10,
            color: "#6366F1",
            marginTop: 4,
            margin: 0,
            marginBlockStart: 4,
          }}
        >
          {milestone}
        </p>
      )}
    </div>
  );
}

export default function DailyObservationSection({
  sgObservationCount,
  archetypeName,
  syncPercent,
  axisScores,
  compact,
}: Props) {
  // v4アーキタイプを解決（axisScoresがある場合）
  const v4Archetype = (() => {
    if (!axisScores || Object.keys(axisScores).length < 5) return null;
    try {
      const result = resolveArchetype(axisScores as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>);
      return getArchetypeByCode(result.code) ?? null;
    } catch { return null; }
  })();

  // Compact mode: single-line CTA for adept+ users
  if (compact) {
    return (
      <section aria-label="今日の観測" style={{ padding: "4px 20px", maxWidth: 780, margin: "0 auto" }}>
        <a
          href="/stargazer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderRadius: 14,
            background: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.06)",
            textDecoration: "none", color: "#1a1a2e",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            🔭 深層観測 — {sgObservationCount ?? 0}問完了・同期 {syncPercent ?? 0}%
          </span>
          <span style={{ fontSize: 12, color: "#6366F1", fontWeight: 700 }}>続ける →</span>
        </a>
      </section>
    );
  }

  return (
    <section
      aria-label="今日の観測"
      style={{
        padding: "8px 20px 24px",
        maxWidth: 780,
        margin: "0 auto",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          paddingLeft: 4,
        }}
      >
        <span style={{ fontSize: 14 }}>✦</span>
        <span
          style={{
            fontSize: 9,
            color: "#6b6b80",
            fontWeight: 600,
            letterSpacing: 2,
            fontFamily: mono,
          }}
        >
          深層観測
        </span>
        <span style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600 }}>今日の観測</span>
      </div>

      {/* Journey Narrative */}
      <JourneyNarrative
        count={sgObservationCount ?? 0}
        archetypeName={v4Archetype?.name ?? archetypeName}
        syncPercent={syncPercent}
      />

      {/* アーキタイプバッジ */}
      {v4Archetype && (
        <Link
          href={`/type/${v4Archetype.code}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 12,
            background: "rgba(190,170,110,0.06)",
            border: "1px solid rgba(190,170,110,0.15)",
            marginBottom: 10,
            textDecoration: "none",
          }}
        >
          <span style={{ fontSize: 20 }}>{v4Archetype.emoji}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>{v4Archetype.name}</span>
            <span style={{ fontSize: 10, color: "#8b8b9e", marginLeft: 6, fontFamily: mono }}>{v4Archetype.code}</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#baa06e" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* 施策IV: Anonymous Social Proof */}
      {(() => {
        const messages = [
          "今、あなたと同じように自分を知ろうとしてる人がいるよ",
          "同じようなことで悩んでる人が、今夜も考えてる",
          "あなたと似たタイプの人が、その先で面白い発見をしてたよ",
          "似たタイプの誰かが、昨日ひとつ壁を超えたみたい",
          "同じ道を歩いてる人がいる。でも見えてる世界は全然違うんだよね",
          "このパターンを持つ人は全体の8%だけ。けっこうレアだよ",
          "最近、自分と向き合う人が増えてきてるよ",
          "同じ発見をした人が、その先でまた新しい疑問を見つけてる",
        ];
        const today = new Date();
        const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        const msg = messages[seed % messages.length];
        return (
          <div style={{
            marginBottom: 10, padding: "6px 10px", borderRadius: 10,
            display: "flex", alignItems: "center", gap: 6,
            background: "transparent",
          }}>
            <div style={{
              width: 4, height: 4, borderRadius: "50%",
              background: "#6366F1", opacity: 0.3,
              animation: "ndot 3s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 10, color: "#8888a0", lineHeight: 1.5 }}>
              {msg}
            </span>
          </div>
        );
      })()}

      {/* Observation — RobotCheckinCard（ロボットアバター非表示） */}
      <div className="hide-robot-avatar" style={{ position: "relative" }}>
        <style>{`
          .hide-robot-avatar canvas,
          .hide-robot-avatar svg[width="136"] { display: none !important; }
        `}</style>
        <RobotCheckinCard />
      </div>

      {/* Observation count hint */}
      {typeof sgObservationCount === "number" && sgObservationCount > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(99,102,241,0.04)",
            border: "1px solid rgba(99,102,241,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "#8888a0",
          }}
        >
          <span style={{ fontWeight: 700, color: "#6366F1", fontFamily: mono }}>
            {sgObservationCount}
          </span>
          <span>回の観測データが蓄積されています</span>
        </div>
      )}
    </section>
  );
}
