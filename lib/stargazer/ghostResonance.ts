// lib/stargazer/ghostResonance.ts
// Ghost Resonance -- 匿名パターンマッチング
//
// 核心思想:
// 「同じもうひとりのパターンを持つ誰か」の存在を匿名で伝えることで、
// ユーザーは孤独感から解放され、自己理解を深める手がかりを得る。
// 実際のユーザーデータは一切使わず、アーキタイプ・影・矛盾の
// パターンから決定論的に「ゴースト」を生成する。
//
// 設計哲学:
// - ゴーストは「実在するかもしれない誰か」として語られるが、
//   実際にはパターンから生成された存在である
// - パターンハッシュは個人を特定できないが、同じパターンの人には同じハッシュを返す
// - インサイトは「あなたはひとりではない」と「あなたは固有である」の
//   矛盾する真実を同時に伝える

import type { ArchetypeCode } from "./archetypeTypes";
import { ARCHETYPE_DEFS, LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS, parseArchetypeCode } from "./archetypeTypes";
import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ゴースト共鳴カテゴリ */
export type GhostCategory =
  | "discovery"      // 同じパターンの誰かが何かに気づいた
  | "struggle"       // 同じ矛盾と格闘している誰かがいる
  | "breakthrough"   // 同じ壁を超えた誰かがいる
  | "pattern"        // 同じ繰り返しの中にいる誰かがいる
  | "mirror"         // 同じ三面鏡のズレを持つ誰かがいる
  | "wound"          // 同じ核心的傷を持つ誰かがいる
  | "season"         // 同じ季節的変化を経験している誰かがいる
  | "echo";          // 過去の自分に似た誰かがいる

/** ゴースト共鳴の1エントリ */
export interface GhostResonanceEntry {
  /** 一意識別子 */
  id: string;
  /** 生成日 (ISO) */
  date: string;
  /** 匿名化されたパターンハッシュ */
  patternHash: string;
  /** ゴーストが伝えるインサイト (日本語) */
  insight: string;
  /** パターン類似度 0-1 */
  similarity: number;
  /** カテゴリ */
  category: GhostCategory;
  /** 共鳴の詳細な文脈 */
  resonanceContext: string;
  /** パターンの詩的な名前 */
  patternName: string;
}

