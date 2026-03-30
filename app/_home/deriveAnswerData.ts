/**
 * Derives "Answer Card" and "Why Card" data from existing home data.
 * Pure function — no side effects.
 */
import type { ReasoningSource } from "@/components/home/WhyCard";

type AnswerInput = {
  convergentInsight: {
    todayInsight?: { unifiedInsight?: string } | null;
    narrativeLines?: string[];
    sources?: string[];
  } | null;
  temporalMirror: {
    delta?: { deltaNarrative?: string } | null;
  } | null;
  blindSpot: { message?: string } | null;
  prophecy: {
    prediction?: string;
    reasoning?: string;
    accuracy?: number;
  } | null;
  innerWeather: {
    emoji?: string;
    label?: string;
    message?: string;
  } | null;
  sgData: {
    observationCount?: number;
    confidence?: number;
    archetype?: string;
  } | null;
};

export type AnswerData = {
  proposal: string | null;
  confidence: number;
  alternative: string | null;
  caution: string | null;
  sources: string[];
  observationCount: number;
};

export type WhyData = {
  sources: ReasoningSource[];
  shiftedAxis: string | null;
  trendSummary: string | null;
  observationCount: number;
};

// ── Helper: score → human-readable ──

function scoreToWord(n: number): string {
  if (n >= 0.8) return "非常に強い";
  if (n >= 0.6) return "強い";
  if (n >= 0.3) return "やや";
  if (n >= 0) return "穏やかな";
  if (n >= -0.3) return "やや控えめな";
  if (n >= -0.6) return "控えめな";
  return "非常に控えめな";
}

/**
 * AI生成テキスト内の生スコア（0.81, -0.5, スコア0.7 等）を
 * 自然な日本語に変換する。
 *
 * 対応パターン:
 *  "スコア0.81"         → "非常に強い"
 *  "0.81の強い傾向"     → "非常に強い傾向"  (重複形容詞を除去)
 *  "0.65の傾向"         → "強い傾向"
 *  "-0.5の"             → "やや控えめな"
 *  "score: 0.8"         → "非常に強い"
 *  "0.81"(単体)         → "非常に強い"
 */
export function humanizeScoresInText(text: string): string {
  let result = text;

  // 1. "スコア0.81" / "スコア -0.5"
  result = result.replace(/スコア\s*[-]?\d+(\.\d+)?/g, (m) => {
    const n = parseFloat(m.replace(/スコア\s*/, ""));
    return scoreToWord(n);
  });

  // 2. "score: 0.81" / "score:-0.5" (英語パターン)
  result = result.replace(/score:\s*[-]?\d+(\.\d+)?/gi, (m) => {
    const n = parseFloat(m.replace(/score:\s*/i, ""));
    return scoreToWord(n);
  });

  // 3. "0.81の強い" / "0.65の高い" → "非常に強い" (数値+の+形容詞 → 変換値のみ)
  result = result.replace(
    /[-]?\d+\.\d+(の)(強い|弱い|高い|低い)/g,
    (_m, _no, _adj) => {
      const n = parseFloat(_m);
      return scoreToWord(n);
    },
  );

  // 4. "0.81の傾向" → "非常に強い傾向" (数値+の+名詞)
  result = result.replace(
    /[-]?\d+\.\d+(の)/g,
    (_m, _suffix) => {
      const n = parseFloat(_m);
      return `${scoreToWord(n)}`;
    },
  );

  // 5. 残った単体の小数 "0.81" "−0.5" (前後が数字でない場合)
  result = result.replace(
    /(?<![.\d])[-]?\d+\.\d+(?![.\d%])/g,
    (m) => scoreToWord(parseFloat(m)),
  );

  // 6. 変換後の不自然な重複・接続を修正
  const LABELS = "非常に強い|強い|やや|穏やかな|やや控えめな|控えめな|非常に控えめな";
  const labelsRe = new RegExp(`(${LABELS})`, "g");

  //  "強いの傾向" → "強い傾向"  ("い"で終わる変換語 + "の" → "の"を除去)
  result = result.replace(new RegExp(`(${LABELS})の`, "g"), (m, label) => {
    return label.endsWith("い") ? label : m;
  });
  //  "非常に強い強い" → "非常に強い" (変換語 + 重複形容詞)
  result = result.replace(new RegExp(`(${LABELS})(強い|弱い|高い|低い)`, "g"), "$1");
  //  "非常に強い非常に強い" → "非常に強い" (同じ変換語の連続)
  result = result.replace(new RegExp(`(${LABELS})\\1`, "g"), "$1");
  //  "非常に強い傾向が強いため" → "非常に強い傾向のため" (変換語+傾向+が強い/が高い)
  result = result.replace(new RegExp(`(${LABELS})(傾向|度合い|度)(が)(強い|高い)`, "g"), "$1$2の");

  // 7. 空白正規化
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}

