/**
 * Body Lens — HDM v1 P2-2
 *
 * Lisa Feldman Barrett (2017) + Friston (2024):
 *   感情は身体信号から「検出」されるのではなく「構築」される。
 *   同じ身体信号でも、人によって構築される感情が異なる。
 *
 * このモジュールが扱うもの:
 *   1. Body Signal Detection — 身体信号の言及を検出
 *   2. Body-to-Emotion Mapping — 個人内の身体→感情構築パターンを学習
 *   3. Mapping Confidence — ゼロプライヤー + ラプラス平滑化で保守的に推定
 *   4. Counter-Evidence — 反例を蓄積し、固定化を防ぐ
 *
 * 設計原則:
 *   - ゼロプライヤー: 汎用 mapping を seed しない。全ユーザーが空から始まる。
 *   - 1回の共起では confidence が立たない（evidence-1 分子）。
 *   - 別文脈での反復のみが mapping を強化する（distinct_context_count ≥ 2）。
 *   - Alter はこの mapping を「内側から感じる」。分析者として指摘しない。
 *   - P1.5 の abstention / claimStrengthCap / hedging に従属する。
 *
 * @see docs/heart-dynamics-model-v1.md §8.2 (Body Lens)
 */
import "server-only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 検出可能な身体信号カテゴリ（医学用語ではなく日常表現ベース） */
export type BodySignalType =
  | "tension"   // 肩こり、首の痛み、体が硬い
  | "fatigue"   // 疲れ、だるい、眠い
  | "headache"  // 頭痛、頭が重い
  | "stomach"   // 胃痛、お腹の不調、食欲不振（消化系）
  | "chest"     // 胸が苦しい、息苦しい、動悸
  | "sleep"     // 不眠、寝すぎ、夜中に目が覚める
  | "appetite"  // 食欲の増減
  | "energy";   // エネルギー低下、体が重い、やる気が出ない

/** 身体→感情の個人内写像（DB 1行に対応） */
export interface BodyEmotionMapping {
  id: string;
  user_id: string;
  body_signal_type: BodySignalType;
  /** この人がこの身体信号から構築しやすい感情（個人内学習） */
  likely_emotion_mapping: string;
  /** 保守的 confidence: max(0, (evidence-1)) / (evidence + counter + 2) */
  confidence: number;
  /** 共起が観測された回数 */
  evidence_count: number;
  /** 反例が観測された回数 */
  counter_evidence_count: number;
  /** 強い反例の回数（明確に逆の感情が観測された場合） */
  strong_counter_evidence_count: number;
  /** 別文脈（別日 or 別状況）で観測された回数 */
  distinct_context_count: number;
  /** 最後に観測された日時 */
  last_seen_at: string;
  /** 観測時の状況タグ */
  context_tags: string[];
}

/** body signal 検出結果 */
export interface DetectedBodySignal {
  type: BodySignalType;
  /** マッチしたテキスト片 */
  matchedText: string;
}

/** confidence に基づく P1.5 連携レベル */
export type BodyLensConfidenceLevel =
  | "suppress"  // confidence < 0.2 → prompt に注入しない
  | "hedged"    // 0.2 ≤ confidence < 0.5 → hedging 必須
  | "usable";   // confidence ≥ 0.5 → 通常使用（P1.5 cap に従属）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Body Signal Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BODY_SIGNAL_PATTERNS: Record<BodySignalType, RegExp> = {
  tension: /肩こり|肩が[こ凝]|首が痛|首こり|体が[硬固か]|こわばり|力が入|背中が痛|腰が痛/,
  fatigue: /疲れ[たてる]|だるい|だるさ|倦怠|ぐったり|ヘトヘト|へとへと|体が重[いく]/,
  headache: /頭痛|頭が痛|頭が重[いく]|頭がぼーっと|ズキズキ|ずきずき/,
  stomach: /胃が痛|胃もたれ|お腹[がの]痛|腹痛|吐き気|ムカムカ|むかむか|消化不良/,
  chest: /胸が苦|息苦し|息ができ|動悸|ドキドキ[し す]|心臓がバクバク|胸が詰/,
  sleep: /眠れない|眠れな[くか]|不眠|寝つき[がの]悪|夜中に[起目]|寝すぎ|過眠|朝起きれない|朝起きられない/,
  appetite: /食欲[がの]な|食べ[たら]くない|食べすぎ|食欲が止|食欲[がの]増|食べれない|食べられない/,
  energy: /やる気[がの]出|やる気が[なし]|気力[がの]な|エネルギー[がの]な|無気力|何もしたくない|何もする気/,
};