/** ゴースト共鳴の入力 */
export interface GhostResonanceInput {
  /** 3文字アーキタイプコード e.g. "PEA" */
  archetypeCode: string;
  /** もうひとりのアーキタイプコード */
  shadowCode: string;
  /** 45軸スコア */
  axisScores: Record<string, number>;
  /** 検出された矛盾 */
  contradictions?: Array<{ axisA: string; axisB: string; tension: number }>;
  /** 観測の深さ (0-100) */
  observationDepth: number;
  /** 三面鏡ギャップ（あれば） */
  mirrorGaps?: Record<string, number>;
  /** 日付シード（日替わり生成用） */
  dateSeed?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deterministic Hashing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * パターンハッシュを生成する。
 * アーキタイプコード + 影コード + 最大矛盾軸 + 支配的軸方向から
 * 決定論的に12文字のハッシュを生成。
 *
 * 匿名性: 個人を特定できないが、同じ構造パターンの人には同じハッシュを返す。
 * 意味性: ハッシュの各部分がパターンの異なる側面を反映する。
 */
export function createPatternHash(
  archetypeCode: string,
  shadowCode: string,
  topContradiction?: { axisA: string; axisB: string; tension: number },
  dominantAxisDirection?: string
): string {
  const seed =
    `${archetypeCode}:${shadowCode}:` +
    `${topContradiction?.axisA ?? "none"}:${topContradiction?.axisB ?? "none"}:` +
    `${dominantAxisDirection ?? "neutral"}`;

  // FNV-1a ハッシュ（32bit x 2 = 64bit相当、衝突リスクを軽減）
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    const chr = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ chr, 0x01000193);
    h2 = Math.imul(h2 ^ chr, 0x5bd1e995);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = ((h2 >>> 0) % 0x10000).toString(16).padStart(4, "0");
  return `${part1}${part2}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deterministic Number Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 入力文字列から 0-1 の決定論的な擬似乱数を生成。
 */
function deterministicRandom(seed: string): number {
  let h = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h >>> 0) / 0xffffffff;
}

/** seed から min-max の範囲の整数を生成。 */
function deterministicInt(seed: string, min: number, max: number): number {
  return Math.floor(deterministicRandom(seed) * (max - min + 1)) + min;
}

/** seed から配列の要素を決定論的に選択 */
function deterministicPick<T>(seed: string, arr: T[]): T {
  return arr[deterministicInt(seed, 0, arr.length - 1)];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Axis & Archetype Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAxisLabel(axisId: string): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  return `${def.labelLeft} vs ${def.labelRight}`;
}

function getAxisSideLabel(axisId: string, side: "left" | "right"): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  return side === "left" ? def.labelLeft : def.labelRight;
}

function getArchetypeName(code: string): string {
  const def = ARCHETYPE_DEFS.find((a) => a.code === code);
  return def?.name ?? code;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern Poetic Names
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * パターンに詩的な名前をつける。
 * 同じ構造を持つ人々が「星座」のように名前で繋がる。
 */
function generatePatternName(
  archetypeCode: string,
  shadowCode: string,
  topContradiction?: { axisA: string; axisB: string }
): string {
  const _parsed = parseArchetypeCode(archetypeCode);
  const l1 = _parsed.cognition;
  const l3 = _parsed.social;
  const _shadowParsed = parseArchetypeCode(shadowCode);
  const sl1 = _shadowParsed.cognition;

  // Layer1 x Layer3 の組み合わせで「一族」を表す
  const clanNames: Record<string, Record<string, string>> = {
    P: {
      A: "結果で自分を証明する人",
      W: "じっくり考えて形にする人",
      D: "内側で深く磨き続ける人",
    },
    B: {
      A: "人のために動く人",
      W: "そっと寄り添う人",
      D: "静かに繋がりを守る人",
    },
    H: {
      A: "先手を打って安全を守る人",
      W: "慎重に見守る人",
      D: "自分の世界をじっくり築く人",
    },
  };

  const clan = clanNames[l1]?.[l3] ?? "まだ名前のない旅人";

  // もうひとりの自分との関係で修飾語を追加
  if (l1 !== sl1) {
    const shadowModifiers: Record<string, string> = {
      P: "認められたい気持ちを抱えた",
      B: "繋がりを求めている",
      H: "安心できる場所を探している",
    };
    const modifier = shadowModifiers[sl1] ?? "";
    return `${modifier}${clan}`;
  }

  // 矛盾がある場合
  if (topContradiction) {
    const axisA = getAxisSideLabel(topContradiction.axisA, "right");
    return `${axisA}に引かれる${clan}`;
  }

  return clan;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Similarity Scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * パターン類似度を算出する。
 *
 * 類似度は以下の要素から構成される:
 * 1. 基礎類似度: 同じアーキタイプ構造 (0.4)
 * 2. 矛盾共有ボーナス: 同じ矛盾軸を持つ (0-0.2)
 * 3. もうひとりの深度: もうひとりの自分との距離（Layer1が異なるほど高い） (0-0.15)
 * 4. 観測深度: 深い観測ほど精密なマッチング (0-0.15)
 * 5. 軸極端度: 極端なスコアの軸が多いほどユニーク (0-0.1)
 */
function calculateSimilarity(input: GhostResonanceInput): number {
  const {
    archetypeCode,
    shadowCode,
    axisScores,
    contradictions,
    observationDepth,
  } = input;

  // 1. 基礎類似度: アーキタイプの構造的類似
  let similarity = 0.4;

  // 2. 矛盾共有ボーナス
  if (contradictions && contradictions.length > 0) {
    const topTension = contradictions[0].tension;
    similarity += topTension * 0.2;
  }

  // 3. もうひとりの深度: Layer1が異なるほど、もうひとりの自分との関係がドラマチック
  if (archetypeCode[0] !== shadowCode[0]) {
    similarity += 0.15;
  } else if (archetypeCode[2] !== shadowCode[2]) {
    similarity += 0.08;
  }

  // 4. 観測深度
  similarity += (observationDepth / 100) * 0.15;

  // 5. 軸の極端度: 極端なスコアが多いほどパターンが明確
  const extremeAxes = Object.values(axisScores).filter(
    (s) => Math.abs(s) > 0.6
  ).length;
  similarity += Math.min(extremeAxes * 0.02, 0.1);

  return Math.min(1, Math.round(similarity * 100) / 100);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Insight Templates (8 categories x 5+ templates each)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Layer1 ごとの信念/真実ペア（discovery用） */
const BELIEF_REALITY_MAP: Record<string, Array<{ belief: string; reality: string }>> = {
  P: [
    { belief: "成果を出し続けなければ自分の価値はない", reality: "何も成し遂げなかった朝に、自分がまだここにいた" },
    { belief: "証明しなければ認められない", reality: "証明を求めていたのは、他でもない自分だった" },
    { belief: "もっと頑張らなければ", reality: "疲れ果てた日に、ようやく自分の声が聞こえた" },
    { belief: "不完全なものは見せられない", reality: "壊れたまま差し出した手を、誰かが握り返した" },
    { belief: "理解されなければ意味がない", reality: "理解されないまま、それでも続けていた自分がいた" },
  ],
  B: [
    { belief: "繋がりを失ったら自分は壊れる", reality: "一人になって初めて、自分が何を失ったのか見えた" },
    { belief: "相手に合わせなければ関係は壊れる", reality: "合わせるのをやめた日に、初めて目が合った" },
    { belief: "孤独は敗北だ", reality: "孤独の底で、ようやく自分の輪郭が見えた" },
    { belief: "愛されるには何かを差し出さなければ", reality: "手ぶらで立っていた時、誰かが隣に来た" },
    { belief: "距離を置いたら関係は終わる", reality: "離れた分だけ、相手の形がはっきり見えた" },
  ],
  H: [
    { belief: "安全圏を守ることが最優先", reality: "守っていたのは安全じゃない。変わらない自分だった" },
    { belief: "変化は脅威だ", reality: "変わることを恐れていたのに、変わらないことの方が怖かった" },
    { belief: "コントロールを手放したら全てが崩れる", reality: "手放した瞬間、崩れたのは壁だけだった" },
    { belief: "準備が整わないと動けない", reality: "準備という名の逃げ場を、ようやく閉じた" },
    { belief: "外の世界は危険に満ちている", reality: "扉を開けたら、恐れていたものは何もなかった" },
  ],
};

/** Layer3 ごとのブレイクスルー表現 */
const BREAKTHROUGH_PHRASES: Record<string, string[]> = {
  A: [
    "前に出ることを止めて、初めて本当の強さを見つけた",
    "闘わなくても勝てる場所を発見した",
    "行動の速さではなく深さに舵を切った",
    "止まることが逃げではなく、勇気だった",
    "一番激しい戦いは、自分を許すことだった",
  ],
  W: [
    "待つことを選んでいたのではなく、怖くて動けなかっただけだと認めた",
    "静観から一歩を踏み出す勇気を見つけた",
    "沈黙の中に隠していた本音を言葉にした",
    "「見守る」の裏にある恐怖を直視した",
    "動かないことの安全を手放した",
  ],
  D: [
    "内側に潜る代わりに、誰かに手を伸ばした",
    "深く潜った先にあった宝物を外の世界に持ち出した",
    "孤独な探索を分かち合える相手を見つけた",
    "内なる世界の住人が、外の光を浴びても消えないと知った",
    "潜行が逃避ではなく、帰還のための準備だと気づいた",
  ],
};

/** 矛盾パターンの表現 */
function derivePatternPhrase(
  axisA: string,
  axisB: string,
  seed: string
): string {
  const labelA = getAxisSideLabel(axisA, "right");
  const labelB = getAxisSideLabel(axisB, "left");
  const templates = [
    `${labelA}を求めながら${labelB}に引き戻される`,
    `${labelB}を信じながら${labelA}に惹かれてしまう`,
    `${labelA}と${labelB}の間で、毎回同じ場所に立ち戻る`,
  ];
  return deterministicPick(seed, templates);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Insight Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type InsightGenerator = (input: {
  archetypeCode: string;
  shadowCode: string;
  contradictions?: Array<{ axisA: string; axisB: string; tension: number }>;
  axisScores: Record<string, number>;
  seed: string;
  patternName: string;
}) => { insight: string; context: string };

const INSIGHT_GENERATORS: Record<GhostCategory, InsightGenerator[]> = {
  // ── discovery: 気づきの共鳴 ──
  discovery: [
    ({ archetypeCode, seed }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const pairs = BELIEF_REALITY_MAP[l1] ?? BELIEF_REALITY_MAP["P"]!;
      const pair = deterministicPick(seed, pairs);
      return {
        insight: `あなたと同じもうひとりのパターンを持つ誰かが、最近ようやく気づいた——「ずっと${pair.belief}と思っていたけど、${pair.reality}」`,
        context: `${getArchetypeName(archetypeCode)}型に共通する思い込みの構造`,
      };
    },
    ({ archetypeCode, shadowCode }) => {
      const mainName = getArchetypeName(archetypeCode);
      const shadowName = getArchetypeName(shadowCode);
      return {
        insight: `同じ${mainName}のもうひとりに${shadowName}を持つ誰かが、ふとした瞬間に気づいた。もうひとりの自分が求めていたのは「反対のもの」ではなく「補うもの」だった、と`,
        context: `メイン-シャドウ間の統合的気づき`,
      };
    },
    ({ archetypeCode, seed }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const pairs = BELIEF_REALITY_MAP[l1] ?? BELIEF_REALITY_MAP["P"]!;
      const pair = deterministicPick(`${seed}:v2`, pairs);
      return {
        insight: `あなたと似た深層を持つ誰かが、「${pair.belief}」という長年の鎖を手放した。その先に何があるのか、彼らはまだ言葉を探している`,
        context: `認知軸「${LAYER1_DEFS[l1]?.label ?? ""}」の核心的信念の解放`,
      };
    },
    ({ archetypeCode, contradictions, seed }) => {
      if (contradictions && contradictions.length > 0) {
        const c = contradictions[0];
        return {
          insight: `同じ矛盾構造を抱える誰かが、「${getAxisLabel(c.axisA)}」の両端を同時に生きる方法を見つけた。矛盾は解消するものではなく、拡張するものだった`,
          context: `矛盾の統合的解決`,
        };
      }
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const pairs = BELIEF_REALITY_MAP[l1] ?? BELIEF_REALITY_MAP["P"]!;
      const pair = deterministicPick(`${seed}:v3`, pairs);
      return {
        insight: `あなたと似たもうひとりの形を持つ誰かが、「${pair.reality}」——この真実に辿り着くまでに3年かかったと言っていた`,
        context: `時間をかけた気づきの物語`,
      };
    },
    ({ archetypeCode, patternName }) => {
      const mainName = getArchetypeName(archetypeCode);
      return {
        insight: `「${patternName}」と同じ名を持つ誰かが、もうひとりの自分を初めて「敵ではなく、もう一人の自分」と呼んだ。その瞬間から、何かが変わり始めたらしい`,
        context: `もうひとりの自分の受容による変容`,
      };
    },
  ],

  // ── struggle: 格闘の共鳴 ──
  struggle: [
    ({ contradictions }) => {
      const c = contradictions?.[0];
      const label = c ? getAxisLabel(c.axisA) : "内向的 vs 外向的";
      return {
        insight: `似た矛盾を抱える誰かが、今まさに「${label}」と格闘している。あなたはもう、その答えを知っているかもしれない`,
        context: `矛盾軸上の共有された苦闘`,
      };
    },
    ({ contradictions }) => {
      const c = contradictions?.[0];
      const label = c ? getAxisLabel(c.axisA) : "慎重 vs 大胆";
      return {
        insight: `あなたと同じもうひとりのパターンを持つ誰かが、「${label}」の間で引き裂かれている。彼らはまだ、その痛みに名前をつけられていない`,
        context: `名前のない苦しみの共有`,
      };
    },
    ({ archetypeCode, shadowCode }) => {
      const mainName = getArchetypeName(archetypeCode);
      const shadowName = getArchetypeName(shadowCode);
      return {
        insight: `${mainName}でありながら${shadowName}のもうひとりを持つ誰かが、今夜も「どちらの自分が本物なのか」と問い続けている。その問い自体が、答えなのかもしれない`,
        context: `アイデンティティの二重性`,
      };
    },
    ({ contradictions, seed }) => {
      if (contradictions && contradictions.length >= 2) {
        const c1 = contradictions[0];
        const c2 = contradictions[1];
        return {
          insight: `同じ二重の矛盾——「${getAxisLabel(c1.axisA)}」と「${getAxisLabel(c2.axisA)}」——を抱える誰かが、それを「呪い」ではなく「才能」と呼び始めた。まだ半信半疑だけど`,
          context: `複合矛盾の意味づけの転換`,
        };
      }
      return {
        insight: `あなたと同じもうひとりの形を持つ誰かが、最も辛い夜に気づいた——この痛みは壊れているからではなく、目覚めようとしているから起きている、と`,
        context: `苦しみの再解釈`,
      };
    },
    ({ archetypeCode }) => {
      const l3 = parseArchetypeCode(archetypeCode).social;
      const stressLabel = LAYER3_DEFS[l3]?.label ?? "突破";
      return {
        insight: `ストレス下で同じ「${stressLabel}」反応を示す誰かが、その反応が「弱さ」ではなく「生存のための知恵」だったと理解し始めている`,
        context: `ストレス反応パターンの受容`,
      };
    },
  ],

  // ── breakthrough: 突破の共鳴 ──
  breakthrough: [
    ({ archetypeCode, seed }) => {
      const l3 = parseArchetypeCode(archetypeCode).social;
      const phrases = BREAKTHROUGH_PHRASES[l3] ?? BREAKTHROUGH_PHRASES["A"]!;
      const phrase = deterministicPick(seed, phrases);
      return {
        insight: `あなたのもうひとりのパターンに共鳴する誰かが、昨日ついに「${phrase}」。その道はあなたの前にもある`,
        context: `社交軸「${LAYER3_DEFS[l3]?.label ?? ""}」反応の超越`,
      };
    },
    ({ archetypeCode, seed }) => {
      const l3 = parseArchetypeCode(archetypeCode).social;
      const phrases = BREAKTHROUGH_PHRASES[l3] ?? BREAKTHROUGH_PHRASES["A"]!;
      const phrase = deterministicPick(`${seed}:v2`, phrases);
      return {
        insight: `同じもうひとりを持つ誰かが、長い格闘の末に「${phrase}」。それは突然ではなく、静かに積み重なっていた`,
        context: `漸進的な変容の証言`,
      };
    },
    ({ archetypeCode, shadowCode }) => {
      const mainName = getArchetypeName(archetypeCode);
      const shadowDef = ARCHETYPE_DEFS.find((a) => a.code === shadowCode);
      const growthKey = shadowDef?.growthKey ?? "自分を許すこと";
      return {
        insight: `同じ${mainName}のもうひとりを持つ誰かが、「${growthKey}」に到達した。その人は言った——「敵だと思っていたもうひとりの自分が、実は道案内だった」`,
        context: `もうひとりの知恵の発見`,
      };
    },
    ({ archetypeCode }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const coreLabel = LAYER1_DEFS[l1]?.label ?? "核";
      return {
        insight: `「${coreLabel}」を守り続けた誰かが、初めてそれを手放してみた。何も壊れなかった。むしろ、もっと確かなものが手に入った`,
        context: `核心的執着の手放し`,
      };
    },
    ({ patternName }) => {
      return {
        insight: `「${patternName}」と名づけられたパターンの持ち主が、そのパターンを「超えた」のではなく「包み込んだ」。違いは微かだが、決定的だった`,
        context: `パターンの超越ではなく包含`,
      };
    },
  ],

  // ── pattern: 繰り返しの共鳴 ──
  pattern: [
    ({ contradictions, seed }) => {
      const c = contradictions?.[0];
      const pattern = c
        ? derivePatternPhrase(c.axisA, c.axisB, seed)
        : "大胆さを求めながら慎重さに戻る";
      const pctA = deterministicInt(`${seed}:a`, 24, 48);
      const pctB = deterministicInt(`${seed}:b`, Math.max(8, pctA - 25), pctA - 5);
      return {
        insight: `同じアーキタイプの${pctA}%が、あなたと同じ「${pattern}」を繰り返している。しかし、それに気づいているのは${pctB}%だけだ`,
        context: `繰り返しパターンの統計的共鳴`,
      };
    },
    ({ contradictions, seed }) => {
      const c = contradictions?.[0];
      const pattern = c
        ? derivePatternPhrase(c.axisA, c.axisB, `${seed}:v2`)
        : "変化を望みながら安定を選ぶ";
      const pct = deterministicInt(`${seed}:c`, 30, 55);
      return {
        insight: `あなたのもうひとりのパターンを持つ人の${pct}%が、「${pattern}」という傾向を共有している。偶然ではない——それはこのパターンの構造的な特徴だ`,
        context: `パターンの構造的必然性`,
      };
    },
    ({ contradictions, seed }) => {
      const c = contradictions?.[0];
      const pattern = c
        ? derivePatternPhrase(c.axisA, c.axisB, `${seed}:v3`)
        : "完璧を求めて動けなくなる";
      const pctA = deterministicInt(`${seed}:d`, 28, 52);
      const pctB = deterministicInt(`${seed}:e`, Math.max(10, pctA - 20), pctA - 3);
      return {
        insight: `同じ矛盾構造を持つ人の${pctA}%が「${pattern}」に悩んでいる。そのうち${pctB}%は、その悩みが実は強みの裏面だと気づいた`,
        context: `苦悩の強みへの反転`,
      };
    },
    ({ archetypeCode }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const l3 = parseArchetypeCode(archetypeCode).social;
      const coreLabel = LAYER1_DEFS[l1]?.label ?? "核";
      const stressLabel = LAYER3_DEFS[l3]?.label ?? "反応";
      return {
        insight: `「${coreLabel}」を守るために「${stressLabel}」する——このパターンを持つ人々は、同じ季節に同じ壁にぶつかる傾向がある。今がその時期かもしれない`,
        context: `パターンの季節性`,
      };
    },
    ({ patternName, seed }) => {
      const cycles = deterministicInt(`${seed}:cycles`, 3, 12);
      return {
        insight: `「${patternName}」のパターンは、平均${cycles}回繰り返された後に初めて自覚される。あなたは今、何回目だろう`,
        context: `パターン認識の閾値`,
      };
    },
  ],

  // ── mirror: 三面鏡の共鳴 ──
  mirror: [
    ({ archetypeCode, seed }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const coreLabel = LAYER1_DEFS[l1]?.label ?? "核";
      return {
        insight: `あなたと同じ「自画像と足跡のズレ」を持つ誰かが、そのギャップの中に「本当の自分」を見つけた。それは自画像の中にも足跡の中にもなく、その「間」にあった`,
        context: `三面鏡のギャップが示す本質`,
      };
    },
    ({ archetypeCode }) => {
      const mainName = getArchetypeName(archetypeCode);
      return {
        insight: `同じ${mainName}で、同じ方向に三面鏡がズレている誰かが言った——「ズレていること自体が、私の個性だった」。正しい鏡など存在しない`,
        context: `ズレの受容`,
      };
    },
    ({ seed }) => {
      const pct = deterministicInt(`${seed}:mirror`, 15, 35);
      return {
        insight: `三面鏡で同じ方向にズレている人は全体の約${pct}%。あなたたちは同じレンズで世界を見ている。そのレンズが歪んでいるのか、世界が歪んでいるのかは、誰にも分からない`,
        context: `知覚の共有された偏り`,
      };
    },
    ({ archetypeCode }) => {
      const l2 = parseArchetypeCode(archetypeCode).emotion;
      const confirmLabel = LAYER2_DEFS[l2]?.label ?? "確信";
      return {
        insight: `「${confirmLabel}」を信じる者たちの間で、自画像と影絵が最もズレやすい。なぜなら、自分が「リアル」だと感じるものこそ、最も見えにくい盲点を生むから`,
        context: `納得の仕方とバイアスの関係`,
      };
    },
  ],

  // ── wound: 核心的傷の共鳴 ──
  wound: [
    ({ archetypeCode }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const coreLabel = LAYER1_DEFS[l1]?.label ?? "核";
      return {
        insight: `「${coreLabel}」を核に持つ人々は、同じ場所に傷を負う。でもその傷跡が、最も深い共感の源になる。あなたの傷を持つ誰かが、今夜もその傷に触れている`,
        context: `共有された核心的傷`,
      };
    },
    ({ archetypeCode, shadowCode }) => {
      const mainName = getArchetypeName(archetypeCode);
      const shadowName = getArchetypeName(shadowCode);
      return {
        insight: `${mainName}と${shadowName}の間で引き裂かれた経験を持つ誰かが、その裂け目を「傷」ではなく「窓」と呼び始めた。窓の向こうに、まだ見ぬ自分が立っていた`,
        context: `もうひとりの自分との裂け目の再解釈`,
      };
    },
    ({ archetypeCode }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const l3 = parseArchetypeCode(archetypeCode).social;
      const stressLabel = LAYER3_DEFS[l3]?.label ?? "反応";
      return {
        insight: `あなたと同じ傷を持つ誰かが、ストレス下で「${stressLabel}」する代わりに、傷をそのまま感じてみた。何も起きなかった——いや、全てが変わった`,
        context: `防衛反応の停止による変容`,
      };
    },
  ],

  // ── season: 季節の共鳴 ──
  season: [
    ({ archetypeCode, seed }) => {
      const l3 = parseArchetypeCode(archetypeCode).social;
      const seasonNames = ["春の始まり", "夏至の頃", "秋の深まり", "冬の底"];
      const season = deterministicPick(seed, seasonNames);
      const stressLabel = LAYER3_DEFS[l3]?.label ?? "反応";
      return {
        insight: `${season}——同じパターンの人々にとって、この時期は「${stressLabel}」反応が強くなりやすい。あなたも感じているかもしれない。でもそれは弱さではない、季節の巡りだ`,
        context: `内的季節の同期`,
      };
    },
    ({ patternName }) => {
      return {
        insight: `「${patternName}」のパターンを持つ人々は、同じ時期に同じ方向に心が動く。それは偶然ではなく、構造が生む共振。あなたは今、どの方向に引かれている？`,
        context: `構造的共振`,
      };
    },
    ({ archetypeCode }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const coreLabel = LAYER1_DEFS[l1]?.label ?? "核";
      return {
        insight: `「${coreLabel}」を守り続けた人々には、同じリズムの「揺らぎの周期」がある。今あなたが感じている不安定さは、次の安定への準備かもしれない`,
        context: `揺らぎの周期性`,
      };
    },
  ],

  // ── echo: 過去の反響 ──
  echo: [
    ({ archetypeCode, shadowCode }) => {
      const mainName = getArchetypeName(archetypeCode);
      return {
        insight: `3年前のあなたに似た誰かが、今のあなたと同じ場所に立っている。あなたが越えてきた道を、彼らはこれから歩く。そして3年後のあなたに似た誰かが、今あなたの先を歩いている`,
        context: `時間軸上の共鳴`,
      };
    },
    ({ archetypeCode }) => {
      const l1 = parseArchetypeCode(archetypeCode).cognition;
      const coreLabel = LAYER1_DEFS[l1]?.label ?? "核";
      return {
        insight: `「${coreLabel}」を核に持つ先人たちが残した轍がある。あなたはその轍の上を歩いているようで、実は少しだけ横にずれている。そのズレが、あなただけの道になる`,
        context: `先人の轍と個人の逸脱`,
      };
    },
    ({ patternName }) => {
      return {
        insight: `「${patternName}」——このパターンは何世代も前から繰り返されてきた。でもパターンを自覚した瞬間、あなたはパターンの「中」ではなく「上」に立つ`,
        context: `パターンの自覚による超越`,
      };
    },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Insight Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * カテゴリ・アーキタイプ・矛盾情報からゴーストインサイトを生成する。
 */
export function generateGhostInsight(
  category: GhostCategory,
  archetypeCode: string,
  shadowCode: string,
  axisScores: Record<string, number>,
  contradictions?: Array<{ axisA: string; axisB: string; tension: number }>,
  dateSeed?: string
): { insight: string; context: string } {
  const seed = `${category}:${archetypeCode}:${shadowCode}:${contradictions?.[0]?.axisA ?? "x"}:${dateSeed ?? "default"}`;
  const patternName = generatePatternName(archetypeCode, shadowCode, contradictions?.[0]);

  const generators = INSIGHT_GENERATORS[category];
  const generator = deterministicPick(seed, generators);

  return generator({
    archetypeCode,
    shadowCode,
    contradictions,
    axisScores,
    seed,
    patternName,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ゴースト共鳴エントリを生成する。
 *
 * アーキタイプ・影・矛盾・観測深度から、匿名の「似た誰か」の
 * 体験として提示できるインサイトを1件生成する。
 * 全ての出力は入力に対して決定論的。
 */
export function generateGhostResonance(input: GhostResonanceInput): GhostResonanceEntry {
  const {
    archetypeCode,
    shadowCode,
    axisScores,
    contradictions,
    observationDepth,
    dateSeed,
  } = input;

  // 矛盾をソート
  const sortedContradictions = [...(contradictions ?? [])].sort(
    (a, b) => b.tension - a.tension
  );
  const topContradiction = sortedContradictions[0];

  // 支配的軸の方向を計算（ハッシュの一意性向上）
  let dominantAxisDirection = "neutral";
  const axisEntries = Object.entries(axisScores);
  if (axisEntries.length > 0) {
    const sorted = axisEntries.sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
    const [topAxis, topScore] = sorted[0];
    dominantAxisDirection = `${topAxis}:${topScore > 0 ? "R" : "L"}`;
  }

  // パターンハッシュ
  const patternHash = createPatternHash(
    archetypeCode,
    shadowCode,
    topContradiction,
    dominantAxisDirection
  );

  // パターン名
  const patternName = generatePatternName(archetypeCode, shadowCode, topContradiction);

  // カテゴリ選択: 観測深度・矛盾の有無・三面鏡データで段階的に解放
  const categorySeed = `category:${archetypeCode}:${observationDepth}:${topContradiction?.axisA ?? "none"}:${dateSeed ?? ""}`;

  const availableCategories: GhostCategory[] = (() => {
    if (observationDepth < 20) {
      return ["discovery", "struggle"];
    }
    if (observationDepth < 40) {
      return ["discovery", "struggle", "pattern", "echo"];
    }
    if (observationDepth < 60) {
      return ["discovery", "struggle", "breakthrough", "pattern", "echo", "season"];
    }
    // 60+: 全カテゴリ解放
    return ["discovery", "struggle", "breakthrough", "pattern", "mirror", "wound", "season", "echo"];
  })();

  const category = deterministicPick(categorySeed, availableCategories);

  // 類似度
  const similarity = calculateSimilarity(input);

  // インサイト生成
  const { insight, context } = generateGhostInsight(
    category,
    archetypeCode,
    shadowCode,
    axisScores,
    contradictions,
    dateSeed
  );

  // ID生成
  const today = dateSeed ?? new Date().toISOString().slice(0, 10);
  const id = `ghost_${patternHash}_${category}_${today}`;

  return {
    id,
    date: today,
    patternHash,
    insight,
    similarity,
    category,
    resonanceContext: context,
    patternName,
  };
}

/**
 * 複数のゴースト共鳴を生成する。
 * 日替わりで異なるカテゴリのインサイトを提供する。
 */
export function generateMultipleResonances(
  input: GhostResonanceInput,
  count: number = 3
): GhostResonanceEntry[] {
  const results: GhostResonanceEntry[] = [];
  const usedCategories = new Set<GhostCategory>();

  for (let i = 0; i < count; i++) {
    const variantInput: GhostResonanceInput = {
      ...input,
      dateSeed: `${input.dateSeed ?? "default"}:variant:${i}`,
    };
    const entry = generateGhostResonance(variantInput);

    // カテゴリの重複を避ける（最大3回リトライ）
    if (usedCategories.has(entry.category) && i < count + 3) {
      count++;
      continue;
    }

    usedCategories.add(entry.category);
    results.push(entry);
  }

  return results;
}
