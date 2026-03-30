// ============================================================
// Orbiter Cross-Candidate Pattern Engine
// 候補者横断パターン認識 — 「接続」の技法
//
// 個別の候補者分析では絶対に見えないもの:
// - 「いつも同じタイプを選ぶ」→ 一貫した好み or 固定観念
// - 「安定を求めると言いながら刺激的な人を選ぶ」→ 矛盾の指摘
// - 「判断が早くなっている」→ 成長の認識
// - 「前にうまくいかなかったパターンを繰り返している」→ 警告
//
// これがあることで、Orbiterは「この人を見ている」から
// 「この人の人生を見ている」に変わる。
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type {
  CrossCandidatePattern,
  CrossPatternType,
  UserJudgmentProfile,
  OrbiterMaturity,
  OrbiterMaturityStage,
  OrbiterMemoryState,
} from "./types";

// ── Data Loading ──

export interface CandidateDecision {
  candidateId: string;
  decision: "like" | "pass";
  timeToDecisionMs: number | null;
  visitCount: number;
  category: string;
  cautionCodes: string[];
  frictionLevel: string | null; // "low" | "medium" | "high"
  counterpartAxisScores: Partial<Record<string, number>>;
  createdAt: string;
}

/**
 * ユーザーの全判断履歴をロードする。
 * 直近30件まで (パターン認識に十分なサンプル数)
 */
export async function loadDecisionHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidateDecision[]> {
  // orbiter_signals から like/pass の判断を取得
  const { data: signals } = await supabase
    .from("orbiter_signals")
    .select("candidate_id, signal_type, payload, created_at")
    .eq("user_id", userId)
    .in("signal_type", ["like", "pass"])
    .order("created_at", { ascending: false })
    .limit(30);

  if (!signals || signals.length === 0) return [];

  const candidateIds = [...new Set(signals.map((s) => s.candidate_id))];

  // 候補者の詳細情報を一括取得
  const { data: candidates } = await supabase
    .from("rendezvous_candidates")
    .select("id, category, caution_codes, counterpart_id")
    .in("id", candidateIds);

  const candidateMap = new Map(
    (candidates ?? []).map((c) => [c.id, c]),
  );

  // 各候補者の訪問回数を取得
  const { data: viewCounts } = await supabase
    .from("orbiter_signals")
    .select("candidate_id")
    .eq("user_id", userId)
    .in("signal_type", ["detail_view", "revisit"])
    .in("candidate_id", candidateIds);

  const visitCountMap = new Map<string, number>();
  for (const v of viewCounts ?? []) {
    visitCountMap.set(
      v.candidate_id,
      (visitCountMap.get(v.candidate_id) ?? 0) + 1,
    );
  }

  return signals.map((s) => {
    const candidate = candidateMap.get(s.candidate_id);
    const payload = (s.payload ?? {}) as Record<string, unknown>;
    return {
      candidateId: s.candidate_id,
      decision: s.signal_type as "like" | "pass",
      timeToDecisionMs: (payload.timeToDecisionMs as number) ?? null,
      visitCount: visitCountMap.get(s.candidate_id) ?? 1,
      category: candidate?.category ?? "unknown",
      cautionCodes: (candidate?.caution_codes ?? []) as string[],
      frictionLevel: null, // 個別のfriction計算はコスト高いため省略
      counterpartAxisScores: {}, // 軸スコアは別途取得が必要
      createdAt: s.created_at,
    };
  });
}

// ── Pattern Detection ──

/**
 * 判断履歴からユーザーの横断パターンを検出する。
 */
