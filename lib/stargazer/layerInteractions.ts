// lib/stargazer/layerInteractions.ts
// アーキタイプ4レイヤー間の相互作用モデル
//
// 各レイヤー（Cognition/Emotion/Social/Execution）は独立に判定されるが、
// 組み合わせには質的な意味がある。例えば:
//   A+V (分析×感情動的) ≠ 単に A と V の合計
//   → データと感情の両方で判断できる稀有なタイプ
//
// このモジュールは、レイヤーの組み合わせに基づいて:
// 1. confidence を調整（良い組み合わせ → 確信度を強化）
// 2. 質的インサイトを生成（この組み合わせの意味）
//
// 参考: Holland (1997) — Making Vocational Choices (personality type interactions)

import type { ArchetypeResult } from "./archetypeResolver";

// ── 型定義 ──

export interface InteractionEffect {
  /** 相互作用する2つのレイヤーコード */
  layers: [string, string];
  /** confidence への修正量 (0〜0.2) */
  modifier: number;
  /** この組み合わせのインサイト（日本語） */
  insight: string;
  /** この組み合わせの強み */
  strength: string;
  /** この組み合わせの注意点 */
  watchOut: string;
}

export interface InteractionResult {
  /** 相互作用込みの confidence */
  adjustedConfidence: number;
  /** 該当する相互作用の一覧 */
  activeInteractions: InteractionEffect[];
  /** インサイトのサマリー */
  insights: string[];
}

// ── 相互作用定義 (6C2 = 15 ペア中、意味のある10ペア) ──

const LAYER_INTERACTIONS: InteractionEffect[] = [
  // ━━ Cognition × Emotion (認知 × 感情) ━━
  {
    layers: ["A", "V"],
    modifier: 0.15,
    insight: "分析的でありながら感情が豊か — データと直感の両方で判断できる稀有なタイプ",
    strength: "論理的根拠を持ちながら共感もできる。説得力と信頼を同時に生む",
    watchOut: "分析と感情が衝突するとき、どちらを優先するかで内的葛藤が起きやすい",
  },
  {
    layers: ["A", "C"],
    modifier: 0.10,
    insight: "冷静な分析者 — 感情に流されず構造で物事を判断する",
    strength: "危機的状況でも冷静さを保てる。長期的な合理的判断に強い",
    watchOut: "感情面で他者とのつながりが希薄に見えることがある",
  },
  {
    layers: ["N", "V"],
    modifier: 0.12,
    insight: "直感×感情 — 芸術的感性と共感力が融合する",
    strength: "人の機微を瞬時に察知する。創造的な解決策を生み出す",
    watchOut: "感情に引きずられて直感が曇ることがある",
  },
  {
    layers: ["N", "C"],
    modifier: 0.08,
    insight: "静かな直感者 — 内側の閃きを冷静に吟味する",
    strength: "パターン認識力が高く、感情に左右されない洞察を持つ",
    watchOut: "閃きの正しさを他者に伝えるのに苦労することがある",
  },
  {
    layers: ["S", "V"],
    modifier: 0.10,
    insight: "五感と感情が直結 — 体験を全身で味わうタイプ",
    strength: "具体的な体験から深い感情的学びを得る。感動を人と分かち合える",
    watchOut: "感覚的刺激に圧倒されやすい",
  },
  {
    layers: ["S", "C"],
    modifier: 0.08,
    insight: "体感的だが冷静 — 地に足のついた現実主義者",
    strength: "実践的で堅実。現実を正確に把握し、着実に進める",
    watchOut: "抽象的な概念や理論に対する関心が薄くなりがち",
  },

  // ━━ Cognition × Social (認知 × 社会性) ━━
  {
    layers: ["A", "I"],
    modifier: 0.10,
    insight: "内省的分析者 — 一人で深く考え抜く力がある",
    strength: "複雑な問題を静かに解きほぐす。独自の視点を持つ",
    watchOut: "考えが煮詰まった時に外部の視点を取り入れにくい",
  },
  {
    layers: ["N", "E"],
    modifier: 0.12,
    insight: "直感的社交家 — 場の空気を読み、人を動かす",
    strength: "グループのダイナミクスを直感で把握。自然なリーダーシップ",
    watchOut: "自分の直感と周囲の期待の間で板挟みになることがある",
  },

  // ━━ Emotion × Execution (感情 × 行動) ━━
  {
    layers: ["V", "X"],
    modifier: 0.10,
    insight: "情熱の探索者 — 感情をエネルギーに変えて新しい道を切り開く",
    strength: "熱意が行動力に直結する。周囲を巻き込む推進力がある",
    watchOut: "感情の波に行動が左右されやすい",
  },
  {
    layers: ["C", "O"],
    modifier: 0.10,
    insight: "冷静な最適化者 — 効率と感情制御を両立する",
    strength: "無駄なく目標に到達する。ストレス下でも一定のパフォーマンスを発揮",
    watchOut: "効率を追求するあまり、遊びや偶発性を排除しがち",
  },

  // ━━ Social × Execution (社会性 × 行動) ━━
  {
    layers: ["E", "X"],
    modifier: 0.10,
    insight: "社交的探索者 — 人とつながりながら新しい可能性を追う",
    strength: "ネットワークを活かした情報収集。協力関係の中で革新を生む",
    watchOut: "人間関係の維持と新しい挑戦の両立に疲弊しやすい",
  },
  {
    layers: ["I", "O"],
    modifier: 0.08,
    insight: "内省的最適化者 — 一人で仕組みを磨く職人タイプ",
    strength: "独自の方法論を追求する。深い集中で質の高い成果を出す",
    watchOut: "外部のフィードバックを取り入れるタイミングを逃しやすい",
  },
];

// ── メイン関数 ──

/**
 * アーキタイプ結果にレイヤー間相互作用を適用
 *
 * @param result resolveArchetype() の結果
 * @returns 相互作用込みの結果
 */
export function applyLayerInteractions(result: ArchetypeResult): InteractionResult {
  const code = result.code; // e.g., "AVIO"
  const layers = [code[0], code[1], code[2], code[3]];

  let totalModifier = 0;
  const activeInteractions: InteractionEffect[] = [];
  const insights: string[] = [];

  for (const interaction of LAYER_INTERACTIONS) {
    const [l1, l2] = interaction.layers;
    if (layers.includes(l1) && layers.includes(l2)) {
      totalModifier += interaction.modifier;
      activeInteractions.push(interaction);
      insights.push(interaction.insight);
    }
  }

  // Confidence 調整: 相互作用が多い組み合わせほど「明確な」タイプ
  const adjustedConfidence = Math.min(1, result.confidence * (1 + totalModifier));

  return { adjustedConfidence, activeInteractions, insights };
}

/**
 * 全24アーキタイプに対する相互作用プロファイルを事前計算
 * （将来のUI表示用）
 */
export function getInteractionsForCode(code: string): InteractionEffect[] {
  const layers = [code[0], code[1], code[2], code[3]];
  return LAYER_INTERACTIONS.filter((interaction) => {
    const [l1, l2] = interaction.layers;
    return layers.includes(l1) && layers.includes(l2);
  });
}
