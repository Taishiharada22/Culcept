/**
 * Narrative Lens — HDM v1 P2-1
 *
 * McAdams (2001) + Friston (2024):
 *   人間は自己を「物語」として理解する。
 *   心の動態とは「出来事」ではなく「意味づけの変化」である。
 *
 * このモジュールが扱うもの:
 *   1. Interpretation Shift — 同じ出来事への意味づけの変化を検出
 *   2. Valence / Agency — 解釈の感情極性と主体性を分類
 *   3. Narrative Freezing — 解釈が固着し変化が止まった状態を検出
 *   4. Revision Tracking — 書き換え履歴を保持（上書きではなく蓄積）
 *
 * 設計原則:
 *   - Alter はこの変化を「内側から感じる」。分析者として指摘しない。
 *   - freezing 検出は P1.5 negcap の hypothesis_shake と接続する。
 *   - narrative は仮説であり、確定事実ではない。
 *
 * @see docs/heart-dynamics-model-v1.md §8.1 (Narrative Identity)
 */
import "server-only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 解釈の感情極性 */
export type NarrativeValence = "positive" | "negative" | "neutral" | "ambivalent";

/** 解釈における主体性 */
export type NarrativeAgency = "actor" | "receiver" | "observer" | "unknown";

/** 解釈の1スナップショット（interpretation_history の1エントリ） */
export interface NarrativeInterpretation {
  /** そのとき抽出された内容 */
  content: string;
  /** 感情極性 */
  valence: NarrativeValence;
  /** 主体性 */
  agency: NarrativeAgency;
  /** 記録日時 (ISO string) */
  at: string;
}

/** 解釈の書き換え（old → new） */
export interface NarrativeRevision {
  /** 以前の解釈 */
  from: NarrativeInterpretation;
  /** 現在の解釈 */
  to: NarrativeInterpretation;
  /** 変化の種類 */
  shiftType: NarrativeShiftType;
}

/** 解釈変化の種類 */
export type NarrativeShiftType =
  | "valence_flip"       // 極性反転（negative → positive etc.）
  | "agency_shift"       // 主体性変化（receiver → actor etc.）
  | "reframe"            // 同じ出来事への再解釈（内容が大幅に変化）
  | "softening"          // 断定 → 留保（「〜だ」→「〜かもしれない」）
  | "intensification"    // 留保 → 断定
  | "minor_variation";   // 表現の微差（心の動態としては小さい）

/** Narrative Freezing 検出結果 */
export interface NarrativeFreezingAlert {
  /** 固着しているか */
  isFrozen: boolean;
  /** 固着している narrative の theme */
  frozenThemes: string[];
  /** 固着期間（日数） */
  frozenDays: number;
  /** negcap shake に接続すべきか */
  shouldTriggerShake: boolean;
  /** Alter の内部感覚（prompt用） */
  innerSense: string | null;
}