export function detectCrossPatterns(
  decisions: CandidateDecision[],
): UserJudgmentProfile {
  if (decisions.length === 0) {
    return {
      patterns: [],
      totalDecisions: 0,
      avgDecisionTimeMs: null,
      likeRate: 0,
    };
  }

  const patterns: CrossCandidatePattern[] = [];

  // ── 1. Decision Style (判断スタイル) ──
  const decisionStyle = detectDecisionStyle(decisions);
  if (decisionStyle) patterns.push(decisionStyle);

  // ── 2. Like/Pass Rate Analysis ──
  const likeDecisions = decisions.filter((d) => d.decision === "like");
  const passDecisions = decisions.filter((d) => d.decision === "pass");
  const likeRate = likeDecisions.length / decisions.length;

  // 極端なlike率
  if (decisions.length >= 5 && likeRate > 0.8) {
    patterns.push({
      type: "decision_style",
      narrative: "ほとんどの相手をlikeしている。基準が広いのか、直感で動いているのか。選択の軸がまだ定まっていない可能性。",
      confidence: 0.6,
      sampleCount: decisions.length,
    });
  } else if (decisions.length >= 5 && likeRate < 0.2) {
    patterns.push({
      type: "decision_style",
      narrative: "ほとんどの相手をpassしている。基準が高いか、恐れが判断を支配している可能性。",
      confidence: 0.6,
      sampleCount: decisions.length,
    });
  }

  // ── 3. Friction Tolerance (摩擦耐性) ──
  const frictionPattern = detectFrictionTolerance(likeDecisions, passDecisions);
  if (frictionPattern) patterns.push(frictionPattern);

  // ── 4. Contradiction Detection (矛盾検出) ──
  const contradiction = detectContradiction(decisions);
  if (contradiction) patterns.push(contradiction);

  // ── 5. Growth Signal (成長の兆候) ──
  const growthSignal = detectGrowth(decisions);
  if (growthSignal) patterns.push(growthSignal);

  // ── 6. Repetition Warning (繰り返しの警告) ──
  const repetition = detectRepetition(decisions);
  if (repetition) patterns.push(repetition);

  // Sort by confidence, take top 5
  patterns.sort((a, b) => b.confidence - a.confidence);
  const topPatterns = patterns.slice(0, 5);

  // Average decision time
  const timesMs = decisions
    .map((d) => d.timeToDecisionMs)
    .filter((t): t is number => t != null);
  const avgDecisionTimeMs =
    timesMs.length > 0
      ? timesMs.reduce((a, b) => a + b, 0) / timesMs.length
      : null;

  return {
    patterns: topPatterns,
    totalDecisions: decisions.length,
    avgDecisionTimeMs,
    likeRate,
  };
}

// ── Maturity Calculation ──

/**
 * Orbiter の成熟度を連続スコア (0-100) で算出する。
 * 5つの因子 (各0-20) の合計から段階を導出。
 * 固定閾値ではなく滑らかな遷移。
 */
export function computeMaturity(
  decisions: CandidateDecision[],
  memory: OrbiterMemoryState | null,
  patterns: CrossCandidatePattern[],
): OrbiterMaturity {
  // ── Factor 1: decisionVolume (0-20) ──
  // 判断データの量。多いほど信頼性が上がる。
  const dv = Math.min(20, Math.round(decisions.length * 0.8));

  // ── Factor 2: consistency (0-20) ──
  // like率が 0.3-0.7 なら高い (選別眼がある)
  const likeRate = decisions.length > 0
    ? decisions.filter((d) => d.decision === "like").length / decisions.length
    : 0.5;
  const rateBalance = 1 - Math.abs(likeRate - 0.5) * 2;
  const consistentPrefCount = patterns.filter(
    (p) => p.type === "consistent_preference",
  ).length;
  const cs = Math.min(
    20,
    Math.round(rateBalance * 12 + Math.min(8, consistentPrefCount * 4)),
  );

  // ── Factor 3: reflectionDepth (0-20) ──
  // 仮説・観察メモの数 + マイルストーン
  const reflectionMemos = (memory?.memos ?? []).filter(
    (m) => m.memoType === "hypothesis" || m.memoType === "observation",
  ).length;
  const rd = Math.min(
    20,
    reflectionMemos * 3 + (memory?.milestoneCount ?? 0) * 2,
  );

  // ── Factor 4: revisionOpenness (0-20) ──
  // 仮説修正回数。修正できる = 成熟の証。
  const ro = Math.min(20, (memory?.revisionCount ?? 0) * 5);

  // ── Factor 5: contradictionAwareness (0-20) ──
  // 矛盾の認識 + 成長シグナル + 繰り返し警告
  const contradictionPatterns = patterns.filter(
    (p) => p.type === "contradiction" || p.type === "growth_signal",
  ).length;
  const hasRepetitionWarning = patterns.some(
    (p) => p.type === "repetition_warning",
  );
  const ca = Math.min(
    20,
    contradictionPatterns * 7 + (hasRepetitionWarning ? 6 : 0),
  );

  const total = dv + cs + rd + ro + ca;

  // ── Stage: 連続スコアから段階を導出 ──
  let stage: OrbiterMaturityStage;
  if (total < 20) stage = "guide";
  else if (total < 45) stage = "mirror";
  else if (total < 70) stage = "coach";
  else stage = "witness";

  // ── Strategic Silence ──
  let shouldBeSilent = false;
  let silenceReason: string | undefined;

  if (
    stage === "witness" &&
    patterns.length === 0 &&
    (memory?.revisionCount ?? 0) > 0
  ) {
    shouldBeSilent = true;
    silenceReason =
      "伝えるべきことは伝えた。新しいパターンが見えたら、また。";
  }

  return {
    stage,
    score: {
      total,
      factors: {
        decisionVolume: dv,
        consistency: cs,
        reflectionDepth: rd,
        revisionOpenness: ro,
        contradictionAwareness: ca,
      },
    },
    reason: `成熟度 ${total}/100 (${stage})`,
    shouldBeSilent,
    silenceReason,
  };
}

