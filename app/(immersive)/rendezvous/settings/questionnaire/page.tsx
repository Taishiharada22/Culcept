"use client";

/**
 * マッチングベクトル質問票
 * 10問（10次元ベクトルに対応）でmatching_vectorを生成
 * Stargazerデータから推定値を事前表示（ユーザーが上書き可能）
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MatchingVector } from "@/lib/rendezvous/types";

// ────────────────────────────────────────────
// 10次元の質問定義
// ────────────────────────────────────────────

type VectorDimension = keyof MatchingVector;

interface VectorQuestion {
  dimension: VectorDimension;
  title: string;
  prompt: string;
  lowLabel: string;
  highLabel: string;
  description: string;
}

const VECTOR_QUESTIONS: VectorQuestion[] = [
  {
    dimension: "conversation_temperature",
    title: "会話の温度",
    prompt: "人と話すとき、どちらが心地よいですか？",
    lowLabel: "穏やかに静かに",
    highLabel: "盛り上がって熱く",
    description: "会話のエネルギーレベルの好み",
  },
  {
    dimension: "distance_need",
    title: "距離感",
    prompt: "人との距離感はどちらが自然ですか？",
    lowLabel: "近くにいたい",
    highLabel: "程よい距離を保ちたい",
    description: "パーソナルスペースの広さ",
  },
  {
    dimension: "depth_speed",
    title: "深まる速度",
    prompt: "関係性が深まるペースはどちらが心地よいですか？",
    lowLabel: "ゆっくり時間をかけて",
    highLabel: "早く深い関係になりたい",
    description: "親密さが深まるペースの好み",
  },
  {
    dimension: "stability_need",
    title: "安定への欲求",
    prompt: "日常において大切にしたいのはどちらですか？",
    lowLabel: "変化と刺激",
    highLabel: "安定と予測可能性",
    description: "生活リズムの安定性の好み",
  },
  {
    dimension: "stimulation_need",
    title: "刺激への欲求",
    prompt: "新しい経験についてどう感じますか？",
    lowLabel: "慣れた環境が安心",
    highLabel: "常に新しいものを求めたい",
    description: "新規性や挑戦への態度",
  },
  {
    dimension: "initiative",
    title: "主導性",
    prompt: "関係性の中で、どちらの立場が自然ですか？",
    lowLabel: "相手に合わせたい",
    highLabel: "自分からリードしたい",
    description: "コミュニケーションの主導傾向",
  },
  {
    dimension: "emotional_openness",
    title: "感情の開示",
    prompt: "自分の感情をどの程度見せますか？",
    lowLabel: "あまり見せない",
    highLabel: "素直に表現する",
    description: "感情表現のオープンさ",
  },
  {
    dimension: "conflict_directness",
    title: "衝突への向き合い方",
    prompt: "意見が合わないとき、どう対処しますか？",
    lowLabel: "衝突を避けて調和を保つ",
    highLabel: "率直に伝えて解決する",
    description: "対立時のコミュニケーションスタイル",
  },
  {
    dimension: "social_energy",
    title: "社交エネルギー",
    prompt: "人と過ごす時間についてどう感じますか？",
    lowLabel: "一人の時間で回復する",
    highLabel: "人といるとエネルギーが湧く",
    description: "社交性と内向性のバランス",
  },
  {
    dimension: "structure_preference",
    title: "構造の好み",
    prompt: "物事の進め方はどちらが自然ですか？",
    lowLabel: "その場の流れで",
    highLabel: "計画を立てて進めたい",
    description: "計画性 vs 即興性",
  },
];

// ────────────────────────────────────────────
// Slider Component
// ────────────────────────────────────────────

function DimensionSlider({
  question,
  value,
  stargazerHint,
  onChange,
  index,
}: {
  question: VectorQuestion;
  value: number;
  stargazerHint: number | null;
  onChange: (v: number) => void;
  index: number;
}) {
  const percent = Math.round(value * 100);
  const hintPercent = stargazerHint !== null ? Math.round(stargazerHint * 100) : null;

  return (
    <div
      style={{
        padding: "20px 24px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(99,102,241,0.06)",
        boxShadow: "0 1px 4px rgba(99,102,241,0.04)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "rgba(99,102,241,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(99,102,241,0.6)",
          }}
        >
          {index + 1}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C" }}>
          {question.title}
        </span>
      </div>

      <p style={{ fontSize: 13, color: "rgba(30,30,60,0.55)", marginBottom: 14, lineHeight: 1.5 }}>
        {question.prompt}
      </p>

      {/* Slider */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        {/* Stargazer hint marker */}
        {hintPercent !== null && (
          <div
            style={{
              position: "absolute",
              left: `${hintPercent}%`,
              top: -6,
              transform: "translateX(-50%)",
              fontSize: 9,
              fontWeight: 600,
              color: "rgba(139,92,246,0.6)",
              whiteSpace: "nowrap",
            }}
          >
            Stargazer推定
          </div>
        )}
        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => onChange(parseInt(e.target.value) / 100)}
          style={{
            width: "100%",
            height: 6,
            borderRadius: 3,
            appearance: "none",
            background: `linear-gradient(to right, rgba(99,102,241,0.3) ${percent}%, rgba(99,102,241,0.08) ${percent}%)`,
            outline: "none",
            cursor: "pointer",
          }}
        />
      </div>

      {/* Labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "rgba(30,30,60,0.4)" }}>
          {question.lowLabel}
        </span>
        <span style={{ fontSize: 11, color: "rgba(30,30,60,0.4)" }}>
          {question.highLabel}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Page Component
// ────────────────────────────────────────────

const DEFAULT_VECTOR: MatchingVector = {
  conversation_temperature: 0.5,
  distance_need: 0.5,
  depth_speed: 0.5,
  stability_need: 0.5,
  stimulation_need: 0.5,
  initiative: 0.5,
  emotional_openness: 0.5,
  conflict_directness: 0.5,
  social_energy: 0.5,
  structure_preference: 0.5,
};

export default function QuestionnairePage() {
  const router = useRouter();
  const [vector, setVector] = useState<MatchingVector>({ ...DEFAULT_VECTOR });
  const [stargazerHints, setStargazerHints] = useState<Partial<MatchingVector>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load existing vector + Stargazer hints
  useEffect(() => {
    (async () => {
      try {
        // Load existing preferences
        const settingsRes = await fetch("/api/rendezvous/settings", { credentials: "include" });
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.preferences?.matching_vector) {
            const mv = data.preferences.matching_vector;
            // Only use if not all defaults
            const hasReal = Object.values(mv).some((v) => typeof v === "number" && v !== 0.5);
            if (hasReal) {
              setVector(mv);
            }
          }
        }

        // Load Stargazer hints (from profile API)
        try {
          const sgRes = await fetch("/api/stargazer/profile", { credentials: "include" });
          if (sgRes.ok) {
            const sgData = await sgRes.json();
            // Map Stargazer axes to matching vector dimensions
            if (sgData.axes) {
              const hints: Partial<MatchingVector> = {};
              const axes = sgData.axes as Record<string, number>;
              // Map known Stargazer axes to vector dimensions
              if (typeof axes.introvert_vs_extrovert === "number")
                hints.social_energy = (axes.introvert_vs_extrovert + 1) / 2;
              if (typeof axes.cautious_vs_bold === "number")
                hints.initiative = (axes.cautious_vs_bold + 1) / 2;
              if (typeof axes.plan_vs_spontaneous === "number")
                hints.structure_preference = 1 - (axes.plan_vs_spontaneous + 1) / 2;
              if (typeof axes.quality_vs_quantity === "number")
                hints.depth_speed = 1 - (axes.quality_vs_quantity + 1) / 2;
              if (typeof axes.emotional_variability === "number")
                hints.emotional_openness = (axes.emotional_variability + 1) / 2;
              if (typeof axes.analytical_vs_intuitive === "number")
                hints.conflict_directness = 1 - (axes.analytical_vs_intuitive + 1) / 2;
              setStargazerHints(hints);
              // Pre-fill with hints where no existing value
              setVector((prev) => {
                const next = { ...prev };
                for (const [k, v] of Object.entries(hints)) {
                  if (prev[k as VectorDimension] === 0.5 && typeof v === "number") {
                    next[k as VectorDimension] = Math.round(v * 100) / 100;
                  }
                }
                return next;
              });
            }
          }
        } catch {
          // Stargazer not available — fine
        }
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const handleChange = useCallback((dimension: VectorDimension, value: number) => {
    setVector((prev) => ({ ...prev, [dimension]: Math.round(value * 100) / 100 }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/rendezvous/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchingVector: vector }),
      });
      if (res.ok) {
        router.push("/rendezvous/settings");
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [vector, router]);

  // Count dimensions that differ from default
  const completionCount = Object.values(vector).filter((v) => v !== 0.5).length;

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 13, color: "rgba(30,30,60,0.35)" }}>読み込み中...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F8F7FF 0%, #F0F0FF 100%)",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 100px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{
              fontSize: 12,
              color: "rgba(30,30,60,0.4)",
              background: "none",
              border: "none",
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            &#8592; 戻る
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1E1E3C", marginBottom: 6 }}>
            接続のベクトル
          </h1>
          <p style={{ fontSize: 13, color: "rgba(30,30,60,0.5)", lineHeight: 1.6 }}>
            10の質問で、あなたの接続スタイルを分身に教えてください。
            Stargazerのデータがある場合は推定値が事前に入っています。
          </p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(99,102,241,0.6)" }}>
              設定済み {completionCount}/10
            </span>
            <span style={{ fontSize: 11, color: "rgba(30,30,60,0.3)" }}>
              {Object.keys(stargazerHints).length > 0
                ? `Stargazer推定: ${Object.keys(stargazerHints).length}次元`
                : ""}
            </span>
          </div>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: "rgba(99,102,241,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(completionCount / 10) * 100}%`,
                height: "100%",
                background: "rgba(99,102,241,0.4)",
                borderRadius: 2,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>

        {/* Questions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {VECTOR_QUESTIONS.map((q, i) => (
            <DimensionSlider
              key={q.dimension}
              question={q}
              value={vector[q.dimension]}
              stargazerHint={stargazerHints[q.dimension] ?? null}
              onChange={(v) => handleChange(q.dimension, v)}
              index={i}
            />
          ))}
        </div>

        {/* Save */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px 16px",
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(99,102,241,0.06)",
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: saving
                  ? "rgba(99,102,241,0.4)"
                  : "linear-gradient(135deg, #6366F1, #8B5CF6)",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px rgba(99,102,241,0.2)",
              }}
            >
              {saving ? "保存中..." : "ベクトルを保存する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