/** DB の narrative エントリ（拡張版） */
export interface NarrativeWithHistory {
  id: string;
  theme: string;
  content: string;
  domain: string | null;
  mention_count: number;
  first_mentioned: string;
  last_mentioned: string;
  interpretation_history: NarrativeInterpretation[];
  current_valence: NarrativeValence | null;
  current_agency: NarrativeAgency | null;
  revision_count: number;
  frozen_since: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Valence Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NEGATIVE_PATTERNS = /苦手|嫌[いだ]|ダメ|できない|無理|怖い|不安|辛い|しんどい|魅力がない|自信がない|弱い|下手|ネガティブ/;
const POSITIVE_PATTERNS = /好き|得意|自信がある|強み|楽しい|心地いい|誇り|嬉しい|魅力|上手|ポジティブ/;
const HEDGE_PATTERNS = /かもしれない|気がする|んだと思う|ところがある|かな|だろう|ような/;
const AMBIVALENT_PATTERNS = /でも|けど|一方で|反面|矛盾|ときもある|場合による/;

/**
 * narrative の内容から感情極性を分類する。
 * LLM を使わない。キーワードベースで十分な精度を得る。
 */
export function classifyValence(content: string): NarrativeValence {
  const hasNeg = NEGATIVE_PATTERNS.test(content);
  const hasPos = POSITIVE_PATTERNS.test(content);

  if (hasNeg && hasPos) return "ambivalent";
  if (AMBIVALENT_PATTERNS.test(content)) return "ambivalent";
  if (hasNeg) return "negative";
  if (hasPos) return "positive";
  return "neutral";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Agency Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ACTOR_PATTERNS = /(?:[私自分俺僕](?:[はがも])?(?:選|決|動|変え|挑|始|やめ|断|切り替え|向き合)|自分で(?:選|決|動|変え)|選んで動|決めて動|変えよう|切り替え)/;
const RECEIVER_PATTERNS = /(?:される|された|されて|させられ|言われ|振り回|流され|影響を受|巻き込|仕方な)/;
const OBSERVER_PATTERNS = /(?:みたい|ようだ|らしい|見える|感じがする|傾向がある|パターン|いつの間にか)/;

export function classifyAgency(content: string): NarrativeAgency {
  const actorMatch = ACTOR_PATTERNS.test(content);
  const receiverMatch = RECEIVER_PATTERNS.test(content);
  const observerMatch = OBSERVER_PATTERNS.test(content);

  if (actorMatch && !receiverMatch) return "actor";
  if (receiverMatch && !actorMatch) return "receiver";
  if (observerMatch) return "observer";
  if (actorMatch && receiverMatch) return "observer"; // 両方ある = 自分を俯瞰
  return "unknown";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Interpretation Shift Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同じ theme に対する2つの content を比較し、
 * 解釈の変化を検出する。
 *
 * LLM 不使用。パターンマッチ + 文字列類似度で判定。
 */
export function detectInterpretationShift(
  oldContent: string,
  newContent: string,
): NarrativeShiftType {
  const oldValence = classifyValence(oldContent);
  const newValence = classifyValence(newContent);
  const oldAgency = classifyAgency(oldContent);
  const newAgency = classifyAgency(newContent);

  // 1. 極性反転
  if (
    (oldValence === "negative" && newValence === "positive") ||
    (oldValence === "positive" && newValence === "negative")
  ) {
    return "valence_flip";
  }

  // 2. 留保の出現/消失（内容が似ている場合に有効）
  const oldHedge = HEDGE_PATTERNS.test(oldContent);
  const newHedge = HEDGE_PATTERNS.test(newContent);
  const similarity = computeContentSimilarity(oldContent, newContent);
  if (similarity > 0.3 && !oldHedge && newHedge) return "softening";
  if (similarity > 0.3 && oldHedge && !newHedge) return "intensification";

  // 3. 主体性変化（受動 → 能動は特に重要）
  if (oldAgency !== newAgency && oldAgency !== "unknown" && newAgency !== "unknown") {
    return "agency_shift";
  }

  // 4. 内容の大幅な変化 → reframe（保守的: 類似度 0.3 未満のみ）
  if (similarity < 0.3) return "reframe";

  return "minor_variation";
}

/**
 * 2つの文字列の bigram 類似度を計算する（0-1）。
 * Jaccard 係数ベース。LLM 不使用。
 */
export function computeContentSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Narrative Freezing Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 固着とみなす最小日数 */
const FREEZING_MIN_DAYS = 14;
/** 固着とみなす最小 mention 回数 */
const FREEZING_MIN_MENTIONS = 4;

/**
 * narrative が「固着」しているかを判定する。
 *
 * 固着 = 複数回言及されているのに、解釈が一度も変わっていない状態。
 * これは narrative identity の硬直化を示す。
 * 「自分は〜な人間だ」が自己fulfilling prophecy になるリスク。
 */
export function detectNarrativeFreezing(
  narratives: NarrativeWithHistory[],
): NarrativeFreezingAlert {
  const frozenThemes: string[] = [];
  let maxFrozenDays = 0;

  for (const n of narratives) {
    // revision がない + 十分な言及回数 + 十分な期間
    if (n.revision_count === 0 && n.mention_count >= FREEZING_MIN_MENTIONS) {
      const daysSinceFirst = (Date.now() - new Date(n.first_mentioned).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst >= FREEZING_MIN_DAYS) {
        frozenThemes.push(n.theme);
        maxFrozenDays = Math.max(maxFrozenDays, daysSinceFirst);
      }
    }
  }

  if (frozenThemes.length === 0) {
    return {
      isFrozen: false,
      frozenThemes: [],
      frozenDays: 0,
      shouldTriggerShake: false,
      innerSense: null,
    };
  }

  return {
    isFrozen: true,
    frozenThemes,
    frozenDays: Math.round(maxFrozenDays),
    shouldTriggerShake: true,
    innerSense: buildFreezingInnerSense(frozenThemes),
  };
}

function buildFreezingInnerSense(themes: string[]): string {
  const themeList = themes.slice(0, 3).map(t => `「${t}」`).join("、");
  return (
    `## 内部感覚: 物語の固着の兆候（内部参照のみ — ユーザーへの表出禁止）\n` +
    `${themeList}についての自己認識が長期間変わっていない兆候がある。\n` +
    `この物語が「固定ラベル」になりつつある可能性がある。ただし断定はしない。\n\n` +
    `### 表出禁止ルール（厳守）\n` +
    `${NARRATIVE_DISCLOSURE_BAN}\n\n` +
    `### Alter の姿勢\n` +
    `- この兆候を「確定した固着」として扱わないこと。あくまで兆候。\n` +
    `- この認識を「正しい」として扱わないこと\n` +
    `- 「本当に今もそうなのか」を、指摘ではなく好奇心として持つこと\n` +
    `- 例外（この物語に合わない瞬間）に自然に注目すること\n` +
    `- 直接「変わったんじゃない？」とは言わない。ただ、揺れの可能性を内側から感じること`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Revision Entry Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新しい解釈が検出された時、revision エントリを生成する。
 * minor_variation は revision としてカウントしない（ノイズ除去）。
 */
export function buildRevisionEntry(
  oldContent: string,
  newContent: string,
): { isRevision: boolean; revision: NarrativeRevision | null; newInterpretation: NarrativeInterpretation } {
  const shiftType = detectInterpretationShift(oldContent, newContent);
  const now = new Date().toISOString();

  const newInterpretation: NarrativeInterpretation = {
    content: newContent,
    valence: classifyValence(newContent),
    agency: classifyAgency(newContent),
    at: now,
  };

  if (shiftType === "minor_variation") {
    return { isRevision: false, revision: null, newInterpretation };
  }

  const oldInterpretation: NarrativeInterpretation = {
    content: oldContent,
    valence: classifyValence(oldContent),
    agency: classifyAgency(oldContent),
    at: now, // 旧解釈の at は DB から取るべきだが、ここでは近似
  };

  return {
    isRevision: true,
    revision: {
      from: oldInterpretation,
      to: newInterpretation,
      shiftType,
    },
    newInterpretation,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 表出禁止ルール（CEO 承認 2026-04-07）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * narrative の履歴に基づく表出の禁止ルール。
 * Alter は過去の解釈を「直接引用」してはならない。
 * 許容されるのは「現在の内的感覚」としての表出のみ。
 *
 * === 禁止表現（テストで固定） ===
 * - 「前はこう言っていたよね」
 * - 「以前はこういう人だった」
 * - 「あなたの物語は今こう変わった」
 * - 「前は〜だったのに」
 * - 「昔は〜と言ってたけど」
 * - 過去の content の直接引用
 *
 * === 許容表現 ===
 * - 「今は前より少し軽く感じる」
 * - 「この話題の重さが前と違う気がする」
 * - 「なんとなく、前とは違うトーンを感じる」
 */
export const NARRATIVE_DISCLOSURE_BAN = [
  "「前はこう言っていたよね」「以前はこういう人だった」「あなたの物語は今こう変わった」は絶対に言わないこと。",
  "過去にユーザーが述べた内容を直接引用しないこと（「前は〜って言ってたけど」は禁止）。",
  "「前は〜だったのに」「昔は〜と思ってたでしょ」のような変化の指摘は禁止。",
  "出していいのは現在の内的感覚のみ: 「今は少し軽い感じがする」「前とは違うトーンを感じる」。",
  "ユーザー自身が変化に触れた場合のみ、静かに肯定すること（「うん、そうかもね」）。",
].join("\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block — Alter の内部感覚
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * narrative revision が検出された時、Alter に「内側からの気づき」を注入する。
 * 分析者として「あなたは変わりましたね」と指摘するのではなく、
 * 内在者として「前とは違う感じがする」と感じるためのブロック。
 *
 * 表出禁止ルール（NARRATIVE_DISCLOSURE_BAN）を必ず含む。
 */
export function buildNarrativeShiftPromptBlock(revision: NarrativeRevision): string {
  const shiftDescription = describeShift(revision);

  return (
    `\n## 内部感覚: 物語の書き換え（内部参照のみ — ユーザーへの表出禁止）\n` +
    `${shiftDescription}\n\n` +
    `### 表出禁止ルール（厳守）\n` +
    `${NARRATIVE_DISCLOSURE_BAN}\n\n` +
    `### Alter の姿勢\n` +
    `- この変化を「指摘」しないこと。Alter はこの変化を内側から感じているだけ。\n` +
    `- 新しい解釈に自然に寄り添うこと。\n` +
    `- この書き換えは成長の兆候かもしれない。焦って確定しないこと。`
  );
}

function describeShift(revision: NarrativeRevision): string {
  switch (revision.shiftType) {
    case "valence_flip":
      return `以前は「${revision.from.content}」（${valenceLabel(revision.from.valence)}）だったのが、今は「${revision.to.content}」（${valenceLabel(revision.to.valence)}）に変わっている。感情の方向が逆転している。`;
    case "agency_shift":
      return `以前は「${revision.from.content}」（${agencyLabel(revision.from.agency)}）だったのが、今は「${revision.to.content}」（${agencyLabel(revision.to.agency)}）に変わっている。自分の位置づけが変わっている。`;
    case "reframe":
      return `以前は「${revision.from.content}」と捉えていたのが、今は「${revision.to.content}」と捉えている。同じことへの意味づけが変わっている。`;
    case "softening":
      return `以前は「${revision.from.content}」と断定していたのが、今は「${revision.to.content}」と留保がついている。確信が揺らいでいるのかもしれない。`;
    case "intensification":
      return `以前は「${revision.from.content}」と留保付きだったのが、今は「${revision.to.content}」と強くなっている。確信が深まっているのかもしれない。`;
    default:
      return `「${revision.from.content}」から「${revision.to.content}」に変化している。`;
  }
}

function valenceLabel(v: NarrativeValence): string {
  switch (v) {
    case "positive": return "ポジティブ";
    case "negative": return "ネガティブ";
    case "neutral": return "ニュートラル";
    case "ambivalent": return "両価的";
  }
}

function agencyLabel(a: NarrativeAgency): string {
  switch (a) {
    case "actor": return "自分が動く側";
    case "receiver": return "受ける側";
    case "observer": return "俯瞰";
    case "unknown": return "不明";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildNarrativeLensAnalytics(
  revision: NarrativeRevision | null,
  freezing: NarrativeFreezingAlert,
): Record<string, unknown> {
  return {
    narrative_revision_detected: revision !== null,
    narrative_shift_type: revision?.shiftType ?? null,
    narrative_valence_from: revision?.from.valence ?? null,
    narrative_valence_to: revision?.to.valence ?? null,
    narrative_agency_from: revision?.from.agency ?? null,
    narrative_agency_to: revision?.to.agency ?? null,
    narrative_freezing_detected: freezing.isFrozen,
    narrative_frozen_themes: freezing.frozenThemes,
    narrative_frozen_days: freezing.frozenDays,
  };
}