// ── Internal Pattern Detectors ──

function detectDecisionStyle(
  decisions: CandidateDecision[],
): CrossCandidatePattern | null {
  if (decisions.length < 5) return null;

  const timesMs = decisions
    .map((d) => d.timeToDecisionMs)
    .filter((t): t is number => t != null);

  if (timesMs.length < 3) return null;

  const avgMs = timesMs.reduce((a, b) => a + b, 0) / timesMs.length;
  const avgVisits =
    decisions.reduce((sum, d) => sum + d.visitCount, 0) / decisions.length;

  // 直感型: 30秒以内 & 平均1.5回以下の訪問
  if (avgMs < 30000 && avgVisits <= 1.5) {
    return {
      type: "decision_style",
      narrative:
        "直感で決めるタイプ。最初の印象を信じる傾向がある。それは強みだが、見落としのリスクもある。",
      confidence: 0.7,
      sampleCount: timesMs.length,
    };
  }

  // 熟考型: 3回以上訪問 or 3分以上
  if (avgVisits >= 3 || avgMs > 180000) {
    return {
      type: "decision_style",
      narrative:
        "じっくり考えて決めるタイプ。慎重さは美徳だが、考えすぎて機会を逃すこともある。",
      confidence: 0.65,
      sampleCount: decisions.length,
    };
  }

  return null;
}

function detectFrictionTolerance(
  likeDecisions: CandidateDecision[],
  passDecisions: CandidateDecision[],
): CrossCandidatePattern | null {
  if (likeDecisions.length < 3) return null;

  // likeした候補者のcautionCode数 vs passした候補者のcautionCode数
  const avgLikeCautions =
    likeDecisions.reduce((sum, d) => sum + d.cautionCodes.length, 0) /
    likeDecisions.length;
  const avgPassCautions =
    passDecisions.length > 0
      ? passDecisions.reduce((sum, d) => sum + d.cautionCodes.length, 0) /
        passDecisions.length
      : 0;

  // likeした相手の方がcautionCodeが多い → 摩擦に惹かれている
  if (avgLikeCautions > avgPassCautions + 1 && avgLikeCautions >= 2) {
    return {
      type: "friction_tolerance",
      narrative:
        "すれ違いリスクが高い相手を選ぶ傾向がある。摩擦の中に成長を見ているのか、困難な関係に慣れているのか。",
      confidence: 0.6,
      sampleCount: likeDecisions.length + passDecisions.length,
    };
  }

  // 逆: cautionCodeが少ない相手だけlikeする → 安全志向
  if (
    avgLikeCautions < 1 &&
    avgPassCautions > avgLikeCautions + 1.5 &&
    passDecisions.length >= 3
  ) {
    return {
      type: "friction_tolerance",
      narrative:
        "安全な相手を選ぶ傾向がある。衝突を避けることが最優先になっている。それは自分を守る本能だが、成長の機会を逃すこともある。",
      confidence: 0.55,
      sampleCount: likeDecisions.length + passDecisions.length,
    };
  }

  return null;
}

function detectContradiction(
  decisions: CandidateDecision[],
): CrossCandidatePattern | null {
  if (decisions.length < 6) return null;

  const likeDecisions = decisions.filter((d) => d.decision === "like");
  const passDecisions = decisions.filter((d) => d.decision === "pass");

  if (likeDecisions.length < 2 || passDecisions.length < 2) return null;

  // category の矛盾: romantic をpass し続けたのに、突然 romantic を like
  const likeCategoryCounts = new Map<string, number>();
  const passCategoryCounts = new Map<string, number>();
  for (const d of likeDecisions)
    likeCategoryCounts.set(
      d.category,
      (likeCategoryCounts.get(d.category) ?? 0) + 1,
    );
  for (const d of passDecisions)
    passCategoryCounts.set(
      d.category,
      (passCategoryCounts.get(d.category) ?? 0) + 1,
    );

  // 訪問回数の矛盾: 直感で決めることもあるが、時に極端に迷う
  const visitCounts = decisions.map((d) => d.visitCount);
  const maxVisits = Math.max(...visitCounts);
  const minVisits = Math.min(...visitCounts);
  const variance = maxVisits - minVisits;

  if (variance >= 4 && decisions.length >= 8) {
    return {
      type: "contradiction",
      narrative: `判断パターンに揺れがある。即決する時もあれば、${maxVisits}回以上迷う時もある。相手のタイプによって、判断の基準が変わっている。`,
      confidence: 0.5,
      sampleCount: decisions.length,
    };
  }

  return null;
}

