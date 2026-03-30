// lib/stargazer/cognitiveFitQuestions.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cognitive Fit 観測 — 認知スタイルの型を少数問で深く観測する
//
// 設計思想:
// - IQテストではない。知能の順位を出さない
// - 「好き嫌い」ではなく「処理の出方」を見る
// - micro-performance (実際に処理させる) と forced-choice (選好) を混合
// - 反応時間・選び直しは補助シグナル（主スコアにしない）
// - 分散配置: Phase1質問の10問目・20問目・35問目・45問目 + 分岐2問
//
// CEO方針 (2026-03-23):
// - Q3を認知寄りに修正（対人解釈→情報不足下の仮説保留）
// - micro-performanceを1問強化（検証すべき要因を選ぶ問題）
// - スコアリングv1は簡素に（raw score + confidence + ambiguity flag）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";

// ── 型定義 ──────────────────────────────────────────

export type CognitiveAxisKey =
  | "abstract_structuring"
  | "decomposition"
  | "cognitive_updating"
  | "decision_tempo"
  | "social_modeling"
  | "exploration_closure";

export type CfQuestionType =
  | "micro_performance"   // 実際に処理させる（ルール発見、反例選択等）
  | "forced_choice"       // 最も近い/最も遠い
  | "case_judgment"       // ケース判断（情報更新、優先順位等）
  | "branch";             // 分岐深掘り

/** Phase 1 内の配置フェーズ。rv_mid/rv_late は後方互換エイリアス */
export type CfPhaseKey = "core_early" | "core_mid" | "phase1_mid" | "phase1_late" | "rv_mid" | "rv_late" | "branch";

export interface CfOptionWeight {
  axis: CognitiveAxisKey;
  weight: number; // -1.0 ~ +1.0
}

export interface CfOption {
  id: string;
  text: string;
  /** この選択肢が各認知軸に与えるスコア */
  weights: CfOptionWeight[];
  /** この選択肢を選んだ場合の読み方（内部メモ、UIには出さない） */
  interpretation: string;
}

export interface CognitiveQuestion {
  id: string;
  type: CfQuestionType;
  /** 問題文（メインテキスト） */
  prompt: string;
  /** 補足テキスト（問題の前提情報など） */
  context?: string;
  /** 選択肢 */
  options: CfOption[];
  /** 主に測定する軸 */
  primaryAxis: CognitiveAxisKey;
  /** 副次的に測定する軸 */
  secondaryAxis?: CognitiveAxisKey;
  /** 2段階選択（最も近い＋最も遠い）かどうか */
  dualSelect?: boolean;
  /** UIヘッダーに表示するガイドテキスト */
  headerHint?: string;
  /** フロー内の配置フェーズ */
  phase: CfPhaseKey;
  /** 分岐条件（branch問題の場合） */
  branchTarget?: CognitiveAxisKey;
}

export interface CfAnswer {
  questionId: string;
  selectedOptionId: string;
  /** 2段階選択の場合、最も遠い選択肢 */
  furthestOptionId?: string;
  responseTimeMs: number;
  selectionChanges: number;
}

export interface CfScore {
  axis: CognitiveAxisKey;
  rawScore: number;
  confidence: number;       // 0-1（観測数ベース）
  ambiguityFlag: boolean;   // 軸間で矛盾がある場合 true
}

// ── 反応時間の補助シグナル定義 ──

/** 反応時間による微調整（最大 ±0.15） */
export function getTempoAdjustment(
  responseTimeMs: number,
  selectionChanges: number
): { decision_tempo: number; cognitive_updating: number } {
  let tempoAdj = 0;
  let updatingAdj = 0;

  if (responseTimeMs < 10000) tempoAdj -= 0.15;       // 即断寄り（左）
  else if (responseTimeMs > 40000) tempoAdj += 0.15;   // 熟考寄り（右）

  if (selectionChanges >= 2) {
    updatingAdj += 0.1;  // 柔軟に再検討できる
    tempoAdj += 0.05;    // やや慎重寄り
  }

  return { decision_tempo: tempoAdj, cognitive_updating: updatingAdj };
}

// ── メイン質問セット (8問) ──────────────────────────

/**
 * Phase 1: core_early（core質問の10問目あたりで挿入、2問）
 * Q1: ルール発見 (micro_performance) — abstract_structuring
 * Q2: 検証優先度 (micro_performance) — decomposition ★CEO追加要望
 */