function humanizeProphecyReasoning(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const parts: string[] = [];
    if (Array.isArray(parsed.primaryAxes) && parsed.primaryAxes.length > 0) {
      const AXIS_LABELS: Record<string, string> = {
        risk_tolerance: "リスク許容度", social_harmony: "社会的調和",
        novelty_seeking: "新奇性追求", emotional_regulation: "感情調整力",
        analytical_thinking: "分析的思考", independence: "独立性",
        empathy: "共感力", perfectionism: "完璧主義",
        impulsivity: "衝動性", cautiousness: "慎重さ",
        openness: "開放性", conscientiousness: "誠実性",
      };
      const labels = parsed.primaryAxes
        .map((a: string) => AXIS_LABELS[a] ?? a.replace(/_/g, " "))
        .slice(0, 3);
      parts.push(`${labels.join("・")}の傾向に基づく予測`);
    }
    const influences: string[] = [];
    if (parsed.archetypeInfluence > 0.3) influences.push("性格タイプの特徴");
    if (parsed.weatherInfluence > 0.2) influences.push("内面状態の変化");
    if (parsed.patternInfluence > 0.4) influences.push("過去の行動パターン");
    if (influences.length > 0) parts.push(`${influences.join("と")}を重視`);
    if (parsed.triggerCondition) parts.push(parsed.triggerCondition);
    if (parts.length > 0) return parts.join("。") + "。";
  } catch { /* Not JSON */ }
  const cleaned = humanizeScoresInText(raw);
  return cleaned || "観測データに基づく予測";
}

// ── Main derivation functions ──

export function deriveAnswerData(input: AnswerInput): AnswerData {
  const obsCount = input.sgData?.observationCount ?? 0;
  const confidence = input.sgData?.confidence ?? 0;

  // Build proposal from convergent insight or prophecy
  let proposal: string | null = null;
  const sources: string[] = [];

  if (input.convergentInsight?.todayInsight?.unifiedInsight) {
    proposal = input.convergentInsight.todayInsight.unifiedInsight;
    if (input.convergentInsight.sources) {
      sources.push(...input.convergentInsight.sources);
    }
  } else if (input.prophecy?.prediction) {
    proposal = input.prophecy.prediction;
    sources.push("予言エンジン");
  } else if (input.temporalMirror?.delta?.deltaNarrative) {
    proposal = `${input.temporalMirror.delta.deltaNarrative} — 今日はそこを意識してみて。`;
    sources.push("時間変化");
  }

  // Alternative from blind spot
  const alternative = input.blindSpot?.message ?? null;

  // Caution from inner weather — enrich brief labels into actionable context
  let caution: string | null = null;
  if (input.innerWeather?.message) {
    const raw = input.innerWeather.message;
    const label = input.innerWeather.label ?? "";
    // If the weather message is too brief (just a label), enrich it
    if (raw.length < 20) {
      caution = `内面の状態「${label || raw}」を検知。この状態では普段と判断基準がずれやすいため、大きな決断は少し間を置いてから。`;
    } else {
      caution = raw;
    }
    if (!sources.includes("内面天気")) sources.push("内面天気");
  }

  return {
    proposal: proposal ? humanizeScoresInText(proposal) : null,
    confidence,
    alternative: alternative ? humanizeScoresInText(alternative) : null,
    caution: caution ? humanizeScoresInText(caution) : null,
    sources,
    observationCount: obsCount,
  };
}