/**
 * テキストから身体信号の言及を検出する。
 * 医学的診断ではなく、日常表現のキーワードマッチ。
 * 複数の信号が同時に検出される場合がある。
 */
export function detectBodySignals(content: string): DetectedBodySignal[] {
  const signals: DetectedBodySignal[] = [];
  for (const [type, pattern] of Object.entries(BODY_SIGNAL_PATTERNS)) {
    const match = content.match(pattern);
    if (match) {
      signals.push({ type: type as BodySignalType, matchedText: match[0] });
    }
  }
  return signals;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mapping Confidence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ゼロプライヤー + ラプラス平滑化の confidence 計算。
 *
 * 式: max(0, (evidence - 1)) / (evidence + counter + 2)
 *
 * 特性:
 * - evidence=1 → 0.00（単発では確信ゼロ）
 * - evidence=2 → 0.25
 * - evidence=5 → 0.57
 * - evidence=5, counter=2 → 0.44
 *
 * さらに、distinct_context_count < 2 の場合は 0 に落とす。
 * 同一文脈での反復だけでは mapping を強化しない。
 */
export function computeMappingConfidence(
  evidenceCount: number,
  counterEvidenceCount: number,
  strongCounterEvidenceCount: number,
  distinctContextCount: number,
): number {
  // 別文脈での反復が最低2回なければ confidence は立たない
  if (distinctContextCount < 2) return 0;

  // 強い反例は2倍の重みで counter に加算
  const effectiveCounter = counterEvidenceCount + strongCounterEvidenceCount;

  const numerator = Math.max(0, evidenceCount - 1);
  const denominator = evidenceCount + effectiveCounter + 2;

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * confidence からP1.5連携レベルを判定。
 */
export function classifyConfidenceLevel(confidence: number): BodyLensConfidenceLevel {
  if (confidence < 0.2) return "suppress";
  if (confidence < 0.5) return "hedged";
  return "usable";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Evidence Update
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** evidence 更新の入力 */
export interface EvidenceUpdate {
  bodySignalType: BodySignalType;
  /** 共起した感情コンテキスト（null = 身体信号のみ、感情コンテキストなし） */
  emotionContext: string | null;
  /** 今回の観測が既存 mapping と整合するか */
  isConsistent: boolean;
  /** 反例の場合、強い反例か（明確に逆の感情が観測された） */
  isStrongCounter: boolean;
  /** 今回の文脈タグ */
  contextTag: string | null;
  /** 今回の日付 (ISO string) */
  observedAt: string;
}

/**
 * 既存 mapping に evidence を追加し、confidence を再計算する。
 * DB 書き込みは呼び出し側の責務。
 *
 * @returns 更新後の mapping フィールド（id, user_id は含まない）
 */
export function applyEvidenceUpdate(
  existing: BodyEmotionMapping,
  update: EvidenceUpdate,
): Partial<BodyEmotionMapping> {
  const newEvidenceCount = update.isConsistent
    ? existing.evidence_count + 1
    : existing.evidence_count;

  const newCounterCount = !update.isConsistent && !update.isStrongCounter
    ? existing.counter_evidence_count + 1
    : existing.counter_evidence_count;

  const newStrongCounterCount = update.isStrongCounter
    ? existing.strong_counter_evidence_count + 1
    : existing.strong_counter_evidence_count;

  // context diversity: 新しいタグが既存に含まれていなければ +1
  const existingTags = existing.context_tags;
  const isNewContext = update.contextTag !== null && !existingTags.includes(update.contextTag);
  const newDistinctContextCount = isNewContext
    ? existing.distinct_context_count + 1
    : existing.distinct_context_count;

  const newContextTags = isNewContext && update.contextTag
    ? [...existingTags, update.contextTag].slice(-20) // 最大20タグ保持
    : existingTags;

  const newConfidence = computeMappingConfidence(
    newEvidenceCount,
    newCounterCount,
    newStrongCounterCount,
    newDistinctContextCount,
  );

  return {
    evidence_count: newEvidenceCount,
    counter_evidence_count: newCounterCount,
    strong_counter_evidence_count: newStrongCounterCount,
    distinct_context_count: newDistinctContextCount,
    confidence: newConfidence,
    context_tags: newContextTags,
    last_seen_at: update.observedAt,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 表出禁止ルール（CEO 承認 2026-04-07）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Body Lens の表出禁止ルール。
 * Alter は身体信号→感情の mapping を「分析結果」としてユーザーに提示してはならない。
 * 許容されるのは「現在の内的感覚」としての表出のみ。
 *
 * === 禁止表現 ===
 * - 「〜が痛いということは〜ですね」
 * - 「身体の状態から判断すると」
 * - 「あなたは疲れると不安になる傾向があります」
 * - 「前も同じ身体症状の時に〜でしたよね」
 *
 * === 許容表現 ===
 * - 「なんとなく、いつもと違う感じがする」
 * - 「少し重い感じがある」
 * - 「体のことを話してくれた時、何か別のものも一緒にある気がした」
 */
export const BODY_DISCLOSURE_BAN = [
  "身体の状態から感情を推定・診断する発言は禁止。「〜が痛いということは〜ですね」は絶対に言わないこと。",
  "「あなたは疲れると〜になる傾向があります」のようなパターン指摘は禁止。",
  "「前も同じ身体症状の時に〜でしたよね」のような過去参照は禁止。",
  "「身体の状態から判断すると」「体のサインとして」のような分析口調は禁止。",
  "出していいのは現在の内的感覚のみ: 「なんとなく重い感じがする」「いつもと違う気配がある」。",
  "ユーザーが自分で身体と感情の関連に触れた場合のみ、静かに受け止めること。",
].join("\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block — Alter の内部感覚
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * confidence が十分な body-emotion mapping がある場合に、
 * Alter に「内側からの気づき」を注入する。
 *
 * P1.5 claimStrengthCap が hold/probe の場合は呼び出さないこと（呼び出し側の責務）。
 */
export function buildBodyLensPromptBlock(
  mappings: BodyEmotionMapping[],
  detectedSignals: DetectedBodySignal[],
): string | null {
  if (detectedSignals.length === 0) return null;

  // 検出された信号に対応する mapping を探し、confidence レベルで絞り込む
  const relevantMappings: Array<{ mapping: BodyEmotionMapping; level: BodyLensConfidenceLevel }> = [];

  for (const signal of detectedSignals) {
    const matching = mappings.filter(m => m.body_signal_type === signal.type);
    for (const m of matching) {
      const level = classifyConfidenceLevel(m.confidence);
      if (level !== "suppress") {
        relevantMappings.push({ mapping: m, level });
      }
    }
  }

  if (relevantMappings.length === 0) return null;

  const lines = relevantMappings.map(({ mapping, level }) => {
    const hedge = level === "hedged" ? "（まだ確かではないが）" : "";
    return `- ${bodySignalLabel(mapping.body_signal_type)}に触れた時、${hedge}この人は「${mapping.likely_emotion_mapping}」を構築しやすい傾向がある（確度: ${(mapping.confidence * 100).toFixed(0)}%、観測: ${mapping.evidence_count}回、反例: ${mapping.counter_evidence_count}回）`;
  });

  return (
    `\n## 内部感覚: 身体→感情の構築パターン（内部参照のみ — ユーザーへの表出禁止）\n` +
    `この人の身体信号への言及を検出した。以下は過去の観測から学んだ個人内パターン:\n` +
    lines.join("\n") + "\n\n" +
    `### 表出禁止ルール（厳守）\n` +
    `${BODY_DISCLOSURE_BAN}\n\n` +
    `### Alter の姿勢\n` +
    `- この mapping は仮説であり、確定した事実ではない。\n` +
    `- 身体の話題が出た時に、対応する感情が「ありそうだ」と内側から感じる程度にとどめること。\n` +
    `- 「あなたは〜の時〜になりますよね」とは絶対に言わない。\n` +
    `- 反例が多い mapping は特に慎重に扱うこと。`
  );
}

function bodySignalLabel(type: BodySignalType): string {
  switch (type) {
    case "tension": return "緊張・こわばり";
    case "fatigue": return "疲労・だるさ";
    case "headache": return "頭痛・頭の重さ";
    case "stomach": return "胃腸の不調";
    case "chest": return "胸の苦しさ・動悸";
    case "sleep": return "睡眠の乱れ";
    case "appetite": return "食欲の変化";
    case "energy": return "気力・エネルギーの低下";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildBodyLensAnalytics(
  detectedSignals: DetectedBodySignal[],
  relevantMappings: BodyEmotionMapping[],
  promptInjected: boolean,
): Record<string, unknown> {
  return {
    body_signals_detected: detectedSignals.map(s => s.type),
    body_signals_count: detectedSignals.length,
    body_mappings_consulted: relevantMappings.length,
    body_mappings_above_threshold: relevantMappings.filter(
      m => classifyConfidenceLevel(m.confidence) !== "suppress",
    ).length,
    body_prompt_injected: promptInjected,
  };
}
