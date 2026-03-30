// lib/stargazer/archetypeCompatibility.ts
// Stargazer v3 — Archetype Compatibility System
// 24タイプ間の関係性マッピング

import type {
  ArchetypeCode,
  Layer1Code,
  Layer2Code,
  Layer3Code,
  ExecutionCode,
} from "./archetypeTypes";
import { parseArchetypeCode, getArchetypeByCode, ARCHETYPE_CODES } from "./archetypeTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relationship Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RelationshipType =
  | "mirror" // Same L1, L2, L3 — deep understanding, same blind spots
  | "rhythm_gap" // Same L1, L2; diff L3 — great normally, stress breaks it
  | "language_gap" // Same L1, L3; diff L2 — same fear & response, can't explain why
  | "shadow" // Same L1; diff L2, L3 — same fear, totally different coping
  | "complement" // Diff L1; same L2, L3 — same methods, different purpose
  | "teacher" // Diff L1; same L2; diff L3 — same language, different depths
  | "comrade" // Diff L1; diff L2; same L3 — trust in crisis, same stress response
  | "alien"; // Diff L1, L2, L3 — everything different, maximum growth potential

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compatibility Result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CompatibilityResult {
  typeA: ArchetypeCode;
  typeB: ArchetypeCode;
  relationshipType: RelationshipType;
  overallScore: number; // 0-100
  layerScores: {
    layer1: { match: boolean; dynamic: string; score: number };
    layer2: { match: boolean; dynamic: string; score: number };
    layer3: { match: boolean; dynamic: string; score: number };
    execution?: { match: boolean; dynamic: string; score: number };
  };
  strengths: string[];
  risks: string[];
  growthOpportunity: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1 Cross Dynamics (核 × 核)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface LayerDynamic {
  dynamic: string;
  score: number;
}

/** Canonical key for a pair (order-independent) */
function pairKey<T extends string>(a: T, b: T): string {
  return [a, b].sort().join("×");
}

const LAYER1_DYNAMICS: Record<string, LayerDynamic> = {
  // A (Analytical) — 分析・論理で世界を把握する
  "A×A": {
    dynamic: "互いの実力を認め合うか、競争になるか。二択。",
    score: 30,
  },
  "A×N": {
    dynamic:
      "Aは論理を優先しNには冷たく映る。Nは「データより直感を見て」と求める",
    score: 20,
  },
  "A×S": {
    dynamic:
      "Aの分析がSの体感を脅かす。Sの慎重さがAには「自分を疑っている」と映る",
    score: 15,
  },
  // N (iNtuitive) — 直感・パターンで世界を把握する
  "N×N": {
    dynamic: "深い共感。ただし共依存のリスク",
    score: 30,
  },
  "N×S": {
    dynamic:
      "Nが近づくほどSが距離を取る。Nは拒絶と感じ、Sは侵入と感じる",
    score: 10,
  },
  // S (Sensory) — 五感・体感で世界を把握する
  "S×S": {
    dynamic:
      "互いの境界を尊重する安定感。ただし慎重すぎて関係が深まらない",
    score: 30,
  },
};

const DEFAULT_LAYER_DYNAMIC: LayerDynamic = {
  dynamic: "未定義の組み合わせ",
  score: 20,
};

function getLayer1Dynamic(a: Layer1Code, b: Layer1Code): LayerDynamic {
  if (a === b) {
    return LAYER1_DYNAMICS[`${a}×${a}`] ?? DEFAULT_LAYER_DYNAMIC;
  }
  const key = pairKey(a, b);
  return LAYER1_DYNAMICS[key] ?? DEFAULT_LAYER_DYNAMIC;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2 Cross Dynamics (納得の仕方 × 納得の仕方)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LAYER2_DYNAMICS: Record<string, LayerDynamic> = {
  // C (Calm) — 感情が穏やかに流れる
  "C×C": {
    dynamic: "穏やかに語り合える。安定的だが感情の深みが出にくい",
    score: 25,
  },
  // C×V — 穏 vs 激の創造的緊張
  "C×V": {
    dynamic: "穏やかさと激しさの創造的緊張。理解し合えれば最強の補完",
    score: 18,
  },
  // V (Vivid) — 感情が鮮烈に動く
  "V×V": {
    dynamic: "感情の波で共鳴。ただし互いに増幅して収拾がつかなくなるリスク",
    score: 25,
  },
};

function getLayer2Dynamic(a: Layer2Code, b: Layer2Code): LayerDynamic {
  if (a === b) {
    return LAYER2_DYNAMICS[`${a}×${a}`] ?? DEFAULT_LAYER_DYNAMIC;
  }
  const key = pairKey(a, b);
  return LAYER2_DYNAMICS[key] ?? DEFAULT_LAYER_DYNAMIC;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 3 Cross Dynamics (行動スイッチ × 行動スイッチ)
// Critical for relationship survival
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LAYER3_DYNAMICS: Record<string, LayerDynamic> = {
  // E (External) — エネルギーが外に向かう
  "E×E": {
    dynamic: "嵐。互いにぶつかる。解決は早いが傷も深い",
    score: 60,
  },
  // E×I — 外向と内向の緊張
  "E×I": {
    dynamic: "Eが動くほどIが内に引く負のループ。理解すれば補い合える",
    score: 35,
  },
  // I (Internal) — エネルギーが内に向かう
  "I×I": {
    dynamic: "互いの空間を尊重。ただし危機時に両方内に閉じるリスク",
    score: 50,
  },
};

function getLayer3Dynamic(a: Layer3Code, b: Layer3Code): LayerDynamic {
  if (a === b) {
    return LAYER3_DYNAMICS[`${a}×${a}`] ?? DEFAULT_LAYER_DYNAMIC;
  }
  const key = pairKey(a, b);
  return LAYER3_DYNAMICS[key] ?? DEFAULT_LAYER_DYNAMIC;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 4 Cross Dynamics (実行スタイル × 実行スタイル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EXECUTION_DYNAMICS: Record<string, LayerDynamic> = {
  "O×O": {
    dynamic: "二人とも最適化志向。効率的だが、予想外の発見が生まれにくい",
    score: 20,
  },
  "O×X": {
    dynamic: "片方が計画を立て、片方が壊す。ストレスにもなるが、最も成長が加速する組み合わせ",
    score: 15,
  },
  "X×X": {
    dynamic: "自由度は最高。ただし二人とも計画を立てないので、カオスが常態化する",
    score: 20,
  },
};

function getExecutionDynamic(a: ExecutionCode, b: ExecutionCode): LayerDynamic {
  if (a === b) {
    return EXECUTION_DYNAMICS[`${a}×${a}`] ?? DEFAULT_LAYER_DYNAMIC;
  }
  const key = pairKey(a, b);
  return EXECUTION_DYNAMICS[key] ?? DEFAULT_LAYER_DYNAMIC;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relationship Type Determination
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getRelationshipType(
  a: ArchetypeCode,
  b: ArchetypeCode,
): RelationshipType {
  const pa = parseArchetypeCode(a);
  const pb = parseArchetypeCode(b);

  const l1Match = pa.layer1 === pb.layer1;
  const l2Match = pa.layer2 === pb.layer2;
  const l3Match = pa.layer3 === pb.layer3;

  if (l1Match && l2Match && l3Match) return "mirror";
  if (l1Match && l2Match && !l3Match) return "rhythm_gap";
  if (l1Match && !l2Match && l3Match) return "language_gap";
  if (l1Match && !l2Match && !l3Match) return "shadow";
  if (!l1Match && l2Match && l3Match) return "complement";
  if (!l1Match && l2Match && !l3Match) return "teacher";
  if (!l1Match && !l2Match && l3Match) return "comrade";
  return "alien";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relationship Descriptions (strengths / risks / growth)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RelationshipProfile {
  strengths: string[];
  risks: string[];
  growthOpportunity: string;
}

function getRelationshipProfile(
  type: RelationshipType,
  pa: { layer1: Layer1Code; layer2: Layer2Code; layer3: Layer3Code },
  pb: { layer1: Layer1Code; layer2: Layer2Code; layer3: Layer3Code },
): RelationshipProfile {
  switch (type) {
    case "mirror":
      return {
        strengths: [
          "言葉にしなくても深いレベルで理解し合える",
          "同じ恐れを共有しているから、安心して本音を出せる",
          "確信の取り方も、ストレス下の動きも同じなので摩擦が少ない",
        ],
        risks: [
          "盲点が完全に一致するため、同じ罠にハマりやすい",
          "互いの弱点を指摘できない共依存のリスク",
          "成長の刺激が生まれにくく、停滞しやすい",
        ],
        growthOpportunity:
          "鏡に映る自分の姿を通じて、無意識のパターンに気づくことができる",
      };

    case "rhythm_gap":
      return {
        strengths: [
          "同じ恐れを同じ言語で共有できる深い理解がある",
          "平常時は最高のパートナーシップを築ける",
          "確信の取り方が同じなので、合意形成が早い",
        ],
        risks: [
          "ストレス時にリズムが噛み合わなくなる致命的なズレ",
          `${pa.layer3 !== pb.layer3 ? `一方が${pa.layer3 === "I" ? "内に向かう" : "外に向かう"}とき、もう一方は${pb.layer3 === "I" ? "内に向かう" : "外に向かう"}` : ""}`,
          "危機のたびに「なぜそうなる？」という不信感が蓄積する",
        ],
        growthOpportunity:
          "平常時の信頼をベースに、ストレス時の違いを「補い合い」に変える学び",
      };

    case "language_gap":
      return {
        strengths: [
          "同じ恐れを持ち、ストレス下で同じ動きをするので危機時の信頼は厚い",
          "行動パターンが一致するため、一緒にいて居心地が良い",
          "核心的な価値観と危機対応が共通している",
        ],
        risks: [
          "「なぜそう思うか」の説明が互いに通じない",
          "確信の取り方が違うので、決断プロセスで衝突する",
          "感じていることは同じなのに、伝え方が違うために誤解が生まれる",
        ],
        growthOpportunity:
          "同じ核を持つからこそ、異なる認知スタイルを安全に学べる",
      };

    case "shadow":
      return {
        strengths: [
          "同じ核の恐れを知っているから、相手の苦しみが本能的にわかる",
          "自分にない対処法を持っている相手から学べる可能性",
          "深い共感と同時に、新しい視点を得られる関係",
        ],
        risks: [
          "同じ恐れに対して全く違う対処をするため、互いを否定しやすい",
          "「なぜそのやり方を選ぶ？」という根本的な疑問が消えない",
          "相手の中に自分の影（シャドウ）を見て、無意識に攻撃しやすい",
        ],
        growthOpportunity:
          "自分の影と向き合い、抑圧された対処法を統合する最大の機会",
      };

    case "complement":
      return {
        strengths: [
          "同じ方法論を使うから協働がスムーズ",
          "異なる目的のために同じ手段を使うので、幅広い状況に対応できる",
          "「やり方」の衝突がないため、純粋に「目的」について対話できる",
        ],
        risks: [
          "目的の違いが根本的すぎて、長期的な方向性で分裂する可能性",
          "手段の一致に安心しすぎて、本質的な価値観の違いに気づかない",
          "一方が自分の目的のために関係を利用するリスク",
        ],
        growthOpportunity:
          "同じ手段を通じて、異なる価値体系を深く理解できる",
      };

    case "teacher":
      return {
        strengths: [
          "同じ言語（納得の仕方）で対話できるから、教え合いが可能",
          "異なる核と行動パターンが、新しい視座を与えてくれる",
          "互いの深みを言語化して共有できる稀有な関係",
        ],
        risks: [
          "教える側・教わる側の固定化で対等性が失われる",
          "「わかってもらえるはず」という期待が高すぎて、失望も大きい",
          "言語は通じるのに根本的な目的が違うという、微妙なすれ違い",
        ],
        growthOpportunity:
          "共通の言語を使って、自分にはない深さや方向性を探索できる",
      };

    case "comrade":
      return {
        strengths: [
          "危機時に同じ動きをするので、戦友としての信頼が極めて強い",
          "ストレス下でのリズムが合うため、一緒にいて安心感がある",
          "言語化できない次元での一体感",
        ],
        risks: [
          "平常時の目的も認知スタイルも違うため、日常での接点が少ない",
          "危機が去ると「なぜ仲良かったんだっけ？」となりやすい",
          "深い理解ではなく、状況的な一体感に依存した関係",
        ],
        growthOpportunity:
          "危機時の絆を土台に、平常時の相互理解を広げていける",
      };

    case "alien":
      return {
        strengths: [
          "全てが異なるからこそ、最大の成長刺激を得られる",
          "自分の盲点を完全に補完する存在",
          "固定観念を根底から覆される変容の可能性",
        ],
        risks: [
          "共通言語がなく、理解に膨大なエネルギーが必要",
          "互いの行動原理が全く理解できず、摩擦が常態化しやすい",
          "誤解の連鎖が起きやすく、修復も困難",
        ],
        growthOpportunity:
          "全く異なる存在を理解しようとする過程そのものが、自己の拡張になる",
      };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compatibility Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function calculateCompatibility(
  a: ArchetypeCode,
  b: ArchetypeCode,
): CompatibilityResult {
  const pa = parseArchetypeCode(a);
  const pb = parseArchetypeCode(b);

  const l1 = getLayer1Dynamic(pa.layer1, pb.layer1);
  const l2 = getLayer2Dynamic(pa.layer2, pb.layer2);
  const l3 = getLayer3Dynamic(pa.layer3, pb.layer3);
  // Use execution axis from the actual archetype code (4th char)
  const execA = (a[3] ?? "O") as ExecutionCode;
  const execB = (b[3] ?? "O") as ExecutionCode;
  const l4Actual = getExecutionDynamic(execA, execB);

  // 各レイヤーの合計（理論最大: 30+25+60+20=135）を0-100にスケーリング
  const rawSum = l1.score + l2.score + l3.score + l4Actual.score;
  const MAX_POSSIBLE = 135; // 理論上の最大合計
  const overallScore = Math.min(
    100,
    Math.max(0, Math.round((rawSum / MAX_POSSIBLE) * 100)),
  );

  const relationshipType = getRelationshipType(a, b);
  const profile = getRelationshipProfile(relationshipType, pa, pb);

  return {
    typeA: a,
    typeB: b,
    relationshipType,
    overallScore,
    layerScores: {
      layer1: {
        match: pa.layer1 === pb.layer1,
        dynamic: l1.dynamic,
        score: l1.score,
      },
      layer2: {
        match: pa.layer2 === pb.layer2,
        dynamic: l2.dynamic,
        score: l2.score,
      },
      layer3: {
        match: pa.layer3 === pb.layer3,
        dynamic: l3.dynamic,
        score: l3.score,
      },
      execution: {
        match: execA === execB,
        dynamic: l4Actual.dynamic,
        score: l4Actual.score,
      },
    },
    strengths: profile.strengths,
    risks: profile.risks,
    growthOpportunity: profile.growthOpportunity,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shadow Type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** アーキタイプ定義に設定されたシャドウタイプを返す */
export function getShadowType(code: ArchetypeCode): ArchetypeCode {
  const def = getArchetypeByCode(code);
  if (!def) {
    throw new Error(`Unknown archetype code: ${code}`);
  }
  return def.shadowCode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Best Matches
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 全26タイプとの相性を計算し、スコア順で上位N件を返す */
export function getBestMatches(
  code: ArchetypeCode,
  count: number = 5,
): { code: ArchetypeCode; score: number; type: RelationshipType }[] {
  const results = ARCHETYPE_CODES
    .filter((c) => c !== code)
    .map((c) => {
      const compat = calculateCompatibility(code, c);
      return {
        code: c,
        score: compat.overallScore,
        type: compat.relationshipType,
      };
    })
    .sort((a, b) => b.score - a.score);

  return results.slice(0, count);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Growth Partners
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 成長を促すパートナーを返す
 * - シャドウタイプ（最大の成長機会）
 * - teacher関係（同じ言語で異なる深みを教え合える）
 * - comrade関係（危機時の信頼から日常の理解へ広げる）
 */
export function getGrowthPartners(code: ArchetypeCode): ArchetypeCode[] {
  const shadow = getShadowType(code);
  const partners = new Set<ArchetypeCode>([shadow]);

  for (const c of ARCHETYPE_CODES) {
    if (c === code) continue;
    const rel = getRelationshipType(code, c);
    if (rel === "teacher" || rel === "comrade") {
      partners.add(c);
    }
  }

  return Array.from(partners);
}