export function deriveWhyData(input: AnswerInput): WhyData {
  const obsCount = input.sgData?.observationCount ?? 0;
  const archetypeName = input.sgData?.archetype;
  const confidence = input.sgData?.confidence ?? 0;
  const sources: ReasoningSource[] = [];

  // Convergent insight narrative lines → reasoning
  if (input.convergentInsight?.narrativeLines) {
    for (const line of input.convergentInsight.narrativeLines.slice(0, 3)) {
      sources.push({
        icon: "📊",
        label: "統合分析",
        detail: line,
        type: "pattern",
      });
    }
  }

  // Temporal mirror → temporal source
  if (input.temporalMirror?.delta?.deltaNarrative) {
    sources.push({
      icon: "⏳",
      label: "時間変化",
      detail: input.temporalMirror.delta.deltaNarrative,
      type: "temporal",
    });
  }

  // Blind spot → blindspot source
  if (input.blindSpot?.message) {
    sources.push({
      icon: "👁",
      label: "盲点検知",
      detail: input.blindSpot.message,
      type: "blindspot",
    });
  }

  // Prophecy reasoning — humanize raw data
  if (input.prophecy?.reasoning) {
    sources.push({
      icon: "🔮",
      label: "予言根拠",
      detail: humanizeProphecyReasoning(input.prophecy.reasoning),
      type: "prophecy",
    });
  }

  // Inner weather — connect to judgment, not just status display
  if (input.innerWeather?.label) {
    const weatherJudgmentLink = buildWeatherJudgmentLink(
      input.innerWeather.label,
      input.innerWeather.emoji,
    );
    sources.push({
      icon: input.innerWeather.emoji ?? "🌤",
      label: "内面天気",
      detail: weatherJudgmentLink,
      type: "weather",
    });
  }

  // Trend summary — specific, referencing actual profile data
  let trendSummary: string | null = null;
  if (input.convergentInsight?.todayInsight?.unifiedInsight) {
    trendSummary = buildTrendSummary(obsCount, confidence, archetypeName, input);
  } else if (obsCount >= 5 && archetypeName) {
    trendSummary = `${archetypeName}型の判断傾向をベースに回答しています`;
  }

  // Shifted axis — extract meaningful content from deltaNarrative
  let shiftedAxis: string | null = null;
  if (input.temporalMirror?.delta?.deltaNarrative) {
    const delta = input.temporalMirror.delta.deltaNarrative;
    // Use first meaningful clause (up to 25 chars) instead of generic label
    const snippet = delta.length > 25 ? delta.slice(0, 25) + "…" : delta;
    shiftedAxis = snippet;
  }

  return {
    sources,
    shiftedAxis,
    trendSummary,
    observationCount: obsCount,
  };
}

/** Weather → judgment connection text (not just status display) */
function buildWeatherJudgmentLink(label: string, emoji?: string): string {
  const e = emoji ?? "";
  const map: Record<string, string> = {
    穏やか: `${e} 穏やかな状態 — 普段通りの判断軸で回答中`,
    エネルギッシュ: `${e} 高エネルギー — リスク許容度がやや上がった状態で回答中`,
    モヤモヤ: `${e} 曖昧な状態 — 慎重寄りの判断軸にシフトして回答中`,
    低空飛行: `${e} 低エネルギー — 負荷の少ない選択肢を優先して回答中`,
    イライラ: `${e} 緊張状態 — 衝動的判断を抑える方向で回答中`,
  };
  return map[label] ?? `${e} ${label}の状態を判断に反映中`;
}

/** Build a specific trend summary referencing actual data */
function buildTrendSummary(
  obsCount: number,
  confidence: number,
  archetypeName: string | undefined,
  input: AnswerInput,
): string {
  const parts: string[] = [];

  // Base: observation count + archetype
  if (archetypeName) {
    parts.push(`${archetypeName}型 × ${obsCount}回の観測データ`);
  } else {
    parts.push(`${obsCount}回の観測データ`);
  }

  // Weather influence
  if (input.innerWeather?.label) {
    parts.push(`今の状態（${input.innerWeather.label}）`);
  }

  // Blind spot or prophecy as extra signal
  if (input.blindSpot?.message) {
    parts.push("盲点パターン");
  } else if (input.prophecy?.accuracy && input.prophecy.accuracy > 0.5) {
    parts.push(`予測精度${Math.round(input.prophecy.accuracy * 100)}%の行動予測`);
  }

  return parts.join(" + ") + "から導出";
}