/**
 * Phase 2: core_mid（Phase1の20問目あたりで挿入、2問）
 * Q3: 情報不足下の判断 (micro_performance) — cognitive_updating ★CEO修正
 * Q4: 優先順位づけ (case_judgment) — decomposition
 */

/**
 * Phase 3: phase1_mid（Phase1の35問目あたりで挿入、2問）
 * Q5: 反例選択 (micro_performance) — abstract_structuring
 * Q6: 仕事の進め方 (forced_choice, dual) — decision_tempo
 */

/**
 * Phase 4: phase1_late（Phase1の45問目あたりで挿入、2問）
 * Q7: チーム対応 (case_judgment) — social_modeling
 * Q8: 説明の受け方 (forced_choice, dual) — abstract_structuring
 */

export const CF_QUESTIONS: CognitiveQuestion[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q1: ルール発見 — abstract_structuring (主), decomposition (副)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q01",
    type: "micro_performance",
    phase: "core_early",
    primaryAxis: "abstract_structuring",
    secondaryAxis: "decomposition",
    headerHint: "じっくり考えてOKです",
    prompt: "次の4つの組み合わせには、ある法則があります。法則に合わないものを1つ選んでください。",
    context: "A: 月曜・朝・コーヒー・駅\nB: 水曜・昼・紅茶・公園\nC: 金曜・夜・ワイン・家\nD: 日曜・昼・ジュース・映画館",
    options: [
      {
        id: "cf_q01_a",
        text: "A が合わない",
        weights: [
          { axis: "abstract_structuring", weight: 0.0 },
          { axis: "decomposition", weight: 0.1 },
        ],
        interpretation: "法則発見に至っていない",
      },
      {
        id: "cf_q01_b",
        text: "B が合わない",
        weights: [
          { axis: "abstract_structuring", weight: 0.3 },
          { axis: "decomposition", weight: 0.5 },
        ],
        interpretation: "飲み物の系列など別の法則を発見。分解力が高いが上位構造を見逃した",
      },
      {
        id: "cf_q01_c",
        text: "C が合わない",
        weights: [
          { axis: "abstract_structuring", weight: 0.0 },
          { axis: "decomposition", weight: 0.1 },
        ],
        interpretation: "法則発見に至っていない",
      },
      {
        id: "cf_q01_d",
        text: "D が合わない",
        weights: [
          { axis: "abstract_structuring", weight: 0.6 },
          { axis: "decomposition", weight: 0.3 },
        ],
        interpretation: "曜日+時間帯+プライベート度の上位法則を掴んだ。抽象構造化が高い",
      },
      {
        id: "cf_q01_e",
        text: "法則がない / わからない",
        weights: [
          { axis: "abstract_structuring", weight: -0.2 },
          { axis: "decision_tempo", weight: 0.3 },
        ],
        interpretation: "自己認知として正直。判断を保留できる慎重さ",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q2: 検証優先度 — decomposition (主), abstract_structuring (副)
  // ★ CEO要望: 真のmicro-performance強化
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q02",
    type: "micro_performance",
    phase: "core_early",
    primaryAxis: "decomposition",
    secondaryAxis: "abstract_structuring",
    headerHint: "じっくり考えてOKです",
    prompt: "新しいカフェの売上が目標を下回っています。原因を特定するために、まず最初に調べるべきことを1つ選んでください。",
    context: "条件: 立地は良い / メニュー価格は競合と同等 / 開店1ヶ月目",
    options: [
      {
        id: "cf_q02_a",
        text: "来店客数を時間帯別に集計する",
        weights: [
          { axis: "decomposition", weight: 0.6 },
          { axis: "abstract_structuring", weight: 0.3 },
        ],
        interpretation: "問題を構成要素に分解し、最も影響度の高いデータから取りに行く。分解型思考",
      },
      {
        id: "cf_q02_b",
        text: "お客さんにアンケートを取る",
        weights: [
          { axis: "decomposition", weight: 0.1 },
          { axis: "social_modeling", weight: 0.3 },
        ],
        interpretation: "定性データから入る。分解より全体理解を優先する傾向",
      },
      {
        id: "cf_q02_c",
        text: "競合店の客数と比較する",
        weights: [
          { axis: "abstract_structuring", weight: 0.4 },
          { axis: "decomposition", weight: 0.2 },
        ],
        interpretation: "相対的な位置づけで問題を掴む。構造は見ているが自店の分解が先行していない",
      },
      {
        id: "cf_q02_d",
        text: "SNSの評判と口コミを確認する",
        weights: [
          { axis: "decomposition", weight: 0.0 },
          { axis: "exploration_closure", weight: -0.3 },
        ],
        interpretation: "探索的にシグナルを拾いに行く。分解よりも広く情報を集めるタイプ",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q3: 情報不足下の判断 — cognitive_updating (主), decision_tempo (副)
  // ★ CEO修正: 対人解釈→認知寄りに変更
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q03",
    type: "micro_performance",
    phase: "core_mid",
    primaryAxis: "cognitive_updating",
    secondaryAxis: "decision_tempo",
    headerHint: "じっくり考えてOKです",
    prompt: "あなたはプロジェクトリーダーです。チームの進捗報告で、Aさんだけ報告が曖昧です。あなたの最初の対応は？",
    options: [
      {
        id: "cf_q03_a",
        text: "「曖昧だが、おそらく大丈夫だろう」と判断して次に進む",
        weights: [
          { axis: "cognitive_updating", weight: -0.4 },
          { axis: "decision_tempo", weight: -0.4 },
        ],
        interpretation: "情報不足を認識しつつ楽観的に即断。保持傾向が強い",
      },
      {
        id: "cf_q03_b",
        text: "Aさんに具体的な数値や期日を追加で確認する",
        weights: [
          { axis: "cognitive_updating", weight: 0.3 },
          { axis: "decomposition", weight: 0.4 },
        ],
        interpretation: "不足情報を分解して特定し、追加取得する。構造的アプローチ",
      },
      {
        id: "cf_q03_c",
        text: "報告が曖昧な理由自体を先に聞く",
        weights: [
          { axis: "cognitive_updating", weight: 0.5 },
          { axis: "abstract_structuring", weight: 0.3 },
        ],
        interpretation: "「なぜ曖昧なのか」というメタ情報を取りに行く。上位の構造で問題を掴もうとしている",
      },
      {
        id: "cf_q03_d",
        text: "他のメンバーからAさんの状況を間接的に確認する",
        weights: [
          { axis: "cognitive_updating", weight: 0.1 },
          { axis: "exploration_closure", weight: -0.3 },
        ],
        interpretation: "多角的に情報を集める。探索的だが判断が遅れるリスク",
      },
      {
        id: "cf_q03_e",
        text: "曖昧な部分は問題が顕在化するまで保留する",
        weights: [
          { axis: "cognitive_updating", weight: -0.2 },
          { axis: "decision_tempo", weight: 0.5 },
        ],
        interpretation: "判断を保留。熟考型だが、問題を先送りする傾向",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q4: 優先順位 — decomposition (主), exploration_closure (副)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q04",
    type: "case_judgment",
    phase: "core_mid",
    primaryAxis: "decomposition",
    secondaryAxis: "exploration_closure",
    headerHint: "じっくり考えてOKです",
    prompt: "イベント企画の担当です。開催まで2週間、以下が全て未着手。最初に手をつけるものを選んでください。",
    context: "A: 会場の予約確認（確定しないと他が全て無駄に）\nB: 登壇者への連絡（返信待ちの時間が必要）\nC: チラシのデザイン（時間がかかるが自分のペースで可能）\nD: 予算の最終確認（上司の承認が必要）",
    options: [
      {
        id: "cf_q04_a",
        text: "A: 会場の予約確認",
        weights: [
          { axis: "decomposition", weight: 0.6 },
          { axis: "exploration_closure", weight: 0.4 },
        ],
        interpretation: "依存関係を読んでボトルネック除去を優先。構造分解型",
      },
      {
        id: "cf_q04_b",
        text: "B: 登壇者への連絡",
        weights: [
          { axis: "decomposition", weight: 0.3 },
          { axis: "exploration_closure", weight: 0.2 },
        ],
        interpretation: "時間制約を見て並列化。効率型思考",
      },
      {
        id: "cf_q04_c",
        text: "C: チラシのデザイン",
        weights: [
          { axis: "decomposition", weight: -0.3 },
          { axis: "exploration_closure", weight: -0.3 },
        ],
        interpretation: "コントロール可能なものから着手。不確実なものを後回しにする傾向",
      },
      {
        id: "cf_q04_d",
        text: "D: 予算の最終確認",
        weights: [
          { axis: "decomposition", weight: 0.1 },
          { axis: "exploration_closure", weight: 0.1 },
        ],
        interpretation: "承認フローを先に動かす。組織的だが依存関係の読みがやや弱い",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q5: 反例選択 — abstract_structuring (主), cognitive_updating (副)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q05",
    type: "micro_performance",
    phase: "phase1_mid",
    primaryAxis: "abstract_structuring",
    secondaryAxis: "cognitive_updating",
    headerHint: "じっくり考えてOKです",
    prompt: "「リモートワークは生産性を上げる」という主張を最も強く覆す根拠を1つ選んでください。",
    options: [
      {
        id: "cf_q05_a",
        text: "導入企業の60%で会議時間が増えた",
        weights: [
          { axis: "abstract_structuring", weight: 0.2 },
          { axis: "cognitive_updating", weight: 0.1 },
        ],
        interpretation: "関連データだが直接の反証ではない。表面的関連で判断する傾向",
      },
      {
        id: "cf_q05_b",
        text: "リモートワーカーの90%が「生産性が上がった」と自己評価",
        weights: [
          { axis: "abstract_structuring", weight: -0.3 },
          { axis: "cognitive_updating", weight: -0.2 },
        ],
        interpretation: "主張を支持する選択肢を選んだ。反証の概念を取り違えている可能性",
      },
      {
        id: "cf_q05_c",
        text: "同一チームの納品物を比較したら有意差がなかった",
        weights: [
          { axis: "abstract_structuring", weight: 0.6 },
          { axis: "cognitive_updating", weight: 0.4 },
        ],
        interpretation: "因果と相関の区別ができている。客観的データによる反証を選べた",
      },
      {
        id: "cf_q05_d",
        text: "最も生産性が上がった人はもともと高生産だった",
        weights: [
          { axis: "abstract_structuring", weight: 0.5 },
          { axis: "cognitive_updating", weight: 0.3 },
        ],
        interpretation: "交絡変数の概念を掴んでいる。因果の見方が鋭い",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q6: 仕事の進め方 — decision_tempo (主), exploration_closure (副)
  // ★ dual select: 最も近い + 最も遠い
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q06",
    type: "forced_choice",
    phase: "phase1_mid",
    primaryAxis: "decision_tempo",
    secondaryAxis: "exploration_closure",
    dualSelect: true,
    headerHint: "直感で選んでください",
    prompt: "最も自分に近い進め方と、最も遠い進め方を1つずつ選んでください。",
    options: [
      {
        id: "cf_q06_a",
        text: "仮の結論を出してから検証する",
        weights: [
          { axis: "decision_tempo", weight: -0.5 },
          { axis: "exploration_closure", weight: 0.4 },
        ],
        interpretation: "仮説駆動型。即断＋収束",
      },
      {
        id: "cf_q06_b",
        text: "情報を広く集めてから全体を見渡す",
        weights: [
          { axis: "decision_tempo", weight: 0.5 },
          { axis: "exploration_closure", weight: -0.4 },
        ],
        interpretation: "情報収集型。熟考＋探索",
      },
      {
        id: "cf_q06_c",
        text: "直感で方向を決めて走りながら調整",
        weights: [
          { axis: "decision_tempo", weight: -0.6 },
          { axis: "exploration_closure", weight: 0.2 },
        ],
        interpretation: "直感駆動型。最も即断的",
      },
      {
        id: "cf_q06_d",
        text: "小さく試して結果を見て次の一手を決める",
        weights: [
          { axis: "decision_tempo", weight: 0.2 },
          { axis: "exploration_closure", weight: -0.2 },
        ],
        interpretation: "実験型。段階的探索",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q7: チーム対応 — social_modeling (主), cognitive_updating (副)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q07",
    type: "case_judgment",
    phase: "phase1_late",
    primaryAxis: "social_modeling",
    secondaryAxis: "cognitive_updating",
    headerHint: "直感で選んでください",
    prompt: "チームメンバーが明らかに間違った方向に進んでいます。最初のアクションに最も近いものは？",
    options: [
      {
        id: "cf_q07_a",
        text: "「それは違うと思う」と理由を添えて伝える",
        weights: [
          { axis: "social_modeling", weight: -0.3 },
          { axis: "cognitive_updating", weight: -0.2 },
        ],
        interpretation: "直接介入型。効率的だが相手のモデルを経由しない",
      },
      {
        id: "cf_q07_b",
        text: "なぜその方向に進んだのかを先に聞く",
        weights: [
          { axis: "social_modeling", weight: 0.6 },
          { axis: "cognitive_updating", weight: 0.4 },
        ],
        interpretation: "相手の思考モデルを先に構築する。意図ベース理解＋自分の判断を保留する柔軟性",
      },
      {
        id: "cf_q07_c",
        text: "自分が正しい方向の案を作って比較してもらう",
        weights: [
          { axis: "social_modeling", weight: 0.2 },
          { axis: "cognitive_updating", weight: -0.1 },
        ],
        interpretation: "行動で示す。モデリングはやや薄いが建設的",
      },
      {
        id: "cf_q07_d",
        text: "一旦やらせて、結果が出てから振り返る",
        weights: [
          { axis: "social_modeling", weight: 0.3 },
          { axis: "cognitive_updating", weight: 0.2 },
        ],
        interpretation: "観察型。相手の自律性を尊重するが介入が遅い",
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q8: 説明の受け方 — abstract_structuring (主), decomposition (副)
  // ★ dual select: 最もありがたい + 最も困る
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "cf_q08",
    type: "forced_choice",
    phase: "phase1_late",
    primaryAxis: "abstract_structuring",
    secondaryAxis: "decomposition",
    dualSelect: true,
    headerHint: "直感で選んでください",
    prompt: "新しいプロジェクトの説明を受ける時、最もありがたいものと、最も困るものを1つずつ選んでください。",
    options: [
      {
        id: "cf_q08_a",
        text: "目的が一言で要約されている",
        weights: [
          { axis: "abstract_structuring", weight: 0.6 },
          { axis: "decomposition", weight: -0.3 },
        ],
        interpretation: "抽象把握型。具体が足りなくても動ける",
      },
      {
        id: "cf_q08_b",
        text: "全体フローと現在地が示されている",
        weights: [
          { axis: "abstract_structuring", weight: 0.2 },
          { axis: "decomposition", weight: 0.6 },
        ],
        interpretation: "構造分解型。フローがないと不安",
      },
      {
        id: "cf_q08_c",
        text: "最初にやることが具体的に示されている",
        weights: [
          { axis: "abstract_structuring", weight: -0.5 },
          { axis: "decomposition", weight: 0.3 },
        ],
        interpretation: "具体実行型。背景は後でいい",
      },
      {
        id: "cf_q08_d",
        text: "背景の課題と「なぜ必要か」が説明されている",
        weights: [
          { axis: "abstract_structuring", weight: 0.4 },
          { axis: "decomposition", weight: -0.1 },
        ],
        interpretation: "文脈重視型。意味がないと動けない",
      },
    ],
  },
];

// ── 分岐問題プール（各軸1問ずつ、計6問） ──────────

export const CF_BRANCH_POOL: CognitiveQuestion[] = [
  {
    id: "cf_branch_abstract",
    type: "branch",
    phase: "branch",
    primaryAxis: "abstract_structuring",
    branchTarget: "abstract_structuring",
    headerHint: "じっくり考えてOKです",
    prompt: "次の3つに共通するものがあるとすれば？",
    context: "・SNSで匿名アカウントが増えている\n・有名ブランドが副業ラインを出し始めた\n・大学生の海外留学が短期型にシフトしている",
    options: [
      {
        id: "cf_br_abs_a",
        text: "リスクを分散させたい心理",
        weights: [{ axis: "abstract_structuring", weight: 0.3 }],
        interpretation: "部分的統合。2番目の事象とのフィットがやや弱い",
      },
      {
        id: "cf_br_abs_b",
        text: "自由への欲求の高まり",
        weights: [{ axis: "abstract_structuring", weight: 0.1 }],
        interpretation: "方向性は合っているが抽象化の精度が低い",
      },
      {
        id: "cf_br_abs_c",
        text: "コミットメントの軽量化",
        weights: [{ axis: "abstract_structuring", weight: 0.5 }],
        interpretation: "3事象を統合する最も精度の高い概念を選べた",
      },
      {
        id: "cf_br_abs_d",
        text: "これらに共通点はない",
        weights: [{ axis: "abstract_structuring", weight: -0.3 }],
        interpretation: "構造化を放棄",
      },
    ],
  },

  {
    id: "cf_branch_decomp",
    type: "branch",
    phase: "branch",
    primaryAxis: "decomposition",
    branchTarget: "decomposition",
    headerHint: "じっくり考えてOKです",
    prompt: "引っ越しの荷造りを明日までに終わらせる必要があります。最初にすることは？",
    options: [
      {
        id: "cf_br_dec_a",
        text: "荷物を種類ごとに分類して、箱の数を見積もる",
        weights: [{ axis: "decomposition", weight: 0.5 }],
        interpretation: "分類→見積もり→実行の分解思考",
      },
      {
        id: "cf_br_dec_b",
        text: "一番大きな家具から手をつける",
        weights: [{ axis: "decomposition", weight: 0.1 }],
        interpretation: "サイズ基準だが体系的ではない",
      },
      {
        id: "cf_br_dec_c",
        text: "使う順番の逆から詰めていく",
        weights: [{ axis: "decomposition", weight: 0.3 }],
        interpretation: "順序の論理はあるが全体把握が先行していない",
      },
      {
        id: "cf_br_dec_d",
        text: "とりあえず目の前のものから箱に入れ始める",
        weights: [{ axis: "decomposition", weight: -0.4 }],
        interpretation: "分解せず着手",
      },
    ],
  },

  {
    id: "cf_branch_updating",
    type: "branch",
    phase: "branch",
    primaryAxis: "cognitive_updating",
    branchTarget: "cognitive_updating",
    headerHint: "直感で選んでください",
    prompt: "長年信頼していた情報源が、明らかに間違った情報を発信しました。あなたの反応は？",
    options: [
      {
        id: "cf_br_upd_a",
        text: "たまたまだろう。信頼は変わらない",
        weights: [{ axis: "cognitive_updating", weight: -0.4 }],
        interpretation: "保持。新情報を無視",
      },
      {
        id: "cf_br_upd_b",
        text: "この1件で信頼度を下げるが、まだ参考にはする",
        weights: [{ axis: "cognitive_updating", weight: 0.2 }],
        interpretation: "更新はするが幅が小さい",
      },
      {
        id: "cf_br_upd_c",
        text: "他の情報源と比較検証して、信頼度を再設定する",
        weights: [{ axis: "cognitive_updating", weight: 0.5 }],
        interpretation: "ベイズ的更新。段階的に判断",
      },
      {
        id: "cf_br_upd_d",
        text: "もうこの情報源は使わない",
        weights: [{ axis: "cognitive_updating", weight: 0.1 }],
        interpretation: "更新だが極端。過剰反応の可能性",
      },
    ],
  },

  {
    id: "cf_branch_tempo",
    type: "branch",
    phase: "branch",
    primaryAxis: "decision_tempo",
    branchTarget: "decision_tempo",
    headerHint: "直感で選んでください",
    prompt: "レストランのメニューが30種類。あなたの注文の仕方に一番近いのは？",
    options: [
      {
        id: "cf_br_tmp_a",
        text: "最初の数個を見て直感で決める",
        weights: [{ axis: "decision_tempo", weight: -0.6 }],
        interpretation: "即断型。情報を制限して速く閉じる",
      },
      {
        id: "cf_br_tmp_b",
        text: "全部見てから2-3に絞り、その中で決める",
        weights: [{ axis: "decision_tempo", weight: 0.3 }],
        interpretation: "熟考型。網羅してから絞る",
      },
      {
        id: "cf_br_tmp_c",
        text: "店員のおすすめを聞いてから決める",
        weights: [{ axis: "decision_tempo", weight: 0.1 }],
        interpretation: "外部情報で判断を助ける。テンポは中間",
      },
      {
        id: "cf_br_tmp_d",
        text: "同行者の注文を聞いてから被らないものにする",
        weights: [{ axis: "decision_tempo", weight: -0.1 }],
        interpretation: "他者依存。テンポは状況次第",
      },
    ],
  },

  {
    id: "cf_branch_social",
    type: "branch",
    phase: "branch",
    primaryAxis: "social_modeling",
    branchTarget: "social_modeling",
    headerHint: "直感で選んでください",
    prompt: "初めて会った人の第一印象で、最も自然に注目するのは？",
    options: [
      {
        id: "cf_br_soc_a",
        text: "言葉遣いや話し方のテンポ",
        weights: [{ axis: "social_modeling", weight: -0.2 }],
        interpretation: "行動の表面観察",
      },
      {
        id: "cf_br_soc_b",
        text: "表情や目線の動き",
        weights: [{ axis: "social_modeling", weight: 0.4 }],
        interpretation: "非言語の読み取り。意図ベース寄り",
      },
      {
        id: "cf_br_soc_c",
        text: "何を話題にしたか",
        weights: [{ axis: "social_modeling", weight: 0.3 }],
        interpretation: "関心の方向から人を読む。分析的",
      },
      {
        id: "cf_br_soc_d",
        text: "自分に対してどういう態度だったか",
        weights: [{ axis: "social_modeling", weight: -0.2 }],
        interpretation: "自分起点。相手のモデル化ではなく関係性の評価",
      },
    ],
  },

  {
    id: "cf_branch_explore",
    type: "branch",
    phase: "branch",
    primaryAxis: "exploration_closure",
    branchTarget: "exploration_closure",
    headerHint: "直感で選んでください",
    prompt: "ネットで気に入った商品が見つかりました。その時の行動に一番近いのは？",
    options: [
      {
        id: "cf_br_exp_a",
        text: "すぐ買う。迷うと買い逃す",
        weights: [{ axis: "exploration_closure", weight: 0.6 }],
        interpretation: "即収束",
      },
      {
        id: "cf_br_exp_b",
        text: "他の類似商品も一通り見てから判断する",
        weights: [{ axis: "exploration_closure", weight: -0.5 }],
        interpretation: "網羅的探索",
      },
      {
        id: "cf_br_exp_c",
        text: "一晩寝かせて、まだ欲しければ買う",
        weights: [{ axis: "exploration_closure", weight: -0.2 }],
        interpretation: "時間フィルター。やや探索寄り",
      },
      {
        id: "cf_br_exp_d",
        text: "レビューを読んで、致命的な欠点がなければ買う",
        weights: [{ axis: "exploration_closure", weight: 0.2 }],
        interpretation: "条件付き収束。効率的",
      },
    ],
  },
];

// ── 分岐問題選択ロジック ──────────────────────────

/**
 * 暫定スコアの絶対値が最も小さい（＝判定が曖昧な）軸の上位2つを返す
 */
export function selectBranchTargets(
  interimScores: Partial<Record<CognitiveAxisKey, number>>
): [CognitiveAxisKey, CognitiveAxisKey] {
  const axes: CognitiveAxisKey[] = [
    "abstract_structuring",
    "decomposition",
    "cognitive_updating",
    "decision_tempo",
    "social_modeling",
    "exploration_closure",
  ];

  const sorted = axes
    .map((axis) => ({ axis, absScore: Math.abs(interimScores[axis] ?? 0) }))
    .sort((a, b) => a.absScore - b.absScore);

  return [sorted[0].axis, sorted[1].axis];
}

/**
 * 分岐対象軸に対応する問題をプールから取得
 */
export function getBranchQuestion(
  targetAxis: CognitiveAxisKey
): CognitiveQuestion | undefined {
  return CF_BRANCH_POOL.find((q) => q.branchTarget === targetAxis);
}

// ── フェーズ別質問取得 ──────────────────────────

export function getCfQuestionsByPhase(
  phase: CognitiveQuestion["phase"]
): CognitiveQuestion[] {
  return CF_QUESTIONS.filter((q) => q.phase === phase);
}

// ── 配置ポイント定義 ──────────────────────────

/** Phase 1 質問（51問）の何問目でCF質問を挿入するか */
export const CF_CORE_INSERTION_POINTS = {
  /** core_early: 10問目の後に2問 (cf_q01, cf_q02) */
  early: 10,
  /** core_mid: 20問目の後に2問 (cf_q03, cf_q04) */
  mid: 20,
  /** phase1_mid: 35問目の後に2問 (cf_q05, cf_q06) — 旧 rv_mid */
  phase1_mid: 35,
  /** phase1_late: 45問目の後に2問 (cf_q07, cf_q08) + 分岐2問 — 旧 rv_late */
  phase1_late: 45,
} as const;

/**
 * @deprecated RV質問はPhase 2（任意）に移動。CF質問はPhase 1内で完結する。
 * 後方互換のために残すが、新規コードはCF_CORE_INSERTION_POINTSを使うこと。
 */
export const CF_RV_INSERTION_POINTS = {
  mid: 30,
  late: 50,
} as const;