function detectGrowth(
  decisions: CandidateDecision[],
): CrossCandidatePattern | null {
  if (decisions.length < 6) return null;

  // 時系列で分割: 前半 vs 後半
  const midpoint = Math.floor(decisions.length / 2);
  const older = decisions.slice(midpoint); // older (descending order, so later half is older)
  const newer = decisions.slice(0, midpoint);

  // 判断速度の変化
  const olderTimes = older
    .map((d) => d.timeToDecisionMs)
    .filter((t): t is number => t != null);
  const newerTimes = newer
    .map((d) => d.timeToDecisionMs)
    .filter((t): t is number => t != null);

  if (olderTimes.length >= 2 && newerTimes.length >= 2) {
    const olderAvg = olderTimes.reduce((a, b) => a + b, 0) / olderTimes.length;
    const newerAvg = newerTimes.reduce((a, b) => a + b, 0) / newerTimes.length;

    // 判断速度が40%以上早くなった
    if (newerAvg < olderAvg * 0.6 && olderAvg > 10000) {
      return {
        type: "growth_signal",
        narrative:
          "判断が早くなっている。自分の好みの軸が固まってきた兆候。迷いが減ったのは、自分を理解し始めた証拠。",
        confidence: 0.65,
        sampleCount: decisions.length,
      };
    }

    // 判断速度が遅くなった → 慎重さの成長
    if (newerAvg > olderAvg * 1.5 && newerAvg > 30000) {
      return {
        type: "growth_signal",
        narrative:
          "以前より時間をかけて判断するようになった。表面的な印象だけでなく、深い部分を見ようとしている。",
        confidence: 0.55,
        sampleCount: decisions.length,
      };
    }
  }

  // 訪問回数の変化: 以前は1回で判断していたが、今は複数回見るようになった
  const olderVisitAvg =
    older.reduce((sum, d) => sum + d.visitCount, 0) / older.length;
  const newerVisitAvg =
    newer.reduce((sum, d) => sum + d.visitCount, 0) / newer.length;

  if (newerVisitAvg > olderVisitAvg + 0.8 && newerVisitAvg >= 2) {
    return {
      type: "growth_signal",
      narrative:
        "以前より複数回訪問してから判断するようになった。一つの側面だけでなく、多角的に見ている。成熟の兆し。",
      confidence: 0.6,
      sampleCount: decisions.length,
    };
  }

  return null;
}

function detectRepetition(
  decisions: CandidateDecision[],
): CrossCandidatePattern | null {
  if (decisions.length < 8) return null;

  const likeDecisions = decisions.filter((d) => d.decision === "like");
  if (likeDecisions.length < 3) return null;

  // likeした相手に共通するcautionCodeを発見
  const cautionFrequency = new Map<string, number>();
  for (const d of likeDecisions) {
    for (const code of d.cautionCodes) {
      cautionFrequency.set(code, (cautionFrequency.get(code) ?? 0) + 1);
    }
  }

  // 3回以上同じcautionCodeのある相手をlikeしている
  for (const [code, count] of cautionFrequency.entries()) {
    if (count >= 3) {
      const ratio = count / likeDecisions.length;
      if (ratio >= 0.6) {
        const codeLabel = CAUTION_CODE_LABELS[code] ?? code;
        return {
          type: "repetition_warning",
          narrative: `likeした相手の${Math.round(ratio * 100)}%に「${codeLabel}」のすれ違いリスクがある。同じタイプの摩擦を繰り返す傾向。これは無意識のパターンかもしれない。`,
          confidence: 0.6,
          sampleCount: likeDecisions.length,
        };
      }
    }
  }

  return null;
}

// ── Caution Code Labels ──

const CAUTION_CODE_LABELS: Record<string, string> = {
  conflict_style_gap: "衝突スタイルのずれ",
  distance_need_gap: "距離感のずれ",
  emotional_expression_gap: "感情表現のずれ",
  depth_progression_gap: "関係深化ペースのずれ",
  silence_interpretation_gap: "沈黙の解釈のずれ",
  initiative_gap: "主導権のずれ",
  decision_speed_gap: "決断スピードのずれ",
  rhythm_gap: "生活リズムのずれ",
  social_energy_gap: "社交エネルギーのずれ",
  planning_gap: "計画性のずれ",
};
